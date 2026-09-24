---
title: 08.12 完整一致性案例：一条 IM 消息的事实、归属与恢复
icon: /assets/icons/article.svg
order: 13
date: 2026-09-24
---

[返回第八卷](./README.md) · [第七卷综合案例：07.12](../07_cache_messaging/12_cross_system_consistency_case.md) · [任务接管：08.09](./09_reliable_jobs_scheduling.md) · [成员演进：08.10](./10_membership_evolution.md) · [有界验证：08.11](./11_distributed_validation.md)

# 08.12 完整一致性案例：一条 IM 消息的事实、归属与恢复

> DeepTutor 八节初稿经技术与教学审阅后的静态课程。`u-a/u-b/u-c`、`c-a`、`m-9`、E9、N9、b1 与 C0–C9 均为**脱敏纸上教学模型**；没有运行 Go、SQL、Raft、etcd、broker、IM、故障或站点。当前 S2 仍只承诺 `200 accepted_in_memory`；未来 S3 `200 stored_in_teaching_db` 只是[教学方案](../09_backend_security/12_im_service_capstone.md)。本章选**一套明确架构**串起第八卷，不能把各章的可选模型都说成同一已部署系统。

## 一、选定架构，再写 A、B、u-c 的业务合同

虚构的 `u-a` 与 `u-b` 是会话 `c-a` 成员，已登录的 `u-c` 不是。未来教学 S3 采用 **SQL `messages/conversation_counters/outbox`** 保存 `m-9/c-a/seq9` 的权威事实和 E9 待发布意图；独立的复制协调服务**只保存 b1/网关 owner 等路由元数据**，不保存 `m-9` 正文。relay 把 E9 发往 broker P0:42，SearchIndex 与 Notify 各有消费进度；Notify 可派生设备任务 N9，网关 G1/G2 负责在线尝试。B 离线 **25 小时**，而玩具 broker 仅保留 **24 小时**事件，上线后从权威 SQL 历史按权限补拉。[07.12 各数据角色](../07_cache_messaging/12_cross_system_consistency_case.md)

```text
A 的有权发送 → SQL messages(m-9,seq9) + outbox(E9)〔同一本地事务〕
                                      ↓ relay
                                broker P0:42
                                  ↙         ↘
                           SearchIndex     Notify → N9 → G1/G2 → B 的设备
                                  SQL 权威历史 ← B 重连、授权、按 seq 补拉
复制协调服务：仅管理 b1/设备路由 owner 与代次；不代替 SQL 消息事实
```

这张图中的**Raft/etcd 元数据多数**只保护它自己的路由/owner 记录；第 08.06 章为解释共识曾另设一个“把 C9 写入 Raft 消息日志”的玩具方案，**这里不同时采用它作消息权威源**。SQL 本地 Commit 不等于 broker、搜索或设备完成，协调多数提交也不等于 SQL Commit。三个系统各有自己的故障/恢复来源。[08.06 复制日志教学边界](./06_majority_consensus.md) · [07.10 outbox 边界](../07_cache_messaging/10_transaction_outbox.md)

| 用户需求 | 本章承诺的检查点 | 明确不含什么 |
|---|---|---|
| A 当前 S2 发信 | `accepted_in_memory`；同 ID 重复即使同正文仍 409 | 持久历史、B 设备送达 |
| A 未来 S3 发信 | **拟议**本地 SQL 已知 Commit 后才 `stored_in_teaching_db` | broker/索引/通知/设备自动完成 |
| B 有权读历史 | 当前成员/可见规则 + 权威消息 ID/seq 查询 | broker 保留永远覆盖离线时长 |
| `u-c` 非成员 | 当前隐藏目标政策 404，私有正文不可泄露 | 登录即有对象权限 |
| B 收到/已读 | 设备接收回执和阅读回执分别解释 | 网关“尝试发送”就算已读 |

## 二、C0–C9：十个状态只沿这一套架构走

这里的 C 编号是**业务阶段**，不是 08.06 的 Raft 日志 index，也不是第七卷 outbox 章的 C0–C7 故障编号。C4 的 SearchIndex 与 C5 的 Notify 可并行，顺序只是方便讲解，不代表一个同步调用栈。[07.06 消息与队列角色](../07_cache_messaging/06_message_abstractions.md)

| 阶段 | 动作与稳定身份 | 本阶段确实知道什么 | 恢复来源/未知 |
|---|---|---|---|
| C0 | A 的可信身份、`c-a` 成员检查、正文限额与稳定 `m-9` ID | 请求是否获准进入写路径 | 尚未提交任何消息事实 |
| C1 | 教学 SQL 同一 `*sql.Tx` 分配 seq9、写 `messages(m-9)` 与 `outbox(evt:m-9:v1,PENDING)` 后 Commit | **仅拟议 S3** 的本地消息事实与发布意图同成同败 | Commit 回应对 A 可能未知 |
| C2 | A 收到 `stored_in_teaching_db` 或超时 | 收到成功可确认本地 Commit；超时只说明 A 不知道 | 稳定消息 ID 查 SQL，不换随机 ID 猜失败 |
| C3 | relay 发布 E9，broker 接受玩具 P0:42 | 按选定发布确认级别，broker 接纳 E9 | relay ACK 丢可能重发同一 `event_id` |
| C4 | SearchIndex 按 `message_id/version/visibility` 更新目标 | 该目标的当前版本与消费阶段可另证 | 搜索仍可能滞后、坏消息待修 |
| C5 | Notify 消费 E9，生成稳定任务 `N9=notify:u-b:d-b1:m-9:v1` | 任务意图可追踪，W1/W2 可接管 | 不代表推送提供方或设备已收到 |
| C6 | 路由元数据判 G1/G2 owner，持代次执行在线尝试 | 当前注册 owner、任务执行资格与一次网关尝试 | 旧 G1 socket 可迟到，目标要围栏/去重 |
| C7 | B 的某设备按协议报告收到，或当时离线 | 若有回执，可描述**该设备**的接收；离线则没有 | 不能由 broker/Notify ACK 伪造回执 |
| C8 | B 25h 后重连，服务按当前权限与 `seq>8` 补权威历史 | 返回页可核对 `m-9/seq9` 与当前版本 | broker 24h 保留已不足以作永久历史 |
| C9 | B 发阅读回执 | 按所选用户/设备协议解释读进度 | 不反推每台设备都收到过在线推送 |

`m-9`、`seq9`、`evt:m-9:v1`、P0:42、N9、网关 owner revision/epoch 是不同身份。它们必须可关联，不能互相替代；一条关联链缺证据时写“未知”，不把全链压成一个 `success`。C1 的 SQL 原子范围仍由数据库事务决定，而不是由 C6 的协调服务“加持”。[PostgreSQL 事务](https://www.postgresql.org/docs/current/tutorial-transactions.html)

## 三、三个裂缝：响应丢、发布重复、坏事件卡住

**裂缝一：C1 Commit 已成功但 C2 回应丢。** A 的超时不是数据库回滚。未来 S3 客户端应查询稳定 ID 或按明确新接口合同继续；当前 S2 重复同 ID 即使相同正文仍 **409**，不能为了纸上 S3 的重试便利改成隐含 200。[09.02 S2 合同](../09_backend_security/02_http_api_contract.md)

**裂缝二：C3 broker 实际接受 E9，但 relay 的发布 ACK 丢。** outbox 仍可能 `PENDING`，relay 重发相同 `evt:m-9:v1`，broker/消费者可能见两份。SearchIndex 以 `m-9` 当前版本和目标条件写收敛，Notify 用稳定 N9 及设备/渠道身份控制重复；这些设计减少**重复业务效果**，不等于网络只传一次。若先把 outbox 标 `PUBLISHED` 再发，崩溃会造成更危险的静默漏发。[07.07 ACK 与去重](../07_cache_messaging/07_ack_retry_dedup.md) · [07.10 outbox 故障点](../07_cache_messaging/10_transaction_outbox.md)

**裂缝三：同会话 E-bad 在 P0:44 坏，E11 在 P0:45。** 若搜索合同要求按会话连续效果，不能为“降低 lag”静默提交 next offset46 越过未决 44。永久坏输入进入有责任、版本与源位置的隔离；修复后重放或按权威当前状态重建。若搜索是允许暂时缺口的派生视图，必须显式标缺口与对账截止；不能把 SearchIndex 失败写成 `m-9` 权威历史丢失。[07.09 E-bad/E11](../07_cache_messaging/09_backlog_poison_messages.md)

## 四、协调多数守 owner，不替 SQL 消息投票

假设复制协调服务有纸上 R1/R2/R3 三个投票者，保存 b1 的路由 epoch 和 B 设备 owner。R1 被隔离、R2/R3 组成多数时，可按其协议处理**元数据**的合法新归属；孤立旧 R1 不能独自授予一个新 owner/路由版本。若协调服务失去多数，某些新路由/任务所有权判断必须暂停或返回结果未知，以免两个网关同时自称最新；这不意味着已经在 SQL 提交的 `m-9` 自动消失。[08.06 多数与共识](./06_majority_consensus.md)

B 原先连 G1，G1 停顿并失去租约后，B 重连 G2；G2 获得更高 owner 代次。G1 醒来时旧 TCP socket 可能仍在，目标端要在能够原子保护的副作用处比较代次，拒绝旧 G1 迟到状态写；若新代次尚未在目标安装或旧字节已直接发出，仍可能有外部重复/未知，设备去重与历史补拉各自兜底。协调表中“只一个 owner”、物理上“只一条 TCP”、B“只显示一次”是三种不同命题。[08.07 r101→r111](./07_coordination_ownership.md)

如果 C0 时连有效 b1 写 owner 都无法确定，本题写入口应按明确失败/未知合同**停止推进危险新写**，而不是让每个孤立节点自行分配 `seq9` 后都向 A 答成功。若 C1 已经真实提交，后续元数据故障优先依据 SQL/outbox 恢复事实与事件；两种时刻不能混说。[08.01 部分失败](./01_system_partial_failure.md)

## 五、b1 迁移：E9、E10 与旧事件格式都要过门

后续把 b1 从 `epoch7:N1` 移到 `epoch8:N3`。在 N1 的应用快照 `S0` 里有 `m-9:v1/seq9`，快照期间发生编辑 `m-9:v2`（**仍是 seq9**）和新消息 `m-10/seq10`，必须沿与 `S0` 配对的增量游标 `L0` 追到 N3，并对消息 ID/版本、删除/权限、计数与 outbox 意图。切换前围栏 N1 新写和旧 relay，检查 E9/E10 的生产顺序；切换后旧客户端应按路由 epoch 拒绝/重定向。数据库桶 b1 搬家不会自动把 broker P0:42/43 的日志重分区。[08.05 M0–M6](./05_partition_rebalancing.md) · [08.10 三轴演进](./10_membership_evolution.md)

教学事件线格式 `event_v2` 若新增 `message_version/visibility`，旧消费者即使能解析/忽略新增字段，也可能把迟到的 `evt:m-9:v1` 误用于覆盖权威 `m-9:v2` 或泄露不可见内容。先让消费者能安全处理旧新格式及回放，再开放新生产者，直到旧事件、隔离/修复窗口有收尾证据才移除旧分支。**事件格式 v1/v2**与**消息内容 v1/v2**、当前 HTTP S2/拟议 S3 是不同版本轴。[Protocol Buffers 兼容说明](https://protobuf.dev/programming-guides/proto3/) · [08.10 协议兼容](./10_membership_evolution.md)

若 N3 已接收新 `m-11/seq11` 又发生回退，不能简单把路由指回旧 N1/epoch7。先围栏 N3、反向追新事实、对账，再发布更高的新 epoch；否则用户可能先见 11 后退回旧历史。这与“数据库快照里有 m-9”同样是状态边界问题。[08.05 回退条件](./05_partition_rebalancing.md)

## 六、B 离线与 u-c 越权：补拉比通知更靠近事实

B 离线 **25h**，玩具 broker 只保留 **24h** E9。旧事件可能已过期，N9 可以按业务规则过期或进入修复；B 重连后仍要先验证当前 `c-a` 成员/可见政策，再按服务器 `seq` 游标从权威 SQL 历史补 `m-9`。`u-c` 虽登录却不是成员，在当前 S2 隐藏目标合同下应得到 **404**，不能由猜测 ID、旧搜索文档、旧缓存或推送载荷取得私有正文。[07.06 24/25h 反例](../07_cache_messaging/06_message_abstractions.md) · [09.07 对象授权](../09_backend_security/07_authentication_authorization.md)

若 `m-9` 被撤回或 B 在离线期间退群，历史查询与搜索要按声明的当前/历史可见规则裁决；任务生成时有权限不代表执行/补拉时仍有权限。普通日志、DLQ 与路由注册表只保留最小脱敏身份/错误，不复制聊天正文。已发到设备的错误提示不能由 SQL `ROLLBACK` 擦掉，需要新撤回/更正动作及设备侧收敛证据。[08.08 Saga 补偿边界](./08_cross_service_transactions.md)

网关一次写成功、推送提供方接受、设备收到、用户已读的证据互不替代。若 N9 的 W1 外部调用结果未知，W2 接管可能重做相同任务；目标/设备按稳定身份去重可以减少重复显示，但不能把它说成“网络恰好一次”。权威历史加授权补拉是本题离线恢复核心，在线通知只是体验路径。[08.09 可靠任务](./09_reliable_jobs_scheduling.md)

## 七、用可复核证据检查设计，再限定 OpenIM 结论

验证 C1 本地原子性，应在**未按政策清理 outbox 的窗口内**，用同一 SQL 一致快照核对 `messages(m-9)` 与相应 `outbox(evt:m-9:v1)`；对账 SearchIndex/Notify 则分别比权威 ID、当前版本、权限/删除与最老未完成年龄，并给明确期限。若为有权权威 `HistoryRead` **另外**声明线性化合同 L，记录 Send/Read 的调用和返回区间：写成功返回后才开始的读仍见 seq8 可构成反例；二者重叠时读8可能合法。S3 的本地 Commit 自身不自动声明 L。[08.11 Hbad/重叠历史](./11_distributed_validation.md) · [Herlihy–Wing 论文](https://www.cs.cmu.edu/~wing/publications/HerlihyWing90.pdf)

故障注入要证明实际作用到目标链路：隔离元数据多数、丢 C2 回应、延迟 E9、暂停 G1/N9 的 W1、让 N3 切流，各自记录注入开始/生效/结束、端点路由、权威事实和结果。脚本返回 0 不是“业务保证已通过”；静态讲义更不能替代任何一次实测。报告保留版本、提交 SHA、随机种子、脱敏原始调用历史、检查器模型和未覆盖条件。[08.11 有界验证](./11_distributed_validation.md)

固定 `openimsdk/open-im-server` 提交 `f6411a8a1a31d3df36f4c2b3ad28481a94141e1f` 的 [`send.go` 所述发送路径](https://github.com/openimsdk/open-im-server/blob/f6411a8a1a31d3df36f4c2b3ad28481a94141e1f/internal/rpc/msg/send.go#L46-L70)调用 `MsgToMQ` 后返回；[另一路 MongoDB 消费处理](https://github.com/openimsdk/open-im-server/blob/f6411a8a1a31d3df36f4c2b3ad28481a94141e1f/internal/msgtransfer/online_msg_to_mongo_handler.go#L43-L69)调用 `BatchInsertChat2DB`。这两段只支持这两处调用/返回位置，不证明本章 SQL 表、Raft/etcd 元数据、N9、快照/迁移、线性化读或 B 的送达行为已经在 OpenIM 中实现。真实源码对照与运行证据须逐项继续取得，未知格保持未知。[OpenIM 阅读地图](../im_reference.md)

## 八、第八卷交付：一张状态图、八类故障与 22 题

交付本章这**一套**架构的 C0–C9 状态图，写清每段权威/派生/临时角色；再交八类故障的“症状→已知/未知→权威源→重试/补偿→验收证据”表，以及 b1/事件协议的准入与回退门。下列题目先独立预测，再展开答案。

### 基础 1–8：找到真正的权威

<details><summary>1. 本章谁保存 `m-9` 的权威聊天事实？</summary>

仅未来教学 S3 的 SQL 消息事务；当前 S2 尚没有这个持久承诺。</details>

<details><summary>2. 复制协调服务的多数提交能证明 SQL 已保存 m-9 吗？</summary>

不能。它在本章只保护路由/owner 元数据，SQL Commit 要另证。</details>

<details><summary>3. C1 同一本地事务保存哪两类记录？</summary>

`messages(m-9,c-a,seq9)` 与 `outbox(evt:m-9:v1,PENDING)`，以及必要的同库计数状态。</details>

<details><summary>4. C3 broker 接受 E9 能证明 B 已读吗？</summary>

不能。搜索、通知、设备收到和阅读各有后续证据。</details>

<details><summary>5. N9 与 `m-9` 是同一 ID 吗？</summary>

不是。N9 是针对 B 设备的稳定提示任务，`m-9` 是权威消息身份。</details>

<details><summary>6. 当前 S2 相同消息 ID、相同正文重复 POST 是多少？</summary>

409；本章没有把它暗改成幂等 200。</details>

<details><summary>7. `u-c` 已登录但非 c-a 成员，知道 m-9 ID 能读正文吗？</summary>

不能。当前隐藏目标政策是 404，对象授权仍是门。</details>

<details><summary>8. 本章还采用 08.06 的独立 Raft 消息日志作 m-9 权威吗？</summary>

不采用。Raft/etcd 类服务在本章只管 owner/路由元数据。</details>

### 故障 9–16：每一步找恢复来源

<details><summary>9. C1 Commit 成功、C2 回应丢，A 能断言消息未保存吗？</summary>

不能。按稳定业务 ID 查权威 SQL；超时是 A 的结果未知。</details>

<details><summary>10. C3 broker 接受 E9 但 relay ACK 丢，下一次可能怎样？</summary>

同一 `evt:m-9:v1` 被重发，消费者按 ID/版本幂等，不能宣称只投一次。</details>

<details><summary>11. E-bad=P0:44 未决时静默提交 next offset46 有何风险？</summary>

恢复越过坏事件，必要搜索效果可能无记录地缺失。</details>

<details><summary>12. G1 租约失效后旧 socket 还在，能代表 G1 仍是 owner 吗？</summary>

不能。须按协调域当前代次与目标端围栏判断，外部尝试另证。</details>

<details><summary>13. 元数据复制组只剩少数一侧，可自行分配新 b1 owner 并向 A 承诺写成功吗？</summary>

不应。无合法多数不能按该协议授予新归属；先区分 C0 未提交与 C1 已提交事实。</details>

<details><summary>14. S0 只有 `m-9:v1`，迁移中产生 v2 与 m-10，可直接切给 N3 吗？</summary>

不可。追 `L0` 后增量，核对版本、seq、权限与 outbox，围栏旧写再切。</details>

<details><summary>15. B 离线 25h 超过玩具 broker 24h 保留，如何取回 m-9？</summary>

按当前权限从权威 SQL 历史用 seq 游标补拉。</details>

<details><summary>16. 已发错误提示后 SQL ROLLBACK 能抹掉 B 曾看到它吗？</summary>

不能。要以新的撤回/更正动作和设备侧证据处理。</details>

### 评审 17–22：别把局部通过写成全局正确

<details><summary>17. 数据库 b1 搬迁会自动搬 Kafka P0:42 的旧 E9 吗？</summary>

不会。存储路由与 broker 分区是不同映射。</details>

<details><summary>18. 事件格式新字段能被旧程序解析/忽略，就能保证权限语义安全？</summary>

不能。旧消费者可能忽略当前版本/可见性，须审真实处理逻辑和混部顺序。</details>

<details><summary>19. S3 已知 Commit 后权威读返回 seq8，必然违反现有 S3 合同吗？</summary>

不必然。S3 只声明本地提交；只有另声明适用于该读端点的 L 等合同，才按其历史判。</details>

<details><summary>20. `SearchIndex` 已追上就证明 B 的设备已收到？</summary>

不能。派生索引与设备/阅读是独立确认链。</details>

<details><summary>21. 固定 OpenIM 两处源码足以证明本章 SQL+etcd+N9 架构吗？</summary>

不能。仅核对所述发送入队返回与另一 MongoDB 消费调用。</details>

<details><summary>22. 综合事故单何时可关闭？</summary>

按已声明的用户合同逐项核对权威 ID/版本/权限、outbox 与派生目标、N9/设备、离线补拉、迁移和剩余未知，留下范围与修复证据。</details>

## 本章完成标准与后续路径

能不看答案画出 C0–C9 和三套系统各自的确认范围，解释响应丢、重复事件、坏消息、旧 owner、元数据少数、b1 搬迁、离线补拉与权限变化的恢复来源；能拒绝把一项静态/局部检查写成全链已送达，才算完成第八卷。学习者真实环境的源码追踪、故障历史和用户体验证据仍需另行取得。下一步按[学习路线](../learning_path.md)进入 09.09「异步与长任务」，把状态查询与取消落实到面向客户端的 API 合同。
