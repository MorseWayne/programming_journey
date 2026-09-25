---
title: 14.02 必要数学与机器学习直觉：相似不等于真实，也不等于有权
icon: /assets/icons/article.svg
order: 3
date: 2026-09-25
---

[返回第十四卷](./README.md) · [Python 数据：14.01](./01_python_data_work.md) · [离散对象与成本：02.01](../02_algorithms/01_discrete_cost.md) · [成员授权：09.07](../09_backend_security/07_authentication_authorization.md)

# 14.02 必要数学与机器学习直觉：相似不等于真实，也不等于有权

> DeepTutor 八节初稿经技术与教学审阅后的静态课程。向量、题目、标签、分数和模型结果都是**虚构纸上数值**，没有运行 Python/Go、IM、模型、训练、评测或站点。当前 S2 `/v1` 正文非空且最多 **6 UTF-8 B**、原始 HTTP 请求正文最多 **4096 B**、同 ID 重复 **409**、非成员隐藏 **404**、成功 `200 accepted_in_memory` 只表示本进程内存受理；未来 S3 `/v2` 的 `stored_in_teaching_db` 是提议且仍为 6 B，R9 6→9 B 待审。本章 AI 的“有证据可答”标签不能改写这些 IM 业务确认点。[09.02 当前合同](../09_backend_security/02_http_api_contract.md)

## 一、先定问题、样本、特征、标签，才谈“模型好不好”

14.01 用虚构 IM 消息和资料练数据校验；本章要问资料助手遇到一个问题时，**是否有当前用户有权访问、且足以支持答案的资料**。一行问题/资料配对可作一个**样本**；把它转成数字供规则/模型使用的是**特征**；人审后标“可答/不足或无权”是**标签**。学习器从训练样本调整参数；**推理**是在新样本上用已定规则/参数得输出。这些都是分析层概念，不能把 `q-01`、`m-a` 或 `seq9` 当作模型权重。[Google ML Crash Course：数据集](https://developers.google.com/machine-learning/crash-course/overfitting/data-characteristics) · [14.01 数据来源](./01_python_data_work.md)

| 名词 | 虚构 `q-01` 例子 | 仍需另查 |
|---|---|---|
| 样本 | “`m-a` 的正文占多少 UTF-8 B？”及候选资料 | 问题来源/版本、是否重复 |
| 特征 | 人工标记是否提到“字节限制”“权限” | 特征怎么产生、是否泄漏答案 |
| 标签 | 审阅者判“可用某份有权资料回答” | 资料是否真准确、审阅标准是否一致 |
| 预测 | 玩具规则认为“可答”或排序靠前 | 误答代价、拒答与授权检查 |
| 真实业务结果 | A 的 `/v1` 200、重复 409、非成员 404 | 与上述 AI 标签**不是同一件事** |

本章刻意把玩具问题、数值和文档都写出来，先学会问“分母、数据来源和错误成本是什么”。真实的训练集、模型嵌入、检索效果、资料权限在后续章节才逐步建立。[本卷实际顺序](./README.md)

## 二、二维向量、矩阵、点积与余弦手算

**向量**可先当固定顺序的一列数，**维度**是数的个数。设两个完全人工的特征轴依次为“字节限制”和“权限”：查询 `q=(1,0)`，资料 `d1=(1,1)`、`d2=(0,1)`、`d3=(2,0)`。`d3` 的 2 仅表示本题在第一轴的人工计数更高；这些数**不是训练出的 embedding**，也不意味着 `d3` 真实有两个可靠证据。[Google ML Crash Course：Embeddings 入门](https://developers.google.com/machine-learning/crash-course/embeddings)

把三份资料排成 **3 行×2 列**的矩阵 `D`，查询 `q` 是 **2 行×1 列**向量：

```text
       字节  权限                  d1: (1, 1)
D = [   1    1   ]               d2: (0, 1)
    [   0    1   ]               d3: (2, 0)
    [   2    0   ]      q = (1, 0)
```

**点积**是对应位置相乘再相加：`q·d1=1×1+0×1=1`，`q·d2=0`，`q·d3=2`，所以 `Dq=(1,0,2)`。它奖励方向相关，也会受向量大小影响：重复提及某人工特征的 `d3` 得 2，不是因为已经核准它的来源或访问权限。[Google：dot product 与 cosine 的差别](https://developers.google.com/machine-learning/clustering/dnn-clustering/check-your-understanding)

向量**长度/范数**用平方和开根：`||q||=1`、`||d1||=√2`、`||d2||=1`、`||d3||=2`。**余弦相似度**定义为 `cos(q,d)=(q·d)/(||q||×||d||)`，因此 `cos(q,d1)=1/√2≈0.707`、`cos(q,d2)=0`、`cos(q,d3)=1`。它消去这组向量的整体大小影响，更接近比较方向；若任一向量是零向量，分母为 0，**不能算余弦**，需要提前约定跳过或处理方式。较高相似度仍不证明答案正确、有证据或有权限。[Google：相似度度量](https://developers.google.com/machine-learning/clustering/dnn-clustering/check-your-understanding)

## 三、条件概率先选分母，方向反过来答案会变

另造一个**与上面三份向量独立**的 20 题纸上表。`P` 表示“题目属于权限主题”，`E` 表示“审阅者认为有充分资料”；这些只是样本频率，不代表真实 IM 用户分布或模型输出概率。[Penn State：条件概率](https://online.stat.psu.edu/stat414/Lesson19)

| 20 个虚构题 | 有充分资料 E | 资料不足 ¬E | 合计 |
|---|---:|---:|---:|
| 权限主题 P | 6 | 2 | 8 |
| 非权限主题 ¬P | 6 | 6 | 12 |
| 合计 | 12 | 8 | 20 |

`P(E | P)=6/8=0.75` 问“**已知是权限题**，有证据的比例”；`P(P | E)=6/12=0.5` 问“**已知有证据**，其中是权限题的比例”；`P(P)=8/20=0.4` 是这 20 题的权限主题占比。条件放在竖线右边，分母就换成该条件对应的子群。`0.75` 与 `0.5` 不能互换，且这 20 题太少/太人工，不能据此估生产概率或证明“权限题更容易答”。[Penn State：条件分布是子群上的分布](https://online.stat.psu.edu/stat414/Lesson19)

更正式地说，**样本空间**是这 20 道题，事件 `P` 是其中 8 道权限题，事件 `E` 是其中 12 道有证据题，二者同时发生的 `P∩E` 有 6 道。条件概率公式 `P(E|P)=P(E∩P)/P(P)`；用计数写就是 `6/20 ÷ (8/20)=6/8`。若条件事件在样本中为 0 题，分母为 0，就不能用这张表算该条件概率；应先补样本或承认未知。[Penn State：条件概率定义](https://online.stat.psu.edu/stat414/Lesson19)

相似度 `0.707` **不是**“资料有 70.7% 概率正确”；要把任意分数解释成可靠概率，还需定义事件、代表性标签、统计/校准方法与独立检验。本课程在此只要求学习者看清条件事件和分母，14.09 再评测模型/检索系统。[14.09 分章计划](./README.md)

## 四、混淆矩阵告诉你错在哪类用户问题上

再换一张**独立的纸上二分类表**：目标是预测“对当前用户而言，此题有授权且充分的资料可答”。实际标签由审阅者按已定规则给出；模型/规则给出“答/不答”。**TP** 是本来可答也预测可答，**FP** 是本不该答却预测可答，**FN** 是本可答却预测不答，**TN** 是本不该答且预测不答。[Google ML Crash Course：分类指标](https://developers.google.com/machine-learning/crash-course/classification/accuracy-precision-recall)

| 20 个虚构题 | 实际可答 | 实际不可答 |
|---|---:|---:|
| 预测可答 | TP=6 | FP=2 |
| 预测不答 | FN=3 | TN=9 |

由此**精确率** `precision=TP/(TP+FP)=6/8=0.75`：系统想回答的 8 题里，6 题真可答。**召回率** `recall=TP/(TP+FN)=6/9≈0.667`：实际可答的 9 题里找回 6 题。**准确率** `accuracy=(TP+TN)/20=15/20=0.75`。三者都依赖这个题集、标签与固定阈值；若大量问题本就不可答，只说准确率高可能掩盖总是拒答的系统。[Google：precision/recall/accuracy](https://developers.google.com/machine-learning/crash-course/classification/accuracy-precision-recall)

业务风险也不对称：FP 可能是**无证据甚至无权限仍回答**，需要特别追踪；FN 是有证据却拒答，影响体验。调高预测阈值可能改变 FP/FN 的平衡，但**访问控制不是可调的分类阈值**。应先依据身份和资料 `access_scope` 过滤无权资料，再在许可范围内检索/判断证据；即使分类表 FP=0，也不能代替成员授权的实现与测试。[09.07 成员授权](../09_backend_security/07_authentication_authorization.md)

## 五、训练、验证、最终测试：三个集合回答不同问题

再设一个**不同于上面 20 题统计表**的虚构小数据集，暂分 **12 个训练、4 个验证、4 个最终测试**样本。**训练集**让规则或模型学习参数；**验证集**帮助选特征、规则或阈值；**最终测试集**留到选择固定后做一次独立检查。`12/4/4` 只便于手算，不是通用推荐比例，也远不足以提供稳定的业务质量结论。[Google ML Crash Course：划分数据集](https://developers.google.com/machine-learning/crash-course/overfitting/dividing-datasets)

假设一个复杂规则在训练题上 **12/12 正确**，验证题只 **2/4 正确**。这提示规则可能记住训练样本、在未见样本上泛化差，即**过拟合警讯**；但验证集只有 4 题，不能据此严谨判定某模型在真实用户中的错误率。更应先检查资料来源、标签、划分和是否有重复/近重复。[Google：Overfitting](https://developers.google.com/machine-learning/crash-course/overfitting/overfitting)

| 数据划分风险 | 在虚构 IM 中的例子 | 应怎样记录/处理 |
|---|---|---|
| 同一问题重复 | `q-01` 文案改一个字就在训练与测试各出现 | 按稳定问题/来源去重，保留重复报告 |
| 同会话近重复 | `c-a` 的相邻片段和答案互相泄漏 | 视实际要测的泛化目标，按会话/时间/来源分组 |
| 在全数据上先拟合特征规则 | 用测试集频率选词或阈值 | 划分前后操作顺序写清，只从训练数据拟合 |
| 反复看最终测试 | 每看一次测试结果就改提示/阈值 | 测试会“磨损”；另留未见样本和版本记录 |

也不能机械地“随机打散就一定代表真实场景”：若将来用户问的是新会话、新文档或权限变更，划分要能考到这些变化；若按时间切，训练/测试分布也可能不同，需要说明评测问题。14.09 会系统地设计代表性和泄漏审查。[14.01 数据 manifest](./01_python_data_work.md) · [Google：数据划分与重复](https://developers.google.com/machine-learning/crash-course/overfitting/dividing-datasets)

## 六、分数、证据与 IM 用户承诺是三道门

面向未来虚构聊天资料助手，可按“**权限过滤 → 候选检索/相似度 → 证据充分性 → 回答或拒答**”来解释分数的位置。`d3` 余弦为 1，也可能是重复关键词、过期文件或 `u-b` 无权访问的资料；高分只说明在这套人工二维表示里方向吻合。若找不到充分且有权的资料，应拒答并说明缺什么，不因模型语气流畅就编造引用。[Google ML Crash Course：Embedding 只是表示](https://developers.google.com/machine-learning/crash-course/embeddings)

这道 AI 门与 IM 本身的合同还不同：当前 A 的 `200 accepted_in_memory`、重复 ID 的 409、非成员隐藏 404，由 Go 应用和权限规则负责；“资料可答”分类器不能把消息内存受理升级成 DB 已存，也不能为非成员查询绕过 404。未来 S3 的 `stored_in_teaching_db` 与设备 ACK 若要形成新业务事实，也须有各自权威和验证，不能由余弦相似度证明。[11.01 用户确认点](../11_reliability/01_business_measurement.md)

| 纸上信号 | 可说什么 | 不能说什么 |
|---|---|---|
| `cos(q,d3)=1` | 两个非零玩具向量同方向 | 文档真、可见、能回答用户 |
| 预测“可答” | 固定规则在该阈值给正例 | 已经过权限过滤/引用审查 |
| 有资料引用 | 指向某版本资料片段 | 片段在当前会话中有权、足以支持全部句子 |
| 当前 S2 200 | 进程内存受理消息 | AI 答案正确或 B 已收到 |

## 七、纸上实验记录要能让别人复算，也要承认它没运行

给每张手算卡留**特征顺序**（先字节限制、再权限）、`q/d1/d2/d3` 数值、点积/余弦公式、零向量处理、20 题条件表与分类标签来源；若将来真划分数据，再记录样本/文档版本、去重和按会话/时间分组规则、随机种子、训练/验证/最终测试 ID 列表。否则两人算出不同分数时无法判断是方法差异还是资料版本不同。[14.01 可复现清单](./01_python_data_work.md)

这一页没有训练模型、没有检索真实私聊，也没有声称 `precision=0.75` 是产品指标。手算的价值是让读者在 14.03 学 token/embedding/语言模型时，先懂“向量是怎样比较的”“条件概率不能倒置”“训练集全对不代表能泛化”；在 14.09 比较方案前，再用固定查询和权限内资料建立真实可复核的基线。[本卷顺序](./README.md)

## 八、22 道分层练习：先手算，再决定能否答

先算向量，再选概率分母与分类指标，最后检查划分和权限。答案仅针对本章虚构数字。

### 基础 1–8：向量和概念

<details><summary>1. `q=(1,0)` 有几维？</summary>

二维；两个位置分别是本题人工“字节限制、权限”特征。</details>

<details><summary>2. `D` 有三行两列，能与几维列向量相乘？</summary>

与二维列向量相乘，结果为三维分数列。</details>

<details><summary>3. `q·d1` 与 `q·d3` 各是多少？</summary>

分别为 1 和 2；点积会受本题向量大小影响。</details>

<details><summary>4. `||d1||` 与 `||d3||` 各是多少？</summary>

分别为 `√2` 和 2。</details>

<details><summary>5. `cos(q,d2)` 是多少？</summary>

`0/(1×1)=0`。</details>

<details><summary>6. 零向量与 q 的余弦能直接算吗？</summary>

不能，零向量范数为 0，分母为 0。</details>

<details><summary>7. 本题 `(2,0)` 是真实模型生成的 embedding 吗？</summary>

不是，只是人工二维特征计数的纸上示意。</details>

<details><summary>8. 高相似度能证明 B 有权读文档吗？</summary>

不能。身份/资料访问范围必须独立检查。</details>

### 计算 9–16：条件概率与分类

<details><summary>9. `cos(q,d1)` 约多少？</summary>

`1/√2≈0.707`。</details>

<details><summary>10. `cos(q,d3)` 是多少？与点积有什么不同？</summary>

`2/(1×2)=1`；点积为 2，余弦归一了向量长度。</details>

<details><summary>11. 20 题表中 `P(E|P)` 是多少？</summary>

权限主题 8 题中有证据 6 题，`6/8=0.75`。</details>

<details><summary>12. `P(P|E)` 与 `P(P)` 各是多少？</summary>

有证据的 12 题中权限题 6 题，`6/12=0.5`；权限题共 8/20=`0.4`。</details>

<details><summary>13. TP=6、FP=2，precision 是多少？</summary>

`6/(6+2)=0.75`。</details>

<details><summary>14. TP=6、FN=3，recall 是多少？</summary>

`6/(6+3)=2/3≈0.667`。</details>

<details><summary>15. TP=6、TN=9、总20，accuracy 是多少？</summary>

`(6+9)/20=0.75`。</details>

<details><summary>16. `cos=0.707` 可读成“70.7% 概率答案正确”吗？</summary>

不可。它是该玩具向量的角度相似度，未被校准成正确率或权限概率。</details>

### 决策 17–22：泛化、泄漏与业务门

<details><summary>17. 12/12 训练正确、2/4 验证正确，可直接宣称真实错误率50%吗？</summary>

不能。它提示过拟合或数据/标签问题，验证样本太少，不足以估真实错误率。</details>

<details><summary>18. 验证集与最终测试集的用途有何不同？</summary>

验证集用于开发时选规则/阈值；最终测试在选择冻结后做独立检查。</details>

<details><summary>19. 相邻的 `c-a` 片段同时进训练和测试，风险是什么？</summary>

近重复内容泄漏使测试过分乐观；要按目标设计会话/文档/时间分组。</details>

<details><summary>20. FP 可能包含无权仍回答，可只靠提高分类阈值解决吗？</summary>

不能。访问控制是硬门；先权限过滤，再优化证据/分类阈值。</details>

<details><summary>21. 本章算出 P=0.75，可把当前 `/v1` 非成员 404 改成概率拒绝吗？</summary>

不能。AI 指标与 IM 业务授权合同无关。</details>

<details><summary>22. 一张可复算的纸上评测卡至少交什么？</summary>

特征顺序、向量/公式、零向量规则、样本与标签来源、条件/混淆表、划分/去重方法及未运行声明。</details>

## 本章完成标准与后续路径

能手算 `Dq`、三个余弦、两个方向的条件概率和 precision/recall/accuracy，解释为什么训练 12/12 正确不足以证明泛化，并在高相似资料面前仍先审权限与证据，才算完成第一轮。下一章[14.03 语言模型基础](./03_language_model_foundations.md)将讲 token、embedding、上下文和生成，继续把模型输出与 IM 业务事实分开。
