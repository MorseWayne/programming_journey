---
title: 09.09 异步与长任务：提交历史导出后如何查询和取消
icon: /assets/icons/article.svg
order: 10
date: 2026-09-24
---

[返回第九卷](./README.md) · [当前 HTTP 合同：09.02](./02_http_api_contract.md) · [授权前置：09.07](./07_authentication_authorization.md) · [任务前置：08.09](../08_distributed/09_reliable_jobs_scheduling.md) · [状态与补偿：08.08](../08_distributed/08_cross_service_transactions.md)

# 09.09 异步与长任务：提交历史导出后如何查询和取消

> DeepTutor 八节初稿经技术与教学审阅后的静态课程。`u-b/c-a/exp-9`、`/v3`、任务状态、取消与故障均是**脱敏的纸上 API 提议**，没有实现或运行 Go、HTTP 服务、数据库、对象存储、后台 worker、浏览器或站点。当前 S2 `/v1` 的消息 POST 仍为 `200 accepted_in_memory`；未来 S3 `/v2` 的 `200 stored_in_teaching_db` 仍是[教学合同建议](./12_im_service_capstone.md)。本章 `/v3` 导出接口是另一个待评审功能，不改变它们。

## 一、为什么“导出 c-a 历史”不该占住一次 HTTP 请求

虚构 `u-b` 仍有 `c-a` 的读取权限，想导出截至 `seq=9` 的有权聊天历史。数据可能多、生成文件可能慢，客户端连接也会超时；让一个 POST 一直等待最终文件，无法清楚回答“服务端没开始、正在做、做完但回应丢、还是被取消”。这里**先定义用户动作**：B 提交导出意图，随后可查进度、必要时请求取消，完成后在仍有权限的条件下取结果。`u-c` 虽登录却不是成员，不能靠猜 operation ID 看出私有会话或取得文件。[09.01 需求与应用边界](./01_requirements_boundaries.md) · [09.07 对象授权](./07_authentication_authorization.md)

本章选择一个**新纸上接口版本** `/v3`，并把导出与发消息分开。当前发消息的 S2 合同仍是正文非空且最多 **6 UTF-8 字节**、总请求最多 **4096 B**、相同消息 ID 即使同正文重复也 **409**、非成员目标隐藏 **404**；待审 R9 的 9 字节限额尚未生效。导出请求有自己的格式、范围与大小预算，不能借发消息的 6 字节规则，也不能借 `202` 暗改 `/v1` 发送响应。[09.02 当前接口](./02_http_api_contract.md) · [10.09 待审 R9](../10_engineering/09_ci_artifacts.md)

**异步**只表示当前 HTTP 响应不等待整个工作完成，不表示工作“天然可靠”。可靠性要由稳定身份、持久状态、worker 领取、结果未知恢复、授权和保留策略组成。[08.09 可靠任务](../08_distributed/09_reliable_jobs_scheduling.md)

## 二、202、Location 与状态资源：一个可读的纸上合同

设计 `POST /v3/conversations/c-a/exports`，请求体只含有界的 `format=jsonl`、`before_seq=9` 等范围参数，并带由 B 为**这次导出意图**稳定保存的 `Idempotency-Key`。服务端先以可信登录主体核对 B 当前对 `c-a` 的权限，再在**同一本地数据库事务**里保存操作 `exp-9/QUEUED` 与可靠的待调度意图；已知 Commit 后才答 **202 Accepted**。RFC 9110 的 202 只表示请求被接受用于处理，处理尚未完成，未来仍可能失败或被拒绝；响应宜指向状态监视资源。[RFC 9110 §15.3.3](https://www.rfc-editor.org/rfc/rfc9110.html)

```text
POST /v3/conversations/c-a/exports
Idempotency-Key: export-c-a-b-1
{"format":"jsonl","before_seq":9}

202 Accepted
Location: /v3/operations/exp-9
Cache-Control: no-store
{"operation_id":"exp-9","state":"QUEUED","status_url":"/v3/operations/exp-9"}
```

`Location` 和响应体的状态 URL 是**本章主动制定的 API 合同**，不是 RFC 规定所有 202 一律必须返回某个 URI。客户端 `GET /v3/operations/exp-9` 在授权后得 **200** 与当前状态、阶段/更新时间、可解释错误类别和下一动作；状态仍是 `RUNNING` 时没有“下载成功”字段。`SUCCEEDED` 后可返回受保护的 `result_url=/v3/exports/exp-9/result`，该下载端点还要再次鉴权。也可另设计 303 到结果资源，但必须明确转向与权限语义，不能把 303 当作任务已经持久化的替代证据。[RFC 9110：202/Location/303](https://www.rfc-editor.org/rfc/rfc9110.html)

私有导出状态/结果响应使用 `Cache-Control: no-store` 降低正常缓存保存风险；RFC 9111 同时提醒 `no-store` **不足以单独保证隐私**，身份验证、对象授权、传输保护和结果访问控制仍必要。[RFC 9111 no-store](https://www.rfc-editor.org/rfc/rfc9111.html)

## 三、幂等键、请求指纹与“202 回应丢了”的边界

本章为 `/v3` **提议**的重复提交规则：在明确保留窗口内，把可信 `user_id=u-b`、`Idempotency-Key=export-c-a-b-1` 与**规范化请求指纹**绑定。相同主体/键/参数重试，返回**同一个 `exp-9`**和它的**当前**状态链接；键相同但 `conversation_id/format/before_seq` 等参数不同，返回 **409 幂等键冲突**，不复用旧文件，也不新建第二个任务。键要限制到受信主体和资源范围，不能让 `u-c` 通过碰撞键发现 B 的 `exp-9`。保留窗口过后怎样查询旧操作或重开导出须写入合同，不能默默把过期键当全新任务。[09.07 身份与对象权限](./07_authentication_authorization.md)

若服务端**已持久创建** `exp-9`，却在给 B 的 202 回应写出前断线，B 的观察是**结果未知**。B 应沿原幂等键重试或查自己可访问的操作记录，不换新键盲目创建另一个导出。服务端在同一 SQL 提交边界内保存操作与待调度意图，避免“答 202 了但只在内存里排过一次”；worker 的后续领取、外部文件生成和完成写入仍可失败/重复，需另用 08.09 的稳定任务身份与版本条件更新。[08.01 超时](../08_distributed/01_system_partial_failure.md) · [08.09 W1/W2 接管](../08_distributed/09_reliable_jobs_scheduling.md)

**别把两个 409 混成一个 API。** 当前 S2 消息 `message_id` 重复，即使正文相同也按原合同 409；本章新 `/v3` 的同幂等键**相同规范请求**才复用 `exp-9`，不同规范请求才 409。这是另一个资源、另一个版本、另一个用户承诺，没有修改 `/v1` 或拟议 `/v2` 的发送语义。

## 四、持久操作状态：状态查询不是“用户已下载”

纸上操作状态可从 `QUEUED` 经 worker 领取到 `RUNNING`，临时依赖故障进入 `RETRY_AT`，人工修复需要 `FAILED_REPAIR`，成功且结果引用已安全发布后才到 `SUCCEEDED`；取消相关状态下一节讲。每次状态转移带持久 `operation_id`、worker/attempt、租约代次、当前状态/版本条件，避免旧 worker 迟到把新结果覆盖。进度字段只能报告**确实可量测**的阶段或处理数，不能杜撰“90%”让用户误以为剩余时间可保证。[08.09 任务状态](../08_distributed/09_reliable_jobs_scheduling.md)

| 状态 | 此刻可以说什么 | 仍不能说什么 |
|---|---|---|
| `QUEUED` | 操作及可靠调度意图已存 | worker 已运行、文件已创建 |
| `RUNNING` | 某一有效 worker 正按租约推进 | 本次尝试不会重复或无外部效果 |
| `RETRY_AT` | 暂时错误已分类并有下一尝试时间 | 必然在某固定时间完成 |
| `FAILED_REPAIR` | 自动预算耗尽/永久错误有责任待修 | 消息历史或用户权限已被改变 |
| `SUCCEEDED` | 受保护的结果引用已被操作记录确认 | B 已下载、打开或阅读文件 |

若 worker 已写出临时导出物 `artifact_id=exp-9-part1`，却在把操作标 `SUCCEEDED` 前失联，下一 worker 看到的是**外部结果未知**；要按稳定 artifact 身份查结果/完整性、处理部分文件，再条件更新或安全重试，不能每次生成一个不可追踪的公开文件。导出文件与操作记录若在不同系统，二者也没有因同一个 Go 函数而自动原子；保留清理/孤儿文件对账责任。[08.08 跨服务结果未知](../08_distributed/08_cross_service_transactions.md)

WebSocket 或推送“导出好了”的事件只作**唤醒提示**：可能丢、重投或早于浏览器看到的状态。客户端以有权 `GET /v3/operations/exp-9` 获取当前操作状态；下载是另一条有权读取，不由提示本身承诺私有文件已可见。

## 五、请求取消≠已经停工：两个终态谁先赢

另提 `POST /v3/operations/exp-9/cancel`。授权后用状态/版本条件把非终态原子变为 `CANCEL_REQUESTED`，可返回 **202** 与状态 URL，含义是“取消请求已持久接受”，**不是**“worker 已停、临时文件已清或历史消息被撤销”。worker 观察取消，停止可停步骤、清理未发布私有产物，经条件更新才标 `CANCELED`。Go `context` 取消可协助本机任务尽快停止，却不等待所有工作结束，也不能撤回已经写入对象存储或被用户下载的结果。[Go context CancelFunc](https://pkg.go.dev/context) · [RFC 9110 的 202](https://www.rfc-editor.org/rfc/rfc9110.html)

| 竞态 | 原子裁决 | 对 B 的可解释结果 |
|---|---|---|
| 取消先赢，`RUNNING→CANCEL_REQUESTED` | 后续 worker 不可再无条件发布 `SUCCEEDED`；清理后 `CANCELED` | “取消中”，直到终态确认 |
| 成功先赢，`RUNNING→SUCCEEDED` | 迟到取消不得把已发布文件状态伪改成 `CANCELED` | 返回现有 `SUCCEEDED` 或明确终态冲突（如本题 409） |
| 取消/完成时外部文件结果未知 | 先查稳定 artifact ID 与可见/权限状态，防泄露和孤儿 | 显示处理中/待修，不报告确定已取消 |

本题选 `409 ALREADY_TERMINAL` 作为“成功先于取消”的**纸上合同决定**，不是 HTTP 标准强制的唯一映射；也和当前 S2 消息重复 409 是不同原因。取消不能删除权威 `c-a` 聊天历史；它只控制这次**导出操作**。若私有文件已被下载，之后撤销链接也不能让 B 忘记内容，须按数据治理/访问事件记录事实，不能以 `CANCELED` 粉饰。[08.08 不可撤销效果](../08_distributed/08_cross_service_transactions.md)

## 六、权限要查三次：提交、执行、下载

B 提交导出时核对当前身份与 `c-a` 对象权限；worker 执行时再核对 B 是否仍有权读取计划范围，必要时设一份一致的数据快照边界，避免分页时消息集合变化而重复/缺页；下载时仍要核对 B 的当前权限和导出物范围。**提交时有权不等于执行/下载时永远有权**：若 B 中途退群或消息撤回，应按产品可见政策中止、过滤或重建导出，且不能在旧权限下保留可公开访问的结果。`u-c` 非成员，即使猜到 `exp-9` 或文件 URL，也应按隐藏目标政策返回 **404**，不泄露私有状态/正文。[09.07 对象授权](./07_authentication_authorization.md) · [06.12 历史分页](../06_databases/12_database_business_case.md)

`before_seq=9` 定的是会话业务范围，不是 SQL 事务快照、broker offset 或对象存储版本；导出的一致性边界须另定义，例如开始执行时取得受控 SQL 快照/水位，并记录来源与授权政策。若当前 S2 根本没有持久 SQL 历史，本章纸上导出只在未来数据能力具备后才有可执行数据源，不能声称现有服务已经可导出崩溃后历史。[08.10 不同版本与快照轴](../08_distributed/10_membership_evolution.md)

导出物是私有数据：结果端点持续鉴权、限制保留时间、受控存储/链接、正常缓存 `no-store`、到期清理与孤儿文件对账；日志只留脱敏操作 ID、范围/阶段和错误，不记录正文或长效下载凭据。`no-store` 是缓存提示，不可替代授权或传输保护。[RFC 9111 缓存边界](https://www.rfc-editor.org/rfc/rfc9111.html)

## 七、用户反馈与值班证据：轮询可用，提示可丢

客户端拿到 `Location` 后按**有界退避、抖动和服务端限流预算**轮询状态，不要把“导出中”页面做成每个用户每毫秒一次 GET。服务器可在响应体提供本题 `next_poll_after_seconds` 作为建议，客户端还要处理断网/401/404/终态与超时。WebSocket 事件可让客户端提前再查一次，但掉线后仍要能靠 GET 恢复。UI 分开显示排队、运行、取消中、完成可下载、失败待修；收到 202 时不能提前显示“导出成功”。[RFC 9110 202 状态监视](https://www.rfc-editor.org/rfc/rfc9110.html) · [07.09 最老未完成年龄](../07_cache_messaging/09_backlog_poison_messages.md)

值班至少看 `QUEUED/RUNNING/RETRY_AT/FAILED_REPAIR/CANCEL_REQUESTED` 的数量与**最老年龄**、worker 租约接管/旧代次拒绝、同幂等键冲突、外部 artifact 未知/孤儿、取消清理结果、授权拒绝与过期下载次数。一次“队列清零”不等于 B 能拿到经授权的正确文件；应核对最终范围、ID 集与权限。任务记录和产物的保留窗口需要同时公布，避免用户收到 `exp-9` 却在状态已清理后无法解释结果。[11.03 日志、指标与 Trace](../11_reliability/03_logs_metrics_traces.md)

固定 `openimsdk/open-im-server` 提交 `f6411a8a1a31d3df36f4c2b3ad28481a94141e1f` 中，[`send.go` 所述发送路径](https://github.com/openimsdk/open-im-server/blob/f6411a8a1a31d3df36f4c2b3ad28481a94141e1f/internal/rpc/msg/send.go#L46-L70)调用 `MsgToMQ` 后返回；[另一路 MongoDB 消费处理](https://github.com/openimsdk/open-im-server/blob/f6411a8a1a31d3df36f4c2b3ad28481a94141e1f/internal/msgtransfer/online_msg_to_mongo_handler.go#L43-L69)调用 `BatchInsertChat2DB`。这些局部源码不证明存在本章 `/v3` 导出、`exp-9` 状态资源或取消语义；要研究实际 OpenIM 的异步 API，应另按固定提交追对应 handler/服务/配置，不能把本教学接口当成真实项目已有功能。[OpenIM 阅读地图](../im_reference.md)

## 八、交付 API 例子与 22 道分层练习

第一遍交 POST/GET/结果三份请求响应和“202 到底承诺什么”；第二遍交幂等键冲突、回应丢失、worker 接管、取消与成功竞态、退群与文件清理的状态转移表。以下题目先预测，再展开反馈。

### 基础 1–8：接口语义

<details><summary>1. 当前 S2 发消息的 200 可改写成导出任务 202 吗？</summary>

不能。当前消息 `/v1` 仍 `accepted_in_memory`；本章是另一个未部署 `/v3` 导出接口。</details>

<details><summary>2. 本章 202 表示文件已生成可下载吗？</summary>

不表示。只说明导出操作已被接受用于处理，当前任务仍可能排队/失败/取消。</details>

<details><summary>3. 202 响应的 `Location` 在本题指向哪里？</summary>

`/v3/operations/exp-9`，供有权用户查询任务当前状态。</details>

<details><summary>4. `GET /v3/operations/exp-9` 的 200 可证明 B 已下载吗？</summary>

不能。它只返回操作资源状态，下载是另一次有权读取。</details>

<details><summary>5. 本章导出正文受当前发消息的 6 字节限额吗？</summary>

不按同一字段规则。导出参数须有自己的有界校验，S2 发消息 6 字节合同不变。</details>

<details><summary>6. 同一 B、同一幂等键、相同规范请求在保留窗重试，目标是什么？</summary>

复用同一 `exp-9`，返回其当前状态而非新建第二个导出。</details>

<details><summary>7. 同一幂等键改 `before_seq` 后再发，本题返回什么？</summary>

409 幂等键冲突；不能把不同请求偷偷指向旧文件。</details>

<details><summary>8. `Cache-Control: no-store` 能单独保证私有导出不泄露吗？</summary>

不能。仍需身份、对象授权、传输保护和结果存储权限。</details>

### 故障与取消 9–16：问谁先提交

<details><summary>9. 操作 exp-9 已入库，202 回应丢，B 能断言没创建吗？</summary>

不能。沿原幂等键/有权操作记录核对，不换键盲目再创建。</details>

<details><summary>10. 只把 exp-9 放进进程内 channel 就答 202，重启后有什么问题？</summary>

任务可能丢失，状态 URL 也无可恢复工作；需持久记录与可靠调度意图。</details>

<details><summary>11. worker 写出临时 artifact 后状态写入丢了，应直接生成公开新文件吗？</summary>

不应。按稳定 artifact ID 查结果/完整性并处理部分文件、孤儿与条件更新。</details>

<details><summary>12. 取消接口答 202 就能显示 `CANCELED` 吗？</summary>

不能。它只持久接受取消请求，worker 清理/停止后才进入取消终态。</details>

<details><summary>13. `SUCCEEDED` 先于取消条件更新提交，本题怎样答迟到取消？</summary>

保留 `SUCCEEDED`，按本题合同返回明确终态冲突（如 409 ALREADY_TERMINAL），不伪改为取消。</details>

<details><summary>14. `CANCEL_REQUESTED` 先赢，旧 worker 可无条件发布 `SUCCEEDED` 吗？</summary>

不能。状态/版本条件更新应拒绝旧结果，并清理不能对外公开的临时物。</details>

<details><summary>15. Go `context` 取消能收回用户已下载的文件吗？</summary>

不能。取消是协作信号，不是对外部已发生效果的回滚。</details>

<details><summary>16. WebSocket 提示“完成”丢了，客户端还能怎样恢复？</summary>

用 `Location` 指向的有权 GET 状态资源查询，提示只是唤醒。</details>

### 权限与交付 17–22：让结果仍然属于有权用户

<details><summary>17. B 提交时有权、执行中退群，worker 能继续按旧资格导出吗？</summary>

不能无条件继续。要按当前可见政策中止、过滤或重建，并保护已写部分文件。</details>

<details><summary>18. `u-c` 猜中 `exp-9`，可读取状态或结果吗？</summary>

不能。已登录不等于有 `c-a` 权限；本题按隐藏目标政策 404。</details>

<details><summary>19. `before_seq=9` 就等于数据库一致快照的事务 ID 吗？</summary>

不等于。它只限定会话业务范围，导出一致性快照另定义。</details>

<details><summary>20. 文件已 `SUCCEEDED`，B 下载时权限被撤销，还能凭旧 URL 取文件吗？</summary>

不能。结果端点重新授权并可撤销/过期链接，不沿用提交时资格。</details>

<details><summary>21. 固定 OpenIM 两段源码能证明 `/v3` 导出接口存在吗？</summary>

不能。只核对所述发送入队返回与另一 MongoDB 消费路径。</details>

<details><summary>22. 本章 API 何时可算交付可评审？</summary>

POST/GET/cancel/result 合同、幂等/保留、状态转移、权限/缓存、故障与清理证据齐全；真实运行结果另记。</details>

## 本章完成标准与下一步

能不看答案解释 202 为什么不等于完成、相同/不同请求怎样使用幂等键、回应丢失与取消竞态如何查状态、提交/执行/下载为何都要授权，才算完成第一轮。未来学习者在隔离环境实现后还须记录真实 worker、外部文件、浏览器和权限故障证据。下一章 [09.10 协议兼容与 RPC](./10_protocol_compatibility_rpc.md) 将把 Protobuf/RPC 与客户端版本协商、弃用流程接回同一 IM 接口体系。
