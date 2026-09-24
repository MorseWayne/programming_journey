# DeepTutor 06.02 生成与审阅记录

## 生成材料

- DeepTutor 书籍 `bk_7ceedb8b17`、正文页 `pg_dd3c7d54ae`；8 个正文块 ready、失败块 0。HTTP Markdown 导出与容器 `generated.md` 的 SHA-256 相同。
- `original.md` 原样保留自动导览、重复标题及多套不兼容的消息样本；`reviewed.md` 是统一 06.01 表结构和业务口径后的静态课程，已同步正式页。`generation_request.json` 保存八节要求。
- 本地 BookEngine 使用进程内参数适配，没有修改 DeepTutor 持久配置。

## 技术与教学审阅

1. 原稿开头使用 `conversation_members`、`created_at` 与 `u-a/u-b` 两用户，后文又改成 `members`、`seq`、增加其他成员，并将 `m-d` 既放入 `c-b` 又在 OFFSET 变式里当成新插入 `c-a` 的消息。审阅稿承接 06.01 的四张表，明确新增 `u-c/c-b`：`c-a` 的 `m-a/m-b/m-c` 序号 1/2/3，`c-b` 的 `m-d` 序号 1。所有手算、JOIN、聚合和分页只用这一套基线；新插入 `m-e(seq=4)` 作为独立变式。
2. `INSERT` 显式列名，`SELECT` 区分投影/筛选，NULL 用 `IS NULL`；`UPDATE/DELETE` 用 WHERE 限定范围并核对影响行数。草稿中混入的“消息展示文字修正”与基线不必要修改分开，正式页不让读者误以为可随意物理删历史。
3. 正式页的 JOIN 是**请求者的当前成员关系**和会话消息按会话关联，`u-a` 一条成员行对应三条消息；未限定用户时两条成员行把三条消息倍增为六条。单纯连接消息的发送者成员关系不能替代**当前请求者**的读取授权，更不能证明历史资格。
4. 排序用同会话唯一的 `seq DESC`；首页 `m-c,m-b`，新增 `m-e(seq=4)` 后 `OFFSET 2` 得 `m-b,m-a`，重复 `m-b`。下一页以首页末项序号 **2** 做 `seq < 2`，返回 `m-a`；游标不自动提供两次查询的同一快照或权限。
5. `c-a` 的 COUNT 为 3；按发送者分组 A 为 2、B 为 1；四条成员记录 `COUNT(*)=4`、`COUNT(left_at)=0`。WHERE 筛分组前行、HAVING 筛聚合后组；错误 JOIN 的六行不能当六条消息。业务上消息行数仍不等于尝试数或设备送达数。
6. 子查询、`UNION/UNION ALL`、`ROW_NUMBER()` 放第二遍：集合操作保留或去重重复用户，窗口编号不改表中 seq 也不缩成一组一行；物理执行计划和索引后置。SQL 参数绑定只作入口，Go 调用后置 06.10，应用注入防护后置 09.08。
7. 22 道练习从读写、NULL 到 JOIN 倍增、OFFSET/游标、聚合、集合/窗口及 IM 业务证据边界。没有运行 PostgreSQL、Go、IM 服务、SQL 语句或站点构建，也没有检查 OpenIM 的存储实现。

## 核对资料与验证范围

- [PostgreSQL：插入](https://www.postgresql.org/docs/current/tutorial-populate.html)、[查询](https://www.postgresql.org/docs/current/tutorial-select.html)、[更新](https://www.postgresql.org/docs/current/tutorial-update.html)、[删除](https://www.postgresql.org/docs/current/tutorial-delete.html)：基础语句与修改范围。
- [PostgreSQL：连接](https://www.postgresql.org/docs/current/tutorial-join.html)、[聚合](https://www.postgresql.org/docs/current/tutorial-agg.html)、[LIMIT/OFFSET](https://www.postgresql.org/docs/current/queries-limit.html)：匹配、行倍增、分组与分页顺序。
- 本章只做文档结构、链接、来源哈希、隐私词和纸上结果校核。
