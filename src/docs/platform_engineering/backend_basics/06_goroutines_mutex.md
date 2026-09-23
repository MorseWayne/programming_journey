---
title: B06 goroutine、等待与互斥：认识并发执行
icon: /assets/icons/article.svg
order: 6
date: 2026-09-22
---

先修：[A04 函数值](../beginner/04_functions.md)、[A06 指针与共享对象](../beginner/06_structs_pointers.md)、[A07 defer](../beginner/07_interfaces_errors.md)、[B01 进程](../00_system_model.md)。

## 小需求：几个任务可以同时推进

一个任务在等待时，另一个任务可能还有事可做。并发允许多个执行过程的时间交叠；并行表示它们在某一时刻真正同时使用执行资源。

Go 用 goroutine 表达由运行时调度的执行单元。`go` 加一个函数调用，会启动一个新的 goroutine；调用方可以继续向下执行。

## 为什么不能用输出顺序猜调度

```go
// 片段：放在 main 内。
go fmt.Println("任务 A")
fmt.Println("主流程")
```

两行的执行时间关系不由书写顺序完全决定。更重要的是，main 返回后程序结束，不会自动等待其他 goroutine。任务 A 甚至可能来不及输出。

调用函数、启动 goroutine 和等待完成是不同动作。随意 sleep 一段时间只是猜测，不构成可靠的完成协议。

## WaitGroup：明确等待哪些工作

sync.WaitGroup 记录一组待完成工作。Add 增加计数，Done 减少，Wait 等待计数归零。应先登记，再启动工作，避免等待方在工作登记前就误以为完成。

保存为 b06/main.go：

```go
package main

import (
    "fmt"
    "sync"
)

func main() {
    var workers sync.WaitGroup
    for id := 1; id <= 3; id++ {
        workers.Add(1)
        go func(taskID int) {
            defer workers.Done()
            fmt.Println("完成任务", taskID)
        }(id)
    }
    workers.Wait()
    fmt.Println("全部完成")
}
```

`func(taskID int){...}(id)` 定义并调用一个函数值，id 在这里作为参数传入，便于明确每个工作自己的任务编号。defer 确保这个函数正常退出时报告 Done。

从 go-course 根目录执行 `go run ./b06`，预期三个任务都出现，但顺序不固定；“全部完成”出现在等待的工作结束之后。

WaitGroup 不负责限制并发数量，也不会自动收集业务错误。后续工作池需要额外机制。

## 共享数据怎样产生问题

若多个 goroutine 都执行 `total += amount`，这条语句包含读取旧值、计算和写回。多个执行者可能互相覆盖，且未经同步的读写可能构成数据竞争。

```text
A 读取 0 → B 读取 0 → A 写回 10 → B 写回 10
```

两个操作都想加 10，结果却可能只有 10。这条时间线用于说明逻辑；真实的未同步程序还可能出现更多行为，不能只认为它总会丢一次更新。

map 同样不能在没有相应同步的情况下任意并发读写。把共享变量换成 map 并不会解决并发问题。

## Mutex：保护一个完整临界区

sync.Mutex 是互斥锁。遵守同一把锁的执行者在同一时刻只有一个能进入受保护区间，其他执行者等待。

```go
mutex.Lock()
total += amount
mutex.Unlock()
```

被保护的代码称为临界区。Lock 与 Unlock 还建立相关内存可见性关系，不能用“我觉得对方应该已经执行完”代替同步。

重要的是完整动作。如果读取与写回分别加锁，但计算夹在两次锁之间，仍可能出现先前的交错。C02 会继续用不变量推导保护范围。

## 完整的并发累加

用下面版本替换 b06/main.go：

```go
package main

import (
    "fmt"
    "sync"
)

func main() {
    total := 0
    var mutex sync.Mutex
    var workers sync.WaitGroup
    for amount := 1; amount <= 5; amount++ {
        workers.Add(1)
        go func(value int) {
            defer workers.Done()
            mutex.Lock()
            total += value
            mutex.Unlock()
        }(amount)
    }
    workers.Wait()
    fmt.Println(total)
}
```

预期结果为 15。各次相加顺序可以变化，但完整受保护的增量最终累积；最后读取发生在 Wait 之后，不与尚未完成的写入交叠。

锁只协调遵守它的访问路径。另一个读函数若绕过锁并与写入同时执行，保证仍可能被破坏。

## 什么时候用 defer 解锁

有多个返回路径时，成功 Lock 后立即 `defer mutex.Unlock()` 能减少遗漏。defer 在函数退出时才运行，因此长循环里每轮都 defer 同一把锁，可能让下一轮等待自己尚未释放的锁。

可以把一次受保护操作放进独立函数，或在清晰的短临界区末尾立即 Unlock。持有锁时做慢网络请求会扩大等待，需要结合业务边界判断。

含有已经使用过的 Mutex 的对象不要随意复制。复制后可能有两把不同的锁，却仍访问共享引用数据。

## 死锁、竞态与检测

死锁是相互等待导致无法继续的情况，例如同一个执行者再次 Lock 自己尚未解开的普通 Mutex，或两者按相反顺序持有两把锁。

`go test -race` 可以在实际测试运行中检测某些未经同步的数据访问；它只覆盖已经执行到的路径，无法证明所有业务顺序都正确。配套测试的写法已在 A09 介绍。

同一个进程里的 Mutex 不能直接保护另一个进程的写入。数据库锁、事务和分布式协调在后面的 C 篇分别讨论。

### 另外两种常见工具

sync.Once 的 Do 用于让一段初始化等操作只执行一次；它不等于按不同业务 ID 去重。C03 的参考工作池用它保留首次处理错误。

sync/atomic 提供单个变量上的原子操作，例如 atomic.Int64 的 Add 与 Load。单次原子加法不自动保护“判断多个字段再一起修改”的业务不变量。

## 独立练习

增加任务数量，预测总和；在临界区里加入一个条件，说明判断与更新为什么要一起保护；画出两个账户转移时可能的锁顺序。

<details>
<summary>反馈</summary>

任务数增加不意味着 CPU 数增加。WaitGroup 解决等待，Mutex 解决共享访问，两者可以同时需要。对多项状态的规则，先定义必须一起保持的条件，再决定临界区。

</details>

下一课：[B07 channel、select 与 context](./07_channels_context.md)。
