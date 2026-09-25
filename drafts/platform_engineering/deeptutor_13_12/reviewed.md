# 13.12 工程师的长期责任：让 IM 的承诺能被接手、复核和修正

> DeepTutor 八节初稿经技术与教学审阅后的静态课程。人物、事件、运行、指导和交接均为**虚构纸上演练**；没有运行 Go、IM、数据库、测试、压测、部署或站点。当前 S2 `/v1` 正文非空且最多 **6 UTF-8 B**、原始 HTTP 请求正文最多 **4096 B**、同 ID 重复 **409**、非成员隐藏 **404**、成功 `200 accepted_in_memory` 只表示本进程内存受理。未来 S3 `/v2` 的 `stored_in_teaching_db` 仍是提议且仍为 6 B，R9 6→9 B 待审；`m-9/seq9/E9` 属未来候选模型。[09.02 当前合同](../../../src/docs/platform_engineering/curriculum/09_backend_security/02_http_api_contract.md)

## 一、高级工程能力看可持续的用户结果，不看服务数量与头衔

这一卷从“不能丢消息”追问到消息身份、模块、架构、容量、质量取舍、设计评审、迁移、团队交付和技术债。长期责任是：**知道今天对 A/B 具体承诺了什么；能在条件变化时指出证据缺口；把决定、故障、回退和下一位接手人的工作写清，并在结果推翻原假设时修正。** 多部署几个服务、会背一致性术语或读过公开源码，都不能单独证明这些能力。[13.01 用户目标](../../../src/docs/platform_engineering/curriculum/13_architecture/01_problem_stakeholders.md) · [13.11 变化答辩](../../../src/docs/platform_engineering/curriculum/13_architecture/11_complex_im_defense.md)

| 责任 | 本例高级工程师该做什么 | 不应代替谁做决定 |
|---|---|---|
| 用户承诺 | 当前 200 只到内存；未来 DB stored/B ACK 各自有门 | 不能替产品批准 B 25h 或 R9 |
| 正确性与安全 | 守 6 B/409/404、消息 ID 唯一、历史按权限读 | 不能替安全定退群旧历史规则 |
| 运行与恢复 | 区分权威消息、E9、设备缺口和平台 Ready | 不能凭一张绿色 Pod 图宣布 B 已恢复 |
| 设计与演进 | 比较候选、留下反例/ADR 状态、保全已确认数据 | 不能把 proposed 写成 accepted/已部署 |
| 指导与交接 | 让初学者和下一班值守者理解理由、会复核 | 不能只给命令或让别人猜确认点 |

Google SRE 对早期设计参与、生产准备和持续运营的讨论，说明系统生命周期各阶段都需要开发与运行人员对服务性质保持共同理解；本章把这一原则转成学习者可练习的 IM 交接任务，**没有代入真实公司的组织流程**。[Google SRE：Engagement Model](https://sre.google/workbook/engagement-model/)

## 二、纸上事件：DB 有 `m-9`，E9 未发，B 又长时间离线

以下仅用于练习**未来 S3 候选若获批**后的事件响应：权威 DB 已有 `m-9/seq9`，中继还未成功发布 E9；B 一台设备离线 25h，教学 broker 事件留 24h；热群和一台 Node 故障又带来重连/积压。**当前 S2 根本没有“DB 已有权威 `seq9`”这个状态**，因此纸上事件不能写成现有生产事故。[13.02 多轴状态](../../../src/docs/platform_engineering/curriculum/13_architecture/02_domain_state_modeling.md) · [13.04 故障边界](../../../src/docs/platform_engineering/curriculum/13_architecture/04_architecture_styles_boundaries.md)

| 响应步骤 | 本例应记录/判断 | 不能跳到的结论 |
|---|---|---|
| T0 发现用户症状 | A 的未来 stored 记录、B 缺 `seq9`、谁受影响/从何时开始 | “有 HTTP 200，所以都送达” |
| T1 保全事实并止损 | DB 权威消息/稳定 E9/中继待发、版本 D/K、权限状态；暂停扩大候选 | 删掉已确认 DB 消息让报表变绿 |
| T2 分层恢复 | 修 E9 派生/幂等重投；B 若有权且历史确实保留，从 DB 按 `seq` 补缺 | 只凭过期 broker 或新 Pod Ready 补全 25h |
| T3 用户结果验证 | `dev-b1` 与其它设备分别核缺口；见 9 缺 8 时游标仍 7；A/旧端合同分开核 | 设备收到等于 B 阅读，或其它设备都完成 |
| T4 交接与复盘 | 影响、时间线、触发/放大/缺的防线、后续 owner 与验收 | 把问题归因于“某人忘记重试”就结束 |

平台恢复、事件积压清空、DB 数据完整和 B 的有权补拉是不同恢复结果。若在故障中切回旧代码，已给 A 的未来 stored 确认也不能被丢弃；若成员权限来源不可判定，不能为提高可用性猜 B 有权。事件时间线应记录**已知、推测和待查**，避免事后把推论写成当时事实。[11.10 事件响应](../../../src/docs/platform_engineering/curriculum/11_reliability/10_incident_response.md) · [Google SRE：Postmortem Culture](https://sre.google/workbook/postmortem-culture/)

## 三、设计评审要替未来的人保留反证与决定状态

13.07 的 ADR-P1 仍是 proposed。评审者应问“如果 B 离线 25h 占比很低，方案是否仍值得”“如果热群集中一分区，扩网关是否解决”“如果回滚后新 DB 历史不可读，何时停止扩量”。**提出反例是帮助方案更可用**，而非挑战某个人的资历。SEI 架构评审强调用多方场景找风险/敏感点，课程可借其思路，但不声称纸上讨论完成正式 ATAM。[SEI：Architecture Tradeoff Analysis Method](https://insights.sei.cmu.edu/library/architecture-tradeoff-analysis-method-collection/)

| 决定状态 | 读者应怎样使用 | 本例 |
|---|---|---|
| proposed | 继续收集证据，不据此改当前用户合同 | 未来 S3 教学 DB 权威/补拉提议 |
| accepted | 获权人同意设计方向，实施和验收仍另需证据 | 本课程**没有**给 S3 这项状态 |
| superseded | 保留旧决定与背景，并指向取代它的新决定 | 将来条件变化时可以发生，不能悄悄覆盖旧页 |

Nygard 的 ADR 模板保留背景、决定、状态和正负后果。高级工程师还要把未决定的历史权限、R9 和 B 的目标时间放在显眼处，让接手人知道什么不能放行。即使 ADR 被接受，也须分别验证当前 `/v1` 6 B/409/404/200，未来 `/v2` DB 写入、E9 重投、旧客户端、回退后已有消息等；**决定通过不等于发布通过**。[Nygard：Documenting Architecture Decisions](https://www.cognitect.com/blog/2011/11/15/documenting-architecture-decisions) · [13.07 评审卡](../../../src/docs/platform_engineering/curriculum/13_architecture/07_design_review_adr.md)

## 四、指导初学者：从 Go 的对象与 HTTP 走到可答辩 IM

用户最初要的是从 Go 初学者逐步成为能处理实际业务问题的工程师。指导时不能先扔“Outbox + Raft + Kubernetes”让人背结论。可以把 A 向 `c-a` 发消息这条旅程拆成**可独立检查的先修梯子**，每一级都让学习者说清下一层为何需要：[学习路线](../../../src/docs/platform_engineering/curriculum/learning_path.md)

| 学习阶段 | 学习者先完成的理解/练习 | 才进入的下一问题 |
|---|---|---|
| Go 与数据 | ID、结构体、文本/UTF-8、错误与测试；区分 `request_id` 和消息意图 | 为什么 6 UTF-8 B 不是 6 个字符？ |
| HTTP/网络 | `/v1` 6 B/4096 B/409/404/200，超时与长连接 | A 看到 200 能证明什么，不能证明什么？ |
| 数据库/并发 | `(c-a,seq9)`、唯一性、事务、权限与失败重试 | 未来 DB stored 要在哪一层给回执？ |
| 事件与分布式 | E9 稳定身份、重投/消费者、25h>24h 与设备游标 | B 缺 8 先见 9 怎样补，事件不能替代什么？ |
| 运行/架构 | 热群容量、Pod/Node N−1、质量取舍、迁移和 ADR | 若条件变化，哪些假设要重算、谁能批准？ |

每一级给学习者四类证据：**能解释**机制与边界；**能做最小实现或纸上模型**；**能设计失败变式**；**能说明业务取舍**。本系列静态教材已经提供大量解释、纸上推导和练习，但学习者个人的 Go 实现、真实测试、压测和运行记录仍需日后自行取得，不能读完即记“已会运营 IM”。指导者要指出错误发生在哪个先修环节，并让学习者自己重做推理，而非代答“加个缓存就好”。[编写与能力验收](../../../src/docs/platform_engineering/curriculum/assessment.md)

## 五、交接材料让下一位值守者找到首个坏边界

一份可接手说明要在没有原作者解释时也可使用。它记录**当前合同与未来提议的状态**、镜像 `D1/D2`、配置 `K1/K2`、DB 模式和权威、E9/设备游标、成员历史规则版本、观察入口、止损/回退权限、已确认消息的保全办法，以及谁做下一次复核。不要在课程、日志或交接文档留下真实凭据/用户消息正文。[13.09 团队交付板](../../../src/docs/platform_engineering/curriculum/13_architecture/09_cross_team_delivery.md) · [12.11 版本证据](../../../src/docs/platform_engineering/curriculum/12_platform/11_declarative_delivery.md)

| 交接问题 | 虚构 `m-9` 案例要给的答案或“待定” |
|---|---|
| 现行用户合同是哪一版？ | `/v1` S2：6 B/409/404/200 内存；`/v2`/R9 均未批准 |
| 哪份数据是权威？ | 当前 S2 无持久权威；未来若批准，教学 DB 的 `m-9/seq9` 才可为权威 |
| 事件与设备在哪里？ | E9 是未来派生；各设备 ACK/阅读另记，不能以 offset 作游标 |
| 出事先看什么？ | A 回执→权威写入→E9→B 有权历史/设备确认的首个不一致处 |
| 怎样停/回退？ | 停扩量/新写并保全已确认数据，D/K/DB/事件/客户端分别审；当前 `/v1` 不改义 |
| 未决与负责人？ | B25h 是否承诺、退群历史规则、R9、未来目标时延由相应产品/安全/客户端/值班确认 |

可做一场纸上交接演练：让另一位学习者只凭这张卡分析“未来 DB 有 `m-9/seq9`，E9 未发，某旧端报 7 B 失败”。若他把旧端 7 B 当成功、把 E9 当第二条消息、把回滚理解为删 DB，说明说明书还未把关键边界写清；修文档和用例，再谈“交接完成”。[10.11 技术写作](../../../src/docs/platform_engineering/curriculum/10_engineering/11_technical_writing_collaboration.md)

## 六、无责复盘与技术债：关闭行动项才形成改善

复盘时区分**触发事件**、**放大因素**、**没挡住的防线**和**哪里幸免于更大影响**。纸上 E9 未发可由某次中继故障触发；缺待发对账、告警不指向用户缺口、旧端兼容卡含糊可能放大；DB 权威和有权历史查询若仍完整，则是可用于恢复的防线。不要在没有运行证据时写“这次事故的根因是某人操作错误”。Google SRE 的复盘实践强调清楚事实、无责分析、具体且可追踪的行动项。[Google SRE：Postmortem Culture](https://sre.google/workbook/postmortem-culture/) · [11.11 复盘与改进](../../../src/docs/platform_engineering/curriculum/11_reliability/11_postmortem_improvement.md)

| 纸上行动项 | 单一跟进 owner | 可验证终点与复测 |
|---|---|---|
| E9 已存待发但无人知道 | Go/数据指定一位 owner，值班协作 | 告警能把 `m-9` 权威记录和 E9 待发对应；故障演练可定位 |
| B25h 历史规则含糊 | 产品/安全指定决定 owner | 规则版本、退群/重入样例与 History 权限反例一致 |
| 回滚会关掉新 DB 读 | 发布/数据指定 owner | 演练 D2→D1 后已获 stored 的 `m-9/seq9` 仍可读/恢复 |

“加强培训”“改善监控”没有验收终点；需要具体的误报/漏报条件和谁跟踪关闭。也要区分问题类别：当前 `/v1` 违规是缺陷，S2 只内存是已知范围，未来 S3 的历史规则是上线阻断，反复维护的结构摩擦**经证据证实后**才算技术债。债务标签不能让越权、伪造确认或丢失已确认数据变成可拖延事项。[13.10 债务分类](../../../src/docs/platform_engineering/curriculum/13_architecture/10_technical_debt_evolution.md)

## 七、本卷综合答辩交什么，才可谈高级能力

一套可审的 IM 答辩包不只是架构图：它要连起 13.01 的用户目标、13.02 的身份/状态、13.03 的接口、13.04 的部署/权威、13.05 的容量、13.06 的质量冲突、13.07 的 proposed ADR、13.08 的迁移、13.09 的团队契约、13.10 的债务与 13.11 的反证。面试或评审若改变群大小、离线时长、旧端比例或故障域，学习者要能**说明哪项结论失效并更新证据**，而非守着最初画的图。[13.11 复杂案例答辩](../../../src/docs/platform_engineering/curriculum/13_architecture/11_complex_im_defense.md)

| 证据类型 | 学习者能交的材料 | 不可用什么替代 |
|---|---|---|
| 解释 | 当前 S2 与未来 S3/B 确认点、成员授权、稳定 ID/`seq` | 只背术语或说“最终一致” |
| 最小实现/纸上设计 | 自己完成可读 Go 小模块/设计卡，标出未运行与已运行部分 | 从公开项目拷一大块代码即称掌握 |
| 失败变式 | 重复 ID、DB 已存 E9 未发、B 缺 8、Node N1 丢两 Pod、旧端 7 B | 只跑正常路径或只有 mock 绿 |
| 业务取舍 | B25h 留存/权限、热群写读放大、A 回执强度与回退成本 | 用服务数量代替用户价值 |

固定 `openimsdk/open-im-server` 提交 `f6411a8a1a31d3df36f4c2b3ad28481a94141e1f` 的 [`send.go` 选定路径](https://github.com/openimsdk/open-im-server/blob/f6411a8a1a31d3df36f4c2b3ad28481a94141e1f/internal/rpc/msg/send.go#L46-L70)调用 `MsgToMQ` 后返回；[另一 Mongo 消费路径](https://github.com/openimsdk/open-im-server/blob/f6411a8a1a31d3df36f4c2b3ad28481a94141e1f/internal/msgtransfer/online_msg_to_mongo_handler.go#L43-L69)调用 `BatchInsertChat2DB`。它们只支持所读异步边界，不证明 OpenIM 的完整 ACK、实际容量、事故、债务或本卷未来方案。[OpenIM 阅读地图](../../../src/docs/platform_engineering/curriculum/im_reference.md)

## 八、22 道分层练习：为下一位接手人留下答案

先核当前合同与状态，再沿纸上事件找断点，最后写可交接的判断证据。答案均不代表真实部署结果。

### 基础 1–8：长期责任与合同

<details><summary>1. 高级能力可由“会部署十个服务”直接证明吗？</summary>

不能。要看用户承诺、可复核决定、故障恢复、协作和持续改进证据。</details>

<details><summary>2. 当前 S2 200 到哪一层？</summary>

`accepted_in_memory` 只表示本进程内存受理。</details>

<details><summary>3. 未来 `/v2` 和 R9 已获批准吗？</summary>

没有。`/v2` DB stored 仍提议且仍 6 B，R9 6→9 B 单独待审。</details>

<details><summary>4. 当前同 ID 重复和非成员发送各怎样？</summary>

同 ID 重复 409，非成员目标隐藏 404。</details>

<details><summary>5. ADR-P1 proposed 能驱动当前 `/v1` 改合同吗？</summary>

不能。未获接受，更未被实现/验收。</details>

<details><summary>6. D1/D2 与 K1/K2 各标识什么？</summary>

前者是纸上制品/镜像版本，后者是配置版本；都不代表数据可回滚。</details>

<details><summary>7. 交接卡可把真实令牌和消息正文写进去吗？</summary>

不应。只保存必要的脱敏身份、版本、权限和证据入口。</details>

<details><summary>8. 读完第十三卷就可记为已运营真实 IM 吗？</summary>

不能。静态推导与个人实现、测试、压测和运行证据要分别保存。</details>

### 推演 9–16：虚构事件与指导

<details><summary>9. 未来 DB 有 `m-9/seq9`、E9 未发，消息是否不存在？</summary>

不是。权威可已存、事件待恢复；不能删 DB 来让状态一致。</details>

<details><summary>10. E9 重投两次意味着两条权威消息吗？</summary>

不应。稳定事件可重投，权威消息意图仍须唯一。</details>

<details><summary>11. B 离线 25h、broker 留 24h，补拉前还查什么？</summary>

未来 DB 历史是否确实保留、成员规则是否允许和查询能力是否足够；当前 S2 不承诺。</details>

<details><summary>12. B 连续到 7、先见 9 缺 8，游标应停哪里？</summary>

停 7，不能因最大已见为 9 就跳过 8。</details>

<details><summary>13. 旧 `/v1` 7 B 被接纳，先归类为什么？</summary>

违反当前 6 UTF-8 B 合同的缺陷，应按影响止损，不是可延后的债。</details>

<details><summary>14. Pod Ready 可宣布 B 缺口已补齐吗？</summary>

不能。还需权威历史、授权、事件/设备进度和用户结果证据。</details>

<details><summary>15. 学习者尚不懂 UTF-8 就让他调 R9，缺哪层前置？</summary>

先补 Go 文本/字节、HTTP 输入边界和 6 B 正反例，再讨论协议升级。</details>

<details><summary>16. D2 回 D1 后新 DB 已确认消息不可读，可称“回滚成功”吗？</summary>

不能。须保全权威与兼容读，或经审阅前进修复。</details>

### 决策 17–22：评审、复盘与交接

<details><summary>17. 产品/安全未决定退群旧历史，工程师可先默认全可见吗？</summary>

不能。标阻断，继续不依赖该决定的独立准备。</details>

<details><summary>18. “改善监控”怎样变可验收行动项？</summary>

指定 owner、明确 `m-9` 已存/E9 待发的检测条件、演练与误报/漏报复测。</details>

<details><summary>19. 复盘时应把“某人忘重试”当终点吗？</summary>

不应。还要问为何系统未自动发现/恢复、哪些防线缺失及具体行动项。</details>

<details><summary>20. 何时可把 proposed ADR 标 accepted？</summary>

获相应决定者同意其范围、前提与后果后；实施/发布仍要另验。</details>

<details><summary>21. 固定 OpenIM 两处源码能证明本卷虚构事故发生过吗？</summary>

不能，只支持所读发送到 MQ 与另一 Mongo 消费路径的异步边界。</details>

<details><summary>22. 一个可接手的高级工程答辩包应包含什么？</summary>

用户目标/现行合同、身份/权威、候选与反例、容量和质量取舍、版本/迁移/回退、评审决定、运行复盘与下一位 owner 的验证入口。</details>

## 本章完成标准与后续路径

能在故障、版本更换或团队交接时保住当前合同和已确认数据，说明未来目标的证据缺口，交付可复核的决定与具体行动项，并指导初学者按先修关系重做推理，才算完成第十三卷的纸上学习。本卷完成不等于个人工程能力已验收；可选 AI 支线从[14.01 Python 与数据工作](../../../src/docs/platform_engineering/curriculum/14_ai/01_python_data_work.md)开始，仍沿虚构 IM 主线连接前面的系统知识。
