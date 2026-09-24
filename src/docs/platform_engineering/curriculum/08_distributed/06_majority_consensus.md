---
title: 08.06 多数与共识：三副本何时能承诺消息
icon: /assets/icons/article.svg
order: 7
date: 2026-09-24
---

[返回第八卷](./README.md) · [部分失败：08.01](./01_system_partial_failure.md) · [复制：08.03](./03_replication_goals_costs.md) · [一致性模型：08.04](./04_consistency_models.md) · [分区迁移：08.05](./05_partition_rebalancing.md)

# 08.06 多数与共识：三副本何时能承诺消息

> DeepTutor 八节初稿经技术与教学审阅后的静态课程。本章的 R1/R2/R3、term4/5、日志 `index=12` 和命令 C9 都是**另设的 Raft 纸上复制日志模型**，没有运行 Raft、Go、数据库、故障或站点。它不是当前 S2 `accepted_in_memory`、[未来 S3 `stored_in_teaching_db`](../09_backend_security/12_im_service_capstone.md) 的 SQL 提议，也不是已核对的 OpenIM 实现。会话 `seq=9`、broker P0:42 与本章 Raft index12 是三种不同编号。

## 一、三份拷贝还不等于一次安全的“已提交”

想象另一种**独立的教学存储方案**：把虚构 IM 命令 `C9=记录 m-9` 写入一组三节点复制日志。R1 是任期 **term4** 的领导者；它打算把 C9 放在日志 **index12**，R2/R3 是跟随者。**日志**是按位置排列的命令序列，**复制**让节点保存相同命令，**提交**表示协议已经确定该位置不会被未来合法领导者换成另一个命令，**应用**才是状态机按序执行已提交命令。Raft 论文从“同一序列驱动确定性状态机”建立这个模型。[Raft 论文：复制状态机](https://raft.github.io/raft.pdf)

如果 R1 仅在自己的磁盘写了 index12 就向 A 宣称“多副本已安全提交”，R1 随即故障时 R2/R3 可能从未见 C9。若 R1 和 R2 都按协议持久保存**当前任期 term4** 的 C9，三节点中的**多数 2/3**已持有它，R1 才可据本章 Raft 规则推进 `commitIndex`。R3 可以暂时落后；R1+R2 的副本日志提交不等于 R3 已应用，也不等于客户端 A 已收到响应，更不等于 B 设备收/读。[Raft 论文：领导者提交规则](https://raft.github.io/raft.pdf)

| 纸上状态 | R1 | R2 | R3 | 领导者此刻可否按本题确认 index12 已提交 |
|---|---|---|---|---|
| A | 持有 term4/C9 | 未持有 | 未持有 | 不可；只有 1/3 |
| B | 持有 term4/C9 | 持有 term4/C9 | 未持有 | 可；当前任期条目有 2/3，仍须按协议推进提交/应用 |
| C | 已提交并应用 | 已存但可能尚不知道 `commitIndex=12` | 落后 | A 的成功回应仍可能丢失；B 与 R3 的观察另查 |

这里的 `index12` 是 Raft 日志坐标；`m-9` 的消息 ID 与 `seq9` 是业务身份/会话顺序，P0:42 是另一个 broker 的分区位置。若某系统选择 Raft 日志作消息事实源，必须另定义业务映射与接口合同；**本页只用 C9 解释共识，不替代系列里 S3 SQL+outbox 的教学方案**。[07.12 确认点矩阵](../07_cache_messaging/12_cross_system_consistency_case.md)

## 二、多数为何会相交：2/3 的算式及其前提

三节点的多数是 `floor(3/2)+1=2`。任取两组两个节点，至少有一个交点：`{R1,R2}` 与 `{R2,R3}` 交在 R2；`{R1,R2}` 与 `{R1,R3}` 交在 R1。这个交点让后一次选举**有机会接触**此前已提交的日志。但“任意两个多数相交”只是必要直觉，不能单靠集合论证明新领导者一定含 C9；Raft 还要求**每任期至多一票、候选日志足够新、日志匹配与持久化**，才能阻止缺已提交条目的候选胜选。[Raft 论文：选举限制](https://raft.github.io/raft.pdf)

| 节点数 | 多数 | 可容忍多少节点停止后仍有多数 | 本题要记住的代价 |
|---:|---:|---:|---|
| 3 | 2 | 1 | R1 孤立后不能独自承诺新写 |
| 4 | 3 | 1 | 比 3 节点多一份副本，却没有多容忍一个停止节点 |
| 5 | 3 | 2 | 增加故障容忍，但增加复制/运维成本 |

这里“可容忍”还要求剩余节点**能互通、磁盘/协议工作正常、客户端能联系到多数**；把三个节点摆在同一电源域也不能从公式得出高可用。多数侧可能暂时选不出领导者或延迟很高，少数侧则必须舍弃新写可用性以保持安全。Raft 的前提是通常的崩溃/网络故障模型，不把恶意节点撒谎或丢失已确认的稳定存储也包进这道算式。[Raft 论文：安全与可用前提](https://raft.github.io/raft.pdf)

## 三、term4→term5：选票和日志新旧挡住失忆候选

R1 在 term4 持 C9，R2 也已存 C9，R3 落后。此时 R1 与另两节点隔离，R2/R3 能相互通信。R2/R3 会在心跳超时后尝试进入**term5**，候选要从三节点中拿到**至少两票**。Raft 每个节点在一个任期最多投一票；随机化选举超时帮助减少同时竞选带来的反复平票，但不是日志安全的数学依据。[Raft 论文：领导者选举](https://raft.github.io/raft.pdf)

若落后的 R3 先竞选，它可投自己一票；R2 比较候选最后日志的**任期与位置**，发现 R3 缺 term4/index12 的 C9，便不能把票投给这个较旧候选。R3 拿不到 2/3。R2 若竞选，则自身持 C9，R3 的日志较旧可投 R2，R2 可在 term5 胜选。这样，曾经被 R1+R2 提交的 C9 在新领导者 R2 的日志里。具体“谁先选上”不重要，**选举限制保证合法领导者的日志足够新**才重要。[Raft 论文：RequestVote 日志比较](https://raft.github.io/raft.pdf)

被隔离的旧 R1 可能暂时不知道 term5 已出现。它可以在本地写入一个**未提交**后缀，但拿不到多数确认，不得把它当已提交答复给 A；之后收到更高任期要退为跟随者。若 R1 还掌握某个外部 SQL/网关写入口，Raft 的 term 并不会远程把那处副作用自动撤销：应用须在目标端用 owner epoch/围栏拒绝过期持有者，延续[08.05 的 b1 写权切换](./05_partition_rebalancing.md)分析。

## 四、日志匹配、`commitIndex` 与旧任期的细节

领导者用 `AppendEntries` 附带前一条的 `prevLogIndex/prevLogTerm`；跟随者只在前缀匹配时接续，冲突的**未提交**后缀可被合法新领导者的日志覆盖。若两个日志同一位置有同一任期条目，Raft 的**日志匹配性质**要求它们至该位置的前缀相同。它与“所有节点任何时刻字节完全一样”不同：R3 可暂时落后，新领导者逐步修复差异。[Raft 论文：日志匹配与修复](https://raft.github.io/raft.pdf)

`commitIndex` 是一个节点**已知已提交的最高日志位置**；`lastApplied` 是它**已应用到状态机的最高位置**。R1 知道 C9 得到多数响应，可先推进 `commitIndex=12`；R2 虽已存 index12，可能还没收到领导者传播的新提交位置，`commitIndex` 暂低；R3 连条目都没有。即使某节点 `commitIndex=12`，`lastApplied` 也可暂为 11，随后按顺序应用。服务端若给客户端承诺“命令效果已可读”，还要说明何时应用及采用何种读规则；不能把“磁盘有一行”与“业务可读”混写。[Raft 论文：持久与易失状态](https://raft.github.io/raft.pdf)

进阶要留住一个容易犯错的规则：**新领导者不能只因为某条旧任期的日志项现在分布在多数节点，就把它单独宣布为已提交**。Raft 只按“当前任期项已在多数”推进直接提交；这个当前任期项提交后，前面的日志前缀才随之**间接提交**。论文用反例说明：仅数旧任期副本会让未来领导者覆盖你误认为已提交的项。这不是“多数无用”，而是多数、任期和选举限制必须共同成立。[Raft 论文 §5.4.2](https://raft.github.io/raft.pdf)

## 五、状态机、响应未知与读：写安全不自动给出业务成功

各节点按相同日志顺序应用**确定性命令**，才能得到相同状态。若 C9 被应用为“新增消息 `m-9`”，同一客户端在响应丢失后重试，旧领导者或新领导者可能再收到同一业务操作；即便复制日志本身安全，也须用稳定 `command_id/message_id` 和状态机内的去重/唯一约束阻止重复建消息或分配新 seq。Raft 论文也专门给出客户端序号避免提交后响应丢失导致重复执行的方案。[Raft 论文：客户端重试](https://raft.github.io/raft.pdf)

但本系列当前 HTTP S2 有自己的明确规则：同 ID 重复即使正文相同也返回 **409**，成功只是 `accepted_in_memory`；未来 S3 SQL 200 `stored_in_teaching_db` 仍是提议。不能因本章 Raft 教学状态机可返回既有命令结果，就偷偷改变 S2 接口或称 S3 已基于 Raft。要采用新存储/新响应语义，必须另写兼容合同与验证证据。[09.02 HTTP 合同](../09_backend_security/02_http_api_contract.md)

读也有边界。一个旧 R1 在不知道 term5 已选出时，可能仍以为自己是领导者并返回陈旧状态；**领导者本地读不自动线性化**。Raft 论文对无需写日志的线性化读要求领导者先确认本任期已提交所需信息，并与多数交换心跳以确认未失去领导权；依赖时间的租约方案又有时钟假设。R3 跟随者读也可能落后。若 A 发 `m-9` 后必须读到它，要给读取路径声明相应会话/线性化合同，不能只说“写入多数”。[Raft 论文：只读操作](https://raft.github.io/raft.pdf) · [08.04 一致性模型](./04_consistency_models.md)

## 六、成员变更与系统边界：三个节点扩成五个不是改个分母

08.05 讨论把桶从 N1 搬到 N3，那是**应用数据的放置**；本节说的成员变更是**复制日志自身的投票者集合**变化。若旧配置三节点用多数 2，新配置五节点用多数 3，不能让不同节点随意先后切换分母，可能出现两个互不相交的有效决策。Raft 论文用**联合配置（joint consensus）**作为过渡，让旧、新集合各自都达到所需多数后，再进入新配置；课程只要求能指出两套投票规则和过渡原因，不在这里写完整实现。[Raft 论文：成员变更](https://raft.github.io/raft.pdf)

Raft 解决的核心是**一组非恶意故障节点对一条复制日志和状态机命令达成一致**。它不替 IM 自动完成成员授权、消息 ID 冲突处理、SQL 与 broker 的跨系统事务、SearchIndex 幂等、Notify 提示、B 设备接收与阅读。多数侧若无法联通、磁盘不可靠或配置错误，活性/安全还需具体前提与运行证据；少数侧不能为了“用户快点发出去”就绕过本章提交规则宣称成功。[07.12 端到端确认边界](../07_cache_messaging/12_cross_system_consistency_case.md)

## 七、回到公开项目：本章 Raft 与已核对 OpenIM 路径分开

固定 `openimsdk/open-im-server` 提交 `f6411a8a1a31d3df36f4c2b3ad28481a94141e1f` 的 [`send.go` 所述发送分支](https://github.com/openimsdk/open-im-server/blob/f6411a8a1a31d3df36f4c2b3ad28481a94141e1f/internal/rpc/msg/send.go#L46-L70)调用 `MsgToMQ` 后返回；[另一路 MongoDB 消费处理](https://github.com/openimsdk/open-im-server/blob/f6411a8a1a31d3df36f4c2b3ad28481a94141e1f/internal/msgtransfer/online_msg_to_mongo_handler.go#L43-L69)调用 `BatchInsertChat2DB`。这两段**没有证明该项目使用本章 Raft 日志、R1/R2/R3 配置或 term4/index12**，也不能由函数名补出 broker 的生产者确认级别。[OpenIM 阅读地图](../im_reference.md)

IM 服务可以**另行考虑**把共识系统用于 b1 所有者/路由 epoch 等元数据，或者设计以复制日志为权威事实源；这两种用途都需要完整的状态机、接口合同和故障证据。本文 C9 仅是第二种用途的纸上反例，不能与第七卷的 SQL+outbox 教学路径在同一时刻当作“已部署的同一套实现”。当真实源码/部署未核对时，正确表述是“若采用 Raft，需检查其成员、提交、读取和外部副作用边界”，而不是给 OpenIM 补一个想象中的共识层。

## 八、用 22 题把三节点时间线交给自己推演

第一遍提交 R1/R2/R3 的**日志持有、提交、应用**三列表与多数算式；第二遍画 term4→term5 选举、旧领导者写入、旧任期项与线性化读的判断，再把 C9/业务 `m-9`/SQL 提议/设备结果放到不同确认栏。以下答案供预测后展开。

### 基础 1–8：多数和四个确认点

<details><summary>1. 三节点多数是多少？</summary>

`floor(3/2)+1=2`，须有两节点参与同一合法决定。</details>

<details><summary>2. R1 独存 term4/index12，可答“Raft 已提交”吗？</summary>

不可。只有 1/3，R1 失败后该未提交后缀可能消失。</details>

<details><summary>3. R1+R2 持有当前 term4 的 C9，R3 落后，领导者可怎样判断？</summary>

按本题 Raft 规则已在多数，可推进 `commitIndex=12`；R3 不必已收到。</details>

<details><summary>4. `index12`、`seq9` 与 P0:42 是同一序号吗？</summary>

不是。分别是 Raft 日志位置、会话业务顺序和另一 broker 分区位置。</details>

<details><summary>5. `commitIndex=12` 就说明每个节点 `lastApplied=12` 吗？</summary>

不说明。已知提交与各节点应用进度可不同，R3 还可能缺条目。</details>

<details><summary>6. 三节点隔离一个后，剩下两个互通仍可能继续服务吗？</summary>

在协议、磁盘、网络和客户端可达等前提成立时，两个节点组成多数。</details>

<details><summary>7. 四节点多数是多少？比三节点多容忍一个停止节点吗？</summary>

多数 3；只能容忍 1 个停止节点，未多容忍一个。</details>

<details><summary>8. 五节点多数与可容忍停止数是多少？</summary>

多数 3；在剩余三节点互通且正常的前提下可容忍 2 个停止。</details>

### 选举与日志 9–16：哪些条目可能丢

<details><summary>9. term5 中落后的 R3 自投一票，持 C9 的 R2应投它吗？</summary>

不应。R3 日志较旧，R2 的 RequestVote 日志新旧检查应拒绝。</details>

<details><summary>10. R2 持 C9，在 term5 得到自己和 R3 两票可否成为领导者？</summary>

可以；满足多数且候选日志不落后于投票者。</details>

<details><summary>11. R1 与 R2/R3 隔离后，仅 R1 能继续确认新写吗？</summary>

不能。它拿不到多数，旧 term 身份也不能替外部系统自动取得新写权。</details>

<details><summary>12. 新领导者怎样发现跟随者后缀冲突？</summary>

用 `AppendEntries` 的前一位置与任期检查；不匹配则回退匹配点并修复未提交后缀。</details>

<details><summary>13. 日志同一 index 和 term 的条目相同，前缀可随意不同吗？</summary>

不可。Raft 的日志匹配性质要求到该位置的前缀相同。</details>

<details><summary>14. 新任期领导者只数一个旧任期项现有多数副本，就能直接宣布它提交吗？</summary>

不能。须先按 Raft 规则提交当前任期项，旧前缀再被间接提交。</details>

<details><summary>15. R2 已存 index12，就一定知道 `commitIndex=12` 吗？</summary>

不一定。领导者可能尚未把提交位置传播给它。</details>

<details><summary>16. 随机选举超时本身能替代投票日志新旧限制吗？</summary>

不能。超时帮助避免活性上的平票，日志新旧检查才保护已提交内容不被落后候选覆盖。</details>

### 工程 17–22：把共识放回 IM 合同

<details><summary>17. C9 提交后 A 的响应丢失，A 重试可直接新建一条 `m-10` 吗？</summary>

不应。先用稳定命令/消息 ID 查询或按状态机去重；当前 S2 的重复响应合同另保持 409。</details>

<details><summary>18. 旧 R1 仍以为自己是领导者，本地读可直接承诺线性化吗？</summary>

不能。须按读协议确认当前领导权和已提交信息，不能只靠旧本地身份。</details>

<details><summary>19. Raft 多数提交 C9 能证明 SearchIndex、Notify 与 B 都完成吗？</summary>

不能。它只保护该复制日志/状态机范围，外部效果与设备回执另证。</details>

<details><summary>20. 三节点改五节点可让各节点自行换多数分母吗？</summary>

不能。成员变更需安全的重叠过渡，如 Raft 联合配置中旧新分别满足多数。</details>

<details><summary>21. 固定 OpenIM 两段源码能证明它使用本题 R1/R2/R3 吗？</summary>

不能。只核对所述 `MsgToMQ` 返回与另一 MongoDB 消费写入位置。</details>

<details><summary>22. 若要把本题日志提交作为新 API 的成功点，仍须补什么？</summary>

明确命令应用、客户端重试/冲突、读取一致性、成员授权、外部副作用和兼容版本，并在真实环境验证；不能暗改当前 S2 或拟议 S3。</details>

## 本章完成标准与后续路径

能不看答案画出 R1 单存、R1+R2 多数、R3 落后的状态差别，解释 R3 为何不能凭过期日志在 term5 当选；能区分 `commitIndex`、`lastApplied`、HTTP 回应与 B 的设备确认，并说出旧任期提交/读/成员变更的额外规则，才算完成第一轮。第二轮由学习者在隔离环境对实际共识组件做故障与读写验证，本页没有代替执行。下一章 08.07 将进一步讨论故障检测、租约和协调服务的业务使用边界。
