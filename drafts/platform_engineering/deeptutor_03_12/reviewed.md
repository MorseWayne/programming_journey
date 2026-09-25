# 03.12 资源故障案例：描述符耗尽、磁盘满与网关退出

> DeepTutor 八节初稿经技术与教学审阅后的静态课程。以下四张故障卡是**彼此独立的脱敏纸上变式**，不是本项目的一次真实事故；没有运行 Go、IM、数据库、容器、故障注入、信号操作、部署或站点。当前 S2 `/v1` 仍是消息正文非空且最多 **6 UTF-8 B**、原始 HTTP 请求正文最多 **4096 B**、同 ID 即使同正文重复也 **409**、非成员目标隐藏 **404**、`200 accepted_in_memory` 只表示本进程内存受理；未来 S3 `/v2` 的 `stored_in_teaching_db` 是提议且仍为 6 B，R9 6→9 B 待审。[09.02 当前合同](../../../src/docs/platform_engineering/curriculum/09_backend_security/02_http_api_contract.md)

## 一、同样是“消息发不出去”，先问失败在哪一步

用户看到 A 发送超时或 B 断线，系统可能缺**文件描述符**、**磁盘空间**、**可回收内存**，也可能只是收到正常退出信号却没排空长连接。它们可产生相似表面症状，恢复方式却不同：调高 FD 限制不能修复未来数据库 WAL 写入失败；清理磁盘也不能让 `SIGKILL` 关停的在途连接自动完成。03.10 的诊断方法要求先把业务结果、资源作用域、错误码和时间窗放在一起。[03.10 只读诊断](../../../src/docs/platform_engineering/curriculum/03_systems/10_system_diagnostics.md)

本章用四个**单独实验卡**，不把它们编成一场同时发生的“巨型事故”：

| 独立变式 | 第一份系统证据 | 业务上必须另问 |
|---|---|---|
| A：网关 FD 用尽 | 进程 `accept/open` 报 `EMFILE` | 哪些新连接/请求未进入，老连接是否还活着？ |
| B：未来 S3 写路径空间不足 | WAL/文件操作报 `ENOSPC`、`EIO` 或 `fsync` 失败 | `stored_in_teaching_db` 条件是否满足？ |
| C：cgroup 内存回收压力 | `memory.current/high/events` 与 I/O 等待变化 | 是变慢、OOM 还是另一瓶颈？ |
| D：网关收到退出信号 | `SIGTERM/SIGKILL`、退出码与关停日志 | 何时停接入，在途/长连接如何恢复？ |

当前仓库没有运行中的 S2/S3 在线 IM；所有观察都属于学习者将来在隔离实现中的**待验证假设**。即使纸上说明了某错误码，也不代表本项目或 OpenIM 曾经出现过它。[11.04 假设与反证](../../../src/docs/platform_engineering/curriculum/11_reliability/04_diagnostic_method.md)

## 二、故障卡 A：FD 额度用完，新连接进不来

**文件描述符 FD** 是进程引用已打开文件、socket、监听器等对象的整数编号。网关的每个已接受 TCP 连接通常占一个 socket FD；监听 socket、日志文件、epoll 实例和其他打开对象也占额度。`RLIMIT_NOFILE` 是进程可打开 FD 的软/硬限制；`accept(2)` 的 **`EMFILE`** 指当前进程的 FD 限额已到，**`ENFILE`** 指系统范围的打开文件限制已到。它们的调查范围和处置权不同。[Linux `accept(2)`](https://man7.org/linux/man-pages/man2/accept.2.html) · [`RLIMIT_NOFILE`](https://man7.org/linux/man-pages/man2/getrlimit.2.html)

纸上设某网关进程软限为 **1024 个 FD**，此刻有 **1020 个**打开 FD，且接下来没有任何关闭/其它打开、每个新接受连接恰占一个新 FD。最多还可分配 **4 个**，再尝试分配会碰到进程额度。这只是玩具算式：真实 `accept` 还会受监听队列、代理、TLS/日志打开、FD 复用和竞争影响，不能凭“当前 1020”精确预测第几位用户报错。

| 对照 | `EMFILE` 方向 | `ENFILE` 方向 |
|---|---|---|
| 首查范围 | 出错进程的软限、当前 FD 数与打开对象构成 | 宿主系统级文件对象用量与限额 |
| 相关现象 | 同进程新 `accept/open` 失败，老连接可能仍工作 | 多进程可能同时创建/打开失败 |
| 反证 | 进程 FD 远离限额且实际错误不是 `EMFILE` | 系统级额度有余量或错误只发生在一进程 |

`pids.max` 是 cgroup 可创建的内核任务/TID 额度，**不是 FD 或最大 WebSocket 数**；`ulimit -n` 与 `pids.max` 不能相互替换。若网关只报“连接失败”，还需查拒绝是否发生在客户端 DNS/TCP、监听队列、`accept`、TLS 或应用授权层，不能直接改软限。若确有 FD 泄漏，盲调高上限只是延后下一次耗尽；应找未关闭对象和连接生命周期。[03.11 pids/FD 区分](../../../src/docs/platform_engineering/curriculum/03_systems/11_isolation_limits.md) · [04.05 TCP 连接生命周期](../../../src/docs/platform_engineering/curriculum/04_networks/05_tcp_connection_lifecycle.md)

## 三、故障卡 B：磁盘满时普通写返回不等于已持久

这是**未来 S3 的纸上变式**，不是当前 S2 的写盘行为：假设权威事务本要把 `m-9/seq9` 与 outbox E9 一起提交，WAL 所在文件系统空间不足。`write(2)` 可能立即返回 **`ENOSPC`**，也可能因缓存/写回而在后续 `write`、`fsync` 甚至 `close` 才发现错误；`fsync(2)` 还可报告 `EIO` 或 `ENOSPC`。因此“某次 `write` 返回了字节数”并不能证明事务满足 `stored_in_teaching_db` 所要求的提交/崩溃恢复条件。[Linux `write(2)`](https://man7.org/linux/man-pages/man2/write.2.html) · [`fsync(2)`](https://man7.org/linux/man-pages/man2/fsync.2.html) · [`close(2)`](https://man7.org/linux/man-pages/man2/close.2.html)

要查的是**哪个文件系统/卷、谁在写、空间还是 inode/配额、错误在哪个阶段被观察到**。日志盘满与权威 WAL 盘满不必是同一影响；删除了一个仍被进程打开的大文件，也可能名字不见了而空间尚未释放；配额还可能给出不同错误类别。真实处置不能为了让 `df` 变绿而随意删除权威消息、WAL 或 outbox。[03.07 删除与打开对象](../../../src/docs/platform_engineering/curriculum/03_systems/07_files_directories.md) · [03.08 write/fsync/rename](../../../src/docs/platform_engineering/curriculum/03_systems/08_persistence_mechanisms.md)

| 纸上路径 | 可确认的状态 | 不能偷换成 |
|---|---|---|
| 写调用返回 | 本次调用已接受某些字节 | 事务已持久提交 |
| `fsync` 返回成功 | 该文件按其语义完成同步调用 | DB 权威事务/目录/副本全符合合同 |
| `fsync/close` 报错 | 有延迟暴露的写回/空间问题 | 一定没有任何先前数据生效 |
| 未来 DB 事务按定义提交 | 权威 `m-9/seq9` 与 outbox 的教学原子事实 | B 的设备已收到或已读 |

若未来接口承诺 `200 stored_in_teaching_db`，在**未满足该承诺**时不能伪造成功；若客户端已超时，事务究竟是否提交又可能不明，须用稳定消息 ID 与有权权威查询核对。当前 S2 的 `200 accepted_in_memory` 本身不保证存储，不能拿它反向证明“盘满也不影响消息可靠性”。[06.09 WAL 与恢复](../../../src/docs/platform_engineering/curriculum/06_databases/09_logging_recovery.md) · [09.05 未来 S3 边界](../../../src/docs/platform_engineering/curriculum/09_backend_security/05_data_access_migration.md)

## 四、故障卡 C：页缓存回收压力不等于 OOM

沿 03.11 的 cgroup v2 模型，`memory.current` 接近 `memory.max` 时，内核可能尝试回收文件页等可回收内存；若配置了 `memory.high`，超过高水位也可能让任务承担回收压力。页缓存收缩后，同一历史读取可能多做物理 I/O，B 补拉变慢；但“缓存变少 → 此请求变慢”的因果还需要命中/缺页、I/O 等待及同一工作负载对照，不能仅看一张内存图。[Linux cgroup v2：Memory Controller](https://cdn.kernel.org/doc/html/latest/admin-guide/cgroup-v2.html) · [06.04 页与缓冲池](../../../src/docs/platform_engineering/curriculum/06_databases/04_pages_buffer_pool.md)

`memory.events` 的 `high`、`max`、`oom` 和 `oom_kill` 是不同事件计数。`high`/`max` 增长支持压力或触及相应边界，**不等于**已有进程被杀；`oom_kill` 增量支持该范围有进程被 OOM killer 杀，还要核对具体进程及祖先/宿主情况。Go 堆低、进程 RSS 不高也不能排除该 cgroup 及后代的页缓存、socket 或其他进程造成压力。[03.11 memory.current/events](../../../src/docs/platform_engineering/curriculum/03_systems/11_isolation_limits.md)

若只是回收压力，恢复目标是**同负载的用户时延与 I/O 等待稳定**；若真发生 OOM 退出，还要核对连接断开、当前 S2 进程内状态及客户端重试。增大 `GOMEMLIMIT` 不是直接修复 cgroup 压力，因它是 Go 运行时软限制而非容器硬限；也不能把所有高 RSS 当内存泄漏。[11.05 Go 内存与 GC](../../../src/docs/platform_engineering/curriculum/11_reliability/05_cpu_memory_performance.md)

## 五、故障卡 D：SIGTERM 可安排退出，SIGKILL 没有排空机会

**信号**是内核向进程报告事件的一种机制。`SIGTERM` 默认终止进程，但程序可处理它并开始有界关停；`SIGKILL` 不能被捕获或忽略，所以不能指望收到它后再做“最后一次数据库提交”。编排环境的具体信号顺序/宽限期要以实际平台配置为准，不能把本题纸上十秒当通用默认值。[Linux `signal(7)`](https://man7.org/linux/man-pages/man7/signal.7.html)

一条有业务含义的网关退出路径可先**停止接入新请求/连接**，再给已进入的 HTTP 请求有限完成时间，通知长连接客户端重连并保存/核对权威状态，最后释放资源。Go `net/http.Server.Shutdown(ctx)` 会关闭监听器，等待普通活动 HTTP 连接回到空闲；它**不会自动关闭或等待已 hijack 的连接，例如 WebSocket**。应用须另设计 WebSocket 的停止接入、通知、在途任务和关闭/等待门；`Shutdown` 返回也不能证明 B 设备已处理每条消息。[Go `net/http.Server.Shutdown`](https://pkg.go.dev/net/http#Server.Shutdown)

| 关停阶段 | 纸上验收问题 | 不满足时的用户风险 |
|---|---|---|
| 停新接入 | 新请求是否路由到可用节点？ | A 被送到将退出的网关 |
| 有界在途 | 已开始的 POST 结果可否确认/查询？ | 服务端已受理而 A 只见断线 |
| 长连接处理 | B 是否获重连/补拉入口，队列怎样收尾？ | B 断线后只靠实时通知漏历史 |
| 退出后恢复 | 当前 S2 内存事实与未来 S3 权威事实分别是什么？ | 把内存 200 当持久/设备送达 |

当前 S2 **只保证进程内存受理**，无论是有序 SIGTERM 还是突然 SIGKILL，进程退出后都不能承诺旧内存消息仍在；未来 S3 若真的实现权威数据库，是另一个恢复合同。若 A 的响应丢失，客户端同 ID 重试在当前存活进程中可能遇到 409，跨进程/重启后的结果还要按实际状态核对，不应通过换新 ID 猛发制造重复。[09.04 响应丢失](../../../src/docs/platform_engineering/curriculum/09_backend_security/04_request_pipeline.md) · [10.10 发布与排空](../../../src/docs/platform_engineering/curriculum/10_engineering/10_continuous_delivery_versions.md)

## 六、把错误码、范围、时钟与反证连起来

“A 发不出去”并不告诉你该去调哪项资源。下面的诊断单把四个独立分支的**支持证据**和**反证**一起写出：

| 候选 | 支持它的纸上证据 | 会削弱它的观察 | 用户结果仍需确认 |
|---|---|---|---|
| 进程 FD 耗尽 | `accept/open` 报 `EMFILE`、同进程 FD 逼近软限 | 实际错误为授权 404 或进程 FD 远离上限 | 新连接失败比例、老连接状态 |
| 系统级文件耗尽 | 多进程 `ENFILE` 与宿主限额同窗 | 仅一进程 `EMFILE` | 受影响节点/会话范围 |
| 未来 S3 盘满 | 对应 WAL/卷有 `ENOSPC` 或同步失败 | 权威提交成功且错在网关/设备段 | `m-9/seq9` 是否权威存在 |
| 页缓存/回收压力 | cgroup 内存事件、缺页/I/O 等待与同负载时延同窗变化 | I/O 正常、慢时间在另一个阶段 | 历史查询/补拉完成点 |
| 退出/信号 | 进程退出码、信号与断连时间对应 | 进程未退出，只有单请求超时 | S2 在途未知及 B 重连补拉 |

一条 `EMFILE` 可能只影响新连接，已建立的 B 连接仍可继续处理；一次 `ENOSPC` 可能只影响某个卷；一个 `SIGTERM` 也可能是有计划摘流。需要实例、进程、卷/namespace、错误发生时间与请求身份，不能从“有人看到断线”外推全站故障。对比同负载、同版本的正常样本，才能将相关性推进到更可信的解释。[11.04 竞争假设](../../../src/docs/platform_engineering/curriculum/11_reliability/04_diagnostic_method.md)

## 七、恢复先守权威事实，再看业务确认点

纸上恢复顺序应按故障分支选择，而不是所有分支都“重启试试”。FD 耗尽先限制新接入并定位泄漏/软限；磁盘写失败先保护权威数据、停止伪造持久成功并查卷/空间/写回错误；内存压力先查回收/退出证据和工作量；信号退出先确认摘流、在途与 WebSocket 独立关停。实际修改资源限制或清理空间需有权限和回退门；本章只给静态决策。[11.10 事件响应](../../../src/docs/platform_engineering/curriculum/11_reliability/10_incident_response.md)

最终验收分别核对：A 的当前 6 B/409/404/`accepted_in_memory` 行为和未确认在途；B 是否能重连、有权查缺口；未来 S3 若实现，`m-9/seq9`、outbox E9 的权威事务是否满足承诺；未来设备应用 ACK 是否到达。B 离线 25 小时超过教学 broker 24 小时保留的变式仍须靠有权限的权威 DB 历史，而不能因重启“网关变绿”就宣称补拉完成。[07.12 权威历史恢复](../../../src/docs/platform_engineering/curriculum/07_cache_messaging/12_cross_system_consistency_case.md)

固定 `openimsdk/open-im-server` 提交 `f6411a8a1a31d3df36f4c2b3ad28481a94141e1f` 的 [`send.go` 选定分支](https://github.com/openimsdk/open-im-server/blob/f6411a8a1a31d3df36f4c2b3ad28481a94141e1f/internal/rpc/msg/send.go#L46-L70)调用 `MsgToMQ` 后返回；[另一 Mongo 消费路径](https://github.com/openimsdk/open-im-server/blob/f6411a8a1a31d3df36f4c2b3ad28481a94141e1f/internal/msgtransfer/online_msg_to_mongo_handler.go#L43-L69)调用 `BatchInsertChat2DB`。两处不提供真实 FD 限制、磁盘余量、退出信号、WebSocket 排空或设备恢复证据。[OpenIM 阅读地图](../../../src/docs/platform_engineering/curriculum/im_reference.md)

## 八、22 道分层练习：四张独立故障卡

先给每张卡写第一份错误码、作用域和反证，再展开反馈。

### 基础 1–8：名称与边界

<details><summary>1. `EMFILE` 与 `ENFILE` 分别指哪种范围？</summary>

`EMFILE` 是进程 FD 限额，`ENFILE` 是系统范围打开文件限额。</details>

<details><summary>2. `pids.max` 可以代替 `RLIMIT_NOFILE` 吗？</summary>

不能。前者限制内核任务创建，后者限制进程 FD 编号/数量边界。</details>

<details><summary>3. `write` 返回成功一定表示未来 S3 事务持久了吗？</summary>

不一定。错误可能在后续写回/`fsync/close` 暴露，DB 提交合同另需验证。</details>

<details><summary>4. `ENOSPC` 必定在第一次 `write` 就出现吗？</summary>

不必。缓存与写回可能使错误延迟报告。</details>

<details><summary>5. `memory.events high` 增长等于已有进程被杀吗？</summary>

不等于。高水位回收/节流与 `oom_kill` 是不同证据。</details>

<details><summary>6. `SIGTERM` 和 `SIGKILL` 都能被 Go 程序捕获并优雅退出吗？</summary>

不能。`SIGTERM` 可处理，`SIGKILL` 不能捕获或忽略。</details>

<details><summary>7. `http.Server.Shutdown` 自动等待 WebSocket 关闭吗？</summary>

不会。已 hijack 的连接要由应用另行通知与等待。</details>

<details><summary>8. 当前 S2 200 代表进程退出后消息一定恢复吗？</summary>

不代表。它只承诺本进程内存受理。</details>

### 推导 9–16：哪一层先失败

<details><summary>9. FD 软限 1024、当前打开 1020，本题静态假设还剩几个槽位？</summary>

4 个；真实环境仍要看其它打开/关闭与竞争。</details>

<details><summary>10. 达到进程 FD 限额后，老连接必立即断开吗？</summary>

不必。新 `accept/open` 可能失败，老连接是否继续要另查。</details>

<details><summary>11. 把 FD 软限调高一定修复 FD 泄漏吗？</summary>

不能。若对象未关闭，只会推迟下一次耗尽。</details>

<details><summary>12. 某日志卷满能直接证明权威 WAL 卷也满吗？</summary>

不能。要核对挂载/卷、写入位置和同步错误。</details>

<details><summary>13. `fsync` 报 ENOSPC 后能返回 `stored_in_teaching_db` 吗？</summary>

若未满足未来合同的提交条件，不能伪造该成功语义；结果不明时按身份查权威状态。</details>

<details><summary>14. memory.current 高、Go heap 低，可先排除资源压力吗？</summary>

不能。cgroup 还计页缓存、socket、内核及后代等内存。</details>

<details><summary>15. Shutdown 返回可证明 B 设备应用 ACK 到了吗？</summary>

不能。它不管 hijacked WebSocket 的应用层完成，更不等于设备确认。</details>

<details><summary>16. 进程退出且没有 OOM 事件，可直接判 OOM 吗？</summary>

不能。还需查 SIGTERM/SIGKILL、健康检查、部署与退出码等证据。</details>

### 恢复 17–22：业务事实与反证

<details><summary>17. 发现磁盘满可直接删除权威 m-9 或 WAL 腾空间吗？</summary>

不应。先保留权威事实并定位卷/空间/写回错误，在有权限的流程中处置。</details>

<details><summary>18. 网关重启后探针绿了，可以关闭“B 缺消息”事件吗？</summary>

不能。还需按权限核对历史缺口与设备处理结果。</details>

<details><summary>19. 关停长连接除了 Shutdown 还需什么？</summary>

停止接入、应用侧 WebSocket 通知/排空/关闭、在途期限和客户端重连补拉入口。</details>

<details><summary>20. B 离线 25h、教学 broker 保留 24h，恢复靠什么？</summary>

靠有权权威 DB 历史按会话序号补拉，不能只靠 broker 事件。</details>

<details><summary>21. 两处 OpenIM 固定源码可证明其真实 EMFILE/ENOSPC 事故吗？</summary>

不能。只看到选定发送与 Mongo 消费异步边界。</details>

<details><summary>22. 完整资源故障卡至少交什么？</summary>

用户确认点、错误码/信号与作用域、同窗资源证据、能推翻的观察、可逆止损、权威/在途/设备分层恢复门。</details>

## 本章完成标准与后续路径

能手算 FD 剩余槽位、用 `EMFILE/ENFILE`、`ENOSPC/fsync`、内存事件与信号区分四条故障路径，说明为什么 `Shutdown` 不自动排空 WebSocket，并为 S2 当前与未来 S3/S5 分开写恢复验证，才算完成第三卷。四张卡均为纸上练习，不是本仓库的运行结果。接下来按[学习路线](../../../src/docs/platform_engineering/curriculum/learning_path.md)进入[12.01 运行环境与制品](../../../src/docs/platform_engineering/curriculum/12_platform/01_runtime_artifacts.md)，从制品身份再进入镜像/容器与本地依赖。
