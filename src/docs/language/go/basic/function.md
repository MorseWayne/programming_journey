---
title: 函数使用技巧
icon: /assets/icons/article.svg
order: 3
category:
  - Go
---

本章谈一谈阅读了[GO语言圣经](https://golang-china.github.io/gopl-zh/ch5/ch5.html)之后，关于GO函数使用区别于其他语言的一些体会。

## 1 基本范式

go里面函数的基本声明范式如下：

```go
func name(parmeter-list) (result-list) {
    body
}
```

这一点命名风格，有点和`Rust`和`Javascript`接近，函数的返回值是紧跟再参数列表后的。`parmeter-list` 和 `result-list` 都可以省略，前者省略代表不需要函数参数，后者省略代表没有返回值。

## 2 形参声明的技巧

### 2.1 参数合并

对于参数列表，相邻的同类型参数可以进行合并声明

```go
func f(i, j, k int, s, t string)                 { /* ... */ }
func f(i int, j int, k int,  s string, t string) { /* ... */ }
```

### 2.2 参数忽略

由于GO对不使用的变量的检查非常严格，某些场景下你可以定义一些形参，但是永远都不会使用，我们可以使用空白标识符(blank identifier)`_`来进行占位
例如：

```go
// 部分参数省略
func test(x int, _ int) { /* ... */ }

// 省略所有参数
func test(int, int) { /* ... */ }
```

## 3 函数的多返回值

从声明范式不难看出，返回值可以是一系列的值，但是声明返回值需要用括号对返回的类型列表进行包裹，比如：

```go
func test(a, b int) (int, int) {
 return a, b
}

// 函数调用示例
val1, val2 := test(0, 0)
```

## 4 错误处理

### 4.1 控制流风格

个人觉得这一点还是“后生” `Rust` 更加优雅，GO里面还是典型的控制流异常处理风格，类`C`或者`C++`(听说是作者为了方便定位问题故意这么设计的😂)，
代码示例如下：

```go
func test() (int,int) {
    resp, err := myfunc()
    if err != nil {
        return nil, err
    }
    // continue do something
}
```

我们可以对比看下`Rust`里面的风格是更加优秀的，一旦异常分支多了，下面这种写法的优势就更加明显了：

```rust
fn test() -> Result<(), Box<dyn Error>> {
    let resp = myfunc()?;
    // continue do something
    Ok(())
}
```

### 4.2 panic使用

`panic`是GO编程里面，用于表示程序发生重大错误的一个方式，执行完panic操作后，当panic异常发生时，程序会中断运行，并立即执行在该goroutine中被延迟的函数（[defer 机制](/docs/language/go/basic/function.md#_8-延迟调用-defer-function-call)）。由于panic在没有被显示处理的情况下会导致进程退出，所以慎用！

简单示例：

```go
package main

import "fmt"

func startTrace() func() {
 println("enter")
 return func() {
  println("exit")
 }
}

func test(ptr *int) {
 if ptr == nil {
  panic("pis is null")
 }
 fmt.Println("hello world")
}

func main() {
 test(nil)
}
```

运行该代码，获得输出如下，我们将看到异常打印信息和栈信息，以及发生异常的代码行：

```go
wayne@server:~/source/practice/go/temp$ go run main.go 
panic: pis is null

goroutine 1 [running]:
main.test(0xc000002380?)
        /home/wayne/source/practice/go/temp/main.go:14 +0x65
main.main()
        /home/wayne/source/practice/go/temp/main.go:20 +0x15
exit status 2
```

### 4.3 异常捕获

`GO`语言提供了`recover`函数为开发者预留了处理`panic`这种`fatal error`的严重错误的方式。一般来说，是不建议处理`panic`的，因为这会引发很多的资源使用的问题，所以要选择性的使用recover，而不是盲目的使用。

下面是一个简单捕获panic的示例：

```go
package main

func test(ptr *int) {
	if ptr == nil {
		panic("pis is null")
	}
}

func getDeferFunc() func() {
	return func() {
		switch err := recover(); err {
		case nil:
			println("no err.")
		case "pis is null":
			println("fatal err!")
		default:
			panic(err)
		}
	}
}

func case1Test() {
	defer getDeferFunc()()
	print("case1: ")
	test(nil)
}

func case2Test() {
	defer getDeferFunc()()
	print("case2: ")
	test(new(int))
}

func main() {
	case1Test()
	case2Test()
}

```

## 5 函数值(Funciton values)

第一次可能听起来比较陌生，简单来说，这个`GO`里面的像`C++`语言的函数指针语义，有点类似于C++里面的函数对象 `std::function`,
本质上就是对于GO里面定义的函数可以把它当作一个值赋值给其他变量，且这个变量是可调用(`callable`)的。话不多说，show you the code:

```go
package main

import "fmt"

func printSth(val int) {
	fmt.Println("val: ", val)
}

func main() {
	var f = printSth
	f(10)
}
// output
val: 10
```

不得不说，这一点还是比较方便的。

## 6 匿名函数(Anonymous Functions)

匿名函数其实就是其他编程语言讲的函数闭包(`closures`)， 类似于`C++`的`lamda`表达式，闭包包含了一个函数的行为以及函数依赖的数据，由于这个函数在定义的时候没有函数名，所以叫**匿名函数**，

```go
var f = func(val int) { fmt.Println("val: ", val) }
f(10) // output: val: 10
```

不过，需要注意的点是，对于闭包外部变量的捕获，是一个引用，这是因为`GO`的`GC`机制，由于闭包对外部变量进行了捕获，导致其生命周期延长(这个行为也叫变量的逃逸)，所以一定要注意闭包的重入性设计，典型示例如下：

```go
package main

import "fmt"

func main() {
	var x int
	var f = func() int {
		x++
		return x * x
	}

	fmt.Println(f()) // 打印 "1"
	fmt.Println(f()) // 打印 "4"
	fmt.Println(f()) // 打印 "9"
	fmt.Println(f()) // 打印 "16"
}
```

也许上面的看起来还不是很奇怪，不过再换一种形式，可能就会给`C++`开发者一些小小的震撼了：

```go
package main

import "fmt"

func getFunc() func() int {
	var x int
	return func() int {
		x++
		return x * x
	}
}

func main() {

	var f = getFunc()
	fmt.Println(f()) // 打印 "1"
	fmt.Println(f()) // 打印 "4"
	fmt.Println(f()) // 打印 "9"
	fmt.Println(f()) // 打印 "16"
}
```

上面这个示例，`x`是放在了一个局部函数里面，由于将其作为闭包的数据返回了出去，导致`x`逃逸，也是说，`x`实际是分配在堆上的。

## 7 可变参数

`GO`的可变参数与`C++`的参数包的概念类似，都是为了提供一个灵活接收任意同类型参数的声明方式。
使用方法，在最后一个参数类型之前加上`...`,

**示例1，简单使用：**

```go
func sum(vals ...int) int {
	ans := 0
	for _, val := range vals {
		ans += val
	}
	return ans
}

func main() {
	fmt.Println(sum(1))
	fmt.Println(sum(1, 2))
	fmt.Println(sum(1, 2, 3))
}
```

**示例2，可变参数展开**

下面这个代码递归展开一个可变参数包

```go
func recursive(val int, vals ...int) {
	println(val)
	if len(vals) > 0 {
		recursive(vals[0], vals[1:]...)
	} else {
		println("exit!")
	}
}

func main() {
	recursive(1, 2, 3, 4)
}
```

程序将会有如下输出：

```bash
1
2
3
4
exit!
```

## 8 延迟调用(Defer function call)

在`GO`里面首次学到也是耳目一新，这个感觉这是`RAII`编程在语言的语法层面的一种优秀实现，先看一个简单的使用示例：

```go
func main() {
    fmt.Println("A")
    defer fmt.Println("B")  // 延迟到 main 返回前执行
    fmt.Println("C")
}
```

打印顺序：`A, C, B`。

不难看出，其主要作用就是执行`defer`所在语句行后面指定的函数，执行的时机是在函数返回时执行，无论是`return`的方式退出，还是程序以`panic`的异常方式退出。

### 8.1 使用限制

`GO`语言规范里面表明：`defer`后面绑定的只能是函数调用的表达式，不支持其他表达式，比如

```go
var x int
defer x++ // compile error
```

### 8.2 defer的参数求值时机

看一个非常典型的例子，这是一个对函数调用开始和结束的trace的简易实现

```go
package main

func startTrace() func() {
 println("enter")
 return func() {
  println("exit")
 }
}

func main() {
 defer startTrace()()
 println("do sth")
}
```

你将会看到程序输出如下：

```bash
enter
do sth
exit
```

简单理解，defer会将后面的表达式转换为`函数 + (求值后的参数快照)` 的形式，在这个例子中

`startTrance()()`被转换成了 **返回的匿名函数** 被`defer`挂起，你可能还是不理解，我再举个例子

如果你有一个函数设计并且做了很复杂的defer绑定：

```go
func getFunc() func() func() func() func() {
 return func() func() func() func() {
  return func() func() func() {
   return func() func() {
    return func() {
     println("hello")
    }
   }
  }
 }
}

func main() {
 defer getFunc()()()()()
 println("do sth")
}
```

 `getFunc()()()()()` 其实可以被拆解为 `getFunc()()()()` + `()`，当然，编译器背后的逻辑很复杂，你知道最终的结果是这么回事儿就好了。

### 8.3 多个defer下的执行顺序

由于defer的底层编译器实现是LIFO，也就是按照声明的顺序入栈，所以，如果后声明的defer绑定会在函数退出时先执行，示例如下：

```go
func main() {
    defer fmt.Println("1")
    defer fmt.Println("2")
    defer fmt.Println("3")
}
// 输出顺序： 3, 2, 1
```
