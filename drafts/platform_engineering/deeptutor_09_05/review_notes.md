# DeepTutor 09.05 生成与审阅记录

## 生成材料

- DeepTutor 书籍 `bk_3cd8d5f321`、正文页 `pg_248c5e14e3`；8 个正文块 ready、失败块 0。HTTP Markdown 导出与容器 `generated.md` 的 SHA-256 相同。
- `original.md` 原样保留自动导览、重复小节和教学 SQL/上游确认点的多种说法；`reviewed.md` 是统一业务合同及源码证据边界后的静态课程，已同步正式页。`generation_request.json` 保存八节要求。
- 本地 BookEngine 使用进程内参数适配，没有修改 DeepTutor 持久配置。

## 技术与教学审阅

1. 原稿把教学 SQL 的“事务提交后可读”与固定 OpenIM 的“发送 RPC 返回”在数处用相近的“已接受/已持久化”称呼。审阅稿先并排定义数据库提交、A 客户端收到回应、B 设备确认三个检查点，再明确教学 SQL 路径是课程方案，而固定上游发送路径调用 `MsgToMQ` 与消费路径调用 `BatchInsertChat2DB` 分属两处代码。
2. 固定源码确实已阅读：`internal/rpc/msg/send.go` 群聊分支约第 46–70 行、单聊的 `isSend` 分支约第 140–175 行调用 `MsgDatabase.MsgToMQ` 并在无错后返回含消息标识/时间的响应；`internal/msgtransfer/online_msg_to_mongo_handler.go` 约第 43–69 行另行解码并调用 `BatchInsertChat2DB`、更新成功/失败计数。因此只得出“RPC 返回不是这段 MongoDB 写入完成位置”，不推断队列生产者确认级别、消费进度、实际持久保证或设备送达。
3. 原稿有“未查到相同幂等键即可安全重试”一类过强结论；读可能失败或观察点不一致，不能由一次未查到自动确定原提交没有发生。审阅稿将提交附近断网保留为结果未知，要求按稳定消息/操作身份与权威状态核对，仍未知时按后续幂等合同处理，不盲目换新 ID。
4. 应用边界从双用例推导：handler 取得受信主体与解析请求，应用服务定义权限和结果，数据访问层负责参数、驱动、事务、扫描与资源。`ListVisible` 若承诺可见，实施层必须真正执行授权/过滤；先授权后独立查询的时间差要按业务合同处理，不以接口名冒充一致性保证。
5. 历史查询沿 06.02 的 `c-a` 纸上数据使用稳定 seq 游标、参数化值、有界 Limit、Rows/Cursor 关闭和错误检查；旧昵称快照 NULL 保留未知，不用当前名无标记回填。教学发送用例把 UTF-8 字节上限、成员资格、事务冲突、约束错误与 A/B 两侧确认点接回 09.02 的合同。
6. 迁移继续遵守 06.03 的扩展、兼容写读、可信回填、核对、有条件收紧顺序。验证按单元、隔离数据库、HTTP 合同和故障推演分层，纸上检查不能写成已运行的 Go/数据库/IM 结果。
7. 22 道练习从职责与权限进入游标、事务、迁移、源码确认边界。本章没有运行 Go、数据库、OpenIM、IM 服务或站点构建；只读核对上述两个固定源码文件。

## 核对资料与验证范围

- [Go：数据库访问](https://go.dev/doc/database/)、[查询](https://go.dev/doc/database/querying)、[事务](https://go.dev/doc/database/execute-transactions)与[SQL 注入](https://go.dev/doc/database/sql-injection)：参数、资源和事务职责。
- [PostgreSQL：修改表结构](https://www.postgresql.org/docs/current/ddl-alter.html)、[MongoDB Go：Cursor](https://www.mongodb.com/docs/drivers/go/current/crud/query/cursor/)：迁移与文档查询边界。
- [固定 OpenIM `send.go`](https://github.com/openimsdk/open-im-server/blob/f6411a8a1a31d3df36f4c2b3ad28481a94141e1f/internal/rpc/msg/send.go)、[MongoDB 消费处理](https://github.com/openimsdk/open-im-server/blob/f6411a8a1a31d3df36f4c2b3ad28481a94141e1f/internal/msgtransfer/online_msg_to_mongo_handler.go)：只对已列出的调用与返回位置作结论。
- 本章只做文档结构、链接、来源哈希、隐私词、纸上业务状态和上述固定源码核对。
