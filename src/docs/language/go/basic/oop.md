---
title: GO中的面向对象编程
icon: /assets/icons/article.svg
order: 4
category:
  - Go
date: 2025-09-19
---

## 1 接口(Interface)基础

在 Go 语言中，接口是一种类型，它定义了一组方法集合。接口是 Go 实现多态和面向对象编程的核心机制。

### 1.1 接口的定义

接口的定义使用 `interface` 关键字，声明了一组方法签名：

```go
// Reader 定义了一个读取器接口
type Reader interface {
    Read(p []byte) (n int, err error)
}

// Writer 定义了一个写入器接口
type Writer interface {
    Write(p []byte) (n int, err error)
}
```

接口定义只包含方法的签名（名称、参数和返回值），不包含方法的实现。

### 1.2 隐式实现

Go 的接口实现是隐式的，这意味着：**如果一个类型实现了接口要求的所有方法，那么它就自动满足该接口**，不需要显式声明。

```go
// 定义一个接口
package main

// 定义一个接口
type Speaker interface {
	Speak() string
}

// 定义另一个类型
type Cat struct {
	Name string
}

// Cat 类型也实现了 Speaker 接口的方法
func (c Cat) Speak() string {
	return "Meow! My name is " + c.Name
}

func main() {
	var obj Speaker
	cat := Cat{"kelly"}
	obj = &cat // obj的值存放*Cat
	println(obj.Speak())

	obj = cat // obl的值存放Cat
	println(obj.Speak())
}
```

获得程序的输出如下：

```bash
Meow! My name is kelly
Meow! My name is kelly
```

::: info 为什么同时支持值和指针形式调用

通过这段代码示例，你大概了解了`GO`里面的接口的一个使用形式，
但是，你可能疑惑，为什么 `obj` 里面既能放 `&cat` 也能放 `cat`，`GO`的编译器到底做了啥？
**Go 编译器在处理接口赋值时，做了两件关键的事：**

1. **编译期检查**：当你写 `var obj Speaker`，`obj` 的类型就被确定为 `Speaker`。赋值时（如 `obj = cat` 或 `obj = &cat`），编译器会检查 `Cat` 或 `*Cat` 是否实现了 `Speaker` 接口的方法（这里是 `Speak()`)，只要实现了，编译器就允许赋值。
2. **运行时存储**：接口变量在底层其实包含两部分信息：
   - 类型信息（动态类型）：当前存储的值是什么具体类型（如 `Cat` 或 `*Cat`）
   - 值信息（动态值）：实际存储的值本身（可以是结构体值，也可以是指针）

当你调用 `obj.Speak()` 时，`Go` 会根据 `obj` 当前保存的动态类型，自动找到对应类型的 `Speak` 方法并调用。这就是接口的动态分派（`dynamic dispatch`）机制。所以，虽然 `obj` 的静态类型是 `Speaker`，但它可以在运行时保存不同类型的值，`Go` 编译器和运行时会帮你完成类型检查和方法调用的分派。

**那关于编译器检查，你可能还有一个问题，示例代码并没有为`*Cat`实现接口，为什么指针的赋值能够编译通过？**
这是因为在 `Go` 语言中，如果你为类型 `Cat`（值接收者）实现了接口方法（如 `func (c Cat) Speak() string`），那么 `Cat` 和 `*Cat`（指针类型）都自动实现了该接口。

原因如下：

- 值接收者实现的方法，既可以通过值调用`cat.Speak()`，也可以通过指针调用`&cat.Speak()`，`Go` 会自动做转换。
- 但如果你用指针接收者实现方法（如 `func (c *Cat) Speak() string`），只有 `*Cat` 实现了接口，`Cat`（值类型）不能直接赋值给接口变量。

所以你只要为 `Cat`（值接收者）实现接口方法，`Cat` 和 `*Cat` 都可以赋值给接口类型变量。这是 `Go` 设计上的便利性。

:::

## 2 空接口与类型断言

### 2.1 空接口

空接口 (`interface{}`) 是一个特殊的接口，它没有定义任何方法。**因此，所有类型都实现了空接口**。

空接口常用于需要处理多种类型的场景：

```go
// 可以接收任何类型的值
func PrintAnything(v interface{}) {
    fmt.Println(v)
}

// 使用示例
PrintAnything(42)
PrintAnything("hello")
PrintAnything([]int{1, 2, 3})
```

### 2.2 类型断言

当我们有一个接口值时，可以使用类型断言来获取它的具体类型：

```go
func processValue(v interface{}) {
    // 类型断言
    if str, ok := v.(string); ok {
        fmt.Println("It's a string:", str)
    } else if num, ok := v.(int); ok {
        fmt.Println("It's an int:", num)
    } else {
        fmt.Println("Unknown type")
    }
}

// 使用 type switch 进行更复杂的类型判断
func processValueAdvanced(v interface{}) {
    switch val := v.(type) {
    case string:
        fmt.Println("String value:", val)
    case int, int8, int16, int32, int64:
        fmt.Println("Integer value:", val)
    case float32, float64:
        fmt.Println("Float value:", val)
    default:
        fmt.Printf("Unknown type: %T\n", val)
    }
}
```

## 3 Go 语言的面向对象编程

虽然 Go 不是传统意义上的面向对象编程语言，没有类（class）的概念，但它通过结构体（struct）和接口（interface）同样可以实现面向对象的核心特性。

### 3.1 封装

在 Go 中，封装是通过标识符的大小写来控制的：

- 首字母大写的标识符（函数、变量、结构体、方法等）是公开的，可以被其他包访问
- 首字母小写的标识符是私有的，只能在定义它的包内访问

```go
// 定义一个公开的结构体
type Person struct {
    // 公开字段
    Name string
    // 私有字段
    age int
}

// 公开方法
func (p *Person) SetAge(a int) {
    if a >= 0 {
        p.age = a
    }
}

// 公开方法
func (p *Person) GetAge() int {
    return p.age
}
```

### 3.2 组合（替代继承）

Go 不支持传统的类继承，而是通过结构体嵌入（组合）来实现类似的功能：

```go
// 定义一个基础结构体
type Animal struct {
    Name string
}

// Animal 的方法
func (a *Animal) Eat() {
    fmt.Printf("%s is eating\n", a.Name)
}

// Dog 嵌入了 Animal，获得了 Animal 的字段和方法
type Dog struct {
    Animal // 匿名字段，实现组合
    Breed  string
}

// Dog 可以有自己的方法
func (d *Dog) Bark() {
    fmt.Printf("%s is barking\n", d.Name)
}

// 使用示例
func main() {
    d := &Dog{
        Animal: Animal{Name: "Rex"},
        Breed:  "German Shepherd",
    }
    d.Eat()  // 调用从 Animal 继承的方法
    d.Bark() // 调用 Dog 自己的方法
}
```

### 3.3 多重组合

一个结构体可以嵌入多个其他结构体，从而获得多个类型的方法集：

```go
type Swimmer interface {
    Swim()
}

type Flyer interface {
    Fly()
}

type Bird struct {
    Name string
}

func (b *Bird) Fly() {
    fmt.Printf("%s is flying\n", b.Name)
}

type Fish struct {
    Name string
}

func (f *Fish) Swim() {
    fmt.Printf("%s is swimming\n", f.Name)
}

// Duck 同时嵌入了 Bird 和 Fish
type Duck struct {
    Bird
    Fish
}

// 使用示例
d := &Duck{
    Bird: Bird{Name: "Donald"},
    Fish: Fish{Name: "Donald"},
}
d.Fly()  // Donald is flying
d.Swim() // Donald is swimming
```

## 4 Go 语言中的多态

Go 通过接口实现多态，这是一种"鸭子类型"（Duck Typing）的实现方式："如果它走路像鸭子，叫声像鸭子，那么它就是鸭子"。

### 4.1 接口多态示例

```go
// 定义一个接口
type Shape interface {
    Area() float64
    Perimeter() float64
}

// 实现 Rectangle 类型
type Rectangle struct {
    Width, Height float64
}

func (r Rectangle) Area() float64 {
    return r.Width * r.Height
}

func (r Rectangle) Perimeter() float64 {
    return 2 * (r.Width + r.Height)
}

// 实现 Circle 类型
type Circle struct {
    Radius float64
}

func (c Circle) Area() float64 {
    return math.Pi * c.Radius * c.Radius
}

func (c Circle) Perimeter() float64 {
    return 2 * math.Pi * c.Radius
}

// 多态函数，接收任何实现了 Shape 接口的类型
func PrintShapeInfo(s Shape) {
    fmt.Printf("Area: %.2f\n", s.Area())
    fmt.Printf("Perimeter: %.2f\n", s.Perimeter())
}

// 使用示例
func main() {
    r := Rectangle{Width: 10, Height: 5}
    c := Circle{Radius: 7}
    
    PrintShapeInfo(r) // 传递 Rectangle 类型
    PrintShapeInfo(c) // 传递 Circle 类型
}
```

### 4.2 接口组合

Go 允许通过组合多个接口来创建新的接口：

```go
// 定义基本接口
type Reader interface {
    Read(p []byte) (n int, err error)
}

type Writer interface {
    Write(p []byte) (n int, err error)
}

// 通过组合创建新接口
type ReadWriter interface {
    Reader
    Writer
}

// 或者也可以直接写成
// type ReadWriter interface {
//     Read(p []byte) (n int, err error)
//     Write(p []byte) (n int, err error)
// }
```

## 5 接口的实际应用

### 5.1 标准库中的接口

Go 标准库中大量使用接口，例如 `io.Reader` 和 `io.Writer`：

```go
// 从文件读取数据
file, err := os.Open("example.txt")
if err != nil {
    log.Fatal(err)
}
defer file.Close()

// 创建一个缓冲区
buffer := make([]byte, 1024)

// Read 方法来自于 file 实现的 io.Reader 接口
n, err := file.Read(buffer)
if err != nil && err != io.EOF {
    log.Fatal(err)
}

// 写入数据到标准输出
// Stdout 实现了 io.Writer 接口
os.Stdout.Write(buffer[:n])
```

### 5.2 接口的零值

接口的零值是 `nil`。当一个接口值为 `nil` 时，它既没有具体类型，也没有具体值：

```go
var s Shape // s 是 nil 接口值
// s.Area() // 运行时错误：调用 nil 接口的方法

// 判断接口是否为 nil
if s == nil {
    fmt.Println("s is nil")
}
```

### 5.3 接口值的内部结构

一个接口值由两部分组成：

1. 动态类型（具体类型）
2. 动态值（具体值）

```go
var s Shape
var r Rectangle = Rectangle{Width: 10, Height: 5}

s = r // 现在 s 的动态类型是 Rectangle，动态值是 {10, 5}

s = nil // 现在 s 的动态类型和值都是 nil
```

## 6 接口的最佳实践

### 6.1 接口应该小而专一

Go 的设计哲学是"接口应该小而专一"，通常一个接口只包含一个或几个相关的方法。

```go
// 好的实践：小而专一的接口
type Reader interface {
    Read(p []byte) (n int, err error)
}

// 避免：过于庞大的接口
type MonsterInterface interface {
    Method1()
    Method2()
    // ... 许多其他方法
}
```

### 6.2 依赖注入

接口常用于实现依赖注入，使代码更易于测试和维护：

```go
// 定义存储接口
type UserStore interface {
    GetUser(id int) (*User, error)
    SaveUser(user *User) error
}

// 实际实现
func RealUserStore struct {
    // 数据库连接等
}

func (s *RealUserStore) GetUser(id int) (*User, error) {
    // 从数据库获取用户
}

func (s *RealUserStore) SaveUser(user *User) error {
    // 保存用户到数据库
}

// 测试实现
func MockUserStore struct {
    Users map[int]*User
}

func (m *MockUserStore) GetUser(id int) (*User, error) {
    // 从模拟数据获取用户
}

func (m *MockUserStore) SaveUser(user *User) error {
    // 保存到模拟数据
}

// 使用接口的服务
func UserService struct {
    Store UserStore
}

// 创建服务时注入依赖
realService := &UserService{Store: &RealUserStore{}}
// 测试时使用模拟实现
testService := &UserService{Store: &MockUserStore{}}
```

### 6.3 使用接口进行解耦

接口可以有效减少代码间的耦合度：

```go
// 不使用接口的紧耦合代码
func ProcessFile(file *os.File) error {
    // 处理文件...
}

// 使用接口的松耦合代码
func ProcessReader(r io.Reader) error {
    // 处理读取器...
}

// 现在可以处理任何实现了 io.Reader 的类型
ProcessReader(file)
ProcessReader(strings.NewReader("test data"))
ProcessReader(bytes.NewBuffer(data))
```
