---
title: A06 结构体、指针与方法：描述业务对象
icon: /assets/icons/article.svg
order: 6
date: 2026-09-22
---

先修：[A04 函数与传值](./04_functions.md)、[A05 集合与共享](./05_collections.md)。

## 小需求：让用户身份和积分一起出现

只用两个不相关变量保存用户 ID 和积分，容易把某人的 ID 与另一人的余额拼错。结构体把相关字段组织成一种类型，方法把适用于它的操作放在一起。

## 定义结构体并创建值

```go
type Account struct {
    UserID  string
    Balance int
}
```

type 定义一个类型名，struct 表示结构体。字段是对象中的数据项；每个字段都有名称和类型。

```go
account := Account{UserID: "u1", Balance: 10}
fmt.Println(account.UserID, account.Balance)
account.Balance += 5
```

点号访问字段。未指定的字段使用零值，`Account{}` 中 UserID 是空字符串、Balance 是 0。

结构体的字段顺序不应靠读者记忆，教学示例优先使用字段名初始化，修改结构时更容易看出含义。

## 值副本为何不会写回原对象

```go
original := Account{UserID: "u1", Balance: 10}
copy := original
copy.Balance = 30
fmt.Println(original.Balance) // 10
```

这里字段只有字符串和整数，赋值后修改副本的 Balance 不影响原值。若增加 `Tags map[string]string`，则 map 字段的副本仍可能共享映射，必须延续 A05 的分析。

函数接收 Account 参数时也会得到值副本。若要修改调用者持有的同一个对象，就需要另一种访问方式。

## 指针：保存对象地址的值

`&account` 取得 account 的地址；`*Account` 是指向 Account 的指针类型。指针变量保存的是访问对象的位置，不是另一个完整的账户。

```go
account := Account{UserID: "u1", Balance: 10}
pointer := &account
pointer.Balance = 30
fmt.Println(account.Balance) // 30
```

在字段访问处，Go 允许用 pointer.Balance 简化 `(*pointer).Balance`。单独的 `*pointer` 表示通过指针取得所指对象；同一符号在类型位置与表达式位置含义不同。

```go
func addTen(account *Account) {
    account.Balance += 10
}
```

调用 `addTen(&account)` 时，地址值被复制给参数。两边的指针都能找到同一个账户，所以更新能被调用者观察到。

### nil 指针

`var pointer *Account` 的零值是 nil，表示没有指向一个有效账户对象。直接访问其字段会产生运行时失败；要先保证对象存在。

指针并不代表并发安全，也不自动延长业务的有效期。Go 负责正常内存管理，业务仍需定义何时允许访问和修改状态。

## 方法：与类型关联的函数

```go
func (a *Account) Add(amount int) {
    a.Balance += amount
}
```

函数名前增加的 `(a *Account)` 称为接收者。它说明这个操作关联 Account，通过指针访问对象。调用写成 `account.Add(10)`。

方法与普通函数都由代码实现逻辑。区别在于调用方式和类型关联，并不是方法天然比函数安全。

值接收者 `(a Account)` 得到副本；指针接收者 `(a *Account)` 可以修改原对象。选择还要考虑是否包含可共享字段、对象复制成本和接口使用，A07 会继续介绍接口。

## 完整程序：预测哪次修改会保留

保存为 a06/main.go：

```go
package main

import "fmt"

type Account struct {
    UserID  string
    Balance int
}

func (a Account) AddToCopy(amount int) {
    a.Balance += amount
}

func (a *Account) Add(amount int) {
    a.Balance += amount
}

func main() {
    account := Account{UserID: "u1", Balance: 10}
    account.AddToCopy(5)
    fmt.Println(account.Balance)
    account.Add(5)
    fmt.Println(account.Balance)
}
```

从根目录 `go run ./a06`，预期先输出 10，再输出 15。先在纸上区分副本和同一对象，再核对结果。

## 封装为什么有用

如果任何调用方都能直接给 Balance 赋任意值，规则很难集中管理。可以把字段改为小写 balance，对包外隐藏，并通过 Balance()、Credit() 等方法提供读取和受检查的修改。

大写标识符可以从其他包访问，小写通常限制在本包内。A08 会解释包边界；在同一个 main 包里改成小写，仍不能防止同包其他代码访问它。

封装让规则有统一入口。它与权限校验、并发控制和持久化是不同保证，后面分别学习。

## 独立练习

1. 定义 Task，包含 ID、Title 和 Done，创建两个不同任务。
2. 为 Task 写一个指针接收者方法 MarkDone，调用后检查原任务。
3. 把任务放进 `[]Task`，用下标修改其中一个，再观察其他任务。
4. 给结构体增加 map 字段，分别改变副本的整数和 map 内容，解释差异。

<details>
<summary>反馈</summary>

方法通过指针更新同一个对象。range 取得结构体元素值时会复制；若只是给循环变量的 Done 赋值，原切片元素未必更新，应明确通过索引或对象指针修改。

指针值也遵循传值，关键是副本指针与原指针指向同一个对象。

</details>

下一课：[A07 接口、错误与 defer](./07_interfaces_errors.md)。
