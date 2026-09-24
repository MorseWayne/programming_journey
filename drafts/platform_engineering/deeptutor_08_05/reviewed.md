# 08.05 分区与再平衡：会话迁移时 E9 去哪里

> DeepTutor 八节初稿经技术与教学审阅后的静态课程。哈希值、四个桶、N1/N2/N3、epoch 7/8、M0–M6 与故障均是**虚构纸上参数**；没有运行 Go、Redis、Kafka、数据库、迁移或站点。当前 S2 仍只承诺 `accepted_in_memory`；未来 S3 的 `stored_in_teaching_db` 是[拟议教学合同](../../../src/docs/platform_engineering/curriculum/09_backend_security/12_im_service_capstone.md)。OpenIM 源码对照限定在已核对的固定提交，不把本章分片模型当作它的部署拓扑。

## 一、先问按谁放置：一个会话、一个用户还是一条消息

前面的虚构 IM 有小会话 `c-a/c-b` 和热点大群 `c-g`。当一台机器的存储、写入或读取预算不够时，可以把**不同键的数据**分给多台机器，这叫**分片**。初学者先把四个对象分开：**分片键**决定一起放置的业务单位，**逻辑桶**是稳定的中间编号，**物理节点**实际承载桶，**副本**是同一分片数据的冗余拷贝。分片增加键空间总容量，副本改善容错或部分读能力；副本的写入确认与切换风险仍需按[08.03](../../../src/docs/platform_engineering/curriculum/08_distributed/03_replication_goals_costs.md)评估。

| 选键 | 方便的业务路径 | 必须承担的代价 |
|---|---|---|
| `user_id` | 某用户收件箱/设备状态能按用户聚合 | `c-a` 的会话历史可能散在多个用户分片；统一 seq、群发与权限查询需要协调 |
| `conversation_id` | `c-a` 的历史、会话内 seq 和必要同键操作较易放在一起 | `c-g` 单个热会话可能独占一个桶的写入/消费预算 |
| `message_id` | 单消息点查分布较均匀 | 按 `c-a` 连续翻页与同会话顺序需要二级索引/跨片查询 |

这不是“三选一永远正确”：不同数据表、索引和事件可选不同键，但每换一处都要重画“请求去哪、如何查权限、如何保证会话序号与游标、失败怎样重试”。**同一会话的消息事实**与**该会话的通知事件**也未必用同一产品分区。先写业务不变量，再选放置策略；不能看见 `c-g` 热就直接把它拆成多分区，同时继续宣称原来的严格同会话顺序免费保留。[07.08 同键顺序](../../../src/docs/platform_engineering/curriculum/07_cache_messaging/08_order_concurrent_consumption.md)

## 二、范围、直接取模与逻辑桶：用三个键手算一次

**范围分片**按键区间或时间段放置，便于某些连续扫描；如果新增流量集中在“最新一段”或少数会话，边界可能形成热点。**哈希取模**把键分散，例如 `hash(key) % N`，点查可按同一函数路由，但按业务键范围扫描不再天然局部。若直接把 `N` 设为**节点数**，增加节点可能让许多键重算到别处；“新增一台机器”并不等于“只移动新机器那份”。[Redis Cluster 分片与槽](https://redis.io/docs/latest/operate/oss_and_stack/management/scaling/)

给一个纯手算模型，不代表任何实际哈希函数：`hash(c-a)=5`、`hash(c-b)=6`、`hash(c-g)=9`。先固定 **4 个逻辑桶 b0–b3**，取 `hash % 4`；再用可版本化的**桶→节点路由表**决定承载位置：

| 会话 | 玩具 hash | 逻辑桶 | epoch 7 的节点 |
|---|---:|---|---|
| `c-a` | 5 | b1 | N1 |
| `c-b` | 6 | b2 | N2 |
| `c-g` | 9 | b1 | N1 |

epoch 7 设 `b0,b1→N1`、`b2→N2`、`b3→N3`。若仅把 b1 改分配给 N3，**键→桶**不变，`c-a` 和 `c-g` 一起搬到 N3；N1 负载可能下降，但 `c-g` 的**单键**最大安全写入速率不会因换机器自动翻倍，N3 甚至可能被拖热。桶数、桶大小和节点容量要在实际负载分布下选择；四桶只便于纸上核算。

对比直接按节点数取模：这三个玩具 hash 在 `N=3` 时分别落 `2,0,0`，在 `N=4` 时分别落 `1,2,1`。如果节点编号代表固定物理归属，三键都可能换归属；逻辑桶则让**增加节点**优先改变桶→节点映射。Redis Cluster 用 **16,384 个 hash slot** 并移动槽来重分配；其官方文档明确说这**不是一致性哈希**，不能把“槽”“一致性哈希环”“broker 分区”混为一种算法。[Redis Cluster 官方说明](https://redis.io/docs/latest/operate/oss_and_stack/management/scaling/)

## 三、单热会话、复制与 broker 分区是三件不同的事

`c-g` 热可能来自很多人同时写同一会话，也可能来自海量读预览/成员列表。加**只读副本**可在合适一致性合同下分担读请求，但不会让单主写入的 seq 分配与本地事务无成本地并行。加**更多逻辑桶**可以让不同会话分散，却不能用 `hash(conversation_id)` 把**同一个 c-g** 自动拆到多桶。要拆同一群的写入，需要重新设计每子流序号、合并顺序、撤回、未读游标和权限快照；这不是扩容脚本的副产品。[08.03 复制目标与代价](../../../src/docs/platform_engineering/curriculum/08_distributed/03_replication_goals_costs.md)

同样，数据库桶 b1 与 Kafka 的分区 **P0** 是两套映射。第七卷玩具 E9 在 P0:42、E10 在 P0:43，讨论的是**事件日志**分区顺序；这里 b1→N1/N3 是**权威或教学存储**的放置。搬 b1 不会自动把 P0 的旧事件搬到另一个 Kafka 分区，也不自动迁移 `SearchIndex` 消费位点。若变更 Kafka topic 分区数，按键取模的未来记录可能进入新分区，而旧记录不自动重排，需重新评审同键顺序。[Kafka 修改分区的官方提醒](https://kafka.apache.org/42/operations/basic-kafka-operations/)

## 四、b1 从 N1 到 N3：先规定谁有写权，再搬数据

定一个教学迁移：epoch **7** 时 b1 的唯一有效写入所有者是 **N1**；计划在 epoch **8** 把 b1 给 **N3**。**路由 epoch**是放置规则的版本，**围栏（fencing）**是拒绝旧版本持有者继续修改权威状态的机制。客户端可能缓存 epoch7，N1/N3 的网络也可能延迟；仅在配置中心把路由表改成 N3，不会把在途请求和旧进程瞬间消灭。[08.01 部分失败](../../../src/docs/platform_engineering/curriculum/08_distributed/01_system_partial_failure.md)

| 迁移点 | 应完成的条件 | 错误捷径的后果 |
|---|---|---|
| M0 | N1 持 epoch7 写权，`c-a` 的 `m-9/seq9` 与 outbox E9 可在教学 S3 提交 | 不能仅因开始迁移就把未提交行当事实 |
| M1 | 为 b1 取得一致快照 `S0` 与可续读变更位置 `L0`，记本题 `c-a` 当时最高 `seq9` | 只记 `seq9` 不足以覆盖 b1 内所有会话和快照后的改动 |
| M2 | N3 装载快照并追 `L0` 后变更；假设 N1 在此期间又提交 `m-10/seq10` | 漏增量会让 N3 缺 E10/消息版本 |
| M3 | 在安全切换点围栏 N1 新写、处理/记录在途请求，证明 N3 已追到包含 `m-10` 的迁移屏障 | 未确认追平就双写/切路由，可能出现两个 seq10 或丢消息 |
| M4 | 将 b1 路由发布为 epoch8，N3 成为唯一可接受新写的所有者 | N1 若仍接受 epoch7 旧客户端请求，会形成双主分叉 |
| M5 | 旧路由请求收到有版本的重定向/拒绝，并以稳定消息 ID 安全重试；读路由核对追平范围 | 静默转发无身份/版本检查可能重复写或越权 |
| M6 | 按 ID、seq、版本、删除/权限和 outbox 状态对账，再决定清理 N1 旧拷贝与保留回退证据 | 切换后直接删旧数据会失去故障核对入口 |

`S0/L0` 是**快照与增量的配对边界**，借用[07.11 影子视图重建](../../../src/docs/platform_engineering/curriculum/07_cache_messaging/11_derived_views_event_time.md)的方法；这里要覆盖整个 b1 的源数据和该范围的变化，不可只凭 `c-a` 的 seq。具体数据库怎样实现快照、位点、复制与围栏，需设计/验证后才能承诺。一次“同时写 N1 与 N3”不是原子操作：若 N1 成功、N3 失败或返回未知，两边会分叉；若有双写阶段，必须明确单一权威、重试、对账和切换屏障，不能把 `dualWrite=true` 当迁移正确性的证明。

## 五、在途 E9/E10：数据追平与事件顺序要各过一关

M2 时 N1 提交 `m-10/seq10`，它的权威消息与 outbox E10 应进入 b1 的增量复制范围。M3 检查 N3 已含 `m-9/seq9` 与 `m-10/seq10`，还要核对相应事件意图和发布状态；**消息行齐全不等于 outbox 齐全**。迁移期间若 A 的 HTTP 响应丢失，客户端先以稳定 ID 查权威状态；旧/新路由冲突时按 epoch 查当前所有者，不凭一次超时就生成新的 ID 或 seq。[07.10 outbox 本地原子范围](../../../src/docs/platform_engineering/curriculum/07_cache_messaging/10_transaction_outbox.md)

复制 b1 的 `PENDING` outbox 时，旧 N1 与新 N3 的 relay 也可能同时看见 E9。发布所有权要随 epoch 交接并围栏旧转发器；发布确认与 outbox 状态须同步/对账。即便这样，ACK 丢失与迁移竞态仍可能带来同一 `evt:m-9:v1` 的重复，消费者继续按稳定事件身份和目标版本幂等，不能把搬迁误称“恰好一次发布”。[07.10 多 relay 与重复](../../../src/docs/platform_engineering/curriculum/07_cache_messaging/10_transaction_outbox.md)

数据库迁移屏障也不自动保证 broker 发布顺序：旧 N1 的 E9 可能还在 relay 手中，新 N3 的 E10 却先发布。若 `c-a` 的处理要求 E9 在 E10 前被 broker 同键接收，必须对发布端加**同会话顺序闸门**，使旧事件的结果/责任先有明确交接；或改写业务合同与目标版本/缺口处理策略。即使 E9/P0:42、E10/P0:43 是本题**原先假定已经排好的日志位置**，迁移设计也必须说明怎样维持这一前提，而不能拿历史例子倒推新发布必然有序。[07.08 生产顺序与完成顺序](../../../src/docs/platform_engineering/curriculum/07_cache_messaging/08_order_concurrent_consumption.md)

若 epoch8 切换后 N3 故障，“回滚路由到 N1”也不是无条件安全：N3 可能已接受新的权威写入，N1 没有；需先围栏 N3、把新写补到替代所有者并核对，再发布下一路由版本。简单把 epoch 从 8 改回 7 会让旧持有者复活并可能覆盖新事实。记录“谁有写权、何时让出、数据追到哪里、路由版本已在哪些客户端生效”，才有可执行回退方案。[08.04 一致性模型](../../../src/docs/platform_engineering/curriculum/08_distributed/04_consistency_models.md)

## 六、“再平衡”也指消费者换人，别和存储搬家混成一件事

Kafka `SearchIndex` 消费组中，P0 原由 W1 处理；扩/缩容或成员故障后改由 W2 处理，也叫**消费者再平衡**。W1 已读 E9(P0:42) 却尚未完成外部索引时，W2 接手可能重做 E9；若错误地提交“下次从 44 读”而 E9 未完成，就会跳过必要效果。对 P0:42 完成后可确认下一位置 43；E10(P0:43) 也完成后，才能按连续已完成前缀推进下一位置 44。具体 ACK/提交策略须配合目标幂等。[Kafka Consumer API](https://kafka.apache.org/41/javadoc/org/apache/kafka/clients/consumer/KafkaConsumer.html) · [07.08 offset 前缀](../../../src/docs/platform_engineering/curriculum/07_cache_messaging/08_order_concurrent_consumption.md)

W1 在失去分区归属后仍可能有迟到的索引写入。应用层需以消费代际/租约和目标端原子版本条件阻止旧工作者覆盖新结果，且不能把“Kafka 把 P0 分给 W2”当成外部索引自动撤销 W1 的写权限。消费者再平衡改变的是 **P0 的处理者**；b1 的迁移改变的是 **c-a/c-g 权威数据的物理所有者**。两者可能同时发生，需要分别保留位点与 owner epoch，不能只监测一项 `rebalance_done` 就宣布系统一致。[07.08 旧 worker 迟到](../../../src/docs/platform_engineering/curriculum/07_cache_messaging/08_order_concurrent_consumption.md)

## 七、固定 OpenIM 源码：可见会话相关 key，仍未知分区映射

在固定 `openimsdk/open-im-server` 提交 `f6411a8a1a31d3df36f4c2b3ad28481a94141e1f` 的 [`internal/rpc/msg/send.go` 群聊路径](https://github.com/openimsdk/open-im-server/blob/f6411a8a1a31d3df36f4c2b3ad28481a94141e1f/internal/rpc/msg/send.go#L46-L70)，代码用 `GenConversationUniqueKeyForGroup(req.MsgData.GroupID)` 生成传入 `MsgToMQ` 的 key。在 [`pkg/common/storage/controller/msg.go` 的 `MsgToMQ`](https://github.com/openimsdk/open-im-server/blob/f6411a8a1a31d3df36f4c2b3ad28481a94141e1f/pkg/common/storage/controller/msg.go#L132-L137) 中，该 key 交给 `db.producer.SendMessage(ctx,key,msg2mq)`。这可核对的是**有一条会话相关 key 传递路径**，不是“已核对它最终落哪个 Kafka 分区”。

具体 key 字节如何构造、生产者分区算法/配置、topic 分区数与变更、底层数据存储是否按会话分片、迁移 epoch/围栏、broker ACK 等级，这两处都没有完整证据。要填“OpenIM 实际如何再平衡”，必须继续追对应函数、配置、生产者实现、日志与部署拓扑。上文四桶、N1→N3、双 relay/E9/E10 都是**教学备选模型**，不能写成 OpenIM 的现状。Redis Cluster 的 16,384 槽和 Kafka 分区数变化则各按其官方文档限定，不能把一种产品的路由规则套到另一个。[OpenIM 阅读地图](../../../src/docs/platform_engineering/curriculum/im_reference.md)

## 八、迁移评审交付与 22 道分层练习

第一遍交付四桶路由表和三个键的算式；第二遍交付 M0–M6 的**写权/数据/路由/事件**四列矩阵，写出快照与增量配对、旧路由处理、E9/E10 同键顺序、P0 消费者再平衡与回退条件。真实测试必须记录路由版本、分区/副本配置、消息 ID 差集、延迟和故障过程；本文没有替代执行。

### 基础 1–8：先辨认放置对象

<details><summary>1. `conversation_id` 作分片键，主要保住什么局部性？</summary>

同一会话的历史、序号与某些必要同键操作更容易落在一起；代价是单热会话可能形成瓶颈。</details>

<details><summary>2. 分片与副本各做什么？</summary>

分片把不同键分给不同位置；副本保存同一分片的冗余拷贝，确认/滞后另需审。</details>

<details><summary>3. 玩具 `hash(c-a)=5`，四桶时落哪桶？</summary>

`5 % 4 = 1`，落 b1。</details>

<details><summary>4. `c-b` 与 `c-g` 分别落哪桶？</summary>

`6 % 4 = 2` 为 b2；`9 % 4 = 1` 为 b1。</details>

<details><summary>5. epoch7 的 b1 在哪台节点？</summary>

N1；本题 `c-a` 和 `c-g` 都随 b1 在 N1。</details>

<details><summary>6. 只搬 b1 到 N3，会自动拆开 `c-g` 单热写流吗？</summary>

不会。`c-g` 仍是一个键，只是该桶及同桶 `c-a` 换到 N3。</details>

<details><summary>7. Redis Cluster 的 16,384 槽就是一致性哈希环吗？</summary>

不是。官方说明它按 hash slot 分片，而非一致性哈希。</details>

<details><summary>8. Kafka 的 P0 与数据库 b1 是同一个分片吗？</summary>

不是。前者是事件日志分区，后者是本章教学存储桶，路由、位点和迁移独立。</details>

### 手算与故障 9–16：看迁移期间的交错

<details><summary>9. 直接 `hash % nodeCount`，三个玩具键由 3 节点变 4 节点会怎样？</summary>

分别从 `2,0,0` 变 `1,2,1`；若编号对应固定节点，都会换归属。</details>

<details><summary>10. M1 只记 `c-a H=seq9`，足以覆盖 b1 的完整增量吗？</summary>

不足。b1 还有 `c-g`，需要与一致快照配对的该范围可续读变更位置 `L0`。</details>

<details><summary>11. M2 N1 新提交 `m-10/seq10`，N3 只复制旧快照会怎样？</summary>

N3 缺新消息及相关 outbox/版本；切路由前必须追增量并对账。</details>

<details><summary>12. 旧客户端持 epoch7 到 N1，M4 后 N1 可继续写吗？</summary>

不可。N1 失去写权后应按版本重定向/拒绝，避免与 N3 分叉。</details>

<details><summary>13. 同时写 N1/N3 就得到跨节点原子提交吗？</summary>

没有。任一侧失败或结果未知会分叉，必须明确唯一权威与修复/对账。</details>

<details><summary>14. N3 已有消息行，就能直接认定 E9/E10 均已发吗？</summary>

不能。outbox 意图、broker 确认与消费者效果分别核对。</details>

<details><summary>15. N3 先发布 E10，旧 N1 的 E9 尚在手中，单靠同键 Kafka 分区能纠正吗？</summary>

不能。分区只按实际收到顺序追加；须在生产侧设顺序闸门或明确改变业务合同。</details>

<details><summary>16. epoch8 后 N3 接受新写又故障，可无条件把路由改回 epoch7 N1 吗？</summary>

不能。先围栏旧新写权、同步 N3 新事实并核对，再发布下一有效路由版本。</details>

### 评审 17–22：拆开两种再平衡

<details><summary>17. W1→W2 接手 P0，会移动 b1 的权威数据库数据吗？</summary>

不会。消费者组分区归属与存储桶迁移是两件事。</details>

<details><summary>18. E9(P0:42) 未完成，却提交“下次从 44 读”有什么风险？</summary>

恢复者越过 E9 和 E10 的位置，必要索引效果可能丢失。</details>

<details><summary>19. W1 失去 P0 后迟到写索引，Kafka 自动禁止外部写吗？</summary>

不能依赖。应用要用代际/租约围栏和目标版本条件阻止过期结果。</details>

<details><summary>20. 扩 Kafka 分区数会把同键旧记录自动搬到新分区吗？</summary>

不会。未来记录映射可能变化，旧日志不自动重排，需审顺序和消费策略。</details>

<details><summary>21. 固定 OpenIM 两处源码能证明最终 Kafka 分区算法吗？</summary>

不能。它们只证明群聊路径把会话相关 key 传给 `MsgToMQ`，后者传给 `SendMessage`。</details>

<details><summary>22. M6 清理旧数据前，最少核对什么？</summary>

ID、会话 seq、当前版本、删除/权限、outbox/发布状态、增量追平屏障与旧路由写入是否已围栏，并保留可回退证据。</details>

## 本章完成标准与后续路径

能不看答案手算三键落桶，解释为什么虚拟桶让**桶搬迁**可控却拆不开 `c-g` 单热键；能用 M0–M6 写出单写者、快照增量、epoch 围栏、E9/E10 顺序、旧客户端与回退条件，并将数据库搬迁与 P0 消费者再平衡分开，才算完成第一轮。第二轮在自己的隔离环境按真实配置演练，记录差集与失败证据。下一章 [08.06 多数与共识](../../../src/docs/platform_engineering/curriculum/08_distributed/06_majority_consensus.md) 将从任期、投票和复制日志继续追问谁有写权，以及何时能承诺一条记录已提交。
