# 14.09 评测与数据工程：先定 IM 问题和关键词基线，再比较 RAG

> DeepTutor 八节初稿经技术与教学审阅后的静态课程。资料、问题、标签、排名和指标都是**人工虚构纸上样例**；没有运行 Python/Go/IM、检索、模型、评测或站点。当前 S2 `/v1` 正文非空且最多 **6 UTF-8 B**、原始 HTTP 请求正文最多 **4096 B**、同 ID 重复 **409**、非成员隐藏 **404**、成功 `200 accepted_in_memory` 只表示本进程内存受理。未来 S3 `/v2` 的 `stored_in_teaching_db` 是提议且仍为 6 B，R9 的 6→9 B 待审。任何 AI 分数都不能修改这些合同。[09.02 当前合同](../../../src/docs/platform_engineering/curriculum/09_backend_security/02_http_api_contract.md)

## 一、两遍学本章：先有可反驳基线，再学复杂组件

本卷路线把 14.09 放在 14.03 之后**先读一遍**：完成本章第一至四节，固定虚构问题、文档、权限/版本和关键词基线。随后读 14.04–14.07 的模型、提示、检索与 RAG，再回到本章第五至七节评组件与端到端结果；涉及副作用的 Agent 要在 14.08 另加工具执行评测。这样第一次比较方案时已有同一把尺，而不是引入向量、模型后才临时挑“看起来成功”的几个问题。[本卷实际顺序](../../../src/docs/platform_engineering/curriculum/14_ai/README.md)

评测的最小单位是“**某身份，在某资料版本和访问范围下，提出某问题，应获得什么可核结果或正确拒答**”。准确回答当前 6 B、拒绝把待审 R9 当现行、对无权私有资料不泄内容、对历史规则未定说明未知，是四种不同的成功。网页展示流畅回答或引文图标本身不是成功。[14.02 标签/分母](../../../src/docs/platform_engineering/curriculum/14_ai/02_math_ml_intuition.md) · [Google ML Crash Course：数据质量与划分](https://developers.google.com/machine-learning/crash-course/overfitting/dividing-datasets)

## 二、六道虚构问题先定来源、权限与“可答/拒答”标签

本章只用四份**人为编造**的文档记录：`doc-current`（公开，记当前 `/v1` 6 B/409/404/200）；`doc-r9`（公开，但 `status=proposed`，记 6→9 B 待审）；`doc-private`（`access_scope=u-a-only`，正文不能给 `u-b`）；`doc-history`（公开教学说明，broker 保留 24h，B 离线 25h 不能仅靠它补齐）。资料 ID、版本和 scope 都应进入后续 manifest；它们不是从真实聊天/公司文档导出。[14.01 虚构数据与权限](../../../src/docs/platform_engineering/curriculum/14_ai/01_python_data_work.md)

| 问题 | actor / 纸上标签 | 最小证据或拒答依据 |
|---|---|---|
| `q-01` 当前 `/v1` 正文上限？ | `u-a`；可答 **6 UTF-8 B** | 当前版 `doc-current` |
| `q-02` R9 已生效、可发 9 B？ | `u-a`；可答 **否，仍待审** | `doc-current` + `doc-r9(status=proposed)` |
| `q-03` `u-b` 能读 `doc-private` 内容吗？ | `u-b`；**权限拒绝**，不泄正文/存在细节 | 权限元数据 `access_scope=u-a-only`，**不把正文送模型** |
| `q-04` B 退群后能读多少旧历史？ | `u-b`；**规则未定，不能猜** | 产品/安全历史可见规则待决定 |
| `q-05` 当前 S2 200 证明 B 已收到？ | `u-a`；可答 **不能** | 当前版 `doc-current` 的受理语义 |
| `q-06` B 离线 25h，可只凭 24h broker 补齐？ | `u-b`；可答 **不能仅凭 broker** | `doc-history`；未来 DB 必须真实保留且授权才可能补 |

`q-03` 的产品回复要按权限策略做不泄露的拒绝；这道题不能为了算“检索召回”而先读取并暴露 `doc-private` 正文。`q-04` 则不是“文档没检出就猜否”，而是**业务规则仍未批准**。标签卡需包含 actor、问题、适用版本/时间、expected action（回答/拒答/待决）、允许的资料 ID、标注人和标注理由；纸上标签并非真实用户行为测量。[09.07 对象授权](../../../src/docs/platform_engineering/curriculum/09_backend_security/07_authentication_authorization.md) · [13.01 未决历史规则](../../../src/docs/platform_engineering/curriculum/13_architecture/01_problem_stakeholders.md)

## 三、确定性关键词基线先过滤，再排名

最小基线可由普通程序完成：先用 actor 和文档 `access_scope` 做**权限过滤**，再按问题要的是 current 还是 proposal 处理版本/状态，最后用事先固定的词项表（例如“正文”“上限”）作字面匹配和计数，平分按稳定 `document_id` 排序。规则、词项、正规化和资料版本都记录，不在看到模型回答后临时改。这里**只写纸上流程，未运行检索**。[Google ML Crash Course：固定测试与数据泄漏](https://developers.google.com/machine-learning/crash-course/overfitting/dividing-datasets)

```text
actor/问题 → access_scope 过滤 → current/proposed 状态解释
           → 固定关键词匹配 → 稳定排序 → 有权证据核对 → 回答/拒答
```

`q-01` 若跳过**现行版本过滤**，`doc-r9` 也提“正文上限”，甚至因重复出现“9 B”而排名靠前，系统可能错答 9 B；`q-02` 则需要同时读取当前与拟议资料，才能说明“提议不等于生效”。`q-03` 先依据 scope 拒绝，不能让私有正文先进入候选集、再指望模型“别引用”。关键词基线简单但**可解释、可复跑**；将来向量/RAG 要在同一问题与权限条件下证明比它好，不能换一批更容易的问题比较。[14.03 生成与证据](../../../src/docs/platform_engineering/curriculum/14_ai/03_language_model_foundations.md)

关键词命中不等于“引用支撑整句”：`doc-r9` 命中“9 B”，却正说明**9 B 尚待审**。失败报告应记错在权限、版本、召回、排序、引用还是最后回答，而不是给所有情况一个“模型幻觉”标签。[Google ML Crash Course：生产数据链监测](https://developers.google.com/machine-learning/crash-course/production-ml-systems/monitoring)

## 四、代表性、划分与泄漏：六题只是教学起点

六题覆盖当前事实、提议状态、无权拒绝、未知规则、跨确认点和长离线六类**故意挑出的场景**，并不代表真实用户比例，也不足以估任何产品准确率。后续扩充应先列目标用户/问题桶和失败成本，再按会话、文档、时间、语言/旧端与权限状态采样；禁止把真实公司私聊未经允许引入。训练/开发样本与最终未见样本的边界需要先固定。[Google ML Crash Course：划分数据集](https://developers.google.com/machine-learning/crash-course/overfitting/dividing-datasets) · [14.01 manifest](../../../src/docs/platform_engineering/curriculum/14_ai/01_python_data_work.md)

若 `c-a` 的同一文档片段或改写问题同时进开发与最终集，模型/提示可能只记住答案；若先看最终集错题再调关键词，最终集就不再独立。去重不只比完全相同 JSON 行：同一个 `message_id` 的多个导出、相邻会话片段、同源文档多版本也可能近重复。按会话、来源文档或时间分组应对应**未来要检验的泛化问题**，并记录无法比较/标签未定的样本；不要为了一个漂亮分数把困难桶删掉。[Google：测试集重复与磨损](https://developers.google.com/machine-learning/crash-course/overfitting/dividing-datasets)

一份评测 manifest 至少记：合成语料/问题/标签文件的 SHA256、schema、资料状态和访问范围版本、标注人/争议处理、训练/开发/最终集 ID 与划分规则、基线词项/排序代码版本、预测输出及拒答/错误类别。本章没有生成真实模型分数。[Google：生产 ML 数据/版本监测](https://developers.google.com/machine-learning/crash-course/production-ml-systems/monitoring)

> **第二遍阅读入口：**学完 14.04–14.07 后，再从第五节将同一六题扩大为检索、引用、生成和用户任务的多层检查；下面的 `@k` 数字仍是纸上推演。

## 五、组件指标先写分母：有权召回与越权绝不能平均

**权限过滤**是独立硬门：未经授权的文档进入候选/提示的次数必须单列，不能用其它题的高准确率抵消。**检索召回**只在预先有**可访问金证据**的问题上算；`q-03` 是权限拒绝，`q-04` 是规则未定，不放进这项分母。`q-01/q-02/q-05/q-06` 四题各有预定最小证据集，其中 `q-02` 需要**两份**资料合起来才能回答状态。[09.07 授权](../../../src/docs/platform_engineering/curriculum/09_backend_security/07_authentication_authorization.md)

仅作**未运行的纸上结果表**：假设 top2 对 `q-01` 命中 `doc-current`，`q-02` 同时命中 `doc-current+doc-r9`，`q-05` 漏掉 `doc-current`，`q-06` 命中 `doc-history`。按“所需金证据集全在 top2 才算该题命中”，`Recall@2=3/4=0.75`；这不是系统测得的召回。另假设 `q-01` 的 top2 为“相关且有权的 `doc-current` + 无关但有权的 `doc-history`”，其该题 `Precision@2=1/2=0.5`。相关性标签、授权、能否支撑答案是三道不同判断。[14.02 指标分母](../../../src/docs/platform_engineering/curriculum/14_ai/02_math_ml_intuition.md)

| 组件门 | 分母/检查对象 | 典型错误 |
|---|---|---|
| 来源/权限 | 所有检索请求、候选、进入提示的片段 | `doc-private` 因高相似度被 `u-b` 看见 |
| 召回 `@k` | 有预先可访问金证据的题 | 只取到 `doc-r9`，漏当前版本却答 9 B |
| 排名 precision `@k` | top k 中被审为相关的有权片段 | 用过期/无关片段占掉上下文 |
| 引用支撑 | 回答的**每个关键主张**和对应原文 | 有引用链接，却不支持该主张 |

ARES 等原始 RAG 评测研究将检索相关性、回答忠实度等层分开讨论；指标定义和自动打分方法各有假设。课程用上述小表训练**先写分母与人工核证**，后续才能选择工具或模型打分。[ARES 原论文](https://arxiv.org/abs/2311.09476)

## 六、端到端结果按问题桶报告，正确拒答也算成功

端到端评测问的是用户在其身份和资料版本下能否得到**正确、有权、有证据的结果或正确拒答**。`q-01` 应答当前 6 B；`q-02` 应说明 R9 未生效；`q-03` 应无泄露拒绝；`q-04` 应说明历史规则未定；`q-05` 不得把当前 S2 200 写成 B 送达；`q-06` 不得以 24h broker 保证 25h 完整补拉。一个只会流畅回答却在 `q-03` 泄私有文档的系统，不能因其它题都对而宣称通过。[14.03 模型输出与合同](../../../src/docs/platform_engineering/curriculum/14_ai/03_language_model_foundations.md)

| 答案结果 | 记作哪类证据 | 不应怎样“修分” |
|---|---|---|
| 有权资料充分、回答与每个关键引用一致 | 可答桶成功 | 只检查引用是否存在，不看原文是否支持 |
| 无权或规则未定时拒答/解释缺口 | 拒答桶成功 | 当作“没回答”统一算失败 |
| 用拟议 R9 答“当前 9 B” | 版本/事实失败 | 靠另一个问题答对来平均掉 |
| 用 `doc-private` 回答 `u-b` | 权限硬门失败 | 只删输出引文，保留未授权提示输入 |
| 正确但过慢/成本过高 | 质量与效率待评 | 只凭字面正确宣布上线 |

未来若真比较关键词、向量、RAG 或模型版本，须固定问题/文档/权限/模型/提示/索引版本和抽样窗口，再记录完成率、拒答正确性、逐句证据、尾时延、token/计算和人工复核成本。课程**没有真实 API 价格或运行结果**，不会在此给生产阈值；先按用户失败成本决定哪一项是硬门、哪一项可权衡。[Google ML Crash Course：生产监测与切片](https://developers.google.com/machine-learning/crash-course/production-ml-systems/monitoring)

## 七、自动裁判会偏，失败归因要回到最早坏边界

若以后使用语言模型当裁判，不能把裁判分数当金标准。原始研究指出自动裁判可能受**答案顺序、篇幅和自身模型偏好**等影响；成对比较可换序/盲化，标注规则应先冻结，并用人工抽样复核争议与敏感桶。尤其 `q-02` 与 `q-04` 这种“提议未生效/规则未定”，一个自信而长的答案可能更吸引裁判，却是错误业务结论。[Judging LLM-as-a-Judge 原论文](https://arxiv.org/abs/2306.05685)

诊断一次失败可沿“**来源是否合法 → actor/scope 是否正确 → 文档版本/状态 → 切分/索引 → 召回/排序 → 上下文截断 → 生成主张 → 引用/拒答 → IM 业务合同**”找**第一个坏边界**。例如 q-01 答 9 B，先查 `doc-r9` 是否被误标 current，再看排序和模型生成；若 `doc-current` 已在上下文却输出 9，才更像生成/指令问题。q-03 无权文档若早进提示，事后把答案删掉也不等于权限过滤通过。[14.01 来源记录](../../../src/docs/platform_engineering/curriculum/14_ai/01_python_data_work.md) · [Google ML Crash Course：数据监测](https://developers.google.com/machine-learning/crash-course/production-ml-systems/monitoring)

评测报告保留原始问题、允许的证据 ID、预测/引用、错误层、人工复核理由和**不可比较原因**；资料或权限变更时形成新版本，不回改旧结果。样本越少越不能用“总体 83%”掩盖某个硬门失败；本章六题只是一份教学用例清单，尚无真正的评测结果。[14.02 小样本限制](../../../src/docs/platform_engineering/curriculum/14_ai/02_math_ml_intuition.md)

## 八、22 道分层练习：审一张虚构 IM 助手评测卡

第一轮做 1–8 和本章前四节；学完 14.04–14.07 再回做 9–22。所有答案均针对人工虚构资料和未运行的纸上结果。

### 基础 1–8：问题、资料与基线

<details><summary>1. `q-01` 的当前正确答案是什么，金资料是哪份？</summary>

当前 `/v1` 正文上限 6 UTF-8 B，金资料是 current 状态的 `doc-current`。</details>

<details><summary>2. `doc-r9` 写 9 B 就意味着当前可发 9 B 吗？</summary>

不意味着；它是 proposed，R9 6→9 B 待审。</details>

<details><summary>3. `u-b` 问 `doc-private` 内容，能先把正文送模型再要求别泄露吗？</summary>

不能。scope 为 `u-a-only`，在检索/提示前拒绝，且不泄正文/存在细节。</details>

<details><summary>4. `q-04` 的退群历史规则未定，应猜“能看”吗？</summary>

不能。标规则待产品/安全决定，按现有授权边界拒答或说明未知。</details>

<details><summary>5. `q-05` 当前 200 可证明 B 设备收到吗？</summary>

不能；`accepted_in_memory` 只到本进程内存受理。</details>

<details><summary>6. `q-06` 的 25h/24h 说明什么？</summary>

不能仅靠留 24h 的教学 broker 补全 25h 离线；未来 DB 需真实保留且有权可读。</details>

<details><summary>7. 基线为何在关键词匹配前先过滤 scope？</summary>

避免无权资料进入候选/提示；相似度或关键词命中不授予访问权。</details>

<details><summary>8. 六题可代表真实用户问题比例吗？</summary>

不能。它们是人为挑出的教学问题桶，小样本不支持总体产品指标。</details>

### 组件 9–16：召回、证据与泄漏

<details><summary>9. 哪四题放入本章有金证据的检索召回分母？</summary>

`q-01/q-02/q-05/q-06`；`q-03` 是权限拒绝，`q-04` 规则未定。</details>

<details><summary>10. `q-02` 只检到 `doc-r9`，能算完整命中吗？</summary>

不能。它还需要当前 `doc-current` 才能说明提议未替代现行合同。</details>

<details><summary>11. 纸上 top2 四题中三题命中完整证据，Recall@2 是多少？</summary>

`3/4=0.75`，只是假设排名，不是实际运行结果。</details>

<details><summary>12. 某题 top2 只有一份相关且有权资料，Precision@2 多少？</summary>

`1/2=0.5`；先有明确相关性标注。</details>

<details><summary>13. 无权文档进了提示，但最终回答没引用它，可算权限通过吗？</summary>

不能。权限硬门在提示输入之前已失败。</details>

<details><summary>14. 答案末尾有引用链接，就能证明每句被支持吗？</summary>

不能。需逐个关键主张与有权、当前原文核对。</details>

<details><summary>15. 同一 `c-a` 片段改写后分别进开发与最终集，有何风险？</summary>

近重复泄漏使最终结果过分乐观；按目标分组并保留去重记录。</details>

<details><summary>16. 看了最终集错题再改关键词，仍可称独立最终测试吗？</summary>

不能。最终集参与调参后已被“磨损”，需另留未见样本。</details>

### 决策 17–22：端到端与裁判

<details><summary>17. `q-03/q-04` 正确拒答应一律记失败吗？</summary>

不应。分别是权限拒绝与规则未定，按其各自标签记成功。</details>

<details><summary>18. q-01 答 9 B 时先查哪条边界？</summary>

先查 current/proposed 资料状态和版本过滤，再看排序与生成。</details>

<details><summary>19. 自动裁判偏爱长回答可能造成什么？</summary>

冗长但无证据/无权的回答获高分；应换序盲评并人工抽检。</details>

<details><summary>20. 可用其它五题的高分抵消 q-03 泄私有资料吗？</summary>

不能。权限是独立硬门，须单列失败和影响。</details>

<details><summary>21. 换模型后怎样才有可比较结果？</summary>

固定问题/资料/权限/基线及版本，记录模型/提示/索引/窗口与同口径输出和成本。</details>

<details><summary>22. 一张可复核评测卡至少留什么？</summary>

actor、问题桶/标签、资料与权限版本、gold 证据、基线/候选输出、引用支持、分层错误、人工复核与不可比原因。</details>

## 本章完成标准与后续路径

第一遍能固定六类虚构问题、资料版本/权限和可复跑关键词基线，并解释泄漏与金标签来源；第二遍能按明确分母拆检索、引用、拒答和端到端结果，识别自动裁判偏差与第一个坏边界，才算完成本章。按照本卷路线，接着从 14.04 的 Transformer 与推理路径深入模型机制，再回本章复核复杂方案。
