---
title: 数组、切片与底层数组关系
icon: /assets/icons/article.svg
order: 3
category:
  - Go
date: 2026-09-09
---

> **本章解决什么：** 用一组同类型数据表示列表，并理解为什么切片有时会共享同一份数据。
>
> **读前准备：** 已会变量、基本类型和下标访问。首次阅读先掌握数组与切片的区别、切片字面量、`make`、`append` 和 `len`；容量、三下标切片、内存保留等内容可在写过列表操作后第二遍阅读。

> 直觉模型：**数组是一整块固定长度的数据；切片是查看或操作其中一段连续数据的窗口。**
>
> 数组赋值会复制元素；切片赋值、切片截取通常只复制“窗口信息”，因此可能共享同一底层数组。

---

## 1. 数组（array）

数组的长度固定，且**长度属于类型的一部分**。

```go
var a [3]int
fmt.Println(a) // [0 0 0]
```

常见初始化方式：

```go
a := [3]int{10, 20, 30}      // 明确指定长度
a2 := [...]int{10, 20, 30}  // 由元素数量推断长度，仍然是数组

a3 := [5]int{
    0: 10,
    3: 40,
} // [10 0 0 40 0]
```

数组下标从 `0` 开始：

```go
a := [3]int{10, 20, 30}
a[1] = 99
fmt.Println(a) // [10 99 30]
```

### 数组的复制语义

数组赋值会复制全部元素：

```go
a := [3]int{1, 2, 3}
b := a
b[0] = 99

fmt.Println(a) // [1 2 3]
fmt.Println(b) // [99 2 3]
```

因此 `[3]int` 和 `[4]int` 是不同类型，不能直接互相赋值。

---

## 2. 切片（slice）的初始化

切片类型中没有长度：`[]int`、`[]string` 等。它的长度可以变化。

### 2.1 切片字面量

```go
nums := []int{10, 20, 30}
names := []string{"张三", "李四"}
```

与数组对比：

```go
[3]int{1, 2, 3} // 数组
[]int{1, 2, 3}  // 切片
```

### 2.2 `nil` 切片与空切片

```go
var a []int      // nil 切片
b := []int{}     // 空切片
c := make([]int, 0) // 空切片

fmt.Println(len(a)) // 0
fmt.Println(a == nil) // true
fmt.Println(b == nil) // false
```

它们都能安全遍历、读取长度和 `append`。首次阅读可先把它们都当作“没有元素的切片”；一般没有元素时直接使用 `nil` 即可。与 JSON 等接口交互时才需要区分：`nil` 常编码为 `null`，空切片常编码为 `[]`。

### 2.3 `make`

语法：

```go
make([]T, 长度)
make([]T, 长度, 容量)
```

```go
nums := make([]int, 3)
fmt.Println(nums)      // [0 0 0]
fmt.Println(len(nums)) // 3
fmt.Println(cap(nums)) // 3

scores := make([]int, 2, 5)
fmt.Println(scores)      // [0 0]
fmt.Println(len(scores)) // 2
fmt.Println(cap(scores)) // 5
```

**重要：** `make([]int, 3)` 创建的是已有 3 个零值元素的切片，不是“预留 3 个空位”。

`make` 创建的是切片本身，不是数组；数组应使用数组字面量或 `var a [N]T` 声明。

如果意图是预留空间后再追加，写：

```go
nums := make([]int, 0, 3)
nums = append(nums, 10, 20, 30)
fmt.Println(nums) // [10 20 30]
```

不要误写为：

```go
nums := make([]int, 3)
nums = append(nums, 10, 20, 30)
// [0 0 0 10 20 30]
```

---

## 3. `append` 的基础用法

`append` 在切片末尾追加元素；要接住它的返回值：

```go
nums := []int{1, 2}
nums = append(nums, 3)       // 追加一个元素
nums = append(nums, 4, 5)    // 追加多个元素
```

追加另一个切片的所有元素，要使用 `...` 展开：

```go
a := []int{1, 2}
b := []int{3, 4, 5}
a = append(a, b...)

fmt.Println(a) // [1 2 3 4 5]
```

### 第二遍：删除元素也会改变切片长度

删除下标 `i` 的元素可将后半段前移：

```go
items := []string{"a", "b", "c"}
i := 1
items = append(items[:i], items[i+1:]...)

fmt.Println(items) // [a c]
```

`i` 必须在 `0 <= i < len(items)` 范围内。该写法通常复用底层数组，因此其他共享该数组的切片可能观察到元素被覆盖；它不是创建独立副本。Go 1.21 起，导入标准库 `slices` 后也可使用 `slices.Delete(items, i, i+1)`，但同样要接住返回的切片。

不能丢弃 `append` 的结果：

```go
// append(nums, 3) // 编译错误：append 的返回值未使用
```

原因是 `append` 可能只更新长度，也可能因容量不够而分配新的底层数组；返回值才是正确的、更新后的切片。

---

## 4. 切片的底层模型：起点、长度与容量

切片可近似理解为三项：

```text
底层数组的起始位置 + 长度 len + 容量 cap
```

```go
s := []int{10, 20, 30, 40}
fmt.Println(len(s)) // 4
fmt.Println(cap(s)) // 4
```

- `len`：当前切片中可以按下标访问的元素数量；
- `cap`：从切片起点开始，到底层数组末尾为止可容纳的最大元素数量。它限制切片可重新切到的长度，不等于当前元素个数。

---

## 5. 截取切片：`[low:high]`

规则：**包含 `low`，不包含 `high`**。

```go
arr := [4]int{10, 20, 30, 40}
s := arr[1:3]
fmt.Println(s) // [20 30]
```

还可以省略边界：

```go
nums := []int{10, 20, 30, 40}
fmt.Println(nums[:2]) // [10 20]
fmt.Println(nums[2:]) // [30 40]
fmt.Println(nums[:])  // [10 20 30 40]
```

### 截取出来的切片通常共享底层数组

```go
arr := [4]int{10, 20, 30, 40}
s := arr[1:3]
s[0] = 99

fmt.Println(arr) // [10 99 30 40]
fmt.Println(s)   // [99 30]
```

`s[0]` 对应原数组的 `arr[1]`。切片不是元素副本，只是指向原数据一段区域的窗口。

---

## 6. 切片赋值也通常共享数据

```go
a := []int{1, 2, 3}
b := a
b[0] = 99

fmt.Println(a) // [99 2 3]
fmt.Println(b) // [99 2 3]
```

`b := a` 复制的是切片描述信息，而不是底层元素。只要两者仍指向同一底层数组，通过下标修改元素就会互相可见。

---

## 7. 第二遍：`append` 与容量：何时共享、何时分离

### 7.1 容量足够：复用底层数组

```go
base := make([]int, 2, 4)
base[0], base[1] = 10, 20
next := append(base, 30)

next[0] = 99
fmt.Println(base) // [99 20]
fmt.Println(next) // [99 20 30]
```

此时 `base` 和 `next` 仍共享同一底层数组。

### 7.2 容量不足：分配新数组

```go
base := []int{10, 20}
next := append(base, 30)

next[0] = 99
fmt.Println(base) // [10 20]
fmt.Println(next) // [99 20 30]
```

当容量不够时，`append` 会分配更大的新底层数组，复制原元素，再追加。因此 `next` 通常与 `base` 分离。

**实践原则：不要假定 `append` 一定复制或一定共享。是否扩容由容量决定。**

---

## 8. 第二遍：子切片追加的陷阱与三下标切片

```go
base := []int{1, 2, 3, 4}
sub := base[:2] // len=2, cap=4
sub = append(sub, 99)

fmt.Println(base) // [1 2 99 4]
fmt.Println(sub)  // [1 2 99]
```

因为 `sub` 还有剩余容量，追加的 `99` 直接写进了 `base[2]` 的位置，覆盖了原本的 `3`。

若不希望 `sub` 的 `append` 改动 `base` 后面的元素，可用三下标切片限制容量：

```go
base := []int{1, 2, 3, 4}
sub := base[:2:2] // len=2, cap=2
sub = append(sub, 99)

fmt.Println(base) // [1 2 3 4]
fmt.Println(sub)  // [1 2 99]
```

语法：

```go
base[low:high:max]
```

其中 `max` 限制新切片的容量终点。上例中容量被限制为 2，因此再追加时必须创建新数组。三下标切片**不复制元素**：`sub[0] = x` 仍会改动 `base[0]`；它只限制后续扩展时可复用的容量。

---

## 9. 第二遍：如何创建独立副本

需要确保修改副本不影响原切片时，必须显式复制元素。

### `make` + `copy`

```go
original := []int{1, 2, 3}
clone := make([]int, len(original))
copy(clone, original)

clone[0] = 99
fmt.Println(original) // [1 2 3]
fmt.Println(clone)    // [99 2 3]
```

`copy` 返回实际复制的元素数。

### `append` 克隆

```go
clone := append([]int(nil), original...)
```

以上都是**浅拷贝**。若元素本身仍是指针、`map` 或切片，内部数据仍可能共享，需要按层级继续复制。

---

## 10. 第二遍：切片作为函数参数

函数收到的是切片描述符的副本，但其底层数组通常仍与调用方共享。

### 改元素：影响调用方

```go
func setFirst(s []int) {
    s[0] = 99
}

nums := []int{1, 2, 3}
setFirst(nums)
fmt.Println(nums) // [99 2 3]
```

### 追加元素：调用方长度不会自动更新

```go
func addNumber(s []int) {
    s = append(s, 4)
    fmt.Println("函数内：", s) // [1 2 3 4]
}

nums := []int{1, 2, 3}
addNumber(nums)
fmt.Println("函数外：", nums) // [1 2 3]
```

因为函数内更新的是自己的切片描述符副本。若函数需要让调用方获得追加后的切片，应返回它：

```go
func addNumber(s []int) []int {
    return append(s, 4)
}

nums = addNumber(nums)
```

---

## 11. 第二遍：`range` 修改元素的注意点

`range` 中的值变量是元素的副本：

```go
nums := []int{10, 20, 30}
for _, v := range nums {
    v *= 2
}
fmt.Println(nums) // [10 20 30]
```

要修改原切片，应通过下标：

```go
for i := range nums {
    nums[i] *= 2
}
fmt.Println(nums) // [20 40 60]
```

`range` 开始时会复制切片头并确定遍历次数；循环中的 `v` 仍是每个元素值的副本。遍历同一个切片时，避免随意 `append`、删除或重排它：即使底层数组被复用，迭代次数也不会随新长度增加，结果会难以直观推断。

---

## 12. 第二遍：小切片长期引用大数组的内存问题

```go
data := make([]byte, 10_000_000)
small := data[:10]
```

`small` 虽然只有 10 个字节，但仍引用大数组。只要 `small` 存活，大数组通常无法被垃圾回收。

若只需要保存这小段数据，复制出来：

```go
small := append([]byte(nil), data[:10]...)
```

---

## 13. 关键对照表

| 操作 | 是否复制元素 | 是否可能影响原数据 |
|---|---:|---:|
| `b := a`，`a` 为数组 | 是 | 否 |
| `b := a`，`a` 为切片 | 否 | 是 |
| `s := arr[1:3]` | 否 | 是 |
| `copy(dst, src)` | 是 | 后续通常不影响 |
| `clone := append([]T(nil), src...)` | 是 | 后续通常不影响 |
| `append(s, x)` | 取决于容量 | 容量够时可能影响共享数据 |
| 函数内 `s[i] = x` | 否 | 会影响调用方 |
| 函数内 `s = append(s, x)` | 取决于容量 | 调用方的长度不会自动更新 |

---

## 14. 工程实践清单

1. **数组**适合长度固定且长度有业务含义的场景；日常集合数据通常使用切片。
2. **看到切片就默认它可能共享底层数据**，除非明确做过复制。
3. 使用 `append` 时，始终接住返回值：`s = append(s, x)`。
4. 预分配空间但还没有元素时，使用 `make([]T, 0, n)`，不要写 `make([]T, n)`。
5. 函数负责扩展切片时，返回更新后的切片。
6. 不希望调用方修改内部切片时，返回副本，而不是直接暴露原切片。
7. 从大切片中留下少量长期数据时，复制小数据，避免无意保留大数组。
8. 三下标切片用于隔离后续 `append` 的容量；若要隔离元素修改，仍必须显式复制。
