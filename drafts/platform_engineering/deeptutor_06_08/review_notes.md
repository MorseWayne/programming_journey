# 06.08 审阅记录：锁与 MVCC

DeepTutor BookEngine 八节初稿均 ready，HTTP Markdown 导出与本地渲染 SHA256 一致。原稿保存在 `original.md`；正式页以 06.07 的成员退出/发送合同为唯一业务主线，分层解释可见性、锁顺序、死锁、跨行写偏斜、长事务回收与 MongoDB 对照，附 22 道练习。

## 教学重组

- 先定义同一成员的 `v0/v1` 和 PostgreSQL Read Committed/Repeatable Read 的普通读快照，再区分“看见旧版本”与“当前是否可在受控顺序中发送”。
- 沿 06.07 的四表约定，`active=true/false` 只是 `left_at IS NULL/IS NOT NULL` 的教学简称。正式 SQL 使用 `left_at IS NULL`，**没有凭空引入 `active` 列**。
- 同一成员行上手算发送先锁与退群先更新的两种顺序。Read Committed 下，锁定读在等待并发更新完成后重检查询条件；退群已提交时不得沿用旧许可。
- 用两行 R1/R2 的等待环讲死锁，用两管理员各改不同成员行讲写偏斜，再说明短事务、有界整笔重试、共同保护对象或可串行化的适用边界。

## 技术修订

- 原稿用了 `conversation_member`、`group_member`、`membership` 与 `active/status` 等多套表/列命名，和 06.07 的 `members.left_at` 不一致；正式页统一业务身份，状态词仅用于图解。
- 原稿说退出路径若直接 `UPDATE` 同一成员行而未先 `FOR UPDATE` 就“绕过统一顺序”。这会误导：PostgreSQL 对同一行的冲突 `UPDATE` **本身会取得行锁并与已有 `FOR UPDATE` 冲突**。正式页要求所有路径更新/删除同一行并遵循业务规则，不要求每次先单独 `SELECT FOR UPDATE`。
- `FOR UPDATE` 只锁实际返回的现有行。不存在行、跨行管理员人数和删除后重建都不能仅凭它保证；需唯一约束、共同保护对象、Serializable 或重新设计。
- 普通快照读、锁定读、行锁冲突与 Serializable 的谓词依赖失败是不同机制；PostgreSQL 的谓词检测不是一把总阻塞范围插入的传统间隙锁。
- Repeatable Read 中稳定旧快照不等于可凭旧状态无条件锁住/更新；若目标行在快照后被改，PostgreSQL 可能要求事务失败重试。
- 长事务可能保留旧版本但不是表膨胀的唯一原因；MongoDB 事务的快照旧读和写冲突不得套用 PostgreSQL `FOR UPDATE` 语法、隔离名称或 VACUUM 机制。

## 静态边界与同步

- 所有事务、时刻与版本均为教学模型；没有运行 SQL、数据库、Go、并发实验或站点，也没有 OpenIM 物理实现声明。
- 已同步正式页、06.06/06.07 链接、卷目录、总目录、侧边栏、学习路线、计数与来源散列。
