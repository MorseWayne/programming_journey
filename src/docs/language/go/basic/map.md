---
title: map 从基础到实战
icon: /assets/icons/article.svg
order: 4
category:
  - Go
date: 2026-09-14
---

## 1. 核心概念

`map` 是按“**键 → 值**”保存和查找数据的集合，适合用户 ID、名称、配置名、单词等作为索引的场景。

```go
scores := map[string]int{
    "小李": 85,
    "小王": 92,
}

fmt.Println(scores["小李"]) // 85
```

类型形式：

```go
map[键类型]值类型
```

例如：

```go
map[string]int
map[int]string
map[string]User
map[string][]string
```

---

## 2. 键的要求

键必须是**可比较**的，即能用 `==` 判断是否相等。

可以做键：

```go
string、int、bool、指针、数组、只含可比较字段的结构体
```

不能做键：

```go
[]int               // 切片
map[string]int      // map
func()               // 函数
```

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

### `nil map`

```go
var scores map[string]int
```

`nil map` 的规则：

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

- `score`：查到的值；不存在时为零值。
- `ok`：键是否真正存在。

只关心存在性：

```go
if _, ok := scores["小李"]; ok {
    fmt.Println("存在")
}
```

---

## 6. 计数器：常见用途

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

`clear(scores)` 后 `scores` 仍然是已初始化的 `map`，不是 `nil`。若需要置为 `nil`：

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

若需要稳定顺序，应先取出键、排序、再读取：

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

## 9. 引用语义：赋值和传参会共享数据

```go
func addScore(scores map[string]int) {
    scores["小李"] = 90
}

scores := map[string]int{"小李": 85}
addScore(scores)
fmt.Println(scores["小李"]) // 90
```

函数拿到 `map` 后能直接修改调用方的数据。若需要独立副本，应显式复制：

```go
clone := make(map[string]int, len(scores))
for key, value := range scores {
    clone[key] = value
}
```

也可以使用：

```go
clone := maps.Clone(scores)
```

以上都是**浅拷贝**：如果值本身是切片、指针或 `map`，其内部数据仍可能共享。

---

## 10. 嵌套 `map`：内层也必须初始化

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

## 11. `map` 中的结构体：不能直接改字段

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

---

## 12. 并发安全：普通 `map` 不能无保护地并发读写

普通 `map` 在多个 goroutine 同时读写时会发生数据竞争，甚至可能触发运行时错误。

常见做法是配合 `sync.RWMutex`：

```go
type Counter struct {
    mu     sync.RWMutex
    counts map[string]int
}

func (c *Counter) Add(key string) {
    c.mu.Lock()
    defer c.mu.Unlock()
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

`sync.Map` 面向特定并发使用模式，不是普通 `map` 的默认替代品；多数业务代码中，`map + sync.RWMutex` 更直接、可控。

---

## 13. 性能与工程实践

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
   cache = make(map[string][]byte, expectedSize)
   ```

5. **遍历中删除已有键是允许的；遍历时新插入的键本轮是否会被访问并不确定。**不要依赖这种行为。

---

## 14. 用 `map` 实现集合（Set）

Go 没有内置 `set`，常用：

```go
set := make(map[string]struct{})
```

```go
set["go"] = struct{}{} // 加入
_, ok := set["go"]     // 判断存在
delete(set, "go")       // 删除
```

`struct{}` 没有字段，适合表示“只关心键是否存在”。

保持原顺序的去重示例：

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
score, ok := m["小李"]

// 删除与清空
delete(m, "小李")
clear(m)

// 遍历（顺序不固定）
for key, value := range m {
    fmt.Println(key, value)
}
```

## 16. 核心总结

1. `map` 适合用 ID、名称、配置名等键快速查值。
2. 写入前必须初始化；`nil map` 只能读、删、遍历，不能写。
3. 不存在的键读取到零值；需要区分“零值”和“不存在”时，用 `value, ok`。
4. 遍历顺序不保证固定。
5. 传参和赋值通常共享同一个 `map`；要隔离就显式复制。
6. 普通 `map` 不能被多个 goroutine 无保护地同时读写。
