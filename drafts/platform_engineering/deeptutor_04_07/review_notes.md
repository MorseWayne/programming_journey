# DeepTutor 04.07 生成与审阅记录

## 生成材料

- DeepTutor 书籍 `bk_9719b064fe`、正文页 `pg_b0075b1cf1`；8 个正文块 ready、失败块 0。HTTP Markdown 导出与容器 `generated.md` 的 SHA-256 相同。
- `original.md` 原样保留自动导览、重复小节与多个服务域名例子；`reviewed.md` 统一为 `https://im.example.test`/`wss://im.example.test` 的虚构教学路径并同步正式页。`generation_request.json` 保存八节要求。
- 本地 BookEngine 使用进程内参数适配，没有修改 DeepTutor 持久配置。

## 技术与教学审阅

1. 原稿在 `im.example.test`、`im.example.com`、`api.example.com` 之间切换名称，且有些段落把“证书签名/根受信”和“目标主机名称匹配”合在一个结论里。审阅稿只用 `im.example.test` 为请求目标，分别检查链、时间、用途、SAN 名称；DNS 找到 IP 和 SNI 帮服务器选证书均不替代客户端名称校验。
2. TLS 1.3 先由临时密钥协商导出对称会话密钥，应用数据用认证加密保护；证书公钥主要用于验证握手身份签名，不直接逐条加密聊天正文。普通公开哈希本身不提供认证或保密；签名也不把内容隐藏。握手图只标 ClientHello/ServerHello、证书/CertificateVerify/Finished 的因果顺序，不误说所有报文阶段都是明文。
3. 原稿在证书判断中多次将“撤销状态已验证”写成普通握手的必然步骤；实际撤销检查与客户端/部署策略有关，审阅稿不作无条件断言。现代名称校验按 SAN，Go `x509.VerifyHostname` 只做名称匹配而不独自完成信任链；`tls.Config.ServerName` 影响客户端验证/SNI；`InsecureSkipVerify` 不当生产证书错误修复。
4. 入口 HTTPS/WSS 只保护浏览器到当前 TLS 终点；反向代理解密后到 Go 服务、数据库/队列都是另行判断的跳。转发头仅在受控代理边界可信。TLS 失败属于连接/握手阶段，不是 IM 会话 404 或 m-a 已受理/拒绝的业务证据。
5. mTLS 只在配置并验证客户端证书时得到传输端身份，不能天然映射 `u-a` 或 `c-a` 权限。TLS 1.3 的 0-RTT 若被启用存在跨连接重放边界，非幂等 `POST m-a` 需拒绝早期数据或另有重放控制；本章不声称教学服务/OpenIM 使用 0-RTT。
6. 22 道练习从对称密钥、哈希/签名进入 SAN/SNI、Go 验证、代理两跳、mTLS、0-RTT 和业务确认。没有运行 TLS、Go、IM、证书校验或站点，也没有核对 OpenIM 的部署配置。

## 核对资料与验证范围

- [RFC 8446：TLS 1.3](https://www.rfc-editor.org/rfc/rfc8446.html)：握手、密钥、认证加密及 0-RTT。
- [RFC 9525：TLS 服务身份](https://www.rfc-editor.org/rfc/rfc9525.html)：SAN 与目标名称校验。
- [Go `crypto/tls`](https://pkg.go.dev/crypto/tls)、[`crypto/x509`](https://pkg.go.dev/crypto/x509)：`ServerName`、根集合、跳过验证和名称 API。
- [MDN：TLS](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Transport_Layer_Security)：浏览器传输保护的说明。本章只校核文档结构、链接、来源哈希、隐私词和纸上握手。
