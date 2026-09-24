# 09.06 浏览器与客户端边界：Cookie、跨源与 IM 请求

> DeepTutor 初稿经技术与教学审阅后的静态课程。域名、Cookie、表单、请求和结果均为虚构纸上示例；本次没有运行浏览器、Go、IM 服务或站点。这里讨论的是教学 IM 的浏览器入口，不宣称固定 OpenIM 版本具有相同的前端、会话或 CORS 配置。

## 一、同一个“发送消息”，浏览器替你做了什么

假设 `u-a` 在 `https://im.example.test` 的浏览器页面查看虚构会话 `c-a`，输入 `m-a` 并点击发送。与 09.02 的 HTTP API 相比，浏览器还带来**页面来源、Cookie 自动携带、HTML 表单、脚本跨源限制、缓存和长连接握手**。原生 Go 命令行或移动客户端也能调用发送接口，却不会自动遵循浏览器的同源策略和 CORS；因此服务端不能把“浏览器拦住了”当作所有客户端的权限控制。

```text
浏览器页面 → GET /ui/conversations/c-a    → HTML/历史页面
浏览器表单 → POST /ui/send               → 一次状态改变
页面脚本   → fetch('/v1/.../messages')    → JSON API 请求
页面脚本   → WebSocket 握手              → 长连接上的多条应用消息
```

本章先从基础概念进入：**HTML** 表达页面和表单，HTTP 发送请求与响应，**Cookie** 是浏览器按规则附带的一小段状态，服务端 **Session** 解释登录身份，**Origin** 表示页面/请求的来源。随后才讲 CORS、CSRF 和 WebSocket 风险。无论哪条路径，调用者身份仍须由服务端验证，访问 `c-a` 历史和发送消息仍须按 09.01/09.05 检查成员权限。

| 第一遍 | 第二遍 | 练习成果 |
|---|---|---|
| 表单、Cookie/Session、Origin 与同源 | CORS、CSRF、WebSocket Origin、缓存与注销 | 三条浏览器请求线、一张防护职责表、一份私有历史缓存政策 |

## 二、HTML 表单、`fetch` 与 Go 模板先各归其位

HTML `<form>` 的 `action` 指定目标、`method` 指定提交方法。下面是**教学页面端点**的静态片段；它不是 09.02 JSON API 的实际实现：

```html
<form method="post" action="/ui/send">
  <input type="hidden" name="conversation_id" value="c-a">
  <textarea name="body"></textarea>
  <input type="hidden" name="csrf_token" value="SERVER_GENERATED_TOKEN">
  <button type="submit">发送</button>
</form>
```

普通表单默认会按表单编码提交，`GET` 表单把数据放入 URL 查询部分，`POST` 将数据放入请求体；不能因为页面看起来像“聊天框”就默认它会发 JSON。若页面脚本调用 09.02 的 JSON API，要由 `fetch` 明确设置方法、内容类型与正文。表单里的隐藏 `conversation_id`、`body` 和 CSRF token 都是浏览器送来的输入；**隐藏字段不等于可信字段**。服务端仍要验证会话 ID、正文 UTF-8 字节数、受信用户身份和权限。前端 `required` 或字符计数只改善交互，不能替代服务端规则。

服务端把消息正文放进 HTML 页面时，也要区分“文本”和“页面代码”。Go `html/template` 能按 HTML 上下文对普通不可信字符串做转义；例如正文 `"<b>你好</b>"` 作为文本展示时不应变成浏览器执行的任意 HTML。不要把未经审查的聊天正文包成 `template.HTML` 来绕开转义。模板的自动转义**不是任意富文本净化器**；若产品允许富文本或附件预览，09.08 再系统讲输出编码与 XSS 边界。本章先记住：**正文来自用户，显示位置决定输出处理方式**。

## 三、Cookie 是载体，Session 才解释“谁登录了”

浏览器收到服务端 `Set-Cookie` 后，后续向符合域名、路径、协议及 SameSite 规则的目标发请求时，可能自动附带 `Cookie`。一个教学会话 Cookie 可长这样：

```http
Set-Cookie: __Host-im_session=<不可预测的会话标识>; Path=/; Secure; HttpOnly; SameSite=Lax
```

这是**说明属性的示意值**，不是可复制的真实凭据。`__Host-` 前缀要求 `Secure`、`Path=/` 且不设 `Domain`，减少宽域共享；`Secure` 要求安全传输；`HttpOnly` 限制页面 JavaScript 读取该 Cookie；`SameSite` 限定某些跨站请求何时携带；过期/Max-Age 控制浏览器保存期限。它们不能各自代替服务器的会话校验、权限检查和撤销。

服务端拿到 opaque session ID 后，在**服务端 Session** 中找到对应主体 `u-a`、有效期和撤销状态，再对 `c-a` 单独做成员授权。Cookie 值不应直接是可被改写的 `user_id`，也不能把“Cookie 存在”当作“有权读此会话”。`HttpOnly` 使脚本难以直接读取 Cookie，但若同源页面脚本已被注入，仍可能以用户身份发请求；它不是 XSS 的万能解法。

登出至少要让服务端把当前 Session 判为无效，并用匹配的作用域让浏览器过期 Cookie。删掉浏览器 Cookie 而服务端仍接受旧 Session ID，不能算可靠注销；服务器撤销当前浏览器会话，也不自动撤销其他设备或已显示在页面上的历史。后续 09.07 会详细定义会话、Token、撤销和多设备边界。

## 四、同源与 CORS：允许脚本读响应，不等于允许业务操作

浏览器的 **Origin** 由**方案（scheme）+ 主机（host）+ 端口（port）**组成。`https://im.example.test` 与 `https://api.example.test` 主机不同，属于跨源；与 `https://im.example.test:8443` 端口不同，也属跨源。路径 `/ui` 与 `/v1` 不影响 Origin。**同源策略**主要限制一个来源的脚本怎样读取另一个来源的数据；它不是“跨源请求一律发不出去”，更不是数据库成员授权。

**CORS** 是服务器向浏览器声明“这些来源的脚本可以读取我的跨源响应”的 HTTP 机制。某些非简单跨源请求会先发不含凭据的 `OPTIONS` 预检，询问方法和请求头是否允许。页面若在 `https://im.example.test`，API 在 `https://api.example.test`，`fetch` 想跨源携带 Cookie，需要客户端选 `credentials: 'include'`，同时仍受 Cookie 本身的 Domain/SameSite 规则约束；API 也需要向浏览器返回与实际允许来源匹配的 `Access-Control-Allow-Origin` 和 `Access-Control-Allow-Credentials: true`。**携凭据响应不能用 `Access-Control-Allow-Origin: *`**；动态按允许来源返回时还要考虑 `Vary: Origin`。

| 机制 | 浏览器方面回答什么 | 不会替服务端回答什么 |
|---|---|---|
| 同源策略 | 此页面脚本能否直接读取另一个 Origin 的数据 | 用户是否有权读 `c-a` |
| CORS | 服务器是否允许特定来源脚本跨源读响应 | 请求是否代表 `u-a` 的真实意图、主体是否有会话权限 |
| Session | 这个 Cookie 对应哪位已登录主体 | 主体是否可读某一条消息 |
| 会话成员授权 | 该主体能否操作 `c-a` | 浏览器脚本是否来自预期 Origin |

原生 Go 客户端和脚本化 HTTP 工具不会因为浏览器 CORS 响应头而失去调用能力；服务端仍要认证与授权。相反，浏览器即使因 CORS **读不到响应**，某些跨源请求也可能已经到达并改变服务端状态。下一节的 CSRF 正是利用了这个差别。

## 五、CSRF：浏览器替已登录用户做了不想做的事

假设 A 已在 `im.example.test` 登录，浏览器持有会话 Cookie。A 又打开同一站点体系下的**不受信页面** `https://usercontent.example.test`，该页面构造一个表单提交到 `https://im.example.test/ui/send`，试图让 A 向攻击者指定的会话发消息。两者**不同 Origin**，但可能属于同一 **site**；因此即使 Cookie 采用 `SameSite=Lax`，也不能单靠它阻止这个同站跨源场景。浏览器可以按 Cookie 规则携带 A 的会话；攻击页面未必能读发送响应，服务器仍可能已执行写入。这是 **CSRF（跨站请求伪造）** 的业务风险。

纸上时序：

```text
1. A 登录教学 IM，服务端 Session 映射到 u-a。
2. 不受信页面诱导浏览器发 POST /ui/send；浏览器可能自动带目标站 Cookie。
3. 若服务端只凭 Session 和表单字段就写 m-a，A 的权限被借来完成非本人意图。
4. 攻击页是否读到响应，与消息是否已写入是两个问题。
```

防护应按实际客户端形态组合：**GET/HEAD 等安全方法不做状态改变**；对使用 Cookie 的状态改变接口，采用服务端生成并核对的 CSRF token，或按受支持浏览器/业务场景严格校验 `Origin`、Fetch Metadata 等来源信号及其缺失回退；`SameSite` 作辅助边界。应用还必须再次检查 `u-a` 对目标会话的权限。CSRF token 不应放在 URL 或日志中，也不应等同于会话 Cookie；服务器必须把收到的 token 与当前会话预期值核对。即使恶意用户自身有权限给 `c-a` 发消息，也不能据此跳过“是否是 A 的意图”的检查。

**CORS 本身不是 CSRF 防护**：它决定浏览器脚本能否读跨源响应；简单表单提交可能没有预检，服务器已执行状态改变。仅让 POST 接收 JSON 和自定义头可减少某些浏览器可发请求的路径，但仍要审查所有表单端点、同站不受信页面、客户端脚本输入与凭据策略。CSRF 与 XSS 也不同：前者利用浏览器自动附带凭据发起非本人意图的请求；后者是页面执行了不可信脚本，可能绕过同源下多种前端防线。09.08 再系统讲输出防护。

## 六、WebSocket 也有浏览器来源和逐条消息权限

04.03 已说明 WebSocket 通过 HTTP 握手建立长期双向连接。浏览器发起握手时通常带 `Origin`，并可能依 Cookie 规则附带会话 Cookie。服务器须核对允许的浏览器来源和有效 Session；**CORS 响应头不是 WebSocket 握手的授权机制**。若只认 Cookie，不检查 Origin，不受信页面可能诱导浏览器以 A 的会话建立连接，这类风险常称 **跨站 WebSocket 劫持**。

握手通过只说明“这条连接在建立时通过入口检查”。随后每条 `send_message`、`subscribe_conversation`、`read_receipt` 应按服务端身份、目标会话和当前权限独立校验；不能把客户端发来的 `sender_id` 或群组 ID 当已授权事实。长连接还要考虑注销、会话撤销和成员退群后旧连接上的权限怎样刷新，这些在 09.07、S4/S5 继续展开。

原生客户端可自行构造 `Origin` 头，甚至不发送；所以 Origin 校验是**浏览器来源防护**，不是通用身份认证。服务端的 Session/Token 验证和逐消息成员授权始终需要。反过来，WebSocket 消息成功送出服务器，也不能直接证明 B 设备显示或阅读，业务确认点仍按 11.01 和后续可靠性章节定义。

## 七、私有历史如何缓存，注销后还剩什么

浏览器与中间缓存能保存 HTTP 响应。IM 历史含私有正文，不能按公共静态资源处理。`Cache-Control: private` 表示允许**私有缓存**保存但不应给共享缓存重用；`no-cache` 允许保存、复用前要重新验证；`no-store` 指示缓存**不要保存这次响应**。若课程的隐私需求是“历史正文不应落入浏览器/代理 HTTP 缓存”，可为私有历史响应选择 `no-store`，同时接受这会失去部分缓存收益；普通带版本号的静态 JS/CSS 则可用不同策略。不要把三者都翻译成“完全不缓存”。

`no-store` 不会抹掉**以前已经缓存**的同 URL 响应，也不会撤回浏览器已经渲染到 DOM 的正文、截屏或导出文件。注销应使服务端 Session 失效并让浏览器过期 Cookie，前端清理当前内存中的会话和历史展示；若要“退出所有设备”，还需额外的设备 Session 撤销合同。浏览器回退、共享电脑、其他设备和离线副本都属于产品需要明确的私有数据生命周期，不能仅靠一个响应头宣布全部清除。

请求 URL、访问日志和错误页也不应携带真实消息正文、会话令牌或 CSRF token；URL 可能进入浏览器历史、代理日志与 Referer。缓存策略与脱敏/授权共同组成边界，不能互相替代。

## 八、交付三条请求线与分层练习

学习者交付：① 同源表单、跨源 `fetch`、WebSocket 三条浏览器路径，各标 Cookie、Origin、Session、成员权限及响应能否被脚本读取；② 一个 `u-a` 被同站不受信页面诱导发送 `m-a` 的 CSRF 时间线及至少两层防护；③ 私有历史的 Cache-Control 与注销后仍可能存在的副本说明。再将原生 Go 客户端并列，指出它不受浏览器 CORS 的读取限制，但仍受服务端认证和授权约束。所有产物是纸上设计，本章没有运行服务或浏览器。

### 分层练习：先答，再展开反馈

<details><summary>1. `<form action>` 和 `method` 各决定什么？</summary>

前者是提交目标，后者是使用的 HTTP 方法。</details>

<details><summary>2. 普通 POST 表单会自动发送 09.02 约定的 JSON 吗？</summary>

不会。默认是表单编码；JSON API 需由脚本或其他客户端按合同构造。</details>

<details><summary>3. 隐藏字段中的 sender_id 能作为受信身份吗？</summary>

不能。隐藏仍是客户端输入，主体应来自服务端验证后的 Session/凭据。</details>

<details><summary>4. `html/template` 处理普通消息文本主要做什么？</summary>

按输出上下文转义，避免普通文本被直接当作 HTML/脚本解释。</details>

<details><summary>5. 直接把不可信正文转成 `template.HTML` 有何风险？</summary>

可能绕开模板转义，让不可信内容进入浏览器可执行上下文。</details>

<details><summary>6. Cookie 与服务端 Session 是同一件事吗？</summary>

不是。Cookie 携带标识；服务器用 Session 解释主体、有效期和撤销状态。</details>

<details><summary>7. `HttpOnly` 能阻止同源恶意脚本代用户发请求吗？</summary>

不能。它限制脚本直接读 Cookie，不消除已执行脚本的请求能力。</details>

<details><summary>8. `Secure` 与 `SameSite` 分别约束什么？</summary>

前者约束安全传输；后者约束某些跨站请求是否带 Cookie。</details>

<details><summary>9. 路径不同会让两个 URL 变成不同 Origin 吗？</summary>

不会。Origin 比较方案、主机与端口。</details>

<details><summary>10. `im.example.test` 与 `api.example.test` 是同源吗？</summary>

不是，主机不同；它们仍可能属于同一 site。</details>

<details><summary>11. CORS 可以代替 `c-a` 成员授权吗？</summary>

不能。CORS 控制浏览器脚本跨源读取响应，资源权限由服务端判断。</details>

<details><summary>12. 跨源携 Cookie 的响应可用 `Access-Control-Allow-Origin: *` 吗？</summary>

不能。浏览器要求显式允许来源，并满足凭据相关规则。</details>

<details><summary>13. 脚本因 CORS 读不到响应，能断定服务端没执行 POST 吗？</summary>

不能。请求可能已到达并改变状态。</details>

<details><summary>14. 非浏览器 Go 客户端会被 CORS 响应头拦住吗？</summary>

不会。仍必须由服务端认证、授权和校验。</details>

<details><summary>15. CSRF 利用了浏览器的什么自动行为？</summary>

浏览器可能按 Cookie 规则给目标站请求自动附带已登录凭据。</details>

<details><summary>16. `SameSite=Lax` 一定能挡住不受信兄弟子域表单吗？</summary>

不能。它可能是同 site 但不同 Origin，仍需来源/CSRF 防护。</details>

<details><summary>17. 为什么 GET 不应发送消息或退出会话？</summary>

GET 应用于安全读取；跨站导航等可能触发它，若改变状态会扩大 CSRF 风险。</details>

<details><summary>18. CSRF token 收到后服务器还要做什么？</summary>

核对它与当前会话的预期值，并继续做资源授权。</details>

<details><summary>19. WebSocket 握手有 Cookie 就无需检查 Origin 吗？</summary>

不行。浏览器可能被不受信来源诱导建立带 Cookie 的连接。</details>

<details><summary>20. 握手通过能让后续所有 c-a 消息免授权吗？</summary>

不能。每条发送/订阅仍要检查目标会话和当前权限。</details>

<details><summary>21. `private`、`no-cache`、`no-store` 可以等同吗？</summary>

不能。它们分别控制共享缓存、复用前验证和是否保存本次响应。</details>

<details><summary>22. 注销并返回 `no-store` 能擦掉已截图的历史吗？</summary>

不能。服务端撤销 Session、浏览器清理展示和既有副本是不同责任。</details>

## 来源与下一步

- [MDN：HTML 表单](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/form)、[同源策略](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Same-origin_policy)、[Cookie](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Cookies)、[CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS)与[Fetch 凭据](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch)：浏览器请求与跨源边界。
- [OWASP：CSRF 防护](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)和[WebSocket 安全](https://cheatsheetseries.owasp.org/cheatsheets/WebSocket_Security_Cheat_Sheet.html)：请求伪造与长连接来源。
- [Go `html/template`](https://pkg.go.dev/html/template)、[`net/http`](https://pkg.go.dev/net/http)与[MDN：Cache-Control](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control)：模板、Cookie 属性和缓存语义。

按[学习路线](../../../src/docs/platform_engineering/curriculum/learning_path.md)，下一章 09.07 进一步讲凭据、会话、Token、会话成员授权和撤销；09.08 再系统讲输出编码、SQL 注入、文件/URL 与敏感日志。离开本章前，应能说明**浏览器来源、登录主体、用户意图、会话资源权限和设备送达各需要哪份独立证据**。
