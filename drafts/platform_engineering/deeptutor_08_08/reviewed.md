# 08.08 跨服务事务：消息已保存，通知失败怎么办

> DeepTutor 八节初稿经技术与教学审阅后的静态课程。`m-9/c-a/u-a`、MessagesDB、DeliveryLedgerDB、E9、C0–C6 均是**虚构纸上模型**；没有运行 Go、PostgreSQL、broker、IM、故障或站点。当前 S2 的成功仍是 `200 accepted_in_memory`；未来 S3 `200 stored_in_teaching_db` 只是[拟议教学合同](../../../src/docs/platform_engineering/curriculum/09_backend_security/12_im_service_capstone.md)。下面的 2PC、Saga、outbox 是供需求评审的不同方案，不代表 OpenIM 已采用。

## 一、先写业务结果：通知失败不等于消息要消失

假设未来教学 S3 中，已认证且有权限的 `u-a` 向 `c-a` 发送 `m-9/seq9`，权威 SQL 消息记录与 outbox E9 在**同一数据库事务**提交。SearchIndex 和 Notify 后续独立消费 E9。此时通知依赖失败，B 的设备没有收到实时提示。产品应先回答：A 的已提交消息是否仍在有权历史里？B 重连能否补拉？搜索与预览何时修好？用户若已经看见一条错误提示，怎样纠正？不能只问“事务能不能 rollback”。[07.12 历史、通知与设备的确认点](../../../src/docs/platform_engineering/curriculum/07_cache_messaging/12_cross_system_consistency_case.md)

本题把**消息事实**作为权威，把在线提示作为可失败、可补偿的外部体验。若消息已对 A 承诺“本地已提交”，Notify 故障不能偷偷物理删除 `m-9` 来制造“好像整笔业务没发生”。相反，须保留可恢复的通知意图或明确不保留的产品合同，并让 B 在离线/断连后按当前权限查权威历史。所有回应要标出它达到哪一阶段：S2 现在只有进程内受理；纸上 S3 才谈 DB Commit；broker、索引、设备接收与阅读各有另一个证据。[07.06 消息抽象](../../../src/docs/platform_engineering/curriculum/07_cache_messaging/06_message_abstractions.md)

| 需要保证的事实 | 允许的中间状态 | 失败后查看什么 |
|---|---|---|
| `m-9` 是否成为历史 | S3 提议中提交已知、提交未知、回滚 | `messages` 中稳定 ID 与事务结果 |
| E9 是否会进入后续处理 | `PENDING`、发布结果未知、已知 broker 接受 | 同库 outbox、发布记录和稳定 `event_id` |
| SearchIndex/Notify 是否追上 | 可能各自滞后、隔离或重试 | 各自目标状态、消费进度和权威对账 |
| B 是否收到/已读 | 可在线尝试、离线、补拉或回执未知 | 设备协议与经授权的历史查询，不看单个队列 ACK |

## 二、先看本地事务的边界，再比较跨服务手段

一个 SQL `*sql.Tx` 只能原子处理它实际覆盖的数据库事务。在[07.10 教学 outbox](../../../src/docs/platform_engineering/curriculum/07_cache_messaging/10_transaction_outbox.md)中，`messages(m-9)` 与 `outbox(evt:m-9:v1,PENDING)` **同库同事务**，Commit 成功则事实和“待发布意图”同时存在。relay 再把 E9 送到 broker；发布 ACK 丢失可能重复，SearchIndex/Notify 各自还要幂等、隔离、对账。outbox 解决**本地 DB 已提交却没留下可靠事件意图**的裂缝，不能把 broker 或 B 设备纳入 SQL Commit。[PostgreSQL 事务原子范围](https://www.postgresql.org/docs/current/tutorial-transactions.html)

另一种朴素方案是两个独立资源顺序写：先提交 MessagesDB，再调用 DeliveryLedgerDB 或 Notify，前者成功后故障会留下“消息有、提示无”；先写通知，随后 MessagesDB 回滚则可能发出孤儿提示。把两次 `Commit` 放在同一个 Go 函数里也不会使它们原子。[08.01 部分失败与结果未知](../../../src/docs/platform_engineering/curriculum/08_distributed/01_system_partial_failure.md)

接下来的 **2PC** 只讨论**两个都支持准备状态的事务参与者**：虚构 MessagesDB 与 DeliveryLedgerDB。**Saga** 则讨论一串各自提交的业务步骤与后续重试/补偿。它们回答不同需求；把词汇写在架构图上不会自动改善接口合同或设备送达。

## 三、2PC：准备、持久决议与“已投 YES 却不知道结局”

在玩具两阶段提交（2PC）里，协调者 C 给一笔全局操作分配 ID `tx:m-9`。第一阶段，C 请 MessagesDB 与 DeliveryLedgerDB 各自 **prepare**；参与者在自己的存储里保证后续可按全局决定提交或回滚，并答 YES/NO。任一 NO，C 决定 ABORT；都 YES，C **持久记录全局 COMMIT 决议**，再通知各参与者执行第二阶段的 `COMMIT PREPARED`。决议通知或 ACK 丢失时，应从可恢复的协调者决议与参与者 prepared 状态继续，不能重新随意选一个结果。[PostgreSQL 两阶段事务](https://www.postgresql.org/docs/current/two-phase.html)

| 纸上故障点 | 参与者知道什么 | 安全恢复责任 |
|---|---|---|
| C0：某参与者 prepare 前失败/投 NO | 尚未全员可提交 | C 记录 ABORT，通知已准备者回滚 |
| C1：两者都投 YES，C 尚未持久记录决议便失联 | 各自 prepared，**不知道全局结局** | 参与者不能单独猜 commit/abort；等待/恢复 C 的可判定决议 |
| C2：C 已持久记录 COMMIT，通知 DeliveryLedgerDB 前崩溃 | 决议已定，但该参与者可能仍 prepared | C 恢复后重发 COMMIT；参与者按同一 tx ID 收敛 |
| C3：参与者已提交，但 ACK 丢失 | C 对回执未知 | 查参与者状态或幂等重试完成通知，不能误认为回滚 |

2PC 的关键代价是 **in-doubt（结果待决）**：C 在参与者投 YES 后失联，参与者可持有锁与 prepared 状态，不能像普通应用超时那样自行放弃。Jim Gray 与 Leslie Lamport 的论文明确把经典 2PC 的协调者故障阻塞作为边界。[Consensus on Transaction Commit](https://arxiv.org/abs/cs/0408036) PostgreSQL `PREPARE TRANSACTION` 供**外部事务管理器**使用；官方警告长时间 prepared 会持锁并妨碍 VACUUM 清理，未配置事务管理器时不应把它当普通业务语句长期留下。[PostgreSQL PREPARE TRANSACTION](https://www.postgresql.org/docs/current/sql-prepare-transaction.html)

这里 **Notify 的 WebSocket 字节发送不支持本题的 prepare/commit/rollback**，普通 broker 发布调用也不能仅因 PostgreSQL 支持 `PREPARE` 就自动成为参与者。某产品另有事务 API 时仍须核对它的范围和协议；本题不把“数据库原子提交”扩大为“对方设备永远没见过、或必然见过”。[07.12 外部确认边界](../../../src/docs/platform_engineering/curriculum/07_cache_messaging/12_cross_system_consistency_case.md)

## 四、Saga：一串局部提交，可补偿不等于擦掉历史

Saga 把长业务过程拆成可独立提交的局部事务，并在失败时以**后续补偿动作**修正已发生的局部效果。原始 Saga 论文讨论的是长事务被拆分及部分执行后的补偿，不能由名字推断所有外部副作用可原样撤销。[Garcia-Molina 与 Salem：Sagas](https://www.cs.princeton.edu/research/techreps/598)

对本题，可用一份**持久工作流记录**跟踪：授权/校验 → 教学 S3 消息与 outbox Commit → E9 发布 → SearchIndex 追赶、Notify 尝试 → B 设备另报收/读。若授权在 Commit 前拒绝，根本不产生 `m-9`；一旦 DB Commit 已对 A 承诺，消息事实成为本题的**业务分界点（pivot）**：此前可因拒绝而回滚，此后后续步骤应以有界重试、目标查询、隔离/人工修复追赶，**不是对已承诺消息做无记录的物理删除**。pivot 是本题按用户承诺选定的业务界线，不是所有 Saga 自动固定在数据库提交处。搜索与通知可以并行，故应各有子状态，而不是一个线性的“全成功”。[07.09 有界重试与隔离](../../../src/docs/platform_engineering/curriculum/07_cache_messaging/09_backlog_poison_messages.md)

| 子步骤 | 成功证据 | 失败策略 |
|---|---|---|
| 权威消息 | S3 提议的本地 Commit 与消息 ID | Commit 前拒绝则回滚；Commit 后结果未知先查 ID |
| 发布 E9 | outbox 意图与 broker 的已知确认 | 同 `evt:m-9:v1` 重试；ACK 未知防重复效果 |
| SearchIndex | `m-9` 当前版本文档与对账 | 修复输入/依赖后重放或从权威重建 |
| Notify | 受控推送尝试及目标回执 | 暂时失败重试；永久错误隔离；B 离线靠历史补拉 |
| B 的收/读 | 设备/用户回执合同 | 不由工作流“通知完成”替代 |

如果错误提示**已发到 B**，后续“撤回”通知只能是新的更正/撤回业务动作；它可以让当前视图收敛，不能抹去 B 曾经看见的内容。若消息合法编辑为 `m-9:v2`，旧 `v1` 的重放也不可覆盖新事实或把已删除私有正文恢复到搜索。所有补偿都要有身份、版本、权限和审计；“发出补偿命令”仍不等于目标已处理。[07.11 派生视图重建](../../../src/docs/platform_engineering/curriculum/07_cache_messaging/11_derived_views_event_time.md)

Saga 可由一个持久编排者保存步骤/重试/补偿责任，也可由服务事件协作；前者清楚展示流程状态，后者需防环路、隐式耦合和遗漏。无论哪种，Saga 本身不提供跨所有局部事务的 SQL 隔离，也不神奇解决消息发布与本地事实的双写；该交界仍需 outbox/可靠事件或明确对账。[Sagas 原论文](https://www.cs.princeton.edu/techreports/1987/070.pdf) · [Debezium Outbox Event Router](https://debezium.io/documentation/reference/stable/transformations/outbox-event-router.html)

## 五、操作 ID 与状态查询：超时不是失败，也不是成功

用稳定 `operation_id=send:m-9:v1` 串联 HTTP 请求、权威消息、outbox、两个派生目的和故障工单。**操作状态**应是一组带时间/版本的事实，而非单个模糊 `done`：例如 `message=STORED`、`publish=PENDING/PUBLISHED/UNKNOWN`、`search=PENDING/APPLIED/REPAIR`、`notify=PENDING/ATTEMPTED/REPAIR`、`device=UNKNOWN/RECEIVED/READ`。状态是教学方案，不是现有接口字段；`PUBLISHED` 不表示 B 收到，`ATTEMPTED` 不表示 B 已读。[07.10 PUBLISHED 边界](../../../src/docs/platform_engineering/curriculum/07_cache_messaging/10_transaction_outbox.md)

客户端 A 在未来 S3 中若遇到“DB Commit 可能成功、HTTP 回应丢失”，应按稳定消息/操作 ID **查询权威结果**，或通过拟议的有权状态查询接口了解各阶段；不能从超时推断失败，也不能因盲目换新 ID 产生第二条消息。当前 S2 的接口合同仍要求同 ID 重复**即使同正文也 409**、非成员目标隐藏 **404**、正文上限 **6 UTF-8 字节**、总请求上限 **4096 B**；本章没有给 `/v1` 偷加 2PC/Saga 查询语义。若未来暴露 `GET /operations/{id}`，要另审身份、权限、状态粒度、保留与客户端兼容。[09.02 当前 HTTP 合同](../../../src/docs/platform_engineering/curriculum/09_backend_security/02_http_api_contract.md)

工作流/工单状态要有**下一责任人或自动动作、最后错误、重试预算、源事实版本**，否则“PENDING”只是一张越积越老的表。查询本身也不能拿派生缓存的旧状态冒充权威 DB Commit，尤其在复制滞后或故障切换时要标明读取来源与时效。[11.03 观测证据](../../../src/docs/platform_engineering/curriculum/11_reliability/03_logs_metrics_traces.md)

## 六、同一 m-9 的六个故障：按方案分别判断

| 故障 | 2PC 纸上方案 | S3 SQL+outbox/业务步骤方案 |
|---|---|---|
| 两参与者 prepare 后协调者失联 | prepared 参与者待决、持锁；恢复全局决议 | 该方案没有两个 prepared 参与者；看本地 Commit/outbox 状态 |
| 决议已持久为 COMMIT，但一方 ACK 丢失 | 重新通知/查参与者，不能改成 ABORT | 不能把 broker ACK 未知当作 2PC 决议；按事件 ID 重试 |
| 消息已提交、relay 未发布 E9 | 2PC 若只含两 DB，不能自动保证 broker | outbox `PENDING` 留下待发意图，恢复扫描 |
| SearchIndex 写成、消费 ACK 丢失 | 不属于两个数据库 prepare 范围 | 目标按 ID/版本幂等，重复消费后对账 |
| Notify 请求可能成功但回执丢失 | WebSocket 不可准备/回滚 | 先查任务/目标状态，受控重试，设备结果另证 |
| B 离线 25h，玩具 broker 保留 24h | 全局 DB 决议也不会保留旧 broker 事件 | 按当前权限从权威历史用 `seq` 游标补拉 |

故障诊断从“用户搜不到/没弹提示”回到 `m-9` 的**权威事实、当前权限和版本**，再查 outbox、broker、SearchIndex、Notify、设备。E-bad 之类永久坏事件不能靠无限重试修；已编辑的 v2 不能被迟到 v1 覆盖。对账应比较 ID 集合、版本、撤回/删除与可见范围；数量相同不足以证明结果正确。[07.09 坏消息](../../../src/docs/platform_engineering/curriculum/07_cache_messaging/09_backlog_poison_messages.md) · [07.12 对账与补偿](../../../src/docs/platform_engineering/curriculum/07_cache_messaging/12_cross_system_consistency_case.md)

## 七、选型时问参与者和用户承诺，再看固定 OpenIM 证据

若两个资源**确实都支持准备与全局决议**，且业务必须在两者之间作原子提交，可以评估 2PC 的事务管理器、持锁时间、协调者恢复与故障期间可用性。若消息历史已经是已承诺事实，后续搜索/在线提示可分别追赶，教学 SQL+outbox、稳定事件 ID、持久工作流状态、幂等处理、补拉/对账更贴近这个 IM 需求。Saga 可组织复杂多步业务，但“补偿”不是物理时间倒流；outbox 能闭合一段本地双写裂缝，却不是所有步骤都完成的总证明。[PostgreSQL 2PC 文档](https://www.postgresql.org/docs/current/two-phase.html) · [Sagas 论文](https://www.cs.princeton.edu/research/techreps/598)

固定 `openimsdk/open-im-server` 提交 `f6411a8a1a31d3df36f4c2b3ad28481a94141e1f` 中，[`send.go` 的所述路径](https://github.com/openimsdk/open-im-server/blob/f6411a8a1a31d3df36f4c2b3ad28481a94141e1f/internal/rpc/msg/send.go#L46-L70)在 `MsgToMQ` 无错后返回，[另一 MongoDB 消费处理](https://github.com/openimsdk/open-im-server/blob/f6411a8a1a31d3df36f4c2b3ad28481a94141e1f/internal/msgtransfer/online_msg_to_mongo_handler.go#L43-L69)调用 `BatchInsertChat2DB`。两处足以说明所述发送响应点不是该 Mongo 批量写的完成点；**不能由它们证明 OpenIM 使用 2PC、Saga 或本章教学 SQL outbox**。进一步判断须追具体参与者、事务/队列配置、失败分支与运行证据，未知格保持未知。[09.05 固定源码边界](../../../src/docs/platform_engineering/curriculum/09_backend_security/05_data_access_migration.md)

## 八、用 22 题交付“阶段与恢复来源”矩阵

第一遍画本地事务、2PC 两阶段及 outbox 边界；第二遍把 C0–C3 和六个 IM 故障点填成“已知/未知/查哪里/谁继续”的表，再给每个外部效果写补偿是否可逆。纸上推演没有代替真实数据库、broker 或设备观察。

### 基础 1–8：先认清原子范围

<details><summary>1. 当前 S2 `200 accepted_in_memory` 能证明数据库已提交吗？</summary>

不能。未来 S3 `stored_in_teaching_db` 只是另拟的本地数据库提交合同。</details>

<details><summary>2. 同库 `messages` 与 outbox 能由一个 SQL 事务同成同败吗？</summary>

能，在它们确实处于该事务覆盖的同一个数据库范围时；broker/设备仍在外面。</details>

<details><summary>3. 两个独立数据库各自 `Commit`，放同一个 Go 函数里就原子了吗？</summary>

没有。两个系统之间仍有崩溃和回应未知的空窗。</details>

<details><summary>4. 2PC 本题的两个参与者是什么？</summary>

虚构 MessagesDB 与 DeliveryLedgerDB，前提是两者都支持准备/提交协议。</details>

<details><summary>5. WebSocket 字节发送可仅靠 PostgreSQL `PREPARE TRANSACTION` 加入 2PC 吗？</summary>

不能。该外部动作没有因此获得 prepare/commit/rollback 能力。</details>

<details><summary>6. outbox 的 `PUBLISHED` 可直接表示 B 已读吗？</summary>

不能。它在教学方案里只表示所选 broker 发布确认阶段。</details>

<details><summary>7. Saga 的补偿等于数据库回滚已发到 B 的提示吗？</summary>

不等于。补偿是新动作，不能抹去 B 已见的外部事实。</details>

<details><summary>8. SearchIndex 与 Notify 能用一个模糊 `done` 代表吗？</summary>

不能。两条派生目的独立进展、失败与对账，设备收/读又是另外状态。</details>

### 2PC 与故障 9–16：谁在等待谁

<details><summary>9. 一个参与者在 prepare 阶段投 NO，协调者应怎样决定？</summary>

决定 ABORT，并让已准备的参与者按该决议回滚。</details>

<details><summary>10. 两个参与者都投 YES，协调者在持久决议前失联，参与者能各自猜 COMMIT 吗？</summary>

不能。它们处于 in-doubt，需等/恢复全局决议，可能持锁阻塞。</details>

<details><summary>11. C 已持久决定 COMMIT，发给一方的消息丢了，能改 ABORT 吗？</summary>

不能。按同一全局 tx ID 重发决定或核查参与者，决议已确定。</details>

<details><summary>12. PostgreSQL prepared 事务长期不结束，最直接的运维代价是什么？</summary>

继续持有锁，并妨碍 VACUUM 清理等；需要外部事务管理器及时收尾。</details>

<details><summary>13. 消息已提交、relay 未发 E9，2PC 两个数据库参与者自动修 broker 吗？</summary>

不自动。教学 outbox 的 `PENDING` 与转发/对账负责这段跨系统裂缝。</details>

<details><summary>14. broker ACK 丢失可断言 E9 未发布吗？</summary>

不能。结果未知，沿稳定 `evt:m-9:v1` 重试并由消费者幂等收敛。</details>

<details><summary>15. Notify 可能已推送但回执丢失，应无条件重做非幂等副作用吗？</summary>

不应。先查目标/设备可得证据，按稳定任务 ID 受控重试；必要时承认未知。</details>

<details><summary>16. B 离线 25h，玩具 broker 只保留 24h，应从哪补消息？</summary>

按当前权限从权威 `messages` 历史按 `seq` 游标补拉。</details>

### Saga、状态与源码 17–22：把用户承诺放回来

<details><summary>17. 已向 A 承诺 S3 DB Commit 后，Notify 失败可无记录删除 `m-9` 吗？</summary>

不能。消息是已承诺事实；修复通知，或按显式业务规则发新撤回/更正动作并留证据。</details>

<details><summary>18. `operation_id=send:m-9:v1` 解决 HTTP 回应丢失的哪一步？</summary>

提供稳定身份来查权威提交和各子步骤状态，避免盲目换 ID 重建第二条消息。</details>

<details><summary>19. 当前 S2 同 ID 相同内容再发可以改成幂等 200 吗？</summary>

不能。本系列固定当前合同仍为 409，未来新接口须单独评审。</details>

<details><summary>20. 迟到 `m-9:v1` 能覆盖搜索里当前 v2 吗？</summary>

不能。用权威版本、删除和权限条件更新或重建派生目标。</details>

<details><summary>21. 固定 OpenIM 两段源码能证明它使用 2PC 或 Saga 吗？</summary>

不能。只看到所述 `MsgToMQ` 之后返回和另一路 Mongo 消费写入位置。</details>

<details><summary>22. 整个工作流什么时候可对用户说“B 已收到”？</summary>

只有在所选设备协议提供并核对 B 的接收证据时；DB Commit、outbox、broker 和 Notify 尝试都不够。</details>

## 本章完成标准与下一步

能不看答案解释 C1 prepared 待决为何可能阻塞、outbox 为什么只闭合一段本地双写、Saga 的局部步骤与补偿为何不能撤销 B 已见提示；能把 `m-9` 已提交但通知失败写成有状态、有责任、有查询与对账的恢复方案，才算完成第一轮。真实实践须另外记录配置、参与者状态、故障注入和设备证据。下一章 [08.09 可靠任务与调度](../../../src/docs/platform_engineering/curriculum/08_distributed/09_reliable_jobs_scheduling.md) 将沿这些状态进一步设计可靠任务的重试、接管与完成记录。
