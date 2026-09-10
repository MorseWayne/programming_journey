# 本技能使用的 DeepTutor 数据模型

## 数据位置

下列路径均相对于 `${DEEPTUTOR_DATA_DIR:-/srv/deeptutor/data}`：

- `user/workspace/notebook/notebooks_index.json`：Notebook 目录。
- `user/workspace/notebook/<notebook-id>.json`：笔记记录，包含 `id`、`type`、`title`、`summary`、`output`、`created_at` 和可选的 `kb_name`。
- `user/workspace/learning/mastery/mastery.sqlite3`：当前“精通之路”状态。
- `user/workspace/learning/archive/...`：历史状态；仅当当前数据库已找不到用户指定的路线时再查阅。

SQLite 数据库可能位于命令沙箱之外，并且可能存在活动的 WAL 文件。只读脚本会把主数据库以及 `-wal`、`-shm` 配套文件复制到临时目录，再打开快照进行查询。

## Mastery state 的相关字段

`mastery_paths.state_json` 保存课程路线，本工作流使用以下字段：

```text
book_id
updated_at
learner_profile
modules[]
  id
  name
  order
  knowledge_points[]
    id
    name
    type
```

module 按数值字段 `order` 排序；同一 module 内保持 `knowledge_points` 的数组顺序。最近更新的路线不一定就是正确路线，应先匹配用户指定的主题和学习目标。

首次同步采用的 Go 路线是 `unified_1786677706798_7ba146d5`，其高层顺序为：

1. 语言基础
2. 核心数据结构与抽象
3. 并发与质量保障
4. 工程化实践

同步清单负责记录上次发布所采用的路线和 record；DeepTutor 数据库仍是当前学习顺序和源正文的事实来源。

## 同步清单

`src/docs/language/go/.deeptutor-sync.json` 是纳入版本管理的同步元数据。每条记录包含：

- `notebook_id`、`record_id`：DeepTutor 中的稳定身份。
- `source_title`：便于人工复核，不约束站点最终标题。
- `target`：仓库根目录下的 Markdown 相对路径。
- `source_created_at`：源记录的 Unix 时间戳。
- `source_sha256`：Markdown 规范化之前，原始 `output` 字符串的 SHA-256。
- `synced_target_sha256`：上次成功同步后，完整目标 Markdown 文件的 SHA-256。

统一使用脚本的 `note-hash` 子命令计算源哈希，使用 `sha256sum <target>` 计算目标哈希。源哈希改变只表示源内容发生漂移，并不授权覆盖仓库中的人工编辑；当前目标哈希与 `synced_target_sha256` 不同时，必须先审阅仓库改动。
