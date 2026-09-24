# 07.08 顺序与并发消费：日志有序为何结果倒退

> DeepTutor 八节初稿经技术与教学审阅后的静态课程。分区 P0/P1、offset 42/43/7、处理耗时、worker 归属与再平衡均为**虚构纸上模型**；没有运行 Kafka、NATS、Go、数据库、基准或站点，不声称 OpenIM 用此分区策略。当前 S2 `accepted_in_memory` 与未来 S3 数据库提交提议仍分开。

## 一、三种顺序别写成同一句“按序”

07.06 用 E9 表示未来教学 S3 中已提交的 `m-9/c-a seq9` 处理事件。现在再加 `m-10/c-a seq10` 的 E10，以及另一会话 `c-b` 的 `m-b1/seq1` 事件 F1。固定一个**稳定按 `conversation_id` 路由**的教学日志：E9 在分区 **P0 offset42**，E10 在 **P0 offset43**，F1 在 **P1 offset7**。这三个编号回答不同问题：`seq` 是会话内**业务历史顺序**，offset 是 broker **某一分区的位置**，消费者何时完成搜索或通知又是**副作用完成顺序**。前两者即使排对，第三者也可能倒过来。[Kafka Introduction](https://kafka.apache.org/intro/)

| 事件 | 消息事实 | broker 位置 | 本题需要保持的顺序 |
|---|---|---|---|
| E9 | `m-9,c-a,seq9` | P0:42 | 同会话早于 E10 |
| E10 | `m-10,c-a,seq10` | P0:43 | 同会话晚于 E9 |
| F1 | `m-b1,c-b,seq1` | P1:7 | 与 `c-a` 之间无本题全局先后 |

这里首先假定**生产者已按权威业务顺序把 E9/E10 写入同一分区**。Kafka 的分区内读取顺序只保持**它实际收到的追加顺序**；数据库 `seq9<seq10` 不会魔法般强迫两个独立发布线程按同序写 broker。DB→broker 的发布/重试顺序、分区键和分区数变化都须另审；07.10 的 outbox 才进一步处理源事件的可靠抽取。[Kafka Introduction](https://kafka.apache.org/intro/)

## 二、按会话键分区：c-a 可顺读，c-b 可另行并行

在固定的**同键映射不变**前提下，`conversation_id=c-a` 的 E9/E10 落 P0，消费者能按 offset42→43 读取；`c-b` 的 F1 落 P1，可由另一 worker 并行处理。这个选择以单会话顺序换取跨会话并行度，且顺序保证只在**分区内**。P0 的 offset43 与 P1 的 offset7 数字不能直接比较“哪条消息全局先发生”；08.02 的因果、06.12 的业务序号也各有边界。[Kafka Introduction：分区与顺序](https://kafka.apache.org/intro/)

假设 `SearchIndex` 消费组中 W1 取得 P0，W2 取得 P1。W1/W2 是**消费分工**：W2 不因工作者更多就也拿一份 P0:E9。若 `c-g` 大群所有事件按同一键落一分区，其单键顺序瓶颈不会因简单增加十个组内 worker 而消失。若决定把一个会话拆到多个分区，就必须重新定义/实现跨分区合并顺序与游标，不能同时无代价保留原合同。Kafka 官方也把同组并行度与分区数联系起来。[Kafka Consumer API](https://kafka.apache.org/41/javadoc/org/apache/kafka/clients/consumer/KafkaConsumer.html)

## 三、W1 顺序取到两条，却让后项先完成

W1 从 P0 顺序读 E9、E10，随后把它们交给两个 Go 工作任务。固定纸上耗时：T9 处理 E9 需 **100 ms**，T10 处理 E10 需 **10 ms**，且同时开始。于是 T10 先结束；“从 broker 顺序读”并不自动使“应用副作用顺序完成”。[Kafka Consumer 多线程处理说明](https://kafka.apache.org/41/javadoc/org/apache/kafka/clients/consumer/KafkaConsumer.html)

| 相对时刻 | T9（E9） | T10（E10） | 若无条件写同一 `latest_seq` |
|---|---|---|---|
| t=0 | 开始，尚未完成 | 开始，尚未完成 | 原值 8 |
| t=10 ms | 仍在处理 | 完成并写 10 | `latest_seq=10` |
| t=100 ms | 完成并写 9 | 已结束 | **退回 `latest_seq=9`** |

若这个字段是“可重建的最新会话预览”，可用目标端**原子的版本条件更新**拒绝 9 覆盖 10，或按 `conversation_id` 串行处理；但 `max(seq)` 只保护这**一个字段不倒退**，**不意味着 E9 的搜索词、权限或通知副作用可以被跳过**。若业务需要 E9 的完整效果，仍要保证它被处理或进入显式修复/对账。若两个事件涉及“先创建消息、后撤回它”，更不能仅凭最后序号选择就忽略前一事件的版本/状态语义。

## 四、重试会让旧项再次出现在新项之后

另一条路径不是应用并发，而是 E9 首次处理失败/未 ACK，E10 后来成功；过一段时间 E9 被重投。broker 原日志仍是 offset42→43，**交给消费者的重试/完成时间线**却可能是 E10 效果先、E9 旧效果后。对会话历史预览，旧 E9 不得把 E10 的最新值 10 改回 9；对设备通知，若要求用户先见 9 再见 10，应让同键 E10 等 E9 的可解释结果，或明确允许跳过/合并的产品政策。其他会话 `c-b/F1` 不依赖 E9，仍可在另一个分区继续处理。

NATS JetStream 的消费 ACK 等待/重投、Redis Stream 的待确认认领与 Kafka offset 重读具有不同协议，但都不替应用定义“迟到的旧业务事件该怎样更新外部状态”。07.07 的 `(message_id,version,side_effect)` 幂等键阻止同事件重复效果，却不自动决定**两个不同事件** E9/E10 之间的业务顺序；还要有顺序/版本政策。[NATS Consumers](https://github.com/nats-io/nats.docs/blob/master/nats-concepts/jetstream/consumers.md)

## 五、Kafka 位点：E9 没完成就提交 44，会留下一个洞

固定教学 P0 中 E9=offset42、E10=offset43。Kafka 客户端文档说明提交的 offset 表示**下一条要读取的位置**；若 W1 在 E10 完成后就提交 **44**，而 E9 的外部索引效果仍 pending，进程随后崩溃并从提交位置恢复，会从 44 继续，**E9 可能被跳过**。[KafkaConsumer 位置与提交说明](https://kafka.apache.org/41/javadoc/org/apache/kafka/clients/consumer/KafkaConsumer.html)

```text
P0: 42 E9 [仍 pending] → 43 E10 [已完成] → next offset 44
错误提交：commit(44) 使恢复者以为 42、43 均不必再处理
安全候选：仅推进到“连续已完成前缀”的下一位置；42 未完则不能越过它
```

这不要求所有副作用永远单线程，但需要追踪每分区**在途任务与连续完成边界**，再决定可提交位置。若 42 完成后再推进，E10 已先完成的结果仍可被复核；若先并发处理、再无协调地提交最高已完成 offset，就会漏。Kafka 官方还提醒：把获取与处理分到不同线程后，手动提交位置需要额外协调。**NATS 每条消息 ACK** 可单独确认 E10、让 E9 待重投，却不因此保证外部 `latest_seq` 不倒退，仍需业务版本/顺序规则。[KafkaConsumer 多线程处理](https://kafka.apache.org/41/javadoc/org/apache/kafka/clients/consumer/KafkaConsumer.html)

## 六、批量两条：E9 已生效、E10 失败怎样恢复

设一次批量读取 `[E9,E10]`。W1 成功将 E9 写入搜索索引，处理 E10 时失败。若**在两项完成前就确认整批/提交 next offset44**，E10 可能永久漏处理；若**整批都完成后才提交**，崩溃重读会再次遇到 E9，所以 E9 的索引写入须可按稳定 ID/版本重复执行。固定小批量与处理期限，记录哪项已完成、哪项待修复、哪些副作用可重复，再选按项 ACK、按分区连续前缀提交或整个批次重试策略。

批量可减少往返/摊薄处理开销，但也扩大单批在途、部分成功与重试成本；没有同负载实测不能宣布“批量后 P95 一定下降”。如果 E9 的索引更新成功而 E10 的通知失败，它们还是两个逻辑消费组/副作用，不能用一个 ACK 代表两边都成功。07.07 的确认矩阵在批量场景仍逐层有效。

## 七、再平衡与旧 worker：已交权不代表旧任务立即停止

再设 W1 原来负责 P0，处理 E9 时暂停；消费组判断其失联，把 P0 交给 W2。W2 从安全位置重读并把外部预览处理到 E10/版本 10；W1 稍后恢复，手里旧 E9 的写入才到达目标。如果目标无条件接受，仍可能从 10 **回退到 9**。让目标按**业务版本/提交位置条件**拒绝旧写，或用后续 08.07 的 owner 代次/fencing 设计隔离迟到 worker；仅靠“broker 已把分区交给 W2”不足以撤销 W1 在途的外部动作。

应记录每次分配/撤销、worker 代次、在途 E9/E10、目标当前版本和 ACK/offset 结果；旧 worker 退出时停止取新工作并有界处理/取消在途，但取消也不能收回已发生的外部写。若事件真的需要同会话严格效果顺序，消费阶段要有**每会话有界串行**与明确的失败阻塞/跳过政策；热会话 `c-g` 可能因此成为慢分区，不能简单通过跨键并行掩盖。[KafkaConsumer 消费组与分区](https://kafka.apache.org/41/javadoc/org/apache/kafka/clients/consumer/KafkaConsumer.html) · [08.01 部分失败](../../../src/docs/platform_engineering/curriculum/08_distributed/01_system_partial_failure.md)

## 八、交付一份可反驳的顺序合同

交付 P0/P1 事件位置图、T9/T10 完成时间表、E9 失败后 E10 先完成的重投图、`commit(44)` 跳洞反例、批量部分成功与再平衡旧 worker 反例。每张图写清**权威消息 seq、broker 位置、外部状态版本、何时 ACK/提交位置、谁仍在处理**。按会话保持什么顺序、哪些跨会话可并行、失败项让后项等多久，都要成为可检查的业务/资源决定。

### 分层练习与反馈

1–8 先认顺序域，9–16 手算完成与位点，17–22 评审重试/批量/再平衡。先预测，再展开答案。

<details><summary>1. E9 的 `seq9` 与 P0 `offset42` 可以互推吗？</summary>

不能。前者是 `c-a` 业务历史序号，后者是 broker P0 的位置。</details>

<details><summary>2. P0:42、43 排序能比较 P1:7 的全局先后吗？</summary>

不能。没有本题定义的跨分区总序。</details>

<details><summary>3. 为什么同 `conversation_id` 作为键可能帮助会话内顺序？</summary>

在稳定映射和正确发布顺序前提下，同会话事件落同分区，可按分区追加顺序读取。</details>

<details><summary>4. DB 中 seq9<seq10，broker 一定收到 E9 再 E10 吗？</summary>

不一定。生产者发布/重试顺序仍须设计；本题把正确追加顺序列为前提。</details>

<details><summary>5. W1 持 P0、W2 持 P1，W2 也会同时拿 P0:E9 吗？</summary>

在本题正常组内分配下不会；再平衡或重放会改变后来归属。</details>

<details><summary>6. 顺序读 E9/E10 就保证应用完成也先 E9 后 E10 吗？</summary>

不保证。W1 可把它们交给并发任务，完成时长不同。</details>

<details><summary>7. F1 来自 c-b，可否在 E9 仍待处理时并行？</summary>

可以作为候选，因为本题两会话没有同键顺序依赖且位于不同分区。</details>

<details><summary>8. 加十个 worker 就能让 c-g 同一有序分区并行十倍吗？</summary>

不能。单键/单分区的顺序边界仍在；拆分需重新定义顺序。</details>

<details><summary>9. T9=100 ms、T10=10 ms 同时开始，谁先完成？</summary>

T10 先完成，虽然 E10 在 P0 日志中晚于 E9。</details>

<details><summary>10. 无条件写 `latest_seq`，T10 后 T9 写完的最后值是多少？</summary>

先到 10，后被 E9 写回 9，是错误倒退。</details>

<details><summary>11. `max(latest_seq,event.seq)` 可阻止哪项错误？又不能证明什么？</summary>

可阻止该字段从 10 回到 9；不能证明 E9 的其他索引/权限/通知效果已处理。</details>

<details><summary>12. E9 首次失败，E10 成功后 E9 重投，broker 原始分区顺序改变了吗？</summary>

没有，原日志仍 42→43；外部处理/重试完成顺序变了。</details>

<details><summary>13. Kafka toy offset42/43 后 `commit(44)` 表示什么？</summary>

恢复时下一条从 44 读，暗含 42、43 在该消费者策略里已处理。</details>

<details><summary>14. E9 仍 pending、E10 已完成就提交 44，风险是什么？</summary>

崩溃后从 44 继续，E9 可能再也不被该组处理。</details>

<details><summary>15. E9 未完成时，可提交的连续完成前缀能越过 42 吗？</summary>

不能。即使 43 已先完成，也不能用最高完成值越过未完成的 42。</details>

<details><summary>16. NATS 给 E10 单独 ACK 后，预览就绝不会倒退吗？</summary>

不能推断。E9 后到仍可能更新外部预览，须目标版本或顺序政策。</details>

<details><summary>17. 批次 E9 已写索引、E10 失败，先 ACK 全批有什么风险？</summary>

E10 可能漏处理；确认范围超出了实际完成范围。</details>

<details><summary>18. 改成整批完成后才 ACK，重试时 E9 会怎样？</summary>

E9 可能重放，索引须按稳定身份/版本幂等处理。</details>

<details><summary>19. W1 被撤销 P0 后，旧在途 E9 是否必然无法写外部系统？</summary>

不必然。W1 可迟到完成，目标要有版本/owner 代次等防回退。</details>

<details><summary>20. W2 已把预览到 10，W1 后到 E9 应被怎样处理？</summary>

不能无条件覆盖为 9；可拒绝低版本或按明确重放/修复协议处理其他必要效果。</details>

<details><summary>21. 顺序更严格会对热会话带来什么代价？</summary>

同键任务需等待前项或按序提交，热分区可能积压；要测量吞吐/尾延迟并定义失败政策。</details>

<details><summary>22. 为此案例交接最少保留哪五类位置/状态？</summary>

业务 seq、broker 分区 offset、worker/代次、外部目标版本、ACK/已提交 offset 与在途状态，便于查跳洞和迟到写。</details>

## 本章完成标准与下一步

不看答案时，能手算 P0:E9/E10、P1:F1 的顺序域，解释 100/10 ms 并发为何让结果从 10 回到 9；能指出 `commit(44)` 跳过 pending E9、批量重试重复 E9 和再平衡旧 W1 迟到写的风险，才算完成第一轮。第二轮由学习者在隔离环境用受控门闩、分区/位点和目标版本记录核对，本文没有替代运行。

按[学习路线](../../../src/docs/platform_engineering/curriculum/learning_path.md)，下一章 07.09 将从热分区、最老事件年龄和失败类型进入积压与坏消息处理；07.10 再处理数据库与消息中间件的提交边界。
