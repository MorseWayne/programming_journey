---
title: 项目结构
icon: /assets/icons/article.svg
order: 2
category:
  - Go
date: 2025-08-24
---

个人在阅读[《GO语言圣经》](https://golang-china.github.io/gopl-zh/index.html)时，并没有发现有关`GO`项目结构的过多介绍，但是我觉得在开始学习一门语言前，应该先学好如何如何管理好自己的代码，尤其是对经验丰富的程序员，这是非常重要的。对于刚接触这门语言的人，也很重要，一方面这是提前养成良好的习惯，其次也可以培养自己的分类，分层，模块化设计思想，这在一个大型项目中是非常重要的。

这里不以大型项目的项目结构设计来展开，是在有兴趣的话或者有需求的话可以参考高分开源项目 [project-layout](https://github.com/golang-standards/project-layout)，本文重点介绍一下`GO`语言本身提供的一些项目分层的设计。

## 1 `module`

`GO`的基本项目粒度管理单位是`module`，而单个`module`又是由多个`package`组成。`module`是`go 1.11`版本引入的依赖管理机制，是**一个包含`go.mod`文件的目录，用于定义项目的依赖关系和版本信息**。

我们可以实际来创建一个`module`，观察下文件目录的结构，首先在一个指定目录下，使用 `go init mod 模块名`的形式创建一个`module`，使用`tree`命令查看目录得到输出如下：

```bash
mod1
├── go.mod
└── pkg1
    └── add.go
```

根据上面的信息，我们可以看到，在`module`的根目录下，有一个`go.mod`, 它是用来定义当前`module`的直接依赖、版本约束和模块路径的。

## 2 `package`

**`package`是`Go`语言中代码组织的基本单位，一个包由一个或多个`.go`文件组成**，这些文件位于同一目录下，且开头都声明了相同的包名。在上一节的输出示例中，有一个`pkg1`目录，这就是一个`package`。`package`是为了便于项目内部的一个模块化结构，便于进行代码封装和代码复用，一般来说，`package`和一个文件夹是等价的。

::: tip

通常情况下，一个目录下只能有一个`package`，但是为了方便区分测试代码和功能代码，允许出现一个test包，这个包名的组成是 `目录名_test`的文件，但是声明这个package的文件必须是`*_test.go`这种带特殊命名后缀的文件, 例如下面这个结构

```go
mod2
├── go.mod
├── go.sum
├── pkg2
│   ├── multi.go
│   └── multi_test.go
└── test.go
```

其中 `multi.go` 声明自己所属的包是 `pkg2`， `multi_test.go`声明自己所属的包是`pkg2_test`

:::

## 3 什么是`workspace`

`workspace`是多个`module`的集合，并且通过`workspace`, 可以维护这些`module`间的一个依赖关系。

一个简单的示例如下：

首先，我们在之前的基础上，使用`go init`命令再创建一个`module`，存在在`mod1`目录下，整个项目的目录结构如下：

```bash
├── mod1
│   ├── go.mod
│   └── pkg1
│       └── add.go
└── mod2
    ├── go.mod
    ├── go.sum
    ├── pkg2
    │   ├── multi.go
    │   └── multi_test.go
    └── test.go
```

每个模块都有自己独立的`go.md`, 为了将他们集中管理，我们再创建一个`workspace`

```bash
wayne@server:~/source/practice/go$ go work init mod1 mod2
wayne@server:~/source/practice/go$ tree
.
├── go.work
├── mod1
│   ├── go.mod
│   └── pkg1
│       └── add.go
└── mod2
    ├── go.mod
    ├── go.sum
    ├── pkg2
    │   ├── multi.go
    │   └── multi_test.go
    └── test.go

4 directories, 8 files
```

我们会发现，在和`module`同级的目录多了一个`go.work`文件，其内容如下：

```go
go 1.25.0

use (
	./mod1
	./mod2
)

```

如果项目中，有多个内部的`module`依赖，这是必要的，只有在`workspace`定义依赖关系，实际`import`时才能正确导入所依赖的`package`，不然`go`的编译器会在`GOROOT`的路径下面去找，或者是在远程仓库(例如`github`)去找，这样就达不到我们的目的。

## 4 依赖引用

代码完整目录结构如下([完整代码示例查看](https://github.com/MorseWayne/practice/tree/main/go/project_layout_example))：

```bash
.
├── go.work
├── mod1
│   ├── go.mod
│   ├── pkg1
│   │   └── add.go
│   └── pkg2
│       └── add_test.go
└── mod2
    ├── go.mod
    ├── go.sum
    ├── pkg1
    │   ├── multi.go
    │   └── multi_test.go
    └── test.go

```

### 4.1 同module的package间导入

创建一个名为`mod1`的`module`，其工程目录如下：

```bash
├── go.mod
├── pkg1
│   └── add.go
└── pkg2
    └── add_test.go
```

`go.mod`是模块名的定义：

```
module mod1

go 1.25.0
```

`add.go`在名为`pkg1`的`package`下，我们在其中定义一个Add函数(大写开头自动导出)，文件内容如下：

```bash
package pkg1

func Add(a, b int) int {
	return a + b
}
```

我们在另外一个`package`目录下再创建一个`add_test.go`，用于引用`pkg1`的`Add`方法进行测试，文件内容如下：

```bash
package pkg2

import (
	"testing"
	"mod1/pkg1" // 导入mod1的pkg1
)

func TestAdd(t *testing.T) {
	a := pkg1.Add(1, 2)
	if a != 3 {
		t.Errorf("Add(1, 2) = %d; want 3", a)
	}
}
```

注意在导入时，不能使用相对路径导入，只能是`module名 + 包路径信息`的形式。

### 4.2 跨module的package导入

#### **场景一**：从非远端仓库`import`，即引用项目内的`module`的`package`

方式和4.1小节相同，关键在于要合理配置`workspace`，需要将相互依赖的模块添加到工作区，假如`mod1`和`mod2`有依赖关系，定义`go.work`如下：

```bash
go 1.25.0

use (
	./mod1
	./mod2
)
```

#### **场景二**：从远端仓库`import`

需要在`go.mod`里面使用`require`关键字定义依赖，并且还需使用`go get`拉取相关代码缓存，下面是以 `github`远端仓库的`uuid`使用为示例`github.com/google/uuid`。

`go.mod`配置如下：

```go
module mod2

go 1.25.0

require github.com/google/uuid v1.6.0 // 写明依赖的模块名和版本信息
```

然后还需手动使用`go get`安装这个依赖包，示例命令如下：

```bash
go get -u github.com/google/uuid
```

一般在国内可能存在访问异常的问题，出现问题时大家可以按照如下进行配置了`GOPROXY`后再重新执行`go get`

```bash
go env -w GOPROXY=https://goproxy.cn,direct
```