# DeepTutor 04.01 生成与审阅记录

## 生成材料

- DeepTutor 书籍 `bk_070e697ae8`、正文页 `pg_4ad17f9299`；8 个正文块 ready，失败块 0。HTTP Markdown 导出与容器 `generated.md` 的 SHA-256 相同。
- `original.md` 保留自动导览、重复小节与原始案例；`reviewed.md` 是按初学者先修和 IM 主线重组后的静态教材，已同步到正式页。`generation_request.json` 保存八节请求。
- 本地生成使用 BookEngine 与进程内 token 参数适配，没有修改 DeepTutor 持久配置。

## 技术与教学审阅

1. 固定 `c-a` 为虚构会话、`u-a/u-b` 为用户、`m-a` 为消息；原稿个别段落误把 `c-a` 当客户端标识。A/B 只作设备代称，不与用户身份、网络地址混淆。
2. 明确当前课程只有本地 `imhistory` CLI，A→服务→B 是未来教学系统的需求路径，不声称已经联网、实现路由或核对 OpenIM 某个具体版本的服务端行为。
3. 从客户端/服务端角色、协议语法/语义/时序、应用消息与字节，逐层进入应用/传输/网络/链路的职责；本地 JSON v1 不自动成为 wire 格式。用 `你好` 的 6 字节演示长度单位，但不伪造完整线上帧协议。
4. 保留 TCP 字节流不保留应用消息边界的关键事实，避免把应用消息、一次 `Write`、TCP 段与 IP 包一一对应。传输确认、服务端业务接受、设备收到与用户已读分别列证据，不以一个“发送成功”覆盖所有层次。
5. 统一一个单链路数值模型：1200 B=9600 bit，1 Mb/s 传输 9.6 ms，1200 km 在假设 2×10⁸ m/s 下传播 6 ms，处理 2 ms、排队 5 ms，合计 22.6 ms；10 Mb/s 变式为 13.96 ms。原稿后部另起 1500 B 例子，审阅稿不混用参数。
6. 明确该模型未计链路头部、握手、反向确认、重传、服务端存储和 B 显示；速率、传播、排队与应用吞吐的单位和边界单独解释。
7. 把协议版本错误、队列等待增长、B 离线用于分层失败推演，22 道练习从字节与协议逐步过渡到业务确认。静态预期与学习者未来的真实实验记录分开；未执行 Go、网络、站点或服务。

## 核对资料与验证范围

- [Kurose/Ross 作者课程](https://gaia.cs.umass.edu/kurose_ross/online_lectures.htm)和[时延知识检查](https://gaia.cs.umass.edu/kurose_ross/knowledgechecks/problem.php?c=1&s=4)：层次和时延分类。
- [RFC 9293](https://www.rfc-editor.org/rfc/rfc9293)：TCP 传输服务与字节流边界。
- [Go `net`](https://pkg.go.dev/net)：后续端点与连接的标准库入口。
- 本章只做文档结构、链接、来源哈希与带单位的纸上计算检查。
