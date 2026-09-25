# 12.12 平台作为产品：新 IM 服务接入为何还要找人救火

> DeepTutor 八节初稿经技术与教学审阅后的静态课程。团队、服务、人数、时间与平台均为**虚构纸上案例**，没有运行 Go、IM、Kubernetes、`kubectl`、部署、压测或站点。当前 S2 `/v1` 合同是正文非空且最多 **6 UTF-8 B**、原始 HTTP 请求正文最多 **4096 B**、同 ID 重复 **409**、非成员隐藏 **404**、成功 `200 accepted_in_memory` 只表示本进程内存受理；未来 S3 `/v2` 的 `stored_in_teaching_db` 尚是提议且仍为 6 B，R9 的 6→9 B 待审。[09.02 当前合同](../../../src/docs/platform_engineering/curriculum/09_backend_security/02_http_api_contract.md)

## 一、先问新团队要完成什么，而不是平台有多少组件

假设一支**虚构**应用小组要把自己的教学 IM 网关接入一套已有平台：在预发环境创建服务，使用固定镜像摘要 `D1`，加载非秘密配置 `K1`，公开当前 S2 `/v1`，通过就绪检查，按成员权限返回 404，并在出现问题时找到原因和负责人。这是学习者的纸上需求，不表示本课程已经部署了这个网关。若平台展示了服务目录、模板和仪表盘，却仍需平台值班者逐项代填权限、修配置、解释失败，接入体验依旧脆弱。[CNCF 平台工程成熟度模型](https://tag-app-delivery.cncf.io/whitepapers/platform-eng-maturity-model/)

平台的**直接用户**是应用开发者、发布者和各层值班者；IM 的 `u-a/u-b` 是应用的终端用户。平台给前者一条可发现、可重复、可支持的交付路径；最终仍须通过后者的业务行为验收。平台可以提供 Pod、网络、日志与权限的公共能力，但“重复 ID 返回 409”“非成员隐藏 404”“`200` 只承诺内存受理”必须由应用定义和验证，平台不能从一个 Ready 条件推出这些语义。[11.01 业务确认点](../../../src/docs/platform_engineering/curriculum/11_reliability/01_business_measurement.md) · [12.04 平台就绪边界](../../../src/docs/platform_engineering/curriculum/12_platform/04_cluster_control_model.md)

| 应用小组真实任务 | 平台应该交付的接口 | 仍由应用小组判断 |
|---|---|---|
| 建立预发网关 | 输入契约、环境声明、预览差异、权限申请 | 服务名、镜像、业务合同、依赖 |
| 发布并回退 | 受控滚动、版本证据、停止/撤回路径 | 旧客户端/消息语义与用户影响 |
| 发现故障 | 基础指标、事件、日志入口、升级通道 | 409/404 是否正确、B 是否收到 |
| 长期维护 | 默认值升级、兼容说明、支持责任 | 业务目标与例外是否仍合理 |

## 二、平台是持续服务；成熟度是诊断坐标

把平台当作产品，意味着识别用户、持续收集阻力、维护明确的接口和文档、处理错误与升级，并为默认值变更提供兼容与退出路径。它可以先是一份维护良好的文档和模板，不必一开始就造门户。门户点击数、Kubernetes 对象数或“用了多少组件”均不能直接证明接入任务更快更安全。[CNCF 平台工程成熟度模型](https://tag-app-delivery.cncf.io/whitepapers/platform-eng-maturity-model/)

CNCF 模型把**投入、采用、接口、运行、测量**列为五个分别评估的方面；等级是理解当前状态与下一步机会的工具，并非要求所有方面都冲最高等级。一个团队可以有自助接口却缺少持续维护预算，也可能有很好的运行支持却仍靠口头找人接入。此时再加一个门户，通常不会自动解决维护或错误反馈的问题。[CNCF 模型的五维表](https://tag-app-delivery.cncf.io/whitepapers/platform-eng-maturity-model/)

平台价值需同时看开发者独立性、交付效率和运行稳定性。DORA 对平台工程的研究强调开发者能否自己完成任务；其 2024 报告也提醒，效率提升与变更稳定性、吞吐间可能存在取舍。因此本章只把“少求助”“更快接入”当**待测假设**，不宣称使用平台就必然安全或更快。[DORA：Platform engineering](https://dora.dev/capabilities/platform-engineering/) · [DORA 2024 研究](https://dora.dev/research/2024/dora-report/)

## 三、将黄金路径写成输入、输出和责任清楚的契约

一条“默认接入路径”要给新小组一个最小**输入表**、清晰的**输出物**和出错后的可行动反馈。下表是纸上接口示例，未对应实际 API 或部署工具。`D1` 是课程内的制品身份记号，提交审核时应记录真实内容摘要；`K1` 是非秘密配置版本，凭据仅填受控引用。[12.01 制品身份](../../../src/docs/platform_engineering/curriculum/12_platform/01_runtime_artifacts.md) · [12.11 渲染与生效](../../../src/docs/platform_engineering/curriculum/12_platform/11_declarative_delivery.md)

| 输入字段 | 规则 | 校验/反馈给应用小组 |
|---|---|---|
| 服务名、命名空间、owner、值班联系人 | 必填 | 命名冲突、无人负责或目标环境不合法时指出字段与修复办法 |
| 镜像摘要 `D1`、目标环境、配置 `K1` | 必填 | 不接受只写可变 tag；展示展开后的对象差异与配置版本 |
| Secret 引用、ServiceAccount/RBAC | 默认最小权限；引用可选 | 只验引用与授权路径，不在日志/审阅记录打印秘密值 |
| CPU/内存 request、探针、滚动预算 | 提供默认；按证据可覆盖 | 告知可能 Pending、误判就绪或发布中连接丢失的后果 |
| 长连接摘流、日志/指标、告警路由 | IM 网关需明确 | 缺连接排空或没有接手人时不默认为“可发布” |
| `/v1` 合同探针 | 本例必验 | 6 B/409/404/`accepted_in_memory` 逐项报告，不把 200 写成设备到达 |

平台的**输出**至少有展开目标清单及散列、镜像与配置版本、目标环境、同步/就绪状态、错误原因、回退入口和责任人。每个字段标出“必填、默认、可覆盖、需审批或当前不支持”；输入不合规范应早给具体错误，例如“`image` 只有 tag，需给 digest”，而非只显示“部署失败”。“黄金路径”也要允许受控例外：IM 长连接网关不能直接套短请求服务的退出超时；例外要有提出人、影响、替代验证与撤销条件。[12.08 摘流](../../../src/docs/platform_engineering/curriculum/12_platform/08_startup_probes_exit.md)

## 四、安全默认值降低重复工作，但不能代写业务责任

适合平台提供的默认值包括限定 ServiceAccount 与 RBAC、非秘密配置/Secret 引用分离、资源 request、启动/就绪检查、滚动预算、版本标识、结构化日志脱敏和基本告警路由。默认值的作用是减少每个小组重复解决相同问题的时间，并让常见错误更早暴露；它们仍需按实际环境验证。尤其是 request 太高可能使新 Pod Pending，readiness 太宽松可能让尚不可用的网关接流量，默认值不能神化。[Kubernetes：RBAC 好实践](https://kubernetes.io/docs/concepts/security/rbac-good-practices/) · [12.06 资源](../../../src/docs/platform_engineering/curriculum/12_platform/06_resources_persistent_storage.md)

IM 网关有几项**不可被通用模板抹平**的责任：旧 WebSocket 不随 Service 切换自动迁移；退出时需停止新接入、给在途处理和重连留预算；一个热门群的成员×设备扇出不是普通请求计数；当前 S2 的 `200 accepted_in_memory` 随 Pod 替换没有权威恢复承诺。未来若 B 离线 25 小时而教学 broker 只留 24 小时，补缺口要从有成员权限的权威 DB 历史取 `seq9`，不能把“平台自动扩容/副本 Ready”当作数据恢复。[12.08 长连接退出](../../../src/docs/platform_engineering/curriculum/12_platform/08_startup_probes_exit.md) · [11.12 容量账本](../../../src/docs/platform_engineering/curriculum/11_reliability/12_capacity_cost_decision.md) · [07.12 补拉边界](../../../src/docs/platform_engineering/curriculum/07_cache_messaging/12_cross_system_consistency_case.md)

所以默认值要附**适用边界**。例如“HTTP 短请求可用默认终止预算，WebSocket 网关需提供连接分布、重连退避和有界摘流证据”；“基础观测已装好”不代表有 B 设备 ACK 指标。偏离默认路径时，平台应告诉应用小组需要补哪类证据，由谁批准，而非只留一个无法解释的拒绝。[12.09 发布停止门](../../../src/docs/platform_engineering/curriculum/12_platform/09_release_rollback.md)

## 五、自助服务应覆盖失败、撤回和求助

**自助**不是把原来的工单改成一个网页按钮，而是让符合契约的小组在有界权限内自己完成标准任务，并在失败时知道卡在哪里、能怎样恢复。可以从文档和版本化模板起步，之后才根据真实阻力决定是否需要 CLI 或门户；工具界面不是能力本身。[CNCF：接口与采用](https://tag-app-delivery.cncf.io/whitepapers/platform-eng-maturity-model/)

| 纸上步骤 | 应用小组看得到的结果 | 失败时应出现的反馈 |
|---|---|---|
| T0 填输入 | 字段校验、owner 与合同清单 | 哪个字段缺失/越权、如何修复 |
| T1 预检与渲染 | D1/K1、权限、资源和差异预览 | 哪个约束冲突、谁可批准例外 |
| T2 审阅与同步 | Git 修订、渲染散列、代理同步结果 | 源未合并、API 拒绝、字段冲突的边界 |
| T3 Pod 就绪 | Ready/Pending、探针、配置生效版本 | Node 不足、镜像拉取、配置未加载等原因 |
| T4 业务验收 | `/v1` 6 B/409/404/200 合同观察 | 哪项用户行为失败及停止/撤回动作 |
| T5 交接 | 值班人、仪表盘、回退记录 | 无 owner/证据不足则不关闭接入 |

假设 T2 因代理缺少目标命名空间的写权限而停住：让应用小组看见“哪一个对象、哪一个操作、哪个身份被拒绝”，并指向权限申请/升级路径；不能让他们靠猜测多次提交同一份 YAML。若 T4 出现非成员请求返回 200，平台同步和 Pod Ready 都不构成通过，必须停止并由应用小组修正成员授权。自助流程的**结束条件**是合同及交接证据过门，而非页面显示绿色。[12.07 平台/业务权限](../../../src/docs/platform_engineering/curriculum/12_platform/07_config_permissions.md) · [12.11 G→B 链](../../../src/docs/platform_engineering/curriculum/12_platform/11_declarative_delivery.md)

## 六、观测与支持要说清“谁收到、谁判断、谁修”

平台可统一提供对象事件、Pod/Node 资源与就绪、入口请求、日志/追踪入口和告警路由；应用需提供消息受理、重复/非成员拒绝、会话权限、积压和未来设备 ACK/历史补拉等业务指标。基础信号帮助定位第一处失配，业务信号判断用户是否得到承诺。即使两类信号都在同一仪表盘，责任仍需写明。[11.03 日志指标追踪](../../../src/docs/platform_engineering/curriculum/11_reliability/03_logs_metrics_traces.md) · [11.08 SLO 与告警](../../../src/docs/platform_engineering/curriculum/11_reliability/08_slo_alerting.md)

| 症状 | 先查证据 | 初始接手方 | 转交条件 |
|---|---|---|---|
| 新 Pod Pending | request、Node 可分配、调度事件 | 平台/应用共同看配置 | 配额/节点供给归平台，过大 request 归应用决策 |
| 网关 Ready 但 404 错 | 应用身份、会话成员、HTTP 合同 | 应用 | 若统一入口改写了身份，再与平台联查 |
| 旧 Pod 仍用 K1 | ConfigMap、模板版本、Pod UID/生效值 | 发布者/平台共查 | 明确是谁负责替换及回退 |
| B 离线缺 `seq9` | 当前/未来阶段、权威历史、权限与保留窗口 | 应用/数据负责人 | 平台只对提供的存储/队列故障负责 |

一份支持约定还要列明文档入口、值班时间、严重等级、升级通道、可执行的只读排障材料、事故复盘后怎样改默认值。不要让应用团队的唯一“诊断接口”是认识某个熟人。平台维护者也要保护自己的时间：重复的人工代办若可变成安全默认/清楚的错误反馈，就减少下一次相同求助；但不能把所有复杂业务例外都强塞进平台。[Google SRE：Toil](https://sre.google/sre-book/eliminating-toil/)

## 七、用净收益和用户结果排序平台工作

做一份**纯纸上、同口径**的小账：假设 10 次相似接入，旧流程每次需应用与平台合计 **5 人时**，新标准路径每次 **1.5 人时**。毛节省 `10×(5−1.5)=35 人时`。若这段观察期还需额外平台维护 **12 人时**、新路径造成的额外故障处置 **8 人时**，净值为 `35−12−8=15 人时`。这个算式没有把成本、质量差异、学习期、服务复杂度和机会成本全算进来，不能拿它证明真实平台有 15 人时因果收益。[CNCF：测量与投入](https://tag-app-delivery.cncf.io/whitepapers/platform-eng-maturity-model/)

再假设 10 次中仅 **7 次**在无需人工代办、且 T4 业务门通过后完成，有效自助率为 `7/10=70%`。只统计“按钮点击成功”会把后面仍要人修权限、补指标或修 404 的案例误计成功。看接入时长时至少留分布/分位数和失败样本，避免平均值掩盖卡住很久的小组；再配发布失败/回退、支持工单与重复提问、平台自身故障、开发者反馈和维护成本。指标随时间看，按服务类型分组，不能把困难的 IM 网关与简单批处理任务混成一个“平均接入时间”。[DORA：开发者独立性](https://dora.dev/capabilities/platform-engineering/) · [11.02 分布](../../../src/docs/platform_engineering/curriculum/11_reliability/02_distributions_statistics.md)

若 3 次失败均卡在“权限拒绝但没有错误说明”，先改善 T2 的授权与反馈可能比新增门户更有效；若平台维护/故障成本超过节省，需缩小承诺、修默认值、删除少用且昂贵的能力，或明确何种例外另走支持通道。固定 `openimsdk/open-im-server` 提交 `f6411a8a1a31d3df36f4c2b3ad28481a94141e1f` 的 [`send.go` 选定路径](https://github.com/openimsdk/open-im-server/blob/f6411a8a1a31d3df36f4c2b3ad28481a94141e1f/internal/rpc/msg/send.go#L46-L70)调用 `MsgToMQ` 后返回；[另一个 Mongo 消费路径](https://github.com/openimsdk/open-im-server/blob/f6411a8a1a31d3df36f4c2b3ad28481a94141e1f/internal/msgtransfer/online_msg_to_mongo_handler.go#L43-L69)调用 `BatchInsertChat2DB`。两处只能说明所读异步边界，不能证明该项目的平台产品形态、接入耗时或自助率。[OpenIM 阅读地图](../../../src/docs/platform_engineering/curriculum/im_reference.md)

## 八、22 道分层练习：为虚构 IM 网关评审接入路径

先定义用户与输入，接着分析失败时间线，最后用净收益与风险决定平台改进。答案均以本章纸上假设为前提。

### 基础 1–8：用户、合同与默认值

<details><summary>1. 平台直接用户与 IM 终端用户分别是谁？</summary>

直接用户是应用开发者、发布者和值班者；`u-a/u-b` 是应用终端用户。平台价值最终仍须联系后者结果。</details>

<details><summary>2. 组件很多就表示接入体验好吗？</summary>

不能。要看能否发现、完成、诊断、撤回并持续维护任务。</details>

<details><summary>3. CNCF 模型列哪五个独立方面？</summary>

投入、采用、接口、运行、测量；各维分别诊断，不必统一追最高等级。</details>

<details><summary>4. 黄金路径的接入契约至少应给什么？</summary>

明确输入与默认/覆盖规则、校验反馈、输出证据、责任人、失败恢复和例外路径。</details>

<details><summary>5. 本例允许只给镜像 tag，不给 digest 吗？</summary>

不允许；审阅路径需要固定制品身份及可追溯内容摘要。</details>

<details><summary>6. 平台 RBAC 可代替会话成员授权吗？</summary>

不能。RBAC 控集群资源，`u-a` 是否有权访问 `c-a` 是 IM 应用决策。</details>

<details><summary>7. 当前 S2 200 是否表示 B 设备已收到？</summary>

不表示；`accepted_in_memory` 只代表本进程内存受理。</details>

<details><summary>8. 新网关 Ready 是否表示 409/404 行为正确？</summary>

不表示；需要单独验证业务合同。</details>

### 推演 9–16：接入、失败与支持

<details><summary>9. T0 缺 owner 和告警联系人，平台怎样反馈？</summary>

指出必填字段、责任要求和修复办法，不静默创建无人值班服务。</details>

<details><summary>10. T1 渲染结果用了同名可变 tag，先查什么？</summary>

查输入校验、模板覆盖和制品解析；审阅目标应有固定 digest。</details>

<details><summary>11. T2 API 因代理无权限拒绝写入，该给什么信息？</summary>

给被拒绝的资源、动作、身份和目标命名空间，以及权限升级路径。</details>

<details><summary>12. T3 Pod Pending，继续点“重试”足够吗？</summary>

不足。看 request、Node 可分配、配额、放置约束及调度事件，定归属再处置。</details>

<details><summary>13. T3 Ready 而旧 Pod 仍用 K1，第一处边界在哪里？</summary>

在声明/API 状态与进程生效间，查 ConfigMap 注入方式、Pod 模板版本和替换。</details>

<details><summary>14. T4 非成员请求返回 200，可算接入成功吗？</summary>

不能。当前合同要求隐藏为 404，平台就绪不覆盖业务错误。</details>

<details><summary>15. WebSocket 网关能无条件套短请求退出预算吗？</summary>

不能。要有界摘流、在途处理、客户端退避与重连观察的证据。</details>

<details><summary>16. B 离线 25h、broker 留 24h，平台五副本可直接补缺口吗？</summary>

不能。未来需有成员权限的权威 DB 历史；当前 S2 尚无此承诺。</details>

### 决策 17–22：价值与演进

<details><summary>17. 10 次旧 5 人时、新 1.5 人时，毛节省多少？</summary>

`10×(5−1.5)=35 人时`，仅纸上同口径条件值。</details>

<details><summary>18. 维护 12 人时、额外故障 8 人时后，净值多少？</summary>

`35−12−8=15 人时`，尚非真实因果收益或全成本。</details>

<details><summary>19. 10 次仅 7 次无需人工且业务门通过，有效自助率多少？</summary>

`7/10=70%`；页面显示成功但仍需人工或合同未过不计。</details>

<details><summary>20. 三次失败都因权限错误不清楚，先做门户还是改反馈？</summary>

先补 T2 字段级拒绝原因、授权路径和自助修复；再按证据评估界面投资。</details>

<details><summary>21. 平台维护成本持续高于节省，应怎样决策？</summary>

审用户价值、缩小承诺、修默认、删除低用高成本能力或把例外转入明确支持路径。</details>

<details><summary>22. 可审的平台产品评估卡至少应包含什么？</summary>

用户任务与合同、输入/输出/错误接口、默认与例外、平台/应用责任、业务和运行观察、分布化接入时长、有效自助率、故障与总维护成本。</details>

## 本章完成标准与后续路径

能把新 IM 网关的接入需求写成输入、输出、失败反馈和责任清楚的契约，沿 T0–T5 找到第一个断点，并用 `35−12−8=15` 与 `7/10=70%` 说明**条件收益**及其证据缺口，才算完成第一轮。第十二卷至此从制品、容器、集群控制推进到平台服务责任；下一卷[13.01 问题定义与利益相关者](../../../src/docs/platform_engineering/curriculum/13_architecture/01_problem_stakeholders.md)将从使用方、目标、约束与失败成本重新定义 IM 架构问题。
