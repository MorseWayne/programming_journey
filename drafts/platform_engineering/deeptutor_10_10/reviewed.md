# 10.10 持续交付与版本管理：发布成功为何还要看消息

> DeepTutor 八节初稿经技术与教学审阅后的静态课程。发布阶段、1%→10%→100% 灰度、R9、教学 SQL/事件变更与故障均为**脱敏纸上方案**；没有构建、部署或运行 Go、数据库、Kubernetes、IM、负载或站点。当前 S2 `/v1` 消息 POST 仍是正文非空且最多 **6 UTF-8 字节**、总请求最多 **4096 B**、同 ID 即使同正文重复 **409**、非成员目标隐藏 **404**、`200 accepted_in_memory`；未来 S3 `/v2` 的 `stored_in_teaching_db` 只是[教学提议](../../../src/docs/platform_engineering/curriculum/09_backend_security/12_im_service_capstone.md)，且仍沿用 6 B。R9 的 6→9 B 尚待批准。[09.02 当前 HTTP 合同](../../../src/docs/platform_engineering/curriculum/09_backend_security/02_http_api_contract.md)

## 一、一次 IM 发布至少有四个独立的变更开关

假设想支持 `m-9` 的编辑版本和可见性字段，同时筹备教学 SQL 历史与 outbox，并讨论“你好呀”这类 **9 B** 正文。用户看到的是“发消息、查历史、搜索、收到通知”，工程师看到的则是旧/新客户端、数据库行、事件消费者、WebSocket 长连接与回滚。若把“新镜像已 Ready”写成“消息链路已升级”，就跳过了最可能影响用户的确认点。[07.12 IM 链路](../../../src/docs/platform_engineering/curriculum/07_cache_messaging/12_cross_system_consistency_case.md)

| 变更轴 | 当前/候选 | 本章发布门 |
|---|---|---|
| HTTP 发送合同 | 当前 S2 `/v1` 的 6 B/内存受理 → **拟议** S3 `/v2` 本地 DB 提交 | 新接口/客户端矩阵单独审批，不能暗改 `/v1` |
| R9 内容容量 | 6 B → **待审** 9 B | 未批准前保持旧拒绝；批准后明确目标接口和旧客户端支持窗 |
| 教学 SQL/事件字段 | `messages/outbox` 与 `event_v1→event_v2` 的版本/可见性 | 先扩展数据/读端，再门控写端，按 ID/版本/权限对账 |
| 运行实例 | 旧/新 Go 二进制、网关/消费者混部 | 每阶段健康/业务指标与停止/回退责任 |

先决定哪项需求被批准、哪个接口版本承诺什么，再讨论镜像升级。`event_v2` 线格式不等于 `m-9:v2` 业务编辑；数据库新列、broker 新事件和 A/B 设备实际观察更不是同一个发布按钮。[09.10 四条版本轴](../../../src/docs/platform_engineering/curriculum/09_backend_security/10_protocol_compatibility_rpc.md)

## 二、候选制品、配置和数据迁移要有同一份身份表

10.09 已把提交、CI 检查与候选制品分开。本章再加**部署配置和数据迁移**：一份可复核发布记录至少列源码提交 SHA、Go 工具链与 MVS build list、`.proto`/生成器版本、候选镜像 digest 或等价制品 ID、数据库迁移版本、事件 producer/consumer 版本、功能开关值、被投放的客户端/服务 cohort、开始结束时间、操作者/回退责任和观测链接。一个 Git commit 可以生成不同配置/工具链的制品；同一个镜像也可在不同开关下表现不同。[10.09 CI 与制品](../../../src/docs/platform_engineering/curriculum/10_engineering/09_ci_artifacts.md) · [10.08 依赖与生成链](../../../src/docs/platform_engineering/curriculum/10_engineering/08_dependency_quality_tools.md)

| 身份 | 要回答的问题 | 仍不证明什么 |
|---|---|---|
| 源码 SHA + 生成链 | 本次候选代码/协议源是哪份 | 哪个镜像实际在处理 A 的请求 |
| 镜像 digest/制品 ID | 运行进程由哪份构建产物来 | DB 新列/旧事件是否兼容 |
| 迁移版本与数据水位 | 哪些 SQL 结构/旧行已扩展或回填 | SearchIndex 和 B 设备已追上 |
| 配置/feature flag 快照 | 新生产者、正文容量、路由开关谁打开 | 各客户端都懂新合同 |
| 运行观测 | 该 cohort 的失败、积压、权限拒绝与用户结果 | 未观测到的罕见输入永远安全 |

变更记录要能让未参与发布的人回答“何时允许写新格式、出了问题先关哪一项、谁核对已经写出的数据”。**静态讲义只提供模板**，没有真实镜像、迁移或部署输出可填写。

## 三、扩展→迁移→收缩：数据库与事件要先让旧读者活着

在未来教学 S3 方案中，可先**扩展** SQL schema：为 `message_version/visible` 等新用途引入明确默认/可空策略，并让旧读写路径仍可运行；记录具体 `ALTER TABLE` 子命令、锁等级、表大小、回填资源和失败回退。PostgreSQL 官方文档提醒不同 `ALTER TABLE` 子形式锁级不同，不能把“加列”笼统称为无锁在线变更。[PostgreSQL ALTER TABLE](https://www.postgresql.org/docs/current/sql-altertable.html)

然后升级**读取端**：新 SearchIndex/Notify 消费者能安全理解存量 `event_v1` 与候选 `event_v2`。旧事件缺 `message_version/visible` 时要查权威当前版本/权限或采用可解释的保守拒绝+修复，不能把默认字段当授权。Protobuf 二进制新增字段可能 wire-safe，但旧消费者忽略 `visible` 仍可能泄露消息，忽略 `message_version` 仍可能让迟到 v1 覆盖 v2。等读端、回放和权限负例有证据后，才门控新生产者发 `event_v2`。[Protobuf 兼容规则](https://protobuf.dev/programming-guides/proto3/) · [09.10 旧新端矩阵](../../../src/docs/platform_engineering/curriculum/09_backend_security/10_protocol_compatibility_rpc.md)

**迁移**旧行/派生视图时，用与一致快照配对的增量位置 `S0/L0` 追新写，比较消息 ID、当前版本、会话 `seq`、撤回/删除、成员可见、outbox 意图及索引目标；两边数量一样不代表集合一样。**收缩**旧字段/旧事件读取分支只能在旧客户端支持窗、broker 保留、DLQ/隔离重放、历史回填和回退依赖均有明确收尾证据后进行。若旧数据仍可能从备份/离线客户端回到系统，必须保留相应解释路径或制定受控迁移入口。[06.11 快照增量与对账](../../../src/docs/platform_engineering/curriculum/06_databases/11_replication_migration_reconciliation.md) · [08.10 成员与事件演进](../../../src/docs/platform_engineering/curriculum/08_distributed/10_membership_evolution.md)

## 四、灰度按用户/客户端和业务场景抽样，不只按 Pod 百分比

给一组**仅供演算**的发布阶段：1% → 10% → 100%。每阶段先定义服务实例/用户 cohort、观测时间窗、对照组和停止阈值，不能把这些百分比当生产推荐值。1% 可能完全没遇到旧客户端、`c-g` 热群、中文 6 B 边界、待审 9 B 请求、非成员 `u-c`、B 离线补拉或大群扇出；因此要在隔离验证与目标 cohort 中**刻意覆盖罕见但高风险场景**，而非等随机样本碰到。Google SRE 的 canary 指南强调样本量、时长、流量类型和指标的代表性。[Google SRE Canary Release](https://sre.google/workbook/canarying-releases/)

| 观察面 | 同窗对照与停止信号 |
|---|---|
| 当前 `/v1` 客户端 | 200 `accepted_in_memory`、正文 6 B 拒绝/接受、重复 409、非成员 404 不漂移 |
| 拟议 S3 cohort（若获批准） | DB 已知提交/未知、outbox 最老待发年龄、历史授权可读 |
| 事件/派生 | `event_v1/v2` 解码失败、SearchIndex 的 ID/版本/权限差集、Notify 最老未完成年龄 |
| 设备与体验 | G1/G2 旧 owner 迟到、B 的有权补拉/设备回执、用户报告 |
| 资源与容量 | 新旧实例错误率/尾延迟、数据库锁等待/回填速率、broker/worker 积压 |

停止门要在发布前写，例如“任一非成员读到私有正文立即停止”“同 ID/版本对账出现无法解释的权威缺口即停新写”“关键延迟/错误超过本题约定阈值即退回上阶段”。阈值需由学习者结合实际业务/负载确定，本章不给虚假的生产百分数或秒数。小 cohort 总体错误率低也可能掩盖某个旧客户端全失败；指标必须按版本/路径/用户类型分层，且能归因于此次变更。[11.01 业务指标](../../../src/docs/platform_engineering/curriculum/11_reliability/01_business_measurement.md)

## 五、滚动实例更新 ≠ WebSocket、任务和事件全部排空

Kubernetes Deployment 的 `RollingUpdate` 可渐缩旧 ReplicaSet、渐增新 ReplicaSet，`maxUnavailable/maxSurge` 控制更新期间 Pod 数与可用性预算；其 `rollout undo` 可以回到旧工作负载修订。它管理的是**工作负载实例**，不会替 IM 自动完成旧 WebSocket 连接关闭、未回复 HTTP、N9 worker 租约交接、Kafka/NATS 消费位点或 SQL 事务恢复。[Kubernetes Deployments](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/)

教学发布顺序要给每个进程一个**在途退出合同**：新实例完成依赖/协议/路由就绪检查才接新流量；旧实例停止接新请求，给已有 HTTP/WS 连接与后台任务有界的排空或重连提示；消费组交接时不越过未完成 E9，旧 worker 的 token 过期写被目标拒绝。超时后仍有外部推送结果未知，不因进程被停便当作没发；B 仍可按权限从权威历史补拉。[03.09 I/O 就绪](../../../src/docs/platform_engineering/curriculum/03_systems/09_io_event_notification.md) · [05.01 任务生命周期](../../../src/docs/platform_engineering/curriculum/05_runtime/01_concurrent_tasks_lifecycle.md) · [08.09 任务接管](../../../src/docs/platform_engineering/curriculum/08_distributed/09_reliable_jobs_scheduling.md)

Kubernetes `Ready` 只证明所配置的健康检查通过，不能写成“所有旧客户端能解析新事件”“SearchIndex 已追平”或“B 已读”。发布观测须串到业务确认点。[07.12 IM 确认矩阵](../../../src/docs/platform_engineering/curriculum/07_cache_messaging/12_cross_system_consistency_case.md)

## 六、回退分三层：旧镜像、旧开关、已写出的新事实

**代码回退**可将进程换回旧镜像；**配置回退**可关闭新 `event_v2` 生产/R9 候选开关；**数据/协议回退**却不能靠换镜像自动完成。若新事件已持久写入 broker/DLQ，旧消费者不理解关键版本/可见性，直接回滚会让旧程序以错误规则处理存量新数据。若 S3 SQL 已对 A 承诺 `stored_in_teaching_db`，不能把数据库消息行删掉并宣称“回到 S2”；已发给 B 的提示或设备字节更无法被部署控制器撤回。[09.10 语义兼容与回退](../../../src/docs/platform_engineering/curriculum/09_backend_security/10_protocol_compatibility_rpc.md) · [08.08 外部补偿](../../../src/docs/platform_engineering/curriculum/08_distributed/08_cross_service_transactions.md)

| 回退层 | 可先做的动作 | 仍需的证据 |
|---|---|---|
| 配置/新写入口 | 停候选 producer/功能开关，防继续产生新格式 | 新写确已停止、旧/新读端仍可解释已有数据 |
| 进程制品 | 回到已知可运行二进制或兼容 reader | 旧进程能安全读取已写 event_v2/新列，否则保留新读者 |
| DB/事件数据 | 按新版本/权限对账、必要时正向修复或反向增量 | ID/版本/可见/删除与 outbox 不缺失，不能凭旧快照覆盖新写 |
| 路由/owner | b1 若已由 epoch8/N3 接新写，先围栏并追增量，再发布**更高**新 epoch | 不复用旧 epoch7/N1，不让旧 owner 复活 |

若 R9 **未批准**，本不应有“新接口已接受 9 B”这类事实；若将来获批且真的产生 9 B 正文，回退时旧 6 B 客户端/服务能否读取、转发和展示须预先有兼容矩阵，不得因为旧端会拒绝新发送就以为历史里不存在这些消息。**回滚能力要在开始发布前审**，不能故障时才发现新数据无法被旧程序解释。[08.05 epoch 回退](../../../src/docs/platform_engineering/curriculum/08_distributed/05_partition_rebalancing.md)

## 七、支持窗口、变更记录与固定 OpenIM 证据边界

旧客户端支持到何时、什么版本开始拒绝旧事件、离线设备多久可能重新上线、broker/DLQ 保留与备份恢复窗口多长，都影响何时可以删兼容代码。变更记录要让值班人员知道“这次只改了 schema/reader，还是已经给部分用户打开新 writer”，并提供按 ID/版本/权限对账与事故回退的入口；不能用“发布成功”取代用户可观察结果。发布后继续按 cohort 监控最老待发年龄、缺口修复和旧客户端拒绝率，直到支持窗口结束。[10.11 运行文档设计](../../../src/docs/platform_engineering/curriculum/10_engineering/README.md) · [11.03 可观测性](../../../src/docs/platform_engineering/curriculum/11_reliability/03_logs_metrics_traces.md)

固定 `openimsdk/open-im-server` 提交 `f6411a8a1a31d3df36f4c2b3ad28481a94141e1f` 的 [`send.go` 所述发送路径](https://github.com/openimsdk/open-im-server/blob/f6411a8a1a31d3df36f4c2b3ad28481a94141e1f/internal/rpc/msg/send.go#L46-L70)调用 `MsgToMQ` 后返回；[另一路 MongoDB 消费处理](https://github.com/openimsdk/open-im-server/blob/f6411a8a1a31d3df36f4c2b3ad28481a94141e1f/internal/msgtransfer/online_msg_to_mongo_handler.go#L43-L69)调用 `BatchInsertChat2DB`。两段只支持这些局部代码位置，**不证明 OpenIM 使用本章 Kubernetes 发布配置、教学 SQL、event_v2、R9、S3 或某个真实灰度结果**。要调研真实项目发布，应固定其部署清单/配置/协议依赖/版本与运行记录，来源和时间一起保存。[OpenIM 阅读地图](../../../src/docs/platform_engineering/curriculum/im_reference.md)

## 八、提交一张发布门矩阵，再做 22 道练习

第一遍把 S2、S3、R9、事件字段四轴分开；第二遍交候选制品身份表、扩展→迁移→收缩的旧新端矩阵、分阶段灰度停止门、在途排空与四层回退表。静态纸上例子的“观测结果”一律标未运行；下列习题先答，再展开反馈。

### 基础 1–8：变更边界

<details><summary>1. 当前 `/v1` 的 200 承诺什么？</summary>

`accepted_in_memory`，不承诺数据库持久、broker/设备送达。</details>

<details><summary>2. 拟议 S3 `/v2` 已部署了吗？它的正文上限自动变 9 B 吗？</summary>

未部署；纸上仍沿用 6 B，R9 是另一份待审变更。</details>

<details><summary>3. `event_v2` 与 `m-9:v2` 是同一版本吗？</summary>

不是。前者是事件线格式，后者是消息业务编辑版本。</details>

<details><summary>4. 镜像 digest 可证明数据库回填已完成吗？</summary>

不能。制品身份与数据水位/对账是不同证据。</details>

<details><summary>5. `Ready` 的新 Pod 能证明 B 已读消息吗？</summary>

不能。Ready 只覆盖所配置就绪检查，设备回执另证。</details>

<details><summary>6. PostgreSQL 所有 `ALTER TABLE` 子命令都是无锁的吗？</summary>

不是。锁级按具体子形式评估，不能笼统承诺零影响。</details>

<details><summary>7. 旧 Protobuf 消费者可 parse 新字段，就一定遵守 visible 权限吗？</summary>

不一定。旧逻辑可能忽略字段；需先升级/隔离读端。</details>

<details><summary>8. 1%→10%→100% 是生产推荐灰度比例吗？</summary>

不是。只是纸上阶段，实际比例和观察窗来自业务/负载/风险。</details>

### 灰度与迁移 9–16：看什么才可推进

<details><summary>9. 新 producer 发 event_v2 前，旧消费者最少要满足什么？</summary>

已升级/隔离，或能按安全默认/权威回源理解版本与权限，不能只会解析字节。</details>

<details><summary>10. 只有消息总数相同，能证明 b1 回填正确吗？</summary>

不能。比 ID、seq、当前版本、删除/可见范围、outbox 和派生差集。</details>

<details><summary>11. 1% cohort 没有旧客户端请求，可据此删 v1 支持吗？</summary>

不能。样本未覆盖旧客户端，需专门兼容负例和支持窗口证据。</details>

<details><summary>12. 非成员 `u-c` 读到私有正文，应继续扩灰度观察吗？</summary>

不应。违反安全门，应停相关新写/流量并调查、修复与对账。</details>

<details><summary>13. `maxUnavailable/maxSurge` 会自动排空旧 WebSocket 和 N9 worker 吗？</summary>

不会。实例数控制与连接/任务/消费位点交接要分别设计。</details>

<details><summary>14. 旧 worker 失租后迟到写任务完成状态，需要什么？</summary>

目标端用 owner/token/版本条件拒绝，并另查外部推送是否发生。</details>

<details><summary>15. R9 未批准前，旧 S2 对 9 B 正文应怎样？</summary>

按当前 6 B 上限拒绝，不能因发布比例改变默认合同。</details>

<details><summary>16. `event_v1` 已过 broker 保留，但 DLQ 还有旧事件，可立即删双读？</summary>

不能。隔离/回放窗口仍可把旧格式带回，需先闭环或保留解释路径。</details>

### 回退评审 17–22：旧镜像不是时光机

<details><summary>17. 新 event_v2 已写入 broker，回滚旧镜像就抹掉它了吗？</summary>

没有。旧消费者还可能读到新事件，需保兼容读/停新写/修复。</details>

<details><summary>18. S3 已承诺 SQL 提交，能删消息行假装回到 S2 吗？</summary>

不能。已承诺事实与外部观察不可无记录删除。</details>

<details><summary>19. N3/epoch8 已接收 m-11，可直接恢复旧 N1/epoch7 吗？</summary>

不可。先围栏/反向追新写与对账，再发布更高的新 epoch。</details>

<details><summary>20. 小灰度整体错误率低，能证明热群 c-g 和旧客户端正常吗？</summary>

不能。要分 cohort/业务键/客户端版本看代表性与特定缺口。</details>

<details><summary>21. 固定 OpenIM 两处源码能证明本章发布方案已部署吗？</summary>

不能。只核对所述消息入队返回与另一 Mongo 消费调用。</details>

<details><summary>22. 一份可执行回退计划最少要列什么？</summary>

制品/配置/DB/事件/路由各自的可逆门、先停新写方式、数据差集与权限对账、责任人和剩余未知。</details>

## 本章完成标准与下一步

能不看答案区分 S2/S3/R9/事件字段，写出读端先行的扩展迁移收缩顺序、按 cohort 的灰度停止门和 WebSocket/任务排空责任；能解释旧镜像回滚为何不撤销新数据与外部提示，才算完成第一轮。学习者未来在隔离部署中记录真实制品、迁移、负载与用户结果；本章没有代替执行。下一章 [10.11 技术写作与协作](../../../src/docs/platform_engineering/curriculum/10_engineering/11_technical_writing_collaboration.md) 将把这些发布决策写成可由他人复核的 ADR、运行手册与事故复盘。
