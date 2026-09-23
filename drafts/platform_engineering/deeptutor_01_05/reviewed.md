# 01.05 map、结构体与指针：组织消息身份与会话状态

本章代码与输出是按规则推导的教学预期；学习时请逐步核对，并保留自己的实际结果。

## 从消息列表走向有身份的数据

上一章能保存、筛选和预览多条正文，但只用 `[]string` 还回答不了这些问题：这条消息属于哪个会话？是谁提交的？列表重新排列后，怎样找回同一条消息？修改一份会话资料，会影响哪些地方？

本章围绕三个需求递进：**按身份找数据 → 把相关字段组织起来 → 明确谁可以修改哪份状态。** 先讲 map 和结构体，再正式解释地址与指针；复杂共享放到第二遍。

先修为 01.01–01.04：普通函数、分支循环、数组切片、`len`、`make`、`append`、`copy`、`range`、值复制、UTF-8 校验。只需前几章的起步与应用部分；本章不依赖递归、闭包、方法、接口或并发。

| 层次 | 小节 | 要留下的学习成果 |
|---|---|---|
| 起步 | 一、身份与 map | 从固定位置访问改成按键查找 |
| 起步 | 二、缺失与键规则 | 区分不存在、零值和 nil |
| 起步 | 三、结构体 | 用一份值保存消息的相关字段 |
| 起步 | 四、地址与指针 | 画出变量、指针和被指向变量 |
| 应用 | 五、函数与修改责任 | 区分改副本、重绑定指针和改所指对象 |
| 应用 | 六、map 中的结构体 | 写清取出改回与指针更新 |
| 第二遍深化 | 七、嵌套共享与复制 | 明确一份“副本”独立到哪一层 |
| 综合 | 八、会话消息索引 | 按契约检查身份和状态，再修改本地记录 |
| 验收 | 九、分层练习 | 独立预测、改错和迁移需求 |

第一遍读一至六节，再做第八节的小模型；第二遍回访第七节并完成全部练习。综合程序使用只保存标量字段的消息值，让你先掌握更新边界，再思考更复杂的对象关系。

用户 `u-a`、`u-b`，会话 `c-a`、`c-b` 和消息 `m-a` 都是虚构标识。这里的成员表、消息表全部由本地程序初始化，没有网络认证、持久化或投递功能。

**代码约定：** 可创建 `im-identity` 目录，并初始化模块 `example.com/im-identity`。每个完整程序单独作为 `main.go`；类型声明和函数声明按例子放在包级，便于相互使用。片段标明所在位置及导入要求。不同小节中同名类型是独立教学版本，不要直接拼在同一个文件中。

## 一、从列表位置到按身份查找

### 1.1 位置会变，身份需要有明确的持续范围

假设列表最初是 `{"你好", "收到"}`。第一项的下标是 0；在前面插入另一条正文，原消息的位置就会改变。两个消息还可能具有相同正文，所以正文也不能天然当作唯一身份。

**标识符（ID）**是我们用来识别某个业务实体的值。本章用字符串表示它，不对它做加减运算。先区分三类标识：

| 标识 | 回答的问题 | 本章例子 |
|---|---|---|
| 用户 ID | 记录归属于哪个用户身份 | `u-a` |
| 会话 ID | 消息属于哪一组交流及其历史 | `c-a` |
| 消息 ID | 在约定范围内是哪一条消息 | `m-a` |

设备是用户使用的终端，连接是某段通信关系，会话是消息历史的归属；它们各有职责。即使早期例子只写一个字符串，也不能把这些身份混为同一种概念。

还要定义**唯一范围**。本章约定消息 ID 在单个会话内唯一，因此 `(c-a, m-a)` 与 `(c-b, m-a)` 可以是两条不同消息。创建 ID、跨节点唯一性与真实协议兼容会在后续学习；现在只使用人工给定的固定值。

### 1.2 map 把一个键关联到一个值

**键（key）**是查找依据，**值（value）**是依据这个键找到的数据。`map` 保存键到值的关联，同一张 map 中一个键最多对应一项值。

`map[string]string` 中，方括号里的第一个 `string` 是键类型，后面的 `string` 是值类型。用它建立“会话 ID → 会话标题”的表。完整程序：

```go
package main

import "fmt"

func main() {
	titles := make(map[string]string)
	titles["c-a"] = "讨论计划"
	titles["c-b"] = "学习记录"
	fmt.Println(titles["c-a"])
	fmt.Println(len(titles))
}
```

预期先打印 `讨论计划`，再打印 `2`。`make(map[string]string)` 创建可写的空 map；`titles["c-a"] = ...` 保存关联；右侧使用 `titles["c-a"]` 读取该键的值；`len(titles)` 得到当前键的数量。

对切片使用 `messages[0]`，方括号里是位置；对 map 使用 `titles["c-a"]`，方括号里是键。写法相似，查找依据不同，不能把 map 理解成要求连续整数下标的切片。

### 1.3 添加、替换与删除是三种不同变化

完整程序：

```go
package main

import "fmt"

func main() {
	titles := map[string]string{
		"c-a": "讨论计划",
		"c-b": "学习记录",
	}
	titles["c-a"] = "下周计划"
	titles["c-c"] = "资料交流"
	delete(titles, "c-b")
	delete(titles, "missing")
	fmt.Println(len(titles))
	fmt.Println(titles["c-a"])
	fmt.Println(titles["c-c"])
}
```

预期依次输出 `2`、`下周计划`、`资料交流`。`map[string]string{...}` 是 map 字面量，冒号左边是键，右边是值；每个条目以逗号分隔。

| 操作 | 键数 | 发生什么 |
|---|---:|---|
| 初始化两项 | 2 | 创建两个不同键 |
| 给已有键 `c-a` 赋值 | 2 | 替换这一个键对应的值 |
| 写入新键 `c-c` | 3 | 增加关联 |
| 删除已有键 `c-b` | 2 | 去掉关联 |
| 删除不存在的键 | 2 | 不发生变化 |

`delete` 是内置函数，不会因为键缺失而报错，也不会返回“删了几条”。如果业务必须区分“存在后删除”与“本来没有”，应在删除之前做存在性查询，下一节会讲。

删除标题表里的一个关联，不等于删除远端会话、清除所有消息或让用户退群。map 操作解决的是本地数据结构变化，业务动作需要由更完整的规则定义。

### 1.4 创建提示不是业务容量限制

`make(map[string]string, 100)` 中的 100 是初始规模提示，用于帮助实现安排存储；它不会自动让第 101 个键写入失败，也不是固定可索引范围。内置 `cap` 不接受 map，不能用它查询 map 的容量。

业务要求“最多保存 100 个会话”时，要单独判断键是否已经存在、是否会增加键数，再决定是否允许写入。替换已有键与新增键对数量的影响不同，不能见到 `len(m) == 100` 就无条件拒绝所有修改。

map 通常用于按键查找，但不能把某次快速访问当成“每次都在严格固定时间完成”的保证。键怎样映射到内部存储、冲突与规模如何影响成本，会在算法卷讲哈希结构；本章先掌握公开语言行为，不背某一版本的桶布局。

## 二、缺失、零值、nil 与键规则

### 2.1 查不到与确实为零，第一次读取可能一样

现在用 `map[string]int` 保存每个会话的本地草稿数量。`c-a` 明确登记为 0；`c-b` 没有登记。完整程序：

```go
package main

import "fmt"

func main() {
	counts := map[string]int{"c-a": 0}
	fmt.Println(counts["c-a"])
	fmt.Println(counts["c-b"])
	fmt.Println(len(counts))
}
```

预期是 `0`、`0`、`1`。读取缺失键时，map 返回值类型的零值；这里是整数 0。读取缺失键不会自动把它加入 map，因此键数仍为 1。

对于 `map[string]string`，缺失时是空字符串；对于 `map[string]bool`，缺失时是 `false`。这些值也可能是合法存储值，所以单独看值无法普遍判断键是否存在。

### 2.2 comma-ok 同时告诉你值与存在性

读取 map 可以接收两个结果：

```go
count, exists := counts["c-a"]
fmt.Println(count, exists)
```

这是 `main` 内片段，前提是 `counts` 已创建并导入 `fmt`。左边的逗号分开两个变量，第二结果是布尔值；这种形式常叫 **comma-ok**。第二个名字可以叫 `ok`、`exists` 或其他名字，名字不会改变规则。

完整程序：

```go
package main

import "fmt"

func main() {
	counts := map[string]int{"c-a": 0}
	a, aExists := counts["c-a"]
	b, bExists := counts["c-b"]
	fmt.Println(a, aExists)
	fmt.Println(b, bExists)
}
```

预期：

```text
0 true
0 false
```

| 状态 | 第一个结果 | 第二个结果 | 本题含义 |
|---|---:|---|---|
| 存在且为 0 | 0 | `true` | 已登记，没有草稿 |
| 不存在 | 0 | `false` | 尚未登记这个会话 |
| 存在且为 2 | 2 | `true` | 已登记，有两份草稿 |

成员标志也可能需要区分三个状态：键缺失表示未登记；存在且 `false` 表示本地记录为停用；存在且 `true` 表示本地记录为启用。这是本题给表定义的意义，不代表来自网络的用户身份已经可信。

### 2.3 nil map 可以读取，但不能增加键

map 变量的零值是 `nil`。完整程序先展示合法操作：

```go
package main

import "fmt"

func main() {
	var counts map[string]int
	value, exists := counts["c-a"]
	fmt.Println(counts == nil, len(counts), value, exists)
	delete(counts, "c-a")
	for key, value := range counts {
		fmt.Println(key, value)
	}

	counts = make(map[string]int)
	counts["c-a"] = 0
	fmt.Println(counts == nil, len(counts))
}
```

预期：

```text
true 0 0 false
false 1
```

`nil` map 的读取返回零值和不存在；`len` 为 0；遍历执行零轮；删除没有效果。但若在 `make` 之前写 `counts["c-a"] = 0`，会发生运行时 panic。**把零写入 nil map 也仍然是写操作。**

`map[string]int{}` 和 `make(map[string]int)` 都创建非 nil 空 map，之后可以写入。nil map 与空 map 都没有键，但可写性不同。

map 可以与 `nil` 比较，不能直接用 `a == b` 比较两个 map 的内容。也不要用 nil 自动代表读取失败：失败、未加载和成功但没有条目，需要由函数契约明确区分。

### 2.4 键必须具有可用的相等比较

map 必须能判断两次查找是不是同一个键，因此键类型需要支持 `==`、`!=` 的比较。当前已学类型中，字符串、整数和布尔值可以作为键；元素可比较的数组也可以。

下面是故意错误的声明片段：

```go
// 编译错误：切片不能作为 map 的键类型。
var index map[[]string]int
```

切片、map 和函数不能直接作为键类型。下一节会看到：结构体只有当每个字段都可比较时，才能整体比较并作为 map 键。此处不引入接口动态值的特殊规则。

可比较不等于适合业务身份。例如浮点数虽然可以作为键，但消息身份不应该依赖浮点近似数值。将 ID 保存为字符串，并明确格式与唯一范围，比把它解释为可计算的数值更符合本章需求。

### 2.5 map 遍历顺序没有规定

`for key, value := range titles` 会遍历键值关联，但 Go 不保证某种顺序，也不保证两次遍历顺序一致。它不是插入顺序，不是键排序，也不应被描述成每次都独立随机洗牌。

如果本题想按指定会话顺序展示，可显式保存顺序列表，再依次查表：

```go
package main

import "fmt"

func main() {
	titles := map[string]string{"c-b": "学习记录", "c-a": "讨论计划"}
	order := []string{"c-a", "c-b", "c-missing"}
	for _, id := range order {
		title, exists := titles[id]
		if !exists {
			fmt.Println(id, "未登记")
			continue
		}
		fmt.Println(id, title)
	}
}
```

预期：

```text
c-a 讨论计划
c-b 学习记录
c-missing 未登记
```

这里顺序来自 `order`，查找来自 `titles`。本章没有对 map 遍历输出编造固定顺序。真实消息怎样排序需要稳定的排序依据和协议，不是换成 map 就能得到。

### 2.6 map 赋值也要检查共享关系

下面是 `main` 内片段，需导入 `fmt`：

```go
counts := map[string]int{"c-a": 1}
alias := counts
alias["c-a"] = 2
fmt.Println(counts["c-a"])
alias = make(map[string]int)
alias["c-a"] = 9
fmt.Println(counts["c-a"], alias["c-a"])
```

预期先打印 `2`，再打印 `2 9`。赋值复制 map 值后，两者最初使用同一组关联；通过 `alias` 写键会影响 `counts` 读到的结果。后来把 `alias` 变量重新赋为另一张 map，不会同时替换 `counts`。

现在先记住“改共享条目”和“重新给变量赋值”这两个不同动作。第五节把它们放进函数参数模型，第七节再分析它们出现在结构体字段里时的效果。

## 三、用结构体把一条消息组织完整

### 3.1 同一条消息的字段应该一起表达

如果使用四个分开的切片，分别保存消息 ID、会话 ID、发送者和正文，就必须一直维持相同下标对应同一条消息。某个列表少删除一项，对应关系就可能错位。

**结构体（struct）**把一组有名字、可以具有不同类型的字段组织成一个值。**字段**是结构体中一个有名字的组成部分。定义消息类型：

```go
// 包级类型声明，与 main 函数并列。
type Message struct {
	ID             string
	ConversationID string
	SenderID       string
	Body           string
}
```

`type` 开始声明一种类型，`Message` 是类型名，`struct` 表示它由花括号里的字段组成。每行是字段名及其类型。本例四项都用字符串，但结构体也可以组合字符串、整数、布尔值等不同字段。

把这些字段放在一起是为了维护一条消息的整体含义，不意味着编译器已经理解“会话 ID 必须存在”或“正文不能为空”。这些仍然需要业务校验。

### 3.2 具名初始化与字段访问

完整程序：

```go
package main

import "fmt"

type Message struct {
	ID             string
	ConversationID string
	SenderID       string
	Body           string
}

func main() {
	message := Message{
		ID:             "m-a",
		ConversationID: "c-a",
		SenderID:       "u-a",
		Body:           "你好",
	}
	fmt.Println(message.ID, message.ConversationID)
	fmt.Println(message.SenderID, message.Body)
	message.Body = "稍后见"
	fmt.Println(message.Body)
}
```

预期依次输出 `m-a c-a`、`u-a 你好`、`稍后见`。`Message{...}` 是结构体字面量，字段名后面的冒号对应初始化值；`message.Body` 中的点号选择字段，既能读取，也能在这个变量上赋值。

具名写法把值的含义留在代码里，避免四个字符串仅靠位置区分。字段大写首字母与跨包可见性有关；本章都在同一个包，暂时只使用这种清楚的命名，包边界会在 01.09 展开。

### 3.3 零值合法存在，不代表业务记录有效

`var message Message` 与 `Message{}` 都能得到字段全部为零值的消息：四个字符串均为空。也可以只初始化某些字段，未写字段仍取零值。

| 写法 | 语言上得到什么 | 业务上还缺什么 |
|---|---|---|
| `Message{}` | 一个完整结构体值 | ID、会话、发送者、正文全部未填写 |
| `Message{Body: "你好"}` | 仅正文非空 | 仍不能确定身份与归属 |
| 完整具名初始化 | 四项都有给定字符串 | 还需核对会话、成员与正文规则 |

结构体类型只保证每个字段具有相应类型；它不能凭空知道某个字符串是否合法。不能因为变量的类型叫 `Message` 就说它必然是一条有效、已发送的消息。

### 3.4 结构体赋值逐字段复制

下面是 `main` 内片段，使用本节 `Message` 类型并导入 `fmt`：

```go
original := Message{ID: "m-a", ConversationID: "c-a", SenderID: "u-a", Body: "你好"}
copyOfMessage := original
copyOfMessage.Body = "编辑稿"
fmt.Println(original.Body, copyOfMessage.Body)
fmt.Println(original.ID == copyOfMessage.ID)
fmt.Println(original == copyOfMessage)
```

预期：

```text
你好 编辑稿
true
false
```

原变量与副本变量拥有独立字段位置，替换副本的 `Body` 不影响原字段。四个字段都是可比较的字符串，因此本例整体 `==` 合法，并逐字段比较；正文不同使整体比较为假。

**同一个业务身份与所有字段相等是不同判断。** 编辑前后的两个值可以保留同一条消息 ID，却有不同正文；两个变量也可以保存字段完全相同的值。不能用整体结构体相等代替所有业务身份判断。

当结构体含切片或 map 字段时，整体 `==` 不合法，赋值后的更深层数据还可能共享；第七节会具体展开，不把本例的纯字符串行为推广成自动深复制。

### 3.5 用可比较的结构体表达复合键

本章的消息 ID 在会话内唯一，因此只用 `m-a` 查所有消息会产生冲突。把会话 ID 与消息 ID 组合起来，形成一个明确的键：

```go
package main

import "fmt"

type MessageKey struct {
	ConversationID string
	MessageID      string
}

func main() {
	bodies := make(map[MessageKey]string)
	first := MessageKey{ConversationID: "c-a", MessageID: "m-a"}
	second := MessageKey{ConversationID: "c-b", MessageID: "m-a"}
	bodies[first] = "第一场讨论"
	bodies[second] = "第二场讨论"
	fmt.Println(len(bodies))
	fmt.Println(bodies[first])
	fmt.Println(bodies[second])
}
```

预期键数为 2，两个查找分别得到各自正文。`MessageKey` 的两个字段都是字符串，所以可比较；任一字段不同，键就不同。

临时把两段字符串直接拼接也许看似方便，但没有清晰分隔和转义规则时，`"ab"+"c"` 与 `"a"+"bc"` 会得到同一结果。结构化的键保留了两个部分的边界。本章不规定上游项目怎样编码会话 ID，只讲教学模型如何避免混淆。

## 四、地址、指针与 nil：找到要修改的变量

### 4.1 一个变量的值与所在位置不同

上一章用格子理解底层数组。现在再区分：格子里保存的是值，格子所在的位置可以被定位。**地址**用来定位变量，**指针值**表达指向某个变量的关系。

完整程序：

```go
package main

import "fmt"

func main() {
	count := 1
	p := &count
	*p = 2
	fmt.Println(count)
	fmt.Println(*p)
}
```

预期两行都是 `2`。逐符号解释：

| 写法 | 含义 |
|---|---|
| `count` | 保存整数的变量 |
| `&count` | 取得这个变量的地址 |
| `p` | 保存该指针值的变量 |
| `*int` | 指向 `int` 的指针类型，本例 `p` 的类型 |
| `*p` | 沿指针找到被指向的变量，称为解引用 |
| `*p = 2` | 把那个变量里的整数改为 2 |

`*` 在类型位置和表达式位置的含义要分开阅读：`var p *int` 声明指针类型，`*p` 才是通过一个指针访问目标；不要把它们当作乘法。

```text
p 变量保存的指针 ───→ count 变量所在格子
                         原来 1，写入后 2
```

`*p = 2` 不会再创建一个独立计数器，它修改的就是 `count`。本文不打印或猜测实际地址数字；地址由实现和运行环境安排，不作为持久消息身份。

### 4.2 指针自己也是可以赋值的变量

完整程序：

```go
package main

import "fmt"

func main() {
	first := 1
	second := 10
	p := &first
	q := p
	*q = 2
	p = &second
	*p = 11
	fmt.Println(first, second)
	fmt.Println(p == q)
}
```

预期：

```text
2 11
false
```

| 操作 | `p` 指向谁 | `q` 指向谁 | `first` | `second` |
|---|---|---|---:|---:|
| `p := &first` | first | 尚未声明 | 1 | 10 |
| `q := p` | first | first | 1 | 10 |
| `*q = 2` | first | first | 2 | 10 |
| `p = &second` | second | first | 2 | 10 |
| `*p = 11` | second | first | 2 | 11 |

复制指针值并不复制目标整数；重新给 `p` 赋另一个地址也不会重新给 `q` 赋值。**改指针指向谁**与**改它所指变量的值**是本章反复使用的两个动作。

### 4.3 结构体指针的字段访问

完整程序：

```go
package main

import "fmt"

type Draft struct {
	Body string
}

func main() {
	draft := Draft{Body: "第一版"}
	p := &draft
	(*p).Body = "第二版"
	p.Body = "第三版"
	fmt.Println(draft.Body)

	another := &Draft{Body: "另一份草稿"}
	fmt.Println(another.Body)
}
```

预期依次输出 `第三版` 和 `另一份草稿`。`p` 的类型为 `*Draft`；`(*p).Body` 先解引用得到结构体，再选择字段。对于结构体指针，Go 允许简写为 `p.Body`。

`&Draft{...}` 是创建结构体值并得到指向它的指针的常用形式，它不是把某个字符串或整数强行转换成指针。另一个基础写法 `new(Draft)` 会得到指向零值 `Draft` 的指针，效果可理解为准备一份字段全为零值的草稿；此处不要求使用它替代具名初始化。

指针赋予一条访问路径，不自动赋予业务权限。某段代码“拿得到对象”与“应不应该修改正文”是两个问题，函数契约需要明确后者。

### 4.4 nil 指针不是字段为空的结构体

完整程序：

```go
package main

import "fmt"

type Draft struct {
	Body string
}

func main() {
	var missing *Draft
	empty := &Draft{}
	fmt.Println(missing == nil, empty == nil)
	if missing == nil {
		fmt.Println("没有草稿对象")
	}
	fmt.Printf("已有草稿，正文=%q\n", empty.Body)
}
```

预期：

```text
true false
没有草稿对象
已有草稿，正文=""
```

`var missing *Draft` 的零值为 nil，没有可供解引用的目标。`empty` 指向实际存在的结构体，只是 `Body` 恰好为空。直接读取或写入 `missing.Body` 都会发生运行时 panic；需要在访问之前检查，不是访问之后补检查。

这里只把 nil 解释为指针没有目标。业务上它代表未创建、缺失还是某种失败，仍需由使用它的函数约定，不能由变量名猜测。

### 4.5 相同字段、相同地址、相同业务身份分开判断

本节 `Draft` 有一个字符串字段，是非零大小类型。对两个独立变量，即使字段相同，指针也指向不同变量：

```go
// main 内，沿用本节 Draft 类型并导入 fmt。
a := Draft{Body: "待编辑"}
b := Draft{Body: "待编辑"}
pa := &a
pb := &b
same := pa
fmt.Println(a == b)
fmt.Println(pa == pb)
fmt.Println(pa == same)
```

预期是 `true`、`false`、`true`。第一个比较字段，第二个比较指针目标，第三个确认两个指针仍指向同一变量。本例不借此推广零大小类型的地址行为；当前只需使用具体草稿对象建立模型。

跨进程、重启后的稳定身份应依赖业务 ID，不能保存某次地址数字当作消息 ID。正常 Go 指针也不是供本章任意加减偏移的整数，不能通过 `p + 1` 访问所谓下一个对象。

## 五、函数参数仍然按值传递

### 5.1 传结构体值时，修改的是形参副本

完整程序：

```go
package main

import "fmt"

type Draft struct {
	Body string
}

func editCopy(draft Draft) Draft {
	draft.Body = "编辑后的副本"
	return draft
}

func main() {
	original := Draft{Body: "原稿"}
	updated := editCopy(original)
	fmt.Println(original.Body)
	fmt.Println(updated.Body)
}
```

预期输出 `原稿`、`编辑后的副本`。调用时形参 `draft` 得到结构体值的副本；修改它不会替换调用者的字符串字段。返回新值让调用者决定是否接收并替换自己的状态。

此模式适合希望清楚区分旧值和候选新值的流程。当前 `Draft` 只有字符串字段；如果值里有切片或 map，形参复制仍然发生，但更深层数据可能共享，第七节再处理。

### 5.2 传指针时，指针值被复制，目标可能共享

完整程序：

```go
package main

import "fmt"

type Draft struct {
	Body string
}

func editDraft(draft *Draft, body string) bool {
	if draft == nil {
		return false
	}
	draft.Body = body
	return true
}

func main() {
	original := Draft{Body: "原稿"}
	ok := editDraft(&original, "第二版")
	fmt.Println(ok, original.Body)
	fmt.Println(editDraft(nil, "无目标"))
}
```

预期：

```text
true 第二版
false
```

调用 `editDraft(&original, ...)` 时，形参复制的是 `*Draft` 指针值；它与传入指针指向同一个 `original`。所以通过形参访问目标字段，调用者会看到变化。Go 没有因此改成按引用传参。

`editDraft` 的本题契约只是“目标存在时替换草稿正文”，不负责消息长度、成员身份或发送验证。名字明确表明它有修改效果；不能把草稿修改成功误写成消息发送成功。

### 5.3 重绑定指针与替换目标不是一回事

完整程序：

```go
package main

import "fmt"

type Draft struct {
	Body string
}

func rebindLocal(draft *Draft) {
	draft = &Draft{Body: "新的局部目标"}
}

func replaceTarget(draft *Draft) bool {
	if draft == nil {
		return false
	}
	*draft = Draft{Body: "原目标被替换"}
	return true
}

func main() {
	original := Draft{Body: "原稿"}
	p := &original
	rebindLocal(p)
	fmt.Println(original.Body, p == &original)
	replaced := replaceTarget(p)
	fmt.Println(replaced, original.Body)
}
```

预期：

```text
原稿 true
true 原目标被替换
```

| 函数内语句 | 改了什么 | 是否改变调用者原目标 |
|---|---|---|
| `draft = &Draft{...}` | 形参保存的指针值 | 否 |
| `draft.Body = ...` | 形参所指目标的一个字段 | 是 |
| `*draft = Draft{...}` | 形参所指目标的整个结构体值 | 是 |

替换整个结构体时，没写出的字段会变成零值；真实对象有更多字段时，要考虑是否允许把它们一起重置。若目标是让调用者改为指向另一个对象，本章优先用“返回新指针、调用者接收”的方式，不急着引入指针的指针。

### 5.4 返回局部变量地址有效，不需要手工延长生命

完整程序：

```go
package main

import "fmt"

type Draft struct {
	Body string
}

func newDraft(body string) *Draft {
	draft := Draft{Body: body}
	return &draft
}

func main() {
	p := newDraft("原稿")
	p.Body = "函数返回后继续编辑"
	fmt.Println(p.Body)
}
```

预期输出 `函数返回后继续编辑`。在 Go 中，返回这类局部变量地址是合法的；实现必须让仍被使用的目标保持有效，不会因为函数返回就让指针自动失效。

**作用域**决定名字在哪里可见，不等于对象内存立即消失。函数外看不到局部名字 `draft`，仍可通过返回指针访问对应变量。

编译器与运行时安排物理存储和生命周期；不能只看 `&` 就断言对象永远在堆上，也不能只看“局部变量”就断言一定在某个固定栈槽。这里先掌握语义，逃逸分析、垃圾回收与性能测量在运行时卷展开。[Effective Go 的分配说明](https://go.dev/doc/effective_go#allocation_new)也展示了返回局部变量地址的写法。

### 5.5 map 参数：修改条目与替换形参同样不同

完整程序：

```go
package main

import "fmt"

func writeExistingTable(counts map[string]int) bool {
	if counts == nil {
		return false
	}
	counts["c-a"] = 2
	return true
}

func replaceLocalTable(counts map[string]int) {
	counts = make(map[string]int)
	counts["c-a"] = 9
}

func ensureTable(counts map[string]int) map[string]int {
	if counts == nil {
		counts = make(map[string]int)
	}
	return counts
}

func main() {
	counts := map[string]int{"c-a": 1}
	written := writeExistingTable(counts)
	fmt.Println(written, counts["c-a"])
	replaceLocalTable(counts)
	fmt.Println(counts["c-a"])

	var empty map[string]int
	empty = ensureTable(empty)
	empty["c-b"] = 0
	fmt.Println(empty == nil, len(empty))
}
```

预期：

```text
true 2
2
false 1
```

传入 map 时，形参 map 值同样复制；最初仍共享同一组关联，所以写入条目可见。重新给形参赋 `make(...)` 只改变形参，调用者变量不会自动指向新表。输入 nil 时，如果函数准备了新表，需要把结果返回并接收。

这与切片返回新描述、指针局部重绑定放在一起，就能形成一致模型：**先判断赋值替换哪个变量，再判断变量中的值是否继续关联共享数据。**

指针不天然更快，值也不天然更安全。选择依据首先是调用者是否允许修改、需要什么对象身份和复制语义；性能判断以后用实际测量补充。

## 六、map 里的结构体：取出改回与指针值

### 6.1 map 的值是结构体时，查询得到一个值

用一个简化会话类型记录标题与本地草稿数：

```go
// 包级声明。
type Conversation struct {
	Title      string
	DraftCount int
}
```

`map[string]Conversation` 表示键为会话 ID、值为整个会话结构体。读取 `conversations["c-a"]` 得到该结构体值；赋给局部变量时，这些字段被复制。

完整程序：

```go
package main

import "fmt"

type Conversation struct {
	Title      string
	DraftCount int
}

func main() {
	conversations := map[string]Conversation{
		"c-a": Conversation{Title: "计划讨论", DraftCount: 0},
	}
	value, exists := conversations["c-a"]
	if !exists {
		fmt.Println("会话未登记")
		return
	}
	value.Title = "新版标题"
	fmt.Println(conversations["c-a"].Title)
	conversations["c-a"] = value
	fmt.Println(conversations["c-a"].Title)
}
```

预期先打印 `计划讨论`，再打印 `新版标题`。这里完整写出 `Conversation{...}`，方便初学时认出值类型。

| 步骤 | map 中的标题 | 局部 `value.Title` |
|---|---|---|
| 初始化 | 计划讨论 | 尚未声明 |
| 查找并接收 | 计划讨论 | 计划讨论 |
| 修改局部副本 | 计划讨论 | 新版标题 |
| 整个值写回 | 新版标题 | 新版标题 |

如果漏掉最后写回，修改只停留在局部副本。若键不存在，直接取零值、修改标题再写入，就会隐式创建缺少其他信息的会话；是否允许创建应是独立规则，不能在“修改已有会话”的函数里悄悄发生。

### 6.2 map 元素不可直接取地址或给值结构体字段赋值

下列两行是故意错误片段，不能通过编译：

```go
conversations["c-a"].Title = "新版标题"
p := &conversations["c-a"]
```

map 元素不提供可直接取址的稳定变量位置，称为**不可寻址**。语言允许 `conversations[key] = wholeValue` 更新整个条目，却不允许直接取元素地址或把值结构体的字段当作可赋值位置。最清楚的写法就是“取出 → 检查 → 修改局部变量 → 写回”。

这个结论来自语言规则，不能把某一版本 map 内部搬迁算法当作必需背诵的唯一理由。读取字段 `conversations[key].Title` 本身合法；禁止的是这里的字段赋值和对 map 元素取址。

如果结构体包含切片字段，读出的切片值仍可能关联共享底层数据，因而通过它修改切片元素是另一层动作；第七节会单独展示。不要把“map 值结构体字段不能直接赋值”误读成“它引用的一切数据都不可修改”。

### 6.3 map 的值是指针时，还要检查指针是否有目标

完整程序：

```go
package main

import "fmt"

type Conversation struct {
	Title      string
	DraftCount int
}

func main() {
	conversations := make(map[string]*Conversation)
	conversations["c-a"] = &Conversation{Title: "计划讨论"}
	conversations["c-empty"] = nil

	p, exists := conversations["c-a"]
	if !exists || p == nil {
		fmt.Println("没有可修改的会话对象")
		return
	}
	p.Title = "新版标题"
	fmt.Println(conversations["c-a"].Title)

	missing, missingExists := conversations["c-missing"]
	empty, emptyExists := conversations["c-empty"]
	fmt.Println(missing == nil, missingExists)
	fmt.Println(empty == nil, emptyExists)
}
```

预期：

```text
新版标题
true false
true true
```

`map[string]*Conversation` 的值类型是指针。`p, exists := ...` 仍复制值，不过复制的是指针值；`p.Title = ...` 修改的是那个目标对象，并非给 map 元素里的指针重新赋值。

| map 状态 | 查到的指针 | `exists` | 能否访问字段 |
|---|---|---|---|
| 键缺失 | nil | false | 不能 |
| 键存在，存的就是 nil | nil | true | 不能 |
| 键存在，指向实际对象 | 非 nil | true | 可以 |

因此 comma-ok 为真不代表指针一定非 nil。本章综合数据模型选择值结构体，避免多一类 nil 对象状态；理解指针值模式是为了读懂实际代码及后续设计取舍。

### 6.4 删除条目不会销毁所有别名所指对象

下面是 `main` 内片段，沿用本节类型并导入 `fmt`：

```go
conversations := make(map[string]*Conversation)
conversations["c-a"] = &Conversation{Title: "旧对象"}
alias := conversations["c-a"]
conversations["c-a"] = &Conversation{Title: "新对象"}
fmt.Println(alias.Title, conversations["c-a"].Title)
delete(conversations, "c-a")
alias.Title = "旧对象仍可编辑"
fmt.Println(len(conversations), alias.Title)
```

预期：

```text
旧对象 新对象
0 旧对象仍可编辑
```

先前取得的 `alias` 仍指向旧对象；重新给某个 map 键赋新指针，不会更新所有旧指针。删除键只移除这一张表里的关联，其他指针仍可让对象继续有效。

实际系统如果“移出会话索引”就应禁止后续操作，必须设计状态检查和对象访问边界，不能指望 `delete` 撤销已经交出去的所有访问路径。当前只讨论顺序执行，不对并发读写提供保证。

### 6.5 选择值或指针之前，先写修改契约

| 设计 | 查询结果 | 更新已有标量字段 | 主要需要解释的边界 |
|---|---|---|---|
| `map[string]Conversation` | 值副本 | 修改后整个写回 | 漏写回；复杂字段内部可能共享 |
| `map[string]*Conversation` | 指针值副本 | 检查存在与非 nil 后修改目标 | 其他持有者同时看见变化；nil 值；旧别名 |

值模式适合表达一个可替换的记录值；指针模式适合确实需要共享同一对象身份的场景。两者都不能凭语法保证权限、并发安全或业务一致性。不要为了少写一行写回就把全部数据都改为指针，也不要把值模式叫作自动深复制。

## 七、第二遍深化：结构体复制与嵌套共享

### 7.1 一份副本是否独立，要逐字段判断

假设会话值里同时包含身份、成员表和草稿列表：

```go
package main

import "fmt"

type Conversation struct {
	ID      string
	Members map[string]bool
	Drafts  []string
}

func main() {
	original := Conversation{
		ID:      "c-a",
		Members: map[string]bool{"u-a": true},
		Drafts:  []string{"第一版"},
	}
	snapshot := original
	snapshot.ID = "copy-c-a"
	snapshot.Members["u-a"] = false
	snapshot.Drafts[0] = "第二版"
	fmt.Println(original.ID, snapshot.ID)
	fmt.Println(original.Members["u-a"], snapshot.Members["u-a"])
	fmt.Println(original.Drafts[0], snapshot.Drafts[0])
}
```

预期：

```text
c-a copy-c-a
false false
第二版 第二版
```

复制结构体时三个字段都被复制；字段的具体类型决定复制后访问的内容是否继续共享：

| 字段 | 复制的值 | 后续修改影响 |
|---|---|---|
| `ID string` | 字符串值 | 给副本字段赋新字符串，不改原字段 |
| `Members map[string]bool` | 关联同一组条目的 map 值 | 改成员条目，两边都能看见 |
| `Drafts []string` | 描述同一底层数组的切片值 | 改已有元素，两边都能看见 |

这个确定例子中，两个草稿切片共享已有元素，不是随机地“可能共享”。是否在后续追加时脱离，才要进一步检查容量与操作。

结构体包含 map 或切片字段时，不能整体用 `==` 比较。若要比较业务内容，需要逐字段决定规则：忽略哪些字段、是否区分 nil 和空、集合顺序是否重要。它不是编译器能自动替你决定的统一问题。

### 7.2 改元素、改条目、改切片描述是不同动作

下面是完整的固定容量演示：

```go
package main

import "fmt"

type Conversation struct {
	ID     string
	Drafts []string
}

func main() {
	original := Conversation{ID: "c-a", Drafts: make([]string, 1, 3)}
	original.Drafts[0] = "第一版"
	snapshot := original
	snapshot.Drafts = append(snapshot.Drafts, "候选第二条")
	fmt.Println(len(original.Drafts), len(snapshot.Drafts))
	original.Drafts = append(original.Drafts, "正式第二条")
	fmt.Println(snapshot.Drafts)
}
```

预期：

```text
1 2
[第一版 正式第二条]
```

副本的 `append` 只更新副本字段的长度，但它向共享底层下标 1 写入内容。原对象仍长 1，再追加时也在这个位置写入，因此覆盖候选内容。名字叫 `snapshot` 并不会自动获得独立快照语义。

再回到 map 值结构体。下面的片段使用第 7.1 节的类型，放在 `main` 内：

```go
sessions := map[string]Conversation{
	"c-a": Conversation{ID: "c-a", Drafts: []string{"第一版"}},
}
sessions["c-a"].Drafts[0] = "第二版"
```

这行是合法的：先读取结构体中的切片值，再访问它底层数组的元素。它没有给 map 值结构体的 `Drafts` 字段赋新描述，也没有对 map 元素取地址。相反，下面是故意错误写法：

```go
sessions["c-a"].Drafts = append(sessions["c-a"].Drafts, "另一条")
```

这里试图给不可寻址的 map 值结构体字段赋值，需要先取出会话、接收追加后的切片、再把会话整体写回。对比两者，才能准确理解“哪一层被修改”。

### 7.3 为当前数据形状写一个明确的克隆函数

本题希望得到可独立替换字段、成员条目和草稿元素的副本，并保留 nil 与非 nil 空集合的区别。完整程序：

```go
package main

import "fmt"

type Conversation struct {
	ID      string
	Members map[string]bool
	Drafts  []string
}

func cloneConversation(source Conversation) Conversation {
	result := source
	if source.Members != nil {
		result.Members = make(map[string]bool, len(source.Members))
		for id, active := range source.Members {
			result.Members[id] = active
		}
	}
	if source.Drafts != nil {
		result.Drafts = make([]string, len(source.Drafts))
		copy(result.Drafts, source.Drafts)
	}
	return result
}

func main() {
	original := Conversation{
		ID:      "c-a",
		Members: map[string]bool{"u-a": true},
		Drafts:  []string{"第一版"},
	}
	snapshot := cloneConversation(original)
	snapshot.Members["u-a"] = false
	snapshot.Drafts[0] = "第二版"
	fmt.Println(original.Members["u-a"], snapshot.Members["u-a"])
	fmt.Println(original.Drafts[0], snapshot.Drafts[0])
}
```

预期：

```text
true false
第一版 第二版
```

| 阶段 | 成员表 | 草稿列表 |
|---|---|---|
| `result := source` | 暂时共享 | 暂时共享 |
| 为非 nil 成员字段 `make` | 新的一张表 | 仍暂时共享 |
| 逐键复制 bool 值 | 独立条目 | 仍暂时共享 |
| 为非 nil 草稿字段 `make`、`copy` | 独立条目 | 新的元素位置 |
| 返回结果 | 修改结果条目不改原表 | 替换结果元素不改原列表 |

当前 map 值是 bool、切片元素是 string，因此这些操作足以满足本题的独立替换要求。复制字符串值不要求把所有不可变文本字节重新复制一遍，也不需要为了不能修改的内容强求物理存储完全不同。

### 7.4 保留 nil 是契约选择，不是通用克隆定律

本函数约定源字段为 nil 时结果也为 nil；非 nil 空集合则创建非 nil 空集合：

| 源字段 | 结果字段 | 为什么这样设计 |
|---|---|---|
| nil map | nil map | 保留尚未建立的状态 |
| 非 nil 空 map | 非 nil 空 map | 保留可直接写入的空表 |
| nil 切片 | nil 切片 | 保留源值的零值状态 |
| 非 nil 空切片 | 非 nil 空切片 | 保留调用者约定的表示 |

如果业务只关心元素，不区分 nil 和空，也可以定义不同规则。关键是让调用者知道契约，不把某一种表示强加成所有场景的语义。

以后 `Members` 的值如果变成指针、`Drafts` 的元素变成含其他切片的结构体，当前函数就不足以做到更深层独立。需要按实际数据形状重新判断共享边界，不能把这个函数叫作万能深复制。

“只读查询”同样是函数需要遵守的行为约定。传结构体值不代表 map 或切片字段不可修改，返回指针也不自动说明允许任意修改；当前程序没有提供并发访问保护。先把谁持有数据、谁允许改、返回结果能否独立修改写清楚，再设计后续方法和接口。

## 八、综合：按会话身份保存本地消息

### 8.1 给教学模型写清身份和状态约束

本章新增的是本地身份与登记规则：会话必须已登记；会话内消息 ID 不重复；发送者必须出现在本地成员表中且标志为 true；每个会话最多保存给定条数。它们是教学需求，不是 OpenIM 的完整协议。

数据组织成两层索引：

```text
会话索引：
  c-a → Conversation
           Members[u-a] → true
           Messages[m-a] → Message
  c-b → Conversation
           Members[u-a] → true
           Messages[m-a] → 另一条 Message
```

外层通过会话 ID 找会话，内层通过消息 ID 找该会话中的消息。不同会话各有自己的消息表，因此可以保存相同的局部消息 ID。身份范围与第三节复合键一致。

正文继续使用共同约定：上限为正数 → 原文非空 → 字节数不超限 → UTF-8 有效。最后一项已在 01.04 增加；纯空格不自动修剪。整体先判断会话及其分类，再调用文本校验。

会话类型只接受本课字符串 `single`、`group`。成员标志是程序已给定的本地状态；输入 `SenderID` 仍不是可信的网络认证结果。这里最多能说“根据本地给定身份完成规则检查并加入内存表”。

### 8.2 完整程序：校验之后才写入

这是独立的完整程序，使用值结构体的会话表。此前 map 的共享规则和结构体字段语法已经足够解释它；深层克隆并非此程序的前提。

```go
package main

import (
	"fmt"
	"unicode/utf8"
)

type Message struct {
	ID             string
	ConversationID string
	SenderID       string
	Body           string
}

type Conversation struct {
	ID       string
	Kind     string
	Members  map[string]bool
	Messages map[string]Message
}

func validateText(body string, maxBytes int) (bool, string) {
	if maxBytes <= 0 {
		return false, "字节上限配置无效"
	}
	if body == "" {
		return false, "空文本"
	}
	if len(body) > maxBytes {
		return false, "超过字节上限"
	}
	if !utf8.ValidString(body) {
		return false, "不是有效 UTF-8"
	}
	return true, ""
}

func addLocalMessage(conversations map[string]Conversation, message Message,
	maxBytes int, maxMessages int) (bool, string) {

	if conversations == nil {
		return false, "会话索引未初始化"
	}
	conversation, exists := conversations[message.ConversationID]
	if !exists {
		return false, "会话未登记"
	}
	if conversation.ID == "" || conversation.ID != message.ConversationID {
		return false, "会话身份与索引不一致"
	}
	if conversation.Kind != "single" && conversation.Kind != "group" {
		return false, "未知会话分类"
	}
	if maxBytes <= 0 || maxMessages <= 0 {
		return false, "数量或字节上限配置无效"
	}
	if conversation.Members == nil || conversation.Messages == nil {
		return false, "会话集合未初始化"
	}
	if message.ID == "" || message.SenderID == "" {
		return false, "消息或发送者 ID 为空"
	}
	active, registered := conversation.Members[message.SenderID]
	if !registered {
		return false, "发送者未登记"
	}
	if !active {
		return false, "发送者已停用"
	}
	valid, reason := validateText(message.Body, maxBytes)
	if !valid {
		return false, reason
	}
	_, duplicate := conversation.Messages[message.ID]
	if duplicate {
		return false, "消息 ID 已存在"
	}
	if len(conversation.Messages) >= maxMessages {
		return false, "本地消息数达到上限"
	}

	conversation.Messages[message.ID] = message
	return true, ""
}

func main() {
	conversations := map[string]Conversation{
		"c-a": Conversation{
			ID:       "c-a",
			Kind:     "single",
			Members:  map[string]bool{"u-a": true, "u-b": false},
			Messages: make(map[string]Message),
		},
		"c-b": Conversation{
			ID:       "c-b",
			Kind:     "group",
			Members:  map[string]bool{"u-a": true},
			Messages: make(map[string]Message),
		},
	}
	message := Message{ID: "m-a", ConversationID: "c-a", SenderID: "u-a", Body: "你好"}
	ok, reason := addLocalMessage(conversations, message, 6, 2)
	fmt.Printf("第一次：%t，原因=%q\n", ok, reason)

	ok, reason = addLocalMessage(conversations, message, 6, 2)
	fmt.Printf("同会话重复：%t，原因=%q\n", ok, reason)

	message.ConversationID = "c-b"
	ok, reason = addLocalMessage(conversations, message, 6, 2)
	fmt.Printf("另一会话：%t，原因=%q\n", ok, reason)

	fmt.Println(len(conversations["c-a"].Messages), len(conversations["c-b"].Messages))
	fmt.Println(conversations["c-a"].Messages["m-a"].Body)
}
```

预期：

```text
第一次：true，原因=""
同会话重复：false，原因="消息 ID 已存在"
另一会话：true，原因=""
1 1
你好
```

`%t` 显示布尔值，`%q` 用引号明确显示原因字符串，包括空字符串；这些格式在前面章节已经出现。三次调用分别完成一次本地加入、一次重复拒绝、另一个会话中的一次本地加入。

### 8.3 为什么修改了内层 map，不需要再写回外层结构体

`conversation` 是从外层 map 读取的结构体副本。它的 `Members`、`Messages` 字段也按值复制，但 map 值仍关联各自的条目集合。

因此 `conversation.Messages[message.ID] = message` 修改共享的内层消息表，原会话随后可以看到这条记录。此处没有改变 `conversation.ID`、`Kind`，也没有给 `Messages` 字段重新赋一张 map，所以不需要把整个外层结构体再写回。

| 操作 | 必须写回外层会话吗 | 原因 |
|---|---|---|
| `conversation.Kind = "group"` | 是 | 改了局部副本的标量字段 |
| `conversation.Messages = make(...)` | 是 | 给局部副本字段赋了另一张表 |
| `conversation.Messages[id] = message` | 此处不需要 | 改的是共享表的条目 |

新加入的 `Message` 只有字符串字段，它以值的方式存入内层表。之后给 `main` 中 `message.ConversationID` 赋为 `c-b`，不会修改之前存入 `c-a` 的消息值，这也是两次加入能够保持各自身份的原因。

如果未来消息含切片、map 或指针字段，存入结构体值也可能继续共享更深层数据，届时应重新设计写入契约和复制边界。

### 8.4 失败路径没有写入，不代表修复了已有坏状态

本例唯一的业务写入位于全部检查之后。此前只读取表和字段，因此普通拒绝路径不会新增消息，也不会顺手补建缺失会话或 nil 集合。

这项推理有明确范围：程序顺序执行，初始已存消息由同一条本地写入规则产生，其他代码没有任意破坏表内内容。它没有对所有历史记录做完整审计，也没有提供多协程事务或崩溃恢复保证。

若会话本来就存在 ID 与键不一致、集合未初始化等问题，函数会拒绝；**拒绝并保持原状只说明没有继续改坏状态，不代表坏状态已修复。** 状态修复要有单独流程。

“重复 ID 拒绝”也是本题的明确选择。同一身份对应相同正文仍拒绝，不返回原操作结果；因此不能把它直接称为网络重试中的完整幂等方案。后续可靠消息章节会比较重复请求的身份、结果和恢复语义。

### 8.5 十八组业务与状态边界

这些用例从一份新建的初始表分别推导；除特别说明外，使用 `c-a`、启用成员 `u-a`、消息 `m-a`、正文“你好”、字节上限 6、条数上限 2。

| 编号 | 输入或前置状态 | 预期 |
|---:|---|---|
| 1 | 首次加入合法消息 | 返回 true，`c-a` 增加一项 |
| 2 | 外层会话表为 nil | 拒绝，索引未初始化 |
| 3 | `ConversationID` 未登记 | 拒绝，不自动创建会话 |
| 4 | 外层键为 `c-a`，对象 `ID` 为其他值或空 | 拒绝，身份不一致 |
| 5 | 已登记会话 `Kind` 为未知字符串 | 拒绝，尚未调用文本校验 |
| 6 | `Members` 为 nil | 拒绝，不补建成员表 |
| 7 | `Messages` 为 nil | 拒绝，不向 nil map 写入 |
| 8 | 消息 ID 或发送者 ID 为空 | 拒绝，不登记空身份 |
| 9 | 发送者键缺失 | 拒绝，发送者未登记 |
| 10 | 发送者键存在，标志 false | 拒绝，发送者已停用 |
| 11 | 正文 `""` | 拒绝空文本 |
| 12 | 正文 `" "`，有效上限至少 1 | 接受，不自动修剪 |
| 13 | “你好”，字节上限 6 或 5 | 6 接受，5 拒绝超限 |
| 14 | `string([]byte{0xff})`，上限有效 | 拒绝非法 UTF-8 |
| 15 | 任一数量/字节上限为 0 或负数 | 拒绝配置，无写入 |
| 16 | 同会话再次提交已存在消息 ID | 拒绝，原记录不被覆盖 |
| 17 | 另一会话使用相同局部消息 ID | 满足该会话规则时允许 |
| 18 | 已有数量达到或超过上限，再提交新 ID | 拒绝；若原先已经超限，也不会自动修复 |

还应独立检查组合失败顺序：未知会话分类与空正文同时出现时，先拒绝分类；启用成员提交空正文且字节上限为 0 时，先拒绝配置。所有错误只返回当前约定的第一项，不代表输入没有其他问题。

当前固定数据已经位于内存中，条数检查限制的是本地新增记录，字节检查限制的是接受内容；不是外部读取前的流量或内存防护。接入真实输入时要在更早的读取边界增加限制。

### 8.6 对照 OpenIM 的会话结果索引

本章实际阅读固定提交 `f6411a8a1a31d3df36f4c2b3ad28481a94141e1f`（版本 `v3.8.3-patch.16`）的 [internal/rpc/msg/sync_msg.go 中 GetSeqMessage](https://github.com/openimsdk/open-im-server/blob/f6411a8a1a31d3df36f4c2b3ad28481a94141e1f/internal/rpc/msg/sync_msg.go)。

该函数创建两张以会话 ID 为键、以消息拉取结果对象指针为值的响应表。查询对应条目时使用 comma-ok；不存在就创建一个结果对象，并把其指针放入对应表；之后通过这个指针更新消息列表与相关结果字段。

| 上游已核对动作 | 本章能够对应的知识 |
|---|---|
| 用 `make` 创建响应 map | nil map 与可写空 map 的区别 |
| 按会话 ID 读取并接收 ok | 缺失与零值分开判断 |
| 缺失时创建结果对象指针 | `&T{}` 与指针值 |
| 通过指针更新结果字段 | 指针副本仍可访问同一对象 |

这是一种“按会话归类查询结果”的局部对象组织方式。它与本章“会话必须预先登记、重复消息拒绝”的业务操作不同，不能照搬“缺失则创建”到所有会话管理接口。

我们没有因此证明所有调用路径都禁止 nil 指针条目，也没有审计完整 RPC、SDK 或消息恢复协议。上游 `sdkws.PullMsgs` 是实际协议类型，本章的 `Message`、成员标志、字节上限和条数限制都是教学设计。接下来学习方法与接口后，再阅读更多对象协作方式。

## 九、分层练习、解析与下一章准备

每题先写预测和理由，再看解析。片段默认在 `main` 内，涉及类型时沿用题目指定的小模型；需要打印时导入 `fmt`。函数参考实现放在包级，与 `main` 并列，不要把不同小节的同名结构体拼接起来。

### 练习 1：两个 0 是否代表同一状态

```go
counts := map[string]int{"c-a": 0}
a, aExists := counts["c-a"]
b, bExists := counts["c-b"]
```

写出四个变量的值及 `len(counts)`。读取 `c-b` 是否自动增加这个键？

<details>
<summary>提示与解析</summary>

提示：把“返回的值”和“条目是否存在”分开。

结果为 `a=0`、`aExists=true`、`b=0`、`bExists=false`，长度仍为 1。读取缺失键不会创建条目。若业务要区分“没有草稿”和“没有登记”，就需要第二个结果。

</details>

### 练习 2：在函数里 make 后，为什么调用者还是 nil

```go
func prepare(counts map[string]int) {
	counts = make(map[string]int)
}
```

调用者声明 `var counts map[string]int`，调用 `prepare(counts)` 后能直接写键吗？说明修正方式。

<details>
<summary>提示与解析</summary>

提示：赋值替换的是哪个变量？

不能。函数只替换自己的形参，调用者仍持有 nil map，写键会 panic。让函数返回创建后的 map，并由调用者接收；或者调用者自己先创建。读、`len`、`range`、`delete` 合法，不意味着写入合法。

</details>

### 练习 3：哪一种类型能作为键

判断字符串、`[2]string`、`[]string`、第三节的 `MessageKey`、带 `Members map[string]bool` 字段的 `Conversation` 能否作为 map 键。

<details>
<summary>提示与解析</summary>

提示：需要对整个键完成相等比较。

字符串可以；两个字符串元素的数组可以；字符串切片不可以；`MessageKey` 两个字段都可比较，因此可以；含 map 字段的 `Conversation` 不可以。结构体名字看起来像“身份对象”也不会改变字段可比较性的规则。

</details>

### 练习 4：重复遍历得到相同顺序，能证明什么

你对一张 map 连续遍历几次，恰好总是先看到 `c-a` 再看到 `c-b`。能否据此把它当作长期展示顺序？怎样用已学知识固定本题顺序？

<details>
<summary>提示与解析</summary>

提示：一次或几次观察不替代语言保证。

不能。map range 没有规定顺序，不等于每次必须变化，也不等于独立随机排列。用明确的 `[]string{"c-a", "c-b"}` 保存展示顺序，再逐键查询并检查缺失。这里讨论 range；不要据此猜测格式化库直接打印 map 的独立排序规则。

</details>

### 练习 5：复制出的消息是否还是同一业务身份

第三节的 `Message` 只有四个字符串字段。`copyOfMessage := original` 后给副本正文赋新值，原正文是否变化？整体 `==` 和身份判断分别回答什么？

<details>
<summary>提示与解析</summary>

提示：身份按会话 ID 与消息 ID 组合判断。

原正文不变。整体 `==` 逐字段比较，因此正文不同就为假；两个值仍可能描述同一业务身份的不同内容版本。复制结构体也不会让两个独立变量合并成一个可修改位置。

</details>

### 练习 6：复制整数与复制指针

```go
count := 1
copyOfCount := count
p := &count
q := p
copyOfCount = 9
*q = 3
```

最后 `count`、`copyOfCount`、`*p`、`p == q` 各是什么？

<details>
<summary>提示与解析</summary>

提示：`copyOfCount` 保存整数，`p` 和 `q` 保存指针值。

结果依次是 `3`、`9`、`3`、`true`。整数副本独立；指针副本仍指向同一个 `count`。给 `*q` 赋值修改原目标，不修改指针变量保存的地址。

</details>

### 练习 7：空指针与空正文

沿用 `type Draft struct { Body string }`：`var a *Draft` 与 `b := &Draft{}` 有什么差别？是否能把 `b == &Draft{}` 当作“b 指向空草稿”的判断？

<details>
<summary>提示与解析</summary>

提示：新写一次 `&Draft{}` 会创建另一个目标。

`a` 为 nil，不能访问字段；`b` 指向存在的对象，`b.Body` 为零值空字符串。若要判断空正文，应先保证非 nil，再检查 `b.Body == ""`。

`b == &Draft{}` 比较的是两个指针目标，右边是一份新草稿；本例类型非零大小，因此它不是原对象，比较为 false。不能把这类地址比较写成“对象内容为空”的记号。

</details>

### 练习 8：重绑定形参与覆盖目标

第五节的 `rebindLocal(p)` 与 `replaceTarget(p)` 哪一个会改到原草稿？如果希望调用者改为持有新指针，本章推荐怎样表达？

<details>
<summary>提示与解析</summary>

提示：比较 `p = ...` 与 `*p = ...`。

`rebindLocal` 只改形参指针值；`replaceTarget` 修改所指变量中的结构体值。需要调用者持有新对象时，可以返回 `*Draft`，由调用者写 `p = newDraft(...)`。不需要为了这个简单需求马上引入二级指针。

</details>

### 练习 9：函数返回后，局部地址是否失效

```go
func newCount() *int {
	count := 0
	return &count
}
```

这在 Go 中是否合法？是否可以仅凭此代码断言存储一定永远在堆上？

<details>
<summary>提示与解析</summary>

提示：区分语义、名字作用域和物理布局。

合法，返回的指针可用于后续访问对应变量。函数返回使局部名字不再可见，不会让仍被使用的对象自动失效。具体物理存储与优化由实现决定，不能把所有取地址操作等同固定堆分配。后续运行时课程再用证据讨论实现成本。

</details>

### 练习 10：只修改已登记会话的标题

使用第六节的 `Conversation`（标题、草稿数），写普通函数 `renameExisting`：参数为会话 map、ID 与新标题，要求 ID 已存在且新标题非空，成功返回 true；失败不创建新键。

<details>
<summary>提示与参考实现</summary>

提示：先检查存在性，再改副本并整体写回。以下函数放在包级：

```go
func renameExisting(conversations map[string]Conversation, id string, title string) bool {
	value, exists := conversations[id]
	if !exists || title == "" {
		return false
	}
	value.Title = title
	conversations[id] = value
	return true
}
```

nil map 查询也会得到不存在，因此此函数不会对 nil map 写入。它允许修改已有标题，不负责创建会话；若需求也禁止空 ID，应作为明确的新输入条件补上。别直接写 `conversations[id].Title = ...`，值结构体字段不能这样赋值。

</details>

### 练习 11：ok 为真，为什么仍可能 panic

```go
conversations := map[string]*Conversation{"c-a": nil}
p, exists := conversations["c-a"]
if exists {
	fmt.Println(p.Title)
}
```

说明失败原因并修正检查。

<details>
<summary>提示与解析</summary>

提示：表里的值类型是指针。

键存在，所以 `exists` 为 true；存储的指针却为 nil。访问字段前还需检查 `p != nil`。缺失键与存在 nil 值可以有不同业务原因，即使最后都不允许字段访问，也不要混淆原始状态。

</details>

### 练习 12：删除会话键后，旧指针是否自动失效

从非 nil 对象取得 `alias := conversations["c-a"]` 后删除这个键。继续读取 `alias.Title` 是否必然失败？如果要求业务上禁止再改这份会话，`delete` 是否足够？

<details>
<summary>提示与解析</summary>

提示：map 关联与对象引用是不同关系。

不会因为删键自动失效；只要 `alias` 指向有效对象，仍能访问它。`delete` 没有撤销其他指针的能力。业务上禁止继续修改，需要明确生命周期状态与访问控制边界，不能从容器删除推导对象不可再用。

</details>

### 练习 13：这两个赋值为什么一个可以、一个不可以

用第七节含 `Drafts []string` 的会话类型，map 中已有 `c-a` 且列表非空：

```go
sessions["c-a"].Drafts[0] = "新正文"
sessions["c-a"].Drafts = []string{"另一份列表"}
```

分别解释它们修改哪一层。

<details>
<summary>提示与解析</summary>

提示：一个目标是切片底层元素，另一个目标是结构体字段。

第一行合法，读取切片描述后修改底层数组的元素。第二行试图给 map 值结构体的字段赋新切片描述，不能通过编译；应先取出会话、修改局部字段，再整体写回。第一行的前提也必须成立：键存在，切片长度大于 0；否则可能越界。

</details>

### 练习 14：当前 clone 的保证到哪一层

第七节克隆函数为什么能保留 nil 和空集合区别？如果草稿元素从 `string` 改成 `*Draft`，原有 `copy` 是否还能保证修改目标草稿互不影响？

<details>
<summary>提示与解析</summary>

提示：看复制的是元素值还是指针目标。

函数仅在源集合非 nil 时创建新集合，因此 nil 被保留，非 nil 空集合仍是非 nil。元素改成 `*Draft` 后，`copy` 只复制指针值，新旧列表仍指向同一批草稿。若契约要求独立修改草稿字段，还需逐个检查 nil 并复制目标对象，再继续判断对象内部字段。复制策略必须随真实数据形状调整。

</details>

### 练习 15：独立实现“允许替换，限制新增”

写 `putTitleIfRoom`，接收标题 map、ID、新标题和最大键数。要求 map 已初始化、ID/标题非空、上限为正；已有键允许替换；新键在达到上限时拒绝；若原表已经超过上限也拒绝，不假装修复。返回 `(bool, string)`。

<details>
<summary>提示与参考实现</summary>

提示：先检查原状态，再区分替换和新增。以下是包级函数：

```go
func putTitleIfRoom(titles map[string]string, id string, title string, limit int) (bool, string) {
	if titles == nil || id == "" || title == "" || limit <= 0 {
		return false, "输入或配置无效"
	}
	if len(titles) > limit {
		return false, "原表已超限"
	}
	_, exists := titles[id]
	if !exists && len(titles) >= limit {
		return false, "没有新增容量"
	}
	titles[id] = title
	return true, ""
}
```

| 初始状态 | 操作 | 预期 |
|---|---|---|
| 上限 2，已有 2 个键 | 替换一个已有键 | 成功，键数仍 2 |
| 上限 2，已有 2 个键 | 写第三个不同键 | 拒绝，键数仍 2 |
| 上限 2，已有 1 个键 | 写新键 | 成功，键数变 2 |
| 上限 2，原来已有 3 个键 | 任意更新 | 拒绝，原来的超限没有被修复 |

此处“容量”是题目规定的业务数量限制，不是 map 的 `cap`，也不是 `make` 的提示参数。

</details>

### 练习 16：本地通过离真实 IM 还差什么

综合程序返回 true 后，能否声称用户身份可信、消息已持久化、接收设备已收到或者用户已读？同一会话重复 ID 拒绝是否已经解决网络重试幂等？

<details>
<summary>提示与解析</summary>

提示：列出程序实际发生的动作。

当前只根据固定的本地会话、成员标志和输入内容检查规则，再更新内存 map。没有可信网络身份绑定、持久写入、设备确认或用户阅读信号。

重复 ID 拒绝只避免该次本地覆盖；网络重试还需要定义请求身份、已有结果怎样返回、失败或超时后怎样恢复，以及冲突内容如何判断。这里先把稳定身份和可观察状态讲清，后续在可靠消息章节继续补协议与故障模型。

</details>

## 进入 01.06 前需要能做什么

请用以下四项结果判断自己是否准备好，而不是只看完目录：

1. 从空 map 建立会话索引，准确区分键缺失、合法零值、nil map 与 nil 指针。
2. 用消息结构体表达身份与正文，说明业务 ID、字段相等和同一内存对象的不同含义。
3. 画出参数值复制、指针重绑定、修改所指变量，以及 map 值结构体取出改回的过程。
4. 给一份含 map 和切片的结构体制定复制契约，解释哪些数据独立、哪些仍共享，并完成有限数量更新的失败用例。

下一章 **01.06 方法与接口** 会在这些数据和普通函数上，解释接收者、方法调用与可替换实现。方法或接口不会自动改变参数复制、nil 和共享规则；先把这一章的对象关系画清楚，后续抽象才有具体依据。

## 核对资料与延伸阅读

- [Go 规范：map 类型](https://go.dev/ref/spec#Map_types)，核对键、零值和创建提示。
- [Go 规范：索引表达式](https://go.dev/ref/spec#Index_expressions)，核对缺失键、comma-ok 和 nil map 写入。
- [Go 规范：结构体类型](https://go.dev/ref/spec#Struct_types)，核对字段组成。
- [Go 规范：比较运算](https://go.dev/ref/spec#Comparison_operators)，核对数组、结构体与键的可比较性。
- [Go 规范：取地址与解引用](https://go.dev/ref/spec#Address_operators)，核对可寻址位置和 nil 边界。
- [Go 规范：赋值](https://go.dev/ref/spec#Assignment_statements)，核对可赋值目标。
- [Go 官方：map 的使用](https://go.dev/blog/maps)，补充存在性与遍历规则。
- [Effective Go：分配与返回局部地址](https://go.dev/doc/effective_go#allocation_new)，区分语义与实现。

本章没有执行代码、测量分配或部署项目。文中的具体输出是静态推导；涉及运行时布局、性能和并发的结论留待相应课程通过证据展开。
