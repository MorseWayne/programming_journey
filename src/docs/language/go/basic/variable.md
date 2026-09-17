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

### 先准备一个能运行的例子

先安装 Go，并在终端运行 `go version` 确认安装成功。创建一个新的练习目录，在其中初始化项目：

```bash
mkdir myapp
cd myapp
go mod init example.com/myapp
```

最后一条命令生成 `go.mod`。module 可以先理解为一组一起管理的包，`example.com/myapp` 是这组包的路径前缀；本地练习无需真的拥有这个网站。接着把第 2 节的完整程序保存成 `main.go`，在这个目录运行 `go run .`，应看到 `你好，Go`。[官方入门教程](https://go.dev/doc/tutorial/getting-started) 也使用这种“建目录、初始化 module、运行程序”的步骤。

后文不含 `package main` 的操作片段默认放进 `main` 的花括号内，一次运行一个片段；`func` 声明放在 `main` 外。使用 `fmt.Println` 的文件需要 `import "fmt"`。`//` 开头是注释，只给读者看，不执行。

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
- 同一目录中参与同一次构建的普通 `.go` 文件使用同一个包名。暂时无需处理特殊情况；以后使用构建条件或外部测试包时会有额外规则。

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
- `import "fmt"`：引入 Go 自带的格式化输出工具包；`fmt.Println(...)` 把括号内的内容打印出来并换行。
- `func` 声明函数；`()` 是参数的位置，`main` 不接收参数；`{ ... }` 是函数要执行的代码。

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

先建立 `utils` 子目录，再保存这个文件。`name string` 表示函数接收一个名为 `name` 的文本参数；`Greet("小明")` 会把 `"小明"` 交给它。两个字符串之间的 `+` 会把文本拼接起来。

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

推断只发生在声明时，变量之后不能任意变换类型。例如 `age := 18` 创建 `int` 变量，随后可以写 `age = 19`，但不能写 `age = "十九"`。

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

这种默认值叫**零值**，不等于“未定义的随机内容”。局部变量声明后需要使用，否则 Go 编译器会报 `declared and not used`；用 `fmt.Println(name, age, ok)` 就能观察这些零值。普通导入也需要在当前文件中使用。

`_` 叫空白标识符，用于明确丢弃一个值，例如 `_ = age`。它不会保存数据，也不能再被读取；实际程序应使用需要的数据，别依赖 `_` 掩盖漏写的逻辑。

### 第二遍：作用域与遮蔽

这一小节会用到条件语句 `if`：条件为 `true` 时执行花括号内的代码。局部变量从声明后到所在代码块结束都可见，包括没有同名声明的内层代码块；包级变量则在同一包的所有文件中可见。短变量声明很容易在内层代码块创建一个同名新变量：

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
isAdmin := true        // bool
isAdminText := "true"  // string，不是 bool
fmt.Println(isAdmin, isAdminText)
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

更准确地说，至少有一个新的**非 `_` 名称**；`x, _ := 2, 3` 不能用来重新声明已有的 `x`。如果内层块中写 `x := ...`，则会创建新变量，参见前面的遮蔽示例。

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

还要满足一个条件：常量值能在编译时确定，例如数字、布尔值、字符串及其常量运算。运行时从文件、用户输入或普通函数调用得到的值仍要用变量；`const` 也不能用来声明不可变的切片或 `map`。

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

`iota` 用在常量声明中，表示当前这组声明里第几个常量声明项，从 `0` 开始。常见写法是 `const (...)`：

```go
const (
    statusPending = iota // 0
    statusRunning        // 1
    statusDone           // 2
)
```

后两项省略了表达式，会复用上一项的 `iota` 表达式，并使用各自的序号。它按声明项递增，不按物理行数或变量个数递增；`const a, b = iota, iota` 中二者都为 `0`。

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

### 自测

把综合示例里的 `age = 19` 改为 `age := 19` 会怎样？再把 `age = 19` 改为 `age = "十九"` 呢？

答案：前者在同一作用域没有声明新变量，后者把字符串赋给 `int`；都会编译失败。改动变量的值与改动变量的类型是两件不同的事。
