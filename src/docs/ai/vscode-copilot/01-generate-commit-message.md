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

这篇只讲配置和使用。目标是让 VS Code Copilot 生成稳定、具体、适合中文团队的 commit message。

## 1. 打开配置文件

推荐配置到项目级 `.vscode/settings.json`，这样团队成员可以共享同一套提交信息规则。个人使用也可以写到 User Settings JSON。

打开方式：

1. 打开 VS Code Command Palette。
2. 搜索 `Preferences: Open User Settings (JSON)`。
3. 如果要放到项目里，创建或编辑 `.vscode/settings.json`。
4. 粘贴下面的配置。

## 2. 推荐配置

```json
{
  "github.copilot.chat.commitMessageGeneration.instructions": [
    {
      "text": "Generate commit messages in Simplified Chinese. Language mixing rule: use Chinese only for grammatical connectors and behavioral descriptions (如'新增'、'修复'、'将…改为…'). Keep English for ALL of the following — do NOT translate any of them to Chinese:\n1. Anything that appears as a code identifier (function, class, method, variable, package, file name)\n2. Industry-standard technical terms (RPC, gRPC, HTTP, API, JSON, CRUD, ORM, CI/CD, etc.)\n3. Architecture/infra concepts (service, node, host, cluster, handler, router, client, middleware, etc.)\n4. Project-specific domain nouns (read them from code — if the codebase calls it 'Event Host', write 'Event Host', not '事件主机')\n\nPrinciple: if a developer would say it in English during a technical discussion, keep it in English."
    },
    {
      "text": "Format:\n\n<type>: <简明主题行>\n\n<structured body>\n\nSubject line: one concise sentence summarizing the change. Max 72 chars. No period at end.\n\nBody must use structured sections with headers. Use this template:\n\n背景:\n<why — 1-2 sentences explaining the motivation, problem, or requirement>\n\n方案:\n1. <first key change>\n2. <second key change>\n3. <more if needed>\n\n影响:\n<scope of impact — what components/behaviors are affected>\n\nRules:\n- '背景' is always required.\n- '方案' uses a numbered list of concrete changes (not vague summaries).\n- '影响' is optional — include only when the change has non-obvious side effects or cross-component impact.\n- Each list item should be one specific fact, not a paragraph."
    },
    {
      "text": "Body content focus by type:\n- feat: 背景=需求动机; 方案=实现要点和设计决策\n- fix: 背景=问题现象和根因; 方案=修复措施\n- refactor: 背景=重构动机; 方案=结构变化\n- perf: 背景=性能瓶颈; 方案=优化策略\n- Other types: 背景+方案, keep brief"
    },
    {
      "text": "Types (pick exactly one): feat, fix, docs, refactor, perf, dx, workflow, types, wip, test, build, ci, chore, deps, release."
    },
    {
      "text": "Output only the raw commit message. No preamble, no explanation, no markdown fences."
    },
    {
      "text": "Strictly forbidden: vague filler phrases that carry no information. Examples of banned patterns: '确保正确性和健壮性', '增强灵活性和可扩展性', '提高代码质量', '优化用户体验'. Every sentence in the body must convey a concrete, specific fact — what was wrong, what changed, or why."
    }
  ]
}
```

## 3. 配置规则说明

这套配置会要求 Copilot 输出这种结构：

```text
<type>: <简明主题行>

背景:
<说明为什么要改>

方案:
1. <具体改动 1>
2. <具体改动 2>

影响:
<有非显而易见影响时再写>
```

核心规则：

| 规则 | 作用 |
|------|------|
| 简体中文输出 | 让团队提交历史更统一 |
| 技术名词保留英文 | 避免把 `handler`、`router`、`API` 这类词硬翻译 |
| `背景` 必填 | 说明问题、动机或需求来源 |
| `方案` 用编号列表 | 强制写具体改动，不写泛泛总结 |
| `影响` 可选 | 只在有跨模块或隐藏影响时写 |
| 禁止空话 | 避免“提高代码质量”这类无信息句子 |

## 4. 支持的 type

| 类型 | 适用场景 |
|------|----------|
| `feat` | 新功能 |
| `fix` | 修复问题 |
| `docs` | 文档修改 |
| `refactor` | 重构，不改变外部行为 |
| `perf` | 性能优化 |
| `dx` | 开发体验改进 |
| `workflow` | 开发或发布流程调整 |
| `types` | 类型定义或类型推导相关修改 |
| `wip` | 暂存中的未完成改动 |
| `test` | 测试相关 |
| `build` | 构建系统或构建脚本 |
| `ci` | CI 配置或流水线 |
| `chore` | 工具、配置或杂项维护 |
| `deps` | 依赖升级或依赖锁文件变化 |
| `release` | 版本发布相关修改 |

## 5. 使用方式

生成 commit message 前，先暂存本次要提交的文件。Copilot 会根据 staged changes 生成内容。

在 VS Code 里操作：

1. 打开 Source Control。
2. 检查 diff。
3. 暂存要提交的文件。
4. 点击 commit message 输入框旁边的 Copilot 生成按钮。
5. 检查生成结果。
6. 提交。

终端等价流程：

```bash
git add src/auth/session.ts src/auth/session.test.ts
```

然后回到 Source Control，让 Copilot 生成提交信息。

## 6. 生成效果示例

如果 staged changes 是修复 `refreshSession` 对 expired session 仍然调用 refresh API 的问题，期望生成结果类似：

```text
fix: 修复 refreshSession 对 expired session 仍调用 refresh API

背景:
expired session 会继续进入 refresh API，导致重复请求和错误路径不明确。

方案:
1. 在 refreshSession 中检查 expiresAt，过期时抛出 SessionExpiredError
2. 为 expired session 补充 refreshSession 单元测试

影响:
影响 auth session refresh 流程，调用方需要处理 SessionExpiredError。
```

如果只是文档或配置类小改动，正文可以更短：

```text
docs: 新增 VS Code Copilot commit message 配置说明

背景:
团队需要统一 Copilot 生成 commit message 的语言、结构和 type 选择。

方案:
1. 新增 github.copilot.chat.commitMessageGeneration.instructions 推荐配置
2. 补充 type 表和生成效果示例
```

## 7. AI Co-author 设置

如果团队需要标记 AI 参与，可以额外配置：

```json
{
  "git.addAICoAuthor": "chatAndAgent"
}
```

常见取值：

| 值 | 含义 |
|----|------|
| `off` | 不自动追加 AI co-author |
| `chatAndAgent` | 对 Chat 和 Agent 产生的改动追加标记 |
| `all` | 对更多 AI 生成场景追加标记 |

## 8. 常见问题

### 没有 Copilot 生成按钮怎么办？

检查 Copilot 是否登录、当前目录是否是 Git 仓库、是否已经暂存文件，以及组织策略是否禁用了相关 AI 功能。

### 生成结果还是很空怎么办？

先拆提交。一次只暂存同一类改动，生成结果会明显更具体。

### 可以直接提交生成结果吗？

不建议。至少检查 type 是否正确、正文是否具体、有没有编造不存在的影响。

## 参考资料

- [VS Code Source Control 文档](https://code.visualstudio.com/docs/sourcecontrol/overview)
- [VS Code Copilot 设置文档](https://code.visualstudio.com/docs/copilot/reference/ai-settings)
- [Conventional Commits 规范](https://www.conventionalcommits.org/en/v1.0.0/)
