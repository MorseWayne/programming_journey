---
title: 04.12 网络排障与协议演进：用阶段证据审一次断线
icon: /assets/icons/article.svg
order: 13
date: 2026-09-25
---

[返回第四卷](./README.md) · [Go 网络 I/O：04.08](./08_go_network_io.md) · [代理：04.09](./09_proxies_load_balancing.md) · [网络/链路：04.11](./11_network_link_layers.md)

# 04.12 网络排障与协议演进：用阶段证据审一次断线

> 本章是第四卷的**静态排障演练**：时间线、报文和日志均为合成纸上数据；没有抓取真实流量、运行 Go/IM/代理、处理生产事故或发布协议。先会 04.03 的 HTTP/WebSocket、04.04–04.06 的 TCP/流控、04.07 的 TLS、04.08–04.11 的 I/O/代理/版本/移动路径。当前 S2 `/v1` 正文非空且最多 **6 UTF-8 B**、原始 HTTP 请求正文最多 **4096 B**、同 ID 重复 **409**（同正文也重复）、非成员隐藏 **404**、`200 accepted_in_memory` 只到本进程内存受理；未来 S3 `/v2` 存库提案仍为 6 B，R9 6→9 B 待审。[09.02 当前合同](../09_backend_security/02_http_api_contract.md)

## 一、先固定用户症状与确认点，再收集包

虚构事故：A 向会话 `c-a` 发送正文 `公告`（两个汉字共 **6 UTF-8 B**）、消息 ID `m-9`。客户端经过代理 P，到后端 N1；A 最后看到代理返回 **504**，随后同 ID 再试看到 **409**。B 恰好切换了网络并离线 25h，教学 broker 仅保留 24h。用户问“B 到底收到了吗？”本章不能从这几条现象直接答“是”或“否”：P 504 只表示它没按时等到上游响应；409 只表示同 ID 冲突；即使 N1 曾返回 S2 200，也只到 N1 进程内存；24h broker 不保证 25h 离线完整补齐。[04.09 504/进程内存](./09_proxies_load_balancing.md) · [14.09 固定 `q-06` 标签](../14_ai/09_evaluation_data_engineering.md)

先写纸上**待核命题**，而非先找一个“网络慢”标签：A 的请求是否到 P？P 是否把同一 ID 发给 N1？N1 是否实际完成 S2 内存受理？A 为何没有收到它的响应？第二次 409 由哪一实例产生？B 的连接/历史/授权与 m-9 处于什么状态？这些问题各有证据来源，不能靠一张客户端抓包回答所有。[11.04 诊断方法](../11_reliability/04_diagnostic_method.md)

## 二、抓包只说明采集点看见了什么

学习者读一份**获许可的合成抓包**时，先看采集点、时间戳、源/目的地址端口、协议与包长度，再按同一连接关联 SYN/ACK、重传、关闭/RST 等。Wireshark 的包列表展示编号、时间、源/目的、协议、长度和摘要；过滤/Follow Stream 能帮助缩小范围，但显示过滤后编号不重排，时间戳精度与采集环境也有限。[Wireshark：Packet List](https://www.wireshark.org/docs/wsug_html_chunked/ChUsePacketListPaneSection.html) · [User's Guide](https://www.wireshark.org/docs/wsug_html/)

若 A→P 使用 TLS，普通网络抓包通常**看不到明文 JSON、`message_id` 或用户正文**；即使能看到 TCP 字节与 TLS 记录，也不能单凭它声称读到了应用字段。代理 P 在 TLS 终止后、N1 应用入口的有权日志可提供其它证据；若确需解密抓包，密钥/内容的获取、保存与访问必须另有许可。本章只用合成元数据，不接触真实私聊。[Wireshark：TLS/HTTP2 解密前提](https://www.wireshark.org/docs/wsug_html_chunked/ChStatHTTP2.html) · [04.07 TLS 边界](./07_tls_identity.md)

**TCP ACK**说明某段字节到达对端传输层，**不是**后端已解析完整请求；`Write` 返回、HTTP 状态、S2 200、设备 ACK 各是后续不同确认点。客户端抓包也不能证明 P→N1 的另一条连接发生什么，必须把逐跳请求 ID/时间线关联起来。[04.04 TCP 确认](./04_reliable_transport.md) · [04.08 写入与业务确认](./08_go_network_io.md)

## 三、阶段计时：一秒不等于单一慢点

纸上端到端 1000 ms 时间线如下；**所有数字都是演练假设，不是实测或超时建议**：

| 客户端时段 | 纸上观察 | 当时最多能说明 |
|---|---|---|
| `0–20 ms` | DNS 得 P 地址 | 名称解析完成，不说明 P/后端健康 |
| `20–50 ms` | 到 P 的 TCP 连接建立 | 可连 P，不说明 TLS/IM 成功 |
| `50–90 ms` | A→P TLS 校验完成 | 验证 P 的服务身份，不等于用户授权 |
| `90–990 ms` | P 等 N1，上游响应未及时到 | N1 可能没执行，也可能受理后响应丢失 |
| `990–1000 ms` | P 向 A 返回 504 | A 得网关超时，不是“写动作已撤销” |

`20+30+40+900+10=1000 ms`，只是一张分阶段卡。Go `net/http/httptrace.ClientTrace` 可为**出站 HTTP 请求**观察 DNS、建连、TLS 握手、首响应字节等钩子；连接复用或代理会使某些阶段缺失/发生在不同跳，不能硬把客户端 trace 的 `GotConn` 当 N1 的建连时间。P→N1 还要有代理/后端的关联 trace 或日志。[Go `httptrace`](https://pkg.go.dev/net/http/httptrace) · [Go Diagnostics](https://go.dev/doc/diagnostics)

若 504 后客户端同 ID 再试，需把第二次尝试单独标 `attempt=2`、目标实例与时间；不能把两次耗时都记成一次请求，也不能凭 409 逆推第一次一定以相同正文成功。时钟不同步的机器上比较绝对时间戳要小心，用同一请求 ID 和阶段顺序/单机时长核证。[04.09 超时预算](./09_proxies_load_balancing.md)

## 四、失败分类：先找第一坏边界，再解释用户结果

用“**最早哪一层已违背已知前提**”排查，比统一写网络故障更有效：DNS 失败则没有后续 TCP；TCP 建连失败则未到 TLS；证书名称错误是信任边界；WebSocket 升级失败/关闭与 HTTP 请求业务错误分开；代理 502/503/504 的 RFC 含义也不同。到了 N1，才审 S2 404/409/200 的业务合同。[04.02 名称/路由](./02_addresses_names_routes.md) · [RFC 9110：HTTP 5xx](https://www.rfc-editor.org/rfc/rfc9110.html)

| 纸上表象 | 首查证据/层 | 不能直接推出 |
|---|---|---|
| DNS 无结果 | 名称/缓存/解析器 | N1 拒绝了消息 |
| TCP SYN 后未连上 | 地址/路由/NAT/端口/防护 | TLS 名称或正文有错 |
| TLS 校验失败 | 证书/服务名称/信任链 | 会话成员授权失败 |
| WebSocket 非正常断 | 升级/关闭帧、代理 idle、切网 | 用户主动退出或消息已撤回 |
| P 返回 504 | P→上游时间线与原操作 ID | N1 必未受理 |
| N1 返回 409 | 当前 ID 冲突与原请求来源 | 这次重试幂等成功 |
| N1 返回 200 | S2 本进程内存受理 | DB 留存、B 已读 |

WebSocket 的**正常关闭握手**可含 Close 帧和状态；底层 TCP 突然丢失时，本端可能观察到异常关闭而没有收到真实 Close 帧。RFC 6455 的本地观察值 1006 不应被误写为“对端发来了 1006 帧”。这又是一个**本端观察不等于对端动作**的例子。[RFC 6455：Closing Handshake/1006](https://www.rfc-editor.org/rfc/rfc6455.html)

## 五、抓包、日志、Trace 各能证明哪段

**抓包**看采集点的包/连接时间线；**应用日志**记 N1 接到哪个请求、做了哪些授权/ID/状态判断；**分布式 Trace**可把 A/P/N1 的一次请求与尝试关联，呈现分阶段延迟；**指标**看一段时间内各错误桶/尾时延。它们互补，也可能因采样、时钟、丢日志或隐私限制而不完整。不能用“没查到 N1 日志”直接证明 N1 没执行，也不能用“看到 TCP ACK”直接证明应用已受理。[Go Diagnostics：profiling/tracing](https://go.dev/doc/diagnostics) · [11.03 日志指标 Trace](../11_reliability/03_logs_metrics_traces.md)

一条可审记录至少含 `request_id`、`attempt_id`、`message_id` 的**非敏感标识/必要摘要**、actor 的授权决策结果、外部/上游协议与实例、阶段时长、HTTP/gRPC/WebSocket 错误、N1 的业务确认点及最终用户可见结果。不要把私聊正文、凭据或 TLS 密钥写入普通诊断日志；用合成/脱敏材料讲课程。[09.07 授权与最小披露](../09_backend_security/07_authentication_authorization.md)

即使完整 trace 说明 N1 返回了 `200 accepted_in_memory`，它仍**没有**自动观测 DB/设备 ACK。若 B 离线 25h，而 broker 纸上只保留 24h，回溯还需要真实 DB 保留和有权查询；现行 S2 不提供跨重启权威历史。[14.09 q-06](../14_ai/09_evaluation_data_engineering.md)

## 六、协议演进的兼容矩阵与限额不能藏在“升级”里

一次协议候选变更要列**旧端/新端、A→P 与 P→N1 的 HTTP 版本、WebSocket 握手/关闭、TLS 名称、正文/原始请求限额、错误映射、代理/后端超时与重试、回退条件**。例如外部 HTTP/2 与内部 HTTP/1.1 可以并存；把外部 `/v1` 错路由到未来 `/v2` 是**应用合同错位**，不是 HTTP/2 自动带来的能力。R9 9 B 尚待审，不因更大 MTU 或新版网关就可发。[04.10 HTTP 与 RPC 版本](./10_http_versions_rpc.md) · [13.08 兼容迁移](../13_architecture/08_migration_compatibility.md)

| 评审轴 | 旧/候选版本应明确的问题 |
|---|---|
| 请求/正文 | 原始 HTTP body ≤4096 B；解码正文非空且 ≤6 UTF-8 B；未知格式怎样拒绝 |
| 身份/权限 | 非成员 404 隐藏；代理转发头不能当 actor 授权 |
| 重复/重试 | 同 ID 409；超时/504 后是否有权威结果查询，不能盲重发 |
| 确认点 | 200 只到本进程；未来存库另有版本/证据 |
| 长连接 | 旧端心跳、代理 idle、移动重连与关闭码 |
| 资源 | 最大头/体、连接/stream 数、队列、deadline、慢消费者 |

限额是资源和业务的共同门：太大请求要在对应层明确拒绝，不能无限缓存；过载时可用有界排队/限流与可解释失败，但不可以静默截掉 `公告` 的 UTF-8 字节、放宽私有权限或把 409 改成 200。实际阈值除当前已固定合同外都需负载/兼容证据，本章不编造生产配置。[11.09 过载级联](../11_reliability/09_overload_cascades.md)

## 七、纸上事件响应：先遏制重试，再留证、修第一坏边界

若 A 的 504/409 让客户端反复自动发送 `m-9`，先**停止盲目重试/放大**，保留每次 attempt 与 P/N1/N2 的证据；核现有能力能否查询原操作真实结果，若没有就明确标 `result_unknown`。同时确认 `u-a` 对 `c-a` 的授权、正文 `公告` 的 6 B、P 是否曾把请求改路由/重复送 N2。不能为“让用户安心”虚构 B 已收到。[14.08 未知结果停止门](../14_ai/08_tools_workflows_agents.md) · [Google SRE：Managing Incidents](https://sre.google/sre-book/managing-incidents/)

若第一坏边界是 P 的上游超时设置/错误重试，修代理预算并用合成故障卡复核；若是 N1 处理慢，继续查它的队列/依赖；若是 B 换网后没补齐，查历史权威源、游标、成员权限和设备确认。改协议或回滚要保留旧端兼容和 R9 待审状态。事件复盘写触发、影响、遏制、第一坏边界、检测延迟与下一次的可验证停止门；没有真实事故就只交纸上演练记录。[11.10 事件响应](../11_reliability/10_incident_response.md) · [11.11 复盘](../11_reliability/11_postmortem_improvement.md)

## 八、22 道分层练习：一张断线报告够不够证据

1–8 认采集点/阶段，9–16 推演 504/409/200 与关闭，17–22 审兼容/限额和事件决策。答案均基于虚构时间线。

### 基础 1–8：抓包和阶段

<details><summary>1. A 的客户端抓包能直接看见 P→N1 连接吗？</summary>

不能；采集点只见自身链路，需代理/后端证据关联。</details>

<details><summary>2. TLS 下普通抓包能直接读 `message_id=m-9` 吗？</summary>

通常不能；未授权解密前只能见外层连接/记录等，不应伪称看到正文。</details>

<details><summary>3. 纸上 DNS、建连、TLS 分别耗多少？</summary>

20 ms、30 ms、40 ms；全是虚构演练数。</details>

<details><summary>4. P 等上游 90–990 ms 是多久？</summary>

900 ms；不证明 N1 没执行。</details>

<details><summary>5. 五段相加的总时长是多少？</summary>

`20+30+40+900+10=1000 ms`，纸上预算。</details>

<details><summary>6. Go `httptrace` 客户端 `GotConn` 就是 N1 建连吗？</summary>

不是；可能是复用 A→P 连接，需看每一跳的追踪。</details>

<details><summary>7. 抓包里有 TCP ACK 就表示 B 已收到消息吗？</summary>

不表示；ACK 在某段传输层，不是 IM 设备确认。</details>

<details><summary>8. `公告` 正文是多少 UTF-8 B？</summary>

两个汉字各 3 B，共 6 B，正好当前正文上限。</details>

### 推演 9–16：错误和结果未知

<details><summary>9. P 返回 504 最多说明什么？</summary>

P 等上游没有及时收到响应；原写操作可能已发生，也可能未发生。</details>

<details><summary>10. 第二次同 ID 收到 409 可当幂等成功吗？</summary>

不能；它是冲突，仍需原操作权威结果。</details>

<details><summary>11. N1 返回 S2 200 能证明什么？</summary>

只到 N1 本进程内存受理，非 DB/设备 ACK。</details>

<details><summary>12. TCP 断开且没见 WebSocket Close 帧，能说对端发了 1006 帧吗？</summary>

不能；1006 可是本端异常关闭观察值，不是发送的 Close 帧。</details>

<details><summary>13. 502、503、504 可统一记“网络断”吗？</summary>

不应；分别审无效上游响应、暂不可用、代理等上游超时及来源。</details>

<details><summary>14. N1 没日志就证明 N1 没受理吗？</summary>

不能；还需核日志采集、采样、实例与请求 ID，缺日志不是执行证明。</details>

<details><summary>15. B 离线 25h，只靠 24h broker 能保证补齐吗？</summary>

不能；需真正保留的 DB 和有权历史查询等额外证据。</details>

<details><summary>16. 504 后连续自动重试可能造成什么？</summary>

放大负载、跨实例重复副作用；当前 409 也不能说明完成。</details>

### 决策 17–22：兼容、限额与复盘

<details><summary>17. 外部 h2 就意味着应用 `/v2` 已上线吗？</summary>

不意味着；HTTP 版本与应用合同版本独立。</details>

<details><summary>18. 代理升级后 R9 9 B 可自动发了吗？</summary>

不能；R9 仍待审，当前正文 6 UTF-8 B。</details>

<details><summary>19. 非成员可因诊断方便改回 403 并泄会话存在吗？</summary>

不可；当前非成员隐藏 404 是业务/安全合同。</details>

<details><summary>20. 真实抓包与私聊正文可随意放课程仓库吗？</summary>

不可；需授权和最小化，本章只用合成元数据。</details>

<details><summary>21. 查明第一坏边界前应先做什么止损？</summary>

停止盲重试/放大，保留请求与尝试证据，按未知结果谨慎对外。</details>

<details><summary>22. 一份排障/协议演进评审至少要列哪些证据？</summary>

逐跳阶段/实例/版本、抓包可见范围、HTTP/RPC/IM 状态、权限/限额、兼容矩阵与回退/复盘。</details>

## 本章完成标准与后续路径

能按合成包/日志/trace 列出 A→P→N1 的阶段证据，说明 504、409、S2 200 与 B 设备 ACK 的不同含义；能给出旧端/新协议兼容矩阵、请求限额和 504 后停止盲重试的事件卡，才算完成第四卷。至此 14 卷 **168 个规划单元均有独立正文**；真实运行、个人掌握与生产交付仍需各自的证据，按[编写与能力验收](../assessment.md)和[总学习路线](../learning_path.md)复盘。
