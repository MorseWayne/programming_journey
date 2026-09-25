---
title: 11.05 CPU 与内存性能：消息变慢是算力、分配还是等待
icon: /assets/icons/article.svg
order: 6
date: 2026-09-25
---

[返回第十一卷](./README.md) · [诊断方法：11.04](./04_diagnostic_method.md) · [Go 调度：05.05](../05_runtime/05_scheduler_model.md) · [Go 内存：05.06](../05_runtime/06_memory_lifecycle.md) · [GC：05.07](../05_runtime/07_garbage_collection.md)

# 11.05 CPU 与内存性能：消息变慢是算力、分配还是等待

> DeepTutor 八节初稿经技术与教学审阅后的静态课程。数字、画像、剖析结果和改动候选均为**虚构纸上评审**；没有运行 Go、IM、剖析、压测或站点。当前 S2 `/v1` 仍是正文非空且最多 **6 UTF-8 B**、原始 HTTP 请求正文最多 **4096 B**、重复同 ID **409**、非成员隐藏 **404**、成功 `200 accepted_in_memory` 只代表本进程内存受理；未来 S3 `/v2` `stored_in_teaching_db` 是提议且仍为 6 B，R9 6→9 B 待审。[09.02 当前合同](../09_backend_security/02_http_api_contract.md)

## 一、先把“慢”放回同一批请求

11.04 的纸上病例只问：**A 点击发送，到 A 收到本进程内存受理的 200，为什么变慢？** 那一章已通过工作负载画像、队列入出与 USE 把“可能在服务内等待”定位为候选；尚未证明是 CPU、锁、分配、GC 或网络。11.05 再向 Go 进程内部走一步。若另一位用户说“B 设备迟迟没看见”，那是后续交付链路，不应拿本章的受理 CPU profile 解答。[11.04 可反驳假设](./04_diagnostic_method.md)

记录同一实例、同版本、同类授权 POST 的两个窗口，至少并列：**到达请求尝试数、收到 200 的数、400/409/404、超时/仍在途、唯一消息数、A 端时延分布**。随后才附资源证据，如容器 CPU 核秒、配额、节流、Go 堆分配速率、存活堆、GC CPU 与 RSS。若请求/秒翻三倍，CPU 秒/秒增加并不自动说明每条消息更贵；要再除以匹配的工作量，并看群大小、响应类别和实际执行阶段。完成者 P95 下降也可能只是慢请求被拒绝或仍在队列里。[11.01 分母](./01_business_measurement.md) · [11.02 缺失样本](./02_distributions_statistics.md)

本章按三本账判断：**CPU 在执行什么；goroutine 在等待什么；内存被分配、存活和驻留了多少**。高 CPU 与高内存可以同时出现，却可能分别来自不同原因；一个指标变化不能跳过假设和反证。

## 二、CPU 核秒、墙上时间与 Go 调度状态

**墙上时间**是 A 从发起到收到回应的真实经过时间。**CPU 时间**是进程或线程实际占用处理器的时间：两核各忙 1 秒，合计约 **2 核秒**，但墙上只过了 1 秒；goroutine 在锁、channel、网络或定时器上等待时会增加墙上时间，却未必消耗等量 CPU。CPU 利用率必须附**资源范围和分母**：0.8 核秒/秒相对 1 核额度是 80%，相对 8 核宿主总量是 10%。这也解释了为什么宿主机“CPU 很空”不能排除一个容器或单核热点。[Linux cgroup v2 CPU 统计](https://cdn.kernel.org/doc/html/latest/admin-guide/cgroup-v2.html)

Go 的执行可以从三个角色入门：**G** 是 goroutine，**M** 是执行线程，**P** 提供执行 Go 代码所需的运行资源。`GOMAXPROCS` 约束同一时刻可并行执行 Go 代码的数量；它**不等于** goroutine 数量、操作系统线程数或容器 CPU 配额。可运行的 G 可能等 CPU，阻塞的 G 可能等锁/I/O，运行中的 G 才真正消耗 CPU 时间。看到 goroutine 从 500 变 1500，应先按状态和堆栈分组，不可直接说“CPU 饱和”或“死锁”。[05.05 调度模型](../05_runtime/05_scheduler_model.md)

| 假设 | 纸上可能出现的关联证据 | 关键反证或盲区 |
|---|---|---|
| 真正的计算热点 | 同负载下 CPU 核秒/成功受理增加，CPU profile 有集中调用路径 | CPU profile 低并不能排除锁/I/O 等待 |
| 容器 CPU 配额受限 | `cpu.stat` 节流增量、可运行等待和受理尾延迟同窗上升 | 宿主机总 CPU 百分比不能作反证；也要排除其他等待 |
| 锁或 channel 等待 | goroutine 阻塞阶段、队列等待和 block/mutex 证据相合 | goroutine 总数高本身不够 |
| GC 压力 | 同工作量分配率、GC CPU/频率和延迟同窗变化 | 只看 RSS 或一次停顿不能确认因果 |

CPU 使用高未必有问题：若吞吐随工作量线性增加，等待和用户时延仍稳定，这可能只是资源在做有用工作。反之 CPU 使用低而受理慢，可能是锁、I/O、外部依赖或排队；先用 11.04 的阶段记录查等待位置。[Go Diagnostics](https://go.dev/doc/diagnostics)

## 三、CPU profile 看“在运行时花在哪”，不看所有等待

假设未来隔离实现有两个候选：消息解析/编码占用 CPU，或群发任务在同一把锁上排队。**CPU profile** 采样正在使用 CPU 的代码路径，适合检查前者；锁等待没有持续执行 CPU，可能不会在 CPU profile 中显成“热点”。此时应结合 goroutine 状态、block/mutex profile 或运行时 trace，而不能把“CPU profile 没看到锁”理解为“锁没有成本”。Go 官方诊断文档明确把这些剖析类型分开。[Go Profiling](https://go.dev/blog/pprof) · [Go Diagnostics](https://go.dev/doc/diagnostics)

读 profile 还要区分**绝对成本**与**百分比**。纸上设基线每秒 100 次成功受理、总 CPU 0.5 核秒/秒，则按成功次数粗均摊是 `0.5/100=0.005 核秒/次`；改动后每秒 200 次成功受理、总 CPU 0.8 核秒/秒，粗均摊是 `0.8/200=0.004 核秒/次`。CPU 使用总量上升，按成功受理粗均摊的数字反而下降。这**不是**逐条请求的 CPU 成本：总 CPU 还可能被 400/409、后台任务或不同群规模消耗；分母和工作内容必须重新分组。[11.01 工作单位](./01_business_measurement.md)

群聊扇出可能放大序列化、收件人查找或签名成本，但它属于**未来更完整的 IM 链路**。当前 S2 纸上 POST 的 200 只确认内存受理，不能把未来 B 的多设备投递 CPU 直接算入这个 HTTP 成功点。若要比较群聊 CPU，须另定义“入站消息、展开后的投递任务和已确认设备”三个工作单位。[07.12 多确认点](../07_cache_messaging/12_cross_system_consistency_case.md)

## 四、分配率、存活堆与 RSS 是三种不同问题

**分配率**问一段时间新建了多少 Go 堆对象；**存活堆**问某次观察仍可到达的对象占多少；**RSS** 问进程有多少物理页驻留。一个系统可以大量创建短命 JSON/日志/缓冲对象，分配率很高而存活堆稳定；也可以持续持有会话状态，存活堆增长但分配率并不特别高。RSS 还受运行时其他内存、栈、映射和内存归还时机影响，不能把 `RSS−heap` 全部判成泄漏。[05.06 对象生命周期](../05_runtime/06_memory_lifecycle.md) · [Go GC Guide](https://go.dev/doc/gc-guide)

用一组**故意放大的纸上总分配量**练手算：同一实例每秒有 200 次请求，基线平均每次在整个处理路径分配 100 KiB，候选路径平均 300 KiB。这里数字不是正文大小——当前正文最多 6 B；它代表解码、临时对象、业务复制等整个请求的假设性总分配。

```text
基线：200 次/s × 100 KiB/次 = 20,000 KiB/s ≈ 19.53 MiB/s
候选：200 次/s × 300 KiB/次 = 60,000 KiB/s ≈ 58.59 MiB/s
相同请求率下，每秒新分配约增加 39.06 MiB
```

如果两个窗口的**存活堆都约 80 MiB**，这只能说在该观察口径下长期存活量未明显增加，不能说“内存没有成本”或“绝对无泄漏”；短命对象仍需分配和回收。若 RSS 从 180 MiB 升到 250 MiB，也不能仅凭这两个点推定 Go 堆泄漏。要同时看时间序列、Go 管理内存、存活对象、goroutine 栈、映射和容器内存账。[03.06 分配与映射](../03_systems/06_allocation_mapping.md)

剖析时要知道统计对象：**alloc** 视角有助于找累计分配来源，**heap/in-use** 视角有助于找仍存活的来源。采样和采集时刻会改变读数；`alloc` 增长不等于同样多的内存永久驻留，`in-use` 稳定也不证明分配不伤 CPU。先用指标发现方向，再用同负载 profile 找调用路径，不要从单个图直接给整个系统定性。[Go Diagnostics：Profiles](https://go.dev/doc/diagnostics)

## 五、GC 是 CPU 与内存之间的取舍

Go 的 GC 需要追踪仍存活的对象并回收不可达空间，会消耗 CPU，也会与应用共享有限的内存预算。`GOGC` 主要改变目标堆增长幅度：允许更大的增长一般降低回收频率和部分 GC CPU 成本，同时增加峰值内存；调小则可能更频繁地做 GC。它不是“把暂停时间设置成某个毫秒数”。真实目标还受根集和运行时策略影响，不能只用一个公式预测真实进程。[Go GC Guide：GOGC](https://go.dev/doc/gc-guide)

为训练量级感，假设某个稳定阶段的**有效新分配预算**是 80 MiB，而且忽略回收周期本身与并发波动。若分配率约 20 MiB/s，则预算约 `80/20=4 秒`被填满；若升到约 60 MiB/s，则约 `80/60≈1.33 秒`。这是**本题自定义的简化预算模型**，不是 Go 精确触发公式，也不能由此直接推出真实 GC 次数或 P95；前节 19.53/58.59 MiB/s 可近似看作 20/60。[Go GC Guide：分配率与 GC 频率](https://go.dev/doc/gc-guide)

`GOMEMLIMIT` 或 `debug.SetMemoryLimit` 设的是 Go **运行时管理内存的软限制**，不是进程 RSS、容器硬上限，也不涵盖所有外部映射或其他语言分配。调大 `GOGC` 可能降低 GC CPU 却让峰值触碰容器内存限制；把运行时软限制压得过低也可能让 GC 频繁工作而服务变慢。先记录容器限制、Go 管理内存、存活堆、分配率与用户时延，再提出有回退门的参数实验，不能把“设置一个环境变量”当成已经定位根因。[Go GC Guide：Memory Limit](https://go.dev/doc/gc-guide)

一次较长的受理尾延迟也不必然来自“停顿式 GC”。可能是 GC 并发工作占用 CPU、分配速率提高、调度等待、容器节流或与 GC 无关的锁/I/O。把 GC 事件与同请求阶段、CPU 配额和队列等待在同窗对齐，才有条件判断其贡献；缺少这些证据就保留未知。[05.07 GC 前置](../05_runtime/07_garbage_collection.md)

## 六、按问题选 CPU、alloc、heap、block、mutex 或 trace

Go 工具不是同一张图换不同颜色；它们观察的对象不同。可先按 11.04 的诊断单记下预测，再选能反驳预测的工具：

| 需要判断 | 第一层观测 | 若需要更深证据 | 不能据此宣称 |
|---|---|---|---|
| CPU 是否在某段代码执行 | 同窗核秒/业务结果、容器配额和节流 | CPU profile 的热点及调用链 | 没热点就没有等待瓶颈 |
| 哪条路径制造短命对象 | 每秒分配字节与请求率 | alloc profile | 分配的每个字节都常驻 |
| 哪些对象仍被持有 | 存活堆、GC 后趋势 | heap/in-use profile | RSS 的所有页都是 Go 堆 |
| goroutine 为何等 | 队列等待、goroutine 状态 | block/mutex profile 或 execution trace | goroutine 多就一定死锁 |
| GC 与调度是否相关 | GC CPU/周期、服务时延、节流同窗 | runtime trace 和相关采样 | 同时发生就一定有因果 |

采样剖析有开销，甚至某些工具同时启用会互相干扰。真实练习应在隔离环境用虚构消息、固定版本与负载，记录采样时长和配置；不要把私有正文、令牌或高基数身份放进一般 profile/日志。本章没有真实采样结果，表中“若需要”是调查顺序，不是已运行命令。[Go Diagnostics：工具干扰与证据](https://go.dev/doc/diagnostics)

## 七、优化一处成本，也要守住消息语义

假设未来证据确实指向“每次请求反复复制相同的消息正文”造成短命分配，先做一个小改动，比较同一负载下的分配字节/请求、CPU 核秒/成功受理、A 端尾延迟、拒绝/超时、GC CPU 和峰值 RSS。**少一次复制**可能降低成本，但若让内存中的已受理消息共享仍会被调用方或对象池复用的可变缓冲区，就可能出现正文被后来请求改写、竞争或越权混淆；此时复制反而是保护所有权的必要成本。[05.06 所有权与逃逸](../05_runtime/06_memory_lifecycle.md) · [10.05 行为保持](../10_engineering/05_refactoring_boundaries.md)

预分配、复用与批处理也都有边界。给大群任务预分配过大的切片可能降低扩容次数，却抬高峰值内存；池化对象若在返回池后仍被其他 goroutine 引用，会破坏生命周期。一个候选只改一个主要变量，并在基线/候选中保持实例、容器限额、消息分布、请求率和响应类别可比。修复门除了“P95 降低”，还要确保当前 `/v1` 的 6 B、409、404 与内存受理状态保持；未来 S3 持久和 S5 设备结果另设指标。[11.04 同口径复测](./04_diagnostic_method.md)

固定 `openimsdk/open-im-server` 提交 `f6411a8a1a31d3df36f4c2b3ad28481a94141e1f` 的 [`send.go` 选定分支](https://github.com/openimsdk/open-im-server/blob/f6411a8a1a31d3df36f4c2b3ad28481a94141e1f/internal/rpc/msg/send.go#L46-L70)调用 `MsgToMQ` 后返回；[另一 Mongo 消费路径](https://github.com/openimsdk/open-im-server/blob/f6411a8a1a31d3df36f4c2b3ad28481a94141e1f/internal/msgtransfer/online_msg_to_mongo_handler.go#L43-L69)调用 `BatchInsertChat2DB`。两段只说明发送返回与消费落库存在异步边界，不能证明 OpenIM 的真实 CPU 热点、对象分配、GC 成本、生产者 ACK 或设备交付。若要对公开项目做性能评审，须固定版本、构造授权负载并获取实际 profile 与业务结果。[OpenIM 阅读地图](../im_reference.md)

## 八、22 道分层练习：从算式到优化评审

先做前八题把 CPU/内存单位说清，再做纸上算式，最后评审一次优化是否值得合并。

### 基础 1–8：先分清对象

<details><summary>1. A 等到 200 变慢，可以直接说 B 设备送达变慢吗？</summary>

不能。`accepted_in_memory` 仅是本进程受理，设备交付有另一确认点。</details>

<details><summary>2. 两核各忙一秒，CPU 时间与墙上时间分别约多少？</summary>

合计约 2 核秒 CPU 时间，墙上约 1 秒。</details>

<details><summary>3. 0.8 核秒/秒对 1 核额度和 8 核宿主分别是多少利用率？</summary>

分别约 80% 和 10%，须注明分母和作用域。</details>

<details><summary>4. `GOMAXPROCS=2` 意味着只能有两个 goroutine 吗？</summary>

不是。它约束同时执行 Go 代码的并行度，不限制 goroutine 总数。</details>

<details><summary>5. CPU profile 会直接显示所有锁等待时间吗？</summary>

不会。等待时未持续消耗 CPU，应结合 block/mutex、goroutine 状态和 trace。</details>

<details><summary>6. 分配率高与存活堆高是一回事吗？</summary>

不是。短命对象可使分配率高而存活堆稳定。</details>

<details><summary>7. RSS 比 Go 存活堆大，差额全是泄漏吗？</summary>

不是。还可能有栈、运行时其他内存、映射与归还时机等。</details>

<details><summary>8. `GOMEMLIMIT` 是容器 RSS 的硬上限吗？</summary>

不是。它是 Go 运行时管理内存的软限制，不等于容器硬限或总 RSS。</details>

### 推导 9–16：计算与选择证据

<details><summary>9. 200 次/s、100 KiB/次，分配率约多少 MiB/s？</summary>

`200×100/1024≈19.53 MiB/s`。</details>

<details><summary>10. 同请求率下改为 300 KiB/次，约多少 MiB/s？</summary>

`200×300/1024≈58.59 MiB/s`，约是前者三倍。</details>

<details><summary>11. 当前正文最多 6 B，为何每请求纸上总分配可设为 100 KiB？</summary>

它是整个处理路径的教学假设，包含临时对象、解析和复制等，不是正文字节数，也不是实测值。</details>

<details><summary>12. 存活堆仍 80 MiB，能否排除新增短命分配？</summary>

不能。alloc 速率可提高而存活量保持相近。</details>

<details><summary>13. 有效新分配预算 80 MiB、20 MiB/s，简化周期约多久？</summary>

约 `80/20=4 s`，仅是本章简化量级模型，不是精确 GC 触发时间。</details>

<details><summary>14. 预算不变、分配率 60 MiB/s，简化周期约多久？</summary>

约 `80/60≈1.33 s`；真实运行还受根集、目标、并发和负载波动影响。</details>

<details><summary>15. 找累计分配来源与找仍存活对象，应分别看什么？</summary>

前者看 alloc 视角，后者看 heap/in-use 视角，并标采样窗口。</details>

<details><summary>16. 每秒 CPU 从 0.5 到 0.8 核秒，成功受理从 100 到 200 次，单次成本怎样变？</summary>

按成功受理粗均摊约从 0.005 降到 0.004 核秒/次；不能据此推出逐条成本，仍要核对消息类型、后台工作和拒绝占比。</details>

### 评审 17–22：不让优化破坏业务

<details><summary>17. 宿主 CPU 10% 能排除单实例配额节流吗？</summary>

不能。须看该容器的配额、实际 CPU 用量、节流及同窗等待。</details>

<details><summary>18. 调高 GOGC 一定会使用户时延更低且更安全吗？</summary>

不一定。GC CPU 可能降低，但内存峰值可能增加；须与容器限制和业务结果对照。</details>

<details><summary>19. 把 GOMEMLIMIT 设得极低可保证不会 OOM 吗？</summary>

不能。它是软限制且不覆盖所有进程内存，过低还可能造成过度 GC。</details>

<details><summary>20. 省掉消息正文复制前必须证明什么？</summary>

缓冲区所有权、生命周期、并发读写和已受理正文不被后续请求改写；再看成本是否确有改善。</details>

<details><summary>21. 优化后完成者 P95 变低，能宣布业务整体改善吗？</summary>

不能。还要看超时/拒绝、仍在途、唯一消息结果、CPU/内存峰值及同负载比较。</details>

<details><summary>22. OpenIM 两处固定源码能证明真实 GC 热点吗？</summary>

不能。它们只提示异步边界；需要真实固定版本的负载、profile 与业务结果。</details>

## 本章完成标准与后续路径

能说明核秒与墙上秒、容器配额与宿主 CPU、分配与存活/RSS 的区别；手算每秒速率与简化 GC 周期；按候选选择 CPU/alloc/heap/block/mutex/trace 证据；并为“减少一次复制”写出业务回归和峰值风险，才算完成第一轮。所有表值都是纸上假设，真实优化要在学习者的隔离环境留存基线与反例。下一章 11.06 将按同样的诊断方法进入磁盘、页缓存、连接池、网络重传与慢消费者。
