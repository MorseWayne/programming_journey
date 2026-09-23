---
title: 01.06 方法与接口：让会话存储依赖能力而非具体实现
icon: /assets/icons/article.svg
order: 7
date: 2026-09-23
---

[返回第一卷](./README.md) · [上一章：map、结构体与指针](./05_maps_structs_pointers.md)

# 01.06 方法与接口：让会话存储依赖能力而非具体实现

> DeepTutor 原稿经技术和教学审阅后的章节。代码和输出是按规则推导的预期，本次没有执行 Go 程序。

## 本章从哪里开始

在 01.05 中，我们已经能把消息按会话和消息 ID 存进嵌套 map，也知道 map 值结构体有时需要“取出、修改、写回”。现在出现一个新的问题：如果每个调用方都自己读取会话、检查键、初始化 map、写入消息，规则会散落在很多地方。以后存储从内存换成文件或其他实现时，调用方又要跟着了解新细节。

本章先解决较小的问题：把“读取”和“写入”命名为某个存储值的方法，再让调用方依赖一组明确的能力。它不建立网络、持久化、身份认证或消息送达保证。

先修是 01.01–01.05：普通函数、map、结构体、地址、指针、值复制、nil、切片和 UTF-8 校验。错误类型、文件 I/O、并发、网络和数据库不属于本章前提。

| 阅读层次 | 内容 | 你应留下的东西 |
|---|---|---|
| 第一遍 | 方法、接收者、方法集、小接口 | 能用内存存储按键写入和读取消息 |
| 第一遍 | 接口动态类型和值 | 能区分 nil 接口、缺失键与带类型的 nil 指针 |
| 第二遍 | 类型断言、接口组合与嵌入 | 能说明何时需要具体实现，何时只依赖能力 |
| 综合 | 本地会话存储与源码对照 | 一组边界预测与本地保证范围 |

第一次建议读一至五节和第八节；能解释内存实现后，再读第六、七节。方法和接口不是为了让代码看起来抽象，而是为了让调用者明确依赖什么。

## 一、先区分数据、行为和职责

消息与会话主要是数据：消息有身份、发送者和正文；会话有自己的消息归属。内存存储则是保存这些数据并提供查询、写入的对象。

前章可以直接写：

```go
conversation.Messages[message.ID] = message
```

这行只表示修改一个内层 map 条目。它没有说明：map 是否已经初始化、重复 ID 怎么处理、是否可以查询、写入的结果由谁解释。把这些动作散落在多个调用点，后续很难确认每个入口都遵守相同约定。

本章使用会话内唯一的复合键：

```go
type MessageKey struct {
	ConversationID string
	MessageID      string
}

type Message struct {
	Key      MessageKey
	SenderID string
	Body     string
}
```

`MessageKey` 的两个字段都为 string，所以它可比较，能够作为 map 的键。`(c-a, m-a)` 和 `(c-b, m-a)` 是不同键；列表下标仍只是当前排列位置，不能替代这个身份。

现在定义一个只保存消息的内存对象：

```go
type MemoryStore struct {
	messages map[MessageKey]Message
}
```

这只是教学存储。它的职责是按键保存、查询本地消息；正文长度、UTF-8 和会话成员规则由进入存储前的校验步骤负责。职责分开不表示某一步可以被省略，而是让每一步的输入和输出可检查。

## 二、方法把行为关联到一个类型

### 2.1 创建一个可写的内存存储

`map` 的零值为 nil，能读取却不能写入。构造函数提前完成初始化：

```go
func NewMemoryStore() *MemoryStore {
	return &MemoryStore{
		messages: make(map[MessageKey]Message),
	}
}
```

`&MemoryStore{...}` 先建立一个结构体值，再得到指向它的指针。调用者保存的不是 map 本身，而是指向整个存储对象的 `*MemoryStore`。

### 2.2 逐符号读方法声明

```go
func (s *MemoryStore) Put(msg Message) (bool, string) {
	// 方法体
}
```

| 片段 | 含义 |
|---|---|
| `func` | 声明函数或方法 |
| `(s *MemoryStore)` | 接收者：本次操作关联的存储对象；s 是方法内使用的名字 |
| `Put` | 方法名，表达存入一条消息 |
| `(msg Message)` | 普通参数，待写入的消息值 |
| `(bool, string)` | 返回是否写入以及失败原因 |

接收者不是特殊的全局变量。调用 `store.Put(msg)` 时，store 的值被传给接收者位置，msg 被传给普通参数位置。接收者同样遵循按值传递；这里复制的是一个指针值，复制后的指针仍指向同一个 MemoryStore。

### 2.3 写入与查找方法

```go
func (s *MemoryStore) Put(msg Message) (bool, string) {
	if s == nil {
		return false, "存储对象不存在"
	}
	if msg.Key.ConversationID == "" || msg.Key.MessageID == "" {
		return false, "消息身份不完整"
	}
	if s.messages == nil {
		s.messages = make(map[MessageKey]Message)
	}
	if _, exists := s.messages[msg.Key]; exists {
		return false, "消息身份已存在"
	}
	s.messages[msg.Key] = msg
	return true, ""
}

func (s *MemoryStore) Find(key MessageKey) (Message, bool) {
	if s == nil {
		return Message{}, false
	}
	message, ok := s.messages[key]
	return message, ok
}
```

Put 需要指针接收者，关键不只是写已有 map 条目，还包括 `s.messages = make(...)`：这会替换结构体字段。若接收者只是 `MemoryStore` 值副本，初始化只留在副本中，调用者的字段仍为 nil。

Find 的 `false` 表示“没有这条键或没有可用存储”，不是“找到了一条正文为空的消息”。调用者必须看第二返回值，而不能猜零值 Message 的业务含义。

当前 Put 只验证身份和重复。调用它之前，应由已有的 `validateText` 规则确认会话类型、正上限、原始非空、字节上限与 UTF-8。本章将这个前置写清楚，而不假装内存存储完成了所有业务校验。

### 2.4 方法与普通函数的分工

Put、Find 依赖某一份存储对象及其字段，适合作为方法。像“正文是否符合字节规则”“两个 MessageKey 是否相同”这类不需要访问具体存储的规则，仍适合作为普通函数。

把所有函数都变成方法不会自动提高可维护性。先问：这段行为是否需要一个明确的接收数据对象？若不需要，普通函数通常更直接。

### 2.5 跟踪一次零值存储的写入

构造函数是推荐入口，但 Put 也按本章契约处理零值存储。下面逐步看这段局部代码：

```go
store := MemoryStore{}
msg := Message{
	Key:  MessageKey{ConversationID: "c-a", MessageID: "m-a"},
	Body: "你好",
}
ok, reason := store.Put(msg)
```

| 时刻 | 调用者的 `store.messages` | 接收者 s | 本次结果 |
|---|---|---|---|
| 调用前 | nil | 尚未进入方法 | 无 |
| 进入 Put | nil | 指向同一个 store | 检查身份 |
| 初始化 | 新的可写 map | 通过 s 写回字段 | map 不再为 nil |
| 写入条目 | 含 `(c-a,m-a)` | 访问同一 map | 返回 `true, ""` |

`store` 是可寻址的局部变量，所以语法允许调用它的指针接收者方法。真正传入方法的是 `&store` 的指针值；Put 中的 s 是这个指针值的副本，但两个指针仍指向同一份结构体。

如果改成值接收者，方法内 `s.messages = make(...)` 修改的是副本字段。方法可以暂时给副本写入，但调用结束后调用者 store 仍没有这张 map。这是“方法也按值传递”的具体表现。

## 三、值接收者、指针接收者与方法集

### 3.1 两种接收者的差别

为 MemoryStore 增加只读信息方法：

```go
func (s MemoryStore) HasMessages() bool {
	return len(s.messages) > 0
}
```

这是**值接收者**。调用时，s 获得 MemoryStore 值的副本；它只读取字段，适合本章这类小型只读行为。

Put 使用的是**指针接收者**：`func (s *MemoryStore) Put(...)`。它能修改原对象字段、处理 nil 接收者，也避免复制整个存储描述。选择首先来自语义和字段替换需要；不是“指针接收者总是更快”的结论。

### 3.2 方法集决定接口能否接收一个值

可以先记住这张表：

| 类型 | 本章能使用的方法 |
|---|---|
| `MemoryStore` | 值接收者方法，如 HasMessages |
| `*MemoryStore` | 值接收者和指针接收者方法，如 HasMessages、Put、Find |

局部变量通常可寻址，所以以下调用允许：

```go
store := MemoryStore{}
store.Put(Message{})
```

编译器可以取得这个局部变量的地址来调用指针方法。它不改变方法集规则。一个不可寻址的临时值则不能这样调用：

```go
// 故意错误：MemoryStore{} 不是可寻址变量。
// MemoryStore{}.Put(Message{})
```

更重要的是接口赋值。若接口要求 Put，MemoryStore 的值并不满足，因为它的方法集没有指针接收者 Put：

```go
type MessageWriter interface {
	Put(Message) (bool, string)
}

var writer MessageWriter = &MemoryStore{} // 合法
// var writer MessageWriter = MemoryStore{} // 故意错误
```

局部值能调用指针方法，与该值能作为接口实现被保存，是两个不同规则。后者看的是类型的方法集，不会因为某个变量恰好可寻址就放宽。

### 3.3 接收者重绑定不改变调用者指针

```go
func (s *MemoryStore) rebindLocally() {
	s = NewMemoryStore()
}
```

这只给方法内的 s 重新赋了新指针，不会让调用者的变量改为指向新存储。与它不同，`s.messages = make(...)` 是通过原指针修改原对象字段，所以调用者可见。

每次看到赋值，都先问左侧究竟是局部指针变量、结构体字段、map 条目，还是解引用目标。这个问题比背诵“指针能修改外部”更可靠。

### 3.4 接收者选择的业务问题

接收者形式不是风格竞赛。对下面三类动作，可以先用需要改变什么来判断：

| 动作 | 可以考虑的接收者 | 解释 |
|---|---|---|
| 报告当前是否有消息 | `MemoryStore` 值接收者 | 只读取本次存储描述和其 map 长度 |
| 首次使用时初始化消息表 | `*MemoryStore` 指针接收者 | 必须替换调用者对象的字段 |
| 保存审计计数 | `*AuditedStore` 指针接收者 | 必须增加调用者看到的计数 |

同一个类型通常保持接收者风格一致，会让方法集和使用方式更容易预测。若某方法使用值接收者、另一个使用指针接收者，必须能说明这种差异服务于什么语义。不要仅因结构体目前很小，就把所有方法随意写成值接收者；将来字段增加 map、切片或其他状态时，复制与修改边界仍需清楚。

## 四、小接口表达调用者真正需要的能力

### 4.1 把读写拆成两个最小接口

```go
type MessageReader interface {
	Find(MessageKey) (Message, bool)
}

type MessageWriter interface {
	Put(Message) (bool, string)
}

type MessageStore interface {
	MessageReader
	MessageWriter
}
```

接口不保存 map，也没有方法体。它只说明：某个值若要作为 MessageReader 使用，必须能 Find；作为 MessageWriter 使用，必须能 Put；作为 MessageStore 使用，必须同时具备二者。

把 MessageReader、MessageWriter 写在 MessageStore 中叫做**接口嵌入**或接口组合。它合并方法要求，不复制任何数据，也不自动授予业务权限。

### 4.2 具体类型隐式实现接口

MemoryStore 没有写 `implements MessageStore`，但 `*MemoryStore` 的方法集包含 Put、Find，因此它实现了 MessageStore。这个关系由方法签名决定，不由类型名或包名决定。

再定义一个教学实现：

```go
type DisabledStore struct{}

func (DisabledStore) Put(Message) (bool, string) {
	return false, "本地存储已禁用"
}

func (DisabledStore) Find(MessageKey) (Message, bool) {
	return Message{}, false
}
```

DisabledStore 也实现 MessageStore。它不是缺少实现，而是以明确的本地规则拒绝写入、找不到消息。接口统一调用形状，不能承诺每个实现都会成功。

### 4.3 调用方只需要依赖接口

```go
func saveThenFind(store MessageStore, msg Message) (Message, bool, string) {
	ok, reason := store.Put(msg)
	if !ok {
		return Message{}, false, reason
	}
	stored, exists := store.Find(msg.Key)
	if !exists {
		return Message{}, false, "写入后未找到本地记录"
	}
	return stored, true, ""
}
```

这个函数不知道内部是 map、文件还是其他实现；它也不会直接访问 `store.messages`，因为 MessageStore 并没有暴露这个字段。

当 store 的动态具体值是 `*MemoryStore`，调用会进入 MemoryStore 的方法；当它是 DisabledStore，Put 返回拒绝，函数不再调用 Find。替换实现后，调用方源码不必改动，但业务结果仍要由各实现的方法契约解释。

若函数只展示已有消息，应接收 MessageReader；若只写入，应接收 MessageWriter。不要为了“以后可能有用”就要求调用方提供完整 MessageStore。

### 4.4 接口调用时发生了什么

在这条语句里：

```go
var store MessageStore = NewMemoryStore()
```

左侧 store 的静态类型是 MessageStore，编译器只允许通过它调用 Put 和 Find。右侧的实际值是 `*MemoryStore`，这就是当前动态具体类型。

执行 `store.Put(msg)` 时，可以按以下过程理解：

1. 编译阶段确认 MessageStore 有 Put 这个方法。
2. 运行时从接口值知道当前具体类型是 `*MemoryStore`。
3. 调用对应的 `(*MemoryStore).Put`，接收者得到同一存储对象的指针值。
4. Put 返回 bool 和原因，调用者再决定继续 Find 还是停止。

接口没有让内存 map 消失，也没有让真实工作变得异步；它只把“调用者需要 Put/Find”与“当前怎样保存”分开。若换成 DisabledStore，前两步相同，第三步改为调用 DisabledStore 的 Put，结果按该实现返回拒绝。

这正是接口替换的边界：**调用代码可保持不变，语义是否仍满足需求必须通过实现契约、用例和运行证据确认。**

## 五、接口值、动态类型、动态值与 nil

接口变量可理解为同时保存**动态类型**和**动态值**。未赋值的接口两个部分都没有：

```go
var reader MessageReader
fmt.Println(reader == nil) // 预期：true
```

另一种情形：

```go
var memory *MemoryStore = nil
reader = memory
fmt.Println(reader == nil) // 预期：false
```

第二段 reader 的动态类型是 `*MemoryStore`，动态值才是 nil 指针；接口整体不为 nil。这个情形常称为 **typed nil**。

| 表达式 | 接口动态类型 | 接口动态值 | `== nil` |
|---|---|---|---|
| `var reader MessageReader` | 无 | 无 | true |
| `reader = (*MemoryStore)(nil)` | `*MemoryStore` | nil 指针 | false |
| `reader = NewMemoryStore()` | `*MemoryStore` | 非 nil 指针 | false |

本章的 Find 显式检查 `s == nil`，所以对带类型 nil 的 `*MemoryStore` 调用 Find 会返回 `Message{}, false`。这只是这个方法的约定。其他指针接收者方法若立刻读取字段，可能触发运行时 panic；接口的 `store != nil` 检查不能自动证明内部实现可用。

避免这类问题的首选方式是构造约定：NewMemoryStore 返回可用对象；调用者不把 nil 指针包装进接口。不要在每一层用猜测动态类型的代码替代清楚的构造边界。

还要分开四种概念：nil 接口、带类型 nil 指针的接口、缺失键、找到的零值 Message。它们可能都让某些字段看起来为空，但来源和处理方式不同。

### 5.1 四种“空”放在同一张表里比较

| 情况 | 语言层观察 | 本章建议怎样处理 |
|---|---|---|
| `var store MessageStore` | 接口本身为 nil | 构造边界拒绝，不能调用方法 |
| `MessageStore((*MemoryStore)(nil))` | 接口非 nil，内部指针 nil | 不将它作为可用依赖传入；具体方法可自行定义保护 |
| `messages[key]` 缺失 | 返回零 Message 与 false | 读取第二返回值，报告未找到 |
| `Message{}` 被实际保存 | 读取时 ok 为 true | 按业务字段规则判断其是否有效，不把它当缺失 |

这张表说明为什么“一个字段是空字符串”不能单独回答存储是否有效。检查应该靠适合该层的证据：接口的 nil 比较、map 的 comma-ok、指针的 nil 检查，或消息字段的业务规则。

## 六、第二遍：类型断言只用于确实需要具体实现的时候

类型断言询问接口当前保存的动态值是否为某个具体类型：

```go
memory, ok := store.(*MemoryStore)
```

这里的 `ok` 为 true 时，memory 的静态类型是 `*MemoryStore`；为 false 时，memory 为该指针类型的零值 nil。使用前仍要判断 memory 是否为 nil：接口可能保存了 `(*MemoryStore)(nil)`。

```go
if memory, ok := store.(*MemoryStore); ok && memory != nil {
	fmt.Println(memory.HasMessages())
}
```

单结果写法 `memory := store.(*MemoryStore)` 在断言不成立时会 panic。本章业务分支使用 comma-ok 形式，避免把 DisabledStore 这种合法实现误当成异常。

断言适合很少见的诊断或实现专属维护操作。例如统计内存存储当前 map 键数，这不是 MessageStore 的共同能力，调用者必须明确承认依赖了具体实现。

普通读写不应先断言为 *MemoryStore：那样 DisabledStore 或未来文件实现即使满足接口，也会被排除。接口的意义正是调用共同方法时不依赖具体类型。

也可以断言另一个接口，例如 `writer, ok := store.(MessageWriter)`。本章的 MessageStore 已包含 Writer，因此这个断言通常没有额外价值；它只说明断言目标也可以是接口能力，不一定是具体结构体。

## 七、第二遍：组合接口、嵌入字段和包装职责

接口嵌入已把 Reader 与 Writer 组合成 MessageStore。结构体也能嵌入一个接口字段：

```go
type AuditedStore struct {
	MessageStore
	Writes int
}
```

如果嵌入的 MessageStore 非 nil，AuditedStore 可以经由提升的方法调用 Find。直接调用被提升的 Put 并不会自动增加 Writes；嵌入只提供转发入口，不产生审计业务逻辑。

```go
func (s *AuditedStore) Put(msg Message) (bool, string) {
	if s == nil || s.MessageStore == nil {
		return false, "未配置消息存储"
	}
	ok, reason := s.MessageStore.Put(msg)
	if !ok {
		return false, reason
	}
	s.Writes++
	return true, ""
}
```

这里包装方法先委托底层存储，只有写入成功才增加计数。若底层拒绝，Writes 不变。该计数仍只是本地观察，不是系统已经持久保存或设备已收到的数目。

`s.MessageStore == nil` 能发现接口字段本身为空，不能发现其内部包装的是带类型 nil 指针。避免后者仍应由构造函数和实现契约处理；本章不引入反射来猜所有可能实现。

嵌入不是继承：AuditedStore 没有自动获得一份独立数据，也没有自动拥有底层实现的权限、并发安全或可靠性保证。组合和嵌入只是组织方法与依赖的语言工具。

### 7.1 审计包装的状态表

若 AuditedStore 的嵌入存储是可用的 MemoryStore，调用包装后的 Put 有三种本章范围内的结果：

| 底层情况 | Put 返回 | Writes 的变化 | 说明 |
|---|---|---:|---|
| 嵌入接口为空 | `false, "未配置消息存储"` | 不变 | 包装层没有可委托对象 |
| 底层拒绝重复键 | false 与底层原因 | 不变 | 没有完成本地写入 |
| 底层接受新键 | `true, ""` | 加一 | 只记录本地存储成功次数 |

因此 Writes 的含义必须写成“包装层观察到的底层 Put 成功次数”。它不等于正文通过数、网络请求数、持久提交数或对端已读数。名称和计数时机共同定义了指标，不能只看字段类型是 int 就猜业务含义。

## 八、综合程序、OpenIM 对照与练习

下面的程序将本章行为放在一起。它假设 msg 已通过前章文本校验；Put 只守住身份、初始化和重复键。每个运行场景都属于本地内存模型。

```go
package main

import "fmt"

type MessageKey struct {
	ConversationID string
	MessageID      string
}

type Message struct {
	Key      MessageKey
	SenderID string
	Body     string
}

type MessageReader interface {
	Find(MessageKey) (Message, bool)
}

type MessageWriter interface {
	Put(Message) (bool, string)
}

type MessageStore interface {
	MessageReader
	MessageWriter
}

type MemoryStore struct {
	messages map[MessageKey]Message
}

func NewMemoryStore() *MemoryStore {
	return &MemoryStore{messages: make(map[MessageKey]Message)}
}

func (s *MemoryStore) Put(msg Message) (bool, string) {
	if s == nil {
		return false, "存储对象不存在"
	}
	if msg.Key.ConversationID == "" || msg.Key.MessageID == "" {
		return false, "消息身份不完整"
	}
	if s.messages == nil {
		s.messages = make(map[MessageKey]Message)
	}
	if _, exists := s.messages[msg.Key]; exists {
		return false, "消息身份已存在"
	}
	s.messages[msg.Key] = msg
	return true, ""
}

func (s *MemoryStore) Find(key MessageKey) (Message, bool) {
	if s == nil {
		return Message{}, false
	}
	message, ok := s.messages[key]
	return message, ok
}

type DisabledStore struct{}

func (DisabledStore) Put(Message) (bool, string) {
	return false, "本地存储已禁用"
}

func (DisabledStore) Find(MessageKey) (Message, bool) {
	return Message{}, false
}

func saveThenFind(store MessageStore, msg Message) (Message, bool, string) {
	if store == nil {
		return Message{}, false, "存储接口为空"
	}
	ok, reason := store.Put(msg)
	if !ok {
		return Message{}, false, reason
	}
	stored, exists := store.Find(msg.Key)
	if !exists {
		return Message{}, false, "写入后未找到本地记录"
	}
	return stored, true, ""
}

func main() {
	var store MessageStore = NewMemoryStore()
	msg := Message{
		Key:      MessageKey{ConversationID: "c-a", MessageID: "m-a"},
		SenderID: "u-a",
		Body:     "你好",
	}

	stored, ok, reason := saveThenFind(store, msg)
	fmt.Printf("内存实现：ok=%t reason=%q body=%q\n", ok, reason, stored.Body)

	var blocked MessageStore = DisabledStore{}
	_, ok, reason = saveThenFind(blocked, msg)
	fmt.Printf("禁用实现：ok=%t reason=%q\n", ok, reason)
}
```

预期输出：

```text
内存实现：ok=true reason="" body="你好"
禁用实现：ok=false reason="本地存储已禁用"
```

内存实现成功，说明这份 map 在当前进程内已保存该键；禁用实现的动态类型不同，却仍满足 MessageStore 的方法要求。两者都不构成服务端受理、持久化、设备接收或已读证据。

### 已读 OpenIM 接口的对照范围

固定提交 `f6411a8a1a31d3df36f4c2b3ad28481a94141e1f` 的 [CommonMsgDatabase](https://github.com/openimsdk/open-im-server/blob/f6411a8a1a31d3df36f4c2b3ad28481a94141e1f/pkg/common/storage/controller/msg.go#L51) 与 [MsgTransferDatabase](https://github.com/openimsdk/open-im-server/blob/f6411a8a1a31d3df36f4c2b3ad28481a94141e1f/pkg/common/storage/controller/msg_transfer.go#L22) 都以方法接口描述消息相关能力；相应构造函数返回接口值，并由具体指针实现承担方法。

这只支持一个阅读结论：调用方可以通过接口依赖行为，而不直接访问实现结构体字段。它不支持关于存储介质、队列、事务、重试、容量或可靠投递的结论；这些需要继续阅读方法实现、配置和故障路径。

### 十六道练习

<details><summary>练习 1：方法还是普通函数</summary>

判断“比较两个 MessageKey”与“在某个存储中 Find”分别更适合作为普通函数还是方法。前者不需要具体存储对象，适合普通函数；后者依赖存储字段，适合方法。

</details>

<details><summary>练习 2：零值存储</summary>

`var s MemoryStore` 后直接 `s.Put(msg)` 是否能工作？按本章 Put 的实现可以：指针接收者会在 messages 为 nil 时创建 map。若改成值接收者，初始化只留在副本中，不能依赖同样结果。

</details>

<details><summary>练习 3：重复键</summary>

对同一 `(c-a,m-a)` 连续调用 Put 两次，第一次成功，第二次返回 false 与“消息身份已存在”；旧 Message 不应被覆盖。

</details>

<details><summary>练习 4：会话内还是全局身份</summary>

`(c-a,m-a)` 与 `(c-b,m-a)` 是不同 MessageKey，可以分别保存。若需求改为全局消息 ID，键类型和重复规则都要一起修改。

</details>

<details><summary>练习 5：局部调用与接口赋值</summary>

`store := MemoryStore{}` 可以调用 `store.Put`，但 `var w MessageWriter = MemoryStore{}` 不可编译。前者可对可寻址变量取地址调用；后者检查类型的方法集。

</details>

<details><summary>练习 6：值接收者</summary>

HasMessages 定义为值接收者时，MemoryStore 和 *MemoryStore 都能拥有它。Put 是指针接收者，因此只有 *MemoryStore 拥有 Put。

</details>

<details><summary>练习 7：DisabledStore</summary>

DisabledStore 能赋给 MessageStore，因为签名齐全；saveThenFind 仍失败，因为 Put 的业务结果是拒绝。实现接口与满足业务目标不同。

</details>

<details><summary>练习 8：nil 接口</summary>

`var store MessageStore` 使 store 为 nil。调用方法之前应先检查接口本身，或由构造函数保证不返回空接口。

</details>

<details><summary>练习 9：typed nil</summary>

`var p *MemoryStore; var reader MessageReader = p` 后 reader 不为 nil。这个章节的 Find 会返回未找到，因为它检查接收者；其他实现不能据此假定安全。

</details>

<details><summary>练习 10：安全断言</summary>

对 DisabledStore 进行 `memory, ok := store.(*MemoryStore)`，ok 为 false。使用 comma-ok，不能让一个合法替换实现导致 panic。

</details>

<details><summary>练习 11：断言后的 nil</summary>

若接口装的是 `(*MemoryStore)(nil)`，断言 `ok` 为 true，但 memory 为 nil；使用具体对象前仍要检查 memory != nil。

</details>

<details><summary>练习 12：最小能力</summary>

只展示消息时，参数应为 MessageReader；只保存时为 MessageWriter；确实要写完马上查询才要求 MessageStore。

</details>

<details><summary>练习 13：嵌入接口字段</summary>

AuditedStore 嵌入 MessageStore 后，直接使用提升的 Put 不会增加 Writes。要审计必须显式包装 Put，并在底层成功之后增加计数。

</details>

<details><summary>练习 14：嵌入字段为空</summary>

AuditedStore 的 MessageStore 字段为 nil 时，调用提升的 Find 可能失败。嵌入不是自动构造；构造函数或调用边界应保证依赖可用。

</details>

<details><summary>练习 15：文本规则在哪里</summary>

如果直接对 Body 为空的 Message 调用本章 Put，它能否说明正文已通过 01.03 规则？不能。Put 的契约只验证身份和重复；上层应先调用明确的文本校验，或把验证责任改写进 Put 并同步所有用例。

</details>

<details><summary>练习 16：本地写入的保证</summary>

综合程序返回 true，能够说明当前 MemoryStore 的 map 已有该键。它不能说明身份可信、消息已持久化、任何设备已收到或用户已读。每个结论需要不同的协议或运行证据。

</details>

### 从预测到变式：再做八个小检查

下面的题不要求新增框架或服务，只用本章已经建立的模型。每道题先在纸上写出动态具体类型、返回值和被改变的对象，再看反馈。

<details><summary>练习 17：Find 是值接收者会怎样</summary>

若把 Find 改成值接收者 `func (s MemoryStore) Find(...)`，`MemoryStore` 与 `*MemoryStore` 的方法集分别多了什么？Put 的接口满足结论是否自动变化？

**反馈：** 两种类型都拥有值接收者 Find；Put 仍是指针接收者，所以要求 Put 的 MessageWriter、MessageStore 仍只能由 `*MemoryStore` 满足。方法集按每个方法的接收者分别计算，不能因为一个只读方法改成值接收者就让所有接口关系一起改变。

</details>

<details><summary>练习 18：重复键与新会话</summary>

首次 Put 保存 `(c-a,m-a)` 后，再保存 `(c-b,m-a)` 是否重复？如果业务把消息 ID 改为全局唯一，需要改哪些地方？

**反馈：** 在当前复合键模型中不重复，会保存两项。若全局唯一，应改键类型或 Put 中的重复判断，并更新所有依赖“会话内唯一”的查询和用例。只改提示文字而不改 map 键，不会改变真实重复范围。

</details>

<details><summary>练习 19：先校验还是先写入</summary>

有人把 `s.messages[msg.Key] = msg` 移到重复键检查之前，然后再发现重复。旧消息与新消息会怎样？为什么这比返回 false 更严重？

**反馈：** 写入会先覆盖旧值，即使随后返回重复拒绝，调用者看到的存储状态已经被修改。拒绝路径必须在写入前完成本章负责的检查；屏幕上的原因与数据状态需要一起符合契约。

</details>

<details><summary>练习 20：接口没有字段</summary>

为什么 `store.messages` 不能写在 `saveThenFind` 中？如果某个业务函数需要统计 MemoryStore 的 map 长度，应怎样说明依赖？

**反馈：** 静态类型 MessageStore 只声明 Put、Find，没有 messages 字段。若确实需要内存实现专属诊断，可以在边界处用带 comma-ok 的断言取得 `*MemoryStore`，并明确该函数不再可用于所有实现。普通读写流程不应为此断言。

</details>

<details><summary>练习 21：typed nil 进入 saveThenFind</summary>

`var memory *MemoryStore; var store MessageStore = memory` 后把 store 传入 saveThenFind。接口为空检查是否会拦住它？本章 Put 会给出什么结果？

**反馈：** `store == nil` 为 false，接口为空检查不会拦住。动态分派进入本章的 `(*MemoryStore).Put`；它先检查 `s == nil`，返回 `false, "存储对象不存在"`。这是 Put 明确写出的保护，不是所有接口实现的默认行为。

</details>

<details><summary>练习 22：接口组合与两个对象</summary>

若从只读快照取消息，再写入新的内存存储，函数应接收一个 MessageStore 还是分别接收 MessageReader、MessageWriter？

**反馈：** 分别接收 Reader 和 Writer 更准确：读取和写入来自两个对象，任何一个对象不需要同时具备另一项能力。MessageStore 适合同一个依赖必须读写时，不应被当作“接口越大越完整”的默认选择。

</details>

<details><summary>练习 23：包装方法的失败计数</summary>

AuditedStore 在委托 Put 前就 `Writes++`，而底层因重复键拒绝。此时 Writes 与它的名称是否一致？怎样修正？

**反馈：** 不一致。若名称表示成功写入次数，底层返回 true 后才递增；若确实要数尝试次数，应改名为 Attempts，并清楚说明拒绝也计入。计数位置决定指标含义。

</details>

<details><summary>练习 24：把接口替换成文件实现的判断</summary>

未来写了一个 FileStore，方法签名满足 MessageStore。能否直接声明它已经能安全替代 MemoryStore？

**反馈：** 编译器可以确认接口方法形状匹配；是否同样处理重复、缺失、文本规则、资源关闭和失败，需要比较它的方法契约及独立验证。接口解决调用边界，不自动证明行为等价。

</details>

## 进入下一章前的检查

你应能说明：接收者为什么也是参数；为什么 `*MemoryStore` 能满足读写接口而 `MemoryStore` 值不能；接口如何隐藏实现而不隐藏业务保证；nil 接口和 typed nil 何时不同；类型断言为何不能替代接口设计。

下一章 01.07 将讲错误与资源生命周期，届时会用 error、defer 和 Reader/Writer 解释文件操作的失败与关闭责任。当前内存存储不等同于文件实现。

## 核对资料

- [Go 规范：方法集](https://go.dev/ref/spec#Method_sets)
- [Go 规范：接口](https://go.dev/ref/spec#Interface_types)
- [Go 规范：类型断言](https://go.dev/ref/spec#Type_assertions)
- [Go 规范：方法声明](https://go.dev/ref/spec#Method_declarations)
- [OpenIM 固定接口定义](https://github.com/openimsdk/open-im-server/tree/f6411a8a1a31d3df36f4c2b3ad28481a94141e1f/pkg/common/storage/controller)

这些资料用于核对语言和已读源码事实；本章的内存实现、键规则和练习为教学设计。
