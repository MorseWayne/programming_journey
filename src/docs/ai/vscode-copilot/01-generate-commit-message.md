---
title: 用 Copilot 自动生成 Git Commit Message
icon: /assets/icons/programming.svg
order: 1
date: 2026-07-01
category:
  - AI
  - VS Code
tag:
  - Git
  - Copilot
  - Commit Message
---

# 用 Copilot 自动生成 Git Commit Message

写 commit message 很重要，但它经常被匆忙带过。尤其是在日常开发里，真正耗时间的不是写一句话，而是把这次改动的边界重新想清楚：改了什么、为什么改、有没有影响调用方、要不要补充 breaking change 或 issue 编号。

VS Code 已经把 Git Source Control 和 GitHub Copilot 集成在一起，可以让 Copilot 根据已暂存的代码改动自动生成提交信息。更合理的使用方式不是让 AI 替你决定提交内容，而是让它基于清晰的 staged changes 生成一个草稿，再由你做最后确认。

## 1. 适用场景

这个功能适合以下情况：

- 改动比较清晰，但不想手写总结；
- 一次提交涉及多个文件，需要快速概括变化；
- 团队要求使用规范化提交，例如 `feat:`、`fix:`、`docs:`；
- 想减少 `update code`、`fix bug` 这类低质量提交信息；
- 想在提交前顺手检查一次 staged changes 的语义边界。

它不适合替代 code review。Copilot 生成的是提交信息草稿，不是对代码正确性的保证。

## 2. 使用前准备

开始之前，需要确认几个条件：

1. 已安装 VS Code。
2. 本机已安装 Git。
3. VS Code 已登录可用的 GitHub Copilot 账号。
4. 当前打开的是一个 Git 仓库。
5. 工作区里存在已修改并准备提交的文件。

如果 Source Control 视图里没有 Git 信息，通常说明当前目录不是 Git 仓库，或者 VS Code 没有识别到本机 Git。

## 3. 基本使用步骤

打开项目后，可以按下面流程使用：

1. 修改代码并保存。
2. 打开 Source Control 视图。
3. 检查当前 diff，确认本次提交要包含哪些改动。
4. 暂存要提交的文件。
5. 在 commit message 输入框旁边点击 Copilot 生成按钮。
6. 等待 Copilot 根据 staged changes 生成提交信息。
7. 人工检查并修改提交信息。
8. 点击 Commit 完成提交。

关键点是第 4 步：Copilot 主要根据已暂存内容生成提交信息。如果暂存区里混入了无关改动，生成结果通常也会变得含糊。

## 4. 推荐工作流

不要把所有改动一次性全暂存。更稳定的做法是：

1. 先看 diff。
2. 只暂存属于同一个意图的改动。
3. 让 Copilot 生成 commit message。
4. 检查它是否准确描述了“做了什么”。
5. 必要时补充“为什么改”。
6. 再提交。

例如，下面这种提交信息是可读的：

```text
fix(auth): prevent expired sessions from refreshing tokens
```

而下面这种信息就太模糊：

```text
fix bug
```

如果一次提交里同时包含重构、修复、文档更新和格式化，Copilot 很难生成精准信息。先拆提交，再生成信息，效果会好很多。

## 5. 配置生成风格

如果团队使用 Conventional Commits，可以在 VS Code 设置中加入生成要求：

```json
{
  "github.copilot.chat.commitMessageGeneration.instructions": [
    {
      "text": "Generate commit messages using Conventional Commits. Keep the subject concise. Use English. Add a body only when the reason for the change is not obvious."
    }
  ]
}
```

常见格式是：

```text
<type>[optional scope]: <description>
```

常用类型包括：

| 类型 | 含义 |
|------|------|
| `feat` | 新功能 |
| `fix` | 修复问题 |
| `docs` | 文档修改 |
| `refactor` | 重构，不改变外部行为 |
| `test` | 测试相关 |
| `chore` | 构建、依赖、工具或杂项维护 |

如果团队提交信息要求中文，也可以把配置改成：

```json
{
  "github.copilot.chat.commitMessageGeneration.instructions": [
    {
      "text": "使用中文生成提交信息，采用 Conventional Commits 格式。标题保持简短，必要时再补充正文说明变更原因。"
    }
  ]
}
```

## 6. AI Co-author 标记

VS Code 还提供了一个与 AI 生成内容相关的 Git 设置：

```json
{
  "git.addAICoAuthor": "chatAndAgent"
}
```

它用于控制是否在提交信息中追加 AI co-author trailer。常见取值包括：

| 值 | 含义 |
|----|------|
| `off` | 不自动追加 AI co-author |
| `chatAndAgent` | 对 Chat 和 Agent 产生的改动追加标记 |
| `all` | 对更多 AI 生成场景追加标记 |

如果团队对 AI 参与代码生成有审计、署名或合规要求，建议明确配置这个选项，而不是依赖默认行为。

## 7. 提交前检查清单

使用 Copilot 生成 commit message 后，至少检查下面几项：

- 是否真实反映 staged changes；
- 是否只描述本次提交，没有夹带未来计划；
- 是否符合团队提交格式；
- 是否需要补充 issue 编号；
- 是否存在 breaking change，需要在正文中说明；
- 是否过度夸大了改动范围。

比较推荐的提交信息：

```text
docs(ai): add VS Code Copilot commit message guide
```

如果需要正文，可以这样写：

```text
docs(ai): add VS Code Copilot commit message guide

Explain how to generate commit messages from staged changes and how to
configure Conventional Commits instructions in VS Code.
```

## 8. 常见问题

### 为什么没有生成按钮？

常见原因有：

- 没有登录 Copilot；
- 当前目录不是 Git 仓库；
- 没有暂存任何改动；
- VS Code 版本较旧；
- 组织策略禁用了 Copilot 或相关 AI 功能。

### 为什么生成的信息不准确？

最常见原因是暂存区太乱。把提交拆小，只暂存属于同一件事的改动，生成结果通常会明显更准确。

### 可以直接使用生成结果吗？

不建议盲用。AI 很适合生成草稿，但提交历史是团队协作资产，最终还是要由开发者确认语义。

### 要用中文还是英文？

看团队约定。开源项目和跨国团队通常更适合英文；个人项目或中文团队可以使用中文。关键不是语言，而是提交信息要稳定、准确、可检索。

## 9. 小结

VS Code Copilot 的 commit message 生成功能，真正提升的是“从 diff 到提交语义”的整理效率。最佳实践是先拆清楚提交边界，再让 Copilot 根据 staged changes 生成草稿，最后由开发者检查、润色并提交。

AI 可以帮你少写重复文字，但不能替你维护提交历史的质量。把 staged changes 控制好，Copilot 生成的 commit message 才会更像一个可靠的工程总结，而不是一句泛泛的描述。

## 参考资料

- [VS Code Source Control 文档](https://code.visualstudio.com/docs/sourcecontrol/overview)
- [VS Code Copilot 设置文档](https://code.visualstudio.com/docs/copilot/reference/ai-settings)
- [Conventional Commits 规范](https://www.conventionalcommits.org/en/v1.0.0/)
