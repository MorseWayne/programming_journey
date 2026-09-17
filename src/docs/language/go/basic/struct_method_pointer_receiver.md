---
title: 结构体、方法与指针接收者
icon: /assets/icons/article.svg
order: 5
category:
  - Go
date: 2026-09-16
---

> **本章解决什么：** 把一组相关数据组织成一个值，并让这个值拥有清晰的行为。
>
> **读前准备：** 已会变量、函数和 `map` 的基本读写。首次阅读先掌握结构体字段、值与指针、方法、以及值/指针接收者；方法集、业务建模、JSON 和并发是后续写程序时再回看的内容。

本章先沿着“一个用户有哪些数据 → 复制用户会怎样 → 如何修改原用户 → 把操作写成方法”展开。第 6 节的完整程序可直接运行；其他独立片段中，类型和方法声明放在 `main` 外，操作放在 `main` 内。打印需要导入 `fmt`；不同小节重新定义类型时，不要直接拼在同一个文件中。

## 1. 核心模型

- **结构体 `struct`**：定义一个实体由哪些固定字段组成。
- **方法 `method`**：定义该实体能做什么。
- **指针接收者 `*T`**：让方法可以修改原对象，并可避免复制较大的结构体。

```go
type User struct {
    ID    int64
    Name  string
    Email string
}
```

`type User struct { ... }` 定义一个名为 `User` 的新类型，尚未创建具体用户；里面的 `ID`、`Name`、`Email` 是字段名，右边是各自的数据类型。一个结构体可以组合不同类型的字段。`User` 将一个用户的固定属性组织为整体。

---

## 2. 创建和使用结构体

### 推荐：字段名初始化

```go
user := User{
    ID:    1001,
    Name:  "小李",
    Email: "xiaoli@example.com",
}
```

优点：字段含义清楚、不依赖字段声明顺序、将来新增字段时不易出错。

### 零值初始化

```go
var user User
// user.ID == 0
// user.Name == ""
```

### 访问与修改字段

用点号选中字段；这也是下一段比较复制前后变化的方法：

```go
fmt.Println(user.Name)
user.Name = "小王"
```

字段首字母大写表示可被其他包访问；小写字段仅当前包可访问。

<a id="第二遍-复制结构体时-字段按值复制"></a>

### 复制结构体时，字段按值复制

复制是理解接收者的前提，先看一个字段完全独立的例子：

```go
original := User{ID: 1001, Name: "小李"}
duplicate := original
duplicate.Name = "小王"

fmt.Println(original.Name) // 小李
fmt.Println(duplicate.Name) // 小王
```

结构体赋值会复制每个字段。若字段本身是指针、切片或 `map`，复制的是这些字段的值，内部数据仍可能共享；因此“复制了结构体”不等于“深拷贝了整棵数据”。

### 第二遍：结构体的比较

结构体能否使用 `==` 也由字段决定：所有字段都可比较时，两个结构体可以逐字段比较；只要包含切片、`map` 或函数等不可比较字段，就不能直接比较。

```go
type Point struct{ X, Y int }
fmt.Println(Point{1, 2} == Point{1, 2}) // true

type Labels struct{ Values []string }
// Labels{} == Labels{} // 编译错误：切片不可比较
```

---

## 3. `struct` 与 `map` 的分工

| 场景 | 更适合 |
|---|---|
| 描述一个用户、订单、商品等固定字段实体 | `struct` |
| 按用户 ID、名称、配置项等动态键查数据 | `map` |

两者常组合使用。沿用第 1 节的 `User` 类型，这里先保存结构体值，学过指针之后再考虑保存指针：

```go
usersByID := map[int64]User{
    1001: {ID: 1001, Name: "小李"},
}
fmt.Println(usersByID[1001].Name) // 小李
```

- `User` 规定单个用户有什么属性；
- `map` 通过 ID 快速定位用户。

---

## 4. 指针基础

前面复制结构体后，修改副本没有影响原值。如果需要操作同一个原值，就把它的位置交给另一个变量，这个位置用**指针**表示。先分清三个符号：

- `&user`：取 `user` 的地址。
- `*User`：类型写法，表示“指向 User 的指针”。
- `*p`：表达式写法，读取指针 `p` 指向的值，称为解引用。

```go
user := User{Name: "小李"}
p := &user // p 的类型是 *User

p.Name = "小王" // 等价于 (*p).Name = "小王"
```

Go 自动处理许多解引用细节。指针的本质是保存对象地址，从而能操作同一个对象。

声明 `var p *User` 时，零值是 `nil`，表示没有指向任何 `User`；这时不能使用 `p.Name`。`var u User` 则已经有一个字段均为零值的结构体，二者不同。

### 第二遍：用指针创建结构体

理解 `&` 后，可以直接取字面量地址；`new(User)` 则创建零值结构体并返回指针：

```go
user := &User{ID: 1001, Name: "小李"}
emptyUser := new(User) // 等价于 &User{}
fmt.Println(user.Name, emptyUser.Name)
```

它们不做业务校验。“业务不变量”指对象必须始终满足的规则，例如用户名不能为空；需要这种约束时，再看第 8 节的 `NewXxx`。

### 参数传递：都传值，区别在被复制的值

```go
func renameByValue(u User) {
    u.Name = "小王" // 只改副本
}

func renameByPointer(u *User) {
    u.Name = "小王" // 改原对象
}
```

Go 没有“按引用传参”：两次调用都会复制实参。前者复制整个 `User`，因此只改副本；后者复制的是指针值，两个指针仍指向同一个 `User`，所以可修改原对象。

```go
user := User{Name: "小李"}
renameByValue(user)
fmt.Println(user.Name) // 小李
renameByPointer(&user)
fmt.Println(user.Name) // 小王
```

如果函数只是让自己的指针参数指向另一个对象，例如 `u = &User{Name: "新用户"}`，调用方的变量不会跟着改指向。通过 `u.Name = ...` 修改对象，与给局部变量 `u` 重新赋值不同。

---

## 5. 方法

前面的函数把用户作为普通参数。若一个操作专门属于用户，可以给函数加一个“接收者”，让调用写成 `user.DisplayName()`；这就是方法：

```go
func (u User) DisplayName() string {
    return u.Name
}
```

调用：

```go
fmt.Println(user.DisplayName())
```

`(u User)` 表示方法作用于一个 `User`，方法体用 `u` 访问它。`u` 是普通参数名，不是关键字；调用 `user.DisplayName()` 时，把 `user` 的值传给 `u`。

方法不只属于结构体，也可定义在当前包声明的命名类型上：

```go
type UserID int64

func (id UserID) Valid() bool {
    return id > 0
}
```

接收者的基础类型必须是当前包定义的命名类型；不能直接为导入类型、接口类型或“指针类型本身”新增方法。可以为 `T` 或 `*T` 声明方法，其中 `T` 是该命名类型。

#### 常见反例与正确做法

1. **不能为导入类型（跨包类型）定义方法**：避免命名冲突与破坏依赖包封装。
   ```go
   // 编译错误：cannot define new methods on non-local type time.Duration
   // func (d time.Duration) HoursFloat() float64 { ... }

   // 正确：定义本地新类型，或使用普通函数
   type MyDuration time.Duration
   func (d MyDuration) HoursFloat() float64 { return time.Duration(d).Hours() }
   ```
2. **不能为接口类型定义方法**：接口仅定义协议契约，不包含具体实现存储。
   ```go
   type Greeter interface{ Greet() string }
   // 编译错误：invalid receiver type Greeter (Greeter is an interface type)
   // func (g Greeter) SayHello() { ... }

   // 正确：写成接受该接口的函数，或使用接口嵌入扩展规范
   func SayHello(g Greeter) { fmt.Println(g.Greet()) }
   ```
3. **不能为“指针类型本身”定义方法**：避免造成 `**T` 二级指针及方法集歧义。
   ```go
   type IntPtr *int
   // 编译错误：invalid receiver type IntPtr (IntPtr is a pointer type)
   // func (p IntPtr) Double() int { ... }

   // 正确：基类型定义为非指针类型，需要时使用指针接收者 (*T)
   type MyInt int
   func (p *MyInt) Double() int { return int(*p) * 2 }
   ```

选择建议：

- 与某类型核心业务含义紧密相关的行为，用方法；
- 通用格式化、转换、辅助逻辑，通常用普通函数。

这里 `DisplayName` 就是方法；处理任意字符串的格式化操作则可以使用普通函数，无需为了调用方便而强行归属到 `User`。

---

## 6. 值接收者与指针接收者

### 值接收者：操作副本

```go
type Counter struct {
    Value int
}

func (c Counter) Add() {
    c.Value++ // 加一，等价于 c.Value = c.Value + 1
}

counter := Counter{Value: 1}
counter.Add()
fmt.Println(counter.Value) // 1
```

调用方法时，`counter` 被复制给接收者 `c`；修改只发生在副本上。

适合：小型、按值使用的类型。“值语义”指我们关心它表示的内容，复制后希望把副本当作独立值使用。例如用坐标求和，方法不需要修改原坐标：

```go
type Point struct { X, Y int }
func (p Point) Sum() int { return p.X + p.Y }
```

### 指针接收者：操作原对象

下面把上面的 `Add` **替换**为指针版本。不能在同一类型上同时定义两个同名 `Add` 方法：

```go
func (c *Counter) Add() {
    c.Value++
}

counter := Counter{Value: 1}
counter.Add() // Go 会在可取地址变量上自动取地址
fmt.Println(counter.Value) // 2
```

适合：

1. 方法必须修改原对象；
2. 结构体较大，避免复制；
3. 类型中已存在指针接收者方法，希望风格一致。

**实用规则：** 一个类型只要有修改状态的指针接收者方法，其他方法通常也统一使用指针接收者。

### 连起来运行：两种接收者的结果

下面为两个方法取不同名字，放进同一个可运行程序，便于对照：

```go
package main

import "fmt"

type Counter struct { Value int }

func (c Counter) AddCopy() { c.Value++ }
func (c *Counter) Add() { c.Value++ }

func main() {
    counter := Counter{Value: 1}
    counter.AddCopy()
    fmt.Println(counter.Value) // 1
    counter.Add()
    fmt.Println(counter.Value) // 2
}
```

但**值接收者不等于不可变**。它只复制字段；字段若是切片，仍可能共享元素：

```go
type Group struct { Names []string }

func (g Group) RenameFirst(name string) {
    if len(g.Names) > 0 {
        g.Names[0] = name
    }
}
```

在函数内执行 `g := Group{Names: []string{"小李"}}; g.RenameFirst("小王")`，`g.Names[0]` 也会变成 `"小王"`。原因和[切片的共享底层数组](./array_slice.md)一样。

### 第二遍：方法集决定接口是否实现

接口描述一个值必须具备哪些方法。例如 `Named` 表示“能调用 `Name() string` 的值”；只要方法签名符合，就自动满足接口，不需要显式声明“实现”。本节只补足接收者与接口的关系，完整接口设计另行学习。

接收者选择不仅影响能否修改数据，还决定类型的方法集：

- `T` 的方法集只包含接收者为 `T` 的方法；
- `*T` 的方法集同时包含接收者为 `T` 和 `*T` 的方法。

```go
type Named interface {
    Name() string
}

type Renamable interface {
    Rename(string)
}

type NamedUser struct{ name string }

func (u NamedUser) Name() string        { return u.name }
func (u *NamedUser) Rename(name string) { u.name = name }

var _ Named = NamedUser{}
var _ Named = (*NamedUser)(nil)
var _ Renamable = (*NamedUser)(nil)
// var _ Renamable = NamedUser{} // 编译错误：方法集不含 Rename
```

`var _ 接口类型 = 值` 用来请编译器检查赋值是否合法，并不保存这个值；`(*NamedUser)(nil)` 是类型为 `*NamedUser` 的空指针，这里没有调用它的方法。

对于 `user := NamedUser{}`，能写 `user.Rename("小王")`，是因为 `user` 是有地址的变量，编译器自动补上 `&user`；这条便利**不适用于接口赋值**。因此，需要 `Rename` 的接口应接收 `*NamedUser`。

自动取址只适用于可取地址的值。临时值和 `map` 元素不是可取地址变量，不能直接调用指针接收者方法：

```go
type Profile struct{ Name string }

func (p *Profile) Rename(name string) { p.Name = name }

// Profile{Name: "小李"}.Rename("小王") // 编译错误：临时值不可取地址

profiles := map[int]Profile{1: {Name: "小李"}}
// profiles[1].Rename("小王") // 编译错误：map 元素不可取地址
```

对 `map[int]Profile`，应“取出 → 调用/修改 → 写回”；若刻意让 `map` 保存共享、可修改对象，才使用 `map[int]*Profile`，并承担相应的并发同步责任。

选择接收者时先表达语义，再考虑复制成本：

| 情况 | 通常选择 |
|---|---|
| 小型、不可变、具有值语义的类型，如坐标、时间段 | 值接收者 |
| 方法要修改状态、类型含锁，或复制成本明显 | 指针接收者 |
| 两者都可行 | 保持同一类型的接收者风格一致，并确认接口需求 |

---

## 7. 第二遍：业务建模：用方法保护状态变化

当结构体用于真实业务，方法还可以把“允许怎样修改”写在一起。下面规定订单不能既支付又取消；需要导入 `errors`，`errors.New` 用一段文本创建错误：

```go
type Order struct {
    ID       string
    Amount   int64 // 金额以“分”存储，避免 float64 精度问题
    paid     bool
    canceled bool
}

func (o *Order) Pay() error {
    if o == nil {
        return errors.New("订单不能为空")
    }
    if o.canceled {
        return errors.New("订单已取消，不能支付")
    }
    if o.paid {
        return errors.New("订单已经支付")
    }
    o.paid = true
    return nil
}

func (o *Order) Cancel() error {
    if o == nil {
        return errors.New("订单不能为空")
    }
    if o.paid {
        return errors.New("已支付订单不能取消")
    }
    o.canceled = true
    return nil
}
```

比起让外部代码直接修改：

```go
order.paid = true // 同一包内的代码仍可绕过校验
```

更推荐：

```go
if err := order.Pay(); err != nil {
    return err
}
```

字段使用小写后，其他包无法直接跳过校验；状态校验与修改逻辑集中在类型方法中。包内代码仍能访问未导出字段，因此这是一种边界设计，而不是运行时强制保护。

本例只约束支付/取消状态，不是完整订单系统：没有金额校验，也没有处理并发调用。指针接收者让方法能修改状态，但不会自动让修改具备并发安全性。

---

## 8. 第二遍：`NewXxx` 构造函数

Go 没有强制构造函数；当对象必须经过校验、初始化后才有效时，可使用惯例命名 `NewXxx`：

```go
func NewUser(id int64, name string) (*User, error) {
    if id <= 0 {
        return nil, errors.New("用户 ID 必须大于 0")
    }
    if name == "" {
        return nil, errors.New("用户名不能为空")
    }
    return &User{ID: id, Name: name}, nil
}
```

简单数据对象可直接用字面量初始化；有业务不变量时再用 `NewXxx` 集中保证合法性。构造函数不一定必须返回指针：是否返回 `User` 或 `*User` 仍应由值语义、可变性和接口需求决定。

这里 `User` 沿用第 1 节的类型。`NewUser` 只能保证**经过它创建的当下**满足条件；调用者仍能写 `User{}` 或修改导出字段。要持续维护规则，需要结合未导出字段和受控方法设计，不能把 `New` 命名当成语言强制机制。

---

## 9. 第二遍：常见陷阱

### 9.1 空指针

```go
var user *User
// user.Name // 会触发 panic
```

可能为空时先检查：

```go
if user == nil {
    return errors.New("用户不存在")
}
```

调用指针接收者方法本身可以传入 `nil`；是否安全由方法实现决定。因此，能处理空值的查询方法可以显式定义其语义：

下面沿用第 6 节的 `Profile`（含 `Name string` 字段）。

```go
func (p *Profile) DisplayName() string {
    if p == nil {
        return ""
    }
    return p.Name
}

var profile *Profile
fmt.Println(profile.DisplayName()) // 安全，输出空字符串
```

但这不是自动安全机制：方法中一旦解引用 `p` 而未检查，仍会 panic。对外 API 应统一约定 `nil` 是返回错误、返回零值，还是根本不允许传入。

### 9.2 `map` 中的结构体不能直接修改字段

```go
users := map[int]User{
    1: {Name: "小李"},
}

// users[1].Name = "小王" // 编译错误
```

`map` 元素不是稳定可寻址的变量。正确做法是“取出 → 修改 → 写回”：

```go
u := users[1]
u.Name = "小王"
users[1] = u
```

如需频繁修改，可存指针：

```go
users := map[int]*User{
    1: &User{Name: "小李"},
}
users[1].Name = "小王"
```

但存指针意味着共享可变对象，需要更谨慎地控制谁能修改它。

这里明确写了 `&User{...}`，可看出保存的是指针；Go 也允许在这种复合字面量内部省略重复的 `&User`。对不确定的键，要先检查 `u, ok := users[id]`，并确认 `ok && u != nil`，再访问字段。

### 9.3 不要误以为指针总是更快

- 小结构体、只读场景用值通常更简单，也可能更利于连续内存遍历；
- 大结构体或需要共享修改时，指针更合适；
- 性能优化要先保证语义正确，再通过基准测试决定。

### 9.4 含锁结构体不要复制

学过并发后再看：`sync.Mutex` 是让多个执行流程轮流操作数据的锁，需要导入 `sync`。锁除了数据之外还记录协调状态，使用后复制可能破坏同步关系。

```go
type Counter struct {
    mu    sync.Mutex
    value int
}
```

这类结构体开始使用后不能复制；应使用指针接收者并以指针传递。

---

## 10. 第二遍：结构体嵌套与嵌入

一个地址本身也有多个字段，可以先定义地址，再把它放进用户；这是从“字段是基本类型”自然扩展到“字段也可以是结构体”。下面的类型是独立示例。

### 组合：一个实体拥有另一个实体

```go
type Address struct {
    City string
}

type User struct {
    Name    string
    Address Address
}
```

使用：`user.Address.City`。

### 匿名字段嵌入

```go
type Timestamp struct {
    CreatedAt int64
}

type Article struct {
    ID int64
    Timestamp
}

// article.CreatedAt 等价于 article.Timestamp.CreatedAt
```

`Timestamp` 没写另一个字段名，它本身就成为嵌入字段的名字。初始化时仍要写真实字段的层次，不能写 `Article{CreatedAt: 1}`：

```go
article := Article{ID: 1, Timestamp: Timestamp{CreatedAt: 100}}
fmt.Println(article.CreatedAt) // 100
```

嵌入类型的方法也可能被提升到外层类型：若 `Timestamp` 有 `Created()` 方法，可直接调用 `article.Created()`。这里的“提升”是可省略一层访问路径。查找同名成员时，较浅层优先；同一最浅深度出现多个候选才会歧义，必须写出完整路径。例如：

```go
type A struct{}
func (A) ID() string { return "a" }

type B struct{}
func (B) ID() string { return "b" }

type C struct { A; B }
// C{}.ID() // 编译错误：ID 不明确
fmt.Println(C{}.A.ID()) // a
```

嵌入 `T` 或 `*T` 还会影响提升后方法集和接口实现；需要把嵌入类型作为接口值传递时，应像普通接收者一样检查 `T` 与 `*T` 的方法集。Go 偏好组合，但不应堆叠成复杂继承体系。

---

## 11. 第二遍：JSON / API 实战注意事项

JSON 是把数据写成文本以便保存或发送的格式；把结构体转换成 JSON 叫序列化。网络 API 的请求、响应也常使用它。字段后面的反引号部分叫标签，标准库 `encoding/json` 读取 `json:"name"` 决定输出字段名；标签本身不改变字段类型或可见性。

```go
type CreateUserRequest struct {
    Name  string `json:"name"`
    Email string `json:"email"`
}
```

- JSON 序列化通常只处理导出字段（首字母大写）；
- 使用标签控制 JSON 字段名；
- 不要直接把数据库实体暴露为接口响应，避免泄露密码哈希等内部字段。

```go
type UserResponse struct {
    ID   int64  `json:"id"`
    Name string `json:"name"`
}
```

为请求和响应定义专门的结构体更安全、更清晰。

导入 `encoding/json` 和 `fmt` 后，可以在 `main` 中运行：

```go
response := UserResponse{ID: 1001, Name: "小李"}
data, err := json.Marshal(response)
if err != nil {
    fmt.Println(err)
    return
}
fmt.Println(string(data)) // {"id":1001,"name":"小李"}
```

`data` 是字节切片，`string(data)` 把结果作为文本打印。这个例子只解释标签的用途，解析外部输入、校验请求等留给 JSON 或 HTTP 专题。

---

## 12. 第二遍：写业务结构体时的检查清单

1. 这个类型代表什么实体？
2. 它有哪些固定字段？
3. 哪些状态变化需要校验？
4. 能否用方法封装这些规则？
5. 是否要修改原对象，或结构体是否很大？若是，使用指针接收者。
6. 指针是否可能为 `nil`？
7. 是否需要作为 JSON 输入/输出？是否会泄露内部字段？
8. 是否被多个 goroutine 共享修改？若是，需要同步保护。

### 自测

第 6 节的 `AddCopy` 为什么没有改变 `counter.Value`，而值接收者 `Group.RenameFirst` 却能改变名字？

答案：两者都复制接收者，但 `int` 字段的值独立，切片字段的副本仍引用共享数组。判断是否影响原对象，要检查被修改的是哪一层数据，不能只看接收者有没有 `*`。

进一步核对可查看 [Go 方法集规范](https://go.dev/ref/spec#Method_sets) 和 [`encoding/json.Marshal` 的字段、标签规则](https://pkg.go.dev/encoding/json#Marshal)。
