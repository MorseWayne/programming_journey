---
title: B07 channel、select 与 context：通信、完成和取消
icon: /assets/icons/article.svg
order: 7
date: 2026-09-22
---

先修：[B06 goroutine 与等待](./06_goroutines_mutex.md)、[A07 接口与 defer](../beginner/07_interfaces_errors.md)、[A10 时间长度](../beginner/10_files_json.md)。

## 小需求：一个执行者产生结果，另一个等待结果

共享变量加锁是一种协作方式，channel 提供传递值与同步的另一种方式。任务可能不再需要结果时，还需要让参与者知道何时停止。

本课先学最小收发，再加入关闭、选择和取消。C03 的工作池会把这些知识组合起来。

## 创建、发送与接收

```go
results := make(chan int)
```

chan int 表示传递整数的 channel。`results <- 10` 发送一个值；`value := <-results` 接收一个值。箭头方向帮助判断数据从哪里流到哪里。

无缓冲 channel 需要发送和接收配对，发送方不能把值丢下就离开。若在同一个执行流程里先发送、后接收，可能停在发送处等不到自己的接收。

## 完整的最小通信

保存为 b07/main.go：

```go
package main

import "fmt"

func main() {
    results := make(chan int)
    go func() {
        results <- 10
    }()
    value := <-results
    fmt.Println(value)
}
```

学习时执行 `go run ./b07`，预期输出 10。main 在接收处等待，另一个 goroutine 发送；这次通信本身建立必要的协调，不依赖 sleep。

发送指针、切片或 map 时，传递的值仍可能引用共享数据。channel 不会自动复制所有底层对象，也不自动转移唯一修改权，C02 会讨论这种约定。

## 缓冲区与等待

`make(chan int, 2)` 最多暂存两个尚未被接收的值；缓冲满时发送等待，缓冲空时接收等待。

缓冲可以吸收短暂错位，不能保证永远不会阻塞。生产者持续比消费者快，有限缓冲迟早填满；C03 再推导排队和背压。

nil channel 的发送与接收不会正常就绪。如果忘记 make，相关代码可能一直等待。

## 关闭表示“不会再有新值”

发送方能够确定不再发送时，可以 close(channel)。接收方仍能读完已存在的缓冲，然后观察结束。

```go
// 片段：放在 main 内。
jobs := make(chan int, 2)
jobs <- 1
jobs <- 2
close(jobs)
for job := range jobs {
    fmt.Println(job)
}
```

预期依次输出 1、2，随后循环结束。channel 上的 range 与切片 range 不同，它持续等待值，直到通道关闭且已有值读完。

也可以 `value, ok := <-jobs`：ok 为 false 表示没有剩余值且已关闭，这时 value 是元素零值。

关闭后再发送、或重复关闭，会 panic。消费者通常不能因为自己不想读，就随意关闭其他生产者仍在发送的 channel；需要统一的完成或取消协议。

## select：等待多个通信条件

```go
select {
case value := <-results:
    fmt.Println(value)
case <-stop:
    fmt.Println("停止等待")
}
```

这是解释片段，results 与 stop 要由所在程序建立。select 在这些通信条件之间选择就绪分支；多个分支都就绪时，不应假定按代码顺序优先。

有 default 时，在没有通信就绪的情况下直接进入 default；没有 default 时则等待。无休止地循环执行带 default 的 select，可能变成占用 CPU 的忙循环。

## context：传递取消与截止时间

context.Context 是一个接口，提供取消信号、截止时间和相关访问方法。它不会强行终止 goroutine，而是让参与者按约定停止。

`context.Background()` 提供一个基础上下文。`context.WithCancel(parent)` 返回派生上下文和 cancel 函数；调用 cancel 后，派生上下文的 Done 通道关闭。

这个通道只需要表达一个信号，因此通常看到 `<-ctx.Done()` 而不保存某个业务值。`ctx.Err()` 提供取消或超时原因。

### 完整取消例子

用下面版本替换 b07/main.go：

```go
package main

import (
    "context"
    "fmt"
)

func waitUntilStopped(ctx context.Context) error {
    <-ctx.Done()
    return ctx.Err()
}

func main() {
    ctx, cancel := context.WithCancel(context.Background())
    cancel()
    fmt.Println(waitUntilStopped(ctx))
}
```

预期输出 `context canceled`。这里先取消再等待，目的是稳定展示已经关闭的信号可以被后来开始等待的函数观察到。

实际工作中，会由请求结束、上游失败或用户退出触发 cancel；任务的每个阻塞点都需要配合。

## 截止时间与资源释放

```go
// 片段：放在函数内，引入 context 与 time。
ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
defer cancel()
```

派生上下文最多等待约定的时间，超时后提供取消信号。提前完成时也应调用 cancel，让相关资源及时释放。

将 ctx 传给支持它的下游函数，才能传播意图。把 ctx 作为参数却从不检查、也不传给 I/O，并不会让阻塞自动结束。

取消还不会撤销已提交的文件写入或数据库更新。C08 会继续解释“停止等待”和“业务结果是否发生”的边界。

## 把取消放进发送与接收

```go
// 设计片段：queue、job 和 ctx 由所在函数提供。
select {
case queue <- job:
    // 已提交给队列。
case <-ctx.Done():
    return ctx.Err()
}
```

如果消费者已经退出，仅写 `queue <- job` 的生产者可能永远阻塞；把取消纳入同一个等待点，就能结束这次等待。但多个分支同时就绪时，仍不能宣称取消永远优先。

后续 B、C 篇代码里的 `<-chan` 表示只接收通道，`chan<-` 表示只发送通道，用类型表达函数允许的操作方向。

## 练习与验收

先用两个值验证缓冲与关闭，再去掉关闭，解释为什么 range 等待；画出一个接收方提前退出时，发送方可能阻塞的位置；给这个等待点加入取消分支。

<details>
<summary>反馈</summary>

close 表示发送结束，cancel 表示希望相关工作停止，两者职责不同。select 选择通信条件，context 组织取消关系。知道这些差别后，再把它们组合成工作池会更容易解释。

</details>

通过 [B 篇验收](./README.md)后进入 [C01：需求、状态与契约](../01_contracts.md)。
