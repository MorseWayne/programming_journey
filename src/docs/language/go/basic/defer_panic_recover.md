---
title: 多返回值、defer、panic 与 recover
icon: /assets/icons/article.svg
order: 2
category:
  - Go
date: 2026-09-08
---

> **本章解决什么：** 让函数把结果和失败原因交给调用方，并在函数结束时可靠地做清理。
>
> **读前准备：** 已读[包、变量与常量](./variable.md)，能运行一个 `main` 程序。下面先解释函数参数、返回和条件判断，再学习 `defer`；`panic`、`recover` 在此基础上继续展开，跨 goroutine 恢复和错误链可之后回看。

各代码块是独立示例。完整程序可直接运行；其余函数声明放在 `main` 外，调用片段放在函数内。用到哪个标准库包，就在文件开头导入它。

## 1. 多返回值

### 从一个返回值开始

函数把一段操作取名，调用时传入数据，完成后可返回结果。先看求和：

```go
func sum(a, b int) int {
    return a + b
}
```

`a, b int` 是两个整数参数，右括号后的 `int` 是结果类型。调用 `total := sum(2, 3)`，`total` 就是 `5`。`return` 会结束当前函数并交回结果；参数和结果的这组声明称为函数签名，描述了函数接收什么、返回什么。

### 为什么要同时返回结果和错误

除法可能因为除数为零而失败，单独返回 `0` 无法说明是“算出了零”还是“没算成功”。Go 用 `(int, error)` 同时表达结果与失败原因。`error` 暂时理解为错误信息：`nil` 代表没有错误，`fmt.Errorf` 创建一个错误。

下面是可以直接运行的完整程序：

```go
package main

import "fmt"

func divide(a, b int) (int, error) {
    if b == 0 {
        return 0, fmt.Errorf("除数不能为 0")
    }
    return a / b, nil
}

func main() {
    quotient, err := divide(10, 2)
    if err != nil {
        fmt.Println("计算失败：", err)
        return
    }
    fmt.Println(quotient) // 5
}
```

`if 条件 { ... }` 在条件为真时执行；`==` 判断相等，`!=` 判断不等。`quotient, err := ...` 按顺序接收两个结果。先处理 `err != nil`，再使用商；把调用改成 `divide(10, 0)` 就能观察失败路径。

这里 `main` 没有返回值，因此只写 `return` 结束它；在只返回一个 `error` 的函数中可以写 `return err`，返回 `(int, error)` 的函数则需要同时给出两个结果。另外，整数除法会截去小数部分：`divide(5, 2)` 得到 `2`。

Go 不支持函数重载或默认参数。刚开始写函数时，为每个清晰的任务写一个清晰的函数即可；可选配置等设计问题会在项目变大后再遇到。

### 常见用途

- **`(结果, error)`**：把正常结果与失败原因一起交给调用方。一般只有 `err == nil` 时才直接使用主结果。
- **`(值, ok)`**：`ok` 是布尔值，用来说明是否找到、是否成功；读到零值本身不足以判断。后面的 [map 课程](./map.md) 会用查成绩演示这种写法。
- **多个同等重要的结果**：如函数同时返回最小值和最大值。

`error` 是 Go 用来表达“这次操作没有成功”的标准结果；惯例是把它放在最后。`nil` 表示没有错误，非 `nil` 表示调用方需要决定如何处理，不能只依据主结果是否为零值判断成功与否。它的底层接口机制会在接口章节再展开。

### 实践要点

- 不要随意忽略 `error`：`file, _ := os.Open(path)` 会隐藏失败。
- `_` 表示丢弃值。可以丢弃确实不需要的主结果，但应有意识地处理错误。
- 返回值的名字不是调用方必须使用的名字；调用方可以选择有意义的变量名。

### 第二遍：错误链解决什么问题

当一个函数调用另一个函数时，上层往往要补充“做什么时失败”，同时保留原始原因。在一个返回 `error` 的函数里，可以写：

```go
return fmt.Errorf("打开配置文件 %q：%w", path, err)
```

该片段假定 `path` 是文件名、`err` 是已检查过的非空错误。`%q` 把文件名加引号显示，`%w` 保留原始错误，形成错误链。学习了文件操作后，可以导入 `errors` 和 `io/fs`，用 `errors.Is(err, fs.ErrNotExist)` 判断链中是否有“文件不存在”；`errors.As` 用于查找某种具体错误类型，留到错误处理专题展开。

---

## 2. `defer` 的准确执行语义

函数可能在多个位置提前 `return`。如果每条路径都手动清理资源，很容易漏掉一条；`defer` 让我们先登记收尾操作。

> `defer` 登记的调用会在**当前函数真正返回给调用方之前**执行。

先运行一个不涉及文件的例子：

```go
package main

import "fmt"

func greet() {
    defer fmt.Println("结束")
    fmt.Println("开始")
}

func main() {
    greet()
    fmt.Println("回到 main")
}
```

输出依次是 `开始`、`结束`、`回到 main`。`defer` 后面写的是函数调用：此处先登记，等 `greet` 结束时再执行。

### 返回值与匿名函数：理解前先补两个概念

`func f() (n int)` 给结果起了名字 `n`，它是初始为 `0` 的局部变量。`func() { ... }` 是没有名字的函数；后面的 `()` 表示调用它。写成 `defer func() { ... }()`，就是把这次调用推迟。

这个匿名函数可以访问外层的 `n`，这种携带外部变量的函数称为闭包。它是下面“返回前修改结果”和后面 `recover` 示例的共同前提。`n++` 表示把 `n` 加一。

对于 `return expr`，更精确的顺序是：

1. 先计算返回表达式；
2. 设置函数的返回结果（无论是否具名）；
3. 执行当前函数中的所有 `defer`；
4. 函数才真正返回。

```go
func f() (n int) {
    defer func() { n++ }()
    return 1
}

fmt.Println(f()) // 2
```

`return 1` 先让返回变量 `n` 为 `1`，延迟函数再把它加一，因此得到 `2`。若函数写成 `func f() int`，只是把普通局部变量 `n` 的值返回，延迟函数再修改那个局部变量不会改掉已确定的整数结果。具名返回值适合短小清晰的函数；复杂逻辑优先显式 `return result, err`。

### 多个 `defer` 的顺序

多个 `defer` 按**后进先出（LIFO）**执行；说“先进后出（FILO）”也是同一含义。

```go
defer fmt.Println("第一层")
defer fmt.Println("第二层")
defer fmt.Println("第三层")

// 输出：第三层、第二层、第一层
```

### 典型用途

以文件为例：文件打开后占用系统资源，使用完要关闭。导入 `os` 后，`os.Open(path)` 打开文件，`file.Close()` 关闭它。下面是返回 `error` 的函数内片段，`path` 是文件路径：

```go
file, err := os.Open(path)
if err != nil {
    return err
}
defer file.Close()
```

先检查错误，再登记关闭；打开失败时还没有成功取得资源。这样无论函数中间从哪个分支 `return`，都会尝试关闭文件。

学过并发后，这个规则也用于锁：锁让同时运行的任务轮流操作共享数据，`mu` 是已创建的锁。下面的片段可在并发课程之后回看：

```go
mu.Lock()
defer mu.Unlock()
```

---

## 3. `defer` 的常见坑

### 参数在登记 `defer` 时求值

```go
n := 1
defer fmt.Println(n)
n = 2
// 输出：1
```

把它与闭包读取变量的情形对照，差异就清楚了：

```go
func compareDefer() {
    n := 1
    defer fmt.Println(n)                 // 登记时保存 1
    defer func() { fmt.Println(n) }()    // 执行时读取 n
    n = 2
}
// 调用 compareDefer()：先输出 2，再输出 1（后登记的先执行）
```

### 它不是离开代码块时执行

`defer` 不会在离开 `if` 或一次循环迭代时自动运行，而是在所在的**函数**返回前运行。

因此不要在可能运行很多次的循环中直接延迟关闭资源：

下面假设 `paths` 是文件名列表（`[]string`）。`for _, path := range paths` 每次取一个文件名，`_` 忽略它的序号；列表本身会在下一篇切片课中展开。

```go
for _, path := range paths {
    file, err := os.Open(path)
    if err != nil {
        return err
    }
    defer file.Close() // 会一直积累到外层函数返回才关闭
}
```

更合适的做法是让每轮处理进入一个小函数，使资源及时释放：

```go
func processOne(path string) error {
    file, err := os.Open(path)
    if err != nil {
        return err
    }
    defer file.Close()

    // 处理文件
    return nil
}
```

### `Close()` 也可能返回错误

关闭也可能失败，例如压缩写入器关闭时可能需要写入尾部数据。普通文件的 `Close` 不等于保证落盘；`bufio.Writer` 的缓冲还需要单独 `Flush`。现在先掌握“关闭错误也是错误”。下面的文件写入函数使用 `[]byte` 表示待写的字节列表，等学过切片后再完整运行：

```go
func writeFile(path string, data []byte) (err error) {
    file, err := os.Create(path)
    if err != nil {
        return err
    }

    defer func() {
        closeErr := file.Close()
        if closeErr != nil && err == nil {
            err = closeErr
        }
    }()

    _, err = file.Write(data)
    return err
}
```

---

## 4. 第二遍：`panic` 时的 `defer`

当代码已经无法按正常步骤执行，例如访问不存在的数组元素，可能触发 `panic`。它会停止当前普通语句并逐层执行已登记的清理。先用单条执行流程理解下面的例子；Go 把这种可独立运行的执行流程叫 goroutine，多个流程同时运行的情况在后面单独说明。

发生 `panic` 后：

1. 当前函数后续普通代码不再执行；
2. 当前函数已登记的 `defer` 按 LIFO 执行；
3. 若没有处理 panic，则回到调用者并执行调用者的 `defer`；
4. 持续向上展开调用栈；
5. 若始终未恢复，程序输出 panic 信息与调用栈后退出。

```go
func run() {
    defer fmt.Println("③ 最后清理")
    defer fmt.Println("② 关闭文件")

    fmt.Println("① 开始任务")
    panic("解析器状态异常")

    // fmt.Println("不会执行") // panic 后面的普通语句不会运行
}

// 输出：
// ① 开始任务
// ② 关闭文件
// ③ 最后清理
// 随后程序因未处理的 panic 退出
```

因此，即使不使用 `recover`，`defer file.Close()` 仍有价值：它会在 panic 的栈展开过程中尝试释放已取得的资源。

---

## 5. 第二遍：`recover`：在边界处截获 panic

`recover()` 能截获正在传播的 panic，阻止它继续让程序崩溃。标准写法：

```go
func mayPanic() {
    defer func() {
        if r := recover(); r != nil {
            fmt.Println("已恢复：", r)
        }
    }()

    fmt.Println("准备 panic")
    panic("发生异常")

    // fmt.Println("不会执行") // recover 也不会让程序回到这里
}

func main() {
    mayPanic()
    fmt.Println("main 继续执行")
}
```

输出：

```text
准备 panic
已恢复：发生异常
main 继续执行
```

注意：`recover` **不会回到 `panic` 的下一行继续执行**。它会使包含该延迟函数的调用恢复为正常返回，然后由调用方继续。

### 严格限制

- `recover` 必须在发生 panic 的**同一个 goroutine** 中使用；
- 必须由延迟执行的函数**直接调用**，才可以真正恢复 panic；经由另一个普通函数间接调用时，`recover()` 返回 `nil`。

下面的 `recover` 虽然发生在延迟函数调用链里，却不是直接调用，因此不能恢复 panic。`any` 是可接收任意类型值的类型名，自 Go 1.18 可用；这里因为 panic 携带的值不限定类型才用它：

```go
func indirectRecover() any {
    return recover()
}

defer func() {
    fmt.Println(indirectRecover()) // nil，panic 继续传播
}()
```

扩展到并发时，`go func() { ... }()` 会启动另一条执行流程。外层 goroutine 无法捕获新 goroutine 的 panic。下面两段是并发片段；若把它们放到 `main`，还需等待子 goroutine 完成，否则 `main` 可能先退出，等待方式留到并发课程。

```go
defer func() { recover() }()

go func() {
    panic("goroutine 出错")
}()
```

正确做法是把恢复逻辑放入该 goroutine：

```go
go func() {
    defer func() {
        if r := recover(); r != nil {
            fmt.Println("goroutine 已恢复：", r)
        }
    }()

    panic("goroutine 出错")
}()
```

---

## 6. 第二遍：`error`、`panic` 与 `recover` 的分工

| 场景 | 更合适的方式 |
|---|---|
| 文件不存在、网络超时、输入不合法 | 返回 `error` |
| 下标越界、内部状态违例等程序缺陷 | `panic` |
| 服务/任务执行的最外层，避免一次异常拖垮整个进程 | 谨慎使用 `recover` |

`recover` 不是正常错误处理的替代品。可预期的失败应优先通过 `error` 显式返回。即使在服务入口处恢复了 panic，也应记录足够的上下文；不要在内部任意恢复后假定对象状态仍然可继续使用。

示例：在任务边界将 panic 转成 error：

```go
func safelyRun(task func()) (err error) {
    defer func() {
        if r := recover(); r != nil {
            err = fmt.Errorf("任务发生 panic：%v", r)
        }
    }()

    task()
    return nil
}
```

---

## 7. 第二遍：`os.Exit` 不执行 `defer`

```go
func main() {
    defer fmt.Println("清理资源")
    os.Exit(1)
}
```

没有任何输出。`os.Exit` 会立即终止整个进程，不会触发正常的函数返回，也不会运行 `defer`。

`log.Fatal(...)` 内部也会调用 `os.Exit(1)`，所以同样会跳过 `defer`。如果必须保证收尾逻辑，通常让内部函数返回 `error`，在最外层统一完成清理后再决定是否退出。

不要把它和 `runtime.Goexit` 混淆：`runtime.Goexit` 会终止**当前 goroutine**，但仍会执行该 goroutine 已登记的 `defer`。

---

## 一句话记忆

> 成功获取资源后立刻 `defer` 释放；`defer` 在函数返回前按 LIFO 执行，panic 时也会执行。`recover` 只在同一 goroutine 中、由延迟函数直接调用时生效，并应放在系统边界，而非常规错误处理流程中。

### 自测

`compareDefer()` 为什么先输出 `2` 再输出 `1`？如果把两个 `defer` 的登记顺序交换呢？

答案：闭包执行时读取 `n`，直接传参则在登记时保存 `n`。最后登记的先执行，所以交换登记顺序后输出变为 `1`、`2`，求值时机本身没有改变。

本文的延迟求值与恢复规则可对照 [Go 官方 defer 文章](https://go.dev/blog/defer-panic-and-recover)；关闭资源与写入落盘的区别参见 [`os.File.Close` / `Sync`](https://pkg.go.dev/os#File.Close) 和 [`bufio.Writer.Flush`](https://pkg.go.dev/bufio#Writer.Flush)。
