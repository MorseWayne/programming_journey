---
title: mattpocock/skills 安装与迁移指南
icon: /assets/icons/programming.svg
order: 4
---

# mattpocock/skills 安装与迁移指南

[`mattpocock/skills`](https://github.com/mattpocock/skills) 是 Matt Pocock 维护的一组面向 coding agent 的 skills。它的目标不是提供某个单点命令，而是把常见工程工作流沉淀成可复用的 agent 能力，例如需求拆解、方案拷问、PRD、triage、TDD、架构改进和文档化决策。

最简单的安装方式是直接运行 `npx skills@latest add mattpocock/skills`，然后在交互界面里选择要安装到哪个 coding agent，例如 Claude Code、Codex 或其他已支持的 agent。

只有当你已经把 skills 安装在 `$HOME/.agents/skills`，并且想让 Claude Code 复用同一份文件时，才需要考虑软链接迁移。

## 先了解仓库里有哪些 skills

截至 2026-06-15，`mattpocock/skills` 仓库的 `skills/` 目录按用途分为 `engineering`、`productivity`、`personal`、`misc`、`in-progress` 和 `deprecated` 等分类。迁移前建议先理解每个 skill 的定位，再决定是否安装到 Claude Code。

### Engineering：工程工作流

| Skill | 用途 |
|---|---|
| `setup-matt-pocock-skills` | 初始化仓库级 agent skills 配置，写入 issue tracker、triage 标签和领域文档布局等上下文。 |
| `diagnose` | 用“复现 → 最小化 → 假设 → 插桩 → 修复 → 回归测试”的纪律化循环排查 bug 和性能回归。 |
| `grill-with-docs` | 结合 `CONTEXT.md` 和 ADR 拷问方案，澄清领域术语，并在决策形成时更新文档。 |
| `improve-codebase-architecture` | 基于领域语言和 ADR 寻找架构加深机会，提升模块深度、可测试性和 agent 可导航性。 |
| `prototype` | 在正式实现前做一次性原型，用终端程序或多套 UI 变体验证状态、业务逻辑或界面方向。 |
| `tdd` | 以 red-green-refactor 循环进行测试驱动开发，适合 test-first 的功能开发和 bug 修复。 |
| `to-issues` | 把计划、规格或 PRD 拆成可独立领取的 issue，强调 tracer-bullet 式垂直切片。 |
| `to-prd` | 将当前对话上下文整理成 PRD，并发布到项目 issue tracker。 |
| `triage` | 用状态机和 triage 角色管理 issue 创建、归类、准备和流转。 |
| `zoom-out` | 在不熟悉代码区域时拉高抽象层，给出相关模块、调用者和更大的上下文地图。 |

### Productivity：个人生产力

| Skill | 用途 |
|---|---|
| `caveman` | 进入极简回答模式，持续输出更短、更直接、无客套但保持技术准确的回应。 |
| `grill-me` | 对计划或设计持续追问，沿决策树逐个解决分支，直到双方达成清晰共识。 |
| `handoff` | 把当前对话压缩成交接文档，方便另一个 agent 或后续会话继续工作。 |
| `teach` | 在当前 workspace 中进行长期教学，维护 mission、resources、lessons 和 learning records。 |
| `write-a-skill` | 创建新的 agent skill，包含结构设计、progressive disclosure 和资源打包规范。 |

### Personal：写作与知识库

| Skill | 用途 |
|---|---|
| `edit-article` | 编辑和改进文章草稿，重排章节、增强清晰度并收紧表达。 |
| `obsidian-vault` | 在 Obsidian vault 中搜索、创建和组织笔记，使用 wikilinks 和索引笔记。 |

### Misc：工具化任务

| Skill | 用途 |
|---|---|
| `git-guardrails-claude-code` | 为 Claude Code 配置 hooks，在执行前阻止危险 git 命令，例如 push、reset --hard、clean 和 branch -D。 |
| `migrate-to-shoehorn` | 把 TypeScript 测试中的 `as` 类型断言迁移到 `@total-typescript/shoehorn`。 |
| `scaffold-exercises` | 按课程结构创建 section、problem、solution 和 explainer 等练习目录，并满足 lint 规则。 |
| `setup-pre-commit` | 在当前仓库配置 Husky、lint-staged、Prettier、类型检查和测试等 pre-commit 流程。 |

### In-progress：仍在演进的 skills

| Skill | 用途 |
|---|---|
| `review` | 从指定 commit、branch、tag 或 merge-base 起审查变更，并按 Standards 和 Spec 两条轴线并行评估。 |
| `writing-beats` | 将原始素材组织成 beat-by-beat 的文章旅程，每次只写一个 beat，再选择下一个转向。 |
| `writing-fragments` | 通过追问挖掘写作碎片，把观点、场景、句子和半成品想法追加到原始素材文档。 |
| `writing-shape` | 把 markdown 原料通过对话逐段塑造成可发布文章，逐步讨论开头、段落和表达格式。 |

### Deprecated：已弃用或不建议新装的 skills

| Skill | 用途 |
|---|---|
| `design-an-interface` | 用并行 sub-agents 为模块生成多种差异化接口设计，并比较 API 或模块形态。 |
| `qa` | 通过对话式 QA 收集 bug 或问题，并结合代码库上下文创建 GitHub issues。 |
| `request-refactor-plan` | 通过访谈生成小步提交式 refactor 计划，并作为 GitHub issue 记录。 |
| `ubiquitous-language` | 从当前对话抽取 DDD 风格统一语言，标记歧义并保存到 `UBIQUITOUS_LANGUAGE.md`。 |

新安装时，优先关注 `engineering`、`productivity`、`personal` 和 `misc` 中仍活跃的 skills；`in-progress` 可以按需试用，`deprecated` 通常只在维护旧流程时保留。

## 推荐结论

| 场景 | 推荐方式 | 原因 |
|---|---|---|
| 第一次安装 `mattpocock/skills` | 运行 `npx skills@latest add mattpocock/skills`，在交互界面选择 Claude Code | 最简单，不需要手动处理目录 |
| 已安装到其他 agent，例如 `$HOME/.agents/skills` | 可选：在 `$HOME/.claude/skills` 下创建单个 skill 软链接 | 复用同一份文件，避免复制后漂移 |
| 团队共享同一套 skill | 优先写清安装命令和 setup 选择；必要时提交项目级 `.claude/skills` | 不依赖某个人的 home 目录 |
| 与已有 Claude Code skill 同名 | 不迁移或改名后再迁移 | 避免触发、调用和维护上的冲突 |

一句话：**能用 `npx skills@latest add` 交互安装，就不要手动迁移；只有复用已有本地 skill 目录时，才用软链接。**

## 使用 Skills CLI 安装

仓库 README 推荐使用 `skills` CLI 安装：

```bash
npx skills@latest add mattpocock/skills
```

安装过程通常会让你选择：

1. 要安装哪些 skills；
2. 要安装到哪些 coding agents，例如 Claude Code、Codex 或其他支持的 agent；
3. 是否启用仓库中的初始化 skill。

如果只是想把这套 skills 装进 Claude Code，直接在交互列表中选择 Claude Code 即可。不要先安装到 `$HOME/.agents/skills`，再手动复制或迁移到 `$HOME/.claude/skills`。

安装时建议选择：

```text
/setup-matt-pocock-skills
```

安装完成后，在对应 agent 中运行：

```text
/setup-matt-pocock-skills
```

这个初始化过程是按仓库执行的，通常会询问：

- issue tracker 使用什么：GitHub、Linear，或 local files；
- triage 标签词汇；
- 后续生成文档应该保存到哪里。

仓库说明里特别提到，在使用下面这些工作流前，建议先对当前仓库跑一次 setup：

```text
to-issues
to-prd
triage
diagnose
tdd
improve-codebase-architecture
zoom-out
```

## 目录结构理解

一般情况下，你不需要手动关心目录结构：`npx skills@latest add mattpocock/skills` 会在交互安装时把选中的 skills 放到目标 coding agent 对应的位置。

理解目录结构主要用于排查问题，或处理“已经安装在一个 agent 目录里，想让另一个 agent 复用”的场景。

`mattpocock/skills` 仓库中的 skills 按分类组织，形式类似：

```text
skills/
  engineering/
    grill-with-docs/
      SKILL.md
  productivity/
    ...
  misc/
    ...
```

每个 skill 的关键入口都是：

```text
SKILL.md
```

`SKILL.md` 的 frontmatter 至少应包含：

```yaml
---
name: grill-with-docs
description: ...
---
```

Claude Code 用户级 skill 通常放在：

```text
~/.claude/skills/<skill-name>/SKILL.md
```

项目级 skill 通常放在：

```text
.claude/skills/<skill-name>/SKILL.md
```

而 Codex / agents 生态里常见的位置是：

```text
~/.agents/skills/<skill-name>/SKILL.md
```

所以迁移时，本质上是把符合结构的 skill 目录暴露到 Claude Code 能扫描到的位置。

## 可选：从 `$HOME/.agents/skills` 迁移到 Claude Code

再次强调：如果 `npx skills@latest add mattpocock/skills` 的交互界面里已经选择了 Claude Code，就不需要做本节操作。

本节只适合一种情况：你已经有一份可用的 `~/.agents/skills/<skill-name>`，并希望 Claude Code 复用同一份 skill 内容，而不是再安装或复制一份。

如果你的本机已经有：

```text
~/.agents/skills/<skill-name>/SKILL.md
```

最轻量的方式是在 Claude Code 的用户级目录创建软链接：

```bash
mkdir -p "$HOME/.claude/skills"
ln -s "$HOME/.agents/skills/grill-with-docs" \
  "$HOME/.claude/skills/grill-with-docs"
```

这样 Claude Code 看到的是：

```text
~/.claude/skills/grill-with-docs/SKILL.md
```

但真实内容仍然维护在：

```text
~/.agents/skills/grill-with-docs/SKILL.md
```

### 批量创建软链接

下面的脚本会逐个创建软链接，并跳过不存在或已存在的目标：

```bash
mkdir -p "$HOME/.claude/skills"

for skill in \
  shadcn \
  golang-project-layout \
  grill-me \
  grill-with-docs \
  edit-article \
  writing-fragments \
  writing-beats \
  zoom-out \
  find-skills \
  migrate-to-shoehorn \
  teach
do
  source_dir="$HOME/.agents/skills/$skill"
  target_dir="$HOME/.claude/skills/$skill"

  if [ ! -f "$source_dir/SKILL.md" ]; then
    echo "skip missing skill: $skill"
    continue
  fi

  if [ -e "$target_dir" ] || [ -L "$target_dir" ]; then
    echo "skip existing target: $target_dir"
    continue
  fi

  ln -s "$source_dir" "$target_dir"
  echo "linked: $target_dir -> $source_dir"
done
```

不要直接把整个 `$HOME/.agents/skills` 链接成 `$HOME/.claude/skills`。更推荐一个 skill 一个软链接，这样可以跳过冲突项，也方便删除。

## 不建议迁移的内容

如果 Claude Code 中已经有同名 skill，不建议再从 `$HOME/.agents/skills` 链接一份。

常见需要跳过的有：

```text
gitnexus-*
requirements-analysis
brainstorming
```

原因是同名 skill 会造成三个问题：

1. 不确定触发的是哪一份说明；
2. 两份内容会逐渐不一致；
3. 日后升级、排查和删除都更复杂。

如果确实想保留两个版本，建议先改名，例如把个人实验版命名为：

```text
grill-with-docs-local
```

同时修改对应 `SKILL.md` 里的 `name` 字段。

## 验证迁移是否成功

创建软链接后，先检查文件结构：

```bash
ls -l "$HOME/.claude/skills/grill-with-docs"
ls -l "$HOME/.claude/skills/grill-with-docs/SKILL.md"
```

确认软链接存在后，建议重启 Claude Code。新的会话会重新扫描可用 skills。

重启后可以尝试：

```text
/grill-with-docs
```

或者在 Claude Code 的 skills 列表中确认对应 skill 是否出现。

如果没有出现，优先检查：

- 软链接是否断链；
- `SKILL.md` 是否在 skill 目录根部；
- frontmatter 是否包含 `name` 和 `description`；
- 当前 Claude Code 会话是否需要重启；
- 是否与已有同名 skill 冲突。

## 快速删除软链接迁移

如果只是删除软链接，不会删除 `$HOME/.agents/skills` 中的真实 skill：

```bash
rm "$HOME/.claude/skills/grill-with-docs"
```

更明确的写法是：

```bash
unlink "$HOME/.claude/skills/grill-with-docs"
```

如果要删除所有指向 `$HOME/.agents/skills` 的 Claude Code 软链接，先预览：

```bash
find "$HOME/.claude/skills" \
  -maxdepth 1 \
  -type l \
  -lname "$HOME/.agents/skills/*" \
  -print
```

确认后删除：

```bash
find "$HOME/.claude/skills" \
  -maxdepth 1 \
  -type l \
  -lname "$HOME/.agents/skills/*" \
  -delete
```

不要对真实目录使用 `rm -rf`，除非你确认要删除源 skill。

## 项目级迁移建议

如果希望一个项目里的所有协作者都使用同一套 skill，不建议提交指向 `$HOME/.agents/skills` 的软链接，因为其他人的 home 目录里未必有相同路径。

更稳妥的选择是：

| 方案 | 适合场景 | 说明 |
|---|---|---|
| 提交 `.claude/skills/<skill-name>` | 团队必须共享完全一致的 skill | 最稳定，但会把 skill 内容纳入仓库 |
| 提交安装脚本 | 团队成员各自本地安装 | 仓库轻量，但需要执行 setup |
| 文档说明 `npx skills@latest add mattpocock/skills` | 只需要推荐工作流 | 最简单，适合非强制配置 |
| 项目级 symlink | 单人项目或受控环境 | 不适合开放协作仓库 |

如果采用安装脚本，可以只记录命令和推荐选择：

```bash
npx skills@latest add mattpocock/skills
```

然后在项目文档里要求运行：

```text
/setup-matt-pocock-skills
```

并把 issue tracker、triage 标签和文档目录的团队约定写清楚。

## 迁移检查清单

迁移前：

- [ ] 确认源目录存在：`$HOME/.agents/skills/<skill-name>/SKILL.md`；
- [ ] 检查是否与 `$HOME/.claude/skills` 中已有 skill 同名；
- [ ] 确认该 skill 的子文件、规则、模板和 assets 都在同一个目录内；
- [ ] 决定是用户级迁移还是项目级共享。

迁移后：

- [ ] 用 `ls -l` 检查软链接；
- [ ] 重启 Claude Code；
- [ ] 触发一次目标 skill；
- [ ] 如果是 `mattpocock/skills` 工作流，先运行 `/setup-matt-pocock-skills`；
- [ ] 把仓库级约定写入 README 或项目文档。

## 常见问题

### 软链接是不是官方保证能力？

Claude Code 的技能目录是文件系统目录。实际使用中，`~/.claude/skills/<name>` 指向其他目录通常可行，但这更像是本地文件系统层面的管理技巧。为了稳妥，迁移后应重启 Claude Code 并实际触发一次 skill。

### 为什么不建议直接复制？

复制会产生两份内容：

```text
~/.agents/skills/<skill-name>
~/.claude/skills/<skill-name>
```

以后更新一边，另一边不会自动同步。软链接可以让 `$HOME/.agents/skills` 继续作为真实来源。

### 什么时候仍然应该复制？

当你要把 skill 固定到某个团队项目中，并希望所有人拿到完全一致版本时，复制到项目级 `.claude/skills` 并提交是更可重复的做法。用户级软链接更适合个人本机工作流。
