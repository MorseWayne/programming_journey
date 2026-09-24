# 07.12 跨系统数据一致性案例：从发送到离线补拉

> DeepTutor 八节初稿经技术与教学审阅后的静态课程。`u-a/u-b/u-c`、`c-a`、`m-9`、E9、24/25 小时及 T0–T8 全是**脱敏的纸上模型**；没有运行 Go、数据库、broker、IM 服务、故障注入或站点。当前 S2 的 200 仍只表示 `accepted_in_memory`；[未来 S3 `stored_in_teaching_db`](../../../src/docs/platform_engineering/curriculum/09_backend_security/12_im_service_capstone.md)只是教学合同提议，不是已部署功能。本文把多系统场景拼起来，不把局部确认冒充端到端保证。

## 一、先从 A 和 B 的需求写验收，不从组件图猜保证

虚构会话 `c-a` 里，`u-a` 与 `u-b` 是成员，已登录的 `u-c` 不是。A 发 `m-9`，它在未来教学 S3 的权威消息表中得到 `seq=9`；同一 SQL 事务写待发 outbox E9，稳定 `event_id=evt:m-9:v1`。转发器把 E9 发到玩具 broker 的 P0:42，`SearchIndex` 与 `Notify` 是两个不同消费组；会话预览也是派生结果。B 恰好离线 **25 小时**，而玩具 broker 只保留 **24 小时**事件。[07.06 保留与补拉](../../../src/docs/platform_engineering/curriculum/07_cache_messaging/06_message_abstractions.md)

此时用户真正关心的是：A 能否确认“消息被系统接纳到哪一步”？B 上线后能否**按权限**查到 `m-9`？搜索和会话列表什么时候追上？在线提示若错过，聊天历史会不会丢？“消息已送达”和“用户已读”有没有独立证据？这些问题的答案不可能压成一个 `success=true`。先用需求决定数据的**权威来源、允许延迟和修复责任**，再选择通知/队列/缓存。第一遍只需能把每个结果对准一个事实来源；第二遍再处理崩溃、重复、权限和补偿。

| 用户看到的结果 | 本题权威/推导依据 | 允许的中间状态 | 不可冒充的保证 |
|---|---|---|---|
| 聊天历史 | 已提交 `messages` 与当前可见规则 | S3 提议中的提交结果未知时先查稳定 ID | DB 提交不等于 B 设备收到 |
| 搜索 | 权威消息当前版本、撤回/删除和授权 | 可暂时缺索引，须有修复入口与明确延迟目标 | 搜索 ACK 不等于历史权威 |
| 会话预览 | 有权可见的最新业务 `seq` | 可短暂落后，低 seq 不得覆盖高 seq | `latest_seq` 不证明每篇搜索文档齐全 |
| 在线提示 | 有效连接上的尝试/设备协议 | B 离线可缺一次实时提示 | 网关尝试不等于设备收到/已读 |
| 离线补拉 | 权威历史、成员权限、`seq` 游标 | 重连后按页追赶 | broker 保留时长不是历史保留期 |

## 二、把“一致性”拆成安全、进展与时效三类合同

**安全性**要求不能凭一条不存在的 `m-9` 给出权威历史、不能向非成员 `u-c` 泄露正文、不能让旧 `m-9:v1` 覆盖当前 v2；即便后续会修复，也不能先越权返回。**进展性**是已提交的待发 E9 最终有可运行的转发、消费、隔离和人工修复路径；它依赖进程、持久记录、资源与保留，并非一句“最终一致”自动兑现。**时效性**需另为搜索、预览、补拉定义可量测的最大/分位延迟或值班阈值，不能从“可恢复”推断“马上可见”。[07.10 本地原子范围](../../../src/docs/platform_engineering/curriculum/07_cache_messaging/10_transaction_outbox.md) · [11.01 业务测量](../../../src/docs/platform_engineering/curriculum/11_reliability/01_business_measurement.md)

当前 S2 HTTP 合同仍是非空且至多 **6 UTF-8 字节**正文、**4096 B**总请求、成功 `200 accepted_in_memory`、同消息 ID 重复**即使正文相同也为 409**、非成员目标隐藏 **404**。[09.02 S2 合同](../../../src/docs/platform_engineering/curriculum/09_backend_security/02_http_api_contract.md) 未来 S3 若改成 `stored_in_teaching_db`，必须明确新版本接口的提交未知/重试/冲突响应；本章不能把纸上 SQL 已提交状态写回当前 `/v1` 的 200，也不能自行把待审 R9 的 9 字节限额提前生效。[09.12 S3 提议](../../../src/docs/platform_engineering/curriculum/09_backend_security/12_im_service_capstone.md)

## 三、T0–T8：每到一步，只给它确实拿到的证据

以下是**逻辑阶段**，不声称所有阶段在一条同步调用栈里完成。尤其 T4 与 T5 可独立先后，B 离线时可能根本没有 T6 的设备接收。假设未来教学 S3 的消息、计数推进与 outbox 在同库事务里；当前 S2 没有 T1 这个数据库提交点。[PostgreSQL 事务原子范围](https://www.postgresql.org/docs/current/tutorial-transactions.html)

| 阶段 | 动作与稳定身份 | 此阶段可确认什么 | 仍未知什么 |
|---|---|---|---|
| T0 | 可信身份 `u-a`、成员检查、6 B 内容与稳定 ID | 请求是否有资格进入写路径 | 后续提交、发布、送达 |
| T1 | 同一 SQL `*sql.Tx` 提交 `m-9,c-a,seq9` 与 outbox `evt:m-9:v1/PENDING` | **提议 S3** 的本地权威事实与发布意图同成同败 | A 是否收到回应、broker 是否接纳 |
| T2 | relay 领取并发送 E9 | 有一次发布尝试 | broker 是否真的接受，若 ACK 丢失更未知 |
| T3 | broker 按约定确认 E9；玩具位置 P0:42 | 事件在该确认语义内被接受 | SearchIndex/Notify 是否处理 |
| T4 | SearchIndex 按消息 ID/版本改索引并确认其消费 | 该组的目标效果/消费进度有自己的证据 | Notify、预览、B 的设备状态 |
| T5 | Notify 对 B 有效连接尝试提示 | 一次在线通道尝试的结果 | B 应用是否收到；离线时通常没有可送的通道 |
| T6 | B 的某设备按协议报告收到 | **该设备**的接收状态 | 其他设备、用户是否阅读 |
| T7 | B 重连，用当前权限与 `seq` 游标读权威历史 | 按返回页核对漏掉的 `m-9` | 用户是否读过/理解正文 |
| T8 | B 发送阅读回执 | 按回执合同记录某用户/设备阅读状态 | 不能反推每台设备都收到过 T5 推送 |

`m-9` 这个**消息 ID**、`seq=9` 这个**会话位置**、`evt:m-9:v1` 这个**事件 ID**与 P0:42 这个**broker 分区位置**四者各有作用，不可互推。E10/`m-10,seq10` 可在 P0:43 之后处理，并可能先完成预览；它不允许让 E9 的 `m-9` 搜索文档无记录地消失。[07.08 顺序完成反例](../../../src/docs/platform_engineering/curriculum/07_cache_messaging/08_order_concurrent_consumption.md) · [Kafka 分区与日志](https://kafka.apache.org/intro/)

## 四、七个故障变式：先问权威事实，再选重试方式

| 故障窗口 | 观察者眼中的疑问 | 不丢事实的下一步 |
|---|---|---|
| T1 Commit 成功后给 A 的响应丢失 | A 超时，不知消息是否已存在 | 查稳定业务 ID/权威记录；按新合同处理同 ID 重试。S2 的重复 409 仍独立成立 |
| T1 后 relay 停机，outbox 长期 `PENDING` | 历史有 `m-9`，搜索/提示暂缺 | 监测最老待发年龄，恢复领取/重试并核对 E9，不从消息表凭随机 ID 另造事件 |
| T3 接受 E9，但 broker 确认丢失 | relay 不知 E9 是否已发布 | 沿 `evt:m-9:v1` 重试，容忍 broker 重复；消费目标按 ID+版本幂等 |
| T4 索引写成功、消费 ACK 丢失 | SearchIndex 可能再收到 E9 | 查/条件更新目标，不能把重复投递算新消息；若 E-bad=P0:44 永久坏，按 07.09 隔离修复 |
| T5 提示发送尝试完成，B 已离线 | 有网关尝试或失败，却没有 B 收到证据 | 让 B 后续按权限补历史；Notify ACK 不代表设备 ACK |
| B 离线 25h，broker 仅留 24h | 旧 E9 可能已不能从 broker 读 | 从权威 `messages` 按 `seq` 游标补拉；日志保留不是聊天历史保留 |
| `m-9:v2` 已生效，旧 v1 重放；或成员权限撤销 | 派生视图可能倒退或泄露 | 按当前版本/删除/授权核对目标，拒绝旧覆盖并清除不可见内容 |

这张表故意没有写“统一再试三次”：超时前后发生的事实不同。**结果未知**先读稳定目标；**暂时依赖失败**按有界预算退避；**永久坏输入**隔离、修规则后受控重放。把 E-bad 强行 ACK 成功只是隐藏缺口，把同一外部推送无限重做也可能产生重复提示。[07.09 积压与坏消息](../../../src/docs/platform_engineering/curriculum/07_cache_messaging/09_backlog_poison_messages.md) · [07.07 ACK 与去重](../../../src/docs/platform_engineering/curriculum/07_cache_messaging/07_ack_retry_dedup.md)

## 五、对账与补偿：从权威 ID 集合出发，不靠“计数相同”

跨系统没有一个能同时包住 SQL、broker、搜索、网关和设备的本地事务。**对账**是把权威事实集合与每个目标在同一范围/版本下比较，发现缺失、多余、旧版本和权限错误；**补偿**是为已发生的外部效果再做一项可审计的新动作，而不是让数据库 `ROLLBACK` 撤销已经发给 B 的提示。数量相等可能是“漏 m-9，又多一条旧 m-8”，所以要比较 ID、版本与状态。[07.11 影子重建与对账](../../../src/docs/platform_engineering/curriculum/07_cache_messaging/11_derived_views_event_time.md)

| 对账对象 | 用什么键/状态比 | 缺口或多余时的修复 |
|---|---|---|
| `messages ↔ outbox` | `message_id,version,event_id`，已提交范围 | 查写路径/迁移异常；安全补建发布意图需可审计且避免双发 |
| `outbox ↔ broker` | 待发年龄、发布确认与稳定事件 ID | ACK 未知先按重复可能重试；`PUBLISHED` 只说明所选 broker 确认 |
| `messages ↔ SearchIndex` | 应有 ID 集合、当前版本、撤回/删除与可见范围 | 按权威当前状态补建/删除目标；旧 v1 不覆盖 v2 |
| `messages ↔ 预览` | 有权可见的最大有效 `seq` 与预览指针 | 条件提升或按权威重算，防迟到低 seq 回退 |
| `messages ↔ B 补拉/回执` | 授权范围、服务端 `seq`、各设备游标/回执 | 补历史缺口；设备收/读只能按其实际证据记账 |

**重放原 E9**适合事件仍在保留范围、目标处理逻辑已修且版本适用；**从权威状态重建**适合日志过期、索引长期漂移或旧事件不足以表达当前撤回/权限；**补偿新动作**适合已发送错误提示等外部效果需要纠正/告知。选择前要限定会话、版本、时间窗和隐私范围，保存修复责任、结果、再失败与对账证据。不能把“已有 DLQ 工单”或“已发补偿命令”直接等于目标已经正确。[Debezium outbox 事件 ID 与重复](https://debezium.io/documentation/reference/stable/transformations/outbox-event-router.html)

## 六、B 的离线补拉：通知只是线索，权限仍是门

B 重连时，客户端可提供自己对 `c-a` 的上次已见 `seq`，服务端先认证 `u-b`，再按**当前业务可见规则**检查成员资格，用稳定 `seq` 范围分页查权威历史，返回缺口并允许下一页续读。某台设备的本地游标可能落后、损坏或与另一台设备不同；服务端不能因客户端说“我已经收到 9”就替代数据库事实。T7 的成功表示这次授权读取返回了页面；T8 的已读回执另走自己的业务协议。[06.12 会话分页与成员并发](../../../src/docs/platform_engineering/curriculum/06_databases/12_database_business_case.md)

`u-c` 虽已登录，仍不是 `c-a` 成员；按当前 S2 隐藏目标的 **404** 政策，不应因知道 `m-9` ID、推送主题或搜索关键词就得到私有正文。通知载荷可只携带最小引用，不把正文无界复制进普通日志、死信、推送通道或公开搜索。若 B 在离线期间退群、消息被撤回或删除，补拉与搜索须按所选可见政策裁决；**存在于权威库**与**此刻允许某人读取**是不同判断。[09.07 对象授权](../../../src/docs/platform_engineering/curriculum/09_backend_security/07_authentication_authorization.md)

在在线路径里，Redis Pub/Sub 这类通道按其自身语义只面向当下订阅者，官方说明消息在未订阅/断线时不会为此补送；即便换成有持久消费能力的日志，玩具 24 小时保留仍接不住 25 小时离线。通知与历史不能互为权威替身。[Redis Pub/Sub 交付语义](https://redis.io/docs/latest/develop/pubsub/) · [07.06 消息抽象](../../../src/docs/platform_engineering/curriculum/07_cache_messaging/06_message_abstractions.md)

## 七、值班先定位阶段，再查源码证据边界

最小监测面应分开：S3 **未来**提交已知/未知；outbox `PENDING` 数量与最老年龄；broker 发布尝试、已知确认、未知确认；SearchIndex/Notify **各自**未完成年龄与隔离量；搜索 ID/版本/权限对账差异；网关通知尝试；设备收、读回执；离线补拉的缺口页与失败类别。看到“用户搜不到 `m-9`”，先查权威 `m-9` 与当前权限，再沿 event_id 查 outbox/broker/索引目标；看到“B 没弹通知”，先分清离线与在线、网关尝试与设备接收，不因为搜索正常就关闭事故。[11.03 日志、指标与 Trace](../../../src/docs/platform_engineering/curriculum/11_reliability/03_logs_metrics_traces.md)

固定 `openimsdk/open-im-server` 提交 `f6411a8a1a31d3df36f4c2b3ad28481a94141e1f` 中，[`send.go` 的群聊及所述单聊分支](https://github.com/openimsdk/open-im-server/blob/f6411a8a1a31d3df36f4c2b3ad28481a94141e1f/internal/rpc/msg/send.go#L46-L70)调用 `MsgToMQ` 后返回；[另一路 MongoDB 消费处理](https://github.com/openimsdk/open-im-server/blob/f6411a8a1a31d3df36f4c2b3ad28481a94141e1f/internal/msgtransfer/online_msg_to_mongo_handler.go#L43-L69)调用 `BatchInsertChat2DB`。这两个局部事实足以阻止把发送 RPC 响应写成那段 MongoDB 批量写入完成；**不足以证明教学 SQL outbox、SearchIndex/Notify 组、设备确认链或 broker 生产者确认等级在 OpenIM 中如何实现**。若学习者要把本章矩阵填为 OpenIM 的真实状态，必须继续追函数、配置、错误分支和运行证据，未知格保持未知。[09.05 源码阅读边界](../../../src/docs/platform_engineering/curriculum/09_backend_security/05_data_access_migration.md)

## 八、第七卷综合交付与 22 道分层练习

交付四件纸上产物：一张 T0–T8 **确认点矩阵**；七个故障窗口的“症状→权威事实→动作→证据”表；一个覆盖 ID/版本/删除/权限的对账计划；一张把教学模型与固定源码的**已知/未知**分开的对照表。若有隔离实验环境，另记录真实配置、提交 SHA、命令与观察值；本页没有代替执行。

### 基础 1–8：每个确认点能说什么

<details><summary>1. 当前 S2 的 200 表示数据库已持久化吗？</summary>

不表示；当前合同为 `accepted_in_memory`。S3 `stored_in_teaching_db` 仍只是纸上提议。</details>

<details><summary>2. 相同 ID、相同内容在当前 S2 重发，结果是什么？</summary>

按当前合同仍是 409 冲突，不自动变成幂等 200。</details>

<details><summary>3. `m-9`、`seq9`、`evt:m-9:v1`、P0:42 能相互计算吗？</summary>

不能。它们分别是消息身份、会话位置、版本化事件身份与分区日志位置。</details>

<details><summary>4. T1 的同库事务覆盖 SearchIndex 和 B 设备吗？</summary>

不覆盖。只含教学 SQL 中实际纳入该事务的消息、计数和 outbox 记录。</details>

<details><summary>5. SearchIndex 与 Notify 的消费进度是同一个吗？</summary>

不是。它们是本题两个逻辑消费目的，各自确认与追赶。</details>

<details><summary>6. T3 broker 接纳 E9 可直接证明 B 已读吗？</summary>

不能。搜索、通知、设备接收与阅读还有各自阶段。</details>

<details><summary>7. 网关尝试发送提示时 B 已离线，能记为 B 已收吗？</summary>

不能。尝试与设备应用回执不同，离线时应依权威历史补拉。</details>

<details><summary>8. `u-c` 登录后知道 `m-9` ID，就能读 `c-a` 吗？</summary>

不能。还须满足对象/会话成员权限，当前隐藏目标政策是 404。</details>

### 故障 9–16：先问发生了什么

<details><summary>9. T1 已提交但 A 没收到 HTTP 回应，能断言事务回滚吗？</summary>

不能。结果对 A 未知，按稳定 ID 查权威状态；当前 S2/S3 的响应合同不能互换。</details>

<details><summary>10. `m-9` 已提交而 outbox 仍 `PENDING`，接下来找谁？</summary>

看 relay 领取、租约、发布错误和最老待发年龄；恢复同一 E9 的转发。</details>

<details><summary>11. broker 接受 E9 后 ACK 丢失，重试可能带来什么？</summary>

可能重复发布同一 `evt:m-9:v1`；消费者目标按稳定 ID/版本幂等处理。</details>

<details><summary>12. SearchIndex 写成功但消费 ACK 丢失，能直接再建一条新 `m-9` 吗？</summary>

不能。应核查目标并条件写/去重，权威消息只有同一 ID 的一条事实。</details>

<details><summary>13. E-bad=P0:44 是永久坏输入时，可 ACK 当业务成功来降 lag 吗？</summary>

不能。按显式隔离、修复、重放与对账政策记录缺口。</details>

<details><summary>14. B 离线 25h，玩具 broker 只留 24h，从哪里补 `m-9`？</summary>

按当前成员权限和 `seq` 游标从权威数据库历史补拉。</details>

<details><summary>15. 搜索已有 `m-9:v2`，迟到 v1 可以覆盖吗？</summary>

不能。按消息当前版本和目标条件更新防倒退，并核对必要的其他效果。</details>

<details><summary>16. B 在离线期间退群，补拉可跳过权限判断吗？</summary>

不能。要按约定的当前/历史可见政策裁决，不能仅凭旧游标读私有内容。</details>

### 综合 17–22：对账、补偿与源码

<details><summary>17. 搜索文档数与权威消息数相等，就说明完全一致吗？</summary>

不能。可能同数错 ID、旧版本、多余已撤回文档或权限错误。</details>

<details><summary>18. 已发给 B 的错误提示能靠回滚 SQL 事务抹去吗？</summary>

不能。那是外部效果，需新动作纠正/告知并留下审计，而不是假装未发生。</details>

<details><summary>19. broker 旧事件已过保留，搜索又有大量缺口，应优先依什么重建？</summary>

从权威消息当前状态及删除/权限规则重建，再按稳定 ID/版本对账。</details>

<details><summary>20. `PUBLISHED` 能证明 SearchIndex 和 Notify 都无缺口吗？</summary>

不能。它只代表本题选择的 broker 发布确认阶段，两个消费者要各自检查。</details>

<details><summary>21. 固定 OpenIM 两段源码能证明它部署了教学 SQL outbox 吗？</summary>

不能。已核对的只是所述 `MsgToMQ` 返回位置与另一路 `BatchInsertChat2DB` 调用。</details>

<details><summary>22. “用户搜不到 m-9”这张事故单何时可关闭？</summary>

确认权威事实与权限，定位/修复事件或索引缺口，对账当前 ID/版本/可见性和用户查询结果，并记录验证范围与证据。</details>

## 本章完成标准与后续路径

能不看答案解释 T0–T8 每步可承诺什么，逐一处置七个故障窗口，区分重放、权威重建与外部补偿，并证明 B 在 25 小时离线后仍可按权限从权威历史补拉，才算完成第七卷综合案例。下一步按[学习路线](../../../src/docs/platform_engineering/curriculum/learning_path.md)进入 08.05「分区与再平衡」，再扩展跨节点路由、热点迁移和在途事件。学习者的真实部署、延迟与故障证据须在自己的隔离环境另行记录。
