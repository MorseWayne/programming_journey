---
title: A07 接口、错误与 defer：表达能力和失败
icon: /assets/icons/article.svg
order: 7
date: 2026-09-22
---

先修：[A04 函数与返回值](./04_functions.md)、[A06 类型与方法](./06_structs_pointers.md)。

## 小需求：给调用者明确的结果与原因

积分计算可能收到非法分数。只返回 0，调用者无法区分“合法但没有奖励”和“输入不合法”。另外，不同对象可能都能提供名字，我们希望用相同方式读取它们。

接口描述一种能力，error 是 Go 使用接口表达失败的常见例子。本课把它们联系起来，再学习函数退出前的清理。

## 接口先描述“可以做什么”

```go
type Named interface {
    Name() string
}
```

Named 要求值能够提供一个不接收额外参数、返回字符串的 Name 方法。它没有指定对象必须有哪些字段。

```go
type Task struct {
    Title string
}

func (t Task) Name() string {
    return t.Title
}

func showName(value Named) {
    fmt.Println(value.Name())
}
```

Task 提供了所需方法，就满足 Named，无需额外写 implements。调用 `showName(Task{Title: "学习错误处理"})` 时，showName 通过接口约定使用具体对象的能力。

这些片段放在 main 函数外，调用放在 main 内，并引入 fmt。接口不是自动创建另一种对象，而是让调用方依据约定使用已有值。

### 指针方法与接口

若 Name 只定义在 `*Task` 上，通常需要将 Task 的指针交给 Named。`Task` 与 `*Task` 可用的方法集合不同；不要因为普通调用语法有时能自动取地址，就认为两者在接口赋值时总能互换。

空接口 `any` 可以容纳任意类型，但不会自动告诉调用者其中数据是否合法。B03 解码 JSON 时会优先使用明确结构体，减少这种不确定性。

## error 是怎样一种接口

内置 error 约定了一个 `Error() string` 方法，用于提供错误说明。`errors.New("原因")` 可以创建满足该接口的错误值。

常见返回形式是 `(结果, error)`：error 为 nil 时表示没有报告错误；非 nil 时调用者应按契约处理失败。

```go
func rewardFor(score int) (int, error) {
    if score < 0 || score > 100 {
        return 0, errors.New("score must be between 0 and 100")
    }
    if score >= 60 {
        return 10, nil
    }
    return 0, nil
}
```

合法 50 分返回 `(0, nil)`；非法 -1 返回 `(0, 非 nil 错误)`。第二个值使含义不再混淆。

## 完整程序：让调用者决定如何显示

保存为 a07/main.go：

```go
package main

import (
    "errors"
    "fmt"
)

func rewardFor(score int) (int, error) {
    if score < 0 || score > 100 {
        return 0, errors.New("score must be between 0 and 100")
    }
    if score >= 60 {
        return 10, nil
    }
    return 0, nil
}

func main() {
    reward, err := rewardFor(-1)
    if err != nil {
        fmt.Println("无法计算：", err)
        return
    }
    fmt.Println("奖励：", reward)
}
```

括号形式的 import 引入多个包。`go run ./a07` 预期进入错误分支，不会继续打印奖励。将参数改成 50，则进入成功路径，奖励为 0。

也会遇到 `if err := doSomething(); err != nil { ... }` 的写法。分号前先声明并计算，分号后判断；err 的作用域限于这个 if 及对应分支。

## 把文本解析成数字

A02 留下了字符串转整数的问题。strconv.Atoi 接受文本，返回整数与 error：

```go
// 片段：放在 main 内，在 import 中增加 strconv。
number, err := strconv.Atoi("10")
if err != nil {
    fmt.Println("不是合法整数：", err)
    return
}
fmt.Println(number + 1) // 11
```

将 "10" 换成 "ten" 会进入错误路径。解析与简单类型转换不同，因为文本可能根本没有合法的整数含义。

## 传递错误与识别错误

有些函数能直接处理失败，有些只能把它交给上层。增加上下文时可用 `fmt.Errorf("读取任务: %w", err)` 包装原错误；`%w` 保留错误关系，调用者可以用 `errors.Is` 判断链条中是否包含某个约定错误。

```go
// 片段：在包级定义一个共享的错误值。
var ErrInvalid = errors.New("invalid reward")
```

函数返回这个相同的值，或包装它，调用者才能针对它进行稳定判断。分别调用两次 errors.New，即使文本相同，也不应当作同一个错误身份。

错误文本适合说明原因；业务处理不要依赖随时可能变化的完整文案。

## defer：离开函数前执行

```go
func explainOrder() {
    defer fmt.Println("最后执行")
    fmt.Println("先执行")
}
```

defer 登记一个延后调用，在当前函数返回前执行。它常用于释放文件、解锁或结束其他资源。

多个 defer 按后登记先执行的顺序运行。普通调用参数在执行 defer 语句时就会求值；并不是所有值都等到函数返回时才读取。

```go
// 片段：放在函数内。
n := 1
defer fmt.Println(n)
n = 2
// 函数返回时打印 1。
```

defer 绑定函数退出，不是每个循环结束。长循环里不断登记 defer，可能延迟释放大量资源；可把单次处理放进独立函数，或明确安排关闭。

## panic 与 recover 的第一层认识

panic 会中断当前正常控制流并展开调用栈，例如某些越界或 nil 指针访问。通常仍会执行对应的 defer。recover 只有在合适的延后调用中才能处理当前 goroutine 的 panic。

普通非法输入、文件不存在和远程请求失败通常用 error 表达。不要把所有错误变成 panic，也不要无条件 recover 后假装业务成功。课程后面的例子会优先保留明确错误路径。

<details>
<summary>深化：接口里的 nil</summary>

一个接口值可以同时携带具体类型和具体值。把一个 nil 的具体指针放进接口后，接口本身可能不等于 nil。因此返回 error 时，要返回真正的 nil 来表达没有错误，不能想当然地返回一个值为 nil 的错误指针。

初学时先用 errors.New 与普通 nil，等遇到自定义指针错误类型再结合具体例子检查。

</details>

## 练习

给前面的 Named 增加另一个实现；为积分函数记录非法、合法零奖励和合法有奖励三条路径；用两个 defer 预测退出顺序。

本课通过标准是：能区分结果与失败，能追踪 error 的处理位置，知道 defer 何时执行。下一课：[A08 包与模块](./08_packages_modules.md)。
