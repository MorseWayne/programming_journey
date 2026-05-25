---
title: 扩展系统
icon: puzzle-piece
order: 4
date: 2026-05-25
category:
  - AI
  - Pi
tag:
  - Extension
  - Skill
  - Pi Package
  - Prompt Template
---

# 扩展系统：Pi 如何被塑造成你的工作台

Pi 的核心非常克制：默认工具少、内置工作流少。真正让 Pi 变强的是扩展系统。理解扩展系统后，你会发现 Pi 不是一个固定形态的产品，而是一套可以组合的 Agent 平台。

## 1. 五类可定制资源

Pi 的可定制能力主要分成五类：

| 类型 | 解决什么问题 | 典型例子 |
|------|--------------|----------|
| Prompt Templates | 复用一段常用提示词 | `/review`、`/fix-tests`、`/write-doc` |
| Skills | 按需加载的专业能力说明 | PDF 处理、GitNexus 使用、shadcn 组件操作 |
| Extensions | TypeScript 扩展，改变运行时行为 | 权限拦截、状态栏、自定义工具、Provider |
| Themes | 终端 UI 颜色主题 | dark、light、tokyo-night |
| Pi Packages | 把上面几类打包分发 | `pi-subagents`、`@ollama/pi-web-search`、`@juicesharp/rpiv-todo` |

一句话区分：

- **Prompt Template**：只是“复用一段话”；
- **Skill**：给模型一份“按需阅读的操作手册”；
- **Extension**：写代码扩展 Pi 的运行时；
- **Theme**：改视觉；
- **Package**：把扩展、技能、模板、主题打包安装。

## 2. Prompt Templates：把常用提示变成命令

位置：

```text
~/.pi/agent/prompts/*.md       # 全局
.pi/prompts/*.md               # 项目
packages 中的 prompts/         # 包分发
```

示例：

```markdown
---
description: Review current git diff
argument-hint: "[focus]"
---
请审查当前 git diff。重点关注：
- 正确性和边界条件
- 安全问题
- 测试覆盖
- 复杂度是否过高

额外关注：$ARGUMENTS
```

保存为 `review.md` 后，可以在 Pi 中输入：

```text
/review 错误处理
```

Prompt Templates 适合稳定、轻量、无需代码逻辑的流程。

## 3. Skills：按需加载的专业手册

Skills 遵循 Agent Skills 标准。Pi 启动时只把 skill 名称和描述放入系统提示，真正需要时再读取完整 `SKILL.md`，这叫 progressive disclosure。

位置：

```text
~/.pi/agent/skills/
~/.agents/skills/
.pi/skills/
.agents/skills/
```

典型结构：

```text
my-skill/
├── SKILL.md
├── scripts/
└── references/
```

`SKILL.md` 示例：

```markdown
---
name: code-review
description: Review code changes for bugs, tests, security, and maintainability. Use when the user asks for code review.
---

# Code Review

## Steps
1. Inspect the diff directly.
2. Report only evidence-backed findings.
3. Separate blockers, optional suggestions, and non-issues.
```

也可以显式调用：

```text
/skill:code-review 审查当前 diff
```

Skills 适合“让模型遵守某套方法论”，而不是增加真正的新工具能力。

## 4. Extensions：真正改变 Pi 行为的 TypeScript 模块

Extensions 是 Pi 最强的扩展点，可以：

- 注册自定义工具：`pi.registerTool()`；
- 注册 Slash Command：`pi.registerCommand()`；
- 监听事件：`pi.on("tool_call", ...)`；
- 拦截工具调用或修改工具结果；
- 注入上下文或修改 system prompt；
- 自定义 compaction；
- 替换状态栏、编辑器、Footer、Widget；
- 注册自定义 Provider / OAuth；
- 接入 SSH、沙箱、Web、子代理等。

位置：

```text
~/.pi/agent/extensions/*.ts
~/.pi/agent/extensions/*/index.ts
.pi/extensions/*.ts
.pi/extensions/*/index.ts
```

最小示例：

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName !== "bash") return;

    const command = event.input.command as string;
    if (command.includes("rm -rf")) {
      if (!ctx.hasUI) {
        return { block: true, reason: "Dangerous command blocked" };
      }
      const ok = await ctx.ui.confirm("Dangerous command", command);
      if (!ok) return { block: true, reason: "Blocked by user" };
    }
  });
}
```

这类扩展可以实现权限门禁，但要注意：**Pi Core 并不强制内置权限弹窗，权限策略通常来自扩展或运行环境。**

## 5. Themes：终端 UI 的视觉层

位置：

```text
~/.pi/agent/themes/*.json
.pi/themes/*.json
packages 中的 themes/
```

选择主题：

```json
{
  "theme": "my-theme"
}
```

Pi 自带 `dark` 和 `light`，自定义主题包含 50+ 个颜色 token，例如 `accent`、`border`、`toolSuccessBg`、`syntaxKeyword`、`thinkingHigh` 等。

如果你经常长时间使用终端 Agent，一个高对比、不过度刺眼的主题能明显改善体验。

## 6. Pi Packages：把工作流打包迁移

Pi Package 可以通过 npm、git 或本地路径安装：

```bash
pi install npm:pi-subagents
pi install npm:@gotgenes/pi-permission-system
pi install npm:@ollama/pi-web-search
pi install npm:@narumitw/pi-retry
pi install npm:pi-extmgr
pi install npm:@narumitw/pi-statusline
pi install npm:pi-mcp-adapter
pi install npm:@juicesharp/rpiv-todo
pi install npm:@juicesharp/rpiv-ask-user-question
pi install npm:context-mode
pi install npm:pi-simplify
pi install npm:@samfp/pi-memory
pi install git:github.com/user/repo@v1
pi install ./local-pi-package
```

管理命令：

```bash
pi list
pi update --extensions
pi remove npm:package-name
pi config
```

一个 package 的 `package.json` 可以声明：

```json
{
  "name": "my-pi-package",
  "keywords": ["pi-package"],
  "pi": {
    "extensions": ["./extensions"],
    "skills": ["./skills"],
    "prompts": ["./prompts"],
    "themes": ["./themes"]
  }
}
```

如果没有 `pi` manifest，Pi 也会按约定目录自动发现：

```text
extensions/
skills/
prompts/
themes/
```

## 7. 我的常用包组合

来自个人配置迁移指南：

| 包 | 推荐原因 |
|----|----------|
| `pi-subagents` | 子代理编排：scout、planner、worker、reviewer 等 |
| `@gotgenes/pi-permission-system` | 配置路径、命令、外部目录访问策略 |
| `@ollama/pi-web-search` | Web 搜索、网页抓取 |
| `@narumitw/pi-retry` | 遇到 Provider 空错误或流卡住时自动重试 |
| `pi-extmgr` | 用 `/extensions` 管理扩展 |
| `@narumitw/pi-statusline` | 增强状态栏，显示模型、thinking、git、token、费用 |
| `pi-mcp-adapter` | MCP server 管理与按需工具接入 |
| `@juicesharp/rpiv-todo` | 任务清单工具，`/todos` 展示执行进度 |
| `@juicesharp/rpiv-ask-user-question` | 模型缺失条件时发起结构化提问 |
| `context-mode` | 上下文压缩 + 沙箱执行 + `ctx_*` 工具 |
| `pi-simplify` | 一键审查并优化近期改动可读性 |
| `@samfp/pi-memory` | 持久化偏好和纠错记忆 |

这些都不是 Pi Core 的必需功能，而是我个人工作流里的“插件层”。这正是 Pi 的设计风格：核心保持小，工作流由用户组合。

## 8. 配置加载优先级与作用域

常见位置：

| 位置 | 作用域 |
|------|--------|
| `~/.pi/agent/settings.json` | 全局 |
| `.pi/settings.json` | 项目，覆盖全局 |
| `~/.pi/agent/extensions/` | 全局扩展 |
| `.pi/extensions/` | 项目扩展 |
| `~/.pi/agent/AGENTS.md` | 全局上下文 |
| 项目/父目录 `AGENTS.md` | 项目上下文 |

项目配置会覆盖全局配置。团队可以把 `.pi/settings.json`、`.pi/prompts/`、`.pi/skills/` 放进仓库，但要谨慎对待 `.pi/extensions/`：扩展是可执行代码，等同于给项目仓库引入本地执行能力。

## 9. 什么时候选哪种扩展方式？

| 需求 | 推荐方式 |
|------|----------|
| 固化一段常用提示 | Prompt Template |
| 给模型一套操作规程 | Skill |
| 增加新工具或拦截行为 | Extension |
| 改状态栏/主题/编辑器 UI | Extension + Theme |
| 分发给多台机器或团队 | Pi Package |
| 接入自定义模型 API | `models.json` 或 Extension Provider |
| 实现 OAuth / 非标准流式协议 | Extension Provider |

## 10. 安全原则

Pi Package 和 Extension 都应该按“本地代码执行”看待。

建议：

1. 只安装可信来源；
2. 对 npm/git 包尽量 pin 版本或 ref；
3. 先看 README 和源码，尤其是是否执行 shell、读取环境变量、访问网络；
4. 敏感项目优先用容器或只读工具模式；
5. `.env`、`~/.ssh/*` 等路径用权限系统默认拒绝；
6. 项目级扩展不要随意接受外部仓库提供的配置。

## 11. 一个组合示例

```json
{
  "defaultProvider": "openai-codex",
  "defaultModel": "gpt-5.5",
  "defaultThinkingLevel": "xhigh",
  "packages": [
    "npm:pi-subagents",
    "npm:@gotgenes/pi-permission-system",
    "npm:@ollama/pi-web-search",
    "npm:@narumitw/pi-retry",
    "npm:pi-extmgr",
    "npm:@narumitw/pi-statusline",
    "npm:pi-mcp-adapter",
    "npm:@juicesharp/rpiv-todo",
    "npm:@juicesharp/rpiv-ask-user-question",
    "npm:context-mode",
    "npm:pi-simplify",
    "npm:@samfp/pi-memory"
  ]
}
```

这段配置并不代表“最佳实践唯一答案”，而是展示 Pi 的真实用法：把小核心和个人偏好的扩展组合起来。

---

> 下一篇：[源码架构](./05-source-architecture.md)
