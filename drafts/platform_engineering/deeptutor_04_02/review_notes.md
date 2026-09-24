# DeepTutor 04.02 生成与审阅记录

## 生成材料

- DeepTutor 书籍 `bk_cd52734497`、正文页 `pg_19adcca864`；8 个正文块 ready，失败块 0。HTTP Markdown 导出与容器 `generated.md` SHA-256 相同。
- `original.md` 保留自动导览、重复小节和原始案例；`reviewed.md` 是统一文档地址、失败边界及课程先修后的静态教材，已同步到正式页。`generation_request.json` 保存八节要求。
- 生成使用本地 BookEngine 与进程内参数适配，没有修改 DeepTutor 持久配置。

## 技术与教学审阅

1. 原稿以 `.invalid` 域名说明 DNS 解析，却在部分表述里继续假设它解析出服务 IP。审阅稿固定 `chat.example.test` 为**纸上解析表中的虚构名称**，`missing.example.invalid` 为无法得到地址的失败变式，明确现实公共 DNS 不保证任何题设答案。
2. RFC 5737 的 `192.0.2.0/24`、`198.51.100.0/24` 与 RFC 3849 的 `2001:db8::/32` 均是**文档地址**，只在静态例子里使用，不作为真实 Linux/Go 网络配置、目标或实验服务。
3. 把用户 ID、会话 ID、域名、IP、端口和 socket 分别定义；IPv4 `/24` 是前 24 位共同前缀，不等于 24 台主机。纸上 `/24` 和默认 `/0` 路由表只说明选择下一跳，不保证下一跳或终点可达。
4. DNS 的 A/AAAA、多地址、缓存与 TTL 只回答候选地址；路由、连接、监听、应用协议与授权仍需逐层证据。socket、监听端点、客户端临时源端口及 IPv6 host:port 方括号分别说明。
5. 原稿有“404 表示服务器存在且路径不存在”“连接拒绝通常仅因无人监听”等过强推断。审阅稿用“某个 HTTP 响应者”限定 404/403/200，并将连接拒绝与超时列为多种可能条件，避免声称一定到达预期 IM 服务。
6. 所有故障路径止于其已观察层：DNS 失败不能说服务端拒绝 JSON，连接未建立不能说 HTTP 404，收到 200 也不能说 `u-b` 已读。`net.Dial`、`net.Listen` 仅作为后续 Go 网络编程入口，不执行。
7. 22 道练习按术语、前缀、端口、DNS、路由和业务定位递进。当前课程项目仍只有本地 CLI，04.02 没有真实网络、Go、站点或服务运行记录。

## 核对资料与验证范围

- [RFC 5737](https://www.rfc-editor.org/rfc/rfc5737)、[RFC 3849](https://www.rfc-editor.org/rfc/rfc3849)、[RFC 2606](https://www.rfc-editor.org/rfc/rfc2606)：文档地址与测试域名。
- [RFC 1034](https://www.rfc-editor.org/rfc/rfc1034)、[Linux `socket(7)`](https://man7.org/linux/man-pages/man7/socket.7.html)、[Go `net`](https://pkg.go.dev/net)：名称、socket 与标准库边界。
- 本章只做文档结构、链接、来源哈希和纸上前缀/路由/失败分层核对。
