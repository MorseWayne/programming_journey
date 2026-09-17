---
title: 包、程序入口、变量与常量
icon: /assets/icons/article.svg
order: 1
category:
  - Go
date: 2026-08-20
---

> **本章解决什么：** 看懂一个最小 Go 程序如何启动，并为数据取名字、保存和复用值。
>
> **读前准备：** 无。这是 Go 基础的起点。首次阅读先掌握 `package main`、`func main`、`:=`、`var` 和 `const`；标为“第二遍”的小节可在写过几个小程序后回看。

## 1. Go 用包组织代码

Go 用**包（package）**组织相关代码，而不是主要依靠类来组织。

示例项目结构：

```text
myapp/
├── go.mod       // module example.com/myapp
├── main.go
└── utils/
    └── greet.go
```

- `main.go` 可以属于 `package main`。
- `utils/greet.go` 可以属于 `package utils`。
- 同一个目录中的**非测试** `.go` 文件必须属于同一个包；测试文件可以使用同包名或额外的 `包名_test`。

## 2. `package main` 与 `func main()`

```go
package main

import "fmt"

func main() {
    fmt.Println("你好，Go")
}
```

- `package main`：特殊的包名，表示该包可以被构建为**可执行程序**。
- `func main()`：可执行程序的**入口函数**，程序运行时从这里开始正式执行。

记忆：

> `package main` 说明“这是要运行的程序包”；`func main()` 说明“程序从哪里开始运行”。

在包含 `go.mod`、且当前目录是 `main` 包时，通常使用：

```bash
go run .
```

常规可执行 Go 程序通常需要同时具备 `package main` 和 `func main()`。

### 第二遍：初始化发生在 `main` 之前

首次写程序时只要记住“程序从 `main` 开始”即可。下面的规则在你需要理解包启动顺序时再回看：

程序会先初始化被导入的包，再初始化当前包的包级变量和 `init` 函数，最后才调用 `main`。`init` 没有参数和返回值，也不能被普通代码直接调用：

```go
func init() {
    // 只放包启动时不可避免的初始化
}
```

`init` 的执行顺序会让启动行为变得隐式，因此不应用它代替清楚的普通函数调用；需要可能失败的初始化时，通常在 `main` 中显式调用能返回 `error` 的函数会更清楚。

## 3. 普通包与 `import`

普通包用于封装可复用功能，由其他包导入后使用。

`utils/greet.go`：

```go
package utils

import "fmt"

func Greet(name string) {
    fmt.Println("你好，" + name)
}
```

`main.go`：

```go
package main

import "example.com/myapp/utils"

func main() {
    utils.Greet("小明")
}
```

这里：

- `import "example.com/myapp/utils"`：导入 `utils` 包。导入路径由 `go.mod` 中的 module 路径和子目录组成，不是随意填写的本地目录名。
- `utils.Greet("小明")`：调用 `utils` 提供的函数。
- `main` 负责启动和组织程序。
- `utils` 负责提供可重复使用的功能。

首次阅读时，可先把“导入路径的最后一段”理解为调用时的包名，因此写 `utils.Greet`。严格来说，真正决定调用标识符的是被导入文件中的 `package utils`；导入别名等情况等需要组织更大项目时再学习。

## 4. 大写与小写：能否在包外使用

Go 不使用 `public`、`private` 关键字，而是用名称首字母的大小写控制访问范围。

```go
package utils

func Help() {
    // 大写开头：包外可调用
}

func help() {
    // 小写开头：只能在 utils 包内调用
}
```

在 `main` 包中：

```go
utils.Help() // 可以调用
utils.help() // 不可以调用，会编译报错
```

规则：

| 写法 | 含义 |
|---|---|
| `Greet`、`Help`、`User` | 首字母大写，已导出，包外可访问 |
| `greet`、`help`、`user` | 首字母小写，未导出，仅当前包内可访问 |

该规则也适用于变量、常量、类型和结构体字段。

## 5. 变量

变量是一个有名字、且值可以改变的数据。

```go
name := "Go"
name = "Golang"
```

第一次创建变量时要先声明；之后改变它的值，使用 `=`。

## 6. 三种变量声明方式

### 6.1 短变量声明：`:=`

```go
name := "Go"
age := 18
enabled := true
```

这是函数内部最常用的写法。Go 会自动推断类型。

### 6.2 `var` 自动推断类型

```go
var name = "Go"
var age = 18
```

### 6.3 `var` 明确写出类型

```go
var name string = "Go"
var age int = 18
var enabled bool = true
```

也可以只声明、暂时不赋值：

```go
var name string // 默认值 ""
var age int     // 默认值 0
var ok bool     // 默认值 false
```

### 第二遍：作用域与遮蔽

这一小节会用到条件语句 `if`。变量只在声明它的代码块内有效；包级变量则在同一包的所有文件中可见。短变量声明很容易在内层代码块意外创建一个同名新变量：

```go
name := "外层"
if true {
    name := "内层" // 新的 name，只在 if 块内有效
    fmt.Println(name)
}
fmt.Println(name) // 仍是“外层”
```

这种“遮蔽”会让更新看似发生却没有改变外层变量。需要复用已有变量时使用 `=`；只有确实需要一个独立的内层值时才使用 `:=`。

## 7. 常见基本类型

| 类型 | 用途 | 示例 |
|---|---|---|
| `string` | 文本 | `"你好"` |
| `int` | 整数 | `42` |
| `float64` | 小数 | `3.14` |
| `bool` | 真或假 | `true`、`false` |

注意：

```go
isAdmin := true     // bool
isAdmin := "true"   // string，不是 bool
```

先把 `string` 当作文本即可。中文等字符如何表示、`byte`、`rune` 和 UTF-8 的细节属于字符串主题，写到实际文本处理时再深入。

### 第二遍：数值类型与显式转换

当数据要写入文件、网络协议或数据库等固定格式时，才经常需要关心位宽：`int8`、`int16`、`int32`、`int64` 是固定宽度的有符号整数，`byte` 是 `uint8` 的别名，`rune` 是 `int32` 的别名。日常计数和下标先使用 `int` 即可。

Go 不会自动把一个数值类型隐式转换成另一个类型：

```go
var count int = 42
var ratio float64 = float64(count)

var port uint16 = uint16(count) // 转换可能截断，需先确认取值范围
_ = ratio
_ = port
```

协议、文件格式、数据库字段或跨平台边界需要固定宽度时，再明确使用 `int64`、`uint32` 等类型。

## 8. `:=` 是什么？为什么只能在函数内？

```go
name := "Go"
```

`:=` 叫做**短变量声明**，一次完成三件事：

1. 创建变量。
2. 赋予初始值。
3. 自动推断变量类型。

它只能在**函数内部**使用：

```go
package main

var appName = "Demo" // 函数外：使用 var

func main() {
    name := "Go" // 函数内：可以使用 :=
    _ = name
}
```

下面是错误写法：

```go
package main

port := 8080 // 错误：函数外不能使用 :=
```

原因是：`:=` 属于短变量声明语句；函数体内可以写语句，而包的顶层位置主要用于写声明。函数外可以使用 `var`：

```go
var port = 8080
```

函数外通常放包、导入、变量、常量、类型和函数等声明；函数内放实际执行的动作。

## 9. `:=` 和 `=` 的区别

```go
age := 18 // 声明新变量并赋值
age = 19  // 给已经存在的变量重新赋值
```

- `:=`：声明新变量。
- `=`：修改已声明变量的值。

常见错误：

```go
age = 18 // 错误：age 还没有声明
```

```go
age := 18
age := 19 // 错误：当前作用域中没有新变量
```

使用 `:=` 时，左侧至少要有一个当前作用域中新创建的变量；已有变量会被重新赋值。例如：

```go
x := 1
x, y := 2, 3 // 合法，因为 y 是新变量
```

## 10. 常量 `const`

常量声明后不能修改：

```go
const maxRetry = 3
const appName = "我的程序"
```

错误示例：

```go
appName = "新程序" // 错误：常量不能重新赋值
```

选择原则：

- 可能变化的数据：使用变量（`var` 或 `:=`）。
- 不应该变化的固定值：使用常量（`const`）。

### 常量默认不绑定具体数值类型

```go
const maxConnections = 100

var port uint16 = maxConnections // 100 可表示为 uint16，允许赋值
```

未显式写类型的常量是**无类型常量**，会在使用处按上下文转换；这也是 `const` 很适合表达固定数值的原因。若需要固定类型，可以明确写出：

```go
const timeoutSeconds int = 30
```

### 第二遍：相关常量可使用 `iota`

`iota` 只在 `const (...)` 声明块中使用，随每一行常量声明从 `0` 递增：

```go
const (
    statusPending = iota // 0
    statusRunning        // 1
    statusDone           // 2
)
```

它适合一组内部枚举值；若值需要长期写入数据库、接口或配置，应明确约定数值与兼容策略，避免仅因调整声明顺序而改变含义。

## 11. 综合示例

```go
package main

import "fmt"

func main() {
    name := "小明"
    var age int = 18
    isStudent := true
    const school = "Go 学院"

    fmt.Println(name)
    fmt.Println(age)
    fmt.Println(isStudent)
    fmt.Println(school)

    age = 19 // 变量可以修改
    fmt.Println(age)
}
```

## 12. 本节总结

> Go 用包组织代码；导入路径从 module 路径推导，包名决定调用标识符。`package main` 与 `func main()` 构成可执行程序及其入口。变量用 `:=` 或 `var` 声明，其中 `:=` 只能在函数内使用，且至少声明一个新变量；常量使用 `const`，不能修改，并可用无类型常量和 `iota` 表达固定值。

## 易错点速查

- `Greet` 可以被包外调用，`greet` 不可以。
- `:=` 是短变量声明，不是普通赋值。
- `:=` 只能在函数内部使用。
- `:=` 的左侧必须至少有一个当前作用域的新变量。
- 已声明变量重新赋值使用 `=`。
- `const` 声明的常量不能重新赋值。
- `"true"` 是字符串，`true` 才是布尔值。
