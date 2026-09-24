---
title: 07.02 Redis 数据模型：从访问方式选择结构
icon: /assets/icons/article.svg
order: 3
date: 2026-09-24
---

[返回第七卷](./README.md) · [状态角色前置：07.01](./01_access_state_roles.md) · [集合前置：02.04](../02_algorithms/04_hash_sets.md) · [有序结构前置：02.06](../02_algorithms/06_trees_ordered_index.md) · [消息事实前置：06.12](../06_databases/12_database_business_case.md)

# 07.02 Redis 数据模型：从访问方式选择结构

> DeepTutor 八节初稿经技术与教学审阅后的静态课程。键名、分数、TTL、位偏移、通知和命令都是**纸上教学示例**；没有运行 Redis、Go、SQL、IM 服务或站点，也不声称 OpenIM 使用这些键。当前 S2 `accepted_in_memory` 不被改写为 Redis 实现；未来 S3 `stored_in_teaching_db` 仍只是数据库持久版的教学提议。

## 一、选结构之前，先把一次操作说成一句话

07.01 已将未来 S3 的已提交消息、当前 `members` 资格和序号计数列为权威；会话预览为可重建派生状态，在线提示与临时限流为有条件的短期状态。本章只问：**如果某份适合放在 Redis 的副本确实需要读写，应用按什么键找它、要保留顺序吗、是否要重放、丢了怎么办？** Redis 的 `String`、`Hash`、`Set`、`Sorted Set`、`List`、位操作和 `Stream` 是不同访问工具，不是“更高级的类型就更可靠”的等级表。[Redis 数据类型比较](https://redis.io/docs/latest/develop/data-types/compare-data-types/)

固定业务数据：`c-a` 的最新已知提交消息是 `m-9/seq=9`，`u-a/u-b` 为当前成员，`u-c` 不是成员。下面给出的 Redis 键均是**候选副本或临时状态**，不改变消息数据库、权限数据库和 06.12 教学 `conversation_counters` 的事务责任。它们若丢失，要按 07.01 的角色表回源、重建或显式降级。

| 第一遍 | 第二遍 | 交付物 |
|---|---|---|
| String/Hash、Set/Sorted Set、List/位图的操作形状 | Stream 消费组、键生命周期、跨系统边界 | 一份“业务操作→Redis 类型→不能保证什么”的选择表 |

## 二、String 与 Hash：一个值，还是几个同生命周期的小字段？

**String** 可存一段字节或数值形式的值，适合按单键读取。教学在线提示 `presence:u-a:dev-1 = "online"` 可以设 **30 秒玩具 TTL**；后续心跳刷新由业务定义。键不存在只说明这条缓存记录不可得，不证明用户或设备真实离线，更不证明应用已读。`rate:u-a:minute` 中的 `minute` 代表一个**具体时间窗口标识**，窗口还需过期政策；它可用 String 数值，经 `INCR` 做临时计数。单条 Redis 命令的计数修改是其本机数据操作，不会与 PostgreSQL 的消息事务自动形成一个跨系统原子提交。[Redis Strings](https://redis.io/docs/latest/develop/data-types/strings/) · [Redis EXPIRE](https://redis.io/docs/latest/commands/expire/)

**Hash** 适合一个 Redis 键里放数个要按字段读取/更新的值。派生预览 `preview:c-a` 可设 `{last_id:"m-9", seq:"9"}`；只要权威消息行和可见规则仍在，缓存坏了可以重建。Hash 不是 SQL 行，不因为有字段就自动有消息主键、事务、权限或崩溃恢复。若只需 `seq`，读对应字段即可；若字段不断增长或一次取全 Hash 很大，也要重新评估对象大小。[Redis Hashes](https://redis.io/docs/latest/develop/data-types/hashes/)

```text
presence:u-a:dev-1   String "online"，TTL=30s（仅示意）
rate:u-a:minute      String 3（短期计数，故障政策另定）
preview:c-a          Hash {last_id:"m-9", seq:"9"}（派生）
```

不要把 `conversation_counters.next_seq` 移到 `rate:*` 这一类键里。06.12 的 `next_seq` 在同一数据库事务内与成员校验、消息插入共同决定 `seq=9`；Redis `INCR` 即使对**自身**计数正确，也不能自动和数据库 `Commit` 一起回滚，不能未经新协议审阅就替代权威序号分配。[06.12 数据库业务案例](../06_databases/12_database_business_case.md)

## 三、Set 与 Sorted Set：只问“在不在”，还是“排第几”？

**Set** 保存不重复的成员，支持包含判断和集合运算，但**没有业务顺序**。教学候选键 `candidate_members:c-a={u-a,u-b}` 中，`u-c` 不在。它适合快速筛选“可能是成员”，不能作为发送/私有历史授权的**唯一**证据：`u-a` 退群后的旧 Set 仍可能留有 A；权威 `members.left_at` 才能按受控版本判断。[Redis Sets](https://redis.io/docs/latest/develop/data-types/sets/)

**Sorted Set（ZSET）** 的每个成员关联一个分数，适合按分数范围/排名访问。教学 `user_conversations:u-a` 有 `c-a→100`、`c-b→90`，按分数**降序**读会话列表，先 `c-a` 后 `c-b`。100/90 是**服务端派生排序分数**，不是 A/B 客户端墙上时间，也不证明会话历史具有跨会话全序。若分数相同，Redis 有自己的成员排序规则；产品应给稳定并列政策，不能靠“看起来顺序没变”当合同。[Redis Sorted Sets](https://redis.io/docs/latest/develop/data-types/sorted-sets/)

```text
candidate_members:c-a  Set  {u-a,u-b}         -- u-c 不在，仅候选
user_conversations:u-a ZSET {c-a:100,c-b:90} -- 降序：c-a,c-b
```

缓存的是候选集合和派生列表，不能用 `SISMEMBER` 真值绕开当前成员资格，也不能让 `ZSET` 分数替代 S 在 `c-a` 分配的权威消息 `seq`。成员数、会话数及每次返回的数量都要有界；一次取完整大群 Set 或巨大 ZSET 可能带来带宽与内存尖峰。

## 四、List：有界的最近窗口，不是永久消息历史

**List** 支持从两端追加/弹出，适合保留一段简单顺序窗口。教学 `recent:c-a=[m-9,m-8,m-7]` 从左到右为新到旧；新消息 `m-10` 进入时，可从左加入，再裁掉窗口之外的旧元素，使其最多保留 3 项。它只是**可重建的最近 ID 列表**，不含完整权限或正文，也不代替数据库的 `(conversation_id,seq)` 范围查询。[Redis Lists](https://redis.io/docs/latest/develop/data-types/lists/)

若业务要按 `seq<7` 找任意旧页、处理中要认领并确认通知、编辑/撤回可能改中间项，单一无界 List 并不自然满足这些需求。`POP` 从列表移走一项，只说明 Redis 列表项被移除；消费者进程可能在发给 B 前崩溃，**没有独立的设备交付证明或重放合同**。Redis Stream/消费组提供另一种处理形状，仍须分清消费 ACK 与 B 的设备回执。[Redis 数据类型比较](https://redis.io/docs/latest/develop/data-types/compare-data-types/)

## 五、位图：紧凑位标志要先有稳定、受限的偏移映射

Redis **Bitmap** 是在 String 值上执行位操作，不是另一个独立底层数据类型。教学假设只有三个已编号设备，稳定映射为偏移 `0、1、2`；若仅第 2 号设备的某个**临时标志**为 1，三个位是 `0,0,1`，`BITCOUNT` 为 **1**。这可以回答“这三个位置里几个被标记”，却不能自动回答“哪名用户当前有权看到消息”或“B 实际已读”。[Redis Bitmaps](https://redis.io/docs/latest/develop/data-types/strings/bitmaps/)

```text
设备索引：dev-0→bit0，dev-1→bit1，dev-2→bit2
标志：    [0,0,1]  → 被置 1 的位数=1
```

位偏移必须从受控映射产生、范围有界且生命周期明确。不能把任意字符串 `user_id` 直接当 bit offset，也不能把稀疏巨大数字直接作偏移而不检查内存；映射一旦重排，同一位的业务含义可能改变。若这些位将变成**权威已读状态**，需要另外定义持久来源、并发版本和设备/用户身份，而不能套本章临时标志的可失政策。

## 六、Stream：消费者 ACK 与 B 的设备确认不是一回事

**Stream** 保存按条目 ID 追加的字段记录，并可用消费组跟踪交给哪个消费者、哪些条目尚未 ACK。教学 `notify:c-a` 有 `N1,N2` 两条“有新消息可拉”的通知事件；**N1/N2 只是本题标签，不是实际 Redis Stream ID**。worker `G1` 读到两项，处理后只对 N1 做 `XACK`：于是**N1 在该消费组的待确认引用已解除，N2 仍 pending**。N1 的 Stream 条目是否继续保留受删除/裁剪规则影响，`XACK` 本身也不等于 B 的设备已收到、展示或已读。[Redis Streams](https://redis.io/docs/latest/develop/data-types/streams/)

| 结构 | 纸上操作 | 能说明 | 不能说明 |
|---|---|---|---|
| List 窗口/简单待办 | 左进右出或弹出 | 项被加入/移出该 List | 消费者崩溃后能自动恢复交付 |
| Stream + 消费组 | N1/N2 读取，N1 `XACK` | 组内 N1 的处理确认记录 | B 设备确认；数据库消息自动同事务写入 |
| 临时发布订阅 | 在线订阅者可接收发布 | 当时通道尝试/传递 | 离线设备自动从历史补拉 |

Redis Pub/Sub 是在线订阅通道，官方明确其发送后不重投的至多一次交付语义；与 Stream 的消费组待确认记录不是同一种恢复能力。[Redis Pub/Sub](https://redis.io/docs/latest/develop/pubsub/) Stream 可保存/重放一定范围的事件，但保留、消费者组、pending/认领和恢复都要按配置与协议设计，07.06–07.09 才展开。将 `m-9` 写进教学 SQL 数据库，再用 `XADD` 向 Redis Stream 写入教学通知 N1，是**两个系统操作**，单靠选了 Stream 不会把它们变成同一个事务；若要保证通知最终追赶，07.10 再讲 outbox 的本地原子记录和跨系统边界。权威消息仍在所选持久事实源，Redis Stream 不因名字含“stream”就自动成为唯一聊天历史。

## 七、键设计也要写失效、最大规模与权限边界

每个候选键要带**命名空间、业务身份、数据角色、写入者、最大元素数/字节、TTL/逐出政策、版本与重建源**。例如 `preview:c-a` 是派生 Hash，最多两个本题字段和一个源版本；`recent:c-a` 是最多三 ID 的 List；`presence:u-a:dev-1` 是带 TTL 的临时 String。这里的三项/30 秒全为玩具参数，不是生产推荐值。Redis 的 `maxmemory` 策略可在内存压力下逐出键，`EXPIRE` 到期也可使键不可用；两者不能解释为数据库的消息被删除。[Redis Eviction](https://redis.io/docs/latest/develop/reference/eviction/) · [Redis EXPIRE](https://redis.io/docs/latest/commands/expire/)

若预览 Hash 命中却仍是 `seq=8`，权威数据库已是 9，这仍是**旧值 hit**；TTL 未到也不能证明新鲜。若 `candidate_members` 中还有已退群 A，不能拿 Set hit 放行私有操作。若 Stream 消费者误 `XACK` 但 B 没收到，须靠后续可靠通知/补拉协议补救，而不能篡改原 SQL 消息。对这些问题，Redis 类型解决的是**单系统访问形状**，正确性要由权威状态、版本、确认与故障恢复合同合起来保证。

## 八、用一张选型表验收，再进缓存读写竞争

把候选结构和禁用的误解成对记忆：

| 需求 | 候选 Redis 形状 | 必须保留的边界 |
|---|---|---|
| 设备近期连接提示 | String/小 Hash + 有界 TTL | 缺键是未知，不是人确实离线 |
| 会话最新预览 | 小 Hash 或 String | 派生、可重建、旧值要有版本/失效政策 |
| 候选成员包含 | Set | 不独立授权、退群要查足够新状态 |
| 用户会话列表次序 | Sorted Set | 分数来源与并列规则明确、会话数有界 |
| 最近三条 ID | 有界 List | 不代替完整历史/设备 ACK |
| 三设备短期标志 | String 上的 Bitmap | 偏移映射稳定且受限，不冒充权威已读 |
| 待处理通知 N1/N2 | Stream + 消费组 | ACK 仅在组内，保留/重投/设备结果另定 |
| 窗口速率计数 | String + INCR | 故障重置政策明确，不能替 DB next_seq |

### 分层练习与反馈

1–8 认类型与角色，9–16 手算小数据，17–22 审阅边界与故障。先写预测，再展开答案。

<details><summary>1. Redis 类型是否自动决定某份数据为权威？</summary>

不决定。角色来自业务合同、丢失政策和重建来源。</details>

<details><summary>2. 单键在线提示 `presence:u-a:dev-1` 可以先用哪种形状？</summary>

本题可用 String；TTL 到期/缺键也不能证明用户真正离线。</details>

<details><summary>3. 两字段 `last_id,seq` 的小预览为什么可选 Hash？</summary>

它们同属一个派生对象，可按字段读/更新；Hash 不自动赋予权限或持久事实地位。</details>

<details><summary>4. `INCR rate:*` 与数据库同事务分配 `next_seq` 等价吗？</summary>

不等价。Redis 单命令计数不与 SQL 消息插入自动共同提交/回滚。</details>

<details><summary>5. Set 与 Sorted Set 最直接的差别是什么？</summary>

Set 用于不重复成员与包含判断、不提供业务排序；Sorted Set 另有成员分数用于有序读取。</details>

<details><summary>6. List 弹出一项就证明 B 设备收到了吗？</summary>

不能。弹出只改变 Redis List，消费者后续可能失败。</details>

<details><summary>7. Redis Bitmap 是独立于 String 的底层数据类型吗？</summary>

不是；它是在 String 上的一组位操作。</details>

<details><summary>8. Stream 的 `XACK` 默认等于删除整条 Stream 记录吗？</summary>

不等于。它确认该消费组的处理引用；条目保留/删除是另一件事，且不证明设备交付。</details>

<details><summary>9. `candidate_members:c-a` 中有哪些用户？`u-c` 命中吗？</summary>

Set 有 `u-a,u-b`，`u-c` 不命中；这只是缓存候选结果。</details>

<details><summary>10. `u-a` 的 ZSET 中 `c-a:100,c-b:90` 降序怎样排？</summary>

`c-a` 在前、`c-b` 在后。分数是本题派生量，不是跨设备实测时间。</details>

<details><summary>11. 最近窗口 `[m-9,m-8,m-7]` 左进 m-10 后只保留三项是什么？</summary>

`[m-10,m-9,m-8]`；旧 `m-7` 可在权威历史中仍存在。</details>

<details><summary>12. 位 0、1、2 中只有 bit2=1，`BITCOUNT` 是多少？</summary>

1；只数本题受控的三个位。</details>

<details><summary>13. 可直接把字符串 `u-c` 当作 Bitmap 位偏移吗？</summary>

不能。须有稳定、受限的整数偏移映射，防稀疏巨大偏移和身份重排。</details>

<details><summary>14. G1 读 N1/N2，只 ACK N1，哪项仍 pending？</summary>

N2 在该消费组仍待确认；N1 的 ACK 不证明 B 收到。</details>

<details><summary>15. `preview:c-a` 命中 seq8，数据库已到 seq9，是新鲜命中吗？</summary>

不是。它是有值但过时，是否违约要按预览一致性合同判断。</details>

<details><summary>16. Set 中还残留已退群 A，可允许 A 发 `m-10` 吗？</summary>

不能凭此 Set 放行。成员资格须按受控权威/版本状态重新判断。</details>

<details><summary>17. 为何不能把完整 `c-a` 历史无限追加到一个 List？</summary>

会无界增长，老页范围、编辑/撤回、权限与恢复都不自然；权威历史仍由数据库合同承担。</details>

<details><summary>18. Stream N1 已 ACK 就能返回“B 已读”吗？</summary>

不能。消费组处理、设备接收、展示和已读是不同确认点。</details>

<details><summary>19. Redis `EXPIRE` 尚未到期，能保证预览仍是最新 seq9 吗？</summary>

不能。源可在 TTL 期间变化，需失效或版本检查。</details>

<details><summary>20. 缓存键因 `maxmemory` 被逐出，权威消息也被删除了吗？</summary>

不因此删除。被淘汰的是 Redis 副本；权威消息按自身数据库/恢复合同判断。</details>

<details><summary>21. SQL 插入 `m-9` 成功、Redis XADD 失败，Stream 类型会自动补齐跨系统事务吗？</summary>

不会。两系统不是同一原子提交；需 07.10 的 outbox/重试/对账等方案。</details>

<details><summary>22. 为 `candidate_members:c-a` 选 Set 前，至少还要写哪三项边界？</summary>

权威权限来源、退群后的失效/版本政策、键的最大规模与重建方式；不能只会 `SISMEMBER`。</details>

## 本章完成标准与下一步

不看答案时，能从操作形状选出本题 String/Hash/Set/ZSET/List/Bitmap/Stream 候选，手算 ZSET 排序、最近窗口、三个位和 N1/N2 pending；还能逐项说明**哪些结果不等于授权、数据库提交或 B 设备确认**，才算完成第一轮。第二轮由学习者在隔离环境核对所用 Redis 版本、命令、键大小、TTL、丢失与重建证据；本章没有代替运行。

按[学习路线](../learning_path.md)，下一章[07.03 缓存读取与更新](./03_cache_read_update.md)从 cache-aside 读取与数据库更新的交错讲旧值回填、TTL 和版本；07.04 再处理热点与集中失效。
