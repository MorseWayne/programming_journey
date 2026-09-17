---
title: map 从基础到实战
icon: /assets/icons/article.svg
order: 4
category:
  - Go
date: 2026-09-14
---

> **本章解决什么：** 用“键 → 值”快速查找数据，例如按用户名查成绩。
>
> **读前准备：** 已会变量、切片和 `if`。首次阅读先掌握创建、读写、`value, ok`、删除和遍历；比较、复制、嵌套、并发和集合属于写过几次 `map` 之后的第二阶段内容。

切片用 `0、1、2` 这样的下标查找元素。如果希望直接通过 `"小李"` 查成绩，就需要 `map`。本章片段分别放进 `main` 运行；使用打印时导入 `fmt`。结构体和并发小节写有额外前置知识，读到相应课程后再回来运行。

## 1. 核心概念

`map` 是按“**键 → 值**”保存和查找数据的集合，适合用户 ID、名称、配置名、单词等作为索引的场景。

键是查找用的标识，值是该标识对应的数据。每个键只对应一个值，再次写同一个键会替换原值；不同键可以拥有相同的值。`map[string]int` 表示“用字符串查整数”。

```go
scores := map[string]int{
    "小李": 85,
    "小王": 92,
}

fmt.Println(scores["小李"]) // 85
```

类型形式：

```text
map[键类型]值类型
```

例如：

```text
map[string]int       字符串 → 整数
map[int]string       整数 → 字符串
map[string][]string  字符串 → 字符串列表
```

---

## 2. 键的要求

键必须是**可比较**的，即能用 `==` 判断是否相等。

入门最常用的是 `string`、`int`；`bool` 也可做键。数组要求元素可比较，例如 `[2]int` 可以、`[2][]int` 不行。学过结构体后，再使用字段全部可比较的结构体做键；指针也可做键，但比较的是地址，不是对象内容。

不能做键：

```text
[]int               // 切片
map[string]int      // map
func()               // 函数
```

### 第二遍：`map` 的比较限制

`map` 本身也不能彼此用 `==` 比较，只能与 `nil` 比较：

```go
left := map[string]int{"a": 1}
right := map[string]int{"a": 1}

// left == right // 编译错误：map 只能与 nil 比较
fmt.Println(left == nil) // false
```

若需要比较内容，应逐项比较；Go 1.21 起，导入 `maps` 后，值类型可比较时也可使用 `maps.Equal(left, right)`。

---

## 3. 创建与初始化

### 字面量

```go
scores := map[string]int{
    "小李": 85,
    "小王": 92,
}
```

创建空 `map`：

```go
scores := map[string]int{}
```

### `make`

```go
scores := make(map[string]int)
scores["小李"] = 85
```

若预估会存很多条数据，可以提供容量提示：

```go
users := make(map[int]string, 1000)
```

这里的 `1000` 只是容量提示，`len(users)` 仍然是 `0`；它可以减少大量写入时的内部扩容开销。
它不是元素数量上限，仍可继续写入更多元素。

### `nil map`

```go
var scores map[string]int
```

`nil map` 的规则：

`nil` 表示还没有初始化可写的映射；`len(scores)` 是已经存入的键值对数量，`delete` 用于删除键（第 7 节详述）。

```go
fmt.Println(scores["小李"]) // 可以读，得到 int 的零值 0
fmt.Println(len(scores))     // 可以，得到 0
delete(scores, "小李")        // 可以，不会发生任何事

// scores["小李"] = 85       // 不可以：运行时 panic
```

**记忆：`nil map` 能读、能删、能遍历，不能写。**

---

## 4. 写入、修改与读取

```go
scores := make(map[string]int)

scores["小李"] = 85 // 键不存在：新增
scores["小李"] = 90 // 键已存在：覆盖旧值

score := scores["小李"] // 读取，得到 90
```

写入和修改使用同一语法：

```go
m[key] = value
```

---

## 5. 键不存在：零值与 `value, ok`

读取不存在的键不会报错，而是返回值类型的零值：

```go
scores := map[string]int{"小李": 85}
fmt.Println(scores["小王"]) // 0
```

这会产生歧义：`0` 可能表示“小王不存在”，也可能表示“小王的分数确实为 0”。

因此需要判断存在性时使用：

```go
score, ok := scores["小王"]
if !ok {
    fmt.Println("没有这条记录")
    return
}
fmt.Println(score)
```

`if 条件 { ... }` 表示条件为真时执行；`!ok` 是“`ok` 为假”。这里先处理不存在的情况，后面的 `fmt.Println(score)` 就只会在键存在时执行。

- `score`：查到的值；不存在时为零值。
- `ok`：键是否真正存在。

只关心存在性：

```go
if _, ok := scores["小李"]; ok {
    fmt.Println("存在")
}
```

这里 `_` 丢弃分数。`if 初始化语句; 条件` 先取值，再判断 `ok`；这个 `ok` 只在该 `if` 及其 `else` 范围内有效。刚开始也可拆成先赋值、再 `if ok` 的两行。

---

## 6. 计数器：常见用途

有了“缺失键读到零值”的规则，就能边遍历边累计。`for _, word := range words` 每次取出列表中的一个单词，忽略其下标；`++` 表示加一：

```go
words := []string{"go", "java", "go", "python", "go"}
counts := make(map[string]int)

for _, word := range words {
    counts[word]++
}

fmt.Println(counts)
```

`counts[word]++` 之所以能直接用于第一次出现的单词，是因为不存在的 `int` 值读取为 `0`，加一后自然成为 `1`。

---

## 7. 删除与清空

删除一个键：

```go
delete(scores, "小李")
```

删除不存在的键是安全的，不会报错。

清空全部键值对：

```go
clear(scores)
```

`clear` 自 Go 1.21 可用。如果原来是已初始化的 `map`，清空后仍可继续写入；如果原来是 `nil`，清空后仍为 `nil`，不会顺便初始化。若需要置为 `nil`：

```go
scores = nil
```

---

## 8. 遍历：顺序不保证

遍历键和值：

```go
for name, score := range scores {
    fmt.Println(name, score)
}
```

`for ... range` 会逐个遍历集合；这里每次循环得到一组键和值。它是读取全部成绩的常用写法，暂时只需记住这种形式即可。

只遍历键：

```go
for name := range scores {
    fmt.Println(name)
}
```

只遍历值：

```go
for _, score := range scores {
    fmt.Println(score)
}
```

> `map` 的遍历顺序不固定，不能依赖输出、业务逻辑或测试中的遍历顺序。

若需要稳定顺序，应先取出键、排序、再读取。下面需额外导入 `sort`，`sort.Strings` 会把字符串切片按顺序排好：

```go
names := make([]string, 0, len(scores))
for name := range scores {
    names = append(names, name)
}

sort.Strings(names)
for _, name := range names {
    fmt.Println(name, scores[name])
}
```

---

## 9. 第二遍：赋值和传参会共享同一个 `map`

```go
func addScore(scores map[string]int) {
    scores["小李"] = 90
}

scores := map[string]int{"小李": 85}
addScore(scores)
fmt.Println(scores["小李"]) // 90
```

Go 的参数传递始终是值传递；这里复制的是 `map` 值，而该值仍指向同一份映射数据，所以函数能直接修改调用方看到的内容。若需要独立副本，应显式复制：

```go
clone := make(map[string]int, len(scores))
for key, value := range scores {
    clone[key] = value
}
```

Go 1.21 起也可以使用标准库 `maps` 包：

```go
import "maps"

clone := maps.Clone(scores)
```

以上都是**浅拷贝**：如果值本身是切片、指针或 `map`，其内部数据仍可能共享。

### 修改内容与重新赋值不同

```go
scores := map[string]int{"小李": 85}
alias := scores
scores = make(map[string]int)
fmt.Println(len(scores), alias["小李"]) // 0 85
```

重新赋值只改变 `scores` 这个变量；`alias` 仍指向原映射。相反，`clear(alias)` 会清空原映射，所有仍引用它的变量都会看到空内容。函数参数也一样：函数内 `scores = make(...)` 不会替调用方换掉它的变量。

---

## 10. 第二遍：嵌套 `map`：内层也必须初始化

错误示例：

```go
scores := make(map[string]map[string]int)
// scores["一班"]["小李"] = 85 // 内层 map 为 nil，运行时 panic
```

正确写法：

```go
scores := make(map[string]map[string]int)

if scores["一班"] == nil {
    scores["一班"] = make(map[string]int)
}
scores["一班"]["小李"] = 85
```

---

## 11. 第二遍：`map` 中的结构体：不能直接改字段

先学习[结构体与指针](./struct_method_pointer_receiver.md)再读本节：结构体把名字、年龄等字段组成一个值，`*User` 则表示指向这个值的指针。

```go
type User struct {
    Name string
    Age  int
}

users := map[int]User{
    1: {Name: "小李", Age: 20},
}

// users[1].Age = 21 // 编译错误
```

正确方式一：取出、修改、写回。

```go
user := users[1]
user.Age = 21
users[1] = user
```

正确方式二：若需要频繁修改，值使用指针。

```go
users := map[int]*User{
    1: {Name: "小李", Age: 20},
}
users[1].Age = 21
```

指针方案仍需检查键是否存在且指针不为 `nil`；`users[99]` 得到空指针，继续访问 `.Age` 会 panic。保存指针也不会自动使对象的修改具备并发安全性。

---

## 12. 第二遍：并发安全：普通 `map` 不能无保护地并发读写

本节在学过结构体、指针接收者和 goroutine 后阅读。goroutine 是可独立运行的执行流程；当多个流程访问同一数据时，需要约定访问顺序。先记住下一段边界，锁的完整用法在并发课程展开。

多个 goroutine **只读**同一个、且没有任何写入的普通 `map` 是安全的；一旦有 goroutine 写入，所有同时发生的读或写都必须同步。否则会产生数据竞争，并可能触发运行时错误。

下面导入 `sync`，使用读写锁 `sync.RWMutex`：写入时独占，读取时允许多个只读调用并行。`Counter` 的零值也应该能使用，所以第一次写入时在锁内初始化内部 `map`：

```go
type Counter struct {
    mu     sync.RWMutex
    counts map[string]int
}

func (c *Counter) Add(key string) {
    c.mu.Lock()
    defer c.mu.Unlock()
    if c.counts == nil {
        c.counts = make(map[string]int)
    }
    c.counts[key]++
}

func (c *Counter) Get(key string) int {
    c.mu.RLock()
    defer c.mu.RUnlock()
    return c.counts[key]
}
```

- 修改：`Lock` / `Unlock`
- 只读：`RLock` / `RUnlock`

现在 `var counter Counter; counter.Add("go")` 可以正常工作。读零值 `Counter` 得到 `0`；使用后不要复制它（其中的锁不能复制）。删除、清空和遍历共享映射同样要使用对应的锁，不能只保护这里的两个方法。

`sync.Map` 面向特定并发使用模式，例如键基本只写一次而大量读取，或多个 goroutine 操作互不重叠的键。它不提供普通 `map` 的类型化 API，也不应成为默认替代品；多数业务代码中，`map + sync.RWMutex` 更直接、可控。

---

## 13. 第二遍：性能与工程实践

1. **数据量可预估时，给 `make` 容量提示。**

   ```go
   users := make(map[int]User, expectedUserCount)
   ```

2. **不要把 `map` 当有序容器。**若必须保持顺序，使用切片；若还要按键快速查询，可同时维护切片和 `map` 索引。

3. **连续且范围较小的整数索引，切片通常更合适。**

   ```go
   scores := make([]int, 101)
   scores[42] = 95
   ```

4. **大量删除后，内部内存不一定立即缩小。**长期运行的服务若 `map` 曾异常膨胀且后续数据很少，可在确有内存问题时重建：

   ```go
   compact := make(map[string][]byte, len(cache))
   for key, value := range cache {
       compact[key] = value
   }
   cache = compact
   ```

   直接赋值成空 `map` 会丢掉仍需要的条目，因此这里先复制。其他变量若还引用旧映射，其内存仍可能保留；并发情况下必须同步这次重建。是否值得优化应先测量。

5. **遍历中删除尚未访问的键时，该键不会被访问；遍历时新插入的键本轮是否会被访问并不确定。**不要依赖这种行为。

---

## 14. 第二遍：用 `map` 实现集合（Set）

Go 没有内置 `set`，常用：

```go
set := make(map[string]struct{})
```

```go
set["go"] = struct{}{} // 加入
_, ok := set["go"]     // 判断存在
delete(set, "go")       // 删除
```

`struct{}` 是没有字段的结构体类型，`struct{}{}` 是它的一个值；两组花括号分别用于类型和字面量。学过结构体后再运行本节。这里不需要保存额外内容，只关心键是否存在。

保持原顺序的去重示例：

`continue` 表示跳过当前这轮剩余语句，直接处理下一个名字。

```go
names := []string{"小李", "小王", "小李", "小赵"}

seen := make(map[string]struct{}, len(names))
unique := make([]string, 0, len(names))

for _, name := range names {
    if _, ok := seen[name]; ok {
        continue
    }
    seen[name] = struct{}{}
    unique = append(unique, name)
}

fmt.Println(unique) // [小李 小王 小赵]
```

---

## 15. 最小语法清单

```go
// 创建
m := make(map[string]int)
m = map[string]int{}

// 写入或更新
m["小李"] = 85

// 读取
score := m["小李"]

// 判断存在性
score, ok := m["小李"] // score 已存在，但 ok 是新变量，允许使用 :=

// 删除与清空
delete(m, "小李")
clear(m)

// 遍历（顺序不固定）
for key, value := range m {
    fmt.Println(key, value)
}
fmt.Println(score, ok) // 使用上面的读取结果
```

## 16. 核心总结

1. `map` 适合用 ID、名称、配置名等键快速查值。
2. 写入前必须初始化；`nil map` 只能读、删、遍历，不能写。
3. 不存在的键读取到零值；需要区分“零值”和“不存在”时，用 `value, ok`。
4. 遍历顺序不保证固定。
5. 传参和赋值会共享同一个 `map`；要隔离就显式复制，`maps.Clone` 也是浅拷贝。
6. 多 goroutine 只读可以；只要存在并发写入，普通 `map` 的读写都必须同步。

### 自测

`scores := map[string]int{"小李": 0}` 中，读取 `scores["小李"]` 和 `scores["小王"]` 都是 `0`，为什么不能据此判断是否存在？

答案：需要看第二个结果。`scores["小李"]` 的 `ok` 为 `true`，`scores["小王"]` 的 `ok` 为 `false`。值等于零与键不存在是不同状态。

映射的零值与共享行为可参照 [Go maps in action](https://go.dev/blog/maps)；锁的零值及不可复制要求见 [`sync.RWMutex`](https://pkg.go.dev/sync#RWMutex)。
