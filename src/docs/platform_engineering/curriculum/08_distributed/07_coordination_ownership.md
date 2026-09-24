---
title: 08.07 协调与对象归属：旧网关恢复后还能投递吗
icon: /assets/icons/article.svg
order: 8
date: 2026-09-24
---

[返回第八卷](./README.md) · [部分失败前置：08.01](./01_system_partial_failure.md) · [时间与顺序前置：08.02](./02_time_order.md) · [多数前置：08.06](./06_majority_consensus.md) · [IM 交付前置：07.12](../07_cache_messaging/12_cross_system_consistency_case.md)

# 08.07 协调与对象归属：旧网关恢复后还能投递吗

> DeepTutor 八节初稿经技术与教学审阅后的静态课程。`u-b/d-b1`、G1/G2、15 秒租约、20 秒停顿、revision 101/110/111 与 E9 均是**虚构纸上模型**；没有运行 Go、etcd、网关、IM、故障或站点。当前 S2 仍只承诺 `accepted_in_memory`；未来 S3 的 `stored_in_teaching_db` 仍是[教学合同提议](../09_backend_security/12_im_service_capstone.md)。本章的 etcd owner 设计不是已核对的 OpenIM 实现。

## 一、B 重连后，旧 G1 为什么还可能“活着”

虚构 B 的设备 `d-b1` 起初通过 WebSocket 连接网关 **G1**，服务希望通知 E9 能找到这个连接。G1 暂停运行 20 秒；设备因等待超时又连接 **G2**。从设备和 G2 看，G1 已不可用；从 G1 的内存看，旧 socket、待发 E9 和“我是 owner”的变量可能仍在。操作系统也未必已经给旧 TCP 连接一个可靠、及时的死亡通知。G1 恢复后若继续发 E9，就可能出现旧连接与新连接重叠、重复提示或结果未知。[08.01 部分失败](./01_system_partial_failure.md)

先分清四份状态：**物理连接**是某网关握有的传输句柄；**注册 owner**是协调存储认为哪台网关应接收新任务；**业务任务执行资格**决定哪一代网关能修改通知记录；**聊天历史权威事实**仍由第七卷的消息存储合同定义。注册表只有一条 owner 记录，并不使旧 socket 在同一瞬间物理消失，也不证明 B 收到或阅读 `m-9`。[07.12 T0–T8 确认点](../07_cache_messaging/12_cross_system_consistency_case.md)

这章要回答的业务问题是：G2 接管后，谁可以**继续领新提示任务**？G1 的迟到动作在何处被拒绝？若两条传输链都不可靠，B 如何从有权历史补回 `m-9`？第一遍只需沿一条 E9 画清拥有者和确认点；第二遍才研究租约过期、watch 断档和外部副作用。

## 二、先认五个原语：键、CAS、租约、revision、watch

用教学键 `/owners/u-b/d-b1` 表达设备连接的注册归属，值只含 `gateway_id=G1`、脱敏 `connection_id=conn1` 等最小路由信息，**不存聊天正文**。在 etcd v3 模型里，键有 `version`、`create_revision`、`mod_revision`、`lease`。键删除后 `version` 可回到 0；新建时 `create_revision` 是这次创建的全局存储修订号；`mod_revision` 是最近修改修订号；**lease ID 是租约身份，不应拿来当大小可比较的代次**。etcd 的 revision 是协调存储的逻辑顺序，既不是墙钟秒数，也不是会话 `seq=9`。[etcd API：键与修订号](https://etcd.io/docs/v3.6/learning/api/)

| 原语 | 本题用途 | 不能从它推出什么 |
|---|---|---|
| `Txn` 比较并写入（CAS） | 当 `Version(ownerKey)==0` 时，原子 `Put(owner=G1, lease=L1)`，竞争者只有按实际结果取得资格 | 只管 etcd 事务内的键，不包外部 SQL 或 socket |
| lease + KeepAlive | G1 持续续租；etcd 在未收到续租至超时后删除附着键 | G1 进程/旧 TCP 一定停止；设备一定离线 |
| `create_revision` | 本次 owner tenure 的单调代次，如 101；删除重建后新代次更大 | 它不是消息 ID、业务 seq 或自行预估的时间戳 |
| watch | 将 owner 变化通知网关/路由缓存 | 订阅者未收到事件就一定没有变化；watch 本身线性化 |
| Lock API | 在 etcd 的租约/修订号语义内争用协调资源 | 自动保护另一个数据库、broker 或设备上的副作用 |

G1 要抢占时，先取得租约，再在**同一 etcd `Txn`**里比较键缺失并带租约写入。两个竞争者都读到“没有 key”后再各自普通 `Put`，不是互斥；真正仲裁是服务端原子比较和成功分支。租约授予本身也不等于取得 owner。etcd 官方文档说明比较条件与事务分支在键值存储内原子执行；租约过期会删除所附键。[etcd 事务](https://etcd.io/docs/v3.6/learning/api/) · [etcd 租约](https://etcd.io/docs/v3.6/learning/api/)

## 三、从 r101 到 r111：G1 没收到续租回应时怎么办

固定一个**教学时序**；15/20 秒不是生产建议，且“20 秒停顿”本身不能精确计算 etcd 何时删键，下表**额外假设 etcd 确认租约已过期**。新 owner 的 `create_revision` 由存储分配，不能由 G2 的本地计数器随便取 102。[etcd Lease API](https://etcd.io/docs/v3.6/learning/api/)

| 点 | 协调存储可见状态 | G1/G2 各自可能相信什么 | 对 E9 的正确动作 |
|---|---|---|---|
| T0 | G1 用 L1 取得键，`create_revision=101` | G1 知自己是注册 owner | G1 可按任务/权限合同尝试处理，仍不等于 B 已收 |
| T1 | G1 停顿 20 秒，不再续租 | G1 的内存还保存“owner=我” | 内存声明已经不可靠 |
| T2 | L1 已过期，键被删，删除事件 revision=110 | G1 因停顿未见删除；B 重连 G2 | G2 尚不能仅凭“看不到 G1 socket”自称 owner |
| T3 | G2 用 L2 做 `Version(key)==0` 的 Txn 成功，键新建于 revision=111 | G2 持有新的注册资格；G1 仍可能持旧 101 | G2 把代次 111 带给受保护的目标 |
| T4 | G1 醒来，可能仍持 `conn1`；键此刻指向 G2/111 | G1 若只看旧内存会误投 E9 | G1 停止依赖旧资格，重验当前 owner；目标拒绝 101 的迟到效果 |

若 G1 的 KeepAlive **请求或回应丢失**，它不能从一次网络超时推出“etcd 已删键”或“租约仍有效”。安全做法是在不确定阶段暂停需要 owner 资格的外部动作，重新用能满足业务一致性要求的读取/事务核对该键、租约和代次；被围栏后不再沿旧资格继续。代次 101 与 111 只比较**同一个协调域内的 owner tenure**。若使用多个独立 etcd 集群、做快照恢复或迁移元数据来源，单调代次如何跨域延续要另设计，不能把本例数字推广为宇宙时钟。[etcd API：结果未知与 revision](https://etcd.io/docs/v3.6/learning/api_guarantees/)

## 四、锁不替外部目标拒旧写：fencing 要到副作用接受处

为什么 G1 的 lease 已失效还可能造成效果？`etcd Get(owner=G1)` 和“向另一个 SQL 库写通知记录”是**两次跨系统操作**：G1 在 Get 后暂停，G2 随后取得 111，G1 再写 SQL；早先的检查无法和后来外部写合成原子事务。etcd 官方明确提醒：锁/租约可保护 etcd 键，**不能单靠它保护外部资源**；外部资源也要支持版本验证。[etcd：锁与外部资源边界](https://etcd.io/docs/v3.6/learning/why/)

教学上可给通知目标一行 `dispatch_ledger(device_id,message_id,version,current_owner_generation,status)`。G2 在开始执行新代任务前，将 owner generation **111** 以目标端原子条件更新设为有效代次；G1 携 **101** 到来时，目标在**同一原子更新**内比较并拒绝旧代次，另按 `(d-b1,m-9,v1)` 稳定任务身份处理重复。这里“围栏 token”是**目标能比较的单调代次**，不能只是日志里写 `generation=111` 却在目标不检查。[08.05 路由 epoch 与过期写者](./05_partition_rebalancing.md)

还有一个不能藏掉的空窗：若协调存储已产生 111，但目标端**尚未安装 111**，它只见过 101，旧 G1 的请求可能在新围栏到达前被接受。目标端“见到新代次后拒旧代次”是有条件保证；若业务要求从**etcd 归属变化那一瞬间**就绝无旧效果，必须让所有效果通过同一可原子仲裁的状态机，或设计明确的切换屏障、等待在途请求完成再开放新 owner，不能把两个独立存储简单拼成原子切换。

直接向 G1 的旧 WebSocket 写数据更特殊：普通 SQL `dispatch_ledger` 没法撤回已出网的字节。连接层可检查代次、及时关闭旧连接；设备可按稳定 `message_id/version` 去重，业务最终仍可从权威历史补拉。即便 UI 只显示一次，也不能倒推网络只投递过一次；网关写成功也不能倒推 B 应用收到或已读。[07.07 重投与去重](../07_cache_messaging/07_ack_retry_dedup.md) · [07.12 设备确认](../07_cache_messaging/12_cross_system_consistency_case.md)

## 五、watch 是变化通知，断线或压缩后要重新建视图

如果路由缓存仅先读 owner 再 `watch`“从现在开始”，可能在两者之间漏掉 G1→G2 的变化。纸上安全衔接是：先做符合要求的**线性化 Range/Get**，读取快照与响应头 revision `R`；随后从 **`R+1`** 开始 watch（`start_revision` 包含指定 revision），处理增量。watch 可以按 revision 顺序发事件，也可从尚保留的历史修订号恢复；它不是“当前 owner 的线性化读取”。[etcd API：Range 与 Watch](https://etcd.io/docs/v3.6/learning/api/) · [etcd Watch 保证](https://etcd.io/docs/v3.6/learning/api_guarantees/)

若 watch 断开，记住**最后完整处理的 revision**，从下一 revision 恢复。若这些历史已经 compact，旧 revision 的 watch 会被取消并返回 `compact_revision`；此时必须重新做当前快照读取、重建本地路由缓存，然后从新 `R+1` 续看，不能悄悄跳过一段事件后继续声称缓存准确。另一个细节：watch 的进度通知来自连接的本地 etcd 成员，不能把“我没收到更新”当作多数侧当前无变化；关键写权要走存储事务/目标围栏。etcd 文档明确 watch 不提供线性化语义。[etcd 压缩与 Watch](https://etcd.io/docs/v3.6/learning/api/) · [etcd 交互说明](https://etcd.io/docs/v3.6/dev-guide/interacting_v3/)

本题 revision 101/110/111 排的是**etcd owner 键的变化**。消息 `m-9` 的会话 `seq=9`、E9 的 broker P0:42、设备收到时间都不因此变成 revision111。定位事故时把这四列分开记录，才能知道是路由没追上、消息未发布、通知重复还是设备离线。

## 六、租约管恢复速度，安全性还要有接收端规则

缩短 TTL 可让 G2 更快接手，却更容易因 G1 短时卡顿或网络抖动而误切；延长 TTL 减少误切，却拉长真正故障后的等待。**15 秒**只用来观察 T0–T4，不是任何 IM 服务的推荐默认值。KeepAlive 能证明 etcd 最近收到某租约续期，不证明 G1 的事件循环、到 B 的网络路径或 B 设备仍健康。Go 的 `context` 取消可以帮助正常运行的 G1 停止任务，不能在进程暂停或网络隔离时强迫已经发出的外部操作回滚。[etcd 租约语义](https://etcd.io/docs/v3.6/learning/api/) · [05.08 有界并发与取消](../05_runtime/08_concurrency_composition.md)

| 业务承诺 | 需要的证据或额外机制 |
|---|---|
| 同一时刻协调表最多一个注册 owner | etcd 原子 CAS/lease 键状态与可核对的 revision |
| 旧 owner 不再修改任务目标 | 目标端单调代次条件更新、切换屏障或同一原子仲裁域 |
| 物理上立刻只剩一个 TCP socket | 还需连接关闭/设备协议；租约键删除本身不保证 |
| E9 最终可被 B 看到 | 权威 `m-9`、权限、通知/补拉与设备确认分别检查 |

若协调集群失去多数或读写结果未知，为保护不能重复的副作用，处理者应暂停相关动作并依有权历史恢复，而不是因为“本机还握着旧锁对象”就继续写。可用性退化与安全性边界要在故障演练中明确。[08.06 多数与共识](./06_majority_consensus.md)

## 七、从症状排查到固定源码：可见的与尚未知的

最少观测 owner 键的 `gateway_id/create_revision/lease`、CAS 成功/失败、KeepAlive 失败/未知、过期删除次数、watch 最后 revision 与 compaction 重建、目标端旧代次拒绝、G1/G2 连接变化、E9 的稳定任务身份及 B 的补拉/设备回执。诊断用脱敏 ID 和代次，不复制聊天正文或凭据进注册表/普通日志。看到“B 收到两次提示”，先沿 E9 与设备 ID 找是否双网关尝试、是否目标围栏滞后、设备是否按稳定 ID 去重；看到“B 没收到”，仍要查权威历史与授权补拉。[11.03 观测与证据](../11_reliability/03_logs_metrics_traces.md)

固定 `openimsdk/open-im-server` 提交 `f6411a8a1a31d3df36f4c2b3ad28481a94141e1f` 中，[`send.go` 的所述发送分支](https://github.com/openimsdk/open-im-server/blob/f6411a8a1a31d3df36f4c2b3ad28481a94141e1f/internal/rpc/msg/send.go#L46-L70)调用 `MsgToMQ` 后返回；[另一路 MongoDB 消费处理](https://github.com/openimsdk/open-im-server/blob/f6411a8a1a31d3df36f4c2b3ad28481a94141e1f/internal/msgtransfer/online_msg_to_mongo_handler.go#L43-L69)调用 `BatchInsertChat2DB`。两处源码**没有验证**网关连接 owner 存在哪里、是否采用 etcd、租约如何续期或外部推送如何围栏。真实项目对照应继续追固定提交的 gateway 连接管理、路由存储与通知目标代码和配置；本文 G1/G2 模型不能冒充 OpenIM 行为。[OpenIM 阅读地图](../im_reference.md)

## 八、交付接管时序，再用 22 题检查边界

第一遍交出 `/owners/u-b/d-b1` 键、CAS、租约和 r101→r111 的状态表；第二遍交出旧 G1 迟到 E9 的**目标端拒绝规则**、watch 断线/压缩恢复步骤，以及“注册 owner、实际连接、业务效果、设备收/读”四列证据。以下练习先预测，再展开反馈。

### 基础 1–8：给每个原语找到边界

<details><summary>1. 注册 owner 键应存聊天正文吗？</summary>

不应。本题只存必要的网关/连接脱敏路由信息；权威正文另在受保护的消息存储。</details>

<details><summary>2. G1 获得 lease ID 就已经抢到 owner 吗？</summary>

没有。还须带租约通过服务端原子 CAS 写入 owner 键。</details>

<details><summary>3. `Version(key)==0` 在本题表示什么？</summary>

owner 键当前不存在，可作为 Txn 的抢占比较条件。</details>

<details><summary>4. `version=1` 能跨删除重建用作单调 owner 代次吗？</summary>

不能。键删除会重置版本；本题用新建键的 `create_revision` 101/111。</details>

<details><summary>5. lease ID 大小能直接证明 G2 比 G1 更新吗？</summary>

不能。它标识租约，不是给外部目标比较先后的单调 fencing token。</details>

<details><summary>6. etcd revision111 是 `c-a` 会话 seq111 吗？</summary>

不是。前者是协调存储逻辑修订号，后者若存在才是业务会话序号。</details>

<details><summary>7. watch 没收到删除事件，就证明 G1 lease 没过期吗？</summary>

不能。watch 可能断开、延迟或历史被压缩，关键判断要重新查权威键。</details>

<details><summary>8. etcd 锁能自动原子保护另一个 SQL 库的写入吗？</summary>

不能。外部目标需版本验证/围栏或共享的原子仲裁方案。</details>

### 时间线 9–16：让旧 G1 醒过来

<details><summary>9. T0 G1 的 owner 创建 revision 是多少？</summary>

纸上设为 101，附 L1；它不是墙钟秒数。</details>

<details><summary>10. T1 G1 停顿 20 秒、TTL 15 秒，就可只凭算术断言键已删吗？</summary>

不可。本题额外假设 etcd 已确认过期，真实结果要查协调存储状态。</details>

<details><summary>11. T2 租约过期删除事件的玩具 revision 是多少？</summary>

110；这表示 etcd 键变化，不表示旧 TCP 已物理关闭。</details>

<details><summary>12. T3 G2 取得的新 owner 创建 revision 是多少？</summary>

111，经 `Version(key)==0` 的 Txn 抢占成功后由存储分配。</details>

<details><summary>13. G1 恢复时还握着 conn1，可以继续按 101 无条件发 E9 吗？</summary>

不能。旧内存不等于当前资格；重验 owner，目标也要拒绝旧代次效果。</details>

<details><summary>14. 目标端已安装 111，收到 G1 的 101 应怎样处理？</summary>

在与副作用同一原子判断里拒绝旧代次，记录脱敏拒绝原因。</details>

<details><summary>15. 目标端尚未见 111，单靠“最终会有 fencing”能保证此刻拒绝 101 吗？</summary>

不能。仍有空窗；严格切换要同一原子仲裁或明确屏障/排空规则。</details>

<details><summary>16. G1 直接把字节写入旧 WebSocket，SQL 目标已拒绝能撤回这些字节吗？</summary>

不能。连接层/设备协议另需代次检查、关闭与稳定消息去重，设备收/读另证。</details>

### 评审 17–22：恢复 watch 与 IM 业务

<details><summary>17. 先线性化 Get 得到 revision R，应从哪个修订号开始 watch 增量？</summary>

从 `R+1` 开始；watch 的 `start_revision` 是包含指定修订号的。</details>

<details><summary>18. watch 的旧起点已被 compact，还能静默从当前事件继续吗？</summary>

不能。重新取当前快照与 revision，重建缓存，再从新 `R+1` watch。</details>

<details><summary>19. 续租超时能确定“G1 仍 owner”或“G1 已失去 owner”吗？</summary>

都不能。结果未知时停相关危险副作用，重新核对键/代次。</details>

<details><summary>20. 设备 UI 只显示一次 E9，就证明网络只推送了一次吗？</summary>

不能。设备去重可隐藏重复传输；记录网关尝试与设备确认。</details>

<details><summary>21. 固定 OpenIM 两段发送/落库源码可证明它用了本章 owner 租约吗？</summary>

不能。需进一步追固定提交的 gateway、路由和通知目标代码与配置。</details>

<details><summary>22. B 离线错过 E9，owner 注册最终正常后怎样核对业务恢复？</summary>

按当前成员权限从权威历史用 `seq` 游标补拉 `m-9`，并把设备接收/阅读与通知尝试分别记录。</details>

## 本章完成标准与下一步

能不看答案画出 r101→r110→r111、解释租约删除为何不能关闭旧 socket、目标为何要接收单调代次及其安装空窗；能把 watch 断线/压缩后的快照重建和 B 的授权补拉写完整，才算学会本章。真实环境还需记录 etcd 配置、协调响应、目标拒旧写、设备效果及故障注入证据。下一章 [08.08 跨服务事务](./08_cross_service_transactions.md) 将把协调之外的跨服务提交、补偿与状态查询放在同一业务需求下比较。
