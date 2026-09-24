---
title: 09.03 程序组织：让 handler、业务规则与内存适配器各守边界
icon: /assets/icons/article.svg
order: 4
date: 2026-09-24
---

[返回第九卷](./README.md) · [接口前置：09.02](./02_http_api_contract.md) · [包设计前置：01.09](../01_go/09_packages_evolution.md)

# 09.03 程序组织：让 handler、业务规则与内存适配器各守边界

> DeepTutor 初稿经技术与教学审阅后的静态课程。目录、Go 接口、调用图和故障是教学设计，不是本仓库新增的服务软件；本次没有运行 Go、HTTP 服务、测试或站点构建。

## 先有接口合同，再决定代码放在哪里

09.01 已定义“`u-a` 读取 `c-a` 历史”和“提交 `m-a` 到 `c-a`”两张用例卡；09.02 固定了 GET/POST 路径、页大小默认 20 且范围 1–100、POST 原始 JSON 最多 4096 B、文本正文最多 6 UTF-8 字节、重复 ID 返回 409，以及成功只承诺本进程内存 `accepted_in_memory`。现在需要回答：**哪些代码关心 HTTP，哪些代码关心业务，谁拥有内存消息状态，启动时怎样把它们连起来？**

当前仓库仍只有本地 `imhistory` CLI，下面的目录与代码都只是未来个人教学实现的方案；不表示服务已经可启动、对外开放或实现真实身份。`c-a/u-a/u-b/m-a` 均为虚构身份，OpenIM 固定版本继续作为源码对照，不把教学内存适配器说成它的实际存储。

| 第一遍 | 第二遍 | 练习成果 |
|---|---|---|
| 包、依赖图、handler 与应用服务 | 适配器、配置、日志、错误与取消 | 一张调用图和四层责任表 |

## 一、不同变化原因不应全部堆到 handler

一个初学者容易把所有步骤写入 `ServeHTTP`：从 URL 找 `c-a`、读 JSON、检查 `u-a`、校验正文、操作 map、写日志、选 HTTP 状态。最初似乎只需一个函数，后来“分页从 20 改为 30”“权限规则变化”“把内存换成文件”都要改同一段代码，审阅者也很难判断哪一次变更破坏了 09.02 的合同。

先按**谁提出变化**拆责任，而不是按文件行数机械切成十层：

| 变化原因 | 本题合适的归属 | 应保留的外部合同 |
|---|---|---|
| HTTP 路径、JSON、状态码或错误体 | `httpapi` 边界 | GET/POST、机器码、内容类型 |
| 谁可读取/发送、一次操作何时受理 | `app` 应用服务 | 可信主体与动作级权限 |
| 6 字节正文、会话内唯一性 | `domain` 规则与状态不变量 | 非法输入不修改旧消息 |
| 内存 map、列表与局部序号怎样保存 | `memorystore` 适配器 | 当前进程内原子追加与快照 |
| 监听地址、限额和依赖接线 | `cmd` 启动入口 | 一套已验证、可说明的配置 |

这不是把一个 Go 进程拆成五个网络服务。它们可以是**同一个模块里的包**，共同构成一次教学进程；“分层”回答的是知识与变化的归属。若一个函数只做简单领域判断，直接调用也可以，不需要为了目录看起来整齐而增加无意义接口。10.05 已讲过重构时按可观察行为核对，09.03 在新设计时也应从既定合同倒推代码边界。

## 二、Go 包与单向依赖：谁能知道谁

下面的模块路径、文件树都是纸上示意，**不会添加到本课程仓库**：

```text
teachingim/
├── go.mod                         module example.com/teachingim
├── cmd/teachingim/main.go         读取配置、构造依赖、启动与收尾
├── internal/httpapi/              HTTP 请求/响应适配
├── app/                           读历史与发送用例、消费方小接口
├── domain/                        消息规则与领域数据
└── internal/memorystore/          单进程 map+order 的实现
```

依赖方向可画成：

```text
cmd/teachingim ──→ httpapi ──→ app ──→ domain
        └────────→ memorystore ─────────→ domain
```

`httpapi` 可以引用应用服务的方法，但 `domain` 不为了检查正文而导入 `net/http`、`os` 或 JSON 适配代码。`memorystore` 使用领域消息类型，却不用反向让 `app` 导入它；否则未来换存储实现时应用层也要跟着改。`cmd` 是**组合根**：它知道具体的存储和 HTTP 入口，负责把实例传给消费方。Go 不允许包导入环，所以依赖图也应能从上往下读完而不绕回起点。

`internal` 是 Go 的导入范围机制，表达“该目录树之外不应把此实现当公共包依赖”，**不是安全沙箱**。即使适配器放在 `internal/`，也没有让网络接口自动获得身份验证、文件权限或容器隔离。应用服务的接口由**使用存储能力的消费方**定义，具体内存适配器靠方法集隐式满足；小接口比照着某个大型数据库客户端复制全部方法更容易理解。

## 三、handler 只把 HTTP 世界转换为应用请求

`net/http` 的 `Handler` 收到 `*http.Request`，通过 `http.ResponseWriter` 写回应。对本章 POST，handler 的责任包括：核对方法与路径、限制**原始请求正文 4096 B**、按 `application/json` 解码严格允许的字段、取出路径中的 `c-a`、从可信认证边界得到主体、传入 `r.Context()`，最后把应用层结果映射成 09.02 的 HTTP 状态与 JSON。对 GET，再解析 `limit/before/sender`，拒绝非法范围和未知参数。

```text
POST /v1/conversations/c-a/messages
→ handler 限量读取 4096 B、解析 {message_id,body}
→ 可信边界提供 principal=u-a（S3 才真实实现）
→ app.Send(ctx,u-a,c-a,m-a,"你好")
→ handler 按应用结果写 200 accepted_in_memory 或稳定错误体
```

`sender_id` 不在本章允许的请求 DTO 中；handler 不得拿 JSON 字段或来源 IP 当认证主体。S2 的固定虚构主体只可在**私有隔离练习**中由测试桩提供，不能把它与公网监听组合成真实身份系统。`http.MaxBytesReader` 可作为未来 Go handler 限制读入的标准库入口，实际实现还须在读取错误时映射超限类别 413，并区分 malformed JSON 与业务正文过长。它不替代领域的 6 字节规则，也与 01.12 本地 CLI 的 1 MiB 文件上限无关。

handler **不**直接向 `byID` map 插入消息、不自己判定 `u-a` 是否有权读 `c-a`、不把分页游标当可任意信任的整数、不在每个分支自行拼接不同错误格式。它只处理传输边界：应用业务判断要交给服务，错误向外统一转换。

### 响应只能按一次最终状态提交

Go 的 `ResponseWriter.WriteHeader` 用于写 HTTP 状态；如果没显式写，第一次 `Write` 会隐式写 200。因而“先写一段成功 JSON，后面才发现权限或存储错误，再改成 403/500”并不能按预期改变已经提交的最终响应。对小 JSON 回应，先得到应用结果并准备好要编码的表示，决定状态和头部后再写正文；若写出过程中失败，要按“响应可能部分发送”记录，不能再冒充一个全新的完整错误响应。

这个原则也解释为什么只读历史要**先完成授权、分页与整页数据核对**，再写第一字节；否则一条后续记录出错时，下游可能已拿到半页历史。流式接口另有自己的部分结果合同，本章未设计。Go `net/http` 服务器会管理传入请求的 `Body` 关闭，但 handler 必须在写回应前限量读取并处理读取错误；别把“服务器会关闭 Body”误当作“它会自动验证 JSON”。

## 四、应用服务选择动作，领域层守住不变量

应用服务接受“由可信边界得到的主体”和已解析输入，决定这次操作是否有权发生、在哪个状态检查点算完成。对 `Send`：先核对 `u-a` 是否可向 `c-a` 发送，读取**服务端掌握的**会话种类，再调用领域校验检查 `body`，最后请求存储做一次同会话原子追加。对 `List`：先核对读权限，再从存储拿当前可见的内存快照，按 09.02 的 `sender`、局部序号倒序、排他游标和 `limit` 形成一页结果。

为了让应用服务不依赖具体 map，消费方可以定义**仅需的存储能力**。下列是放在 `app` 包内的接口形状；`domain.Message` 只表达教学内存消息，不带 HTTP 响应码：

```go
// app 包的设计片段；实际文件需导入 context 与 domain 包。
type HistoryStore interface {
	Append(ctx context.Context, conversationID string, m domain.Message) error
	Snapshot(ctx context.Context, conversationID string) ([]domain.Message, error)
}

type Authorizer interface {
	CanRead(ctx context.Context, actorID, conversationID string) error
	CanSend(ctx context.Context, actorID, conversationID string) error
}
```

`memorystore` 不用声明“implements app.HistoryStore”，只要方法签名满足便可传入。此接口刻意小：`Send` 需要追加，`List` 需要快照；并不因为未来可能有 MongoDB 就先暴露 `DropDatabase`、`Connect` 或全部驱动方法。为保持依赖图，内存适配器可在锁内分配局部受理序号，把它与可信作者一起保存并纳入后续快照；本示意 `Append` 只返回错误，因为 09.02 的成功正文仅需消息 ID 和受理状态。上面的片段只展示**依赖方向**，不能单凭它声称 09.02 的分页和权限已实现。

领域规则可以复用 10.02 的纯函数思想：会话种类有效、正文原始 UTF-8 字节非空且不超过 6 字节。同会话消息 ID 唯一由存储在同一临界区维护，避免两个请求都先检查“不存在”。`domain` 不理解 `WriteHeader`、URL 或 `Cache-Control`；应用服务返回“内存已受理”的业务结果或可识别错误，只有外层 handler 才决定用 200、400、403 或 409 表达。

应用服务也不应把授权做成“只在 handler 某条路由检查”。未来可能还有 WebSocket 或内部调用入口，若业务操作只有 HTTP handler 在检查权限，换入口就可能绕过。认证主体从边界进入，**对象级授权作为用例的前置**留在应用服务，由以后真正实现的 Authorizer 提供数据与判断。S2 的固定主体/固定会话只能用于私有教学实验，不能代替 S3 的认证和成员状态。

## 五、内存适配器与启动接线各承担什么

`memorystore` 可以沿 05.02 的 `History`：同一会话内用 map 按 ID 查找、切片保留成功追加顺序，一把锁保护“查重→写 map→追加顺序”；读取时在读锁内复制快照。若 09.02 要局部序号，递增与消息追加也应在**同一状态变化**内完成，保证序号与列表一致。查询游标若由应用服务编码，就要绑定会话、排序和过滤，并拒绝畸形/过期位置；用内存序号的游标不承诺跨进程或重启有效。

```text
一次本章 POST（仅示意依赖接线）
cmd 先创建并验证 Config
  ├─ 构造内存 HistoryStore
  ├─ 在隔离教学范围提供虚构身份/授权替身
  ├─ 构造 app.Service(store, authorizer, rules)
  └─ 构造 httpapi.Handler(service, response policy)
```

这是**组合根**，它知道哪一个具体对象填进哪个接口。`app.Service` 本身无需在方法内部 `newMemoryStore()`，否则每次调用可能拿到不同历史，也使单元测试难以注入固定失败。一个进程里若只建一份内存适配器，两个 handler 可看到同一份状态；进程退出仍会丢失它。不能因此称为已持久化或跨节点统一历史。

内存适配器不负责回应 HTTP 404/409，也不应直接写 `stdout` 日志。它返回如 `ErrDuplicate` 等稳定错误身份与必要上下文，应用服务决定业务类别，handler 再映射为外部协议。若另一个 adapter 以后使用数据库，它还要兑现 `Append` 的原子唯一性与 `Snapshot` 范围合同，不能因为方法同名就假定故障语义相同。

## 六、配置与日志也有边界

本章未来教学服务可集中维护一份配置：监听地址、POST 原始正文 **4096 B**、业务正文 **6 B**、GET `limit` 默认 **20**、允许 **1–100**，以及是否启用私有实验认证替身。启动时先校验“上限为正、默认在范围内、监听地址可解释”，无效配置应在接收请求前报清楚，而不是第一条业务请求才碰到异常。实际身份未实现前，固定身份模式必须限制在个人隔离实验环境，不能仅靠日志里写“仅测试用”就允许公开访问。

这些值不来自 01.12 CLI 的 `IMHISTORY_FILE` 或本地 1 MiB 文件合同。网络服务若未来有环境变量、文件与启动参数，**需自己定义配置优先级和缺失/非法值处理**；不能沿用本地工具的 `-file` 顺序后不加说明。配置有默认值也不等于已经验证过所有值，应用与 handler 要以同一份已验证配置工作。

日志是维护者观察“哪一阶段、哪一类错误、耗时和计数”的工具。命令入口或 HTTP 边界可使用 Go `log/slog` 记录操作、稳定错误码、请求关联标识与必要的时间范围；默认不记录原始消息正文、完整 JSON、访问令牌或真实用户资料。若需要定位单条虚构 `m-a`，先想能否只记录脱敏的关联 ID 和操作阶段。领域函数不应为了验证 `len(body)` 而依赖某个日志后端；日志也不能代替客户端可读的错误响应或业务审计合同。

## 七、错误、取消与验证证据沿同一条路径返回

不同层不应靠比较 `err.Error()` 文本猜类别。领域/内存适配器给出 `ErrInvalid`、`ErrDuplicate` 等可识别错误，应用服务可用 `%w` 包装上下文，handler 最外层通过 `errors.Is` 或明确业务结果映射到 09.02 的**HTTP 状态与机器码**。例如重复同键映射 409 `DUPLICATE_MESSAGE`，正文超限映射 400 `TOO_LONG`，原始请求过大在 HTTP 边界映射 413 `REQUEST_TOO_LARGE`；未知内部错误才到 500 `INTERNAL`，并避免把底层堆栈、正文或令牌回显给客户端。

| 位置 | 本次关键事实 | 对外谁解释 |
|---|---|---|
| handler 解码失败 | 请求 JSON/媒体/大小不符合协议 | handler 给 400/413/415 的固定体 |
| app 授权失败 | 可信 `u-a` 不可对 `c-a` 做本动作 | handler 按隐藏策略给 403/404 |
| domain 验证失败 | 正文或种类违反教学规则 | handler 给 400 与稳定机器码 |
| memorystore 重复 | 该会话已有 `m-a`，旧值不变 | handler 给 409 |
| 已提交后响应丢失 | 内存状态可能已变，客户端未见结果 | 记录未知外部结果，不编造 500 |

`r.Context()` 在 Go HTTP 请求中能把客户端断开或请求结束等取消信号交给下层。应用服务与适配器应在会等待的地方尊重它，但**取消不是内存回滚**：若已经完成 05.02 的锁内追加，handler 后来发现客户端已断开，不能倒推消息没有受理。响应可能已提交一部分时也不能重新选择“从头返回 500”。09.04 会详解中间件、超时、panic 和响应提交的次序。

将来学习者验证这套设计时，证据可分四层：纯领域校验的 6/7 字节边界；用可控授权/存储替身核对应用用例；`httptest` 核对 handler 的路径、体大小、状态和 JSON；真实内存适配器核对同会话重复与列表快照。每层只能证明所经过的边界，静态课程本轮**没有运行** Go 测试、服务或站点。

## 八、完整请求轨迹与分层练习

按一个合法 POST 逐步追踪：虚构 `u-a` 对 `c-a` 有发送资格，`m-a/"你好"` 正文 6 字节。handler 读取不超过 4096 B 的 JSON，从路径得 `c-a`；可信边界提供 `u-a`；app 核对发送资格并用 domain 校验；memorystore 在单锁区分配局部位置、写入消息；app 回“内存已受理”；handler 返回 200 `accepted_in_memory`。每走一步，写下所处包、拿到的数据是否可信、哪条错误会从这里返回。再把主体换成无权的 `u-x`，或把正文换成 9 字节的 `你好呀`，分别证明**不能到内存追加**。

### 分层练习：先回答，再核对反馈

<details><summary>1. handler 应直接改 `History.byID` 吗？</summary>

不应。内存状态不变量由适配器维护，handler 负责 HTTP 边界。</details>

<details><summary>2. `domain` 要知道 HTTP 409 吗？</summary>

不需要。它返回领域错误身份，外层映射到接口状态。</details>

<details><summary>3. `cmd/teachingim` 的主要责任是什么？</summary>

验证配置、构造具体依赖并接线，管理启动与收尾设计。</details>

<details><summary>4. `internal` 会自动验证 `u-a` 的身份吗？</summary>

不会。它限制 Go 包导入范围，不是认证机制。</details>

<details><summary>5. 为什么由 app 定义小型 HistoryStore 接口？</summary>

接口只表达消费方需要的追加和快照，减少对具体内存/数据库实现的依赖。</details>

<details><summary>6. 内存适配器必须显式写 `implements HistoryStore` 吗？</summary>

不必。Go 通过方法集隐式满足接口。</details>

<details><summary>7. 4096 B 限额属于哪一层？</summary>

HTTP 原始请求体解析边界；与领域正文 6 B 不同。</details>

<details><summary>8. `IMHISTORY_FILE` 是这个未来服务的配置来源吗？</summary>

不是。它属于 01.12 本地 CLI，网络服务需另定自己的配置合同。</details>

<details><summary>9. handler 可以从 JSON `sender_id` 获得可信主体吗？</summary>

不能。主体由服务端认证边界给出，客户端字段可伪造。</details>

<details><summary>10. 对 `c-a` 的读取资格与发送资格必然相同吗？</summary>

不一定。应用服务应按动作分别检查。</details>

<details><summary>11. `ResponseWriter.Write` 先写了成功 JSON，之后还能重设最终 403 吗？</summary>

不能按预期重设；第一次写入可能已隐式提交 200。</details>

<details><summary>12. 为什么小 JSON 响应要先准备表示再写出？</summary>

避免编码或业务错误发生在状态已提交后，留下部分成功体。</details>

<details><summary>13. 同会话重复 ID 由谁在同一锁区判断？</summary>

内存适配器，它保护查重、map 和顺序的一次完整变化。</details>

<details><summary>14. `Snapshot` 返回后，旧快照会随新消息自动更新吗？</summary>

不会。它是那次读取范围的一份独立内存视图。</details>

<details><summary>15. 局部序号分配可以在锁外另做吗？</summary>

若它与追加顺序是一项不变量，应在同一受控状态变化里完成。</details>

<details><summary>16. `slog` 中直接记录真实令牌和正文合适吗？</summary>

不合适。记录必要的阶段、分类与脱敏关联信息。</details>

<details><summary>17. `errors.Is` 比比较错误文本适合什么？</summary>

沿 `%w` 包装识别稳定错误身份，再映射 HTTP 类别。</details>

<details><summary>18. `r.Context()` 取消会撤销已完成的内存追加吗？</summary>

不会自动回滚。取消需要下层协作，提交后结果可能对客户端未知。</details>

<details><summary>19. `httptest` 的成功未来可证明数据库持久化吗？</summary>

不能。它只覆盖所接入的 handler、应用替身和对应边界。</details>

<details><summary>20. 一次 POST 返回 200 就能说 B 设备收到吗？</summary>

不能。09.02 的 200 只承诺教学进程内存受理。</details>

<details><summary>21. 固定虚构主体的授权桩可直接公网部署吗？</summary>

不能。它仅用于隔离教学；真实认证与授权在 S3 设计实现。</details>

<details><summary>22. 启动时校验配置有何作用？</summary>

提前拒绝互相矛盾或非法的上限与地址，使 handler 使用同一份已验证合同。</details>

## 来源与下一步

- [Go `net/http.Handler`](https://pkg.go.dev/net/http#Handler)、[`MaxBytesReader`](https://pkg.go.dev/net/http#MaxBytesReader)、[`ResponseWriter`](https://pkg.go.dev/net/http#ResponseWriter)：HTTP 边界与响应提交。
- [Go `log/slog`](https://pkg.go.dev/log/slog)、[Effective Go 的接口说明](https://go.dev/doc/effective_go#interfaces)：日志与小接口的标准库/官方阅读入口。
- [09.01 用例合同](./01_requirements_boundaries.md)与[09.02 HTTP 合同](./02_http_api_contract.md)是本章所有目录和错误映射的课程依据。

下一章[09.04 请求处理链](./04_request_pipeline.md)将把请求进入、认证/授权、应用调用、取消和响应提交放进同一条处理链；进入前应能从 handler 追到内存适配器，再带着错误身份回到唯一的 HTTP 映射点。
