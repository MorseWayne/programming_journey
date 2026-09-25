# 14.10 优化与部署：按成功 IM 任务衡量质量和成本

> 本章是静态工程课程，**没有部署模型、运行负载、测量 GPU/API 价格或运行 IM 服务**。先会 14.04 的 prefill/decode/KV、14.07 的证据链和 14.09 的同题评测，再学模型选择、批量、缓存、路由、流式输出、限流与观测。当前 S2 `/v1` 正文非空且最多 **6 UTF-8 B**、原始 HTTP 请求正文最多 **4096 B**、同 ID 重复 **409**、非成员隐藏 **404**、成功 `200 accepted_in_memory` 只到本进程内存受理；未来 S3 `/v2` `stored_in_teaching_db` 是提议且仍为 6 B，R9 6→9 B 待审。[09.02 当前合同](../../../src/docs/platform_engineering/curriculum/09_backend_security/02_http_api_contract.md)

## 一、先定义“成功任务”，再谈更快更省

对虚构 IM 资料助手，`q-01` 答当前 **6 UTF-8 B**、`q-02` 说清 R9 尚待审、`q-03` 对 `u-b` 在模型前挡住私有正文、`q-04` 不编退群历史规则、`q-05` 不把 S2 200 写成 B 设备 ACK、`q-06` 不凭 24h broker 保证 25h 离线补齐，才是正确业务结果。先固定 14.09 的问题/资料/身份/标签与关键词基线，再比较优化方案。若候选快一倍却把 `doc-private` 泄出，所谓优化没有通过权限硬门。[14.09 六题和端到端指标](../../../src/docs/platform_engineering/curriculum/14_ai/09_evaluation_data_engineering.md)

把一个请求拆成可观测阶段：

```text
用户请求 → 授权/检索/组装 → 排队 → prefill → 首个输出 token
         → decode/流式传输 → 引用与合同核对 → 用户可见结果
```

**TTFT（首 token 时间）**从用户请求到首个可见 token，包含应用前处理、网络/排队和 prefill；**总时延**还含 decode、输出校验与传输；**吞吐**问单位时间处理多少 token/成功任务；**成本**要说明算的是算力、模型 API、人工复核还是全链路。它们不能互相代替，更不能用只含模型内核的时间代表用户看到答案的时间。[14.04 推理时间线](../../../src/docs/platform_engineering/curriculum/14_ai/04_transformer_inference_path.md)

指标应以**符合权限和当前合同的正确结果**为成功任务分母：可答题需有引用支撑，拒答/未定题需正确停下；同时单列拒答正确性、越权输入/输出、现行/提议混淆、尾时延及资源成本。课程六题太少，不足以估实际通过率或生产容量；以下只给实验设计。[Google ML Crash Course：真实业务指标与切片](https://developers.google.com/machine-learning/crash-course/production-ml-systems/monitoring)

## 二、模型选择与路由从问题难度和停止门出发

“更大模型”可能提高某些回答质量，也可能增加时延和费用；“更小模型”可能够处理简单有证据的格式任务，具体必须同条件实测。本章不推荐产品型号或给价格。可先把业务分为**应用直接处理**（`q-03` 权限拒绝、`q-04` 未定规则）、**确定性/关键词基线可答**（证据清楚的 `q-01/q-05`）和**需综合多份证据的候选**（`q-02` current+proposed、`q-06` 时间与存储边界）。这只是路由**假设**，不是已经观察到的模型性能。[14.09 关键词基线](../../../src/docs/platform_engineering/curriculum/14_ai/09_evaluation_data_engineering.md)

路由器输入可以有问题类型、资料状态、证据是否完整、允许的模型/地区与任务预算；输出是可审计的“应用直接答/关键词/RAG 候选/人工或安全失败”。**权限和当前合同先于路由**：不能把 `q-03` 送大模型“再判断一次”并附私有正文；不能因为便宜模型答 9 B 更快就把 R9 当现行。路由误判应能回到更保守的证据/拒答路径，而不是自动扩大资料范围。[14.07 有权证据链](../../../src/docs/platform_engineering/curriculum/14_ai/07_rag_pipeline.md)

比较两条路由方案需固定 actor、资料/索引版本、提示、解码条件和相同题集，再记录每桶有权正确率、拒答、TTFT/总时延、调用次数与成本。若一方案把难题都拒答，平均时延下降未必让用户任务改善；若一方案多用模型却只改善无关措辞，也不应凭“更聪明”上线。[Google ML：业务指标与数据切片](https://developers.google.com/machine-learning/crash-course/production-ml-systems/monitoring)

## 三、批量、KV 与并发：吞吐提高也会改变等待

14.04 区分了输入 prefill 与逐 token decode。**批量处理**可让多条请求共享一次计算调度，提高设备利用率；**连续批量**可在生成过程中动态加入/移出请求，减轻“必须整批同长等待”的浪费。具体实现、硬件与调度决定效果；更大批量可能提高吞吐，却让某些请求排队更久或占更多 KV 内存。Hugging Face 官方说明把连续批量的调度/内存配置与生成采样配置分开，正提醒我们不要把“输出文字怎么选”和“多请求怎么排”混成同一旋钮。[Hugging Face：Continuous batching](https://huggingface.co/docs/transformers/en/continuous_batching)

一个**不含实测时间**的纸上对照：请求 A 有短输入/长输出，请求 B 有长输入/短输出。A 主要持续增加 decode 步数；B 主要增加 prefill 与初始 KV 长度。若只报“每秒请求数”，会遗漏 A 的输出 token、B 的输入 token、并发 KV 占用和排队 TTFT。实验至少分输入/输出 token 桶、并发桶、TTFT p50/p95、输出速率与显存/内存压力；p95 是把样本时延从小到大排序后约 95% 样本不超过的分位数，不是一次最慢值。[14.04 资源卡](../../../src/docs/platform_engineering/curriculum/14_ai/04_transformer_inference_path.md) · [11.02 分布与统计](../../../src/docs/platform_engineering/curriculum/11_reliability/02_distributions_statistics.md)

模型权重、KV cache、批量输入、其它激活和服务缓冲都会占资源。14.04 的 2 KiB KV 只是虚构两层小模型的算式，**不是任何实际显存配置**。部署设计应记录真实模型架构、数值精度、最大上下文、并发、缓存策略和溢出/拒绝行为，再用符合业务问题长度的负载测。未经测量，不能写“开缓存可支撑 1000 并发”。[Hugging Face：KV cache 策略](https://huggingface.co/docs/transformers/en/kv_cache)

## 四、缓存能省重复计算，也可能复用过期或越权答案

至少分三类缓存：**检索候选/原文缓存**省查索引或文档时间；**答案缓存**省检索与生成；**模型前缀/KV 缓存**省重复处理相同输入前缀。它们缓存的对象、失效条件和风险不同。`q-01` 的“6 B”答案若只按问题文字缓存，R9 将来获批后可能仍回旧规则；`q-03` 的私有片段若跨 actor 复用，则可能泄漏。缓存键/可复用条件至少考虑 actor 或授权范围、资料/状态版本、提示/模型版本和问题作用域；撤权或规则生效时要能让相关缓存失效。[14.07 更新与缓存](../../../src/docs/platform_engineering/curriculum/14_ai/07_rag_pipeline.md)

前缀共享尤其不能只看文本相同：两个用户看似问同一句，允许的文档不同；同一用户前后也可能因撤权变化。vLLM 官方安全文档列出多租户前缀缓存的跨租户侧信道和隔离配置，这是**具体实现的例子**；本章的通用要求仍是先确定授权边界，再决定可否复用，不能假设所有引擎都以相同方式隔离。[vLLM：prefix cache security](https://docs.vllm.ai/en/latest/usage/security/) · [14.04 前缀权限](../../../src/docs/platform_engineering/curriculum/14_ai/04_transformer_inference_path.md)

缓存命中率上升不一定是好消息：若命中的是旧 `doc-r9` 或私有资料，质量和权限更差。实验应同时记录**命中条件、命中后版本核验、撤权传播时间、TTFT/总时延变化、最终业务结果**。不能为了缩短延迟跳过交付前的权威权限与合同检查。

## 五、流式输出改善等待感，不能提前交付未经核证的主张

**流式输出**把生成中的片段陆续送给客户端，使用户更早看见文字；但首 token 出现不代表整条回答已完成，更不代表逐句引用/合同校验已通过。对 `q-01`，若模型先流出“当前可发 9 B”，最后才发现 R9 未生效，用户已经看到了错误主张。对 `q-03`，私有正文更不能先流出再试图撤回。需要决定哪些内容可以作为**未验证草稿**展示、哪些业务事实/引用必须缓冲到核证后再公开；高风险桶可直接等待完整验证或走应用拒答。[14.05 输出校验](../../../src/docs/platform_engineering/curriculum/14_ai/05_prompt_structured_output.md) · [14.07 逐主张引用](../../../src/docs/platform_engineering/curriculum/14_ai/07_rag_pipeline.md)

客户端断开、服务端取消、重试与背压也要定义：消费者读得慢时不能无限缓存输出；取消了推理不等于 IM 业务消息已撤销；重新请求不能意外重复 14.08 的写工具副作用。HTTP 流式传输可以有不同实现，本章不绑定具体协议或声称课程站点已支持它。[14.08 未知结果与副作用](../../../src/docs/platform_engineering/curriculum/14_ai/08_tools_workflows_agents.md)

测流式效果时同时记录**首个可见 token、首个已核证信息、完整可交付答案**三个时点，而不只看 TTFT。若首屏快但最终被拒绝、引用缺失或用户反复等待更正，不能把它算成功任务。

## 六、限流、排队和降级须保持权限与合同

当输入、并发或 KV 占用超过预算，服务要有**有界队列、并发上限、超时、取消、按 actor/租户的速率限制和过载拒绝**。接收所有请求再无限排队会放大尾时延和内存；只靠更多实例也可能把下游检索、模型或授权源压垮。Google SRE 的过载章节强调按请求语义选择降级/拒绝，不能把资源调度与用户结果分开。[Google SRE：Handling Overload](https://sre.google/sre-book/handling-overload/)

纸上降级选择：`q-01` 若关键词基线仍能在有权、现行 `doc-current` 上答 6 B，可以不用生成器；`q-03` 仍由应用权限拒绝；`q-04` 仍标规则未定。`q-02` 若降级路径拿不到 current 和 proposed 两份资料，就应说明证据不足，不能只引 r9 答“已生效”。降级绝不允许放宽 `doc-private`、把 R9 当 current 或把 S2 200 宣称设备已收到。[14.09 基线与硬门](../../../src/docs/platform_engineering/curriculum/14_ai/09_evaluation_data_engineering.md)

部署提案应画出授权/检索/推理/输出核证各自的容量与故障域，给出候选的队列上限、拒绝/超时语义、观察项和回退路径；具体阈值需用真实负载和故障演练决定。这里没有实际容量或部署结论。

## 七、观测卡要同时连资源、质量和用户结果

一次将来的真实实验应记录 `request_id`、actor 的**授权决策标识**而非私有正文、问题桶、资料/索引/提示/模型版本、路由决策、输入/输出 token、队列/prefill/decode/核证时延、缓存命中、流式状态、拒答/失败分类与最终业务结果。日志/指标/trace 各有用途；私有资料不能为了“可观测”写进无保护日志。[11.03 日志指标 Trace](../../../src/docs/platform_engineering/curriculum/11_reliability/03_logs_metrics_traces.md) · [Google ML：版本和切片监控](https://developers.google.com/machine-learning/crash-course/production-ml-systems/monitoring)

| 看板切片 | 资源/服务侧 | 用户/安全侧 |
|---|---|---|
| `q-01/q-02` 版本事实 | 检索/模型路由、缓存命中、TTFT | 现行 6 B 与 R9 未生效是否答对 |
| `q-03` 无权请求 | 授权检查/拒绝耗时 | 私有正文进入候选/提示/输出次数必须单列 |
| `q-04` 未定规则 | 是否错误路由到生成 | 正确说明未知而非编造 |
| 高并发长上下文 | 队列、token 数、KV 压力、尾时延 | 超时/拒答与有权成功任务比例 |

比较成本可先定义“**每个正确完成业务任务的资源或费用**”，分子说明模型调用、计算、人工复核等包含哪些项；分母包括满足门槛的有证据回答与正确拒答/未定，不把越权、错误事实或无故拒答算成功。没有价格和真实结果就不填数字。上线前可按相同题集、授权版本和负载形状做候选对照，记录回滚触发与负责人；14.12 将进一步讲数据/模型/提示版本、灰度和事件响应。本章只设计可检验的优化与部署方案。[Google ML：生产监控与数据切片](https://developers.google.com/machine-learning/crash-course/production-ml-systems/monitoring)

## 八、22 道分层练习：一张优化卡先审业务门

1–8 学指标，9–16 推演排队/缓存/流式，17–22 作部署取舍。所有答案都是虚构纸上判断，没有性能实测。

### 基础 1–8：指标与阶段

<details><summary>1. TTFT 含哪些不只是模型计算的阶段？</summary>

应用授权/检索、网络与排队等，还含 prefill；具体从哪个时点计量须写清。</details>

<details><summary>2. 总时延为何不能只等于 TTFT？</summary>

后续 decode、传输、引用与合同核证等还会消耗时间。</details>

<details><summary>3. 吞吐和单用户尾时延是同一指标吗？</summary>

不是；批量可提高总体吞吐，同时某些请求排队更久。</details>

<details><summary>4. `q-03` 应先路由给大模型读取私有资料吗？</summary>

不应；应用权限门可直接拒绝，无权正文不进模型。</details>

<details><summary>5. prefill 主要处理哪段，decode 主要处理哪段？</summary>

prefill 处理已有输入前缀，decode 随生成输出逐 token 继续。</details>

<details><summary>6. 14.04 的 2 KiB KV 算式能作真实显存报价吗？</summary>

不能；它是虚构两层玩具模型，真实模型结构、精度和并发需重算实测。</details>

<details><summary>7. 三类缓存分别缓存什么？</summary>

检索资料/候选、最终答案、模型输入前缀/KV；各自失效与权限条件不同。</details>

<details><summary>8. p95 时延是单次最慢请求吗？</summary>

不是；它是排序后约 95% 样本不超过的分位位置。</details>

### 推演 9–16：缓存、流式和过载

<details><summary>9. `q-01` 答案缓存只按问题文本命中有何风险？</summary>

资料状态变更后可能答旧版；不同 actor 的可读资料也可能不同。</details>

<details><summary>10. `u-a` 的私有前缀能复用给 `u-b` 提速吗？</summary>

不能；授权范围不匹配，可能泄露或产生跨租户侧信道。</details>

<details><summary>11. 流出首 token 就等于最终答案已验证吗？</summary>

不等于；引用、合同与权限检查可能还未完成。</details>

<details><summary>12. `q-01` 先流出“9 B”再更正，算安全流式吗？</summary>

不算；用户已看到错误现行主张，应先缓冲并核证。</details>

<details><summary>13. A 短输入长输出、B 长输入短输出，哪项资源压力不同？</summary>

A 增加 decode 步数，B 增加 prefill 输入和初始 KV；还要看排队与并发。</details>

<details><summary>14. 过载时 `q-02` 只能取到 r9，可直接答“已生效”吗？</summary>

不能；缺 current 对照，应说明证据不足或走保守路径。</details>

<details><summary>15. 缓存命中率高能单独证明优化成功吗？</summary>

不能；可能复用过期或无权内容，还需看业务结果、撤权和时延。</details>

<details><summary>16. 客户端取消流式读取能证明 IM 写动作被撤销吗？</summary>

不能；流式推理取消与 IM 副作用确认是不同边界。</details>

### 决策 17–22：质量、容量和部署

<details><summary>17. 小模型快但 q-02 错把 R9 当 current，可凭速度上线吗？</summary>

不能；现行/提议业务门失败，先修证据和路由。</details>

<details><summary>18. `q-03` 无权正文进入提示，其他五题全对能平均掉吗？</summary>

不能；权限是独立硬门，须单列并阻止交付。</details>

<details><summary>19. 批量提高 token 吞吐，下一步要核哪些用户指标？</summary>

按输入/输出和并发桶看 TTFT、p95 总时延、失败/拒绝、有权成功任务。</details>

<details><summary>20. 权限源不可用时可用旧答案缓存继续服务私有题吗？</summary>

不可无条件使用；无法确认当前权限时应保守拒绝/说明不可用。</details>

<details><summary>21. “每成功任务成本”分母应数哪类任务？</summary>

数有权且有证据的正确回答，也数按权限/未定规则正确停止的结果；排除越权、错误事实和无故拒答，分子范围要说明。</details>

<details><summary>22. 只有六题纸上结果，可写“支持生产千并发”吗？</summary>

不能；缺真实模型、硬件、负载形状、容量与故障测量。</details>

## 本章完成标准与后续路径

能用 `q-01…q-06` 写出质量硬门与基线，区分 TTFT/总时延/吞吐和输入输出 token 压力；能解释模型路由、批量、缓存、流式和过载降级各在何处可能破坏资料状态或权限，并给出未运行的测量/回退卡，才算完成本章。[14.11 微调与多模态选修](../../../src/docs/platform_engineering/curriculum/14_ai/11_finetuning_multimodal.md)按需求解释微调与多模态，14.12 再把版本、灰度、回滚和故障响应接成可持续交付流程。[第十四卷路线](../../../src/docs/platform_engineering/curriculum/14_ai/README.md)
