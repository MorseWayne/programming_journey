# 13.05 容量与数据设计：连接、群扇出、历史和恢复要算四本账

> DeepTutor 八节初稿经技术与教学审阅后的静态课程。连接、速率、记录大小、保留期、处理能力和故障均为**虚构纸上假设**，没有运行 Go、IM、数据库、压测、部署或站点，也未查询实际云价格。当前 S2 `/v1` 正文非空且最多 **6 UTF-8 B**、原始 HTTP 请求正文最多 **4096 B**、同 ID 重复 **409**、非成员隐藏 **404**、成功 `200 accepted_in_memory` 只表示本进程内存受理。未来 S3 `/v2` 的 `stored_in_teaching_db` 是提议且仍为 6 B，R9 6→9 B 待审。权威 `m-9/seq9`、E9 和 B 设备任务都是未来模型。[09.02 当前合同](../../../src/docs/platform_engineering/curriculum/09_backend_security/02_http_api_contract.md)

## 一、容量先问用户结果，再选单位和时间窗口

13.04 比较模块化单体与服务拆分时留下一个问题：**到底哪种资源先限制 B 的长期离线恢复，哪种资源先限制 A 的发送？**“一万在线”“20 QPS”或“一台机器 8 核”都不足以回答。必须先固定业务确认点、工作量单位、时间窗口和故障条件。Google SRE 的具体系统设计练习也从需求出发，用明确假设把逻辑方案换算为物理资源，再检验可行性与故障。[Google SRE：Non-Abstract Large System Design](https://sre.google/workbook/non-abstract-design/)

| 本章账本 | 单位与主要资源 | 对应的用户问题 |
|---|---|---|
| 连接驻留 | 同时在线的设备连接数、FD、内存、保活/握手 | A/B 能否维持连接并在故障后重连？ |
| 消息权威 | 未来新消息/s、按会话 `seq` 写入/历史查询、DB 空间与 I/O | A 的未来存储确认与 B 的有权历史从何来？ |
| 派生事件 | E9 类事件/s、broker 保留、积压与重投 | 权威写入后能否可靠触发后续处理？ |
| 设备任务 | 目标成员×设备任务/s、CPU/网络/慢端 | B 的多设备多久能得到结果？ |

**当前 S2 只有内存受理合同**。下面对 DB、E9、设备任务的计算只是讨论未来架构的资源量级，不能把纸上数字变成当前吞吐或交付保证。时间窗口也须区分：某秒峰值用于队列/CPU，全天平均用于留存增长，25 小时离线用于历史覆盖，故障后的分钟级清空用于恢复设计。[11.12 四类工作量](../../../src/docs/platform_engineering/curriculum/11_reliability/12_capacity_cost_decision.md)

## 二、按访问模式组织数据，不从字段名直接决定分片

未来若要让 B 离线 25h 后补到 `m-9/seq9`，先列**怎样读写**，再选择表、索引、分片和缓存。当前 `/v1` 没有这套权威数据库。纸上访问模式包括：发送时按稳定消息意图判重并为会话分配 `seq`；历史按 `(conversation_id, seq > cursor)` 顺序分页；读历史前按身份与待定的历史可见规则授权；设备按 `(device_id, conversation_id)` 更新连续游标；E9 中继按稳定事件 ID 找待发布项。[13.02 领域身份](../../../src/docs/platform_engineering/curriculum/13_architecture/02_domain_state_modeling.md) · [06.05 索引结构](../../../src/docs/platform_engineering/curriculum/06_databases/05_index_structures.md)

| 访问模式 | 候选查找键/顺序 | 容量和正确性问题 |
|---|---|---|
| SendMessage 判重 | 稳定 `message_id` 与明确作用域 | 网络重试不得造第二条权威意图；当前重复仍为 409 |
| 会话历史分页 | `c-a` + `seq > last_contiguous_seq`，按 `seq` 有序 | 热会话写入/长历史范围读是否冲突？ |
| 成员历史可见 | 会话、用户、有效时间/规则版本 | 退群后旧消息能否看尚未决定，不能先优化错规则 |
| 多设备进度 | `dev-b1/c-a` 与 `dev-b2/c-a` 分别维护 | 见过 9、缺 8 时连续游标仍为 7 |
| E9 派生/重放 | `evt:m-9:v1` 与发布状态 | broker `P0 offset42` 是传输位置，不是业务游标 |

如果将全部会话消息放一个无界记录，热点群每次写入/补拉可能争用或读取过量；若按时间分片，却需要跨分片按会话 `seq` 补缺，也会改变查询代价。真正的数据结构要结合成员规则、会话冷热分布、索引写放大和查询计划实测；本章只交**访问路径与风险清单**，不宣称某种数据库或分片键已被选定。[Google SRE：容量规划与依赖](https://sre.google/sre-book/software-engineering-in-sre/) · [08.05 热点](../../../src/docs/platform_engineering/curriculum/08_distributed/05_partition_rebalancing.md)

## 三、连接、入站与设备任务的同一组纸上算式

严格沿 [11.12 的基线](../../../src/docs/platform_engineering/curriculum/11_reliability/12_capacity_cost_decision.md)：假设 **10,000 条设备连接**，其中 **2% 活跃**，则 `10,000×0.02=200` 条活跃连接；假设每活跃连接平均每秒发 **0.1 条**，得 `200×0.1=20 条入站消息/s`。这不是 200 个不同用户的证明，多设备与用户映射需另查；也不是每秒稳定 20 条的实测。[Google SRE：QPS 的成本差异](https://sre.google/sre-book/handling-overload/)

若未来每条入站消息**恰好**面向 **50 位目标成员×每人 2 台设备**，且无过滤、合并与重试，则 `20×50×2=2,000 个设备任务/s`。入站 20 条与任务 2,000 项是不同单位；后者既不是 2,000 条新权威消息，也不是 2,000 个设备 ACK。若完整设备任务封装假设平均 **512 B**，纯任务载荷为 `2,000×512=1,024,000 B/s≈0.977 MiB/s`，还未计 TLS/帧、重试、复制和出口方向。[11.12 扇出字节账](../../../src/docs/platform_engineering/curriculum/11_reliability/12_capacity_cost_decision.md)

再假设单条连接在 Go 进程里平均占 **32 KiB** 的某项驻留分量，则 `10,000×32 KiB=320,000 KiB=312.5 MiB`。这**不是**网关所需总内存：Go 堆其它对象、goroutine 栈、TLS、内核 socket 缓冲、队列、GC 峰值均未计；FD 和重连握手可能先达上限。把 312.5 MiB 直接写成容器 limit，会在设计阶段藏掉最关键的证据缺口。[11.12 连接态边界](../../../src/docs/platform_engineering/curriculum/11_reliability/12_capacity_cost_decision.md) · [03.06 分配与映射](../../../src/docs/platform_engineering/curriculum/03_systems/06_allocation_mapping.md)

## 四、权威历史与 broker 保留必须分开记账

仅为算量，假设未来 **20 条/s 持续全天**，则 `20×86,400=1,728,000 条/天`。若每条**权威记录连同纸上元数据**平均 **1 KiB**，逻辑原始数据 `1,728,000 KiB≈1.648 GiB/天`。若未来业务**另行批准**保留 **30 天**、每天维持同速率，逻辑原始量约 `1.648×30≈49.44 GiB`。正文当前最多 6 B，原始 HTTP 请求体最多 4096 B，**两者都不是这份未来权威记录的平均大小**。[11.12 权威留存](../../../src/docs/platform_engineering/curriculum/11_reliability/12_capacity_cost_decision.md) · [Google SRE：单位换算](https://sre.google/workbook/non-abstract-design/)

另假设未来每条权威消息派生**一个**完整封装 **512 B** 的 E9 类事件，教学 broker 保留 **24h**，则原始事件量 `20×86,400×512 B=884,736,000 B≈0.824 GiB`。它不意味着每秒 2,000 个设备任务各写一份 broker 事件。DB 约 49.44 GiB 与 broker 约 0.824 GiB 是不同的权威/传输账；不能为了节省 DB 就把 broker 保留当业务历史。[07.10 Outbox](../../../src/docs/platform_engineering/curriculum/07_cache_messaging/10_transaction_outbox.md) · [07.12 长离线反例](../../../src/docs/platform_engineering/curriculum/07_cache_messaging/12_cross_system_consistency_case.md)

| 纸上数据项 | 逻辑原始量 | **尚未计入**的物理账 |
|---|---:|---|
| 未来权威记录，20/s、1 KiB、30 天 | 约 49.44 GiB | 索引、WAL、页/碎片、副本、备份、空盘、迁移 |
| 未来 E9，20/s、512 B、24h | 约 0.824 GiB | broker 副本、分段/索引、重投、多事件类型 |
| 未来设备任务，2,000/s、512 B | 约 0.977 MiB/s 纯载荷 | 网络协议、在线过滤、重试、每设备状态保留 |

B 离线 **25h** 已超过事件保留 **24h**，未来补拉还需 DB **实际保留**那段权威历史并在读取时通过成员授权；一个“30 天”纸上容量情景若未获业务批准，也不能替代留存合同。即使存储有副本，误删、错误迁移和长期潜伏损坏仍需备份、校验与恢复演练；“磁盘够”不等于“数据可恢复”。[Google SRE：Data Integrity](https://sre.google/sre-book/data-integrity/)

## 五、增长与热群：平均负载不能代替最坏局部

下表**每行只改变一个主要条件**，其它沿基线不变，不能把不同的行随意再相乘：

| 纸上情景 | 重算结果 | 首先追问 |
|---|---|---|
| 基线：10,000 连接、2%、0.1/s、50×2 设备 | 20 入站/s、2,000 设备任务/s、312.5 MiB 连接分量 | 哪条资源链先满？ |
| 仅连接数翻倍，活跃比例/发送率/群规模不变 | 20,000 连接、40 入站/s、4,000 任务/s、625 MiB 连接分量；若另批准相同 30 天留存，约 98.88 GiB 逻辑权威记录 | 网关 FD/握手、DB 写与历史成本怎样一起变？ |
| 仅目标群从 50 人变 500 人，原 20 入站/s 不变 | `20×500×2=20,000` 设备任务/s | 转发 CPU、网络与热点分区是否先满？ |

再单看**热键**：若未来总入站仍 **20/s**，其中一个 `c-g` 热群独占 **10/s**，且它每条面向 **500 人×2 设备**，该会话就产生 `10×500×2=10,000` 个设备任务/s。全系统平均数可能还好，但若同会话消息被固定到一个分区、单条顺序链或单个消费者，额外加十个普通分区未必分摊这 10,000 项。应记录按会话/分区的分布、峰值与尾部，并分别测试权威顺序和派生扇出；不能简单把会话顺序要求扔掉来追吞吐。[08.05 热键与分区](../../../src/docs/platform_engineering/curriculum/08_distributed/05_partition_rebalancing.md) · [11.04 负载画像](../../../src/docs/platform_engineering/curriculum/11_reliability/04_diagnostic_method.md)

以上行也没包括**同时**增长、节假日峰值、发送重试、重连补拉与旧端兼容。若业务真的要求“连接翻倍同时大群变十倍”，应新增组合场景并重新算，而不是把此表任一行当系统极限。Google SRE 提醒同样 QPS 的请求成本可大不相同，容量应回到 CPU、内存、I/O、网络和具体业务工作量。[Google SRE：Handling Overload](https://sre.google/sre-book/handling-overload/)

## 六、恢复时间不能只写“队列会慢慢清空”

设未来 E9 为**每条入站权威消息一条事件**，到达率平稳 **20 条/s**，消费者正常可稳定处理 **30 条/s**。消费者完全停止 **10 分钟=600 秒**，入站仍继续且无上游拒绝时，积压 `20×600=12,000 条 E9`。恢复后新事件仍以 20/s 到达，消费者只能以净速率 `30−20=10 条/s` 清旧债，最理想清空时间 `12,000/10=1,200 秒=20 分钟`。这是**一事件一消息、速率不变、无重投/热点/资源争用**的纸上模型，不是恢复承诺。[AWS Builders’ Library：Queue Backlogs](https://aws.amazon.com/builders-library/avoiding-insurmountable-queue-backlogs/) · [11.09 积压](../../../src/docs/platform_engineering/curriculum/11_reliability/09_overload_cascades.md)

| 恢复后消费者稳态能力 | 新到达 | 净清旧债 | 对 12,000 条积压 |
|---:|---:|---:|---|
| 30/s | 20/s | 10/s | 理想 **20 分钟** |
| 20/s | 20/s | 0/s | **永远清不掉**，除非到达下降或能力提高 |
| 15/s | 20/s | −5/s | 积压继续每秒增 5 条 |

**积压清空时间**与**RTO**、**RPO**也不是同一个词：RTO 讨论服务恢复到约定可用状态的目标时间；RPO 讨论故障时业务可接受的历史数据损失窗口。服务入口可能已恢复而旧 E9 仍积压；未来 DB 权威若完好，B 的有权历史可由 DB 补，但 B 设备是否及时收到仍需队列/补拉能力和具体用户目标。反过来队列清空也不能证明权威历史没有缺口。应把“哪个用户旅程在多少时间内恢复”写进未来待审目标，结合 DB 保留、补拉读负载、重连峰和队列清空分别验证。[Google SRE：容量与依赖](https://sre.google/sre-book/software-engineering-in-sre/) · [13.01 目标定义](../../../src/docs/platform_engineering/curriculum/13_architecture/01_problem_stakeholders.md)

## 七、资源预算与验证门：结论要可被实验推翻

架构决策卡应按资源链记**容量上限、故障后余量、增长假设、验证证据和成本责任**：网关连接 FD/Go 与内核内存/TLS CPU；Send 的成员查询与未来 DB 写入/索引/WAL；Transfer 的事件积压/重投/热群；History 的范围读与旧端游标；网络出口、备份、副本、日志/值班。某个链路加副本前先问是否共享 DB/热点仍先满，N−1 要按相同连接与群/设备分布验证。[Google SRE：意图驱动容量规划](https://sre.google/sre-book/software-engineering-in-sre/) · [12.10 故障域](../../../src/docs/platform_engineering/curriculum/12_platform/10_autoscaling_fault_domains.md)

本章只给**待验证设计**：在隔离环境分别固定连接数、活跃比、群规模、历史长度和旧端比例；按 11.07 记录计划/实际到达、超时/拒绝/仍在途、每会话热点、DB I/O、队列年龄、B 补拉结果；做阶梯、长稳与故障恢复，并保留原始证据。若基线 20/s 尚不能让当前 `/v1` 6 B/409/404/200 正确，就不能用“未来 2,000 任务/s”讨论扩容成功。未来 S3/设备 ACK 的验收另立目标，不能从静态算式声称通过。[11.07 可证伪压测设计](../../../src/docs/platform_engineering/curriculum/11_reliability/07_load_testing_capacity.md)

固定 `openimsdk/open-im-server` 提交 `f6411a8a1a31d3df36f4c2b3ad28481a94141e1f` 的 [`send.go` 选定路径](https://github.com/openimsdk/open-im-server/blob/f6411a8a1a31d3df36f4c2b3ad28481a94141e1f/internal/rpc/msg/send.go#L46-L70)调用 `MsgToMQ` 后返回；[另一 Mongo 消费路径](https://github.com/openimsdk/open-im-server/blob/f6411a8a1a31d3df36f4c2b3ad28481a94141e1f/internal/msgtransfer/online_msg_to_mongo_handler.go#L43-L69)调用 `BatchInsertChat2DB`。这两处只支持所读异步边界，**不证明**该项目的连接/消息吞吐、记录大小、保留策略、积压清空时间或本章未来方案。[OpenIM 阅读地图](../../../src/docs/platform_engineering/curriculum/im_reference.md)

## 八、22 道分层练习：核对四本容量账

先算单位与增长，再算积压和恢复，最后用用户结果评审预算。答案均基于上述虚构纸上假设。

### 基础 1–8：工作量与确认点

<details><summary>1. 10,000 连接、2% 活跃，活跃连接多少？</summary>

`10,000×0.02=200`；不能据此断言恰好 200 个不同用户。</details>

<details><summary>2. 每活跃连接 0.1 条/s，入站多少？</summary>

`200×0.1=20 条/s`，是纸上条件值。</details>

<details><summary>3. 50 目标成员×2 设备，未来每条多少设备任务？</summary>

条件下为 100 项；不是 100 条权威消息或 ACK。</details>

<details><summary>4. 20 条/s 的条件扇出是多少任务/s？</summary>

`20×50×2=2,000 项/s`。</details>

<details><summary>5. 当前 S2 200 可计为 B 设备 ACK 吗？</summary>

不能，只代表本进程内存受理。</details>

<details><summary>6. 32 KiB×10,000 连接是多少 MiB？</summary>

`320,000 KiB÷1,024=312.5 MiB`，仅一项进程驻留假设。</details>

<details><summary>7. 正文最多 6 B 表示未来记录平均也是 6 B 吗？</summary>

不表示。消息元数据、索引和存储封装另占空间。</details>

<details><summary>8. broker offset42 可以当 B 的会话游标吗？</summary>

不能；B 补拉按有权历史的会话 `seq` 与连续进度。</details>

### 计算 9–16：数据、热群与积压

<details><summary>9. 20/s 若持续全天，共多少条？</summary>

`20×86,400=1,728,000 条/天`，不是真实日量。</details>

<details><summary>10. 每条未来权威记录 1 KiB，约多少 GiB/天？</summary>

`1,728,000 KiB÷1,048,576≈1.648 GiB/天`。</details>

<details><summary>11. 若另批准 30 天、同速率，逻辑原始记录约多少？</summary>

约 `1.648×30≈49.44 GiB`，未计索引/副本/备份。</details>

<details><summary>12. E9 每消息一条、512 B、24h，原始量约多少？</summary>

`20×86,400×512 B≈0.824 GiB`；不是 2,000 设备任务每秒均写 broker。</details>

<details><summary>13. 连接翻倍且其它比例不变，入站和任务各多少？</summary>

40 入站/s、4,000 设备任务/s；连接分量 625 MiB。</details>

<details><summary>14. 仅群 50→500、入站仍 20/s，设备任务多少？</summary>

`20×500×2=20,000 项/s`，其它情景不叠加。</details>

<details><summary>15. 热群占 10 入站/s、500×2 设备，单会话多少任务/s？</summary>

`10×500×2=10,000 项/s`，可能集中在同一顺序链/分区。</details>

<details><summary>16. 事件消费停 10 分钟、仍入 20/s，积压多少？</summary>

`20×600=12,000 条`，假设没有拒绝或其它积压来源。</details>

### 决策 17–22：恢复、保留和证据

<details><summary>17. 消费 30/s、新入 20/s，12,000 条理想多久清空？</summary>

净清 10/s，`12,000/10=1,200 秒=20 分钟`。</details>

<details><summary>18. 消费能力仅 20/s 或 15/s，各会怎样？</summary>

20/s 时旧债不减；15/s 时每秒再增 5 条。</details>

<details><summary>19. B 离线 25h、broker 留 24h，补拉还需哪些条件？</summary>

未来须有确实保留的权威历史、已定成员可见规则和足够的查询/恢复能力；当前 S2 尚无此承诺。</details>

<details><summary>20. 队列清空时间与 RTO/RPO 是同一量吗？</summary>

不是。分别讨论积压清空、服务恢复到可用状态的目标时间与可接受数据损失窗口。</details>

<details><summary>21. 三副本网关 Ready 能证明热点群和 DB 均有余量吗？</summary>

不能。要按会话分布、群/设备工作量、共享 DB/网络和故障后场景取证。</details>

<details><summary>22. 可审容量与数据卡至少包括什么？</summary>

用户确认点、单位/时间窗/假设、四本账的算式、访问模式、热键/增长、物理存储放大、积压恢复、权限/保留与待验证实验。</details>

## 本章完成标准与后续路径

能从 10,000 连接推到 20 入站/s、未来 2,000 设备任务/s，并说明为何 6 B 正文不能推出 6 B 记录；能分开计算权威历史、E9 保留、热群与队列恢复时间，列出 B 25h 补拉还需的保留/权限证据，才算完成第一轮。下一章 13.06 将把一致性、可用、时延、安全、成本与维护性放在同一组质量属性取舍中讨论。
