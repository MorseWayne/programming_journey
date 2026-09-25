# 12.09 发布与回滚：三个网关副本怎样分阶段换制品

> DeepTutor 八节初稿经技术与教学审阅后的静态课程。镜像 D1/D2、配置 K1/K2、Pod、流量、告警和回退均为**虚构纸上方案**；没有运行 Go、IM、Kubernetes、`kubectl`、数据库、发布或站点。当前 S2 `/v1` 仍是正文非空且最多 **6 UTF-8 B**、原始 HTTP 请求正文最多 **4096 B**、同 ID 重复 **409**、非成员目标隐藏 **404**、成功 `200 accepted_in_memory` 只表示本进程内存受理；未来 S3 `/v2` 的 `stored_in_teaching_db` 是提议且仍为 6 B，R9 6→9 B 待审。[09.02 当前合同](../../../src/docs/platform_engineering/curriculum/09_backend_security/02_http_api_contract.md)

## 一、先说清这次究竟发布了哪一轴

假想一份未来 IM 网关镜像从 **D1** 换成 **D2**，D2 仅增加脱敏阶段日志和观测字段，**不改变当前 `/v1` 的 6 B/409/404/200 合同**。为什么要把“仅”写得这么严格？同一系统还可能有配置 K1→K2、未来 S3 的数据库 schema/权威数据、`event_v1→event_v2`、旧客户端支持窗口，以及 R9 的 6→9 B 待审需求。若一次发布同时改这些轴，回滚时无法靠“把网关镜像换回 D1”还原数据和客户端已经看见的行为。[10.10 四轴发布门](../../../src/docs/platform_engineering/curriculum/10_engineering/10_continuous_delivery_versions.md)

| 变化轴 | 本章 D1→D2 是否改变？ | 若将来改变还要查什么 |
|---|---|---|
| 网关镜像/代码 | 是，只改变教学日志/观测 | digest、目标平台、当前 HTTP 合同回归 |
| 运行配置 K | 否，维持 K1 | env/ConfigMap/Secret 版本与生效 Pod |
| DB schema/权威数据 | 否，S3 仍提议 | 扩展迁移收缩、旧代码可读性与回退窗口 |
| 事件格式/旧客户端 | 否 | 双读、回放、协议兼容与支持期限 |
| R9 6→9 B | **未批准，不启用** | 若获批再定新版本合同和数据兼容 |

12.01 已教“tag 可漂移，digest 才能核对镜像内容”；12.08 已教“Pod Ready 不等于旧 WebSocket 排空”。本章把这些条件连成**发布候选→小范围观察→扩大/停止→代码/配置/数据分别回退**的决策链，仍只写纸上教材。[12.01 制品身份](../../../src/docs/platform_engineering/curriculum/12_platform/01_runtime_artifacts.md) · [12.08 探针与排空](../../../src/docs/platform_engineering/curriculum/12_platform/08_startup_probes_exit.md)

## 二、滚动更新手算 `maxSurge` 与 `maxUnavailable`

纸上有 **3 个**网关副本，Deployment 滚动策略选 `maxSurge=1`、`maxUnavailable=0`。前者允许控制器在期望数 3 之外额外创建一个非终止中的候选 Pod，后者要求受控滚动时可用副本目标至少保持 3；因此理想步骤是先让 D2 新 Pod **P4** 调度、启动并 Ready，再按 12.08 的门让旧 D1 **P1** 摘流。平台不会把旧 WebSocket 直接迁到 P4。[Kubernetes：Rolling Update](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/)

| 纸上状态 | 非终止中的副本目标 | 可用目标 | 不能从数字推出 |
|---|---:|---:|---|
| 更新前 | 3 个 D1 | 3 | 未来设备已 ACK |
| 增加 P4 | 最多 4 个 D1/D2 | 至少 3 | P4 必能被 Node 放下或已 Ready |
| P4 Ready 后摘 P1 | 控制器再推进旧新比例 | 维持受控更新门 | P1 旧连接已排尽、m-a 已持久 |

这些是**滚动预算目标**，不是所有故障条件下的 100% 可用性保证：Node 突然失效时可用数仍会掉；终止中的旧 Pod 可能尚未完全消失，使实际看到的 Pod 对象数超过 `3+1=4`；若没有额外 CPU/内存 requests 空间，P4 会 Pending，发布可能停住。此时不应为了让进度条向前而盲删旧 P1，否则可能连 `maxUnavailable=0` 的初衷也破坏。[Kubernetes：Deployment terminating Pods](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/) · [12.06 调度资源](../../../src/docs/platform_engineering/curriculum/12_platform/06_resources_persistent_storage.md)

**Ready 也只反映探针定义。** P4 的 `/readyz` 绿，不证明 9 B 当前拒绝、同 ID 跨 Pod 必 409、`u-c` 非成员必 404；这些还要按业务合同用有权虚构请求逐项审。[12.04 控制面/业务两张卡](../../../src/docs/platform_engineering/curriculum/12_platform/04_cluster_control_model.md)

## 三、蓝绿与金丝雀：百分比的分母先说清

**蓝绿**在纸上并行准备 D1 旧组与 D2 新组，再切入口；它可让镜像回退路径清楚，却多占一组资源。切走**新连接**后，原来落在蓝组 P1 的 WebSocket 仍挂在 P1，除非应用按协议有界摘流；立即删蓝组会让 B 大量断线/补拉。**金丝雀**是将变更在有限时间与有限范围内暴露给一部分请求/用户，并与 D1 对照观察，决定是否继续。[Google SRE Workbook：Canarying Releases](https://sre.google/workbook/canarying-releases/)

对长连接 IM，**1% 请求、1% 新建连接和 1% 用户**不是一个分母。设纸上某观察窗有 **1,000 次新握手**，计划 10% 导向 D2，目标约 **100 次新握手**；若重试/连接保持时间不同，实际 D2 收到的 HTTP 请求数、活跃连接数、群消息数未必也占 10%。更不能把“三副本中一台 D2”当成准确 1% 金丝雀；若没有具备权重/用户粘性能力的入口与曝光计数，只能说“某些连接去了 D2”，不能报精确百分比。[11.07 开闭环/实际负载](../../../src/docs/platform_engineering/curriculum/11_reliability/07_load_testing_capacity.md)

| 纸上策略 | 它便于观察什么 | IM 特别要测什么 |
|---|---|---|
| 滚动 | Pod 模板逐步替代，平台状态明确 | 旧连接排空、P4 资源与跨 Pod 重试 |
| 蓝绿 | D1/D2 并行，切换入口 | 旧组长连接余留、两组资源成本与数据兼容 |
| 金丝雀 | D2 部分有限时间对照 D1 | 实际请求/连接/用户曝光、群热点、回放窗口 |

观察窗要覆盖需要判断的行为：S2 首发/重复、非成员拒绝、旧端混部、WebSocket 重连；未来若已批准 S3/Event 变更，还要覆盖事件消费与 B 离线补拉。几分钟探针绿色不能证明 25 小时离线恢复路径，但也不能因此每次发布都无期限等待；业务负责人应先明确目标风险、观察门与待后验项。[09.10 旧新端混部](../../../src/docs/platform_engineering/curriculum/09_backend_security/10_protocol_compatibility_rpc.md)

## 四、多轴兼容：先让旧新版本共存，再收缩

当未来要引入 S3 数据库、事件新格式或 R9 时，**镜像 D、配置 K、数据库 schema/数据、事件格式、客户端版本**各有自己的回退方向。数据库常用“先扩展让旧新代码都能读→迁移/对账→确认支持窗口→收缩旧路径”的顺序；事件格式变更要管 broker、DLQ、备份里的旧 `event_v1` 回放；客户端旧版本仍在线时要检查请求与回应语义。不能用一个 Helm/Deployment 修订号代替五份兼容证据。[10.10 扩展迁移收缩](../../../src/docs/platform_engineering/curriculum/10_engineering/10_continuous_delivery_versions.md) · [09.10 协议矩阵](../../../src/docs/platform_engineering/curriculum/09_backend_security/10_protocol_compatibility_rpc.md)

当前 `/v1` 仍最多 6 B；若配置 K2 暗中把它改成 9 B，就是破坏现行合同，不能叫“灰度 R9”。未来 `/v2` `stored_in_teaching_db` 若获批，也不能把其提交语义直接塞进 `/v1` 的 200。即使 D2 只有日志变化，也要防止错误镜像/配置组合意外触发这些更大的行为变化。[10.12 R9 影响图](../../../src/docs/platform_engineering/curriculum/10_engineering/12_maintainability_assessment.md)

| 将来才可能改变的内容 | 旧版本还需读什么 | 回退难点 |
|---|---|---|
| S3 DB schema/权威消息 | 旧代码读新旧字段与已写消息 | 数据/模式可能不能简单反向删列 |
| `event_v2` | 老消费者/重放工具识别旧新事件 | 已发布事件、DLQ 与派生结果不会随镜像撤销 |
| R9 9 B 正文 | 老客户端/旧 `/v1` 仍守 6 B | 已合法接纳的 9 B 数据不能靠改回常量消失 |
| 网关 D2 日志字段（本章） | D1/D2 观测可比较 | 指标标签/采样变化也可能误导发布门 |

## 五、每一档都看“平台+业务+曝光”三种证据

本章可写一个**待审的纸上计划**：先 D1 基线，再 D2 小范围（例如计划 10% 新握手），之后逐步增加到 50%/100%；每档都记录**实际 D1/D2 镜像 digest、配置版本、Pod/EndpointSlice、请求/连接/用户曝光、A 发送与 B 重连结果、错误/超时/积压**。档位不是已经执行的百分比，也不是推荐线上阈值。指标的窗口、分母和可接受门由真实业务和运行目标另审。[11.08 SLI/预算](../../../src/docs/platform_engineering/curriculum/11_reliability/08_slo_alerting.md)

| 门 | 本章 D1→D2 至少要过的纸上断言 | 失败时动作 |
|---|---|---|
| 制品/配置 | D2 digest、平台、K1 与实际运行 Pod 可对账 | 停止扩大，查错误组合 |
| 平台 | 新 Pod 可调度/Ready，旧 Pod 按 12.08 排空 | 暂停滚动，保留可用旧副本 |
| 当前 `/v1` | 6 B 合法、9 B 仍拒绝、同 ID 409、非成员 404、200 仅内存受理 | 停扩并核对请求实际落到哪个 Pod/版本 |
| 用户体验 | A 首发回应、B 重连/补拉、拒绝/超时/积压不恶化 | 按预案回到安全档，先界定数据事实 |
| 未来合同 | 本章没有启用 S3、R9 或 event_v2 | 若发现意外启用，停止并按独立轴评审 |

跨 Pod 409 若在金丝雀阶段失败，**不一定是 D2 新引入的缺陷**：当前纯内存 S2 多副本本来就可能无法全局判重。应立刻停止扩量并比对 D1 控制组、路由和消息身份，不能凭时间先后给 D2“定罪”，更不能把两次受理记录直接当同一业务消息正确送达。[12.04 跨 Pod 反例](../../../src/docs/platform_engineering/curriculum/12_platform/04_cluster_control_model.md)

## 六、`rollout undo` 只回 Pod 模板修订

Kubernetes Deployment 的历史修订与**Pod 模板**变化有关；`rollout undo` 可将 Deployment 的 Pod 模板回到某个旧修订，**不会自动恢复 ConfigMap 当前值、数据库 schema/已写数据、broker 已发事件、客户端安装版本**。仅扩缩副本也未必产生新的 Pod 模板修订。若 K1→K2 是单独改 ConfigMap 对象、而非改 Pod 模板引用，执行 Deployment 回退也不保证 K1 回来；若 K2 经环境变量进入 Pod，旧 Pod 内变量又不会自动热更新。[Kubernetes：Deployment Rollback](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/) · [ConfigMap updates](https://kubernetes.io/docs/concepts/configuration/configmap/)

| 回退轴 | 平台动作最多能覆盖什么 | 本章必须另验什么 |
|---|---|---|
| D2→D1 代码/镜像 | Deployment 模板引用旧 digest | 旧镜像能否读 K2/新数据/旧事件？ |
| K2→K1 配置 | 受控恢复配置来源并刷新有效 Pod | env/卷生效、秘密/权限窗口 |
| DB schema/数据 | 数据迁移/补偿计划另执行 | 已接纳消息不能凭回镜像撤销 |
| 事件/客户端 | 消费与支持窗口分别治理 | DLQ/备份回放、旧端请求仍怎样解释 |

如果新数据已被合法接纳，旧 D1 无法理解它，“回退代码”可能比继续在 D2 上修复更危险。要在发布前就证明**前向/后向可读性**，或给出有权限的前滚修复/暂停写入/数据对账门；不把 `kubectl rollout undo` 当“一键撤销整个业务世界”。[10.10 数据与事件回退](../../../src/docs/platform_engineering/curriculum/10_engineering/10_continuous_delivery_versions.md)

## 七、纸上 T0–T4：停在错误出现处，不虚构发布成功

一条有边界的**虚构时间线**：

```text
T0  D1/K1 三 Pod Ready，当前 /v1 正反例作为基线
T1  评审 D2 digest：只改脱敏日志，K1/S2 合同不变
T2  按 surge 预算创建 P4，但 Node 无额外 requests 空间 → P4 Pending
T3  在容量条件变得可行后 P4 才可能 Ready，P1 再按摘流门退出
T4  某跨 Pod 同 ID 重试未得预期 409 → 停止扩大，查 D1 控制组/路由/身份
```

T2 不应靠强删 P1 制造“可用容量”，否则可能让长连接提前断开并使可用副本下降。T3 只是**条件推演**，不是本仓库实际扩容或部署。T4 更不是“已经定位 D2 bug”；它可能揭示 S2 本地判重与多副本平台的旧设计缺口。先固定同 ID 在哪个 Pod 首次受理、回应是否丢失、后续命中了哪个 Pod；不能把 409 改成 200 以掩盖事实。[12.06 requests 调度](../../../src/docs/platform_engineering/curriculum/12_platform/06_resources_persistent_storage.md) · [09.04 响应丢失](../../../src/docs/platform_engineering/curriculum/09_backend_security/04_request_pipeline.md)

固定 `openimsdk/open-im-server` 提交 `f6411a8a1a31d3df36f4c2b3ad28481a94141e1f` 的 [`send.go` 选定分支](https://github.com/openimsdk/open-im-server/blob/f6411a8a1a31d3df36f4c2b3ad28481a94141e1f/internal/rpc/msg/send.go#L46-L70)调用 `MsgToMQ` 后返回；[另一 Mongo 消费路径](https://github.com/openimsdk/open-im-server/blob/f6411a8a1a31d3df36f4c2b3ad28481a94141e1f/internal/msgtransfer/online_msg_to_mongo_handler.go#L43-L69)调用 `BatchInsertChat2DB`。两段只说明所读发送与 Mongo 消费异步边界，**不证明**上游或本项目真实使用 D1/D2、滚动参数、金丝雀、数据库回滚或设备交付。[OpenIM 阅读地图](../../../src/docs/platform_engineering/curriculum/im_reference.md)

## 八、22 道分层练习：交一张发布/回退决策卡

先将平台变化和用户承诺分栏，再展开反馈。

### 基础 1–8：辨认发布轴

<details><summary>1. 本章 D1→D2 计划改变当前 `/v1` 正文上限吗？</summary>

不改变。D2 只作教学日志/观测改进，旧上限仍 6 UTF-8 B。</details>

<details><summary>2. R9 9 B 已批准、可由配置启用吗？</summary>

没有。R9 待审，旧 `/v1` 不能被偷偷放宽。</details>

<details><summary>3. `maxSurge=1` 对期望 3 副本表示什么？</summary>

受控滚动可额外创建一个非终止中的候选 Pod，需可调度资源。</details>

<details><summary>4. `maxUnavailable=0` 能保证 Node 突然故障时 Ready 永远是 3 吗？</summary>

不能。它是受控滚动预算，不是所有外部故障的绝对可用保证。</details>

<details><summary>5. 一台 D2 Pod/共三台就是 1% 用户金丝雀吗？</summary>

不是。请求、连接、用户曝光各有分母，须路由能力和实际计数。</details>

<details><summary>6. 蓝绿切新连接后旧 WebSocket 自动迁到绿组吗？</summary>

不会。旧组连接需有界摘流、客户端重连与有权补拉。</details>

<details><summary>7. `rollout undo` 会自动回滚数据库已写消息吗？</summary>

不会。Deployment 回退仅涉及相应 Pod 模板修订。</details>

<details><summary>8. 当前 S2 200 表示 B 设备已收到吗？</summary>

不表示，仅是本进程内存受理。</details>

### 推导 9–16：金丝雀与兼容矩阵

<details><summary>9. 纸上 1000 次新握手，计划 10% 去 D2，目标约多少？</summary>

约 100 次新握手；真实请求/用户占比仍需另计。</details>

<details><summary>10. P4 因 Node 无 requests 空间 Pending，应强删 P1 吗？</summary>

不应为推进进度盲删。先保留旧可用副本，查资源与发布门。</details>

<details><summary>11. D2 Ready 但接纳旧 `/v1` 9 B，能继续扩量吗？</summary>

不能。违反当前 6 B 合同，应停扩并核对镜像/配置/路由。</details>

<details><summary>12. 更新 ConfigMap 对象就必产生 Deployment 修订吗？</summary>

不必。修订与 Pod 模板变化有关；env 旧 Pod 也不会自动热更新。</details>

<details><summary>13. D2 发出 event_v2 后回 D1，旧消费者自动能读吗？</summary>

不能假定。要审事件格式、broker/DLQ/备份回放与双读窗口。</details>

<details><summary>14. 新数据有 9 B 正文，改回 6 B 常量可使其“从未存在”吗？</summary>

不能。只有 R9 获批后才可能合法产生，回退须能解释已接纳数据。</details>

<details><summary>15. 同 ID 跨 Pod 未返回 409，能立即证明是 D2 引入吗？</summary>

不能。可能是旧 S2 本地判重的多副本缺口，须对照 D1 和请求路由。</details>

<details><summary>16. 蓝绿两组并行的主要代价至少是什么？</summary>

额外网关/连接/网络容量与旧连接摘流时间，另有数据兼容责任。</details>

### 决策 17–22：停止与回退

<details><summary>17. 平台 Ready 全绿，仍须哪几个当前业务反例？</summary>

6 B 合法、9 B 当前拒绝、重复 409、非成员 404、200 仅内存受理。</details>

<details><summary>18. Config K2 已变，回退 D1 后为什么仍可能失败？</summary>

D1 可能不兼容 K2；ConfigMap 值也不会随 Pod 模板 undo 自动还原。</details>

<details><summary>19. 何时应选择前滚修复而非立即代码回退？</summary>

当旧代码无法安全解释已写新数据/事件时，需按预案停写、对账并评审兼容修复。</details>

<details><summary>20. 只看金丝雀请求 P95 就够吗？</summary>

不够。还要看实际连接/用户曝光、拒绝/超时、重连/积压与确认点。</details>

<details><summary>21. 两处 OpenIM 固定源码能证明真实金丝雀比例或回滚方案吗？</summary>

不能。只支持所读发送与 Mongo 消费的异步边界。</details>

<details><summary>22. 一张可审发布卡至少交什么？</summary>

制品 digest/配置和数据/事件/客户端轴、滚动预算、实际曝光、现行合同与用户门、停止/回退各轴及未证项。</details>

## 本章完成标准与后续路径

能手算三副本的 surge/unavailable 预算，区分金丝雀请求、连接和用户曝光，说明 P4 Pending 时为何不能盲删 P1，并为 D1/D2、K1/K2、数据/事件/客户端分别写停止与回退门，才算完成第一轮。本章未发布任何制品。下一章[12.10 扩缩容与故障域](../../../src/docs/platform_engineering/curriculum/12_platform/10_autoscaling_fault_domains.md)将分析指标滞后、节点/可用区故障域和重连尖峰的 N−1 余量。
