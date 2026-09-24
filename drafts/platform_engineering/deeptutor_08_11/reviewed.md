# 08.11 分布式验证：一条旧读何时真违反承诺

> DeepTutor 八节初稿经技术与教学审阅后的静态课程。`m-9/c-a`、t1–t4、故障历史和合同 L 都是**脱敏纸上样本**；没有运行 Go、数据库、OpenIM、故障注入、Porcupine 或站点。当前 S2 的 `200 accepted_in_memory` 不承诺数据库持久化；未来 S3 的 `200 stored_in_teaching_db` 是[本地提交教学提议](../../../src/docs/platform_engineering/curriculum/09_backend_security/12_im_service_capstone.md)，也**不会自动使所有读取线性化**。本章为教验证，另设一个明确的权威读合同 L，不能把练习结果报道为真实服务已通过。

## 一、先问“检验哪句承诺”，再决定该注入什么故障

虚构 A 在 `c-a` 发 `m-9/seq9`，B 仍是有权成员。想检验“发送成功后 B 必见 9”，必须说明**哪个成功响应、哪个读取端点、允许哪些副本、是否存在撤回/退群**。S2 的内存受理响应不能证明进程重启后仍有 `m-9`；拟议 S3 只说本地 SQL Commit 已知完成，不直接承诺任意缓存、副本、搜索或设备立刻读到。把不同组件的结果揉成一个“消息一致”指标，既可能错报故障，也可能漏掉真问题。[09.02 S2 HTTP 合同](../../../src/docs/platform_engineering/curriculum/09_backend_security/02_http_api_contract.md) · [08.04 一致性模型](../../../src/docs/platform_engineering/curriculum/08_distributed/04_consistency_models.md)

为纸上练习**额外声明合同 L**：有权限的 `HistoryRead(c-a)` 从指定**权威读端点**返回会话最新消息位置，且这个读写对象满足线性化。线性化要求每次操作看起来在其**调用与返回之间**某一点生效，并保留“不重叠操作”的真实先后；它是一个比“本地提交”更强、需要单独设计和核验的读写合同。[Herlihy 与 Wing 原论文](https://www.cs.cmu.edu/~wing/publications/HerlihyWing90.pdf)

| 待检对象 | 本题声明/现有边界 | 合适的检查 |
|---|---|---|
| 当前 S2 POST | 200 仅 `accepted_in_memory`，同 ID 即使同正文重复 409 | HTTP 参数、状态和进程内受理证据；不拿它证明持久/线性化 |
| 未来 S3 POST | 纸上 200 `stored_in_teaching_db`，仅本地 DB 提交 | 稳定 ID、同库事务与提交未知故障核对 |
| **额外纸上 L** 的 `Send+HistoryRead` | 指定权威端点的线性化读写对象 | 有界调用/返回历史 + 顺序规格 |
| SearchIndex/Notify | 派生处理、可能滞后，需各自追赶/修复合同 | ID/版本差集、最老年龄和明确期限，不强塞入 L |
| B 设备收/读 | 设备协议/用户回执 | 独立回执，不能由 DB/队列 ACK 代替 |

## 二、可检查的历史要保存“调用”和“返回”两端

记录一次操作，至少要有操作者（A/B）、`call_id`、目标端点/路由、稳定 `message_id` 与版本、参数类别、**调用事件**、**返回事件或未返回**、状态码/所见 seq、故障注入起止及执行版本。消息正文是私有数据，验证日志可只存脱敏 ID、长度/摘要和授权判定，不复制明文。`seq9` 是业务顺序，不能替代调用时间；Raft index、broker offset 与 watch revision 也各自不同。[08.02 时间与因果](../../../src/docs/platform_engineering/curriculum/08_distributed/02_time_order.md) · [11.03 观测数据](../../../src/docs/platform_engineering/curriculum/11_reliability/03_logs_metrics_traces.md)

`Send(m-9)` 若请求已发出却没有返回，调用者的结果是**未知/未完成操作**，不能直接记为失败，更不能在检查器里偷偷删除这个操作并宣布系统未写入。后续可按稳定 ID 查询权威记录，再明确如何把这次悬而未决的调用纳入模型。若某历史只保留“成功日志”而丢掉调用前/超时段，它无法检验“成功之前是否有并发读”，反例判断会失真。[Jepsen：历史与一致性模型](https://jepsen.io/consistency/models)

跨客户端真实先后不能仅从两台机器的本地墙钟排序：时钟可能偏差。纸上 t1–t4 假设同一测试协调器或已核对的同步/交接事件给出调用与返回的先后关系。真实实验需记录时间来源、精度和故障注入器自身延迟；不能拿 Trace 中两个不同主机的未校准时间戳硬造“不重叠”。

## 三、三条四步历史：旧读何时是反例

保持 B 有权、消息未撤回、读取同一个合同 L 权威端点。定义顺序规格：初始最新 `seq=8`；唯一 `Send(m-9)` 成功后，最新为 `9`；无其他写入。如下两条历史都“读到了 8”，但结论相反：

| 时刻 | **Hbad：发送先完成** | **Hoverlap：调用重叠** |
|---|---|---|
| t1 | A 调用 Send(m-9) | A 调用 Send(m-9) |
| t2 | A 收到“本题 L 的写成功” | B 调用 HistoryRead(c-a) |
| t3 | B 调用 HistoryRead(c-a) | B 返回 `latest_seq=8` |
| t4 | B 返回 `latest_seq=8` | A 返回“本题 L 的写成功” |

**Hbad** 的写返回早于读调用；任何保留真实先后的线性化顺序都必须先写 9 再读，所以读 8 与合同 L 冲突。若真实系统只承诺“从可能落后副本读”，这不是该系统的已声明合同反例；必须先确定 L 确实适用于被测端点。**Hoverlap** 中读与写在时间上重叠，可以把读的生效点放在写的生效点之前，读 8 因而**可能合法**。把“读到旧值”本身当线性化失败，是忽略了调用/返回区间。[线性化原论文](https://www.cs.cmu.edu/~wing/publications/HerlihyWing90.pdf)

第三条 **Hmono** 用另一份明确合同：同一 B 会话第一次权威读返回 9，随后第二次仍对同一有权历史读到 8，且期间无撤回/可见范围变更；若承诺**单调读**，它违反该会话合同。即使两个读各自可在不同副本上找到某种局部解释，应用也不能把先见 9 再见 8 当“正常旧值”。但这条检验的是会话观察性质，不能在未声明单调读时凭感觉下结论。[08.04 会话一致性](../../../src/docs/platform_engineering/curriculum/08_distributed/04_consistency_models.md)

## 四、顺序模型 + 有界历史：检查器能给什么证据

把 L 缩成一个可执行的**顺序对象**：状态是当前 `messages` 的 ID 集/最新 seq；`Send(m-9)` 若此前没有这个业务 ID，按规则加入并返回成功；`HistoryRead(c-a)` 返回当时最新的有权 seq。真实系统的授权、重复 409、撤回和版本若纳入测试，也要写进规格，不能测试时使用比产品更简单或更强的模型。检查器寻找一种把每次操作放进其调用/返回区间、同时满足顺序规则的排列。[Porcupine 官方仓库](https://github.com/anishathalye/porcupine) · [Herlihy–Wing 论文](https://www.cs.cmu.edu/~wing/publications/HerlihyWing90.pdf)

Porcupine 是用 Go 编写的线性化检查工具，可接收顺序模型和并发历史（调用/返回事件或带区间的操作），并报告该**有限历史相对于该模型**是否可线性化。找到无法安排的 Hbad 是强反例线索，还要核对模型、输入、故障与数据来源；检查通过则只是“这份有限历史没有发现违反模型的排列”，**不是所有流量、故障或未来版本均正确的证明**。未返回操作、查询结果未知及权限改变须按所选模型处理，不能随意把不方便的记录删掉使检查器变绿。[Porcupine README](https://github.com/anishathalye/porcupine)

验证记录最好能让另一人重放：测试代码与被测提交 SHA、操作模型版本、随机种子、调用/返回原始脱敏历史、路由/副本配置、故障脚本和实际生效证据、检查器结果或最小反例。论文解释了性质，工具只按输入执行；模型写错或历史漏记时，“绿色”没有相同说服力。[10.09 验证与候选制品](../../../src/docs/platform_engineering/curriculum/10_engineering/09_ci_artifacts.md)

## 五、故障注入要证明打中了正确链路

按已讲过的 IM 故障点设计受控变式：隔离旧权威 owner/领导者，观察新多数与路由；在 DB Commit 之后丢 A 的 HTTP 回应，观察稳定 ID 查询；令 N9 的 W1 租约过期、W2 接管，看旧 token 写是否拒绝；让 E10 先完成后迟到 E9，再读预览/搜索版本；重放 `evt:m-9:v1` 后已是 `m-9:v2`，查旧事件是否覆盖新文档。这些分别触碰权威读、任务归属、派生顺序，**不是一条通用线性化测试**。[08.07 旧 owner 围栏](../../../src/docs/platform_engineering/curriculum/08_distributed/07_coordination_ownership.md) · [08.09 任务接管](../../../src/docs/platform_engineering/curriculum/08_distributed/09_reliable_jobs_scheduling.md)

| 注入 | 注入器说已做什么 | 仍需核对的“真的打中”证据 |
|---|---|---|
| 网络分区 | 阻断 N1↔N2 | 被测请求实际经哪条链路/路由，丢包或连接错误何时出现 |
| 丢 HTTP 回应 | 断开 A 的读取端 | DB 事务是已提交、未提交还是未知；对应 `message_id` 是否可查 |
| 暂停 W1 | W1 停了 6 秒 | 任务租约确已过期、W2 token 更高、旧 W1 的条件更新被拒 |
| 迟到 E9 | 延迟某次消费者处理 | E10/E9 实际应用顺序、目标版本及缺口是否对账 |

故障脚本退出码为 0 只能证明脚本按其接口返回，不能证明生产流量路径被正确隔离；若故障开始前请求已经完成，事后看到旧值也不构成“故障导致”的证据。测试要记录**注入开始、实际观测生效、注入结束、恢复与补拉**四个时间/状态点，失败时保留现场而非只重跑到绿。[11.03 Trace 与指标](../../../src/docs/platform_engineering/curriculum/11_reliability/03_logs_metrics_traces.md)

## 六、局部事务与派生追赶要用不同判据

未来教学 S3 的 `messages(m-9)` 与 `outbox(evt:m-9:v1)` 在**同一 SQL 事务**写入；在本题尚未清理 outbox 的检查窗口内，用**同一数据库一致快照**核对 ID 与事件意图是否同成同败。若两个查询分别落不同时间/副本，看到一个有、一个无可能只是读窗口错位，不能立刻断言本地原子性破坏。若已按保留政策清理已发布 outbox，则须改看审计/发布记录，不能机械要求永久保留这行。[07.10 事务边界](../../../src/docs/platform_engineering/curriculum/07_cache_messaging/10_transaction_outbox.md) · [06.07 事务与可见性](../../../src/docs/platform_engineering/curriculum/06_databases/07_transactions_anomalies.md)

SearchIndex 与 Notify 是派生目的，不应拿 L 的“发送返回后下一次读必须立刻见 9”直接判它们失败。给它们分别声明**可验证的追赶期限**、权威源和修复方式：例如纸上要求故障恢复后在某已定义窗口内索引的 ID/版本/撤回/权限与权威库对账，通知任务的最老年龄不持续上升。若产品只说“最终会一致”却不给时间界限，一次测试只可证明**这次样本后来追上**，无法从有限观察证明永远都会收敛。[07.11 派生视图重建](../../../src/docs/platform_engineering/curriculum/07_cache_messaging/11_derived_views_event_time.md) · [07.09 最老年龄](../../../src/docs/platform_engineering/curriculum/07_cache_messaging/09_backlog_poison_messages.md)

权限也要独立验证：已登录但不是 `c-a` 成员的 `u-c` 在当前 S2 隐藏目标合同下应见 **404**，不能通过搜索索引、缓存或补拉泄露私有正文。B 离线 25 小时越过玩具 broker 24 小时保留后，应按当前授权从权威历史按 seq 补拉，而非要求日志无限保留。broker ACK、索引可检索与 B 的设备收/读回执各是不同断言。[09.02 HTTP 合同](../../../src/docs/platform_engineering/curriculum/09_backend_security/02_http_api_contract.md) · [07.12 离线补拉](../../../src/docs/platform_engineering/curriculum/07_cache_messaging/12_cross_system_consistency_case.md)

## 七、模拟、`-race` 与真实故障各证明一段

确定性模拟能控制调度、网络/存储返回次序，重复某个失败交错；但它的模型可能漏掉内核 socket 行为、真实时钟漂移、部署配置、提供方回调或数据库故障模式。真实故障注入能覆盖实际集成路径，却仍受实验版本、机器、时长、负载、故障集合和采样范围约束；没有跑到的交错不能由一次通过推成永远安全。两种证据相互补充。[Porcupine 的有界历史用法](https://github.com/anishathalye/porcupine)

Go 的 `-race` 检测**实际运行路径中**的内存数据竞争，是 Go 并发实现的一层检查；官方明确它找不到未执行代码路径里的竞态。它也不能把跨节点操作历史变成线性化证明，或证明 broker、SQL、设备之间没有业务重复。反过来，没有本地 Go 数据竞争也不意味着分布式服务一致。[Go Race Detector 官方文档](https://go.dev/doc/articles/race_detector) · [05.09 并发验证](../../../src/docs/platform_engineering/curriculum/05_runtime/09_concurrency_verification.md)

固定 `openimsdk/open-im-server` 提交 `f6411a8a1a31d3df36f4c2b3ad28481a94141e1f` 的 [`send.go` 所述路径](https://github.com/openimsdk/open-im-server/blob/f6411a8a1a31d3df36f4c2b3ad28481a94141e1f/internal/rpc/msg/send.go#L46-L70)在 `MsgToMQ` 后返回，[另一路 MongoDB 消费处理](https://github.com/openimsdk/open-im-server/blob/f6411a8a1a31d3df36f4c2b3ad28481a94141e1f/internal/msgtransfer/online_msg_to_mongo_handler.go#L43-L69)调用 `BatchInsertChat2DB`。这两处是**源码阅读证据**，本章没有运行 OpenIM 或注入故障；不能写“已验证 OpenIM 线性化/最终一致/设备送达”。需要填真实项目矩阵时，另查实际读路径、确认配置、部署与原始运行历史。[09.05 固定源码边界](../../../src/docs/platform_engineering/curriculum/09_backend_security/05_data_access_migration.md)

## 八、交付三条历史与 22 道分层练习

交付 Hbad、Hoverlap、Hmono 三条调用/返回时间线，每条写**被检合同**；再交一份故障注入与生效证据矩阵、一次局部原子对账和一次派生追赶/权限检查的测试设计。只做纸上推演时，所有“实测结果”栏填**未运行**，不能凭设计图填通过。

### 基础 1–8：先界定模型

<details><summary>1. 当前 S2 的 200 可证明 `m-9` 已持久化吗？</summary>

不能。它仅 `accepted_in_memory`；未来 S3 本地 SQL 提交仍是教学提议。</details>

<details><summary>2. 拟议 S3 的 `stored_in_teaching_db` 自动承诺 SearchIndex 线性化吗？</summary>

不承诺。它只描述本地 DB Commit，搜索派生链另有追赶合同。</details>

<details><summary>3. 本章 L 的被检读端点是什么？</summary>

纸上额外声明的指定权威 `HistoryRead(c-a)`，不能自动套到缓存/副本/搜索。</details>

<details><summary>4. 一条可检查操作为何要同时存调用与返回？</summary>

二者给出操作可能生效的时间区间和与其他操作的真实先后。</details>

<details><summary>5. `seq9` 是跨客户端墙钟吗？</summary>

不是。它是会话业务顺序，不能替代调用/返回时间。</details>

<details><summary>6. Send 无回应可直接记作“确定失败”吗？</summary>

不能。结果未知；服务端可能已提交，要按稳定 ID 核对。</details>

<details><summary>7. SearchIndex 暂时落后可直接作为 L 的反例吗？</summary>

不可。L 只适用于额外指定的权威读对象；搜索按自己的派生追赶合同检查。</details>

<details><summary>8. `u-c` 已登录但非成员，能绕过对象授权看 `m-9` 吗？</summary>

不能。当前隐藏目标政策为 404，搜索和补拉也不可泄露正文。</details>

### 历史与故障 9–16：判定真正反例

<details><summary>9. Hbad 中 Send 返回先于 Read 调用，Read 返回 8，是否违反 L？</summary>

是。在无撤回/权限变化的顺序规格里，写 9 完成后才开始的权威读不能读 8。</details>

<details><summary>10. Hoverlap 中 Read 与 Send 重叠、Read 先返回 8，必然违反 L 吗？</summary>

不必然。可把读的生效点排在写之前，仍保留调用/返回区间。</details>

<details><summary>11. B 先读 9 后读 8，若声明单调读，结论是什么？</summary>

在无可见规则变更时违反该会话合同；它与 L 的被检对象要分别说明。</details>

<details><summary>12. 两台机器的本地时间戳不校准，可直接给跨客户端操作排非重叠吗？</summary>

不可。需单一测试协调器或可核对的同步/交接顺序与时间误差证据。</details>

<details><summary>13. Porcupine 说这份历史可线性化，能推出全部未来执行都正确吗？</summary>

不能。只说明输入的有限历史相对所给顺序模型未发现反例。</details>

<details><summary>14. 故障脚本返回 0 就证明真实服务路径已被隔离吗？</summary>

不能。还须核对实际路由、丢包/连接错误与注入生效区间。</details>

<details><summary>15. 丢 HTTP 回应后 A 超时，怎样分辨 DB 是否已提交？</summary>

按稳定 `message_id/operation_id` 查询权威库及同事务记录，超时本身不判定成败。</details>

<details><summary>16. W1 租约过期后 W2 接管，应检查什么旧动作？</summary>

W2 新 token、W1 迟到任务状态写被拒，以及外部推送是否已发生/可能重复。</details>

### 证据评审 17–22：给“通过”加上范围

<details><summary>17. 分开时刻读 `messages` 与 `outbox`，看到一有一无可直接判本地事务破坏吗？</summary>

不能。用同一一致快照和未清理窗口核对，避免读时间/副本差异。</details>

<details><summary>18. 搜索最终追上却没有截止时间，一次样本可证明“永远最终一致”吗？</summary>

不能。只能报告这次样本何时追上；可检验时效要有明确期限/分母。</details>

<details><summary>19. B 离线 25h，玩具 broker 只保留 24h，还应从哪里补拉？</summary>

从权威消息历史按当前权限和 seq 游标补拉。</details>

<details><summary>20. `go test -race` 通过可证明跨节点 HistoryRead 线性化吗？</summary>

不能。`-race` 只检查实际运行到的本地内存数据竞争，跨节点历史另建模。</details>

<details><summary>21. 固定 OpenIM 两段源码可写成“已完成故障注入验证”吗？</summary>

不能。源码阅读不是运行历史；本章未运行 OpenIM。</details>

<details><summary>22. 一份可信的失败报告至少保留什么？</summary>

被检合同、代码/模型版本、脱敏原始调用返回、故障实际生效证据、路由/配置、检查器反例与未覆盖范围。</details>

## 本章完成标准与下一步

能不看答案分别判 Hbad、Hoverlap、Hmono，说明为什么未回应是未知、为什么 S3 本地提交不自动承诺 L、为什么 SearchIndex 要用另一份追赶判据；能把故障脚本的“发出命令”与服务路径的“实际生效”证据对齐，才算完成第一轮。学习者未来在自己的隔离环境可按此设计运行并保存原始记录，本页没有代替实测。下一章 08.12 将以完整 IM 一致性案例汇总正常、故障、恢复与迁移时的业务解释。
