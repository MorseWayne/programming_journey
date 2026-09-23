---
title: A03 条件与循环：让规则决定执行路径
icon: /assets/icons/article.svg
order: 3
date: 2026-09-22
---

先修：[A02 变量与布尔判断](./02_values_types.md)。

## 小需求：合法任务才增加积分

奖励必须为正数。上一课无条件相加，现在需要先判断；如果还要处理连续三次任务，就需要重复执行某些步骤。

条件语句决定走哪条路径，循环决定是否重复。它们不依赖数据库、网络或并发，是后续所有业务规则的基础。

## if、else if 与 else

```go
// 片段：放在 main 内。
reward := 10
if reward > 0 {
    fmt.Println("可以增加积分")
} else {
    fmt.Println("奖励必须为正数")
}
```

if 后面的表达式必须得到 bool。Go 不把整数 0 自动当作 false，也不允许直接写 `if reward`。花括号限定这条分支要执行的语句。

多个条件可用 else if 依次判断。一旦某条成立，执行它对应的部分，后续分支不会再执行。顺序因此影响规则：先判断“>=60”再判断“>=90”，90 分会先进入前一条。

### 先检查，再修改

把加分操作放进合法分支，非法路径只输出原因。若先更新 balance 再检查，就算打印“失败”，数据也已经变了。这是 C01 会继续形式化的失败承诺。

## for 循环的三个部分

```go
for i := 0; i < 3; i++ {
    fmt.Println("第", i+1, "次任务")
}
```

初始化 `i := 0` 只执行一次；每轮开始前检查 `i < 3`；执行循环体后运行 `i++`，然后再次检查。i++ 表示增加 1，是一条语句。

循环中的计数通常从 0 开始，显示给用户时可以加 1。使用 `< 3` 时执行 i 为 0、1、2 的三轮，改成 `<= 3` 就会执行四轮。

Go 也可以只写条件：

```go
remaining := 3
for remaining > 0 {
    fmt.Println(remaining)
    remaining--
}
```

如果忘了让条件最终变为 false，循环可能一直运行。无限循环可用在服务中，但需要退出机制，B07 再介绍取消。

## 一份完整程序

创建 a03/main.go，从 go-course 根目录执行 `go run ./a03`：

```go
package main

import "fmt"

func main() {
    balance := 0
    reward := 10
    for i := 0; i < 3; i++ {
        if reward <= 0 {
            fmt.Println("非法奖励")
            break
        }
        balance += reward
        fmt.Println("完成次数", i+1, "余额", balance)
    }
}
```

预期三行余额分别为 10、20、30。先在纸上按“检查条件—执行—更新计数”展开三轮，再运行核对。

## break 与 continue

break 退出最近一层循环；continue 跳过本轮剩下的循环体，转入下一轮。这两种操作都不会替你回滚之前做过的赋值。

```go
// 片段：只输出 1、3、5。
for n := 1; n <= 5; n++ {
    if n%2 == 0 {
        continue
    }
    fmt.Println(n)
}
```

`n%2 == 0` 判断偶数。continue 后仍会执行这类 for 的轮末更新 n++；不是直接重复同一个 n。

## switch 表达有限选择

```go
status := "done"
switch status {
case "new":
    fmt.Println("尚未开始")
case "done":
    fmt.Println("已经完成")
default:
    fmt.Println("未知状态")
}
```

switch 适合根据状态或类别选择行为。普通 case 执行完后自动结束这次 switch，不需要每个 case 都写 break。default 处理没有匹配任何 case 的情况。

## 作用域：名字在哪里可见

花括号通常形成新的代码块。块中声明的局部变量在块外不可见；内层再次声明同名变量还可能遮蔽外层变量。

```go
balance := 10
if true {
    balance := 20
    fmt.Println(balance) // 20，内层变量。
}
fmt.Println(balance) // 10，外层变量。
```

如果意图修改外层 balance，内层应使用 `balance = 20`。调试时应先分清访问的是哪一个变量。

## 独立练习

设计规则：分数至少 90 获得 20 积分，至少 60 获得 10，其余为 0；依次代入 59、60、89、90，写出分支预测。

再用循环计算 1 到 5 的总和，明确累加变量为什么应声明在循环外。最后把循环条件故意多放一轮，观察结果怎样偏离。

<details>
<summary>参考解释</summary>

先判断 90，再判断 60，避免较宽条件抢先匹配。累加变量放在循环外可以保留前几轮结果；若每轮重新声明为 0，就只保存当前一轮。

总和应为 15。边界输入能够检验条件里的大于与大于等于是否符合业务规则。

</details>

下一课把重复规则整理成可调用步骤：[A04 函数与参数](./04_functions.md)。
