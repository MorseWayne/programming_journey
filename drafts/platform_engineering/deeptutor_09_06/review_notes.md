# DeepTutor 09.06 生成与审阅记录

## 生成材料

- DeepTutor 书籍 `bk_1dcf3f3a27`、正文页 `pg_bc2023251e`；8 个正文块 ready、失败块 0。HTTP Markdown 导出与容器 `generated.md` 的 SHA-256 相同。
- `original.md` 原样保留自动导览、重复小节及多套浏览器请求例子；`reviewed.md` 按“表单/模板→Cookie/Session→同源/CORS→CSRF→WebSocket→缓存/注销”重组为静态课程并同步正式页。`generation_request.json` 保存八节要求。
- 本地 BookEngine 使用进程内参数适配，没有修改 DeepTutor 持久配置。

## 技术与教学审阅

1. 原稿在不同段落使用 `evil.example` 跨站页面与 `SameSite=Lax/Strict` Cookie，却没有始终说明现代浏览器何时会带 Cookie。审阅稿以 `im.example.test` 与不受信 `usercontent.example.test` 的**同站但跨源**情景说明：SameSite 与 Origin 不同，Lax 不能单靠它阻止同站兄弟子域发起的 CSRF。跨站场景只有在相应 Cookie/客户端策略允许时才可能带凭据。
2. CORS 明确为浏览器脚本跨源读取响应的许可；某些简单请求/表单可能已经发送并改变服务端状态，即使脚本读不到响应。跨源携凭据需 `credentials: include`、Cookie 策略允许、显式 `Access-Control-Allow-Origin` 和 `Access-Control-Allow-Credentials`，不能用 `*`。非浏览器 Go 客户端不靠 CORS 做访问控制。
3. HTML 表单与 09.02 的 JSON API 分开：`/ui/send` 是教学表单端点，普通表单默认不是 JSON；浏览器隐藏字段仍是用户输入。Go `html/template` 只在合适上下文转义普通文本，不能把 `template.HTML` 作为不可信正文的默认包装，也不等于任意富文本净化。
4. Cookie 是会话标识的载体，服务端 Session 才解释受信主体与撤销状态；`Secure/HttpOnly/SameSite` 不能替代 `c-a` 的逐资源授权。`__Host-` 示例不设 Domain、带 `Secure` 和 `Path=/`，注销必须撤销服务端 Session，而非仅清理前端 Cookie。
5. CSRF 与 XSS、CORS、身份认证分开。状态改变接口须按浏览器业务形态采用 CSRF token 和/或经过审查的来源信号及缺失回退，GET 不改状态；SameSite 是辅助，资源权限仍独立。WebSocket 浏览器握手的 Origin 需服务端核对，CORS 响应头不是握手授权；原生客户端可伪造 Origin，所以还需真正认证和每条应用消息的权限校验。
6. Cache-Control `private` 可允许私有缓存，`no-cache` 允许保存但复用前验证，`no-store` 指示不保存本次响应，不能抹除既有缓存/DOM/截图。原稿后段把缓存与注销建议较快并列，审阅稿逐一明确服务器撤销、浏览器过期 Cookie、页面清理及其他设备 Session 的不同责任。
7. 22 道练习从表单与 Origin 进入 CORS 凭据、同站 CSRF、WebSocket 和 IM 历史隐私。没有运行浏览器、Go、IM 服务或站点，也不声称 OpenIM 的浏览器会话配置。

## 核对资料与验证范围

- [MDN：表单](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/form)、[同源策略](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Same-origin_policy)、[Cookie](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Cookies)、[CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS)与[Fetch 凭据](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch)：浏览器请求与跨源行为。
- [OWASP：CSRF](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)、[WebSocket 安全](https://cheatsheetseries.owasp.org/cheatsheets/WebSocket_Security_Cheat_Sheet.html)：请求伪造、同站风险与长连接来源。
- [Go `html/template`](https://pkg.go.dev/html/template)、[`net/http`](https://pkg.go.dev/net/http)、[MDN：Cache-Control](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control)：模板、Cookie 属性、缓存语义。
- 本章只做文档结构、链接、来源哈希、隐私词和纸上时序校核。
