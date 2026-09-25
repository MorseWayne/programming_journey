# 13.08 迁移与兼容：旧内存受理不能凭回填变成权威历史

> DeepTutor 八节初稿经技术与教学审阅后的静态课程。以下阶段、会话、读写与回退都是**虚构纸上迁移方案**；没有运行 Go、IM、数据库迁移、压测、部署或站点。当前 S2 `/v1` 仍为正文非空且最多 **6 UTF-8 B**、原始 HTTP 请求正文最多 **4096 B**、同 ID 重复 **409**、非成员隐藏 **404**、成功 `200 accepted_in_memory` 只代表本进程内存受理。未来 S3 `/v2` 的 `stored_in_teaching_db` 尚是提议且仍为 6 B；R9 的 6→9 B 独立待审。`m-9/seq9/E9` 属未来模型，绝非已迁移事实。[09.02 当前合同](../../../src/docs/platform_engineering/curriculum/09_backend_security/02_http_api_contract.md)

## 一、先列旧事实的来源，才知道什么可迁、什么不能补

13.07 的 ADR-P1 仍是 proposed。即使后续决定让教学 DB 成为 `/v2` 消息权威，迁移也不能把**当前 S2 的进程内存受理**倒写成旧消息都已持久化：进程重启或内存消失后，从未存在于可靠来源的正文没有任何“回填脚本”可以凭空恢复。要把三件事分开：维持旧客户端的 `/v1` 合同、对**确有可信来源**的数据作模式/读写迁移、为**今后**的 `/v2` 建立新权威。[13.07 决策状态](../../../src/docs/platform_engineering/curriculum/13_architecture/07_design_review_adr.md) · [Google SRE：Data Integrity](https://sre.google/sre-book/data-integrity/)

| 要迁的对象 | 当前已知来源 | 纸上可行边界 |
|---|---|---|
| `/v1` 6 B/409/404/200 语义 | 现行教学合同 | 保持旧接口的行为和测试；不升级 200 文义 |
| 已消失的旧 S2 内存消息 | **无可证权威历史** | 不得声称可全量回填或与新 DB 对账 |
| 未来 `/v2` 新消息 `m-9/seq9` | 若方案获批并正确写入教学 DB | 可在该时点起建立权威、备份与有权补拉 |
| E9 与设备游标 | 未来派生/客户端协议仍待设计 | 可按稳定 ID 重试与验证，但不反向造旧消息 |
| 成员历史可见规则 | 产品/安全仍待决定 | 未决定前不得用“表中有记录”放行补拉 |

“迁移成功率 100%”必须有分母：若只计未来 `/v2` 已确认写入的消息可以对账，就写“对可比的 `/v2` 样本覆盖率”；不能把未持久的旧 S2 消息从分母里悄悄消掉再说“所有历史已迁完”。[11.01 业务确认点](../../../src/docs/platform_engineering/curriculum/11_reliability/01_business_measurement.md)

## 二、扩展—迁移—收缩是顺序，不是一次发布命令

**Parallel Change（并行变更）**把不兼容改动分成扩展、迁移、收缩：先让新旧消费者有共同可用的接口/数据形状，再逐步迁移使用者，最后在证据充分时删除旧形状。数据库模式也要把变更脚本和版本同应用变更一起审阅、部署与验证。对于本章，**建了新表只代表存储结构准备好**，不表示 `/v2` 已开放、DB 已是权威或 B 已能补历史。[Fowler：Parallel Change](https://martinfowler.com/bliki/ParallelChange.html) · [Evolutionary Database Design](https://www.martinfowler.com/articles/evodb.html)

| 纸上阶段 | 主要动作 | 唯一权威与客户端 | 没过门怎样停 |
|---|---|---|---|
| P0 现状取证 | 固定 `/v1` 合同、旧端/会话分类、能否回填的真实来源 | S2 仅当前进程内存受理；没有旧权威历史 | 未确认来源就不写“历史迁移” |
| P1 扩展 | 版本化 DB 模式与只读/校验能力，旧接口照常 | 新结构**未激活为权威**，旧端仍按 `/v1` | 模式/权限不兼容则保留旧行为并修扩展 |
| P2 限定候选 `/v2` | 仅在经批准的测试会话/客户端能力组写 DB `m-9/seq9` | 对该组新消息只指定 DB 一处权威；不与旧 S2 内存混充一份历史 | 唯一/授权/确认不成立则停止新 `/v2` 写入 |
| P3 可比对账 | 比较 `/v2` 权威记录与其派生读模型/事件，测试旧端能力 | 可比样本与不可比旧历史分开报告 | 缺口或重复未解释，不扩大 |
| P4 有界扩大 | 按会话/客户端能力灰度并观察 B 25h/热群/故障 | 已确认的新消息继续以 DB 为权威 | 按业务门冻结扩量、保留兼容读与数据 |
| P5 收缩 | 仅在旧端、历史、回退依赖均解除后移除冗余路径 | 不损害旧合同或已确认新数据 | 证据不足就继续兼容，不能按日期硬删 |

这些 P0–P5 只是课程的**纸上阶段号**，不与 S2 当前阶段、S3 未来阶段混用。若旧 `/v1` 客户端长期存在，P5 也可能不删除 `/v1`；收缩对象要先在设计中命名并证明确无依赖。[12.09 多轴发布](../../../src/docs/platform_engineering/curriculum/12_platform/09_release_rollback.md)

## 三、双写要有一处权威，影子写不能悄悄生效

双写和影子写常被用作迁移工具，但它们的**失败边界**需要写在前面。若未来 `/v2` 将 DB 指为消息权威，给其它投影或 E9 写第二份，只能把第二份定义为**可重建/可对账的派生物**，不能让两个写入都自称最终真相。若 DB 写成功、E9 失败，状态是“权威已存、事件待恢复”；若事件先发而 DB 后失败，消费者可能看到不存在的权威事实，因此须另审协调方法。Outbox 是可比较的候选，不是当前实现。[07.10 Outbox 设计](../../../src/docs/platform_engineering/curriculum/07_cache_messaging/10_transaction_outbox.md) · [13.04 事务边界](../../../src/docs/platform_engineering/curriculum/13_architecture/04_architecture_styles_boundaries.md)

| 纸上写入结果 | 不得声称 | 需要的恢复/对账信息 |
|---|---|---|
| `/v2` DB 有 `m-9/seq9`，E9 未发 | B 已收到，或“回滚 DB 就没发生” | 稳定消息/事件 ID、待发状态、重试和消费者去重 |
| 旧 `/v1` 内存有 `m-a`，新 DB 没有 | 新 DB 漏了一条旧权威历史 | 这两路确认语义不同，先标不可比 |
| 影子 DB 写入成功、尚未指定其为权威 | 可直接切用户读到影子结果 | 影子副作用隔离、权限/脱敏、切换评审 |
| DB 权威有记录而旧版本读不到 | “新消息可以安全删掉” | 保留兼容读或前进修复，让已确认数据可取 |

**回填**只适用于已有可验证来源的数据。例如未来在 DB 内从旧字段迁到新字段，可按主键/版本/时间窗回填并核对；当前 S2 从未持久的历史没有可靠源，不能假设可以用 broker 恰好留存的 24h 事件重建所有 25h 离线历史。若某条旧消息还留在某个进程内存，也只能按该时点可证明范围讨论，不能把它推成完整历史。[06.03 模式演进](../../../src/docs/platform_engineering/curriculum/06_databases/03_schema_evolution.md)

## 四、影子读取与对账要先定义“可比”

一份对账应明确**样本来源、相同用户权限、会话、时间窗、字段规范化、权威版本与观察时刻**。纸上 `/v2` 产生 `m-9/seq9` 后，可以把 DB 权威读与其派生历史投影在同一会话/序号范围内对比：记录缺号、重复、正文/发送者差异和未收敛的事件状态。影子读应只记录差异，不把未审结果返回给用户。[Google SRE：Data Processing Pipelines](https://sre.google/workbook/data-processing/)

| 对账指标 | 应写的分母/分类 | 常见误导 |
|---|---|---|
| 覆盖率 | 本阶段可比的 `/v2` 权威消息数；多少在派生读模型可见 | 不把旧 S2 不可恢复消息算入，反说“全历史覆盖” |
| 缺口/重复 | `(conversation,seq)` 与稳定 `message_id`，分待收敛/超时/确实缺失 | 只比记录总数，漏掉同 ID 双写和序号空洞 |
| 权限差异 | 同一 actor、同一历史可见规则版本下的允许/拒绝 | 用管理员身份的影子读替普通 B 证明安全 |
| 版本差异 | D/K、DB 模式、事件/客户端版本与窗口 | 新旧在不同时间点、不同合同下强行相等 |

旧 `/v1` 内存视图与未来 `/v2` DB 权威**不是等价历史**；旧读无结果不能反证新 DB 错误。B 的 `dev-b1` 先见 `seq9`、缺 `seq8`，若此前连续到 7，安全游标仍为 7；对账只数“最大已见 9”会漏掉用户真正的缺口。B 离线 25h 大于 broker 24h，也要求未来 DB 确实保留并按已定成员规则可读，不能以影子查询一次成功宣称恢复目标已满足。[13.02 连续游标](../../../src/docs/platform_engineering/curriculum/13_architecture/02_domain_state_modeling.md) · [13.05 历史保留](../../../src/docs/platform_engineering/curriculum/13_architecture/05_capacity_data_design.md)

## 五、按客户端能力和会话分组，不能靠随机 Pod 决定语义

旧 `/v1` 仍守 **6 B/409/404/`accepted_in_memory`**；未来 `/v2` 即使获批也仍为 **6 B**，只是成功确认点提议为 `stored_in_teaching_db`；R9 6→9 B 要单独走兼容评审。旧客户端若只理解旧响应或没有 `seq` 游标/设备 ACK，就不能假装已具备未来补拉能力。应明确客户端能力协商、可见的功能限制/升级提示以及旧端能否读新权威消息。[09.10 协议兼容](../../../src/docs/platform_engineering/curriculum/09_backend_security/10_protocol_compatibility_rpc.md)

最危险的纸上反例是：同一会话 `c-a`，第一次 `m-9` 请求被随机路由到旧 S2 Pod，重试因负载均衡落到新 `/v2` DB Pod。两边可能分别返回内存 200 与 DB stored，或一边 409、一边新建消息；“按 Pod 金丝雀 5%”**不能单独保证**同一意图、会话和客户端看到一致权威。P2 可以先用隔离的 `c-test-v2` 和明确客户端能力组限制新路径；若未来要同一会话跨版本共存，须先制定统一消息 ID/权威、历史可见和旧端读写转换规则。[Google SRE：Canarying Releases](https://sre.google/workbook/canarying-releases/) · [13.02 消息身份](../../../src/docs/platform_engineering/curriculum/13_architecture/02_domain_state_modeling.md)

| 版本/能力轴 | 当前或提议状态 | 必须单独验证 |
|---|---|---|
| `/v1` 合同 | 当前 6 B/409/404/200 内存受理 | 旧端正反例、跨副本不冒报持久 |
| `/v2` 合同 | 待批准的 6 B/DB stored | DB 确认、稳定 ID、超时查证、旧端不误读 |
| R9 | 6→9 B 待审 | 新旧字节上限和正文编码的独立版本门 |
| 客户端能力 | 是否认识 `seq`、新回执、设备 ACK 待定 | 同一会话跨端可见性与降级说明 |

## 六、已确认新数据之后，回滚不是“把二进制切回去”

假设 P2 已让 `/v2` 对 `c-test-v2` 返回 `stored_in_teaching_db`，DB 中已有 `m-9/seq9`。随后新代码有 bug：**停止扩大流量/暂停新 `/v2` 写入**可以是止损动作，但若简单切回只懂 S2 内存的旧代码并关闭 DB 读，A 已获“stored”确认的消息就对 B 消失了。不能为让发布图回绿而删除/忽略权威事实。回退方案必须保留兼容读取与恢复路径，或者经审阅做前进修复；具体可行性要在 P2 前演练。[12.09 代码/配置/数据回退](../../../src/docs/platform_engineering/curriculum/12_platform/09_release_rollback.md) · [Google SRE：Canarying Releases](https://sre.google/workbook/canarying-releases/)

| 轴 | 可能回退的内容 | 不可随之抹掉的事实 |
|---|---|---|
| 镜像 `D2→D1` | 某版本代码的写/读路径 | D2 已返回 stored 的 `m-9/seq9` |
| 配置 `K2→K1` | 流量开关、发布比例等非秘密配置 | DB 权威消息、已发 E9、用户权限记录 |
| DB 模式/数据 | 只在兼容与可恢复证据允许时演进/修复 | 已确认消息及其 `seq`、历史查询责任 |
| E9/消费者 | 暂停派生、补发、去重与对账 | 事件重复不造第二条权威消息 |
| 客户端 | 协议/展示/游标能力分组 | 已获确认与旧端可理解的合同 |

收缩旧字段或旧读路由也不能只凭“代码已发布一周”。要有旧端覆盖率、待补拉历史、双读/影读差异、回退试验和责任人决定；否则收缩后既无法解释旧 200，也无法取回新 stored。影子写、E9 通知等外部副作用可能已发生，回滚更像**停止新增影响并保全/修复已有事实**。[Fowler：Parallel Change](https://martinfowler.com/bliki/ParallelChange.html)

## 七、逐阶段证据包和停止门让迁移可审

迁移卡应按 P0–P5 对每一步写**唯一权威、写/读版本、数据模式、配置、客户端能力、可比较样本、用户确认点、停止门、回退路径和决定人**。静态教材只能写方案和验收方法，不能填“压测通过”“历史已回填”“灰度正常”等未经执行的结果。[Google SRE：Canarying Releases](https://sre.google/workbook/canarying-releases/) · [10.11 技术写作](../../../src/docs/platform_engineering/curriculum/10_engineering/11_technical_writing_collaboration.md)

| 证据门 | 看什么 | 未过门如何行动 |
|---|---|---|
| 当前兼容 | `/v1` 6 B/409/404/200 与旧客户端反例 | 保持旧路径，不启用新合同 |
| 新权威 | `/v2` 稳定 ID、`seq` 唯一、DB commit/超时未知结果可查 | 停止 P2 新写，查证/修复而非冒报 stored |
| 异步派生 | E9 漏发、重复、积压、对账与恢复 | 停扩量，保全 DB/待发记录 |
| 长离线/授权 | DB 留存覆盖已批准窗口、退群历史规则、B 缺 8 补拉 | 不承诺 25h 和设备完整恢复 |
| 发布/回退 | D/K/数据/事件/客户端五轴及旧读兼容 | 不删除已确认新消息，不盲切旧读 |

固定 `openimsdk/open-im-server` 提交 `f6411a8a1a31d3df36f4c2b3ad28481a94141e1f` 的 [`send.go` 选定路径](https://github.com/openimsdk/open-im-server/blob/f6411a8a1a31d3df36f4c2b3ad28481a94141e1f/internal/rpc/msg/send.go#L46-L70)调用 `MsgToMQ` 后返回；[另一 Mongo 消费路径](https://github.com/openimsdk/open-im-server/blob/f6411a8a1a31d3df36f4c2b3ad28481a94141e1f/internal/msgtransfer/online_msg_to_mongo_handler.go#L43-L69)调用 `BatchInsertChat2DB`。这只支持所读异步边界，不能证明 OpenIM 或本课程已经用了 P0–P5、双写、影子读、outbox、完整 ACK 或某种回退策略。[OpenIM 阅读地图](../../../src/docs/platform_engineering/curriculum/im_reference.md)

## 八、22 道分层练习：找出一个看似平滑迁移的缺口

先识别阶段与权威，再推双写/旧端反例，最后审回退和停止门。答案均基于本章纸上候选。

### 基础 1–8：现状与阶段

<details><summary>1. S2 进程已消失的旧消息可由回填脚本凭空找回吗？</summary>

不能。没有可靠旧来源，就没有可证明的完整回填。</details>

<details><summary>2. P1 建了新表就表示 S3 `/v2` 已开放吗？</summary>

不表示。模式准备与权威切换/接口批准是不同阶段。</details>

<details><summary>3. Parallel Change 的三步是什么？</summary>

扩展、迁移、收缩；收缩须等旧依赖解除且可验证。</details>

<details><summary>4. 当前 `/v1` 成功 200 到哪层？</summary>

`accepted_in_memory` 仅本进程内存受理。</details>

<details><summary>5. 未来 `/v2` 提议的正文上限是多少？</summary>

仍是 6 UTF-8 B；R9 的 9 B 尚待独立评审。</details>

<details><summary>6. “双写”时可以有两个互相矛盾的权威吗？</summary>

不应。要明确一处权威和另一份派生/影子数据的失败及对账规则。</details>

<details><summary>7. broker 24h 事件可自动补 B 离线 25h 的全部历史吗？</summary>

不能保证；未来需要确实保留且有权的权威历史。</details>

<details><summary>8. P0–P5 是本系列 S2/S3 阶段号吗？</summary>

不是，只是本章纸上迁移步骤，不能重定义既有 S2/S3。</details>

### 推演 9–16：对账、路由与回退

<details><summary>9. 旧 S2 内存读不到 `/v2` DB 的 `m-9`，就能判 DB 错吗？</summary>

不能。两路没有等价历史/确认合同，先标样本不可比。</details>

<details><summary>10. `/v2` DB 已有 `m-9/seq9`、E9 未发，谁是权威？</summary>

若 P2 已批准 DB 写入，则 DB 是权威；事件待恢复，不可否定已确认消息。</details>

<details><summary>11. 影子读用管理员身份，而 B 是普通成员，能证明权限等价吗？</summary>

不能。需同 actor、同成员/历史可见规则版本和相同范围。</details>

<details><summary>12. B 先见 9 缺 8、此前连续到 7，游标应为多少？</summary>

仍为 7；不能用最大已见 9 跳过缺口。</details>

<details><summary>13. 同一意图随机到旧 S2 与新 `/v2` Pod，可能怎样？</summary>

不同权威/回执/重复判定相冲突；须按明确版本/会话组和统一规则路由。</details>

<details><summary>14. 旧 `/v1` 客户端发 7 B，未来 S3 上线后可接纳吗？</summary>

不能。旧合同仍为 6 B；R9 独立待批。</details>

<details><summary>15. `/v2` 已确认 DB 存储，切回只懂内存的 D1 并关 DB 读合法吗？</summary>

不行。会让已确认新历史消失于用户视图；须保留兼容读/暂停新写或前进修复。</details>

<details><summary>16. 回滚配置 K2→K1 会自动撤销已发 E9 吗？</summary>

不会。配置、事件与权威数据是不同轴，要分别处理已有副作用。</details>

### 决策 17–22：阶段门与责任

<details><summary>17. P2 之前必须确认哪处是新消息唯一权威？</summary>

限定 cohort 的 `/v2` 消息由经批准的教学 DB 确认；其它派生写不得成为第二权威。</details>

<details><summary>18. 影读报告“100% 一致”还缺什么口径？</summary>

可比样本分母、时间窗、actor/权限版本、字段规范化、不可比/待收敛分类与差异样本。</details>

<details><summary>19. P5 可按日历日期直接删旧读路径吗？</summary>

不能。要看旧端/历史/回退依赖是否消除及真实证据。</details>

<details><summary>20. 数据模式回退与代码 D2→D1 一定同样可逆吗？</summary>

不一定。已确认新数据/字段可能不被旧代码理解，必须演练兼容读或前进修复。</details>

<details><summary>21. 两处固定 OpenIM 源码能证明它用本章迁移阶段吗？</summary>

不能，只支持所读发送到 MQ 与另一 Mongo 消费异步边界。</details>

<details><summary>22. 一张可审迁移卡每阶段至少要交什么？</summary>

唯一权威、D/K/DB/事件/客户端版本、写读路由、可比对账、用户确认点、停止门、保全已有数据的回退和决定人。</details>

## 本章完成标准与后续路径

能解释当前 S2 无法凭空回填旧消息、P0–P5 中哪一处才改变未来权威、影读如何定义可比口径，并为 `/v2` 已确认 `m-9/seq9` 之后的回退保留读取和数据责任，才算完成第一轮。下一章 13.09 将把客户端、Go 服务、数据、安全与值班的契约和交付依赖放进同一计划。
