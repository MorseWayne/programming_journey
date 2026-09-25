# 14.06 检索与索引：从资料切分到有权证据

> 本章是面向 Go 初学者的静态检索课。先会 14.02 的向量/余弦、14.03 的 token 区别、14.09 前四节的六道虚构资料问题，再从文档切分和倒排索引进入向量、近似邻居、混合检索和授权版本。示例词项、向量、名次和结果全部为**人工纸上材料**，没有运行索引、模型、数据库或 IM 服务。当前 S2 `/v1` 正文非空且最多 **6 UTF-8 B**、原始 HTTP 请求正文最多 **4096 B**、同 ID 重复 **409**、非成员隐藏 **404**、成功 `200 accepted_in_memory` 只到本进程内存受理；未来 S3 `/v2` `stored_in_teaching_db` 是提议且仍为 6 B，R9 6→9 B 待审。[09.02 当前合同](../../../src/docs/platform_engineering/curriculum/09_backend_security/02_http_api_contract.md)

## 一、检索要交付的是有权证据，不只是“相似文本”

14.05 假定应用已把允许的证据交给提示。现在补上**证据如何找到**。用户 `u-a` 问 `q-01`“当前 `/v1` 正文上限？”：`doc-current` 和 `doc-r9` 都含“正文”“上限”，后者还写 9 B，却是 `status=proposed`。若只看词匹配或向量距离，就可能把提议排在前面。`u-b` 问 `q-03` 的私有内容，则 `doc-private(scope=u-a-only)` 根本不应成为可交付候选。检索的目标是按身份、状态、问题找到**可读且足以支持主张**的资料，而不是返回一个大分数。[14.09 六题金标签](../../../src/docs/platform_engineering/curriculum/14_ai/09_evaluation_data_engineering.md)

```text
资料原文 → 标来源/版本/权限 → 切分 → 建词项和向量索引
用户身份/问题 → 访问与状态约束 → 词项/向量候选 → 合并/重排
             → 再核访问与原文 → 有权证据或拒绝/不足
```

这里的“检索”只找候选和证据，不决定 IM 消息是否存库、设备是否 ACK、退群历史规则是否批准。`q-04` 本来没有已批准规则，索引再快也不会凭空产生合法答案；`q-05` 的 S2 200 也不能因搜到“消息成功”就变成送达。[14.05 输出契约](../../../src/docs/platform_engineering/curriculum/14_ai/05_prompt_structured_output.md)

## 二、先确定文档单位，再决定如何切分

检索前先定“**一条可引用资料**”是什么。四份虚构记录各保留 `document_id`、来源、`version`、`status=current/proposed`、`access_scope`、生效时间/废止时间和正文散列；切出来的每个片段再有稳定的 `chunk_id`、父文档 ID、起止位置与切分器版本。这样命中片段后才能回到**哪份原文的哪一段**核证，也能在资料改版时找出应撤掉的旧片段。[《信息检索导论》：文档单位与分词](https://nlp.stanford.edu/IR-book/html/htmledition/the-term-vocabulary-and-postings-lists-1.html) · [14.01 来源 manifest](../../../src/docs/platform_engineering/curriculum/14_ai/01_python_data_work.md)

```text
doc-current@v1 [current, public]
  c-current-1：/v1 正文非空、最多 6 UTF-8 B；请求体最多 4096 B。
  c-current-2：同 ID 重复 409；非成员隐藏 404；200 仅内存受理。
doc-r9@draft [proposed, public]
  c-r9-1：R9 建议把正文上限从 6 B 改为 9 B；尚待审。
doc-private@v1 [current, u-a-only]
  c-private-1：正文省略；u-b 不得检索或进入模型。
```

这是**纸上切分**，不是资料系统的实际记录。按固定字符数截取虽容易，却可能把 `c-r9-1` 的“**尚待审**”截掉，只留下“9 B”；过小片段丢限定词，过大片段使无关文字占上下文。可以按标题/段落/句子等边界切，再按模型输入预算限制大小，必要时少量重叠，但要避免重叠片段在排名中反复挤占名额。无论怎样切，`status` 和 `access_scope` 应作为**结构化元数据**随每个片段或其父文档可查，不能指望文本里刚好写着“待审”。[《信息检索导论》：文档单位](https://nlp.stanford.edu/IR-book/html/htmledition/the-term-vocabulary-and-postings-lists-1.html)

切分改变后，同一文档可能产生不同 `chunk_id` 与排名；资料撤权/更新后，旧索引、缓存和引用也要能失效。片段保留来源可查并不自动意味着其内容现行或有权；应用在查询和交付时仍要用**当前权威元数据**核对。

## 三、倒排索引让词项检索可解释，BM25 也不懂“待审”

把文字分成可索引的**词项**，为每个词项保存出现过的文档/片段 ID 列表，这叫**倒排索引**。例如纸上词项表：

| 词项 | posting list：包含它的片段 |
|---|---|
| `正文` | `c-current-1`, `c-r9-1` |
| `上限` | `c-current-1`, `c-r9-1` |
| `6 B` | `c-current-1`, `c-r9-1` |
| `9 B` | `c-r9-1` |
| `待审` | `c-r9-1` |
| `内存受理` | `c-current-2` |

查询“正文上限”时可查词项的 posting list 并合并候选；相同词在长短文中出现的次数、全库有多少文档包含它，也可帮助排序。**BM25** 是常见词项排名模型，它考虑词频、文档频率和长度，能让词项检索比简单“出现就加一分”更稳；它的分数仍是**相关性排序线索**，不验证生效状态、引用是否支持结论或用户权限。[《信息检索导论》：倒排表](https://nlp.stanford.edu/IR-book/html/htmledition/a-first-take-at-building-an-inverted-index-1.html) · [BM25 讲解](https://nlp.stanford.edu/IR-book/html/htmledition/okapi-bm25-a-non-binary-model-1.html)

若问题要求同时出现“正文”和“6 B”，可先对两个 posting list 求**交集**；只要出现任一词就取**并集**。这是找候选，不是确定答案。“正文上限”这种短语还可能要求词的位置与顺序，单有“出现在哪个片段”无法证明两词相邻；需要位置表或回读原文。这个区别解释了为什么词项命中率、短语匹配与引用支撑不能混为一谈。[《信息检索导论》：位置倒排](https://nlp.stanford.edu/IR-book/html/htmledition/positional-indexes-1.html)

直观地看：在大量文档都出现的“消息”通常不如少见的 `accepted_in_memory` 能区分候选；同一个词出现两次可能比一次更相关，但重复一百次不应机械得到一百倍；很长的片段也不能只因容纳了更多词就无条件占优。这对应**逆文档频率、词频饱和和长度归一化**三种作用。具体 BM25 公式与参数实现会影响名次，本章先要求能解释它们为何存在；调参必须在固定问题和资料版本上观察，不能让权重替代 current/proposed 规则。[《信息检索导论》：BM25](https://nlp.stanford.edu/IR-book/html/htmledition/okapi-bm25-a-non-binary-model-1.html)

中文如何切词、大小写/标点/字节单位如何正规化，都影响词项表。`6 UTF-8 B` 与“六字节”也未必被同一套分析器自动视作相同；文档端和查询端的处理方式要有版本并保持一致。课程的表只是**预先指定词项**的简化模型，不暗示真实中文搜索引擎会产生这些精确 posting。[《信息检索导论》：分词与正规化](https://nlp.stanford.edu/IR-book/html/htmledition/tokenization-1.html)

对 `q-01`，若 `c-r9-1` 排得比 `c-current-1` 高，第一步先核 `status=proposed` 是否被误当现行、是否漏了当前片段，而不是机械调 BM25 参数。对 `q-02`，问题正问 R9 是否生效，**当前片段和提议片段都可能需要**，但必须带状态解释。排名前的合法候选集合取决于问题意图和资料状态；状态过滤不能简单写成“所有问题一律排除 proposed”。[14.09 current/proposed 标签](../../../src/docs/platform_engineering/curriculum/14_ai/09_evaluation_data_engineering.md)

## 四、向量检索找语义近邻，但近邻未必是可用证据

14.02 已把**嵌入向量**当成把文本映射到数字空间的表示，并手算过余弦。给每个片段和问题用**同一兼容的嵌入模型/版本**得到固定维度向量；查询时按余弦、点积或距离找最近候选。度量方式和向量正规化必须配套，不能把某个模型的距离分数与另一模型或 BM25 原分直接比较。Faiss 的官方说明把它定义为固定维度向量上的近邻搜索；不同索引和距离各有假设。[Faiss：相似检索与索引](https://github.com/facebookresearch/faiss/wiki) · [14.02 余弦](../../../src/docs/platform_engineering/curriculum/14_ai/02_math_ml_intuition.md)

纸上造一个**与真实模型无关**的二维例子：问题 `q=(1,0)`，`c-current-1=(0.8,0.6)`，`c-r9-1=(1,0)`。三者长度都是 1，于是与 q 的余弦分别是 **0.8** 和 **1.0**。向量路径会更偏向 `c-r9-1`，但它仍为 `proposed`，不能答“当前 9 B”。若私有片段恰好更近，距离也不会授予 `u-b` 权限。**相似、相关、可读、现行、能支持主张**是五道不同判断。

**精确近邻**可以在很小集合中逐个比较；数据大时可用近似近邻（ANN）索引减少搜索工作，但可能漏掉真正的最近项。HNSW 是基于分层邻居图的一类方法：从较高层逐步导航到更近候选。它是速度、内存、建索引成本和召回之间的取舍，不保证每次都找全。[HNSW 原论文](https://arxiv.org/abs/1603.09320) · [Faiss：索引选择](https://github.com/facebookresearch/faiss/wiki/Guidelines-to-choose-an-index)

对课堂四份文档，ANN 没有可证明收益；未来真扩容才比较**相同过滤条件下**的精确与近似候选、召回与延迟。向量模型或维度一变，旧索引可能不兼容，需要记录版本并重新生成；不能仅改查询侧模型后沿用旧片段向量。

## 五、混合检索和重排解决覆盖与排序，仍需业务硬门

词项路径对精确编号、`409`、`6 B` 等字面线索有用；向量路径可能捞到改写表达。**混合检索**取两路候选并合并，**重排**则在已得到的少量候选上用额外规则或模型重新比较。可用 RRF（Reciprocal Rank Fusion）示意**按名次**合并：每路中第 `r` 名贡献 `1/(k+r)`，两路贡献相加；`k` 是选定常数，与“取 top k 个片段”的 k 不是同一个参数。RRF 不要求 BM25 分和向量距离落在同一数字尺度，但融合结果仍可能把提议资料排第一。[Elasticsearch：RRF 原理与公式](https://www.elastic.co/docs/reference/elasticsearch/rest-apis/reciprocal-rank-fusion)

| 纸上候选 | 词项名次 | 向量名次 | 对 `q-01` 的最终业务判断 |
|---|---:|---:|---|
| `c-current-1` | 1 | 2 | current、公开，可核 6 B |
| `c-r9-1` | 2 | 1 | proposed，可用于解释 R9，不能作当前 9 B 依据 |

若纸上取 `k=60`，两者贡献都为 `1/61+1/62`，**恰好打平**；这不是融合算法“知道两份资料一样可信”，而是人工排名对称。实际还须固定并列排序规则、候选窗口与各路版本。重排器即使偏爱措辞更像问题的 `c-r9-1`，应用也不能省去 status 与原文核证。引入额外模型还增加费用/延迟并可能带来新错误；是否比 14.09 关键词基线更好要按同一六题和更多未见集比较。[Elasticsearch：RRF](https://www.elastic.co/docs/reference/elasticsearch/rest-apis/reciprocal-rank-fusion) · [14.09 基线](../../../src/docs/platform_engineering/curriculum/14_ai/09_evaluation_data_engineering.md)

## 六、权限和版本要影响候选产生，也要在交付前复核

**查询前**先确定 actor 能访问哪些文档，再让索引在可用范围内找候选；**交付前**再查权威权限与文档状态，防止索引滞后、权限撤销或候选融合/重排漏带元数据。对 `u-b`，`doc-private` 不应进入可见结果、提示或日志正文。若某搜索实现只能先取全库 top2、随后才删无权片段，可能出现“全库两条都无权，删完只剩 0 条，虽然库里另有可读片段”的**候选饥饿**；后过滤仍必须保证无权内容不外泄。具体引擎的前过滤能力与 ANN 召回行为需要按其文档验证，不能以“有 filter 字段”推断所有路径等价。[Elasticsearch：kNN 前/后过滤](https://www.elastic.co/docs/reference/query-languages/query-dsl/query-dsl-knn-query)

`q-01` 只要 current 答案，不应把 `doc-r9` 的 proposed 数值当现行；`q-02` 同时需要 current/proposed 说明“未生效”。`q-03` 的拒绝可由应用权限元数据直接完成，**不需要检索私有正文**；`q-04` 没有已批准的退群历史规则，返回空候选或类似文档时应说明未知。查询条件因此包含**身份、问题意图、资料版本/状态和适用时间**，不能只从文本猜。权限/状态元数据不应由模型生成的建议覆盖。[09.07 访问控制](../../../src/docs/platform_engineering/curriculum/09_backend_security/07_authentication_authorization.md) · [14.09 六题](../../../src/docs/platform_engineering/curriculum/14_ai/09_evaluation_data_engineering.md)

建索引时如果漏写 scope，查询时就无从正确过滤；资料撤权/更新后如果只刷新主数据库、不刷新索引和缓存，可能回出过期片段。需保留 `document_id/chunk_id`、来源版本、切分器/分析器/嵌入模型版本、索引构建时间和撤销记录，让应用能追溯并做失效/重建。学习者在纸上审这些字段即可，本章不建生产索引。

## 七、把索引质量拆为召回、授权、引用和用户结果

检索实验的输入应沿用 14.09 的 `q-01…q-06` 与权限/版本标签，先跑可解释关键词基线，再比较词项排名、向量、混合与重排。记录每题每路的**候选 ID、名次、score 的含义、过滤原因、片段来源及是否进入提示**。召回计算只放入有预先可访问金证据的问题；`q-03` 是权限拒绝、`q-04` 是规则未定，不把它们当“漏检”来改分母。`q-02` 需要 current 和 proposed **两份**，只找回其中一份不算完整证据召回。[14.09 Recall@k 分母](../../../src/docs/platform_engineering/curriculum/14_ai/09_evaluation_data_engineering.md)

| 失败表象 | 先查哪一层 | 不应怎样解释 |
|---|---|---|
| `q-01` 命中 r9、漏 current | 状态过滤、切分、词项/向量候选 | “模型不会算 6”必是根因 |
| `q-02` 只见 current | 提议片段是否允许、候选窗口 | “找回一份文档就够” |
| `q-03` 私有片段进入提示 | 索引 scope、查询过滤、融合/重排交接 | 最后没引用就算安全 |
| `q-06` 命中 doc-history | 片段是否支撑“不能仅凭 24h broker” | 有命中就可保证 25h 补齐 |

**候选召回**不等于**引用支撑**：片段存在、排得高，还要确认答案每个关键主张是否由现行且有权原文支持。**索引吞吐/延迟**也不等于用户成功率。若后续使用生成器，14.07 才把检索、上下文组装和回答连成 RAG；在本章交接的是可追溯片段与失败原因。[14.09 组件与端到端](../../../src/docs/platform_engineering/curriculum/14_ai/09_evaluation_data_engineering.md)

## 八、22 道分层练习：手排候选，先找第一道坏边界

先做 1–8 的资料/索引概念，再做 9–16 的纸上排名，最后做 17–22 的权限与评测决策。

### 基础 1–8：资料与两类索引

<details><summary>1. 一条可引用片段至少要能追到哪些信息？</summary>

父文档、稳定片段 ID、原文位置、来源/版本/状态和权限范围。</details>

<details><summary>2. 为何不能只截取“9 B”而丢“尚待审”？</summary>

限定词丢失会把 proposed 错当现行，`q-01` 可能答错。</details>

<details><summary>3. 倒排索引的 posting list 保存什么？</summary>

某词项出现在哪些文档/片段；也可含位置等信息。</details>

<details><summary>4. `正文` 的纸上 posting list 有哪两个片段？</summary>

`c-current-1` 与 `c-r9-1`。</details>

<details><summary>5. BM25 分数能证明某资料已生效吗？</summary>

不能。它是词项相关性排序线索，不是状态/权限/事实校验。</details>

<details><summary>6. 向量检索的片段和问题为何需要兼容模型/维度？</summary>

距离只在同一可比表示空间与匹配度量下有意义。</details>

<details><summary>7. ANN 与精确逐个比较的主要取舍是什么？</summary>

ANN 用更少搜索工作换取速度/容量，但可能漏真正近邻，还需评估内存与建索引成本。</details>

<details><summary>8. 重排器处理的是全部原始资料吗？</summary>

通常处理已召回的候选；第一阶段没召回的金证据，后续重排也无法找回。</details>

### 推演 9–16：从余弦到混合结果

<details><summary>9. q=(1,0)、current=(0.8,0.6) 的余弦是多少？</summary>

两向量长度为 1，点积为 0.8，余弦为 **0.8**。</details>

<details><summary>10. 同一 q 与 r9=(1,0) 的余弦是多少，能因此答当前 9 B 吗？</summary>

余弦为 **1.0**；仍不能，因为 r9 是 proposed。</details>

<details><summary>11. RRF 中两路第 1/2 名，取 k=60，总贡献是多少？</summary>

`1/(60+1)+1/(60+2)=1/61+1/62`，约 `0.03252`；这是排名合并值，不是可信度。</details>

<details><summary>12. 表中 current 与 r9 的 RRF 谁更高？</summary>

两者都是一条路径第 1、另一条第 2，纸上打平；需要固定并列规则和业务状态核证。</details>

<details><summary>13. 查询词与文档词正规化不一致可能怎样？</summary>

本可命中的表达被拆成不同词项而漏检；需记录并统一分析器版本。</details>

<details><summary>14. `q-02` 只召回 `doc-r9`，足以答是否生效吗？</summary>

不足；需要 `doc-current` 与 `doc-r9` 的状态对照。</details>

<details><summary>15. 全库 top2 都无权、后过滤删光，说明库里必无可读资料吗？</summary>

不说明；可读片段可能被全库 top2 挤出，需考虑前过滤与候选窗口，同时绝不交付无权内容。</details>

<details><summary>16. 分块改版后可直接沿用旧 chunk_id 和旧引用吗？</summary>

不能假定；要核新位置、来源与版本，必要时重建索引及引用映射。</details>

### 决策 17–22：权限、版本与用户验收

<details><summary>17. `u-b` 的 q-03 要先检索私有正文再让模型拒绝吗？</summary>

不要。应用先用权限元数据拒绝，无权正文不进入候选、提示或输出。</details>

<details><summary>18. `q-01` 与 `q-02` 可统一排除 proposed 资料吗？</summary>

不能。q-01 不能用 proposed 作当前依据；q-02 正要比较提议与现行，但要保留状态。</details>

<details><summary>19. 索引中的 scope 比当前权威资料旧时，以谁为准？</summary>

以当前权威权限为准；交付前再校验并推动索引/缓存失效。</details>

<details><summary>20. `q-03/q-04` 能纳入“有可读金证据”的 Recall@k 分母吗？</summary>

不能。前者是拒权门，后者规则未定；它们仍须单独评估业务结果。</details>

<details><summary>21. 命中 `doc-history` 就能答“24h broker 保证补齐 25h 离线”吗？</summary>

不能；该资料支持的是**不能仅凭 broker 保证**，未来 DB 还要真实保留且有权读取。</details>

<details><summary>22. 新向量/混合检索比关键词基线快，应直接替换吗？</summary>

不能只看快；同条件检查有权召回、状态、引用、拒答、用户结果及成本。</details>

## 本章完成标准与后续路径

能从四份虚构资料写出片段元数据与小倒排表，手算余弦和 RRF 纸上排名，解释为何 `q-01` 的高分 r9 仍不能当现行证据；能区分查询前/交付前权限检查、候选饥饿、状态与引用，才算完成本章。下一章 14.07 再把检索证据接入生成与引用链。[第十四卷路线](../../../src/docs/platform_engineering/curriculum/14_ai/README.md)
