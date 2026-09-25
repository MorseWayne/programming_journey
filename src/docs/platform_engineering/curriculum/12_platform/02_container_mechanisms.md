---
title: 12.02 容器机制：镜像、进程、可写层和长连接退出
icon: /assets/icons/article.svg
order: 3
date: 2026-09-25
---

[返回第十二卷](./README.md) · [制品身份：12.01](./01_runtime_artifacts.md) · [隔离与限制：03.11](../03_systems/11_isolation_limits.md) · [资源故障：03.12](../03_systems/12_resource_failure_case.md) · [长连接：04.05](../04_networks/05_tcp_connection_lifecycle.md)

# 12.02 容器机制：镜像、进程、可写层和长连接退出

> DeepTutor 八节初稿经技术与教学审阅后的静态课程。镜像 D1、容器、挂载、信号与 IM 状态均是**虚构纸上对象**；未构建镜像、启动容器、运行 Go/IM、部署或构建站点。当前 S2 `/v1` 仍是正文非空且最多 **6 UTF-8 B**、原始 HTTP 请求正文最多 **4096 B**、同 ID 重复 **409**、非成员目标隐藏 **404**、成功 `200 accepted_in_memory` 只代表本进程内存受理；未来 S3 `/v2` 的 `stored_in_teaching_db` 是提议且仍为 6 B，R9 6→9 B 待审。[09.02 当前合同](../09_backend_security/02_http_api_contract.md)

## 一、镜像 D1 被“运行”后，多了哪些对象

12.01 已把源码、Go 二进制、OCI 镜像 digest D1、tag 与运行配置拆开。现在纸上从 D1 启动两个网关容器 **A、B**。镜像给出文件层和默认入口等内容；容器运行时再指定要执行的进程、namespace/cgroup、网络、挂载、用户身份和资源限制。**D1 相同**不等于 A/B 是一个进程、不等于共享进程内存，也不保证连接或消息状态相同。OCI 运行规范把可执行进程、mounts、namespace 与 cgroup 资源写成运行配置，说明它们不是镜像 digest 单独能决定的全部行为。[OCI Runtime Spec：Linux](https://github.com/opencontainers/runtime-spec/blob/main/config-linux.md)

| 对象 | 纸上 A/B 的关系 | 不要误读成 |
|---|---|---|
| 镜像 D1 | 两容器可引用同一内容 | 两个容器已共享内存中的 `m-a` |
| 主进程 | A、B 各有一次进程生命周期 | 镜像一更新，已运行进程自动变新版本 |
| 可写层 | 各容器独立的本地文件改动 | 权威历史自然共享/持久 |
| named volume | 若明确挂同一卷，可引用同一卷内容 | S2 内存消息自动写到该卷 |
| 外部 DB | 未来 S3 若实现的权威状态 | 当前 S2 200 已满足存储确认 |
| 网络/权限 | 按运行配置形成的视图和访问权 | 容器 `localhost` 自动等于宿主或另一个容器 |

**容器不是小型独立虚拟机。** 在 Linux 上，它是进程在宿主内核提供的视图、权限与资源控制下运行；具体哪些 namespace 新建、哪些继承或共享由运行配置决定。教学的重点是问清每条状态的**所有者和生命周期**，再讨论重启或换镜像后的恢复。[03.11 namespace/cgroup](../03_systems/11_isolation_limits.md)

## 二、镜像只读层、容器可写层与“重启”和“重建”

镜像由一组内容固定的文件层组成。以 Docker 的常见存储模型解释，启动容器时会在只读镜像层上加一个**该容器独有的可写层**；修改镜像里已有文件时可通过写时复制得到容器自己的版本。具体存储后端随运行时/版本而不同，不能把 `overlay2` 的每个实现细节当所有容器平台的保证。[Docker：Container layer basics](https://docs.docker.com/engine/storage) · [OCI Image Config](https://github.com/opencontainers/image-spec/blob/main/config.md)

假设 A 在容器自己的 `/tmp/trace.tmp` 写了一份虚构诊断暂存，B 使用相同 D1 也不会自动看见 A 的文件。若只是**停止并启动同一个容器实例**，其可写层通常仍属于该实例；若**删除 A 并按 D1 新建 A2**，原 A 的可写层不会自动成为 A2 的文件。`/tmp` 是否另挂 `tmpfs` 还要看运行配置：若是 tmpfs，进程/容器停止后的内容更不应当作持久状态。不能从路径名 `/tmp` 猜它究竟位于可写层还是 tmpfs。[Docker：Storage](https://docs.docker.com/engine/storage)

| 状态位置 | 停止/再启同一容器 | 删除后新建容器 | IM 业务解释 |
|---|---|---|---|
| Go 进程内存 | 旧进程退出即消失 | 不会自动带入 | 当前 S2 内存受理、在线连接没有跨进程承诺 |
| 容器可写层 | 同一容器实例可保留 | 原层不自动附到新实例 | 不能当权威历史或备份 |
| tmpfs 挂载 | 非持久 | 非持久 | 适合临时数据，不能承诺历史恢复 |
| 明确保留并重挂的 named volume | 可继续用 | 可按卷名重新挂载 | 卷字节保留仍不证明 DB 事务正确 |
| 外部权威 DB | 取决于 DB 自身持久/恢复合同 | 另按身份连接 | 未来 S3 才能讨论 `m-9/seq9` 的权威性 |

这张表讲**生命周期**，不是说当前仓库已做这些配置。即使卷中有文件，也要有完整事务、身份、权限和备份恢复证据，才可把它作为权威消息事实。[03.08 崩溃与持久化](../03_systems/08_persistence_mechanisms.md)

## 三、volume 让数据独立于容器，但不代替数据库提交

Docker 的 **named volume** 通常独立于某个容器生命周期，删除容器后可继续保留；要让新容器用同一数据，仍须明确按正确卷名/路径重新挂载并守权限。匿名卷、bind mount 和 tmpfs 也各有管理方式，不能从“容器里看到 `/data`”就断言它是哪一种。**非空 volume** 挂到已有镜像目录会遮住原内容；Docker 将**空 volume** 首次挂到非空目录时，默认会把原内容复制进卷，也可通过选项禁止复制。因此同 D1 的两个实例若挂载不同，读到的文件可不同。[Docker：Volumes](https://docs.docker.com/engine/storage/volumes/) · [Storage mount options](https://docs.docker.com/engine/storage)

| 挂载形式 | 它解决的主要问题 | 留下的责任 |
|---|---|---|
| named volume | 数据可独立于单个容器存在 | 卷身份、重新挂载、备份、权限、删除策略 |
| bind mount | 把明确宿主路径暴露给容器 | 宿主路径、权限、可移植性与误写风险 |
| tmpfs | 把临时内容放在内存类挂载 | 停止后丢失、内存记账与容量上限 |
| 容器可写层 | 给单容器短期文件改动 | 删除/重建时不可当权威数据依赖 |

当前 S2 合同是**进程内存受理**。即使给网关挂名为 `history` 的 volume，`m-a` 也不会自动从内存变成持久消息；应用若未写入卷且未定义写入/刷盘/恢复协议，就没有新的成功语义。未来 S3 若用教学 DB 保存 `m-9/seq9` 与 outbox，卷可承载某些 DB 文件，但数据库的提交与授权历史仍由数据库合同证明，不能由“卷存在”推导。[06.09 WAL 与恢复](../06_databases/09_logging_recovery.md) · [07.12 权威历史](../07_cache_messaging/12_cross_system_consistency_case.md)

## 四、namespace/cgroup 是可组合的运行配置

03.11 已讲：**namespace** 改进程看到的 PID、挂载、网络、用户等视图，**cgroup** 管 CPU、内存与任务等资源的记账/限制。OCI Linux 运行规范允许运行时按配置创建或加入现有 namespace；不能说“所有容器必有独立 network namespace”或“容器内 root 一定是宿主 root”。权限还取决于用户映射、capability、文件与网络规则。[OCI Runtime Spec：Namespaces/Cgroups](https://github.com/opencontainers/runtime-spec/blob/main/config-linux.md)

纸上 A/B 使用同 D1，但 A 的网关 cgroup `cpu.max=50000 100000`（长期平均约 0.5 核），B 的资源设置不同。宿主 CPU 空闲时 A 仍可能被自身配额节流；这与 Go 二进制是否相同没有矛盾。A 内部访问 `127.0.0.1` 会落在它所在**网络视图**；若运行时安排 A/B 共用网络 namespace，则又是另一种明确配置。端口映射和服务发现留到 12.03 继续展开。[03.11 0.5 核算式](../03_systems/11_isolation_limits.md)

**容器启动成功不等于业务就绪。** 它可能启动了错误入口、没拿到配置、挂错卷、权限不足、依赖没准备好，或因配额很低而立即超时。诊断从镜像 D1、实际进程、有效运行配置、资源/挂载/网络视图走到 A 的 6 B/409/404/200 正反例，不能让“容器处于 running”替代业务证据。[12.01 制品与配置](./01_runtime_artifacts.md)

## 五、PID 1 收到什么信号，长连接又由谁排空

在容器的 PID namespace 里，主进程常显示为 **PID 1**；它可以是 Go 网关，也可能是 shell 脚本/包装器。Dockerfile 的 exec 形式 `ENTRYPOINT ["/app/gateway"]` 让程序直接作为入口进程，shell 形式可能让 `/bin/sh -c` 成为中间进程而不正确转发信号。Docker 的 `docker stop` 文档以默认停止信号和宽限期后强制结束解释它的行为，具体停止信号/宽限期可配置，不能把某个秒数当跨平台保证。[Dockerfile：shell/exec form](https://docs.docker.com/reference/dockerfile) · [Docker：container stop](https://docs.docker.com/reference/cli/docker/container/stop/)

纸上如果收到可处理的终止信号，IM 网关应先停止新的发送/连接接入，给普通 HTTP 在途请求有限完成时间，通知已升级的 WebSocket 客户端重连、按应用维护的会话/在途责任排空，然后退出。Go `http.Server.Shutdown(ctx)` 会处理普通 HTTP 服务器生命周期，**不会自动关闭或等待 hijacked/WebSocket 连接**；它们要由应用单独跟踪和收尾。若宽限期耗尽被强制杀掉，最后阶段未完成，客户端应依稳定消息身份查询/补拉，不能假装设备已收到。[Go `Server.Shutdown`](https://pkg.go.dev/net/http#Server.Shutdown) · [03.12 信号故障卡](../03_systems/12_resource_failure_case.md)

| 时刻 | 纸上网关动作/外部结果 | 需要另验的事实 |
|---|---|---|
| 收到停止信号 | 主进程或包装器获得信号 | Go 程序是否真正收到？ |
| 停新接入 | 不再让新请求进入旧实例 | 流量是否转向健康实例？ |
| 普通 HTTP 排空 | 已开始请求有限等待 | A 是否完整收到 200，重复 409 状态如何核对？ |
| WebSocket 排空 | 应用通知/关闭与客户端重连 | B 能否按权威历史补缺口？ |
| 旧进程结束 | S2 进程内存与连接结束 | 未来 S3 DB/设备 ACK 不能由旧内存替代 |

## 六、按“重启同容器”和“删除重建”盘点 IM 状态

设纸上旧容器 A 的 Go 进程曾在当前 S2 模型里受理 `m-a`，并持有 B 的在线连接；A 的容器可写层另有一份**无业务承诺**的虚构暂存文件。若 A 停止再启动，**旧进程内存和连接仍已消失**，即使同一容器可写层还在；若删除 A 以 D1 新建 A2，A 的可写层也不自动附到 A2。若 A2 明确重挂一个保留的 named volume，卷字节仍可能存在，但并不证明 `m-a` 曾写入该卷或符合 S3 提议的权威提交条件。[Docker：Container layer basics](https://docs.docker.com/engine/storage) · [Volumes](https://docs.docker.com/engine/storage/volumes/)

| 纸上对象 | 重启同一容器 | 删除后用 D1 重建 | 应给用户的结论 |
|---|---|---|---|
| 当前 S2 `m-a` 仅在进程内存 | 旧值无自动恢复 | 旧值无自动恢复 | `accepted_in_memory` 不是重启后可查保证 |
| B 的连接/会话映射 | 断开并需重连 | 断开并需重连 | 重连完成也未证明消息补齐 |
| A 独有可写层暂存 | 同一容器可保留 | 不自动带入 A2 | 不可当业务权威 |
| 明确保留的 named volume | 可重新使用 | 明确重挂后可访问 | 还要验 DB 事务/权限/备份 |
| 未来 S3 有权 DB 权威消息 | 以实际 DB 证据判定 | 仍以 DB 证据判定 | 与镜像 D1/容器 A 是否重建分开 |

响应丢失尤其容易误导：服务端可能曾内存受理 `m-a`，A 却只看到超时；同 ID 重试在原进程仍有记录时按当前合同为 409，重建后的状态还要依实际实现查询，不能把 409 或再次 200 自动当“B 已收到”。未来 S3 的 `m-9/seq9` 若要跨重建恢复，需权威 DB 的提交、身份、权限和数据卷/备份链共同证明，而不是让一个名为 `messages` 的目录承担隐含保证。[09.04 响应丢失](../09_backend_security/04_request_pipeline.md)

## 七、同 D1 异表现时的最小诊断顺序

当 A/B 都用镜像 D1 却行为不同，先固定它们各自的**实际进程和运行配置**：入口是否真的运行 Go 网关；挂载是否相同、是否遮住了配置目录；namespace/端口视图、身份权限和 cgroup 限制是什么；外部 DB/卷的数据状态与依赖就绪如何。然后用虚构授权请求验当前 `/v1` 6 B 合法、9 B 当前拒绝、同 ID 重复 409、非成员 404、200 只内存受理。某环境靠变量让 v1 接受 9 B 是合同漂移，不是容器机制的合理差异。[10.12 R9 变更边界](../10_engineering/12_maintainability_assessment.md)

| 假设 | 首份纸上证据 | 反证或下一步 |
|---|---|---|
| D1 实际不同 | 解析的 manifest/platform digest | 相同 D1 再查配置/数据 |
| 卷挂错或遮目录 | 有效 mount、容器内文件与权限 | 文件一致再查入口/依赖 |
| A 被 CPU/内存限制 | 同窗 `cpu.max/stat`、`memory.events` | 限额余量足则查 I/O/业务层 |
| 信号未达 Go 进程 | PID 1 与子进程/停止时间线 | Go 收到仍需看 WebSocket 排空 |
| 外部状态不同 | 有权 DB/成员/游标事实 | 同数据仍不同再查代码/配置 |

固定 `openimsdk/open-im-server` 提交 `f6411a8a1a31d3df36f4c2b3ad28481a94141e1f` 的 [`send.go` 选定分支](https://github.com/openimsdk/open-im-server/blob/f6411a8a1a31d3df36f4c2b3ad28481a94141e1f/internal/rpc/msg/send.go#L46-L70)调用 `MsgToMQ` 后返回；[另一 Mongo 消费路径](https://github.com/openimsdk/open-im-server/blob/f6411a8a1a31d3df36f4c2b3ad28481a94141e1f/internal/msgtransfer/online_msg_to_mongo_handler.go#L43-L69)调用 `BatchInsertChat2DB`。这两段不证明上游用何镜像层、卷、network namespace、PID 1 或关停策略，也不证明本章教学网关已运行。[OpenIM 阅读地图](../im_reference.md)

## 八、22 道分层练习：交一张容器重建状态卡

先按“镜像、进程、文件层、卷、权威数据”分别作答，再展开反馈。

### 基础 1–8：容器机制入口

<details><summary>1. 镜像 D1 相同，A/B 会共享 Go 进程内存吗？</summary>

不会。它们是不同进程生命周期，内存不因镜像相同而共享。</details>

<details><summary>2. 容器可写层是镜像的永久共享层吗？</summary>

不是。它是该容器独有的文件改动，删除重建不自动继承。</details>

<details><summary>3. 停止再启动同一容器时，旧 Go 进程内存还在吗？</summary>

不在。进程已退出；可写层可能仍属同一容器，二者不同。</details>

<details><summary>4. named volume 可跨容器删除保留就等于 S2 消息已持久吗？</summary>

不等于。应用要实际写入且定义提交/恢复语义，当前 S2 仅内存受理。</details>

<details><summary>5. tmpfs 适合承诺权威历史跨重建吗？</summary>

不适合。它是非持久临时挂载。</details>

<details><summary>6. namespace 和 cgroup 分别做什么？</summary>

namespace 隔离视图，cgroup 记账/限制资源；具体组合由运行配置决定。</details>

<details><summary>7. 容器内 `127.0.0.1` 总是宿主数据库吗？</summary>

不是。它指进程所在网络 namespace 的回环。</details>

<details><summary>8. 容器 running 能证明当前 6 B/409/404 合同正确吗？</summary>

不能。还需有权请求的正反例与实际运行配置证据。</details>

### 推导 9–16：信号与数据生命周期

<details><summary>9. 同 D1 两容器各写 `/tmp/x`，默认互相可见吗？</summary>

不可因同镜像推定互见；各自可写层独立，还需看是否挂相同卷。</details>

<details><summary>10. 删除 A 后以 D1 建 A2，A 的可写层会自动给 A2 吗？</summary>

不会。须另有明确保留/挂载数据来源。</details>

<details><summary>11. 挂 named volume 到已有镜像目录时，空卷与非空卷有什么差异？</summary>

非空卷会遮住镜像文件；Docker 首次挂空卷默认复制原目录内容，除非禁用复制。需核对卷身份与有效 mount。</details>

<details><summary>12. `cpu.max=50000 100000` 约多少平均核额度？</summary>

约 0.5 核；即使宿主空闲，该 cgroup 仍可能节流。</details>

<details><summary>13. Shell 作为 PID 1 却不转发 SIGTERM，有什么风险？</summary>

Go 网关可能收不到预期关停信号，无法按计划停止接入和排空。</details>

<details><summary>14. Docker stop 的停止信号和宽限期永远固定吗？</summary>

不固定，可配置；本课程不假定统一秒数。</details>

<details><summary>15. `http.Server.Shutdown` 会自动等待所有 WebSocket 应用任务吗？</summary>

不会。hijacked/WebSocket 连接需应用另行管理与有界等待。</details>

<details><summary>16. A 收到 S2 内存受理 200，重建后 B 必看到消息吗？</summary>

不能。进程内状态没有跨重建承诺，设备结果另需证据。</details>

### 恢复 17–22：守住业务合同

<details><summary>17. 同 D1 不同 CPU 限额，P95 可不同吗？</summary>

可以。资源限制影响调度/等待，需同负载与用户结果核对。</details>

<details><summary>18. 同 D1+配置，但 DB 成员状态不同，404 可不同吗？</summary>

同请求主体/会话的授权数据不同会改变结果，须固定数据身份再比较。</details>

<details><summary>19. `BODY_LIMIT=9` 让旧 `/v1` 接纳 9 B，属于合理运行差异吗？</summary>

不是。现行 6 B 合同被破坏，R9 尚待批准。</details>

<details><summary>20. 重挂卷后可以直接宣布未来 S3 权威消息已恢复吗？</summary>

不能。还要验数据库事务、消息身份、权限、备份与查询结果。</details>

<details><summary>21. OpenIM 两处固定源码能证明它的卷或 PID 1 行为吗？</summary>

不能。只支持所读发送与 Mongo 消费的异步边界。</details>

<details><summary>22. 一张容器重建状态卡至少交什么？</summary>

镜像/运行配置、PID/网络/资源视图、可写层/卷/外部 DB 归属、信号排空、当前 S2 正反例和未来权威/设备恢复待证项。</details>

## 本章完成标准与后续路径

能说明同镜像 A/B 的内存与可写层为何独立，分清停止再启和删除重建对内存/文件/卷的不同影响，指出 namespace/cgroup、PID 1 信号及 WebSocket 排空边界，再用当前 `/v1` 正反例核对业务，才算完成第一轮。本章没有实际启动任何容器。下一章 12.03 将在本地多服务的纸上环境中解释服务名、端口、配置、健康与依赖就绪。
