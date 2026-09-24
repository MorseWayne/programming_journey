# 06.01 关系模型与业务身份：从会话和消息画出第一张数据表

> DeepTutor 初稿经技术与教学审阅后的静态课程。所有身份、表、SQL 与结果均为教学设计；本次没有连接数据库、运行 Go/SQL/IM 服务或构建站点。PostgreSQL 语法只用来解释关系模型，不表示当前课程已有数据库实现，也不代表 OpenIM 的实际存储方案。

## 一、内存里有 m-a，为什么还要想“保存”

S2 的 `POST` 只讨论服务端**当前进程的内存受理**。假设 `u-a` 给 `c-a` 发送 `m-a`，`u-b` 之后打开会话历史，新的业务问题是：进程重启后还能否查到同一条消息？若 `u-b` 已退群，谁可以读历史？若 A 因响应丢失重试，我们怎样识别是同一条业务消息？这些问题不能由一个 `map`、一次 HTTP 200 或一条日志自动解决。

S3 要先设计**数据模型**：哪些业务对象要长期区分、对象之间怎样关联、哪些状态不允许出现。之后才学习 SQL 读写、事务、物理存储和崩溃恢复。本章的纸上表只说明“计划保存什么、约束什么”；它不证明数据库已经提交、磁盘已经安全写入，更不证明 B 的设备收到或用户已读。

| 第一遍 | 第二遍 | 交付物 |
|---|---|---|
| 表、行、列、类型；用户/会话/成员/消息 | 键、外键、约束、NULL、文档模型对照 | 四张教学表、三条合法/非法记录与一条历史查询步骤 |

全章只用虚构 `u-a/u-b/c-a/m-a`，不写公司、人名或真实聊天内容。

## 二、从 Go 结构体走到表、行、列和类型

先想一个 Go 结构体：`Message{ID, ConversationID, SenderID, Body}` 是**一条消息可能具有哪些字段的程序表示**；一个 `[]Message` 是进程里的一批值。关系数据库中的**表**也有列名和列类型，**一行**填入这些列的值。但数据库表不是切片：没有“下标就是业务身份”的保证，读取若要稳定顺序必须明确排序；表还可以声明让多行共同遵守的键和引用规则。表的定义叫**模式（schema）**，某一时刻具体的行叫**实例（instance）**。

以这四种业务对象起步：

| 教学表 | 一行代表什么 | 关键列 | 第一眼的关系 |
|---|---|---|---|
| `users` | 一个可识别的用户 | `user_id`, `display_name` | 用户可参加多个会话 |
| `conversations` | 一个会话 | `conversation_id`, `kind` | 会话可有多名成员和多条消息 |
| `members` | 某用户与某会话的一条**当前成员关系** | `conversation_id`, `user_id`, `joined_at`, `left_at` | 把用户与会话连起来 |
| `messages` | 一条有身份的消息记录 | `message_id`, `conversation_id`, `sender_id`, `seq`, `body` | 属于会话，并指向发送者 |

先不背 SQL。`TEXT` 用于教学 ID 和内容，`BIGINT` 用于会话内序号，`TIMESTAMPTZ` 用于带时区解释的时刻。这些是所选 PostgreSQL 教学方言中的类型；“把显示名写在 `user_id` 列”即使同为文本也违反**业务身份**含义，类型检查不能代替业务检查。消息正文上限在此沿用 [09.02 的 S2 HTTP 合同](../../../src/docs/platform_engineering/curriculum/09_backend_security/02_http_api_contract.md)：**6 个 UTF-8 字节**。工程卷的 R9 是将来把上限改成 9 字节的独立变更练习，尚未改变这份接口合同；不能把字符、Go rune 和字节混为一谈。

纸上实例可以这样读：

```text
users:         (u-a, "用户甲"), (u-b, "用户乙")
conversations: (c-a, direct)
members:       (c-a, u-a, t1, NULL), (c-a, u-b, t1, NULL)
messages:      (m-a, c-a, u-a, seq=1, body="好")
```

表中两条 `members` 记录表达 **用户与会话的多对多关系**：一个用户能参加多个会话，一个会话也能包含多个用户。若把成员列表仅塞在 `users` 的一个文本字段里，数据库难以独立识别和约束每段成员关系；反过来，若把会话 ID 当用户 ID，也会混淆两个对象的身份。此时先掌握**对象、关系、身份**，06.02 再学习具体的 `SELECT` 和连接查询。

## 三、主键、复合键与外键：一行到底是谁

一张表需要稳定识别一行。**主键（primary key）**的值必须唯一且非 NULL；它可以是一列，如 `users.user_id=u-a`，也可以由多列合成，如 `members` 的 `(conversation_id,user_id)`。后一组合表示在这个**当前成员快照模型**里，`(c-a,u-a)` 最多有一行；`(c-a,u-b)` 是另一行。单独的 `conversation_id` 不唯一，因为一个会话有多名成员；单独的 `user_id` 也不唯一，因为一个用户可参加多个会话。

**外键（foreign key）**说的是一列或一组列应引用另一张表中存在的键。`messages.conversation_id=c-a` 需要 `conversations` 中有 `c-a`；`messages.sender_id=u-a` 需要 `users` 中有 `u-a`。如果 `m-x` 引用不存在的 `c-z`，声明并启用的外键可拒绝这条记录。外键让“消息属于某个已存在会话”可受数据库检查，但它**不自动证明 `u-a` 当时有发送权限**。用户存在和用户是该会话当时的合法成员，是两种断言。

| 身份 | 在本题的职责 | 不能替代什么 |
|---|---|---|
| `user_id` | 稳定标识用户 | 显示名、手机号或访问令牌 |
| `conversation_id` | 标识会话 | 当前成员名单或授权结果 |
| `message_id` | 标识一条业务消息 | 一次 HTTP 请求 ID、Trace ID |
| `(conversation_id, seq)` | 指定会话内的消息序号，若约束唯一可作候选身份 | `seq` 如何安全分配、提交是否持久 |
| 客户端提交标识 | 重试时可能携带的操作关联键 | 数据库自动保证的幂等规则 |

不要用用户昵称或毫秒时间戳单独作消息身份：昵称可改、可重复；同一时刻也可能有多条消息。`message_id` 是否由服务端生成、客户端重试时是否沿用、与去重键怎样对应，须在后续可靠性章节定义合同，不能靠“主键唯一”自动推出完整幂等语义。

还有一个初学者常忽略的限制：`members` 的复合主键只容许同一 `(c-a,u-a)` 有一行，适合表示**当前关系**。若业务要求保存“加入→退出→再加入”的完整历史，就不能简单把第二次加入插成同样主键的新行；要另设成员事件或会员关系的独立身份与时间区间。当前章先诚实标出缺口，不凭一张快照表断言过去某时刻的权限。

## 四、约束与 NULL：允许什么进入表

列类型只能挡住一部分错误。`NOT NULL` 要求值存在；`UNIQUE` 防止选定列组合重复；`CHECK` 检查当前行的表达式；`FOREIGN KEY` 要求被引用对象存在。主键相当于识别行所需的“唯一且非空”。下面是**PostgreSQL 教学方言**的一份静态草案，不在本项目执行。所用数据库编码假定 UTF-8；正文边界与业务需求仍需在应用层一致校验。

```sql
CREATE TABLE users (
  user_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL
);

CREATE TABLE conversations (
  conversation_id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('direct', 'group'))
);

CREATE TABLE members (
  conversation_id TEXT NOT NULL REFERENCES conversations(conversation_id),
  user_id TEXT NOT NULL REFERENCES users(user_id),
  joined_at TIMESTAMPTZ NOT NULL,
  left_at TIMESTAMPTZ,
  PRIMARY KEY (conversation_id, user_id),
  CHECK (left_at IS NULL OR left_at >= joined_at)
);

CREATE TABLE messages (
  message_id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(conversation_id),
  sender_id TEXT NOT NULL REFERENCES users(user_id),
  seq BIGINT NOT NULL CHECK (seq > 0),
  body TEXT NOT NULL CHECK (octet_length(body) BETWEEN 1 AND 6),
  UNIQUE (conversation_id, seq)
);
```

`body="你好"` 在 UTF-8 下是 6 字节，可满足当前上限；`body="中文甲"` 是 9 字节，应被拒绝。`octet_length` 是这里的 PostgreSQL 写法，不能不经核对就搬到所有 SQL 方言。数据库端 `CHECK` 只检查写入时这一行的内容，不能判断发送者当前是不是会话成员，也不解决并发分配 `seq` 的方式。应用层仍要在正确的业务边界做授权与输入校验；两个层次承担不同职责。

**NULL** 不是空字符串 `""`，不是数字 0，也不是“没有这行”。本模型约定 `members.left_at IS NULL` 表示这条当前成员记录**没有记载退出时刻**；是否真正有权访问仍应以业务合同和可靠状态为准。SQL 表达式遇到 NULL 可能得到第三种结果 **UNKNOWN**，因此 `left_at = NULL` 不能当作寻找未退出记录的写法，应使用 `IS NULL`。同样，PostgreSQL 的 `CHECK` 遇到 UNKNOWN 通常不会拒绝该行；必填列要另写 `NOT NULL`。初学阶段记住：**字段能否为空、空代表什么、谁更新它**都必须写入模式合同。

## 五、沿一条历史查询，纸上检查四张表

假设未来 `u-a` 要查询 `c-a` 的历史。在查询消息前先确认 `u-a` 是被允许查看的主体，再按会话筛选消息，并按明确的会话内顺序呈现。**数据库里有一行成员记录**不是全部授权规则：退群后还能看退群前消息吗？封禁后能看吗？会话管理员的权限怎样变？这些须由 09 卷的应用合同决定，再决定数据结构和查询条件。

| 纸上写入或读取 | 表约束能判断 | 还需业务判断 |
|---|---|---|
| 写入 `(m-a,c-a,u-a,seq=1)` | `m-a` 不重复；`c-a/u-a` 存在；序号正且在 `c-a` 内唯一；正文 1–6 字节 | `u-a` 当时有权发送；是否应保存和怎样确认 |
| 写入 `(m-x,c-z,u-a,seq=1)` | 若 `c-z` 不存在，外键拒绝 | 即使有 `c-z`，仍需检查会话权限 |
| 写入 `(m-y,c-a,u-z,seq=2)` | 若 `u-z` 不存在，外键拒绝；若存在则这些外键可以通过 | `u-z` 是否 `c-a` 的可发送成员 |
| 查询 `u-a` 的 `c-a` 历史 | 可按会话 ID 找到候选消息 | 当前身份是否允许读、历史可见范围、排序与分页 |

这里的 `seq=1` 是**教学给定值**。其生成、并发唯一性与崩溃后连续性并未由 `UNIQUE` 约束自动解决。也不能因为某条 `messages` 行在纸上存在，就说客户端 A 已收到 HTTP 回应，或 B 设备已经显示。前者要看服务端提交与客户端确认，后者要看设备侧证据；11.01 的确认点仍然适用。

关系也能从查询看出来：一个会话对应多条消息，是一对多；用户与会话靠 `members` 联系，是多对多。下一章用 `SELECT`、`WHERE`、`JOIN`、排序与分页把这个查询真正写成 SQL；本章先能**口头逐步说清要查哪些对象和为什么**。

## 六、文档与集合：何时嵌入，何时引用

OpenIM 是本系列的公开参照，但本章没有核对其具体存储源码，因此以下是**教学模型比较**，不是 OpenIM 实际集合或表的声明。MongoDB 的**集合（collection）**存放**文档（document）**，文档由字段和值组成，值还可包括嵌套文档和数组。它与关系表的“所有行具有同一组列定义”不同；字段灵活也不等于无需数据合同或验证。

可以把一个会话的少量、总是一起读取的配置嵌入会话文档：

```text
conversations 文档：{_id: c-a, kind: direct, settings: {mute: false}}
messages 文档：     {_id: m-a, conversation_id: c-a, sender_id: u-a, seq: 1, body: 好}
```

这里消息仍是**独立文档并引用会话 ID**。若把会话的**全部历史消息**嵌入一个无限增长的数组，每次追加、分页、独立修改和大小上限都会成为问题；“一次读到相关数据”这个优点要与增长方式一起衡量。MongoDB 文档有大小限制，不能把无界 IM 历史假装成一个永远能扩展的文档。反过来，独立消息文档便于按会话筛选与分页，但应用必须明确引用、删除与跨文档一致性规则；不能假定引用字段自动具有关系数据库外键的全部行为。

| 问题 | 关系表教学方案 | 文档教学方案 |
|---|---|---|
| 表达用户与会话成员 | `members` 独立行及复合键 | 可独立文档引用两端；小而固定的数据可考虑嵌入 |
| 取一页历史消息 | `messages` 按 `conversation_id` 筛选，后续学索引 | 独立 `messages` 文档按会话筛选；避免单文档无界数组 |
| 限制身份关系 | 明确声明主键/外键/唯一约束 | 需按实际集合验证、唯一索引与应用规则逐项设计 |
| 证明持久与送达 | 仅靠模式不能证明 | 仅靠文档结构同样不能证明 |

先问**访问模式和增长边界**，再选嵌入或引用。不能因为 MongoDB 的文档“灵活”，就省去消息 ID、会话 ID、成员权限和历史顺序的定义；也不能把教学 SQL 模型照搬为上游实现事实。

## 七、失败变式把身份与确认边界说清

模型的价值在负例里更容易看见。若 `u-a` 把显示名改了，历史消息仍应指向稳定的 `user_id`，不应因展示文本变化失去归属。若删除一个用户或会话，外键可以阻止悬空引用，具体是限制删除、软删除还是受控清理历史，要由保留与权限需求决定；**不要任意级联删除聊天历史**。若 `u-a` 退出又加入 `c-a`，当前 `members` 快照无法保留两段不同成员资格历史，需要单独的事件或区间模型。

| 变式 | 已知 | 尚未知或待决策 |
|---|---|---|
| 两条消息都用 `message_id=m-a` | 主键不允许第二行同 ID | 这是同一发送的重试还是两个不同意图；如何对客户端回应 |
| `u-z` 存在，但不在 `c-a` 成员中 | 用户外键可通过 | 应用授权必须在写入前拒绝；历史权限是否另有规则 |
| `left_at=NULL` | 当前行未记退出时刻 | 不能由此推断“已读”“在线”或过去每一刻的成员身份 |
| `m-a` 行存在，服务端响应丢失 | 数据模型能给该行身份 | A 是否收到受理结果、是否重试，以及提交/崩溃边界 |

一张表的存在不能代替事务、崩溃恢复或服务级确认。06.07 才系统讲事务和隔离，06.09 再讲日志与持久恢复；09 卷和 S5 进一步处理授权、重试及设备确认。本章的建模要保留足够明确的身份与关系，让后续问题**可以被准确提问**。

## 八、交付四表草案与分层练习

学习者本章只交纸上材料：四张表的“每行代表什么、列类型、主键、外键、可空列”说明；为 `m-a` 写一条合法记录和两条非法记录并指出是**哪一条约束**或**哪一条业务规则**拒绝；最后用自然语言写出 `u-a` 查 `c-a` 历史所需的身份检查、会话筛选和顺序。再画一个文档对照：只嵌入有界设置，把无界消息历史留作独立文档或其他受控结构。不需要本章就选择生产数据库。

### 分层练习：先回答，再展开反馈

<details><summary>1. 表与一行各代表什么？</summary>

表定义同类记录的列和约束；一行是一份具体记录。</details>

<details><summary>2. schema 与 instance 的区别是什么？</summary>

schema 是列、类型和约束的定义；instance 是当前实际数据行。</details>

<details><summary>3. 数据库表能像 Go 切片那样依赖下标顺序吗？</summary>

不能。展示顺序应在查询中明确指定。</details>

<details><summary>4. `u-a` 的显示名可以当稳定主键吗？</summary>

不宜；显示名可更改或重复，稳定 `user_id` 才承担身份。</details>

<details><summary>5. `members` 为什么用 `(conversation_id,user_id)` 复合键？</summary>

任一列单独都可能重复；两列组合识别当前关系中的一行。</details>

<details><summary>6. 主键允许同表两行都是 `message_id=m-a` 吗？</summary>

不允许。主键要求唯一且非 NULL。</details>

<details><summary>7. `m-x` 引用不存在的 `c-z` 会怎样？</summary>

若声明并执行该外键，应拒绝引用不存在会话的记录。</details>

<details><summary>8. 用户外键通过是否证明发送者是会话成员？</summary>

不能。它只保证用户存在，成员资格还需独立检查。</details>

<details><summary>9. `UNIQUE(conversation_id,seq)` 限制什么？</summary>

限制同一会话内重复使用同一个序号，不定义序号怎样并发分配。</details>

<details><summary>10. 3 个常见汉字为何可能恰好达到 9 字节？</summary>

题设 UTF-8 下这几个汉字各占 3 字节；合计 9 字节，因此按当前 6 字节合同应拒绝。</details>

<details><summary>11. `NULL` 与空字符串一样吗？</summary>

不一样。前者表示缺失/未知等字段合同所定义的状态，后者是一个长度为 0 的字符串值。</details>

<details><summary>12. 查 `left_at` 为空该写 `= NULL` 吗？</summary>

不应。SQL 用 `IS NULL` 判断空值。</details>

<details><summary>13. `CHECK (body_length > 0)` 为何还可能需要 `NOT NULL`？</summary>

在 PostgreSQL 中，NULL 参与比较得到 UNKNOWN，CHECK 不会因此拒绝；必填要明确 NOT NULL。</details>

<details><summary>14. `left_at=NULL` 能证明用户从未退出过吗？</summary>

不能。当前快照只表示该行没有记载退出时刻，不能复原完整历史。</details>

<details><summary>15. 退群后再入群，当前复合键模型缺什么？</summary>

缺两段独立成员资格的历史身份或事件记录。</details>

<details><summary>16. 查询历史前要先核对什么业务条件？</summary>

调用者身份、对会话及所查时间范围的读取权限。</details>

<details><summary>17. 没有排序条件可承诺最旧消息总先返回吗？</summary>

不能。应明确按序号或其他合同规定的键排序。</details>

<details><summary>18. 消息行存在就证明 A 收到 HTTP 回应了吗？</summary>

不能。数据记录、服务端提交和客户端收到回答是不同检查点。</details>

<details><summary>19. MongoDB 文档可以包含嵌套结构吗？</summary>

可以，字段可包含子文档和数组。</details>

<details><summary>20. 为什么不把整个会话的无界历史都嵌进一个文档？</summary>

增长、文档大小限制、分页及独立更新会变得困难。</details>

<details><summary>21. 文档引用字段会自动等同于 SQL 外键吗？</summary>

不会。验证和跨文档关系要按具体存储与应用规则设计。</details>

<details><summary>22. 本章的 SQL 表能证明崩溃后消息仍在吗？</summary>

不能。这里只设计模式，持久提交和恢复另需实现与证据。</details>

## 来源与下一步

- [PostgreSQL：关系表基本概念](https://www.postgresql.org/docs/current/tutorial-concepts.html)与[约束](https://www.postgresql.org/docs/current/ddl-constraints.html)：表、列、主外键、CHECK 与 NULL。
- [SQLite：外键语义](https://www.sqlite.org/foreignkeys.html)：“引用对象存在”及可空外键的边界。本文 SQL 示例仍采用 PostgreSQL 教学方言。
- [MongoDB：数据建模](https://www.mongodb.com/docs/manual/data-modeling/)、[嵌入](https://www.mongodb.com/docs/manual/data-modeling/embedding/)与[引用](https://www.mongodb.com/docs/manual/data-modeling/referencing/)：文档、集合、访问模式与增长边界。

下一章[06.02 SQL 从读写到复杂查询](../../../src/docs/platform_engineering/curriculum/06_databases/02_sql_queries.md)才从 `SELECT`、`INSERT`、`UPDATE`、`DELETE` 写到连接、聚合和分页。离开本章前，请能不用 SQL 说清 `m-a` 是谁、属于谁、怎样查到、哪种约束能保护它，以及**哪些权限与确认仍不受这张表保护**。
