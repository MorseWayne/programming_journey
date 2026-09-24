---
title: 10.11 技术写作与协作：让没参加讨论的人也能修 m-9
icon: /assets/icons/article.svg
order: 12
date: 2026-09-25
---

[返回第十卷](./README.md) · [需求前置：10.01](./01_verifiable_requirements.md) · [发布前置：10.10](./10_continuous_delivery_versions.md) · [观测前置：11.03](../11_reliability/03_logs_metrics_traces.md) · [IM 确认点：07.12](../07_cache_messaging/12_cross_system_consistency_case.md)

# 10.11 技术写作与协作：让没参加讨论的人也能修 m-9

> DeepTutor 八节初稿经技术与教学审阅后的静态课程。`m-9/c-a`、R9 ADR、T0–T+18 事故和所有文档样本均为**脱敏的纸上练习**；没有向外部人员发消息，没有部署、运行 Go/IM/数据库、做值班操作或经历真实事故。当前 S2 仍只承诺 `200 accepted_in_memory`、正文非空且最多 **6 UTF-8 字节**、总请求最多 **4096 B**、同 ID 即使同正文重复 **409**、非成员目标隐藏 **404**；未来 S3 `stored_in_teaching_db` 未部署，R9 的 6→9 B 仍待审。[09.02 当前合同](../09_backend_security/02_http_api_contract.md)

## 一、五份文档分别帮谁做决定

虚构 A 说“我发的 `m-9` 成功了，B 没看到提示”；另有人提议把正文上限从 6 B 提到 9 B。若只写“提高可靠性、支持长消息”，没有说明**现在的 200 到哪一步**、B 是否离线、消息是否在权威历史、R9 是否批准，接手的人无法判断要查哪个系统、能否重试或是否要改接口。[07.12 分层确认](../07_cache_messaging/12_cross_system_consistency_case.md)

| 文档 | 主要读者的具体问题 | 最少应有的内容 |
|---|---|---|
| 需求记录 | 用户要做什么、当前与目标行为如何验收？ | 主体/场景、输入、正反例、状态变化、明确未承诺项 |
| 设计说明 | 哪些状态谁持有、失败后从哪恢复、为何选择此方案？ | 数据流/原子范围、故障时间线、备选取舍、验证门 |
| ADR（架构决策记录） | 某**一个**重要决定是什么，何时/为何作出？ | 状态、背景、驱动因素、选项、结果/后果、确认办法 |
| 运行手册 | 现在出现这个症状，我先查什么、何时停止/升级？ | 症状、稳定身份、只读核对、条件动作、停止/交接 |
| 事故复盘 | 当时发生了什么、影响谁、怎样避免/缩小复发？ | 有来源时间线、影响与未知、促成条件、负责人/截止/验收 |

这些文档可以互相链接，但不能用 ADR 取代完整需求，也不能用一篇“事故总结”当值班时可执行的状态表。第一遍先练把一句含糊的 IM 抱怨拆成**可观察合同**；第二遍再写决策与证据交接。[MADR 决策模板](https://adr.github.io/madr/decisions/adr-template.html) · [Google SRE 复盘实践](https://sre.google/workbook/postmortem-culture/)

## 二、需求记录：把 S2、S3、R9 写成三栏，别暗改旧客户端

下面是一份**纸上需求摘要**，不是批准的需求工单。读者要能从它写出正例、负例和“还不能说”的句子：

| 栏 | 内容 | 验收反例 |
|---|---|---|
| 当前 S2 `/v1` | `u-a` 是 `c-a` 成员，POST `m-9/"你好"` 正文 6 B 返回 `200 accepted_in_memory`；同 ID 重发 409；非成员 `u-c` 404 | 把 200 写成“数据库已存/B 已收到”；同正文重复改 200 |
| 未来 S3 `/v2` 提议 | 独立版本合同可把成功点改为**本地教学 DB Commit**，仍沿 6 B；broker/设备另确认 | 在 `/v1` 悄换回应含义；把 SQL 纸上方案写成已部署 |
| R9 待审 | 用户希望 `"你好呀"` 9 B 可提交；目标版本、兼容/回退和性能预算未决 | 未批准就放宽旧 `/v1`，让混部节点 6/9 B 行为不一致 |

需求还要说明**谁给谁发、会话/消息 ID 从哪里来、可信发送者如何得到、B 离线 25 小时越过玩具 broker 24 小时后从何补拉**，并把 SearchIndex、Notify、设备收到和已读分成不同验收结果。这样产品、客户端、存储和安全审阅的是同一份行为，而不是各自填一张“成功”表。[10.01 可验证需求](./01_verifiable_requirements.md) · [09.12 S3 教学提议](../09_backend_security/12_im_service_capstone.md)

每一项结论标 **已知/推断/未知/下一证据**：例如“已知当前 `/v1` 返回 `accepted_in_memory`”；“推断消息可能已进入后续内存路径”；“未知 B 设备是否收”；“下一证据是设备回执或经授权的历史读取”。数值也要写单位和范围，避免“6 个字”与“6 B UTF-8”混用。

## 三、设计说明与待决 ADR：讨论过不等于批准

设计说明应画出未来教学 S3 的“认证/成员检查→同库 `messages+outbox` Commit→relay→broker→SearchIndex/Notify→B 补拉”，给每个箭头标**原子范围、ACK 含义、重复窗口、权限与修复责任**。它可以用[07.10 的 outbox](../07_cache_messaging/10_transaction_outbox.md)作技术模型，但须把当前 S2 与未来 S3 分开；真正 OpenIM 的入队/Mongo 路径则另依固定源码对照。设计不是一堆名词，还要列候选方案为何不满足用户/回退要求。[10.10 发布门](./10_continuous_delivery_versions.md)

以下是 **ADR-R9（状态：Proposed，尚未接受）** 的教学骨架：

| 项 | 纸上内容 |
|---|---|
| Context | 有用户希望 `"你好呀"`（9 B）可发；现行 `/v1` 非空正文最多 6 B，旧客户端/服务端混部 |
| Decision drivers | 旧客户端可解释、拒绝/权限合同稳定、消息格式与回退可验证 |
| Options | A：原地放宽 `/v1`；B：在**明确新版本/能力边界**提供 9 B；C：维持 6 B |
| Proposed outcome | 倾向 B，**须等产品/API/客户端/安全验收批准**；不在当前课程或服务中启用 |
| Consequences | 新客户端/服务器需版本协商与测试；旧 `/v1` 仍拒绝 9 B；消息历史一旦出现 9 B，回退不能静默截断 |
| Confirmation | 兼容矩阵、6/9 B 正反例、混部/回退演练、审批与发布记录 |

MADR 模板将 Context、选项、决策结果、后果和确认办法放在同一短记录里。**Proposed 不是 Accepted**；若后来决定 C 或发现 B 需要重写，保留原 ADR 的状态/历史并以新决定关联或 supersede，不事后把旧记录改成“当初就批准”。ADR 只守**一个决定**，S3 提交语义应有独立决定。[MADR 官方模板](https://adr.github.io/madr/decisions/adr-template.html)

## 四、运行手册：从“B 没提示”沿稳定身份逐段定位

运行手册不能先给“重启服务、重放全部消息”的通用命令。若 A 只拿到当前 S2 的 200，本来就**没有**教学 SQL Commit 保证；以下 `messages/outbox` 路径只在**未来 S3 教学事故演练**中成立。先问 A 拿到哪个接口版本、哪个 ID、何时/在哪个环境，保留“回应丢失＝结果未知”的可能。[08.01 部分失败](../08_distributed/01_system_partial_failure.md)

| 顺序 | 只读核对/条件 | 已知后才可做的下一动作 | 停止/升级条件 |
|---|---|---|---|
| 1. 合同 | A 的响应是 S2 `accepted_in_memory`、拟议 S3 `stored_in_teaching_db`，还是根本没收到？ | 固定稳定 `message_id=m-9` 与可信主体/会话；先定“成功”范围 | 无法确认接口版本/身份时，不能冒充持久消息 |
| 2. 权威历史 | 在有权范围查当前消息 ID、seq、版本、撤回/成员规则 | S3 下若已提交，再看同事务 outbox；S2 不凭空查 DB | 非成员或正文敏感时停止泄露式排障 |
| 3. 待发/队列 | 查 `evt:m-9:v1` 的 outbox、broker 确认/结果未知 | `PENDING` 按发布预算恢复；ACK 未知沿同一事件 ID 幂等处理 | 不生成随机新 E9、不先标 PUBLISHED |
| 4. 派生目标 | SearchIndex 当前版本/缺口；Notify 任务 N9/提供方结果分别查 | 修复坏消息/受控重放或权威重建 | E-bad 未决不静默越过同会话顺序门 |
| 5. 设备 | G1/G2 尝试、B 设备回执、离线/补拉游标 | B 有权且离线超保留时从权威历史补拉 | 网关尝试≠设备已收，搜索可见≠已读 |

每行保留**操作责任、证据地址/时间、下一观察点**；若只看到了 Redis/Kafka/NATS “lag=0” 也不能关“B 未收”单，因为可能提交位点越过未完成效果或设备仍离线。实际运行手册要按环境限制只读/修复权限和人工审批，本章只写纸上决策，不给真实系统执行命令。[07.09 坏消息修复](../07_cache_messaging/09_backlog_poison_messages.md) · [Google SRE 故障排查方法](https://sre.google/sre-book/effective-troubleshooting/)

## 五、虚构复盘：m-9 搜索延迟，聊天历史仍可查

为练写证据，构造一份**并未发生的未来 S3 故障**：

| 相对时刻 | 纸上观察 | 此时能下什么结论 |
|---|---|---|
| T0 | SQL 中 `m-9/seq9` 与 outbox E9 已提交 | 本地权威历史/待发意图成立；A 回应是否收到另证 |
| T+1 分 | relay 的 broker 依赖失败，E9 仍 `PENDING` | 搜索/通知可能延迟；不能说消息数据库丢失 |
| T+14 分 | 最老待发年龄告警触发，值班查到 E9 待发 | **检测晚于故障开始**；其他消息影响范围尚未知 |
| T+16 分 | 依赖恢复，relay 沿同一 `event_id` 发布 | broker 接受/ACK、是否重复须另看 |
| T+18 分 | SearchIndex 对账确认 `m-9` 当前版本可搜 | 该条搜索延迟约 18 分；B 离线，设备收到/已读仍未知 |

**影响写法：**已知这条 `m-9` 的搜索可见晚约 18 分钟；在本模型里授权权威历史始终可查。**未知：**其他会话/消息的数量、B 何时重连、设备是否收到任何提示；没有独立证据便不填受影响用户数或“全量消息丢失”。“T+14 告警”为何未更早触发是待查的监控/阈值问题，而不是先找某个人背锅。[11.01 分母与窗口](../11_reliability/01_business_measurement.md)

复盘把**触发、促成因素、检测、缓解、长期行动**分开。纸上行动例子：消息链 owner 补“outbox 最老年龄与 SearchIndex 权威差集”告警，写出阈值来源与误报预算；客户端/后端 owner 增加“在线提示失败但历史补拉成功”的验收案例；发布 owner 将 relay 依赖故障列入灰度停止门。每项写责任角色、目标日期、验收方式与剩余风险，不用“加强培训/提高意识”当唯一措施。Google SRE 强调复盘有事实、无责备和可执行行动，不能用文笔漂亮代替行动完成。[Google SRE 复盘实践](https://sre.google/workbook/postmortem-culture/)

## 六、跨团队交接：同一条合同，各自留下可查证据

| 角色 | 需作/交接的纸上判断 | 交付物的状态 |
|---|---|---|
| 产品/API | R9 的 9 B 是否批准、目标版本/旧客户端窗口；S3 提交语义另审 | 需求/ADR 的 Proposed、Accepted 或 Superseded 明示 |
| 后端/数据 | `m-9` 权威源、同事务范围、权限/历史游标 | schema/迁移/对账与结果未知矩阵 |
| 消息/索引/通知 | E9/N9 身份、ACK、重试/隔离、旧版本覆盖规则 | 事件格式/消费配置与待修清单 |
| 安全/客户端 | 非成员 404、私有正文/日志、设备回执和离线补拉 | 授权负例/客户端兼容矩阵 |
| 值班/交付 | 告警、运行手册、发布/回退门与真实观测 | 版本化手册、值班交接与复盘行动状态 |

一个会议只说明有人讨论过，不自动成为 ADR Accepted 或接口部署证据。文档须有**状态、作者/责任角色、更新时间、适用环境/接口版本、关联提交/源码、仍未决问题及下次复核点**；变更后旧 ADR 可标 Superseded，但别删掉其当时依据。对外分享课程或复盘仍只用虚构 ID，不粘贴真实公司/用户/凭据或内部拓扑。[10.06 评审记录](./06_code_review_merge.md) · [MADR 状态与确认](https://adr.github.io/madr/decisions/adr-template.html)

## 七、固定 OpenIM 源码怎么引用，不把未知写成事实

固定 `openimsdk/open-im-server` 提交 `f6411a8a1a31d3df36f4c2b3ad28481a94141e1f` 的 [`send.go` 所述群聊/单聊分支](https://github.com/openimsdk/open-im-server/blob/f6411a8a1a31d3df36f4c2b3ad28481a94141e1f/internal/rpc/msg/send.go#L46-L70)在 `MsgToMQ` 无错后组装/返回响应；[另一路 MongoDB 消费处理](https://github.com/openimsdk/open-im-server/blob/f6411a8a1a31d3df36f4c2b3ad28481a94141e1f/internal/msgtransfer/online_msg_to_mongo_handler.go#L43-L69)调用 `BatchInsertChat2DB`。由这两处可写**“该发送 RPC 返回的位置不是这段 MongoDB 批量写入完成的位置”**。不能凭它们补写实际 broker ACK 等级、是否有教学 SQL outbox、B 的设备确认或生产环境行为。[09.05 已审源码边界](../09_backend_security/05_data_access_migration.md)

可复核的引用要给仓库、**固定提交**、文件/函数和具体可见行为；若本章没有读过生产者配置、完整消费者错误分支或部署日志，就在设计说明/运行手册里标 **未知，下一证据是什么**。本仓库没有运行上游项目，更不能把虚构的 T+18 复盘当作 OpenIM 事故。让另一个工程师只凭文档找到“当前合同→相关源码→可能失败点→谁继续核对”，才算真正完成交接。[OpenIM 阅读地图](../im_reference.md)

## 八、交四份纸上样本与 22 道分层练习

第一遍提交 S2/S3/R9 的需求摘要与 ADR-R9 的状态/备选；第二遍提交 m-9 排障手册、T0–T+18 复盘与跨团队未决问题表。所有“已验证”须有对应来源/运行证据；本文没有替学习者执行。

### 基础 1–8：每份文档做什么

<details><summary>1. 当前 S2 的 200 可以写成“数据库已存”吗？</summary>

不能。它只表示 `accepted_in_memory`，后续持久性没有由此证实。</details>

<details><summary>2. `"你好"` 与 `"你好呀"` 分别多少 UTF-8 字节？</summary>

6 B 与 9 B；R9 尚待审，当前上限仍为 6 B。</details>

<details><summary>3. 同 ID 同正文重复 POST 当前会得到什么？</summary>

409，旧正文和顺序不改。</details>

<details><summary>4. 已登录 `u-c` 不是 `c-a` 成员，历史 GET 应怎样？</summary>

按当前隐藏目标政策 404，不泄露私有正文。</details>

<details><summary>5. 需求记录最先回答什么？</summary>

谁要在什么场景做什么、当前/目标可见结果及正反验收。</details>

<details><summary>6. ADR-R9 的 Proposed 等于已经批准 9 B 吗？</summary>

不等于。只有正式决策与相应接口/发布证据才能改变当前合同。</details>

<details><summary>7. 运行手册和事故复盘同是一份通用文档吗？</summary>

不是。手册指导出现症状时的下一动作；复盘记录已发生事件的事实、影响和行动。</details>

<details><summary>8. 发布新镜像能自动使旧 ADR 变成 Accepted 吗？</summary>

不能。决策状态与部署事实须分别记录和核对。</details>

### 需求与手册 9–16：从 m-9 找证据

<details><summary>9. A 说“发送成功”，手册第一问是什么？</summary>

哪个接口/版本、哪种响应、哪个稳定消息 ID 和当时权限；先确定成功到哪一步。</details>

<details><summary>10. 当前 S2 可直接执行本章纸上 SQL outbox 核对吗？</summary>

不能。该路径只属于未来 S3 教学方案，不能凭静态图查不存在的权威表。</details>

<details><summary>11. 未来 S3 m-9 已提交但 E9 `PENDING`，应直接换随机事件 ID 吗？</summary>

不应。沿稳定 `evt:m-9:v1` 查发布/ACK，按预算受控恢复。</details>

<details><summary>12. SearchIndex 可搜能直接证明 B 设备收到通知吗？</summary>

不能。搜索和设备/阅读是不同链路。</details>

<details><summary>13. E-bad 未决时为降 lag 静默越过同会话 offset 可吗？</summary>

不可。需显式顺序/缺口、隔离、修复和对账政策。</details>

<details><summary>14. B 离线超玩具 broker 保留，恢复消息从哪里来？</summary>

在当前权限下从权威消息历史按 seq 补拉。</details>

<details><summary>15. 运行手册可把私有正文直接复制进普通日志供值班查看吗？</summary>

不应。使用脱敏 ID/版本/阶段与受控权限查询。</details>

<details><summary>16. 一条手册步骤没有下一个责任人或停止条件，算可执行吗？</summary>

不足。需写清已知/未知、条件动作、交接和禁止盲重放的门槛。</details>

### ADR 与复盘 17–22：让别人能复核

<details><summary>17. ADR-R9 为什么列“直接改 v1、版本化新路径、维持 6 B”三项？</summary>

让决策者看清旧客户端兼容、拒绝语义和回退成本，不能只写一个偏好。</details>

<details><summary>18. R9 后来被拒绝，应删掉 Proposed ADR 吗？</summary>

不应。记录状态及新决定/取代关系，保留当时背景与未采用原因。</details>

<details><summary>19. 纸上 T+14 告警能证明故障只影响 m-9 吗？</summary>

不能。已知 m-9 的搜索延迟；其他消息/用户范围需另查，不能编数字。</details>

<details><summary>20. 复盘只写“工程师操作失误，下次小心”够吗？</summary>

不够。应记录促成条件、检测/缓解和有 owner/期限/验收的系统性行动，保持无责备。</details>

<details><summary>21. 固定 OpenIM 两段源码能证明它采用教学 SQL outbox 吗？</summary>

不能。仅核对所述发送入队返回和另一 MongoDB 消费写入位置。</details>

<details><summary>22. 未参加讨论的审阅者如何判断结论可靠？</summary>

沿版本/状态/适用环境，找到合同、固定源码或真实运行证据、未知项和下一负责人；不能只看“大家同意了”。</details>

## 本章完成标准与下一步

能不看答案把一句“B 没收到”拆成 S2/S3 合同与五份文档的不同任务，写出待决 ADR、逐站排障手册、事实/未知分栏的虚构复盘和可验收行动项，才算完成第一轮。真实环境的值班、发布与事故证据另由学习者按权限记录，本章没有代替操作。下一章 10.12 将用实际消息规则变化评估耦合、测试成本与技术债的渐进偿还顺序。
