---
title: A08 文件、包与模块：把程序组织成能复用的代码
icon: /assets/icons/article.svg
order: 8
date: 2026-09-22
---

先修：[A07 接口与错误](./07_interfaces_errors.md)。

## 小需求：让不同入口复用积分计算

前几课每个小程序都有自己的积分函数。现在希望把规则集中在一处，让命令行程序和后续 HTTP 程序都能调用。

本课解释目录、包、模块与引入路径。A01 已使用 go mod init，这里补齐它背后的关系。

## 三个层次不要混淆

| 层次 | 负责什么 | 练习中的例子 |
|---|---|---|
| 文件 | 保存一部分源码 | points.go |
| 包 package | 组织同一目录中的协作代码与访问边界 | points |
| 模块 module | 管理一组包及依赖版本 | example.com/go-course |

普通 Go 源文件在同一目录通常属于同一个包。一个模块可以包含多个目录和包。包名与模块名不必相同。

main 包包含可执行程序入口；points 包提供可被其他包使用的能力。一个可执行包里不能重复定义多个同名 main 函数。

## 创建以下文件结构

从 A01 的 go-course 根目录继续，保留已有 go.mod：

```text
go-course/
  go.mod
  points/
    points.go
  a08/
    main.go
```

go.mod 中的模块声明应为：

```text
module example.com/go-course
```

文件里可能还有 Go 工具自动生成的 go 版本行，保留它。这个片段仅用于解释模块名，不要求覆盖完整文件。

## 把规则放进 points 包

保存 points/points.go：

```go
package points

import "errors"

func Reward(score int) (int, error) {
    if score < 0 || score > 100 {
        return 0, errors.New("score must be between 0 and 100")
    }
    if score >= 60 {
        return 10, nil
    }
    return 0, nil
}
```

Reward 首字母大写，表示可以从包外访问。若改成小写 reward，a08 包就不能通过 points.reward 调用它。这个规则也适用于类型、字段和其他导出的标识符。

导出不等于权限认证，它只是一种代码访问边界。

## 在另一个包中调用

保存 a08/main.go：

```go
package main

import (
    "fmt"
    "example.com/go-course/points"
)

func main() {
    reward, err := points.Reward(80)
    if err != nil {
        fmt.Println(err)
        return
    }
    fmt.Println(reward)
}
```

引入路径由模块路径加包所在目录组成。这个包就在自己的模块中，工具不需要去 example.com 下载它。

在 go-course 根目录执行：

```bash
go run ./a08
```

预期输出 10。a08 负责展示，points 负责规则。后来展示方式变化时，积分规则可以继续复用。

引入包时还可以指定当前文件使用的别名，例如 `import textfmt "fmt"`，之后写 textfmt.Println。别名只改变本文件里的引用名字，不改变原包。本课程整合代码中的 `lab "programmingjourney/platformpath"` 使用同样规则。

## 怎样理解依赖

如果 A 包引入 B 包，A 就依赖 B。循环引入会让包之间的职责和编译关系无法成立，Go 会拒绝这类循环。

尽量让规则包不依赖具体命令行入口。否则 HTTP 入口想复用规则时，还会被迫依赖不相关的输入输出细节。

标准库随工具链提供；第三方库位于其他模块，通常需要版本信息。go.mod 表达依赖要求，go.sum 保存依赖内容校验信息；它们都应随自己的项目一起管理。

`go mod tidy` 按源码整理模块依赖，可能访问网络。前面只使用标准库和本模块代码，不需要为了学习而先引入框架。版本与工具行为可核对 [Go 模块管理文档](https://go.dev/doc/modules/managing-dependencies)。

## 常见命令逐个解释

| 命令 | 用途 |
|---|---|
| `go run ./a08` | 编译并运行指定目录的可执行包 |
| `go test ./points` | 执行 points 包的测试，下一课会添加 |
| `go test ./...` | 当前目录及其子目录下匹配到的包一起测试 |
| `gofmt -w points/points.go` | 按 Go 格式整理文件 |
| `go env GOMOD` | 查看工具当前识别的模块文件位置 |

`./...` 是 Go 的包路径模式，不是让你手动输入每个目录。命令的作用范围仍取决于当前目录和模块环境。

某些工作区还有 go.work，把多个模块组织在一起。课程整合实验使用 GOWORK=off 是为了独立选择该模块；理解本课的 go.mod 后再使用，不必入门时就管理多模块工作区。

## 练习与反馈

把 ScoreLabel 函数也放进 points，返回合格或未合格文本；从 a08 调用它。然后暂时改成小写，观察包外访问为什么失败。

<details>
<summary>排错方向</summary>

引入失败先检查模块名、目录名和引入路径；访问失败再检查导出名称；找不到 main 时检查正在运行的是规则包还是入口包。不要通过复制整个规则文件来绕开尚未理解的包关系。

</details>

下一课：[A09 测试与定位错误](./09_testing.md)。
