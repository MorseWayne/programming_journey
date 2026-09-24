# 06.02 SQL 从读写到复杂查询：按会话读取消息历史

> DeepTutor 初稿经技术与教学审阅后的静态课程。SQL、表、结果和页游标均为虚构纸上推演；本次没有运行 PostgreSQL、Go、IM 服务或站点。示例采用 PostgreSQL 语法，课程也没有核对 OpenIM 的具体存储实现。

## 一、查询历史前，先把问题和数据固定

06.01 已把虚构 IM 的用户、会话、当前成员关系与消息拆成四张教学表。现在 `u-a` 要看 `c-a` **最新两条**历史消息。业务步骤先于 SQL：确认调用者身份，判断按当前合同是否有权读 `c-a`，只选该会话的消息，明确顺序与页大小，再返回约定字段。拿到一行数据只说明**查询返回了行**，不自动说明这位调用者有权看、消息已持久到什么边界，或 B 设备收到了它。

为避免每节换一套数字，本章固定以下**纸上数据**。`members.left_at=NULL` 在当前快照模型里表示该行未记退出时刻；历史资格仍需后续模型。会话内 `seq` 唯一，消息正文均满足 06.01 的 1–6 个 UTF-8 字节示例。

| 表 | 纸上记录 |
|---|---|
| `users` | `u-a`、`u-b`、`u-c` |
| `conversations` | `c-a`、`c-b` |
| `members` | `(c-a,u-a,NULL)`、`(c-a,u-b,NULL)`、`(c-b,u-b,NULL)`、`(c-b,u-c,NULL)`；这里第三项是 `left_at` |
| `messages` | `(m-a,c-a,u-a,seq=1,"好")`、`(m-b,c-a,u-b,seq=2,"收到")`、`(m-c,c-a,u-a,seq=3,"OK")`、`(m-d,c-b,u-b,seq=1,"在吗")` |

学习路径分两遍：先会写入、读取、限定修改范围，再用连接、聚合和稳定分页回答业务问题；最后认识子查询、集合操作和窗口函数。SQL 是描述**希望得到什么数据**的语言，数据库实际怎样找到这些行留给 06.05–06.06 的索引与执行计划。

## 二、INSERT 与 SELECT：从一行到同一会话

**INSERT** 把一行加入表。初学时总写出列名，避免以后模式增列时靠列位置猜测：

```sql
-- 纸上建立基线中的 m-a；不是在已有 m-a 后重复插入
INSERT INTO messages (message_id, conversation_id, sender_id, seq, body)
VALUES ('m-a', 'c-a', 'u-a', 1, '好');
```

单引号围住 SQL 文本值，`1` 是整数。主键要求 `m-a` 未被其他行使用，外键要求 `c-a` 和 `u-a` 存在，`UNIQUE(conversation_id,seq)` 要求 `c-a` 尚无序号 1。**通过这些约束还不等于通过发送授权**：外键不知道 `u-a` 在提交时是否有发言资格，更不能推断最终交付。

**SELECT** 先指定要返回哪些列，**FROM** 指定候选表，**WHERE** 按条件筛选行：

```sql
SELECT message_id, sender_id, seq, body
FROM messages
WHERE conversation_id = 'c-a';
```

在基线里，筛选结果是 `m-a/m-b/m-c` 三行，不含 `m-d`。这里仍**没有顺序承诺**；不能因为纸上按 1、2、3 列出，就以为数据库总按插入顺序返回。`SELECT *` 适合临时查看结构，不适合给客户端直接返回：以后若增加内部审计字段或敏感列，`*` 会悄悄扩大结果。**投影**指选择输出哪些列，**筛选**指保留哪些行；两者不要混淆。

`WHERE` 可结合 `AND/OR/NOT`，但要写清括号。比如“`c-a` 且发送者是 A 或 B”应写 `conversation_id='c-a' AND (sender_id='u-a' OR sender_id='u-b')`；不加括号可能把别的会话里 A 发的消息也选进来。对可空字段，`= NULL` 不是“为空”的判断，需用 `IS NULL`；只有 WHERE 条件为 **TRUE** 的行保留，FALSE 和 UNKNOWN 均不返回。

当输入来自用户时，值应通过数据库驱动的**参数**绑定，而不是把用户给的会话 ID 拼进 SQL 字符串。PostgreSQL 模板可用 `$1`、`$2` 表示值；Go 的具体调用和资源关闭在 06.10 讲，注入与应用边界在 09.08 深化。参数化能保护“数据值如何进入语句”，**不能取代成员权限检查**。

## 三、UPDATE 与 DELETE：修改范围就是风险范围

**UPDATE** 修改满足条件的现有行。例如在另一个独立纸上变式里，`u-a` 退出 `c-a`，把该当前成员行的退出时刻填上：

```sql
UPDATE members
SET left_at = '2026-09-24 10:00:00+08'
WHERE conversation_id = 'c-a' AND user_id = 'u-a' AND left_at IS NULL;
```

这里的 `WHERE` 把候选限定为一个会话、一个用户、且当前未记录退出的行。在 06.01 的当前成员主键模型下，预期影响 **1 行**；若影响 0 行，可能已退出、行不存在，或并发先更新，不能无条件报“退出成功”。若去掉 `WHERE`，可能把**所有成员**都标记退出。语法能执行，不代表业务范围正确；预期影响行数应写进测试和评审。

**DELETE** 删除满足条件的行，危险性同样在范围。本课程的消息历史通常要保留证据，不把“撤回”直接等同于物理删除。以下只是假设要清理一条**独立的临时教学记录**，不作用于固定基线：

```sql
DELETE FROM messages WHERE message_id = 'm-test';
```

若没有 WHERE，会试图删除表中所有行；外键和事务行为也会影响最终结果。真实业务要先定保留政策、审计与权限，再决定是否物理删除。06.07 才讲多个写操作的事务语义；本章不能把一次 UPDATE 的纸上预期说成已并发安全或已持久提交。

## 四、JOIN：把会话成员与消息拼在一起

单表 `messages` 能找出 `c-a` 的候选历史，却不知道这次调用者是否在当前 `members` 里。**JOIN** 按 `ON` 的条件把两表的行配成结果行。先看只对当前成员开放历史的一个**简化教学合同**；实际历史可见范围还需产品规则：

```sql
SELECT m.message_id, m.sender_id, m.seq, m.body
FROM members AS mb
JOIN messages AS m ON m.conversation_id = mb.conversation_id
WHERE mb.conversation_id = 'c-a'
  AND mb.user_id = 'u-a'
  AND mb.left_at IS NULL;
```

`mb`、`m` 是表别名；`ON` 说明消息与成员行按**同一个会话**配对，`WHERE` 选中已由服务端认证的 `u-a` 在 `c-a` 的当前关系。基线中 `u-a` 的成员行一条，配到 `m-a/m-b/m-c` 三条。若把 `mb.user_id` 限制去掉，`c-a` 有 A、B 两条成员行，三条消息**各被配两次**，结果成 6 行；此时 `COUNT(*)=6` 不是 6 条消息。这是连接后的**行倍增**，也解释为什么聚合前必须检查连接键和基数。

**INNER JOIN** 只返回有匹配的行。**LEFT JOIN** 保留左侧所有行，右侧没有匹配时填 NULL；若之后在 `WHERE` 写 `right_table.some_field = ...`，未匹配行的 NULL 会被排除，可能把原本想要的外连接效果消掉。例如将一个暂时没有消息的 `c-empty` 会话作**另一个纸上变式**，`conversations LEFT JOIN messages` 会保留 `c-empty`，其 `message_id` 为 NULL；普通内连接不会返回它。不要把这个 JOIN 结果中的 NULL 与 `messages.message_id` 真能为空混淆：主键本来不可空，这里是**外连接填出的缺席值**。

联表结果仍须有权限边界：绝不能让客户端自报 `user_id=u-a` 就被当成已认证身份。历史规则若允许退群者看退出前消息，当前 `members` 快照和 `left_at IS NULL` 又太窄，必须先补成员资格历史与时间范围模型。SQL 只能执行写出的规则，不能替业务决定规则。

## 五、ORDER BY 与分页：顺序要稳定，页才有意义

“最新两条”先要有**序**。本章约定同一会话内 `seq` 越大越新，且 06.01 的 `UNIQUE(conversation_id,seq)` 使其在这个会话内唯一：

```sql
SELECT message_id, seq, body
FROM messages
WHERE conversation_id = 'c-a'
ORDER BY seq DESC
LIMIT 2;
```

基线的排序是 `m-c(seq=3), m-b(seq=2), m-a(seq=1)`，首页返回 `m-c,m-b`。若实际排序键有并列值，需要再添稳定的唯一键，例如 `ORDER BY sent_at DESC, message_id DESC`；本题的会话内 `seq` 已唯一，不靠插入顺序。`LIMIT` 只截取排好序的前一段；不写 ORDER BY，就没有可靠的“前两条”。

**OFFSET** 可跳过已展示的数量：同一静态基线下，`LIMIT 2 OFFSET 2` 返回 `m-a`。但两次查询之间若插入 `m-e(seq=4)`，排序变为 `m-e,m-c,m-b,m-a`；此时第二页 OFFSET 2 返回 `m-b,m-a`，`m-b` 与原首页重复。大 OFFSET 还可能让数据库计算并跳过很多行。对持续增长的历史，常用**游标式分页**，把上一页最后一项的序号 2 带到下一次：

```sql
SELECT message_id, seq, body
FROM messages
WHERE conversation_id = 'c-a' AND seq < 2
ORDER BY seq DESC
LIMIT 2;
```

它返回 `m-a`，新插入的 `seq=4` 不会挤进这次“更旧消息”范围。真实接口中 `2` 是上页结果产生的受控游标值，要校验会话和过滤条件，不能信任任意客户端输入；若排序键不唯一，游标比较需同时包含所有排序键。游标也**不自动提供两次查询的同一快照**：删除、编辑、权限变化仍要另定语义。索引与成本在 06.05，事务快照在 06.07–06.08 才展开。

## 六、GROUP BY 与 HAVING：数什么，分母是什么

`COUNT(*)` 统计筛选后结果的行数。基线中 `WHERE conversation_id='c-a'` 的消息有 **3** 行，`c-b` 有 **1** 行。按会话与发送者分组：

```sql
SELECT conversation_id, sender_id, COUNT(*) AS message_count
FROM messages
WHERE conversation_id = 'c-a'
GROUP BY conversation_id, sender_id
ORDER BY sender_id;
```

结果是 `(c-a,u-a,2)`、`(c-a,u-b,1)`。**WHERE** 在分组前选行，**GROUP BY** 把相同键归到一起，**HAVING** 在聚合后选组。若只要至少 2 条的发送者，加 `HAVING COUNT(*) >= 2`，只余 A；不能在 WHERE 写 `COUNT(*) >= 2`，因为那时还没有分组后的计数。

另一个小边界是 `COUNT(*)` 数行，`COUNT(left_at)` 只数该表达式**非 NULL**的行。基线中四条成员关系的 `left_at` 全为 NULL，所以前者为 4、后者为 0；这不等于数据库里没有四名“会话成员关系”。若先用错误的 JOIN 把 `c-a` 三条消息乘上两条成员行，再 `COUNT(*)`，得到 6，说明**聚合不会自动纠正联表错误**。

还要回到 11.01 的业务分母：`messages` 里的 3 行是这份纸上记录的**消息行数**，不是“所有发送尝试数”“A 确认收到受理回应数”或“B 设备送达数”。无效请求、超时、重试、进程退出与未写入的尝试可能不在表里。SQL 算出的数可以精确，但业务问题选错了表或确认点，结果仍会误导。

## 七、第二遍：子查询、集合操作和窗口函数

当你已能读懂基本 SELECT，再认识三种更复杂的工具，不要一开始就靠它们绕开业务分析。

**子查询**能先得到一个集合，再供外层使用。若业务只按当前成员快照判断可见会话，可以先取 `u-a` 的会话 ID，再找这些会话的消息：

```sql
SELECT message_id, conversation_id, seq
FROM messages
WHERE conversation_id IN (
  SELECT conversation_id FROM members
  WHERE user_id = 'u-a' AND left_at IS NULL
);
```

基线返回 `c-a` 的三条消息，仍须由服务端提供可信的 `u-a` 身份并写明历史可见规则。`IN` 是表达集合成员关系，不等于“物理上必然先执行内层再执行外层”；优化器如何选计划留到 06.06。

**集合操作**组合两个结果集。`SELECT user_id FROM members WHERE conversation_id='c-a' UNION SELECT user_id FROM members WHERE conversation_id='c-b'` 去重后是 `u-a,u-b,u-c`；`UNION ALL` 保留两边的行，`u-b` 会出现两次。两边的列数和对应类型须兼容；结果**没有默认顺序**。它不能代替权限规则，只表示行集合怎样合并。

**窗口函数**在不把每条消息折叠为一组的情况下，给每行附一个组内计算值：

```sql
SELECT conversation_id, message_id, seq,
       ROW_NUMBER() OVER (
         PARTITION BY conversation_id ORDER BY seq DESC
       ) AS row_no
FROM messages;
```

基线中 `c-a` 的 `m-c/m-b/m-a` 得到 `row_no=1/2/3`，`c-b` 的 `m-d` 得到 1。这个 `row_no` 是**查询结果中的排序编号**，不是回写表里的 `seq`。若要只取每个会话前两行，可把该查询放进外层查询/CTE，再对 `row_no` 过滤；不能在同一 SELECT 的 WHERE 中直接引用尚未计算的窗口别名。初学者第二遍只需解释“聚合会缩成一组一行，窗口仍留每条原行”。

概念上可先按 `FROM/JOIN → WHERE → GROUP BY → HAVING → SELECT/窗口 → ORDER BY → LIMIT` 理解数据变化；这帮助检查 SQL 语义，**不是数据库物理执行的逐步时间表**。子查询、窗口和索引的性能不能仅凭写法猜测。

## 八、写出一条有边界的历史查询并练习

现在把业务任务拼回一起：受信入口先获得调用者 `u-a`，按当前**简化**政策确认其是 `c-a` 当前成员，再按会话、唯一序号和页大小取历史。第一页可用第五节的 `ORDER BY seq DESC LIMIT 2`；下一页带同一会话和上一页末项 `seq=2`，追加 `seq < 2`。生产接口要用参数值绑定，例如 `$1` 为会话、`$2` 为从认证上下文取得的用户、`$3` 为受控游标；请求体里自报的用户 ID 不应拿来授权。若策略变为“退出后可看退出前消息”，先修数据模型和权限合同，再改查询。

本章交付三张静态纸上材料：四条消息的**逐行筛选与排序表**；一张 JOIN/COUNT 倍增反例表；一个首页与下一页结果及新增消息后的变式。SQL 语句也须标注输入参数、受信来源、预期行数和**尚不能证明**的持久与交付边界。

### 分层练习：先答，再展开反馈

<details><summary>1. `INSERT` 为什么建议写出列名？</summary>

避免依赖表的列位置，便于审阅和模式增列后的核对。</details>

<details><summary>2. `SELECT message_id` 与 `WHERE conversation_id='c-a'` 分别做什么？</summary>

前者选择输出列，后者筛选候选行。</details>

<details><summary>3. 基线里 `c-a` 有几条消息？</summary>

三条：`m-a/m-b/m-c`。</details>

<details><summary>4. 不写 ORDER BY 能保证返回 m-a、m-b、m-c 吗？</summary>

不能。表和 SELECT 的输出顺序默认无承诺。</details>

<details><summary>5. `WHERE left_at = NULL` 会找到未记退出时刻吗？</summary>

不会按预期找到；应使用 `IS NULL`。</details>

<details><summary>6. UPDATE 退出语句为什么同时限制会话、用户和空 left_at？</summary>

限定目标关系及当前状态，避免修改其他成员或重复处理。</details>

<details><summary>7. UPDATE 影响 0 行一定表示成功吗？</summary>

不一定。目标可能不存在、已变更或被并发先更新。</details>

<details><summary>8. DELETE 没有 WHERE 会试图作用于什么范围？</summary>

满足语法的整张表所有行；实际结果还受约束与权限影响。</details>

<details><summary>9. `c-a` 的三条消息与两条成员行只按会话 JOIN 后有几行？</summary>

六行，每条消息分别与两条成员关系配对。</details>

<details><summary>10. 限定 `mb.user_id='u-a'` 后基线 JOIN 返回几行？</summary>

三行，对应 `c-a` 的三条消息。</details>

<details><summary>11. LEFT JOIN 右侧没有匹配时会怎样？</summary>

保留左行，右侧列填 NULL。</details>

<details><summary>12. 外连接后在 WHERE 限制右表字段有什么风险？</summary>

未匹配行的右侧 NULL 可能被筛掉，外连接效果消失。</details>

<details><summary>13. `ORDER BY seq DESC LIMIT 2` 在 c-a 返回什么？</summary>

`m-c(seq=3)`、`m-b(seq=2)`。</details>

<details><summary>14. 新增 seq=4 后，第二页 `OFFSET 2` 为什么可能重复？</summary>

新行挤到最前，第二页变为 m-b、m-a，m-b 已在原首页。</details>

<details><summary>15. 原首页末项 seq=2，下一页游标条件是什么？</summary>

同一会话、相同排序规则下用 `seq < 2`，再 DESC 和 LIMIT。</details>

<details><summary>16. 游标分页自动提供同一数据库快照吗？</summary>

不会。它处理顺序边界，事务快照与权限变化另需定义。</details>

<details><summary>17. c-a 按发送者分组的 COUNT 各是多少？</summary>

u-a 为 2，u-b 为 1。</details>

<details><summary>18. WHERE 与 HAVING 分别在哪个阶段过滤？</summary>

WHERE 过滤分组前的行，HAVING 过滤聚合后的组。</details>

<details><summary>19. 基线四条成员的 COUNT(*) 与 COUNT(left_at) 是多少？</summary>

分别是 4 和 0；后者忽略 NULL 值。</details>

<details><summary>20. UNION 与 UNION ALL 对 u-b 的重复行有何不同？</summary>

UNION 去重只保留一次，UNION ALL 保留来自两个会话的两次出现。</details>

<details><summary>21. ROW_NUMBER 的 row_no 会写回 messages.seq 吗？</summary>

不会。它是当前查询结果的窗口计算值。</details>

<details><summary>22. 消息表 COUNT=3 能证明 c-a 的所有发送尝试或设备送达数吗？</summary>

不能。表只含这份纸上消息记录；尝试、超时和设备确认各有独立分母与证据。</details>

## 来源与下一步

- [PostgreSQL：插入行](https://www.postgresql.org/docs/current/tutorial-populate.html)、[查询](https://www.postgresql.org/docs/current/tutorial-select.html)、[更新](https://www.postgresql.org/docs/current/tutorial-update.html)与[删除](https://www.postgresql.org/docs/current/tutorial-delete.html)：基础 SQL 的语句和作用范围。
- [PostgreSQL：连接](https://www.postgresql.org/docs/current/tutorial-join.html)、[聚合](https://www.postgresql.org/docs/current/tutorial-agg.html)与[分页](https://www.postgresql.org/docs/current/queries-limit.html)：联表、分组和稳定排序的语义。

下一章[06.03 模式设计与演进](../../../src/docs/platform_engineering/curriculum/06_databases/03_schema_evolution.md)将从“当前表能存哪些状态”进入冗余与兼容迁移；06.10 再接 Go 的 `database/sql`、参数绑定与资源关闭。离开本章前，应能从虚构 IM 需求写出一条有**身份、会话范围、排序、分页和证据边界**的纸上查询。
