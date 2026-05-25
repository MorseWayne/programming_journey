---
title: 日常工作流
icon: terminal
order: 3
date: 2026-05-25
category:
  - AI
  - Pi
tag:
  - 工作流
  - 会话管理
  - 子代理
---

# 日常工作流：把 Pi 放进真实编码任务

前两篇回答了“Pi 是什么”和“怎么把我的环境迁移到新机器”。这一篇聚焦日常使用：进入一个项目后，如何让 Pi 帮你读代码、改代码、运行验证、做 Review，并把长期上下文管理好。

## 1. 启动：让 Pi 站在项目根目录

Pi 的工具都以当前工作目录为基准，所以建议在项目根目录启动：

```bash
cd /path/to/project
pi
```

如果只想做一次性任务：

```bash
pi -p "总结这个代码库的结构，并告诉我如何运行测试"
```

带文件输入：

```bash
pi @README.md "总结这份文档"
pi @src/app.ts @src/app.test.ts "一起审查这两个文件"
```

如果只想只读审查，不允许模型改文件：

```bash
pi --tools read,grep,find,ls -p "审查 src 目录中可能的错误处理问题"
```

## 2. 交互界面的四个区域

Pi 交互界面可以理解为：

| 区域 | 作用 |
|------|------|
| Startup header | 展示快捷键、加载的 `AGENTS.md`、Skills、Prompts、Extensions |
| Messages | 用户消息、助手回复、工具调用、工具结果、通知与错误 |
| Editor | 输入区；边框颜色通常体现 thinking level |
| Footer / Statusline | 当前目录、会话名、token、费用、上下文占用、模型等 |

如果安装了 `@narumitw/pi-statusline`，Footer 会显示更多模型、thinking、git、token、费用信息。

## 3. 编辑器常用动作

| 需求 | 操作 |
|------|------|
| 引用文件 | 输入 `@` 后模糊搜索文件 |
| 补全路径 | Tab |
| 多行输入 | Shift+Enter（Windows Terminal 可配置 Ctrl+Enter） |
| 粘贴图片 | Ctrl+V（Windows 可用 Alt+V）或拖拽图片 |
| 执行 Shell 并把输出给模型 | `!command` |
| 执行 Shell 但不加入模型上下文 | `!!command` |
| 打开外部编辑器 | Ctrl+G，使用 `$VISUAL` 或 `$EDITOR` |

示例：

```text
!npm test
```

```text
!!git status --short
```

`!` 和 `!!` 的区别很实用：测试日志想让模型分析就用 `!`；只是自己确认状态、不想污染上下文就用 `!!`。

## 4. Slash Commands：交互式控制面板

输入 `/` 会打开命令补全。常用命令：

| 命令 | 用途 |
|------|------|
| `/login` / `/logout` | 登录或清除 Provider 凭据 |
| `/model` | 切换模型 |
| `/scoped-models` | 配置 Ctrl+P 可循环的模型范围 |
| `/settings` | 修改 thinking、主题、消息队列、传输方式等 |
| `/resume` / `/new` | 恢复或新建会话 |
| `/name <name>` | 给当前会话命名 |
| `/session` | 查看会话文件、ID、token、费用等 |
| `/tree` | 在当前会话树中跳转和分支 |
| `/fork` / `/clone` | 从历史消息或当前分支创建新会话 |
| `/compact` | 手动压缩上下文 |
| `/export` / `/share` | 导出或分享会话 |
| `/reload` | 重载扩展、技能、提示模板、上下文文件 |
| `/hotkeys` | 查看快捷键 |

安装扩展后还会出现扩展命令，例如：

```text
/extensions
/permission-system show
/subagents-doctor
```

## 5. 模型与 thinking level

- `/model` 或 Ctrl+L：打开模型选择器；
- Ctrl+P / Shift+Ctrl+P：在 scoped models 中前后切换；
- Shift+Tab：切换 thinking level；
- Ctrl+T：折叠/展开 thinking block。

我的机器默认偏好是：

```json
{
  "defaultProvider": "openai-codex",
  "defaultModel": "gpt-5.5",
  "defaultThinkingLevel": "xhigh"
}
```

但这只是个人偏好。迁移到新机器后，优先用 `/model` 选择当前可用模型。

## 6. 消息队列：不中断长任务的协作方式

Pi 支持在 Agent 正在工作时继续输入消息：

| 操作 | 行为 |
|------|------|
| Enter | 当前空闲时提交；忙碌时排入 steering queue，当前工具批次后送入模型 |
| Alt+Enter | 排入 follow-up queue，等 Agent 完全停下来后再执行 |
| Escape | 中断当前任务，并把队列消息恢复到编辑器 |
| Alt+Up | 把队列中的消息取回编辑器 |

典型场景：

```text
（Agent 正在改代码）
顺便注意一下错误信息不要吞掉，要保留原始 cause。
```

如果这条消息是“立即影响当前方向”，用普通 Enter；如果是“做完之后再补充”，用 Alt+Enter。

## 7. 三个可复用工作流

### 工作流 A：探索一个陌生项目

```text
先只读地帮我理解这个代码库：入口在哪里、核心模块怎么分层、如何运行测试。不要修改文件。
```

如果安装了 `pi-subagents`：

```text
用 scout 先帮我理解这个代码库，输出关键文件、运行命令和潜在风险。
```

建议工具模式：

```bash
pi --tools read,grep,find,ls
```

这样可以避免模型在探索阶段误改文件。

### 工作流 B：修改代码并验证

```text
请修复这个 bug：用户保存失败时页面没有展示后端错误。先定位相关代码，再给出改动方案，确认后实现并运行相关测试。
```

更适合复杂任务的子代理流程：

```text
用 scout 收集上下文，再让 planner 制定计划，之后 worker 实现，最后 reviewer 审查当前 diff。
```

推荐让 Pi 返回：

- 改了哪些文件；
- 为什么这样改；
- 运行了哪些命令；
- 测试是否通过；
- 有哪些未覆盖风险。

### 工作流 C：只读 Review 当前改动

```text
请审查当前 git diff，不要修改文件。重点看：正确性、边界条件、测试覆盖和是否有过度设计。
```

如果安装了 `pi-subagents`，可以并行 Review：

```text
并行运行三个 reviewer：一个看正确性，一个看测试覆盖，一个看复杂度。都不要修改文件，只返回发现。
```

父会话再综合 reviewer 结论，决定哪些问题值得现在修。

## 8. 会话管理：长期任务不要丢上下文

Pi 会自动保存 session 到 `~/.pi/agent/sessions/`，并按工作目录组织。

常用命令：

```bash
pi -c                  # 继续最近会话
pi -r                  # 浏览历史会话
pi --session <path|id> # 打开指定会话
pi --fork <path|id>    # 从指定会话 fork 出新会话
```

交互模式中：

```text
/name 重构认证模块
/session
/tree
/fork
/clone
/compact
```

### `/tree` 的使用心法

`/tree` 是 Pi 的一个强能力：会话不是线性的，而是树。

适合这些场景：

- 尝试 A 方案失败后，回到之前尝试 B；
- 从一个历史问题重新提问，但保留原始上下文；
- 给关键节点打 label，作为长期任务检查点；
- 离开一个分支时生成 branch summary，把重要发现带到另一个分支。

## 9. 项目上下文：让 Pi 记住团队规则

在项目根目录写 `AGENTS.md`：

```markdown
# Project Instructions

- 修改代码后运行 `pnpm test`。
- 不要直接修改生产迁移脚本。
- 回答保持简洁，说明验证结果。
```

Pi 启动时会加载：

- 全局：`~/.pi/agent/AGENTS.md`
- 当前目录及父目录中的 `AGENTS.md` / `CLAUDE.md`

修改后执行：

```text
/reload
```

## 10. 安全工作流建议

Pi 能读写文件、执行命令，应该把安全当作日常流程的一部分。

建议：

1. **探索阶段用只读工具**：`--tools read,grep,find,ls`。
2. **关键修改前确认计划**：让 Pi 先给方案，再实现。
3. **配合 git**：改动前后用 `git diff`、`git status` 检查。
4. **启用权限系统**：参考上一篇的 `pi-permission-system` 配置。
5. **敏感文件默认拒绝**：`.env`、`~/.ssh/*` 不要让模型读取。
6. **包管理命令 ask**：`npm install`、`pnpm add` 这类操作要人工确认。

## 11. 我的推荐日常组合

```text
陌生代码：scout/context-builder -> planner
复杂实现：planner -> worker -> reviewer
高风险决策：oracle -> worker
最终审查：parallel reviewer（正确性 / 测试 / 简洁性）
```

Pi Core 本身并不内置子代理，这是 `pi-subagents` 提供的工作流能力。Pi 的价值在于：它允许你把这套工作流作为扩展包装进去，并按项目、按机器、按团队定制。

---

> 下一篇：[扩展系统](./04-extension-system.md)
