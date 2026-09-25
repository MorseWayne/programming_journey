# 04.09 代理与负载均衡：逐跳追踪请求和超时

> 本章以虚构 `A 客户端 → 反向代理 P → IM 实例 N1/N2` 的纸图教学，没有运行代理、负载均衡器、Go 或 IM 服务。先会 HTTP/WebSocket、TLS 逐跳保护和连接生命周期。当前 S2 `/v1` 正文非空且最多 **6 UTF-8 B**、原始 HTTP 请求正文最多 **4096 B**、同 ID 重复 **409**（相同正文也重复）、非成员隐藏 **404**、`200 accepted_in_memory` 只到**受理该请求的进程内存**；未来 S3 `/v2` 存库提案仍为 6 B，R9 6→9 B 待审。代理和多实例不改变这些业务确认点。[09.02 当前合同](../../../src/docs/platform_engineering/curriculum/09_backend_security/02_http_api_contract.md)

## 一、先画每一跳：代理能转发，不能替后端完成业务

**反向代理**接收客户端面向服务的请求，再选择后端、转发请求和响应。**负载均衡**按某种策略在可用后端间分配新请求；它可由反向代理承担，也可以在不同网络层实现。虚构路径中 A 与 P 有一条连接，P 与 N1/N2 各可有另一条连接；连接、TLS 和超时都是**逐跳**的，不能把 P 的 TCP ACK 写成 N1 已存库或 B 设备 ACK。[Go `httputil.ReverseProxy`](https://pkg.go.dev/net/http/httputil) · [04.07 TLS 终止边界](../../../src/docs/platform_engineering/curriculum/04_networks/07_tls_identity.md)

```text
A 客户端 --TLS/HTTP 或 WebSocket--> P 代理 --受保护的上游连接--> N1/N2
   请求身份/ID/body                 路由/头部/预算               S2 本进程受理
```

若 P 在客户端侧终止 TLS，P 能看到明文，P→N1/N2 是否再次用 TLS 要另定；证书验证的是相应**连接端点**，应用还需核用户身份与会话成员。代理可以报告自己产生的 502/504，也可以转发后端产生的状态；排障要记清**谁产生了响应、哪一跳已观察到什么**。[04.07 服务身份与应用授权](../../../src/docs/platform_engineering/curriculum/04_networks/07_tls_identity.md) · [RFC 9110：502/504](https://www.rfc-editor.org/rfc/rfc9110.html)

## 二、Host、路径与转发头：只有受信代理能提供来源线索

代理可能改写目标 URL、Host、路径前缀和转发头。Go 标准库 `httputil.ReverseProxy` 提供 `Rewrite`、`SetURL` 和 `SetXForwarded` 等入口；**使用它们不等于自动信任原客户端传来的头**。`Forwarded`（标准化格式）或常见 `X-Forwarded-For` 可记录逐跳来源线索，但客户端可自己构造同名头；后端只能在**明确受信代理链、入口清洗和逐跳保护**下解释。IP 线索也不能代替登录身份、会话授权或 R9 的状态。[Go ReverseProxy 文档](https://pkg.go.dev/net/http/httputil) · [RFC 7239：Forwarded 安全考虑](https://www.rfc-editor.org/rfc/rfc7239.html)

纸上反例：`u-b` 自带 `X-Forwarded-For: 127.0.0.1`，若应用看到“像本机”就放行 `doc-private`，是信任边界错位。P 应按配置处理来自外部的头，后端按可信链验证；即便真实源 IP 确认，也仍须用应用身份判断 `u-b` 对 `doc-private` 或 `c-a` 的权限。[09.07 授权](../../../src/docs/platform_engineering/curriculum/09_backend_security/07_authentication_authorization.md)

路径改写也会影响合同：把 `/v1/send` 错转成 `/v2/send`，或把 body/编码在中间改变，会让状态码与上游行为不再可比。纸上验收要核**外部 URL → 内部目标 → Host/身份/请求 ID → 响应来源**，拒绝从代理日志的一行 `200` 猜测消息真正到达 B。[13.08 兼容迁移](../../../src/docs/platform_engineering/curriculum/13_architecture/08_migration_compatibility.md)

## 三、轮询、健康与粘性都救不了 S2 进程内存历史

假设 P 先把 `m-1` 发到 N1，N1 返回 `200 accepted_in_memory`；随后 P 把 A 的历史查询分到 N2。N2 的本进程内存并不会自动拥有 N1 的 `m-1`。**轮询**是后端选择方法，不是复制或持久化机制；**粘性会话**若让 A 暂时回 N1，N1 一重启/失效仍可能丢这份内存状态。未来 S3 共享/持久数据若获批且真实实现，可另行改变数据边界，但目前只是提议。[09.02 当前与 S3](../../../src/docs/platform_engineering/curriculum/09_backend_security/02_http_api_contract.md) · [08.03 复制与一致性](../../../src/docs/platform_engineering/curriculum/08_distributed/03_replication_goals_costs.md)

负载策略可能按轮询、连接数、权重或健康状态选择，适用性受长连接数、请求成本和热会话分布影响。两条 WebSocket 长连接不必代表相同工作量；某实例“连接数少”也不证明它的队列、CPU 或下游 DB 健康。先定义要均衡的**资源与失败域**，再做实验；本章没有任何实际调度效果数据。[11.07 压测与容量](../../../src/docs/platform_engineering/curriculum/11_reliability/07_load_testing_capacity.md)

## 四、健康探测回答“可否接流量”，不证明某消息成功

**健康探测**可问某实例端口是否可连、HTTP 路径能否回预期码、依赖是否具备接请求的条件。Envoy 官方资料区分多种主动探测与状态变化条件，说明“健康”本来就取决于探测定义。TCP 端口开着，可能仍无法核成员授权或写入状态；HTTP `/ready` 回 200，也不证明 B 收到 `m-1`。反过来，下游某项服务坏了，实例可能仍能完成别的只读任务；探测范围要与路由的任务类型相符。[Envoy：Health checking](https://www.envoyproxy.io/docs/envoy/latest/intro/arch_overview/upstream/health_checking)

| 探测/观察 | 最多支持的结论 | 不可推断 |
|---|---|---|
| TCP 可连接 | 该端口此时可完成握手 | 业务处理与权限正确 |
| HTTP ready 回预期码 | 该路径自报能接某类请求 | 当前所有 IM 请求成功 |
| P 选 N1 并收到 200 | N1 的本进程按 S2 受理 | N2 也有数据、B 设备收到 |
| P 收到 504 | 上游未及时给 P 响应 | N1 必然没受理 |

探测频率、失败/恢复阈值与摘除时机影响误判和抖动；别把探测请求当用户动作运行，也别让“深度健康”造成实际消息写入。发布/过载时，健康探测与用户结果须分开记录。[11.08 SLO 与告警](../../../src/docs/platform_engineering/curriculum/11_reliability/08_slo_alerting.md)

## 五、WebSocket 经过代理：一次握手后是长寿命双向通道

在 HTTP/1.1 WebSocket 路径，客户端先请求升级，代理须正确处理升级协商与之后的双向字节传输；成功后连接可持续很久，P 的下游和上游各自占资源。代理若按普通短 HTTP 请求的空闲超时关闭上游，客户端看见断线，不意味着用户登出或业务消息被撤销。NGINX 官方说明 WebSocket 代理需要处理相应升级头与上游读超时；具体配置随所选代理和协议版本而变，本章只教观察边界，不复制生产配置。[NGINX：WebSocket proxying](https://nginx.org/en/docs/http/websocket.html) · [04.03 升级握手](../../../src/docs/platform_engineering/curriculum/04_networks/03_http_websocket_basics.md)

心跳可帮助发现某一段连接在特定时间窗口没有响应，却不能单凭 P 的连接存活推 B 当前在线/已读。若 N1 重启，P 是否把旧 WebSocket 自动“迁移”到 N2，要看协议和应用的重连/恢复设计，不能因 N2 健康就凭空恢复 N1 内存中的会话状态。[04.05 心跳与重连](../../../src/docs/platform_engineering/curriculum/04_networks/05_tcp_connection_lifecycle.md)

长连接还要限制连接数、空闲时间、每连接内存和慢消费者积压；代理前后流控/缓冲可能让“写入 P 成功”与“N1 已处理”出现较长间隔。04.06 的接收窗口/拥塞区分仍适用，应用确认点照旧独立。[04.06 流控与拥塞](../../../src/docs/platform_engineering/curriculum/04_networks/06_flow_congestion_control.md)

## 六、端到端预算和逐跳超时，重试可能放大未知结果

纸上设用户请求总预算 **1000 ms**：名称/TLS/代理入站等先用 100 ms，上游处理最多计划 700 ms，余 200 ms 给传回和校验。只是**加法预算演练**，不是实测或推荐阈值。若 P 的单次上游超时设 700 ms，却允许两次串行尝试，每次都可能耗满，连同开销就超过总预算；还可能在两台实例各触发一次写动作。代理的“每次尝试超时”与“整个请求超时”必须同时审，且保留取消/排队开销。[Envoy：逐次与总超时](https://www.envoyproxy.io/docs/envoy/latest/configuration/http/http_filters/router_filter) · [11.07 容量预算](../../../src/docs/platform_engineering/curriculum/11_reliability/07_load_testing_capacity.md)

对只读查询，某些已验证幂等路径可以讨论有界重试；对当前 S2 **写消息**，N1 可能已 `accepted_in_memory`，P 却在收到响应前超时并回 504。若 P 自动把同 `message_id` 发 N2，N2 可能另受理一份；若再发 N1，当前同 ID 重复会是 **409**，不能把 409 当本次安全成功证明。没有权威操作结果查询/持久去重前，**504 是结果未知，不是“必未执行”**。[14.08 未知结果与幂等边界](../../../src/docs/platform_engineering/curriculum/14_ai/08_tools_workflows_agents.md) · [RFC 9110：504](https://www.rfc-editor.org/rfc/rfc9110.html)

超时预算要沿 A→P→N1 传播或重新分配，不能每层都认为自己有完整 1000 ms。已有 deadline 到期时继续重试会增加过载和尾时延；后端慢、队列长时先按问题类型限流/拒绝，保持非成员 404、正文 6 B 与当前确认语义。[11.09 过载级联](../../../src/docs/platform_engineering/curriculum/11_reliability/09_overload_cascades.md)

## 七、Go 代理入口与可观测证据应逐跳关联

若学习者日后用 Go 设计代理，`net/http/httputil.ReverseProxy` 可作为了解转发、改写、上游 Transport、响应修改/错误处理的标准库入口；Go `http.Transport` 管理连接复用。它们提供机制，应用仍须定义受信转发头、目标范围、身份/权限、body 限额、重试条件与超时预算。不能因为库叫 ReverseProxy 就把它接进当前 IM 服务并宣布多实例可用。[Go ReverseProxy](https://pkg.go.dev/net/http/httputil) · [Go Transport](https://pkg.go.dev/net/http)

排障/评测卡至少关联**外部请求 ID、P 选的后端、下游/上游连接阶段、TLS/升级结果、逐跳超时与重试次数、响应产生者、后端业务确认点**；私有正文不进普通日志。若客户端看到 502/503/504，先看产生响应的层：RFC 9110 分别描述代理收到无效上游响应、服务暂不可用、代理等上游超时的含义；它们不自带 IM 写动作“未执行”证明。[RFC 9110：5xx](https://www.rfc-editor.org/rfc/rfc9110.html) · [11.03 日志指标 Trace](../../../src/docs/platform_engineering/curriculum/11_reliability/03_logs_metrics_traces.md)

| 纸上症状 | 最早应查 | 可能的业务状态 |
|---|---|---|
| N1 ready，但 q-01 错答 | 资料/状态/应用版本 | 健康探测通过不保证答案正确 |
| P→N1 504 | 上游时间线/原操作 ID | 可能未开始，也可能已受理但响应丢失 |
| WebSocket 约定空闲期后断开 | 代理/上游 idle timeout/心跳 | 不等于用户主动退出 |
| A 下一次落 N2 查不到 m-1 | S2 内存作用域与分流 | N1 的 200 仍只到 N1 进程 |

## 八、22 道分层练习：一条请求经过两段连接

1–8 认代理与边界，9–16 推演多实例/超时，17–22 做重试与证据决策。答案只针对虚构 A/P/N1/N2 图。

### 基础 1–8：逐跳与身份

<details><summary>1. 反向代理接请求后主要做什么？</summary>

按配置选择/转发到上游，再把响应带回；不自动完成业务存储或授权。</details>

<details><summary>2. A→P 与 P→N1 必是同一条 TCP/TLS 连接吗？</summary>

不是；它们是逐跳连接，TLS 终止与再加密需分别定义。</details>

<details><summary>3. P 的 TCP ACK 可证明 B 设备收到吗？</summary>

不能；传输 ACK 与 IM 应用/设备确认不同。</details>

<details><summary>4. 客户端自带 `X-Forwarded-For` 就成可信源 IP 吗？</summary>

不能；代理链、入口清洗和逐跳保护须明确，IP 也不等于用户授权。</details>

<details><summary>5. TLS 到 P 成功，就可跳过会话成员检查吗？</summary>

不能；服务端连接身份与应用对象权限不同。</details>

<details><summary>6. HTTP ready 200 能证明当前所有消息已送达吗？</summary>

不能；只反映该探测路径/条件，范围取决于探测定义。</details>

<details><summary>7. 轮询到 N1/N2 是数据复制机制吗？</summary>

不是；它只选后端，不把进程内存同步或持久化。</details>

<details><summary>8. WebSocket 经过代理升级后属于短的一次性 HTTP 响应吗？</summary>

不是；它继续作为长寿命双向通道，占逐跳连接资源。</details>

### 推演 9–16：进程内存与预算

<details><summary>9. m-1 在 N1 返回 200，N2 必有 m-1 吗？</summary>

不必；当前 S2 200 仅说明 N1 本进程内存受理。</details>

<details><summary>10. 把 A 粘到 N1 能保证 N1 重启后 m-1 仍在吗？</summary>

不能；粘性不等于持久化。</details>

<details><summary>11. 1000 ms 纸上预算，先用 100、上游计划 700，余多少？</summary>

200 ms，仍要覆盖回传/核验等；数值非实测阈值。</details>

<details><summary>12. 两次各最多 700 ms 的上游尝试能无条件放进 1000 ms 吗？</summary>

不能；还含前后开销，且写操作重试可能重复副作用。</details>

<details><summary>13. P 返回 504 可断言 N1 没有受理吗？</summary>

不能；上游响应未及时到 P，服务端执行状态可能未知。</details>

<details><summary>14. 对同 ID 向 N1 再试得 409，就证明本次重试成功吗？</summary>

不能；当前 409 是重复冲突，需查原操作权威结果。</details>

<details><summary>15. N1 已受理但 P 改投 N2，会自然保持唯一内存记录吗？</summary>

不会；两进程内存互不自动同步，可能发生分裂/重复受理。</details>

<details><summary>16. WebSocket 空闲超时断开能证明用户主动退出吗？</summary>

不能；需查代理/上游 timeout、心跳和客户端重连。</details>

### 决策 17–22：重试、错误与验收

<details><summary>17. 代理把外部 `/v1` 错路由到未来 `/v2`，可把两者 200 等同吗？</summary>

不能；当前与提议合同和确认点不同，先修路径。</details>

<details><summary>18. 502、503、504 在 RFC 中含义相同吗？</summary>

不同；分别与代理无效上游响应、暂不可服务、代理等上游超时有关。</details>

<details><summary>19. 健康探测能用真实发消息写动作而不考虑副作用吗？</summary>

不能；探测应限定安全范围，不能制造用户业务消息。</details>

<details><summary>20. 代理日志要记什么以连接客户端和后端证据？</summary>

请求 ID、路由到的后端、逐跳阶段/超时/重试、响应来源及业务确认点，不记无保护私有正文。</details>

<details><summary>21. 转发源 IP 头可直接决定 `u-b` 能读 doc-private 吗？</summary>

不能；actor 身份与对象授权由应用决定。</details>

<details><summary>22. 本章代理纸图能声称教学系统已多实例持久化吗？</summary>

不能；没有部署/运行，且 S2 仅进程内存，S3 DB 仍提议。</details>

## 本章完成标准与后续路径

能画 A→P→N1/N2 的两段连接与 TLS/头部信任边界，解释健康探测和粘性为什么不改变 S2 内存语义，并在 1000 ms 纸上预算里识别代理 504 后的未知结果与同 ID 409 重试风险，才算完成本章。下一章[04.10 HTTP 版本与 RPC](../../../src/docs/platform_engineering/curriculum/04_networks/10_http_versions_rpc.md)将比较 HTTP 版本、流控和内部 RPC 的错误分层。[第四卷路线](../../../src/docs/platform_engineering/curriculum/04_networks/README.md)
