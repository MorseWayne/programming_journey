---
title: 06.06 查询执行与优化：从历史分页读懂计划
icon: /assets/icons/article.svg
order: 7
date: 2026-09-24
---

[返回第六卷](./README.md) · [SQL 前置：06.02](./02_sql_queries.md) · [页前置：06.04](./04_pages_buffer_pool.md) · [索引前置：06.05](./05_index_structures.md)

# 06.06 查询执行与优化：从历史分页读懂计划

> DeepTutor 八节初稿经技术与教学审阅后的静态课程。表、行数、计划树、统计与时间数字均为**虚构纸上材料**，不冒充 PostgreSQL、MongoDB 或 OpenIM 的运行记录。没有执行 SQL、数据库、Go、基准或站点。真实计划的节点与字段要以所用引擎、版本、数据分布和实际运行证据核对。

## 一、同一条 SQL 为什么可以走不同路线？

06.02 已会写查询，06.05 已知道 `(conversation_id,seq)` 可以让同一会话的键相邻。本章回答下一层问题：数据库究竟怎样把 SQL 的**逻辑要求**变成一串**物理操作**？逻辑要求说“满足条件的行，按指定顺序取前三条”；执行计划说“先从哪里读候选，在哪里过滤、排序、连接、限制”。同一个结果可以由不同计划产生，成本却可能不同。

固定小数据：`messages` 中 `c-a` 有 `seq=1..8` 八行，`c-b` 有 `seq=1..3` 三行，共 **11 行**。教学 SQL 如下；应用层仍须有可信身份和成员资格检查，本节第五部分再把会员表接入。

```sql
SELECT seq FROM messages
WHERE conversation_id = 'c-a' AND seq < 7
ORDER BY seq DESC LIMIT 3;
```

符合 `WHERE` 的是 `c-a` 的 **1..6 共 6 行**；排序成 `6,5,4,3,2,1`，最终返回 **6、5、4**。先写出这个独立预期，再谈计划：若执行计划跑得快却返回 `7` 或混入 `c-b`，它仍是错误查询。

把执行计划看作一棵**从叶到根流动行**的树。叶节点通常负责产生候选行，父节点继续过滤、连接、排序、聚合或限制。树上的 `rows` 可指节点向父节点**输出**的行数，并不自动表示它扫描了多少原始行。PostgreSQL 的 `EXPLAIN` 文档用扫描节点以及上层排序、连接节点说明这一点。[PostgreSQL Using EXPLAIN](https://www.postgresql.org/docs/current/using-explain.html)

| 第一遍 | 第二遍 | 交付物 |
|---|---|---|
| SQL 语义、扫描、过滤、排序、Limit、两条纸上计划 | 成员连接、聚合、选择率、估计/实际和证据限制 | 两张候选计划树、一张行数账、一份慢历史评审单 |

## 二、两条纸上计划：输出相同，做的工作不同

**路径 A：利用复合有序索引。** 假设索引 `(conversation_id,seq)` 适合这个范围及方向，执行器先定位 `c-a` 中严格小于 7 的边界，然后向前得到 6、5、4，上层 `Limit` 收满三条停止。这是 06.05 的 L2→L1 两张**玩具索引叶页**遍历。若选择列只有 `seq`，某些引擎/可见性条件下可能在索引内满足；若还要正文、权限状态或版本检查，可能访问表数据页。**纸上三项候选不是生产数据库精确读取数。**

```text
Limit 3
└─ 复合索引有序范围扫描：c-a 中 seq<7，逆序产出 6,5,4,…
```

**路径 B：扫描并排序。** 按这 11 行纸上执行：扫描 `messages` 的 11 行，过滤剩 `c-a` 的 1..6 共 6 行，对六行按 `seq DESC` 排序，再取前三条。输出仍是 6、5、4。若表很小或大量行都满足条件，数据库可能觉得扫描更便宜；若表很大且只查三条，索引早停可能有优势。没有数据规模、页/缓存与统计证据，不能根据“Seq Scan”四个字就认定计划差。[PostgreSQL EXPLAIN：扫描、Sort 与 Limit](https://www.postgresql.org/docs/current/using-explain.html)

```text
Limit 3                         输出 3：6,5,4
└─ Sort seq DESC                输入 6：1..6；输出有序 6,5,4,3,2,1
   └─ Filter c-a 且 seq<7      输入 11；输出 6
      └─ Seq Scan messages      产出 11 个教学行
```

这里的 `Filter` 是教学步骤标签，不是粘贴的 PostgreSQL 真实 plan：真实 `Seq Scan` 节点可直接带 `Filter` 条件。上图的“输入/输出行数”只针对**固定 11 行**，不包含成员表、MVCC、索引页与字节宽度。即使两计划都返回 3 行，上游可能已处理 3 项、6 行或 11 行，`LIMIT 3` 不意味着整个查询必然只读 3 行。

## 三、扫描节点和谓词位置：看它在哪里丢弃候选

**Seq Scan** 按表访问路径检查记录；**Index Scan** 从索引找到候选，并可能按索引记录位置取表行；**Index Only Scan** 只在列覆盖且可见性条件满足时才可能少取表页；**Bitmap Index Scan + Bitmap Heap Scan** 先从索引汇集行位置，再按数据页组织回访，可能丢掉原有索引顺序。名字相近，工作流不同。PostgreSQL 文档展示这些节点，以及为什么规划器会按选择率换计划。[PostgreSQL 扫描计划示例](https://www.postgresql.org/docs/current/using-explain.html) · [Index-Only Scan 条件](https://www.postgresql.org/docs/current/indexes-index-only-scans.html)

读计划时把三个位置分别圈出：`Index Cond` 是能约束索引查找的条件；`Filter` 是拿到候选后再判断的条件；`Recheck Cond` 出现在特定需再次核对的路径中，例如位图堆扫描。一个字段出现在 SQL 的 `WHERE` 并不保证它成为 `Index Cond`。例如只有 `seq` 索引，却还要验证 `conversation_id='c-a'`，后者可能成为后置过滤，读取候选远多于最终三行。也不能把 `Rows Removed by Filter` 理解为全部表中被排除的行；它属于具体节点和具体执行循环。

`Limit` 可以令某些能逐行产出的下层算子早停，但普通完整 `Sort` 可能先消费全部候选才知道前三名；Top-N 算法可以少保存中间结果，却仍可能需要检查全部输入。位图构建、聚合与连接也可能需要先做准备工作。计划节点的**启动成本**和**总成本**因此都有意义，不能只看最上面的返回三行。`cost` 是规划器比较路径的相对单位，**不是毫秒**；上层成本含子节点成本，不能逐层相加当总耗时。[PostgreSQL EXPLAIN cost 说明](https://www.postgresql.org/docs/current/using-explain.html)

## 四、排序、分页与未读聚合：需求改变，算子也改变

有序索引可能直接给出 `seq DESC`；没有可用顺序时可能显式 `Sort`。数据库还可能利用已按某些前缀排序的输入做增量排序。**没有 `ORDER BY` 就不能承诺查询自然按插入顺序或索引顺序返回**；即使当前看起来稳定，下一次计划或并发变化也可能改顺序。[PostgreSQL ORDER BY 文档](https://www.postgresql.org/docs/current/queries-order.html) · [EXPLAIN Sort/Incremental Sort](https://www.postgresql.org/docs/current/using-explain.html)

OFFSET 分页要越过前面的结果，偏移越深可能处理越多候选；本系列历史接口用 `seq<上页游标`，让范围条件表达“更旧”。但游标只解决稳定**排序边界**，不能自动保证跨请求的同一事务快照、删除后位置、成员资格变化或多设备同步语义。若排序键不唯一，要用完整的次级键组成游标；06.05 已讲。

换一个业务问题：`c-a` 的 `read_seq=4`，若“未读”在本题仅定义为该会话 `seq>4` 的消息数，则 5、6、7、8 共 **4 条**。SQL 的 `COUNT(*)` 需要聚合。按会话分组统计时，可用哈希分组、按键有序的分组聚合，或其他计划，取决于条件与输入顺序；不能把 `COUNT(*)` 偷换成总消息数，更不能把“未读 4”当成已读回执的完整业务定义。聚合也可能处理许多行后才输出一个结果，外层 `LIMIT 1` 不保证只看一行。

| 业务形状 | 主要算子问题 | 可手算的结果 |
|---|---|---|
| 更旧三条 | 条件、排序、Limit 是否早停 | `6,5,4` |
| 当前未读条数 | `seq>read_seq` 与计数如何定义 | `5..8`，共 4 |
| 多会话未读汇总 | 先按会话聚合还是连接回执 | 需明确各会话 `read_seq`，本题资料不足 |

## 五、成员权限进入计划：连接算法改变成本，不改变授权规则

设 `memberships` 中有且仅有一条本题所需记录 `(user_id='u-a', conversation_id='c-a', active=true)`。应用仍需先确认请求身份可信。教学 SQL 若把会员资格写成与消息的内连接，逻辑结果为这位会员可见的 `c-a` 历史候选六行，再按 `seq DESC` 取三行；不能因为消息索引定位很快就跳过资格判断。

```sql
SELECT m.seq
FROM memberships AS p
JOIN messages AS m ON m.conversation_id = p.conversation_id
WHERE p.user_id = 'u-a' AND p.conversation_id = 'c-a'
  AND p.active = TRUE AND m.seq < 7
ORDER BY m.seq DESC LIMIT 3;
```

**Nested Loop** 可先找到这 1 条合格会员，再对它查一次同会话的消息范围，纸上内侧产生 6 个条件候选，最终限制到 3；若外侧有 1000 条会员，重复内侧查询的工作可能急增。**Hash Join** 可先把一侧连接键建成哈希表，再探测另一侧；**Merge Join** 则利用双方按连接键有序的输入逐步归并。三者都要保证相同 SQL 语义，选择取决于输入行数、索引、排序、内存和估计；“有索引所以一定 Nested Loop”不是定律。[PostgreSQL EXPLAIN 的连接示例](https://www.postgresql.org/docs/current/using-explain.html)

注意连接条件与过滤条件的执行位置：优化器可在不改变结果的前提下重排内连接路径；但外连接的 `Join Filter` 和普通 `Filter` 有不同的保留行语义，不能照搬内连接推理。权限表也可能不是一个简单布尔位：退群、历史可见范围、租户隔离都要有明确合同。计划优化只在**正确权限语义已写入查询或安全边界**后才有意义。

## 六、选择率与统计：估计错在哪里，比“换索引”更先问

**选择率**可先理解为一个条件通过的行数除以它实际检查的输入行数。本题全表 11 行，`conversation_id='c-a'` 通过 8 行，选择率 `8/11≈72.7%`；再加 `seq<7`，最终 6 行，合并条件选择率 `6/11≈54.5%`。在已是 `c-a` 的 8 行内部，`seq<7` 的条件选择率是 `6/8=75%`。**分母不同，百分比不能随意相乘**。若字段相关、热门会话和冷门会话差异大，把单列分布当独立可能误估输出行数。

PostgreSQL 的规划器利用 `ANALYZE` 收集的采样统计（如分布、常见值等）估算条件行数；对某些跨列相关性，还可定义扩展统计。估计是输入，不是实际观测。统计过旧、样本不代表热点、参数值或字段相关都可能造成“估 2 行，实际很多行”之类偏差，从而选错扫描或连接策略。`rows` 是计划节点预计**输出**行数，不是读过的原始行数；`width` 是预计输出行宽字节数；`cost=startup..total` 是相对成本，不是 P95。[PostgreSQL 规划器统计](https://www.postgresql.org/docs/current/planner-stats.html) · [EXPLAIN 字段解释](https://www.postgresql.org/docs/current/using-explain.html)

把“统计误差导致坏计划”当作可检验假设：先记录真实参数、表规模、索引、统计更新时刻、估计行数与实际行数，再查看差异最早发生在哪个节点。估计很准却仍慢，可能是回表、排序临时文件、缓存、锁等待或客户端/网络等另一层问题；不能每次都只执行 `ANALYZE` 或加索引。`EXPLAIN ANALYZE` 本身有测量开销，业务 P95 要用同窗口、同请求口径另行观察。

## 七、读计划的正确顺序与看不到的东西

第一步读**SQL 语义**：是否包含会员条件、稳定排序与游标。第二步从计划树叶子向上读：哪里扫描、哪里 `Index Cond` 或 `Filter`、有没有 `Sort`/聚合/连接、`Limit` 在哪。第三步比较估计与实际；PostgreSQL 的 `actual rows` 在节点执行多次时是**每次执行的平均输出行数**，须结合 `loops` 才能理解总输出量。第四步看 `Rows Removed`、`Heap Fetches`、排序方式/临时空间，以及 `BUFFERS`。上层节点的缓冲计数可包含子节点，不要逐层相加；`shared hit/read` 是 PostgreSQL 缓冲页访问，**不是物理设备 I/O 精确次数**。[PostgreSQL EXPLAIN ANALYZE](https://www.postgresql.org/docs/current/using-explain.html)

`EXPLAIN` 用于看计划而不实际执行查询；`EXPLAIN (ANALYZE, BUFFERS)` 会**实际执行**，只是不把 SELECT 结果按通常方式返回客户端。对 `INSERT`、`UPDATE`、`DELETE` 等写语句，副作用照样发生；学习者将来若做实验，必须先选隔离环境和可回滚方案，不要在业务数据上把它当只读命令。即便 `BEGIN; ...; ROLLBACK;` 可用于某些数据库写语句示例，也应核对外部副作用、触发器和版本行为。[PostgreSQL EXPLAIN 命令](https://www.postgresql.org/docs/current/sql-explain.html)

不要把数据库内的 `Execution Time` 等同端到端历史请求 P95：身份解析、连接等待、网络、序列化、应用排队与客户端渲染在计划之外。MongoDB 的 `explain` 有自己的查询计划与 `nReturned`、`totalKeysExamined`、`totalDocsExamined` 等字段；`totalDocsExamined` 按检查次数计，未必是不同文档数。它与 PostgreSQL 的 `Heap Fetches`/`BUFFERS` 没有一一换算关系。[MongoDB Explain Results](https://www.mongodb.com/docs/manual/reference/explain-results/)

## 八、从慢历史症状到可复核评审

设用户报告“历史翻页 P95 从 60 ms 升到 240 ms”，这是**虚构症状**，沿用 03.10 的教学口径。先固定接口、时间窗、样本数、游标范围、会话热点、权限与返回条数；再检查 SQL 与索引定义、具体参数、计划节点、估计/实际差异、缓冲访问、回表、排序溢出和锁/队列。每一项都可能支持或反驳某个假设。不能从一次 `Seq Scan`、一次 `shared read` 或一张纸上 L2/L1 图推出根因。

| 假设 | 要找的证据 | 若证据不支持 |
|---|---|---|
| 缺少会话+序号访问路径 | 实际过滤/排序、扫描候选、既有索引定义 | 转查选择率、缓存或等待 |
| 估计失准使计划不合适 | 具体节点估计/实际、统计与参数分布 | 看执行器真实工作和其他耗时 |
| 索引扫描回表多 | `Heap Fetches`/表访问、行宽与覆盖条件 | 看排序、连接、锁和业务链路 |
| 计划快但接口仍慢 | 数据库执行时长与请求 Trace/P95 同窗 | 检查测量口径和其他请求阶段 |

### 分层练习与反馈

1–8 先练语义和算子，9–16 推演计划与统计，17–22 评审业务证据。先独立写答案，再展开反馈。

<details><summary>1. 固定 11 行中，`c-a` 有几行？</summary>

8 行，序号 1..8；另外 3 行属于 `c-b`。</details>

<details><summary>2. `c-a AND seq<7` 过滤后剩几行？</summary>

6 行，即 `c-a` 的序号 1..6；严格小于不含 7。</details>

<details><summary>3. 降序 `LIMIT 3` 的正确结果是什么？</summary>

`6,5,4`。结果预期先于计划优劣判断。</details>

<details><summary>4. 计划树中的叶节点主要做什么？</summary>

产生候选行，例如从表扫描或索引路径获取；上层再过滤、连接、排序或限制。</details>

<details><summary>5. 最上层输出 3 行，是否说明底层只读了 3 行？</summary>

不说明。全扫描方案先看 11 行、过滤 6 行、排序后才取 3；其他节点也可能先消费输入。</details>

<details><summary>6. `cost=20..50` 应解释为 20–50 ms 吗？</summary>

不应。它是规划器的相对成本，不能直接换成真实毫秒或接口 P95。</details>

<details><summary>7. SQL 没有 `ORDER BY`，能保证自然按 `seq` 返回吗？</summary>

不能。输出顺序需要显式约定，不能依赖当前索引或插入顺序。</details>

<details><summary>8. `Index Cond` 和 `Filter` 的问题各是什么？</summary>

前者可限制索引访问范围，后者通常在候选出来后进一步检查；同一个 SQL 条件落在哪里要看具体计划。</details>

<details><summary>9. 纸上 Seq Scan 方案扫描、过滤、排序输入和最终输出分别多少行？</summary>

依次是 11、6、6、3。Sort 的输入为过滤后的六行。</details>

<details><summary>10. 纸上索引方案为什么可能提前停？</summary>

若访问路径已按所需顺序逐行产出，取得前三个合格可见结果后，上层 Limit 不再需要后续键；若还要权限或版本过滤，可能检查超过三项。</details>

<details><summary>11. Bitmap Index Scan 后仍可能出现 Sort 吗？</summary>

可能。位图路径按行位置回访通常不保留原索引键序；最终 `ORDER BY` 仍要满足。</details>

<details><summary>12. `read_seq=4` 且本题未读定义为 `seq>4`，`c-a` 未读几条？</summary>

5、6、7、8 共 4 条；这只是本题简化规则，不等于完整已读状态语义。</details>

<details><summary>13. 有一个合格会员，Nested Loop 内侧纸上取到六个条件候选；这证明真实数据库选 Nested Loop 吗？</summary>

不证明。它只是可行的纸上计划；真实选择由统计、索引、版本和代价决定。</details>

<details><summary>14. Hash Join 与 `message_id` 哈希索引是同一个东西吗？</summary>

不是。Hash Join 为连接输入临时构造/使用哈希匹配；哈希索引是表上的持久访问结构，两者都用散列思想但职责不同。</details>

<details><summary>15. `c-a` 在全表中的选择率是多少？</summary>

`8/11≈72.7%`。分子是 c-a 的 8 行，分母是全表 11 行。</details>

<details><summary>16. `c-a AND seq<7` 在全表的选择率是多少？在 c-a 内部呢？</summary>

全表是 `6/11≈54.5%`；已限定 c-a 后是 `6/8=75%`。两个分母不同。</details>

<details><summary>17. 计划写 `actual rows=2 loops=5`，可粗略理解为共输出多少行？</summary>

约 10 行输出（每次平均 2，执行 5 次）。还要留意显示精度和该节点是否在每次循环都完整运行。</details>

<details><summary>18. `shared read=4` 代表物理设备恰好读了四次吗？</summary>

不代表。它描述 PostgreSQL 缓冲块访问口径，操作系统缓存和存储层还会影响设备 I/O。</details>

<details><summary>19. `EXPLAIN ANALYZE UPDATE ...` 是只读查看吗？</summary>

不是。ANALYZE 会执行语句，写操作的副作用会发生；将来只能在安全隔离和明确回滚/副作用边界下练习。</details>

<details><summary>20. 发现估计 2 行、实际很多行，就必然要新建索引吗？</summary>

不必然。先核对统计时间、参数值、字段相关和偏差首次出现的节点；索引是否有益还要测读写空间成本。</details>

<details><summary>21. MongoDB `totalDocsExamined=20` 可以直接换算 PostgreSQL `Heap Fetches=20` 吗？</summary>

不能。两引擎的执行与计数口径不同；MongoDB 同一文档被多次检查还可能计多次。</details>

<details><summary>22. 接口 P95 升到 240 ms，但数据库计划节点耗时很短，下一步查什么？</summary>

对齐同窗口请求 Trace 与数据库执行样本，检查连接等待、应用队列、权限、序列化、网络与客户端阶段，并核对抽样与计划开销；不能直接宣布数据库无关或凭单次计划定根因。</details>

## 本章完成标准与下一步

能在不看答案时从 11 行手算两条计划都返回 `6,5,4`，指出两条路径候选工作量的区别；能把成员权限接入正确语义，解释扫描/连接/排序/聚合与选择率，并在计划上区分**估计、实际、缓冲访问、设备 I/O 和端到端 P95**，才算完成第一轮。第二轮用自己的隔离数据执行只读查询与计划核对，保存版本、参数、数据规模和原始结果；本课程没有代替学习者运行。

按[学习路线](../learning_path.md)，下一章[06.08 锁与 MVCC](./08_locks_mvcc.md)将从并发读写追问锁与 MVCC 如何决定“看见哪一版”，06.09 再解释日志与崩溃恢复；06.07 的事务异常是这两章的语义前置。
