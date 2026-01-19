---
title: OpenCode 架构全景
icon: sitemap
order: 2
date: 2025-01-20
category:
  - AI
  - OpenCode
tag:
  - 架构设计
  - AI Agent
  - 系统设计
---

# OpenCode 架构全景：深入理解 AI Agent 系统设计

在上一篇文章中，我们了解了 AI 开发工具的进化历程。现在，让我们深入 OpenCode 的源码，看看一个现代 AI Coding Agent 是如何架构的。

本文将从宏观视角剖析 OpenCode 的整体设计，为后续深入各个子系统打下基础。

## 架构总览

OpenCode 采用了经典的**分层架构**，每一层都有明确的职责边界：

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLI / TUI 层                            │
│              用户交互、命令解析、终端界面渲染                      │
├─────────────────────────────────────────────────────────────────┤
│                         Session 层                              │
│              会话管理、消息循环、状态持久化                        │
├─────────────────────────────────────────────────────────────────┤
│                         Agent 层                                │
│              多 Agent 协调、任务分发、权限控制                     │
├──────────────────────┬──────────────────────────────────────────┤
│      Tool 层         │           Provider 层                    │
│  工具注册、执行、结果处理 │     LLM 抽象、多提供商支持                │
├──────────────────────┴──────────────────────────────────────────┤
│                         MCP 层                                  │
│              外部工具协议、能力扩展                                │
├─────────────────────────────────────────────────────────────────┤
│                       Infrastructure 层                         │
│         配置管理、日志、文件系统、项目检测                          │
└─────────────────────────────────────────────────────────────────┘
```

让我们逐层解析。

## 入口与命令系统 (CLI 层)

OpenCode 是一个终端应用，入口在 `src/index.ts`：

```typescript
// packages/opencode/src/index.ts
import yargs from "yargs"

const cli = yargs(hideBin(process.argv))
  .scriptName("opencode")
  .command(RunCommand)        // 主命令：启动交互式会话
  .command(AgentCommand)      // 管理 Agent
  .command(AuthCommand)       // 认证管理
  .command(McpCommand)        // MCP 服务器管理
  .command(ServeCommand)      // HTTP 服务模式
  .command(ExportCommand)     // 导出会话
  // ... 更多命令
```

OpenCode 使用 [yargs](https://yargs.js.org/) 构建 CLI，每个命令都是独立的模块。最核心的是 `RunCommand`，它启动交互式 TUI（终端用户界面）。

### 设计亮点：多种运行模式

OpenCode 支持多种使用方式：

| 命令 | 用途 |
|------|-----|
| `opencode` | 启动交互式 TUI |
| `opencode "做某事"` | 直接执行任务（非交互） |
| `opencode serve` | 作为 HTTP 服务运行 |
| `opencode pr` | 专门处理 PR 相关任务 |

这种设计让 OpenCode 既可以作为日常开发工具，也可以集成到 CI/CD 管道中。

## Agent 系统 (Agent 层)

Agent 是 OpenCode 的核心概念。不同于单一的"助手"，OpenCode 内置了多种专门化的 Agent。

### Agent 定义

查看 `src/agent/agent.ts`：

```typescript
// packages/opencode/src/agent/agent.ts
export namespace Agent {
  export const Info = z.object({
    name: z.string(),
    description: z.string().optional(),
    mode: z.enum(["subagent", "primary", "all"]),
    permission: PermissionNext.Ruleset,  // 权限规则
    model: z.object({                     // 可指定专用模型
      modelID: z.string(),
      providerID: z.string(),
    }).optional(),
    prompt: z.string().optional(),        // Agent 专属 prompt
    options: z.record(z.string(), z.any()),
  })
}
```

### 内置 Agent

OpenCode 默认提供这些 Agent：

```typescript
const result: Record<string, Info> = {
  build: {
    name: "build",
    mode: "primary",      // 主 Agent
    permission: PermissionNext.merge(
      defaults,
      PermissionNext.fromConfig({
        question: "allow",   // 可以向用户提问
        plan_enter: "allow", // 可以进入规划模式
      }),
      user,
    ),
  },
  plan: {
    name: "plan",
    mode: "primary",
    // plan Agent 有更严格的权限限制
    permission: PermissionNext.merge(
      defaults,
      PermissionNext.fromConfig({
        edit: {
          "*": "deny",  // 默认禁止编辑
          [".opencode/plans/*.md"]: "allow",  // 只能编辑计划文件
        },
      }),
    ),
  },
  general: {
    name: "general",
    description: "General-purpose agent for researching...",
    mode: "subagent",     // 子 Agent，由其他 Agent 调用
  },
  explore: {
    name: "explore",
    description: "Fast agent specialized for exploring codebases...",
    mode: "subagent",
    // explore 只允许读操作
    permission: PermissionNext.merge(
      defaults,
      PermissionNext.fromConfig({
        "*": "deny",
        grep: "allow",
        glob: "allow",
        read: "allow",
        bash: "allow",
        webfetch: "allow",
      }),
    ),
  },
  // ... compaction, title, summary (隐藏的辅助 Agent)
}
```

### Agent 模式说明

| 模式 | 含义 |
|------|-----|
| `primary` | 可以直接与用户交互的主 Agent |
| `subagent` | 只能被其他 Agent 调用 |
| `all` | 两者皆可 |

### 权限系统

每个 Agent 有独立的权限配置，这是 OpenCode 安全设计的核心：

```typescript
permission: PermissionNext.fromConfig({
  "*": "allow",                    // 默认允许所有
  doom_loop: "ask",                // 死循环检测需要询问用户
  external_directory: {
    "*": "ask",                    // 访问外部目录需要询问
    [Truncate.DIR]: "allow",       // 截断目录允许
  },
  read: {
    "*": "allow",
    "*.env": "ask",                // 读 .env 文件需要询问
    "*.env.*": "ask",
  },
})
```

权限值有三种：
- `allow`：直接允许
- `deny`：直接拒绝
- `ask`：询问用户

这种设计让用户对 Agent 的行为有完全的控制权。

## 工具系统 (Tool 层)

工具是 AI Agent "行动"的具体方式。OpenCode 有一套完整的工具注册与执行系统。

### 工具注册表

查看 `src/tool/registry.ts`：

```typescript
// packages/opencode/src/tool/registry.ts
export namespace ToolRegistry {
  async function all(): Promise<Tool.Info[]> {
    const custom = await state().then((x) => x.custom)
    
    return [
      InvalidTool,      // 处理无效工具调用
      QuestionTool,     // 向用户提问
      BashTool,         // 执行 Shell 命令
      ReadTool,         // 读取文件
      GlobTool,         // 文件模式匹配
      GrepTool,         // 内容搜索
      EditTool,         // 编辑文件
      WriteTool,        // 写入文件
      TaskTool,         // 创建子任务
      WebFetchTool,     // 获取网页内容
      TodoWriteTool,    // 写入 Todo
      TodoReadTool,     // 读取 Todo
      WebSearchTool,    // 网络搜索
      CodeSearchTool,   // 代码搜索
      SkillTool,        // 技能系统
      ApplyPatchTool,   // 应用补丁
      ...custom,        // 自定义工具
    ]
  }
}
```

### 工具定义接口

每个工具都遵循统一的接口：

```typescript
// packages/opencode/src/tool/tool.ts (概念示意)
interface Tool {
  id: string                      // 工具唯一标识
  description: string             // 描述，会发送给 LLM
  parameters: z.ZodSchema         // 参数 Schema
  execute: (args, ctx) => Promise<{
    title: string                 // 执行摘要
    output: string                // 输出内容
    metadata: Record<string, any> // 元数据
  }>
}
```

### 工具与模型的适配

不同的 LLM 对工具有不同的偏好，OpenCode 会根据模型动态调整：

```typescript
export async function tools(model, agent) {
  return tools.filter((t) => {
    // GPT 模型使用 apply_patch 而非 edit
    const usePatch = model.modelID.includes("gpt-")
    if (t.id === "apply_patch") return usePatch
    if (t.id === "edit" || t.id === "write") return !usePatch
    
    // GPT 模型不使用 todo 工具
    if (t.id === "todoread" || t.id === "todowrite") {
      if (model.modelID.includes("gpt-")) return false
    }
    
    return true
  })
}
```

## Provider 系统 (Provider 层)

OpenCode 支持 20+ 种 LLM 提供商，这得益于其抽象的 Provider 层。

### 支持的提供商

查看 `src/provider/provider.ts`：

```typescript
// packages/opencode/src/provider/provider.ts
const BUNDLED_PROVIDERS: Record<string, (options: any) => SDK> = {
  "@ai-sdk/amazon-bedrock": createAmazonBedrock,
  "@ai-sdk/anthropic": createAnthropic,
  "@ai-sdk/azure": createAzure,
  "@ai-sdk/google": createGoogleGenerativeAI,
  "@ai-sdk/google-vertex": createVertex,
  "@ai-sdk/openai": createOpenAI,
  "@ai-sdk/openai-compatible": createOpenAICompatible,
  "@openrouter/ai-sdk-provider": createOpenRouter,
  "@ai-sdk/xai": createXai,
  "@ai-sdk/mistral": createMistral,
  "@ai-sdk/groq": createGroq,
  "@ai-sdk/deepinfra": createDeepInfra,
  "@ai-sdk/cerebras": createCerebras,
  "@ai-sdk/cohere": createCohere,
  "@ai-sdk/gateway": createGateway,
  "@ai-sdk/togetherai": createTogetherAI,
  "@ai-sdk/perplexity": createPerplexity,
  "@ai-sdk/vercel": createVercel,
  "@gitlab/gitlab-ai-provider": createGitLab,
  "@ai-sdk/github-copilot": createGitHubCopilotOpenAICompatible,
}
```

### 基于 Vercel AI SDK

OpenCode 使用 [Vercel AI SDK](https://sdk.vercel.ai/) 作为 LLM 交互层：

```typescript
import { streamText, generateText, generateObject } from "ai"
```

AI SDK 提供了统一的接口，屏蔽了不同提供商的 API 差异。

### 自定义加载器

某些提供商需要特殊处理：

```typescript
const CUSTOM_LOADERS: Record<string, CustomLoader> = {
  async anthropic() {
    return {
      autoload: false,
      options: {
        headers: {
          // Anthropic 的特殊 beta 功能
          "anthropic-beta": "claude-code-20250219,interleaved-thinking...",
        },
      },
    }
  },
  
  "github-copilot": async () => {
    return {
      autoload: false,
      async getModel(sdk, modelID) {
        // Copilot 有特殊的 API 选择逻辑
        return shouldUseCopilotResponsesApi(modelID) 
          ? sdk.responses(modelID) 
          : sdk.chat(modelID)
      },
    }
  },
}
```

## Session 系统 (Session 层)

Session 是 OpenCode 管理对话状态的核心。

### Session 的职责

1. **消息存储**：保存用户和 AI 的所有对话
2. **上下文管理**：处理 Context Window 限制
3. **持久化**：会话可以保存和恢复
4. **流式处理**：处理 LLM 的流式响应

### Agent Loop（会话循环）

这是 AI Agent 的心脏，核心逻辑在 `src/session/prompt.ts`：

```
                    ┌──────────────────┐
                    │    用户输入       │
                    └────────┬─────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────┐
│                      Agent Loop                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │  1. 构建消息列表 (System Prompt + History)        │   │
│  └──────────────────────────────────────────────────┘   │
│                           │                              │
│                           ▼                              │
│  ┌──────────────────────────────────────────────────┐   │
│  │  2. 调用 LLM (streamText)                         │   │
│  └──────────────────────────────────────────────────┘   │
│                           │                              │
│                           ▼                              │
│  ┌──────────────────────────────────────────────────┐   │
│  │  3. 处理响应                                      │   │
│  │     - 文本内容 → 显示给用户                        │   │
│  │     - Tool Call → 执行工具                        │   │
│  └──────────────────────────────────────────────────┘   │
│                           │                              │
│             ┌─────────────┴─────────────┐               │
│             │ 有 Tool Call?              │               │
│             └─────────────┬─────────────┘               │
│                   YES     │     NO                      │
│                     │     │     │                       │
│                     ▼     │     ▼                       │
│            ┌────────────┐ │  ┌──────────┐              │
│            │ 执行工具    │ │  │ 结束循环  │              │
│            └────────────┘ │  └──────────┘              │
│                     │     │                             │
│                     ▼     │                             │
│            ┌────────────┐ │                             │
│            │ 继续循环    │◄┘                             │
│            └────────────┘                               │
└─────────────────────────────────────────────────────────┘
```

这个循环是 Agent 自主性的来源：LLM 决定调用什么工具，工具执行后将结果反馈给 LLM，LLM 再决定下一步。

## 数据流：一次完整的请求

让我们追踪一个完整的用户请求，理解各层是如何协作的：

```
用户输入: "帮我把所有 TODO 注释找出来"

1. CLI 层
   └─ TUI 接收输入，创建 Session

2. Session 层
   └─ 构建消息: System Prompt + User Message
   └─ 调用 Agent Loop

3. Agent 层 (build agent)
   └─ 检查权限: grep 操作允许
   └─ 获取可用工具列表

4. Provider 层
   └─ 选择配置的 LLM (如 Claude)
   └─ 调用 streamText API

5. LLM 响应
   └─ 决定使用 Grep 工具
   └─ 返回 Tool Call: grep({ pattern: "TODO", include: "**/*" })

6. Tool 层
   └─ 执行 GrepTool
   └─ 返回搜索结果

7. 再次循环
   └─ LLM 看到搜索结果
   └─ 生成最终回复: "找到以下 TODO 注释..."

8. Session 层
   └─ 保存对话历史
   └─ 返回结果给 TUI

9. CLI 层
   └─ 渲染输出
```

## 配置系统

OpenCode 支持多层级的配置：

### 配置文件位置

```
~/.config/opencode/config.json    # 全局配置
./opencode.json                   # 项目配置
./.opencode/config.json           # 项目配置（替代）
```

### 配置结构

```typescript
interface Config {
  provider?: Record<string, ProviderConfig>  // LLM 提供商配置
  model?: string                              // 默认模型
  agent?: Record<string, AgentConfig>         // Agent 配置
  permission?: PermissionConfig               // 全局权限
  mcp?: McpConfig                             // MCP 配置
  experimental?: {
    batch_tool?: boolean                      // 实验性功能
  }
}
```

### 自定义 Agent

用户可以通过配置创建自己的 Agent：

```json
{
  "agent": {
    "security-reviewer": {
      "description": "专注于代码安全审查的 Agent",
      "prompt": "你是一个安全专家，专注于发现代码中的安全漏洞...",
      "permission": {
        "bash": "deny",
        "edit": "deny"
      }
    }
  }
}
```

## 扩展性设计

OpenCode 的架构充分考虑了扩展性：

### 1. 自定义工具

在项目目录下创建 `tools/` 文件夹：

```typescript
// tools/my-tool.ts
export default {
  description: "我的自定义工具",
  args: {
    input: z.string()
  },
  execute: async (args, ctx) => {
    return `处理了: ${args.input}`
  }
}
```

### 2. MCP 集成

通过 MCP 协议接入外部服务：

```json
{
  "mcp": {
    "servers": {
      "database": {
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-postgres"]
      }
    }
  }
}
```

### 3. 插件系统

OpenCode 支持 npm 插件：

```json
{
  "plugins": ["@opencode/plugin-jira", "@opencode/plugin-linear"]
}
```

## 架构设计原则

从 OpenCode 的架构中，我们可以提炼出几个 AI Agent 系统的设计原则：

### 1. 分层解耦

每一层只关心自己的职责，通过清晰的接口通信。

### 2. 权限最小化

Agent 默认只有必要的权限，敏感操作需要用户确认。

### 3. 可观测性

完整的日志系统，便于调试和审计。

### 4. 渐进式扩展

从内置功能到自定义工具，再到 MCP 协议，提供不同级别的扩展方式。

### 5. 提供商无关

通过 AI SDK 抽象，不绑定特定的 LLM 提供商。

## 总结

OpenCode 的架构展示了一个成熟 AI Coding Agent 的设计思路：

| 层次 | 职责 | 关键组件 |
|------|-----|---------|
| CLI | 用户交互 | yargs, TUI |
| Session | 会话管理 | Agent Loop, 持久化 |
| Agent | 任务协调 | 多 Agent, 权限系统 |
| Tool | 能力执行 | 工具注册表, 执行器 |
| Provider | LLM 抽象 | AI SDK, 多提供商 |
| MCP | 能力扩展 | MCP 协议 |

理解了这个架构，我们就有了深入各个子系统的基础。接下来的文章将详细解析：

- **会话循环机制**：Agent Loop 的实现细节
- **工具系统**：如何定义和执行工具
- **MCP 协议**：如何扩展 Agent 的能力
- **Provider 抽象**：如何支持多种 LLM

---

> **下一篇**：[会话循环机制 - Agent 如何与 LLM 交互](./03-session-loop.md)
