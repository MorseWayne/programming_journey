# DeepTutor 09.12 生成与审阅记录

## 生成材料

- DeepTutor 书籍 `bk_270d42e5ae`、正文页 `pg_1f30091c19`；8 个正文块 ready、失败块 0。HTTP Markdown 导出与容器 `generated.md` 的 SHA-256 相同。
- `original.md` 原样保留自动导览、重复小节与多套服务范围；`reviewed.md` 是在 S3 前置齐备后重写的**静态学习者项目课程**，已同步正式页。`generation_request.json` 保存八节要求。
- 本地 BookEngine 使用进程内参数适配，没有修改 DeepTutor 持久配置。

## 技术与教学审阅

1. 原稿开头强调 S3 不承诺离线恢复、多设备同步，后段却加入 `deliveries` 表、离线补发、消费者故障、死信、已读时间与可靠推送验收，越过既定 S3→S5 先修。审阅稿只设计当前成员有权历史、已知数据库提交和**在线推送尝试**；B 离线、设备确认、补拉、已读、跨节点异步保证均明确留 S5，不把“数据库可查”误写成“自动离线交付”。
2. 原稿多处将完整项目描述成要在本仓库实际实现/实测服务。用户已明确本系列是静态课程，因此正式页只给学习者未来在个人隔离环境的五个递进步骤、纸上验收与实测记录模板；本轮没有搭建、运行或测试 IM 服务。
3. 09.02 当前 `v1` 合同是正文最多 6 UTF-8 字节、请求体最多 4096 B、成功 `200 accepted_in_memory`；课程提出单独的 `v2` **纸上**持久教学合同如 `200 stored_in_teaching_db`，保留 6 B，不能在原路径悄改成功语义。工程 R9 的 9 B 仍待评审/版本协调。文中步骤一到五避免与既有路线 P1/P2/P3 项目编号冲突。
4. 历史分页继续使用 06.02 的同会话唯一 `seq`，不在本章突然切到 `(created_at,message_id)` 作为唯一权威顺序。四表 `members` 只表达当前关系，昵称旧快照 NULL 保持未知；发送事务、成员退出竞态和 Commit 结果未知沿 06.07/09.05，不能由静态方案宣称持久运行保证。
5. WebSocket 在线通知被放在数据库教学事务**之后**，`Write` 成功、TCP ACK、Pong 不推成 B 展示/阅读。慢设备应用队列有上限；若缺 S5 补拉合同，不能无条件丢弃聊天正文并声称可恢复。TLS 只按每跳、证书名称和应用身份分别判断。
6. 固定 OpenIM 源码对照仅使用已检查的 `internal/rpc/msg/send.go` 中群聊与单聊 `isSend` 分支 `MsgToMQ` 后返回，及 `online_msg_to_mongo_handler.go` 消费端 `BatchInsertChat2DB` 调用。未核对 Kafka 生产者 ACK、消费失败重试、Mongo 写关注、设备推送完整链，因此不宣称这些保证，也不把教学 SQL 表说成上游实际架构。
7. 22 道练习覆盖合同版本、身份、历史/事务、在线通道、故障、源码边界与交付证据。没有运行 Go、数据库、WebSocket、TLS、IM、CI 或站点；没有真实容量或设备结果。

## 核对资料与验证范围

- [Go `net/http`](https://pkg.go.dev/net/http)、[数据库事务](https://go.dev/doc/database/execute-transactions)、[`httptest`](https://pkg.go.dev/net/http/httptest)：教学接口、数据访问与验证入口。
- [OWASP 授权](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)、[RFC 9293：TCP](https://www.rfc-editor.org/rfc/rfc9293.html)、[RFC 8446：TLS](https://www.rfc-editor.org/rfc/rfc8446.html)：资源权限与传输分层。
- [固定 OpenIM 发送源码](https://github.com/openimsdk/open-im-server/blob/f6411a8a1a31d3df36f4c2b3ad28481a94141e1f/internal/rpc/msg/send.go)与[MongoDB 消费源码](https://github.com/openimsdk/open-im-server/blob/f6411a8a1a31d3df36f4c2b3ad28481a94141e1f/internal/msgtransfer/online_msg_to_mongo_handler.go)：只对已列出调用位置作有限源码结论。
- 本章只做文档结构、链接、来源哈希、隐私词、业务状态和纸上数字校核。
