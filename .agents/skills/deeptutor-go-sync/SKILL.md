---
name: deeptutor-go-sync
description: 从本地部署的 DeepTutor 向本仓库增量同步 Go 学习笔记，以 Notebook 内容为正文、精通之路（Mastery Path）为章节顺序。适用于新增、刷新、对账或下架 src/docs/language/go 下的 DeepTutor Go 笔记；不适用于普通 Go 文档编辑或 DeepTutor 本身的开发。
---

# DeepTutor Go 笔记同步

把 DeepTutor Notebook 中整理完成的笔记固化到本站 Go 文档，同时将运行数据、参考资料与可发布正文严格分开。所有命令都从仓库根目录执行。

## 检查数据源

优先使用技能自带的只读脚本，不要每次临时拼接 DeepTutor 数据查询命令：

```bash
bash .agents/skills/deeptutor-go-sync/scripts/inspect.sh notes Go
bash .agents/skills/deeptutor-go-sync/scripts/inspect.sh routes Go
```

只有在需要理解数据位置、选择学习路线或维护同步清单时，才读取[数据模型说明](references/data-model.md)。

脚本默认读取 `/srv/deeptutor/data`；若设置了 `DEEPTUTOR_DATA_DIR`，应优先使用该变量。数据目录或必要命令不可用时，说明具体缺失项并停止，不要修改站点文档。

不同数据源的用途必须区分：

- Notebook record 是可发布的笔记正文。
- Mastery state 只提供课程分组和学习顺序，不作为文章正文。
- `knowledge_bases/*/raw` 默认只是参考资料，除非用户明确要求，否则不发布。
- 不得导入设置、认证信息、聊天数据库、日志、记忆轨迹、生成的索引或无关 Notebook 记录。

## 增量对账

1. 检查 `git status --short`、目标目录和 `src/docs/language/go/.deeptutor-sync.json`，保留所有无关改动。
2. 列出候选笔记，再完整读取准备同步的记录：

   ```bash
   bash .agents/skills/deeptutor-go-sync/scripts/inspect.sh note <notebook-id> <record-id>
   bash .agents/skills/deeptutor-go-sync/scripts/inspect.sh note-hash <notebook-id> <record-id>
   ```

3. 确认适用的 Mastery Path。清单中记录的路线仍存在且主题匹配时优先沿用；若多条路线会产生实质不同的章节顺序，先请用户选择。
4. 用 record ID、源内容哈希和上次同步后的目标文件哈希与同步清单对账：
   - 源哈希和目标哈希都未改变：不修改。
   - 只有源哈希改变：刷新已映射页面。
   - 只有目标文件哈希改变：视为仓库内人工编辑，保留并报告，不回写同步哈希。
   - 源和目标都改变：先查看 Git 历史并做三方对账，不直接覆盖。
   - 出现新的相关 record：新增页面和映射。
   - 已记录的源 record 消失：报告异常；除非用户要求下架，否则不删除页面。
   - 新笔记看起来是旧笔记的重写版：同时阅读两者，再判断替换、合并或并存。
5. 删除或重命名页面前，搜索仓库中的入站链接。同步授权不自动包含删除或提交；仅在用户明确要求时执行。

## 转换为站点页面

保留 Notebook 的实质内容，但移除 DeepTutor 展示层包装，例如开头的 `**Note:**` 摘要、紧随其后的分隔线，以及 frontmatter 已提供标题时重复的一级标题。

页面使用以下结构：

```yaml
---
title: 清晰、简洁的标题
icon: /assets/icons/article.svg
order: 1
category:
  - Go
date: YYYY-MM-DD
---
```

沿用仓库现有的 snake_case 文件名。已经写入清单的目标文件名保持稳定，除非重命名有明确收益。默认一条 Notebook record 对应一篇页面；只有用户要求或多个 record 明确属于同一主题的连续修订时才合并。

页面 `order` 取自选定的 Mastery Path：先按 module 的 `order`，再按 `knowledge_points` 数组顺序。单篇笔记覆盖多个知识点时，放在它覆盖的最早知识点位置。只排列已经同步的页面，不为缺失知识点创建占位页。用户要求“只保留笔记内容”时，应下架旧的重叠正文，不要悄悄混入旧稿。

内容修改完成后，更新 `.deeptutor-sync.json` 中的路线、record 到文件的映射、源时间戳、原始正文哈希和同步后目标文件哈希。清单不得保存凭据、模型配置、聊天内容或机器相关的绝对路径。

## 验证结果

至少检查以下可观察结果：

```bash
rg --files --hidden src/docs/language/go
git diff --check
pnpm docs:build
git status --short
```

若依赖尚未安装，按现有锁文件执行 `pnpm install --frozen-lockfile` 后重试构建。确认被删除路径没有残留入站链接，同一目录中保留页面的 `order` 不重复。用户没有要求时不要提交。
