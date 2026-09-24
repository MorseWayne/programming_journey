---
title: 05.02 同步原语：保护共享会话状态的一次完整变化
icon: /assets/icons/article.svg
order: 3
date: 2026-09-24
---

[返回第五卷](./README.md) · [前置：05.01 任务生命周期](./01_concurrent_tasks_lifecycle.md) · [消息判重前置：02.04](../02_algorithms/04_hash_sets.md)

# 05.02 同步原语：保护共享会话状态的一次完整变化

> DeepTutor 初稿经技术和教学审阅后的静态课程。Go 代码、交错时间线和失败结果都是按明确合同推导的示例；本次没有运行 Go、数据竞争检测、测试、站点构建或 IM 服务。

## 本章的业务规则比“给 map 加锁”更重要

05.01 已让你启动一组 goroutine、等待它们完成，并指出 `WaitGroup` 不会替你保护共享数据。现在假设未来教学 IM 的**内存版**会话 `c-a` 有两份状态：`map` 用消息 ID 找消息，`order` 切片保存列表顺序。两个任务可能同时试图保存同一个 `m-a`。需求是：**同一会话消息 ID 不重复；第二次同 ID 请求拒绝且不覆盖第一次成功保存的消息；列表中的每个 ID 恰好对应 map 中一条消息。**

如果只说“读写 map 要加锁”，仍可能把“先检查不存在、再写入”拆成两个独立锁区间，让两个任务都检查通过。本章从完整业务状态变化推导 `Mutex`，再讲 `RWMutex` 快照、`WaitGroup`、`Once` 和 `Cond` 各自的职责。所有 `c-a/u-a/m-a` 是虚构教学数据；单会话内存模型不代表文件持久化、网络幂等、服务端受理或设备送达。

| 第一遍 | 第二遍 | 个人练习成果 |
|---|---|---|
| 数据竞争、临界区、Mutex、完整状态变化 | RWMutex、WaitGroup/Once/Cond、锁顺序与死锁 | 一张交错表、一套状态不变量和失败前后表 |

先修是 01.05 的 map/结构体/指针、02.04 的键与重复、05.01 的 goroutine/等待。05.03 再讲 channel 与取消，05.04 才严谨展开 Go 内存模型；本章只用足以解释同步工具的先修。不要把示例代码当成已编译或已通过并发测试的证据。

## 一、两条任务同时改一份状态：先看反例

**共享可变状态**是多个任务都能访问、且至少有一个任务会修改的同一份数据。本题的 `byID` map 与 `order` 切片应由同一个 `History` 对象拥有；它们共同表达“不重复、列表可查”的**不变量**。不变量是在每次对外可观察的完整操作之后都应成立的状态约束。

先看一个刻意不完整的思路：

```text
if m-a 不在 byID：
    byID[m-a] = 当前消息
    order 追加 m-a
```

假设两个任务 T1、T2 同时做这三步：

| 时刻 | T1 | T2 | 问题 |
|---|---|---|---|
| 1 | 看见 `m-a` 不存在 | — | 还没保存 |
| 2 | — | 也看见 `m-a` 不存在 | 两边都准备通过 |
| 3 | 写 `byID[m-a]`，追加 `order` | — | 第一份成功 |
| 4 | — | 再写同一键，追加同一 ID | 原值被替换、列表重复 |

普通 Go map 不应在没有保护的情况下被多个 goroutine 并发读写；这类访问本身就可能构成**数据竞争**，甚至出错。上表还揭示**业务竞争**：即使把每次单独的 map 读与写都用锁保护，只要在“检查”与“写入”之间释放锁，T1、T2 仍能先后都看到“不存在”，最后破坏唯一性。数据竞争与业务竞争要分别检查，不能以“某一行是线程安全的”取代完整业务合同。

另一组状态也必须同进同退：如果 map 已有 `m-a` 而 `order` 还未追加，读者可能看到不一致；反过来，先追加 `order` 再写 map，读者可能查不到列表指向的消息。**临界区**应覆盖本题的“检查重复→写 map→追加 order”整体，而不是只覆盖其中一次赋值。

## 二、`Mutex` 保护的是完整的一次变化

`sync.Mutex` 提供互斥：一个 goroutine 持有锁时，其他需要同一锁的 goroutine 要等待。Go 的 `Mutex` 零值可直接用；`Lock()` 进入保护区，`Unlock()` 离开。`defer mu.Unlock()` 常用于确保函数在各个正常返回路径释放锁。带锁对象应通过指针使用，**已使用的锁不能当普通值随结构体复制**，否则会把状态与锁的归属拆乱。

本题的正确边界是：

```text
先检查消息必需字段（只读传入值）
→ Lock 这份 History 的同一把锁
→ 检查 m-a 是否已存在
→ 若存在：返回重复错误，原 map/order 不变
→ 若不存在：写 map，再追加 order
→ Unlock，返回成功
```

两个任务只能一个先进入这段锁区。后进入者检查时，会看到先进入者完成后的 map 状态，于是返回重复错误。**哪个正文先获锁并成功是不确定的**；承诺的是“第一个成功保存的原值不会被后一个同 ID 请求覆盖”，不是“代码里先写 T1 就保证 T1 赢”。本章只描述内存单会话内的顺序，不承诺客户端时间、全局消息序或跨进程唯一性。

错误的“半套锁”可能写成：先读锁检查没有，再解锁，随后取写锁插入。两个任务仍可在插入前都通过检查。若业务要求检查与执行不能分离，就在同一写锁区完成；不能通过多加一次 `RLock` 修复间隙。

锁也不应包住不属于这份内存状态不变量的长时间工作，比如网络发送、等待磁盘、远端查询或记录可能阻塞的结果。持锁期间做这些 I/O 会让别的消息操作一起等待，并可能形成更复杂的相互等待。先在短锁区完成必要的内存状态变更，再按清楚的业务合同处理锁外副作用；若业务要求“存储成功后才可见”，还需要在后续章节设计跨内存与持久层的状态机/事务，不能简单把网络 I/O 塞进 Mutex 里便宣称原子。

## 三、完整静态示例：同锁保护 map 和列表

下例是**仅有一个会话**的教学内存对象。`Message.Body` 用不可直接修改内容的 `string`；真正带 `[]byte` 或嵌套 map 的对象还需额外复制责任。零值 `History` 可使用，首次成功追加时在锁内初始化 map；调用者也可直接用 `&History{}`。代码只演示内存规则，不读写文件：

```go
package history

import (
	"errors"
	"sync"
)

type Message struct {
	ID   string
	Body string
}

var (
	ErrInvalid   = errors.New("invalid message")
	ErrDuplicate = errors.New("duplicate message id")
)

type History struct {
	mu    sync.RWMutex
	byID  map[string]Message
	order []string
}

func (h *History) Append(m Message) error {
	if m.ID == "" || m.Body == "" {
		return ErrInvalid
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	if _, exists := h.byID[m.ID]; exists {
		return ErrDuplicate
	}
	if h.byID == nil {
		h.byID = make(map[string]Message)
	}
	h.byID[m.ID] = m
	h.order = append(h.order, m.ID)
	return nil
}

func (h *History) List() []Message {
	h.mu.RLock()
	defer h.mu.RUnlock()
	out := make([]Message, 0, len(h.order))
	for _, id := range h.order {
		out = append(out, h.byID[id])
	}
	return out
}
```

`Append` 的重复检查、map 写入、`order` 追加都在同一次写锁内。非法字段在触碰共享状态前拒绝；重复 ID 返回 `ErrDuplicate`，不追加、不替换。`List` 在读锁内沿现有顺序构造**新切片**并返回；调用者修改返回切片的元素，不会改写 `History.order` 或 `History.byID` 中的字符串值。`order` 的次序按**成功追加取得锁的先后**形成，不是可靠消息全局顺序。

用两条同时到达的教学请求推演：`T1` 试图保存 `m-a/"你好"`，`T2` 试图保存 `m-a/"你好呀"`。恰有一条先获锁并成功，另一条在锁内发现重复，返回 `ErrDuplicate`；`List` 最终只有一项，正文等于**先成功者**的值。由于本章没有运行或控制调度，不能预写“必然是 T1 的正文”。随后另一条不同 ID `m-b` 成功时，列表有两项，且每项都能在 map 找到。

注意 `List` 返回的是当前调用所见的一份**快照**；其他 goroutine 此后仍可继续 `Append`，旧快照不会自动更新。它不证明本地 JSON 已写入，也不证明服务端持久化。

## 四、`RWMutex`：并发读取与独占写入的边界

上一节的 `History` 用 `sync.RWMutex`：`Lock/Unlock` 是**写锁**，写入时独占；`RLock/RUnlock` 是**读锁**，多个只读调用可以同时持有。读锁仍要覆盖 `order` 和 `byID` 的所有读取，写锁则覆盖它们的所有写入。若在 `List` 中忘了为 `order` 加保护，或者在其他方法里绕过锁直接读 map，整个对象的共享状态合同就不完整。

“有读锁”不是“返回内部指针后仍永远安全”。`List` 在锁内复制切片和 `Message` 值，锁外拿到的是独立列表。此例 `Message` 只含字符串，内容不能通过返回值原地修改；如果以后加入 `Body []byte`、map、指针或嵌套切片，仅复制外层 `[]Message` 不够，还须明确逐层所有权或深复制规则。01.04–01.05 的别名与复制知识在并发环境中直接关系到是否把保护边界泄漏给调用者。

**不要把读锁“升级”为写锁。** 如果同一个 goroutine 已持有 `RLock`，又在未释放它时调用 `Lock`，写锁要等所有读者退出，而该读者又在等待写锁，就可能自己把自己卡住。若某操作需要“读当前状态再决定写”，应像 `Append` 那样从一开始就在写锁里做完整判断，或释放读锁后重新获取写锁并**重新检查条件**。第二种做法中间有时间窗，不能把旧检查结果直接用于写入。

`RWMutex` 不保证总比 `Mutex` 快：读锁管理也有成本，读操作很短、写入频繁或竞争模式不同都可能改变结果。先用清楚的状态不变量保证正确，再在后续真实性能工作中测量。它解决的是这份内存对象的并发访问，不能自动保证磁盘持久化、跨进程一致或消息先后顺序。

## 五、`WaitGroup` 和 `Once` 分别解决什么

05.01 的 `WaitGroup` 只计数等待：在启动前 `Add`，任务结束 `Done`，主管 `Wait`。它不能替代 `History.mu`：即使主管最后等到两个 `Append` 都结束，两个任务执行**过程中**仍可能同时读写 map。也不能用 `Mutex` 替代 `WaitGroup`：锁释放只说明这一小段临界区空闲，不说明所有任务的函数都结束或错误已被收集。

| 工具 | 回答的问题 | 本题例子 | 它不自动完成的事 |
|---|---|---|---|
| `Mutex` | 同一时刻谁能进入临界区？ | 保护“查重→写入→追加” | 等完整批任务结束 |
| `RWMutex` | 多个只读者能否共享读访问？ | `List` 快照与 `Append` 独占 | 让返回的可变对象天然安全 |
| `WaitGroup` | 已登记的任务是否都结束？ | 等两次 `Append` 返回 | 保护 map 或传播 `error` |
| `Once` | 一次初始化函数是否只执行一次？ | 加载进程内固定配置 | 自动重试一次失败的初始化 |

`sync.Once` 的 `Do(f)` 使多个调用者中只有一次执行 `f`，其余调用等待相应完成。它适合**确实只应初始化一次**的不可变进程内资源。如果 `f` 因文件或网络暂时失败，`Once` 仍不会自行再执行 `f`；要么把结果和错误一起保存并承诺“失败被缓存”，要么另选允许重试的初始化设计。不能把“Once 保证只运行一次”误讲成“Once 保证初始化成功”。

初始化对象与会话消息也不同。每个新的 `c-a` 消息都要走 `Append` 的去重与写入，不能给整个消息保存函数加 `Once`，否则只有第一条被尝试；同样，`WaitGroup.Wait` 不会在首个错误出现时取消其他 goroutine，错误处理另在 05.01 和 05.03 衔接。

## 六、`Cond`：等条件成立，不在锁上忙转

这一节作为第二遍阅读。假设有一个**有限教学队列**，消费者要等队列从空变成非空。不断写 `for len(queue)==0 {}` 是忙轮询，会无谓使用 CPU，还可能在无同步保护时读到竞态状态。`sync.Cond` 让消费者在持有关联锁检查条件后，暂时释放锁并等待通知。

```go
// 教学片段：q.cond = sync.NewCond(&q.mu)，items 由同一 mu 保护。
func (q *Queue) Pop() Message {
	q.mu.Lock()
	for len(q.items) == 0 {
		q.cond.Wait() // 等待时释放 q.mu；返回前重新持有 q.mu。
	}
	m := q.items[0]
	q.items = q.items[1:]
	q.mu.Unlock()
	return m
}

func (q *Queue) Push(m Message) {
	q.mu.Lock()
	q.items = append(q.items, m)
	q.cond.Signal()
	q.mu.Unlock()
}
```

这不是独立可编译的完整队列：`Queue` 及其关联锁/条件变量须由构造过程定义，还没有容量上限、关闭标志或取消路径。它只演示**检查条件、等待、唤醒、重新检查**的机制。`Wait` 会原子地释放关联锁并让当前 goroutine 等待，被通知后在返回前再次取得锁。即使收到了 `Signal`，条件也可能已被另一消费者先取走，所以用 `for` 再检查，而不是用 `if` 假定“被叫醒就一定有消息”。

`Signal` 通知一个等待者，`Broadcast` 通知所有等待者；被通知不等于它们同时拿到锁，也不等于每人都有一个消息可取。若生产者永远不来，上例 `Pop` 可能一直等待，不能直接作为真实 IM 服务的关闭方案。05.03 将用 channel、`context` 和截止时间讨论任务怎样退出；05.08 才给队列容量和过载策略。本章选 `Cond` 是为了看懂“等待一个由锁保护的条件”的底层思想，不要求初学者在每个任务里优先使用它。

## 七、死锁、业务竞争与验证证据

**死锁**是任务相互等待、无人能推进的一类情况。比如 T1 先持有锁 A 再等锁 B，T2 先持有锁 B 再等锁 A，形成环；或者同一 goroutine 持有不可重入的 `Mutex`，又尝试再次取得它，自己等自己。一次 `Lock` 后经错误分支直接 `return` 却忘 `Unlock`，以后其他任务也可能永远等在这把锁前。

```text
T1：持有 A ──等待 B
                 ↑    │
T2：持有 B ──等待 A
```

可从**锁顺序**减少这类循环：若确需多把锁，所有路径都按统一顺序获取，并尽量避免在锁内请求网络、磁盘或其他可能长期等待的资源。锁区要“尽量短”但**不能短到拆开完整不变量**：`Append` 的查重、map 写和列表追加就必须同锁完成。若一个锁保护范围越来越大、跨不同变化原因，可在清楚业务不变量后重新划分状态所有权，而非机械增加锁数。

测试与工具证据也要分层。两条任务同时同 ID 的结果矩阵应来自需求：**一条成功、一条 `ErrDuplicate`、`List` 恰一项、先成功者正文未被覆盖**。在学习者自己的隔离实现中，Go race detector 可帮助发现**实际执行到**的数据竞争路径，但“本轮未报告竞态”不能证明所有交错都被覆盖；它也不能单独判断 `order` 是否重复或业务授权是否正确。反过来，所有 map 访问都加锁，不代表“查重再写”就满足原子业务规则。

| 场景 | 应核对的前后状态 | 单靠什么还不够 |
|---|---|---|
| 两任务同 ID | 一个成功、一个拒绝，旧值不覆盖 | `WaitGroup` 全部完成 |
| 一次 `List` 与 `Append` 相遇 | 快照要么在该次追加前、要么在追加后，不出现半份 map/order | 返回一份共享的内部切片 |
| 只读多、写很少 | 正确性先成立，再比较 `Mutex/RWMutex` 成本 | 假设读锁一定更快 |
| 一个消费者停不下来 | 观察条件、通知与退出规则 | 不断增加 `Signal` |

## 八、分层练习：从交错表走向业务取舍

先在纸上推演第一节 T1/T2 的交错，再用第三节代码标出每一次 Lock、RLock 与解锁位置。学习者以后在自己的隔离目录实现和运行时，应分别保存：理论预期、代码版本、实际测试结果、race detector 观察到的范围、还未覆盖的调度和业务变式。本轮只写静态课程，不运行任何 Go 代码或 IM 服务。

### 先答题，再看反馈

<details><summary>1. 什么叫共享可变状态？</summary>

多个任务能访问同一份数据，且至少一个任务会修改它，例如本题的 `byID` 与 `order`。</details>

<details><summary>2. 本题的业务不变量有哪些？</summary>

同会话 ID 唯一、重复不覆盖，以及列表每个 ID 对应 map 中一条消息。</details>

<details><summary>3. 普通 map 可无保护地由多个 goroutine 并发读写吗？</summary>

不能。需互斥或其他明确协调方式。</details>

<details><summary>4. 只给 `byID[m.ID]=m` 这一行加锁够吗？</summary>

不够。查重与 `order` 更新也属于同一次状态变化。</details>

<details><summary>5. 两个任务都先看到 `m-a` 不存在，可能怎样？</summary>

它们随后都尝试写入，导致覆盖或重复列表项；这是一条业务竞争交错。</details>

<details><summary>6. 先读锁查重、释放后取写锁插入是否消除间隙？</summary>

没有。中间另一任务仍可插入；取写锁后必须重新检查，或从开始就用同一写锁。</details>

<details><summary>7. `Mutex` 的零值能用吗？</summary>

能。`History` 的锁不需额外初始化。</details>

<details><summary>8. 已使用的含 Mutex 结构体适合按值复制吗？</summary>

不适合。锁与被保护状态应保持同一对象归属。</details>

<details><summary>9. T1、T2 同时 Append 同一 ID，必然 T1 赢吗？</summary>

不必然。谁先获得写锁不由源码中给任务命名的顺序保证。</details>

<details><summary>10. 重复 ID 被拒后 map 与 order 应怎样？</summary>

都保持先前值；不覆盖，也不追加第二个同 ID。</details>

<details><summary>11. `List` 为什么在锁内创建新切片？</summary>

避免返回正在被内部更新的切片，并得到一份一致的列表快照。</details>

<details><summary>12. 若 Message 加入 `Body []byte`，复制外层切片就足够吗？</summary>

不够。字节切片底层数据可共享，需重新定义所有权并按需逐层复制。</details>

<details><summary>13. `RLock` 允许多个只读者时，写者可同时修改 map 吗？</summary>

不能。`Lock` 需要独占，且所有访问必须遵守同一锁合同。</details>

<details><summary>14. 持有 `RLock` 时可直接调用 `Lock` 升级吗？</summary>

不应这样做；可能自己等待自己。需要写锁的完整操作应重新设计并复查条件。</details>

<details><summary>15. `RWMutex` 必然比 `Mutex` 快吗？</summary>

不必然。正确性先行，具体开销须在真实负载下测量。</details>

<details><summary>16. `WaitGroup.Wait` 返回能证明共享 map 没有竞争吗？</summary>

不能。它只等待登记任务结束，不保护执行中的共享访问。</details>

<details><summary>17. `Once.Do` 里的初始化失败会自动重试吗？</summary>

不会。是否缓存失败或允许重试需要另立设计。</details>

<details><summary>18. `Cond.Wait` 等待时一直持有关联锁吗？</summary>

不是。它在等待时释放锁，返回前重新获得锁。</details>

<details><summary>19. Cond 被 Signal 唤醒后为何仍用 `for` 检查队列？</summary>

其他消费者可能先取走了条件对应的消息，唤醒不保证条件仍为真。</details>

<details><summary>20. T1 持 A 等 B、T2 持 B 等 A 属于什么？</summary>

循环等待，可能死锁；统一锁顺序可减少此类设计。</details>

<details><summary>21. race detector 无报告就证明业务唯一性正确吗？</summary>

不能。它只覆盖执行过的数据竞争路径，业务交错和不变量需独立断言。</details>

<details><summary>22. `Append` 返回成功就证明 `m-a` 已送达 `u-b` 吗？</summary>

不能。本章只保存教学内存状态，网络、持久化和设备确认均未验证。</details>

## 来源与下一步

- [Go `sync` 包](https://pkg.go.dev/sync)：`Mutex`、`RWMutex`、`WaitGroup`、`Once`、`Cond` 的官方语义。
- [Go maps 官方说明](https://go.dev/blog/maps)与[Go 内存模型](https://go.dev/ref/mem)：共享 map 与同步关系的进一步阅读。
- [Go race detector 文档](https://go.dev/doc/articles/race_detector)：后续个人并发验证的工具与覆盖边界。

下一章 05.03 将用 channel 与 `context` 处理停止信号、队列和超时；进入前应能独立画出两条同 ID `Append` 的交错，并说明为何一把锁要覆盖查重、map 写和列表追加。
