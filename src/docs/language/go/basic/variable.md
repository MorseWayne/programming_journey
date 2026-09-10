---
title: 包、程序入口、变量与常量
icon: /assets/icons/article.svg
order: 1
category:
  - Go
date: 2026-08-20
---

## 1. Go 用包组织代码

Go 用**包（package）**组织相关代码，而不是主要依靠类来组织。

示例项目结构：

```text
myapp/
├── go.mod
├── main.go
└── utils/
    └── greet.go
```

- `main.go` 可以属于 `package main`。
- `utils/greet.go` 可以属于 `package utils`。
- 同一个目录中的 `.go` 文件通常属于同一个包。

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

运行项目通常使用：

```bash
go run .
```

常规可执行 Go 程序通常需要同时具备 `package main` 和 `func main()`。

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

import "myapp/utils"

func main() {
    utils.Greet("小明")
}
```

这里：

- `import "myapp/utils"`：导入 `utils` 包。
- `utils.Greet("小明")`：调用 `utils` 提供的函数。
- `main` 负责启动和组织程序。
- `utils` 负责提供可重复使用的功能。

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

使用 `:=` 时，左侧至少要有一个当前作用域中新创建的变量。例如：

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

> Go 用包组织代码；`package main` 与 `func main()` 构成可执行程序及其入口。普通包通过 `import` 被复用；首字母大写的名称可被包外调用。变量用 `:=` 或 `var` 声明，其中 `:=` 只能在函数内使用；常量使用 `const`，且不能修改。

## 易错点速查

- `Greet` 可以被包外调用，`greet` 不可以。
- `:=` 是短变量声明，不是普通赋值。
- `:=` 只能在函数内部使用。
- 已声明变量重新赋值使用 `=`。
- `const` 声明的常量不能重新赋值。
- `"true"` 是字符串，`true` 才是布尔值。
