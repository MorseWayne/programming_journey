# 12.08 启动、探针与退出：长连接网关怎样安全摘流

> DeepTutor 八节初稿经技术与教学审阅后的静态课程。Pod、探针、宽限期、端点和 IM 结果均为**虚构纸上方案**，没有运行 Go、IM、Kubernetes、`kubectl`、部署或站点。当前 S2 `/v1` 仍是正文非空且最多 **6 UTF-8 B**、原始 HTTP 请求正文最多 **4096 B**、同 ID 重复 **409**、非成员目标隐藏 **404**、成功 `200 accepted_in_memory` 只代表本进程内存受理；未来 S3 `/v2` 的 `stored_in_teaching_db` 是提议且仍为 6 B，R9 6→9 B 待审。[09.02 当前合同](../../../src/docs/platform_engineering/curriculum/09_backend_security/02_http_api_contract.md)

## 一、Pod Running、可接新请求、应被重启是三个判断

12.04–12.07 已把网关 Pod、Service、资源和权限拆开。现在纸上做一次 **P1 网关 Pod 的滚动摘流**：P1 有普通 HTTP 发送请求和 B 的 WebSocket；新 Pod P4 逐步就绪。我们要判断三件事：P4 是否完成启动、某 Pod 此刻是否适合接**新**流量、已有 Pod 是否因自身无法继续工作而应被重启。Kubernetes 的 startup、readiness、liveness 探针分别服务这些问题，**不是三个名字不同的“业务成功”按钮**。[Kubernetes：Liveness, Readiness and Startup Probes](https://kubernetes.io/docs/concepts/workloads/pods/probes/)

| 探针 | 初学者问题 | 常见平台效果 | 单独不能证明 |
|---|---|---|---|
| startup | 慢启动的应用何时完成基本启动？ | 成功前暂不执行 liveness/readiness；持续失败可重启容器 | 未来 DB 事务、B 设备 ACK |
| readiness | 这个 Pod 此刻适合接常规新流量吗？ | 失败后通常不作为普通 Service 就绪端点 | 已建立 WebSocket 已排空 |
| liveness | 进程是否陷入需要重启才能恢复的状态？ | 连续失败达到门槛可重启容器 | 重启后旧 S2 内存消息仍在 |

探针的价值由**检查内容、失败阈值、间隔和观察范围**决定。只检查“端口开着”可证明端口响应，不证明当前 `/v1` 6 B/409/404 业务合同，或未来 S3 权威 `m-9/seq9` 已提交。过度严格的探针还可能把一个慢依赖变成全体网关反复重启。[11.01 确认点](../../../src/docs/platform_engineering/curriculum/11_reliability/01_business_measurement.md)

## 二、startup 防误杀；readiness 摘新流量；liveness 只在必要时重启

**Startup probe** 适合应用首次初始化可能较慢的场景；若配置了它，在首次成功前 Kubernetes 不运行 liveness/readiness 检查，从而避免尚未启动完成时被 liveness 过早重启。若 startup 长期失败超过其配置门槛，容器也不会无限等待。[Kubernetes：Startup Probe](https://kubernetes.io/docs/concepts/workloads/pods/probes/)

**Readiness probe** 回答“现在接新流量是否合适”。假设 P4 进程已启动但缺必须配置，它可以暂时不 Ready；Service 后端常规选择应避开它。若 P1 正在摘流，应用也要先停止接新业务。Readiness 失败**不会因此直接杀容器**；它让仍活着的进程有机会处理已有连接或等待依赖恢复。具体 EndpointSlice 的 `ready/serving/terminating` 和 Service 选项会影响路由，不能把探针一次失败写成“所有入口瞬间停止新请求”。[Kubernetes：Readiness Probe](https://kubernetes.io/docs/concepts/workloads/pods/probes/) · [EndpointSlices](https://kubernetes.io/docs/concepts/services-networking/endpoint-slices/)

**Liveness probe** 只应在“应用本身不能靠等待/重试恢复，重启更有利”时触发。若把共享 DB 的暂时不可用写进**每个** gateway liveness，DB 抖动可能导致所有网关一起重启，WebSocket 全断，重连/补拉反而加压 DB；这属于错误的级联反馈。可把依赖失联对新业务的影响体现在 readiness/业务错误和有界重试中，同时让 liveness 关注自身无法前进的状态，具体判据仍需隔离实验。[11.09 级联故障](../../../src/docs/platform_engineering/curriculum/11_reliability/09_overload_cascades.md)

## 三、终止宽限期包括 preStop，端点更新与信号并行推进

设纸上 `terminationGracePeriodSeconds=40` 秒；设计预算为 **preStop 不超过 5 秒**、**应用 HTTP/WebSocket 有界排空计划 30 秒**、**至少 5 秒余量**。这只是教学分配，不是 Kubernetes 保证每一步精确花这些时间。宽限期在终止流程开始时计时，**包含 preStop**；随后运行时通常把 TERM 或镜像/平台配置的停止信号送给主进程，期限到后仍未退出则强制结束。若 preStop 一直睡满 40 秒，应用接到信号时已没有设计的 30 秒排空时间。[Kubernetes：Pod Termination Flow](https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/) · [Container Lifecycle Hooks](https://kubernetes.io/docs/concepts/containers/container-lifecycle-hooks)

与此同时，控制面会更新代表 P1 的 EndpointSlice：终止中的端点 `terminating=true`，通常 `ready=false`，`serving` 可表示它仍在服务已有连接。**端点传播、preStop、信号和入口控制器观察是并行/异步过程**；没有一条跨所有节点绝对同步的“先删流量、再等 5 秒、然后发信号”的时钟。应用应有自己的 draining 状态，拒绝/转移新工作，并给在途和 WebSocket 清楚的期限。[Kubernetes：EndpointSlice conditions](https://kubernetes.io/docs/concepts/services-networking/endpoint-slices/) · [Pod termination](https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/)

| 纸上时点 | 平台/应用可能发生 | 仍需核对 |
|---|---|---|
| t0：P1 标记 Terminating | 宽限计时开始，端点状态开始传播 | 外部入口是否仍送来新连接？ |
| t1：preStop/摘流 | 应用设置 draining，停止新业务 | 是否留下足够应用排空时间？ |
| t2：主进程得终止信号 | 普通 HTTP/长连接进入各自关停逻辑 | 信号真的到 Go 进程了吗？ |
| t3：在途处理 | HTTP 请求与 WebSocket 任务有界等待 | A/B 哪些确认点已达到？ |
| t4：进程退出或被强制结束 | 新 Pod 已可作为后端（若 Ready） | 旧内存消息、断线缺口是否恢复？ |

**t0–t4 不是固定时间顺序的真实日志**；尤其端点传播与 kubelet 本地信号可以交错。纸上 40 秒预算也不保证旧连接 100% 平滑迁移。真正要验的是用户看见的断线、重试、拒绝和历史补拉，而不是“sleep 了足够久”。[10.10 发布与回退门](../../../src/docs/platform_engineering/curriculum/10_engineering/10_continuous_delivery_versions.md)

## 四、Go `Shutdown` 只负责它管理的 HTTP 连接

Go `http.Server.Shutdown(ctx)` 会停止监听、关闭空闲连接并等待普通活动 HTTP 连接结束到空闲；若上下文先到期会返回相应错误，它**不会自动关闭或等待已 hijack 的 WebSocket 连接**。如果主程序在 `Shutdown` 返回后直接退出，B 的 WebSocket 可能仍有未发任务或未收到关闭通知。应用要维护会话/在途任务登记表，停止新会话，按协议通知客户端、限定等待时间并关闭剩余连接；还要给客户端稳定的重连与有权补拉入口。[Go `Server.Shutdown`](https://pkg.go.dev/net/http#Server.Shutdown) · [04.05 长连接停止](../../../src/docs/platform_engineering/curriculum/04_networks/05_tcp_connection_lifecycle.md)

| 纸上任务 | HTTP 服务器库覆盖 | 应用还要负责 |
|---|---|---|
| 已开始的普通 POST | 在有限关停中等待 Handler 返回 | 取消/期限、提交后响应丢失的状态核对 |
| 已升级 WebSocket | 不在 `Shutdown` 自动等待范围 | 会话登记、停止新接入、通知/排空/强制关闭 |
| 后台 E9/通知任务（未来） | 不由普通 HTTP 请求生命周期自动覆盖 | 稳定任务身份、确认/重试和权威历史 |

当前 S2 的 `200 accepted_in_memory` 只到 P1 进程内存。若 A 的 `m-a` 在 P1 已受理但响应未到 A，P1 退出后 P4 不会继承旧内存；同 ID 重试是否仍能全局返回 409，需要 12.04 所说的统一身份裁决，而不是靠 `Shutdown` 或 Deployment。未来 S3 的 DB 权威 `m-9/seq9` 与 B 设备 ACK 要另证，不得把“排空 HTTP”写成“设备已送达”。[12.04 跨 Pod 409](../../../src/docs/platform_engineering/curriculum/12_platform/04_cluster_control_model.md) · [07.12 确认矩阵](../../../src/docs/platform_engineering/curriculum/07_cache_messaging/12_cross_system_consistency_case.md)

## 五、四个探针/退出反例各伤害不同用户

| 错误设计 | 表面好处 | 真实副作用 | 修订与验收 |
|---|---|---|---|
| liveness 强依赖 db | DB 坏了就重启 gateway | 所有 Pod 可能反复重启，B 长连接/补拉风暴加重 | liveness 只查必要自愈条件；DB 故障按 readiness/业务/重试处理 |
| readiness 永远成功 | Pod 总能接新流量 | 配置未就绪或摘流仍被送新请求 | 就绪定义与 draining 状态相合，验实际入口变化 |
| preStop 睡满 40 秒宽限 | “给负载均衡传播时间” | TERM 后无应用排空预算，可能直接强杀 | preStop 与应用等待共用预算并留余量 |
| 只等 `Server.Shutdown` | 普通 HTTP 都回来了 | WebSocket 未被等待，退出时断开且任务未知 | 应用单独管理长连接/在途/补拉 |

修订后仍要做**反例演练**：如果 P1 在 TERM 前因 OOM 或 Node 故障突然消失，preStop 根本未必有机会运行；应用必须能让客户端识别缺口、重试/补拉，而不是把优雅退出当作唯一可靠性机制。[03.12 SIGTERM/SIGKILL](../../../src/docs/platform_engineering/curriculum/03_systems/12_resource_failure_case.md) · [11.10 恢复门](../../../src/docs/platform_engineering/curriculum/11_reliability/10_incident_response.md)

## 六、一次纸上滚动升级怎样观察到底

给一份**静态演练记录模板**，而非真实 `kubectl` 输出：镜像 digest D1→D2、P4 startup 通过、P4 Ready 后成为新候选；P1 被标记 Terminating，EndpointSlice 传播，gateway 自行拒绝新业务；普通 HTTP 和 WebSocket 分开排空；期限到后旧进程退出；A 重新发起的有权请求由新实例处理，B 重连并按权威历史核对缺口。每一步要记录观察时刻与来源，不能因为 P4 Ready=1 就立刻宣布整个发布成功。[12.01 制品身份](../../../src/docs/platform_engineering/curriculum/12_platform/01_runtime_artifacts.md) · [12.04 控制链](../../../src/docs/platform_engineering/curriculum/12_platform/04_cluster_control_model.md)

| 观察层 | 本题应记录 | 升级/恢复不能只看 |
|---|---|---|
| 制品/Pod | D1/D2、P1/P4 UID、探针/终止配置 | Pod 名字或 tag 相同 |
| 路由 | EndpointSlice 的 `ready/serving/terminating` 与入口样本 | 某一时刻端点列表 |
| 连接 | 停新接入、活动 HTTP、WebSocket 数、强制断开数 | `Shutdown` 返回 |
| A 发送 | 6 B 正例、9 B 当前拒绝、重复 409、非成员 404、200 内存受理 | 只有 HTTP 平均时延 |
| 未来历史/设备 | 权威 `m-9/seq9`、B 的有权补拉与应用 ACK | 网关 Ready 与通知写 socket |

若新 Pod 依赖故障、旧 Pod 排空超时或拒绝/积压持续增长，发布应按 10.10 的门暂停或回退；回退镜像也要审配置、数据和旧客户端，不能由探针绿色替代。所有指标/时间值在本页都是未来个人隔离实验的**待填写证据**，本仓库没有现成运行记录。[10.10 四轴发布](../../../src/docs/platform_engineering/curriculum/10_engineering/10_continuous_delivery_versions.md)

## 七、平台可帮助摘流，不能替应用完成消息保证

Kubernetes 负责探针与端点状态、Pod 终止预算、替代 Pod；Go HTTP 库负责它管理的连接；IM 应用负责用户认证、消息身份、在途提交、WebSocket 关闭协议、客户端重连与补拉。三者的责任相接，**没有一方自动把 P1 本地内存变成 P4 或 B 的持久事实**。[Kubernetes：Probes](https://kubernetes.io/docs/concepts/workloads/pods/probes/) · [Go `Shutdown`](https://pkg.go.dev/net/http#Server.Shutdown)

固定 `openimsdk/open-im-server` 提交 `f6411a8a1a31d3df36f4c2b3ad28481a94141e1f` 的 [`send.go` 选定分支](https://github.com/openimsdk/open-im-server/blob/f6411a8a1a31d3df36f4c2b3ad28481a94141e1f/internal/rpc/msg/send.go#L46-L70)调用 `MsgToMQ` 后返回；[另一 Mongo 消费路径](https://github.com/openimsdk/open-im-server/blob/f6411a8a1a31d3df36f4c2b3ad28481a94141e1f/internal/msgtransfer/online_msg_to_mongo_handler.go#L43-L69)调用 `BatchInsertChat2DB`。它们只说明所读发送与 Mongo 消费的异步边界，不能证明 OpenIM 或本项目的真实探针、宽限期、EndpointSlice、WebSocket 排空或设备结果。[OpenIM 阅读地图](../../../src/docs/platform_engineering/curriculum/im_reference.md)

## 八、22 道分层练习：给 P1→P4 写有界退出卡

先按“启动、接新流量、存活、排空、业务结果”分类作答，再展开反馈。

### 基础 1–8：三种探针

<details><summary>1. startup probe 主要保护什么？</summary>

给慢启动明确窗口；首次成功前不运行 liveness/readiness，避免过早判失败。</details>

<details><summary>2. readiness 失败会因这一项直接杀容器吗？</summary>

不会。它主要影响 Pod 是否适合常规新流量。</details>

<details><summary>3. liveness 长期失败到门槛通常触发什么？</summary>

容器可能被重启；它不应拿短暂 DB 失联当必需重启条件。</details>

<details><summary>4. 端口 healthcheck 绿能证明 B 设备 ACK 到了吗？</summary>

不能。探针只覆盖它具体检查的阶段。</details>

<details><summary>5. preStop 是否在 termination grace 预算之外免费执行？</summary>

不是。宽限期包含 preStop 所耗时间。</details>

<details><summary>6. Terminating 端点的 ready 通常是什么？</summary>

通常为 false；serving 可另表示仍处理已有连接，具体路由有实现/选项边界。</details>

<details><summary>7. Go `Server.Shutdown` 自动等 WebSocket 吗？</summary>

不等。hijacked/WebSocket 由应用单独管理。</details>

<details><summary>8. P4 Ready 后 P1 上旧 WebSocket 会自动迁移吗？</summary>

不会。客户端需重连并按有权历史补缺口。</details>

### 推导 9–16：宽限期和反例

<details><summary>9. 纸上总 grace 40s、preStop 5s、应用计划 30s，还剩多少预算？</summary>

`40−5−30=5s` 纸上余量；实际阶段可能交错，需观察并留安全边界。</details>

<details><summary>10. preStop 睡满 40s 后 Go 还有 30s 吗？</summary>

没有。preStop 已消耗宽限预算，进程可能随后被强制结束。</details>

<details><summary>11. EndpointSlice 变动与 TERM 到达能保证严格先后吗？</summary>

不能。控制面传播与 kubelet本地关停可并行，应用须自设 draining 门。</details>

<details><summary>12. liveness 探针查共享 DB，DB 暂停会造成什么放大？</summary>

多个 gateway 可能一起重启，断线/重连/补拉再给 DB 加压。</details>

<details><summary>13. readiness 永远 true，发布时可能伤到谁？</summary>

尚未就绪或正在摘流的 Pod 仍接新请求，A 可能超时/失败。</details>

<details><summary>14. `Shutdown(ctx)` 到期返回错误能证明活动 HTTP 已全部结束吗？</summary>

不能。它报告期限到期，应用需按退出政策处理未完成状态。</details>

<details><summary>15. A 的 m-a 已在 P1 内存受理、回应丢失，P4 会自动返回重复 409 吗？</summary>

不能。跨 Pod 需要统一消息身份裁决；本地内存不会迁移。</details>

<details><summary>16. 优雅摘流足以覆盖 OOM/Node 突然故障吗？</summary>

不足。突然故障可能没有 preStop/TERM 机会，客户端仍需状态查询与补拉。</details>

### 决策 17–22：业务恢复门

<details><summary>17. P4 Ready 与 B 已补到 seq9 是同一确认点吗？</summary>

不是。前者是平台就绪，后者是有权历史/设备业务结果。</details>

<details><summary>18. 只看 `Shutdown` 返回就宣布全部在途消息已送达，可行吗？</summary>

不可。WebSocket/后台任务、未来 DB 权威和设备 ACK 各需证据。</details>

<details><summary>19. 发布期间看到拒绝/积压上升，应继续扩大滚动比例吗？</summary>

不应。按预定停止门暂停/回退并核对用户结果。</details>

<details><summary>20. 旧 `/v1` 正文 9 B 在新 Pod 被接纳，可当 R9 灰度成功吗？</summary>

不能。R9 未批准，旧合同仍最多 6 B。</details>

<details><summary>21. OpenIM 两处源码可证明其真实探针和排空预算吗？</summary>

不能。只支持所读发送与 Mongo 消费异步边界。</details>

<details><summary>22. 一张可审退出卡至少交什么？</summary>

制品/探针定义、grace/preStop/信号预算、EndpointSlice 状态、HTTP/WebSocket/后台在途、A 当前合同与未来权威/设备恢复门。</details>

## 本章完成标准与后续路径

能解释 startup/readiness/liveness 的不同效果，手算宽限期包含 preStop 的预算，说明端点传播与信号并行、`Shutdown` 不等 WebSocket，并为 P1→P4 的旧消息和客户端补拉写出停止/恢复门，才算完成第一轮。本章没有运行 Pod 或执行发布。下一章 12.09 将把这些门接入滚动、金丝雀、配置灰度与回滚决策。
