# 07.06 消息抽象：在线提示、后台任务与可回放日志

> DeepTutor 八节初稿经技术与教学审阅后的静态课程。`m-9`、事件 E9、分区 P0、偏移 42、24 小时保留和 worker 都是**纸上教学模型**；没有运行 Redis、NATS、Kafka、Go、数据库、IM 服务或站点，也不声称 OpenIM 用这些特定中间件路径。当前 S2 `200 accepted_in_memory` 与未来 S3 v2 数据库提交提议仍分别成立。

## 一、数据库已有 m-9，为什么还要传一条“消息”？

承接 06.12 的**未来 S3 教学情景**：`m-9` 已作为 `c-a.seq=9` 在权威消息数据库中已知提交。之后有三件不同的事：若 B 在线，可**提示**它补拉；后台搜索索引要更新；B 若离线很久，之后仍要能查历史。数据库里的 `m-9` 是**业务消息事实**，事件 **E9** 是告诉后续组件“这份事实值得处理”的**处理通知**。E9 即使在某中间件里可保存，也不会因叫 message 就自动变成消息正文的唯一权威来源。[07.01 状态角色](../../../src/docs/platform_engineering/curriculum/07_cache_messaging/01_access_state_roles.md)

**生产者**把 E9 交给消息系统，**消费者**按订阅/分工处理，**保留**决定事件还能否重读，**确认（ACK）**要问清是谁对哪一步确认。A 收到未来 `stored_in_teaching_db` 只对应数据库提交合同；它不等于 E9 已进入 broker，更不等于 B 收到通知或已读。当前 S2 的 200 只表示进程内受理，更不能直接跳到本章的 S3 后续链路。

| 第一遍 | 第二遍 | 交付物 |
|---|---|---|
| 队列、发布订阅、日志；生产者/消费者/保留/确认 | 分区、消费组、重放、跨系统空窗与设备边界 | 三条业务链路选择表、E9 位置图、五个确认点 |

## 二、队列、发布订阅、日志：关注的是分发与保留合同

**任务队列**适合一项工作由一个 worker **在某次投递中**承担，多个 worker 竞争可分担负载；失败后是否重投要看队列的 ACK/期限/保留协议，不能把“一次投递一个 worker”误背成“永远只执行一次”。**发布订阅（Pub/Sub）**将一个发布广播给当时订阅的接收者，适合在线信号；Redis Pub/Sub 官方给出的基本交付语义是至多一次，断开的订阅者不会靠该通道自动收到过去消息。**可回放日志**把事件按分区追加并在配置的保留范围内供消费者从位置重读，适合需要独立消费进度和重建派生状态的任务。[Redis Pub/Sub](https://redis.io/docs/latest/develop/pubsub/) · [Kafka Introduction](https://kafka.apache.org/intro/) · [NATS JetStream 消费者](https://docs.nats.io/learn/jetstream/pull-consumers)

| 本题需求 | 优先考虑的抽象 | 关键前提 | 不自动得到 |
|---|---|---|---|
| B 在线时收到“有 m-9 可补拉” | 在线 Pub/Sub 提示可作候选 | 离线后另有权威历史补拉 | B 离线期间的重放与已读 |
| 搜索索引处理 E9 | 有确认/重试的任务队列或日志消费者 | 处理可重复、搜索状态可对账 | 外部索引恰好一次更新 |
| 多个独立系统要从 E9 重建 | 有界保留的分区日志/流 | 明确保留、偏移、版本和回放权限 | 永久聊天历史或无限回放 |
| B 离线 25 小时后查 m-9 | 权威消息数据库历史查询 | 当前成员/可见范围仍允许 | broker 恰好保留超过 25 小时 |

不同产品可在一个系统中组合这些能力，表格是**选择访问模型**，不是宣布某个产品只能做一行。后续 07.07–07.09 才细化重投、顺序和积压，07.10 才讨论数据库事务与事件发布之间的桥接。

## 三、在线提示：发布成功不是 B 已接收，离线更不自动补发

假设 S3 数据库已提交 `m-9`，G 在确认后发布“`c-a` 有新消息”的 E9 在线提示。B 此刻订阅且链路健康时可以接到提示，再凭受信身份和会话权限去数据库/消息服务**补拉真实 m-9**；提示只承载最小 ID/序号或受控引用，不直接向任意订阅者广播私有正文。若 B 在发布时离线、没有订阅，Redis Pub/Sub 不会为它保存 E9 待后续重放；它上线后仍应从权威历史和游标补拉。[Redis Pub/Sub 交付语义](https://redis.io/docs/latest/develop/pubsub/)

“发布命令成功”最多说明中间件接受了该发布动作，不能从中推导 B 的网络连接收到、应用处理、界面展示或用户阅读。即使 G 得到某个在线订阅数量，也不是每台目标设备的应用确认。若产品需求要求离线通知保留、可靠推送或跨节点重试，就要另设可回放/确认路径与设备级证据；不能把 Pub/Sub 的实时广播称为离线信箱。[09.12 完整服务项目](../../../src/docs/platform_engineering/curriculum/09_backend_security/12_im_service_capstone.md)

## 四、后台索引任务：ACK 在副作用前后都可能出事

让搜索索引消费 E9。教学逻辑组 `SearchIndex` 有 W1、W2 两个 worker，一次队列投递中 E9 可以交给其中一个处理；**不是**因为有两个 worker 就要求把同一索引任务执行两遍。设 W1 处理时有两个崩溃窗口：

| 时序 | 崩溃位置 | 搜索索引状态 | 接下来可能发生 |
|---|---|---|---|
| 先 ACK，再写索引 | ACK 后、写入前 | E9 的索引效果缺失 | broker 可能认为已完成，不自动重投 |
| 先写索引，再 ACK | 索引已写、ACK 前 | E9 可能已生效 | broker 可能重投给 W1/W2，造成重复处理 |

通常要让**可重复的处理**与 ACK 协作：用稳定 `message_id=m-9`、消息版本/撤回状态作为索引更新的幂等键，保留失败记录并对账；ACK 代表消费者按其协议完成处理，**不表示 B 设备收到通知**。具体系统的 ACK 期限、重投次数和保留均要按产品配置核对；NATS JetStream 的消费者文档提供了保留消费进度与确认的实际术语，Redis Stream 的 `XACK` 则只改变其消费组待确认引用。这些不是彼此可直接互换的协议。[NATS JetStream Pull Consumers](https://docs.nats.io/learn/jetstream/pull-consumers) · [Redis Streams](https://redis.io/docs/latest/develop/data-types/streams/)

“搜索索引后来可重建”还需权威 m-9 和稳定的更新/删除事件来源；如果消息撤回后只重放原始 E9，搜索结果可能泄露旧正文。处理规则应按**当前消息版本与权限**定义，不能把一次 ACK 当最终业务真相。

## 五、可回放日志：E9 的 offset 42 与 seq9 没关系

另用**教学分区日志**画 E9：假设 `conversation_id='c-a'` 的事件按稳定策略进入分区 **P0**，E9 在 P0 的 **offset=42**。`m-9` 是**业务消息身份**；`seq=9` 是 `c-a` 内历史顺序；`offset=42` 只表示这个**broker 分区**中的位置。三者都不能直接互算，也不等于 A/B 设备收到的次数。[Kafka Introduction](https://kafka.apache.org/intro/)

```text
业务事实：messages(m-9, c-a, seq=9) 已在教学 DB 提交
派生事件：E9 {message_id:m-9, conversation_id:c-a, seq:9, version:...}
broker： topic "message-events" / partition P0 / offset 42  ← 仅纸上位置
```

若同一 `c-a` 的后续 E10 仍使用相同分区策略落在 P0，消费者按该**分区内**追加顺序读到 E9、E10；这不制造与 `c-b` 所在 P1 事件的**全局总序**。不同生产者重试、改分区数或业务 `seq` 分配时，还需另审顺序能否映射，07.08 再展开。Kafka 官方将事件按键落入分区，并把顺序保证限定在分区内。[Kafka Introduction](https://kafka.apache.org/intro/)

逻辑消费组 `SearchIndex` 与 `Notify` **各自**需要看到 E9，因此各有自己的消费进度；`SearchIndex` 组里 W1/W2 则分担分区/任务，同一组不会因为两个 worker 就让每个 worker 都获得一次 E9。故障再平衡或重放时仍可能**再次处理**，不是“永远只交一次”。这是日志组/任务组的分工，和 Redis Pub/Sub 把在线发布送给各当前订阅者不同。存储/消费进度与应用副作用、B 设备结果各自需要证据。

## 六、保留与回放窗口：24 小时日志接不住 25 小时离线

设这份教学事件日志只保留 **24 小时**，B 离线 **25 小时**。若 E9 已超过保留窗口并被清理，就不能要求它上线后从这个 broker 的 E9 位置无限重放；消费组 offset 存在也不等于被清理的事件仍在。历史补拉仍应到**权威消息数据库**按会话、权限和 `seq` 游标查询，后续再与设备已见进度对账。24/25 小时都是本题玩具参数，真实保留、大小与恢复目标要另评审。[Kafka Introduction：可配置保留](https://kafka.apache.org/intro/)

日志适合在有限保留期内重建搜索、会话摘要等派生状态，但重放可能重复触发副作用。消费者不能把“重新读 E9”自动解释为“再给 B 发一条新聊天消息”；应按 m-9/version 识别同一权威事实。生产者确认也有故障窗口：发布请求超时可能已被 broker 接纳，是否重复发布、怎样去重，要在 07.07 继续。[08.01 部分失败](../../../src/docs/platform_engineering/curriculum/08_distributed/01_system_partial_failure.md)

## 七、五个确认点：数据库与 broker 之间仍有裂缝

沿 E9 的一次路径至少写五个独立边界：

| 确认点 | 谁可据此说什么 | 仍不能据此说什么 |
|---|---|---|
| 1. S3 DB `Commit` 已知成功 | 教学数据库里的 m-9 已提交 | E9 已发布、A 一定收到 HTTP、B 已收到 |
| 2. broker 接受 E9 | 事件进入该 broker 的选定发布确认范围 | 搜索索引已处理、DB/发布原子同成同败 |
| 3. SearchIndex 消费 ACK | 该消费组按其协议报 E9 已处理 | B 设备收到、外部索引绝无重复副作用 |
| 4. G 在线通知尝试 | G 对 B 的某条通道尝试发送 | B 应用接收或阅读 |
| 5. B 应用/阅读回执 | 按具体设备/用户回执合同描述结果 | 可反推所有其他设备也收到 |

最关键的裂缝在 **1→2**：S3 数据库已提交 m-9，服务在发布 E9 前崩溃，搜索索引和在线提示都可能没收到事件。换成队列、Pub/Sub 或日志**不会让两个独立系统自动同事务**。若产品要求最终发出后续事件，需设计与 DB 本地提交同成同败的待发送事实及有界重试/对账，07.10 才详讲 outbox。当前 S2 v1 根本没有这里的 S3 DB `Commit` 确认，不能拿本表第 1 行修改其 `accepted_in_memory` 语义。

## 八、把业务需求翻译为消息系统合同

交付一张“在线提示、后台索引、离线历史”三路图、一份 E9 的 `m-9/seq9/P0-offset42` 身份表、组间/组内消费图、24/25 小时保留反例和上述五确认点。每条链路注明：谁是权威、谁可重放、谁 ACK、何时可能重复/丢失、失败后查哪个稳定 ID。能描述机制和不能承诺的结果，才具备进入 07.07 重投与去重的前置。

### 分层练习与反馈

1–8 先认抽象，9–16 手算 E9 分发与保留，17–22 处理 ACK、故障与业务取舍。先预测，再展开答案。

<details><summary>1. 数据库中的 `m-9` 与通知事件 E9 是同一份权威事实吗？</summary>

不是。m-9 是教学 S3 的权威消息行；E9 是触发后续处理的事件，保留和确认另定。</details>

<details><summary>2. 在线 Pub/Sub 的主要优点与离线边界是什么？</summary>

可向当前订阅者实时广播；Redis Pub/Sub 不给离线 B 自动保留过去发布。</details>

<details><summary>3. 两个搜索 worker 会让同一任务必然执行两次吗？</summary>

不会。一次任务可由其中一个承担；失败重投仍可能让它后来再次执行。</details>

<details><summary>4. 可回放日志会在消费者读完后立刻删除事件吗？</summary>

不必然。日志按保留政策而非“有人读过”决定何时可清理。</details>

<details><summary>5. `message_id=m-9`、`seq=9`、`offset=42` 分别属于哪层？</summary>

消息业务身份、`c-a` 内排序位置、broker 分区 P0 的事件位置，不能互算。</details>

<details><summary>6. P0 的顺序能推出 P1 所有事件的全局先后吗？</summary>

不能。分区内顺序不自动成为跨分区总序。</details>

<details><summary>7. 消费 ACK 能证明 B 用户已读吗？</summary>

不能。它通常只说明消费者按本组协议完成处理，设备/用户回执另计。</details>

<details><summary>8. 当前 S2 `accepted_in_memory` 能直接当本章 S3 数据库提交吗？</summary>

不能。S2 仍只是当前进程内存受理；S3 v2 是未来教学提议。</details>

<details><summary>9. B 发布时离线，只依赖 Redis Pub/Sub，上线后能自动收到旧 E9 吗？</summary>

不能。需要权威历史补拉或另设保留/确认机制。</details>

<details><summary>10. SearchIndex 组 W1/W2 与 Notify 组如何分 E9？</summary>

两逻辑组各自需要看到 E9；SearchIndex 组内由 W1/W2 分担，不是组内人人都收到一次。</details>

<details><summary>11. E9 在 P0 offset42，`m-9` 的会话 seq 会因此变成 42 吗？</summary>

不会。业务 seq 仍为 9，offset42 只属于该 broker 分区。</details>

<details><summary>12. 若 E10 与 E9 在稳定策略下同落 P0，消费者可依赖哪种顺序？</summary>

该分区内的追加/读取顺序；不扩展成所有分区的全局顺序。</details>

<details><summary>13. 日志保留 24 小时，B 离线 25 小时，E9 一定还能从日志重放吗？</summary>

不能。若已按保留政策清理，须从权威消息历史补拉。</details>

<details><summary>14. SearchIndex 处理完 E9 后重放一次，能盲目再创建一个新消息吗？</summary>

不能。应按稳定 m-9 和版本更新派生索引，避免重复外部效果。</details>

<details><summary>15. W1 先 ACK 再写索引，ACK 后崩溃有什么风险？</summary>

组内已标完成而外部索引未更新，可能不再重投而漏效果。</details>

<details><summary>16. W1 先写索引再 ACK，ACK 前崩溃有什么风险？</summary>

任务可能重投、索引效果重复；需幂等处理和对账。</details>

<details><summary>17. broker 发布成功能证明 G 已通知 B 吗？</summary>

不能。发布、消费者处理、G 发送、B 接收各是不同阶段。</details>

<details><summary>18. G 对 B 写 WebSocket 成功能证明 B 用户已读吗？</summary>

不能。传输尝试、设备应用接收、界面展示和阅读都需分别定义证据。</details>

<details><summary>19. DB 已提交 m-9、E9 尚未发布就崩溃，换成 Kafka 自动修复吗？</summary>

不会。DB→broker 仍是跨系统空窗，须另设计 outbox/重试与对账。</details>

<details><summary>20. 一条日志保留得越久就自动等于永久 IM 历史吗？</summary>

不等于。仍受保留/删除、权限、版本与权威消息存储合同限制。</details>

<details><summary>21. 在线通知事件能直接包含所有私有正文并广播吗？</summary>

不应无授权地广播私有内容；可传最小受控引用，再按当前权限补拉权威消息。</details>

<details><summary>22. 交付消息系统设计时最少列哪五个确认点？</summary>

数据库提交、broker 发布、消费者处理 ACK、网关通知尝试、B 设备应用/阅读回执；每点可证明的范围不同。</details>

## 本章完成标准与下一步

不看答案时，能把在线提示、后台索引和离线历史分别交给合适的分发/保留模型；能说清 E9 的 offset42 不等于 seq9、两逻辑组与组内 worker 的不同关系，以及 DB→broker 空窗、消费者 ACK 与设备回执的不同，才算完成第一轮。第二轮由学习者在隔离环境记录真实 broker 配置、故障和设备结果，本章没有代替运行。

按[学习路线](../../../src/docs/platform_engineering/curriculum/learning_path.md)，下一章[07.07 确认、重投与去重](../../../src/docs/platform_engineering/curriculum/07_cache_messaging/07_ack_retry_dedup.md)将分别推演生产确认、消费确认、重投和去重窗口；07.08 再深入同会话顺序与并发消费。
