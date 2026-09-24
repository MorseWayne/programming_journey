# DeepTutor 06.07 生成与审阅记录

## 生成材料

- DeepTutor 书籍 `bk_cd5bc51331`、正文页 `pg_3ec161ac75`；8 个正文块 ready、失败块 0。HTTP Markdown 导出与容器 `generated.md` 的 SHA-256 相同。
- `original.md` 原样保留自动导览、重复小节和多套成员/消息表述；`reviewed.md` 是统一 `u-a/c-a/m-a` 四表语义后的静态课程，已同步正式页。`generation_request.json` 保存八节要求。
- 本地 BookEngine 使用进程内参数适配，没有修改 DeepTutor 持久配置。

## 技术与教学审阅

1. 原稿反复把规则说成“**提交时**必须仍为成员”，又将 Serializable 视为一定会检测成员读与退出写的冲突并中止某笔事务。仅有一个读写依赖时，成功的事务也可能按“发送→退出”的串行顺序解释，即便现实中退群提交先返回；Serializable **不自动保证真实提交先后与业务决定顺序一致**。审阅稿先明确产品要为发送/退出建立共同受控顺序，再用对同一成员行的协调读写作为纸上策略，并标出锁的其余边界留给 06.08。
2. 原稿后段建议“条件插入只在成员 active 时执行”作为读已提交竞态的常见修正。单条语句的谓词快照若没有与退群更新产生适当冲突，仍可能出现不符合字面提交时规则的交错；审阅稿不把它当无条件充分保证，要求审查所有退出路径及锁/事务语义。
3. ACID 用数据库内、被纳入同一事务的变更解释；Consistency 仍需正确表达业务不变量，Durability 受具体配置和故障模型约束。数据库提交、A 收到回应和 B 设备收到是三条不同确认边界。
4. 时间线固定 T1 先读有效成员、T2 更新并提交退出、T1 插入消息并提交；`sender_id` 外键只指向用户，不会自动与成员行冲突。丢失更新用 `count=4` 两事务各写常量 5，幻读用成员集合变化，写偏斜用两位管理员分别退出，避免把不同异常混为“并发错误”。
5. PostgreSQL 专属事实按官方资料核对：Read Uncommitted 实际按 Read Committed；后者每条普通语句新快照；PostgreSQL Repeatable Read 不出现标准意义的幻读但仍可能串行化异常；Serializable 只保证成功提交效果等效某种串行顺序，冲突可失败并需有界整笔重试。不能把此表套用到 MongoDB。
6. Go Tx 相关语句须使用同一 `*sql.Tx`，外部 WebSocket 推送不能在可重试回调里无条件执行。Commit 附近网络断开可造成结果未知，不等于一定回滚；沿稳定消息/操作身份查权威状态，不盲目换新 ID 重发。
7. MongoDB 单文档原子性与多文档事务区分；官方 `UnknownTransactionCommitResult` 表示提交可能成功，重试提交与重新执行业务逻辑不同。22 道练习从概念到时间线、异常、重试和 IM 确认边界。没有运行数据库、Go、IM 服务或站点，也没有检查 OpenIM 实现。

## 核对资料与验证范围

- [Go：执行事务](https://go.dev/doc/database/execute-transactions)：同一 Tx 的读写、Commit/Rollback 和控制流。
- [PostgreSQL：事务教程](https://www.postgresql.org/docs/current/tutorial-transactions.html)与[隔离级别](https://www.postgresql.org/docs/current/transaction-iso.html)：默认快照、Repeatable Read 特性及 Serializable 重试。
- [MongoDB：单文档原子性](https://www.mongodb.com/docs/manual/core/write-operations-atomicity/)、[Go 驱动事务](https://www.mongodb.com/docs/drivers/go/current/crud/transactions/)与[应用提交重试](https://www.mongodb.com/docs/manual/core/transactions-in-applications/)：多文档事务、回调与未知提交。
- 本章只做文档结构、链接、来源哈希、隐私词和纸上交错审阅。
