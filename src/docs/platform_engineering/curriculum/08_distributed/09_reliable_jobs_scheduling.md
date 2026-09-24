---
title: 08.09 可靠任务与调度：通知重试如何不冒充送达
icon: /assets/icons/article.svg
order: 10
date: 2026-09-24
---

[返回第八卷](./README.md) · [确认与去重：07.07](../07_cache_messaging/07_ack_retry_dedup.md) · [积压与坏消息：07.09](../07_cache_messaging/09_backlog_poison_messages.md) · [协调与归属：08.07](./07_coordination_ownership.md) · [跨服务事务：08.08](./08_cross_service_transactions.md)

# 08.09 可靠任务与调度：通知重试如何不冒充送达

> DeepTutor 八节初稿经技术与教学审阅后的静态课程。通知任务 N9、W1/W2、5 秒租约、token 41/42 与“三次总尝试”均为**脱敏纸上模型**；没有运行 Go、PostgreSQL、broker、推送提供方、IM 或站点。当前 S2 仍只承诺 `accepted_in_memory`；未来 S3 的 `stored_in_teaching_db` 是[教学合同提议](../09_backend_security/12_im_service_capstone.md)。本章任务表与调度器不是已核对的 OpenIM 实现。

## 一、N9 是一次工作意图，不是第二条聊天消息

承接未来教学 S3：`u-a` 在 `c-a` 发送权威消息 `m-9/seq9`，同库事务写 outbox 事件 E9。随后业务可能为 `u-b` 的设备 `d-b1` 生成一个**在线/离线提示任务** N9：`task_id=notify:u-b:d-b1:m-9:v1`。任务是“有条件尝试一项后续工作”的记录；它失败、过期或进入修复，不会让已提交 `m-9` 自动消失。SearchIndex 是另一条派生链，B 的权威历史仍按权限从消息库查询。[07.10 本地 outbox](../07_cache_messaging/10_transaction_outbox.md) · [07.12 历史与提示](../07_cache_messaging/12_cross_system_consistency_case.md)

先把身份拆开：`m-9` 是业务消息 ID；`evt:m-9:v1` 是消息事件 ID；N9 的 `task_id` 决定“这是不是同一个设备提示工作”；`attempt_id=A1/A2` 只标每次执行尝试。W1 失败后 W2 重试**同一 task_id**，不能换随机任务 ID 伪装成新工作。若 `m-9` 后来合法编辑为 v2，是否再通知、通知哪个设备，是新的业务规则；如果要发，必须使用可区分的版本身份，不能把 v2 当 v1 的无意义重复。[07.07 消息版本与去重](../07_cache_messaging/07_ack_retry_dedup.md)

| 身份/状态 | 回答的问题 | 不回答的问题 |
|---|---|---|
| `m-9,c-a,seq9` | 权威历史中是哪条消息 | 哪次通知尝试已成功 |
| `evt:m-9:v1` | 哪个已提交事实的处理事件 | 哪个设备收到了字节 |
| `task_id=N9` | 对 B 的 d-b1 是否同一个逻辑提示任务 | 一共发生多少次网络发送 |
| `attempt_id=A1/A2` | 哪次 worker 执行及错误阶段 | 是否产生了新聊天消息 |

## 二、持久任务状态机：把“完成”命名到确切边界

任务表最少保存稳定 `task_id`、权威 `message_ref/version`、目标设备/渠道、状态、计划时间、尝试次数、当前 owner 与单调 `lease_token`、租约期限、最后错误类别和修复责任；不要把私有正文无界复制到任务正文或死信日志。业务入队源仍要可靠：若由 E9 消费生成 N9，创建任务的幂等键必须能吸收重复 E9；若 E9 从未发布，07.10 的 outbox/对账先找回发布意图。[07.09 DLQ 与隐私](../07_cache_messaging/09_backlog_poison_messages.md)

```text
READY → LEASED(owner=W1, token=41, attempt=A1, lease=5s)
             ├→ PROVIDER_ACCEPTED    // 已知推送提供方按其合同接受请求
             ├→ RETRY_AT(t)          // 暂时失败，按计划再试
             ├→ REPAIR_REQUIRED      // 永久坏输入或总预算耗尽
             └→ CANCELED             // 明确的业务取消/权限政策
```

`PROVIDER_ACCEPTED` 是**这条教学任务的外部调用阶段**，不等于 B 设备已收到或已读。若提供方只是“排队受理”，也不能宣称消息已展示；真正需要送达保证时，设备应用回执要有自己的记录。任务状态可能与设备状态并行演进，不能把设备是否在线塞进一个无解释的 `SUCCESS`。每次状态转移需检查当前状态、owner token 与业务版本，拒绝旧工作者迟到写。[07.12 T5–T8](../07_cache_messaging/12_cross_system_consistency_case.md)

## 三、W1/W2 领取与租约：短锁不能跨过外部请求

教学 SQL 任务表可让多个 worker 在短事务中领取 `READY/到期 RETRY_AT` 的行。PostgreSQL `SELECT ... FOR UPDATE SKIP LOCKED` 是**队列式争抢的一种候选手段**：它跳过别的事务锁住的行，减少领取竞争；在同一短事务里把 row 改为 `LEASED(owner=W1,token=41,lease_until=...)` 后提交。它不把行锁维持到外部推送完成，也不自动回收崩溃 worker；租约和条件更新仍须设计。官方文档还提醒 `SKIP LOCKED` 给出不一致视图，不适合普通全局查询。[PostgreSQL SELECT 锁子句](https://www.postgresql.org/docs/current/sql-select.html)

设 W1 持 **5 秒**教学租约，却在调用提供方时卡住。租约过期后 W2 通过任务行的**原子条件更新**领取同一个 N9，持更高的持久 `lease_token=42`，尝试 ID 为 A2。W1 随后恢复，若要标 `PROVIDER_ACCEPTED`，SQL 端应检查 token 仍是 41；现在行已是 42，便拒绝 W1 的迟到状态写。token 必须由任务协调状态持久单调分配，不能让 W2 的本地内存自行宣称一个“更大”数。[08.07 旧 owner 围栏](./07_coordination_ownership.md)

**拒绝 W1 改任务行**并不撤回它在提供方已经发生的推送。若外部目标能原子比较代次，可以在那里再围栏；若不能，按稳定 N9 请求 ID 利用提供方的幂等能力（**若该提供方确实提供并配置了这一能力**），或让设备按消息 ID/版本去重，并清楚承认网络上仍可能出现重复。租约维持的是“谁应负责继续尝试”，不是全世界副作用恰好一次的证明。

## 四、结果未知：先标完成会漏，后标完成会重

固定一次 A1 故障：W1 向推送提供方发 N9，**提供方可能已经接受**，但回应丢失；W1 的本地调用超时，此时既不能写“确定失败”，也不能写 `PROVIDER_ACCEPTED`。任务仍在 `LEASED/结果未知`，租约到期后 W2 可能以 A2 重试。A2 使用同一 `task_id`、原消息版本和目标设备；提供方是否按该键去重取决于其真实协议，不能由我们的任务表替它承诺。[08.01 超时与部分失败](./01_system_partial_failure.md)

| 更新顺序 | 故障窗口 | 用户会看到的风险 |
|---|---|---|
| 先标 `PROVIDER_ACCEPTED`，再调用提供方 | 标记后、调用前崩溃 | 调度器以为已完成，实际一次也没尝试 |
| 先调用提供方，再标 `PROVIDER_ACCEPTED` | 提供方接受后、标记前崩溃/回应丢 | W2 可重做 N9，可能重复提示 |

选择“外部已知接受后才标”把漏尝试风险转成可管理的重复/未知风险，仍要以目标幂等、业务容许重复和对账收敛。Go `context.WithTimeout` 可让本地任务不再等待、释放相关资源，但取消函数**不会把提供方已完成的远程效果自动回滚**；`context` 的取消是协作信号，不是跨系统原子事务。[Go context 文档](https://pkg.go.dev/context)

若 B 实际离线，可能根本没有即时投递通道；任务可按产品规则记 `SKIPPED_OFFLINE` 或改为离线通知尝试，但不可由此写 `DEVICE_RECEIVED`。B 离线 **25 小时**、玩具 broker 仅保留 **24 小时**时，授权历史补拉仍从权威消息数据库走，不依赖 N9 是否保留或成功。[07.06 保留与离线补拉](../07_cache_messaging/06_message_abstractions.md)

## 五、三次总尝试只是预算，坏任务还要有人修

本题设**最多三次总处理尝试，包含第一次**，且给总处理期限；数字只供练习，不是生产推荐。把错误分为三类：临时网络/依赖故障可在预算内退避、抖动并重试；永久无效目标/版本/权限不靠原样重试修好，转 `REPAIR_REQUIRED` 或明确取消；提供方结果未知先查可得的目标回执/幂等记录，不无条件发一个全新身份。每次 `attempt_id` 记录“是否领取、是否真正调用、结果已知/未知”，因为 worker **领取后尚未调用就崩溃**，已消耗一次调度机会，却不等于外部发生一次推送。[07.09 重试预算与错误分类](../07_cache_messaging/09_backlog_poison_messages.md)

预算耗尽时保留脱敏 `task_id/message_id/version/device_id`、错误阶段、首次/最近时间、已知与未知结果、责任人、下一动作；不把 N9 从队列里 ACK 成“B 已送达”，也不让它无限快重试扩大积压。修复完成后按当前权威消息版本、撤回/删除和成员权限重新评估；旧 `m-9:v1` 任务不能在当前已是 v2 或对方无权查看时把私有正文重新推送。必要时重建一项新版本任务，并明确它与 N9 的关系。[09.07 对象权限](../09_backend_security/07_authentication_authorization.md)

如果业务允许在线提示在 B 离线时过期，可以把 N9 **有记录地**标 `CANCELED/SKIPPED_OFFLINE`，同时维持权威历史与有权补拉。过期的是“此刻弹窗”意图，不是 `m-9` 这条聊天事实。若需求要求多端通知/未读数最终收敛，还需各自持久任务或从权威状态重建，不能借一个 N9 的完成状态代表所有设备。

## 六、容量、公平与顺序：多开 worker 不是免费修复

若 `c-g` 热群持续产生大量通知任务，调度器即使总处理 TPS 很高，`c-a` 的 N9 也可能在队列尾等待过久。至少按目标/会话/渠道观察 `READY` 与 `RETRY_AT` 数量、**最老未完成年龄**、领取速率、完成/未知/修复率和提供方限流；设置有界在途数、分键或优先级预算，避免重试风暴挤掉新任务。公平策略需说明谁先处理、谁可能饥饿，而不是只调大 goroutine 数。[07.09 积压与最老年龄](../07_cache_messaging/09_backlog_poison_messages.md)

同一设备对 E9 与 E10 的提示若承诺按 `seq9→seq10` 展示，两个 worker 并行调用可能让 E10 先到。可以按设备/会话键串行、设目标端版本条件或明确允许提示乱序后由历史页面按 seq 排列；**提示顺序政策**与**权威消息历史顺序**分开。Go worker 的取消与 deadline 有助于本机有界资源使用，不能替代分布式目标围栏、租约续期和外部重试去重。[07.08 顺序消费](../07_cache_messaging/08_order_concurrent_consumption.md) · [05.08 并发组合](../05_runtime/08_concurrency_composition.md)

撤回或成员变化会让 N9 的目标/内容政策改变。执行前应核对当前可见规则；已发推送不能靠将任务状态改为 `CANCELED` 就从设备屏幕消失，需新撤回/更正动作和目标侧收敛证据。任务表最小化敏感载荷、设置保留/清理与修复窗口，避免将私有正文长期滞留在调度日志。[08.08 补偿边界](./08_cross_service_transactions.md)

## 七、值班对账：从任务行追到提供方，再回到权威消息

一条能定位 N9 的运维记录至少关联：权威 `m-9` 与当前版本/权限、E9 的 outbox/发布状态、N9 的状态与最老年龄、A1/A2 的 owner token 和阶段、提供方请求/回执身份、设备接收/阅读以及 B 的历史游标。看到 `PROVIDER_ACCEPTED` 高但用户仍抱怨，应检查设备协议与目标路由；看到 N9 长期 `LEASED`，看 worker 心跳、租约过期/认领和条件更新；看到 `REPAIR_REQUIRED`，沿错误分类修规则/数据再受控重放。[11.03 日志、指标与 Trace](../11_reliability/03_logs_metrics_traces.md)

固定 `openimsdk/open-im-server` 提交 `f6411a8a1a31d3df36f4c2b3ad28481a94141e1f` 中，[`send.go` 所述发送路径](https://github.com/openimsdk/open-im-server/blob/f6411a8a1a31d3df36f4c2b3ad28481a94141e1f/internal/rpc/msg/send.go#L46-L70)调用 `MsgToMQ` 后返回；[另一路 MongoDB 消费处理](https://github.com/openimsdk/open-im-server/blob/f6411a8a1a31d3df36f4c2b3ad28481a94141e1f/internal/msgtransfer/online_msg_to_mongo_handler.go#L43-L69)调用 `BatchInsertChat2DB`。这两段没有展示本章 N9 任务表、W1/W2 租约或推送提供方幂等协议；不能把纸上状态机写成 OpenIM 已部署。真实项目对照须继续追消息推送、网关、任务来源及配置/失败分支，保持未知格为未知。[OpenIM 阅读地图](../im_reference.md)

## 八、交付状态图与 22 道分层练习

第一遍画 N9 身份与 `READY→LEASED` 领取条件；第二遍填 W1/W2 的“外部可能接受→回应丢→租约接管”时间线、两种标记顺序的故障表、三类错误/三次总尝试以及最老年龄和权限修复矩阵。若尚无隔离运行环境，真实成功率和提供方幂等能力均写“待验证”。

### 基础 1–8：先认任务与阶段

<details><summary>1. N9 是新的聊天消息吗？</summary>

不是。它是围绕权威 `m-9` 对设备 `d-b1` 的一个通知工作意图。</details>

<details><summary>2. W2 重试 N9 时应换随机 `task_id` 吗？</summary>

不应。逻辑任务仍是 N9；另用 `attempt_id=A2` 记录新尝试。</details>

<details><summary>3. `PROVIDER_ACCEPTED` 能证明 B 已读吗？</summary>

不能。它最多证明所选提供方按其合同接受请求；设备收到/阅读另证。</details>

<details><summary>4. 任务行只记录 `message_ref` 而非私有正文，权威正文在哪里？</summary>

在受保护的权威消息存储；执行时按当前权限和版本读取必要内容。</details>

<details><summary>5. `SELECT FOR UPDATE SKIP LOCKED` 会跨提供方网络调用持锁吗？</summary>

不会。教学方案只在短领取事务内使用，后续靠持久 owner/token/lease 协调。</details>

<details><summary>6. W1 的 token41 与 W2 的 token42 由谁保证顺序？</summary>

由持久任务协调状态的原子条件更新分配，不能只靠工作者本地计数。</details>

<details><summary>7. 当前 S2 的内存 200 已保证 N9 和权威历史持久吗？</summary>

没有。S2 只 `accepted_in_memory`；S3 DB 提交还是拟议教学合同。</details>

<details><summary>8. SearchIndex 完成能代替 N9 的通知结果吗？</summary>

不能。搜索与设备提示是独立派生目的。</details>

### 故障 9–16：结果未知与接管

<details><summary>9. W1 先标 `PROVIDER_ACCEPTED`，再调用前崩溃，风险是什么？</summary>

调度器误以为已尝试，实际可能一次也未调用，形成漏提示。</details>

<details><summary>10. W1 外部调用已被接受、标记前崩溃，W2 接管有什么风险？</summary>

同一 N9 可被再次调用，若提供方/设备无幂等处理可能重复提示。</details>

<details><summary>11. 提供方回应丢失，W1 能断言没发送吗？</summary>

不能。结果未知，先查可得目标记录，受控重试同一任务身份。</details>

<details><summary>12. W2 token42 已接管，W1 token41 可以更新任务为完成吗？</summary>

不能。任务行条件更新须拒绝过期 token；已发生外部动作仍要另查。</details>

<details><summary>13. Go `context.WithTimeout` 能撤销远端已接纳推送吗？</summary>

不能。它让本地放弃/取消协作工作，不是远端效果的 rollback。</details>

<details><summary>14. 本题“三次总尝试”包含首次吗？</summary>

包含。超过预算进入可追踪修复状态；领取后未调用也应在尝试记录中标清。</details>

<details><summary>15. 永久坏目标可无限快速重试等待自愈吗？</summary>

不应。隔离/取消并修目标或规则，避免占用容量且保留责任。</details>

<details><summary>16. B 离线 25h，玩具 broker 仅留 24h，N9 无法弹窗会让消息消失吗？</summary>

不会。B 仍应按当前权限从权威消息历史按 `seq` 补拉。</details>

### 评审 17–22：版本、容量与源码

<details><summary>17. `m-9` 已编辑为 v2，旧 v1 任务可无条件推正文吗？</summary>

不可。执行前按当前版本、撤回/删除和授权规则核对。</details>

<details><summary>18. B 已非 `c-a` 可见成员，旧 N9 能绕过对象授权吗？</summary>

不能。任务生成时的旧资格不替代执行时的当前业务裁决。</details>

<details><summary>19. `c-g` 热任务使 N9 最老年龄持续变大，只增 worker 就必然解决吗？</summary>

不必然。还要看单键顺序、提供方限流、重试占用和公平/在途预算。</details>

<details><summary>20. 把 N9 标 `CANCELED` 能收回已发到设备的字节吗？</summary>

不能。已发生外部效果需新更正/撤回与设备侧收敛证据。</details>

<details><summary>21. 固定 OpenIM 两段源码能证明它实现 N9 任务表与 token42 吗？</summary>

不能。它们只证明所述发送入队返回与另一 MongoDB 消费路径。</details>

<details><summary>22. 值班如何证明“通知链已修复”，而非只清掉队列？</summary>

按 `m-9/E9/N9/A1/A2` 关联权威消息、任务状态、提供方结果、设备回执和授权补拉；记录剩余未知、缺口与修复证据。</details>

## 本章完成标准与后续路径

能不看答案解释任务与消息身份、两种标记顺序各自的崩溃反例、W1/W2 token 围栏为何不能撤回外部推送，以及三类错误/三次总尝试/设备补拉各自的责任，才算完成第一轮。真实实践要记录提供方幂等协议、任务表并发、失败注入、最老年龄和设备结果，本页没有代替执行。下一章 [08.10 成员变化与演进](./10_membership_evolution.md) 将继续讨论成员变化、快照和滚动迁移中的新旧状态解释。
