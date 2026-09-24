---
title: 09.05 数据访问与迁移：让 IM 历史查询和消息提交有清楚边界
icon: /assets/icons/article.svg
order: 6
date: 2026-09-24
---

[返回第九卷](./README.md) · [应用边界：09.01](./01_requirements_boundaries.md) · [请求链：09.04](./04_request_pipeline.md) · [数据库前置：06.10](../06_databases/10_go_data_access.md) · [事务前置：06.07](../06_databases/07_transactions_anomalies.md)

# 09.05 数据访问与迁移：让 IM 历史查询和消息提交有清楚边界

> DeepTutor 初稿经技术与教学审阅后的静态课程。`u-a/u-b/c-a/m-a`、表、SQL、API 结果和故障均为教学示例；本次没有运行 Go、数据库、IM 服务或站点。教学 SQL 路径与固定版本 OpenIM 源码分开说明；上游事实只限文中实际核对的函数调用。

## 一、从内存版升级，先改“成功”的定义

09.01–09.04 让虚构教学 IM 有了读历史和发消息两条接口合同，但 S2 只承诺进程内受理。现在想让 `u-a` 发给 `c-a` 的 `m-a` 可以在以后查询，就必须增加持久数据来源、受信身份、会话成员权限和明确的提交点。06.01–06.03 已讲四表与模式，06.10 讲 Go 驱动和资源，06.07 讲并发事务；本章把它们装回**应用用例**，不再把 SQL、权限和 HTTP 分开讲成互不相干的清单。

先把三种结果写在需求旁：

| 检查点 | 教学 SQL 方案能怎样证明 | 还不能证明 |
|---|---|---|
| 数据库消息事务已提交 | 该事务成功返回、按稳定消息 ID 可在权威数据源核对 | A 客户端收到完整 HTTP 回应 |
| A 客户端收到回应 | A 自己观察到约定状态与消息 ID | B 的设备收到或展示 |
| B 的设备确认收到 | 未来设备回执或可核验事件 | 用户一定已阅读 |

用户看到超时，不能直接说“发送失败”；应用提交成功，也不能直接说“已送达”。本章**纸上设计**了一个 SQL 教学实现，但当前仓库没有对应运行中的持久 IM 服务，也没有真实数据库读写结果。

## 二、把 handler、应用服务和数据访问各放在合适位置

入口 handler 负责解析 HTTP 方法/路径、内容类型、大小和游标，取得上游已认证的主体；它不让请求体里的 `sender_id` 成为发件人。应用用例负责“谁可以读哪段历史”“谁可以发消息”“失败和结果未知如何向调用方表达”。数据访问层负责把明确的用例合同映射到 SQL 或文档驱动、参数、结果扫描、事务和错误。**接口应表达能力和业务约束**，不必机械地为每张表生成一套 CRUD 接口。

```text
读历史：HTTP 输入 → 受信主体 → 可见范围/页合同 → 数据访问 → 有界消息页
发消息：HTTP 输入 → 受信主体 → 校验/资格 → 受控事务 → 受理结果/结果未知
```

一个初学者可读的纸上接口可以是：

```go
type HistoryQuery struct {
    SubjectID      string // 只能由服务端认证层填写
    ConversationID string
    BeforeSeq      int64
    Limit          int
}

type HistoryReader interface {
    ListVisible(ctx context.Context, q HistoryQuery) ([]Message, error)
}
```

这里的 `Message` 是 01 卷已有的领域概念，片段省略其具体定义；它是**静态接口草案**。`ListVisible` 的名字承诺“只返回对该主体可见的消息”，因此实现必须真的执行授权与过滤，不能只把 `SubjectID` 接收下来却不使用。若应用服务先调用“能否读”再单独调用“取历史”，中间恰好退群，权限快照可能改变；要么业务合同允许这种时间差，要么把判断和读取放进能支持该合同的一致性边界。06.07 已说明，单有一个事务名称并不自动解决竞态。

接口的另一面是**别把存储细节泄露到领域层**：handler 不应直接 `rows.Scan`，应用服务不应决定 PostgreSQL `$1` 或 MongoDB BSON 字段名。但不能为了“分层漂亮”把成员授权藏到谁都找不到的适配器里。评审时要能从接口和调用顺序指出：**谁提供受信身份、谁定义权限、谁保证同一数据快照、谁分类错误**。

## 三、读历史：身份、参数、排序和资源是一条链

沿 06.02 的数据，`c-a` 有 `m-a(seq=1)`、`m-b(seq=2)`、`m-c(seq=3)`；上一页末项序号为 2，则下一页只取 `seq < 2`，得到 `m-a`。输入会话 ID、游标和 Limit 要校验，Limit 设上界；调用者 ID 从认证上下文取得，**不能**由客户端传一个 `u-a` 字符串就获得可见权。

在 PostgreSQL 教学路径里，值通过 `$1/$2/...` 参数绑定。先按产品规定的“当前成员可读”策略查成员资格，再按会话与唯一 `seq` 取有界消息页；若产品允许退群后看旧消息，当前 `members` 快照就不够，需要 06.03 的资格历史及时间规则。下面只表达**分页查询形状**，不是完整授权语句：

```sql
SELECT message_id, sender_id, seq, body
FROM messages
WHERE conversation_id = $1 AND seq < $2
ORDER BY seq DESC
LIMIT $3;
```

`$1=c-a`、`$2=2`、`$3=20` 是纸上参数，列名与排序方向是**服务端固定结构**，不能用字符串拼接不受信输入。若资格判断与读取分为两条 SQL，必须把两次观察之间的权限变化纳入合同；若需要严格同一决定顺序，还得按实际数据库事务/锁设计。SQL 命令能找到行，不会自动替应用判断 `u-a` 有权看该行。

Go 的 `QueryContext` 成功后由本次读取函数持有 `Rows`：及时 `defer rows.Close()`，逐行 `Next/Scan`，结束后查 `rows.Err()`。06.03 的旧消息昵称快照可能为 NULL，要用 `sql.NullString` 等表示“未知”，不把它当空字符串或现在的昵称。返回字段只含页面所需的消息身份、序号、发送者和许可展示信息，不因为 `SELECT *` 方便就把其他成员资料或内部字段送出。

MongoDB 教学路径换成独立 `messages` 文档上的 `conversation_id/seq` 过滤、降序、Limit 与必要字段投影；Go 驱动 `Cursor` 也要 `Next/Decode/Err/Close`，不能对无界历史无条件 `All` 到切片。MongoDB 文档引用没有 SQL 外键的自动保护，具体权限检查仍由业务合同承担。两条路径形状可比，**实现和写入确认不能互相冒充**。

## 四、发消息：把事务、冲突和未知结果接回 HTTP

虚构 `u-a` 提交 `m-a`。应用先用已认证身份确定发送者，按 UTF-8 字节检查正文，例如 `"中文甲"` 为 9 字节、再加 `a` 是 10 字节，应按 09.02 合同拒绝。然后确认会话/成员资格、稳定消息 ID 与序号的规则。教学 SQL 方案若约定“消息行与会话摘要一起生效”，两者应纳入**同一事务**；若摘要只是可重建的派生视图，也须写清允许的陈旧和修复方法。成员退群与发送并发还需 06.07 的共同决定顺序，仅仅在事务开头查过成员不够。

| 纸上结果 | 应用可判断 | 对 HTTP/重试仍要回答 |
|---|---|---|
| 参数或正文不合法 | 尚不应进入写消息事务 | 哪个字段错；不能回显真实正文或凭据 |
| 明确无发送权限 | 拒绝该业务意图 | 是否隐藏会话存在性，按 09.02 合同处理 |
| 同一 `message_id` 唯一冲突 | 已有同身份记录或冲突，需要核对 | 是同一次重试还是两个不同意图，不能只改 ID 再发 |
| 外键/约束冲突 | 数据模型拒绝当前写法 | 是会话不存在、状态变化还是实现缺陷 |
| 提交附近断网 | **结果可能未知** | 沿稳定操作/消息 ID 查权威状态，不盲目换 ID |
| 已知事务提交 | 数据库内约定变更成立 | A 是否收到回应、B 是否送达仍独立 |

Go `BeginTx` 后的相关读写都用同一 `*sql.Tx`，失败回滚、成功提交。若数据库明确报告可重试的并发冲突，应有界重试**整笔业务决策**，重新读取成员与序号；不能在回调里先推送设备，再指望数据库回滚撤销外部动作。`Commit` 附近连接断开时，不能把未知归为“确定未写”，而应通过稳定身份与后续查询处理。完整幂等与异步交付在 S5 再设计。

这里的**教学 SQL 事务**是为了讲清请求、权限、存储与确认点，**不是**固定版本 OpenIM 的发送实现。第七节将对照它实际的入队与 MongoDB 消费路径。

## 五、模式迁移：旧消息没有的事实不能凭空补

06.03 的新需求是保留“发送时显示名”。在纸上 SQL 方案中，先给 `messages` 增加可空 `sender_display_name_at_send`；新写入从当时受信资料取得快照；读取时有真实快照就展示，没有可靠来源的旧行标“历史昵称未知”，或清楚标明是在显示**当前**昵称。不要把 `users` 现在的名字批量写入旧消息并称为发送时名字。

部署顺序应留出旧代码和旧数据并存窗口：**扩展结构→新写入→兼容读取→可信来源分批回填与核对→有条件收紧→清理旧路径**。旧行若永久缺真实快照，不能强行全表 `NOT NULL`；旧服务若仍按原结构读写，也不能提前删列或删除兼容读分支。迁移的批次、覆盖率、未知行数、差异和回退点应与提交版本一起记录。PostgreSQL 的 `ALTER TABLE` 能改模式，不能自动解决这些历史语义、锁等待与发布兼容问题。

本章没有执行 DDL 或回填。学习者将来在个人隔离环境实践时，需要分别保存“迁移语句执行结果”和“业务历史展示仍正确”的证据；只见数据库列存在，不等于新旧版本都能正确读写。10.09 的 CI 可以检查静态迁移脚本和测试入口，但不会自动替代真实旧数据/旧客户端的兼容验证。

## 六、为业务负例安排验证层次

用虚构数据先写预期，而后才选择验证层：`u-a` 在 `c-a` 合法发 `m-a`；非成员 `u-c` 读取 `c-a` 应拒绝；`"中文甲a"` 的 10 字节正文应在写入前拒绝；同 ID 再次提交要按重试合同核对；退群与发送并发按已定义顺序裁决；数据库连接断开和提交结果未知要保持不同反馈。

| 验证层 | 可检查什么 | 不能独自证明什么 |
|---|---|---|
| 单元测试/可控替身 | 字节上限、错误映射、应用分支、受信身份是否被传递 | 真正 SQL 约束或驱动资源释放 |
| 隔离数据库集成验证 | 参数、约束、查询排序、事务/迁移在指定版本的行为 | 真实客户端、外部队列和设备送达 |
| HTTP 合同验证 | 状态、错误体、分页与权限拒绝是否符合 09.02 | 崩溃后恢复和高并发所有交错 |
| 故障/并发推演 | 超时、重复、退群竞态的已知/未知/下一证据 | 未实际执行时不能写成“已通过” |

本次只完成**课程正文与纸上例子**，没有运行 Go、数据库或真实 IM。以后学习者的实际结果要标明环境、数据种子、提交 SHA、命令、失败情形和约束；日志和报告不能放真实 IM 正文、令牌或个人资料。绿色 CI 只说明其所跑检查在对应提交和环境里通过，不能自动证明上游项目或生产流量有相同结果。

## 七、固定 OpenIM 源码：入队返回与 MongoDB 消费是两段

现在只读对照固定的 `openimsdk/open-im-server` 提交 **`f6411a8a1a31d3df36f4c2b3ad28481a94141e1f`**。在 [`internal/rpc/msg/send.go` 的群聊路径](https://github.com/openimsdk/open-im-server/blob/f6411a8a1a31d3df36f4c2b3ad28481a94141e1f/internal/rpc/msg/send.go#L46-L70)中，`sendMsgGroupChat` 做前置处理后调用 `m.MsgDatabase.MsgToMQ(...)`，调用返回无错后组装 `SendMsgResp`，写入 `SendTime/ServerMsgID/ClientMsgID`。[同文件的单聊路径](https://github.com/openimsdk/open-im-server/blob/f6411a8a1a31d3df36f4c2b3ad28481a94141e1f/internal/rpc/msg/send.go#L140-L175)在 `isSend` 分支中也调用 `MsgToMQ` 后返回响应；其余分支不能概括为同一行为。

另一个文件 [`internal/msgtransfer/online_msg_to_mongo_handler.go`](https://github.com/openimsdk/open-im-server/blob/f6411a8a1a31d3df36f4c2b3ad28481a94141e1f/internal/msgtransfer/online_msg_to_mongo_handler.go#L43-L69)显示 MongoDB 消费处理函数从消息中解码 `MsgDataToMongoByMQ`，随后调用 `msgTransferDatabase.BatchInsertChat2DB(...)`，并按该调用的错误分支更新成功/失败计数。这两段源码足以说明：**发送 RPC 返回的位置并不是这段 MongoDB 批量写入完成的位置**。因此不能把该发送响应直接写成“MongoDB 已写入”或“B 的设备已收到”。

| 教学 SQL 路径 | 固定源码中已核对的 OpenIM 路径 |
|---|---|
| 本章假设一个可明确提交的消息事务，并以提交结果作教学持久检查点 | `send.go` 调用 `MsgToMQ` 后组装发送响应；MongoDB 消费另在 `online_msg_to_mongo_handler.go` 调用 `BatchInsertChat2DB` |
| 直接讨论 SQL 主外键、成员行和同一事务 | 这两段源码没有证明使用本章四张 SQL 表或同一个数据库事务 |
| 事务成功仍不代表 A 或 B 的外部确认 | 入队调用返回也不能由这两段代码推出队列确认级别、故障保证、MongoDB 成功或设备送达 |

**证据边界：**本章没有检查 `MsgToMQ` 的生产者确认配置、Kafka 消费进度与重试机制、`BatchInsertChat2DB` 的底层写关注或完整设备链路。那些问题必须在 S5 按函数和配置继续追踪，不能由函数名或两处返回语句补出未核对的保证。教学 SQL 模型帮助先学机制，再以真实源码发现项目中新增的异步阶段与失败点。

## 八、交付两条调用路径与分层练习

学习者应能画出**教学 SQL**的“已认证请求→业务授权→事务/查询→HTTP 回应”路径，以及**固定 OpenIM 源码可见**的“发送 RPC→`MsgToMQ`→返回”和“另一消费路径→`BatchInsertChat2DB`”两段。每一箭头标“已知、未知、下一份证据”；再交一张迁移兼容表和一张资源所有者表。不要把两条图接成一条未经核对的同步事务。

### 分层练习：先答，再展开反馈

<details><summary>1. 本章教学方案升级了 S2 的哪个边界？</summary>

从进程内受理的静态设计进入有明确持久数据来源和数据库提交点的教学方案。</details>

<details><summary>2. 客户端请求体写 `sender_id=u-a` 足以认证发件人吗？</summary>

不能。发件人身份须来自服务端验证后的上下文。</details>

<details><summary>3. handler 应直接扫描 `sql.Rows` 吗？</summary>

不宜。handler 负责 HTTP 输入输出；数据访问层负责查询与扫描。</details>

<details><summary>4. `ListVisible` 接口只收 SubjectID 却不检查权限，合同成立吗？</summary>

不成立。名字承诺可见范围，实现必须真实执行授权/过滤。</details>

<details><summary>5. “先查权限、再另查历史”可能出现什么时间差？</summary>

两次查询之间成员资格可能变化，需按业务合同决定一致性边界。</details>

<details><summary>6. `seq < 2` 在本章纸上 c-a 数据返回什么？</summary>

上一页末项为 seq=2 时，返回更旧的 m-a(seq=1)。</details>

<details><summary>7. SQL 参数 `$1` 可以安全地代表任意客户端提供的表名吗？</summary>

不能。它绑定值；SQL 结构应由服务端固定或白名单选择。</details>

<details><summary>8. 多行查询成功后，谁负责 Rows？</summary>

发起查询的函数负责 Close、逐行 Scan 和遍历后 Err 检查。</details>

<details><summary>9. 旧消息昵称快照为 NULL 可以当空昵称吗？</summary>

不能。它表示历史值没有可靠记录，须保留未知语义。</details>

<details><summary>10. MongoDB 引用字段自动等于 SQL 外键吗？</summary>

不等于。需要独立设计引用有效性和业务权限。</details>

<details><summary>11. `"中文甲a"` 为什么被本题拒绝？</summary>

在 UTF-8 下为 10 字节，超过纸上 9 字节上限。</details>

<details><summary>12. 消息事务提交能证明 B 设备收到吗？</summary>

不能。数据库提交与设备交付是不同检查点。</details>

<details><summary>13. 唯一键冲突就能自动知道是同一次发送重试吗？</summary>

不能。还要核对稳定操作身份及请求内容/业务合同。</details>

<details><summary>14. Commit 附近断网应立即换新消息 ID 重发吗？</summary>

不应。提交可能已成功，应沿稳定 ID 查询权威状态。</details>

<details><summary>15. 事务中先推送 B，再回滚消息行，推送会被回滚吗？</summary>

不会。外部推送不属于普通数据库事务。</details>

<details><summary>16. 当前用户昵称能无标记地回填成发送时快照吗？</summary>

不能。用户可能改名；无可信历史来源时应保留未知或明确标记回退。</details>

<details><summary>17. 旧写入者仍在，能直接给新快照列全表加 NOT NULL 吗？</summary>

不应。旧行和旧写入可能缺值，先完成兼容与覆盖策略。</details>

<details><summary>18. 单元测试能证明真实驱动的事务/游标行为吗？</summary>

不能。需在隔离数据库环境做有范围的集成验证。</details>

<details><summary>19. OpenIM 固定 `send.go` 中已核对的群聊与单聊发送分支调用什么入口？</summary>

群聊路径和单聊的 `isSend` 分支调用 `MsgDatabase.MsgToMQ`。</details>

<details><summary>20. MongoDB 批量写入在哪条已核对源码路径中调用？</summary>

在 `online_msg_to_mongo_handler.go` 的消费处理函数中调用 `BatchInsertChat2DB`。</details>

<details><summary>21. 仅看这两段源码能证明 MsgToMQ 的持久确认级别吗？</summary>

不能。还需核对生产者配置、队列确认与故障路径。</details>

<details><summary>22. 发送 RPC 返回带 ServerMsgID 就证明 MongoDB 已写入了吗？</summary>

不能。已核对代码里，MongoDB 写入位于另一消费路径。</details>

## 来源与下一步

- [Go：数据库访问](https://go.dev/doc/database/)、[查询](https://go.dev/doc/database/querying)、[事务](https://go.dev/doc/database/execute-transactions)与[SQL 注入](https://go.dev/doc/database/sql-injection)：参数、资源和事务范围。
- [PostgreSQL：修改表结构](https://www.postgresql.org/docs/current/ddl-alter.html)与[MongoDB Go：Cursor](https://www.mongodb.com/docs/drivers/go/current/crud/query/cursor/)：兼容迁移与文档查询资源。
- [固定 OpenIM `send.go`](https://github.com/openimsdk/open-im-server/blob/f6411a8a1a31d3df36f4c2b3ad28481a94141e1f/internal/rpc/msg/send.go)和[MongoDB 消费处理](https://github.com/openimsdk/open-im-server/blob/f6411a8a1a31d3df36f4c2b3ad28481a94141e1f/internal/msgtransfer/online_msg_to_mongo_handler.go)：本章只据实际阅读的调用与返回位置作有限对照。

按[学习路线](../learning_path.md)，下一步补 09.06 的浏览器/客户端边界和 09.07 的认证授权，再用 09.08 系统整理输入/输出防护；S5 才追完整异步消息保证。离开本章前，应能指出**教学模型的提交点、上游已核对的入队与消费点、以及二者都尚未证明的客户端/设备结果**。
