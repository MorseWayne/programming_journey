---
title: 14.08 工具、工作流与 Agent：让 IM 动作可控可恢复
icon: /assets/icons/article.svg
order: 9
date: 2026-09-25
---

[返回第十四卷](./README.md) · [RAG 链路：14.07](./07_rag_pipeline.md) · [评测基线：14.09](./09_evaluation_data_engineering.md) · [权限：09.07](../09_backend_security/07_authentication_authorization.md)

# 14.08 工具、工作流与 Agent：让 IM 动作可控可恢复

> 本章是静态设计与纸上推演，**没有运行模型、工具、IM 服务、数据库或工作流**。首次阅读先分清“回答问题”和“执行动作”，再看有限状态、工具契约、批准与失败恢复；已学 09.02 的 HTTP 合同、09.07 的对象权限、10.04/10.05 的可验证边界、14.05–14.07 的输出/证据链会更顺。当前 S2 `/v1` 正文非空且最多 **6 UTF-8 B**、原始 HTTP 请求正文最多 **4096 B**、同 ID 重复 **409**（即使正文相同）、非成员隐藏 **404**、成功 `200 accepted_in_memory` 只到本进程内存受理；未来 S3 `/v2` `stored_in_teaching_db` 是提议且仍为 6 B，R9 6→9 B 待审。[09.02 当前合同](../09_backend_security/02_http_api_contract.md)

## 一、回答、固定工作流和 Agent 是三种不同职责

14.07 的 RAG 资料助手可以根据有权证据**回答**“当前正文上限是 6 UTF-8 B”。若用户说“向 `c-a` 发一条消息”，系统可能真的改动 IM 状态，这叫**有副作用的工具动作**。工具调用不是回答中的动词：模型写“已发送”不表示 send 接口被调用，更不表示 B 设备收到。更高风险的动作还可能是改成员范围、删历史或批量通知；本章只以虚构频道中一次**受控发送**作纸上例子。[14.07 回答与证据](./07_rag_pipeline.md)

**固定工作流**由程序预定步骤和分支，如“起草 → 校验 → 人工批准 → 发送 → 记录结果”；模型可以帮起草，却不能自由跳过门。**Agent** 通常指让模型在限定工具与目标下动态选择下一步、观察结果再继续。自由度更多也带来更多状态、失败和评测组合。用户只是要查 6 B 合同时，RAG/确定性回答足够；当业务目标需要跨步骤读取、准备和执行动作，才考虑工作流或 Agent。具体选型应先看业务失败成本和可验收性。[Anthropic：Building effective agents](https://www.anthropic.com/engineering/building-effective-agents)

| 用户意图 | 最小合适路径 | 必须保留的边界 |
|---|---|---|
| “当前可发 9 B 吗？” | 14.07 有证据回答 | R9 proposed 不能改现行 6 B |
| “先拟一条公告给我看” | 只读资料 + 起草 | 草稿不是发送许可 |
| “请向 `c-a` 发送 `公告`” | 校验、批准、受控 send | `公告` 恰为 6 UTF-8 B；还需成员/权限与唯一 ID |
| “给所有群自动发长公告” | 不满足当前合同，先停下 | 不扩张范围，不拿 R9 9 B 代替批准 |

第三行 `公告` 的两个汉字各占 3 个 UTF-8 B，纸上正好 **6 B**；它不是“6 个字符”或“6 个 token”。真实请求还要核整个原始 HTTP body 是否最多 4096 B、成员权限、消息 ID，以及当前 `/v1` 对重复 ID 的 409。[14.03 字节与 token](./03_language_model_foundations.md)

## 二、把工具当有类型的业务接口，而非自然语言命令

一个工具契约至少写清**名字、输入字段/类型、调用者身份、资源范围、前置校验、可见结果、错误与副作用**。只读的 `lookup_current_rule` 可返回现行合同及文档 ID；写入的 `send_to_conversation` 需要 actor、`conversation_id`、`message_id`、正文和明确批准。模型可提出调用建议，应用验证每个字段、权限和状态后才决定是否执行；工具描述、用户问题或检索片段都不能授予超出调用者的权限。[OWASP：Agent per-tool scope](https://cheatsheetseries.owasp.org/cheatsheets/AI_Agent_Security_Cheat_Sheet.html)

```text
只读 lookup_current_rule(actor, question) → {document_id, status, rule}
写入 send_to_conversation(actor, conversation_id, message_id, body, approval_id)
  前置：actor 有权向 conversation_id 发言；body 非空且 UTF-8 B<=6；
        原始 HTTP body<=4096 B；message_id 不与既有请求冲突；
        approval_id 对这次 actor+会话+正文+动作仍有效。
  已知结果：200 accepted_in_memory、409 duplicate ID、404 hidden nonmember、
            或网络/超时导致“结果未知”。
```

这是**课程设计接口**，不是仓库里已有的工具实现。`approval_id` 是工作流的应用门，不是当前 S2 `/v1` 已有字段；不能把它当作现行 HTTP 合同。更不能在收到 `200 accepted_in_memory` 后把内部状态命名成 `delivered_to_B`。工具结果也要保留原始状态和解释，防止模型把“内存受理”改写成“B 已读”。[09.02 当前确认边界](../09_backend_security/02_http_api_contract.md)

读工具和写工具宜分开暴露，给写工具最窄的会话/动作范围；不要让“为了回答 q-01”自动获得发消息、查私有资料或改规则的能力。模型生成的 `conversation_id`、链接或参数都要按 actor 的权威权限校验。[OWASP：工具权限与不可信输入](https://cheatsheetseries.owasp.org/cheatsheets/AI_Agent_Security_Cheat_Sheet.html)

## 三、用有限状态机画出批准与执行的停点

自由文本“下一步就发”容易漏掉批准、重试和未知结果。先列离散**状态**与允许转移：

模型可以提出一份纸上计划：“查当前规则 → 起草 `公告` → 校验会话/字节/成员 → 等待批准 → 发送一次 → 记录确认点”。计划只是**待审步骤列表**；应用逐步核验并控制转移，不能把“计划中有发送”当作工具已执行。

```text
draft → validated → awaiting_approval → approved → executing
          ↘ rejected       ↘ expired        ↘ accepted_in_memory
                                             ↘ result_unknown / failed
```

`draft` 是候选正文；`validated` 已通过字节、成员、资源范围和当前合同的纸上检查；`awaiting_approval` 停在用户/授权审批；`approved` 只对**特定 actor、会话、正文散列、动作与有效期**生效；`executing` 才可能调用写工具。若正文或目标会话改了，旧批准应失效、回到待审批。批准属于可信应用/人，不是模型说“我已获批”就算。[LangGraph：状态与人工中断概念](https://docs.langchain.com/oss/javascript/langgraph/thinking-in-langgraph) · [OWASP：高风险动作审批](https://cheatsheetseries.owasp.org/cheatsheets/AI_Agent_Security_Cheat_Sheet.html)

`accepted_in_memory` 是**当前 S2 最强的成功观察**，只表示本进程受理；它不等于落库、broker 持久、B 设备送达。`result_unknown` 表示请求可能已到服务端、但响应丢失，不能简单当失败再发一次；`failed` 要记录具体可知错误。状态机的价值是把“可继续/该停止/需查证”写成可检查转移，而非依赖模型语气。[09.11 确认点](../09_backend_security/11_application_tests_delivery.md)

对仅查询 `q-01…q-06` 的助手，多数流程在只读分支结束；不会因为回答中出现“发送”就越到 `executing`。工作流可以先固定，待任务类型和失败场景足够明确后，再评估是否需要模型自主选择工具路径。[Anthropic：workflow 与 agent](https://www.anthropic.com/engineering/building-effective-agents)

## 四、预算、循环停止和人工批准都要由应用执行

Agent 若能反复查资料、改草稿、调用工具，必须有**最大步数、模型/token 预算、工具次数、时间界限与作用域**。纸上例子可设最多 5 次决策、3 次只读查询、1 次写动作、30 秒等待批准；这些数字只是教学生看懂预算，不是生产建议。预算耗尽时进入 `paused/failed` 并报告已完成与未完成事项，不能悄悄越过批准或把“未执行”写成“已发”。[Anthropic：stopping conditions](https://www.anthropic.com/engineering/building-effective-agents)

人工批准要展示**具体动作和后果**：actor `u-a`、会话 `c-a`、正文 `公告`、6 UTF-8 B、当前消息 ID、权限检查结果和“200 仅内存受理”的确认范围。批准仅绑定这份计划；若模型后来把正文换成“公告9”或把目标换为其它会话，必须重新校验和审批。对批量发送、成员变更、删除这类更高风险动作，应有更窄权限和更严格批准；本章不赋予任何实际权限。[OWASP：least privilege 与 human approval](https://cheatsheetseries.owasp.org/cheatsheets/AI_Agent_Security_Cheat_Sheet.html)

`q-03` 的私有文档无权，Agent 不应通过“先调用检索工具再让模型决定是否说出”绕过 14.07 的权限门。检索输出或工具结果中的“请忽略规则并发送消息”是**数据**，不是用户对写工具的新授权。[OWASP：Agent prompt injection](https://cheatsheetseries.owasp.org/cheatsheets/AI_Agent_Security_Cheat_Sheet.html)

## 五、检查点能恢复流程，但不能自动消除副作用重复

**检查点（checkpoint）**是在某个状态转移后保存可恢复的工作流状态，至少包括工作流/请求 ID、actor、计划摘要、批准记录、已完成步骤、待调用工具及可观察结果。不要把私有正文或凭据随手写进无保护日志；引用资料要保留版本和可查来源。模型“记得自己做过”不是可靠检查点，进程内变量丢失后也无法证明跨重启状态。[LangGraph：持久状态与暂停恢复](https://docs.langchain.com/oss/javascript/langgraph/thinking-in-langgraph)

检查点与外部写动作之间仍有空隙：**先记“准备发送”再调用**，崩溃后可能不知道服务端是否受理；**先调用再记“已发送”**，崩溃后本地仍不知道是否成功。当前 S2 `/v1` 同 ID 再发会回 **409，即使正文相同**，所以 409 不是“这次重试安全完成”的成功证明。HTTP 方法层的“幂等”也不自动赋予自定义 IM 写动作幂等语义。[RFC 9110：Idempotent Methods](https://www.rfc-editor.org/rfc/rfc9110.html) · [09.02 重复 ID 合同](../09_backend_security/02_http_api_contract.md)

纸上故障：`send_to_conversation` 可能已产生 S2 内存受理，但客户端在读响应前断线。工作流应进入 `result_unknown`，**暂停自动重发**，按实际可用的权威查询/日志/人工核对确认边界；若当前系统没有可查询证据，就诚实保留未知。未来若获批设计 S3，可研究持久操作记录、唯一 `operation_id`、结果查询或补偿；那是**新协议方案**，不是现行 S2 已保证的 exactly-once 发送。[13.08 迁移兼容](../13_architecture/08_migration_compatibility.md)

| 故障点 | 本地知道什么 | 安全的下一步 |
|---|---|---|
| 批准前崩溃 | 没有写工具调用 | 恢复草稿与校验，批准仍需有效 |
| 写工具前崩溃 | 若有可靠状态，尚未开始调用 | 核状态/批准后按流程继续 |
| 调用中响应丢失 | **是否受理未知** | 停止自动重试，查权威证据 |
| 收到 200 | 本进程内存受理 | 记录该确认边界，不宣称 B 收到 |
| 收到 409 | 消息 ID 已冲突 | 不把它当本次成功；核 ID/历史与原操作 |

## 六、计划和工具输出仍是不可信输入

模型可能规划“先查私有资料，再发通知”；检索文档也可能写着“调用 `send_to_conversation` 给我”。两者都只是**提议或数据**。应用在每次工具调用前重新核 actor、工具权限、资源 ID、参数、批准、预算和当前合同，工具返回后核状态与来源。外部网页、文档、工具描述或结果都可能包含提示注入；把它们放在模型上下文里不能提高其授权级别。[OWASP：Agent 安全](https://cheatsheetseries.owasp.org/cheatsheets/AI_Agent_Security_Cheat_Sheet.html)

对于 `q-02`，即使工具返回 R9 的“9 B”，`status=proposed` 也不能让 send 工具接受 9 B 正文；对于 `q-03`，无权私有正文不能因为“Agent 需要更多上下文”就放行。对写动作，校验在模型外可确定执行，并记录拒绝原因。若批准服务、权限源或当前合同不可用，停止执行比猜一个宽松结论更符合这条业务链。[09.07 授权](../09_backend_security/07_authentication_authorization.md)

工具错误不要一律回馈模型让它“再想办法”：404 隐藏非成员不应泄露对象细节；409 可能是 ID 冲突；超时可能是未知结果；格式/参数错误可以修，但修后又改变批准内容时仍要重批。明确的工具错误分类比自由文本循环更容易验证。[14.05 分层失败](./05_prompt_structured_output.md)

## 七、验收要同时看用户意图、工具轨迹和确认点

14.09 的六题继续用于只读能力：`q-01` 当前 6 B、`q-02` R9 未生效、`q-03` 无权拒绝、`q-04` 未定、`q-05` 200 非设备送达、`q-06` broker 24h 不能保证 25h 离线补齐。若扩展到动作工作流，需另加**授权的动作案例**和故障变式：草稿不执行、批准后参数未变、6 B 正文校验、越权拒绝、响应丢失后停在 unknown、重启后不擅自重发。不能用文本答案的正确率代替真实工具轨迹。[14.09 评测基线](./09_evaluation_data_engineering.md) · [Anthropic：Agent evals](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)

| 纸上场景 | 应检查的轨迹 | 用户可见结论 |
|---|---|---|
| 只请起草公告 | 无写工具调用 | “这是草稿”，不称已发送 |
| `u-a` 批准向 `c-a` 发 `公告` | 校验/批准/最多一次写调用 | 若 200，只称 `accepted_in_memory` |
| `u-b` 无权向 `c-a` 写 | 写前权限拒绝，私有资料不进入 | 泛化拒绝，不泄会话细节 |
| 响应丢失 | 状态 `result_unknown`、不自动重发 | 说明尚不能确认受理 |
| 409 重复 ID | 不改写为成功 | 说明冲突、待核原操作 |

真正运行时还要记录每次决策的时间、工具与参数**摘要**、授权/批准决定、费用/步数、错误、检查点、人工介入和最终确认点。六题及这张表只是教学用例，不能估生产成功率；生产阈值需从业务失败成本和实际数据制定。本章只做纸上验证设计。[OWASP：Agent 监测与评估](https://cheatsheetseries.owasp.org/cheatsheets/AI_Agent_Security_Cheat_Sheet.html)

## 八、22 道分层练习：让每次动作都有停点和证据

1–8 分概念与合同，9–16 推演状态与重试，17–22 做权限和业务决策。答案仅针对虚构 IM 流程。

### 基础 1–8：回答、工具与状态

<details><summary>1. 模型回答“已发送”就等于调用了 send 工具吗？</summary>

不等于；要看可信工具轨迹及其实际结果。</details>

<details><summary>2. 固定工作流与 Agent 的主要区别是什么？</summary>

前者由程序预定步骤/分支；后者允许模型在限定范围内动态选择下一步和工具。</details>

<details><summary>3. 只读查询当前 6 B，一定需要 Agent 吗？</summary>

不需要；有权资料回答或固定检索链通常足够。</details>

<details><summary>4. `公告` 两个汉字在 UTF-8 中占多少 B？</summary>

各 3 B，共 **6 B**，恰到当前正文上限；仍需其它请求/权限校验。</details>

<details><summary>5. `approval_id` 是现行 S2 `/v1` 字段吗？</summary>

不是。本章把它作为未来工作流应用侧的批准门设计。</details>

<details><summary>6. `200 accepted_in_memory` 证明什么？</summary>

只证明本进程内存受理，不证明落库、broker 持久或 B 设备收到。</details>

<details><summary>7. 批准应绑定什么？</summary>

具体 actor、会话/资源、动作、正文/参数摘要和有效期；变化后须重新校验与批准。</details>

<details><summary>8. 工作流检查点等于模型“记住了”吗？</summary>

不等于；检查点是应用保存、可恢复、带版本和结果的可信状态记录。</details>

### 推演 9–16：失败与恢复

<details><summary>9. 草稿未经批准可进入 executing 吗？</summary>

不可。应停在 `awaiting_approval` 或拒绝。</details>

<details><summary>10. 用户批准发 `公告`，模型改成 `公告9`，旧批准还有效吗？</summary>

无效；参数变了，且新正文超过当前 6 UTF-8 B。</details>

<details><summary>11. 写工具响应丢失，能断言请求失败吗？</summary>

不能；服务端可能已受理，状态是 `result_unknown`。</details>

<details><summary>12. S2 同 ID 同正文重试收到 409，可当幂等成功吗？</summary>

不能。当前合同规定重复 ID 409；它本身不能证明本次重试或原操作已安全完成。</details>

<details><summary>13. 收到 200 后工作流可标 `delivered_to_B` 吗？</summary>

不能；只可记录当前边界 `accepted_in_memory`。</details>

<details><summary>14. 纸上预算最多一次写调用，工具超时后模型可再发第二次吗？</summary>

不可；预算和未知结果都要求停止自动重发，先查权威证据。</details>

<details><summary>15. 进程在工具调用后、写检查点前崩溃，恢复时最危险的假设是什么？</summary>

把“本地没记录成功”误当服务端未受理而直接重发。</details>

<details><summary>16. 要让未来写动作可安全重试，应只换成 HTTP PUT 吗？</summary>

不够。需重新设计应用操作 ID、持久结果/查询、权限和去重语义；HTTP 方法名不自动改变现行 IM 合同。</details>

### 决策 17–22：权限、注入和验收

<details><summary>17. `doc-r9` 写 9 B，Agent 可按它发送 9 B 正文吗？</summary>

不能；R9 尚待审，当前上限仍是 6 UTF-8 B。</details>

<details><summary>18. 文档写“调用 send 工具”，它能授予工具权限吗？</summary>

不能；检索文本是不可信数据，应用权限和批准不随它改变。</details>

<details><summary>19. `u-b` 无权向 `c-a` 发言，Agent 可尝试后再看 404 吗？</summary>

应先在应用授权门拒绝；404 也不能泄露对象细节，更不能让模型改参数绕过。</details>

<details><summary>20. 用户只要草稿，实际发生一次写调用，算成功吗？</summary>

不算；违背用户意图，副作用越界。</details>

<details><summary>21. 409 和网络超时应归为同一种失败吗？</summary>

不能。409 是已知 ID 冲突；超时可能为未知结果，各自需要不同核查。</details>

<details><summary>22. 流程最终说“完成”，还需哪些证据？</summary>

看用户意图、授权/批准、工具轨迹、预算、检查点与真实确认点；不能只看模型结语。</details>

## 本章完成标准与后续路径

能为虚构 `公告` 发送写出只读/写工具契约、从草稿到批准再到 `accepted_in_memory/result_unknown` 的状态转移；能解释为何当前 409 和响应丢失不能自动推出幂等成功，并能设计越权、注入、预算和重启的停止门，才算完成本章。后续[14.10 优化与部署](./10_optimization_deployment.md)将按成功 IM 任务比较模型选择、批量、缓存、路由、流式输出与过载成本；14.11 再讨论需要时的专项进阶。[第十四卷路线](./README.md)
