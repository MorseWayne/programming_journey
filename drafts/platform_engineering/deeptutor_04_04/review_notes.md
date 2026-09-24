# DeepTutor 04.04 生成与审阅记录

## 生成材料

- DeepTutor 书籍 `bk_f81a09fa73`、正文页 `pg_64688993e1`；8 个正文块 ready、失败块 0。HTTP Markdown 导出与容器 `generated.md` 的 SHA-256 相同。
- `original.md` 原样保留自动导览、重复小节和多套数字区间；`reviewed.md` 统一为四字节 `[100,104)`/`[104,108)` 的纸上 TCP 模型并同步课程正式页。`generation_request.json` 保存八节要求。
- 本地 BookEngine 使用进程内参数适配，没有修改 DeepTutor 持久配置。

## 技术与教学审阅

1. 原稿在首节使用 1000/1006/1012 序号，又在窗口与丢失节切换为 100/104、1000/1500/2000、0/4 等多套片段，初学者很难判断是否同一次发送。审阅稿主例始终为 `[100,104)`、`[104,108)`：第一段四字节收到后 ACK=104，两段连续收到 ACK=108；8 B 窗口中两段在途，ACK104 后再纳入 `[108,112)`。
2. 数据段已到而 ACK 丢时发送端可能重传**同序号字节**，接收 TCP 应识别并去重；抓包两次不等于 handler 两次读到同一业务请求。数据段丢、ACK 丢、排队延迟都可能导致无新确认，不能从一次 RTO 重传反推唯一根因。
3. 后段 `[104,108)` 先到、前段缺失时，基础累计 ACK 指向最早缺口 100；补上 `[100,104)` 后可推进至 108。接收端可暂存乱序片段，但应用只应看到有序字节流；选择性确认扩展不在本章展开。
4. TCP 序列号计的是连接中的**字节**，TCP Write/Read 次数不构成消息边界；业务 `message_id=m-a`、会话 `seq`、WebSocket 帧是不同层对象。TCP ACK 不证明服务器 handler 处理、数据库提交、A 收到 HTTP 回应或 B 设备已读。
5. RTO 的基础按 RFC 6298 的 RTT 估计和波动说明，不填固定系统值；HTTP 客户端超时、TCP RTO 和 Go context 截止是不同计时器。连接断/响应丢后的应用 POST 重试是**新业务请求**，与同连接 TCP 重传不同；09.02 当前重复 ID 返回 409，完整幂等确认留 S5。
6. 窗口仅作为有限在途字节预算入口，接收窗口与拥塞窗口分别留 04.06 深入；不把“增大缓冲”说成慢设备问题的无成本解决方案。
7. 22 道练习覆盖半开区间、累计 ACK、数据/ACK 丢、乱序、RTO、窗口和业务确认。没有运行 Go、套接字、抓包、IM 服务或站点，也没有检查 OpenIM 的网络运行行为。

## 核对资料与验证范围

- [RFC 9293：TCP](https://www.rfc-editor.org/rfc/rfc9293.html)：字节序列号、累计确认、重复检测与字节流。
- [RFC 6298：重传计时器](https://www.rfc-editor.org/rfc/rfc6298.html)：RTO 和超时重传的基础语义。
- [Kurose/Ross 作者互动题：可靠传输](https://gaia.cs.umass.edu/kurose_ross/interactive/rdt30.php)、[TCP 重传](https://gaia.cs.umass.edu/kurose_ross/interactive/tcp_retrans.php)：丢数据与 ACK 的推演参考。
- [Go `net`](https://pkg.go.dev/net)：后续网络 I/O 接口入口。本章只校核文档结构、链接、来源哈希、隐私词和纸上序号。
