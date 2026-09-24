---
title: 07.07 确认、重投与去重：一次处理为何可能做两遍
icon: /assets/icons/article.svg
order: 8
date: 2026-09-24
---

[返回第七卷](./README.md) · [消息抽象前置：07.06](./06_message_abstractions.md) · [部分失败前置：08.01](../08_distributed/01_system_partial_failure.md) · [接口合同前置：09.02](../09_backend_security/02_http_api_contract.md)

# 07.07 确认、重投与去重：一次处理为何可能做两遍

> DeepTutor 八节初稿经技术与教学审阅后的静态课程。E9、五分钟 broker 去重窗、十分钟消费者去重窗、四/六/十一分钟重试均为**虚构纸上参数**，不代表 NATS、Redis、Kafka 或 OpenIM 的默认配置；没有运行 broker、Redis、数据库、Go、故障注入或站点。当前 S2 同消息 ID 重复提交继续返回 **409**；未来 S3 v2 数据库提交仍为教学提议。

## 一、先把“确认”标到具体一跳

承接 07.06：在**未来 S3 教学情景**中，`m-9/c-a seq9` 已知提交到权威数据库，处理事件 E9 携带稳定 `event_id=evt:m-9:v1`，供 `SearchIndex` 和 `Notify` 两条后续逻辑链分别处理。`message_id=m-9` 标业务消息，`event_id` 标这次 **v1 变化**，二者不能混用：将来合法编辑 v2 仍属于同一消息，却应产生可识别的新变化事件。

一次链路至少有五个不同确认：A 收到哪个 HTTP 回答、S 数据库事务是否提交、broker 是否按配置接纳 E9、消费者是否 ACK、B 设备是否接收/显示/已读。某一层确认成功不会自动使后续层成功；回包丢失又会让调用方对已发生的成功保持**未知**。07.06 已列五点，本章进一步看“未知时重试”会怎样。[07.06 消息抽象](./06_message_abstractions.md)

| 第一遍 | 第二遍 | 交付物 |
|---|---|---|
| 生产确认丢失、消费 ACK 前后崩溃 | 去重作用域/版本、窗口过期、跨系统空窗 | 两条生产重试分支、两条消费崩溃线、一张确认/证据表 |

## 二、生产者回包丢失：broker 可能已有 E9

设生产者发布 `evt:m-9:v1`，broker 已按其所选发布确认范围存下 E9，但**答复在返程丢失**。生产者只看到超时，不能断言 E9 没进入流。这和 08.01 的“数据库已提交、HTTP 答复丢”结构相似，但权威对象不同。若生产者每次重试都生成新 `event_id`，broker 可能把同一变化写成多条事件；因此要固定事件身份并核对发布结果。[NATS JetStream Stream 文档](https://github.com/nats-io/nats.docs/blob/master/nats-concepts/jetstream/streams.md)

为手算，假设所选 broker 配置了**五分钟去重窗口**，按 `event_id` 识别重复。下面是**从同一次首次发布出发的两条独立分支**，不是先在四分钟重试、又在六分钟继续同一分支；这样不依赖重复命中是否刷新窗口的具体实现：

| 独立分支 | 重试时间 | 在玩具窗口内？ | 可以下的结论 |
|---|---|---|---|
| A | 首次发布后 4 分钟，仍用 `evt:m-9:v1` | 是 | 在此配置下可被 broker 识别为重复，不另追加 E9 |
| B | 首次发布后 6 分钟，仍用 `evt:m-9:v1` | 否 | broker 的**短窗记录可能已失效**，有再次追加 E9 的风险 |

NATS JetStream 官方将 `Nats-Msg-Id` 与可配置滑动去重窗列为一种发布侧机制，而且按 ID 判断，不靠消息正文自动识别同一业务意图；本题五分钟不是其默认值。生产者短窗去重只是减少重复**事件**，不能代替数据库业务消息主键、消费者幂等和长时间历史对账。[NATS 消息去重文档](https://github.com/nats-io/nats.docs/blob/master/using-nats/jetstream/model_deep_dive.md)

## 三、消费者 ACK 前后都有崩溃窗口

`SearchIndex` 的 W1 取得 E9 后，需要让外部搜索索引反映 `m-9:v1`。固定两条时序：

| 时序 | 崩溃点 | 谁的状态先改变 | 风险 |
|---|---|---|---|
| **ACK→写索引** | 假设 broker 已记录 ACK，W1 尚未写索引就崩溃 | broker 认为该次处理已完成 | 索引效果可能永久遗漏，除非另有对账/重建 |
| **写索引→ACK** | 搜索索引已更新，broker 尚未记录 ACK，W1 崩溃 | 外部效果先发生 | ACK 等待到期后可能重投 W1/W2，重复处理 |

因此一般不能靠调整两行代码顺序同时获得“绝不漏”和“绝不重”。在需要可恢复的消费者路径里，通常选择**先完成可幂等副作用，再按 broker 协议 ACK**，接受可能重投，并使外部索引的最终状态可重复写入。若 ACK 请求本身在网络中丢失，W1 也可能不知道 broker 是否已记录，仍需允许后来重投。[NATS JetStream Consumer 文档](https://github.com/nats-io/nats.docs/blob/master/nats-concepts/jetstream/consumers.md)

NATS JetStream 的 `AckWait` 是其消费者在未收到确认时尝试重投的配置机制；Redis Stream 的 `XACK` 则移除某**消费组 Pending Entries List（PEL）**中的引用，**不等于自动删除 Stream 条目**。两者都不向 B 设备作“已收到”保证，Kafka 的 offset 提交也不会与外部搜索索引的写入自动同事务。[Redis XACK](https://redis.io/docs/latest/commands/xack/) · [NATS Consumers](https://github.com/nats-io/nats.docs/blob/master/nats-concepts/jetstream/consumers.md) · [Kafka Introduction](https://kafka.apache.org/intro/)

## 四、去重键要带版本和副作用作用域

若 `SearchIndex` 只按 `message_id=m-9` 记录“已处理”，同一消息后来发生**合法编辑 v2**，新事件 `evt:m-9:v2` 会被错当成重复而丢掉。教学幂等键至少要能区分 **`(message_id,version,side_effect)`**，如 `(m-9,v1,SearchIndex)` 与 `(m-9,v2,SearchIndex)`；`Notify` 是另一个副作用作用域，不能用 SearchIndex 的已处理标记替它宣布通知已完成。

对搜索索引，按稳定文档 ID 条件更新到**不低于**相应业务版本，可以让 E9 重投仍收敛到同一可查询内容；旧 v1 不应覆盖已处理的 v2。需要留意“版本比较”和“索引写入”应由外部索引/状态存储的**原子条件**保证，不能先查版本、再用无条件写入让两个 worker 交错。对设备提示，重复发送可能造成两个可见通知，不能简单套“搜索 upsert 幂等”来宣称用户只看见一次。[06.12 消息身份](../06_databases/12_database_business_case.md)

| 事件 | 去重键 | 正确判断 |
|---|---|---|
| E9 首次处理 | `(m-9,v1,SearchIndex)` | 处理到索引 v1 |
| E9 重投 | 同上 | 不把外部效果叠加两次 |
| 合法编辑 E10 | `(m-9,v2,SearchIndex)` | **应处理**，更新到 v2 |
| E9 给 Notify | `(m-9,v1,Notify)` | 不能因搜索已处理就跳过通知 |

## 五、短去重窗口过期，不能再用“之前处理过”当保证

再设**消费者**去重记录只保留 **10 分钟玩具时长**，W1 在 t=0 已将 E9 的搜索效果写好并记录 `(m-9,v1,SearchIndex)`。假设 broker/恢复流程按**另行配置的**等待/重放策略在 t=11 分钟把 E9 再交给 W2；这不是 NATS/Redis 的默认重投间隔。此时若去重记录已过期，W2 查不到“之前处理过”，就可能再次做外部效果。生产端五分钟窗口与消费者十分钟窗口也不是同一状态或同一计时器。

要让长期重放安全，必须让**目标效果自身**可以按稳定版本收敛，或让去重记录的耐久/保留覆盖可重放的最大范围并评估成本、回收和故障。仅把 Redis 去重键 TTL 调长一点，仍需考虑事件日志保留期、人工重放、跨区域恢复、版本变更和权限变化；若事件可在保留期后由权威数据库重建，去重依据也需可重建。无法给出窗口上界，就不能从“设置了 TTL”推出永不重复。

## 六、broker 各有自己的确认词，不能跨产品替换

| 机制 | 本章可依赖的官方范围 | 不能外推 |
|---|---|---|
| Redis Stream `XACK` | 指定消费组 E9 的 PEL 引用被确认移除 | 整条 Stream 已删除；B 已收到 |
| NATS JetStream `Nats-Msg-Id` | 配置去重窗内识别同发布 ID | 无限期同业务去重、内容相同自动识别 |
| NATS JetStream Consumer ACK/AckWait | 未按策略 ACK 可在等待期后重投 | 外部搜索索引恰好一次生效 |
| Kafka 分区 offset/组进度 | 消费者可保存已读位置，在保留期内重读 | offset 提交与外部索引更新自动同成同败 |

这些对照只建立读者的**抽象坐标**，具体持久、保留、重试次数/间隔、同组再平衡、重复检测都要按所选产品版本与配置核对。Redis `XACK` 若成功，条目仍可能留在 Stream，直到另行删除/裁剪；NATS 的发布去重窗不是消费去重记录；Kafka 的 offset42 也不是 `m-9` 的业务 seq9。没有任何一个中间件选型能替应用凭空完成设备已读回执。

## 七、DB→broker 空窗与 HTTP 409：两件事要各自保留

未来教学 S3 若已把 `m-9` 提交到数据库，却在生产者发布 E9 前崩溃，broker 根本没有这条事件；把发布重试写得再精巧，也需要一份**可靠的待发布事实**或权威扫描/对账入口找到“应该发布而尚未发布”的 m-9。07.10 再评审 outbox：业务消息与待发布记录在同一个**本地**数据库事务里，然后转发、重试和消费者幂等；这里没有声称当前项目已经实现它。

当前 S2 HTTP 合同**同消息 ID 再 POST 一律 409**，旧消息不变。Broker 用 `event_id` 在五分钟内抑制重复 E9，绝不能倒推成“客户端重复 m-9 自动拿到第一次的 200”。A 在 HTTP 提交附近超时，仍要按稳定 m-9 经授权查权威状态；broker 有没有重复通知与权威数据库有没有第二条消息是不同问题。[09.02 HTTP 合同](../09_backend_security/02_http_api_contract.md)

B 离线后仍从权威消息历史按权限/游标补拉；E9 的重投不允许消费者创建第二条 `m-9`。把这几种身份和确认点放在一张图上，才能防“事件重复”被误认成“聊天消息重复”，也防“事件 ACK 成功”被误认成“用户已读”。

## 八、交付两端时间线和一张去重范围表

交付：生产 ACK 丢失后**相互独立**的 t=4 与 t=6 分支；消费先 ACK/后 ACK 的两个崩溃窗口；消费者 10 分钟记录与 t=11 重投；`m-9`/E9/v1/v2/SearchIndex/Notify 的身份表；数据库、broker、消费者、网关、设备五层确认表。每项都注明哪一步已知、哪一步仍未知、保留多久、失败后查谁。不以“至少一次”四个字代替这些证据。

### 分层练习与反馈

1–8 先认确认与身份，9–16 手算时间线与版本，17–22 处理窗口、HTTP 和业务取舍。先预测，再展开答案。

<details><summary>1. `message_id=m-9` 与 `event_id=evt:m-9:v1` 同一作用吗？</summary>

不同。前者标业务消息，后者标这条消息 v1 变化对应的处理事件。</details>

<details><summary>2. broker 存下 E9，但发布 ACK 丢了，生产者能断言 E9 未存吗？</summary>

不能。生产者结果未知，需要稳定事件身份与查证/重试政策。</details>

<details><summary>3. 当前 S2 同消息 ID 再 POST 返回什么？</summary>

409；Broker 的事件去重不会改变 HTTP 合同。</details>

<details><summary>4. 消费者 ACK 等于 B 用户已读吗？</summary>

不等于。它只在消费者与 broker 的协议层有意义。</details>

<details><summary>5. Redis Stream `XACK` 会自动删除整个 Stream 条目吗？</summary>

不会。它移除相应组里的 PEL 待确认引用；条目保留另由政策决定。</details>

<details><summary>6. SearchIndex 与 Notify 可共用“E9 已处理”一个布尔值吗？</summary>

不能。副作用不同，完成与失败也不同，应区分作用域。</details>

<details><summary>7. “至少一次投递”是否等于外部索引恰好一次效果？</summary>

不等于。重投可能重复，外部目标需幂等/版本条件和对账。</details>

<details><summary>8. E9 重投能生成第二条权威聊天消息 m-9 吗？</summary>

不应。E9 是处理事件，权威消息已由数据库身份/唯一约束管理。</details>

<details><summary>9. 五分钟玩具窗口内，首次后四分钟同 ID 发布重试怎样？</summary>

在独立分支 A、broker 正常保留去重记录的前提下，可识别重复而不追加另一 E9。</details>

<details><summary>10. 首次后六分钟的另一独立分支怎样？</summary>

已超玩具五分钟窗口，有追加第二条事件的风险，不能靠短窗保证长时去重。</details>

<details><summary>11. 第 9、10 题能当成同一条“先 t4 再 t6”的执行路径吗？</summary>

不能。它们是从同一次首次发布出发的两个独立分支，避免假设重复命中会否刷新窗口。</details>

<details><summary>12. W1 ACK 已被 broker 记录，尚未写索引就崩溃会怎样？</summary>

组内可能认为完成而不重投，搜索索引效果缺失，需要独立对账/重建。</details>

<details><summary>13. W1 已写索引，ACK 未被记录就崩溃会怎样？</summary>

可能重投给 W1/W2，外部索引操作被重复调用。</details>

<details><summary>14. 只用 `m-9` 去重，为何可能错过编辑 v2？</summary>

v1 已标处理后，合法 `evt:m-9:v2` 也会被误判重复；须区分版本。</details>

<details><summary>15. `(m-9,v1,SearchIndex)` 已处理，能说明 Notify 已完成吗？</summary>

不能。副作用作用域不同，Notify 有独立确认与设备边界。</details>

<details><summary>16. 消费者去重记录 t=10 分钟过期，t=11 重投能保证被挡住吗？</summary>

不能。记录已过期，需目标幂等或覆盖重放范围的更持久去重方案。</details>

<details><summary>17. 把去重 TTL 从 10 分钟拉到 20 分钟，就可承诺永不重复吗？</summary>

不能。还要考虑更晚人工重放、日志保留、恢复和目标副作用语义。</details>

<details><summary>18. NATS `Nats-Msg-Id` 只要正文相同就自动去重吗？</summary>

不是。官方机制按指定 ID 且受配置窗口约束。</details>

<details><summary>19. Kafka offset 已提交，就证明外部 SearchIndex 同事务更新了吗？</summary>

不能。位点和外部索引写入在不同系统，需幂等/协调与证据。</details>

<details><summary>20. DB 已提交 m-9、生产者尚未发 E9 就崩溃，Broker 重投能找回 E9 吗？</summary>

Broker 根本没有 E9，须从可靠的本地待发布记录或权威对账入口找出漏发。</details>

<details><summary>21. Broker E9 去重成功，能改写当前 HTTP 重复 ID 的 409 吗？</summary>

不能。事件发布去重与客户端消息重复拒绝是不同合同；如要变更 HTTP 语义须另行版本审查。</details>

<details><summary>22. 什么时候能对 A 说“B 已读”？</summary>

需要按设备/用户已读回执的合同取得相应证据；DB Commit、E9 发布或消费 ACK 都不足够。</details>

## 本章完成标准与下一步

不看答案时，能画出生产 ACK 丢失、消费者 ACK 前后崩溃的三类未知，解释五/十分钟短窗为何不能覆盖六/十一分钟重试，给合法编辑 v2 留出独立幂等身份，并保留当前 409 合同，才算完成第一轮。第二轮由学习者在隔离环境核对真实 broker 版本、确认、重投与外部副作用记录；本章没有代替运行。

按[学习路线](../learning_path.md)，下一章 07.08 将以 `c-a` 按键分区解释并发消费、重试乱序与再平衡，07.09 再进入积压和坏消息的隔离。
