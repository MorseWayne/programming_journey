# 06.12 数据库业务案例：消息保存、历史与热点

> DeepTutor 八节初稿经技术与教学审阅后的静态课程。全部用户、消息、SQL、时序和数据源都是**虚构教学材料**；没有构建或运行 Go 服务、SQL、数据库、基准或站点，也不声称 OpenIM 按此方案存储。这里把第六卷机制接回用户需求，并严格区分当前 S2 内存接口与未来 S3 持久版提议。

## 一、先把“成功”写进接口合同，再谈表与事务

本案例面对两个请求：A 在 `c-a` 发送一条正文为 `"你好"` 的消息；A 随后打开历史，想看见刚提交的消息。既有 [09.02 S2 `v1`](../../../src/docs/platform_engineering/curriculum/09_backend_security/02_http_api_contract.md) 成功 `200 accepted_in_memory` 只说明**当前进程内存受理**。 [09.12 的 S3 `v2` 纸上提议](../../../src/docs/platform_engineering/curriculum/09_backend_security/12_im_service_capstone.md)才讨论 `200 stored_in_teaching_db`，且须在已知数据库事务提交后返回；它不是当前已部署实现。无论 S2 还是 v2 提议，正文仍是**非空、最多 6 个 UTF-8 字节**，整份 HTTP 请求体最多 **4096 B**。R9 把正文升至 9 字节是待审变更，不在本章悄悄生效。

固定虚构数据：`c-a` 已有 `seq=1..8`；`u-a` 与 `u-b` 是当前成员，`u-c` 虽已登录却不是成员。A 要新发 `message_id='m-9'`、`body="你好"`；这两个汉字在 UTF-8 中共 **6 字节**。发送者必须从可信认证结果得到 `u-a`，不能相信请求体写 `sender_id=u-b`。本章为解释数据库写入，把 `m-9` 设为下一条 `seq=9`；ID 中的 9 与序号相同只是教学命名巧合，二者不是可互推的字段。它和其他章节的 `m-a` 是不同的教学消息身份，不把所有消息共用一个 ID。

| 第一遍 | 第二遍 | 最终交付 |
|---|---|---|
| 输入/授权、四表、序号、事务与历史页 | 重复/未知、派生状态、热点、故障与迁移 | 写路径时间线、查询结果、失败矩阵、测量与对账方案 |

数据库方案应从这些业务验收出发：有权发送一次后历史能按稳定顺序读到；`u-c` 查私有会话得到隐藏目标的 `404`；无效 9 字节正文不得留下部分写入；同会话同消息 ID 再提交按既有规则为 `409` 且旧值不变；超时后不能谎称“确定未保存”；在线通知失败不改变已提交消息。先修机制分别在 06.01–06.11 与 09.02、09.12，下面把它们组合成一次纸上评审。

## 二、四张表承担什么，约束又守不住什么

06.01 的**教学 PostgreSQL 方言**有 `users`、`conversations`、`members`、`messages` 四表。`messages.message_id` 是主键，`UNIQUE(conversation_id,seq)` 守住会话内序号不重复，正文还有 1..6 字节检查；`members.left_at IS NULL` 在当前成员快照模型里表示尚未记录退出。稳定键、非空、外键与唯一性为写入提供最后护栏，但外键无法证明发送当时有成员资格，唯一约束也不自动分配下一个 `seq`。[06.01 关系模型](../../../src/docs/platform_engineering/curriculum/06_databases/01_relational_identity.md) · [PostgreSQL INSERT/冲突](https://www.postgresql.org/docs/current/sql-insert.html)

```text
messages:  message_id  conversation_id  sender_id  seq  body
           m-9         c-a              u-a        9    你好
members:   (c-a,u-a,left_at=NULL) 与 (c-a,u-b,left_at=NULL)
           不存在当前活跃的 (c-a,u-c)
```

读取历史用 `WHERE conversation_id='c-a' ORDER BY seq DESC LIMIT 3`，在 `m-9` 已知提交且读权威数据源、没有删除/权限变化时，结果序号为 **9、8、7**；下一页以排他游标 `seq<7` 再取三条，是 **6、5、4**。这个游标只表达会话内顺序，不是身份凭据或跨两次请求的一致快照。每次 GET 都要核对 `u-a` 对 `c-a` 的可读范围；`u-c` 即使知道 `m-9` 也只得到既定隐藏目标 `404`，不能泄露消息是否存在。[06.02 SQL 查询](../../../src/docs/platform_engineering/curriculum/06_databases/02_sql_queries.md) · [09.02 HTTP 合同](../../../src/docs/platform_engineering/curriculum/09_backend_security/02_http_api_contract.md)

索引 `(conversation_id,seq)` 是历史范围读取候选，`message_id` 主键服务精确查验；06.05–06.06 已说明索引存在不保证规划器采用、不保证零回表，也不替代权限。正文、附件、会话摘要是否覆盖索引要以实际工作量与写入代价核对，本章不把玩具页数当生产性能。

## 三、一笔教学事务怎样分配 seq=9 并守住退群边界

四表还没有“下一个会话序号”字段。本章**另提出一个教学扩展** `conversation_counters(conversation_id PRIMARY KEY, next_seq)`，初始 `c-a.next_seq=9`；这不是 06.01 已存在的表，也不是 PostgreSQL 的全局 `SEQUENCE` 对象。假设所有发送路径都在**同一个数据库事务**中，先锁定活跃成员行，再锁会话计数行，依次读取 9、将计数写成 10、插入 `(m-9,c-a,u-a,9,"你好")`，最后提交。代码片段只是静态 SQL 草案：

```sql
-- 提议新增的教学表，不是现有四表的一部分
CREATE TABLE conversation_counters (
  conversation_id TEXT PRIMARY KEY REFERENCES conversations(conversation_id),
  next_seq BIGINT NOT NULL CHECK (next_seq > 0)
);

-- 以下四步均须由同一个 *sql.Tx 执行，并在失败时回滚
SELECT 1 FROM members
WHERE conversation_id = 'c-a' AND user_id = 'u-a' AND left_at IS NULL
FOR UPDATE;
SELECT next_seq FROM conversation_counters
WHERE conversation_id = 'c-a' FOR UPDATE; -- 本题读取 9
UPDATE conversation_counters SET next_seq = 10
WHERE conversation_id = 'c-a';
INSERT INTO messages(message_id,conversation_id,sender_id,seq,body)
VALUES ('m-9','c-a','u-a',9,'你好');
-- 完整检查成功后才 COMMIT
```

真实实现必须用参数化语句而不是拼请求文本；这里的常数只用于手算。同一 `*sql.Tx` 保证计数行更新与消息插入同成同败：若事务回滚，`next_seq=10` 也回滚到 9；这和某些**数据库序列对象**在回滚后仍消耗号码不同，不能从 `UNIQUE` 或 `SEQUENCE` 自动推导无间隙。`UNIQUE(conversation_id,seq)` 和 `message_id` 主键是最终约束，即使应用出错也不应静默覆盖旧消息。事务持有成员行锁时，退群若更新同一行会等待，遵循 06.07–06.08 的受控先后；所有发送与退群路径要遵守同一业务规则。[PostgreSQL 行锁/重检](https://www.postgresql.org/docs/current/transaction-iso.html) · [Go 事务使用](https://go.dev/doc/database/execute-transactions)

若 B 同时也发一条不同 ID 的消息，其成员行是 `(c-a,u-b)`，不与 A 的成员行锁相同，但两笔发送会争用**同一 `c-a` 计数行**。A 成功提交得到 9，随后 B 可得到 10；若 A 在计数行更新后回滚，B 等待后可以得到 9。这个**教学设计**用锁换来清楚的会话序号次序；它也让大群热会话的写入串行化，需要第六节的容量评审。若消息 ID 已占用或唯一冲突，整笔事务回滚，不能留下被消费的计数状态；具体错误分类仍按合同处理。

## 四、重复 409 与提交未知：两种结果不能混为一谈

既有 S2 `v1` 规定：同会话同 `message_id` 再提交，即使正文相同，也返回 **409 `DUPLICATE_MESSAGE`**，旧正文和列表次序不变。[09.12](../../../src/docs/platform_engineering/curriculum/09_backend_security/12_im_service_capstone.md) 的 v2 只是持久确认点提议，本章**沿用这条重复拒绝规则**，不擅自改成“同 ID 重试返回第一次 200”。唯一索引可阻止第二行，却不会替应用判断这是同一个意图还是碰撞/恶意输入。POST 的 `u-c` 无会话权限，应先按隐藏目标政策处理，不让 409 成为探测私有消息存在性的信号。

若 A 发 `m-9` 时在 `COMMIT` 附近断网，A 只看到超时：数据库可能已提交，也可能没有。不要因没有 `200` 就创建 `m-10` 重发同一正文，导致两条业务消息；也不能把随后的 409 直接读成“我的原请求已经成功”，它只证明当前 ID 与已有记录冲突。正确的**纸上查询计划**是：沿受信身份到权威数据源查 `m-9`，核对它的会话、发送者与受控请求意图/正文；如果仍不能确定第一次请求是否完成，则把状态明确保持为未知，按既定重试/对账策略处理。若读副本，06.11 的滞后又可能把已提交误判为不存在。

已知 `Commit` 成功后，未来 v2 才可准备 `200 stored_in_teaching_db`。这项答复**仍不是** A 一定收到回应、B 设备收到或 B 已读；06.09 的同步配置和故障模型决定本机持久范围。若采用 `ON CONFLICT` 处理重复，仍须把数据库冲突结果明确映射到既有 409，而不能因为 SQL 语法叫 UPSERT 就自动覆盖正文或改变 HTTP 合同。[PostgreSQL INSERT ON CONFLICT](https://www.postgresql.org/docs/current/sql-insert.html)

## 五、会话摘要、在线通知与批量：哪些是权威事实？

`messages` 行和成员资格是本题的权威事实。会话预览、未读计数、搜索索引或在线提示可能是**派生状态**。若产品合同要求“消息与某摘要必须同成同败”，摘要要在相同事务中维护并承担写热点；若允许预览短暂滞后，就应有重放与对账办法，不能把派生值晚到当成消息丢失，也不能永远不修复。未读数还依赖每位用户的已读水位与成员可见范围，不是 `COUNT(messages)` 就能代表完整阅读状态。

数据库提交后可尝试向 B 的在线连接发“有新消息可补拉”的通知。通知失败不应回滚已提交 `m-9`；它也不能被 `stored_in_teaching_db` 偷换成“已投递”。要实现离线补拉、通知重试与跨节点可靠推送，需要第七卷及 S5 的消息/任务机制。若要用 outbox，需明确定义它与消息在同一事务写入、消费者如何幂等和何时标记投递；仅在图上画个“队列”不是保证。[09.12 完整服务项目](../../../src/docs/platform_engineering/curriculum/09_backend_security/12_im_service_capstone.md)

批量读历史可减少往返，但仍要限制 `limit`、请求字节和游标有效范围；批量写多条消息则需说明是一笔事务还是多笔、哪条失败时哪些已提交、每条 ID/seq/成员权限如何核验。大批事务会延长锁与连接占用，还可能扩大失败重试成本。不能凭“批量更快”跳过确认与资源预算。

## 六、热点会话的序号行：成本必须测，不凭直觉换方案

单会话计数行使 `c-a` 内 `seq` 分配容易解释，代价是同一会话的发送争用那一行。若换成虚构大群 `c-g`，并发写入增加时，等待时间、排队、事务持续时长、写入 P95/P99 和冲突率可能上升；每条消息还涉及索引维护、日志及后续通知工作。观察这些指标前，不能宣布瓶颈已经是计数行，更不能编造“分片后提升多少倍”。[06.06 查询执行](../../../src/docs/platform_engineering/curriculum/06_databases/06_query_execution.md)与[11.01–11.03 测量入口](../../../src/docs/platform_engineering/curriculum/11_reliability/README.md)给出证据路径。

可讨论的候选包括：缩短持锁事务、把可重建派生摘要移出同步事务、预留序号段或改变序号/分区方案。但**预留段可能留下空洞**，分区可能改变全会话排序与游标语义，任何方案都要重新定义“`seq` 是否要求连续无缺口、是否只要求严格递增、冲突如何回收、客户端能否接受空洞”。本教学计数行回滚后可复用号码，不代表生产系统在崩溃/复制切换/批量补写后无缺口。先守住业务顺序和唯一性，再以同负载指标比较成本。

| 观察 | 可能提示 | 还需证据 |
|---|---|---|
| 同一会话发送锁等待增长 | 计数行或成员行竞争 | 锁对象、等待时间、事务范围 |
| 写入 P95 升高 | 锁、WAL、索引、连接池或队列 | 同窗口各阶段 Trace/DB 指标 |
| 历史分页变慢 | 索引、回表、热点与副本水位 | 查询计划、参数、缓冲与路由 |
| 通知堆积 | 设备慢或派生任务不足 | 队列深度、重试、设备确认点 |

## 七、把故障接到相应证据，不让“数据库成功”包办所有答案

用同一条 `m-9` 做故障矩阵。除了已知拒绝与已知提交，还要保留**结果未知**这一列。下列结果全是纸上预期，不是运行记录：

| 事件 | 已知事实 | 当前未知/下一证据 |
|---|---|---|
| `"你好呀"` 为 9 B；R9 尚未批准 | 按现有 6 B 规则拒绝，不能写 `m-9` | 不应拿 v2 提议掩盖输入超限 |
| `u-c` 发往私有 `c-a` | 按隐藏目标政策拒绝，不能授权写 | 不暴露 `m-9` 是否已有 |
| A 与退群交错 | 同一成员行锁给出先后；退群先完成时拒绝 | 哪笔先得到锁、是否冲突失败要看实际时序 |
| 同 ID 重复 | 409，旧消息/序号不变 | 是否同一业务意图须另核对 |
| 事务在计数更新后回滚 | 消息未提交，计数更新也回滚 | 客户端是否已见过其他响应不能猜 |
| `Commit` 附近断网 | 调用方结果未知 | 经授权查权威 `m-9`，核对故障模型 |
| 已提交后通知失败 | 消息仍已提交 | B 是否最终补拉/收到，需后续机制证据 |
| 主库已到 9，副本只回放到 8 | 读副本可能暂缺 9 | 读路由、回放位置与查询参数 |
| A/B 迁移同为 8 条却目标缺 7、多 9 | 计数相同但键集合不一致 | 固定水位修复并复查，不切流 |

06.09 的 C3 本机 WAL 恢复结论依赖同步与可靠存储前提；06.11 的副本切换另有 RPO/RTO。若未来真正把 v2 提议实现为对外服务，需对配置、故障注入、事务提交与 HTTP 返回逐项保存证据，不能以静态方案宣称已达成。MongoDB 若用单文档更新有其原子范围，跨 `members`/`messages` 文档还要核对多文档事务和写关注；不能把本章教学 SQL Tx 直接当 OpenIM 的真实数据路径。[MongoDB 写操作原子性](https://www.mongodb.com/docs/manual/core/write-operations-atomicity/)

## 八、交付一份能评审、能失败、能回退的业务案例

交付物应包含：① v1/v2/R9 三条合同状态与 6 B/409/404 边界；②四表和**单独提议的**计数行，事务与双发送时间线；③首页 9、8、7 和下一页 6、5、4；④失败矩阵及“已知/未知/下一证据”；⑤热点会话的测量门；⑥迁移的 W0/W1、同水位键/版本对账及回退条件。这样的纸上方案能指导学习者后续在隔离环境实现与验证，但不能替代真实运行结果。

### 分层练习与反馈

1–8 先核对合同和数据，9–16 手算事务/分页，17–22 审查故障与业务取舍。先写答案，再展开反馈。

<details><summary>1. 当前 S2 `200 accepted_in_memory` 证明数据库提交了吗？</summary>

没有。它只表示当前进程内存受理。</details>

<details><summary>2. S3 v2 `stored_in_teaching_db` 在本仓库是已部署接口吗？</summary>

不是，是未来教学持久版的纸上合同提议。</details>

<details><summary>3. `"你好"` 与 `"你好呀"` 在当前正文上限下怎样？</summary>

前者 UTF-8 为 6 B，合法；后者 9 B，超过现有 6 B 上限。R9 未批准。</details>

<details><summary>4. 请求体 4096 B 上限与正文 6 B 上限是同一个检查吗？</summary>

不是。一个限制原始 HTTP JSON 字节，一个限制解码后的消息正文 UTF-8 字节。</details>

<details><summary>5. 请求体写 `sender_id=u-b` 能让已登录 A 代 B 发信吗？</summary>

不能。按既有合同拒绝未知/冲突字段，发送者来自受信认证主体。</details>

<details><summary>6. `u-c` 知道 `c-a/m-9`，能直接查私有正文吗？</summary>

不能。非成员按隐藏目标政策得到 404；索引命中不等于授权。</details>

<details><summary>7. 四表现有 `conversations` 已有 `next_seq` 吗？</summary>

没有。本章的 `conversation_counters` 是明确新增的教学扩展，不是 06.01 原有字段。</details>

<details><summary>8. `UNIQUE(conversation_id,seq)` 会自动分配 9 吗？</summary>

不会。它只阻止重复组合；分配算法仍要在受控事务中设计。</details>

<details><summary>9. 初始 `next_seq=9`，A 成功提交 `m-9` 后计数是什么？</summary>

10，消息 `m-9` 在本题得到 `seq=9`。</details>

<details><summary>10. 计数先改为 10，但同一事务插入失败后回滚，计数留下 10 吗？</summary>

不会；教学计数行更新与消息插入在同一 Tx，回滚后仍是 9。不要把它与非事务性序列对象混同。</details>

<details><summary>11. B 用不同 ID 同时向 `c-a` 发信，为何仍可能等待 A？</summary>

两人锁的是不同成员行，但都要锁同一会话的计数行；若 A 提交先拿 9，B 后拿 10。</details>

<details><summary>12. `m-9` 提交后最新三条序号是什么？下一页边界是什么？</summary>

最新页是 9、8、7；以下一页排他边界 `seq<7` 查询。</details>

<details><summary>13. `seq<7 LIMIT 3 DESC` 的下一页返回什么？</summary>

6、5、4，前提是会话与排序/过滤条件保持一致。</details>

<details><summary>14. 同 ID、相同正文重试，现有合同返回什么？</summary>

409，旧值与顺序不变；没有自动把第二次请求当成第一次成功。</details>

<details><summary>15. A 超时后收到 409，能直接判断第一次请求已成功吗？</summary>

不能。409 只证明 ID 冲突；仍须经授权查权威行并核对会话、发送者和原始意图。</details>

<details><summary>16. `Commit` 已知成功、在线通知 B 失败，消息应回滚吗？</summary>

不应把外部通知失败倒灌为已提交事务回滚。通知/补拉另设可靠机制。</details>

<details><summary>17. 预览是可重建派生状态时，允许暂时落后后还需要什么？</summary>

需要定义可接受的陈旧窗口、重放和对账修复责任；不能无限期不一致。</details>

<details><summary>18. 大群 `c-g` 写入慢，就能断言计数行是瓶颈吗？</summary>

不能。先观察锁等待、WAL、索引、连接池、队列及业务 P95/P99 同窗口证据。</details>

<details><summary>19. 预留 `seq` 段会影响哪个业务承诺？</summary>

可能出现空洞；必须重新规定是否要求连续、只要求递增还是允许保留号码，以及游标怎样处理。</details>

<details><summary>20. 主库已提交 9，落后副本只到 8，从副本暂时查不到 9 就等于丢失吗？</summary>

不等于。先核对副本回放位置、读路由、游标和权限；写后读要求可路由权威源或等待可见水位。</details>

<details><summary>21. 迁移源/目标都各 8 条，可直接切换吗？</summary>

不能。06.11 的反例缺 7、多 9；须在同一水位比较键、字段/版本，修复后复查。</details>

<details><summary>22. 给这个案例列出三种互不等价的“成功”。</summary>

例如内存受理、教学数据库提交、客户端收到该确认；B 设备送达和用户已读又是后续不同事实。</details>

## 本章完成标准与下一步

能不看答案写出 v1/v2/R9 的边界，画出成员行与计数行的同 Tx 顺序，手算 `seq=9` 后 9、8、7 与 6、5、4 两页；能把重复 409、提交未知、通知失败、副本滞后和迁移差异分别交给相应证据，才算完成第六卷的第一轮。第二轮在学习者自己的隔离环境实现并记录真实测试/故障/性能证据，本项目没有替代这些实践。

按[学习路线](../../../src/docs/platform_engineering/curriculum/learning_path.md)，接下来进入第七卷的缓存、派生状态与消息中间件，再在分布式卷深化跨节点的确认、顺序和故障边界。
