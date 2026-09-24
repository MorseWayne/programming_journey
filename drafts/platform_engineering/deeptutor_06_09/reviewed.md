# 06.09 日志与崩溃恢复：消息提交后还能找回吗

> DeepTutor 八节初稿经技术与教学审阅后的静态课程。`m-a`、C0–C5、日志/页状态都是**虚构的教学时间线**，不代表 OpenIM 的存储实现。这里讨论 PostgreSQL 在明确同步和可靠存储假设下的本机恢复；没有运行 SQL、数据库、Go、崩溃实验、基准或站点。S2 现有 HTTP `200` 仍只表示 `accepted_in_memory`；文中 C5 的“持久版 200”是未来教学合同的单独情景，不能反向改写 S2。

## 一、同一条消息有四个不同的“成功”

06.07 已指出：发送 `m-a` 的数据库事务可能已提交，但响应在路上丢了，客户端看到未知。06.04 又指出：一个消息数据页可以是 dirty，尚未写回。现在问：**数据库提交与数据页写回之间崩溃，消息还能找回吗？** 要先分清四层：SQL `INSERT` 执行、事务 `COMMIT` 成功、未来持久版 HTTP 响应抵达 A、B 的设备收到/已读。它们不能互相替代。

本章以 PostgreSQL WAL（Write-Ahead Logging，预写日志）为主，SQLite 与 MongoDB 只做各自官方文档范围内的对照。03.08 的文件写入/同步、06.04 的缓冲脏页、06.08 的事务版本是前置。第一遍画 C0–C5，第二遍再看 REDO、检查点、同步配置和备份目标。

| 第一遍 | 第二遍 | 可交付物 |
|---|---|---|
| 日志记录、刷写顺序、提交与页写回、C0–C5 | REDO/UNDO 概念、检查点、同步选项、备份/恢复 | 一张崩溃点判定表、一份提交未知对账与 RPO/RTO 评审 |

## 二、WAL 的核心顺序：先让恢复信息安全，再写相关数据页

数据库修改消息行和索引时，数据页可能先在缓冲池中变 dirty。若每次提交都强迫所有相关表页立即持久化，随机写开销可能很高。**WAL** 将描述修改的日志记录追加到日志；在相关数据页写回永久位置之前，足以恢复这些修改的 WAL 必须先按协议持久化。这样即使日志已安全、数据页仍旧，崩溃后也可据日志**重做（REDO）**尚未反映到数据文件的变化。PostgreSQL 官方把这作为 WAL 的中心规则。[PostgreSQL WAL](https://www.postgresql.org/docs/current/wal-intro.html)

```text
教学因果约束（同步提交场景）
数据/索引页修改 ──产生相应 WAL──> 恢复该页所需 WAL 先持久
                                          └──才允许相应数据页持久写回
提交记录达到所选同步持久边界 ────────────────> 可报告 COMMIT 成功
```

“产生 WAL 记录”“写入操作系统缓存”“按可靠存储协议 flush 后可抵抗故障”是不同阶段。06.04 的 dirty 页不是“尚未提交”的同义词；**已提交事务的数据页仍可 dirty**，未提交事务相关的数据页也可能已按 WAL 顺序写回，恢复时仍需按事务状态处理可见性。数据页写回可在事务提交之前或之后发生；提交成功**不要求**等表页写回。这个图也不证明实际设备一定诚实执行 flush；硬件缓存边界在第六节。

## 三、C0–C5：每个故障点到底能确认什么

固定一笔未来教学持久版事务：插入唯一消息 `message_id='m-a'` 并提交。假设 PostgreSQL 的本地 WAL 同步、`fsync` 与存储 flush 均按配置可靠工作；网络、复制、设备交付不进入这张本机表。时间线按先后定义如下：

| 点 | 刚刚发生的事 | 本机崩溃后能保证的业务结论 | A 客户端可能知道什么 |
|---|---|---|---|
| C0 | `BEGIN` 前 | 本事务没有写入 `m-a` | 尚未请求持久确认 |
| C1 | `INSERT` 执行过，**尚未 COMMIT** | 不能把 `m-a` 视为已提交消息 | `INSERT` 成功不等于提交 |
| C2 | 提交相关日志已产生，但尚未达到本题的可靠 WAL 持久边界 | **不能保证** `m-a` 成为已提交结果；是否碰巧留存不能从纸上断言 | 若连接断，结果未知；不能编造“必丢” |
| C3 | WAL 已按本题同步配置持久，`COMMIT` 向数据库调用者报告成功；数据页仍可 dirty | 在可靠存储假设下，崩溃恢复应保留已提交 `m-a`，必要时 REDO | HTTP 响应尚可能未发/未到，A 仍可能不知道 |
| C4 | 相关数据页也已写回 | 本机已提交结果仍应可恢复；不需要靠“每次 COMMIT 都刷表页” | 页写回本身不是给 A 的响应 |
| C5 | 未来**持久版** HTTP `200` 已到 A | 仍是本机提交结论，不自动扩展为多节点或设备确认 | A 收到该版本的持久提交回答 |

关键反例是 **C3 到 C5**：数据库已提交，服务端在响应途中失败。A 没收到 `200`，却不能直接换一个新消息 ID 再发送；要沿稳定 `m-a` 或受控操作 ID 查询权威状态，再按业务幂等合同决定下一步。反过来，C1 的 `INSERT` 成功也不能对外说“已保存”。**C2 不是“必然丢失”**，而是尚未拿到本题要求的持久证明。[PostgreSQL WAL 与同步提交](https://www.postgresql.org/docs/current/wal-intro.html) · [PostgreSQL WAL 配置](https://www.postgresql.org/docs/current/runtime-config-wal.html)

这里绝不改写已有 S2 合同：S2 `200 accepted_in_memory` 只确认进程内受理；未来 S3 v2 若选择“数据库提交后返回 `stored_in_teaching_db`”，还要明确本机/复制/存储故障范围。即使 C5 的 A 收到了该未来回答，B 的在线推送、离线补拉、展示与阅读也分别需要证据。

## 四、REDO 与 UNDO：知道名词，更要看引擎怎样实现

**REDO** 是依据持久日志把缺失的修改重新施加到数据文件；C3 后数据页没写回时，它解释为什么 `m-a` 仍能恢复。**UNDO** 是撤销未完成事务影响的通用恢复概念；教材常把二者成对讲，但不能据此断言 PostgreSQL 对每个事务都写一条传统的独立 UNDO 日志。PostgreSQL 使用 WAL 与 MVCC/事务状态处理崩溃后的已提交和未提交结果。对 C1/C2，正确表述是：**没有满足持久提交证明，就不能把消息当作已提交的业务事实**，而非“看见某条日志就算提交”。[PostgreSQL WAL 与 REDO](https://www.postgresql.org/docs/current/wal-intro.html) · [PostgreSQL MVCC](https://www.postgresql.org/docs/current/mvcc-intro.html)

还要考虑**部分页写入**：一次数据页写回可能在掉电时只完成一部分。PostgreSQL 的 `full_page_writes` 等机制在需要时把完整页映像纳入 WAL，帮助恢复部分写坏的页；这不是“所有页每次修改都完整写进日志”。具体配置和可靠硬件仍影响保证范围。[PostgreSQL Reliability](https://www.postgresql.org/docs/current/wal-reliability.html)

再区别“本机可恢复”与“业务能对账”。REDO 恢复了 `m-a`，若客户端不知道结果，仍要按稳定业务键查询。唯一键/幂等约束可避免重复插入，但不自动完成对端设备投递；恢复后的推送或补拉要在后续可靠消息课程中独立设计。

## 五、检查点：缩短重做起点，不能替代提交或备份

**检查点（checkpoint）**把某一时点以前应体现在表/索引文件中的修改推进到数据文件，并记录一个恢复参考点。PostgreSQL 崩溃恢复可从相应 redo 位置开始，而不必从数据库创建之初重放全部 WAL。检查点要刷大量 dirty 页，因此也会产生 I/O；过于频繁可能增加写负担和后续 WAL 全页映像量，过于稀疏则可能增大恢复时需重做的工作。[PostgreSQL WAL Configuration](https://www.postgresql.org/docs/current/wal-configuration.html)

检查点**不是每笔事务的 COMMIT**，不意味着 C3 前就必须已刷数据页；它也**不是一份可脱离源数据库保存的备份**。旧 WAL 能否回收还受归档、复制槽和其他保留需求影响，不能简单说“检查点后所有旧日志立即可删”。03.08 的文件同步告诉我们持久名称和数据另有边界；这里的检查点由数据库管理其数据文件与 WAL 的相对进度。

操作层面要区分两个目标：**RPO** 是可接受的最大数据丢失范围，**RTO** 是从故障到恢复服务的目标时长。更频繁检查点可能改变恢复工作量，但不替代明确的备份、WAL 归档、恢复演练、跨节点故障方案；也不能凭“有副本”推断有人误删整段历史后能找回。备份恢复/时间点恢复要有完整链条并实际演练，[06.11](../../../src/docs/platform_engineering/curriculum/06_databases/11_replication_migration_reconciliation.md)再接复制迁移。[PostgreSQL WAL 与时间点恢复](https://www.postgresql.org/docs/current/wal-intro.html)

## 六、同步选项与设备：把“提交成功”的故障模型写在纸上

PostgreSQL 当前文档区分 `synchronous_commit` 与 `fsync`。在没有同步备库要求时，非 `off` 的本地同步提交模式等待本地 WAL flush；`synchronous_commit=off` 可以**先报告成功、后完成所需 WAL 持久化**，因此崩溃可能丢失最近已向客户端报告成功的事务，但不会因此把数据库状态随意改成一半提交。`fsync=off` 则可能使掉电/系统崩溃后的数据库一致性无法保证，是另一层风险。**同步本机 WAL ≠ 同步到副本**，副本确认还受复制设置与所选同步模式影响。[PostgreSQL WAL 参数](https://www.postgresql.org/docs/current/runtime-config-wal.html)

还不能忘记操作系统页缓存、控制器/设备写缓存和供电：数据库发出 flush 请求，需要底层确实遵守持久语义。若硬件错误地提前确认，C3 的前提被破坏；这不是应用层重试能修好的。PostgreSQL 官方可靠性文档逐层描述这些缓存与部分页写入问题。[PostgreSQL Reliability](https://www.postgresql.org/docs/current/wal-reliability.html)

把 C3 判定写成条件句比背“COMMIT 必不丢”准确：**在所用引擎版本和同步配置兑现本地持久承诺、且底层存储可靠的故障模型下，C3 后本机重启应恢复已提交 `m-a`。** 这不自动覆盖整机磁盘毁坏、多个节点同时故障、管理员误删、跨区域灾难或客户端收到响应的证据。后者要分别依靠备份、复制和业务对账设计。

## 七、SQLite 与 MongoDB：同样有日志，确认口径不同

SQLite 的 WAL 模式把变更追加到 WAL 文件，之后通过 checkpoint 将内容合并回主数据库文件；读写并发与 checkpoint 能否完成有它自己的规则。这个机制帮助理解“日志已含变更、主数据文件尚未合并”，但**SQLite 的 WAL 结构/锁、同步 PRAGMA 和 PostgreSQL 的事务/检查点行为并非同一实现**。不能把 C3 的 PostgreSQL 参数名称搬到 SQLite。[SQLite WAL 官方文档](https://www.sqlite.org/wal.html)

MongoDB WiredTiger 也有 journal；日志何时被同步到存储与写关注（包括是否要求 journal 确认）、副本确认条件和集群配置有关。`j: true` 关注 journal 相关确认，不等于 B 设备已收到；`w: majority` 的含义也不能脱离版本/配置单独称“所有副本已持久”。本章只据 MongoDB 官方说明作口径对照，不推断 OpenIM 的实际写关注或 WAL 路径。[MongoDB Journaling](https://www.mongodb.com/docs/manual/core/journaling/)

| 问题 | PostgreSQL 教学路径 | SQLite/MongoDB 对照时要重新核对 |
|---|---|---|
| “日志安全”指什么 | 本机 WAL flush 与配置/设备前提 | SQLite WAL 同步模式；MongoDB journal/write concern |
| 主数据页何时写回 | 允许晚于事务提交，检查点推进 | SQLite checkpoint 合并；MongoDB 存储引擎策略 |
| “已回答成功”覆盖什么 | 按本章选的本机故障模型 | 各引擎版本、配置和复制确认范围 |

## 八、用业务需求验收恢复方案

交付一个两列账本：左列写“**故障发生在 C0–C5 的哪个点，哪些事实已有证据**”，右列写“**客户端/运营下一步查哪个稳定 ID、以哪个故障模型给答案**”。再为未来持久版 IM 需求写出 RPO/RTO、备份与日志归档范围、恢复演练方式、重复请求政策和设备补拉证据。没有这些，单凭“用了 WAL”不能承诺零丢失或及时恢复。

### 分层练习与反馈

1–8 先分清提交/页/日志，9–16 手算故障点，17–22 评审配置与业务恢复。先预测，再展开答案。

<details><summary>1. `INSERT m-a` 返回成功就等于事务已提交吗？</summary>

不等于。它可处于 C1：语句执行了，事务仍未 COMMIT。</details>

<details><summary>2. dirty 数据页表示事务尚未提交吗？</summary>

不表示。已提交事务的数据页仍可 dirty，未提交状态也不能只凭 dirty 位判断。</details>

<details><summary>3. WAL 的关键持久顺序是什么？</summary>

恢复相关数据页修改所需的日志要在该修改的数据页持久化之前按协议先具备；同步提交还需满足相应 WAL 持久边界。</details>

<details><summary>4. WAL 记录刚在内存里生成，与可靠 flush 完成一样吗？</summary>

不一样。生成、写入 OS 缓存和持久 flush 是不同阶段。</details>

<details><summary>5. REDO 在本题解释什么？</summary>

日志已持久且事务提交，但数据页未反映全部修改时，恢复可按日志重做缺失部分。</details>

<details><summary>6. PostgreSQL 必然为每个事务维护一份教材式独立 UNDO 日志吗？</summary>

不能这样断言。UNDO 是通用概念；PostgreSQL 的 WAL、MVCC 和事务状态有其具体恢复实现。</details>

<details><summary>7. 检查点等于 COMMIT 或备份吗？</summary>

都不等于。它推进数据文件与恢复起点，但不是每笔业务提交或独立可恢复副本。</details>

<details><summary>8. 数据库提交能证明 B 设备已读吗？</summary>

不能。持久数据、在线投递、展示和阅读分别需要证据。</details>

<details><summary>9. C0 崩溃时本事务有 `m-a` 提交吗？</summary>

没有。本题 `BEGIN` 尚未发生。</details>

<details><summary>10. C1 崩溃后可向 A 说“肯定已保存”吗？</summary>

不能。`INSERT` 后尚未 COMMIT。</details>

<details><summary>11. C2 日志已产生但未达可靠持久边界，消息一定丢吗？</summary>

不能说一定丢，也不能保证已提交恢复；需看实际恢复/权威状态。纸上只有“持久证明不足”。</details>

<details><summary>12. C3 数据页还 dirty，本机崩溃后为何仍可恢复？</summary>

在本题同步 WAL 与可靠存储前提下，已提交记录持久，恢复可 REDO 尚未写回的数据页修改。</details>

<details><summary>13. C4 页写回了，A 就一定收到 HTTP 200 吗？</summary>

不一定。页写回是数据库内部事件，响应可能尚未发出或在网络途中丢失。</details>

<details><summary>14. C3 到 C5 响应丢失，A 应直接生成新 ID 重发吗？</summary>

不应。先用稳定 `m-a`/操作 ID 查权威提交状态，再按幂等合同处理未知。</details>

<details><summary>15. 当前 S2 HTTP 200 能按本章 C5 解读为数据库持久吗？</summary>

不能。S2 现有合同是 `accepted_in_memory`；C5 属于未来持久版的单独教学情景。</details>

<details><summary>16. 检查点越频繁就一定越好吗？</summary>

不一定。可能缩短恢复重做范围，但增加脏页刷写及某些 WAL 开销，要按负载和恢复目标权衡。</details>

<details><summary>17. `synchronous_commit=off` 与 `fsync=off` 风险完全一样吗？</summary>

不一样。前者可使近期已报成功事务在崩溃后丢失；后者还可能破坏数据库崩溃后一致性。</details>

<details><summary>18. 本机 WAL 已同步，就等于同步副本也确认了吗？</summary>

不等于。复制条件、同步备库和所选提交模式要另外核对。</details>

<details><summary>19. 存储控制器提前谎报 flush 完成，会影响哪条前提？</summary>

破坏 C3“WAL 可靠持久”的前提；数据库应用层无法从一次成功返回单独证明底层硬件可靠。</details>

<details><summary>20. SQLite 的 WAL checkpoint 可直接按 PostgreSQL `checkpoint_timeout` 推断吗？</summary>

不能。两引擎的日志、参数和检查点实现要按各自文档核对。</details>

<details><summary>21. MongoDB `j: true` 证明 B 设备收到了消息吗？</summary>

不能。它属于存储日志相关写关注条件，与 IM 对端设备确认分层不同。</details>

<details><summary>22. 写一个最小“本机可恢复”之外还必须回答的业务问题。</summary>

例如：若整机磁盘损坏，允许最多丢多少消息（RPO）、多久恢复服务（RTO）、备份/WAL 归档是否齐全，客户端未知提交如何凭稳定 ID 对账，以及离线设备怎样补拉。</details>

## 本章完成标准与下一步

能不看答案画出 C0–C5，准确区分“未保证”“已在本机同步假设下可恢复”“A 客户端知道”“B 设备收到”；能解释 WAL 顺序、REDO、检查点与同步选项，才算完成第一轮。第二轮在学习者自己的隔离环境安排崩溃/恢复演练，保存版本、配置、故障注入点与权威查询结果；本文没有替代这些实验。

按[学习路线](../../../src/docs/platform_engineering/curriculum/learning_path.md)，下一章[06.11 复制、迁移与对账](../../../src/docs/platform_engineering/curriculum/06_databases/11_replication_migration_reconciliation.md)将把单机提交扩展到副本、迁移和对账；06.12 再做完整消息存储案例。
