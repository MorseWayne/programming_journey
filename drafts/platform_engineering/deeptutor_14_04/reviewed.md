# 14.04 Transformer 与推理路径：注意力、prefill 和 KV 缓存怎样影响聊天

> DeepTutor 八节初稿经技术与教学审阅后的静态课程。向量、权重、窗口、缓存大小和时延均为**虚构纸上例子**；没有运行课程练习程序、Go/IM、模型、推理服务或站点。当前 S2 `/v1` 正文非空且最多 **6 UTF-8 B**、原始 HTTP 请求正文最多 **4096 B**、同 ID 重复 **409**、非成员隐藏 **404**、成功 `200 accepted_in_memory` 只表示本进程内存受理；未来 S3 `/v2` 的 `stored_in_teaching_db` 是提议且仍为 6 B，R9 6→9 B 待审。模型加速或注意力分数不能改变这些业务合同。[09.02 当前合同](../../../src/docs/platform_engineering/curriculum/09_backend_security/02_http_api_contract.md)

## 一、从一条有权问题看“应用 → 模型 → 用户”三道边界

14.09 已固定虚构 `q-01`：“当前 `/v1` 正文上限是多少？”；`q-03`：“`u-b` 能看 `doc-private` 吗？”前者应依据 current 资料答 **6 UTF-8 B**，后者应在应用侧根据 `scope=u-a-only` 拒绝，且不把私有正文送进提示。Transformer 只处理**已经给到它的 token 序列**；它不知道 Go/IM 应用是否已正确完成成员授权、资料版本过滤或事件送达。[14.09 问题与权限基线](../../../src/docs/platform_engineering/curriculum/14_ai/09_evaluation_data_engineering.md)

```text
用户身份/问题 → 应用权限与资料版本过滤 → tokenizer → Transformer 推理
             → 输出候选文字 → 应用核引用/合同 → 回答或正确拒答
```

本章关注中间的 Transformer 推理：token 怎样互相关联、为什么长输入与长输出消耗不同资源、KV cache 省了什么又占多少内存。**当前 S2 200 仍只是 IM 消息的内存受理**，并非模型把 `q-01` 答对，更非 B 设备 ACK。[14.03 模型/业务分层](../../../src/docs/platform_engineering/curriculum/14_ai/03_language_model_foundations.md)

## 二、Q、K、V 是一组匹配与取值操作，不是“可信度三票”

回想 14.02 的向量点积。一个注意力层可从 token 的当前表示分别变换出 **Query（Q，当前要找什么）**、**Key（K，某位置可供匹配的线索）**、**Value（V，被聚合的信息）**。Q 与各位置 K 算匹配分数，经过缩放、遮罩和 softmax 得权重，再对对应 V 做加权合成。**匹配权重高**只说明模型内部某位置影响较大，不表示该句是现行合同、有权资料或真实来源。[Vaswani 等：Attention Is All You Need](https://arxiv.org/abs/1706.03762) · [Hugging Face：Attention matrices](https://huggingface.co/docs/transformers/en/cache_explanation)

先做一张**不等于真实注意力算法**的手算卡：假设某步已经得到两个非负权重前数 `1` 与 `3`，仅按总和正规化为 `1/4=0.25`、`3/4=0.75`；若 `V1=(1,0)`、`V2=(0,2)`，聚合为 `0.25×(1,0)+0.75×(0,2)=(0.25,1.5)`。它只让初学者看懂“按权重取值”，数字与 `doc-current/doc-r9` 或任何模型参数都无关。

真实的**缩放点积注意力**是 `Attention(Q,K,V)=softmax(QKᵀ/√dₖ + M)V`：`dₖ` 是 Key/Query 的维度，`M` 用来屏蔽不准看的位置（被屏蔽者在 softmax 前给极低分），softmax 再把可见位置转换为总和为 1 的权重。上段的 `1:3` 简单除法**没有**计算 QKᵀ、缩放或 softmax，不能拿来声称真实模型算出了 0.25/0.75。[原始 Transformer 论文](https://arxiv.org/abs/1706.03762)

## 三、位置、因果遮罩、多头和多层各解决不同问题

只看 token 集合会丢掉顺序：“`u-b` **可以**看 `c-a`”与“`u-b` **不可以**看 `c-a`”表面用词接近，权限结论却相反。Transformer 通过某种**位置表示**把顺序带入计算；具体实现随模型架构变化，不能说所有模型都使用同一套绝对位置表。课程这里只需明白**词相同、顺序/前文不同，后续表示与预测可不同**。[原始论文：Positional Encoding](https://arxiv.org/abs/1706.03762) · [Google ML Crash Course：Transformers](https://developers.google.com/machine-learning/crash-course/llm/transformers)

本章聚焦生成式**自回归 decoder**：第 `t` 个位置的因果遮罩只允许它使用本位置和此前 token，不能偷看尚未生成的 `t+1`。但给定的提示前缀本身可以在 prefill 阶段按掩码并行处理。另有 encoder-only、encoder-decoder 等 Transformer 变体，注意力可见范围和任务不同；不能把“所有 Transformer 都只能看过去”当通则。[Google：Encoder/Decoder 变体](https://developers.google.com/machine-learning/crash-course/llm/transformers)

**多头**意味着模型可在若干不同投影空间里并行形成注意力，再组合结果；**多层**让后续层继续处理前层表示。不能硬给某个头贴“权限判官”、另一个头贴“R9 审批官”的标签，也不能因某个头关注 `doc-r9` 就说系统正确使用了 proposal 状态。实际层还包括前馈、残差/归一化等组件，本章只沿注意力与推理资源线索入门。[Google：Multi-head/Multi-layer](https://developers.google.com/machine-learning/crash-course/llm/transformers)

| 机制 | 可帮助模型处理 | **不能替代** |
|---|---|---|
| 位置表示 | token 顺序和相对/绝对位置关系 | 资料版本的生效决定 |
| 因果遮罩 | 生成位置不看未来 token | 文档 `access_scope` 和成员授权 |
| 多头/多层 | 组合不同模式/上下文关系 | 当前 6 B 合同的权威来源 |

## 四、prefill 与 decode 的时间线不同，不能只报一个“模型很快”

纸上请求先经**应用过滤**：`u-b` 的 `doc-private` 在进模型前就应被排除；`q-01` 若取证则要把 `doc-current` 的现行状态保留。随后 tokenizer 形成 ID 序列。**Prefill** 处理这批输入 token，建立后续推理要用的层内状态并得到首个输出 token 的预测；**decode** 则按前面已生成内容，一次产生后续 token（概念上逐 token），并更新缓存，直至停止/预算用尽。[Hugging Face：How caching works](https://huggingface.co/docs/transformers/en/cache_explanation)

```text
检索/授权/组装提示 → 分词 → prefill 输入 → 第一个输出 token
                              → decode 1 → decode 2 → … → 停止
```

每一步还要决定**选哪个输出 token**。模型给词表候选打分，形成下一 token 的概率；这与第二节“各输入位置如何聚合 Value”的注意力权重是两件事。假设纯玩具候选 A/B/C 的概率为 `0.6/0.3/0.1`：贪心选择会取 A，随机采样仍可能取 B 或 C。温度改变概率分布的尖锐程度，top-k 只保留前 k 个候选，top-p 保留累计概率达到阈值的一组候选，再在保留集合中选；具体组合与边界由推理实现决定。它们改变输出路径，不能把错误的 `doc-r9` 变成现行依据，也不能替代 `doc-private` 的访问控制。[Hugging Face：Generation strategies](https://huggingface.co/docs/transformers/generation_strategies)

因此**首 token 时间（TTFT）**含应用检索/权限、排队、网络和 prefill 等，后续**输出 token 速率**主要受 decode、并发/缓存与硬件/服务实现影响；总时延还含输出长度。长会话资料可能增加 prefill 和缓存占用，要求长篇回答会延长 decode。数字需要具体模型、硬件、并发、提示和测量窗口才能比较；本章没有性能数据，不能由“缓存开启”推更好用户结果。[Hugging Face：Continuous batching](https://huggingface.co/docs/transformers/en/continuous_batching)

## 五、KV cache 避免重复算旧 K/V，也会按长度与并发占内存

自回归生成下一 token 时，旧 token 的 **Key/Value** 可以缓存起来，不必每一步重新为全部旧位置生成 K/V；新 token 仍须形成自己的 Q/K/V，并对允许的历史位置做相关计算。缓存通常按**层**保存，长度与并发增长会占用内存。它是推理优化，**不是**永久聊天记忆、数据库历史、权限缓存或设备收到消息的证据。[Hugging Face：KV cache 原理](https://huggingface.co/docs/transformers/en/cache_explanation) · [Cache strategies](https://huggingface.co/docs/transformers/en/kv_cache)

用一个**不对应任何现成模型**的完整序列估算：假设 **2 层、每层 2 个 KV 头、每头 4 个数、32 个已缓存 token、每个数 2 B、1 条并发序列**，并假设 K/V 各存一份、全长保留、没有分页/压缩/共享/滑窗，则 `2 份（K、V）×2 层×2 KV头×4×32×2 B=2,048 B=2 KiB`。若 **10 条互不共享**且同样长度的并发序列，纯该项约 **20 KiB**。这只是一项 KV 数据量，不含模型权重、其它激活、分配碎片或服务缓冲。[Hugging Face：Cache storage shape](https://huggingface.co/docs/transformers/en/cache_explanation)

真实模型可能用不同 KV 头数、头维度、数值精度、分组查询注意力、滑动窗口、分页或量化缓存，因此纸上 2 KiB **不能当任何产品配置或显存报价**。资料长度翻倍、并发更多时先重算；把“长会话”“输出很多字”“同时十人问”都称为“请求数”会遗漏不同资源压力。[Hugging Face：Cache strategies](https://huggingface.co/docs/transformers/en/kv_cache)

如果将来做前缀缓存复用，缓存内容必须与模型/tokenizer/提示/资料版本及**授权上下文**一致；不能把包含 `u-a` 私有资料的前缀直接复用给 `u-b`。这不是说 KV cache 本身会替系统做授权，而是复用决策依然受应用权限约束。资料被撤权或更新后也不能凭旧缓存宣称当前证据仍有效。[14.09 权限硬门](../../../src/docs/platform_engineering/curriculum/14_ai/09_evaluation_data_engineering.md)

## 六、长上下文易丢限定词，注意力不能修复错误资料选择

14.03 的**玩具预算**：一次窗口 32 token，指令占 6、经授权证据占 18、问题占 4，忽略所有特殊标记和接口开销，理想输出余 **4 token**。若多塞一份 `doc-r9`、长聊天或来源标题，系统可能拒绝、截断或压缩。恰好删掉“R9 **尚待审**”而保留“9 B”，模型就可能流畅答错 `q-01`；删掉文档版本或权限标记也会让引用不可审。[14.03 上下文预算](../../../src/docs/platform_engineering/curriculum/14_ai/03_language_model_foundations.md)

增加窗口并不等于“把所有旧消息放进去就安全”。当前 S2 内存受理没有跨重启权威历史；未来 S3 若获批，DB 保留与历史成员授权仍须由应用决定。资料助手应先选择有权、现行、与问题有关的片段；缺关键证据时明确不足/拒答，而不是让注意力权重把不完整资料“补成事实”。`q-03` 即便私有文档与问题高度相关，`u-b` 也不能先把它送进 prefill 再靠提示要求不泄露。[14.09 `q-01/q-03` 基线](../../../src/docs/platform_engineering/curriculum/14_ai/09_evaluation_data_engineering.md) · [09.07 应用授权](../../../src/docs/platform_engineering/curriculum/09_backend_security/07_authentication_authorization.md)

| 故障表象 | 第一个应查的边界 | 不能误判为 |
|---|---|---|
| q-01 答“9 B” | current/proposed 资料过滤与截断内容 | 注意力头“没有学会合同”必然是根因 |
| u-b 的提示含 `doc-private` | 应用资料授权和缓存复用键 | 输出最后没引用就算安全 |
| 首 token 慢 | 应用检索/排队/网络/pre-fill 分段测量 | 必定是 KV cache 太小 |
| 长答逐字慢 | decode token 数、并发与服务限制 | 多部署 gateway 就能加速模型 |

## 七、资源卡与用户验收卡要放在一起

未来若真做推理性能实验，记录模型/tokenizer/提示/资料/权限版本，输入与输出 token 数、prefill/decode/端到端时间、TTFT、并发、KV 结构与缓存复用条件、失败/拒答，并与 14.09 同一组 `q-01…q-06` 和关键词基线对照。若 q-01 更快但答 9 B，或 q-03 更快却暴露 `doc-private`，优化不算通过。[14.09 组件与业务评测](../../../src/docs/platform_engineering/curriculum/14_ai/09_evaluation_data_engineering.md)

| 观察项 | 回答什么 | 本章状态 |
|---|---|---|
| Prompt/output token 与阶段时延 | 是长输入、长输出、排队还是应用前处理？ | 只列未来测量方法，无实测 |
| KV 长度/并发/结构 | 哪项推理内存随请求变化？ | 只有 2 KiB/20 KiB 玩具算式 |
| q-01/q-03 的用户结果 | 现行合同是否正确、私有资料是否被拒绝？ | 只有纸上标签和停止门 |
| 引用/拒答 | 每个关键主张是否有权且被现行资料支持？ | 待学习者后续评测 |

Transformer 机制说明**为什么某些候选实现会快/慢、为何上下文会影响输出**，并不能凭机制图预测某个真实模型的吞吐、正确率或成本。评价仍要以固定业务问题、权限、来源和实际观察为准。[Google：Transformer 入门](https://developers.google.com/machine-learning/crash-course/llm/transformers)

## 八、22 道分层练习：从两个 Value 手算到缓存边界

先辨 Q/K/V、位置与遮罩，再算纸上权重和 KV，最后回答有权资料与延迟的取舍。答案均基于虚构模型。

### 基础 1–8：注意力和序列

<details><summary>1. Q、K、V 可先各理解为什么？</summary>

Q 表当前匹配需求，K 表各位置可匹配线索，V 表被权重聚合的内容；都不是权限证明。</details>

<details><summary>2. 注意力权重高就表示资料真实/有权吗？</summary>

不表示；真实性与授权需应用和资料来源核对。</details>

<details><summary>3. 为什么要给 token 顺序/位置信息？</summary>

同样 token 以不同顺序出现可能改变含义，只看无序集合不够。</details>

<details><summary>4. 因果 decoder 的第 t 位可看未来 t+1 吗？</summary>

不可；它只用本位及以前位置，生成下一 token 时未来尚不存在。</details>

<details><summary>5. 所有 Transformer 都是因果 decoder-only 吗？</summary>

不是，还有 encoder-only、encoder-decoder 等变体。</details>

<details><summary>6. 一个注意力头可被硬称为“权限判官”吗？</summary>

不能。头可学不同关系，但访问许可由应用策略决定。</details>

<details><summary>7. prefill 和 decode 各主要处理哪段？</summary>

prefill 处理给定输入并建后续状态；decode 随输出逐 token 继续预测/更新。</details>

<details><summary>8. KV cache 是持久 IM 历史库吗？</summary>

不是，只是推理时复用过去 token 的 K/V 计算状态。</details>

### 推演 9–16：权重、窗口与资源

<details><summary>9. 纸上前数 1:3 简单正规化成什么？</summary>

`0.25:0.75`；不是完整 Transformer softmax 算法。</details>

<details><summary>10. V1=(1,0)、V2=(0,2) 按 0.25/0.75 聚合得什么？</summary>

`(0.25,1.5)`。</details>

<details><summary>11. 真实缩放点积注意力在 QKᵀ 后还有什么？</summary>

按 Key 维度缩放、遮罩、softmax，再对 V 加权。</details>

<details><summary>12. 32 token 窗口、指令6/证据18/问题4，理想余多少输出？</summary>

`32−6−18−4=4`，真实接口另计特殊标记等开销。</details>

<details><summary>13. 纸上 2 层×2 KV头×4维×32 token×2 B×K/V 两份，占多少？</summary>

`2×2×2×4×32×2=2,048 B=2 KiB`，仅该项 toy 缓存。</details>

<details><summary>14. 同样独立序列并发 10 条，纸上这项约多少？</summary>

约 20 KiB，不含模型权重/碎片/其它激活。</details>

<details><summary>15. 更长输入主要先增加哪个阶段的工作？</summary>

更长的授权/分词/prefill 输入与 KV 长度；实际 TTFT 还受排队/网络影响。</details>

<details><summary>16. 输出从 4 token 改很长，哪个阶段持续增加？</summary>

逐 token 的 decode 工作和 KV 长度；总时延需实测。</details>

### 决策 17–22：权限、缓存与验收

<details><summary>17. 可把含 u-a 私有文档的缓存前缀复用给 u-b 吗？</summary>

不能。模型/提示/资料版本和授权上下文必须匹配，资料进入模型前先过滤。</details>

<details><summary>18. q-01 答 9 B，先怪某个注意力头吗？</summary>

先核 current/proposed 资料状态、截断是否丢“待审”、引用与现行 6 B 合同。</details>

<details><summary>19. q-03 私有正文已进提示但输出未引用，权限门过了吗？</summary>

没有。无权资料进入模型输入时硬门已失败。</details>

<details><summary>20. 首 token 慢可只归因 KV cache 吗？</summary>

不可。拆应用检索/授权、排队/网络、prefill 与模型服务观察。</details>

<details><summary>21. 纸上 2 KiB 能当真实模型 KV 内存配置吗？</summary>

不能；头数/层数/精度/滑窗/分页/并发和其它内存均未测。</details>

<details><summary>22. 推理资源卡与用户验收卡为何要一起看？</summary>

更快/更省若答错当前 6 B 或泄私有资料，就没有达到资料助手的业务目标。</details>

## 本章完成标准与后续路径

能用两份 Value 算出纸上聚合 `(0.25,1.5)`，说明它与真实 scaled-dot-product/softmax 的区别；能区分位置、因果遮罩、prefill、decode、KV cache 和业务权限，手算 2 KiB toy 缓存而不冒充实测，才算完成第一轮。下一章 14.05 将把指令、示例、上下文和结构化输出接到固定的 `q-01…q-06` 问题集。
