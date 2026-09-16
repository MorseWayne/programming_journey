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

### 值传递与指针传递

```go
func renameByValue(u User) {
    u.Name = "小王" // 只改副本
}

func renameByPointer(u *User) {
    u.Name = "小王" // 改原对象
}
```

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

---

## 7. 业务建模：用方法保护状态变化

```go
type Order struct {
    ID       string
    Amount   int64 // 金额以“分”存储，避免 float64 精度问题
    Paid     bool
    Canceled bool
}

func (o *Order) Pay() error {
    if o == nil {
        return errors.New("订单不能为空")
    }
    if o.Canceled {
        return errors.New("订单已取消，不能支付")
    }
    if o.Paid {
        return errors.New("订单已经支付")
    }
    o.Paid = true
    return nil
}

func (o *Order) Cancel() error {
    if o == nil {
        return errors.New("订单不能为空")
    }
    if o.Paid {
        return errors.New("已支付订单不能取消")
    }
    o.Canceled = true
    return nil
}
```

比起让外部代码直接修改：

```go
order.Paid = true
```

更推荐：

```go
if err := order.Pay(); err != nil {
    return err
}
```

这样状态校验与修改逻辑集中在类型内部，不会散落在业务各处。

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

简单数据对象可直接用字面量初始化；有业务不变量时再用 `NewXxx` 集中保证合法性。

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

Go 偏好组合。嵌入适合复用一组小而稳定的字段或方法，不应堆叠成复杂继承体系。

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
