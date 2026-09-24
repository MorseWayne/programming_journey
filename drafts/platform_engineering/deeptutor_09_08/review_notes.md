# DeepTutor 09.08 生成与审阅记录

## 生成材料

- DeepTutor 书籍 `bk_8d49e39754`、正文页 `pg_b06c315e71`；8 个正文块 ready、失败块 0。HTTP Markdown 导出与容器 `generated.md` 的 SHA-256 相同。
- `original.md` 原样保留自动导览、重复小节与各节不同的请求字段；`reviewed.md` 是统一 `u-a/c-a/m-a` 和正文、附件、URL 数据流后的静态课程，已同步正式页。`generation_request.json` 保存八节要求。
- 本地 BookEngine 使用进程内参数适配，没有修改 DeepTutor 持久配置。

## 技术与教学审阅

1. 原稿把 SQL 中含引号的输入在一处列为“需返回 INVALID_INPUT 的注入负例”，容易让初学者以为应靠拒绝引号/转义字符防 SQL 注入。审阅稿说明：按字段业务格式决定是否允许该 ID；只要作为参数绑定，它始终是**一个值**，不能改变 SQL 结构。参数化与 `u-c` 对 `c-a` 的对象授权仍分开；表名/排序方向这类结构由服务端白名单选择。
2. HTTP 请求体、解码后的正文和附件各自设上限。`Content-Length` 只能辅助早判，实际读取必须有界；Go `MaxBytesReader` 用于整体体积。跨章复核后正文沿用当前 09.02 的 6 字节上限，`len("你好")=6` 合法、`len("你好呀")=9` 拒绝；工程卷 R9 是待审变更。附件解压/转码后的资源消耗另设边界，前端字符计数不替代服务端。
3. 原稿多次从 SQL 跳到 HTML、文件、SSRF 和日志，审阅稿先画“来源→解析→存储→各使用位置”路径，再逐一判断解释器。Go `html/template` 的上下文转义适用于普通不可信文本，不能把原始正文包装成 `template.HTML`；DOM 文本优先 `textContent`，URL `href` 另需协议校验，富文本需专门净化。
4. 附件原名只是展示元数据，不直接拼服务端路径；服务器生成对象键，限制允许类型、文件签名、数量、容量、处理成本及下载权限。客户端 `Content-Type` 和扩展名不单独可信；本章未运行文件扫描，不写成附件已安全。
5. SSRF 只有在**服务器**按用户可影响的 URL 抓取预览时出现；纯文本展示/浏览器链接是不同路径。若启用预览须核对协议、解析后地址、每次重定向、DNS变化、出口策略、超时及响应大小；字符串中不含 `127.0.0.1` 不是充分防线。
6. 日志是另一输出位置。原稿部分字段例子直接写 `用户ID/消息ID`，审阅稿默认最小化，受控请求关联、固定路由、阶段、有限类别和大小区间足够；不记原始正文、Token、Cookie、文件内容、完整 URL 和内部路径。控制字符与错误文本也须防日志伪造。
7. 22 道练习从来源/单位延伸至 SQL/XSS/路径/SSRF/日志。没有运行 Go、数据库、附件/链接服务、IM 或站点，也没有检查 OpenIM 的安全实现。

## 核对资料与验证范围

- [OWASP：SQL 注入](https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html)、[Go：SQL 注入](https://go.dev/doc/database/sql-injection)：值参数与结构白名单。
- [OWASP：XSS](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html)、[Go `html/template`](https://pkg.go.dev/html/template)：按使用位置编码与富文本边界。
- [OWASP：文件上传](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html)、[SSRF](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html)、[日志](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html)与[Go `MaxBytesReader`](https://pkg.go.dev/net/http#MaxBytesReader)：类型、路径、网络、资源与证据。
- 本章只做文档结构、链接、来源哈希、隐私词和纸上负例校核。
