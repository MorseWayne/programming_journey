---
title: 结构体、方法与指针接收者
icon: /assets/icons/article.svg
order: 5
category:
  - Go
date: 2026-09-16
---

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

`User` 将一个用户的固定属性组织为整体。

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

需要指针时，通常直接取字面量地址；`new` 则创建零值并返回其地址：

```go
user := &User{ID: 1001, Name: "小李"}
emptyUser := new(User) // 等价于 &User{}
```

它们只负责分配和初始化零值，不做业务校验；需要保证业务不变量时，再使用后文的 `NewXxx`。

### 复制结构体时，字段按值复制

```go
original := User{ID: 1001, Name: "小李"}
copy := original
copy.Name = "小王"

fmt.Println(original.Name) // 小李
fmt.Println(copy.Name)     // 小王
```

结构体赋值会复制每个字段。若字段本身是指针、切片或 `map`，复制的是这些字段的值，内部数据仍可能共享；因此“复制了结构体”不等于“深拷贝了整棵数据”。

结构体能否使用 `==` 也由字段决定：所有字段都可比较时，两个结构体可以逐字段比较；只要包含切片、`map` 或函数等不可比较字段，就不能直接比较。

```go
type Point struct{ X, Y int }
fmt.Println(Point{1, 2} == Point{1, 2}) // true

type Labels struct{ Values []string }
// Labels{} == Labels{} // 编译错误：切片不可比较
```

### 访问与修改字段

```go
fmt.Println(user.Name)
user.Name = "小王"
```

字段首字母大写表示可被其他包访问；小写字段仅当前包可访问。

---

## 3. `struct` 与 `map` 的分工

| 场景 | 更适合 |
|---|---|
| 描述一个用户、订单、商品等固定字段实体 | `struct` |
| 按用户 ID、名称、配置项等动态键查数据 | `map` |

两者常组合使用：

```go
type User struct {
    ID   int64
    Name string
}

usersByID := map[int64]*User{
    1001: {ID: 1001, Name: "小李"},
}
```

- `User` 规定单个用户有什么属性；
- `map` 通过 ID 快速定位用户。

---

## 4. 指针基础

```go
user := User{Name: "小李"}
p := &user // p 的类型是 *User

p.Name = "小王" // 等价于 (*p).Name = "小王"
```

Go 自动处理许多解引用细节。指针的本质是保存对象地址，从而能操作同一个对象。

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

---

## 5. 方法

方法是在函数前加入“接收者”的函数：

```go
func (u User) DisplayName() string {
    return u.Name
}
```

调用：

```go
fmt.Println(user.DisplayName())
```

方法不只属于结构体，也可定义在当前包声明的命名类型上：

```go
type UserID int64

func (id UserID) Valid() bool {
    return id > 0
}
```

接收者的基础类型必须是当前包定义的命名类型；不能直接为导入类型、接口类型或“指针类型本身”新增方法。可以为 `T` 或 `*T` 声明方法，其中 `T` 是该命名类型。

选择建议：

- 与某类型核心业务含义紧密相关的行为，用方法；
- 通用格式化、转换、辅助逻辑，通常用普通函数。

```go
func (o *Order) Pay() error { /* ... */ return nil }
func FormatPrice(cents int64) string { /* ... */ return "" }
```

---

## 6. 值接收者与指针接收者

### 值接收者：操作副本

```go
type Counter struct {
    Value int
}

func (c Counter) Add() {
    c.Value++
}

counter := Counter{Value: 1}
counter.Add()
fmt.Println(counter.Value) // 1
```

调用方法时，`counter` 被复制给接收者 `c`；修改只发生在副本上。

适合：小型、只读、具有值语义的类型。

```go
type Point struct { X, Y float64 }
func (p Point) DistanceTo(q Point) float64 { /* 只读计算 */ return 0 }
```

### 指针接收者：操作原对象

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

### 方法集决定接口是否实现

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

type User struct{ name string }

func (u User) Name() string         { return u.name }
func (u *User) Rename(name string)  { u.name = name }

var _ Named = User{}
var _ Named = (*User)(nil)
var _ Renamable = (*User)(nil)
// var _ Renamable = User{} // 编译错误：User 的方法集不含 Rename
```

可取地址的变量能写 `user.Rename("小王")`，是编译器自动补上 `&user` 的调用便利；这条便利**不适用于接口赋值**。因此，当接口需要指针接收者方法时，应传递 `*User`。

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

## 7. 业务建模：用方法保护状态变化

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

---

## 8. `NewXxx` 构造函数

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

---

## 9. 常见陷阱

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

但这不是自动安全机制：方法中一旦解引用 `u` 而未检查，仍会 panic。对外 API 应统一约定 `nil` 是返回错误、返回零值，还是根本不允许传入。

### 9.2 `map` 中的结构体不能直接修改字段

```go
users := map[int]User{
    1: {Name: "小李", Age: 20},
}

// users[1].Age = 21 // 编译错误
```

`map` 元素不是稳定可寻址的变量。正确做法是“取出 → 修改 → 写回”：

```go
u := users[1]
u.Age = 21
users[1] = u
```

如需频繁修改，可存指针：

```go
users := map[int]*User{
    1: {Name: "小李", Age: 20},
}
users[1].Age = 21
```

但存指针意味着共享可变对象，需要更谨慎地控制谁能修改它。

### 9.3 不要误以为指针总是更快

- 小结构体、只读场景用值通常更简单，也可能更利于连续内存遍历；
- 大结构体或需要共享修改时，指针更合适；
- 性能优化要先保证语义正确，再通过基准测试决定。

### 9.4 含锁结构体不要复制

```go
type Counter struct {
    mu    sync.Mutex
    value int
}
```

这类结构体开始使用后不能复制；应使用指针接收者并以指针传递。

---

## 10. 结构体嵌套与嵌入

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

嵌入类型的方法也可能被提升到外层类型：若 `Timestamp` 有 `Created()` 方法，可直接调用 `article.Created()`。这只是选择器便利，不是继承；外层同名字段或方法会优先，多个嵌入类型提供同名成员时选择器会歧义，必须写出完整路径。

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

## 11. JSON / API 实战注意事项

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

---

## 12. 写业务结构体时的检查清单

1. 这个类型代表什么实体？
2. 它有哪些固定字段？
3. 哪些状态变化需要校验？
4. 能否用方法封装这些规则？
5. 是否要修改原对象，或结构体是否很大？若是，使用指针接收者。
6. 指针是否可能为 `nil`？
7. 是否需要作为 JSON 输入/输出？是否会泄露内部字段？
8. 是否被多个 goroutine 共享修改？若是，需要同步保护。
