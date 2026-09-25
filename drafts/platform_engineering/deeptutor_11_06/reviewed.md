# 11.06 I/O 与网络性能：低 CPU 时消息为何仍迟到

> DeepTutor 八节初稿经技术与教学审阅后的静态课程。所有时间、速率、数据库/队列和设备行为均是**虚构纸上情景**，未运行 Go、IM、数据库、网络实验、监控、压测或站点。当前 S2 `/v1` 仅有正文非空且最多 **6 UTF-8 B**、原始 HTTP 请求正文最多 **4096 B**、同 ID 重复 **409**、非成员目标隐藏 **404**、`200 accepted_in_memory` 仅表示本进程内存受理；未来 S3 `/v2` 的 `200 stored_in_teaching_db` 是提议且仍为 6 B，R9 6→9 B 待审。[09.02 当前合同](../../../src/docs/platform_engineering/curriculum/09_backend_security/02_http_api_contract.md) · [09.12 未来服务项目](../../../src/docs/platform_engineering/curriculum/09_backend_security/12_im_service_capstone.md)

## 一、先区分“低 CPU”和“B 迟到”各指什么

11.05 已解释 CPU 时间、分配与等待：一个 goroutine 在等连接、磁盘、网络或慢消费者时，墙上时间可以增加而 CPU 并不忙。现在把业务问题换成一个**未来 S3/S5 教学链路**：`u-a` 给有权的 `u-b` 在 `c-a` 发送 `m-9`，权威会话序号为 `seq9`；A 已在未来 `/v2` 收到 `stored_in_teaching_db`，B 的设备却两秒后才在应用层确认处理。当前 S2 根本不承诺这条持久/投递链路，所以不能用本章纸上结果评价现行 S2 的设备延迟。[07.12 确认矩阵](../../../src/docs/platform_engineering/curriculum/07_cache_messaging/12_cross_system_consistency_case.md)

**低 CPU 是资源观察，B 迟到是用户结果。** 两者同时出现只是诊断入口。要先确认 B 是否在线、哪台设备、哪次连接、是否已授权、是否需要历史补拉；然后固定“B 应用层确认处理 `m-9`”为终点。A 的 HTTP 200、数据库提交、E9 在 broker 可读、网关调用 `Write`、TCP ACK、B 的应用确认是不同事件。缺少 B 的确认时应写“未观测/未知”，不能把上游任一点升级为已送达。

| 第一次阅读 | 第二次阅读 | 本章交付 |
|---|---|---|
| 纸上时间线、I/O 等待、缓存与 TCP 词汇 | 池/盘/网络/慢端反证和修复门 | 一张分段诊断表、两份计算、三种确认边界 |

## 二、画一条仅用于推理的分段时间线

下面的所有 `t` 都是**同一理想纸上时钟**，用于训练阶段划分；真实 A、数据库、broker、网关和 B 跨机器时钟可能偏移，不能把它们各自墙上时间戳直接相减当网络耗时。[08.02 时间与顺序](../../../src/docs/platform_engineering/curriculum/08_distributed/02_time_order.md)

```text
t=0 ms       A 发起发送 m-9 到 c-a
t=25 ms      假设未来 S3 事务提交 m-9/seq9 与 outbox
t=30 ms      A 收到 200 stored_in_teaching_db（未来提议）
t=50 ms      事件 E9=evt:m-9:v1 可供 broker 消费（纸上假设）
t=80 ms      在线网关将 B 的设备任务排入发送队列
t=900 ms     网关一次 socket Write 返回
t=2400 ms    B 的设备应用确认处理 m-9
```

从 `t=30` 到 `t=2400` 的大间隔不足以判断“磁盘慢”还是“网络慢”。`25→50` 可能含 outbox 发布等待，`50→80` 可能含消费与路由，`80→900` 可能含本地队列或 socket 写等待，`900→2400` 可能含网络传输、客户端读取/解码、前后台调度或应用确认延迟。每段需要**同一身份、各自进程的持续时间、状态及错误**；缺一段就标未知。`t=900 Write 返回` 甚至不证明 B 的 TCP 栈已收到这些字节。[11.03 Trace 边界](../../../src/docs/platform_engineering/curriculum/11_reliability/03_logs_metrics_traces.md)

定位时先问“**卡在哪个边界**”，再问“该边界为什么等”。本章选四组候选：数据库连接池/磁盘，事件与网关队列，TCP 传输，以及 B 的应用处理。低宿主 CPU 无法排除其中任意一组。也不要把所有等待都算作 I/O：应用锁、限额或取消传播出错同样能让处理停住。[11.04 候选与反证](../../../src/docs/platform_engineering/curriculum/11_reliability/04_diagnostic_method.md)

## 三、页缓存让读取快；写入返回不自动等于持久

数据库或文件读取先可能命中**进程/数据库缓冲池**，再可能命中操作系统**页缓存**，最后才到存储设备。三者不是同一层。一次历史页读取快，可能因为缓存命中；慢读可能由缺页、磁盘 I/O 排队、查询计划或连接池等待造成。看磁盘“忙 90%”仍要配合请求类型、设备范围、队列时长和实际阶段，不能仅凭利用率把 B 迟到归咎于磁盘。[06.04 页与缓冲池](../../../src/docs/platform_engineering/curriculum/06_databases/04_pages_buffer_pool.md)

写路径更要守住语义：应用的 `Write` 或数据库某次页写可能只是把数据交给内核缓存/标为脏页；**何时满足持久承诺**取决于数据库日志、刷盘、存储配置和合同。未来 S3 教学例子在 `t=25` 假设事务提交了权威 `m-9/seq9` 与 outbox，`stored_in_teaching_db` 的具体抗崩溃含义还须由该教学实现的事务/WAL 配置与验证来证明。不能因为页缓存“很快”就认为已经落盘，也不能把每次物理页写当成一次数据库提交。PostgreSQL 的 WAL 可靠性文档说明日志同步与存储缓存会影响承诺；本章仅借其机制，不宣称教学 S3 已采用 PostgreSQL 或任何具体同步参数。[PostgreSQL：WAL Reliability](https://www.postgresql.org/docs/17/wal-reliability.html) · [Linux VFS：写回](https://docs.kernel.org/filesystems/vfs.html)

| 观察 | 可以支持的判断 | 还缺什么 |
|---|---|---|
| 历史页缓存命中率升高 | 这类读取可能少做物理读 | B 的设备是否处理、权威是否已提交 |
| 磁盘完成时长上升 | 所选设备 I/O 变慢的候选 | 与 `m-9` 所在事务/读取阶段的关联 |
| `write` 返回 | 调用这一步已返回 | 事务持久条件、设备/应用确认 |
| DB Commit 返回 | 按该数据库配置完成事务提交 | 该配置承诺的持久级别、B 设备处理 |

若 A 的 `stored_in_teaching_db` 已得到严格定义并有提交证据，后续 B 迟到不应自动触发“重写权威消息”；优先追 E9/outbox、网关和设备。若权威提交本身慢，再进入连接池、SQL、日志同步和磁盘的同窗诊断。[06.09 日志与恢复](../../../src/docs/platform_engineering/curriculum/06_databases/09_logging_recovery.md)

## 四、连接池等待发生在查询之前

Go `database/sql` 的 `sql.DB` 管理连接池；设置 `SetMaxOpenConns` 后，连接全被占用时新的数据库操作会**等待**。一个查询在数据库服务端只执行 12 ms，客户端仍可能先等 200 ms 取得连接。增加索引无法消除这段等待；盲目扩大池也可能让数据库同时处理更多重查询、反而放大排队。[Go：管理数据库连接](https://go.dev/doc/database/manage-connections)

`DB.Stats()` 中 `WaitCount` 与 `WaitDuration` 是**累计**统计。纸上假设某个 5 秒窗口里发生 100 次连接获取，`WaitCount` 比前一快照增加 40，`WaitDuration` 增加 8 秒。则**发生等待的 40 次**平均 `8/40=0.2 秒=200 ms`；若把零等待也算上，按全部 100 次粗均摊为 `8/100=80 ms`。这两个均值都不是连接获取的 P95，更不是整条发送或设备交付 P95。还要看 `InUse`、`OpenConnections`、长事务、未关闭的 `Rows` 与相同时间窗中的 SQL 执行时长。[Go `DBStats`](https://pkg.go.dev/database/sql#DBStats)

| 假设 | 能支持的证据 | 能削弱它的证据 |
|---|---|---|
| 连接池限制导致 S3 提交或历史查询慢 | 同窗 WaitCount/WaitDuration 增量、占用接近上限、请求阶段等待连接 | 相关请求无需等待连接，耗时落在 WAL/网关/设备 |
| SQL/磁盘执行慢 | 取得连接后查询/提交时长升高，计划或 I/O 排队相符 | 查询仅 12 ms，而大部分墙上时间在获取连接之前 |

调用方应有明确超时/取消语义，并在完成后关闭结果集以释放资源；但“加一个 deadline”只能限制等待，并不能证明瓶颈消失。若超时增加，A 可能看到失败或未知，未来 S3 提交是否发生必须用稳定消息身份和权威查询核对。[06.10 Go 数据访问](../../../src/docs/platform_engineering/curriculum/06_databases/10_go_data_access.md)

## 五、TCP Write、TCP ACK、设备应用确认三级分开

TCP 提供可靠、按序的**字节流**，通过序号、确认与重传应对丢失；接收窗口与拥塞控制会限制发送速度。Go `net.Conn.Write` 成功返回表示本次调用按接口约定写入了字节，**不等于** B 的应用已经读取、解码、展示或持久记录消息。即使观察到 TCP ACK，它确认的是接收端 TCP 层的字节进展，不是 B 的应用层“已处理 `m-9`”。真正的设备确认须另设计应用协议并明确持久/去重语义。[RFC 9293：TCP](https://www.rfc-editor.org/rfc/rfc9293.html) · [Go `net.Conn`](https://pkg.go.dev/net#Conn)

Go 连接写入可能因 deadline 或其他错误返回 `n>0, err!=nil`，说明一部分字节已被这次调用接受；写入方不能简单把整帧当作“完全未发”。对 IM 应使用有长度/类型的**协议帧**、稳定 `m-9` 身份、接收侧去重与补拉验证；断开后重试不能凭 TCP 字节前缀猜业务消息是否已处理。`SetWriteDeadline` 能给阻塞写设置边界，仍不能替代应用确认。[Go `Conn.Write` 与 deadline](https://pkg.go.dev/net#Conn)

| 观察 | 代表的层 | 不能推出 |
|---|---|---|
| `Write` 返回 `n=len(frame), err=nil` | 本地 Go 调用完成 | B 应用已处理或已读 |
| TCP ACK 到达发送端 | 对端 TCP 已确认相关字节 | B 客户端解码成功、用户看到 |
| B 按稳定消息 ID 回应用 ACK | 按协议定义的设备处理点 | 用户本人已阅读 |

网络排查要将 RTT、重传、接收窗口、发送队列、写阻塞时长与**同一设备连接**对齐。某台设备重传升高只支持网络候选；若网关任务在调用 `Write` 前已排队 800 ms，就不能把这 800 ms 都归到 TCP。即使重传和用户迟到同时出现，也要有同请求阶段/同连接证据，避免把相关性当根因。[04.04 重传与流控](../../../src/docs/platform_engineering/curriculum/04_networks/04_reliable_transport.md)

## 六、慢消费者与两种“队头阻塞”

假设未来网关为 B 某台设备保留一个**有界应用发送队列**。在 5 秒突发里，平均每秒有 12 项任务进入、6 项离开，初始队列为 0，且无拒绝、取消、旁路：`(12−6)×5=30` 项净积压。若队列上限小于 30，事实会改为“部分入队失败或另有溢出策略”；必须把拒绝/取消计入守恒，不能继续宣称队列里一定有 30。这里的单位是**设备任务**，不是 30 条权威消息，也不是 30 次应用确认。[11.04 到达与完成](../../../src/docs/platform_engineering/curriculum/11_reliability/04_diagnostic_method.md)

**应用队列的队头阻塞**：一个任务在 B 的队列前面长时间等候或重试，后面任务按 FIFO 规则不能越过。**TCP 字节流的按序阻塞**：同连接上较早的字节缺口需要恢复，后续字节即使已到达接收端，也不能按普通 TCP 字节流顺序先交给应用。两者发生在不同层，诊断与修复也不同；不能把所有“后面的消息没显示”笼统叫网络丢包。[RFC 9293：按序字节流与重传](https://www.rfc-editor.org/rfc/rfc9293.html)

慢 B 不应无限占用共享队列、内存或 worker，以免拖住快 C。可设计按设备限额、明确满队列策略、断开并让客户端从**有权限的权威历史**补拉；但是否允许丢弃实时通知，要以“权威消息仍在、历史补拉可恢复”为前提。课程的另一纸上变式是 B 离线 **25 小时**，超过教学 broker 的 **24 小时**保留窗口：只能依赖按成员权限查询权威 DB 历史与 `seq9` 缺口，不能指望 broker 还保存 E9。[07.12 离线补拉](../../../src/docs/platform_engineering/curriculum/07_cache_messaging/12_cross_system_consistency_case.md)

## 七、用反证矩阵决定修复和回退

同一条 B 迟到可有多重等待。先为每段列出所需证据，再只对已证实的瓶颈改一个变量；优化后同时复测 A 的存储确认、B 的设备确认、积压、拒绝、权限与回退路径。

| 候选瓶颈 | 下一份最小证据 | 若属实的改动方向 | 业务风险与停止门 |
|---|---|---|---|
| DB 池等待 | 等待增量与该事务阶段同窗关联 | 缩短占用、关闭资源、再审池与 DB 容量 | 扩大池可能加重 DB；不得把未知提交伪装成失败 |
| 磁盘/WAL | 事务/日志同步与设备 I/O 同窗阶段 | 查询/索引、批量或设备容量实验 | 异步写不能偷偷改变 `stored_in_teaching_db` 承诺 |
| TCP/连接写 | 单连接写等待、重传、窗口与 B 端接收 | 限制慢连接、修协议帧或连接策略 | `Write`/TCP ACK 仍不等于设备 ACK |
| B 应用慢/网关积压 | 入队→写→B ACK 的阶段与队列守恒 | 设备隔离、背压、历史补拉 | 丢通知须保证权威历史与授权补拉可用 |

固定 `openimsdk/open-im-server` 提交 `f6411a8a1a31d3df36f4c2b3ad28481a94141e1f` 的 [`send.go` 选定分支](https://github.com/openimsdk/open-im-server/blob/f6411a8a1a31d3df36f4c2b3ad28481a94141e1f/internal/rpc/msg/send.go#L46-L70)调用 `MsgToMQ` 后返回；[另一 Mongo 消费路径](https://github.com/openimsdk/open-im-server/blob/f6411a8a1a31d3df36f4c2b3ad28481a94141e1f/internal/msgtransfer/online_msg_to_mongo_handler.go#L43-L69)调用 `BatchInsertChat2DB`。两处只表明发送返回与 Mongo 消费落库分属异步边界，**不能**证明 OpenIM 真实使用本题 SQL/outbox、连接池瓶颈、磁盘同步方式、TCP 写行为、生产者 ACK 或 B 设备确认。公开项目诊断仍需固定版本和真实负载证据。[OpenIM 阅读地图](../../../src/docs/platform_engineering/curriculum/im_reference.md)

## 八、22 道分层练习：交一份低 CPU 诊断报告

先回答基础确认点，再手算池与队列，最后对四个修复建议写反例。展开反馈前尽量写出“证据在哪一层”。

### 基础 1–8：守住确认边界

<details><summary>1. 当前 S2 `200 accepted_in_memory` 能证明 B 收到吗？</summary>

不能。只表示本进程内存受理；本章 B 迟到是未来 S3/S5 纸上情景。</details>

<details><summary>2. 未来 `stored_in_teaching_db` 与设备应用 ACK 是同一个事件吗？</summary>

不是。前者按未来合同指权威数据库提交，后者按另设协议指设备处理。</details>

<details><summary>3. `t=30` 到 `t=2400` 可直接定位 TCP 慢吗？</summary>

不能。其间还有 outbox、broker、网关队列、客户端读取与应用处理等阶段。</details>

<details><summary>4. 真实 A 与 B 的墙上时间戳能未经校准直接相减吗？</summary>

不能。跨机器时钟可能有偏差，应使用各进程持续时间和关联事件。</details>

<details><summary>5. 页缓存命中说明消息已持久存储吗？</summary>

不能。命中是读取路径现象，提交和持久条件取决于数据库/WAL/存储配置。</details>

<details><summary>6. `sql.DB` 是每次查询都重新创建的单一连接吗？</summary>

不是。它管理连接池；达到最大打开数时新操作可能等待连接。</details>

<details><summary>7. TCP ACK 等于 B 应用确认处理 m-9 吗？</summary>

不等于。TCP ACK 是字节流传输层进展，应用确认须另设协议。</details>

<details><summary>8. Go `Write` 返回成功就能报告用户已读吗？</summary>

不能。`Write` 连设备应用处理都不能证明，更不能证明用户阅读。</details>

### 推导 9–16：定位等待与算对分母

<details><summary>9. 100 次获取连接，40 次实际等待，总等待 8 秒；等过者平均多久？</summary>

`8/40=0.2 秒=200 ms`。</details>

<details><summary>10. 同一数据对全部 100 次粗均摊等待是多少？</summary>

`8/100=0.08 秒=80 ms`；它不是 P95。</details>

<details><summary>11. 服务端查询 12 ms，可以排除连接池造成 200 ms 等待吗？</summary>

不能。获取连接的等待发生在查询执行之前。</details>

<details><summary>12. B 队列进入 12/s、离开 6/s 持续 5 秒且无其他流向，净积压多少？</summary>

`(12−6)×5=30` 个设备任务。</details>

<details><summary>13. 如果 B 队列上限为 20，上题还能说必然排着 30 项吗？</summary>

不能。必有拒绝、取消、溢出或上游阻塞等未计流向，需重新对账。</details>

<details><summary>14. `Write` 超时且返回 `n>0`，能把整帧认作完全没发吗？</summary>

不能。部分字节已被调用接受；重试需帧边界、稳定消息 ID 与接收侧去重。</details>

<details><summary>15. 应用 FIFO 队头与 TCP 按序字节流队头是同一层吗？</summary>

不是。前者是网关任务调度，后者是同一 TCP 流按序交付字节的约束。</details>

<details><summary>16. B 离线 25 小时、教学 broker 保留 24 小时，应从哪补 m-9？</summary>

从有成员权限的权威 DB 历史按 `seq9` 缺口补，不仅靠 broker E9。</details>

### 决策 17–22：修复不能改坏承诺

<details><summary>17. 池等待上升就立即把最大连接数翻倍吗？</summary>

不应。先查长事务、未关闭资源、DB 服务能力；扩池可能把排队移到数据库。</details>

<details><summary>18. 把未来 S3 写入改成纯异步，可仍叫 `stored_in_teaching_db` 吗？</summary>

不能直接沿用。若回应时尚未满足承诺，就必须重新定义/版本化成功语义。</details>

<details><summary>19. 网关丢弃实时通知，什么前提下才可能可恢复？</summary>

权威历史仍有消息，授权客户端能按稳定身份/序号检测缺口并补拉，且丢弃被记录。</details>

<details><summary>20. 低 CPU 加高重传率就证明网络是唯一根因吗？</summary>

不能。要对齐同连接和阶段，并排查更早的池/队列等待及 B 应用处理。</details>

<details><summary>21. 两处固定 OpenIM 源码能证明真实磁盘或连接池瓶颈吗？</summary>

不能。它们只支持发送与 Mongo 消费分处异步边界。</details>

<details><summary>22. 一份可复核的低 CPU 诊断报告至少交什么？</summary>

业务确认点、同口径分段时间、池/磁盘/TCP/慢端候选及反证、等待/错误分母、单一修复、A/B 结果与回退门。</details>

## 本章完成标准与后续路径

能说明低 CPU 为何仍可能有长等待，手算连接池两种均值与设备队列净积压，区分缓存/提交、`Write`/TCP ACK/应用 ACK，画出 B 迟到的分段反证矩阵，并为慢端隔离写出权威历史补拉前提，才算完成第一轮。所有结果均是纸上推演，真实验证须在学习者的隔离实现记录具体版本、负载和授权证据。下一章[11.07 压测与容量](../../../src/docs/platform_engineering/curriculum/11_reliability/07_load_testing_capacity.md)将用可控负载与容量实验检验这些候选。
