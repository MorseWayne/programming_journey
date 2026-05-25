---
title: SDK 与 RPC 自动化
icon: code
order: 6
date: 2026-05-25
category:
  - AI
  - Pi
tag:
  - SDK
  - RPC
  - 自动化
---

# SDK 与 RPC 自动化：把 Pi 嵌入自己的系统

Pi 不只是一个交互式终端工具。它还提供非交互 CLI、JSON 事件流、RPC 模式和 Node.js SDK，适合把 Coding Agent 能力接入脚本、CI、IDE、桌面端、Web 服务或其它自动化系统。

## 1. 先从非交互 CLI 开始

最简单的自动化方式是 `-p`：

```bash
pi -p "总结这个仓库，并列出可运行的检查命令"
```

读取 stdin：

```bash
cat README.md | pi -p "总结这份文档"
```

引用文件：

```bash
pi -p @src/app.ts "解释这个文件的职责"
```

只读审查：

```bash
pi --tools read,grep,find,ls -p "审查当前项目中的安全风险，不要修改文件"
```

指定模型（以当前机器可用的 `openai-codex` 模型为例）：

```bash
pi --model openai-codex/gpt-5.5 "帮我重构这段代码"
pi --model openai-codex/gpt-5.5:xhigh "分析这个复杂问题"
```

这类方式适合：

- 文档总结；
- 静态审查；
- CI 中生成分析报告；
- 本地脚本里做一次性任务。

## 2. JSON 事件流模式

如果你想消费结构化事件，而不是纯文本输出：

```bash
pi --mode json "List files" 2>/dev/null | jq -c 'select(.type == "message_end")'
```

JSON mode 会输出 Agent 事件，例如：

- `agent_start` / `agent_end`
- `turn_start` / `turn_end`
- `message_start` / `message_update` / `message_end`
- `tool_execution_start` / `tool_execution_update` / `tool_execution_end`
- `compaction_start` / `compaction_end`
- `auto_retry_start` / `auto_retry_end`

适合：

- 记录工具调用轨迹；
- 做可视化；
- 分析模型输出和 token 成本；
- 给外部管道消费结果。

## 3. RPC 模式：跨语言集成

启动：

```bash
pi --mode rpc --no-session
```

RPC 使用 stdin/stdout JSONL：

- 每行一个 JSON 对象；
- 命令发到 stdin；
- response 和 events 从 stdout 流出；
- 客户端必须只按 `\n` 分割记录，不要用会按 Unicode 分隔符切行的通用 line reader。

发送 prompt：

```json
{"id":"req-1","type":"prompt","message":"Hello"}
```

响应：

```json
{"id":"req-1","type":"response","command":"prompt","success":true}
```

之后会继续流出 `message_update`、`tool_execution_*`、`agent_end` 等事件。

### Python 最小客户端

```python
import subprocess
import json

proc = subprocess.Popen(
    ["pi", "--mode", "rpc", "--no-session"],
    stdin=subprocess.PIPE,
    stdout=subprocess.PIPE,
    text=True,
)

def send(cmd):
    proc.stdin.write(json.dumps(cmd) + "\n")
    proc.stdin.flush()

send({"type": "prompt", "message": "Hello!"})

for line in proc.stdout:
    event = json.loads(line)
    if event.get("type") == "message_update":
        delta = event.get("assistantMessageEvent", {})
        if delta.get("type") == "text_delta":
            print(delta["delta"], end="", flush=True)
    if event.get("type") == "agent_end":
        break
```

RPC 适合非 Node.js 生态：Python、Go、Rust、Java、桌面应用、IDE 插件等。

## 4. SDK：Node.js 内直接嵌入

如果你的宿主本身是 Node.js / TypeScript，优先用 SDK，不必 spawn 子进程。

安装：

```bash
npm install @earendil-works/pi-coding-agent
```

最小示例：

```typescript
import {
  AuthStorage,
  createAgentSession,
  ModelRegistry,
  SessionManager,
} from "@earendil-works/pi-coding-agent";

const authStorage = AuthStorage.create();
const modelRegistry = ModelRegistry.create(authStorage);

const { session } = await createAgentSession({
  sessionManager: SessionManager.inMemory(),
  authStorage,
  modelRegistry,
});

session.subscribe((event) => {
  if (
    event.type === "message_update" &&
    event.assistantMessageEvent.type === "text_delta"
  ) {
    process.stdout.write(event.assistantMessageEvent.delta);
  }
});

await session.prompt("What files are in the current directory?");
```

SDK 适合：

- 同进程集成；
- 类型安全；
- 自定义工具；
- 自定义 ResourceLoader；
- 自定义 session 存储；
- 更细粒度地控制模型、thinking、事件和工具。

## 5. SDK 中控制工具

只读模式：

```typescript
const { session } = await createAgentSession({
  tools: ["read", "grep", "find", "ls"],
  sessionManager: SessionManager.inMemory(),
});
```

自定义工具：

```typescript
import { Type } from "typebox";
import { createAgentSession, defineTool } from "@earendil-works/pi-coding-agent";

const statusTool = defineTool({
  name: "status",
  label: "Status",
  description: "Get system status",
  parameters: Type.Object({}),
  execute: async () => ({
    content: [{ type: "text", text: `Uptime: ${process.uptime()}s` }],
    details: {},
  }),
});

const { session } = await createAgentSession({
  tools: ["read", "bash", "status"],
  customTools: [statusTool],
});
```

## 6. ResourceLoader：控制扩展、技能和上下文

SDK 默认会用 `DefaultResourceLoader` 发现全局和项目资源。如果你要完全控制：

```typescript
import { DefaultResourceLoader, createAgentSession } from "@earendil-works/pi-coding-agent";

const loader = new DefaultResourceLoader({
  cwd: process.cwd(),
  agentDir: "/custom/agent",
  systemPromptOverride: () => "You are a concise coding assistant.",
  extensionFactories: [
    (pi) => {
      pi.on("agent_start", () => {
        console.log("agent started");
      });
    },
  ],
});

await loader.reload();

const { session } = await createAgentSession({
  resourceLoader: loader,
});
```

这适合构建“内嵌 Pi 能力但不完全继承用户本地配置”的产品。

## 7. AgentSessionRuntime：处理会话替换

`AgentSession` 管理一个会话；如果你的应用需要 `/new`、`/resume`、`/fork` 这类会话替换能力，应使用 `AgentSessionRuntime`。

源码示例在：

```text
packages/coding-agent/examples/sdk/13-session-runtime.ts
```

关键点：

- `runtime.session` 会在 `newSession()`、`switchSession()`、`fork()` 后变化；
- 事件订阅绑定在旧 session 上，替换后要重新订阅；
- extension runtime 也要重新绑定；
- 这层就是 interactive / print / rpc 模式复用的会话替换底座。

## 8. CLI、JSON、RPC、SDK 怎么选？

| 需求 | 推荐方式 |
|------|----------|
| 一次性问答/总结 | `pi -p` |
| Shell 管道中处理文本 | `cat file | pi -p` |
| 想看结构化事件但不想写协议客户端 | `--mode json` |
| 从 Python/Go/Rust/IDE 插件集成 | `--mode rpc` |
| Node.js/TypeScript 同进程集成 | SDK |
| 需要自定义工具、模型、资源加载 | SDK |
| 需要进程隔离 | RPC |

## 9. 自动化中的安全边界

把 Coding Agent 放进自动化系统时，安全边界比交互模式更重要。

建议：

1. CI 中优先只读工具：`read,grep,find,ls`；
2. 不要在非交互环境中允许危险命令；
3. 如果启用写文件工具，配合临时工作树或容器；
4. 不要把 API key 打到日志；
5. RPC 客户端要正确处理 abort、timeout 和 `agent_end`；
6. 对外暴露服务时，不要把任意用户输入直接映射到有写权限的 Pi 会话。

## 10. 一个本地自动化例子

用 Pi 生成只读审查报告：

```bash
#!/usr/bin/env bash
set -euo pipefail

REPORT="/tmp/pi-review-$(date +%s).md"

pi \
  --tools read,grep,find,ls \
  -p "请审查当前仓库，重点看错误处理、配置安全和测试缺口。输出 Markdown 报告。" \
  > "$REPORT"

echo "Report written to $REPORT"
```

如果后续要把它接入 PR Bot，可以升级为 RPC 或 SDK，消费结构化事件并把最终消息写回评论系统。

## 11. 参考示例路径

本地源码仓库中可以优先阅读：

```text
packages/coding-agent/examples/sdk/01-minimal.ts
packages/coding-agent/examples/sdk/02-custom-model.ts
packages/coding-agent/examples/sdk/03-custom-prompt.ts
packages/coding-agent/examples/sdk/04-skills.ts
packages/coding-agent/examples/sdk/05-tools.ts
packages/coding-agent/examples/sdk/06-extensions.ts
packages/coding-agent/examples/sdk/11-sessions.ts
packages/coding-agent/examples/sdk/13-session-runtime.ts
packages/coding-agent/examples/rpc-extension-ui.ts
packages/coding-agent/src/modes/rpc/rpc-client.ts
```

这些示例覆盖了从最小调用到完整运行时控制的主要路径。

---

至此，Pi 专题完成了从定位、安装、日常工作流、扩展系统、源码架构到自动化集成的第一版闭环。后续可以继续扩展：工具系统源码、SessionManager 深挖、Extension API 实战、自定义 Provider、Pi 与 OpenCode / Claude Code 的设计对比等。
