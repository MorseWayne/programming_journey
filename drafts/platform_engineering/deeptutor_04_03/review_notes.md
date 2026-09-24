# DeepTutor 04.03 生成与审阅记录

## 生成材料

- DeepTutor 书籍 `bk_1d7e5e3a21`、正文页 `pg_3a3f7ef43a`；8 个正文块 ready，失败块 0。HTTP Markdown 导出与容器 `generated.md` SHA-256 相同。
- `original.md` 保留自动导览、重复小节与原始示例；`reviewed.md` 是统一接口范围、报文、握手和业务边界的静态教材，已同步正式页。`generation_request.json` 保存八节要求。
- 本地生成使用 BookEngine 与进程内参数适配，没有修改 DeepTutor 持久配置。

## 技术与教学审阅

1. 原稿一会儿用 `/v1/conversations/c-a/messages` 作历史查询，一会儿把 `/v1/events` 同时用作历史 GET 和 WebSocket 升级，还穿插不同会话 ID 与真实教育域名。审阅稿固定 `c-a/u-a/u-b/m-a` 与保留测试名 `chat.example.test`；历史路径和升级路径分开。
2. HTTP/1.1 GET 请求从方法、目标、Host、Accept、空行讲起；回复示例固定 `{"conversation_id":"c-a","messages":[]}`，按 ASCII 字节核对 `Content-Length: 39`，不计 Markdown 展示的末尾换行，并说明真实 HTTP/1.1 用 CRLF。`Cache-Control: no-store` 是私密历史的教学选择而非认证。
3. 统一 RFC 9110 的 GET 安全语义和 200/400/401/403/404/500 的层次；原稿把 404 主要解释为“会话不存在”，审阅稿补上资源可能被刻意隐藏、代理或错误目标可返回状态码的限制。不把空列表当历史完整或已读证据。
4. WebSocket 握手采用 RFC 6455 中互相匹配的示例 `Sec-WebSocket-Key` 与 `Sec-WebSocket-Accept`，注明固定 Key 仅为教材、真实连接应新生成；101 是协议切换且 Key 不是登录凭据，鉴权、Origin 和会话权限另行设计。
5. TCP 字节流、WebSocket 帧、WebSocket 消息与 IM 应用载荷分层；客户端帧须掩码、服务端帧不掩码，掩码不是加密。Ping/Pong、服务端受理、B 设备接收和用户已读各需不同证据。
6. 当前课程项目仍只有本地 CLI，`net/http` 只是学习者后续个人只读历史查询的标准库入口。原稿的重连、补拉、完整同步方案作为 S5 前置保留为问题，不称为本章已实现或已验证事实。
7. 22 道练习由 HTTP 方法/头/正文走向 101、帧和业务确认；没有运行 Go、网络服务、真实请求、测试或站点构建。

## 核对资料与验证范围

- [RFC 9110](https://datatracker.ietf.org/doc/html/rfc9110)、[RFC 9112](https://www.rfc-editor.org/rfc/rfc9112)：HTTP 语义与 HTTP/1.1 报文。
- [RFC 6455](https://www.rfc-editor.org/rfc/rfc6455)：WebSocket 握手、帧与掩码。
- [Go `net/http`](https://pkg.go.dev/net/http)：后续个人 HTTP 实践入口。
- 本章只做文档结构、链接、来源哈希和报文静态核对。
