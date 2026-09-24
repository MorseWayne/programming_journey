---
title: 07.05 缓存服务的持久与故障：恢复后还能信哪份状态
icon: /assets/icons/article.svg
order: 6
date: 2026-09-24
---

[返回第七卷](./README.md) · [状态角色前置：07.01](./01_access_state_roles.md) · [缓存交错前置：07.03](./03_cache_read_update.md) · [过载前置：07.04](./04_cache_overload_hotspots.md) · [数据库恢复前置：06.09](../06_databases/09_logging_recovery.md)

# 07.05 缓存服务的持久与故障：恢复后还能信哪份状态

> DeepTutor 八节初稿经技术与教学审阅后的静态课程。Redis 快照、AOF、主副本与重启时间线均为**纸上教学模型**；没有运行 Redis、数据库、Go、故障切换、负载或站点，也不声称 OpenIM 使用这里的 Redis 配置。当前 S2 `200 accepted_in_memory` 仍不具备数据库持久承诺；未来 S3 v2 的数据库权威仅是课程提议。

## 一、缓存重启是一次“状态角色”考试

07.01 已把未来教学 S3 的 `messages` 和 `members` 以及提议的 `conversation_counters.next_seq` 放在**权威**层；`preview:c-a` 是从已提交消息重建的**派生**预览，`presence:u-a:dev-1` 是当前连接/心跳的**临时**提示，`rate:u-a:<窗口>` 是按风险合同决定是否可重置的临时速率计数。现在 Redis 进程突然重启，先问这些状态丢失后业务怎样解释，再看 Redis 的持久选项。**“Redis 有 RDB/AOF”不能自动把派生预览变成权威，也不能替已断开的设备连接继续宣称在线。**

当前 S2 的消息只被进程内存受理，若那个受理进程崩溃，消息本身可能丢失；不能借未来 S3 的数据库表为它补造恢复证据。下面除专门标注 S2 的反例外，都采用**未来 S3 教学数据库仍可读**的假设，且仅评估 Redis 故障。[07.01 状态角色](./01_access_state_roles.md) · [06.12 数据库业务案例](../06_databases/12_database_business_case.md)

| 第一遍 | 第二遍 | 交付物 |
|---|---|---|
| 无持久、RDB、AOF 与缓存键角色 | 异步复制、Sentinel、分片、冷启动 | 一张故障时间线、一张逐状态恢复/降级表 |

## 二、无持久与 RDB：恢复得出一个值，不等于值仍正确

Redis 官方提供**无持久化**、RDB 点时快照、AOF 追加日志及组合选项。若此实例只保存可重建预览和可失临时键，无持久重启后缓存为空可以是一个**可接受的设计结果**，但会带来回源峰值：预览从权威消息重建；在线提示要等新连接/心跳，旧键缺失应标**未知**；限流窗口按已经评审的 fail-open/fail-closed 政策处理。若有唯一权威事实也放在该实例，这个“可接受”前提就不成立。[Redis Persistence](https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/)

RDB 是某一时刻的数据集快照。固定一个玩具反例：

| 时刻 | 权威教学 DB | Redis 当前/持久状态 | 业务含义 |
|---|---|---|---|
| t0 | `c-a` 最新 `seq=8` | RDB 保存 `preview:c-a=seq8` | 当时一致 |
| t1 | DB 已提交 `m-9/seq9` | Redis 活动键已失效或更新，但**尚无新 RDB** | 活动缓存与 t0 快照不同 |
| t2 | DB 仍有 9 | Redis 故障并从 t0 RDB 恢复，且教学 TTL 尚未到 | **恢复出的键可能仍写着 seq8** |

RDB 使 Redis 找回**旧缓存数据**，不能保证它等于源数据库的最新事实。若 A 发后预览必须显示 9，t2 恢复出的 seq8 不能未经版本检查直接返回；可清理恢复出的派生键、核对源版本或让关键读走权威，再逐步重建。若产品容许短暂旧预览，也要写清陈旧窗口和修复路径。RDB 快照间的 Redis 更新可能在故障中丢失；这个损失窗口与**权威数据库本身的恢复能力**是两回事。[Redis Persistence](https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/)

另一个反例是 `presence`：即使 RDB 恢复出“u-a 在线”，原连接对象已随进程故障消失。一个尚未过 TTL 的旧在线键也不足以证明当前设备可达；要让连接重新认证/心跳并进入新运行代次。持久下来的临时计数也可能属于**旧窗口**，必须核对窗口身份，而不是看到 RDB 有数值就继续按新窗口扣额。

## 三、AOF：追加写命令也要说明何时刷盘、恢复后查谁

**AOF（Append Only File）**记录改变 Redis 数据的命令，重启时可回放重建。Redis 官方区分 `appendfsync always`、`everysec`、`no` 等策略：每次追加都刷、周期性刷、交由操作系统安排刷盘，分别有不同写入等待与掉电丢失风险。它们不能被一句“开了 AOF 所有写永不丢”替代；还受实际配置、存储与故障模型影响。RDB+AOF 可组合，AOF 文件也会重写，均需按具体版本核对。[Redis Persistence](https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/)

即使 AOF **完整恢复**了 `preview:c-a=seq8`，源数据库若已到 seq9，这个“持久存在”的缓存值仍是**旧派生值**；AOF 解决 Redis 自己能否找回写过的内容，不自动解决 Redis 与 SQL 的跨系统一致性。相反，若 AOF 丢了最新预览更新，只要未来 S3 权威消息还在，预览仍可重新计算；只是冷启动和修复要有容量预算。若业务选择让 Redis 保存唯一的权威数据，则需要另列持久、复制、备份、逐出禁用/容量、恢复演练与确认语义，**不能照本页的可丢预览方案处理**。

| Redis 选项 | 它主要决定 | 仍不决定 |
|---|---|---|
| 无持久 | Redis 重启后是否从本机文件恢复键 | S2 消息是否已有数据库事实 |
| RDB 点时快照 | 能回到哪个 Redis 数据集快照 | 恢复值是否与当前权威 DB 一致 |
| AOF + fsync 策略 | Redis 写命令有多少已达到自身持久边界 | 跨 DB/Redis 事务、B 设备交付 |

## 四、异步复制和 Sentinel：切到落后副本，缓存可能倒退

Redis 官方说明复制默认是**异步**的。假设 Redis 主节点已有 `preview:c-a=seq9`，副本却只复制到 seq8；主节点故障后若提升该落后副本，新的缓存视图会回到 8。若预览只是派生状态，可从权威消息 DB 对账、失效并重建，用户是否短时看旧值按预览合同决定；若把唯一消息事实或 `next_seq` 只存 Redis，就不能用“以后再热起来”解释丢失。[Redis Replication](https://redis.io/docs/latest/operate/oss_and_stack/management/replication/)

**Sentinel** 可监测并协调 Redis 实例切换，但它不把默认异步复制自动变成零丢失协议。Redis 官方明确指出切换期间已被主节点确认的写仍可能没有到达最终提升的副本。`WAIT` 能让客户端等待一定数量副本确认复制进度，但官方也明确它**不把 Redis 集群变成强一致的 CP 系统**，仍可能因持久配置和故障切换丢失已确认写。切换时还要避免旧主在分区中继续接受不能并入新历史的写。[Redis Replication](https://redis.io/docs/latest/operate/oss_and_stack/management/replication/) · [Redis Sentinel](https://redis.io/docs/latest/operate/oss_and_stack/management/sentinel/)

对于本题，“Redis 预览回退”与“数据库消息回退”是两种不同事故：前者可以修复派生视图，后者要回到 06.09/06.11 的权威日志、确认与对账。不能见到 Redis 副本落后就说 S3 SQL 消息已丢，也不能见到 Redis 已 ACK 就说 B 设备已收到。

## 五、分片解决键分布，解决不了单个热键的正确性

**分片**把不同键放到不同节点；Redis Cluster 用槽位映射键与节点，并在重分配时迁移槽。它能让**不同键**分散资源，但 `preview:c-g` 仍是一个键，通常落在一个对应的槽/节点上；多添分片不自动把这**一个热键**的每秒 1000 次访问平均分到所有节点。07.04 的单键合并/局部缓存/有界回源仍需按业务陈旧政策评审。[Redis Cluster Specification](https://redis.io/docs/latest/operate/oss_and_stack/reference/cluster-spec/)

若 `candidate_members:c-g` 是含 10000 人的大 Set，迁移/复制这整个键、一次全量 `SMEMBERS` 和重新回填都会消耗资源；它与小而热的预览键是不同问题。键切片可能帮助数据分布，但成员候选缓存失效和**权威授权**必须保持正确，不能为了扩容把同一个成员关系拆出彼此矛盾的许可。实际键大小、命令成本和迁移时间要测量，本页不按成员数编造字节/秒。[Redis Eviction](https://redis.io/docs/latest/develop/reference/eviction/)

## 六、空缓存冷启动：把 07.04 的预算再算一遍

若 Redis 选择**无持久**并重启为空，或故障切换导致大量热键失效，原本由缓存吸收的预览读可能同时回源。沿 07.04 的纸上数字：若持续 **1000 次/秒**预览请求都 miss，DB 对这类查询安全预算只有 **200 次/秒**，且不拒绝、不合并、没有其他负载，那么队列每秒净增 `1000−200=800`；不能让“缓存会慢慢热”成为无限队列的理由。若只是一次 1000 请求突发，第一秒剩余至少 800、理想约五秒排空，条件与持续到达不同。[07.04 缓存过载与热点](./04_cache_overload_hotspots.md)

可用有界回源、按热度预热、同键合并加载、分批恢复和明确过载响应保护 DB。允许短时旧预览的产品可以在**有受控旧副本且权限仍安全**时做陈旧降级；无旧副本就不能凭空造出 seq9，权限旧许可更不能为了可用性直接放行。在线提示缺失则按未知/重连策略。冷启动的**恢复时间目标**包括热键恢复、DB 压力下降、用户读到正确版本，而不仅是 Redis 进程监听端口成功。[Redis cache-aside 文档](https://redis.io/docs/latest/develop/use-cases/cache-aside/)

## 七、按状态角色写恢复目标，不按“Redis 恢复了”打勾

| 状态 | 未来 S3 中的权威/可失性 | Redis 故障后的可验收结果 |
|---|---|---|
| 已提交消息历史 | SQL 教学 DB 的权威事实 | 按数据库确认/恢复合同查到 `m-9`；Redis 不制造消息 |
| 会话预览 | 由完整消息/可见规则重建 | 回源或版本核对后为 seq9；若暂旧，须在陈旧合同内 |
| 在线 presence | 当前连接/心跳近似值 | 老“在线”不沿用，新连接/心跳后恢复；暂时可标未知 |
| 临时限流计数 | 按明确风险政策可丢/可降级 | 故障重置或恢复旧窗口都按 fail-open/fail-closed 政策处理 |
| `members` 权限 | 受控权威当前资格 | 退群后不得使用 Redis 旧许可放行写/泄露历史 |
| `conversation_counters.next_seq` | 06.12 的事务序号权威扩展 | 保持与消息插入同成同败，不因 Redis 清空而归零 |

**RPO** 要按每类状态写“故障后最多允许失去哪份事实”，**RTO** 要写“多久让业务恢复到可用且满足必要新鲜度”。派生预览可从 DB 重建，不表示 RTO 免费；在线状态可由心跳恢复，不表示恢复前应向所有人谎报离线。若把 Redis 提升为某项业务的**唯一权威源**，要重新审它自己的持久/复制/备份/切换与逐出配置，并验证故障下的真实结果；`WAIT`、AOF 或 Sentinel 单独一个词都不足以证明完整承诺。

## 八、交付缓存故障时间线与恢复检查单

交付 t0 RDB seq8→t1 权威 DB seq9→t2 Redis 恢复 seq8 的时间线，另列无持久、AOF、落后副本切换的可见风险，以及 1000/s 冷启动对 200/s DB 预算的保护方案。每一项写清**缓存恢复了什么、权威实际是什么、客户端是否有权限、还需要哪份证据**；不把“Redis 进程可连接”记为业务恢复完成。

### 分层练习与反馈

1–8 辨持久机制，9–16 手算故障和冷启动，17–22 做状态角色与业务取舍。先预测，再展开答案。

<details><summary>1. Redis 选择无持久后重启，派生预览还能重建吗？</summary>

在未来 S3 权威消息与规则完整且可读的前提下可重建；过程要有回源预算。</details>

<details><summary>2. 当前 S2 的消息能凭未来 S3 DB 表恢复吗？</summary>

不能。S2 只承诺当前进程内存受理，不能借尚未实现的 S3 持久路径补证明。</details>

<details><summary>3. RDB 与 AOF 最基本的记录方式分别是什么？</summary>

RDB 是某时点数据集快照；AOF 记录修改数据的命令以供回放。</details>

<details><summary>4. `appendfsync everysec` 等同每次命令都同步刷盘吗？</summary>

不等同。它按周期同步，近期写入仍有掉电丢失窗口，实际范围受配置/故障条件影响。</details>

<details><summary>5. AOF 恢复出 seq8，权威 DB 为 seq9，这个缓存因“已持久”就新鲜吗？</summary>

不新鲜。持久只说明 Redis 找回曾保存的值，不证明与源版本一致。</details>

<details><summary>6. Redis 复制默认同步等待每次副本持久吗？</summary>

不是。官方说明默认异步复制，额外等待/配置也须限定保证范围。</details>

<details><summary>7. Sentinel 自动切换能保证所有已确认缓存写都保留吗？</summary>

不能。被提升副本可能落后，Redis 官方明确存在确认写丢失窗口。</details>

<details><summary>8. `WAIT` 返回指定副本数确认，就等于强一致零丢失吗？</summary>

不等于。它确认复制阶段，不把集群变成强一致切换协议；持久配置/故障仍有关。</details>

<details><summary>9. t0 RDB 保存什么版本？</summary>

`preview:c-a=seq8`。</details>

<details><summary>10. t1 权威 DB 到 seq9，但未产生新 RDB，t2 恢复会得到什么？</summary>

若旧键未按 TTL 过期，可能恢复 RDB 中的 seq8；不能未经校验当最新。</details>

<details><summary>11. RDB 恢复了“u-a 在线”，为何不能直接展示当前在线？</summary>

原进程连接已断，旧心跳不证明新运行代次里的设备仍可达；需新连接/心跳。</details>

<details><summary>12. Redis 主节点预览 seq9、落后副本 seq8，切到副本后预览怎样？</summary>

可能退回 seq8；若只是派生预览，可从权威 DB 核对并重建。</details>

<details><summary>13. 若 Redis 只保存派生预览，副本丢了一次更新能直接证明 SQL 消息丢了吗？</summary>

不能。缓存副本与数据库消息权威是不同状态层。</details>

<details><summary>14. 1000/s 冷缓存回源、DB 预算 200/s，持续无拒绝时积压每秒增长多少？</summary>

`1000−200=800` 次/秒，纸上没有其他负载/合并/拒绝。</details>

<details><summary>15. 只有一批 1000 次，理想 200/s 需约多久处理完？</summary>

约五秒；不是持续每秒增加 800 的同一个条件。</details>

<details><summary>16. 增加 Redis Cluster 节点就把单个 `preview:c-g` 热键均分了吗？</summary>

不会自动。该键仍有自己的槽和负责节点，需另评估热点访问。</details>

<details><summary>17. 候选成员 Set 含 10000 人，每次全取会产生哪类问题？</summary>

大键/大结果的网络、内存与迁移成本；它也不能单独替权威权限判断。</details>

<details><summary>18. 限流计数重启后归零，可以一律当无风险吗？</summary>

不能。可能短时放宽请求，须按业务/安全风险选择 fail-open 或 fail-closed。</details>

<details><summary>19. `conversation_counters.next_seq` 能因 Redis 空了就重置为 1 吗？</summary>

不能。它是 06.12 的受控事务序号状态，不应只放可逐出缓存，也不能任意归零。</details>

<details><summary>20. Redis 已恢复监听端口，就达到业务 RTO 了吗？</summary>

未必。热键、权限、预览版本、DB 回源压力和用户结果都要达成约定目标。</details>

<details><summary>21. 冷缓存可返回旧成员许可换可用性吗？</summary>

不能。退群后旧许可可能越权；缓存故障时关键授权需权威/受控版本证据。</details>

<details><summary>22. 若产品决定把 Redis 用作唯一权威，首先补哪几类证明？</summary>

至少持久/复制/备份、逐出与容量、切换一致性、故障恢复演练和对外确认点；不能只写“开 AOF”。</details>

## 本章完成标准与下一步

不看答案时，能逐项解释无持久/RDB/AOF/落后副本切换会恢复什么、可能丢什么；能指出 RDB 恢复出旧预览和旧 presence 的不同错误，并设计冷缓存 1000/s 对 DB 200/s 的有界恢复，才算完成第一轮。第二轮由学习者在隔离环境保存真实 Redis 配置、故障时刻、源版本、读结果与容量数据；本章没有代替运行。

按[学习路线](../learning_path.md)，下一章 07.06 转入队列、发布订阅、日志与消费组；07.07 再细化生产确认、消费 ACK 和重复处理。
