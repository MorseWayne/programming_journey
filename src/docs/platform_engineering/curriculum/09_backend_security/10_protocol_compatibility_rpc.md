---
title: 09.10 协议兼容与 RPC：能解析消息不代表业务安全
icon: /assets/icons/article.svg
order: 11
date: 2026-09-24
---

[返回第九卷](./README.md) · [HTTP 合同前置：09.02](./02_http_api_contract.md) · [请求链前置：09.04](./04_request_pipeline.md) · [异步接口前置：09.09](./09_async_long_tasks.md) · [事件演进前置：08.10](../08_distributed/10_membership_evolution.md)

# 09.10 协议兼容与 RPC：能解析消息不代表业务安全

> DeepTutor 八节初稿经技术与教学审阅后的静态课程。`MessageEvent` 字段、`event_v1/v2`、RPC 接口与混部时间线均为**脱敏的纸上教学方案**；没有运行 Go、protoc、gRPC、数据库、OpenIM 或站点。当前 S2 `/v1` 的消息 POST 仍是 `200 accepted_in_memory`，正文最多 **6 UTF-8 字节**、总请求最多 **4096 B**、同 ID 即使同正文重复 **409**、非成员目标隐藏 **404**；未来 S3 `/v2` 的 `stored_in_teaching_db` 仍是提议，R9 的 6→9 字节变化尚待批准。[09.02 当前合同](./02_http_api_contract.md) · [10.09 R9 证据](../10_engineering/09_ci_artifacts.md)

## 一、四条“版本轴”：同叫 v2，改的却不是一件事

虚构 A 发 `m-9/c-a/seq9`，之后合法编辑为 `m-9:v2`。业务跨 HTTP 客户端、网关、RPC、broker 事件、SearchIndex 和 B 设备；每一段都可能在滚动升级时有旧/新程序共存。若一句“升级到 v2”没有说是哪条轴，旧消费者也许能解析新字节，却按旧规则覆盖索引或泄露正文。[08.10 三轴演进](../08_distributed/10_membership_evolution.md)

| 版本轴 | 本系列例子 | 变更的承诺 |
|---|---|---|
| HTTP 业务接口 | 当前 S2 `/v1` → **拟议** S3 `/v2` | 200 从内存受理到本地教学 DB 提交，须新合同/兼容矩阵 |
| 另一个 HTTP 功能 | **纸上** `/v3` 历史导出 exp-9 | 202、状态/取消/结果；不修改消息 POST |
| Protobuf/RPC 与事件线格式 | 教学 `event_v1` → `event_v2` | 字段编号、存在性、生产/消费解释与重放 |
| 消息业务版本 | `m-9:v1` → `m-9:v2` | 同一 `message_id/seq9` 的当前内容与权限/撤回状态 |

`evt:m-9:v1` 的稳定事件 ID 里的 v1 指**消息版本**，不自动等于教学 `event_v1` 线格式。broker P0:42 是分区位置，Raft index12 是另一个复制日志位置，也不能从名字推导协议版本。初学者先画“谁写、谁读、是否会重放”，再设计字段。[07.08 顺序与位置](../07_cache_messaging/08_order_concurrent_consumption.md)

## 二、Protobuf 字段编号、`optional` 与未知字段的前置

给一个**不冒充 OpenIM 实际 `.proto`** 的教学二进制消息：

```proto
syntax = "proto3";
message MessageEvent {
  string message_id = 1;
  string conversation_id = 2;
  int64 seq = 3;
  optional int64 message_version = 4; // 教学 event_v2 新增
  optional bool visible = 5;          // 教学 event_v2 新增
}
```

Protobuf 的**字段号**参与二进制识别：在已使用消息类型里不能随意改号、重用旧号；删除字段后按官方规则 `reserved`，防以后把相同编号解释成别的含义。`optional` 让接收者能区分“字段没有出现”与“明确传了默认值 0/false”；非 optional 的 proto3 标量默认值常不能表达这种区别。对旧 `event_v1` 缺少 `message_version/visible`，新消费者应按明确安全政策查询当前权威消息或拒绝无证据的敏感效果，不能把默认 0/false 当作事实版本和权限。[Protobuf proto3 字段/存在性](https://protobuf.dev/programming-guides/proto3/)

添加新字段在 Protobuf **二进制线格式**上通常安全：旧解析器可跳过不认识的字段；但“能 parse”不等于“旧业务逻辑会执行新规则”。旧 SearchIndex 若忽略 `message_version`，迟到 `m-9:v1` 可覆盖当前 v2；忽略可见性又可能索引无权内容。Proto3 二进制消息可保存未知字段，**转成 ProtoJSON 或逐字段复制**可能丢掉它们；ProtoJSON 对未知字段的解析政策也要单独核对，不能把二进制保证套到 JSON 网关。[Protobuf 更新消息类型与未知字段](https://protobuf.dev/programming-guides/proto3/) · [ProtoJSON 规范](https://protobuf.dev/programming-guides/json/)

字段“默认值”要与业务缺失语义配套：`message_version=0` 若表示未知，不得被写入目标索引成“比所有合法版本旧且可忽略”，从而让 E9 的必要效果静默漏掉；`visible=false` 若是缺字段的安全拒绝默认，也要提供可修复/查询权威的路径，不能把所有旧消息永久隐藏。[07.11 旧事件与当前版本](../07_cache_messaging/11_derived_views_event_time.md)

## 三、RPC deadline 与重试：状态码不是数据库决议

纸上请求链是 `HTTP handler → 内部 gRPC SendMsg → 消息业务/存储`。gRPC 客户端应设置有依据的 deadline；超过期限可能得到 `DEADLINE_EXCEEDED`，但 gRPC 官方明确说明：**对会改变系统状态的操作，这个错误也可能在操作已经成功后返回**。服务端收到取消信号，应尽力停止相关本机工作，却不能把已提交 SQL、broker 发布或设备外部效果自动回滚。[gRPC Deadlines](https://grpc.io/docs/guides/deadlines/) · [gRPC Status Codes](https://grpc.io/docs/guides/status-codes/)

gRPC 有可配置重试及一些“确认服务端未处理”的透明重试；是否重试、哪些码、次数和退避要看实际客户端配置。官方文档说收到**RPC 响应头**后，该 RPC 对 gRPC 重试机制而言已 *committed*、不再继续自动重试。这个词是**传输重试阶段**，不是未来 S3 的 SQL `Commit`、broker ACK 或 B 已收。业务重试仍要携带稳定 `client_msg_id/message_id` 并按服务端合同查询结果，不能因 `DEADLINE_EXCEEDED` 就换随机 ID 重建一条消息。[gRPC Retry](https://grpc.io/docs/guides/retry/) · [08.01 结果未知](../08_distributed/01_system_partial_failure.md)

当前 S2 同消息 ID 的第二次 POST **无论正文是否相同仍返回 409**；拟议 S3 是否提供“查旧结果”或新的幂等响应须另审兼容版本。09.09 新 `/v3` 导出的同 `Idempotency-Key` 相同指纹复用 `exp-9`，也只属于导出接口，不能反向改写 S2 消息发送。[09.09 不同资源的幂等键](./09_async_long_tasks.md)

## 四、错误码与授权：内部 RPC 和外部 HTTP 不会自动同义

教学网关要把**内部错误阶段**翻译成用户可理解且不泄密的 HTTP 结果。gRPC `INVALID_ARGUMENT`、`UNAUTHENTICATED`、`ALREADY_EXISTS`、`PERMISSION_DENIED`、`UNAVAILABLE`、`DEADLINE_EXCEEDED` 有各自语义；HTTP 400/401/404/409/5xx 是另一个 API 合同。不能“原样转发 gRPC 码数值”或把所有远端 timeout 写成客户端参数错误。[gRPC Status Codes](https://grpc.io/docs/guides/status-codes/) · [09.04 响应提交边界](./04_request_pipeline.md)

| 内部原因（教学） | 当前/拟议外部结果 | 最容易犯的错误 |
|---|---|---|
| 无效正文/JSON | 当前 S2 稳定 400 类别；正文上限仍 6 UTF-8 B | 混成总请求 4096 B 的 413，或提前放行 R9 的 9 B |
| 未登录/无可信身份 | 401 | 用请求体伪造 `sender_id` 作为认证 |
| 已登录但不是 `c-a` 成员 | 当前隐藏目标 **404** | 内部 `PERMISSION_DENIED` 文本直接泄露会话存在 |
| 同 `message_id` 再创建 | 当前 S2 **409**，旧消息不覆盖 | 相同正文就自动改成 200 |
| gRPC deadline/依赖 unavailable | 按网关故障阶段定义受控 5xx/结果未知 | 断言“远端肯定没提交”，盲目换 ID 重试 |

内部服务若按自己的权限模型返回 `PERMISSION_DENIED`，HTTP 边缘可按**已固定的隐藏目标政策**给非成员统一 404；它必须在受信主体与对象授权完成后决定，不把私有资源 ID、内部栈和原始内容塞进错误体。gRPC 官方对内部状态码本身也区分未认证与无权限；**本章映射是应用侧纸上合同**，不是 gRPC 自动替 HTTP 选择 404 的机制。[09.07 对象权限](./07_authentication_authorization.md)

## 五、六格混部矩阵：从能解析追到正确权限与版本

沿 `m-9:v1→v2` 与教学 `event_v1→event_v2`，每格先问“线格式能否读”，再问“业务状态能否安全更新、错误能否正确呈现、失败后能否回放”。

| 组合 | 纸上兼容风险 | 安全门槛 |
|---|---|---|
| 旧 HTTP 客户端 → 新服务器 | 旧客户端只懂 S2 200 内存受理，若 `/v1` 悄改含义会误解释 | 保持 `/v1` 合同，另暴露经评审的新版本/能力 |
| 新 HTTP 客户端 → 旧服务器 | 新客户端以为 R9 9 B 已生效或期望 S3 DB 提交 | 协商/显式路径与安全降级；旧服务按当前 6 B 拒绝，不装作已受理 |
| 旧事件生产者 → 新消费者 | 回放 `event_v1` 缺 `message_version/visible` | 新读端对旧事件查权威当前版本/权限或保守拒绝并可修复 |
| 新事件生产者 → 旧消费者 | 旧 Protobuf 二进制可跳过字段，却仍按旧索引规则写入 | 新格式发布前升级/隔离旧消费者；不能用“可 parse”放行敏感效果 |
| 存量事件/DLQ 回放 → 新消费者 | 旧字段、旧错误与当前消息 v2/撤回冲突 | 按当前权威版本/权限收敛，保留稳定事件身份与对账 |
| Protobuf ↔ JSON/字段复制中间层 | 未知字段可能丢，默认值/字段名映射变化 | 对每条真实转换链路做兼容用例；必要时禁止有损路径 |

这里的版本协商可以是明确 URI、能力字段或按客户端群体门控，但**服务端必须在可验证的版本/权限信息上决定**，不能信任攻击者请求体写一个 `version=2` 就自动取得更宽限额或越权数据。也要记住，消息 `m-9:v2` 的编辑版本和事件 `event_v2` 的 schema 版本是两轴；旧事件的 `evt:m-9:v1` 可在新格式容器里重放，却不能把权威索引倒回 v1。[08.10 协议混部](../08_distributed/10_membership_evolution.md)

## 六、扩展→迁移→收缩：删除旧路径要等回放窗口关闭

**扩展：**给新消费者加 `event_v1/v2` 双读和对缺失字段的安全回源/拒绝规则，发布前在隔离样本里核对旧事件、重复事件、v2 编辑、撤回和非成员 `u-c`。新增字段号固定且不重用；新生产者还未全量发新格式。**迁移：**按能力/版本门控生产者，观察每种组合的解码失败、旧消费者存活、SearchIndex ID/版本/可见性差集、队列积压与 DLQ；B 设备与客户端按各自协议继续兼容。**收缩：**只有旧事件的 broker 保留、隔离重放、历史回填和客户端升级窗口有证据闭合，才删除旧读分支。[Protobuf 兼容规则](https://protobuf.dev/programming-guides/proto3/) · [07.09 隔离/重放](../07_cache_messaging/09_backlog_poison_messages.md)

R9 仍是**待审**的 6→9 字节正文需求：若新客户端先发 `"你好呀"`（9 B）到旧 S2，旧服务理应按当前上限拒绝；不能因部分网关已升级，就让同一个 `/v1` 返回含义/校验限额在节点间漂移。先定义目标接口版本、客户端能力和部署顺序，再通过审批与真实合同验证，才谈启用。S3 的 `stored_in_teaching_db` 也不能在 `/v1` 悄悄把“受理”变“落库”。[09.11 应用测试与交付](./11_application_tests_delivery.md)

**回退也有门槛：**新 `event_v2` 已进入 broker/隔离队列后，单纯把服务二进制换回旧版，旧消费者可能忽略关键字段，或 JSON 中间层丢掉未知信息。要保留兼容读者、停止新格式生产、盘点已持久新事件与当前目标版本/权限，再选安全回放/修复；不能因为部署系统支持“回滚镜像”就声称协议和数据已经回到旧状态。[08.10 回退与版本轴](../08_distributed/10_membership_evolution.md)

## 七、固定 OpenIM 源码能说明什么，仍需查什么

固定 `openimsdk/open-im-server` 提交 `f6411a8a1a31d3df36f4c2b3ad28481a94141e1f` 中，[`internal/rpc/msg/send.go` 的群聊与所述单聊分支](https://github.com/openimsdk/open-im-server/blob/f6411a8a1a31d3df36f4c2b3ad28481a94141e1f/internal/rpc/msg/send.go#L46-L70)在 `MsgToMQ` 无错后返回；[另一路 `online_msg_to_mongo_handler.go`](https://github.com/openimsdk/open-im-server/blob/f6411a8a1a31d3df36f4c2b3ad28481a94141e1f/internal/msgtransfer/online_msg_to_mongo_handler.go#L43-L69)消费后调用 `BatchInsertChat2DB`。两段说明发送响应点与该 MongoDB 写入完成点不同；**没有核对本章教学 `MessageEvent` 的字段号、gRPC 重试配置、客户端能力协商、实际 event_v2 或生产者确认等级**。[09.05 固定源码对照](./05_data_access_migration.md)

真实 OpenIM 源码研究下一步应固定依赖的 protocol 提交与 `.proto`、生产者/消费者配置和客户端升级范围，再跟同一消息 ID 的错误/超时/回放路径。即使源码能说明字段存在，也须用新旧二进制、JSON 转换、存量事件和权限负例的运行证据证明兼容；本章没有执行这些测试，更不报告“OpenIM 已升级成功”。只读两段函数不等于完整系统协议证明。

## 八、交付兼容矩阵与 22 道分层练习

第一遍交四条版本轴和字段号/`optional` 说明；第二遍交六格混部矩阵、deadline/重复/授权错误映射，以及扩展→迁移→收缩/回退门。所有实际配置、客户端比例与运行结果在真实隔离环境验证前标“待核对”。

### 基础 1–8：先辨认版本与字段

<details><summary>1. 当前 S2 的 200 表示什么？</summary>

`accepted_in_memory`，不是数据库提交、broker 接受或设备送达。</details>

<details><summary>2. R9 的 9 UTF-8 字节上限现在生效了吗？</summary>

未生效。当前正文最多 6 B；R9 待审并需明确目标接口版本。</details>

<details><summary>3. `m-9:v2` 与 `event_v2` 指同一版本吗？</summary>

不是。前者是业务消息内容/权限版本，后者是教学事件线格式版本。</details>

<details><summary>4. Protobuf 已使用字段号可以为了整齐重新排序吗？</summary>

不能。字段号是线格式身份，改号等于不同字段；删除后不应重用。</details>

<details><summary>5. `optional message_version` 比隐式标量多了什么判断？</summary>

可区分字段缺席与明确传入默认值 0，有助于旧事件安全分支。</details>

<details><summary>6. 旧二进制程序能解析新增字段，旧业务一定理解 `visible` 吗？</summary>

不一定。它可能忽略字段，权限语义仍可能错误。</details>

<details><summary>7. ProtoJSON 一定原样保留旧程序不认识的二进制字段吗？</summary>

不一定。二进制未知字段经 JSON 或逐字段复制可能丢失。</details>

<details><summary>8. broker P0:42 能说明 E9 的消息版本是 42 吗？</summary>

不能。它仅是该分区的日志位置。</details>

### RPC 与兼容 9–16：状态码不替业务判断

<details><summary>9. gRPC `DEADLINE_EXCEEDED` 能断言服务端未提交吗？</summary>

不能。官方说明改变状态的操作可能已完成而响应迟到。</details>

<details><summary>10. gRPC 文档里的 RPC committed 等于教学 SQL Commit 吗？</summary>

不等于。它指收到响应头后不再自动进行该 RPC 的传输重试。</details>

<details><summary>11. 当前 S2 相同 `message_id`、相同正文重复 POST 是多少？</summary>

409，旧消息不覆盖；不能因 RPC 有重试便改为 200。</details>

<details><summary>12. 内部 `PERMISSION_DENIED` 可无脑透出私有 `c-a` 存在性吗？</summary>

不能。边缘按当前隐藏目标合同对非成员统一 404，错误体不泄密。</details>

<details><summary>13. 新客户端给旧 S2 发 9 B 正文，旧服务该怎样？</summary>

按当前 6 B 限额拒绝，不装作 R9 已批准。</details>

<details><summary>14. 新生产者向旧 SearchIndex 发含 `visibility` 的新二进制事件，可只看解析通过吗？</summary>

不可。旧消费者可能忽略可见性，必须先升级/隔离或给安全默认和回源门。</details>

<details><summary>15. 新消费者重放缺 `message_version` 的旧事件，应直接覆盖当前 v2 吗？</summary>

不能。查权威当前版本/权限或保守拒绝并留修复责任。</details>

<details><summary>16. gRPC 与 HTTP 错误码会自动完成 404/409 安全映射吗？</summary>

不会。网关/应用需按已固定的身份、资源和错误合同明确映射。</details>

### 上线评审 17–22：能回退才算演进

<details><summary>17. 为什么先升级新消费者再让生产者发教学 event_v2？</summary>

避免仍在运行的旧消费者忽略关键版本/可见性字段造成错误索引或泄露。</details>

<details><summary>18. 只看新旧程序都“不报 parse 错”足以删旧读取分支吗？</summary>

不足。还需存量回放、DLQ、目标版本/权限差集和客户端覆盖证据。</details>

<details><summary>19. 新事件已持久后，把服务镜像回滚旧版就安全了吗？</summary>

不一定。旧版可能丢关键字段或误处理新事件，须停止新写并保留兼容读/修复门。</details>

<details><summary>20. `evt:m-9:v1` 在新 event_v2 容器里回放，会变成业务 m-9:v2 吗？</summary>

不会。事件 ID 的 v1 仍是原消息版本，容器线格式改变不修改权威业务事实。</details>

<details><summary>21. 固定 OpenIM 两段源码能证明它已有本章教学字段 4/5 和协商策略吗？</summary>

不能。需另查固定依赖的 `.proto`、配置、客户端/消费者和运行证据。</details>

<details><summary>22. 一份可审的协议升级报告至少列什么？</summary>

版本/字段矩阵、生产/消费混部、旧事件回放、错误/权限负例、启用与收缩门、回退限制、真实测试和剩余未知。</details>

## 本章完成标准与后续路径

能不看答案区分四条版本轴，解释 Protobuf 新字段的 wire 兼容为何不保证消息版本/权限语义，说明 gRPC deadline 的结果未知与 HTTP 404/409 映射，并给出六格混部矩阵及可验证的扩展、迁移、收缩/回退门，才算完成第一轮。学习者的真实代码/协议升级仍需在自己的隔离环境记录生成代码、服务配置、原始请求和故障结果。第九卷全部独立章完成后，按[学习路线](../learning_path.md)继续[10.07 并发与属性验证](../10_engineering/07_concurrency_property_validation.md)及后续工程与可靠性章节。
