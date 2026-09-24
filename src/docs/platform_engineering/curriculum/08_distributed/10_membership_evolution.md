---
title: 08.10 成员变化与演进：新旧节点怎样共同处理 m-9
icon: /assets/icons/article.svg
order: 11
date: 2026-09-24
---

[返回第八卷](./README.md) · [复制与读前置：08.03](./03_replication_goals_costs.md) · [分区迁移前置：08.05](./05_partition_rebalancing.md) · [多数前置：08.06](./06_majority_consensus.md) · [派生重建前置：07.11](../07_cache_messaging/11_derived_views_event_time.md)

# 08.10 成员变化与演进：新旧节点怎样共同处理 m-9

> DeepTutor 八节初稿经技术与教学审阅后的静态课程。R1–R4、N1/N3、`b1`、`m-9/m-10`、事件格式 `event_v1/v2`、快照与故障都是**脱敏纸上模型**；没有运行 Raft、etcd、Go、数据库、消息系统、迁移或站点。当前 S2 仍是 `accepted_in_memory`；未来 S3 的 `stored_in_teaching_db` 仍是[教学合同提议](../09_backend_security/12_im_service_capstone.md)。本章不声称 OpenIM 采用这些变更流程。

## 一、同一次“升级”其实改了三套不同规则

虚构 IM 的桶 **b1** 承载 `c-a` 和热点 `c-g`，旧存储所有者为 N1。未来教学 S3 中 `m-9/c-a/seq9` 已成为权威事实；搬迁期间 `m-9` 被编辑为 **v2**，又产生 `m-10/seq10`。团队想把 b1 交给 N3，还想升级事件格式，并增加复制组成员。若一句“先部署新节点再切流”不区分对象，评审者根本不知道何时可读、何时可写、谁投票以及旧消费者能否正确理解新事件。[08.05 b1 搬迁](./05_partition_rebalancing.md)

| 版本轴 | 旧→新 | 负责什么 | 不能替代什么 |
|---|---|---|---|
| Raft 投票配置 | `C_old={R1,R2,R3}` → `C_new={R2,R3,R4}` | 哪些复制节点可参与选举/提交 | 不自动搬走 b1 的 SQL 消息数据 |
| 应用路由 | `epoch7: b1→N1` → `epoch8: b1→N3` | 哪个存储节点接受会话写/读 | 不修改 Kafka P0 的旧 offset |
| 事件协议 | 教学 `event_v1` → `event_v2` | 新旧生产者/消费者如何解释字段 | 不改变当前 HTTP S2 或拟议 S3 成功语义 |

`m-9` 的业务 ID、`seq9`，Raft `index12`，broker P0:42 与路由 epoch8 是五种编号；各自由不同系统分配。第一遍先把三轴与业务用户可见结果对上；第二遍再讨论重叠时间、快照增量、回退和字段兼容。[08.02 时间与顺序](./02_time_order.md)

## 二、投票配置的交集：旧新两个多数不能各自任性行动

在独立的 Raft 教学复制组里，`C_old={R1,R2,R3}` 与 `C_new={R2,R3,R4}` 各有 3 个投票者，多数均为 2。若部分节点直接按旧配置决策，另一些直接按新配置决策，旧组 `{R1,R2}` 与新组 `{R3,R4}` **可能没有共同节点**；仅说“两边都是 2/3”不能防两个独立决定。Raft 原论文采用**联合配置**过渡：联合阶段的选举与日志提交须分别满足旧集合与新集合的多数，待联合配置被提交，再提交最终新配置；不能让每台机器随意先后改本地多数分母。[Raft 论文：成员变化](https://raft.github.io/raft.pdf)

| 纸上阶段 | 可用于决定的门槛 | 对客户端含义 |
|---|---|---|
| 只有 `C_old` | 旧组任意 2/3 | 仍按旧成员配置处理 |
| `C_old,new` 联合过渡 | **旧组 2/3 且新组 2/3** | 需要可核对的共同决议，不能两套组各自确认冲突 |
| `C_new` 最终配置 | 新组任意 2/3 | 只有在协议确认最终配置后才按新组独立处理 |

另一层要分开：etcd 的 **learner（非投票成员）**可先加入、追上领导者日志，再由操作/协议提升为投票成员；官方文档说明未追上时 promotion 会失败。它是一个具体产品的成员操作与安全检查，**不能把 etcd 的某条命令直接等同于上面 Raft 论文完整的联合配置时序**。初学者应问“现在 R4 是投票者吗？旧新多数如何算？配置决议已提交吗？”而非看进程已经启动就把它算进 quorum。[etcd learner 设计](https://etcd.io/docs/v3.6/learning/design-learner/) · [etcd 成员变更操作](https://etcd.io/docs/v3.6/op-guide/runtime-configuration/)

## 三、Raft `InstallSnapshot` 与 IM 数据回填不在同一坐标系

假设复制组的已提交并已应用前缀做到 **Raft index12、term4**，落后的 R4 只有到 index8。Raft 快照可保存状态机在 index12 的状态，并带 `lastIncludedIndex=12,lastIncludedTerm=4`，让 R4 安装后继续追 index13 起的日志。快照只覆盖**已经提交且应用的前缀**，不把 index13 的未提交工作提前写成确定事实；索引与任期元数据让后续日志匹配仍能定位边界。Raft 论文说明领导者在所需旧日志已被截断时可向落后副本发送快照。[Raft 论文：快照与 InstallSnapshot](https://raft.github.io/raft.pdf)

这与 **b1 的应用数据库搬迁**不同。N1→N3 需为 b1 的权威消息、会话计数、当前成员规则、outbox 意图及必要版本，取得一致快照 `S0` 和**与之配对**的可续读变更位置 `L0`；复制 `S0` 时仍发生的 `m-9:v2` 编辑和 `m-10/seq10` 要从 `L0` 后的变更追上。`c-a seq9` 只标某会话历史位置，不是整个 b1 的数据库变更游标；Raft `lastIncludedIndex12` 更不能代替 `L0`。这两类快照都要校验完整性和追赶，但保护的是不同状态机。[07.11 S0/L0 重建](../07_cache_messaging/11_derived_views_event_time.md) · [08.05 M0–M6](./05_partition_rebalancing.md)

| 快照 | 包含的状态 | 后续追什么 | 常见误推 |
|---|---|---|---|
| Raft `index12/term4` | 该复制组已应用的状态机前缀与配置 | index13 以后合法日志 | “所以聊天库全部搬完” |
| 应用 b1 `S0/L0` | b1 范围的权威业务行/版本/权限与 outbox | 与 `L0` 无缝衔接的提交变化 | “只看 `c-a seq9` 就能证明整个 b1 齐全” |

## 四、事件格式兼容：能解析不等于能安全执行

给一个**明确是课程提议、不是 OpenIM 真实 schema**的事件升级：`event_v1` 只有 `message_id` 与会话 `seq`；`event_v2` 新增 `message_version` 与 `visibility`。这里 `event_v1/v2` 是**事件格式版本**，`m-9:v1/v2` 是**同一消息的业务版本**；稳定事件 ID `evt:m-9:v1` 中的 v1 指消息版本，三者不能凭相同数字互换。假设 Protobuf 二进制新增字段沿用新字段号，旧程序通常能解析并忽略它们，属于**线格式可读**；但旧 SearchIndex 若忽略 `message_version`，迟到的 `m-9:v1` 仍可能覆盖已索引的 v2，忽略 `visibility` 还可能泄露当前不应可见的正文。能 parse 不是业务语义安全。[Protocol Buffers：更新消息类型](https://protobuf.dev/programming-guides/proto3/)

Proto 字段编号用于线格式识别；已使用编号不能随意改或重用，删除后的编号/名称应按官方规则保留。二进制旧程序可以保留未知字段，但经 ProtoJSON 转换或手工逐字段复制又可能丢失未知字段，所以“上游加可选字段”也要看**全链路转码与业务判断**。若新字段对安全或版本正确性是必需的，不能仅靠旧程序“忽略未知字段”的 wire 兼容性放行。[Protocol Buffers：字段号与未知字段](https://protobuf.dev/programming-guides/proto3/)

教学滚动顺序可写成**扩展→迁移→收缩**：先部署能同时理解旧事件和新字段的新消费者，旧 `event_v1` 缺版本时从权威消息查询/按明确安全默认规则处理；确认旧消费实例已退场且回放/隔离数据能被新逻辑解释后，再让生产者发 `event_v2`；保留双读直到日志保留期、DLQ 重放与派生对账窗口闭合，再删除旧分支。若新增语义无法给旧消费者安全默认值，应使用明确的版本隔离或停旧流量/迁移门槛，不能强推同一事件通道。**事件 `v1/v2` 与 HTTP S2/S3 接口版本、待审 R9 的 6→9 字节需求不是同一版本轴。**[09.02 当前 HTTP 合同](../09_backend_security/02_http_api_contract.md) · [09.12 S3 提议](../09_backend_security/12_im_service_capstone.md)

## 五、m-9 编辑与 E10 在途：切流前后各有一个门

沿 08.05 的 b1 搬迁补一条具体时间线。旧 owner `epoch7:N1`；应用快照 `S0` 中 `c-a` 有 `m-9:v1,seq9`。复制期间 N1 仍按本题规则提交 `m-9:v2` 编辑（**仍占 seq9**）与新消息 `m-10,seq10`，相应变更必须进入 `L0` 之后的增量。N3 不能只凭快照中的 `m-9:v1` 开始服务，否则编辑被倒退、`m-10` 缺失。新旧应用二进制混部期间，事件生产/消费还必须满足第四节的协议兼容门。[08.05 存储迁移](./05_partition_rebalancing.md)

| 迁移阶段 | b1 写权与数据 | E9/E10 与协议 | 可切换的证据 |
|---|---|---|---|
| M0 | N1 是唯一有效 owner，`S0` 含 `m-9:v1/seq9` | 旧事件/消费者仍可运行 | 快照边界和数据范围已记录 |
| M1 | N3 装载 `S0`，追 `L0` 后的 v2 编辑和 `m-10/seq10` | 新消费者先具备双读/安全版本规则 | 增量未断档，旧新身份/版本可解释 |
| M2 | N3 追平并按 ID、seq、版本、删除/权限、outbox 对账 | `evt:m-9:v1` 的迟到重放不能覆盖权威 `m-9:v2` | 差集/版本缺口在允许范围内且有修复责任 |
| M3 | 围栏 N1 新写与旧 relay，发布 `epoch8:b1→N3` | 新事件发布仍须同会话顺序与稳定 ID | 单写者、在途任务交接与路由切换已核对 |
| M4 | 旧客户端命中 N1 时按版本重定向/拒绝，结果未知先查稳定 ID | broker P0:42 的 E9 与 P0:43 的 E10 不因 DB 桶迁移自动换分区 | 旧路由拒绝、无双主、派生目标继续追上 |
| M5 | 保留旧拷贝/回退证据后受控清理 | 老事件/隔离重放窗口已处理 | 业务读/权限和补拉对账闭环 |

`E9=P0:42`、`E10=P0:43` 是前章**已假定有序的玩具日志位置**，不意味着两个 relay 在迁移中自然按 seq 发布。复制 outbox 后旧新 relay 还可能重复发同一 `evt:m-9:v1`；需交接发布所有权、稳定事件 ID 和消费者幂等。B 设备收到或已读仍须独立证据，不能从 M3 路由切换成功倒推出用户体验已收敛。[07.08 顺序消费](../07_cache_messaging/08_order_concurrent_consumption.md) · [07.10 双 relay](../07_cache_messaging/10_transaction_outbox.md)

## 六、失败与回退：新节点已收写时不能回到旧 epoch

若 R4 尚未追平复制组日志，不能凭“进程能启动”就把它当投票者；若新配置的 peer 地址或网络有错，贸然改变成员数可能失去可用多数。按具体产品的 learner/promote 检查推进、一次变更后观察，再继续；**这是协调复制组的运维**，不是 b1 应用数据迁移。[etcd 成员操作与失败例](https://etcd.io/docs/v3.6/op-guide/runtime-configuration/)

若 Raft 快照分块传输中断，接收端要按快照身份、index/term 与完整性规则重试/清理半成品，不能用部分状态机对外服务；若 b1 `L0` 增量断档或版本对账不合格，N3 不得切为权威，需重新获得一致 `S0/L0` 或按可证明的回填方案修复。对账至少比较消息 ID 集合、会话 seq 缺口、当前版本、撤回/删除与成员可见、outbox 状态；“两边记录数相同”可同时漏一条又多一条。[06.11 迁移与对账](../06_databases/11_replication_migration_reconciliation.md)

若 M3 后 N3 已接受 `m-11/seq11`，不能简单把路由指回 N1 的旧 **epoch7**：N1 缺新事实，旧客户端还可能把旧写带回来。安全回退也需先围栏 N3、把已承诺新写反向追到替代所有者、核对身份/版本/权限/outbox，再发布**更高的新路由 epoch**；不可把旧快照当“时间倒流”。协议层同理：一旦新事件只带旧程序无法安全处理的语义，二进制回滚要考虑仍在 broker/隔离队列中的新格式事件与未知字段转码损失。回退可行性是上线前必须验证的门，不是口头“随时回滚”。[08.05 回退边界](./05_partition_rebalancing.md)

## 七、固定 OpenIM 源码与运维证据：哪些格仍要留白

固定 `openimsdk/open-im-server` 提交 `f6411a8a1a31d3df36f4c2b3ad28481a94141e1f` 中，[`send.go` 所述发送路径](https://github.com/openimsdk/open-im-server/blob/f6411a8a1a31d3df36f4c2b3ad28481a94141e1f/internal/rpc/msg/send.go#L46-L70)调用 `MsgToMQ` 后返回；[另一路 MongoDB 消费处理](https://github.com/openimsdk/open-im-server/blob/f6411a8a1a31d3df36f4c2b3ad28481a94141e1f/internal/msgtransfer/online_msg_to_mongo_handler.go#L43-L69)调用 `BatchInsertChat2DB`。这两段**没有证明** OpenIM 使用本章 R1–R4 共识配置、b1→N3 搬迁、Raft 快照或教学 `event_v1/v2`。源码中出现 Protobuf 类型，也不能由此推出某个未经核对的事件格式升级流程。[OpenIM 阅读地图](../im_reference.md)

对真实项目做这类迁移，要按实际组件把证据分列：投票成员/多数与日志或快照进度；存储快照 `S0/L0`、路由 epoch、旧写拒绝与复制延迟；新旧生产者/消费者版本、解码失败、旧事件回放；权威 ID/版本/权限差集、SearchIndex/Notify 各自最老未完成年龄、B 的有权历史补拉。日志只记脱敏身份、版本和边界，不复制私有正文。**配置层无错误不等于 IM 业务结果已对账。**[11.03 观测证据](../11_reliability/03_logs_metrics_traces.md)

## 八、三轴迁移评审与 22 道分层练习

第一遍手算 `C_old/C_new` 各自多数、区分 Raft index12 与会话 seq9；第二遍交出 M0–M5 的“数据、路由、事件协议、业务效果”四列矩阵，给每一步写准入/回退门、失败时的权威来源和下一证据。以下题目先预测，再展开反馈。

### 基础 1–8：认出三套配置

<details><summary>1. `C_old` 与 `C_new` 各有几个投票者、多数是多少？</summary>

各 3 个，多数各为 2。</details>

<details><summary>2. 旧 `{R1,R2}` 与新 `{R3,R4}` 两个多数有交点吗？</summary>

没有。直接让两套配置独立同时决策有风险。</details>

<details><summary>3. 联合配置阶段只拿旧组 2 票够吗？</summary>

不够；按 Raft 论文模型须旧组和新组分别满足多数。</details>

<details><summary>4. etcd learner 刚启动但未追平，可直接计入投票多数吗？</summary>

不可。它先是非投票成员，追上后按产品规则 promotion。</details>

<details><summary>5. Raft `lastIncludedIndex=12` 是 `c-a seq12` 吗？</summary>

不是。前者是复制组日志坐标，后者若存在才是会话业务序号。</details>

<details><summary>6. b1 的 `S0/L0` 与 Raft `index12/term4` 可互换吗？</summary>

不可。前者接续应用数据快照/增量，后者定位 Raft 状态机快照与日志。</details>

<details><summary>7. 事件 `event_v2` 与当前 HTTP S2 成功合同是同一版本号吗？</summary>

不是。事件格式版本与 HTTP 接口/阶段合同是两条独立演进轴。</details>

<details><summary>8. Protobuf 旧程序能解析新增字段，就一定会正确执行 `visibility` 吗？</summary>

不一定。旧程序可能忽略字段，线格式可读不等于权限语义安全。</details>

### 快照与在途 9–16：哪里会丢增量

<details><summary>9. Raft 快照只应覆盖什么前缀？</summary>

已提交且应用的状态机前缀，并带 `lastIncludedIndex/Term` 供后续日志衔接。</details>

<details><summary>10. R4 落后到 index8，领导者已截断需要的旧日志，怎么办？</summary>

按 Raft 安装完整快照至 index12，再追其后的合法日志。</details>

<details><summary>11. 应用 `S0` 只含 `m-9:v1`，复制期间发生 v2 编辑，N3 可直接切流吗？</summary>

不可。须沿配对 `L0` 增量追到 v2 并核对版本。</details>

<details><summary>12. 编辑 `m-9:v2` 会让它自动占用新聊天 `seq10` 吗？</summary>

本题不会；它仍是 `m-9/seq9` 的新版本，`m-10` 才占 seq10。</details>

<details><summary>13. 新消费者先支持旧/新事件，再升级生产者有何作用？</summary>

避免仍在运行的旧消费者忽略新语义字段；旧事件回放也有可解释路径。</details>

<details><summary>14. Protobuf 旧未知字段经 JSON 转码一定保留吗？</summary>

不一定。官方说明 ProtoJSON 或逐字段复制可能丢未知字段，需逐链路验证。</details>

<details><summary>15. M2 两边消息数量一样，就能认定版本和权限全对吗？</summary>

不能。还要比 ID 差集、seq 缺口、版本、撤回/删除、可见范围与 outbox。</details>

<details><summary>16. 搬 b1 会把 Kafka P0:42 的 E9 自动移到另一分区吗？</summary>

不会。存储桶路由与 broker 分区是不同映射。</details>

### 回退与源码 17–22：评审一个可执行门槛

<details><summary>17. N3 尚未追上 `L0`，可先发布 epoch8 再补吗？</summary>

不可作为已追平切换。先修断档/追增量与对账，再开放新 owner。</details>

<details><summary>18. N3 已接收新 `m-11`，能无条件把路由改回旧 epoch7/N1 吗？</summary>

不能。先围栏 N3、反向追新写并核对，再发布更高的新 epoch。</details>

<details><summary>19. 迟到的 `evt:m-9:v1` 可覆盖 `m-9:v2` 搜索文档吗？</summary>

不可。目标按权威消息版本/权限条件处理并保留缺口修复。</details>

<details><summary>20. 新字段删除后可重用原 Protobuf 字段号吗？</summary>

不应。编号不可随意重用，删除后按官方规则 `reserved` 防止冲突。</details>

<details><summary>21. 固定 OpenIM 两处源码可证明它采用本章联合配置与事件 v2 吗？</summary>

不能。只核对了所述发送入队返回和另一 MongoDB 消费调用。</details>

<details><summary>22. 何时能清理旧 N1 拷贝和旧事件读取分支？</summary>

路由/增量/ID版本权限/outbox 对账、旧客户端和旧事件重放/隔离窗口、回退证据均有明确通过结果后，按保留政策受控清理。</details>

## 本章完成标准与下一步

能不看答案说明三套配置的权威范围、旧新多数为何要安全重叠、Raft 快照与 b1 应用快照为何不能互换；能按 M0–M5 解释 v2 编辑和 E10 在途时的协议兼容、快照追赶、单写者、旧事件重放与回退门，才算完成第一轮。学习者的真实成员变更、协议混部和数据差集需要在隔离环境另行验证。下一章 08.11 将学习如何记录有界故障历史并检验这些承诺。
