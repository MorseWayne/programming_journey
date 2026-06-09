---
title: Claude Code 专栏
icon: /assets/icons/programming.svg
index: false
dir:
  order: 4
---

# Claude Code：官方 Agent 体系与社区生态

Claude Code 是 Anthropic 官方的终端 AI Coding Agent。它的核心价值不只是“让 Claude 能改代码”，还包括 subagents、skills、plugins、background agents、Agent SDK、MCP 和实验性的 agent teams 等一整套可组合能力。

本专题记录 Claude Code 的能力边界、配置方式、生态项目和实际工作流，重点关注：如何把 Claude Code 从单个编码助手，配置成可复用、可编排、可协作的工程工作台。

## 阅读路线

| 章节 | 核心问题 | 适合读者 |
|------|----------|----------|
| [01 VoltAgent subagents 配置与使用](./01-voltagent-subagents.md) | 社区 subagent 集合怎么安装、配置和调用？ | 想快速扩展 Claude Code agent 能力的用户 |
| [02 用全局 CLAUDE.md 让 Claude Code 输出更清晰](./02-readable-output-with-global-claude-md.md) | 如何通过全局提示词让回答结论先行、结构稳定？ | 想改善 Claude Code 日常回答可读性的用户 |
| [03 配置 Excalidraw Diagram Skill](./03-excalidraw-diagram-skill.md) | 如何安装 diagram skill，并用渲染器验证 Excalidraw 图？ | 想让 Claude Code 生成更清晰架构图的用户 |

## 一句话理解

> Claude Code 的 subagent 能力已经是官方一等能力；VoltAgent 这类社区项目则把大量专业角色、插件包和安装方式打包好了，让用户可以按需引入。
>
> 对日常可读性问题，很多时候不需要安装插件，只要把输出偏好沉淀到全局 `~/.claude/CLAUDE.md`，就能让回答更稳定地结论先行、分层清晰。
>
> 对架构图和流程图，Excalidraw Diagram Skill 的价值在于把“画图”变成可验证流程：先设计视觉结构，再生成 `.excalidraw`，最后渲染 PNG 检查文字、箭头和布局。

## 后续可补充方向

- Claude Code 官方 subagents 与 Agent SDK
- Skills、commands、plugins 与 marketplace
- Agent View、background sessions 与 worktree 隔离
- Agent Teams 与多智能体协作
- 与 Pi / OpenCode 等 Coding Agent 的能力对比

<Catalog />
