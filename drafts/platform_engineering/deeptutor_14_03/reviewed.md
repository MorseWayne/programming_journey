# 14.03 语言模型基础：会生成下一词为什么仍可能答错 IM 合同

> DeepTutor 八节初稿经技术与教学审阅后的静态课程。token、分布、窗口、资料与回答全是**虚构教学例子**，没有运行 Python/Go/IM、调用模型、训练或站点。当前 S2 `/v1` 正文非空且最多 **6 UTF-8 B**、原始 HTTP 请求正文最多 **4096 B**、同 ID 重复 **409**、非成员隐藏 **404**、成功 `200 accepted_in_memory` 只代表本进程内存受理。未来 S3 `/v2` 的 `stored_in_teaching_db` 是提议且仍为 6 B，R9 6→9 B 待审。模型生成的文字不能升级这些业务承诺。[09.02 当前合同](../../../src/docs/platform_engineering/curriculum/09_backend_security/02_http_api_contract.md)

## 一、语言模型预测文本，IM 系统确认的是用户行为

14.01 建立虚构数据来源，14.02 手算向量/概率。本章的**语言模型**可先理解为：根据已经给出的 token 序列，估计后续 token 的条件分布，再按某种解码规则不断选取，组成文字。它能写出流畅答案，是因为学到了序列模式；**流畅不等于已查到当前资料，更不等于拥有会话权限**。[Google ML Crash Course：Language Model](https://developers.google.com/machine-learning/crash-course/llm)

| 用户看到的东西 | 谁应给证据 | 本章不能混成 |
|---|---|---|
| 模型回答“正文上限 6 B” | 当前 `/v1` 合同及对应资料版本 | 模型下一 token 概率本身证明合同 |
| A 发消息拿 `200 accepted_in_memory` | Go/IM 现行请求处理 | 模型答对问题或 B 设备收到 |
| 未来 `/v2` 拟称 DB stored | 经批准的权威 DB 写入证据 | token 生成完成即持久化 |
| B 是否能读某资料 | 应用身份、成员/资料 `access_scope` | 相似度高或模型说“可以” |

本章聚焦**生成式、按前文预测后续 token**的直觉；并非所有机器学习模型或语言模型都用完全相同的任务、分词器和结构。Transformer 内部怎样让 token 互相关联在 14.04 细讲，检索与 RAG 在 14.06–14.07 细讲。[本卷顺序](../../../src/docs/platform_engineering/curriculum/14_ai/README.md)

## 二、token 不是字符、词，也不等于 UTF-8 字节

文本先经过与模型配套的**tokenizer**转为 token ID 序列。token 可以对应一个词、词的一部分、标点或其它片段；切分取决于分词器和其版本。模型不是直接在原始 UTF-8 字节或 Python `str` 字符上“按字猜下一字”。输入/输出能否还原、特殊标记怎样处理，都要按实际模型与 tokenizer 说明。[Hugging Face：Tokenizers](https://huggingface.co/learn/llm-course/chapter2/4) · [Google：Tokens](https://developers.google.com/machine-learning/crash-course/llm)

同一示例文字 `"你好"` 在 Python 中 `len("你好")=2` 个字符，UTF-8 编码占 **6 B**，因此可作为当前 `/v1` 正文上限的纸上样例。但它对某个真实语言模型究竟是 **1、2 或更多 token**，本章没有固定 tokenizer，**不能推算**。`R9` 若将来改变消息正文上限，也不能由“模型只需几个 token”替代 HTTP 的 UTF-8 字节合同。[14.01 字节校验](../../../src/docs/platform_engineering/curriculum/14_ai/01_python_data_work.md)

| 单位 | 回答什么问题 | `"你好"` 本章可确定吗？ |
|---|---|---|
| 字符/代码点计数 | Python 文本长度 | 本示例为 2 |
| UTF-8 字节数 | 当前 IM 正文/请求字段编码边界 | 本示例为 6 B |
| 模型 token 数 | 某个 tokenizer 如何切成 ID | **未知**，需固定版本实际检查 |
| 上下文 token 预算 | 一次模型请求可容纳的 ID 总量 | **未知**，需具体模型/接口说明 |

若将来模型、tokenizer 或序列化模板版本改变，即使用户看到同一行文字，token 数和可容纳资料量也可能变化。因此数据/模型/提示版本都要记录，而不是从 6 B 推“必定只有一个 token”。[Hugging Face：分词器与模型配套](https://huggingface.co/learn/llm-course/chapter2/4)

## 三、embedding 是学习的表示，14.02 的二维数只是手算尺子

模型可将 token ID 映射到训练中学到的**向量表示**，并利用序列位置和周围上下文处理后续预测。14.02 的 `q=(1,0)`、`d1=(1,1)` 是我们手写的“字节限制/权限”两个特征，不是模型训练出来的 embedding；不能拿其余弦 0.707 当真实聊天内容的“语义相关度”或权限置信度。[Google：Embeddings](https://developers.google.com/machine-learning/crash-course/embeddings) · [14.02 人工向量](../../../src/docs/platform_engineering/curriculum/14_ai/02_math_ml_intuition.md)

还要分清**生成模型内部的 token 表示**与**检索系统为整段资料算的文档向量**：它们可能来自不同模型、维度、训练目标和版本，不能默认放进同一个向量空间直接做余弦。未来若为资料助手建索引，必须固定向量生成器、资料版本、分块/访问范围和索引版本，并证明模型回答引用了实际有权资料；本章不生成任何向量库。[Google：Obtaining Embeddings](https://developers.google.com/machine-learning/crash-course/embeddings/obtaining-embeddings)

序列**顺序**同样重要：`“A 不能读取 c-a”` 与 `“A 能读取 c-a”` 只差少量字符，但用户权限意义相反；资料中的“R9 尚待审”若被丢掉，模型可能继续写“上限已变 9 B”。向量相近、句子流畅不能替业务规则判定。模型位置/注意力的机制留到 14.04，本节只需要认出输入顺序与来源对生成有影响。[Google ML Crash Course：上下文](https://developers.google.com/machine-learning/crash-course/llm)

## 四、下一 token 分布与解码：高分也可能生成旧答案

下面**完全自造**一个玩具分词器：文本片段 `“6”`、`“9”`、`“未知”` 分别用 `t6/t9/tU` 代表。真实 tokenizer 未必这样切。假设给模型的前文为“当前 `/v1` 正文上限为”，玩具下一步分布是 `P(t6)=0.7`、`P(t9)=0.2`、`P(tU)=0.1`，三数相加为 1；这些**不是任何真实模型测得的概率**。[Google：语言模型预测分布](https://developers.google.com/machine-learning/crash-course/llm)

| 玩具候选 | 纸上概率 | 此处可得出的结论 |
|---|---:|---|
| `t6` → 文字片段“6” | 0.7 | 在这份玩具分布中最高 |
| `t9` → “9” | 0.2 | 仍可能被随机采样选到，不因概率低就为零 |
| `tU` → “未知” | 0.1 | 出现与否也不代表模型已核资料 |

**贪心解码**本步选概率最高的 `t6`；**采样**按规定的随机策略可能选 `t9`，然后把所选 token 追加到上下文，再预测下一个，直到停止标记或预算到达。即使每步都选最高，最终文字也不必然正确：若输入资料是过期的 R9 提议、缺当前版本号，模型的内部统计分布不是合同数据库。真实当前 `/v1` 是 **6 UTF-8 B**，答案要由[09.02 当前合同](../../../src/docs/platform_engineering/curriculum/09_backend_security/02_http_api_contract.md)核对；若缺可访问的权威资料则应说明未知。[Google：提示不改参数](https://developers.google.com/machine-learning/crash-course/llm/tuning)

不要把 `0.7` 解读为“70% 概率事实为真”，也不能把它当“70% 有权访问”。下一 token 的条件分布、答案正确率与资料权限分别需要不同的定义/证据；一份随机生成的句子可同时很像正确答案、却引用无权或不存在的资料。[14.02 条件概率分母](../../../src/docs/platform_engineering/curriculum/14_ai/02_math_ml_intuition.md)

## 五、上下文窗口是一次请求的预算，不是 IM 永久记忆

模型一次推理能处理的 token 有限；某些接口还为输出保留预算，并可能计入消息角色、工具描述、特殊标记等开销。做一个**不对应任何真实产品**的算术：假设一次窗口可用 **32 个玩具 token**，指令占 6、经授权证据占 18、问题占 4，忽略所有其它开销，则理想剩 `32−6−18−4=4` 个输出 token。实际可用输出上限须按所选模型/接口/tokenizer测量，不能拿这个“4”当服务规格。[Hugging Face：上下文长度](https://huggingface.co/learn/agents-course/en/unit1/what-are-llms)

若资料/会话更长，系统可能拒绝、截断、分段或摘要；任何一种都可能失去**关键限定词、成员历史规则版本或证据出处**。例如只保留“上限 9 B”，丢掉“R9 尚待审”，生成会偏离当前合同。长 IM 会话属于应用数据：哪些历史有权、是否保留、如何查询由 Go/数据/权限层负责；模型看到的一次上下文不是永久的业务数据库。应用可以以后再取资料拼入新请求，但这不是模型凭空记住了被截断的旧消息。[13.02 权威与游标](../../../src/docs/platform_engineering/curriculum/13_architecture/02_domain_state_modeling.md)

资料摘要也要留来源：它可能漏掉 `seq8`、把“非成员隐藏 404”缩成“用户无权”，或把旧 `/v1` 与未来 `/v2` 混在一句话里。只有能回到有权限的原文/版本，才能评估摘要是否足以支持回答。[14.01 来源 manifest](../../../src/docs/platform_engineering/curriculum/14_ai/01_python_data_work.md)

## 六、训练改参数，提示与检索改当前输入

**训练**用数据调整模型参数；**推理**用既定参数对当前输入生成输出。预训练可能让模型学到一般语言模式，面向特定任务的微调又是额外训练；给一次提示/示例通常只是改变本次上下文，**不会自动修改已部署模型的参数**。未来 RAG 会在推理时放入经授权检索的资料，也不等于重训模型或自动证明每句回答。[Google：Fine-tuning 与 prompting](https://developers.google.com/machine-learning/crash-course/llm/tuning)

| 改动 | 本质 | 对虚构 `q-01/q-02` 能/不能做什么 |
|---|---|---|
| 改提示 | 调整本次指令/例子 | 可要求注明来源；不能把 9 B 旧说法变成现行事实 |
| 换检索资料 | 调整本次可引用上下文 | 应先授权/版本过滤；不能让无权文档入提示 |
| 微调 | 改模型参数，需要数据/训练/评测 | 不能直接代替最新合同或实时成员权限 |
| 改 Go 业务规则 | 改 HTTP/权限/确认实际实现 | 必须独立守 `/v1` 6 B/409/404/200，不能由模型决定 |

`q-01` 若问当前 `/v1` 正文上限，资料应指向现行 **6 B** 而不是待审 R9；模型若答 9 B，要按引用和版本判错。`q-02` 若问 B 能否看某会话资料，而成员历史规则尚未决定，正确的产品处理是按现有授权边界拒绝或说明规则未定，**不能让模型用相似度猜“B 大概有权”**。[09.07 应用授权](../../../src/docs/platform_engineering/curriculum/09_backend_security/07_authentication_authorization.md)

## 七、版本与失败卡让下章评测有共同分母

一张纸上模型调用卡应记录：模型/分词器版本、提示模板版本、所用资料 ID/版本/访问范围、请求者身份与权限过滤结果、上下文 token 预算与截断策略、解码设置、候选输出、引用/拒答理由。若未来真的调用模型，还要保存运行环境与评测集版本；本章没有生成/测量真实响应。[14.01 复现清单](../../../src/docs/platform_engineering/curriculum/14_ai/01_python_data_work.md)

| 失败变式 | 首先检查哪一层 | 不应先做什么 |
|---|---|---|
| token 数估错导致证据被截掉 | tokenizer、模板、窗口计数和保留片段 | 直接提高“模型温度” |
| 过期资料写“R9 已放宽 9 B” | 资料版本与当前 `/v1` 合同 | 把模型输出当需求批准 |
| 无权文档进入模型提示 | 应用资料 `access_scope`/身份过滤 | 只在输出末尾加一句“请保密” |
| 模型写“B 已收到 `m-9`” | S2/S3/事件/设备 ACK 的各自证据 | 用生成文字回填消息状态 |
| `q-02` 无可判成员规则 | 业务未决/授权边界 | 用高余弦资料造确定答案 |

下一阶段按[第十四卷学习顺序](../../../src/docs/platform_engineering/curriculum/14_ai/README.md)：14.09 在首次比较 AI 方案前先建立固定问题/资料与关键词基线；14.04 再深入 Transformer/推理路径，14.05 学提示/结构化输出，14.06–14.07 学检索/RAG。**先有代表性问题和正确授权，再比较模型与检索方法**，才能知道改进来自哪一层。[Google：训练/验证/测试边界](https://developers.google.com/machine-learning/crash-course/overfitting/dividing-datasets)

## 八、22 道分层练习：从“你好”到一条可核回答

先分单位，再推玩具分布和上下文，最后查资料与业务确认。答案不代表任何真实模型调用。

### 基础 1–8：token 与模型角色

<details><summary>1. `"你好"` 有几个字符、几个 UTF-8 B？</summary>

本示例为 2 个字符、6 B；不能由此确定模型 token 数。</details>

<details><summary>2. 未固定 tokenizer，能说 `"你好"` 一定是两个 token 吗？</summary>

不能。切分取决于模型配套分词器及版本。</details>

<details><summary>3. 14.02 的 `q=(1,0)` 是训练出的模型 embedding 吗？</summary>

不是，是人为规定的二维特征。</details>

<details><summary>4. 输入 token embedding 与检索文档向量默认同空间吗？</summary>

不保证，需核模型、维度、目标和版本。</details>

<details><summary>5. 当前 S2 的 200 表示模型答对或 B 收到吗？</summary>

都不表示，只是本进程内存受理 IM 消息。</details>

<details><summary>6. 提示中的一个例子会自动更新模型权重吗？</summary>

不会。普通提示改变本次输入上下文，训练/微调才调整参数。</details>

<details><summary>7. 模型一次上下文等于永久聊天记忆吗？</summary>

不等于。长期历史/权限/检索由应用管理，一次窗口有限。</details>

<details><summary>8. RAG 把文档放进提示就能证明答案正确吗？</summary>

不能。仍需权限、版本、来源和句子与证据的对应审查。</details>

### 推演 9–16：分布、截断与旧答案

<details><summary>9. 玩具 `0.7+0.2+0.1` 为多少？</summary>

为 1，构成此纸上候选集的分布。</details>

<details><summary>10. 贪心解码在本步选哪一个？</summary>

选概率最高的玩具 `t6`；这仍不证明最终答案正确。</details>

<details><summary>11. 采样可能选 `t9` 吗？这能证明 R9 已批吗？</summary>

可能选到；不能证明，R9 仍待审。</details>

<details><summary>12. 纸上窗口32、指令6、证据18、问题4，理想余多少输出 token？</summary>

`32−6−18−4=4`；真实还可能计入特殊标记和接口开销。</details>

<details><summary>13. 截断掉“尚待审”，只留“R9 9 B”，会怎样？</summary>

模型可能生成旧/错合同；需保留版本与限定词并核当前来源。</details>

<details><summary>14. `P(t6)=0.7` 可说事实有70%概率正确吗？</summary>

不能，它只是此玩具下一步 token 条件分布，不是事实校准概率。</details>

<details><summary>15. 模型输出 `"B 已收到 m-9"`，应查哪几层？</summary>

查当前/未来受理、权威 DB、E9、指定设备 ACK/阅读；生成文字不是送达证据。</details>

<details><summary>16. `q-02` 没有已定成员历史规则，能让模型猜 B 有权吗？</summary>

不能。应用先按现有规则拒绝/说明未决，不能用相似度猜权限。</details>

### 决策 17–22：来源、权限与下一步

<details><summary>17. 资料 d3 与问题余弦高，能跳过 access_scope 吗？</summary>

不能。先身份和资料权限过滤，再做相似排序与证据核对。</details>

<details><summary>18. 提示写“请只答真话”就能替代资料引用吗？</summary>

不能。它改变输入指令，不提供当前事实或授权证据。</details>

<details><summary>19. 微调后可不再查最新 `/v1` 合同吗？</summary>

不能。训练参数可能滞后，现行合同仍需版本化权威资料验证。</details>

<details><summary>20. 缺来源的 9 B 回答应怎样处理？</summary>

按当前 `/v1` 6 B 合同判错；指出 R9 待审并要求可访问来源。</details>

<details><summary>21. 本章要先部署聊天助手验证模型能力吗？</summary>

不用。先固定虚构数据/问题/权限，14.09 建基线，模型运行证据日后另收。</details>

<details><summary>22. 一份可审模型回答至少连起哪些版本与结果？</summary>

模型/tokenizer、提示、资料及权限、上下文/解码、输出与引用、当前 IM 合同和拒答条件。</details>

## 本章完成标准与后续路径

能区分 2 字符/6 B 与未知 token 数，解释人工向量和学习 embedding 的差别、玩具下一 token 分布、32 token 纸上窗口与训练/推理差别，并在 `q-01/q-02` 上拒绝把生成文字当合同或权限证据，才算完成第一轮。按本卷先修顺序，接着先进入 14.09 的固定数据集与关键词基线起步；Transformer 的内部机制在 14.04 深化。
