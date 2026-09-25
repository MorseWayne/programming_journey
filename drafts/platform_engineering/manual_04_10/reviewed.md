# 04.10 HTTP 版本与 RPC：流控、模式和错误分层

> 本章是**静态协议课程**，没有运行 HTTP/2、HTTP/3、gRPC、Go 服务或 IM 链路。先读 04.03 的 HTTP/WebSocket 基础、04.04–04.06 的 TCP/流控与 04.09 的逐跳代理。虚构对照路径是“客户端 A 发消息 → 公共 HTTP 接口 → 可选内部 RPC → 后端”，**不是** OpenIM 已采用的实现。当前 S2 `/v1` 正文非空且最多 **6 UTF-8 B**、原始 HTTP 请求正文最多 **4096 B**、同消息 ID 重复 **409**（同内容也重复）、非成员隐藏 **404**、`200 accepted_in_memory` 只到本进程；未来 S3 `/v2` 存库提案仍为 6 B，R9 6→9 B 待审。换 HTTP 版本或 RPC 框架不会改变这些业务合同。[09.02 当前合同](../../../src/docs/platform_engineering/curriculum/09_backend_security/02_http_api_contract.md)

## 一、先把三层接口写在一张纸上

**HTTP 版本**规定一条连接上怎样表示/传输请求与响应；**RPC**按“调用方法及类型化请求/响应”组织服务间通信；**IM 业务合同**决定身份、消息正文、重复 ID 与确认语义。A 的外部请求可以使用 HTTP/1.1 或 HTTP/2 等，内部服务可以选择普通 HTTP 或 gRPC；这些是不同设计轴。当前课程并没有把现行 `/v1` 改成 RPC，也没有规定客户端必须升级 HTTP/3。[RFC 9113：HTTP/2](https://www.rfc-editor.org/rfc/rfc9113.html) · [gRPC 核心概念](https://grpc.io/docs/what-is-grpc/core-concepts/)

```text
A 客户端 ── 外部 HTTP /v1 或 WebSocket ──> 网关/应用
                                               │ 纸上可选的内部调用
                                               └── RPC/HTTP ──> 处理组件
业务结果：200 accepted_in_memory 仍只指当前 S2 进程内受理
```

`/v1` 是**应用资源/合同版本**，不是 HTTP/1.1 的缩写；`/v2` S3 提案也不是 HTTP/2。初学者若把“HTTP/2 已启用”误读为“业务 `/v2` 已上线”，就会把 R9 和存库状态一起写错。[04.03 HTTP 请求与版本](../../../src/docs/platform_engineering/curriculum/04_networks/03_http_websocket_basics.md)

## 二、HTTP/1.1 与 HTTP/2：多路复用不等于业务并发安全

HTTP/1.1 可复用 TCP 连接，但同一连接上的管线化请求仍有应用层**队头阻塞**难题，客户端常用多个连接获得并发。HTTP/2 在一条连接内把多个请求/响应映射到不同**stream**，帧可交错，头字段有压缩机制。这样减少了某些“必须等前一条响应完才轮到下一条”的限制，但仍共享同一 TCP：底层丢包导致 TCP 字节交付受阻时，多个 HTTP/2 stream 也可能受影响。[RFC 9113：引言与多路复用](https://www.rfc-editor.org/rfc/rfc9113.html)

HTTP/2 的**stream 流控**与**connection 流控**共同约束可发送的数据量，接收方按窗口更新说明还能收多少；这是逐跳传输能力，不是 IM 成员权限、消息长度或设备已读。一个慢读取 stream 与连接级资源限制仍可能影响其它请求，应用还要给并发数/队列/内存设边界。[RFC 9113：Flow Control](https://www.rfc-editor.org/rfc/rfc9113.html) · [04.06 两类流控](../../../src/docs/platform_engineering/curriculum/04_networks/06_flow_congestion_control.md)

Go `net/http` 支持 HTTP/2，但是否协商到它与 HTTPS、Transport/Server 配置有关；**不能因为代码用了 `http.Client` 就断言这次连接一定是 h2**。诊断时记录实际协议版本、逐跳代理和 stream/连接指标；课程没有运行任何协商。[Go `net/http` HTTP/2 文档](https://pkg.go.dev/net/http)

## 三、HTTP/3：QUIC 改变传输，不替应用解决确认与成本

HTTP/3 把 HTTP 语义映射到 **QUIC**，不再在 HTTP/2 那样的一条 TCP 字节流上复用。QUIC 的多个 stream 各有可靠有序交付；一条 stream 的数据包丢失一般不迫使另一条 stream 等同一条 TCP 字节序列补齐，因此可减轻**传输层跨 stream 队头阻塞**。但它仍受连接/stream 流控、拥塞、丢包、握手、实现与网络路径影响，不能承诺“HTTP/3 总会更快”或“丢包不影响任何请求”。[RFC 9114：HTTP/3 与 QUIC](https://www.rfc-editor.org/rfc/rfc9114.html) · [RFC 9000：QUIC](https://www.rfc-editor.org/rfc/rfc9000.html)

| 协议层对照 | 并发承载 | 仍须另外处理 |
|---|---|---|
| HTTP/1.1 | 可复用/多连接；管线化有队头限制 | 应用排队、超时、授权 |
| HTTP/2 | 同 TCP 连接上多个 HTTP stream | TCP 丢包、流控、业务合同 |
| HTTP/3 | QUIC 上多个独立可靠 stream | 拥塞/流控/兼容与业务结果 |

三者都不能把 `200 accepted_in_memory` 变成 DB 持久或 B 设备 ACK。客户端、代理、服务端可支持的版本也可能不同，代理逐跳终止和重新发起连接会让外部 h3 与内部 h2/h1 并存；要按每跳观察，不推断全链同版本。[04.09 逐跳代理](../../../src/docs/platform_engineering/curriculum/04_networks/09_proxies_load_balancing.md)

## 四、内部 RPC：方法与模式有助分工，权限仍在应用

gRPC 用**服务/方法**定义可调用操作，请求/响应有结构化模式；常见 gRPC 传输基于 HTTP/2，也支持一问一答或客户端/服务端/双向流式 RPC。Protocol Buffers 常用作服务/消息定义，但不能把“用了 protobuf”直接等同于 gRPC、HTTP/2 或安全授权。本章的纸上内部接口可有 `GetCurrentRule` 只读方法与 `SubmitMessage` 写方法；它们只是**教学提案**，不是当前 S2 已有 RPC。[gRPC 核心概念](https://grpc.io/docs/what-is-grpc/core-concepts/) · [gRPC over HTTP/2 协议](https://github.com/grpc/grpc/blob/master/doc/PROTOCOL-HTTP2.md)

```text
GetCurrentRule(actor, question) → 现行资料和来源版本
SubmitMessage(actor, conversation_id, message_id, body) → 业务受理状态
```

接口定义里即使写了 `body string`，还要在应用核 **UTF-8 字节数 ≤6、非空、成员权限、重复 ID 409**。gRPC metadata 可携带调用相关信息，但客户端自称的 actor/转发头不构成授权；网关和内部服务各自需验证信任与对象范围。双向 streaming 很适合表达某些长期数据流，但并非自动替换当前 WebSocket 客户端协议，流式 `Write` 被框架接受也不等于对端应用已提交。[gRPC metadata](https://grpc.io/docs/guides/metadata/) · [gRPC flow control](https://grpc.io/docs/guides/flow-control/)

模式演进要保留字段身份：protobuf 二进制格式的**field number** 一旦使用不应重用，删字段要保留编号等兼容措施；旧端/新端、网关 JSON 映射和错误码转换都需验证。业务的 R9 6→9 B 待审不会因 `.proto` 新增一个字段而自动批准。[Protocol Buffers：proto3 更新规则](https://protobuf.dev/programming-guides/proto3/) · [13.08 迁移兼容](../../../src/docs/platform_engineering/curriculum/13_architecture/08_migration_compatibility.md)

## 五、HTTP 状态、gRPC 状态与 IM 结果是三张不同卡

gRPC over HTTP/2 的正常协议响应通常带 HTTP `:status 200`，最终 RPC 状态由 `grpc-status` 等尾部元数据表达；客户端只看 HTTP 200 可能漏掉 RPC 失败。即使 `grpc-status=0`（OK），也只表示这次 RPC 按其方法合同结束，**不自动证明业务正文合法、S3 已存库或 B 已收到**。如果 RPC 方法自身只负责返回 `accepted_in_memory`，就只能报告这一层。[gRPC HTTP/2 协议：状态与 trailers](https://github.com/grpc/grpc/blob/master/doc/PROTOCOL-HTTP2.md) · [gRPC status codes](https://grpc.io/docs/guides/status-codes/)

| 观察 | 只能按哪层解释 | 不能偷换成 |
|---|---|---|
| HTTP 200 | HTTP 交换获得正常协议响应 | gRPC 与 IM 必定成功 |
| `grpc-status=0`（OK） | 该 RPC 按其定义完成 | B 设备 ACK 或 S3 存库 |
| 客户端状态 `DEADLINE_EXCEEDED` | 客户端等不到该 RPC 的按时完成 | 服务端一定没执行写动作 |
| S2 `200 accepted_in_memory` | 当前后端本进程内存受理 | 跨重启历史或已读 |

错误映射需**显式**约定：外部非成员隐藏 404 不能因为内部 RPC 返回某个“PermissionDenied”就泄露会话存在；外部重复 ID 仍为 409，不能把一次 gRPC 重试的错误都映成 200。HTTP/2 stream error、gRPC status 和应用字段是不同层，记录时保留原始错误与发生节点。[09.02 S2 404/409](../../../src/docs/platform_engineering/curriculum/09_backend_security/02_http_api_contract.md)

## 六、流控、deadline 与重试：取消不回滚副作用

gRPC 客户端可设 deadline；超时后客户端可能得到 `DEADLINE_EXCEEDED`，服务端也可能收到取消信号，但**已经发生的外部/应用改动不自动回滚**。客户端和服务端甚至可能分别判断“我已发送完”和“我等超时了”。这与 04.09 的代理 504 一样，是**结果未知**需要核证，而非写请求安全重试的凭据。[gRPC：RPC lifecycle/deadlines/cancellation](https://grpc.io/docs/what-is-grpc/core-concepts/) · [04.09 504 纸上事故](../../../src/docs/platform_engineering/curriculum/04_networks/09_proxies_load_balancing.md)

流式 RPC 的流控让快生产者受慢消费者限制；写入 API 返回可能只表示交给 gRPC 框架，尚未上网，更不是被目标应用持久化。HTTP/2 还有限制 stream 与整条连接的数据窗口；缓冲、deadline、并发都要按阶段观测。若把 N 条消息压在一个 stream 中，必须另写每条消息的应用确认与取消处理，不能把最后 `grpc-status=0`（OK） 猜成每台设备都收到。[gRPC：Flow Control](https://grpc.io/docs/guides/flow-control/) · [RFC 9113：窗口](https://www.rfc-editor.org/rfc/rfc9113.html)

当前 S2 同 ID 重复是 **409**，不能靠“RPC 框架有 retry”获得幂等。即使某库能重试连接失败，也要由应用判断哪些只读操作可重试、哪些写操作须先查询权威状态或保留 unknown；加重试次数还会吃掉 04.09 的总时间预算。[gRPC：Retry](https://grpc.io/docs/guides/retry/) · [14.08 操作结果未知](../../../src/docs/platform_engineering/curriculum/14_ai/08_tools_workflows_agents.md)

## 七、选择协议前，列客户端/代理/服务端兼容矩阵

用户端 IM 需求、浏览器可用 API、代理支持版本、内部服务语言/模式、连接数与流量形状先列清，再决定用 HTTP/1.1/2/3、WebSocket 或内部 gRPC。可纸上提出“外部 `/v1` 仍维持现有 HTTP 合同，内部只读查询若确有类型化跨服务需求才评 gRPC”，但这是**设计候选**，不是已部署的架构。协议改动需要旧端兼容、回退、可观察版本和错误转换表。[04.03 WebSocket 入门](../../../src/docs/platform_engineering/curriculum/04_networks/03_http_websocket_basics.md) · [13.08 兼容迁移](../../../src/docs/platform_engineering/curriculum/13_architecture/08_migration_compatibility.md)

| 评审问题 | 需要的证据 |
|---|---|
| HTTP/2/3 真减少用户时延？ | 相同请求/代理/网络条件的分阶段测量 |
| 多路复用会否耗尽窗口/内存？ | stream/connection 窗口、慢消费者与队列观察 |
| RPC 模式升级是否兼容？ | field number/旧端/错误映射与灰度回退 |
| 写消息的重试能否安全？ | 当前 409/进程内受理的权威结果查询方案，不能靠猜 |
| 授权和确认点一致吗？ | actor、会话权限、外部 404/409/200 的端到端对照 |

本章没有 HTTP/3 或 gRPC 实测。若未来部署，先以 09.02 固定合同和 14 卷的六题资料问题作回归，再按 11 卷测用户时延、失败和资源，避免只看协议名或“单连接多路复用”就宣布收益。[11.01 业务测量](../../../src/docs/platform_engineering/curriculum/11_reliability/01_business_measurement.md)

## 八、22 道分层练习：从 stream 到业务确认

1–8 辨协议层，9–16 推演流控/状态，17–22 做兼容与重试决策。答案全为静态纸上判断。

### 基础 1–8：版本与模式

<details><summary>1. URL `/v1` 就是 HTTP/1.1 吗？</summary>

不是；前者是应用路径/合同，后者是传输协议版本。</details>

<details><summary>2. HTTP/2 的一条连接可承载多个什么？</summary>

多个并发 HTTP stream，请求/响应帧可交错。</details>

<details><summary>3. HTTP/2 已消除同一 TCP 的所有丢包等待吗？</summary>

没有；TCP 字节流的传输层队头阻塞仍可能影响多个 stream。</details>

<details><summary>4. HTTP/3 基于什么传输？</summary>

QUIC；不同 stream 可独立可靠有序交付，仍有流控/拥塞。</details>

<details><summary>5. HTTP/3 可保证所有 IM 请求更快吗？</summary>

不能；要按网络/实现/负载实际测量。</details>

<details><summary>6. gRPC 里的服务/方法先解决什么？</summary>

定义可调用操作及请求/响应结构，不自动解决应用授权和业务结果。</details>

<details><summary>7. `.proto` 增字段就等于 R9 的 9 B 已生效吗？</summary>

不等于；业务提案仍待批准，当前上限 6 UTF-8 B。</details>

<details><summary>8. WebSocket 客户端协议与内部 gRPC 能画成同一概念吗？</summary>

不能；它们可在不同段各司其职，不能互相推实现。</details>

### 推演 9–16：流控与状态

<details><summary>9. HTTP/2 的流控只在 stream 级吗？</summary>

不是；还有整条连接级流控，且属逐跳传输。</details>

<details><summary>10. HTTP 200 就保证 `grpc-status=0`（OK） 吗？</summary>

不保证；gRPC 最终状态需看其状态/trailers。</details>

<details><summary>11. `grpc-status=0`（OK） 能证明 B 设备收到吗？</summary>

不能；仍按 RPC 方法和 IM 业务确认点解释。</details>

<details><summary>12. 客户端 `DEADLINE_EXCEEDED` 能证明后端未改状态吗？</summary>

不能；服务端可能已执行，取消不自动回滚。</details>

<details><summary>13. gRPC 流式写 API 返回就表示字节已上网吗？</summary>

不一定；可能只交给框架缓冲，仍非应用确认。</details>

<details><summary>14. HTTP/2 的 stream 与 IM 业务消息必一一对应吗？</summary>

不必；一个 stream 可承载 RPC 流中的多个消息，应用须另定边界/确认。</details>

<details><summary>15. 原有 protobuf field number 可改号让 schema 看起来整齐吗？</summary>

不能；使用中的字段号标识线格式，重用/改号会破坏兼容。</details>

<details><summary>16. 代理外部 h3、内部 h2 就算全链 h3 吗？</summary>

不算；协议逐跳协商和终止。</details>

### 决策 17–22：错误与迁移

<details><summary>17. 内部权限错误可不加审查地映成外部 403 吗？</summary>

不可；当前非成员要隐藏 404，不泄会话存在。</details>

<details><summary>18. 内部 RPC 自动重试就使当前同 ID 写入幂等了吗？</summary>

没有；当前重复 ID 409，响应丢失仍需权威核证。</details>

<details><summary>19. 选 HTTP/2/3 时只比较吞吐，不看尾时延/内存可吗？</summary>

不够；stream/连接流控、队列与用户阶段结果都要测。</details>

<details><summary>20. Go 用 `http.Client` 就能断言本次连接一定 h2 吗？</summary>

不能；看实际协商、HTTPS、代理和 Transport 配置。</details>

<details><summary>21. 内部状态 OK，外部可把 S2 200 写成 `stored_in_teaching_db` 吗？</summary>

不可；S3 `/v2` 存库仍提议，现行 200 仅本进程内存受理。</details>

<details><summary>22. 一次协议迁移的评审卡至少要列什么？</summary>

客户端/代理/服务端版本、旧端兼容、模式字段号、流控/期限、错误映射、授权/确认点和回退证据。</details>

## 本章完成标准与后续路径

能把应用 `/v1` 与 HTTP/1.1、/v2 与 HTTP/2 分开，解释 HTTP/2 多路复用与 TCP 队头、HTTP/3 QUIC stream、gRPC 方法/状态/trailers 的不同责任；能指出 deadline/重试不能改写 S2 409 与 `accepted_in_memory`，才算完成本章。下一章 04.11 下沉到转发、NAT、MTU 和无线/移动网络的可达性问题。[第四卷路线](../../../src/docs/platform_engineering/curriculum/04_networks/README.md)
