---
title: 12.06 资源与持久存储：Pod 能调度不等于消息能恢复
icon: /assets/icons/article.svg
order: 7
date: 2026-09-25
---

[返回第十二卷](./README.md) · [集群控制：12.04](./04_cluster_control_model.md) · [工作负载：12.05](./05_workloads_service_discovery.md) · [隔离限制：03.11](../03_systems/11_isolation_limits.md) · [容量模型：11.12](../11_reliability/12_capacity_cost_decision.md)

# 12.06 资源与持久存储：Pod 能调度不等于消息能恢复

> DeepTutor 八节初稿经技术与教学审阅后的静态课程。Node、Pod、requests/limits、OOM、卷和消息均为**虚构纸上推演**；没有运行 Kubernetes、`kubectl`、Go、IM、数据库、部署或站点。当前 S2 `/v1` 仍是正文非空且最多 **6 UTF-8 B**、原始 HTTP 请求正文最多 **4096 B**、同 ID 重复 **409**、非成员隐藏 **404**、成功 `200 accepted_in_memory` 仅代表本进程内存受理；未来 S3 `/v2` 的 `stored_in_teaching_db` 是提议且仍为 6 B，R9 6→9 B 待审。[09.02 当前合同](../09_backend_security/02_http_api_contract.md)

## 一、一个网关 Pod 可能“放不下、跑不快、留不住”

12.04–12.05 已区分控制器、调度器、Pod 以及网关/数据库各自的状态责任。现在按三个问题读资源：**调度时 Node 是否容得下请求量；运行时 CPU/内存约束是否导致等待或退出；Pod 换掉后数据到底属于谁。** 这三个答案不同：一个 Pod 可因 request 过大而 Pending，即使主机此刻很空；也可调度成功却被 CPU limit 节流；还可能在 PVC Bound 后因为数据库事务没完成而无法恢复 `m-9/seq9`。[Kubernetes：Resource Management](https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/) · [Persistent Volumes](https://kubernetes.io/docs/concepts/storage/persistent-volumes/)

| 层次 | 纸上问法 | 不能偷换成 |
|---|---|---|
| request | 调度器按已有请求和 Node allocatable 能否放 Pod？ | 程序此刻实际只用了多少 CPU |
| limit | 运行时 CPU/内存到边界后怎样受限？ | 用户请求必定成功或数据必定持久 |
| `emptyDir` | 同一 Pod UID 里文件能活多久？ | 替代 Pod 自动有旧目录 |
| PV/PVC | 哪份集群存储与哪个申请绑定？ | `m-9/seq9` 事务、复制、备份都正确 |
| 业务确认 | A 当前内存受理、未来 DB 存储、B 设备处理 | 一个 Pod Ready 可概括全部 |

资源数字由业务负载反推：连接数、活跃比、群扇出、缓存、历史补拉与 N−1 故障时的重连，都会改变 CPU、内存和存储压力。课程只训练算式与证据，**不把纸上值当生产推荐 limits**。[11.12 容量与成本](../11_reliability/12_capacity_cost_decision.md)

## 二、requests 决定能否安置；limits 约束运行时用量

给一台虚构 Node **N1**：对 Pod 可用的 allocatable 是 **2 CPU、4 GiB**，已有 Pod 的 CPU requests 合计 **1.7 CPU**、内存 requests 合计 **3 GiB**。一个新 gateway Pod 请求 **500m CPU=0.5 CPU**、**512 MiB=0.5 GiB**。相加得 CPU `1.7+0.5=2.2 CPU>2 CPU`，内存 `3+0.5=3.5 GiB<4 GiB`：**CPU 请求这一维不能容纳**，所以即使 N1 此刻实际 CPU 利用率很低，也不能因此把它调度到 N1。另一个 Node N2 若在所有约束上有空间，可成为候选。[Kubernetes：How Pods with requests are scheduled](https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/)

`request` 是调度/争用的输入，不是“每秒固定发给该容器 0.5 核秒”的业务 SLA；CPU request 在竞争下通常也影响相对权重。`limit` 则是另一件事：假设 gateway 的 CPU limit 为 **1 CPU**、内存 limit 为 **1 GiB**，调度器不会用这些 limit 替代上面的 requests 算 N1 位置；运行中若 CPU 用量撞到限制，Linux cgroup 可节流，**不会因为 CPU 超限直接杀进程**。内存接近 limit 时可能先回收，若无法满足分配则可能触发 OOM killer，不能把一次接近 1 GiB 的快照等同于必然被杀。[Kubernetes：Requests and Limits](https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/)

| 本题条件 | 调度/运行解释 | 一份有区分力的证据 |
|---|---|---|
| N1 请求 CPU 2.2 > allocatable 2 | 新 Pod 在 N1 不可行 | Pod 未调度原因与 Node allocatable/已请求合计 |
| N2 能放下 0.5 CPU/0.5 GiB | 可被选为候选，不等于必然 Ready | 绑定 Node、镜像/配置/探针与应用正反例 |
| CPU limit 1 CPU | 高峰可能节流 | 同窗 cgroup CPU 使用/节流与请求时延 |
| 内存 limit 1 GiB | 高水位、回收或 OOM 风险 | `memory.events`、容器退出原因和业务影响 |

**requests 与 limits 可不同。** 多个 Pod 的 requests 能放进 Node，不保证它们所有 Pod 同时冲到各自 limit 时节点仍有充分余量。反过来只看低峰实际使用也可能高估能放多少 Pod；要把调度容量与峰值业务/N−1 另做对照。[11.07 阶梯与长稳](../11_reliability/07_load_testing_capacity.md)

## 三、节流、OOM、节点压力驱逐不要混成“容器重启”

纸上 gateway 被调度到 N2。**t1** 负载上升，CPU 配额节流增量与 A 受理回应 P95 同窗上升；这是 CPU 限制候选，仍需排除 DB、网络和排队。**t2** cgroup 内存事件出现 `oom_kill` 增量，同时该容器退出/重启，才有较强证据支持内存 OOM 影响了网关。若只是 Node 内存整体吃紧，Kubernetes 还可能因**节点压力驱逐**某些 Pod；它与容器超 limit 被内核杀掉不是一个事件，需要看 Pod reason/Node 条件与 cgroup/进程证据。[Kubernetes：Resource Limits](https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/) · [03.11 memory.events](../03_systems/11_isolation_limits.md)

Go heap、进程 RSS、cgroup `memory.current` 与 Kubernetes limit 各有作用域。`GOMEMLIMIT` 是 Go 运行时管理内存的软目标，不是 Pod 内存硬上限；`emptyDir` 若用内存介质也可能算入内存压力。看到 Go heap 低或 Node 总内存空，不能直接排除容器所在 cgroup 的页缓存、socket、其他容器或临时卷占用。[Go GC Guide](https://go.dev/doc/gc-guide) · [Kubernetes：memory-backed emptyDir](https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/)

Kubernetes 还有 **Guaranteed/Burstable/BestEffort** 等 QoS 分类，会影响节点压力下的驱逐优先级；它不替应用保存消息，也不承诺某个 Guaranteed Pod 永远不会因自己的 limit、节点失效或数据库故障退出。这里先要求学习者能说明自己的 requests/limits 会产生哪类资源风险，具体 QoS 规则以对应 Kubernetes 版本文档核对。[Kubernetes：Pod QoS](https://kubernetes.io/docs/concepts/workloads/pods/pod-qos/)

## 四、`emptyDir` 跟 Pod 走；PV/PVC 有另一套生命周期

`emptyDir` 是与**特定 Pod UID** 绑定的临时卷，可供同一个 Pod 内的容器共享；若只是 Pod 内某容器重启，它仍可能保留；若 Pod P1 被删除并由新 UID 的 P4 替代，P1 的 `emptyDir` 不会自动成为 P4 的目录。它可能使用节点本地介质，也可能配置为内存介质，均不能当权威历史。[Kubernetes：Volumes](https://kubernetes.io/docs/concepts/storage/volumes/) · [Pod Lifecycle](https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/)

**PV** 是集群里的存储资源/卷对象；**PVC** 是命名空间内对容量、访问模式等条件的申请，通常与符合要求的 PV 绑定；**StorageClass** 提供存储类型/动态供给等规则。PVC 处于 Bound 说明找到相应卷身份，**不等于**里面有正确的 `m-9/seq9`，也不等于数据库完成写前日志、复制/备份或成员授权。Pod 要真正使用仍需正确挂载、权限、拓扑与数据库恢复。[Kubernetes：Persistent Volumes/Claims](https://kubernetes.io/docs/concepts/storage/persistent-volumes/)

| 位置/对象 | 对 Pod P1→P4 的关系 | 业务仍需哪份证明 |
|---|---|---|
| P1 的进程内存 | P4 不继承 | 当前 S2 `accepted_in_memory` 无跨进程保证 |
| P1 的 `emptyDir` | 换 UID 不自动继承 | 不能放唯一权威消息 |
| PVC/PV | 可独立于某个 Pod 生命周期存在，挂载受条件约束 | DB 提交/崩溃恢复/权限和备份 |
| 未来 S3 权威数据库 | 取决于 DB 自身事实与存储策略 | `m-9/seq9`、outbox E9 与有权查询 |

PV 的**回收策略**和 PVC 的删除/重建同样需要审阅；“Pod 删了、卷对象还在”不能自动推断永远不会有人误删数据。第十一卷的容量/保留要求应与 StorageClass、卷拓扑、备份和恢复演练连起来，不能只填 `storage: 50Gi` 就结束。[11.12 保留成本](../11_reliability/12_capacity_cost_decision.md)

## 五、RWO 是单节点，不等于唯一写 Pod

访问模式很容易被名字误导。**ReadWriteOnce（RWO）** 表示一个卷可由**一个 Node** 以读写方式挂载；在该 Node 上，可能仍有多个 Pod 访问它，不能把 RWO 当数据库“只有一个写者”的完整保障。**ReadWriteOncePod（RWOP）** 用于在受支持的 CSI 场景约束单 Pod 读写，但它仍不是事务锁、主从仲裁或数据库唯一键。具体驱动和版本支持要以实际环境核对。[Kubernetes：PV Access Modes](https://kubernetes.io/docs/concepts/storage/persistent-volumes/)

若未来自管 db 以 StatefulSet 的 `volumeClaimTemplates` 给 `db-0` 关联一个 PVC，替代 Pod 可尝试找回同序号卷；但卷拓扑/可用区、绑定状态或故障可能阻止立即在新 Node 挂载，应用还需校验 WAL 与成员身份。即使 RWOP 确保一时只有一个 Pod 挂，数据库仍可能因为崩溃中断需要恢复，也不会自动复制到其它节点。[Kubernetes：StatefulSet Volume Claim Templates](https://kubernetes.io/docs/concepts/workloads/controllers/statefulset/) · [06.09 崩溃恢复](../06_databases/09_logging_recovery.md)

| 名称 | 最容易误读成 | 本章正确边界 |
|---|---|---|
| `ReadWriteOnce` | 全集群只允许一个写 Pod | 单 Node 读写挂载，仍须应用控制写入 |
| `ReadWriteOncePod` | 数据库天然有唯一主与副本 | 单 Pod 挂载约束，事务/复制另验 |
| PVC Bound | 消息已安全保存 | 存储绑定，不是 DB 提交确认 |
| StatefulSet `db-0` | Node/数据永远不变 | 逻辑身份稳定，Pod/Node 可替换，卷与恢复待查 |

## 六、纸上 t0–t3：调度、节流、退出与消息去向

四个时刻分别代表**不同证据链**，没有在本仓库实际发生：

```text
t0  N1 requests 计算为 2.2/2 CPU → gateway Pod 不选 N1；N2 有余量才可能绑定
t1  gateway 在 N2 运行，CPU limit 1 核附近出现节流 → A 受理 P95 变慢候选
t2  memory.events oom_kill 增 + 容器退出/重启 → 旧 WebSocket 与 S2 局部内存失去
t3  新进程/Pod Ready → 仅表示可接入候选，旧 m-a 与 B 缺口仍须对账
```

如果 t1 只是 CPU 节流，不应写“Pod 被 CPU limit 杀掉”；如果 t2 没有 `oom_kill`，应查节点压力驱逐、信号/发布或别的原因。当前 S2 的 `m-a` 可能只在旧进程内存里，P4 或重启后的进程不自动知道；A 若响应丢失并同 ID 重试，跨实例/重启的重复 409 需要统一身份裁决，不能由资源 request 或 PVC 自动提供。未来 S3 若有权威 `m-9/seq9` 事务，也需 DB 证据才能说可恢复，B 设备 ACK 是再下一站。[12.04 跨 Pod 重复反例](./04_cluster_control_model.md) · [07.12 权威/设备分层](../07_cache_messaging/12_cross_system_consistency_case.md)

## 七、资源调整与存储扩容要有业务回退门

如果 Pod 因 request 放不下而 Pending，可以审业务分布与 Node allocatable、资源请求和放置约束；若 CPU limit 节流，要同负载比较限额、CPU 核秒、队列和用户时延；若内存 OOM，先查 cgroup/Node 事件与 Go 堆、页缓存、`emptyDir`、连接数，再决定哪项实验可逆；若 PVC 挂不回去，要查 StorageClass、卷拓扑和数据身份。把 limit 全调大可能只是把瓶颈移给其它 Pod 或共享 DB，不能因为“新值更宽”就宣布可靠。[11.04 有反证的诊断](../11_reliability/04_diagnostic_method.md)

恢复门不仅是“Pod Ready”与“PVC Bound”，还要有**当前 S2 合同正反例**、旧请求未知状态、有权历史/成员数据、未来 S3 权威消息/备份与 B 的设备补拉。N−1 场景还要看故障后的剩余 Node 是否有足够 requests 容量容纳替代 Pod，以及连接重连/群扇出是否让真实负载超过估计。[11.07 容量实验](../11_reliability/07_load_testing_capacity.md)

固定 `openimsdk/open-im-server` 提交 `f6411a8a1a31d3df36f4c2b3ad28481a94141e1f` 的 [`send.go` 选定分支](https://github.com/openimsdk/open-im-server/blob/f6411a8a1a31d3df36f4c2b3ad28481a94141e1f/internal/rpc/msg/send.go#L46-L70)调用 `MsgToMQ` 后返回；[另一 Mongo 消费路径](https://github.com/openimsdk/open-im-server/blob/f6411a8a1a31d3df36f4c2b3ad28481a94141e1f/internal/msgtransfer/online_msg_to_mongo_handler.go#L43-L69)调用 `BatchInsertChat2DB`。两处不能证明真实 Kubernetes request/limit、PV/PVC、OOM、卷拓扑或数据恢复结果。[OpenIM 阅读地图](../im_reference.md)

## 八、22 道分层练习：交一张资源与卷身份卡

先算调度，再判断运行/持久边界。展开反馈前写清每题的资源作用域。

### 基础 1–8：requests、limits 与卷

<details><summary>1. request 主要回答哪类问题？</summary>

调度时能否按 Node allocatable、已有请求和其它约束放下 Pod；还影响争用权重。</details>

<details><summary>2. CPU limit 超过后 Kubernetes 必杀容器吗？</summary>

不会因单纯 CPU 超限直接杀；可能通过 cgroup 节流。</details>

<details><summary>3. 内存 limit 附近每次都必定 OOM kill 吗？</summary>

不必。可能先回收；需看事件增量与容器状态。</details>

<details><summary>4. `emptyDir` 与 Pod UID 生命周期怎样关联？</summary>

同 Pod 内容可被其容器使用/重启后保留；Pod 删除、替代 UID 后不自动继承。</details>

<details><summary>5. PV、PVC 各是什么？</summary>

PV 是集群存储资源对象，PVC 是命名空间内请求并与适合的 PV 绑定。</details>

<details><summary>6. PVC Bound 能证明 `m-9/seq9` 已 DB 提交吗？</summary>

不能。它只说明存储绑定，权威事务和恢复另验。</details>

<details><summary>7. RWO 一定只允许全局一个 Pod 写吗？</summary>

不是。它是单 Node 读写挂载，多个同 Node Pod 仍可能访问。</details>

<details><summary>8. RWOP 能自动给数据库做主从复制吗？</summary>

不能。它约束支持条件下的单 Pod 挂载，复制/事务另由数据库负责。</details>

### 算式 9–16：调度与故障证据

<details><summary>9. N1 allocatable 2 CPU，已有 requests 1.7，新请求 0.5，合计多少？</summary>

2.2 CPU，超过 N1 的 2 CPU。</details>

<details><summary>10. N1 内存 4 GiB，已有请求 3 GiB，新请求 512 MiB，合计多少？</summary>

3.5 GiB，小于 4 GiB；本题阻塞在 CPU 请求维。</details>

<details><summary>11. N1 实际 CPU 只用 10%，为何该 Pod 仍可能 Pending？</summary>

调度按 requests/allocatable 和约束，不按单次实时 CPU 使用快照。</details>

<details><summary>12. N2 能放下资源请求就代表 Pod 已 Ready 吗？</summary>

不代表。还要绑定、拉镜像、启动、配置和探针/业务验证。</details>

<details><summary>13. t1 只见 CPU 节流，可说进程被 OOM 杀了吗？</summary>

不能。CPU 节流与内存 OOM 是不同事件。</details>

<details><summary>14. t2 `oom_kill` 增且容器重启，仍需核对什么？</summary>

具体进程/容器、时间与内存来源、连接/当前 S2 业务影响。</details>

<details><summary>15. GOMEMLIMIT 可替代 Kubernetes memory limit 吗？</summary>

不能。前者是 Go 运行时管理内存软目标，后者由平台/内核施加资源约束。</details>

<details><summary>16. P1 换 P4，旧 `emptyDir` 可作为权威消息恢复来源吗？</summary>

不能。它随旧 Pod UID 生命周期结束。</details>

### 决策 17–22：业务与存储身份

<details><summary>17. StatefulSet 给 db-0 关联旧 PVC，就可宣布 DB 主已恢复吗？</summary>

不能。还需卷可挂载、事务/WAL、复制/身份与有权查询证据。</details>

<details><summary>18. 三副本正常都能运行就必满足失一节点后的调度余量吗？</summary>

不必。需计算剩余 Node allocatable/requests、热点和共享依赖。</details>

<details><summary>19. 新 Pod Ready 能证明旧 S2 `m-a` 仍在吗？</summary>

不能。旧进程内存不跨替代，当前 200 没有持久保证。</details>

<details><summary>20. B 设备没看到消息，PVC Bound 和网关 Ready 足以结案吗？</summary>

不够。要查未来权威历史、派生链和设备应用确认。</details>

<details><summary>21. OpenIM 两处固定源码能证明其真实内存 limit/PVC 吗？</summary>

不能。只支持所读发送与 Mongo 消费异步边界。</details>

<details><summary>22. 一张可审资源与卷身份卡至少交什么？</summary>

Node allocatable/已有 requests、Pod request/limit、运行事件/QoS、emptyDir/PV/PVC/访问模式与拓扑，以及 S2/S3/B 分层恢复门。</details>

## 本章完成标准与后续路径

能手算 N1 CPU 请求为何超出 allocatable，区分 CPU 节流、内存 OOM 与节点驱逐，说明 `emptyDir`、PVC/PV、RWO/RWOP 和数据库事务的不同责任，再把当前 S2 内存状态与未来 S3/B 恢复分开，才算完成第一轮。本章没有运行集群或存储实验。下一章 12.07 将按服务职责设计 ConfigMap、Secret、ServiceAccount、RBAC 与网络访问边界。
