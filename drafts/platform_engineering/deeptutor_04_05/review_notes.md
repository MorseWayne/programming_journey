# DeepTutor 04.05 生成与审阅记录

## 生成材料

- DeepTutor 书籍 `bk_5ee52e6d2c`、正文页 `pg_0323cff184`；8 个正文块 ready、失败块 0。HTTP Markdown 导出与容器 `generated.md` 的 SHA-256 相同。
- `original.md` 原样保留自动导览、重复小节和几套不同的端点/连接名字；`reviewed.md` 统一为虚构用户 `u-a` 到教学网关的 TCP/WS 生命线，`c-a` 始终指会话，已同步课程正式页。`generation_request.json` 保存八节要求。
- 本地 BookEngine 使用进程内参数适配，没有修改 DeepTutor 持久配置。

## 技术与教学审阅

1. 原稿前段把 `c-a` 写作客户端，后文又使用会话 `c-a`，容易与既有课程身份冲突。审阅稿统一 `u-a` 为用户/客户端主体、`c-a` 为会话、`m-a` 为消息；四元组只属于 TCP 连接，不当业务身份。
2. 三次握手用一套序号：A SYN seq100，B SYN seq500/ACK101，A ACK501；SYN 消耗序号，TCP 已建立仅说明底层字节通道，不证明 TLS、WS 101、认证或会话权限。
3. FIN 是单向写结束，已缓冲数据读完后另一端可见 EOF；半关闭后反向字节仍可发送。Go TCPConn `CloseWrite/CloseRead` 只作为 API 入口，多数框架连接由其生命周期管理，不教 handler 随意关闭共享连接。主动关闭端的 TIME_WAIT 按 RFC 9293 的 2×MSL 讲机制，不给操作系统通用秒数，也不把 TIME_WAIT 当用户在线。
4. RST/读写超时/半开分开。错误出现在服务端处理前或回应返回后会有不同业务结果；不能由一次 RST、EOF 或 Write 成功直接断言数据库没有/已经保存 `m-a`。重连后新旧连接可能短暂并存，稳定消息 ID 不依赖 TCP 序列号。
5. TCP Keepalive 可选且一次探测无回应不足以认定死亡；WS Ping/Pong 是协议控制帧，业务心跳验证更高层处理但仍不证明用户看屏幕或设备已读。三类心跳频率与网关、代理、设备耗电和误判风险对应，不给无来源的通用秒数。
6. `net.Conn` 的 Read/Write/deadline/Close 与监听器、连接管理任务按所有权解释；Go context 取消不自动取消任意底层 Conn.Read，需明确关闭、deadline 或任务协作。在线状态按设备/时间窗定义，多设备登录与消息送达另设确认点。
7. 22 道练习覆盖握手、FIN、RST、TIME_WAIT、心跳与重连的 IM 业务取舍。没有运行 Go、网络、抓包、IM 服务或站点，也没有核对 OpenIM 连接运行行为。

## 核对资料与验证范围

- [RFC 9293：TCP](https://www.rfc-editor.org/rfc/rfc9293.html)：建立、半关闭、RST、TIME_WAIT。
- [RFC 1122：TCP Keepalive](https://www.rfc-editor.org/rfc/rfc1122.html)、[RFC 6455：WebSocket](https://www.rfc-editor.org/rfc/rfc6455.html)：保活与 Ping/Pong/Close 控制帧。
- [Go `net`](https://pkg.go.dev/net)：连接、半关闭与期限 API。
- 本章只做文档结构、链接、来源哈希、隐私词和纸上时序校核。
