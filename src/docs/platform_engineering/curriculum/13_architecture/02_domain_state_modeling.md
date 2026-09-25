---
title: 13.02 领域与状态建模：同一条消息为何有多种身份与进度
icon: /assets/icons/article.svg
order: 3
date: 2026-09-25
---

[返回第十三卷](./README.md) · [问题定义：13.01](./01_problem_stakeholders.md) · [数据库建模：06.01](../06_databases/01_relational_identity.md) · [权限：09.07](../09_backend_security/07_authentication_authorization.md) · [跨系统一致性：07.12](../07_cache_messaging/12_cross_system_consistency_case.md)

# 13.02 领域与状态建模：同一条消息为何有多种身份与进度

> DeepTutor 八节初稿经技术与教学审阅后的静态课程。用户、设备、消息、序号、事件和进度都是**虚构纸上模型**；没有运行 Go、IM、数据库、压测、部署或站点。当前 S2 `/v1` 合同仍为正文非空且最多 **6 UTF-8 B**、原始 HTTP 请求正文最多 **4096 B**、同 ID 重复 **409**、非成员隐藏 **404**、成功 `200 accepted_in_memory` 只表示本进程内存受理。未来 S3 `/v2` 的 `stored_in_teaching_db` 是提议且仍为 6 B，R9 的 6→9 B 待审。下文 `m-9/seq9/E9` 属于未来候选模型，不能倒写为当前能力。[09.02 当前合同](../09_backend_security/02_http_api_contract.md)

## 一、先从行为提名词，模型不是把数据库表画成方框

13.01 把“B 离线 25h 后找回 A 的消息”拆成用户旅程。本章问下一层：系统得记住哪些**有持续身份的事物**，哪些值可以替换，哪些规则每次操作都要成立，以及状态变化由谁负责。**领域模型**是用业务语言解释行为与约束的简化图，不等于 HTTP JSON、SQL 表、缓存键或一套必须照抄的 Go 结构体。[Eric Evans：DDD Reference](https://www.domainlanguage.com/ddd/reference/)

先写四个用例，再从动词和前后条件找对象：

| 用例 | 发起者与输入 | 期望变化 | 必须另问 |
|---|---|---|---|
| SendMessage | `u-a` 向 `c-a` 提交稳定消息 ID、正文 | 当前 S2 本进程受理；未来 S3 候选形成权威消息 | 成员资格、6 B、重试与重复怎么算？ |
| FetchHistory | B 的设备带 `c-a` 和旧游标补缺 | 未来只返回有权可见的历史 | 撤销成员后能看哪些旧消息？尚待决 |
| AckDevice | `dev-b1` 确认取得某些 `seq` | 未来更新该设备的连续进度 | 已收到是否等于阅读？另一设备如何算？ |
| ChangeMembership | 管理员调整 `u-b` 的成员关系 | 权限规则与生效时间变化 | 已发历史的可见范围谁决定？ |

初学者常从 `messages` 表出发，把“一个 message row”当全部模型：但 A 的请求尝试、业务消息意图、权威记录、转发事件、B 两台设备的进度可能各有生命周期。先给**同名词的业务含义**，再让存储选择服务这些不变量。[13.01 问题与利益相关者](./01_problem_stakeholders.md)

## 二、实体看持续身份，值对象看属性；六个 ID 各司其职

DDD 中的**实体**沿时间保有可追踪身份：同一个 `u-b` 改昵称仍是同一用户，同一 `dev-b1` 重连仍可是同一设备，同一 `c-a` 加减成员仍是同一会话。**值对象**主要按属性相等，通常用于正文、时间范围、某会话的序号位置等；正文同为“你好”不表示是同一条消息。是否用值对象不是由 Go 用 `struct` 还是 `string` 决定，而取决于业务如何判等、如何变化。[Eric Evans：DDD Reference](https://www.domainlanguage.com/ddd/reference/) · [Martin Fowler：Entity/Value Object](https://martinfowler.com/bliki/EvansClassification.html)

| 概念 | 纸上例子 | 身份或判等规则 | 为什么不能混用 |
|---|---|---|---|
| 用户、设备、会话 | `u-b`、`dev-b1`、`c-a` | 各自稳定 ID | 一个人可有多设备；设备重连不造新用户 |
| 成员关系 | `(c-a,u-b)` 及生效区间 | 关系随时间变化 | 当前成员与历史可见不是同一个布尔值 |
| HTTP `request_id` | 第一次 `r-1`、重试 `r-2` | **请求尝试**各一个 | 网络重试可新请求，但仍是同一消息意图 |
| 稳定 `message_id` | `m-9` | 同一次用户发送意图 | 不能用正文相等或 `request_id` 去重 |
| 会话内序号 | `(c-a,seq9)` | 在该会话内的位置 | `seq9` 单独不构成全局消息身份 |
| 派生事件 ID | `E9=evt:m-9:v1` | 某事件语义的稳定标识 | 重投可同 E9，事件不是第二条消息 |
| broker 位置 | `P0 offset42` | 某分区、某段日志的传输位置 | 不能当会话 `seq9` 或 B 的阅读进度 |
| 设备确认键 | `(dev-b1,c-a,seq9)` | 某设备对某会话位置的确认 | B 的另一设备和 B 本人阅读另算 |

这里列出了多于五种识别符，是为了提醒：**ID 的数目由不同责任边界产生**，标题中的“多种”不表示实现必须新增全部字段。Go 初学者可用纸上类型区别误传，例如 `type MessageID string`、`type RequestID string`、`type ConversationSeq uint64`；即使底层都是字符串/整数，业务函数也应明确接收哪一种。该示意没有编译或运行，不替代数据定义和兼容评审。[Martin Fowler：Value Object](https://martinfowler.com/bliki/ValueObject.html)

## 三、不变量是“任何有效转换都不能破坏”的规则

**不变量**不是“我们希望尽量如此”，而是指定范围内每次有效状态转换前后必须成立的条件；还要写明由哪处权威数据与哪项原子操作维护。当前已生效的 `/v1` 合同与未来想建立的持久不变量不能混在一起。[06.07 事务与并发](../06_databases/07_transactions_anomalies.md)

| 规则 | 当前 S2 可断言？ | 未来候选需要的守护点 |
|---|---|---|
| 正文非空、最多 6 UTF-8 B；原始请求体最多 4096 B | 当前 `/v1` 合同 | `/v2` 若提出仍为 6 B；R9 待批 |
| 当前同 ID 重复返回 409 | 当前用例合同 | 不推断跨 Pod/重启后有权威去重 |
| 非成员发送隐藏 404 | 当前发送合同 | 历史补拉的授权规则另定 |
| `(c-a,seq)` 对权威消息唯一、在会话内按确认顺序前进 | S2 尚无权威 `seq` | 未来 DB 分配、唯一约束/事务或等价机制 |
| 同一稳定消息意图不形成两条权威消息 | S2 尚无跨进程权威保证 | 未来按消息 ID 与作用域建立持久去重约束 |
| B 设备连续游标不跨过尚缺位置 | 当前无这套设备进度 | 未来每设备进度规则和补拉协议 |

“有权发送”要看发送时的成员身份；“有权读旧历史”在退群、封禁、重入等情况下可能有不同产品规则，**尚需产品与安全决定**。不能随手定成“现在是成员就能看所有历史”或“离开即清空旧历史”。一条未来消息若权威记录 `(c-a,seq9,m-9)`，其事件 E9 失败重投，权威消息仍只能是一条；实现可以用持久约束和幂等消费等机制守住规则，但本章不宣称已有 SQL outbox、分布式事务或具体锁策略。[09.07 对象权限](../09_backend_security/07_authentication_authorization.md) · [07.12 异步边界](../07_cache_messaging/12_cross_system_consistency_case.md)

## 四、发送是一组状态轴，不能压成一个 `delivered` 布尔值

先沿**当前 S2**走一次：A 的请求含稳定 `message_id=m-a`，HTTP 原始正文不超 4096 B，消息正文非空且最多 6 UTF-8 B，A 是 `c-a` 成员；本进程此前未受理同 ID 时，返回 `200 accepted_in_memory`。同 ID 再提交返回 409，非成员按合同隐藏 404。到此并未产生权威 `seq`、E9 或 B 设备 ACK；若把响应写成“已持久/已送达”，模型一开始就错了。[09.02 当前用例合同](../09_backend_security/02_http_api_contract.md)

未来 S3 是另一个**待审用例**：在明确的持久约束下，权威 DB 形成 `m-9/seq9`，然后派生稳定事件 E9；事件可在传输中重复，B 各设备又可能在不同时间处理。用下面的状态向量比单个 `delivered=true/false` 更诚实：

| 状态轴 | 纸上问题 | 失败反例 |
|---|---|---|
| 权威消息 | `m-9` 是否已在教学 DB 形成 `seq9`？ | A 超时后重试，不得造第二条权威意图 |
| 事件派生/发布 | E9 是否待发、已尝试或可重放？ | DB 已提交而发布失败；不能说 B 已送达 |
| 设备接收 | `dev-b1` 与 `dev-b2` 各到了哪里？ | `dev-b1` ACK，不推出 `dev-b2` ACK |
| 用户阅读 | B 是否在 UI 明确阅读？ | 设备缓存了消息，不等于本人阅读 |

状态可以有顺序约束，但不必塞进一个枚举：权威消息可已存而 E9 暂未发；E9 可重投而 B 未 ACK；B 某设备 ACK 后其它设备仍缺。若事件发布在 DB 提交后失败，下一步是明确恢复/重试机制及证据，不能简单把“DB stored”回退成“没有这条消息”。未来重复发送最终如何响应属于 `/v2` 设计问题，**不反向更改当前 `/v1` 同 ID 409**。[07.12 权威与事件](../07_cache_messaging/12_cross_system_consistency_case.md)

## 五、连续游标比“见过的最大序号”更适合找缺口

设未来 `c-a` 的权威历史按 `seq` 排列，B 的 `dev-b1` 原本已经**连续确认到 `seq7`**。网络乱序让设备先看到 `seq9`，但 `seq8` 尚未取得。若把游标直接更新为 `max_seen=9`，下一次请求 `seq>9` 会跳过 8，导致“消息明明在 DB 却永远补不到”。因此本例的 `last_contiguous_seq` 仍为 **7**；设备可另记“已见 9”用于去重/缓冲，直到 8 得到并满足协议确认条件，才可从 7 推进到 9。[07.12 历史补拉](../07_cache_messaging/12_cross_system_consistency_case.md)

| 时刻 | 设备已确认/已见 | 安全的连续游标 | 下一次补拉起点 |
|---|---|---:|---:|
| T0 | `1…7` 连续 | 7 | `>7` |
| T1 | 又见到 9，缺 8 | 7 | 仍 `>7`，对 9 可去重 |
| T2 | 取得并确认 8，9 也满足确认规则 | 9 | `>9` |

这个游标是**某设备在某会话中的进度值**，不是 B 用户整体阅读进度，也不是 broker 的 `P0 offset42`。B 的 `dev-b2` 可能仍停在 5；不同设备接收、用户阅读、群会话可见范围需各自建模。若 B 离线 25h，而教学 broker 只保留 24h，未来候选补拉应从**有权的权威历史**找缺口，而不是拿 broker offset 当历史位置。当前 S2 没有这个补拉能力；成员关系变化后的旧消息可见性仍待决定。[08.05 分区与 offset](../08_distributed/05_partition_rebalancing.md)

## 六、聚合守一致性边界，不是把所有关系塞进会话对象

DDD 的**聚合**把必须一起保持的不变量围在一个边界内，并指定聚合根作为外部修改入口；设计聚合时要问“哪条规则必须同一次原子变化完成”。这是一种分析和设计方法，不能由对象图直接推得 SQL 表数量、数据库事务语句或微服务数。[Eric Evans：DDD Reference](https://www.domainlanguage.com/ddd/reference/) · [Martin Fowler：DDD Aggregate](https://martinfowler.com/bliki/DDD_Aggregate.html)

纸上若把 `Conversation` 设计成包含所有消息、所有成员历史和每台设备游标的**一个无限增长聚合**，每次群消息扇出或设备 ACK 都要争用同一大边界，读写与演进负担会越来越高。可先按不变量审以下候选边界，不把它们误写成已建成的服务：

| 候选责任边界 | 首要不变量/输入 | 跨边界联系 |
|---|---|---|
| 会话与成员规则 | `c-a` 的成员状态及待定历史可见策略 | Send/Fetch 调用授权判断；规则随时间版本化 |
| 权威消息与会话序号 | 未来 `m-9` 一次意图、`(c-a,seq9)` 唯一 | 权威写后派生 E9，不凭事件重复造消息 |
| 每设备进度 | `(dev-b1,c-a)` 的连续游标不跳缺口 | 从有权历史补拉，ACK/阅读另分 |
| 事件/投影 | E9 稳定标识、重试/消费位置 | 可重复处理，不能作权威消息替身 |

真正的原子边界依赖并发、负载、数据模型与产品规则。例如“检查成员仍有效”和“分配 `seq`”能否在同一写入边界完成，是后续方案设计与并发验证的问题；若跨边界，则要明确竞争窗口及补偿/拒绝规则，不能只画一条同步箭头。Fowler 对聚合的解释强调由根守住内部完整性；它不是“所有有关联的对象都由同一事务更新”的许可证。[06.07 事务隔离](../06_databases/07_transactions_anomalies.md)

## 七、用三条反例评审模型，并限制源码结论

一张可审模型卡至少有对象与 ID 字典、四个用例的前置/后置/失败条件、每条不变量的所有者、状态轴、授权时间点和未定业务规则。先用三条反例找模型缺口：**A 同意图重试但 request ID 变了**，若只按 `request_id` 去重，会出现两条权威消息；**DB 已有 `m-9/seq9` 而 E9 未发**，若只有一个“delivered”状态，无法表示需恢复发布；**B 先见 9 未见 8**，若游标写 9，历史补拉会漏 8。再加非成员读历史，检查权限变化规则是否真的已决定。[13.01 问题简报](./01_problem_stakeholders.md)

固定 `openimsdk/open-im-server` 提交 `f6411a8a1a31d3df36f4c2b3ad28481a94141e1f` 的 [`send.go` 选定路径](https://github.com/openimsdk/open-im-server/blob/f6411a8a1a31d3df36f4c2b3ad28481a94141e1f/internal/rpc/msg/send.go#L46-L70)调用 `MsgToMQ` 后返回；[另一个 Mongo 消费路径](https://github.com/openimsdk/open-im-server/blob/f6411a8a1a31d3df36f4c2b3ad28481a94141e1f/internal/msgtransfer/online_msg_to_mongo_handler.go#L43-L69)调用 `BatchInsertChat2DB`。这能帮助学习者询问“消息身份和状态跨哪条异步边界”，却**不能证明** OpenIM 或本课程未来实现使用了本章的聚合、SQL 唯一约束、outbox、ACK 语义或业务游标。[OpenIM 阅读地图](../im_reference.md)

## 八、22 道分层练习：给 `m-9` 建身份与状态账本

先分实体和值，再手推重试/游标，最后审聚合与权限。答案均基于上面的纸上模型。

### 基础 1–8：对象和身份

<details><summary>1. 实体和值对象最关键的判别是什么？</summary>

实体凭持续身份辨认；值对象主要凭属性组合判等，不能只看是否用 Go `struct`。</details>

<details><summary>2. `u-b` 改昵称后为什么仍是同一用户？</summary>

稳定用户身份延续，昵称是可变化属性。</details>

<details><summary>3. `r-1` 超时后 `r-2` 重试，是否必然是两条消息意图？</summary>

不是。request ID 标记两次尝试，稳定 message ID 才指向同一发送意图。</details>

<details><summary>4. 两条正文都为“你好”，能按正文认定同一消息吗？</summary>

不能。内容值相等不等于消息实体身份相同。</details>

<details><summary>5. `seq9` 单独能唯一标识一条权威消息吗？</summary>

不能；它至少要带会话作用域，如 `(c-a,seq9)`，且只属于未来候选。</details>

<details><summary>6. E9 与 P0 offset42 哪个是稳定事件身份？</summary>

E9 是纸上稳定事件 ID；offset42 是某分区日志位置，不能当业务身份。</details>

<details><summary>7. 当前 S2 200 能证明权威 `seq9` 已产生吗？</summary>

不能；当前只承诺本进程内存受理。</details>

<details><summary>8. B 两台设备可共用一个“已接收”布尔值吗？</summary>

不能。`dev-b1` 与 `dev-b2` 的接收进度可不同，阅读状态也另算。</details>

### 推演 9–16：不变量与缺口

<details><summary>9. 当前 `/v1` 同 ID 重复返回什么？</summary>

409；不能擅自换成“同正文幂等 200”。</details>

<details><summary>10. 当前非成员向 `c-a` 发送应怎样？</summary>

按当前发送合同隐藏为 404；未来历史可见规则另审。</details>

<details><summary>11. 未来 `(c-a,seq9)` 唯一规则应由哪类权威守护？</summary>

由未来权威写入边界的原子分配与唯一约束或等价机制守护，不能靠 broker offset。</details>

<details><summary>12. DB 已存 `m-9` 而 E9 未发，用 `delivered=false` 足够吗？</summary>

不足。需分权威存储与事件派生/发布轴，才能定位恢复动作。</details>

<details><summary>13. E9 重投两次，就应有两条权威 `m-9` 吗？</summary>

不应。稳定消息意图和权威唯一规则不因传输重复而改变。</details>

<details><summary>14. `dev-b1` 已连续确认到 7、先见 9 缺 8，连续游标是多少？</summary>

仍为 7；可以缓冲/记已见 9，但不能用 `max_seen=9` 跳过 8。</details>

<details><summary>15. 8 到达且 9 也满足确认条件后，游标可到多少？</summary>

可由 7 连续推进到 9；前提是协议要求的确认条件均已满足。</details>

<details><summary>16. B 离线 25h、broker 保留 24h，仅凭 offset42 能补全吗？</summary>

不能。未来应按权限从权威历史按会话序号补缺；当前 S2 无此能力。</details>

### 决策 17–22：边界与证据

<details><summary>17. 退群后 B 能看此前历史，可由工程师直接拍板吗？</summary>

不能。属于产品/安全待定规则；模型先保留时间与权限判断位置。</details>

<details><summary>18. `Conversation` 含无限消息和全部设备进度，会有什么风险？</summary>

聚合无界增长、并发争用和大对象读写；应按必须原子维护的不变量重审边界。</details>

<details><summary>19. 聚合边界一确定，就等于 SQL 表或微服务边界确定吗？</summary>

不等。聚合是领域一致性设计，存储/部署仍需按负载与故障取舍。</details>

<details><summary>20. 当前 S2 同 ID 409 可证明重启后跨 Pod 持久去重吗？</summary>

不能。当前合同的内存受理不提供未来权威唯一性的证据。</details>

<details><summary>21. 两处固定 OpenIM 源码能证明本章聚合/outbox/ACK 吗？</summary>

不能；只支持所读发送调用 MQ 与另一 Mongo 消费路径的异步边界。</details>

<details><summary>22. 可审领域模型卡至少交付什么？</summary>

对象/ID 字典、用例前后和失败条件、当前/未来不变量及责任、独立状态轴、权限时间规则、重试/漏序/事件失败反例与未决项。</details>

## 本章完成标准与后续路径

能区分 request、消息意图、会话序号、事件 ID、broker 位置和设备确认；手推“7、9、缺 8”时游标为何停 7，说明哪些不变量属于当前 S2、哪些仍是未来候选，并用反例评审聚合边界，才算完成第一轮。下一章 13.03 将进一步讨论模块接口怎样隐藏这些变化与约束。
