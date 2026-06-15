---
title: mattpocock/skills 安装与迁移指南
icon: /assets/icons/programming.svg
order: 4
---

# mattpocock/skills 安装与迁移指南

[`mattpocock/skills`](https://github.com/mattpocock/skills) 是 Matt Pocock 维护的一组面向 coding agent 的 skills。它的目标不是提供某个单点命令，而是把常见工程工作流沉淀成可复用的 agent 能力，例如需求拆解、方案拷问、PRD、triage、TDD、架构改进和文档化决策。

如果你已经在 `$HOME/.agents/skills` 中安装了一批 skills，也可以通过软链接把它们暴露给 Claude Code，而不是复制到 `$HOME/.claude/skills`。这样可以避免两份 skill 内容漂移。

## 推荐结论

| 场景 | 推荐方式 | 原因 |
|---|---|---|
| 第一次安装 `mattpocock/skills` | 使用 `npx skills@latest add mattpocock/skills` | 跟随仓库推荐流程，能选择安装到哪些 coding agents |
| 已经有 `$HOME/.agents/skills` | 在 `$HOME/.claude/skills` 下创建单个 skill 软链接 | 避免复制，保留单一来源 |
| 团队共享同一套 skill | 放到项目级 `.claude/skills` 或写清安装脚本 | 不依赖某个人的 home 目录 |
| 与已有 Claude Code skill 同名 | 不迁移或改名后再迁移 | 避免触发、调用和维护上的冲突 |

## 使用 Skills CLI 安装

仓库 README 推荐使用 `skills` CLI 安装：

```bash
npx skills@latest add mattpocock/skills
```

安装过程通常会让你选择：

1. 要安装哪些 skills；
2. 要安装到哪些 coding agents；
3. 是否启用仓库中的初始化 skill。

安装时应选择：

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

## 从 `$HOME/.agents/skills` 迁移到 Claude Code

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

## 删除迁移链接

如果只是删除软链接，不会删除 `$HOME/.agents/skills` 中的真实 skill：

```bash
rm "$HOME/.claude/skills/grill-with-docs"
```

删除前可以确认它确实是软链接：

```bash
test -L "$HOME/.claude/skills/grill-with-docs" && echo "is symlink"
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
