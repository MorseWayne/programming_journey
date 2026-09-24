---
title: 06.10 Go 数据访问：从历史查询到驱动、游标与资源责任
icon: /assets/icons/article.svg
order: 11
date: 2026-09-24
---

[返回第六卷](./README.md) · [关系模型：06.01](./01_relational_identity.md) · [SQL：06.02](./02_sql_queries.md) · [模式演进：06.03](./03_schema_evolution.md)

# 06.10 Go 数据访问：从历史查询到驱动、游标与资源责任

> DeepTutor 初稿经技术与教学审阅后的静态课程。代码、查询、响应、错误和时序均为虚构示意；本次没有连接 PostgreSQL/MongoDB、运行 Go、运行 IM 服务或构建站点。示例用 PostgreSQL 占位符 `$1`；具体驱动版本、连接配置和实际运行结果须由学习者在个人隔离环境核对。

## 一、从 u-a 查询 c-a 历史，分清谁负责什么

06.01–06.03 已用四张教学表表达用户、会话、当前成员与消息，并写出按 `c-a` 和会话内 `seq` 读取历史的 SQL。现在要让未来的 Go 服务调用数据源。入口从**已验证的会话/令牌**得到调用者 `u-a`，读取接口提供会话 ID `c-a`、页大小与上一页游标。应用先按业务合同判断可见范围，再让数据访问层执行查询、扫描结果并释放资源。客户端自报 `user_id=u-a` **不能**代替认证结果。

```text
客户端请求 → HTTP handler → 应用用例（受信身份与权限）
            → 数据访问接口 → SQL 驱动/文档驱动 → 数据库
            ← 分类错误和有界消息页 ← 关闭结果资源
```

这里的数据库是**未来教学实现**。读取 `m-a` 的一行只证明某次查询在其数据源返回了记录；它不能从静态示例推出已经崩溃耐久，也不能证明 `u-b` 的设备收到了消息。09 卷负责应用层身份/权限，06.07 将补事务和并发异常，06.09 再讨论崩溃恢复；本章先学会 Go 如何**正确访问、读取、取消和关闭**。

| 第一遍 | 第二遍 | 本章交付 |
|---|---|---|
| `database/sql`、驱动、池、查询与扫描 | NULL、取消、写入不确定、事务入口、MongoDB Cursor | 一份受信历史查询接口、资源所有者表、错误与确认边界表 |

## 二、`database/sql`、驱动和连接池不是同一个东西

Go 标准库 `database/sql` 提供 `DB`、`Rows`、`Tx` 等**通用接口**；要与某个具体数据库通信，仍需安装并注册相应**驱动**，由驱动实现线缆协议与数据库特性。`sql.Open(driverName, dataSourceName)` 返回一个 `*sql.DB` **句柄**；它一般只验证参数格式、建立池的入口，**不等于已经通过网络连上数据库**。若启动流程确需主动验证连接，可在有期限的上下文中调用 `PingContext`。`PingContext` 成功也只说明**当时**可连，不能保证以后的每次操作。

`*sql.DB` 不是“一个 TCP 连接”，而是并发安全的**连接池管理者**。通常在应用启动时创建一次，交给依赖它的数据访问组件复用，在应用退出时关闭；每个 HTTP 请求都 `sql.Open` 再 `Close` 会失去池复用、增加连接成本。某次查询可从池里取到连接、等待可用连接、执行，再归还。`SetMaxOpenConns`、`SetMaxIdleConns` 等选项能限制池的行为，但值不是越大越好；容量要结合数据库上限、请求并发、等待时间和实际测量确定。

| 对象 | 生命周期的典型主人 | 何时释放 |
|---|---|---|
| `*sql.DB` | 应用进程/依赖容器 | 进程优雅关闭时 `Close`；不逐请求关闭 |
| `*sql.Rows` | 发起本次多行查询的函数 | `QueryContext` 成功后及时 `Close`，遍历后查 `Err` |
| `*sql.Tx` | 一次明确的事务用例 | 明确 `Commit` 或 `Rollback`；具体语义见 06.07 |
| MongoDB `*mongo.Client` | 应用进程 | 退出时 `Disconnect`；不逐请求重建 |
| MongoDB `Cursor` | 一次查询函数 | 用完或出错时 `Close`，迭代后查 `Err` |

连接串、用户名和凭据来自受控配置，不能硬编码在课程示例或记录到日志。`sql.DB` 与 MongoDB Client 都可复用并含池，但它们的驱动接口、查询语义和写入确认**并不相同**；下文只做职责对照，不把某一边的保证套给另一边。

## 三、单行与多行查询：`Scan`、`Close`、`Err`

要检查“`u-a` 当前是不是 `c-a` 成员”，预期至多一行，可用 `QueryRowContext`。它返回 `*sql.Row`，查询错误通常要到 `Scan` 才暴露；没有匹配行时 `Scan` 返回 `sql.ErrNoRows`。**无成员行**可按本章简化合同映射为“无权访问”，其他数据库错误不能也伪装成“无权”，否则运维故障会被藏起来。读多条消息则用 `QueryContext` 得 `*sql.Rows`，按 `Next → Scan → Err` 读取，在所有路径上 `Close`。

以下是**示意 Go 片段，未运行**。它只处理“读当前成员可见会话的更旧消息”这一范围；`beforeSeq=2`、`limit=20` 等参数由上层校验。首次读取用 06.02 的另一条无游标 SQL。具体错误类型和领域结构由学习者个人实现决定。

```go
type HistoryItem struct {
    ID       string
    SenderID string
    Seq      int64
    Body     string
}

var ErrForbidden = errors.New("forbidden")

func ReadOlder(ctx context.Context, db *sql.DB, subjectID, convID string, beforeSeq int64, limit int) ([]HistoryItem, error) {
    if beforeSeq <= 0 || limit <= 0 || limit > 100 {
        return nil, fmt.Errorf("invalid history page")
    }

    var marker int
    err := db.QueryRowContext(ctx, `
        SELECT 1 FROM members
        WHERE conversation_id = $1 AND user_id = $2 AND left_at IS NULL
    `, convID, subjectID).Scan(&marker)
    if errors.Is(err, sql.ErrNoRows) {
        return nil, ErrForbidden
    }
    if err != nil {
        return nil, fmt.Errorf("check membership: %w", err)
    }

    rows, err := db.QueryContext(ctx, `
        SELECT message_id, sender_id, seq, body
        FROM messages
        WHERE conversation_id = $1 AND seq < $2
        ORDER BY seq DESC LIMIT $3
    `, convID, beforeSeq, limit)
    if err != nil {
        return nil, fmt.Errorf("query history: %w", err)
    }
    defer rows.Close()

    items := make([]HistoryItem, 0, limit)
    for rows.Next() {
        var item HistoryItem
        if err := rows.Scan(&item.ID, &item.SenderID, &item.Seq, &item.Body); err != nil {
            return nil, fmt.Errorf("scan history: %w", err)
        }
        items = append(items, item)
    }
    if err := rows.Err(); err != nil {
        return nil, fmt.Errorf("iterate history: %w", err)
    }
    return items, nil
}
```

代码片段假定所属 Go 文件已导入 `context`、`database/sql`、`errors`、`fmt`，并由上层传入已经初始化的 `*sql.DB`。它**不是完整服务**：成员状态可能在检查和读历史之间变化；是否允许这种变化取决于业务合同与事务设计，06.07 再处理。真实 HTTP 层还应把 `ErrForbidden`、数据库失败和客户端取消映射成不同结果，不能把所有错误回 404 或 500。

`SELECT` 列顺序必须与 `Scan` 的目标顺序一一对应；以后多一列也不能让 `SELECT *` 静悄悄改变扫描或返回字段。`defer rows.Close()` 只在 `QueryContext` 成功之后调用；循环结束仍查 `rows.Err()`，因为迭代中发生的错误不一定通过 `Next()==false` 的布尔值表达。`QueryRowContext` 不需自己关闭一个 `Rows`，但必须调用 `Scan` 获取结果/错误。

## 四、NULL、参数和写入结果的边界

06.03 的 `sender_display_name_at_send` 对旧行可为 SQL NULL。直接把 NULL 当 Go 空字符串扫描，会丢失“未知”和“确实为空”的区别；可使用 `sql.NullString` 的 `Valid` 位：

```go
var snapshot sql.NullString
err := db.QueryRowContext(ctx,
    `SELECT sender_display_name_at_send FROM messages WHERE message_id = $1`,
    "m-a",
).Scan(&snapshot)
// 先处理 err；err == nil 时，snapshot.Valid 才说明这一列有非 NULL 值。
```

`sql.NullTime` 等类型处理其他可空列。若业务领域不想暴露 `database/sql` 类型，可在访问层把 `Valid` 转成自己的“已知/未知”结构。**NULL 与没有行不同**：`ErrNoRows` 是查不到 `m-a`；有行且 `snapshot.Valid=false` 表示消息存在，但历史昵称没有记录。

PostgreSQL 的 `$1/$2` 是**值参数**，驱动把参数与 SQL 结构分开交给数据库；不能用 `fmt.Sprintf` 把会话 ID、消息正文直接拼进 SQL。参数并不自动替你选择表名、列名或排序方向：这类 SQL **标识符/结构**要由服务端预先列出白名单，不接受客户端自由拼接。更完整的输入/输出攻击面留给 09.08，但从此章开始，查询值必须走参数绑定。

写入也要选对方法。`ExecContext` 适合不需要返回结果行的 `UPDATE/DELETE`，可从 `sql.Result.RowsAffected()` **在驱动支持时**得到受影响行数，并按 06.02 的预期检查 0、1 或更多行。某些驱动/命令不支持 `LastInsertId()`，不能把它当跨数据库通用的消息身份来源；若 PostgreSQL 插入需要返回 `message_id`，可用带 `RETURNING message_id` 的 SQL 配合 `QueryRowContext(...).Scan(...)`。数据库错误要按约束冲突、连接/超时、未知结果等类别处理，日志只留稳定错误码和受控标识，不复制消息正文或凭据。

“`ExecContext` 没报错”不自动表示客户端 A 已收到 HTTP 回应，更不能表示 B 已送达；若请求在写入后、响应前取消，调用方可能只见超时，实际存储结果需要另查。事务与崩溃后持久确认语义仍需 06.07/06.09 的具体条件，不能由 Go API 名称推出。

## 五、Context 和连接资源：超时在何处发生

HTTP 请求的 `r.Context()` 可传到应用层与 `QueryContext/ExecContext`，让客户端断开或请求取消有机会停止等待。若还要限定数据库操作的最长等待，可在更短的派生上下文中设置期限，结束时 `defer cancel()`。这只是**本次操作的控制信号**：超时可能发生在等池连接、发送查询、数据库执行或结果读取阶段；取消是否及时传到服务器，还取决于驱动和网络条件。

```text
等待连接 → 已发送语句 → 服务端执行 → 返回行/写入结果 → Scan/Decode
   ↑            ↑             ↑               ↑
  都可能发生超时；调用方看到超时，不能仅据此判定服务端绝未写入。
```

如果函数拿到 `Rows` 后忘记 `Close`，或者逐行扫描很慢，连接及数据库端资源会被占用更久；请求堆积时池等待也可能延长。`Rows.Close` 要在出错、提前返回和正常完成路径都执行，遍历后查 `Rows.Err`。`*sql.DB.Close` 应属于应用退出流程，不能在每次请求末尾关闭共享池。MongoDB 的 `Cursor.Close` 同理释放查询资源，Client 则由进程生命周期管理。

| 症状 | 当前能确认 | 还不能确认 |
|---|---|---|
| `QueryContext` 等池连接时超时 | 本次 Go 调用未取得可用连接 | 数据库是否整体宕机、别的请求怎样 |
| `Rows.Next()` 中途停止且 `Err()!=nil` | 本次结果未完整读取 | 已读的前几行能否当完整历史页 |
| 写入语句提交后响应丢失 | 客户端结果可能未知 | 不能从超时推出“数据库没写” |
| `Scan` 类型不匹配 | Go 结果映射失败 | 原始行是否未持久或无业务权限 |

实践中需记录**命令阶段、时间窗、受控错误类别、查询模板和请求关联标识**，避开原始 SQL 参数与聊天正文。池指标能帮助区分连接等待和数据库执行，但本章没有实际池或监控数据。

## 六、事务与批量写入先认责任，语义留给 06.07

当一次业务操作涉及“检查成员关系→分配 `seq`→写入消息→更新会话摘要”时，单独逐个调用 `db.ExecContext` 可能让中间结果暴露，也可能在并发下发生检查后状态变化。`database/sql` 的 `BeginTx` 返回 `*sql.Tx`，后续相关操作应通过**同一 Tx**进行，并以 `Commit` 或 `Rollback` 结束；在事务中途直接用 `db.ExecContext` 运行一条相关语句，可能走另一连接，破坏你以为的事务范围。

这还**不等于**“用了 Tx 就自动没有并发异常”。隔离级别、锁、重试、唯一序号分配与提交后结果未知需要 06.07–06.09 的具体机制。若把多条消息打成一批写入，也须先规定是“全部成功或全部失败”还是“允许部分成功”，如何报告第几条失败，如何根据消息 ID 重试；不能看到名为 `BulkWrite` 或一个循环就假定原子性。这里先在纸上画出开始、每次读写、提交/回滚和外部回应的边界，不执行数据库事务。

## 七、MongoDB Go 驱动：用 Client、Collection、Cursor 对照

文档教学路径沿 06.01–06.03 的独立 `messages` 文档：每条消息保留 `message_id/conversation_id/sender_id/seq/body`，按 `conversation_id` 与上一页 `seq` 查询。官方 MongoDB Go 驱动的 `Client` 管理连接池，应在进程内复用；由它取得 Database、Collection，再通过 `Find(ctx, filter, options)` 获取 Cursor。读取时在有界排序、投影、Limit 下循环 `Next(ctx)→Decode→Err`，并关闭 Cursor；应用退出时才 `Disconnect` Client。`Cursor.All` 会将结果全部装入内存，对于无界历史不应无条件使用。

```text
受信 u-a + c-a + beforeSeq=2
  → 应用层先核对可见权限
  → filter: conversation_id=c-a 且 seq<2
  → sort: seq DESC；limit: 20；projection: 客户端确实需要的字段
  → Find → Cursor.Next/Decode/Err → Cursor.Close
```

上述是**流程示意，不是可运行的 MongoDB 查询代码**；具体 API 名称和版本以所用驱动官方文档为准。MongoDB 文档中的 `conversation_id` 引用不会自动拥有 SQL 外键的全部行为，成员权限仍在应用合同里。`InsertOne/InsertMany/BulkWrite` 的错误、写入确认和批量结果要按 MongoDB 的具体配置与官方语义判断，不能把 SQL 的事务/外键结论直接迁过来。无论选 SQL 还是文档路径，**受信身份、页边界、资源关闭、错误分类与业务确认点**都要保留。

## 八、用双路径资源清单完成本章

交付一张纸上访问合同：输入 `subjectID` 必须来自服务端认证，`conversationID` 与游标/Limit 有效且绑定同一会话；查询当前成员或按业务定义的历史资格；获取按唯一 `seq` 排序的一页消息；只返回允许字段；在每条错误路径释放 Rows/Cursor，区分无权限、无消息、取消、扫描失败、数据库未知结果。再画一张 SQL/MongoDB 的对象、资源与确认边界对照表。实际实现与运行记录由学习者在隔离环境另存，本章不声称已经跑过。

### 分层练习：先答，再展开反馈

<details><summary>1. `database/sql` 会自己实现 PostgreSQL 网络协议吗？</summary>

不会；它提供通用接口，仍需具体驱动。</details>

<details><summary>2. `sql.Open` 成功就代表数据库此刻可连吗？</summary>

不能保证。可在有期限的上下文中用 `PingContext` 主动验证当时的连通性。</details>

<details><summary>3. `*sql.DB` 是单个 TCP 连接吗？</summary>

不是，它是并发安全的数据库句柄和连接池管理者。</details>

<details><summary>4. 为什么不在每个 HTTP 请求都 Open/Close 一个 DB？</summary>

这样破坏池复用并增加连接成本；应用生命周期应复用句柄。</details>

<details><summary>5. 当前成员资格查询找不到行，`QueryRowContext` 何时给错误？</summary>

在 `Scan` 时返回 `sql.ErrNoRows`。</details>

<details><summary>6. `ErrNoRows` 与连接失败可一律映射为无权限吗？</summary>

不能。前者可按本章合同解释为无成员，后者是访问故障。</details>

<details><summary>7. `Rows.Next()` 返回 false 就一定没有错误吗？</summary>

不一定。遍历后还要检查 `rows.Err()`。</details>

<details><summary>8. 多行查询何时设置 `defer rows.Close()`？</summary>

在 `QueryContext` 成功并得到非 nil Rows 后立刻安排关闭。</details>

<details><summary>9. 为什么尽量不用 `SELECT *` 给客户端历史接口？</summary>

模式增列会改变结果与 Scan 列数，也可能暴露不应返回的字段。</details>

<details><summary>10. SQL NULL 快照与没有 m-a 这一行有何不同？</summary>

NULL 表示行在但该字段未知；没有行由 `sql.ErrNoRows` 表达。</details>

<details><summary>11. `sql.NullString.Valid=false` 表示什么？</summary>

该扫描列为 SQL NULL，不能把它当真实空字符串。</details>

<details><summary>12. PostgreSQL `$1` 参数可以替客户端任意选择表名吗？</summary>

不能。它绑定值；表名、列名、排序方向等结构应由服务端白名单选择。</details>

<details><summary>13. `fmt.Sprintf` 拼入聊天正文或会话 ID 有何问题？</summary>

会把输入变成 SQL 结构的一部分，带来注入和审计风险；值应参数化。</details>

<details><summary>14. `RowsAffected` 一定每个驱动都支持吗？</summary>

不能假定。调用它也可能返回错误，须按驱动语义核对。</details>

<details><summary>15. PostgreSQL 插入并返回 message_id 可用什么入口？</summary>

可用 `INSERT ... RETURNING message_id` 配合 `QueryRowContext(...).Scan(...)`。</details>

<details><summary>16. Context 超时能证明写入绝未发生吗？</summary>

不能。超时可能发生在服务端处理后、客户端拿到结果前。</details>

<details><summary>17. 进入 Tx 后又用 `db.ExecContext` 执行相关语句有何风险？</summary>

它可能走另一连接，不属于这次 Tx；相关操作应通过同一 Tx。</details>

<details><summary>18. 有 Tx 就必然没有并发异常吗？</summary>

不能。还要定义隔离、锁、冲突重试和业务不变量。</details>

<details><summary>19. MongoDB 的 Client 应每请求新建吗？</summary>

不应。它含连接池，通常由进程复用，退出时 Disconnect。</details>

<details><summary>20. MongoDB Cursor 需要哪些遍历与关闭动作？</summary>

Next/Decode、遍历后 Err，并在用完或出错时 Close。</details>

<details><summary>21. 无界消息历史可直接 Cursor.All 吗？</summary>

不应。它可能把大量文档装入内存；先限页并迭代。</details>

<details><summary>22. SQL 或文档查询返回 m-a 就能证明设备收到吗？</summary>

不能。查询结果与设备交付确认是不同业务检查点。</details>

## 来源与下一步

- [Go：访问关系数据库](https://go.dev/doc/database/)、[打开数据库句柄](https://go.dev/doc/database/open-handle)、[查询](https://go.dev/doc/database/querying)与[连接管理](https://go.dev/doc/database/manage-connections)：`*sql.DB`、驱动、池、Rows 生命周期。
- [Go：修改数据](https://go.dev/doc/database/change-data)、[防 SQL 注入](https://go.dev/doc/database/sql-injection)、[取消操作](https://go.dev/doc/database/cancel-operations)及[`database/sql` API](https://pkg.go.dev/database/sql)：参数、执行结果、Context 与错误。
- [MongoDB Go 驱动：连接池](https://www.mongodb.com/docs/drivers/go/current/connect/connection-options/connection-pools/)、[查询](https://www.mongodb.com/docs/drivers/go/current/crud/query/retrieve/)与[Cursor](https://www.mongodb.com/docs/drivers/go/current/crud/query/cursor/)：文档路径的客户端复用、有界遍历和关闭责任。

按[学习路线](../learning_path.md)，下一章 06.07 回到“检查成员资格和写消息怎样作为一个操作，以及并发会发生什么”；06.05–06.06 的索引与执行计划在 S4 深化。离开本章前，要能画出**谁拥有 DB/Client、谁拥有 Rows/Cursor、何时释放、超时时还能确认什么**。
