---
title: 09.04 请求处理链：中间件、取消与响应提交
icon: /assets/icons/article.svg
order: 5
date: 2026-09-24
---

[返回第九卷](./README.md) · [程序组织前置：09.03](./03_program_organization.md) · [取消前置：05.03](../05_runtime/03_channels_cancellation.md)

# 09.04 请求处理链：中间件、取消与响应提交

> DeepTutor 初稿经技术与教学审阅后的静态课程。中间件、Go 片段、时间线和响应均为教学推演；本次没有运行 Go、HTTP 服务、请求测试或站点构建。

## 先跟踪一条 POST，而不是先堆中间件名词

09.02 已固定虚构接口 `POST /v1/conversations/c-a/messages`：HTTP 原始 JSON 最多 4096 B，正文最多 6 UTF-8 字节，同会话重复 ID 返回 409，合法 `m-a/"你好"` 返回 200 `accepted_in_memory`。09.03 已把 handler、应用服务、领域和内存适配器分开。现在把它们放进**一条实际请求的先后顺序**：请求从哪层进入，谁可以提前拒绝，错误从哪里回来，哪一刻内存已经改变，哪一刻 HTTP 响应不能再改？

全部身份 `u-a/u-b/c-a/m-a` 都是虚构教学数据。仓库当前只有本地 CLI，没有开放 HTTP/WS 服务；下文的中间件只描述未来私有教学实现的设计。真实认证、持久化和投递还未在 S2 完成，不能以一张流程图替代它们。

| 起步 | 原理 | 业务实践 |
|---|---|---|
| handler 与中间件调用次序 | `r.Context()`、超时、panic 与响应提交 | 给成功、拒绝、断连分别画状态线 |

## 一、请求进入与响应返回是相反方向

在 Go `net/http` 中，`Handler` 是能处理请求并写回应的对象。**中间件**可理解为一个接收 `next` Handler、返回新 Handler 的包裹函数：它在调用 `next.ServeHTTP` 前后分别做自己的工作，也可以按合同在前半段拒绝请求而不调用 `next`。

给未来私有教学服务安排一个示意嵌套：

```text
requestID(recovery(limitBody(auth(api))))

请求进入：requestID → recovery → limitBody → auth → api handler
正常返回：api handler → auth → limitBody → recovery → requestID
```

`requestID` 创建或确认可安全记录的关联标识；`recovery` 只在它包住的**同一 goroutine**中处理意外 panic；`limitBody` 先给请求体套上最多 4096 B 的读取边界；`auth` 是以后 S3 才真正实现的可信身份边界；`api` 把路径/JSON 转成 09.03 的应用调用并生成回应。这是本章的**教学顺序**，不是所有服务必须采用的唯一中间件顺序；调整次序要重新检查哪些错误会先暴露、哪层能看到谁的身份和资源。

例如 `auth` 拒绝无可信主体时可以直接写对应错误，不再进入 `api`。这属于**短路**，不是“中间件执行失败”；外层 `recovery`、`requestID` 的返回阶段仍可执行。若 `limitBody` 只包装 `r.Body`，没有内层读取，请求体是否真的超限要等 handler 读取时才观察到错误；不能把“设置了上限”写成“已经校验了整个正文”。

一个最小中间件形状如下。它只表达**包裹与调用顺序**，并不负责认证或业务处理：

```go
// 需要导入 net/http；这是教学片段，不接入本仓库服务。
func LimitBody(next http.Handler, maxBytes int64) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		r.Body = http.MaxBytesReader(w, r.Body, maxBytes)
		next.ServeHTTP(w, r)
	})
}
```

`http.MaxBytesReader` 为未来实现提供 Go 标准库限制入口，越界错误仍要由实际读取代码识别并映射为 09.02 的 413 `REQUEST_TOO_LARGE`。`maxBytes` 需要在启动时已验证为正，不可把 01.12 本地文件的 1 MiB 偷换进来。

## 二、先决定错误优先级，再安排限量与身份

这条教学请求可能同时有“没有认证”“JSON 损坏”“正文太大”“会话无权访问”几种问题。谁先返回、对外暴露多少信息，应在接口合同与安全策略中定好；不能让中间件排列意外决定。最外层可先安装读取上限，避免后续读取没有边界；是否在完整解码前做认证，取决于希望对未认证请求承担多少解析工作及资源存在性保护。本章的具体示意让 `auth` 在 `api` 读完整 JSON 前决定可信主体，而 `api` 仍须在真正读正文时守住 4096 B。

09.02 的状态仍按自己的类别：原始体超限 413，JSON 语法或字段错误 400，主体缺失 401，成员但无本动作权限 403，非成员或隐藏的目标 404，同会话重复 ID 409；没有收到任何 HTTP 响应时没有状态码。真实 401 认证挑战要求需在 S3 实现，S2 的固定虚构主体**只允许私有隔离练习**，不能把没有认证的服务对外开放。

HTTP 边界拿到可信 `principal=u-a` 后仍不能自行决定“所有操作都允许”。应用服务按 `Send(c-a)` 或 `List(c-a)` 分别核对对象级权限；请求 JSON 自称的 `sender_id` 不得覆盖 principal。未通过任何前置检查时，内存消息状态应保持不变；否则“先写 map、再发现无权限”会把被拒绝请求变成可查询消息。

## 三、`r.Context()` 的取消不是内存回滚

Go 的传入请求有 `r.Context()`；按 `net/http` 文档，当客户端连接关闭、请求被取消，或 `ServeHTTP` 返回时，该上下文会取消。把它传到应用服务、内存/未来存储适配器，让**愿意协作的等待点**知道不必再为这次请求做无用工作。若还要给某一步限定时间，可从父上下文派生子上下文，并在结束时调用 `cancel` 释放资源：

```go
// 教学片段；需要导入 context、time。
ctx, cancel := context.WithTimeout(r.Context(), 300*time.Millisecond)
defer cancel()
result, err := service.Send(ctx, principal, "c-a", "m-a", "你好")
_ = result
_ = err
```

300 ms 只是**纸上示例的内部等待预算**，不是线上 IM 推荐 SLA，也不保证系统一定在该毫秒数精确结束。`ctx.Done()` 关闭是停止请求；下层函数若忽略 `ctx` 或卡在不支持取消的操作里，仍可能晚返回。`defer cancel()` 不是“把成功提交撤销”，它清理由派生上下文持有的定时与父子引用。

假设应用服务已在 05.02 的锁内把 `(c-a,m-a)` 追加到内存，随后 A 的连接断开。此时 `r.Context()` 取消，但已经完成的内存状态不会自动回滚。服务端可能记录“内存已受理”，而 A 没收到 200，只能把外部结果记为**未知**。若取消发生在进入临界区前，服务可能在检查到取消后拒绝而保持状态；两种时刻不能合并成“客户端取消就一定没保存”。

另一个常见陷阱是 handler 返回后还把 `r.Context()` 交给无人监督的后台 goroutine。Go 服务端请求上下文在 `ServeHTTP` 返回时会取消，该任务可能立刻失去继续工作的条件。真正需要请求结束后继续的长任务要有独立所有者、结果查询与取消合同，留给 09.09；不能把它挂在一次 HTTP 请求生命周期上又宣称可靠后台处理。

## 四、panic 边界只处理意外故障，不替代业务错误

Go 的 `panic` 是异常控制路径，不应拿它表达“`m-a` 重复”“没有权限”或“正文超长”这类**预期内错误**。这些情况应从领域/应用返回可识别错误，再由 handler 映射到 409、403/404、400 等固定回应。`recovery` 中间件可在调用 `next.ServeHTTP` 的**同一个 goroutine**里用 `defer`/`recover` 捕获意外 panic，留下脱敏诊断，并在**尚未提交响应**时给客户端一个受控的 500。

| 故障发生时刻 | 恢复层能做什么 | 不能假装什么 |
|---|---|---|
| 业务处理前 panic，尚无响应字节 | 记录事件、按合同生成一次 500 | 权限/重复错误已经被正常分类 |
| 内存已提交后 panic，响应还未写 | 可对外报告故障，但状态已可能变化 | 500 意味 `m-a` 一定没受理 |
| 响应状态或部分正文已写后 panic | 记录部分响应与中断，按连接/协议处理 | 重新从头写一份完整 500 |
| 内层另起 goroutine 发生 panic | 此 handler 的 defer 捕不到那个 goroutine 的 panic | 外层 recovery 覆盖所有并发任务 |

即使恢复了同 goroutine 的 panic，也不证明资源、内存状态或将来的存储事务自动回滚；要有各层自己的清理和状态证据。Go `net/http` 服务器本身对某些服务请求 panic 有处理行为，但本章讨论的是**教学应用自己想给调用者什么可审计的错误合同**，不能把服务器底层恢复当作“业务一定安全、一定返回完整 JSON”。

## 五、决定最终状态，再向 `ResponseWriter` 写一次

Go `ResponseWriter` 的头部和状态有提交边界。你可以在写入前设置 `Content-Type: application/json`、`Cache-Control: no-store` 等头；需要非 200 状态时，先 `WriteHeader(code)`。若没显式调用 `WriteHeader` 就先 `Write`，Go 会隐式提交最终的 200。状态一旦按本次响应写出，不能因为后来发现重复 ID 或 JSON 编码失败就重新“改成 409”或再拼第二个完整错误体。

对本章的小 JSON 响应，可按下面次序设计：

```text
应用服务先给出结果或业务错误
→ handler 把错误映射成 09.02 的 status + 稳定机器码
→ 在内存中准备完整且可编码的小 JSON 正文
→ 设置 Content-Type、Cache-Control 等头
→ 提交一次最终状态，并写一次对应正文
→ 若写出时连接断开，记录响应可能部分送达
```

“先准备正文”不是让任意大小结果无界放进内存；09.02 的分页和原始体上限已控制教学例子的规模。流式返回另需部分结果、后续错误与取消的专门合同。若 handler 已经向 `w` 写了 `200` 和半页消息，再遇到另一条坏记录，就不能在同一响应中写新的 `500` 并认为客户端会把前半页撤销；因此历史 GET 应先形成完整的一页可见快照与表示，再写第一字节。

错误映射由 HTTP 边界**统一做一次**：应用层返回如 `ErrDuplicate`、`ErrForbidden`，外层用 `errors.Is` 或明确业务结果判断身份，不比较错误文本。原始请求超过 4096 B 在边界映射 413，正文 6 B 上限违反映射 400，重复键映射 409，未知错误才映射 500。每条错误路径仍应检查“有无可能已经完成内存提交”，不能把同一个状态码当回滚证明。

有些日志中间件为了记录状态会自写一个 `ResponseWriter` 包装器；若简单包装却漏掉底层可选能力（例如刷新、连接升级相关接口），可能影响 WebSocket 或流式响应。本章只要求理解**响应提交和日志证据**，不让初学者在此编写通用 ResponseWriter 代理；等 04.08 与 09.11 有相应前置后再审它的接口兼容。

## 六、把日志和分段时间当证据，不当业务真值

要定位一条请求，应从可信边界生成或严格核对关联标识，把它贯穿同一调用链，并按阶段记录：收到请求、是否通过认证、读取/解码、应用授权、内存追加、准备响应、写出结束。若未来有多个服务，追踪还要有跨进程关联；本章只设计字段，没启动任何观测系统。

一条**虚构、脱敏**的记录可长成：

```text
op_id=teach-001 route=POST /v1/conversations/{id}/messages
stage=app_send result=DUPLICATE_MESSAGE http_status=409 duration_ms=<实际测量后填写>
```

这里 `teach-001` 只是教学关联值，`duration_ms` 没有凭空填一个实际数字。日志可含阶段、错误类别、计数和必要的请求范围；不应无差别记录原始 JSON、真实正文、令牌或完整用户资料。客户端自报的请求 ID 也不能不经验证就当可靠关联身份；它可能重复或包含恶意文本。

分段时间要有起止点和单位：`auth` 等待了多少、解码多少、应用服务多少、内存锁多少、准备响应多少、写出多少。只看“总耗时 300 ms”无法定位究竟是读请求体、授权状态、锁竞争还是客户端接收慢。反过来，日志显示 `status=200` 也只是本服务某次写出路径的记录，不能证明 A 确实收到了完整响应，更不能证明 B 设备显示 `m-a`。09.01 的确认层级仍需独立证据。

## 七、同一个请求的七种变式

把“已知事实”和“尚未知”放在一起，才不会见到错误就倒推错误根因：

| 变式 | 停在哪个阶段 | 客户端可能观察到 | 内存状态怎样核对 |
|---|---|---|---|
| 合法 `u-a/m-a/你好` | 锁内提交后编码回应 | 完整 200 `accepted_in_memory` | 当前进程新增一项，不含送达 |
| 没有可信主体 | `auth` 短路 | 401（未来真实认证实现时） | 不进入 `app.Send` |
| 非成员 `u-x` | 应用对象授权 | 按 09.02 的 404 隐藏目标 | 不新增，不泄露会话 |
| 原始 JSON 超过 4096 B | handler 限量读取 | 413 `REQUEST_TOO_LARGE` | 不进入内存追加 |
| 同会话重复 `m-a` | 适配器锁内拒绝 | 409 `DUPLICATE_MESSAGE` | 旧正文和顺序不变 |
| 进入提交前检测到取消 | 协作式停止点 | 可能无 HTTP 响应 | 若确在提交前，状态不变 |
| 提交后 A 断连或回应丢失 | HTTP 写出阶段 | A 没有可用状态码、结果未知 | 服务端可能已内存受理 |

若在准备成功正文前 panic，`recovery` 可尝试生成 500；若在已写半份 200 后 panic，只有“部分响应/连接中断”的观察，不能再许诺完整错误体。七种变式共同说明：HTTP 错误、取消与服务端业务提交并非一一对应，必须标明**发生时刻和状态检查点**。

## 八、分层练习与个人验证路线

先在纸上画出 `requestID(recovery(limitBody(auth(api))))` 的进入/退出箭头，再将 09.03 的 handler/app/memorystore 放到最里层。学习者以后在自己的隔离目录实现时，应分别保存理论预期、代码版本、个人 `httptest` 与真实网络观察；本轮只编写静态课程，没有运行这些实验。

### 先答题，再看反馈

<details><summary>1. 中间件调用 `next.ServeHTTP` 前后分别处于哪段？</summary>

调用前在请求进入阶段，调用返回后在回应返回阶段。</details>

<details><summary>2. 本章嵌套中请求先经过 requestID 还是 api？</summary>

先经过最外层 requestID，再逐层到 api。</details>

<details><summary>3. `auth` 提前拒绝后 api 还会执行吗？</summary>

不会，除非 auth 明确继续调用 next。</details>

<details><summary>4. 安装 `MaxBytesReader` 就已经读完并验证了 4096 B 吗？</summary>

没有。它先设置读取上限，实际越界在内层读取时观察。</details>

<details><summary>5. `sender_id:"u-a"` 可代替可信 principal 吗？</summary>

不能。它是客户端可控 JSON 字段。</details>

<details><summary>6. 401 与非成员的 404 是同一个前置条件吗？</summary>

不是。前者缺可信主体，后者是本章对已知主体的资源隐藏策略。</details>

<details><summary>7. `r.Context()` 何时可能取消？</summary>

客户端连接关闭、请求取消，或 handler 返回等条件下可取消。</details>

<details><summary>8. `WithTimeout` 的 `cancel` 正常提前结束时还应调用吗？</summary>

应调用，以释放派生上下文相关资源。</details>

<details><summary>9. `ctx.Done()` 关闭会强制终止不理会 ctx 的函数吗？</summary>

不会。下层需协作检查或使用支持取消的操作。</details>

<details><summary>10. 内存已提交后客户端断连，消息自动回滚吗？</summary>

不会。客户端结果可能未知，服务端内存状态可能已变化。</details>

<details><summary>11. handler 返回后继续用 `r.Context()` 做可靠后台任务合适吗？</summary>

不合适。该请求上下文在 handler 返回时取消；长期任务须另有所有者。</details>

<details><summary>12. 业务重复 ID 应用 panic 还是返回 ErrDuplicate？</summary>

返回可识别的普通业务错误，由 HTTP 边界映射 409。</details>

<details><summary>13. handler 的 recover 能抓住另起 goroutine 的 panic 吗？</summary>

不能。`recover` 只作用于对应 panic 的同一 goroutine。</details>

<details><summary>14. panic 恢复就自动把内存状态回滚了吗？</summary>

没有。需核对它发生在提交前还是提交后。</details>

<details><summary>15. `WriteHeader` 未调用就先 `Write`，Go 默认最终状态是什么？</summary>

第一次写出会隐式提交 200。</details>

<details><summary>16. 已写出半份成功 JSON，能在同一响应里重写完整 500 吗？</summary>

不能。状态与部分正文可能已提交，应记录部分响应事实。</details>

<details><summary>17. 为什么小 JSON 回应先准备正文再写？</summary>

尽量在最终状态提交前发现编码错误，避免部分成功体。</details>

<details><summary>18. 错误映射应分散在 domain 和 memorystore 吗？</summary>

不应。业务层保留错误身份，HTTP 边界统一映射状态与机器码。</details>

<details><summary>19. 日志可直接记录访问令牌和完整正文吗？</summary>

不应。记录必要阶段、类别、时长和脱敏关联信息。</details>

<details><summary>20. 日志中出现 status=200 能证明客户端完整收到吗？</summary>

不能。它仅记录服务端某条写出路径，网络/客户端仍有独立边界。</details>

<details><summary>21. 写一个 ResponseWriter 包装器只实现 Write/WriteHeader 就总兼容 WebSocket 吗？</summary>

不一定。可选刷新/升级能力可能被包装器遗漏，需另行审查。</details>

<details><summary>22. 09.04 的请求时间线能证明 `u-b` 已读吗？</summary>

不能。它最多走到本进程内存受理和 HTTP 回应，设备与阅读状态需后续证据。</details>

## 来源与下一步

- [Go `net/http.Handler`](https://pkg.go.dev/net/http#Handler)、[`Request.Context`](https://pkg.go.dev/net/http#Request.Context)、[`ResponseWriter`](https://pkg.go.dev/net/http#ResponseWriter)、[`MaxBytesReader`](https://pkg.go.dev/net/http#MaxBytesReader)：中间件、请求与响应提交的官方边界。
- [Go `context`](https://pkg.go.dev/context)、[`log/slog`](https://pkg.go.dev/log/slog)：取消传播与脱敏结构化记录的 API 入口。
- [09.02 HTTP 合同](./02_http_api_contract.md)和[09.03 程序组织](./03_program_organization.md)：本章所有状态、限额和责任分层的来源。

下一章先读[11.01 业务结果与测量](../11_reliability/01_business_measurement.md)，再按[学习路线](../learning_path.md)补输入/输出防护所需的前置与 10.09 CI；SQL、HTML 等知识齐备后再完整展开 09.08。离开本章前，请能说清“panic 恢复”“请求取消”“HTTP 500”“服务内存状态”四者为何互不等价。
