# 12.10 扩缩容与故障域：一个 Node 倒下为何三副本网关仍不够

> DeepTutor 八节初稿经技术与教学审阅后的静态课程。连接、消息、Pod、Node、CPU、负载和故障均为**虚构纸上数值**；没有运行 Go、IM、Kubernetes、`kubectl`、压测、部署或站点。当前 S2 `/v1` 仍是正文非空且最多 **6 UTF-8 B**、原始 HTTP 请求正文最多 **4096 B**、同 ID 重复 **409**、非成员隐藏 **404**、成功 `200 accepted_in_memory` 只代表本进程内存受理；未来 S3 `/v2` 的 `stored_in_teaching_db` 是提议且仍为 6 B，R9 6→9 B 待审。[09.02 当前合同](../../../src/docs/platform_engineering/curriculum/09_backend_security/02_http_api_contract.md)

## 一、十万连接、二十条消息与一个大群是不同负载

扩容决策先定**业务工作单位**。沿 11.12 的纸上基线，**10,000 条设备连接**中 **2% 活跃**，每活跃连接平均每秒发 **0.1 条入站消息**，得到 `10,000×0.02×0.1=20 条入站消息/秒`；若未来每条恰好面向 **50 人×2 设备**且无过滤/重试，条件计算为 **2,000 个设备任务/秒**。连接主要消耗 FD/内存和保活，群扇出可能消耗 CPU、队列与网络，历史补拉又争用 DB。当前 S2 还没有这套设备任务运行能力，不可把纸上 2,000/s 写成已测吞吐。[11.12 单位算式](../../../src/docs/platform_engineering/curriculum/11_reliability/12_capacity_cost_decision.md)

**HPA 增 Pod 数**只可能缓解它能观察并能由新 Pod 分担的压力。已有 WebSocket 连接不会自动搬到新 Pod；某个热点群固定落在一分区，新增 gateway 也未必立刻分散该群；DB/broker 可能是共享瓶颈。单看“平均 CPU 低”会漏空闲连接占内存/FD，“平均 CPU 高”又可能是群扇出或配额节流，需按相同工作量与确认点调查。[11.04 工作负载画像](../../../src/docs/platform_engineering/curriculum/11_reliability/04_diagnostic_method.md) · [12.05 Service 不迁连接](../../../src/docs/platform_engineering/curriculum/12_platform/05_workloads_service_discovery.md)

| 资源/业务信号 | 更接近什么需求 | 单独不足以证明 |
|---|---|---|
| 活跃 WebSocket 数 | 连接态/FD/内存/心跳 | 消息速率、设备已收到 |
| 入站消息/秒 | A 发送受理压力 | 群任务/离线补拉压力 |
| 目标成员×设备任务/秒 | 未来派生/推送容量 | 权威消息数或 B 应用 ACK |
| 历史补拉队列/时延 | 重连/离线恢复压力 | CPU 扩 Pod 一定能解决 DB 慢 |

## 二、HPA 是间歇控制，CPU 百分比以 request 为分母

Kubernetes **Horizontal Pod Autoscaler（HPA）**按配置指标周期性观察，再调整工作负载的期望副本数；它不是每个请求到来就同步创建 Pod。以 CPU 利用率为例，百分比是相对对应**CPU request**计算，不是相对宿主总核数或容器 CPU limit。[Kubernetes：Horizontal Pod Autoscaling](https://kubernetes.io/docs/concepts/workloads/autoscaling/horizontal-pod-autoscale/)

纸上已有 **3 个** gateway Pod，每个 CPU request **500m=0.5 CPU**，此窗口平均实际各用 **0.4 CPU**，则利用率 `0.4/0.5=80%`。若目标为 **50%**，最简单的理想计算是 `ceil(3×80%/50%)=ceil(4.8)=5` 个期望副本。这只是**用于理解方向的简化算式**；真实 HPA 还会处理容忍区间、缺失指标、启动期 Pod、缩放行为与指标采样，不能从这三个数字预言集群一定会马上变成五个 Ready。[Kubernetes：HPA algorithm](https://kubernetes.io/docs/concepts/workloads/autoscaling/horizontal-pod-autoscale/)

| 数量 | 纸上值 | 含义 |
|---|---:|---|
| 现有 Pod | 3 | 当前规模，不保证分布在三个 Node |
| 每 Pod request | 500m | CPU 指标利用率的分母与调度输入 |
| 每 Pod 使用 | 400m | 某同口径窗口的 CPU 用量 |
| 实际/目标 | 80%/50% | 简化希望扩容 |
| 简化期望 | 5 | 不是实际 Ready，也不是业务容量证明 |

若 HPA 指标来源滞后，发现峰值本来就会晚；再经历创建 Pod、调度、拉镜像、启动和 readiness，新增后端更晚才能接**新**连接。应用还需在峰值到来前有安全余量与客户端有界退避，不能把 HPA 当一秒重连风暴的即时缓冲。[12.04 调度控制链](../../../src/docs/platform_engineering/curriculum/12_platform/04_cluster_control_model.md) · [11.09 重连抖动](../../../src/docs/platform_engineering/curriculum/11_reliability/09_overload_cascades.md)

## 三、HPA 想要五个 Pod，Node 不一定放得下

HPA 调整的是**Pod 期望数**，调度器还得找到各新 Pod 的 Node 空间。若纸上现有 Node 的 requests 只能容纳 **3 个** gateway Pod，HPA 给出目标 5 后，另外 **2 个可能持续 Pending**，实际 Ready 仍为 3；“desired=5”不能冒充“容量已经增加”。节点扩容器若在该环境存在，可能因未调度 Pod 尝试供应新 Node，但也受资源配额、可用机器类型、放置约束、云容量和启动时间影响，不能保证马上补齐。[Kubernetes：Node Autoscaling](https://kubernetes.io/docs/concepts/cluster-administration/node-autoscaling/) · [12.06 requests/allocatable](../../../src/docs/platform_engineering/curriculum/12_platform/06_resources_persistent_storage.md)

**垂直加大一个 Pod 的 request/limit**是另一种方案：可能提高单实例 CPU/内存空间，也可能让它更难被调度，或增加单点连接数与故障时重连量。**水平增副本**可分散新连接，但不拆已有长连接/热点分区。两类方案需比较同负载下的连接、群任务、用户结果和 N−1 余量，不按“Pod 数越多越好”决定。[11.07 压测与容量](../../../src/docs/platform_engineering/curriculum/11_reliability/07_load_testing_capacity.md)

## 四、N−1 Pod 算过，不等于 N−1 Node/可用区算过

继续用一个**严格限定的纸上能力**：每 gateway Pod 在相同连接/群/依赖组合下长期可处理 **100 条入站消息/秒**，目标峰值 **150 条/秒**。三 Pod 失一个，名义剩 `2×100=200/s`，比峰值多 **50/s**。但如果三 Pod 的放置是 **N1 两个、N2 一个**，失去 N1 后只剩 N2 的 **100/s<150/s**。这是**失一个 Pod**与**失一个 Node**不同的故障域，不能都写成“N−1 已通过”。[11.12 余量](../../../src/docs/platform_engineering/curriculum/11_reliability/12_capacity_cost_decision.md)

| 纸上放置 | 失效对象 | 剩余名义吞吐 | 对 150/s 峰值 |
|---|---|---:|---|
| P1/P2 在 N1，P3 在 N2 | 仅 P1 | 200/s | Pod 层名义多 50/s |
| P1/P2 在 N1，P3 在 N2 | 整个 N1 | 100/s | Node 层不足 50/s |
| P1/P2/P3 各在 N1/N2/N3 | 任一 Node | 200/s | Node 层名义多 50/s，仍待验 |

**拓扑分散**可借 Pod topology spread constraints 或合适的反亲和规则表达“尽量/必须按 Node 或可用区分开”；硬约束若没有足够合适 Node/zone，反而使新 Pod Pending。即使三 Pod 在三 Node，也可能都在同一可用区；若要抵御整个可用区失效，需要另设相应域的放置与共享 DB/broker 故障分析。仅看副本个数或一个 `topologyKey` 名字不能证明实际分布。[Kubernetes：Pod Topology Spread Constraints](https://kubernetes.io/docs/concepts/scheduling-eviction/topology-spread-constraints/) · [Assigning Pods to Nodes](https://kubernetes.io/docs/concepts/scheduling-eviction/assign-pod-node/)

## 五、PDB 保护自愿驱逐，不保突然 Node 故障

**PodDisruptionBudget（PDB）**可在纸上给三副本网关设 `minAvailable=2`，帮助协调**受它管辖的自愿驱逐**，例如有计划的 Node drain：如果此时只剩 2 个可用 Pod，继续驱逐通常会被阻止或等待。它**不能保证** Node 突然断电、OOM、应用崩溃或网络隔离时仍有两个 Pod 可用；也不替代 12.09 的 Deployment 滚动 `maxUnavailable` 预算与用户业务确认。[Kubernetes：Pod Disruption Budgets](https://kubernetes.io/docs/tasks/run-application/configure-pdb/)

| 机制 | 管什么 | 不管什么 |
|---|---|---|
| Deployment `maxUnavailable` | 受控滚动更新时的可用目标 | 不防突发 Node 故障或消息重复 |
| PDB `minAvailable` | 符合条件的自愿 eviction 门 | 不让意外故障永不发生 |
| topology spread | 调度时的 Node/zone 放置偏好或硬约束 | Node 真实容量、DB/队列共享故障 |
| HPA | 随指标调整 Pod 期望数 | 指标/调度/启动/业务恢复的所有时延 |

真实验证要同时记录 Pod UID→Node/zone 映射、PDB 当前允许驱逐数、HPA desired/current、调度 Pending、可用副本和应用侧用户结果。没有这些数据，看到 PDB 对象存在不能直接写“高可用”。[12.04 spec/status](../../../src/docs/platform_engineering/curriculum/12_platform/04_cluster_control_model.md)

## 六、重连风暴先到，扩容通常后到

设纸上 **1,000 台** B 类设备因 N1 故障同刻重连并补历史。若它们**理想均匀**分散到 10 秒，平均是 `1,000/10=100 次重连/秒`；但真实峰值、握手大小、设备旧序号/群热点未知。HPA 的指标采样、控制循环、Pod 调度、镜像拉取和 readiness 都要时间，新 Pod 还不能接管旧 TCP/WebSocket，只会接后来的新连接。恢复不能只靠“等 HPA 变五”：需事先留网关/Node/DB 余量，客户端有界退避与抖动，服务端限载，以及从有权权威历史按序补缺口。[11.09 过载与退避](../../../src/docs/platform_engineering/curriculum/11_reliability/09_overload_cascades.md) · [12.08 WebSocket 摘流](../../../src/docs/platform_engineering/curriculum/12_platform/08_startup_probes_exit.md)

如果 B 离线 **25 小时**、教学 broker 只留 **24 小时**，即使新网关五副本全部 Ready，也不能凭 broker 还在就说缺口可补；未来 S3 若有权威 `m-9/seq9`，仍要从有成员权限的 DB 历史恢复。当前 S2 则只有内存受理承诺，Pod 替换不能自动把旧 `m-a` 交给新 Pod。[07.12 历史补拉](../../../src/docs/platform_engineering/curriculum/07_cache_messaging/12_cross_system_consistency_case.md)

## 七、扩容决策同时交平台状态与用户结果

一份可审的扩缩容卡至少记录：**工作量**（连接、活跃、入站、设备任务、补拉）、**指标**（采样窗口/来源/请求分母）、**平台**（HPA desired/current、Ready/Pending、Node/zone、PDB）、**共享依赖**（DB/队列/网络）、**业务**（当前 A 的 6 B/409/404/200，未来权威和 B 设备 ACK）、**停止/回退门**。若 HPA 扩容后客户端拒绝/超时上升或 DB 积压增加，即使 CPU 百分比下降也不算问题解决。[11.04 有反证的诊断](../../../src/docs/platform_engineering/curriculum/11_reliability/04_diagnostic_method.md) · [11.08 SLI](../../../src/docs/platform_engineering/curriculum/11_reliability/08_slo_alerting.md)

纸上 Node N1 两 Pod 的故障例子还要求补一项：**替代 Pod 是否有可调度的剩余 Node requests 空间**。如果三 Pod 分散了，但失一 Node 后没有可用空间补 Pod，短期可用能力仍只有两 Pod；若这两 Pod 在剩余 Node 上被 DB 共享瓶颈拖慢，`2×100` 的线性假设也失效。N−1 算式需在隔离实验中按同连接、同群、同旧端比例验证，不能从平台配置推生产保证。[11.07 隔离压测](../../../src/docs/platform_engineering/curriculum/11_reliability/07_load_testing_capacity.md)

固定 `openimsdk/open-im-server` 提交 `f6411a8a1a31d3df36f4c2b3ad28481a94141e1f` 的 [`send.go` 选定分支](https://github.com/openimsdk/open-im-server/blob/f6411a8a1a31d3df36f4c2b3ad28481a94141e1f/internal/rpc/msg/send.go#L46-L70)调用 `MsgToMQ` 后返回；[另一 Mongo 消费路径](https://github.com/openimsdk/open-im-server/blob/f6411a8a1a31d3df36f4c2b3ad28481a94141e1f/internal/msgtransfer/online_msg_to_mongo_handler.go#L43-L69)调用 `BatchInsertChat2DB`。两处不能证明 OpenIM 或本课程项目真实的 HPA、Node/zone 分布、PDB、单 Pod 吞吐或扩容后用户结果。[OpenIM 阅读地图](../../../src/docs/platform_engineering/curriculum/im_reference.md)

## 八、22 道分层练习：画 Pod/Node/zone 三层余量图

先算工作单位，再推 HPA/故障域，最后写业务停止门。

### 基础 1–8：扩容信号

<details><summary>1. 10,000 连接、2% 活跃，每活跃 0.1 条/s，入站多少？</summary>

`10,000×0.02×0.1=20 条/秒`，只是纸上条件值。</details>

<details><summary>2. 每条恰好 50 目标成员×2 设备，无过滤重试，任务多少？</summary>

`20×50×2=2,000 项/秒`，不是 2,000 条权威消息或设备 ACK。</details>

<details><summary>3. HPA CPU 利用率的分母通常是什么？</summary>

相应 Pod/容器的 CPU request，不是宿主全部核或 CPU limit。</details>

<details><summary>4. HPA 期望五 Pod 就等于五个 Ready 吗？</summary>

不等。还要有 Node 空间、调度、启动与就绪时间。</details>

<details><summary>5. 新 Pod 会迁移旧 Pod 上的 WebSocket 吗？</summary>

不会。既有连接留在旧 Pod 直到断开/有界摘流。</details>

<details><summary>6. PDB 可保证 Node 意外断电时仍两个 Pod 可用吗？</summary>

不能。PDB 主要约束自愿驱逐。</details>

<details><summary>7. 三个副本一定在三个 Node/zone 吗？</summary>

不一定。要定义并验证放置约束与实际映射。</details>

<details><summary>8. 当前 S2 200 能说明 B 设备收到吗？</summary>

不能，只表示本进程内存受理。</details>

### 计算 9–16：指标、故障与重连

<details><summary>9. 每 Pod request 500m、使用 400m，CPU 利用率多少？</summary>

`400/500=80%`。</details>

<details><summary>10. 现三 Pod、目标 50%，按简化公式期望多少副本？</summary>

`ceil(3×80/50)=ceil(4.8)=5`；真实 HPA 还有采样/容忍等规则。</details>

<details><summary>11. HPA 要五 Pod、Node 只能放三 Pod，其余两 Pod 怎样？</summary>

可能 Pending，实际 Ready 不因此自动变五。</details>

<details><summary>12. 每 Pod 稳100入站/s，目标峰150，失一 Pod 后余量多少？</summary>

剩 200/s，名义多 50/s，前提是其它资源同负载可用。</details>

<details><summary>13. N1 有两 Pod、N2 一 Pod，失 N1 后剩多少？</summary>

只剩一 Pod 100/s，小于 150/s，Node N−1 不通过。</details>

<details><summary>14. 三 Pod 各在三 Node，失任一 Node 后名义多少？</summary>

两 Pod 合计 200/s，仍要查 zone/DB/重连和调度替代容量。</details>

<details><summary>15. 1,000 设备理想分散 10 秒，平均重连多少/s？</summary>

100/s；实际峰值未知。</details>

<details><summary>16. 硬拓扑分散约束无法满足时 Pod 会怎样？</summary>

可能 Pending，不能为“均匀”无条件牺牲可调度性。</details>

### 决策 17–22：平台与业务验收

<details><summary>17. PDB `minAvailable=2` 与 maxUnavailable 是一回事吗？</summary>

不是。PDB 约束符合条件的自愿 eviction，maxUnavailable 管 Deployment 受控滚动预算。</details>

<details><summary>18. HPA 扩容后平均 CPU 降、DB 积压涨，可宣布修复吗？</summary>

不能。共享瓶颈/用户补拉可能更差，要看完整用户结果。</details>

<details><summary>19. 旧 `/v1` 9 B 被某新 Pod 接纳，可当扩容成功吗？</summary>

不能。违反当前 6 B 合同，R9 尚待审。</details>

<details><summary>20. B 离线 25h、broker 留 24h，五网关 Ready 如何补历史？</summary>

未来须按成员权限从权威 DB 历史查 `seq9` 缺口；网关副本数不替代数据来源。</details>

<details><summary>21. OpenIM 两处固定源码能证明真实 HPA/PDB 或 N−1 吗？</summary>

不能。只支持所读发送与 Mongo 消费异步边界。</details>

<details><summary>22. 可审扩缩容卡至少交什么？</summary>

业务工作量、指标窗口、HPA/Node 当前与期望、Pod/Node/zone 映射、PDB/共享依赖、当前/未来确认点与停止回退门。</details>

## 本章完成标准与后续路径

能从 CPU request 算出简化 HPA 五副本目标，说明为什么新增 Pod 仍可能 Pending、旧 WebSocket 不迁移；手算失一 Pod 与失两 Pod 的 Node 故障结果，并区分 PDB 自愿驱逐门与突发故障，才算完成第一轮。所有容量与时间均待未来隔离实测。下一章[12.11 声明式交付与可重复环境](../../../src/docs/platform_engineering/curriculum/12_platform/11_declarative_delivery.md)将把镜像、配置、权限与期望状态纳入漂移审计。
