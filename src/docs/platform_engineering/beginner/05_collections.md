---
title: A05 数组、切片、map 与文本：组织多份数据
icon: /assets/icons/article.svg
order: 5
date: 2026-09-22
---

先修：[A02 类型](./02_values_types.md)、[A04 参数与多返回值](./04_functions.md)。

## 小需求：列出任务并按用户 ID 查询积分

单个变量只能直接表达一份数据。多个任务适合按顺序保存，按用户 ID 查余额则适合键值对应。本课先学习这些结构的基本操作，再解释共享与边界。

## 数组：长度固定的一组同类型元素

```go
scores := [3]int{60, 80, 95}
fmt.Println(scores[0], len(scores)) // 60 3
```

`[3]int` 表示长度为 3 的整数数组，长度是类型的一部分。下标从 0 开始，最后一个合法下标是 len-1。访问 scores[3] 超过边界，会在运行时失败。

数组赋值会复制全部元素。元素本身若含指针等可共享信息，还需进一步分析，A06、C02 会接着讲。

## 切片：可变长度的数据视图

```go
scores := []int{60, 80, 95}
scores = append(scores, 100)
fmt.Println(len(scores), scores[3]) // 4 100
```

`[]int` 没有固定长度，是切片类型。切片描述底层数组中的一段数据；len 是当前元素数，cap 是从起点开始可用的容量。append 返回新的切片描述，通常应把返回值接住。

`make([]int, 3)` 创建长度为 3、元素初始为 0 的切片。`make([]int, 0, 4)` 创建长度为 0、预留容量为 4 的切片；容量不代表可以直接访问 scores[3]，索引仍受长度限制。

### 子切片与共享

```go
all := []int{10, 20, 30}
firstTwo := all[:2]
firstTwo[0] = 99
fmt.Println(all) // [99 20 30]
```

`[:2]` 选取下标 0 和 1，右边界不包含在内。这两个切片可以访问相同底层元素，所以修改会被彼此看见。

若需要独立的整数元素，可以创建新切片并复制：

```go
copied := make([]int, len(all))
copy(copied, all)
copied[0] = 1
fmt.Println(all[0]) // 99
```

copy 复制元素，不会自动递归复制元素里面的所有引用。C02 将从所有权角度解释复制到哪一层才足够。

### nil 与空切片

`var scores []int` 的零值是 nil，可理解为此时没有引用一个已建立的数据区域。nil 切片长度为 0，可以遍历和 append。空切片也可以长度为 0，但不一定为 nil。

先用 len 判断是否有元素；当接口、编码或资源语义确实区分 nil 与空集合时，再明确两者差别。

## range：按集合遍历

```go
scores := []int{60, 80, 95}
for index, score := range scores {
    fmt.Println(index, score)
}
```

range 对切片依次给出下标和元素值。不需要下标时写 `for _, score := range scores`。这里的 score 是取得的元素值；给整数 score 重新赋值不会修改原切片，应通过 scores[index] 修改。

## map：用键定位值

```go
balances := map[string]int{"u1": 10, "u2": 20}
balances["u3"] = 30
value, exists := balances["u1"]
fmt.Println(value, exists) // 10 true
```

map[string]int 表示键是字符串、值是整数。读取不存在的键得到值类型的零值；用第二个 bool 判断键究竟存在还是恰好保存了零。

`delete(balances, "u2")` 删除键。map 的遍历顺序没有保证，需要固定顺序时应另行排序；不要把一次输出碰巧有序当成语言保证。

`var balances map[string]int` 是 nil map，可读但不能直接写入；用 make 或字面量初始化后再赋值。map 赋值也不会复制全部条目，两个 map 值可能访问同一份映射。

## 完整程序：统计几个任务奖励

保存为 a05/main.go，从 go-course 根目录运行 `go run ./a05`：

```go
package main

import "fmt"

func main() {
    rewards := []int{10, 20, 5}
    total := 0
    for _, reward := range rewards {
        total += reward
    }
    balances := make(map[string]int)
    balances["u1"] = total
    value, exists := balances["u1"]
    fmt.Println(value, exists)
    missing, exists := balances["u2"]
    fmt.Println(missing, exists)
}
```

预期输出 `35 true` 与 `0 false`。用一次明确键读取避免依赖 map 的遍历顺序。

## 字符串：字节长度不等于字符数量

字符串保存字节序列，Go 源码里的中文文本通常用 UTF-8 表示，一个码点可能占多个字节。`len("Go学习")` 得到字节数 8；`[]rune("Go学习")` 包含四个码点。

```go
text := "Go学习"
fmt.Println(len(text), len([]rune(text))) // 8 4
for _, r := range text {
    fmt.Printf("%c ", r)
}
```

range 字符串按解码后的 rune 遍历。码点数量仍未必等于用户视觉上看到的字符数量，例如组合字符与某些表情可能由多个码点组成。

字符串不能按下标直接修改。需要修改时先明确按字节还是码点处理，再转换成相应切片。后续网络课程会把字节与传输联系起来。

## 独立练习

1. 给任务奖励增加第四项，说明为什么要接住 append 的返回值。
2. 在 map 中保存 u2=0，再对比 u2 与不存在的 u3，使用第二个返回值区分。
3. 把一个切片传给函数修改首元素，解释为何调用者也可能变化。
4. 将 all 复制后再改，画出两个切片分别访问哪份数组。

<details>
<summary>反馈</summary>

函数传入的是切片描述的副本，描述仍可能引用同一数组，所以“传值”不代表“底层数据独立”。append 是否重新分配与容量有关，不能靠偶然扩容保证隔离。

map 不存在与保存零值是两种业务状态。查询结果应根据需要同时检查 value 与 exists。

</details>

下一课：[A06 结构体、指针与方法](./06_structs_pointers.md)。
