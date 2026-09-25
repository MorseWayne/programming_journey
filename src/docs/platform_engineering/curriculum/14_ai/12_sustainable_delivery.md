---
title: 14.12 可持续交付：版本、灰度、回滚与故障响应
icon: /assets/icons/article.svg
order: 13
date: 2026-09-25
---

[返回第十四卷](./README.md) · [RAG 链路：14.07](./07_rag_pipeline.md) · [评测基线：14.09](./09_evaluation_data_engineering.md) · [优化与部署：14.10](./10_optimization_deployment.md)

# 14.12 可持续交付：版本、灰度、回滚与故障响应

> 本章收束第十四卷的**静态交付设计**：没有部署、灰度、回滚、运行模型、读取真实聊天或处理生产事故。先会 14.09 的固定问题/金标签、14.07 的证据链、14.10 的质量与成本切片，再把它们接到版本和事件响应。当前 S2 `/v1` 正文非空且最多 **6 UTF-8 B**、原始 HTTP 请求正文最多 **4096 B**、同 ID 重复 **409**、非成员隐藏 **404**、成功 `200 accepted_in_memory` 只到本进程内存受理；未来 S3 `/v2` `stored_in_teaching_db` 是提议且仍为 6 B，R9 6→9 B 待审。[09.02 当前合同](../09_backend_security/02_http_api_contract.md)

## 一、交付单位是一条可重现的证据链

用户看到 `q-01`“当前正文上限是 6 B”时，背后至少有**现行资料、检索索引、访问规则、提示、模型、输出契约和应用代码**。只给模型打一个 `v2` 标签，无法知道哪份 `doc-current`、哪次索引切分、哪版权限策略支撑答案。可把一次候选交付记为 `release_id`，指向一组不可混淆的版本/散列，而不是用一个笼统“AI 版本”。[14.07 来源链](./07_rag_pipeline.md) · [MLflow：模型版本与别名概念](https://www.mlflow.org/docs/latest/ml/model-registry/workflow/)

```text
release_id: assistant-candidate-02（纯虚构）
IM 合同: S2 /v1，正文 6 UTF-8 B；R9 status=proposed
资料: doc-current@v1，doc-r9@draft；权限策略@p1
索引: chunker@c2 / analyzer@a1 / embedding@e1 / build@i7
提示/输出: prompt@p2 / answer-contract@v1
模型: base@m1 / adapter@none / tokenizer@t1
应用: answer-check@k3；固定题集/标签 manifest@q1
```

这是**纸上清单**，没有实际制品。每个标识都应能查来源、创建者、时间、内容散列、适用范围和上一可回退版本；尤其 `doc-r9` 的 proposed 状态不能因候选交付而变 current。模型别名可以指向某个具体版本，但若别名背后版本改了，诊断仍要能找到当时真正用的版本。[Google ML：数据/模型版本监测](https://developers.google.com/machine-learning/crash-course/production-ml-systems/monitoring)

## 二、发布前先过固定问题和独立未见集

14.09 的六题是**回归卡**：`q-01` 当前 6 B、`q-02` R9 尚待审、`q-03` `u-b` 私有正文模型前拒绝、`q-04` 退群历史规则未定、`q-05` 200 不是 B 设备 ACK、`q-06` 24h broker 不能独自保证 25h 离线补齐。每题要核输入权限、检索候选/版本、进入提示的片段、回答/拒答、逐主张引用与最终用户结果。一个高平均分不能抵消 `q-03` 的越权。[14.09 六题与分层指标](./09_evaluation_data_engineering.md)

六题已公开，不能拿它们当最终**未见集**。真正发布门还需按会话/文档/时间/权限状态分组保留未见题，标注争议、样本量和不代表的场景；变化了 prompt、模型或检索，就重新跑同版本标签的回归与未见集。若资料确实生效变更，如未来 R9 **获批**，才建立新合同版本与新标签，旧实验结果保留旧适用条件，不能悄悄改成“当年其实也是 9 B”。[14.09 泄漏与数据划分](./09_evaluation_data_engineering.md) · [Google ML：部署测试](https://developers.google.com/machine-learning/crash-course/production-ml-systems/deployment-testing)

| 发布门 | 失败示例 | 结果 |
|---|---|---|
| 权限/来源 | `doc-private` 进了 `u-b` 候选或提示 | 停止，不用平均分覆盖 |
| 现行/提议 | `q-01` 用 r9 答当前 9 B | 停止，查资料/索引/提示第一个坏边界 |
| 引用与拒答 | 引用存在但不支持主张；`q-04` 编 7 天 | 停止或按预定阈值审查 |
| 性能与成本 | 尾时延、队列、每正确任务成本超目标 | 按业务目标决定修订/回退 |

## 三、从离线、影子到灰度，每一步只扩大已验证范围

**离线**用固定合成/合规样本跑候选与旧版对照；**影子模式**可只计算候选而不向用户交付，用来观察真实形状下的差异；**灰度（canary）**才让预先限定的一小部分有权用户看到候选结果，再按明确窗口与停止条件决定扩大或回退。Google SRE 将灰度描述为部分、限时的发布与评估；本章只借这个原则，未执行任何线上变更。[Google SRE：Canarying Releases](https://sre.google/workbook/canarying-releases/)

影子也不是“无风险”：若把真实私聊或 `doc-private` 镜像到未经授权的新模型环境，即使结果不展示也已越过数据边界。需先确定 actor/数据许可、隔离、保留与脱敏，再决定能否影子；否则只用合成资料。灰度分组和指标应按身份、问题桶、资料状态和权限切片；不能只盯整体平均回答长度或 TTFT。[OWASP：RAG 全链权限](https://cheatsheetseries.owasp.org/cheatsheets/RAG_Security_Cheat_Sheet.html)

纸上候选发布卡需写：目标改动是什么、控制版和候选版的完整 manifest、哪些用户/请求可见、观察多长时间、权限硬门和业务门、延迟/成本停止线、回退动作、值守负责人。这里不填百分比或生产阈值，因为六题和静态文档没有真实流量/风险分布。[14.10 成功任务和切片](./10_optimization_deployment.md)

## 四、反馈应成为可审样本，而不是自动训练指令

用户点击“不对”是一条**反馈事件**，还不是金标签。先保留问题桶、身份的最小必要标识、适用的 release/资料版本、候选回答与引用 ID、用户反馈类型和审阅状态；避免在普通日志中复制私聊正文或私有文档。经有权审阅后，再标根因是资料状态、权限、召回、上下文截断、生成、引用还是误操作；争议样本要可追踪，不把一个用户的意见直接写成新业务合同。[14.09 标注与第一个坏边界](./09_evaluation_data_engineering.md)

反馈还可能有**自选择偏差**：愿意点反馈的人和沉默用户未必同分布，某次错误越明显越可能被报告。报告“10 条负反馈中 8 条修复”不能推出总体准确率；需保留采样窗口、问题桶、分母和未反馈样本的审查计划。也不能把已经看过并用于调提示的反馈样本继续充当独立最终测试集。[Google ML：真实指标与数据切片](https://developers.google.com/machine-learning/crash-course/production-ml-systems/monitoring) · [14.09 测试集磨损](./09_evaluation_data_engineering.md)

修复动作按根因走：`q-01` 若索引把 r9 标 current，就修资料/索引并审缓存；`q-03` 若越权，先阻断输入与输出；格式失败才可能改提示/结构化生成；模型能力稳定缺口且数据合规时才考虑 14.11 的微调。反馈闭环的终点是**可复查的新版本和未见回归**，不是“收集更多对话来训练”。

## 五、回滚要覆盖资料、索引、缓存和输出契约

“把模型别名指回旧权重”只回滚了一条轴。若错误来自 `doc-r9` 被误标 current，旧模型仍会读取错误索引；若权限已撤销但答案/前缀缓存未失效，回滚提示也无法收回已缓存的私有片段。因此回滚方案要列**受影响版本组合**：资料源与状态、索引快照/切分、授权策略、检索/答案/前缀缓存、提示、模型/适配器、输出 JSON 与消费端兼容性。[OWASP：索引快照与回滚](https://cheatsheetseries.owasp.org/cheatsheets/RAG_Security_Cheat_Sheet.html) · [14.07 更新与缓存](./07_rag_pipeline.md)

回滚也有时间边界：新错误答案一旦对用户显示或私有资料一旦泄露，切回旧版**不能撤销已发生的暴露**。应另做影响范围核查、隔离与事件处理。若确有正式批准把 R9 变 current，简单回滚到旧资料也可能让新真实规则被答错；应依据**当时有效的权威合同**选回退目标，而非习惯性把所有东西退一版。[13.08 兼容迁移](../13_architecture/08_migration_compatibility.md)

旧消费端如果只认识 `answer-contract@v1`，候选版新增字段或改变 `status` 含义，就不能只换服务端不管消费者。先明确兼容窗口、拒绝不认识版本的行为和回滚时保存的旧格式；未来 S3 `/v2` IM 存储提案与资料助手的回答 JSON 版本仍是两个独立合同。[14.05 输出契约版本](./05_prompt_structured_output.md)

## 六、用 R9 误发布演练一次事件响应

纸上事故：候选索引把 `doc-r9(status=proposed)` 错标为 current，一小部分灰度请求中 `q-01` 回“当前上限 9 B”。先**停止扩大灰度/隔离错误索引与缓存**，保持现行 `/v1` 6 B 合同；核受影响 release、actor/问题桶与输出，尤其查有无 `q-03` 资料越权。然后根据权威资料修 status、重建/切换索引并失效相关缓存，对固定六题和未见集复核，最后才考虑恢复灰度。不能通过修改文档把 R9 追认成“其实已生效”。[11.10 事件响应](../11_reliability/10_incident_response.md) · [14.09 第一坏边界](./09_evaluation_data_engineering.md)

| 时间顺序 | 纸上要留下的证据 |
|---|---|
| 发现 | 错误答案/引用、发生时间、release 与资料/索引版本 |
| 遏制 | 停止候选流量、隔离错误索引/缓存、当前 6 B 对外一致 |
| 核影响 | 哪些 actor/问题桶看见错误、是否有私有正文进入路径 |
| 修复验证 | current/proposed 恢复、缓存失效、六题和未见集结果 |
| 复盘 | 哪一门先失败、为何发布门没挡、如何补检测/回退演练 |

若是权限泄露，处置还涉及安全与隐私负责人、影响告知和资料保留策略；课程不假设某公司制度。事件后复盘应区分**触发变更、第一坏边界、扩大因素和检测延迟**，而不是只写“模型幻觉”。[11.11 复盘改进](../11_reliability/11_postmortem_improvement.md)

## 七、长期看板把业务、数据、模型和资源连起来

持续交付要定期核资料状态/权限变更是否进入索引，引用是否回到仍有效原文，`q-01/q-02` 当前与提议是否混淆，`q-03/q-04` 的正确停止率，未见集/人工抽样的质量变化，以及 14.10 的 TTFT、尾时延、成本和过载拒绝。按版本、问题桶、actor 权限类别和输入模态切片；全局一条“满意度 90%”会遮住某个硬门。[Google ML：监测数据与切片](https://developers.google.com/machine-learning/crash-course/production-ml-systems/monitoring)

每次发布、回滚和修复都应能回答：**当前哪一组 manifest 在服务，谁批准，哪些门通过，哪些反馈尚未处理，下一步若失败退到哪里**。模型权重/别名管理可以用模型注册中心一类机制实现，但文档、索引、权限和提示同样需要追溯；不能把某个工具的“已注册模型”当作完整发布证据。[MLflow：模型版本与别名](https://www.mlflow.org/docs/latest/ml/model-registry/workflow/) · [Google SRE：发布工程](https://sre.google/sre-book/release-engineering/)

本章没有生产部署，也没有拿用户数据实测。学习者的真正实现与运行记录应另记环境、版本、负载、授权与观测；本课交付的是一份能被评审的**发布/停止/回退设计**。

## 八、22 道分层练习：审一次虚构助手发布卡

1–8 辨版本和发布门，9–16 推演灰度与反馈，17–22 处理回滚和事故。答案均基于虚构 IM 资料与纸上候选。

### 基础 1–8：版本与回归

<details><summary>1. 只记 `model=v2` 能重现 q-01 答案吗？</summary>

不能；还需资料/权限/索引/提示/输出契约/应用及题集版本。</details>

<details><summary>2. R9 进入候选 release 就变 current 吗？</summary>

不会；它仍是 6→9 B 待审提议，除非另有正式业务批准。</details>

<details><summary>3. `q-03` 越权能被其它五题正确平均掉吗？</summary>

不能；私有正文进入无权路径是独立硬门失败。</details>

<details><summary>4. 六题为何不是最终未见集？</summary>

它们已公开用于教学、开发与回归；需另外独立划分未见题。</details>

<details><summary>5. 影子模式的输出不展示，就可以随意复制私聊吗？</summary>

不可以；输入进入新环境本身仍受授权、许可、隔离和保留约束。</details>

<details><summary>6. 灰度先让谁看到候选？</summary>

只让预先限定、具备数据/服务授权的一小范围，在明确窗口和停止门下评估。</details>

<details><summary>7. 用户点“不对”就自动成为金标签吗？</summary>

不是；需有权审阅、归因和争议处理，并记录版本。</details>

<details><summary>8. 资料助手回答 JSON 版本等于 IM HTTP `/v1` 吗？</summary>

不等于；这是两个独立的兼容合同。</details>

### 推演 9–16：反馈、切片与回滚

<details><summary>9. `q-01` 候选答 9 B，先查哪个资料状态？</summary>

查 `doc-r9` 是否误标 current、`doc-current` 是否漏掉和上下文限定词。</details>

<details><summary>10. 模型回滚了但索引仍把 r9 标 current，问题解决了吗？</summary>

未必；错误索引仍可把 9 B 当现行证据送进旧模型。</details>

<details><summary>11. 私有资料已泄露，回滚能撤销已看到的内容吗？</summary>

不能；还要遏制、核影响范围与按实际责任流程处置。</details>

<details><summary>12. 10 条负反馈中修 8 条，可推出总体准确率吗？</summary>

不能；反馈有自选择偏差、缺总体分母与未反馈抽样。</details>

<details><summary>13. 改提示时继续用已看过的错题当最终未见集，合适吗？</summary>

不合适；已用于开发，需新的独立未见集。</details>

<details><summary>14. 正式批准 R9 后仍回旧版 6 B 一定安全吗？</summary>

不一定；要以当时权威合同为准，不能机械回退资料版本。</details>

<details><summary>15. 候选新 JSON 字段旧消费端不认识，能只上线服务端吗？</summary>

不能直接假定；要有兼容窗口、版本识别与拒绝/回退策略。</details>

<details><summary>16. q-01 平均正确但无权桶出现一次泄漏，继续扩大灰度吗？</summary>

不应；停止硬门失败并查输入、索引与输出权限边界。</details>

### 决策 17–22：事故和长期责任

<details><summary>17. R9 被误标 current，第一步是修改当前 `/v1` 上限吗？</summary>

不是。先停灰度并隔离错误资料/索引/缓存，现行仍为 6 UTF-8 B。</details>

<details><summary>18. 事故调查为何保留 release/索引/资料散列？</summary>

用于重现当时组合、定位第一坏边界和核受影响范围。</details>

<details><summary>19. 只看模型准确率能覆盖引用/权限/成本吗？</summary>

不能；需分层和分桶看证据、硬门、用户结果与资源。</details>

<details><summary>20. 资料撤权后只改主文档，旧答案缓存可继续吗？</summary>

不能；索引、检索、答案和前缀缓存都要按范围失效/核对。</details>

<details><summary>21. 事件复盘只写“模型幻觉”够吗？</summary>

不够；要区分触发变更、第一坏边界、扩大因素、检测与回滚缺口。</details>

<details><summary>22. 本章完成后能声称课程已有生产部署证据吗？</summary>

不能；这里只有静态设计，真实实现、负载、授权和运行观察需由学习者另行记录。</details>

## 本章完成标准与后续路径

能为虚构助手列完整 `release_id` manifest，给固定六题写离线/影子/灰度停止门，解释反馈为何需审阅、回滚为何不能只换模型，并按 R9 误发布纸上事故顺序完成遏制、核影响、修复验证和复盘，才算完成第十四卷。课程其余未展开的单元继续按[总学习路线](../learning_path.md)的先修关系完成。
