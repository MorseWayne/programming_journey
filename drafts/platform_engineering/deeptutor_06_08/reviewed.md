# 06.08 锁与 MVCC：退群时谁看见哪一版

> DeepTutor 八节初稿经技术与教学审阅后的静态课程。用户、事务、版本与时间点都是**虚构的纸上模型**，不代表 PostgreSQL 的真实元组字段、MongoDB 的内部版本链或 OpenIM 实现。没有运行 SQL、数据库、Go、并发实验或站点；具体隔离与锁行为按所引官方文档限定。

## 一、业务先提出顺序要求：发送和退群不能各自猜

06.07 固定了业务合同：虚构用户 `u-a` 是会话 `c-a` 的活跃成员，同时有“发送 `m-a`”与“退出 `c-a`”两个请求。若发送决定先成立并提交，消息可保留，之后再退群；若退群先完成，发送应拒绝。这里的“先”应由**共同的数据库冲突/决策边界**建立，不按两个客户端按钮时间或网络先后猜。数据库提交、HTTP 回答、对端设备收到/已读依然是不同确认点。

上一章说明普通 `SELECT active` 在 Read Committed 下可能很快变旧。本章把“旧”拆成两个机制：**MVCC（多版本并发控制）**决定一次读取能看见哪个已提交版本；**锁**协调两笔要修改或决定同一资源的事务。前者让普通读取不必总等待当前写入结束，后者让冲突写入与需要互斥的决策有秩序。普通快照读、锁定读和应用业务授权不是同一个操作。[PostgreSQL MVCC 介绍](https://www.postgresql.org/docs/current/mvcc-intro.html)

| 第一遍 | 第二遍 | 交付物 |
|---|---|---|
| 行版本、快照、普通读、同一成员行的锁顺序 | 锁冲突/死锁、写偏斜、Serializable、长事务回收与跨引擎边界 | 两张交错时间线、一张等待图、一份可见性/冲突评审 |

## 二、两个版本、一张快照：可见不等于现在仍可发送

从一个**教学成员行**开始：`(c-a,u-a)` 的已提交版本 `v0` 为 `active=true`。这里的 `active` 只是 06.07 中 `left_at IS NULL` 的易读简称，**不另加一列**。退群事务 `Tleave` 写一个新状态 `v1: active=false`，对应 `left_at` 有值；在它提交之前，其他普通读不能把未提交的 `v1` 当成已生效退群。它提交后，后来的读可能选到 `v1`。这里 `v0/v1` 只是解释可见性的标签，**不是 PostgreSQL 元组布局或事务 ID 规则**。

```text
时刻        t0           t1              t2             t3
Tleave      —          写 v1 未提交       提交 v1          —
普通读可见  v0         v0（不读脏数据）   取决于快照       新语句可见 v1
```

PostgreSQL **Read Committed** 的普通 `SELECT` 每条语句看该语句开始时的已提交快照，事务自己先前的写入也可见。因此 `Tsend` 在 t0 查到 `v0=true`，若 `Tleave` 在下一条 SELECT 前提交，`Tsend` 第二次普通 SELECT 可看到 `v1=false`。两次答案不同是该级别允许的**不可重复读**，不是数据库把未提交数据读脏。[PostgreSQL 事务隔离](https://www.postgresql.org/docs/current/transaction-iso.html)

在 PostgreSQL **Repeatable Read** 下，同一事务建立快照后，后续普通读取保持相应稳定视图；若 t0 已看见 `v0`，即使 `Tleave` 随后提交，`Tsend` 的普通重复读取仍可能见 `v0`。这能让读一致，**不能据此许可晚于退群的发送**。若它随后要锁定或改动一个在快照后被别人改过的行，可能收到并发失败而需重启事务；不要想象它可凭旧 `v0` 无条件取得锁并提交。[PostgreSQL Repeatable Read/锁行为](https://www.postgresql.org/docs/current/transaction-iso.html) · [显式行锁](https://www.postgresql.org/docs/current/explicit-locking.html)

数据库内部还要管理旧版本什么时候能回收。某个旧快照仍可能需要 `v0`，所以“新版本已提交”不等于旧版本立即可删除；第六节再谈长事务。MVCC 处理**读取视图**，业务“退群与发送按何顺序生效”还需要共同冲突点或更强约束。

## 三、在同一成员行协调：两种合法顺序都要手算

对 PostgreSQL 教学 SQL，可以把发送事务的成员检查改成锁定读：

```sql
SELECT 1 FROM members
WHERE conversation_id = 'c-a' AND user_id = 'u-a' AND left_at IS NULL
FOR UPDATE;
```

这句只是**片段**：它须在包含后续消息写入的同一事务中执行，所有退群路径也须更新/删除同一成员行并遵循相同业务规则；找不到行或行已非活跃，就拒绝而不插入 `m-a`。`FOR UPDATE` 锁住实际返回的行直到事务结束，可使另一事务对同一行的冲突更新等待；普通 `SELECT` 本身不等于这一锁定读。[PostgreSQL Row-Level Locks](https://www.postgresql.org/docs/current/explicit-locking.html)

**发送先占住行**：

| 顺序 | `Tsend` | `Tleave` | 业务判断 |
|---|---|---|---|
| 1 | 锁定读得 `active=true` | — | 发送决定进入受控边界 |
| 2 | 插入 `m-a`，仍持锁 | 尝试更新成员行，等待 | 退群尚未生效 |
| 3 | `COMMIT`，释放锁 | 继续更新 `active=false` 并提交 | 发先于退；消息可保留 |

**退群先占住行**：

| 顺序 | `Tleave` | `Tsend` | 业务判断 |
|---|---|---|---|
| 1 | 更新成员为 `false`，尚未提交 | — | 退群锁住行 |
| 2 | — | 锁定读 `active=true` 时等待 | 不得凭等待前的旧状态放行 |
| 3 | `COMMIT` | PostgreSQL Read Committed 重新核对更新后的行，不再满足 `left_at IS NULL` | 不得到合格行，拒绝写 `m-a` |

PostgreSQL 文档明确：Read Committed 下 `SELECT FOR UPDATE` 遇到并发更新可等待，先写者提交后会对更新后的版本重新检查查询条件；若更新后条件不成立，就不返回这行。[PostgreSQL Read Committed 更新重检](https://www.postgresql.org/docs/current/transaction-iso.html) 这个推导依赖**行已经存在且两条路径共同冲突**。若检查的是“不存在会员行”“至少一位管理员”或删除后重建的复杂条件，锁一条当前行并不能自动保护谓词范围；需要唯一约束、共同保护行、Serializable 或重新设计表示。真正是否满足业务先后合同还要核对所有写入口，而非只审这一个函数。

## 四、锁可以协调，也会等待或形成死锁

PostgreSQL 有表级与行级锁；`FOR UPDATE` 行锁会阻止其他事务对同一行的冲突锁定、更新或删除直到事务结束，但**普通 SELECT 仍可依据 MVCC 读取可见版本**。具体 `FOR UPDATE`、`FOR NO KEY UPDATE`、`FOR SHARE` 等模式有不同冲突矩阵；初学者先问“谁持有哪一行，谁在等谁”，不要把所有“共享/排他”名称当成一个万能开关。表级 DDL、行锁和短期页锁也不是同一层。[PostgreSQL 显式锁定](https://www.postgresql.org/docs/current/explicit-locking.html)

画一个与 IM 成员批量管理有关的两行反例：`R1=(c-a,u-a)`，`R2=(c-a,u-b)`。`T1` 先锁 R1 再申请 R2；`T2` 先锁 R2 再申请 R1。前者持有 R1 等 T2 放 R2，后者持有 R2 等 T1 放 R1，形成**等待环**。PostgreSQL 会检测死锁并取消其中一笔事务，不能预先依赖它选择哪个“牺牲者”；取消的业务操作需在有效期限内**整笔重试**，重新读取成员状态。[PostgreSQL Deadlocks](https://www.postgresql.org/docs/current/explicit-locking.html)

统一多行获取顺序（例如按 `(conversation_id,user_id)` 排序）、保持事务短、避免事务中等待用户输入或设备推送，可降低这类风险。等待超时、事务超时和业务请求期限各有不同含义：前者可能提示资源竞争，后者决定用户等待多久；任一超时都不能自动证明数据库没有提交。要记录失败类型和提交结果再决定重试。

## 五、写偏斜与 Serializable：稳定快照还不一定守住跨行规则

再看 06.07 的管理员不变量：“`c-a` 始终至少有一位管理员。”初始 `u-a` 与 `u-b` 都是管理员。`T1` 读到 B 仍任职，决定让 A 退出；`T2` 读到 A 仍任职，决定让 B 退出。两笔事务各改不同成员行，所以仅锁自己将修改的行并不冲突；在允许该交错的快照隔离下，可能最终 **0 位管理员**。这是**写偏斜**：各自读取的跨行条件都过时，而两笔写入没有落在同一行。[PostgreSQL 事务隔离](https://www.postgresql.org/docs/current/transaction-iso.html)

可评审的候选：把管理员人数/规则落在一个共同受控行，所有退出路径先锁该行并重检；或者使用能保护该谓词/不变量的约束方案；或者在 PostgreSQL Serializable 中让数据库检测不可串行化的依赖并让其中一笔失败，再有界**重试整笔事务**。这些是设计方向，不是“开个锁就保证所有业务”。PostgreSQL Serializable 保证**成功提交的并发事务效果**可等效某个串行顺序，可能返回 serialization failure；它不替产品定义客户端点击时间顺序，也不把 HTTP/设备动作纳入数据库提交。[PostgreSQL Serializable](https://www.postgresql.org/docs/current/transaction-iso.html)

PostgreSQL Serializable 的谓词相关依赖检测不能简单画成“把 `WHERE` 范围加一把会阻塞插入的传统间隙锁”；文档说明监控可串行化冲突不会额外制造那种读写阻塞，却可能让事务在提交前失败。读者要区分：**具体行锁等待**、**稳定快照可见性**、**可串行化冲突失败**，三种现象不是同一个事件。

## 六、长事务让旧版本更难回收，也延长资源占用

MVCC 更新保留旧版本供仍需旧视图的事务读取。PostgreSQL 通过 `VACUUM` 清理不再需要的旧元组、维护空间和相关元数据；一个长时间持有旧快照或事务 ID 的事务**可能**使某些旧版本暂不能回收，从而加重表/索引膨胀和清理压力。是否确实由某个事务造成，要看版本、活动事务、复制槽、autovacuum 与表统计等证据；不能见到磁盘增长就单独归咎于“MVCC 泄漏”。[PostgreSQL Routine Vacuuming](https://www.postgresql.org/docs/current/routine-vacuuming.html)

IM 场景里，别让 `Tsend` 在取得成员行锁后同步等待远端设备、HTTP 上游或用户输入：它延长锁持有、连接占用和可能的旧快照保留，让退群排队，甚至拖高业务 P95。把数据库内决定与写入做短，提交后的在线尝试、补拉和跨设备确认另立协议。Go 的 `*sql.Tx` 仍要求同一用例的 SQL 使用同一个 Tx，结束时 Commit/Rollback 并归还连接；取消或超时后提交结果未知时，要沿稳定 `message_id` 核对权威状态。[06.10 Go 数据访问](../../../src/docs/platform_engineering/curriculum/06_databases/10_go_data_access.md)与[06.07 事务异常](../../../src/docs/platform_engineering/curriculum/06_databases/07_transactions_anomalies.md)已建立这些责任。

纸上排查表至少包含：事务开始与最后活动时刻、持有/等待的行或表资源、执行的 SQL 与请求 ID、当前会话/消息 ID、数据库返回的冲突或死锁错误、旧版本/清理指标、业务等待 P95。这里没有运行这些查询，也不以想象值代替观测。

## 七、MongoDB 对照：快照旧读与写冲突有自己的规则

MongoDB 多文档事务也可能读到相对于其他已提交写入**过时**的快照；同一文档的并发修改可产生写冲突或等待，官方文档对事务中、事务外写入以及过时读取分别给出条件。它不是 PostgreSQL `SELECT FOR UPDATE` 的另一种拼写，不能把上面的行锁语句、隔离级别表或 VACUUM 机制直接套过去。[MongoDB Transactions Production Considerations](https://www.mongodb.com/docs/manual/core/transactions-production-consideration/)

对同一个 IM 合同，仍需问：成员和消息是否跨文档；哪个读写将产生可检测冲突；重试回调会否重做外部副作用；提交响应丢失后如何凭稳定消息身份对账。MongoDB 的单文档原子性和多文档事务边界已在 06.07 讲过；本章只比较“快照可能旧”和“写冲突如何影响决策”，不宣称 OpenIM 使用了哪一种物理锁策略。

| 问题 | PostgreSQL 教学路径 | MongoDB 核对路径 |
|---|---|---|
| 读到的是否最新 | 看隔离级别、语句/事务快照、是否锁定读 | 看 read concern、事务快照与过时读条件 |
| 退群与发送是否冲突 | 同一成员行上的锁定检查与更新，或可串行化/约束 | 同一文档写冲突或多文档事务设计；按实际操作核对 |
| 失败怎么恢复 | 死锁/串行化失败整笔有界重试；提交未知对账 | 写冲突/事务回调重试与提交未知分开处理 |

## 八、交付能被下一位工程师复核的四张图

交付① `v0/v1` 提交与可见性表；②发送先锁和退群先锁的两张时间线；③ R1/R2 的等待环；④两管理员写偏斜与共同保护方案。每张图都注明所用数据库/隔离级别、起始状态、事务内语句、等待/失败/提交位置，以及**不能推出的外部确认**。若只写“MVCC 保证并发安全”，还没有说明本题谁能发送。

### 分层练习与反馈

1–8 建立版本与锁词汇，9–16 推演时间线，17–22 处理跨行规则、资源和业务评审。先预测，再展开答案。

<details><summary>1. `v0 active=true` 与 `v1 active=false` 是两名成员吗？</summary>

不是，是同一教学成员身份在变更前后的两个状态版本。</details>

<details><summary>2. `Tleave` 写了 `v1` 但尚未提交，别的普通事务能把它当已退群吗？</summary>

不能。未提交版本不应成为别的普通读的已提交事实。</details>

<details><summary>3. PostgreSQL Read Committed 下同一事务两次普通 SELECT 可以不同吗？</summary>

可以。每条语句取得自己的已提交快照，第二次可能看到其间已提交的 `v1`。</details>

<details><summary>4. Repeatable Read 中仍看见 `v0`，就说明 `u-a` 此刻可发送吗？</summary>

不说明。稳定旧快照只说明本事务读视图；业务先后还需共同冲突/约束，冲突写或锁定读可能失败。</details>

<details><summary>5. 普通 `SELECT` 与 `SELECT ... FOR UPDATE` 在本题差什么？</summary>

后者对返回的成员行取得行锁，能与退群对同一行的冲突更新协调；普通读取主要依赖可见性快照。</details>

<details><summary>6. `FOR UPDATE` 能锁住一条根本不存在的成员行吗？</summary>

不能直接锁到不存在的当前行。插入竞争、唯一性和条件范围需另设约束或共同保护对象。</details>

<details><summary>7. MVCC 是否表示 PostgreSQL 完全不用锁？</summary>

不是。更新、锁定读、表级操作等仍使用锁；普通读与行写的冲突方式不同。</details>

<details><summary>8. 数据库 Commit 成功就能说 B 的设备已读吗？</summary>

不能。数据库提交、网络响应、设备展示/阅读是不同确认点。</details>

<details><summary>9. 发送先锁住活跃成员行，退群更新同一行会怎样？</summary>

退群的冲突更新等待；发送在同一事务插入并提交后，退群才继续，形成“发→退”。</details>

<details><summary>10. 退群先把成员改为 inactive 并提交，等待的 Read Committed 锁定读还应放行吗？</summary>

不应。PostgreSQL 会按更新后的版本重检 `left_at IS NULL`（教学简称 `active=true`），条件不成立便无合格行，发送拒绝。</details>

<details><summary>11. 若发送在取得锁后改用另一连接的 `db.Exec` 插消息，原先的 Tx 还覆盖该写入吗？</summary>

不覆盖。要用同一 `*sql.Tx` 做相关数据库操作，否则共同决策边界被拆开。</details>

<details><summary>12. T1 持 R1 等 R2，T2 持 R2 等 R1，画出等待环。</summary>

`T1→T2→T1`。两者都等对方释放资源，是死锁而非单纯慢查询。</details>

<details><summary>13. PostgreSQL 检测死锁时能预先指定哪笔事务被撤销吗？</summary>

不能依赖具体牺牲者。应用须按返回错误识别并在边界内重试整笔事务。</details>

<details><summary>14. 统一多行锁获取顺序能解决哪类问题？</summary>

可避免相同资源集因相反顺序形成的等待环；并不解决所有长等待或跨行不变量。</details>

<details><summary>15. 两管理员各只锁自己要退出的那一行，能保证至少留一人吗？</summary>

不能。两笔事务改不同的行，可能都依据旧快照认为“另一人还在”，最终零管理员。</details>

<details><summary>16. PostgreSQL Serializable 下发生冲突失败，应只重试最后一条 UPDATE 吗？</summary>

不应。要从新事务开始重读条件并重算全部相关决定，且限制次数/总期限。</details>

<details><summary>17. Serializable 成功提交意味着哪种顺序保证？</summary>

数据库内这些成功事务的效果能等效某个串行执行顺序；不等于客户端点击或设备响应的绝对时间顺序。</details>

<details><summary>18. PostgreSQL 谓词依赖检测可以简单解释成读范围时总阻塞插入吗？</summary>

不能。Serializable 可通过冲突监测与事务失败避免不一致，不等同传统阻塞式间隙锁。</details>

<details><summary>19. 长事务为什么可能使旧版本积压？</summary>

旧快照仍可能需要旧行版本，清理不能任意移除；要同时核对其他事务、复制槽和 autovacuum 证据。</details>

<details><summary>20. 在事务持行锁期间等待远端设备回复有什么代价？</summary>

延长锁和连接占用、让退群等待，可能保留旧快照并推高请求时延；设备结果也不会被数据库事务原子控制。</details>

<details><summary>21. 可把 PostgreSQL `FOR UPDATE` 直接复制到 MongoDB 的事务接口吗？</summary>

不能。MongoDB 的文档写冲突、快照读和事务 API 有自己的机制与语法，要按该引擎文档和业务操作重新设计。</details>

<details><summary>22. 给“退群后仍发出一条消息”列最少三份证据。</summary>

核对两请求可信身份与业务决定时间线、实际事务语句/隔离与成员行冲突、消息提交及稳定 ID；再区分 HTTP 回答和设备尝试，不能把客户端时间戳当数据库排序证据。</details>

## 本章完成标准与下一步

能不看答案画出 `v0/v1` 快照表、两种 `FOR UPDATE` 先后、R1/R2 死锁环和两管理员写偏斜，并说明普通读、行锁、Serializable 失败分别解决哪类问题；还能说清长事务与外部确认边界，才算完成第一轮。第二轮把这些假设带到隔离环境验证并保留原始 SQL、版本、时序与错误，课程本身没有运行。

按[学习路线](../../../src/docs/platform_engineering/curriculum/learning_path.md)，下一章 06.09「日志与崩溃恢复」继续追问：数据库已决定/已提交的消息，在哪些故障点还能恢复？06.11–06.12 才把复制、迁移与业务存储案例组合起来。
