# 13.04 架构风格与边界：IM 拆服务前先算事务和故障代价

> DeepTutor 八节初稿经技术与教学审阅后的静态课程。架构方案、负载和故障时间线均为**虚构纸上比较**；没有运行 Go、IM、数据库、压测、部署或站点。当前 S2 `/v1` 正文非空且最多 **6 UTF-8 B**、原始 HTTP 请求正文最多 **4096 B**、同 ID 重复 **409**、非成员隐藏 **404**、成功 `200 accepted_in_memory` 只代表本进程内存受理；未来 S3 `/v2` 的 `stored_in_teaching_db` 尚是提议且仍为 6 B，R9 的 6→9 B 待审。以下 `m-9/seq9/E9` 均属未来候选模型。[09.02 当前合同](../../../src/docs/platform_engineering/curriculum/09_backend_security/02_http_api_contract.md)

## 一、先把四条边界分开，再说“单体”或“微服务”

13.01 的问题是 A 发送后 B 离线 25h 仍希望有权找回；13.02 定义了消息、游标与设备状态；13.03 划出 Go 模块的公开合同。**架构风格**再问：这些责任放在同一代码库、同一进程、同一权威数据库、还是不同故障域？四个答案不必相同。一个 Go 进程可以有清晰的多个业务包并依赖外部 DB；两个独立服务也可以错误地共用一张表，形成隐形耦合。[Martin Fowler：Monolith First](https://martinfowler.com/bliki/MonolithFirst.html)

| 边界 | 要回答的问题 | 不能由它直接推出 |
|---|---|---|
| 代码模块 | Send、History、Membership、Transfer 谁暴露什么接口？ | 一定是独立进程或独立团队 |
| 部署单元 | 哪些代码一起发布、扩缩、回滚？ | 各自有独立数据权威 |
| 数据权威/事务 | `m-9/seq9` 和成员资格由谁确认？哪些写入可原子？ | B 设备已经收到或读过 |
| 故障域 | 哪个进程/Node/依赖失败会连带影响谁？ | 多服务自然高可用，或单体必然单点 |

把某个 HTTP handler 移到另一个容器，增加的是网络和部署边界，**不会自动**产生持久权威、幂等、成员授权或设备补拉。反过来，同一进程的清晰模块也可用不同资源策略和外部队列完成异步工作，只是独立扩缩与发布的自由度有限。先根据用户承诺和团队/负载证据定位边界，不按 Pod 或仓库数评优劣。[Martin Fowler：Microservice Trade-Offs](https://martinfowler.com/articles/microservice-trade-offs.html)

## 二、模块化单体、分层、事件与服务是不同维度

**模块化单体**表示应用作为较粗的单个部署单元，内部仍按 Send/History/Transfer 等职责和信息隐藏组织。**分层**描述依赖方向，例如 HTTP 入口→应用用例→领域规则，存储/事件适配器实现内层需要的端口；分层可以在单体，也可以在每个服务内部。**事件驱动**描述某些状态变化经事件异步传播；单体可向外部 broker 发布事件，也可内部异步处理。**独立服务**意味着独立部署与网络通信，通常还追求清楚的数据所有权，但不是“每个包单独起进程”。[Fowler：Microservices](https://martinfowler.com/articles/microservices.html) · [13.03 模块接口](../../../src/docs/platform_engineering/curriculum/13_architecture/03_modules_information_hiding.md)

| 风格/选择 | 可能获得的能力 | 立即引入的责任 |
|---|---|---|
| 模块化单体 | 同一发布节奏；调用与调试较直接；若用同一 DB，可在明确范围内维护原子不变量 | 包边界要自律；整体扩缩/回滚；外部 DB/网络故障仍在 |
| 分层 | 限制依赖方向，保护业务语义 | 多一层若仅转发，会加认知与修改成本 |
| 异步事件 | 写入与后续派生可解耦、削峰或重放 | 积压、重复、顺序、恢复与观察窗口需设计 |
| 独立服务 | 某些责任可独立发布、扩缩或隔离故障 | 远程超时、协议版本、授权、数据一致性和运维成本 |

Fowler 的“Monolith First”讨论在边界还不稳定时先形成模块的理由；他的权衡文章也指出服务拆分可能带来独立部署收益与分布式成本。**它们是分析材料，不是本课程的一刀切结论**。若已经有多个团队、稳定的数据所有权和独立扩缩证据，较早分服务也可能合理；若只有一个学习者和一条当前内存受理路径，先画十几个服务很难解释新增的用户收益。[Fowler：Monolith First](https://martinfowler.com/bliki/MonolithFirst.html) · [Microservice Trade-Offs](https://martinfowler.com/articles/microservice-trade-offs.html)

## 三、让同一条消息走三种纸上方案，逐层检查 A 与 B

先固定对照问题：A 向 `c-a` 发一条未来候选 `m-9`；B 一台设备离线 25h；教学 broker 只保留 24h。对每种方案都问 A 何时收到什么回执、`m-9/seq9` 由谁成为权威、E9 发布失败如何恢复、B 从哪里有权按序补缺。这样不会把“我们拆成三个服务了”误当结果。[13.01 用户旅程](../../../src/docs/platform_engineering/curriculum/13_architecture/01_problem_stakeholders.md) · [07.12 长离线补拉](../../../src/docs/platform_engineering/curriculum/07_cache_messaging/12_cross_system_consistency_case.md)

| 纸上方案 | A 的确认点 | 权威与 B 25h 后补拉 | 最大未解决问题 |
|---|---|---|---|
| A：当前 S2 单进程内存受理 | 当前 `/v1` 200 仅本进程内存 | 当前**没有**权威 `seq9` 或长离线补拉承诺 | 进程更替、跨副本、设备恢复均未被 200 保证 |
| B：未来模块化单体 + 教学 DB | 若经审阅的 `/v2` 写入成功，才可提议 `stored_in_teaching_db` | DB 形成 `m-9/seq9`，未来按成员权限从权威历史补拉 | DB→E9 异步边界、去重与部署扩缩要设计 |
| C：未来粗粒度 Send/Transfer 独立服务 | 与 B 一样必须以 Send 权威写入结果定义，不因 RPC/队列存在而升级 | Send/History 的数据归属及授权明确后再补拉 | 跨服务超时、事件顺序/重投、版本与值班增加 |

方案 B/C 都是**尚未实施的教学比较**。方案 B 不表示“一个进程内所有数据就自动可靠”：DB 事务、至少覆盖待审离线窗口的历史保留、备份、权限、迁移和进程恢复仍需证据。方案 C 也不表示“异步 Transfer 消费了就等于 B 收到”：E9、P0 offset42、B 指定设备 ACK 是不同状态。任何方案都不能借 R9 未批直接接纳 7 B 旧 `/v1` 消息。[13.02 多轴状态](../../../src/docs/platform_engineering/curriculum/13_architecture/02_domain_state_modeling.md)

## 四、同一 DB 的原子范围与跨 broker 的边界

在**未来候选**中，若消息身份去重、会话序号分配和一条“待发布 E9”的记录都位于同一权威 DB 的可用事务边界，可以设计成一次原子提交：要么这些本地事实一起成立，要么一起不成立。这里的“待发布记录”是 **transactional outbox 模式的候选**，没有在当前 S2 或固定 OpenIM 两处代码中得到实现证据。它仍不能让 DB 事务天然覆盖外部 broker 与 B 设备。[Chris Richardson：Transactional Outbox](https://microservices.io/patterns/data/transactional-outbox) · [06.07 事务](../../../src/docs/platform_engineering/curriculum/06_databases/07_transactions_anomalies.md)

纸上故障线：T0 DB 提交 `m-9/seq9` 与待发 E9；T1 中继向 broker 发布 E9；T2 中继在标记完成前崩溃；T3 重启后再次发布同一 E9。此时**可能有两次事件投递、仍只有一条权威消息**。消费者需要按稳定事件/消息 ID 做重复处理规则；A 的 DB 存储确认不应被回写成“设备已收”。若 T0 根本没提交，后续不得凭一条孤立事件造出权威消息。模式的可行性、顺序、监控和故障验证均取决于具体设计。[Transactional Outbox 原模式](https://microservices.io/patterns/data/transactional-outbox)

拆成多个独立服务后，如果本来需要一次操作改两份权威状态，就要明确**跨边界一致性**：改业务规则避免原子联动、用事件和幂等重试、设计补偿，或在适用环境评估跨资源事务及其可用性/耦合代价。两阶段提交并非逻辑上不可能，但不能默认所有 DB/broker 都支持、也不能免掉运维成本。要写出部分成功时用户看见什么、谁修复，而不是只写“最终一致”。[Fowler：Microservice Trade-Offs](https://martinfowler.com/articles/microservice-trade-offs.html) · [08.08 跨服务事务](../../../src/docs/platform_engineering/curriculum/08_distributed/08_cross_service_transactions.md)

## 五、同步少一步队列，异步少一次等待，各有故障账

同步调用的调用方能在一次请求中拿到下游返回，但远程调用有网络时延、超时和**结果可能已执行却响应丢失**的部分失败；同步链路越长，某个依赖慢/不可用影响当前请求的机会越大。异步事件可让发送权威写入后把后续转发延后、在突发时缓冲，但代价是积压、重复、乱序、权限变化与恢复进度要另观测。对 IM 来说，“更快给 A 一个 200”若只是把确认点前移，不能冒称“B 更快收到”。[Fowler：Microservice Trade-Offs](https://martinfowler.com/articles/microservice-trade-offs.html) · [08.01 部分失败](../../../src/docs/platform_engineering/curriculum/08_distributed/01_system_partial_failure.md)

| 观察点 | 当前 S2 | 未来候选 S3 与异步转发 |
|---|---|---|
| A 收到的成功 | `200 accepted_in_memory` | `/v2` 若经审阅才可承诺 `stored_in_teaching_db` |
| 权威消息 | 本课程当前未建立持久权威 | DB 的 `m-9/seq9` 待实现、待验证 |
| E9 / broker | 当前 200 不可据此推断 | E9 可重投，broker 仅持传输记录，不替代权威 |
| B 设备 | 当前无设备 ACK 承诺 | 各设备确认/阅读另建协议与观测 |

B 离线 **25h** 而教学 broker 留 **24h** 的反例逼出数据来源：即使 Transfer 服务独立扩了十倍，过期事件仍不能从 broker 补全；未来需在权威 DB **确实保留该段历史**且成员规则允许时，按会话 `seq` 补拉。由此可见，**独立扩容解决某类负载，不替代消息保证定义**。[11.12 容量账本](../../../src/docs/platform_engineering/curriculum/11_reliability/12_capacity_cost_decision.md)

## 六、负载、变化与团队证据决定何时值得独立部署

用 11.12 的**纸上条件**：10,000 条设备连接中 2% 活跃、每活跃连接平均 0.1 条入站/s，得到 `10,000×0.02×0.1=20` 条入站/s；若未来每条恰好 50 目标成员×2 设备且无过滤重试，条件派生 `20×50×2=2,000` 个设备任务/s。连接态、权威消息写入、群扇出、长离线补拉是四种工作量，不能因入站只有 20/s 就认定网关或转发都闲，也不能把 2,000 纸上任务说成当前 S2 已测吞吐。[11.12 单位算式](../../../src/docs/platform_engineering/curriculum/11_reliability/12_capacity_cost_decision.md)

如果未来压测证明 Transfer 的 CPU/队列需求与 Send 的权威写入需求明显分离，独立扩缩可能有收益；如果瓶颈是共享 DB、热群单分区或重连风暴，拆进程并不会自动把瓶颈拆掉。独立发布也需要证据：是否真的有不同负责团队、变更频率、兼容边界和可独立回退的合同？若发布虽分开却必须同时改共享表，独立性只在部署图上存在。[12.10 扩缩容](../../../src/docs/platform_engineering/curriculum/12_platform/10_autoscaling_fault_domains.md) · [13.03 变化冲击](../../../src/docs/platform_engineering/curriculum/13_architecture/03_modules_information_hiding.md)

团队与运维能力同样是约束：谁值班、谁追跨服务 trace、谁负责死信/积压、谁恢复 DB→E9、谁协调旧客户端。服务越多，身份、配置、网络策略、版本和故障组合通常越多。只有把这些成本与用户收益放在同一张卡上，才能说“值得拆”；小团队不应为了风格名称承担没有证据支持的运行复杂度。[Fowler：Microservice Trade-Offs](https://martinfowler.com/articles/microservice-trade-offs.html)

## 七、用方案矩阵和停止门作决定，迁移留给后续章节

比较候选时，先固定相同用户目标和确认点，再列**各方案必须新建的失败处理与运维能力**。下表只是教学评审，不代表选择或部署。[13.01 可审目标](../../../src/docs/platform_engineering/curriculum/13_architecture/01_problem_stakeholders.md)

| 候选 | 有利条件 | 新增成本/风险 | 进入下一阶段前的证据门 |
|---|---|---|---|
| A：清晰模块的单部署单元 | 边界仍在学习；一个团队；希望先核业务模型与事务 | 整体发布、部分资源难独立扩；模块自律不足会粘连 | 先测工作量/故障，明确权威与用例接口 |
| B：Send/Transfer 等粗粒度独立服务 | 转发与写权威负载/团队/发布节奏确有差别 | DB→E9、RPC/队列、告警和兼容成本 | 隔离压测、重投幂等、事故演练及回退门 |
| C：按每张表拆细服务 | 本例没有已证明收益 | 跨服务事务/调用爆炸，权限和版本散落 | 必须另给具体独立收益，否则不据此推进 |

一份可执行的**停止门**至少包含：A 的当前 6 B/409/404/200 不变；未来若推进 S3，DB 权威 `m-9/seq9` 的唯一与超时结果可查；E9 重投不造双消息；B 离线 25h 的有权缺口可由权威历史补齐；滚动/回退时旧客户端合同不混乱；观测能区分发送、权威、事件、设备结果。达不到其中要求就停在当前已说明的能力边界，先修模型与证据，再谈服务数量。[12.09 发布回滚](../../../src/docs/platform_engineering/curriculum/12_platform/09_release_rollback.md) · [13.08 迁移设计](../../../src/docs/platform_engineering/curriculum/13_architecture/README.md)

固定 `openimsdk/open-im-server` 提交 `f6411a8a1a31d3df36f4c2b3ad28481a94141e1f` 的 [`send.go` 选定路径](https://github.com/openimsdk/open-im-server/blob/f6411a8a1a31d3df36f4c2b3ad28481a94141e1f/internal/rpc/msg/send.go#L46-L70)调用 `MsgToMQ` 后返回；[另一 Mongo 消费路径](https://github.com/openimsdk/open-im-server/blob/f6411a8a1a31d3df36f4c2b3ad28481a94141e1f/internal/msgtransfer/online_msg_to_mongo_handler.go#L43-L69)调用 `BatchInsertChat2DB`。这只支持所读异步边界，不能推出 OpenIM 完整服务拓扑、真实事务、outbox、设备 ACK 或本课程任一候选方案已实现。[OpenIM 阅读地图](../../../src/docs/platform_engineering/curriculum/im_reference.md)

## 八、22 道分层练习：为 `m-9` 的架构候选记故障账

先区分边界，再推故障时间线，最后用同一用户目标评审拆分条件。答案基于本章纸上设定。

### 基础 1–8：边界和风格

<details><summary>1. 代码模块与部署单元是一回事吗？</summary>

不是。多个清晰模块可在同一进程一起部署，独立部署也不保证模块清晰。</details>

<details><summary>2. 分层架构必然意味着跨进程 RPC 吗？</summary>

不必然。分层首先描述依赖方向，可在一个 Go 进程内。</details>

<details><summary>3. 使用事件就自动变成微服务吗？</summary>

不会。事件是协作方式，单体或多个服务都可使用。</details>

<details><summary>4. 当前 S2 200 到哪一层？</summary>

只到本进程内存受理，不代表权威持久或 B 设备收到。</details>

<details><summary>5. 同一单体进程能拥有清晰 Send/History/Transfer 模块吗？</summary>

能；是否独立部署是另一决定。</details>

<details><summary>6. 两个服务共用一张可随意写的消息表就有独立数据权威吗？</summary>

没有。部署拆分未明确写入归属，反而可能形成隐形耦合。</details>

<details><summary>7. broker offset42 与会话 seq9 能互换吗？</summary>

不能。前者是传输日志位置，后者是未来业务会话内序号。</details>

<details><summary>8. R9 未批时旧 `/v1` 可接纳 7 B 正文吗？</summary>

不能。当前仍守 6 UTF-8 B。</details>

### 推演 9–16：事务、事件与长离线

<details><summary>9. 当前 S2 由一 Pod 变三 Pod，消息就有持久权威了吗？</summary>

没有。每个进程的内存不会因副本数自动共享或持久。</details>

<details><summary>10. 未来同一 DB 本地事务可一起守什么？</summary>

在适用设计下可原子维护权威消息身份/序号与待发布记录；不自动覆盖 broker/设备。</details>

<details><summary>11. DB 已写 `m-9`，E9 还没发，可向 A 宣称 B 已收到吗？</summary>

不能。权威存储、事件投递和设备 ACK 是不同确认点。</details>

<details><summary>12. 中继发 E9 后崩溃、重启再发，权威消息应有几条？</summary>

仍应只有一条 `m-9`；消费者须处理同 E9 的重复投递。</details>

<details><summary>13. 两阶段提交在所有跨服务场景都不可能吗？</summary>

不是；取决于资源支持与可用性/耦合代价，不可当默认万能解。</details>

<details><summary>14. B 离线 25h、broker 留 24h，增 Transfer 副本能补全吗？</summary>

不能靠过期 broker；未来应从有权权威历史按会话游标补缺。</details>

<details><summary>15. 10,000 连接、2% 活跃、0.1 入站/s，入站多少？</summary>

`10,000×0.02×0.1=20/s`，只是一组纸上条件。</details>

<details><summary>16. 若未来每条 50 成员×2 设备，无过滤重试，任务多少？</summary>

`20×50×2=2,000 设备任务/s`，不是 2,000 条权威消息或设备 ACK。</details>

### 决策 17–22：拆分证据与停止门

<details><summary>17. 仅因 Send 包 2,000 行代码就应独立服务吗？</summary>

不一定。需看变化、负载、团队、发布独立性和故障/事务成本。</details>

<details><summary>18. Transfer 压测 CPU 高但 DB 已满，拆服务一定解决吗？</summary>

不能保证。共享 DB 仍是瓶颈，要按相同工作量和用户结果重测。</details>

<details><summary>19. 两团队想独立发布但必须同时改共享表，独立性怎样？</summary>

只是部署上分开；数据和兼容合同仍耦合，应先明确所有权与演进协议。</details>

<details><summary>20. 细碎服务方案在本例缺什么证据？</summary>

缺比粗边界更大的可量化独立收益及承担调用、事务和运维成本的能力。</details>

<details><summary>21. OpenIM 两处固定源码能证明它用了 outbox 或某服务拓扑吗？</summary>

不能；只证明所读发送到 MQ 与另一 Mongo 消费路径的异步边界。</details>

<details><summary>22. 可审架构决定卡至少交付什么？</summary>

相同用户目标/确认点、候选边界、权威/事务与部分失败、负载/团队证据、运维成本、迁移/回退门和未决假设。</details>

## 本章完成标准与后续路径

能区分代码、部署、数据权威与故障域四条轴，沿 A→权威→E9→B 说明三种候选架构的确认点和 DB/broker 故障账，再用纸上负载与团队证据决定是否值得拆分，才算完成第一轮。下一章[13.05 容量与数据设计](../../../src/docs/platform_engineering/curriculum/13_architecture/05_capacity_data_design.md)将把连接、消息、扇出、历史与恢复时间放入同一张可核算的资源账。
