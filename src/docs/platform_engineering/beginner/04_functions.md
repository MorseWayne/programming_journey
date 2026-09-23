---
title: A04 函数与参数：拆分可以解释的工作步骤
icon: /assets/icons/article.svg
order: 4
date: 2026-09-22
---

先修：[A03 条件、循环与作用域](./03_control_flow.md)。

## 小需求：多处使用同一套积分规则

如果三个位置都需要“按分数计算奖励”，复制三次 if 会让修改容易遗漏。函数把一组相关步骤命名，说明它需要的输入和产出的结果。

**定义函数**是写下步骤；**调用函数**是让这些步骤实际执行。只定义而没有调用，不会自动产生计算结果。

## 读懂一个函数声明

```go
func rewardFor(score int) int {
    if score >= 90 {
        return 20
    }
    if score >= 60 {
        return 10
    }
    return 0
}
```

func 后是函数名。括号中的 `score int` 声明参数名与参数类型；括号外的 int 声明返回值类型。函数体用花括号包围，return 将结果交回调用位置并结束本次调用。

调用 `rewardFor(95)` 时，95 是传入的实参，函数内部用形参 score 访问它。结果 20 可以赋给变量，再用于计算或输出。

return 后面的同一路径不会继续执行。因此上面的两个 if 可以逐步排除情况，不要求都写成 else if。

## 完整程序：看控制流怎样来回

保存为 a04/main.go，在 go-course 根目录运行 `go run ./a04`：

```go
package main

import "fmt"

func rewardFor(score int) int {
    if score >= 90 {
        return 20
    }
    if score >= 60 {
        return 10
    }
    return 0
}

func main() {
    balance := 5
    reward := rewardFor(95)
    balance += reward
    fmt.Println(reward, balance)
}
```

预期输出 `20 25`。执行从 main 开始，调用 rewardFor 时进入该函数，遇到 return 后回到 main 中调用位置，随后继续更新 balance。

把函数写在 main 前面或后面不决定执行顺序，实际调用关系才决定什么时候执行。

## 参数传递的是值

```go
func addTen(balance int) {
    balance += 10
}
```

调用 addTen(x) 会把 x 的整数值交给参数 balance。函数中修改 balance 不会自动修改调用者的 x。若要得到新值，可以返回它：

```go
func addTen(balance int) int {
    return balance + 10
}
```

调用者写 `x = addTen(x)` 才更新自己的变量。A06 将介绍如何通过指针操作同一个对象；A05 会说明切片和 map 的值为什么可能访问共享数据。

## 多个返回值与失败提示

```go
func checkedReward(score int) (int, bool) {
    if score < 0 || score > 100 {
        return 0, false
    }
    return rewardFor(score), true
}
```

括号中的两个类型说明会同时返回奖励和是否合法：

```go
// 片段：放在 main 内，使用上面的两个函数。
reward, ok := checkedReward(101)
fmt.Println(reward, ok) // 0 false
```

bool 只能表达简单的是否成功，无法说明具体原因。A07 会介绍 error，让调用者获得明确失败信息。下划线 `_` 可以接收并丢弃不需要的结果，但不能为了省事忽略需要处理的失败。

## 函数也有类型

`func(int) int` 表示接收一个 int 并返回一个 int 的函数类型。函数可以被赋给变量或作为参数传递。

```go
func apply(score int, calculate func(int) int) int {
    return calculate(score)
}
```

调用 `apply(95, rewardFor)` 时，传递的是函数本身，没有立即调用 rewardFor；apply 内部通过 calculate(score) 调用它。这是之后 HTTP 处理函数与工作池“传入一个处理步骤”的基础。

也可写不带名称的函数字面量：

```go
// 片段：放在 main 内。
double := func(n int) int { return n * 2 }
fmt.Println(double(3)) // 6
```

某个函数值可以引用外层变量，这种关联称为闭包。被引用的变量可能继续变化，进入并发前必须检查共享关系。

## 局部数据与外部效果

只依赖输入计算输出的函数，较容易预测与测试。直接打印、修改共享对象或写文件，会引入外部可观察效果。

可以让 rewardFor 专心计算，main 负责输入与显示。这样以后改成 HTTP 接口时，积分规则仍可复用，不需要同时重写输出格式。

这不是要求所有函数都没有效果，而是让效果集中在可以解释的边界。

## 练习与参考

1. 给 checkedReward 增加 -1、0、59、60、90、100、101 七组预测。
2. 写一个接收余额和增量、返回新余额的函数，在调用者更新变量。
3. 写一个返回“是否合格”和“奖励数量”的函数，说明返回顺序如何与声明对应。
4. 用 apply 传入另一个函数，让所有合法分数都返回固定奖励，观察规则如何替换。

<details>
<summary>参考解释</summary>

边界 -1 和 101 非法；0 到 100 合法，合法不代表一定有奖励。函数返回 0 与函数失败是不同状态，第二个返回值用于区分。

整数值参数相互独立，修改参数不会影响调用者。后面接收切片、map 或指针时，仍然传值，但这个值可能指向共享数据。

</details>

下一课：[A05 数组、切片、map 与文本](./05_collections.md)。
