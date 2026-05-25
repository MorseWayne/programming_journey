---
title: Pi Coding Agent 专栏
icon: /assets/icons/programming.svg
index: false
dir:
  order: 3
---

# Pi Coding Agent：可塑形的终端 AI 编程助手

Pi 是一个**最小内核、扩展优先**的终端 Coding Agent。它默认只给模型少量基础能力（读文件、写文件、精确编辑、执行命令），把子代理、权限系统、计划模式、Web 搜索、状态栏、主题、企业 Provider 等工作流能力交给扩展、技能、提示模板和 Pi Package 去组合。

本专题目标不是只教你“怎么安装”，而是从使用、配置、生态、源码架构到自动化集成，完整理解 Pi 这类 Coding Agent 工具为什么这样设计，以及如何把它改造成自己的工作台。

## 阅读路线

| 章节 | 核心问题 | 适合读者 |
|------|----------|----------|
| [01 Pi 是什么](./01-what-is-pi.md) | Pi 的定位、哲学和能力边界是什么？ | 第一次接触 Pi 的读者 |
| [02 安装与个人配置迁移](./02-install-and-personal-setup.md) | 如何复刻当前机器上的 Pi 使用环境？ | 想快速落地的人 |
| [03 日常工作流](./03-daily-workflow.md) | 交互模式、会话、上下文和子代理怎么用？ | 日常编码用户 |
| [04 扩展系统](./04-extension-system.md) | Skills、Prompt Templates、Extensions、Themes、Packages 如何协作？ | 想定制 Pi 的用户 |
| [05 源码架构](./05-source-architecture.md) | 从 CLI 到 Agent Loop 的源码结构是什么？ | 想读源码/二开的开发者 |
| [06 SDK 与 RPC](./06-sdk-rpc-automation.md) | 如何把 Pi 嵌入自己的应用或自动化流程？ | 工具平台开发者 |

## 一句话理解

> Pi 不试图替你规定“AI 编程应该长什么样”，它提供一个小而稳的 Agent Harness，然后让你用扩展和包把工作流拼出来。

这意味着：

- 如果你想要“类 Claude Code”的计划模式，可以装扩展或自己写扩展；
- 如果你想要子代理，可以安装 `pi-subagents`；
- 如果你想要权限弹窗，可以安装或编写 permission gate；
- 如果你想要 MCP、Web 搜索、状态栏、主题、企业模型路由，也都可以以 Pi Package 的方式接入。

## 本专题引用的资料

- 个人 Pi 配置迁移指南：已脱敏整合到“安装与个人配置迁移”一文
- Pi 本地源码 checkout：用于校对源码架构、包结构与示例路径
- 官方本地文档：`packages/coding-agent/README.md` 与 `packages/coding-agent/docs/`
- 示例代码：`packages/coding-agent/examples/`

<Catalog />
