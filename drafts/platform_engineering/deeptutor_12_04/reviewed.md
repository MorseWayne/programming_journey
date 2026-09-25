# 12.04 集群控制模型：三个 IM 网关副本怎样被维持

> DeepTutor 八节初稿经技术与教学审阅后的静态课程。Deployment、Node、Pod、时间线与客户端结果均为**虚构纸上推演**；没有运行 Kubernetes、`kubectl`、Go、IM、集群部署或站点。当前 S2 `/v1` 仍是正文非空且最多 **6 UTF-8 B**、原始 HTTP 请求正文最多 **4096 B**、同 ID 重复 **409**、非成员目标隐藏 **404**、成功 `200 accepted_in_memory` 只代表本进程内存受理；未来 S3 `/v2` 的 `stored_in_teaching_db` 是提议且仍为 6 B，R9 6→9 B 待审。[09.02 当前合同](../../../src/docs/platform_engineering/curriculum/09_backend_security/02_http_api_contract.md)

## 一、从 Compose 的“启动三个服务”到集群的“维持三个副本”

12.03 的 Compose 纸上环境让 `gateway/db/events` 在本地网络里相互发现。若未来网关需要跨多台机器运行，单靠“启动过三个进程”无法处理节点退出、容器重建和新实例放到哪台机器。Kubernetes 引入**记录期望状态的 API 对象**以及不断比较/修正的控制循环：例如纸上声明网关希望有 **3 个副本**，其中一个 Pod 被删除后只剩 2 个时，相关控制器尝试创建替代 Pod，调度器再选 Node。这个过程是**异步收敛**，不是一次命令立刻把用户的 WebSocket 无缝搬到新进程。[Kubernetes：Objects](https://kubernetes.io/docs/concepts/overview/working-with-objects/) · [Controllers](https://kubernetes.io/docs/concepts/architecture/controller/)

本章只学最小词汇：**Node** 是承载 Pod 的集群机器；**Pod** 是 Kubernetes 调度/运行应用容器的基本单元；**Deployment** 描述一组常见无状态工作负载的副本与更新意图；**controller** 让实际状态向期望靠近；**scheduler** 为尚未绑定 Node 的 Pod 选位置；**kubelet** 在 Node 上管理分配给本机的 Pod。并非一个组件“包办一切”，每一步都有不同的阻塞点。[Kubernetes：Cluster Architecture](https://kubernetes.io/docs/concepts/architecture/) · [Pods](https://kubernetes.io/docs/concepts/workloads/pods/)

**三副本只指平台工作负载数量意图。** 它不能单独保证三台不同 Node、N−1 余量、当前 `/v1` 的全局重复 409、A 的 200 可持久、B 设备已收到。先把平台状态与业务状态分开，后面的实验才不会把“Deployment 绿了”误读成“消息可靠”。[11.12 容量与余量](../../../src/docs/platform_engineering/curriculum/11_reliability/12_capacity_cost_decision.md)

## 二、`spec` 写想要的，`status` 写观察到的

Kubernetes 对象通常有 `metadata`、`spec` 和 `status`。`metadata.name` 方便引用，**UID** 区分这个对象的具体生命；namespace 限定 API 对象的命名/管理范围。`spec` 是希望达到的配置；`status` 是控制面和节点汇报的观察结果。纸上写 `Deployment.spec.replicas=3`，只表示希望维持三个副本，不能当作“此刻已有三个 Ready”。[Kubernetes：Object spec/status](https://kubernetes.io/docs/concepts/overview/working-with-objects/)

| 纸上字段/读数 | 含义 | 不能推出 |
|---|---|---|
| `spec.replicas=3` | 网关期望副本数 | 三个 Pod 已调度、已就绪 |
| `status` 中 Ready=2 | 当前被观察到的就绪副本只有 2 | 第三份内存状态正被复制 |
| 某 Pod phase `Pending` | 还未进入可运行完成状态的候选 | 必定是 CPU 不足；还要看调度/拉镜像等原因 |
| 某容器 `Running` | 容器进程在运行 | HTTP 6 B/409/404/200 都已通过，或 B 已处理消息 |
| 业务样本 | 特定有权请求达到某个确认点 | 所有用户/设备及未来存储全达标 |

**控制循环**反复观察和行动，集群可在一段时间内持续变化；一个 Pod 被删除、替代 Pod 尚未 Ready 时，`spec` 与 `status` 暂时不同是正常的待收敛状态。**若原 Pod 仍存在、只是 Readiness 失败，副本控制器未必另建一个 Pod**；须先看 Pod/容器是否退出、是否被删除，以及 ReplicaSet 实际计数。若 Node 没有可用容量、镜像拉取失败或应用探针始终失败，差距可能长期存在，不能只凭“会自动修复”停止排障。[Kubernetes：Controllers](https://kubernetes.io/docs/concepts/architecture/controller/) · [Pod Lifecycle](https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/)

## 三、Deployment、ReplicaSet、Pod 各管哪一层

在本题的常见网关模型中，**Deployment** 保存镜像/容器模板与副本意图，并管理相应 **ReplicaSet**；ReplicaSet 按标签选择器和模板维持符合要求的 **Pod** 数量。Pod 本身承载一个或多个紧密协作的容器及其 Pod 生命周期，不是“永远在同一机器上运行的网关身份”。Deployment 更新模板时可生成新 ReplicaSet，再按更新策略替换旧 Pod；具体发布策略在 12.09 深化。[Kubernetes：Deployments](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/) · [ReplicaSet](https://kubernetes.io/docs/concepts/workloads/controllers/replicaset/)

纸上旧 Pod **P1 被删除**后，新 Pod **P4** 是**另一对象/新 UID**，可能被调度到另一 Node、得到新的 IP，运行新的进程内存。Kubernetes 不把同一个已坏 Pod 的 UID 和地址空间“搬到”新 Node。即使 Pod 名字看起来相似，仍须查 UID/创建时间与所属 ReplicaSet。A 在 P1 内存里受理过 `m-a`，P4 不会因模板相同自动拥有它；B 的 WebSocket 也会断开并重连。[Kubernetes：Pod replacement and UID](https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/) · [12.02 进程/容器重建](../../../src/docs/platform_engineering/curriculum/12_platform/02_container_mechanisms.md)

Deployment 的 selector 必须与 Pod 模板标签正确匹配；否则控制器的对象归属/更新可能不符合设计，平台 API 也会拒绝某些不一致配置。初学者不必先背 YAML，但要能沿“Deployment → ReplicaSet → Pod UID → 容器进程”追一条副本的责任链。[Kubernetes：Deployment selectors](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/)

## 四、调度器选 Node，kubelet 才在 Node 上运行 Pod

新 Pod P4 创建后**尚未绑定 Node**，调度器会找可行 Node，考虑资源 request、节点/放置约束等，再从可行集合里评分选位置并绑定。若没有可行 Node，它会保持未调度，`spec.replicas=3` 仍不等于 Ready=3；若有 Node 但容器镜像无法拉取或应用启动失败，则是**绑定之后**的另一问题。kubelet在分配的 Node 上负责运行 Pod 中容器并汇报本机状态。[Kubernetes：Scheduler](https://kubernetes.io/docs/concepts/scheduling-eviction/kube-scheduler/) · [Architecture](https://kubernetes.io/docs/concepts/architecture/)

| P4 卡在哪一站 | 第一份纸上线索 | 不能靠什么修 |
|---|---|---|
| 尚未创建替代 Pod | Deployment/ReplicaSet 期望与对象状态 | 只增加应用日志 |
| Pod 已创建但未绑定 Node | 调度条件、Node 可行性、资源请求 | 重启尚未运行的应用进程 |
| 已绑定但容器没起 | Node/kubelet 与镜像拉取/启动状态 | 只看 `spec.replicas=3` |
| 容器 Running 但未 Ready | 应用探针及依赖/配置 | 只看进程存在 |
| Ready=3 但 B 仍缺消息 | 客户端确认点与权威历史 | 继续加 Pod 而不查消息事实 |

调度资源 request 的具体含义和 limit/OOM 留给 12.06；本章先知道**放不下**和**跑起来却不就绪**是两类错误。三副本也可能都在同一 Node，是否跨节点/可用区分散需要后续明确放置策略与验证；绝不从副本数本身推断故障域分散。[12.06 资源与存储设计](../../../src/docs/platform_engineering/curriculum/12_platform/README.md)

## 五、纸上 t0–t4：三副本故障怎样收敛

设未来教学网关的 Deployment 期望 `replicas=3`，**t0** 观察三个 Pod 均 Ready；以下事件只在同一理想教学时钟上排顺序，不代表 Kubernetes 有固定的秒级恢复时间：

```text
t0  spec=3，P1/P2/P3 Ready → 网关三副本纸上就绪
t1  P1 被删除，观察到 Ready=2；旧 WebSocket/进程内状态中断
t2  控制器产生替代 Pod P4，P4 尚未绑定 Node（Pending）
t3  调度器为 P4 找到可行 Node 并绑定
t4  kubelet 启动 P4，应用的就绪检查通过，观察到 Ready=3
```

**t1 到 t4 的平台链路**是“期望副本数恢复”的尝试。本题选择**Pod P1 被删除**，而非仅让其容器暂时不 Ready；后者可能由 kubelet在同一 Pod 内重启容器，不必创建 P4。若 t2 时没有可行 Node，P4 可能长期 Pending；若 t3 后镜像拉取失败，P4 仍无法运行；若运行了但依赖不可用，Readiness 可能不通过。`status` 更新也并非与故障毫秒级同步，读纸上时间线要注明观察时刻。[Kubernetes：Pod Lifecycle](https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/) · [Deployment rollout status](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/)

**t4 Ready=3 仍未完成业务恢复。** 平台还没有证明 P1 里曾接受的 `m-a`、A 的响应是否完整到达、B 原 WebSocket 上的通知有没有缺口。客户端重连后需要稳定消息身份与有权状态查询/补拉；未来 S3 的权威 `m-9/seq9` 则是另一套提议合同。[11.10 逐站恢复门](../../../src/docs/platform_engineering/curriculum/11_reliability/10_incident_response.md)

## 六、平台自愈边界：三个 Pod 不自动实现重复 409

这节有一个容易被忽略的业务反例。当前 S2 教学合同规定**同 ID 重复 POST 返回 409**，但它的成功点仅为**本进程内存**。如果未来把同样的纯内存判重实现复制成三个 Pod，A 的 `m-a` 第一次可能打到 P1，响应丢失后第二次落到 P2 或新建的 P4；另一个进程若不知道 P1 的局部记录，就可能再次受理同 ID。**Deployment 把副本数恢复到 3，并不会自动为应用提供跨 Pod 的唯一性或已确认状态。**[09.02 重复合同](../../../src/docs/platform_engineering/curriculum/09_backend_security/02_http_api_contract.md) · [08.01 部分失败](../../../src/docs/platform_engineering/curriculum/08_distributed/01_system_partial_failure.md)

要将当前 S2 合同移到多副本，必须先设计可验证的**统一消息身份裁决/状态归属**，并评审失败时路由、跨节点重复、进程退出后的未知结果；仅靠“粘性连接”在节点退出后也不能自动恢复丢失的内存事实。未来 S3 若采用教学 DB 的原子身份/会话序号规则，是**待批准的另一方案**，不能因为集群存在就把 `/v1` 的 200 解释成 `stored_in_teaching_db`。即使权威消息已存，B 的设备 ACK/已读仍各要独立证据。[07.12 权威与派生链](../../../src/docs/platform_engineering/curriculum/07_cache_messaging/12_cross_system_consistency_case.md)

因此平台健康与用户结果至少各有一张卡：Deployment/ReplicaSet/Pod/Node/Ready 是**控制面与工作负载状态**；A 的 6 B/409/404/200、未来权威 `m-9/seq9`、B 设备补拉/应用确认是**业务合同**。把两张卡合并成一个“绿色”会掩盖数据重复或消息遗漏。[11.08 SLI 与确认点](../../../src/docs/platform_engineering/curriculum/11_reliability/08_slo_alerting.md)

## 七、先按控制链定位，再判断用户影响

纸上排障可以沿“API 对象 → Deployment/ReplicaSet → P4 Pod → Node/调度 → kubelet/容器 → readiness → 用户请求”读。每站有不同证据和读数；实际环境需要有权限访问，课程不生成或运行 `kubectl` 命令。API server 暴露/保存对象状态，控制器与调度器分别推进副本和位置，kubelet执行 Node 上的 Pod；**任何一站都不替应用判断消息是否持久或设备已处理**。[Kubernetes：Architecture](https://kubernetes.io/docs/concepts/architecture/)

| 纸上问题 | 平台证据 | 业务证据还要什么 |
|---|---|---|
| Ready 从 3 降到 2 | P1 UID/退出时间与 Deployment 状态 | A/B 哪些连接断开、在途请求怎样结束 |
| P4 Pending | 调度原因、Node 资源/约束 | 用户是否已被转到剩余健康 Pod |
| P4 Running 未 Ready | 容器启动/探针/依赖 | 有权 6 B/409/404/200 正反例何时可过 |
| Ready 已回 3 | 新 Pod/探针状态 | 旧消息身份、缺口、未来 S3/B 确认是否对账 |

固定 `openimsdk/open-im-server` 提交 `f6411a8a1a31d3df36f4c2b3ad28481a94141e1f` 的 [`send.go` 选定分支](https://github.com/openimsdk/open-im-server/blob/f6411a8a1a31d3df36f4c2b3ad28481a94141e1f/internal/rpc/msg/send.go#L46-L70)调用 `MsgToMQ` 后返回；[另一 Mongo 消费路径](https://github.com/openimsdk/open-im-server/blob/f6411a8a1a31d3df36f4c2b3ad28481a94141e1f/internal/msgtransfer/online_msg_to_mongo_handler.go#L43-L69)调用 `BatchInsertChat2DB`。两段只支持所读发送/消费的异步边界，不能证明 OpenIM 或本课程项目的真实 Deployment、Node、Pod、副本数、探针或故障后业务结果。[OpenIM 阅读地图](../../../src/docs/platform_engineering/curriculum/im_reference.md)

## 八、22 道分层练习：画一张副本控制链

先把 spec/status、控制器/调度器与业务确认分栏，再展开反馈。

### 基础 1–8：对象和职责

<details><summary>1. `spec.replicas=3` 能证明现在有三个 Ready 吗？</summary>

不能。spec 是期望，Ready 是另行观察的就绪状态。</details>

<details><summary>2. `status` 与 `spec` 分别表达什么？</summary>

spec 描述期望配置，status 汇报控制面/节点观察到的状态。</details>

<details><summary>3. Deployment 直接把 P1 的进程内存复制到 P4 吗？</summary>

不会。它管理副本/模板，替代 Pod 是新生命周期。</details>

<details><summary>4. ReplicaSet 的主要目标是什么？</summary>

按其 selector/模板维持期望的一组 Pod 副本。</details>

<details><summary>5. scheduler 和 kubelet 分别做什么？</summary>

scheduler 给未绑定 Pod 选 Node；kubelet在被选 Node 上运行并汇报 Pod。</details>

<details><summary>6. Pod P1 被替换成 P4，会保留同一 UID 吗？</summary>

不会。新 Pod 是不同对象/UID，可能有新 IP 与进程内存。</details>

<details><summary>7. Pod Running 必然已经对有权用户 Ready 吗？</summary>

不必。应用或依赖可能未通过就绪检查；业务正反例还要另验。</details>

<details><summary>8. 三副本必然分布到三台 Node 吗？</summary>

不必。需要明确放置约束及验证故障域。</details>

### 控制链 9–16：手推 t0–t4

<details><summary>9. t0 期望 3 且 Ready 3，t1 P1 被删除后纸上 Ready 几个？</summary>

在本题观察时刻为 2；状态更新仍是异步的。</details>

<details><summary>10. t2 控制器创建 P4 但它 Pending，能说期望已达成吗？</summary>

不能。对象已存在不等于已调度/运行/Ready。</details>

<details><summary>11. P4 未绑定 Node，优先查哪一类证据？</summary>

调度可行 Node、资源 request 与放置约束，不是重启尚未运行的应用。</details>

<details><summary>12. P4 已绑定但镜像拉取失败，是 scheduler 还没选 Node 吗？</summary>

不是。已过绑定阶段，应查 Node/kubelet 与镜像拉取状态。</details>

<details><summary>13. P4 容器 Running、Readiness 失败，应用可被判业务可用吗？</summary>

不能。先查探针覆盖、配置/依赖，再做有权业务样本。</details>

<details><summary>14. t4 Ready 恢复 3，P1 的 WebSocket 会自动转到 P4 吗？</summary>

不会。旧连接已断，客户端须重连并按合同补拉。</details>

<details><summary>15. 一个 Node 没足够资源，Kubernetes 会保证 P4 仍被调度吗？</summary>

不会。若无可行 Node，P4 可持续 Pending，直到约束/资源变化。</details>

<details><summary>16. Pod 名字看起来相同就代表原进程复活吗？</summary>

不代表。要看对象 UID、创建时间及容器进程生命周期。</details>

### 业务 17–22：自愈没有自动补上消息事实

<details><summary>17. P1 本地受理 m-a 后响应丢失，重试落到 P2 会自动返回 409 吗？</summary>

不能保证。纯本地内存判重不跨 Pod；需统一身份裁决/状态方案。</details>

<details><summary>18. 只用粘性路由可覆盖 P1 故障后的重复身份吗？</summary>

不足。P1 退出后本地内存事实和原连接仍可能丢失。</details>

<details><summary>19. 当前 S2 200 可以因 Deployment 三副本被称为 DB 存储成功吗？</summary>

不能。仍仅本进程内存受理，S3 是独立未来提议。</details>

<details><summary>20. Ready=3 可证明 B 的设备已经处理 m-9 吗？</summary>

不能。设备 ACK/历史缺口有另一证据链。</details>

<details><summary>21. OpenIM 两处固定源码可证明真实 Kubernetes 副本数吗？</summary>

不能。它们只提示所读发送与 Mongo 消费异步边界。</details>

<details><summary>22. 一张可审控制链至少交什么？</summary>

spec/status、Deployment/ReplicaSet/Pod UID、调度与 Node/kubelet、就绪和有权业务正反例，注明未证的消息恢复。</details>

## 本章完成标准与后续路径

能从 `spec.replicas=3` 推到控制器创建、调度器选 Node、kubelet运行和就绪汇报，解释 P1 被 P4 替换为何丢连接/本地内存，并指出跨 Pod 重复 409 的业务缺口，才算完成第一轮。所有 Pod 与时间线均为纸上推演，未运行集群。下一章[12.05 工作负载与服务发现](../../../src/docs/platform_engineering/curriculum/12_platform/05_workloads_service_discovery.md)将按网关、权威存储与后台任务的状态/生命周期选择平台对象。
