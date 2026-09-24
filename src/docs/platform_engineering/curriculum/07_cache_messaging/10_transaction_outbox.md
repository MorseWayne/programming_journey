---
title: 07.10 事务边界与 outbox：消息提交了，事件还没发
icon: /assets/icons/article.svg
order: 11
date: 2026-09-24
---

[返回第七卷](./README.md) · [消息抽象前置：07.06](./06_message_abstractions.md) · [确认重投前置：07.07](./07_ack_retry_dedup.md) · [顺序前置：07.08](./08_order_concurrent_consumption.md) · [事务前置：06.07](../06_databases/07_transactions_anomalies.md)

# 07.10 事务边界与 outbox：消息提交了，事件还没发

> DeepTutor 八节初稿经技术与教学审阅后的静态课程。`m-9`、`E9`、SQL 表、C0–C7 与故障均是**脱敏的纸上教学模型**；没有运行 Go、数据库、broker、故障注入或站点。当前 S2 的发送成功含义仍是 `accepted_in_memory`；未来 S3 的 `stored_in_teaching_db` 只是[拟议教学合同](../09_backend_security/12_im_service_capstone.md)，下文讨论以它为条件，不表示已经部署。

## 一、先找两个提交点：为什么“写了消息”仍可能漏事件

假设虚构会话 `c-a` 中，已认证且有权限的 `u-a` 发送 `m-9`。未来教学 S3 要把它作为权威历史保存，分配会话内 `seq=9`。搜索索引 `SearchIndex` 与在线提示 `Notify` 要处理事件 **E9**，稳定身份是 `event_id=evt:m-9:v1`。B 的设备接收与阅读又是另外两件事。这里先补四个词：**事务**把同一数据库内的一组写操作作为一个提交/回滚单元；**提交**是该数据库对事务结果的确认；**事件**是已发生事实引出的后续处理意图；**派生效果**是索引、提示等可由权威事实重建或核对的结果。[PostgreSQL 事务入门](https://www.postgresql.org/docs/current/tutorial-transactions.html)

最直接的写法有两种，都会遇到无法用普通 `if err` 填平的裂缝：

| 顺序 | 崩溃位置 | 业务后果 |
|---|---|---|
| 数据库提交 `m-9` → 发布 E9 | 提交后、发布前 | 历史里有 `m-9`，broker 没 E9；仅重试**收到的**事件无法找回它 |
| 发布 E9 → 数据库提交 `m-9` | 发布后、提交前，后者回滚 | 消费者可能先看到 E9，却查不到权威 `m-9`；回滚后甚至永远不存在 |

只把顺序反过来没有创造一个横跨 SQL 数据库与 broker 的原子事务。发送 API 的响应语义也取决于它**确实确认了哪个点**：S2 当前仅进程内受理；未来 S3 若选择数据库提交返回，只能说本地权威事实已提交，不能把“已发布、已索引、B 已收/已读”顺手并入 200 响应。[07.06 的事实与通知分层](./06_message_abstractions.md)

## 二、本地 outbox：同一事务留下可恢复的发布意图

**outbox（待发箱）**是一张与业务表处在**同一个数据库**的记录表。教学流程先复用 09.07 的身份与成员授权，再按[06.12 的会话序号方案](../06_databases/12_database_business_case.md)协调 `conversation_counters.next_seq`。在同一 `*sql.Tx` 中写 `messages` 的 `m-9,c-a,u-a,seq=9,version=1`，再写 `outbox` 的 `event_id=evt:m-9:v1, aggregate_id=c-a, aggregate_seq=9, message_id=m-9, status=PENDING`；随后只做**一次本地 Commit**。示意字段与 SQL 方言是教学提案，并非 OpenIM 表结构。

```text
BEGIN（同一 SQL 数据库）
  核对身份与会话成员；安全分配 c-a 的 seq=9
  INSERT messages(m-9, c-a, u-a, seq=9, version=1, ...)
  INSERT outbox(evt:m-9:v1, c-a, seq=9, ref=m-9, PENDING)
COMMIT
```

若第二个 `INSERT` 失败并回滚，两行都不成为已提交事实；若 Commit 成功，两行一起对后续读取可见。`event_id` 应有唯一约束，业务消息身份/客户端幂等键也要有自己的约束与冲突处理，不能因 HTTP 超时重试又分配 `seq=10` 给同一逻辑发送。待发记录可存最小必要的 `message_id`、版本和事件类型，消费者按授权读权威数据；若要放消息快照，须另设计敏感内容的访问与保留。事务只管它实际覆盖的行和数据库，**不包含 broker 的写入，更不包含搜索索引或设备**。[PostgreSQL 事务：原子提交范围](https://www.postgresql.org/docs/current/tutorial-transactions.html)

在业务用例里，这个技巧解决的是“消息已提交但系统没有持久的发布意图”。它没有承诺发布立即完成。如果 Commit 的**结果对调用者未知**（例如回应丢失），调用者按稳定业务 ID 查询/重试幂等写，不能从超时推断回滚。这里的 SQL 示例也不改变 S2 的 **6 个 UTF-8 字节内容上限、4096 B 总请求上限、相同 ID 冲突 409 与非成员目标隐藏 404**；升级 S3 须经合同评审。[09.02 S2 合同](../09_backend_security/02_http_api_contract.md)

## 三、C0–C7：每一次崩溃到底留下什么

假设一个独立转发器（relay）扫描已提交的 `PENDING` outbox，尝试把 E9 发布到 broker。它必须在**知道 broker 接受结果后**才把记录置为 `PUBLISHED`。`PUBLISHED` 在本题只表示“按约定确认级别已知 broker 接受”，不是索引、通知或设备完成。实际生产确认级别取决于选用 broker、客户端和配置，不能从单词 `publish` 推断。[07.07 确认的观察者](./07_ack_retry_dedup.md)

| 点 | 发生的动作 | 此处崩溃或回应丢失后，恢复者应如何判断 |
|---|---|---|
| C0 | 事务开始前 | 没有本题已提交的 `m-9`/outbox；客户端重试仍需业务幂等 |
| C1 | 两行已写，但 Commit 前 | 回滚时两行一起消失；不能把未提交 E9 发给消费者 |
| C2 | Commit 已成功 | `m-9` 与 `PENDING` 同在；relay 停机仍可在恢复后扫描它 |
| C3 | relay 领取 `PENDING` | 领取状态/租约必须可过期回收；不能因一个进程失联永久锁死 E9 |
| C4 | broker 实际接受 E9 | 如果确认可靠返回，relay 可去标记；如果确认丢失，relay 只知道“结果未知” |
| C5 | broker 接受后，ACK 丢失或 relay 崩溃 | outbox 仍待处理，重发**同一** `event_id` 可能让 broker 出现重复记录，消费者要幂等 |
| C6 | 收到有效确认后标 `PUBLISHED` | 表示发布阶段完成；SearchIndex/Notify 各自可能尚未消费 |
| C7 | 某消费者处理并确认 | 只证明该消费者按自身协议完成；另一个组、gateway、B 的收/读仍需各自证据 |

最危险的反向排序是：先把 outbox 标为 `PUBLISHED`，再调用 broker。若在两者之间崩溃，扫描器以后看到“已发布”便不重试，E9 可以永久缺席。选择**确认后标记**把不可消除的空窗转化为“可能重复而非静默漏发”，前提是消费者能安全处理重复，并有监测/修复长期待发项的责任。即使 C6 的数据库更新也可能有未知结果：恢复时检查状态，再决定是否重试；重试始终携带稳定身份，不凭新随机 ID 掩盖原事件。[Debezium outbox 文档：重复可能性与消费者幂等](https://debezium.io/documentation/reference/stable/transformations/outbox-event-router.html)

## 四、多个 relay、认领租约与同会话顺序

一个 relay 停机不能停掉全部发布，常会安排多个实例。但两个实例若同时读到 E9，可能都发布；认领需要数据库内的并发协调。一种 PostgreSQL **候选方案**是短事务中按条件选 `PENDING` 行并 `FOR UPDATE SKIP LOCKED`，把它改成“由 R1 领取、租约到时”；提交认领事务后再访问 broker。`SKIP LOCKED` 对已经被其他事务锁住的行可跳过，适合队列式争抢，但**它本身不提供跨 broker 调用的锁，也不提供进程崩溃后的租约恢复**。这些要另用状态条件、到期重新认领、尝试次数与实例 token 设计；过期 R1 的迟到更新不能覆盖 R2 的新状态。[PostgreSQL SELECT 锁子句](https://www.postgresql.org/docs/current/sql-select.html)

| 并发情况 | 需要的规则 |
|---|---|
| R1 领取后死掉 | 租约到期且未证实发布时，R2 可重新领取；维持原 `event_id` |
| R1 发布成功但 ACK 丢失，R2 重领 | 可重发 E9；下游按稳定身份去重/条件应用 |
| R1 租约到期后才返回，R2 已领取 | 用认领 token/状态条件阻止 R1 写坏 R2 状态；仍要接受可能双发 |

同一会话的 **E9(seq9)** 与 **E10(seq10)** 是另一问题：即使数据库里 outbox 两行都按序提交，R1 卡在 E9、R2 抢到 E10，broker 可能**先收到 E10**。按 `conversation_id` 路由到同一分区只能保持 broker **实际接收的顺序**，不会自动纠正生产侧乱序。若业务要求严格同会话事件顺序，需要在发布端加同键闸门/串行队列、保证 `aggregate_seq` 连续发布，并设计租约失败时的恢复；若只要求某个可重建派生字段不倒退，可在目标端按版本条件更新，但不能因此忽略 E9 的其他必要效果。[07.08 的 E9/E10 顺序模型](./08_order_concurrent_consumption.md)

## 五、消费幂等：同一个 E9 可来两次，编辑 v2 是新事实

SearchIndex 与 Notify 是**两个独立消费目的**。E9 在 broker 中重复，或者消费端外部写成功、消费 ACK 丢失，都可能令处理重做。去重键不能只用 `m-9`：如果 `m-9` 合法编辑为 v2，`evt:m-9:v2` 是应处理的新事实。对某个副作用可用 `(message_id, version, side_effect)`，例如 `(m-9,v1,search)`；实际“已处理”标记必须和目标写入具备清楚的原子/条件更新关系，不能先记已处理、再索引写失败却永不重试。[07.07 去重窗口与版本](./07_ack_retry_dedup.md)

搜索目标可设计原子的版本条件写：当前版本小于 v2 才让 v2 更新，迟到 v1 不覆盖它。但如果 E9 还承担另外的必要索引或审计动作，单个 `latest_version=2` 只能保护那一项字段，不能证明其他效果都已做。对于外部推送、gateway 在线投递和 B 的设备状态，不能把它们塞进本地 SQL `*sql.Tx` 就宣称整体 exactly once：一次网关发送尝试、设备收到、用户阅读是三种不同证据。未知结果要查目标、沿稳定 ID 受控重试，坏事件按[07.09 的隔离修复流程](./09_backlog_poison_messages.md)处理。

## 六、运行与修复：PUBLISHED 不是故事的终点

至少分开观测：`PENDING` 数量与最老年龄、认领租约超时、relay 发布尝试/已知确认/结果未知、`PUBLISHED` 的增长、broker 位置差、各消费组最老未完成年龄、SearchIndex 的权威对账缺口，以及 Notify 与设备的独立状态。只看 `PUBLISHED` 比例，既看不出漏索引，也看不出 B 离线超过玩具 broker 的 **24 小时保留期**；B 离线 **25 小时**时应从经授权的权威数据库历史补拉，而不能把 broker 保留当永久聊天档案。[07.06 离线补拉](./06_message_abstractions.md)

后台对账应从权威 `messages` 抽取某范围的已提交 ID/版本，对比 outbox 与派生目标：已提交却没有对应待发记录表明本地事务路径或迁移数据需要调查；长期 `PENDING` 查 relay/发布错误；`PUBLISHED` 但目标无效果查消费者/隔离/重建。已发布记录何时清理，要与审计、故障回放、数据最小化和重建来源一起决定，不能“发布成功就全删”又失去调查依据。异常处理保留脱敏事件身份、阶段、首次/最近错误和修复责任，不复制私有正文到普通日志。[11.03 观测证据](../11_reliability/03_logs_metrics_traces.md)

**CDC（变更数据捕获）**可以替代轮询 relay 的“从已提交 outbox 提取事件”方式：例如 Debezium 的 outbox event router 会从 outbox 表变更构造下游事件。它仍以本地事务中写入 outbox 为前提；连接器位点、发布重试、重复处理、目标幂等和重建责任仍需设计。这里介绍的是可比较的技术路线，**未声称本课程或 OpenIM 已部署 CDC**。[Debezium Outbox Event Router](https://debezium.io/documentation/reference/stable/transformations/outbox-event-router.html)

## 七、固定 OpenIM 源码：只对照实际看见的两段

主参照是固定 `openimsdk/open-im-server` 提交 `f6411a8a1a31d3df36f4c2b3ad28481a94141e1f`。在 [`internal/rpc/msg/send.go` 群聊路径](https://github.com/openimsdk/open-im-server/blob/f6411a8a1a31d3df36f4c2b3ad28481a94141e1f/internal/rpc/msg/send.go#L46-L70)，前置检查后调用 `m.MsgDatabase.MsgToMQ(...)`，无错后组装响应；单聊的 `isSend` 分支也调用它，不能把单聊的所有分支都概括为此行为。[`online_msg_to_mongo_handler.go` 的另一消费路径](https://github.com/openimsdk/open-im-server/blob/f6411a8a1a31d3df36f4c2b3ad28481a94141e1f/internal/msgtransfer/online_msg_to_mongo_handler.go#L43-L69)解码消息并调用 `BatchInsertChat2DB(...)`。这两段足以判断：**该发送 RPC 的返回位置不是这段 MongoDB 批量写入完成的位置**。[09.05 的源码对照](../09_backend_security/05_data_access_migration.md)

| 问题 | 教学 SQL outbox | 固定源码目前可说什么 |
|---|---|---|
| 消息与待发意图是否同一个本地事务 | **假设并设计为是** | 这两段源码没有展示本章 SQL 两表事务，不能据此断言该项目有或没有 outbox |
| 发送端何时返回 | 提议 S3 在本地 SQL Commit 已知成功后 | `send.go` 的所述分支在 `MsgToMQ` 无错后返回；具体 broker 确认等级未由此证实 |
| MongoDB 与设备何时完成 | 本题在 outbox 外，另有消费/交付阶段 | MongoDB 批量写在另一个消费处理函数；设备链路未由两段代码核对 |

下一轮真实源码阅读应继续追 `MsgToMQ` 的实现和生产者确认配置、消费位点/重试、MongoDB 底层写关注以及设备推送/补拉；在取得证据前保留“未知”。教学 SQL 模型帮助推导跨系统边界，不能冒充 OpenIM 的实际存储和队列架构。

## 八、交付一张崩溃矩阵，再用 22 题自检

第一遍先画 `HTTP→同库 messages/outbox Commit→relay→broker→SearchIndex/Notify→gateway→B`，每个箭头写上**已知确认点**和**不包含的外部效果**。第二遍提交 C0–C7 崩溃矩阵、E9/E10 双 relay 顺序方案、v1/v2 幂等键和一份对账/修复表。若从未实际运行，观测栏写“待验证”，不要填“已通过”。

### 基础 1–8：先说清事务和事件

<details><summary>1. 本章的权威聊天事实是什么？</summary>

未来教学 S3 中同库已提交的 `messages` 行 `m-9,c-a,seq9`。当前 S2 尚无这个数据库提交点。</details>

<details><summary>2. E9 的稳定事件身份是什么？</summary>

`evt:m-9:v1`。重试同一版本沿用它，编辑为 v2 才有新版本身份。</details>

<details><summary>3. 先提交 DB 后发布，哪一个窗口会漏 E9？</summary>

DB Commit 已成功、发布前崩溃；只靠 broker 消费重试找不到从未发布的事件。</details>

<details><summary>4. 先发布后提交 DB，哪种反例会产生孤儿事件？</summary>

broker 接受 E9 后 DB 回滚，消费者可能看到并不存在的权威 `m-9`。</details>

<details><summary>5. outbox 行和消息行必须满足什么位置条件才可用一次本地事务提交？</summary>

位于同一个支持该事务的数据库范围内，由同一事务写入并一起 Commit/rollback。</details>

<details><summary>6. 本章的 SQL 事务能原子地提交 broker、索引与设备吗？</summary>

不能。它只原子化其覆盖的本地数据库写入。</details>

<details><summary>7. S2 成功响应和未来 S3 提议分别代表什么？</summary>

S2 当前为 `accepted_in_memory`；S3 `stored_in_teaching_db` 是拟议的本地数据库已知提交，不含 broker/设备。</details>

<details><summary>8. outbox 只存 `message_id` 与版本时，谁保存权威正文？</summary>

权威消息表；下游读取仍须依授权。是否在事件里存快照另按隐私与重建需求设计。</details>

### 推演 9–16：逐点问“已知、未知、如何恢复”

<details><summary>9. C1 两行已写但未 Commit，进程崩溃后能发布 E9 吗？</summary>

不能以未提交行作为事实；事务回滚后两行都不成为已提交记录。</details>

<details><summary>10. C2 Commit 已知成功，relay 停机时留下什么？</summary>

`m-9` 与 `PENDING` E9 同在，恢复者可继续发现待发记录。</details>

<details><summary>11. broker 已接受 E9 但 ACK 丢了，relay 能确定“没有发出”吗？</summary>

不能；结果未知。保持稳定 `event_id` 并安全重试，接受可能重复。</details>

<details><summary>12. 为什么不能先标 `PUBLISHED` 再发 broker？</summary>

标记后、发送前崩溃会让扫描器误以为已发，造成静默漏事件。</details>

<details><summary>13. C6 `PUBLISHED` 能证明 SearchIndex 已完成吗？</summary>

不能。它在本题仅证明按约定级别已知 broker 接受。</details>

<details><summary>14. R1 领取后死掉，E9 如何继续？</summary>

租约到期后让其他 relay 按状态条件重新领取，沿用原事件身份并记录尝试。</details>

<details><summary>15. R1 租约过期后迟到，如何防它覆盖 R2 的领取状态？</summary>

用认领 token/版本与条件更新拒绝过期持有者写状态；仍要容忍双发可能。</details>

<details><summary>16. E9/E10 同一个会话分区，为何仍可能先见 E10？</summary>

两个 relay 在生产侧可能先发布 seq10；分区只排序 broker 实际接收的记录。</details>

### 评审 17–22：从局部正确性走向业务结果

<details><summary>17. E9 重复与 `m-9` 编辑成 v2，能用同一条去重规则直接丢掉吗？</summary>

不能。v1 重复是同一事实重做，v2 是新版本；按消息、版本、副作用区分。</details>

<details><summary>18. 搜索目标 `latest_version=2`，迟到 v1 可直接覆盖吗？</summary>

不可；用目标端原子版本条件保护该字段，同时单独核查 v1 的其他必要效果。</details>

<details><summary>19. 只看 outbox `PUBLISHED` 比例足以证明 B 已读吗？</summary>

不足。broker 接受、各组消费、gateway 尝试、设备接收与用户阅读有不同证据。</details>

<details><summary>20. CDC 换掉轮询 relay 后，消费者幂等可以删吗？</summary>

不能。连接器发布和消费的重复/重放及外部副作用仍需处理。</details>

<details><summary>21. 固定 OpenIM 的两段源码能证实它已实现本章 SQL outbox 吗？</summary>

不能。只看到所述分支 `MsgToMQ` 后返回与另一消费路径调用 MongoDB 批量写。</details>

<details><summary>22. `PUBLISHED` 后搜索缺一条，下一份可执行的证据是什么？</summary>

先按 `event_id`/版本核对 broker/消费位置、隔离记录和索引目标，再由权威 `messages` 安全重建并留下对账结果；不要猜设备状态。</details>

## 本章完成标准与下一步

能独立画出两个朴素双写的失败窗口，解释“同库消息+outbox”的**原子范围**和 C0–C7 每个点的可恢复状态；能说明发布确认丢失为何带来重复、E9/E10 为何仍要约束生产顺序、v1/v2 与每种外部效果为何分别幂等，才算学会机制。真实环境的确认配置、故障证据和用户体验仍要在学习者自己的实验里核对。下一章 07.11「派生视图与事件时间」将继续讨论迟到事件、物化结果与重建。
