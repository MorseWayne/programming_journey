# 12.05 工作负载与服务发现：网关、存储和后台任务怎样选

> DeepTutor 八节初稿经技术与教学审阅后的静态课程。工作负载、网络入口、数据库、Job 与事件均为**未来教学 IM 的纸上方案**，没有运行 Kubernetes、`kubectl`、Go、IM、数据库、部署或站点。当前 S2 `/v1` 的正文仍非空且最多 **6 UTF-8 B**、原始 HTTP 请求正文最多 **4096 B**、同 ID 重复 **409**、非成员目标隐藏 **404**、成功 `200 accepted_in_memory` 只表示本进程内存受理；未来 S3 `/v2` 的 `stored_in_teaching_db` 是提议且仍为 6 B，R9 6→9 B 待审。[09.02 当前合同](../../../src/docs/platform_engineering/curriculum/09_backend_security/02_http_api_contract.md)

## 一、先看“状态归谁管”，再选 Kubernetes 名词

12.04 已说明 Deployment 会尽力维持 Pod 数，却不会复制 P1 的内存或 WebSocket。现在纸上需要四类未来 IM 工作：`gateway` 提供发送/长连接入口，`transfer` 消费事件并推进派生通知，`db` 保存权威 `m-9/seq9`，`history-migrate` 是有边界的一次性迁移或回填。它们有不同的**生命周期、数据身份、重试责任和发现方式**；不能因为都“跑在容器里”，就全部套 Deployment 或全部套 StatefulSet。[12.04 Pod 替换](../../../src/docs/platform_engineering/curriculum/12_platform/04_cluster_control_model.md)

| 未来角色 | 首先问的业务问题 | 候选控制方式（待审） |
|---|---|---|
| gateway | Pod 换掉后客户端怎样重连？同 ID 409 如何跨 Pod 保持？ | Deployment 维持可替换入口 + Service；业务状态另设计 |
| transfer | 消费者换 Pod 后 offset/分区归属和去重放哪？ | 若检查点/归属在外部，Deployment 可作候选 |
| db | 哪个实例拥有权威数据、卷和故障恢复责任？ | 自管时可评估 StatefulSet + PVC；也可是外部 DB |
| history-migrate | 任务中途失败或重跑会不会双写/漏写？ | Job；应用自己保证幂等、检查点与对账 |

**工作负载对象负责进程的数量/身份/完成条件，不能替业务裁决权威事实。** 如果 S2 的重复 ID 只保存在某个 gateway 本地内存，多建两个 Pod 后就可能破坏 409 合同；如果 S3 未来使用 DB，StatefulSet 也不自动给它事务和副本一致性。[Kubernetes：Workload Resources](https://kubernetes.io/docs/concepts/workloads/controllers/) · [07.12 一致性案例](../../../src/docs/platform_engineering/curriculum/07_cache_messaging/12_cross_system_consistency_case.md)

## 二、Deployment 适合可替换网关，也可承载外部有状态消费者

Deployment 适合描述一组**可按同一模板替换**的常驻 Pod。gateway 即使持有许多 WebSocket，也可以在平台上用 Deployment 管副本；这只意味着 Pod 可被替换，不意味着连接会透明迁移。P1 故障后，新 Pod P4 与旧内存不同，A/B 要重连或有权查询状态；当前 S2 的本地 `m-a` 不会自动变成 P4 的已知消息。[Kubernetes：Deployments](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/) · [12.04 跨 Pod 409 反例](../../../src/docs/platform_engineering/curriculum/12_platform/04_cluster_control_model.md)

一个未来 `transfer` 消费者也可能用 Deployment，**前提**是进度/分区所有权、事件身份和重试责任能在 Pod 替换后由外部权威或协议安全接管。它处理事件 E9 时若崩溃、重读或多副本并行，不能因“Pod 可替换”就宣布恰好一次；应按分区、稳定事件 ID、消费者提交点与派生结果的幂等规则验收。是否需要稳定 Pod 身份，要看其消费协议，而不是看名字里是否有 `msg`。[07.07 重投与去重](../../../src/docs/platform_engineering/curriculum/07_cache_messaging/07_ack_retry_dedup.md) · [08.07 归属与围栏](../../../src/docs/platform_engineering/curriculum/08_distributed/07_coordination_ownership.md)

| Deployment 能做 | 它不会自动做 | IM 验收 |
|---|---|---|
| 补齐期望网关/转发 Pod | 复制旧进程内存、旧连接或旧 offset | A 受理与 B 缺口分别验证 |
| 按模板发布新副本 | 保证旧新事件/客户端版本兼容 | R9 待审、S2 6 B 合同不漂移 |
| 与 Service 配合暴露入口 | 实现跨 Pod 同 ID 唯一性 | 同 ID 重试仍 409 且不覆盖 |

## 三、StatefulSet 给稳定身份和卷关联，不给数据库正确性

StatefulSet 面向需要**稳定唯一网络身份、持久卷关联或有序部署/扩缩**的 Pod 集合。纸上自管 db 若需要每个副本固定的成员身份与专属 PVC，可把 StatefulSet 作为平台候选；它让 Pod 的序号/卷更容易与替代 Pod 对齐。若采用外部数据库服务，则 Kubernetes 里未必需要自建这份 StatefulSet。这里不作产品或采购推荐，只审状态责任。[Kubernetes：StatefulSets](https://kubernetes.io/docs/concepts/workloads/controllers/statefulset/)

**稳定名字/PVC 不是数据库复制协议。** PVC/PV 保留某实例数据文件的身份，不会自动完成 `m-9/seq9` 的事务、主从仲裁、复制确认、备份验证或成员授权。Pod 重建能再次挂同一卷，也不意味着卷中没有半提交数据或客户端可以立刻读历史；仍需数据库自己的 WAL/事务、恢复和访问控制。StatefulSet 的文档也将存储配置、Headless Service 和应用层正确性留给使用者。[Kubernetes：StatefulSet limitations](https://kubernetes.io/docs/concepts/workloads/controllers/statefulset/) · [06.09 日志与恢复](../../../src/docs/platform_engineering/curriculum/06_databases/09_logging_recovery.md)

| 稳定的对象 | StatefulSet 可提供的帮助 | 还需另证 |
|---|---|---|
| Pod 序号/网络身份 | 替代后保留逻辑身份便于发现 | 真实故障期间谁可当权威写者 |
| 与 Pod 对应的 PVC | 数据卷能按身份重新关联 | 数据库事务/恢复/备份与空间 |
| 期望副本/更新顺序 | 平台按策略管理对象 | 应用复制、停写/迁移兼容 |

## 四、Job 可能重跑，一次性任务也要幂等

未来需要迁移表或按会话回填历史时，可用 **Job** 描述“执行一项工作直到满足完成条件”。但 `parallelism=1`、`completions=1` 也**不保证程序只启动一次**：Pod 失败、Node 故障或控制器替换可能使任务再次运行。Job 成功状态表示控制器观察到期望完成，并不证明每条 `m-9` 都已按权限/序号对账。[Kubernetes：Jobs 与重复执行](https://kubernetes.io/docs/concepts/workloads/controllers/job/)

让纸上 `history-migrate` 处理 `c-a` 的一段有权历史：每个回填任务应有稳定范围/版本/身份，重复运行时能检查已完成位置，按事务或幂等写避免双插 `m-9`、跳过 `seq9`、重复发 E9；失败后能重启且有可核对的已处理/未处理边界。不能仅靠 Job 名叫 `once` 就丢掉重复验证。[06.11 迁移对账](../../../src/docs/platform_engineering/curriculum/06_databases/11_replication_migration_reconciliation.md) · [08.09 可靠任务](../../../src/docs/platform_engineering/curriculum/08_distributed/09_reliable_jobs_scheduling.md)

| Job 结果 | 平台可见 | 业务还要核对 |
|---|---|---|
| Pod 执行一次并返回 0 | 一次尝试成功 | 数据范围、权限、计数与权威版本 |
| Pod 失败后重建再执行 | 多次尝试可能存在 | 先前部分提交是否被重复处理 |
| Job `Complete` | 完成条件被控制器满足 | 不等于派生索引/设备 ACK 都追平 |

## 五、Service/DNS 给稳定入口，EndpointSlice 描述可路由后端

Pod IP 可随替换变化。**Service** 可按标签选择一组 Pod，向集群内提供稳定访问对象；集群 DNS 给 Service 生成名称。纸上同 namespace 的 `transfer` 可以用 `gateway` 这样的短服务名；跨 namespace 要写明目标 namespace（例如 `gateway.teaching`），集群域后缀由环境配置，不能硬编码某集群的默认值。Service 不负责把 P1 内存里的 `m-a` 复制给 P4。[Kubernetes：Service](https://kubernetes.io/docs/concepts/services-networking/service/) · [DNS for Services and Pods](https://kubernetes.io/docs/concepts/services-networking/dns-pod-service/)

选中 Pod 后，**EndpointSlice** 记录后端地址/端口和 `ready/serving/terminating` 等状态；常规路由倾向就绪且非终止中的端点，具体还受 Service 选项和代理实现影响，不能把 EndpointSlice 的 ready 理解成 B 设备已处理。Service 名保持时，P1 删除、P4 出现可使后端集合更新；**已经建立在 P1 上的 WebSocket/TCP 连接不会透明转移**，客户端仍要断线重连并补拉。[Kubernetes：EndpointSlices](https://kubernetes.io/docs/concepts/services-networking/endpoint-slices/) · [04.05 长连接生命周期](../../../src/docs/platform_engineering/curriculum/04_networks/05_tcp_connection_lifecycle.md)

| 平台入口 | 稳定了什么 | 没有稳定什么 |
|---|---|---|
| Service 名/DNS | 集群内对某服务的命名/发现 | 单个 Pod IP、已建立 TCP 连接 |
| selector/EndpointSlice | 后端集合可随 Pod 状态更新 | 业务消息身份、去重和历史状态 |
| StatefulSet Headless Service | 按稳定 Pod 身份发现特定副本 | DB 复制/主从协议的正确性 |

## 六、Ingress 处理 HTTP(S) 外部路由，不是任意 TCP 的万能入口

外部 A 若要访问网关，可在纸上画 **A → 外部 HTTP(S) 入口 → gateway Service → Ready gateway Pod**。Kubernetes **Ingress** 描述基于 host/path 的 HTTP(S) 路由到 Service，必须有相应 **Ingress controller** 才会按规则兑现；Ingress 本身不能通用暴露任意 TCP 端口。对于 IM WebSocket 的 HTTP Upgrade、空闲超时与连接排空，需按选用的入口控制器和应用协议另行验证，不能因为 YAML 里写了 Ingress 就宣称长连接稳定。[Kubernetes：Ingress](https://kubernetes.io/docs/concepts/services-networking/ingress/)

内部 `transfer → db` 则通常通过集群内 Service/外部数据库地址和对应权限完成，不必从外部 Ingress 绕一圈。Ingress、Service、Pod 这些平台入口解决寻址与路由；成员权限、S2 同 ID 409、未来 S3 持久确认和 B 设备 ACK 仍归应用/数据协议。若某 Pod 不 Ready，入口更新端点的过程也有观察延迟，不能假设毫秒级零丢包。[12.04 就绪与业务](../../../src/docs/platform_engineering/curriculum/12_platform/04_cluster_control_model.md)

## 七、四个反例检验选型没有偷换业务保证

| 纸上反例 | 平台状态看起来怎样 | 业务缺口 | 需要的验证/修订 |
|---|---|---|---|
| 三个 gateway Deployment Pod 都 Ready | Service 有后端、发送接口响应 | `m-a` 在 P1 内存，重试到 P2 不一定 409 | 跨 Pod 统一身份裁决，验 6 B/409/404/200 |
| db StatefulSet/PVC 都在 | Pod 名/卷还在 | `m-9/seq9` 事务、复制/备份可能未好 | 权威查询、WAL/副本与权限/恢复测试 |
| history-migrate Job `Complete` | 一次任务有成功状态 | 重跑可能双写或遗漏 `seq9` | 稳定范围、幂等写与双向对账 |
| Service DNS `gateway` 稳定 | 新 P4 已加入端点 | 旧 P1 WebSocket 断了，B 可能有缺口 | 重连与有权历史补拉、设备 ACK |

这四行说明**平台状态不是用户结果**。即使选对了资源类型，还要为每个未来 IM 工作定义唯一身份、错误处理、回退/迁移和与 S2/S3/S5 确认点匹配的观察。[11.08 SLI/告警](../../../src/docs/platform_engineering/curriculum/11_reliability/08_slo_alerting.md)

固定 `openimsdk/open-im-server` 提交 `f6411a8a1a31d3df36f4c2b3ad28481a94141e1f` 的 [`send.go` 选定分支](https://github.com/openimsdk/open-im-server/blob/f6411a8a1a31d3df36f4c2b3ad28481a94141e1f/internal/rpc/msg/send.go#L46-L70)调用 `MsgToMQ` 后返回；[另一 Mongo 消费路径](https://github.com/openimsdk/open-im-server/blob/f6411a8a1a31d3df36f4c2b3ad28481a94141e1f/internal/msgtransfer/online_msg_to_mongo_handler.go#L43-L69)调用 `BatchInsertChat2DB`。它们仅支持所读发送与 Mongo 消费分处异步阶段，**不能**据此宣称 OpenIM 或本课程项目使用了本章的 Deployment/StatefulSet/Job/Ingress 拓扑。[OpenIM 阅读地图](../../../src/docs/platform_engineering/curriculum/im_reference.md)

## 八、22 道分层练习：按状态责任选工作负载

先把每题中的**平台对象**和**业务确认点**分开，再展开反馈。

### 基础 1–8：识别对象

<details><summary>1. gateway 长期运行且 Pod 可替换，可考虑哪种工作负载？</summary>

Deployment 加 Service 是候选；连接/消息状态仍需应用处理。</details>

<details><summary>2. StatefulSet 的稳定 Pod 名/PVC 能自动给数据库复制吗？</summary>

不能。复制、仲裁、事务、备份要由数据库系统另证。</details>

<details><summary>3. 一次性历史回填可考虑什么对象？</summary>

Job；它可能重跑，任务要幂等且可对账。</details>

<details><summary>4. Service 与单个 Pod IP 的区别是什么？</summary>

Service 提供稳定服务访问身份，后端 Pod IP 可替换。</details>

<details><summary>5. Ingress 主要描述哪类外部流量？</summary>

HTTP(S) host/path 等路由到 Service，需控制器实现。</details>

<details><summary>6. Ingress 必可直接暴露任意 TCP 端口吗？</summary>

不能。任意 TCP 不是通用 Ingress 语义。</details>

<details><summary>7. 同 namespace 访问 Service 可用短名吗？</summary>

通常可以；跨 namespace 应明确目标 namespace，集群域后缀依环境。</details>

<details><summary>8. 当前 S2 200 代表 B 的设备已收到吗？</summary>

不是。仅本进程内存受理。</details>

### 选型 9–16：平台类型与数据责任

<details><summary>9. transfer 消费者用 Deployment 就可声明恰好一次处理吗？</summary>

不能。仍要定义外部检查点/归属、稳定事件身份、顺序和幂等。</details>

<details><summary>10. 自管 DB 有 PVC，Pod 重建后可以直接宣布 m-9/seq9 正确吗？</summary>

不能。要验证事务/恢复、复制、备份与成员权限。</details>

<details><summary>11. Job `parallelism=1, completions=1` 能保证程序只运行一次吗？</summary>

不能。失败/替换等可使同一程序再次启动。</details>

<details><summary>12. Job Complete 可证明所有 B 设备应用 ACK 吗？</summary>

不能。Job 完成条件与设备结果是两套证据。</details>

<details><summary>13. Service selector 选到三个 Ready Pod，跨 Pod 判重自动共享吗？</summary>

不会。Service 管发现/路由，不提供统一消息身份裁决。</details>

<details><summary>14. P1 被删、P4 替代，原 WebSocket 能迁移吗？</summary>

不能透明迁移。客户端需重连，按有权历史补缺口。</details>

<details><summary>15. EndpointSlice 的 ready=true 等于用户已读吗？</summary>

不等于。它是平台端点状态，用户阅读是独立事件。</details>

<details><summary>16. StatefulSet 一定比外部数据库更适合任何 IM 吗？</summary>

不一定。先审状态/存储/复制与运行责任，本章不替实际环境选产品。</details>

### 故障 17–22：业务反例

<details><summary>17. `m-a` 在 P1 内存受理，重试落 P2 能自动给 409 吗？</summary>

不能保证。若判重只在 P1，本地状态不跨 Pod；要统一身份裁决。</details>

<details><summary>18. headless Service 给 DB 稳定 Pod 身份，能解决 WAL 半提交吗？</summary>

不能。网络身份不替代数据库事务/恢复。</details>

<details><summary>19. 迁移 Job 重跑两次，最先守什么？</summary>

稳定任务范围/身份、幂等写、检查点与对账，避免双插或遗漏。</details>

<details><summary>20. gateway Service DNS 仍解析，旧 TCP 已断，应该怎样判断 B 恢复？</summary>

看客户端重连、有权历史缺口与设备应用确认，DNS 只是入口。</details>

<details><summary>21. OpenIM 两处固定源码能证明它使用本章这些 K8s 对象吗？</summary>

不能。只支持所读发送与 Mongo 消费异步边界。</details>

<details><summary>22. 一份可审工作负载选择表至少交什么？</summary>

角色生命周期、数据/检查点归属、候选控制器、Service/入口与 DNS、Pod 替换反例和分层业务验收。</details>

## 本章完成标准与后续路径

能为 gateway、transfer、db 和一次性迁移分别说明为何选择某种工作负载、哪个状态仍归应用，沿 Service/DNS/EndpointSlice/Ingress 画出外部与内部入口，并用四个反例守跨 Pod 409、DB 权威、Job 重跑与长连接补拉，才算完成第一轮。本页没有部署集群或运行任务。下一章[12.06 资源与持久存储](../../../src/docs/platform_engineering/curriculum/12_platform/06_resources_persistent_storage.md)将进入 request/limit、OOM 与 PV/PVC 的数据身份。
