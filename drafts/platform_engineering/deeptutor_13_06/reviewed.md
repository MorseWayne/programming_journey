# 13.06 质量属性的冲突：IM 的快、稳、安全和成本如何一起谈

> DeepTutor 八节初稿经技术与教学审阅后的静态课程。场景、负载、目标时延、存储量和故障均为**虚构纸上假设**，没有运行 Go、IM、数据库、压测、部署或站点。当前 S2 `/v1` 正文非空且最多 **6 UTF-8 B**、原始 HTTP 请求正文最多 **4096 B**、同 ID 重复 **409**、非成员隐藏 **404**、成功 `200 accepted_in_memory` 只表示本进程内存受理。未来 S3 `/v2` 的 `stored_in_teaching_db` 是提议且仍为 6 B，R9 的 6→9 B 待审；`m-9/seq9/E9` 仅属未来候选模型。[09.02 当前合同](../../../src/docs/platform_engineering/curriculum/09_backend_security/02_http_api_contract.md)

## 一、质量属性不是“都要最好”，先说明哪个用户看见什么

13.01–13.05 已分别写出用户诉求、消息身份、模块、架构与容量。现在产品可能同时说“发送快、不能丢、一直可用、只给成员看、成本别涨”。这些话各指向不同**质量属性**，若不规定刺激、环境、系统响应和度量，就无法判断方案真的改善了哪个用户结果。SEI 的架构权衡方法（ATAM）强调通过利益相关者场景寻找多个质量目标的敏感点和冲突；本章只借其**轻量纸上评审思路**，不声称完成正式 ATAM 评估。[SEI：ATAM 方法](https://insights.sei.cmu.edu/library/steps-in-an-architecture-tradeoff-analysis-method-quality-attribute-models-and-analysis/)

| 质量属性 | 在本例可观察的问题 | 容易被混用的指标 |
|---|---|---|
| 正确性/一致性 | `m-9/seq9` 是否唯一、有序，成员授权和设备连续游标是否成立？ | “所有副本立刻一样”这句未定范围的话 |
| 可用性 | 合资格的 A/B 在约定时间内能否完成**约定的操作**？ | Pod Ready、HTTP 任意 200 |
| 时延 | A 从提交到哪层确认？B 重连到拿 `seq9` 多久？ | 只量服务端函数耗时或成功样本均值 |
| 持久/恢复 | 当前受理后进程故障会怎样？未来权威 DB 还能恢复吗？ | broker 留存、队列清空与 RPO/RTO 混成一个数 |
| 安全/隐私 | 非成员是否被隐藏、历史是否按规则可见、留存/删除责任是什么？ | “有 RBAC”就当完成会话授权 |
| 成本/可维护 | 副本、索引、备份、值班和协议演进花多少？ | 仅看单台机器价格或服务数 |

有些是**当前不可交易的合同**：`/v1` 的 6 B、409、404、`200 accepted_in_memory`。不能为了改善某个 P95，把非成员静默放行或把内存受理伪装成已入 DB。未来 25h 补拉、A 的目标时延和 `/v2` 权威语义仍待产品、安全、客户端与值班者审阅。[Google SRE：风险与可靠性取舍](https://sre.google/sre-book/embracing-risk/) · [13.01 目标和约束](../../../src/docs/platform_engineering/curriculum/13_architecture/01_problem_stakeholders.md)

## 二、一致性先定不变量，可用性再定分母与故障响应

未来若采用权威 `m-9/seq9`，至少要讨论“同一发送意图至多一条权威消息”“同会话 `seq` 唯一并有可解释顺序”“无权成员不得取得历史”“设备游标不跳过缺口”。这些是**不同范围**的一致性问题：消息写入的唯一性、按会话的顺序、授权视图与设备确认分别有不同来源和观察时间。不能只写“强一致”就推得四条都成立。[13.02 不变量](../../../src/docs/platform_engineering/curriculum/13_architecture/02_domain_state_modeling.md) · [08.04 一致性模型](../../../src/docs/platform_engineering/curriculum/08_distributed/04_consistency_models.md)

可用性要写**哪类合资格操作**及时间窗。当前非成员发送按合同返回 404 是**正确拒绝**，不是“发送服务不可用”；同 ID 重复返回 409 也有独立语义。若未来 `/v2` 承诺 `stored_in_teaching_db`，而权威 DB 暂不可用，服务不能在本进程内存记一笔就仍返回 `stored_in_teaching_db`。可选择明确失败/等待，或者另经产品和客户端审阅后提供不同的、较弱的操作与回执；**不能悄悄降级原成功定义**。[Google SRE：用户中心 SLO](https://sre.google/workbook/implementing-slos/)

| 纸上故障 | 若硬守的语义 | 可用性代价与待决问题 |
|---|---|---|
| 未来权威 DB 不可写 | 不冒报 `stored_in_teaching_db` | A 的该强确认操作可能暂时失败/变慢；是否提供另一个弱合同需审 |
| 成员关系来源不可判断 | 不猜测为“有权”而放行 | 合法用户也可能暂时不能读/发；错误应避免泄漏会话存在 |
| E9 broker 暂不可用、DB 已存 | 权威消息仍只有一条 | 未来设备转发可能延迟；恢复路径与用户提示待设计 |

不要把这个表缩成“网络分区时从一致性和可用性二选一”。要先说**哪个操作、哪项不变量、哪个依赖失效、允许哪种结果**，再比较具体方案。[SEI：质量属性冲突](https://insights.sei.cmu.edu/library/architecture-tradeoff-analysis-method-collection/)

## 三、A 的低时延与更强确认，测量起止点本身会变

当前 `/v1` 的 A 在本进程内存受理后可收到 200，但这份**较早确认**没有权威持久承诺。未来若 `/v2` 要说已入教学 DB，成功边界须在权威写入证据之后；如果又把 E9 发布或 B 设备 ACK 放到 A 的同步等待里，等待链与故障依赖还会增加。不同返回点的 P95 **不是同一个操作的性能指标**，不能只报更小的数字而不报承诺变弱。[11.01 确认点](../../../src/docs/platform_engineering/curriculum/11_reliability/01_business_measurement.md) · [13.04 同步/异步边界](../../../src/docs/platform_engineering/curriculum/13_architecture/04_architecture_styles_boundaries.md)

例如“**A 从点击发送到收到对应确认的 P95 ≤200 ms**”可作为本章**纸上待审目标**。要真正评估它，还需明确客户端时钟/服务器时钟、超时和失败是否进入分母、消息类型和群大小、弱受理还是 DB 已存。13.01 的“B 合资格设备在重连后 **120 秒**内取到 `seq9`”同样只是**纸上候选**，不是既有 SLO；它依赖权威 DB 真实保留、历史授权、查询容量与网络条件。两项目标甚至可能争用同一 DB 或网络资源，需按共同峰值测试而不是各自单测。[Google SRE：SLO 定义](https://sre.google/workbook/implementing-slos/) · [13.01 六段场景](../../../src/docs/platform_engineering/curriculum/13_architecture/01_problem_stakeholders.md)

异步 E9 可以让未来 DB 存储确认后不必等每台设备，但代价是队列积压与用户结果延后。13.05 的纸上例子里，消费者停 10 分钟积压 12,000 条、恢复后净清 10/s，**理想清空还要 20 分钟**；若 B 的 120 秒候选目标把事件延迟也算入，就显然不能仅凭“DB 已存”证明达标。反过来 B 可从有权历史主动补拉时，它的时间可能不等于事件队列清空时间，具体要看读路径和竞争负载。[13.05 恢复账](../../../src/docs/platform_engineering/curriculum/13_architecture/05_capacity_data_design.md)

## 四、长历史帮助 B，也增加隐私、删除与运行成本

B 离线 **25h**、教学 broker 仅留 **24h**，要求未来有权找回就不能只依赖该 broker；权威 DB 需**确实保留**所需历史，并有成员可见规则和足够的查询恢复能力。若业务另批准 **30 天**历史，13.05 同一纸上基线是约 **49.44 GiB 逻辑原始权威记录**，索引、WAL、副本、备份与空盘都未计。这是容量情景，**不是**已获批准的留存合同。[13.05 留存账](../../../src/docs/platform_engineering/curriculum/13_architecture/05_capacity_data_design.md) · [Google SRE：Data Integrity](https://sre.google/sre-book/data-integrity/)

保留越久可能降低一部分离线缺口，却也扩大有权历史查询、误授权泄露、删除/更正、备份过期和维护范围。`u-b` 退群前后的历史可见性仍需产品和安全决定；工程师不能以“数据库有这行”为由返回内容。权限来源失联时，不能猜成员仍有效来换更高成功率；也不应把会话正文或令牌写入诊断日志来图省事。[09.07 成员授权](../../../src/docs/platform_engineering/curriculum/09_backend_security/07_authentication_authorization.md)

| 待评审选择 | 可能改善 | 同时增加的责任 |
|---|---|---|
| 历史覆盖 25h 以上 | B 的某类长离线恢复 | 存储、权限、保留/删除与备份成本 |
| 复制更多权威数据 | 单点故障时可读/可恢复机会 | 写入/冲突/一致性、故障域和费用 |
| 缓存成员或历史 | 读时延与 DB 压力 | 过期权限、失效和故障时安全行为 |

这几项都不是“不做安全就更可用”的借口。先标出不可破坏的权限和数据完整性规则，再在允许范围内找读缓存、分层存储或降级方案，并给它们各自的可观察边界。[Google SRE：风险管理](https://sre.google/sre-book/embracing-risk/)

## 五、热群吞吐与会话顺序、设备连续性互相牵制

13.05 的虚构基线是 **20 入站消息/s**，若未来每条面向 **50 人×2 设备**且无过滤/重试，产生 **2,000 设备任务/s**。另一个热群情景：一个 `c-g` 会话占 **10 入站/s**，每条面向 **500 人×2 设备**，单会话已达 **10,000 任务/s**。总体平均 CPU 或队列深度看起来不高时，单会话顺序链/分区仍可能先被打满；增加无关分区不一定分散这个热点。[13.05 热群算式](../../../src/docs/platform_engineering/curriculum/13_architecture/05_capacity_data_design.md) · [08.05 分区再平衡](../../../src/docs/platform_engineering/curriculum/08_distributed/05_partition_rebalancing.md)

可评估的方向是让**权威会话序号**与**后续设备派生**承担不同职责：先明确 `m-9/seq9` 的顺序，再在不改变有权用户看到的历史顺序和设备连续游标规则的前提下分散派生工作。拆分本身会带来重复、乱序与更复杂的合并。若设备先见 9 缺 8，游标仍应停 7；不能为了吞吐把它写成 9，也不能以“broker offset 变大”当作 B 已读。[13.02 连续游标](../../../src/docs/platform_engineering/curriculum/13_architecture/02_domain_state_modeling.md)

| 追求 | 可能压到的另一项质量 | 需要的反证实验 |
|---|---|---|
| 更多并行扇出 | 会话/设备顺序、重复去重 | 热群下缺 8 先到 9、事件重投和旧端混跑 |
| 更快 A 回执 | 权威持久和设备确认的解释 | 对照各确认点时延、进程/DB 故障 |
| 更多网关或 Transfer 副本 | 共享 DB、broker、网络及成本 | 同负载 N−1、热点分区和重连补拉 |

## 六、冗余、服务拆分和高目标会消耗维护预算

更强持久性可能需要副本、备份和恢复演练；更高可用可能需要故障域分散与可调度余量；独立服务可能允许单独扩缩和发布，却增加 RPC/队列、权限、版本、值班与数据一致性成本。不能从“副本数多”推 B 25h 历史一定存在，也不能从“只用单体”推必然不能满足目标。成本应包含**资源加工程机会成本**，并按相同业务结果比较。[13.04 架构取舍](../../../src/docs/platform_engineering/curriculum/13_architecture/04_architecture_styles_boundaries.md) · [Google SRE：Embracing Risk](https://sre.google/sre-book/embracing-risk/)

RPO、RTO、队列积压清空和 B 有权历史补拉是不同问题：权威 DB 可恢复到哪个时间点，是数据损失边界；服务多久重新提供约定操作，是恢复目标；旧 E9 多久追上，是处理能力；B 设备何时看到 `seq9`，还受授权、查询和客户端影响。把四者合成“高可用 99.99%”无法指导选择。[13.05 恢复时间](../../../src/docs/platform_engineering/curriculum/13_architecture/05_capacity_data_design.md)

SRE 对可靠性与成本的讨论提醒：提高可靠性有资源与开发机会成本，目标要与用户愿承担的风险相称。**本系列未制定现成 100% 或 99.99% 的业务目标**；且权限拒绝、消息身份唯一等正确性边界不能被“可靠性预算”交易掉。只有在产品/值班/安全同意目标和观测口径后，误差预算等方法才有可用的分母。[Google SRE：Embracing Risk](https://sre.google/sre-book/embracing-risk/)

## 七、做一张轻量场景矩阵，不用伪精确总分替代决定

课堂可借 SEI ATAM 的思路：列利益相关者与业务目标，把“正常发送、DB 故障、B 长离线、非成员探测、热群”写成具体刺激/环境/响应，再对每种候选方案记录**质量属性敏感点、风险、证据缺口与决定人**。这是一张**学习用评审卡**，不是正式 ATAM 报告；无法测量的格子写“待验证”，不能给 S2/S3/服务拆分打一个似乎客观的 87 分。[SEI：ATAM Collection](https://insights.sei.cmu.edu/library/architecture-tradeoff-analysis-method-collection/)

| 场景与不可破约束 | 当前 S2 `/v1` 能说什么 | 未来 S3 DB 确认候选 | 未来 DB+E9 异步候选需加验 |
|---|---|---|---|
| A 正常发送；6 B/409/404 保持 | 200 仅进程内存 | 必须等权威写入才说 `stored` | E9 失败不应伪装设备成功 |
| DB 不可写；不能冒报持久 | 当前合同本来无 DB 权威 | 明确失败/等待或另审弱合同 | 事件/队列不能替代权威 |
| B 离线 25h；按成员权限 | 当前无补拉承诺 | 需历史真实保留与有权查询 | 24h broker 过期仍需 DB 历史 |
| 非成员探测；不泄露会话 | 当前发送隐藏 404 | 历史权限规则待定 | 缓存/异步副本失效时不放行 |
| 热群 10,000 任务/s；顺序不跳缺口 | 当前无该运行能力 | 权威 `seq` 及查询压力待测 | 扇出并行/重投/游标一起验证 |

这张矩阵的**敏感点**例如“把 A 的返回点从内存改为 DB commit”“历史保留时间”“单会话派生并行度”“权限缓存过期规则”。每项要写改变它可能影响的其它属性、测量方法和决策人。当前 `/v1` 合同属于硬门，未来 B 120 秒和 A P95 200 ms 只作为待审场景；遇到冲突先回到 13.01 的用户价值与失败成本，再决定增资源、改体验或调整尚未批准的目标。[13.01 问题简报](../../../src/docs/platform_engineering/curriculum/13_architecture/01_problem_stakeholders.md)

固定 `openimsdk/open-im-server` 提交 `f6411a8a1a31d3df36f4c2b3ad28481a94141e1f` 的 [`send.go` 选定路径](https://github.com/openimsdk/open-im-server/blob/f6411a8a1a31d3df36f4c2b3ad28481a94141e1f/internal/rpc/msg/send.go#L46-L70)调用 `MsgToMQ` 后返回；[另一 Mongo 消费路径](https://github.com/openimsdk/open-im-server/blob/f6411a8a1a31d3df36f4c2b3ad28481a94141e1f/internal/msgtransfer/online_msg_to_mongo_handler.go#L43-L69)调用 `BatchInsertChat2DB`。两处只证明所读异步边界，不能给 OpenIM 或本课程候选方案赋予真实 P95、SLO、权威事务、权限/留存或设备 ACK 结论。[OpenIM 阅读地图](../../../src/docs/platform_engineering/curriculum/im_reference.md)

## 八、22 道分层练习：审一份“又快又稳”的 IM 承诺

先定义属性与分母，再推故障和负载反例，最后写质量取舍卡。所有答案只适用于本章纸上条件。

### 基础 1–8：质量属性与当前合同

<details><summary>1. Pod Ready 能直接证明用户发送可用吗？</summary>

不能。需按合资格用户操作、确认点、时间窗和失败样本观察。</details>

<details><summary>2. 当前 S2 200 能当作“持久不丢”指标吗？</summary>

不能，它只表示本进程内存受理。</details>

<details><summary>3. 当前非成员发送返回 404，应算成服务不可用吗？</summary>

不应直接算。它是按合同正确隐藏目标的拒绝，仍应分开记录安全/业务计数。</details>

<details><summary>4. “强一致”能替代消息唯一、顺序、授权和设备游标四项定义吗？</summary>

不能。每项范围、权威、观察时间和不变量不同。</details>

<details><summary>5. 未来 S3 若 DB 不可写，可返回 `stored_in_teaching_db` 吗？</summary>

不能冒报；该较强操作须失败/等待或另审明确较弱合同。</details>

<details><summary>6. R9 6→9 B 已生效吗？</summary>

未生效。当前 `/v1` 仍为 6 UTF-8 B。</details>

<details><summary>7. 本章 A P95 200 ms 和 B 120 秒是什么？</summary>

都是待审纸上场景度量，未运行、未批准、不是现有 SLO。</details>

<details><summary>8. broker 24h 保留是否等于权威历史保留？</summary>

不等于。前者是派生事件传输窗口，后者需业务确认并能授权补拉。</details>

### 推演 9–16：冲突与反例

<details><summary>9. A 从内存受理改为等 DB commit，哪两项可能冲突？</summary>

更强持久确认与返回时延/DB 故障时可用性；要按同一确认点比较。</details>

<details><summary>10. DB 已存而 E9 堵住，可直接写 B 已收到吗？</summary>

不能。权威、事件与设备 ACK 是不同状态。</details>

<details><summary>11. 成员来源不可判断，怎样避免以可用性名义越权？</summary>

不猜为有权；采用经审阅的拒绝/暂不可用行为，并避免泄露会话。</details>

<details><summary>12. B 离线 25h、broker 留 24h，未来要恢复还缺什么？</summary>

确实保留的权威历史、已定成员可见规则和足够的有权查询/补拉能力。</details>

<details><summary>13. 若群 10 入站/s、500 人×2 设备，单会话多少任务/s？</summary>

`10×500×2=10,000` 任务/s，可能压单条顺序链。</details>

<details><summary>14. 设备先见 9 缺 8，为吞吐把连续游标写 9 可行吗？</summary>

不行。若此前连续到 7，游标仍为 7；需补 8 且满足确认条件。</details>

<details><summary>15. 30 天权威逻辑记录约 49.44 GiB，是否就是磁盘账单？</summary>

不是。它是待批纸上原始逻辑量，物理还含索引、WAL、副本、备份等。</details>

<details><summary>16. 队列理想 20 分钟清空能证明 RTO 或 B 取到消息吗？</summary>

不能。服务恢复、数据损失、队列清空和有权设备补拉分属不同结果。</details>

### 决策 17–22：质量取舍卡

<details><summary>17. 能用误差预算交易掉非成员 404 规则吗？</summary>

不能。当前授权/隐藏合同是硬门；误差预算需要已同意的服务目标和分母。</details>

<details><summary>18. A 的 P95 只统计成功 200，会漏什么？</summary>

超时、拒绝、仍在途和确认点差异；需明确起止、分母与消息/群负载。</details>

<details><summary>19. 更长历史必然是对 B 最优吗？</summary>

未必。需结合离线分布、授权/删除、泄露面、备份和成本评审。</details>

<details><summary>20. 增十个普通分区必能分摊一个热群吗？</summary>

不保证。同会话可能仍集中同一顺序链，需按实际分区和派生路径验证。</details>

<details><summary>21. 两处固定 OpenIM 源码能证明它满足这些质量目标吗？</summary>

不能；只能支持选定发送到 MQ 与另一 Mongo 消费路径的异步边界。</details>

<details><summary>22. 轻量质量取舍卡至少记录什么？</summary>

利益相关者、用户场景/硬约束、候选、敏感点、影响的多项属性、证据缺口、失败反例、停止门与决定人。</details>

## 本章完成标准与后续路径

能把快、稳、安全和成本写成同一用户旅程中的可观察场景，解释 DB/成员来源不可用时为何不能冒报更强成功或越权放行，并用热群、长离线、历史保留和异步积压找出质量属性冲突，才算完成第一轮。下一章 13.07 将把这些取舍、证据和未决项整理成可审阅的设计说明与决策记录。
