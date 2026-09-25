# 13.03 模块与信息隐藏：消息接口为什么不能暴露分区和表名

> DeepTutor 八节初稿经技术与教学审阅后的静态课程。接口、包名和变更均为**虚构纸上设计**，代码片段未编译或运行。当前 S2 `/v1` 正文非空且最多 **6 UTF-8 B**、原始 HTTP 请求正文最多 **4096 B**、同 ID 重复 **409**、非成员隐藏 **404**、成功 `200 accepted_in_memory` 只表示本进程内存受理。未来 S3 `/v2` 的 `stored_in_teaching_db` 是提议且仍为 6 B，R9 的 6→9 B 待审。未来 `m-9/seq9/E9` 只用于分析接口，不是现有服务能力。[09.02 当前合同](../../../src/docs/platform_engineering/curriculum/09_backend_security/02_http_api_contract.md)

## 一、接口是别人必须知道的承诺，模块是承担承诺的边界

13.02 已区分消息意图 `m-9`、会话序号 `seq9`、事件 E9、broker offset 与 B 设备游标。现在要决定：A 的 HTTP 处理代码、业务用例、存储适配器和异步转发之间，**谁需要知道哪一种身份和失败条件**？模块可以是一个 Go 包、一组合作类型，或更大的内部组件；其**公开接口**是调用者要提供什么、能得到什么、遇到什么错误，**内部实现**是为了履约而选的算法、数据结构和依赖。[John Ousterhout：Modular Design](https://web.stanford.edu/~ouster/cgi-bin/cs190-winter18/lecture.php?topic=modularDesign) · [13.02 身份账本](../../../src/docs/platform_engineering/curriculum/13_architecture/02_domain_state_modeling.md)

**信息隐藏**隐藏的是可能变化、且调用者无须决策的实现细节。例如未来会话序号如何分配、权威数据落哪张表、E9 在哪个分区、重试怎样排程。它不允许隐藏调用者必须据此判断的业务语义：当前 200 只受理在内存、重复 ID 返回 409、非成员隐藏 404、未来 DB 存储成功尚是另一合同。一个接口即使只有一个方法，若让调用者猜“成功到底成功到哪”，仍是坏接口。[Parnas：On the Criteria To Be Used in Decomposing Systems into Modules](https://www.cs.lafayette.edu/~gexia/cs301/resources/parnas.html)

| 问题 | 应由接口说清 | 可以由模块内部选择 |
|---|---|---|
| A 发一次消息 | `message_id` 的作用域、校验、确认点与错误 | 内存结构、未来持久索引和重试实现 |
| B 取历史 | 会话、身份、游标、授权与有序结果 | DB 查询计划、缓存、批量分页实现 |
| E9 发布 | 是否另有异步阶段、状态如何观察/恢复 | broker 分区和 offset、发布批次 |
| B 设备确认 | 哪台设备确认到哪一个连续位置 | 游标表名、压缩与内部事件 |

## 二、按可能变化的决定分模块，别按执行步骤机械切层

Parnas 的模块划分思路是让某些**可能独立变化的设计决定**藏在模块之内，使变更时知道需要修改的地方尽量少。Ousterhout 进一步用“深模块”说明：调用者面对较简单的接口，模块内部却处理较多真实复杂性。两者都不是“文件越多、接口越多越好”；要看调用者少知道了什么、变更的传播面是否真的缩小。[Parnas 原文](https://www.cs.lafayette.edu/~gexia/cs301/resources/parnas.html) · [Ousterhout：Designing Abstractions](https://web.stanford.edu/~ouster/CS349W/lectures/abstraction.html)

用纸上 IM 变更建一张初步冲击表：

| 可能变化的决定 | 合理的内部责任 | 不应假装可完全隐藏的部分 |
|---|---|---|
| broker 从一种实现换为另一种 | 事件发布/消费适配器 | 重投、排序与确认语义若改变，要重新评审合同 |
| 未来权威 DB 改索引或序号分配 | 持久边界与会话顺序规则 | 若外部游标格式/含义变化，客户端也受影响 |
| 历史可见成员规则改变 | 领域授权策略 | 用户可见结果和安全评审必须改变 |
| R9 6→9 B 获批 | 输入校验、协议版本和合同测试 | 老客户端与 `/v1` 仍须守原 6 B；不能“藏”于存储层 |
| S3 `/v2` 提议获批 | 权威写入与新成功语义 | `stored_in_teaching_db` 对调用者是新承诺 |
| B 多设备 ACK 加入 | 进度与客户端协议 | ACK 的对象和含义需要对外定义 |

这张表不等于实施计划。每一行还要问“现在有证据证明变更会发生吗”“真正稳定的业务语义是什么”。为一个从未出现的替换场景预造五层接口，可能只让调用路径更长。优先围绕已经看到的变化来源和必须守住的不变量建边界。[10.05 重构与变化](../../../src/docs/platform_engineering/curriculum/10_engineering/05_refactoring_boundaries.md)

## 三、对照两种发送接口：调用方承担多少隐藏的流程知识

下面的**反例**故意让 HTTP 层知道未来 DB 与 broker 的实现：先查成员、分配 `seq`、选 Mongo 集合、写记录、再找 Kafka 分区发布 E9。调用方必须知道每步顺序、超时与回滚；一旦“DB 已写，发布失败”，它却只看到一串底层错误，不知道给 A 什么确认。这是**知识泄漏**，即使每步都包成一个 `Service` 类也没有改变。[Ousterhout：Information Hiding](https://web.stanford.edu/~ouster/cgi-bin/cs190-winter18/lecture.php?topic=modularDesign)

```text
HTTP 调用方 → CheckMember → AllocateSeq → SelectCollection → InsertMongo
           → ChoosePartition → Publish(E9) → 猜测该返回什么
```

更合适的纸上用例接口让调用者提交**业务意图**，由用例模块守校验、授权、稳定 ID、权威写入或当前内存受理等属于自己的责任；返回值明确所到的**确认边界**。下例只演示 Go 类型能怎样表达契约，未编译，也未定义实际 `/v2` 实现：

```go
type SendCommand struct {
    ActorID        UserID
    ConversationID ConversationID
    MessageID      MessageID // 同一发送意图的稳定标识
    Body           []byte
}

type Acceptance struct {
    MessageID MessageID
    Kind      AcceptanceKind // 例如当前 AcceptedInMemory
}

type Sender interface {
    Send(ctx context.Context, cmd SendCommand) (Acceptance, error)
}
```

在**当前 `/v1`**，HTTP 入口还应检查原始请求体 4096 B、正文 6 UTF-8 B 等合同，并将同 ID 重复映成 409、非成员隐藏成 404；用例只能返回 `AcceptedInMemory` 对应的承诺。未来若另有经审阅的 `/v2`，才可在新的持久语义下返回 `StoredInTeachingDB`，不能让同一个旧端 200 悄悄变义。`AcceptanceKind` 的名字不能替代文档、错误语义和真实证据。[09.02 当前合同](../../../src/docs/platform_engineering/curriculum/09_backend_security/02_http_api_contract.md) · [09.10 协议兼容](../../../src/docs/platform_engineering/curriculum/09_backend_security/10_protocol_compatibility_rpc.md)

## 四、Go 包与接口沿使用者需求生长

Go 的包边界决定哪些名字可从包外引用；**接口**描述调用者需要的一小组行为，具体类型无需显式声明“implements”。官方代码评审建议通常让接口定义在**使用它的一侧**，并避免只为了 mock 在实现方预设庞大接口。这是经验规则，要结合真实替换点、测试和依赖方向使用，不能机械地给每个结构体配一个接口。[Go Code Review Comments：Interfaces](https://go.dev/wiki/CodeReviewComments) · [Effective Go：Interfaces](https://go.dev/doc/effective_go)

一份纸上包责任可以是：HTTP 适配器解析/限制原始请求并映射状态码；应用用例协调 Send/Fetch 并返回明确确认点；领域规则判断消息身份与成员权限；未来存储适配器落实权威唯一性、序号和读取；事件适配器处理 E9 发布。**内层规则不需要 import 某个 broker SDK**，HTTP 层也不应构造数据库事务。真实 Go 包数取决于代码规模和变化证据，不要求一个名词一个包。[09.03 程序组织](../../../src/docs/platform_engineering/curriculum/09_backend_security/03_program_organization.md)

| 依赖方向问题 | 较好的判断 | 过度抽象信号 |
|---|---|---|
| 用例需读取未来历史 | 在使用者处定义刚好够用的读取行为，保留身份/游标语义 | 把底层 DB 全部 CRUD 方法复制到公共接口 |
| 用例需写权威消息 | 端口表达原子写与稳定 ID 约束，适配器选择技术 | 用例调用 `Begin/Insert/Commit/Publish` 拼细节 |
| 测试需替换依赖 | 若存在有意义的外部副作用，才设清晰端口与失败变式 | 只验证 mock 被调用几次、未验 409/404/确认点 |
| 想共用工具函数 | 先问该逻辑属于哪项用例不变量 | `utils` 包吞下身份、授权和存储语义 |

测试也跟随**接口承诺**：当前重复 ID 409、非成员 404、正文上限；未来再验 DB 已写而 E9 失败、B 缺 `seq8` 等。仅断言“调用了仓库一次”不能证明用户得到正确确认。[10.02 测试基础](../../../src/docs/platform_engineering/curriculum/10_engineering/02_testing_basics.md)

## 五、深模块必须暴露错误和“不知道结果”的边界

好的信息隐藏可不让调用者看 Mongo 集合、队列 offset 和重试时钟，但**不能装作异步系统总有简单成功/失败二值**。若未来 `/v2` 的 DB 写入已经提交，响应在网络中丢了，A 看到超时不能断言“未写入”，也不能盲用新消息 ID 造第二条意图。正确的接口设计要有可观察的确认点和处理**结果不确定**的办法，例如稳定消息 ID、按 ID 查询/重试规则；这些仍是未来设计课题。[08.01 分布式部分失败](../../../src/docs/platform_engineering/curriculum/08_distributed/01_system_partial_failure.md)

Go 的 `context.Context` 能把取消/截止时间信号传给调用链，但调用者收到取消**不等于**已提交的 DB 事务被撤销，也不等于事件尚未送出。模块可以负责重试或恢复内部实现，仍要向调用方说清“已确认到哪一层、哪一层未知”。对当前 S2，旧 200 已明确只到本进程内存；对未来 S3，若要返回 `stored_in_teaching_db`，必须有相应权威写入证据，不能仅凭队列写入或 Pod Ready。[06.07 事务与异常](../../../src/docs/platform_engineering/curriculum/06_databases/07_transactions_anomalies.md) · [11.01 业务确认点](../../../src/docs/platform_engineering/curriculum/11_reliability/01_business_measurement.md)

同理，B 离线 25h 而教学 broker 只保留 24h，FetchHistory 接口的承诺应是“**对有权限的历史按会话游标取缺口**”，不能让客户端传 `P0 offset42` 并以为这是业务游标。模块内部即使换 broker，`(c-a,seq)` 和成员可见规则仍需被验证；若这些语义要改，就必须公开为合同变更。[07.12 有权历史补拉](../../../src/docs/platform_engineering/curriculum/07_cache_messaging/12_cross_system_consistency_case.md)

## 六、两种“抽象”同样危险：泄漏细节与遮掉意义

**泄漏细节**：公共响应返回 `KafkaPartition`、`BrokerOffset` 或 `MongoDocument`，使所有调用者依赖某个实现。换队列或存储时，调用方无业务理由却要修改。**遮掉意义**：公共入口只接受 `map[string]any`、返回 `ok=true`，把谁发送、哪个会话、稳定消息 ID、当前 200 的层次、409/404 都藏起来；这不是深模块，而是无法审阅的合同。[Parnas：模块划分](https://www.cs.lafayette.edu/~gexia/cs301/resources/parnas.html)

第三种常见问题是**薄包装太多**：`ValidationService`、`MembershipService`、`SequenceService`、`StorageService`、`PublishService` 各只有一次转发，最终还要调用方按正确顺序编排。复杂性没有被吸收，只被分散。若调用方必须在“写权威数据后、发 E9 前”决定如何处理故障，就要重新审用例边界与确认点，而不是再增加一个 `OrchestrationService` 名称。[Ousterhout：深模块](https://web.stanford.edu/~ouster/cgi-bin/cs190-winter18/lecture.php?topic=modularDesign)

也不要走到另一个极端：一份“万能 Send”把成员授权、历史可见、协议版本、审计、设备阅读全部承诺，却无法清楚解释任何失败。接口表面短，不等于责任边界合理。好的边界应以**调用者能理解的少量语义**表达可完成的任务，以反例验证内部复杂性确实由模块负责。[13.02 聚合与状态轴](../../../src/docs/platform_engineering/curriculum/13_architecture/02_domain_state_modeling.md)

## 七、用变更冲击卡审接口，并限定 OpenIM 源码结论

评审一个模块时，可拿下列变化逐项问“谁改、哪个公开合同改、怎样验证”：R9 如果获批，输入限制和旧端兼容必须显式评审；S3 若获批，权威持久和新的成功语义要单独版本化；E9 重投或 broker 换型可主要由事件适配器吸收，但消息与顺序不变量不变；成员历史规则改变是业务合同与权限测试的变更；B 多设备 ACK 需要定义每设备确认键与进度。**实现变化被隐藏**与**业务行为保持不变**要分别证明，不能靠文件夹名称推断。[13.01 目标与约束](../../../src/docs/platform_engineering/curriculum/13_architecture/01_problem_stakeholders.md) · [13.02 身份与状态](../../../src/docs/platform_engineering/curriculum/13_architecture/02_domain_state_modeling.md)

| 变更卡 | 内部可能修改 | 必须公开/复核的事实 |
|---|---|---|
| E9 分区规则变化 | 事件适配器、幂等/排序处理 | B 补拉顺序不能由 offset 偷换 |
| 未来 DB 索引调整 | 存储适配器和迁移 | `m-9/seq9` 身份、去重/授权仍成立 |
| R9 审批通过 | 新版本校验与兼容路径 | `/v1` 6 B 不被无声放宽 |
| 成员历史可见规则获定 | 领域授权策略和 FetchHistory | 谁有权看哪段历史必须写清 |
| B ACK 协议加入 | 设备进度与客户端适配 | 收到、阅读、其它设备不能混成一个布尔 |

固定 `openimsdk/open-im-server` 提交 `f6411a8a1a31d3df36f4c2b3ad28481a94141e1f` 的 [`send.go` 选定路径](https://github.com/openimsdk/open-im-server/blob/f6411a8a1a31d3df36f4c2b3ad28481a94141e1f/internal/rpc/msg/send.go#L46-L70)调用 `MsgToMQ` 后返回；[另一 Mongo 消费路径](https://github.com/openimsdk/open-im-server/blob/f6411a8a1a31d3df36f4c2b3ad28481a94141e1f/internal/msgtransfer/online_msg_to_mongo_handler.go#L43-L69)调用 `BatchInsertChat2DB`。两处可用于识别读到的**异步边界**，不能仅据此宣布 OpenIM 的实际模块接口是“深”或“浅”、完整 ACK 语义、事务策略或可替换性。[OpenIM 阅读地图](../../../src/docs/platform_engineering/curriculum/im_reference.md)

## 八、22 道分层练习：重写一个泄漏式 IM 接口

先区分接口与实现，再改纸上 API，最后用变更卡和失败路径反证。答案基于本章虚构设计。

### 基础 1–8：模块与承诺

<details><summary>1. 公开接口与内部实现分别回答什么？</summary>

接口说调用输入、可观察结果和错误；实现说内部如何履约。</details>

<details><summary>2. 信息隐藏应隐藏当前 200 的 `accepted_in_memory` 吗？</summary>

不应。它是调用者必须知道的业务确认边界。</details>

<details><summary>3. Parnas 建议按什么考虑模块划分？</summary>

按可能独立变化的设计决定，尽量把这些决定及其复杂性藏在合适边界内。</details>

<details><summary>4. 深模块是否等于方法和文件越多越好？</summary>

不是。关键是简明接口吸收了多少有价值的内部复杂性。</details>

<details><summary>5. Go 接口一般应由哪一侧的需要驱动？</summary>

通常由使用行为的消费侧定义，不为每个具体类型或 mock 预造大接口。</details>

<details><summary>6. 客户端应把 `P0 offset42` 当历史游标吗？</summary>

不应。那是传输位置；业务补拉用有权限的会话历史位置。</details>

<details><summary>7. 当前 `/v1` 同 ID 重复如何映射？</summary>

按合同返回 409，即使正文相同。</details>

<details><summary>8. 未来 S3 `/v2` 可未经评审让旧 200 变成 DB 已存吗？</summary>

不能。成功边界变更要版本、兼容与权威证据。</details>

### 推演 9–16：坏接口与不确定结果

<details><summary>9. HTTP 层调用 `AllocateSeq` 后再 `InsertMongo` 泄漏了什么？</summary>

泄漏序号分配、存储选型与执行顺序，让调用方承担一致性/失败处理。</details>

<details><summary>10. DB 已写而 E9 发布失败，调用方只得 `error` 有什么缺口？</summary>

不知权威是否已形成，无法正确给 A 确认或决定恢复；需区分状态轴与结果证据。</details>

<details><summary>11. 当前非成员发送被一个泛化 `Forbidden` 暴露，会破坏什么？</summary>

当前合同要求隐藏为 404；HTTP 映射必须守业务权限边界。</details>

<details><summary>12. 客户端超时可断言 DB 写入已回滚吗？</summary>

不能。网络/`context` 取消之后提交结果可能未知，未来须有稳定 ID 和查证/重试规则。</details>

<details><summary>13. 用 `map[string]any` 传送者、会话和正文为何不一定更简单？</summary>

它遮掉身份、校验与确认点，调用者和审阅者难知哪些条件必需。</details>

<details><summary>14. 每层仅转发一次的方法越多，信息隐藏越好吗？</summary>

未必。若调用方仍知道所有步骤与先后关系，只是把泄漏换了包装。</details>

<details><summary>15. B 离线 25h、broker 留 24h，FetchHistory 可只传 offset 吗？</summary>

不能。未来要按成员权限从权威历史补会话序号缺口，当前 S2 尚无此承诺。</details>

<details><summary>16. 改 broker 实现时，哪些消息语义仍要保持？</summary>

稳定消息意图、权威顺序/去重、授权和对外确认点；变了就要显式评审。</details>

### 决策 17–22：变更冲击与证据

<details><summary>17. R9 若获批，可只改存储适配器吗？</summary>

不能。输入校验、协议版本、旧端兼容与合同测试都要审，`/v1` 仍为 6 B。</details>

<details><summary>18. 成员历史规则改变，算内部实现细节吗？</summary>

不算。用户可见权限合同变了，产品/安全与 FetchHistory 验收必须同步。</details>

<details><summary>19. 未来 DB 换索引，是否每个调用方都要知道新索引名？</summary>

若语义不变，可由存储模块吸收；仍须验证身份、查询顺序与性能。</details>

<details><summary>20. 为了 mock 而预设 20 方法的大仓库接口，有什么问题？</summary>

消费方背上无关能力和维护负担；应按真实用例定义小而明确的行为。</details>

<details><summary>21. 两处固定 OpenIM 源码能证明其所有模块接口都很好吗？</summary>

不能。只能说明选定发送路径与另一 Mongo 消费路径存在所读异步边界。</details>

<details><summary>22. 模块评审卡至少包含什么？</summary>

调用者、公开语义/错误、内部变化决定、依赖方向、失败后确认点、变更冲击及业务反例证据。</details>

## 本章完成标准与后续路径

能指出泄漏式 Send 接口使调用方知道哪些不该知道的步骤，写出明确区分当前内存受理与未来 DB 已存的语义接口，并用 R9、E9、成员规则和长离线补拉检查变更冲击，才算完成第一轮。下一章[13.04 架构风格与边界](../../../src/docs/platform_engineering/curriculum/13_architecture/04_architecture_styles_boundaries.md)将比较模块化单体、分层、事件与服务拆分。
