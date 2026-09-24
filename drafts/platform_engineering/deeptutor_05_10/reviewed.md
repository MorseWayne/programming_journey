# 05.10 性能工具与解释：从群聊时延到 Go 运行证据

> DeepTutor 初稿经技术与教学审阅后的静态课程。群规模、P95、profile 与 trace 的分析都是纸上情景；没有运行 Go、`pprof`、trace、基准、IM 服务或站点。工具接口与字段按 Go 官方文档核对，采样开销及具体行为需在学习者自己的版本和隔离环境中验证。

## 一、10 人群与 10000 人群变慢，先问比较是否公平

虚构 `c-g` 群消息处理：目标数从 **10** 扩到 **10000** 后，合成 P95 从 **80 ms** 升到 **300 ms**。这提示工作量随目标数变化，却不能证明“编码 CPU”“锁”“GC”或“慢设备”哪一个是主因。05.07 已区分分配速率与存活集，05.08 已设限活跃 worker 和排队量，05.09 已说明正确性与运行证据的边界。现在学习选择诊断工具，并解读它看不到什么。

**发现问题**可以比较 10 与 10000 目标；**评估一次优化**则必须固定为同样的 10000 目标、同样输入速率、相近慢设备比例、同样 Go 版本和服务配置。否则把小群的 80 ms 与优化后大群的 230 ms 放在一起，既不能说优化变差，也不能算出有意义的收益。要先写清“哪个请求结果、哪段窗口、哪些负载条件”再采样。

| 第一遍 | 第二遍 | 交付物 |
|---|---|---|
| 症状→工具选择、CPU 与 heap profile | mutex/block、execution trace、采样扰动与同负载对照 | 一张工具选择表、一份竞争假设、一张优化证据模板 |

本章用 Go 运行时工具解释**进程内** CPU、分配、等待和调度。跨进程的网关→数据库→设备链路仍需 11.03 的请求 Trace 与系统/数据库证据；不能用 Go 火焰图替它们完成因果归因。

## 二、先按问题选工具，再看图

| 纸上问题 | 优先证据 | 它能定位 | 主要盲区 |
|---|---|---|---|
| 群编码是否消耗很多 CPU？ | CPU profile | **正在用 CPU** 的采样栈与调用路径 | 等网络、锁或数据库的壁钟等待 |
| 每目标临时副本在哪里分配？ | heap `alloc_space` | 累计分配热点（采样） | 当前仍活的对象量与进程全部 RSS |
| 哪些队列/缓冲长期活着？ | heap `inuse_space` | 采样时在用对象的分配位置 | Go 堆外、内核 socket 与共享页 |
| 哪段锁保护范围引发争用？ | mutex profile | 造成其他 G 等锁的持锁临界区附近 | 所有 channel/网络等待及业务正确性 |
| G 卡在同步原语哪里？ | block profile | channel、锁、等待组等阻塞位置 | 一切 I/O/下游等待的完整因果链 |
| 某 G 何时运行、被唤醒或等网络？ | execution trace | 调度、syscall、网络、GC 等事件时间线 | CPU/heap 热点的最佳归因工具与设备业务确认 |

表格不是“一次把六种采样全开”的清单。Go 官方诊断文档提醒工具会相互扰动，例如更精细的内存采样可改变 CPU profile，阻塞采样可影响调度 trace。先选择最能区分候选的一个视角，再在另一份可比窗口补证据；记录采集设置、时长、版本与开销。未经授权的调试端点也可能暴露栈和运行信息，未来采集必须限定隔离范围与访问权限，本课程不开放或访问任何实际端点。

## 三、CPU profile：栈样本表示“当时在运行”，不等于请求耗时

CPU profile 定期采样**正在消耗 CPU** 的执行栈。若某编码函数在样本中占比较多，可作为“把 CPU 花在这里”的证据；但这不是“每条 IM 消息 40% 的 300 ms 都在这个函数”的直接等式。样本来自整个采集进程和窗口，可能混有其他请求；等待网络/数据库时 G 不持续用 CPU，这些壁钟等待也不会按比例出现在 on-CPU 样本里。

读 pprof 的 `flat` 与 `cum` 要分清：**flat** 近似该函数自身栈帧上采到的成本，**cum** 含它调用的下层路径；同一个样本可计入多个调用者的累计值，不能把所有 `cum` 百分比相加当作 100%。如果 CPU profile 显示编码热，还需确认采集窗口确有 10000 目标的大群请求、CPU 是否已接近相关执行容量，以及 Trace/业务阶段是否对应变慢。若请求主要在等慢设备，CPU profile 很干净也不足以证明没有性能问题。

不要把 profile 当源码逐行计时器：它是采样统计，短采样、混合负载和优化后的内联都会影响解释。火焰图或 top 表应服务一个可反驳的问题，例如“减少重复序列化是否降低同负载 CPU 与 P95”；若答案只写“某函数很红”，还没有形成工程结论。

## 四、heap profile：累计分配与当前保留是两张不同账

05.06 的 `8 B` 小视图可能保留 `64 KiB` 大数组；05.07 的群扇出则可能每目标生成短命副本。两种问题选择不同 heap 视角：`alloc_space` 看从开始以来**累计分配字节**的热点，适合找高频临时编码；`inuse_space` 看采样时仍在用的堆字节，适合找队列、缓存和切片引用导致的长期保留。它们都是**采样**，并不逐个完整枚举所有对象。

| 现象 | 可能看到的差异 | 下一步应核对 |
|---|---|---|
| 每次扇出都复制，发送后很快释放 | `alloc_space` 高，`inuse_space` 可较稳 | 同窗分配速率、GC CPU、编码耗时 |
| 慢设备积压队列 | `inuse_space` 与队列长度一起抬高 | 谁持有对象、队列容量、取消/退出路径 |
| Go heap 稳定但进程 RSS 升高 | 两种 heap 视角未必解释 | 栈、映射、内核或外部库内存，见 03.06 |

`TotalAlloc` 是累计数、`HeapAlloc` 是某刻已分配堆对象数值，后者还可能含未清扫的不可达对象；profile 的 alloc/inuse 又是采样归因。它们与进程 RSS 的统计范围不同。只看默认 heap 图的一个视角，容易把“分配很忙”误认为“长期泄漏”，或在 GC 后存活看似不大时忽略大量短命分配的 CPU 成本。

## 五、mutex 与 block：谁造成锁等待、谁停在同步点

Go `runtime/pprof` 对 **mutex profile** 的说明很具体：样本通常归因到**造成争用的临界区结束位置**，估算其他 goroutine 等待这把锁的累计时间。因此热点更接近“谁持锁使别人等”，并非某个等待者的单次请求耗时。**block profile** 则记录 goroutine 在同步原语处阻塞的栈，如 channel 发送/接收、`Mutex.Lock`、`WaitGroup.Wait`；它更像“在哪里等”。两张图可互补，但名字不能互换。

设 `c-g` 群成员快照由一把锁保护：若 mutex profile 指向一个持锁期间还做编码的临界区，候选改进是缩短锁内工作；若 block profile 指向输出 channel 满时的大量发送等待，候选是下游消费能力、容量与过载策略。两者**都不能**由一张图直接证明消息 seq、成员权限或送达合同正确。

这两类 profile 有采样率与启用条件，收集时会增加一定开销。若某慢请求等的是数据库响应或网络事件，它不必都出现在 block profile 的同步原语类别里；应再用 execution trace 和跨服务请求 Trace。教材只说明证据选型，未开启采样。

## 六、execution trace：时间线回答“何时等待”，不替业务确认

Go `runtime/trace` 可记录 goroutine 创建、阻塞/唤醒、系统调用、网络轮询与 GC 等运行事件，并交给 `go tool trace` 分析。若 `c-g` 的一个处理 G 很久处于 runnable 而未 running，可怀疑调度排队；若它长期等网络，CPU profile 可能不显示这段时间；若 GC 活跃时业务 G 等 CPU，也需对齐窗口。trace 帮助**按时间**理解这些状态转换，CPU/heap profile 更适合定位热点与对象来源。

还要区分 **Go 运行时 execution trace** 与 **跨进程请求 Trace**：前者关心一个 Go 程序里的 G/M/P、系统调用等事件；后者关心一次 IM 请求经过网关、数据库、连接写入等业务阶段。运行时 trace 显示“本地连接写操作返回”仍不能证明设备已解析、展示或用户已读。若关键等待发生在远端数据库，必须看相同请求标识的下游耗时，不能让本地 trace 单独背锅。

trace/profile 也会扰动被测程序；尤其在高峰、短窗口或争用激烈时，采集行为可能改变调度。应在受控时间窗记录采集前后业务 P95、吞吐、错误与资源用量，并保留其影响作为证据限制，而不是把采集期间的单次尖峰当成原有基线。

## 七、优化评审：同一大群负载才能算差异

现在只评审一个**纸上候选**：减少每目标重复编码。问题发现阶段是 10 人群 P95 80 ms 对 10000 人群 P95 300 ms；真正比较候选应使用**同样 10000 目标**、同样 20 条群消息/秒、相近 5% 慢设备比例、同版本 Go 与同样队列/限额。下面“优化后 230 ms”仅用于演示算式，不是运行结果：`(300−230)/300≈23.3%`。若真实样本不足、错误率升高或队列积压，不能报告有效改善。

| 要记录 | 旧方案同负载 | 候选同负载 | 为什么要同时看 |
|---|---|---|---|
| 目标数/消息速率/慢设备比例 | 10000 / 20 s⁻¹ / 5% | 必须相同 | 防止输入变化伪造收益 |
| 群处理 P95 | 300 ms（纸上基线） | 230 ms（**仅算式示例**） | 看用户可见结果和统计不确定性 |
| 错误/取消/确认点 | 待未来实测 | 待未来实测 | 性能不能破坏消息语义 |
| CPU `flat/cum`、分配 `alloc_space` | 待采样 | 待采样 | 验证重复编码是否真的减少 |
| `inuse_space`、队列长度、GC/trace | 待采样 | 待采样 | 避免把 CPU 降低换成内存积压 |

一次只改变一个主要机制，并重新做 05.09 的并发/失败验证；性能基准与请求 Trace 要保留样本量、分布和异常输入。若候选 p95 下降、CPU 降低但 `inuse_space` 和慢设备队列暴涨，需要重新评审；如果 CPU profile 原本没有编码热点，也应先质疑优化方向。工具是检验假设的方式，不是为既定结论挑图。

## 八、交付工具选择与证据表的分层练习

学习者交付一页工具选择表：至少为“编码 CPU”“短命分配”“队列长期保留”“成员锁争用”“channel 等待”“调度/网络等待”各选工具、注明盲区；再写同样 10000 目标负载的候选实验与错误/内存保护条件。所有指标标为纸上或未来待测，不把它们写成已在本仓库采集的产物。

### 分层练习：先答，再展开反馈

<details><summary>1. 10 人群的 80 ms 可直接与优化后 10000 人群的 230 ms 比吗？</summary>

不能。评估优化必须固定负载条件。</details>

<details><summary>2. CPU profile 主要采样什么状态？</summary>

正在消耗 CPU 的执行栈，不是完整壁钟等待。</details>

<details><summary>3. 等数据库 200 ms 会按比例出现在 CPU 栈样本里吗？</summary>

不一定。等待期间不持续用 CPU，应看请求 Trace/运行时等待证据。</details>

<details><summary>4. pprof 的 flat 与 cum 有何区别？</summary>

flat 近似函数自身采样，cum 包含它下游调用路径的采样。</details>

<details><summary>5. 多个 cum 百分比能直接相加到 100% 吗？</summary>

不能。同一栈样本可进入多个调用者的累计值。</details>

<details><summary>6. 短命群副本应先看哪种 heap 视角？</summary>

`alloc_space`，找累计分配热点。</details>

<details><summary>7. 慢设备队列长期留住大数组应先看哪种？</summary>

`inuse_space`，再追引用链与队列容量。</details>

<details><summary>8. heap profile 是逐个对象的完整账本吗？</summary>

不是。通常是采样归因，不能当精确全量列表。</details>

<details><summary>9. Go heap 视角稳定可断言进程 RSS 不会升吗？</summary>

不能。RSS 还含栈、文件映射和外部/内核相关范围。</details>

<details><summary>10. mutex profile 热点更接近谁的栈？</summary>

造成其他 G 等待的持锁临界区结束位置，而非每个等待者的请求总耗时。</details>

<details><summary>11. block profile 更接近什么？</summary>

goroutine 阻塞在 channel、锁、等待组等同步原语的位置。</details>

<details><summary>12. block profile 能覆盖所有远端数据库等待吗？</summary>

不能。它有同步原语的采样范围，还需其他 trace/下游证据。</details>

<details><summary>13. 哪个工具适合看 G 何时 runnable、running 或等网络？</summary>

Go execution trace。</details>

<details><summary>14. execution trace 与跨进程请求 Trace 是同一件事吗？</summary>

不是。前者看 Go 运行事件，后者跨业务服务分解请求阶段。</details>

<details><summary>15. 本地写操作在 trace 中返回就证明设备已展示吗？</summary>

不能。设备应用确认和展示需要独立协议证据。</details>

<details><summary>16. 可以同时打开所有 profile 而不考虑扰动吗？</summary>

不应。采样可能改变 CPU、内存和调度，应按问题分窗口采集并记录开销。</details>

<details><summary>17. 300→230 ms 的纸上改善比例约多少？</summary>

约 23.3%；这是算式示例，不是真实改善结果。</details>

<details><summary>18. 候选 P95 降了但队列积压翻倍，就可宣布成功吗？</summary>

不能。还要看容量、错误、内存和确认合同。</details>

<details><summary>19. 只看到编码函数火焰图很红，足以证明业务根因吗？</summary>

不足。需同窗业务阶段、负载和可反驳的优化对照。</details>

<details><summary>20. `alloc_space` 高而 `inuse_space` 稳定，较像什么？</summary>

短命分配繁忙；仍需核对 GC CPU 与业务时延。</details>

<details><summary>21. 采集 profile 的端点可无控制地公开吗？</summary>

不应。运行信息可能敏感，未来采集需限定隔离和访问权限。</details>

<details><summary>22. 本章已采集真实 CPU/heap/trace 吗？</summary>

没有。所有表是静态课程与待测计划。</details>

## 来源与下一步

- [Go 官方诊断指南](https://go.dev/doc/diagnostics)与[`runtime/pprof`](https://pkg.go.dev/runtime/pprof)：各类 profile 的范围、采样与采集扰动。
- [Go `runtime/trace`](https://pkg.go.dev/runtime/trace)与[`net/http/pprof`](https://pkg.go.dev/net/http/pprof)：运行时事件和可选采集入口；本章没有暴露或调用端点。
- [Go GC 指南](https://go.dev/doc/gc-guide)与[`testing` 包](https://pkg.go.dev/testing)：分配/存活视角及未来同负载基准入口。

按[学习路线](../../../src/docs/platform_engineering/curriculum/learning_path.md)，下一章[05.11 优化边界](../../../src/docs/platform_engineering/curriculum/05_runtime/11_optimization_boundaries.md)比较减少分配、池化、批量和局部性时应守住的正确性与维护边界。离开本章前，应能说出**每种工具采样了哪一层、看不到哪一层，以及何种同负载证据才能支持一次 IM 优化**。
