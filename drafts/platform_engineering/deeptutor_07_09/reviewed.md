# 07.09 积压与坏消息：最老事件为何一直没处理

> DeepTutor 八节初稿经技术与教学审阅后的静态课程。120/90 次每秒、十分钟、E-bad、三次尝试、offset44/45 都是**虚构纸上参数**，没有运行 Kafka、NATS、Redis、Go、数据库、负载、故障或站点，也不声称 OpenIM 采用这些消费策略。当前 S2 `accepted_in_memory` 与未来 S3 数据库提交提议仍分别成立。

## 一、积压先算进出速率，别先猜 broker 坏了

沿 07.08 的同会话事件分区，先给虚构大群 `c-g` 一段持续负载：**每秒到达 120 条**待处理事件，消费者在既定安全资源预算下**每秒完成并确认 90 条**。假设从零积压开始、没有丢弃、重试、扩容或其他负载，持续 **10 分钟=600 秒**，未完成量为 `(120−90)×600=18000` 条。它只是一张确定输入下的**数量账**，不能由此算出每个用户的发送 P95 或 B 设备已读率。[Kafka Consumer 位置概念](https://kafka.apache.org/41/javadoc/org/apache/kafka/clients/consumer/KafkaConsumer.html)

若在第十分钟**停止新事件到达**，消费者仍理想地保持 90 条/秒，清完这批 `18000/90=200 秒`，即约 **3 分 20 秒**；若到达继续为 120/s、处理保持 90/s，积压继续每秒净增 **30**，根本不会自行追平。这两个条件不能混成“当前还要 200 秒就会恢复”。重试若也算新处理尝试，实际工作可能更多，纸上公式要重新写分母。[07.04 缓存过载算量方法](../../../src/docs/platform_engineering/curriculum/07_cache_messaging/04_cache_overload_hotspots.md)

| 第一遍 | 第二遍 | 交付物 |
|---|---|---|
| 到达率、完成率、积压数量、最老年龄 | 错误分类、重试预算、坏消息隔离、重放与顺序 | 18000/200 秒算式、E-bad 时间线、一份值班处置表 |

## 二、“还有几条”与“最老等多久”不是同一个指标

**积压数量**可按特定分区/消费者组的未完成事件量理解；**最老未完成年龄**需要选一个明确起点，例如该事件被 broker 接纳的时刻，到当前观测时刻经过多久。两者分母不同：同样 18000 条可能来自短时爆发，也可能是一个旧坏事件卡在前面、后面持续正常到达。若时间戳来自不同机器，08.02 已提醒墙钟偏差；应明确时间来源与采样窗口，不能拿单个 offset 差值直接冒充“最老年龄”。

产品统计口径也不同。Kafka 的 topic-partition end/已提交消费位置可帮助看**位置差**，但若像 07.08 那样错误提交越过未完成 E9，位置差甚至可能看似归零而外部效果仍缺失。Redis Stream `XPENDING` 查看的是某消费组**已投递、尚未 ACK 的 PEL 条目**，不包含同一 Stream 里尚未投递给这个组的全部新事件；NATS JetStream consumer 也有自己的 pending、AckWait、重投与投递上限。不能把三个产品的一个“lag”数直接换算成“用户漏了多少条消息”。[Redis XPENDING](https://redis.io/docs/latest/commands/xpending/) · [NATS Consumers](https://github.com/nats-io/nats.docs/blob/master/nats-concepts/jetstream/consumers.md)

最少同窗记录：每分区到达/完成速率、已交付未确认、未交付、最老未完成年龄、重试次数/错误类别、限流/隔离量、业务可见搜索/通知延迟和用户错误率。**索引任务落后**不等于数据库权威消息丢失，也不等于 B 设备未读；它们有各自确认点。

## 三、先分类失败：暂时、永久、结果未知

固定同一会话 `c-a` 的 P0：E-bad 在 **offset44**，后一条 E11 在 **offset45**。假设 SearchIndex worker 对 E-bad 失败。处理前要区分三种原因：

| 失败类别 | 教学例子 | 下一动作为什么不同 |
|---|---|---|
| 暂时依赖故障 | 搜索索引服务超时/暂不可用 | 可在总体期限与次数内退避重试，避免无限快重投 |
| 永久输入/规则错误 | E-bad 的必需字段坏、版本无法解析 | 原样重试不会修复；隔离、诊断并受控修正 |
| 外部结果未知 | 索引写入可能已成功但 ACK/回应丢了 | 先按稳定消息 ID+版本查目标/幂等写，再决定是否重做 |

“消费者函数返回 error”不足以决定全部重试：同一 error 可能发生在副作用前、后，09.02 的 HTTP 提交未知和 07.07 的消费 ACK 未知都证明观察者并不知道远端状态。错误应带阶段、稳定事件身份、依赖类别和可核对结果；不能把未知当确定失败盲目重复推送。[07.07 确认、重投与去重](../../../src/docs/platform_engineering/curriculum/07_cache_messaging/07_ack_retry_dedup.md)

## 四、三次总尝试后隔离，不等于业务完成

为手算，给 E-bad **最多三次总处理尝试，包含第一次**。若三次都因同一个永久无效字段失败，应用把它转到受控的**隔离记录/死信队列（DLQ）**，保存 `event_id`、源分区/offset、业务消息 ID/版本、错误类别、已尝试次数、隔离时刻和处置责任；**不随意复制私有正文或凭据**。隔离记录只意味着“这条处理链仍需修复”，不表示搜索索引已更新或 B 已收到。[NATS Consumer 投递上限](https://github.com/nats-io/nats.docs/blob/master/nats-concepts/jetstream/consumers.md)

NATS JetStream 的 `MaxDeliver` 可限制该消费者的重投尝试，官方说明达到上限的消息仍可能保留在 Stream，并产生相应通知；**应用级 DLQ/工单/重放不是配置 MaxDeliver 后自动完成的业务效果**。Redis PEL 的待确认/认领、Kafka 消费组 offset 又是不同协议。任何情况下都不能仅为“让 pending 归零”就把无法解释的 E-bad 直接 ACK 成功、丢掉源位置和修复责任。[NATS Streams 保留说明](https://github.com/nats-io/nats.docs/blob/master/nats-concepts/jetstream/streams.md)

隔离后的重放应有入口审查：修好解析/映射规则，核对权威数据库里 `m-9` 类消息的**当前版本与权限**，选择原事件重放或从权威状态重新生成派生任务；记录执行者、范围、结果和再次失败。若日志超过保留期，不能假设 broker 还保存 E-bad，须有权威源/备份的重建路径。

## 五、E-bad 卡在 offset44，后面的 E11 能否直接走？

若 SearchIndex 对 `c-a` 承诺**同会话结果按 seq 有序且每项必要效果都完成**，E-bad(offset44) 未决时，不能为了降 lag 就无记录地提交 **next offset46**，让恢复者从 46 开始并跳过 44。E11(offset45) 可以在纸上提前计算，但不能无条件让它的外部结果覆盖/假装前项已安全处理。其他会话 `c-b` 若在另一分区，仍可独立前进，避免一个坏事件拖停所有键。[KafkaConsumer 提交位置](https://kafka.apache.org/41/javadoc/org/apache/kafka/clients/consumer/KafkaConsumer.html)

如果业务决定**搜索索引是可重建派生状态**，允许把 E-bad 显式隔离后先处理 E11，也要先写一份**缺口政策**：谁持有源事件/权威版本、哪个范围暂不完整、向用户暴露什么、何时修复、修完怎样对账。才能在清楚承认不完整的条件下推进位置；这与“偷偷 ACK 坏消息当成功”不同。对权威消息历史或权限链路，不能直接照搬搜索派生视图的允许跳过政策。

坏消息还会造成**队头阻塞**：严格同键等待可保护顺序，却让 E11 和后来事件的年龄上升。增加 group worker 不会让同一需要严格串行的 `c-a` 自动安全地并行；解决要在“顺序合同、坏消息隔离、修复速度、其他键并行”之间明确取舍。[07.08 顺序与并发消费](../../../src/docs/platform_engineering/curriculum/07_cache_messaging/08_order_concurrent_consumption.md)

## 六、重试本身也是负载，要有总预算

`c-g` 的纸上到达 120/s、处理 90/s 已经不稳定；若失败项立即重试，重试请求也占消费者/索引资源，**有效服务率**可能进一步下降。应按错误类别设置总期限、最大尝试次数、退避/抖动、在途上限和隔离门槛。这里不指定生产推荐秒数；“三次”只服务 E-bad 小题。暂时故障恢复后可受控补处理，永久坏输入不应在短循环里烧尽资源，结果未知先查目标而非无条件重复外部副作用。[NATS Consumers Backoff/MaxDeliver](https://github.com/nats-io/nats.docs/blob/master/nats-concepts/jetstream/consumers.md)

批量和更多并发可能提高不同键的总吞吐，却不能无条件修好 `c-g` 的热分区：07.08 已说明每会话顺序/版本安全需要代价。应在**同样输入分布**下看分区到达/完成、最老年龄、P95/P99、失败/重试率、坏消息隔离量、数据库/索引压力和可见结果；只看“消费 TPS 上升”可能掩盖越来越老的一条阻塞事件。[11.01 业务测量](../../../src/docs/platform_engineering/curriculum/11_reliability/01_business_measurement.md)

## 七、隔离和重放要形成可追踪闭环

DLQ/隔离队列不是“失败垃圾桶”。一条合格的隔离条目至少包括：源事件身份 E-bad、原分区/offset、会话与**脱敏**消息 ID、业务版本、解析/依赖失败类型、首次/最近失败时刻与尝试次数、是否已人工审阅、下一处置和截止时间。原始私有正文可能属于受保护数据，不能仅因排障方便无限复制到死信日志。[11.03 日志/指标/Trace](../../../src/docs/platform_engineering/curriculum/11_reliability/03_logs_metrics_traces.md)

受控重放需先检查权威消息的当前版本：若源 m-9 已被编辑为 v2，直接把旧 v1 E-bad 写进索引可能使搜索回退。重放操作应沿稳定 ID/版本和目标条件更新收敛，保留“隔离→修复→重放→对账→关闭工单”的证据链。若多次重放仍失败，必须返回待办状态，不能静默吞掉。对 B 的在线通知可以允许某些派生提示丢失，但离线历史仍须从权威数据库按权限补拉，不能因为 DLQ 有事件就宣称用户已收到。

## 八、值班交接：先画出工作量，再写处理决策

交付 120/90×600 的 **18000** 积压和停流后 **200 秒**理想清空表，另测**最老未完成年龄**；E-bad 三次总尝试/隔离、E11 是否等待或显式跳过的业务决策；各系统 lag/pending 口径和修复重放矩阵。每个决策要保留“已知/未知/下一证据”，而不只是一个 `retry=true`。

### 分层练习与反馈

1–8 认速率/指标，9–16 手算积压与坏消息，17–22 评审顺序/修复。先预测，再展开答案。

<details><summary>1. 到达 120/s、完成 90/s，净积压速率是多少？</summary>

`120−90=30` 条/秒，前提是无丢弃、重试等额外工作。</details>

<details><summary>2. 10 分钟是多少秒？本题积压多少？</summary>

600 秒；从零开始有 `30×600=18000` 条未完成。</details>

<details><summary>3. 第十分钟停止新到达，理想 90/s 清空需多久？</summary>

`18000/90=200` 秒，约三分二十秒，忽略其他负载和故障。</details>

<details><summary>4. 到达继续 120/s、处理仍 90/s，可以只等 200 秒追平吗？</summary>

不能。净增长 30/s，不会自然追平。</details>

<details><summary>5. “积压 18000”就等于最老事件等待 18000 秒吗？</summary>

不等于。数量与年龄不同，要定义起点并单独观察年龄。</details>

<details><summary>6. Kafka offset lag 为零，就一定说明外部搜索索引无缺口吗？</summary>

不能。错误地越过未完成事件提交位点，也可出现位置追平而副作用缺失。</details>

<details><summary>7. Redis `XPENDING` 会直接给出所有从未投递的新事件吗？</summary>

不会。它看的是特定消费组已投递未 ACK 的 PEL 条目。</details>

<details><summary>8. SearchIndex 落后可以直接推断 B 设备未读吗？</summary>

不能。搜索派生视图与设备阅读确认是不同链路。</details>

<details><summary>9. E-bad 在哪个玩具 offset？E11 在哪？</summary>

同一 `c-a` 分区中 E-bad=44、E11=45。</details>

<details><summary>10. “三次总尝试”包含首次吗？</summary>

包含：首次加最多两次重试，之后仍失败则进入本题隔离政策。</details>

<details><summary>11. 永久缺必需字段，重复同一 E-bad 三次会自动修好吗？</summary>

不会。应隔离并修规则/数据后受控重放。</details>

<details><summary>12. 外部索引写入可能成功但 ACK 丢了，应直接再次执行非幂等副作用吗？</summary>

不应。先按稳定 ID/版本查目标或采用幂等条件更新，避免重复效果。</details>

<details><summary>13. NATS JetStream `MaxDeliver` 到上限会自动生成完整业务 DLQ 工单吗？</summary>

不会。它限制该消费者重投并有相应状态/通知；应用隔离、权限和修复流程要自己设计。</details>

<details><summary>14. E-bad 未决就提交 Kafka next offset46 有何风险？</summary>

恢复从 46 开始，offset44 的 E-bad 被无记录地跳过，必要索引效果可能永久缺失。</details>

<details><summary>15. 严格同会话顺序下，E11 可绕过 E-bad 无条件对外完成吗？</summary>

不能。需等待 E-bad 可解释结果，或按显式缺口/派生修复合同允许跳过。</details>

<details><summary>16. `c-b` 在另一分区，必须因为 `c-a` 的 E-bad 一起停止吗？</summary>

不必。若无跨会话依赖，可独立继续处理 F1 等事件。</details>

<details><summary>17. 把坏消息快速无限重投会怎样影响积压？</summary>

重试消耗处理能力，可能降低有效完成率并扩大队列与下游故障。</details>

<details><summary>18. DLQ 条目可以无上限保存私有正文以方便排障吗？</summary>

不应。应保存最小脱敏身份/错误/版本，按访问、保留和修复责任管理。</details>

<details><summary>19. v1 E-bad 隔离后源已是 v2，修好后能无条件重放 v1 覆盖搜索吗？</summary>

不能。先核对权威当前版本，用条件更新/对账避免旧值覆盖新值。</details>

<details><summary>20. Broker 保留期过了，隔离的原事件还能理所当然重读吗？</summary>

不能。需要权威数据库、备份或专门保留的隔离材料来重建。</details>

<details><summary>21. 消费 TPS 上升就能说用户体验恢复吗？</summary>

不能。还要看最老年龄、尾延迟、错误、隔离量和用户可见结果。</details>

<details><summary>22. 一条 E-bad 工单何时能关闭？</summary>

隔离原因已修、按权威版本重放成功并对账确认目标状态，且留下责任/时间/结果证据。</details>

## 本章完成标准与下一步

不看答案时能手算 18000 与 200 秒，说明持续到达为何不会追平；能把 E-bad 的暂时、永久、未知错误分开处置，解释 offset44 未决时 E11/45 的顺序门及显式隔离条件，并写出 DLQ 修复/重放/对账闭环，才算完成第一轮。第二轮由学习者在隔离环境保存真实 broker 配置、速率、年龄、错误和副作用结果，本文没有代替运行。

按[学习路线](../../../src/docs/platform_engineering/curriculum/learning_path.md)，下一章 07.10 将从数据库已提交但 E9 尚未发布的裂缝进入本地 outbox，再把消费幂等与外部副作用接起来。
