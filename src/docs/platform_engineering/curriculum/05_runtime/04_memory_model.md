---
title: 05.04 Go 内存模型：从共享在线状态到同步保证
icon: /assets/icons/article.svg
order: 5
date: 2026-09-24
---

[返回第五卷](./README.md) · [任务前置：05.01](./01_concurrent_tasks_lifecycle.md) · [锁前置：05.02](./02_sync_primitives.md) · [channel 前置：05.03](./03_channels_cancellation.md) · [系统内存前置：03.05](../03_systems/05_virtual_memory.md)

# 05.04 Go 内存模型：从共享在线状态到同步保证

> DeepTutor 初稿经技术与教学审阅后的静态课程。`c-a` 的状态和代码片段均为纸上教学模型；没有运行 Go、race detector、IM 服务、基准或站点。Go 内存模型的同步保证按官方文档核对，本章不声称固定 OpenIM 版本用同一套状态结构。

## 一、两个 goroutine 看同一会话，什么叫“看到新状态”？

05.01 已认识 goroutine 的生命周期，05.02 用 `Mutex` 保护共享状态，05.03 用 channel 做进程内交接。现在要精确回答一句常见却含糊的话：“写完 `c-a` 的在线状态后，另一任务一定能看到吗？”先定义一份**虚构的单进程教学状态**：旧快照 `(Online=false, Version=0)`，一次更新后应是新快照 `(Online=true, Version=1)`。`Version` 在本模型里与 `Online` 属于同一次发布，不是实际产品的用户在线算法。

```go
type SessionView struct {
    Online  bool
    Version int64
}
```

若写者依次改两个字段，读者也读两个字段，中间能否看到 `(true,0)`？两个写操作是否“看起来先执行”就足够？答案需要区分**语言级数据竞争**和**业务上要求同一个版本的快照**。前者由同一内存位置的访问和同步关系判断；后者还要求多个字段被当成一个状态变化管理。

| 第一遍 | 第二遍 | 交付物 |
|---|---|---|
| 共享变量、读写、数据竞争、程序顺序与同步边 | Mutex/channel 发布、atomic/CAS、业务竞争与验证 | 一张 happens-before 图、两字段快照表、四种方案对照 |

本章讨论的是**一个 Go 进程内** goroutine 间的保证。跨进程、数据库提交、设备交付与多端在线状态不由 Go 内存模型自动解决；S5 再处理那些分布式边界。

## 二、数据竞争：同址读写缺少同步关系

**内存位置**先粗略理解为一个可读写变量或字段。若两个 goroutine 对**同一位置**有普通读/写或写/写，至少一方写入，且这些访问没有被同步规则排出先后，就构成**数据竞争**。例如写者普通赋值 `view.Online=true`，读者同时普通读取 `view.Online`，且两者之间没有锁、channel 或其他同步；“写者在日志里先打印”或“先睡 1 ms”都没有建立该变量的语言级保证。

```go
// 故意错误的纸上片段：假设 view 是双方共享的 SessionView。
go func() {
    view.Online = true
    view.Version = 1
}()
online := view.Online
version := view.Version
_, _ = online, version
```

不能从源代码的两行顺序直接宣布读者必见 `(true,1)`。Go 官方内存模型对有数据竞争的程序仍规定了某些实现限制，**并非 C/C++ 式“编译器可随意做任何事”的完整未定义行为**；但这种程序是错误的，不能获得“无竞态程序可按某种顺序交错执行”的保证，也不能依赖一个稳定的混合结果。更大的切片、接口和字符串等多字结构在竞态下还会产生更严重的不一致风险。

**业务竞争**另有含义：所有单次内存访问都可能由锁保护，流程仍把“检查成员身份”和“保存消息”分成两个可穿插的步骤，导致退出会话后仍写入。没有 data race 不等于跨步骤业务规则正确；05.02 已用判重例子说明保护范围，06.07 用数据库事务深化。

## 三、happens-before：画出“能够保证观察”的箭头

Go 内存模型使用 **happens-before** 表示有保证的先行关系。初学者先把它当成一张有方向的证据图：同一 goroutine 中前一操作按程序顺序先于后一操作；锁、channel、atomic 等操作按各自规则建立跨 goroutine 的**同步边**；这些边可传递。**墙上时间早**或“我觉得这个任务已经跑完”本身不是同步边。

```text
写者：写 Version=1 → 构造完整快照 → 发送 channel 值
                                     ↓ 对应的发送/接收同步
读者：                           接收完成 → 读取收到的快照
```

官方规则包括：channel 的发送同步先于**对应接收完成**；一个 `Mutex.Unlock` 同步先于之后取得同一把锁的 `Lock` 返回；若一个原子操作的效果被另一个原子操作观察到，它们也有同步关系。`go f()` 的启动动作先于新 goroutine 开始执行，但**新 goroutine 退出并不会自动把结果发布回启动者**：需要等待或通信。`WaitGroup` 在其文档限定的使用方式下可为完成等待建立关系；只“希望它应该结束了”不行。

有同步边且程序没有数据竞争时，Go 提供**无数据竞争则按某种顺序交错执行**的直觉保证，常称 DRF-SC。这不是要求学习者为每一行手画全部 CPU 指令，而是要求读写共享状态时说得出：**哪一个操作把写入发布给了读者，读者在何处接收了这份保证？**

## 四、Mutex：把两个字段连同读取一起保护

若 `SessionView` 在内存中被多个 goroutine 使用，最直接的方案是让写者在**同一锁区间**更新两字段，读者在**同一锁区间**复制完整快照：

```go
type ProtectedView struct {
    mu   sync.Mutex
    data SessionView
}

func (p *ProtectedView) Publish() {
    p.mu.Lock()
    p.data.Online = true
    p.data.Version = 1
    p.mu.Unlock()
}

func (p *ProtectedView) Snapshot() SessionView {
    p.mu.Lock()
    v := p.data
    p.mu.Unlock()
    return v
}
```

片段省略包声明与构造，仅用于纸上解释。假定初态 `(false,0)`、没有其他写者，`Snapshot` 若在 `Publish` 取得锁前完成，得到完整旧对；若在它释放锁后取得，得到完整新对。读者不能在写者的两次赋值之间插入并复制半更新。`Unlock→后续 Lock` 的同步边也使先前的写入对后续持锁读取可见。

只给两个字段**各自**套一个很短的锁区间，或读者分别加锁读取两次，仍可能在两次读取之间遇到更新，拿到不同版本。锁的关键是**保护范围覆盖整个不变量**，而不只是“代码里出现过锁”。同一把 Go 进程内锁不能跨多个服务节点保护数据库成员关系；跨进程的事务和失效问题要另做设计。

## 五、channel：交出不可再改的值，再由接收者读取

另一种设计是由写者创建完整的值 `SessionView{Online:true,Version:1}`，然后通过 `chan SessionView` 发送；读者从同一通道收到**对应值**后读取字段。发送在对应接收完成前形成同步关系，因此先前构造的字段可被安全观察。即使通道有缓冲，这条发送→对应接收的发布关系仍成立；但**发送返回时可能只是值进了缓冲**，不能说读者已经接收、处理，更不能说设备已收到 IM 消息。

```go
updates := make(chan SessionView, 1)
go func() {
    updates <- SessionView{Online: true, Version: 1}
}()
snapshot := <-updates
_ = snapshot
```

上述值只含 bool 和 int64，便于独立传递。若发送的结构里包含 `[]byte`、map 或指针，发送结构体的值**不会深复制底层可变数据**；写者发送后又修改共享底层数组，读者同时读取它，仍可能有数据竞争。要么明确所有权转交后写者不再改，要么在发送前做独立复制，要么另外同步。channel 操作提供发布关系，不替业务定义对象所有权和后续处理结果。

无缓冲 channel 还能让发送者等到接收配对；缓冲 channel 更容易让发送者先继续。但无缓冲配对完成也只证明通信动作，不证明接收方已经完成会话状态落库、推送或设备展示。05.03 的容量 2 队列与本章的内存可见性正好在这里相接。

## 六、atomic 与 CAS：单个位置安全，不等于一份完整快照

`sync/atomic` 提供 `Load/Store/Add/CompareAndSwap` 等原子操作。对一个计数器，`atomic.Int64.Add(1)` 可使多个 goroutine 的单字段增量不发生普通读改写竞争；`CompareAndSwap(old,new)` 只在当前位置仍等于 old 时成功，可选出一个状态转换赢家。Go 官方规定这些原子操作表现为某种顺序一致的执行次序，但**每个原子变量上的一次操作**仍不是“把多个业务字段一起提交”的事务。

若把本章两字段分别做成 `atomic.Bool` 和 `atomic.Int64`，所有访问都用对应原子方法，语言级数据竞争可以消除；但写者先 `Online.Store(true)`，还没做 `Version.Store(1)` 时，读者完全可能读到 `(true,0)`。这只是两个单独原子操作之间的合法交错，违反了我们定义的“同一版本快照”合同。

| 方案 | 单字段访问 | 两字段同版快照 | 适合的问题 |
|---|---|---|---|
| 普通读写且无同步 | 有数据竞争风险 | 无保证 | 不应用于共享可变状态 |
| 同一 `Mutex` 保护完整读写 | 无数据竞争 | 可给旧对或新对 | 小型多字段状态 |
| channel 传不可再修改的完整值 | 通过对应发送/接收发布 | 收到的是构造好的值 | 明确所有权交接 |
| 两个字段各自 atomic | 各字段无普通访问竞态 | **不自动保证** | 独立指标/标志，或另有版本协议 |

CAS 也只在**目标位置**上决定是否替换。若业务规则还需要“检查成员→保存消息→记录序号→排入推送”，CAS 一个在线标志不会把这些步骤一起提交；数据库事务、幂等和跨节点一致性在 S3/S5 的其他章节讨论。简单正确的锁或消息传递通常比随手组合多个原子量更易审阅。

## 七、race detector 与业务竞争：测试证据有范围

Go 的 race detector 能在**实际执行到的路径**上报告数据竞争，适合学习者后来对自己的受控示例使用。它没有覆盖所有可能调度，也不能因为某次运行“没有报警”就证明所有共享访问安全；本次课程制作没有运行 `go test -race` 或任何并发代码。若检测报告竞态，应先修复正确的同步边，不能靠增加 `time.Sleep` 掩盖问题。

即使代码完全无数据竞争，业务仍可能错。例如两个请求各自加锁检查 `message_id=m-a` 不存在，随后各自解锁、再加锁插入；检查与插入之间可穿插，导致重复处理。更高层的“用户退群”和“消息提交”若分别在不同节点与数据库事务中发生，单进程锁也管不到。**数据竞争问共享内存的无序访问；业务竞争问整个业务不变量能否被交错破坏。** 两者都要有自己的验证方法。

验收时给出两份证据：一份是代码中的同步关系、保护范围和可构造的失败交错；另一份才是学习者以后在自己环境中运行的 race/功能测试与版本记录。race-free 是语言层面的必要条件之一，不自动保证在线状态、消息幂等、持久提交或设备交付。

## 八、交付同步关系纸图与分层练习

交付四张纸：无同步普通读写的竞态图；同一锁保护写与快照的旧/新结果；channel 发布的写→发送→接收→读箭头；两个 atomic 字段在中间时刻产生 `(true,0)` 的无竞态却不一致反例。再为“单字段 CAS”和“跨节点成员/消息规则”分别写出保证边界。所有代码和结果是静态推演。

### 分层练习：先答，再展开反馈

<details><summary>1. 数据竞争至少需要哪类并发访问？</summary>

同一内存位置上的无同步读/写或写/写，且至少一方写。</details>

<details><summary>2. 两个 goroutine 修改不同且互不共享的位置必然是竞态吗？</summary>

不必然。应看实际访问位置、共享关系与同步边。</details>

<details><summary>3. 写者先打印日志，能证明读者随后看到新字段吗？</summary>

不能。日志时间顺序不自动建立相应内存访问的 happens-before。</details>

<details><summary>4. `time.Sleep` 能代替同步吗？</summary>

不能。等待时间不是保证跨 goroutine 可见性的同步协议。</details>

<details><summary>5. Go 有数据竞争的程序与 C/C++ 式完全未定义行为一样吗？</summary>

不一样。Go 有部分实现限制，但竞态程序仍错误，不能依赖无竞态的顺序一致保证。</details>

<details><summary>6. `go f()` 自动保证 f 结束后主 goroutine 才读结果吗？</summary>

不保证。启动先于 f 开始，f 的完成需要另行等待或通信。</details>

<details><summary>7. happens-before 由哪两类边组合并传递？</summary>

同一 goroutine 的程序顺序和跨 goroutine 的同步关系。</details>

<details><summary>8. `Mutex.Unlock` 与后续同一锁的 `Lock` 有何关系？</summary>

前一次 Unlock 同步先于之后取得锁的 Lock 返回，使此前写入可在后续保护区读到。</details>

<details><summary>9. 读者用同一锁一次复制两字段，能读到半更新吗？</summary>

在本章单写者和完整保护假设下不能；它读完整旧对或完整新对。</details>

<details><summary>10. 两字段各自加锁，但读者分两次取值能保证同版吗？</summary>

不能。两次读取之间写者可能完成更新。</details>

<details><summary>11. channel 发送与哪次接收建立同步？</summary>

与该发送**对应**的接收完成建立同步关系。</details>

<details><summary>12. 缓冲 channel 发送返回就证明接收者完成业务了吗？</summary>

不能。值可只进缓冲，处理和业务确认是后续步骤。</details>

<details><summary>13. 发送含 `[]byte` 的结构会自动复制底层数组吗？</summary>

不会。要明确所有权转交、复制或进一步同步。</details>

<details><summary>14. `atomic.Int64.Add(1)` 主要保护什么？</summary>

这个计数器的单次原子增量，避免普通共享读改写竞态。</details>

<details><summary>15. 两个字段各自 atomic 就能形成同一版本快照吗？</summary>

不能。两个操作之间仍可被读者观察到混合状态。</details>

<details><summary>16. 写者先 `Online.Store(true)` 再 `Version.Store(1)`，中间可读到什么？</summary>

可读到 `(true,0)`；这是两个 atomic 操作之间的合法交错。</details>

<details><summary>17. CAS 返回失败说明什么？</summary>

目标位置当时不满足预期旧值，当前这次条件替换未成功；还要按业务规则处理重试或冲突。</details>

<details><summary>18. CAS 一个标志能提交数据库消息与设备推送吗？</summary>

不能。它只管理目标原子位置，外部副作用另有事务和失败边界。</details>

<details><summary>19. race detector 没报警证明所有调度都安全了吗？</summary>

不能。它只观察实际执行过的路径和交错。</details>

<details><summary>20. 无 data race 就必然没有重复消息吗？</summary>

不能。检查与插入分段加锁仍可能违反业务判重不变量。</details>

<details><summary>21. 同一 Go 进程的 Mutex 能保护另一个服务节点吗？</summary>

不能。跨节点状态要用相应数据库或分布式协议保证。</details>

<details><summary>22. 本章的 `(Online,Version)` 是真实 IM 在线协议吗？</summary>

不是。它是解释两字段同版快照的虚构教学状态。</details>

## 来源与下一步

- [Go 官方内存模型](https://go.dev/ref/mem)：数据竞争、DRF-SC、happens-before、channel、锁和原子规则。
- [Go `sync`](https://pkg.go.dev/sync)与[`sync/atomic`](https://pkg.go.dev/sync/atomic)：同步原语、单字段原子操作和 CAS。
- [Go race detector 文档](https://go.dev/doc/articles/race_detector)：动态检测的使用与覆盖范围；本章没有实际运行检测。

按[学习路线](../learning_path.md)，下一章 05.05 从“可见性”转向 Go 的 G/M/P 调度、系统调用等待与网络轮询职责。离开本章前，应能为每个共享读写指出**同步边**，并说明**无数据竞争、完整业务快照和跨进程提交**分别需要什么保证。
