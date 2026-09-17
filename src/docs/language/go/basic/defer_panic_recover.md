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
> **读前准备：** 已会变量、`if` 条件和最小函数形式。首次阅读先掌握“函数返回 `(结果, error)`”与“拿到资源后马上 `defer` 释放”；`panic`、`recover` 和错误链属于第二阶段内容。

## 1. 多返回值

Go 函数可一次返回多个结果，常见形式包括：

```go
func divide(a, b int) (int, error) {
    if b == 0 {
        return 0, fmt.Errorf("除数不能为 0")
    }
    return a / b, nil
}
```

这里的 `if 条件 { ... }` 表示“条件为真时才执行花括号里的代码”；`==` 表示“是否相等”。`return` 会结束当前函数并把结果交给调用方。

函数签名依次写参数和结果类型；相邻且类型相同的参数可共用类型：

```go
func sum(a, b int) int {
    return a + b
}
```

Go 不支持函数重载或默认参数。刚开始写函数时，为每个清晰的任务写一个清晰的函数即可；可选配置等设计问题会在项目变大后再遇到。

调用方应先处理错误，再使用结果：

```go
quotient, err := divide(10, 0)
if err != nil {
    return fmt.Errorf("计算平均值：%w", err)
}
fmt.Println(quotient)
```

`!=` 表示“不等于”。先写 `if err != nil`，就是先处理失败分支；只有没有错误时才继续使用 `quotient`。

### 常见用途

- **`(结果, error)`**：把正常结果与失败原因一起交给调用方。一般只有 `err == nil` 时才直接使用主结果。
- **`(值, ok)`**：区分“值本身是零值”与“不存在/不匹配/通道已关闭”。例如：
  ```go
  score, ok := scores["张三"]
  v, ok := x.(string)
  v, ok := <-ch
  ```
- **多个同等重要的结果**：如函数同时返回最小值和最大值。

`error` 是 Go 用来表达“这次操作没有成功”的标准结果；惯例是把它放在最后。`nil` 表示没有错误，非 `nil` 表示调用方需要决定如何处理，不能只依据主结果是否为零值判断成功与否。它的底层接口机制会在接口章节再展开。

### 实践要点

- 不要随意忽略 `error`：`file, _ := os.Open(path)` 会隐藏失败。
- 给错误加上下文，并需要时用 `%w` 保留错误链：
  ```go
  return fmt.Errorf("打开配置文件 %q：%w", path, err)
  ```
- **第二遍：** 使用 `%w` 包装后，导入 `errors` 和 `io/fs`，用 `errors.Is` 或 `errors.As` 判断底层错误，而不是比较格式化后的错误文本：
  ```go
  if errors.Is(err, fs.ErrNotExist) {
      // 文件不存在的专门处理
  }
  ```
- 具名返回值适合短小、语义明确的函数；复杂函数尽量显式写 `return result, err`，避免裸 `return` 降低可读性。

---

## 2. `defer` 的准确执行语义

> `defer` 登记的调用会在**当前函数真正返回给调用方之前**执行。

对于 `return expr`，更精确的顺序是：

1. 先计算返回表达式；
2. 将结果赋给返回变量（若是具名返回值）；
3. 执行当前函数中的所有 `defer`；
4. 函数才真正返回。

```go
func f() (n int) {
    defer func() { n++ }()
    return 1
}

fmt.Println(f()) // 2
```

### 多个 `defer` 的顺序

多个 `defer` 按**后进先出（LIFO）**执行；说“先进后出（FILO）”也是同一含义。

```go
defer fmt.Println("第一层")
defer fmt.Println("第二层")
defer fmt.Println("第三层")

// 输出：第三层、第二层、第一层
```

### 典型用途

成功获取资源后，立即登记对应的释放操作：

```go
file, err := os.Open(path)
if err != nil {
    return err
}
defer file.Close()
```

这样无论函数中间从哪个分支 `return`，文件都会在函数退出前被关闭。锁也同理：

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

### 它不是离开代码块时执行

`defer` 不会在离开 `if` 或一次循环迭代时自动运行，而是在所在的**函数**返回前运行。

因此不要在可能运行很多次的循环中直接延迟关闭资源：

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

写文件、网络连接或压缩流中，`Close()` 可能负责刷新最后的缓冲数据。需要严格处理时，不能简单忽略关闭错误：

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

`panic` 表示当前 goroutine 的正常控制流被中断，例如下标越界，或代码主动调用 `panic(...)`。它可用于报告运行时错误和程序定义的严重违例，但不是可预期业务失败的常规表达方式。

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

    fmt.Println("不会执行")
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

    fmt.Println("不会执行")
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

下面的 `recover` 虽然发生在延迟函数调用链里，却不是直接调用，因此不能恢复 panic：

```go
func indirectRecover() any {
    return recover()
}

defer func() {
    fmt.Println(indirectRecover()) // nil，panic 继续传播
}()
```

错误示例：外层 goroutine 无法捕获新 goroutine 的 panic。

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
