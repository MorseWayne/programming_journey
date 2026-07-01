---
title: VS Code Copilot 专栏
icon: /assets/icons/programming.svg
index: false
dir:
  order: 5
---

# VS Code Copilot：把 AI 融入日常开发流

VS Code Copilot 不只是代码补全工具。随着 VS Code 对 Copilot Chat、Source Control、终端、编辑器上下文和 Agent 能力的整合，它更像一个贴在 IDE 里的开发协作者：可以解释代码、生成改动、辅助提交、整理上下文，也可以帮助维护个人和团队的工程规范。

本专题记录 VS Code Copilot 的实用配置与工作流，重点关注：如何把 Copilot 从“偶尔补全几行代码”，变成日常开发里稳定、可控、可复用的效率工具。

## 阅读路线

| 章节 | 核心问题 | 适合读者 |
|------|----------|----------|
| [01 用 Copilot 自动生成 Git Commit Message](./01-generate-commit-message.md) | 如何让 Copilot 根据 staged changes 生成清晰的提交信息？ | 想提升提交质量、减少重复文字工作的开发者 |

## 一句话理解

> Copilot 适合处理“根据现有上下文生成草稿”的工作，而不是替你做最终判断。

放到 commit message 场景里，这意味着：

- 你负责拆分提交边界；
- Copilot 负责根据已暂存改动生成提交信息草稿；
- 你负责确认语义、补充上下文、遵守团队规范；
- 团队可以用 VS Code 设置把提交格式固化下来。

## 后续可补充方向

- Copilot Chat 的上下文引用方式
- Workspace instructions 与团队级提示词
- Copilot Edits / Agent 模式实践
- VS Code 中 AI 生成内容的审查与合规设置

<Catalog />
