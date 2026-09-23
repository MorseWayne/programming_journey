# 01.06 方法与接口：让会话存储依赖能力而非具体实现

*本章以虚构即时通信中的本地会话消息存储为主线，带领 Go 初学者从直接操作 map 的重复问题出发，学习如何用方法组织数据行为、用小接口表达读取与写入能力。读者将通过内存存储、禁用存储、nil 边界和类型断言等循序案例，理解接口依赖并不等于自动持久化、可靠传输或服务端受理。*

**章节:** 2

---

## 本书导览

- 了解整本书的章节脉络
- 掌握各章之间的概念依赖关系
- 选择最合适的阅读顺序

# 01.06 方法与接口：让会话存储依赖能力而非具体实现

本章以虚构即时通信中的本地会话消息存储为主线，带领 Go 初学者从直接操作 map 的重复问题出发，学习如何用方法组织数据行为、用小接口表达读取与写入能力。读者将通过内存存储、禁用存储、nil 边界和类型断言等循序案例，理解接口依赖并不等于自动持久化、可靠传输或服务端受理。

下方的概念图展示了本书 0 个核心概念以及它们之间的依赖关系；再下方是 1 个章节的入口。你可以按从上到下的顺序阅读，也可以根据自己的兴趣或先验知识选择切入点。

#### 概念图

```mermaid
graph TD
  empty["(no concepts yet)"]
```

## 章节索引

- **01.06 方法与接口：让会话存储依赖能力而非具体实现** — 承接会话、消息、map、结构体和指针，先用方法给本地消息存储命名行为，再用小接口表达读取和写入能力。解释值/指针接收者、方法集、动态类型和值、nil、断言与接口组合；使用虚构 IM 内存存储，明确没有网络、持久、送达或已读保证。

## 01.06 方法与接口：让会话存储依赖能力而非具体实现

- 从直接操作会话 map 过渡到具有明确职责的普通方法
- 区分值接收者、指针接收者和方法调用的目标
- 用方法集解释为什么 *T 与 T 满足接口的情况不同
- 用小接口表达消息读取和写入能力，并理解隐式实现
- 读懂接口值的动态类型、动态值、nil 与 typed nil 边界
- 谨慎使用类型断言和接口组合，避免用具体类型破坏抽象
- 用内存消息存储完成本地写入/查询，并将保证范围说清楚

前面我们直接读写会话 map；这一节先识别重复操作，再为本地消息存储建立清晰的行为边界。

### 从直接读写 map 发现重复职责

### 从直接读写 map 发现重复职责

设虚构 IM 中已有会话 `c-a`、用户 `u-a`，准备加入消息 `m-a`。前面可以把会话存进一个 `map`：键是会话编号，值是会话数据。

```go
package main

import "fmt"

type 会话 struct {
	分类已登记 bool
	消息列表   []string
}

func main() {
	会话表 := map[string]会话{
		"c-a": {分类已登记: true},
	}

	正文 := "你好"
	会话值, 存在 := 会话表["c-a"]
	if !存在 {
		fmt.Println("会话不存在")
		return
	}
	if !会话值.分类已登记 {
		fmt.Println("会话未登记分类")
		return
	}
	if 正文 == "" || len(正文) > 100 {
		fmt.Println("正文不合法")
		return
	}

	会话值.消息列表 = append(会话值.消息列表, "m-a:"+正文)
	会话表["c-a"] = 会话值
	fmt.Println("本地已写入")
}
```

这里有两类重复职责：

- **查找职责**：从 `会话表` 找到 `c-a`，并处理不存在的情况。
- **规则与写入职责**：检查会话分类、正文原始非空、字节长度上限，以及把修改后的值重新写回 `map`。

若“发送文本”“发送引用消息”“导入本地草稿”都直接操作 `map`，这些判断会散落在多处。某处可能忘记检查分类，另一处可能修改了会话值却忘记写回 `map`。

特别要注意：`map[string]会话` 中取出的 `会话值` 是值复制；修改它不会自动更新表项，必须执行 `会话表["c-a"] = 会话值`。

因此，问题不只是“怎样写入”，而是：哪些规则属于消息加入，哪些查找和保存步骤属于会话存储。后续可把这些行为组织到更清晰的边界中。这里的“本地已写入”仅表示内存数据已变化，不表示服务端已受理、消息已持久化、其他设备已收到，或对方已经已读。

### 用数据、行为与职责整理本地存储

### 用数据、行为与职责整理本地存储

前面直接读写 `map` 时，登记会话分类和加入消息都会反复出现“先查找、再判断、后写入”的步骤。重复本身不是问题，但规则散落在 `main` 中后，读者很难判断：到底是谁保证“先登记分类”，谁保证正文合法，谁真正修改本地数据。

先把三类对象分开：

- **会话**保存会话标识与分类。例如 `c-a` 的分类可以是“单聊”或“群聊”。
- **消息**保存消息标识、所属会话、发送者与正文。例如 `m-a` 由 `u-a` 发往 `c-a`。
- **内存存储**保存多个会话和多个消息，并负责按规则登记、查询和加入它们。

这里的“行为”指对数据执行的操作；“职责”指一个对象应当保证什么。会话和消息主要保存数据，内存存储则负责组织数据并守住写入规则。

```go
package main

import "fmt"

type 会话 struct {
	标识 string
	分类 string
}

type 消息 struct {
	标识   string
	会话标识 string
	发送者  string
	正文   string
}

type 内存存储 struct {
	会话表 map[string]会话
	消息表 map[string][]消息
}

func main() {
	存储 := 内存存储{
		会话表: make(map[string]会话),
		消息表: make(map[string][]消息),
	}

	存储.会话表["c-a"] = 会话{标识: "c-a", 分类: "单聊"}
	存储.消息表["c-a"] = append(存储.消息表["c-a"],
		消息{标识: "m-a", 会话标识: "c-a", 发送者: "u-a", 正文: "你好"},
	)

	fmt.Println(存储.会话表["c-a"].分类)
	fmt.Println(存储.消息表["c-a"][0].正文)
}
```

预期输出为：

```text
单聊
你好
```

下一步应把“登记分类”和“加入消息”写成内存存储的行为：加入消息时检查会话是否已登记、正文上限是否为正数、原始正文是否非空、字节数是否超限、正文是否为合法 UTF-8。这样，调用方不必重复拼装检查步骤。

这些操作目前只修改程序运行期间的内存；它不表示服务端已经受理消息，也不表示消息已持久保存、其他设备已接收或对方已读。

### 先为存储命名读取与写入行为

### 先为存储命名读取与写入行为

前面若每次都直接操作 `map`，调用处会反复出现“查找会话”“写入消息”等细节。我们可以把这些操作命名为与存储值关联的行为。

先定义内存中的会话存储。`会话消息`记录本地已加入的一条消息；`会话存储`中的 `分类` 用来表示某会话是否已登记分类，`消息` 保存各会话的消息列表。

```go
package main

import "fmt"

type 会话消息 struct {
	会话ID string
	正文   string
}

type 会话存储 struct {
	分类 map[string]string
	消息 map[string][]会话消息
}
```

方法是在函数名之前写出“接收者”的函数。下面的 `(s 会话存储)` 表示：`查询分类` 与一个 `会话存储` 值关联。它只读取 `map`，因此使用值接收者：

```go
func (s 会话存储) 查询分类(会话ID string) (string, bool) {
	分类, 已登记 := s.分类[会话ID]
	return 分类, 已登记
}
```

写入消息时需要修改 `消息` 字段所指向的 `map` 内容。虽然 `map` 本身是引用型数据，值接收者也能改动已有 `map`，但存储的写入行为通常使用指针接收者 `(s *会话存储)`：它明确表达“此操作可能修改存储”，也为将来初始化或替换字段留出一致的写法。

```go
func (s *会话存储) 写入消息(消息 会话消息) {
	s.消息[消息.会话ID] = append(s.消息[消息.会话ID], 消息)
}

func main() {
	存储 := 会话存储{
		分类: map[string]string{"c-a": "u-a"},
		消息: make(map[string][]会话消息),
	}

	分类, 已登记 := 存储.查询分类("c-a")
	if 已登记 {
		存储.写入消息(会话消息{会话ID: "c-a", 正文: "m-a"})
		fmt.Println(分类)
	}
}
```

预期输出：

```text
u-a
```

`查询分类` 和 `写入消息` 只给本地内存操作命名；它们不表示服务端已经受理消息，也不表示消息已持久化、设备已接收或对方已读。消息正文的原始非空、正数字节上限、字节不超限、合法 UTF-8，以及会话必须先登记分类等规则，仍应由后续的规则函数明确检查。

### 用小接口描述调用方需要的能力

### 用小接口描述调用方需要的能力

前面如果发送流程直接操作 `map[string]Conversation`，规则函数就会同时知道两件事：如何判断消息能否写入，以及消息具体存在哪里。这里先把“调用方需要什么能力”说清楚。

假设本地内存中有会话 `c-a`、用户 `u-a` 和消息 `m-a`。发送一条消息前，仍要遵守原有规则：会话已登记分类、正文上限为正数、原始正文非空、字节数不超限，并且是合法 UTF-8。规则检查通过后，调用方只需要：

1. 读取一个会话；
2. 写回更新后的会话。

可以用接口描述这两个能力。接口是一组方法签名；它不保存数据，只规定某个值若要被使用，必须能做什么。

```go
type ConversationStore interface {
	Get(id string) (Conversation, bool)
	Put(conversation Conversation)
}
```

这里 `Get` 表示按会话标识读取会话。返回的 `bool` 表示是否找到：`true` 是找到，`false` 是没有该会话。`Put` 表示写入一个会话值。

例如，发送规则函数可以接收 `ConversationStore`：

```go
func AddLocalMessage(store ConversationStore, conversationID string, message Message) bool {
	conversation, ok := store.Get(conversationID)
	if !ok {
		return false
	}

	conversation.Messages = append(conversation.Messages, message)
	store.Put(conversation)
	return true
}
```

这表示函数依赖“能读取和写入会话”的能力，而不是依赖某个名为 `MemoryStore` 的具体结构体。只要某个类型拥有完全相同的 `Get` 和 `Put` 方法，它就能作为 `ConversationStore` 传入。

这种写法的范围要说准确：接口不会自动保存到文件，也不会自动连接服务端，更不会让本地写入变成服务端受理、消息送达设备或消息已读。当前示例仍是顺序执行的内存操作；接口仅把调用方与具体存储值之间的依赖边界表达出来。

### 识别方法集、动态值与 nil 的边界

### 识别方法集、动态值与 nil 的边界

前面若反复写 `sessions[id]`，规则函数就直接依赖某个 `map` 值。可以把数据定义为会话记录，把行为定义为“按会话取记录”，把职责定义为存储组件负责查询；调用方只依赖它需要的能力。

`方法集`是某个类型可调用的方法集合。值接收者方法属于值和指针；指针接收者方法只属于指针：

`type Memory struct{}; func (Memory) Find(id string) bool { return id != "" }; func (*Memory) Save() {}`

因此 `Memory{}` 可调用 `Find`，`(&Memory{}).Find()` 和 `(&Memory{}).Save()` 都可调用；但下面是错误示例：

`Memory{}.Save()`  
错误：`Save` 的接收者是 `*Memory`，值 `Memory{}` 不具备该方法。

接口描述能力，例如：

`type Finder interface { Find(string) bool }`  
`type Saver interface { Save() }`  
`type Store interface { Finder; Saver }`

接口组合 `Finder; Saver` 表示同时需要两种能力，不会自动保存数据。`var f Finder = Memory{}` 中，接口值含有动态类型 `Memory` 与动态值 `Memory{}`；`f != nil`。

要特别区分“空接口”和“接口里装着空指针”：

`var p *Memory = nil; var s Saver = p`

此时 `s != nil`，因为它仍带有动态类型 `*Memory`；但调用 `s.Save()` 是否安全，取决于 `Save` 的实现是否能处理空接收者。

类型断言用于检查动态类型：`m, ok := f.(Memory)`。`ok` 为真才可使用 `m`；直接写 `m := f.(Memory)` 在类型不符时会发生运行时异常。对本地 IM 而言，这些边界只组织内存中的 c-a/u-a/m-a 写入；它不表示服务端受理、持久化、设备接收或已读。

> **要点** — 先给本地存储的重复操作命名，再让调用方依赖所需读写能力；这不意味着自动持久化或消息送达。

从内存消息表出发，把“存入”和“查找”命名为类型的方法，理解接收者、指针与共享状态如何协作。

### 定义内存存储与消息键

### 定义内存存储与消息键

先用三个类型描述“以键保存消息”的最小模型：

```go
type MessageKey string

type Message struct {
	Key     MessageKey
	Sender  string
	Content string
}

type MemoryStore struct {
	messages map[MessageKey]Message
}
```

`MessageKey` 是以 `string` 为底层类型的新命名类型。它表示消息的唯一标识，而不只是任意文本；将键单独命名后，`map[MessageKey]Message` 清楚表达了“由消息键索引消息”的关系。

`Message` 是一条本地保存的消息记录：

- `Key`：消息自身的查找键；
- `Sender`：发送者标识；
- `Content`：消息正文。

`MemoryStore` 则是存储容器。它只有一个字段 `messages`，其类型可拆开理解：

| 部分 | 含义 |
|---|---|
| `map` | 键值映射表 |
| `MessageKey` | 映射表的键类型 |
| `Message` | 映射表的值类型 |
| `messages` | `MemoryStore` 持有的具体消息表 |

因此，数据关系是：

| 调用者持有 | 接收者对象 | 共享目标 |
|---|---|---|
| `*MemoryStore` | `MemoryStore` | `messages[MessageKey] = Message` |

这里的“内存”意味着消息仅保存在当前进程的内存中；程序结束后，映射表随之消失。该模型也暂不验证发送者是否为成员、不解析真实网络消息协议、不处理持久化或并发访问。它只回答一个基础问题：给定一条带键的消息，能否按键存入并找回。

后续可为 `MemoryStore` 定义 `Put` 和 `Find` 方法，使“存入”“查找”成为这个存储类型自身的能力；而与某个具体存储对象无关的规则，仍应保留为普通函数。

### 逐符号阅读方法声明

### 逐符号阅读方法声明

先看两条方法声明：

`func (s *MemoryStore) Put(msg Message) (bool, string)`

`func (s *MemoryStore) Find(key MessageKey) (Message, bool)`

它们都以 `func` 开头，表示“声明一个可调用的函数体”。不同之处在于，`func` 后面多了接收者：

`(s *MemoryStore)`

这里的 `s` 是方法体内使用的变量名，`*MemoryStore` 是它的类型。它表示：`Put` 和 `Find` 是与 `MemoryStore` 类型关联的行为，而不是游离在外的普通函数。

可以逐段阅读 `Put`：

| 符号 | 含义 |
|---|---|
| `func` | 声明函数或方法 |
| `(s *MemoryStore)` | 接收者；本次操作的存储实例 |
| `Put` | 方法名，表达“存入消息” |
| `(msg Message)` | 普通参数；传入待保存的消息值 |
| `(bool, string)` | 两个返回结果，例如成功标记与说明文本 |

`Find` 的结构相同：

| 符号 | 含义 |
|---|---|
| `(s *MemoryStore)` | 要查找的存储实例 |
| `Find` | 方法名，表达“按键查找” |
| `(key MessageKey)` | 查找所用的消息键 |
| `(Message, bool)` | 找到的消息，以及是否存在 |

调用时写作：

`ok, reason := store.Put(msg)`

`found, exists := store.Find(key)`

其中 `store.Put(msg)` 只是 Go 为方法调用提供的简写。它可理解为把接收者放到参数位置：

`Put(store, msg)` 的概念效果

但这不是新的传参规则：接收者也是参数，仍然按值传递。若 `store` 的类型是 `*MemoryStore`，按值复制的是“指针值”；复制后的指针和原指针仍指向同一个存储对象。

| 角色 | 传递的值 | 最终作用目标 |
|---|---|---|
| 调用者 `store` | `*MemoryStore` 指针值 | 同一个 `MemoryStore` |
| 接收者 `s` | 指针值的副本 | 同一个 `MemoryStore` |
| `s.messages` | map 字段 | 共享的消息表 |

因此，`Put` 使用指针接收者，既能修改已有 `messages`，也能在其为 `nil` 时创建新 map 并写回 `s.messages`。而 `Find` 可按约定处理空接收者：若 `s == nil`，返回零值 `Message` 和 `false`。

方法应描述“某类数据自身拥有的行为”。没有明确所属数据的规则，例如格式校验、键生成或纯比较，仍适合写成普通函数；不必把所有函数都改成方法。

### 为何写入必须使用指针接收者

### 为何写入必须使用指针接收者

`Put` 不只是向已有 `map` 写入数据；它还要处理新建存储时 `messages` 尚为 `nil` 的情况：

`func (s *MemoryStore) Put(msg Message) (bool, string)`

```go
if s.messages == nil {
    s.messages = make(map[MessageKey]Message)
}
s.messages[msg.Key] = msg
```

这里的关键是 `s.messages = make(...)`：这不是修改旧 `map` 的内容，而是**替换 `MemoryStore` 字段中保存的 map 引用**。因此，`s` 必须指向调用者持有的那个 `MemoryStore` 对象。

若写成值接收者：

`func (s MemoryStore) Put(msg Message) (bool, string)`

调用 `store.Put(msg)` 时，`store` 会被复制给局部变量 `s`。即使局部 `s.messages` 被赋予新 map，调用结束后这个替换也随副本消失，原来的 `store.messages` 仍是 `nil`。后续写入无法依赖这次初始化。

| 角色 | 持有的内容 | `Put` 初始化后是否保留 |
|---|---|---|
| 调用者 `store` | 原始 `MemoryStore` 字段 | 指针接收者：保留 |
| 接收者 `s *MemoryStore` | 指向调用者对象 | 修改同一字段 |
| 接收者 `s MemoryStore` | 调用者对象的副本 | 仅副本保留 |

`m.Put(msg)` 只是 `m` 作为接收者参与调用的简写；接收者同样是参数，参数传递仍按值进行。区别在于：传递 `*MemoryStore` 的值时，复制的是指针，多个位置仍指向同一个存储对象。

因此，凡是方法需要替换结构体字段、维持共享状态或避免复制较大结构体时，通常应使用指针接收者。

### 调用简写与按值传递

### 调用简写与按值传递

写出 `store.Put(msg)` 时，`Put` 并没有获得一种特殊的“隐式传参”机制。它只是 Go 根据接收者类型选择方法后的简写。若声明为：

`func (s *MemoryStore) Put(msg Message) (bool, string)`

则下面两种写法在语义上对应：

`store.Put(msg)`

`(*MemoryStore).Put(store, msg)`

前者更符合日常阅读习惯；后者更能揭示：接收者 `s` 也是一个参数。调用时，`store` 的值被传给参数 `s`，`msg` 的值被传给参数 `msg`；Go 的参数传递始终是按值传递。

| 位置 | 调用前持有的值 | 进入 `Put` 后的参数 | 共同指向的目标 |
|---|---|---|---|
| 调用者 | `store`：`*MemoryStore` 指针值 | `s`：该指针值的一份副本 | 同一个 `MemoryStore` 结构体 |
| 调用者 | `msg`：`Message` 值 | `msg`：该值的一份副本 | 不保证共享；取决于字段内部是否含引用型数据 |
| 结构体字段 | `s.messages`：`map` | 通过 `s.messages` 访问 | 同一个底层映射表 |

因此，指针接收者并不意味着“指针本身按引用传递”。`s` 仍是局部变量，只是它保存了调用者指针的一份拷贝。通过它修改共享结构体的字段内容，例如：

` s.messages[msg.Key] = msg `

会影响调用者看到的消息表，因为两者指向同一份 `MemoryStore`。

更关键的是，若原先 `s.messages == nil`，`Put` 需要执行：

` s.messages = make(map[MessageKey]Message) `

这次是替换结构体字段。只有 `s` 是 `*MemoryStore`，该字段替换才会写入调用者所指向的结构体；若接收者是值类型 `MemoryStore`，修改的只是接收者副本。

这套解释只关心本地存取：`Put` 不验证成员资格，也不解析真实消息协议。没有明确所属数据的规则，仍应写成普通函数，而不必把所有函数都变成方法。

### 查找约定与方法边界

### 查找约定与方法边界

`Find` 的职责是：给定键，从某个 `MemoryStore` 中取出消息。一个稳定的声明可以写成：

`func (s *MemoryStore) Find(key MessageKey) (Message, bool)`

其中 `s` 是接收者；调用 `store.Find(key)` 时，`store` 就是传给接收者位置的值。接收者同样按值传递，但这里传递的是 `*MemoryStore` 指针的副本；副本与调用者持有的指针仍指向同一个存储对象。

本章约定：空接收者不是可查找的存储，因此返回零值消息和 `false`：

`if s == nil { return Message{}, false }`

随后再查表：

`msg, ok := s.messages[key]`

即使 `s.messages` 为 `nil`，读取也安全：从空映射取值会得到 `Message` 的零值与 `false`。因此 `Find` 不必为读取而初始化映射；初始化属于 `Put` 的写入责任。

| 调用者表达式 | 接收者 `s` | 实际共享目标 | 结果 |
|---|---|---|---|
| `store.Find(k)` | 指向 `store` 的指针副本 | 同一个 `MemoryStore` | 查找其中的 `messages` |
| `nilStore.Find(k)` | `nil` | 无 | `Message{}, false` |

这里的 `false` 不是“消息内容为空”，而是“该键未找到或没有可用存储”。调用方应以 `ok` 判断查找是否成功，而不要猜测 `Message` 的零值是否代表不存在。

`Find` 和 `Put` 适合成为方法，因为它们操作的是某个特定存储实例及其字段：数据的归属对象明确。相反，不依赖某个存储对象的规则仍应保持普通函数，例如校验 `MessageKey` 格式、比较两条消息的时间先后，或生成协议文本。不要为了“面向对象”而把所有函数都挂到 `MemoryStore` 上；方法表达状态归属，函数表达独立规则。

> **要点** — 方法为类型命名行为；涉及可持续修改存储字段时，应使用指针接收者。

方法接收者决定类型能提供哪些行为，也直接影响它能否满足接口。理解方法集，是让存储依赖抽象能力的关键一步。

### 接收者：方法实际接收什么

### 接收者：方法实际接收什么

Go 的方法接收者本质上也是参数，只是写在方法名前面。区别在于：值接收者得到对象的一份副本；指针接收者得到指向原对象的地址。

```go
type MemoryStore struct {
	items map[string]string
}

func (m MemoryStore) Info() string {
	return "内存存储"
}

func (m *MemoryStore) Put(key, value string) {
	m.items[key] = value
}
```

`Info` 的接收者 `m` 是 `MemoryStore` 的副本。即使在方法内执行：

`m = MemoryStore{}`

也只是让局部接收者变量指向另一份值，不会替换调用者持有的对象。

`Put` 的接收者 `m` 是 `*MemoryStore`，其副本仍然保存着原对象的地址。因此，修改 `m.items` 所指向的字段，会反映到原对象：

- 接收者变量本身：方法内部的参数 `m`；
- 接收者副本：传入方法的值或指针副本；
- 原对象：调用者实际持有的 `MemoryStore` 数据。

注意，即使接收者是指针，接收者变量仍按值传递：传递的是“地址的副本”。所以：

```go
func (m *MemoryStore) Reset() {
	m = &MemoryStore{}
}
```

这里只是重绑定了局部变量 `m`，调用者的指针不会改变。若要让修改可见，应修改 `m` 所指对象的字段，例如 `m.items = make(map[string]string)`。

选择接收者时，先看语义：方法是否需要初始化、替换或更新对象字段；再考虑复制代价。指针接收者并不总是仅为性能，也不是所有修改都必须使用指针接收者。

### 用 Info 与 Put 表达两类行为

### 用 Info 与 Put 表达两类行为

设内存存储保存若干消息：

```go
type MemoryStore struct {
    messages []string
}

func (m MemoryStore) Info() string {
    return fmt.Sprintf("内存存储：%d 条消息", len(m.messages))
}

func (m *MemoryStore) Put(msg string) {
    m.messages = append(m.messages, msg)
}
```

`Info() string` 只读取 `messages` 并生成描述，不需要改变调用者的状态，因此使用值接收者 `MemoryStore` 很自然。调用时会得到结构体的一份副本；即使误在 `Info` 中重绑定接收者，也不会影响原对象。

`Put()` 的语义则是“写入一条消息”。`append` 可能扩展底层数组，并需要把新的切片头写回 `messages` 字段；若希望这些变化对调用者可见，接收者应为指针：

```go
store := MemoryStore{}
store.Put("你好")
fmt.Println(store.Info()) // 内存存储：1 条消息
```

这里 `store` 是可寻址变量，Go 允许将 `store.Put("你好")` 便利地理解为 `(&store).Put("你好")`。但这不表示值类型自动拥有指针接收者方法，也不能把该便利规则套到接口赋值上。

指针接收者并不总是因为“性能”，也并非所有修改都绝对必须使用指针。选择时应先看语义：方法是否代表修改状态、是否需要初始化或替换字段，以及复制该值的代价。尤其要注意：接收者本身也按值传递；即使接收者是 `*MemoryStore`，执行 `m = &MemoryStore{}` 也只改变局部指针变量。只有修改 `m` 所指向对象的字段，调用者才能观察到变化。

### 方法集决定能否实现接口

### 方法集决定能否实现接口

设内存存储类型为：

`MemoryStore` 有两个方法：`Info() string` 使用值接收者，`Put(Message)` 使用指针接收者。

```go
func (m MemoryStore) Info() string { return "memory" }

func (m *MemoryStore) Put(msg Message) {
    m.messages = append(m.messages, msg)
}
```

关键不在于“调用时看起来能不能用”，而在于类型的方法集：

- `MemoryStore` 的方法集只包含值接收者方法：`Info`
- `*MemoryStore` 的方法集包含值接收者和指针接收者方法：`Info`、`Put`

若接口要求同时提供这两个能力：

```go
type MessageStore interface {
    Info() string
    Put(Message)
}
```

则下面的赋值无法通过编译：

```go
var store MessageStore = MemoryStore{} // 编译错误
```

原因是接口赋值检查的是 `MemoryStore` 的方法集；其中没有 `Put`，因为 `Put` 的接收者是 `*MemoryStore`。应当传入指针：

```go
var store MessageStore = &MemoryStore{}
```

虽然可寻址的值可以直接调用指针方法：

```go
m := MemoryStore{}
m.Put(msg) // 编译器可自动取地址
```

但这只是调用表达式的便利规则，不能推广到接口赋值。接口中保存的是一个具体动态类型；若存入的是 `MemoryStore` 值，就只能要求它自身的方法集满足接口。

选择接收者时先看语义：方法是否需要初始化、替换或修改字段，以及复制该类型的代价。方法接收者本身也按值传递；即使接收者是指针，重新绑定 `m = &MemoryStore{}` 也不会改变调用者持有的指针，只有修改 `m` 所指向的字段才会对调用者可见。

### 编译错误与可寻址调用的边界

### 编译错误与可寻址调用的边界

设接口要求既能写入消息，也能报告存储信息：

```go
type MessageStore interface {
    Info() string
    Put(key, value string)
}

type MemoryStore struct {
    data map[string]string
}

func (m MemoryStore) Info() string { return "内存存储" }

func (m *MemoryStore) Put(key, value string) {
    if m.data == nil {
        m.data = make(map[string]string)
    }
    m.data[key] = value
}
```

下面的赋值会产生编译错误：

```go
var store MessageStore = MemoryStore{}
```

原因不在于 `MemoryStore{}` 不能调用 `Put`，而在于接口检查严格依据**方法集**：

- `MemoryStore` 的方法集只包含值接收者方法：`Info()`。
- `*MemoryStore` 的方法集包含值接收者和指针接收者方法：`Info()`、`Put()`。
- `MessageStore` 要求 `Put()`，因此 `MemoryStore` 不满足接口。

应当传入指针：

```go
var store MessageStore = &MemoryStore{}
```

容易混淆的是，下列调用通常可以通过编译：

```go
m := MemoryStore{}
m.Put("id", "hello")
```

这里 `m` 是可寻址变量，编译器可将调用便利地理解为：

```go
(&m).Put("id", "hello")
```

但这种自动取地址只适用于方法调用，不会改变接口赋值规则。接口中保存的是一个具体动态类型；将 `MemoryStore{}` 赋给接口时，编译器不会自动改存为 `&MemoryStore{}`。

此外，接收者本身也按值传递。若在 `Put` 中写 `m = &MemoryStore{}`，只会重绑定局部指针变量；只有修改 `m.data` 等所指对象字段，调用者才能观察到变化。选择指针接收者应先看语义：是否需要初始化或替换字段、是否应共享状态，以及复制该值的代价，而非机械地认为指针总是更快或修改总是必须。

### 按语义选择接收者

### 按语义选择接收者

选择值接收者还是指针接收者，首先看方法的语义，而不是机械地认为“指针一定更快”或“修改都必须用指针”。

- **只读取状态、表达值本身的行为**，通常适合值接收者。例如 `Info() string` 只根据当前字段生成说明，不需要改变存储：
  `func (s MemoryStore) Info() string`
- **需要修改字段、延迟初始化内部字段、替换字段所指向的对象**，应使用指针接收者。例如 `Put()` 要向存储写入消息，可能需要初始化 `map`，因此应声明为：
  `func (s *MemoryStore) Put(m Message)`
- **结构体复制代价较高**时，也可倾向指针接收者；但这只是成本考量，不是唯一理由。小型、不可变或刻意按值工作的类型仍很适合值接收者。

接收者和普通参数一样，都是**按值传递**。对于值接收者，修改的是结构体副本；对于指针接收者，传入的是指针副本，但该副本仍指向调用者原来的对象。因此，修改所指对象的字段可以被调用者观察到：

`func (s *MemoryStore) Put(m Message) { s.items = append(s.items, m) }`

但仅重绑定接收者指针不会改变调用者持有的指针：

`func (s *MemoryStore) Reset() { s = &MemoryStore{} }`

这里的 `s` 只是局部指针副本；要真正重置调用者对象，应修改其字段，如 `s.items = nil`。

> **要点** — 接口匹配看方法集：值类型不拥有指针接收者方法，指针类型才能同时提供两类行为。

通过小接口抽象消息存取能力，使会话逻辑依赖可调用的方法，而非某个固定存储实现。

### 从行为定义消息存取能力

### 从行为定义消息存取能力

会话逻辑真正关心的不是消息存在哪个字段、使用 `map` 还是数据库，而是能否“写入消息”和“按键读取消息”。因此先从调用者需要的行为定义接口：

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

`Find` 返回消息及是否找到；`Put` 返回是否写入成功，并用字符串说明失败原因或结果信息。接口只列出可调用的方法，不声明实现类型内部必须有哪些字段。换言之，接口描述的是能力边界，而非数据结构设计图。

`MessageStore` 嵌入 `MessageReader` 和 `MessageWriter`，表示它要求同时具备读取与写入能力。它的方法集等价于两者方法集的组合：既要有 `Find`，也要有 `Put`。这不是复制一份数据，更不会自动给某个对象增加存储权限；具体类型仍必须自行提供对应方法。

Go 不需要显式写 `implements`。只要某个类型的方法集满足接口要求，它就隐式实现该接口。例如 `MemoryStore` 可以用内存映射保存消息，而 `DisabledStore` 可明确拒绝所有 `Put`，并让每次 `Find` 都返回“缺失”。两者都能作为 `MessageStore` 的动态具体类型。

因此调用者可以只依赖接口：

`saveThenFind(store MessageStore, msg Message)`

该函数不必知道传入的是内存实现还是禁用实现。前者可能写入后立即读到消息；后者则会写入失败、读取缺失。接口带来的是可替换的行为实现，并不意味着内存实现天然拥有文件或数据库的持久化、并发与可靠性。

### 隐式实现与方法集匹配

### 隐式实现与方法集匹配

在 Go 中，类型不需要写出“我实现了 `MessageStore`”。是否满足接口，只由**方法集**决定：一个类型拥有接口要求的全部方法，并且方法签名完全一致，它就能被当作该接口使用。

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

例如 `MemoryStore` 只要定义了以下方法，就隐式满足 `MessageStore`：

```go
func (s *MemoryStore) Put(m Message) (bool, string) { /* ... */ }
func (s *MemoryStore) Find(k MessageKey) (Message, bool) { /* ... */ }
```

同样，教学用的 `DisabledStore` 可以明确拒绝写入，并始终报告查询缺失：

```go
func (DisabledStore) Put(Message) (bool, string) {
	return false, "存储已禁用"
}

func (DisabledStore) Find(MessageKey) (Message, bool) {
	return Message{}, false
}
```

于是两者都可传给只依赖能力的函数：

```go
func saveThenFind(store MessageStore, msg Message) (Message, bool) {
	ok, _ := store.Put(msg)
	if !ok {
		return Message{}, false
	}
	return store.Find(msg.Key)
}
```

`MemoryStore` 的本地结果通常是“写入后可找到”；`DisabledStore` 则会在写入阶段失败。函数不需要知道实际类型，只通过接口调用 `Put` 和 `Find`。

注意签名必须匹配：把 `Find` 写成 `Find(string)`，或把 `Put` 的返回值改掉，都会失去接口兼容性。接口嵌入只是组合方法要求，不会复制任何数据，也不会让类型自动获得存储权限。

### 用两种存储实现验证替换性

### 用两种存储实现验证替换性

接口变量关心的是“能否调用约定的方法”，不关心其背后是否真的保存数据。下面让 `MemoryStore` 正常保存消息，而 `DisabledStore` 明确拒绝写入、始终报告未找到：

```go
type MessageKey string

type Message struct {
	Key  MessageKey
	Text string
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
	data map[MessageKey]Message
}

func (s *MemoryStore) Put(m Message) (bool, string) {
	s.data[m.Key] = m
	return true, ""
}

func (s *MemoryStore) Find(k MessageKey) (Message, bool) {
	m, ok := s.data[k]
	return m, ok
}

type DisabledStore struct{}

func (DisabledStore) Put(Message) (bool, string) {
	return false, "存储已禁用"
}

func (DisabledStore) Find(MessageKey) (Message, bool) {
	return Message{}, false
}

func saveThenFind(store MessageStore, msg Message) {
	ok, reason := store.Put(msg)
	if !ok {
		fmt.Println("保存失败：", reason)
		return
	}
	found, exists := store.Find(msg.Key)
	fmt.Println("读取结果：", found.Text, exists)
}
```

调用时可替换动态具体类型：

```go
mem := &MemoryStore{data: make(map[MessageKey]Message)}
saveThenFind(mem, Message{Key: "a1", Text: "你好"})

var disabled MessageStore = DisabledStore{}
saveThenFind(disabled, Message{Key: "a1", Text: "你好"})
```

第一段本地结果会读取到“你好”和 `true`；第二段会输出“保存失败：存储已禁用”。两种类型都满足 `MessageStore`，因为方法集匹配，无需声明 `implements`。

这里的替换性只说明会话逻辑可面对不同存储策略；把内存实现换成另一个实现，并不会自动获得文件持久化、数据库事务或崩溃恢复能力。

### 让业务函数只依赖 MessageStore

### 让业务函数只依赖 `MessageStore`

业务函数不应假设消息保存在 `map`、文件或数据库中；它只需要“能保存、能查询”的能力：

```go
func saveThenFind(store MessageStore, msg Message) (Message, bool, string) {
	ok, reason := store.Put(msg)
	if !ok {
		return Message{}, false, reason
	}

	found, exists := store.Find(msg.Key)
	if !exists {
		return Message{}, false, "保存后未找到消息"
	}
	return found, true, ""
}
```

这里的参数类型是 `MessageStore`，因此函数只能调用接口声明的方法：

- `store.Put(msg)`：请求写入消息，得到成功标记与失败原因；
- `store.Find(msg.Key)`：按键查询消息，得到消息值与是否存在；
- 函数不知道、也不需要知道内部是否使用 `map`、锁、缓存或其他机制。

同一个接口变量可装入不同动态具体类型：

```go
var store MessageStore = NewMemoryStore()
msg := Message{Key: "m-1", Text: "你好"}

found, ok, reason := saveThenFind(store, msg)
// ok 为 true，found 是刚保存的消息，reason 为空
```

若改为禁用实现：

```go
var store MessageStore = DisabledStore{}

found, ok, reason := saveThenFind(store, msg)
// ok 为 false，found 是零值，reason 表示写入被拒绝
```

`DisabledStore` 的 `Put` 明确拒绝所有写入，`Find` 始终报告缺失；但只要它的方法集满足 `MessageStore`，就能传入同一业务函数。这种替换证明业务逻辑依赖的是接口契约，而不是 `MemoryStore` 这个名字。

不过，能替换不等于自动获得新能力：将内存实现换成另一种实现，并不会天然带来文件持久化、数据库事务或崩溃恢复。那些可靠性语义必须由新的具体实现明确提供，并通过测试验证。

### 理解接口组合的边界

### 理解接口组合的边界

`MessageStore` 可以通过嵌入组合读写能力：

`type MessageStore interface { MessageReader; MessageWriter }`

这表示：一个值若要作为 `MessageStore` 使用，必须同时具有 `Find(MessageKey) (Message, bool)` 和 `Put(Message) (bool, string)` 方法。组合的是**方法要求**，不是数据本身。

因此，接口嵌入不会：

- 复制一份消息数据；
- 让实现自动拥有某种“读写权限”；
- 自动提供文件、数据库、事务、并发安全或持久化能力；
- 规定消息究竟存放在内存、网络服务还是根本不存。

例如 `MemoryStore` 可用映射保存消息，成功执行 `Put` 后，`Find` 通常能找到它；而教学用的 `DisabledStore` 可以明确拒绝所有 `Put`，并让所有 `Find` 都返回“缺失”。两者只要方法签名满足要求，都是 `MessageStore` 的动态具体类型：

`saveThenFind(store MessageStore, msg Message)`

调用者只知道 `store` 能写、能查，却不能假定写入一定成功，更不能假定数据可靠保存。对 `DisabledStore`，本地结果可能是“写入失败、随后未找到”；对 `MemoryStore`，则可能是“写入成功、随后找到”。

接口组合应服务于调用者真正需要的能力。若某函数只查询消息，就接收 `MessageReader`，不要为了方便而要求完整的 `MessageStore`。接口越大，实现越受限，测试替身也越难编写。通常应由使用方定义小接口，但这是一条帮助控制依赖的设计原则，而非机械规则。

> **要点** — 接口让调用方依赖读写能力；实现可替换，但替换实现不自动带来持久化或可靠性。

接口值的 nil 判断常令初学者困惑。关键在于区分接口本身是否为空，与接口中保存的具体指针是否为空。

### 接口值的两个组成部分

### 接口值的两个组成部分

接口值可以理解为一对信息：

| 动态类型 | 动态值 | `reader == nil` |
|---|---|---|
| 无 | 无 | 是 |
| `*MemoryStore` | 有效指针 | 否 |
| `*MemoryStore` | `nil` 指针 | 否 |

例如：

`var reader MessageReader`

此时接口中没有动态类型，也没有动态值，是真正的 `nil` 接口。

但下面的路径不同：

`var memory *MemoryStore = nil`  
`reader = memory`

现在 `reader` 的动态类型是 `*MemoryStore`，只是动态值恰好为 `nil`。因此：

`reader != nil`

这不是语言漏洞：`nil` 比较检查的是接口值本身是否为空，而不是自动检查其内部保存的具体指针。

故意写错的常见路径是：

`if reader != nil { reader.Find("id") }`

这只能说明接口里装了某种实现，不能保证内部指针有效。若 `reader` 保存的是空的 `*MemoryStore`，调用是否安全取决于 `Find` 的实现。

本章的 `Find` 若显式处理 nil 接收者，例如先判断 `if m == nil` 并返回“未找到”，那么该调用可以安全完成；但不要据此推广为“所有指针方法都能对 nil 调用”。多数方法一旦访问接收者字段，仍会发生运行时错误。

还要区分几种“没有数据”：

| 情况 | 含义 |
|---|---|
| `reader == nil` | 没有配置存储实现 |
| 返回零值消息 | 有结果对象，但字段均为零值 |
| 缺失键 | 存储存在，但指定消息不存在 |
| `map[string]*Message` 的值为 `nil` | 键存在，却保存了空指针 |

更稳妥的做法是在构造函数处拒绝空依赖，在调用边界检查接口是否为 `nil`；需要区分具体错误时，让 `Find` 返回明确的结果或错误，而不要借助 `reflect` 猜测接口内部状态。

### 两种看似相同的 nil

### 两种看似相同的 nil

接口值可理解为一对信息：**动态类型**与**动态值**。只有两者都不存在时，接口才等于 `nil`。

假设会话存储读取能力定义为：

`type MessageReader interface { Find(string) (Message, bool) }`

比较下面两条路径：

| 写法 | 动态类型 | 动态值 | `reader == nil` |
|---|---|---|---|
| `var reader MessageReader` | 无 | 无 | 是 |
| `var memory *MemoryStore = nil; reader = memory` | `*MemoryStore` | `nil` 指针 | 否 |

第二种情况看似“把 nil 赋给了接口”，但赋入的是一个**类型明确的 nil 指针**；接口已经知道自己保存的是 `*MemoryStore`，因此接口本身并不为空。

故意走一条常见错误路径：

`var memory *MemoryStore = nil`  
`var reader MessageReader = memory`  
`if reader != nil { reader.Find("u1") }`

这里条件成立并不表示 `memory` 可用，只表示接口中存在动态类型。调用是否安全，取决于 `Find` 的实现。本章的 `MemoryStore.Find` 若显式处理 nil 接收者，例如先判断 `if m == nil { return Message{}, false }`，调用可以安全地返回“未找到”；但这不是所有指针方法的默认保证。若方法内部立刻访问 `m.messages`，就可能发生运行时异常。

还要区分读取结果的含义：

| 情况 | 表示 |
|---|---|
| `reader == nil` | 根本没有提供读取器 |
| `Message{}` 且 `ok == true` | 存在一条零值消息 |
| `Message{}` 且 `ok == false` | 键缺失 |
| `map[string]*Message` 中值为 `nil` | 键存在，但保存的是 nil 指针 |

实践中应在构造函数处拒绝 nil 依赖，或在边界处明确检查具体指针；不要依赖 `reflect` 猜测接口内容。

### 故意走错：只检查 reader 是否为 nil

### 故意走错：只检查 `reader` 是否为 `nil`

先看一条看似合理、实际危险的调用路径：

```go
var memory *MemoryStore = nil
var reader MessageReader = memory

if reader == nil {
	return errors.New("未配置消息存储")
}

msg, ok := reader.Find("welcome")
```

这里的 `reader != nil`，因此不会返回错误；但这不代表其中的 `*MemoryStore` 指针可用。接口值可理解为一对组合：

| 情况 | 动态类型 | 动态值 | `reader == nil` |
|---|---|---|---|
| 真正的 nil 接口 | 无 | 无 | 是 |
| 保存了空指针的接口 | `*MemoryStore` | `nil` | 否 |
| 正常存储实例 | `*MemoryStore` | 有效地址 | 否 |

第二行正是陷阱：赋值 `reader = memory` 后，接口已经保存了动态类型 `*MemoryStore`，所以接口本身不再是 nil；只是它保存的具体指针仍是 nil。

若 `Find` 的实现直接访问接收者字段：

```go
func (m *MemoryStore) Find(key string) (Message, bool) {
	msg, ok := m.messages[key]
	return msg, ok
}
```

那么调用 `reader.Find("welcome")` 会因 `m == nil` 而发生运行时错误。`reader != nil` 只回答“接口里是否装了某个具体类型和值”，并不回答“该具体值是否能安全执行方法”。

本章的 `Find` 若显式处理 nil 接收者，例如先判断 `if m == nil { return Message{}, false }`，这次调用可以安全返回“缺失”。但这是该方法自行提供的保护，不能推广为“所有 nil 指针方法都能调用”。

还要区分不同结果：

| 结果 | 含义 |
|---|---|
| `reader == nil` | 根本没有阅读器 |
| `Message{}` 且 `ok == true` | 键存在，消息恰好是零值 |
| `Message{}` 且 `ok == false` | 键不存在，或 nil 接收者按缺失处理 |
| 映射值为 `*Message(nil)` | 键存在，但存入的是 nil 指针，需单独检查 |

更稳妥的做法是在构造函数、依赖注入边界处拒绝空指针依赖，或为 `Find` 明确规定 nil 接收者语义；不要依赖 `reflect` 绕过设计问题。

### nil 接收者能否调用取决于方法

### nil 接收者能否调用取决于方法

设 `MessageReader` 是读取消息的接口，`MemoryStore` 实现了它：

```go
type MessageReader interface {
    Find(id string) (*Message, bool)
}

func (m *MemoryStore) Find(id string) (*Message, bool) {
    if m == nil {
        return nil, false
    }
    msg, ok := m.messages[id]
    return msg, ok
}
```

这里 `Find` 可以在 `m == nil` 时调用，原因不是“所有 nil 指针都能调用方法”，而是方法体第一步主动检查了接收者。安全性来自这段实现。

| 情形 | 接口的动态类型 | 接口的动态值 | `reader == nil` | 调用 `Find` |
|---|---|---|---:|---|
| `var reader MessageReader` | 无 | 无 | 是 | 会因接口为 nil 而失败 |
| `var memory *MemoryStore = nil; reader = memory` | `*MemoryStore` | nil | 否 | 本例安全，返回 `nil, false` |
| 正常 `MemoryStore` | `*MemoryStore` | 非 nil | 否 | 正常查找 |

故意走一条错误路径：

```go
var memory *MemoryStore
var reader MessageReader = memory

if reader != nil {
    reader.Find("a") // 不代表 memory 一定非 nil
}
```

`reader != nil` 只说明接口里装着某种具体类型；这里装的是 `*MemoryStore`，但其指针值仍为 nil。无需用 `reflect` 猜测内部状态：应在构造边界避免交付空实现，或让方法明确处理 nil 接收者。

还要区分结果含义：`nil, false` 通常表示缺失键；`msg == nil, true` 则可能表示映射中确实存有 nil 指针值；而“零值消息”是存在一个非 nil 的 `&Message{}`，三者不能混为一谈。

### 消息读取边界的安全约定

### 消息读取边界的安全约定

`MessageReader` 是接口时，一个接口值可理解为“动态类型 + 动态值”。因此，`nil` 判断检查的是接口整体，而不只是其中的指针：

| 情形 | 动态类型 | 动态值 | `reader == nil` | 含义 |
|---|---|---:|---:|---|
| `var reader MessageReader` | 无 | 无 | 是 | 真正的 nil 接口 |
| `var memory *MemoryStore = nil; reader = memory` | `*MemoryStore` | `nil` | 否 | 接口装着空指针 |
| `reader = NewMemoryStore()` | `*MemoryStore` | 非 nil | 否 | 可用的读取器 |
| `Find` 返回 `Message{}` | 取决于实现 | 零值消息 | 不适用 | 找到了零值，或实现以零值表示失败，语义不清 |
| 键不存在 | 不适用 | 不适用 | 不适用 | 应明确返回“未找到” |
| `map[string]*Message` 中值为 nil | `*Message` | `nil` | 不适用 | 键存在，但消息指针为空 |

故意错误的路径如下：

```go
var store *MemoryStore
var reader MessageReader = store

if reader == nil {
    return errors.New("读取器未配置")
}
msg, ok := reader.Find("welcome")
```

这里不会进入错误分支；`reader` 的动态类型是 `*MemoryStore`。随后调用是否安全，取决于 `MemoryStore.Find` 是否显式处理 nil 接收者，例如：

`if m == nil { return Message{}, false }`

这只是该方法的安全约定，不能推广为“所有 nil 指针方法都能调用”。

更稳妥的做法是在构造边界保证依赖有效：

- 用 `NewService(reader MessageReader)` 检查传入对象，避免直接接收来源不明的接口值。
- 若实现内部使用 `map[string]*Message`，`Find` 应区分 `ok == false`（缺失键）与 `ok == true && msg == nil`（非法或特殊状态）。
- 优先让 `Find` 返回 `(Message, bool)` 或 `(*Message, bool)`；不要仅靠 `Message{}` 猜测是否找到。
- 不必使用 `reflect` 修补 nil 判断；应通过构造函数、明确返回值和方法边界定义消除歧义。

> **要点** — 接口为 nil 只表示接口自身为空；接口内保存的具体 nil 指针仍需由方法或调用边界显式处理。

接口变量保存的是动态具体值；类型断言用于少数必须识别该具体值的场景，而非日常读写的前置步骤。

### 断言的边界：何时需要具体类型

### 断言的边界：何时需要具体类型

接口变量 `store Store` 应首先按 `Store` 的能力使用，例如读取标签、保存会话或清理数据：

```go
label := store.StoreLabel()
```

只要需求是所有存储实现都应提供的行为，业务函数就不应关心它背后是 `MemoryStore`、`DisabledStore` 还是其他实现。接口的价值正是让调用者依赖共同能力，而非依赖具体结构。

只有确实需要 `MemoryStore` 专有的诊断信息时，才尝试取得它保存的动态具体值：

```go
memory, ok := store.(*MemoryStore)
if ok && memory != nil {
    // 读取 MemoryStore 特有的调试状态
}
```

这里的 `store.(*MemoryStore)` 是**具体类型断言**：它询问“当前接口值中的动态值是否为 `*MemoryStore`”。逗号 `ok` 形式不会因失败而中断：若实际是 `DisabledStore` 或其他实现，`memory` 为 `nil`，`ok` 为 `false`。即使 `ok` 为 `true`，仍应检查 `memory != nil`，因为接口也可能保存一个类型为 `*MemoryStore`、值却为 `nil` 的指针。

单结果写法：

```go
memory := store.(*MemoryStore)
```

断言失败会直接 `panic`，适合能够证明类型必然正确的内部不变量，不应作为普通业务分支。

还要区分“断言为具体类型”和“断言为另一接口”：前者识别 `*MemoryStore`；后者检查动态值是否额外满足某组能力。后续可再用更系统的方式处理多种类型，但不应让断言成为日常读写的前置步骤。若为了调用通用读写功能先断言 `*MemoryStore`，`DisabledStore` 就无法被替换使用，接口边界也随之失效。

### 安全取得 *MemoryStore：comma-ok 形式

### 安全取得 `*MemoryStore`：comma-ok 形式

接口变量 `store` 的静态类型可能是 `Store`，但它在运行时保存的动态具体值未必是 `*MemoryStore`：也可能是 `*DisabledStore`，甚至是一个值为 `nil` 的 `*MemoryStore`。当调用者确实需要内存实现特有的诊断信息时，可以使用 comma-ok 类型断言：

```go
memory, ok := store.(*MemoryStore)
```

这句话询问的是：“`store` 当前保存的动态值，是否为 `*MemoryStore`？”

- 若是，`ok == true`，`memory` 指向该 `MemoryStore`。
- 若不是，`ok == false`，`memory == nil`；不会发生恐慌。
- 若接口中保存的是类型为 `*MemoryStore`、值却为 `nil` 的指针，则 `ok == true`，但 `memory == nil`。因此取得后仍应检查指针：

```go
memory, ok := store.(*MemoryStore)
if !ok || memory == nil {
    // 不是可用的 MemoryStore，跳过仅属于内存实现的诊断
    return
}
```

这种断言适合“可选的实现专属能力”，例如读取 `MemoryStore` 的测试统计、调试记录或内部诊断状态。它不应成为普通业务读写的前置条件。若只是需要共同能力，应直接调用接口方法，例如 `store.StoreLabel()`；这样 `MemoryStore` 与 `DisabledStore` 都可以替换使用。

不要把常规逻辑写成“先断言 `*MemoryStore`，再读取或写入”。那会把本应依赖 `Store` 接口的代码绑死到内存实现，导致 `DisabledStore` 失去可替换性。

单结果形式 `memory := store.(*MemoryStore)` 在断言失败时会直接恐慌，适合已经由严格不变量保证类型的极少数位置，不适合作为日常分支判断。

### 单结果断言与空指针的双重风险

### 单结果断言与空指针的双重风险

单结果断言把“类型不匹配”视为运行时错误：

```go
memory := store.(*MemoryStore)
```

若 `store` 的动态具体值是 `*DisabledStore`，或任何其他实现 `Store` 的类型，程序会立刻 `panic`。因此，它不适合作为普通业务分支：调用者本应能通过 `Store` 接口完成读写，却因为实现可替换而崩溃。

更稳妥的是 comma-ok 形式：

```go
memory, ok := store.(*MemoryStore)
if !ok {
    return
}
```

断言失败时，`memory` 得到 `nil`，`ok` 为 `false`，调用者可以跳过仅属于 `MemoryStore` 的诊断逻辑，例如读取其内部统计信息；正常的接口能力，如 `StoreLabel()`、读取或写入会话数据，仍应直接通过 `store` 调用。

不过，`ok == true` 不等于可以立即解引用。接口可能保存一个“动态类型为 `*MemoryStore`、动态值为 `nil`”的值：

```go
var m *MemoryStore
var store Store = m

memory, ok := store.(*MemoryStore) // ok 为 true
if !ok || memory == nil {
    return
}
```

这里断言在类型上成功，但 `memory` 仍是空指针；继续访问 `memory` 的字段或方法，可能再次触发恐慌。故诊断代码应同时确认 `ok` 与 `memory != nil`。

### 具体类型断言与接口断言

### 具体类型断言与接口断言

接口变量 `store` 保存的是某个动态具体值，但日常代码应先使用它已经承诺的能力，而不是急于识别其实现。例如，只要 `Store` 接口提供 `Load`、`Save` 或 `StoreLabel()`，业务函数就应直接调用：

`label := store.StoreLabel()`

此处不关心底层是 `MemoryStore`、`DisabledStore` 还是未来的新实现；这正是接口带来的可替换性。

只有诊断、测试辅助或内存实现专属统计等确实依赖 `MemoryStore` 特有成员时，才断言到具体类型：

`memory, ok := store.(*MemoryStore)`

这是逗号 `ok` 形式。若动态值确为 `*MemoryStore`，则 `ok == true`；否则 `memory == nil` 且 `ok == false`，不会发生恐慌。即使 `ok` 为真，仍应留意 `memory == nil`：接口可能保存了“类型为 `*MemoryStore`、值却为 `nil`”的指针。

```go
memory, ok := store.(*MemoryStore)
if ok && memory != nil {
    // 使用 MemoryStore 专属诊断信息
}
```

单结果写法 `memory := store.(*MemoryStore)` 在断言失败时会恐慌，适合已由严格约束保证类型的极少数场景，不应作为常规分支判断。

还可以断言到更小的接口。若只需要标签能力，可定义包含 `StoreLabel()` 的接口，并写成：

`labeled, ok := store.(interface{ StoreLabel() string })`

这种接口断言问的是“它是否具备该能力”，而非“它是不是 `MemoryStore`”。反之，若为了普通读取、写入先断言 `*MemoryStore`，`DisabledStore` 就无法正常替换它，接口边界也被具体实现重新绑死。

### 诊断可以断言，读写不应断言

### 诊断可以断言，读写不应断言

`Store` 接口变量保存的是动态具体值。多数业务代码只关心“能否读写会话”，因此应直接调用接口方法，例如 `Get`、`Set`、`StoreLabel()`：

```go
func SaveSession(store Store, id string, s Session) error {
    return store.Set(id, s)
}
```

这里不必知道 `store` 是 `*MemoryStore` 还是 `*DisabledStore`。尤其是 `DisabledStore` 可能故意拒绝或忽略持久化；若业务函数先把它断言为内存存储，就破坏了接口的可替换性。

只有诊断、测试或临时运维信息确实需要 `MemoryStore` 独有能力时，才尝试取得其动态具体值：

```go
memory, ok := store.(*MemoryStore)
if ok && memory != nil {
    log.Printf("内存会话数：%d", memory.Count())
}
```

这是逗号 `ok` 形式的具体类型断言。若动态值不是 `*MemoryStore`，例如它实际是 `*DisabledStore`，则 `memory` 得到 `nil`，`ok` 为 `false`，不会发生恐慌。即使 `ok` 为 `true`，仍应检查 `memory != nil`：接口中可能保存了一个类型为 `*MemoryStore`、值却为 `nil` 的指针。

相对地，单结果写法：

`memory := store.(*MemoryStore)`

断言失败会直接触发恐慌，不适合作为常规业务分支。

还要区分两类断言：`store.(*MemoryStore)` 是断言具体类型；`store.(Diagnosable)` 则是断言其是否实现另一个接口。前者用于少数实现专属诊断，后者用于发现可选能力。若将来要处理多种具体存储类型，可再使用类型分支；当前更重要的原则是：读写依赖 `Store`，诊断才谨慎断言。

> **要点** — 类型断言是识别动态值的受控工具；常规业务依赖接口能力，专有诊断才安全地尝试具体类型断言。

通过组合读取与写入能力定义 MessageStore，并厘清结构体嵌入、包装计数及嵌套 nil 的可靠边界。

### 用嵌入接口组合完整存储能力

### 用嵌入接口组合完整存储能力

当会话逻辑既要读取历史消息，又要追加新消息时，不应直接依赖某个具体存储类型，而应依赖一份完整的能力契约。可以先拆分最小职责：

```go
type Reader interface {
    List(sessionID string) ([]Message, error)
}

type Writer interface {
    Append(sessionID string, msg Message) error
}
```

再通过接口嵌入组合它们：

```go
type MessageStore interface {
    Reader
    Writer
}
```

`MessageStore` 的含义不是“某种新的存储实现”，而是：任何传入对象都必须同时具备 `List` 和 `Append`。接口嵌入相当于把被嵌入接口要求的方法合并到当前契约中；调用方拿到 `MessageStore` 后，可以稳定地执行读写，而不必知道底层是内存存储、数据库存储还是远程服务。

```go
func HandleMessage(store MessageStore, sessionID string, input Message) error {
    history, err := store.List(sessionID)
    if err != nil {
        return err
    }

    _ = history // 用于构造后续上下文
    return store.Append(sessionID, input)
}
```

这种设计的关键是依赖方向：`HandleMessage` 依赖“能读且能写”的能力，而非 `MemoryStore`、`SQLStore` 等具体名字。实现者可以替换，调用者的业务代码通常无需变化。

组合后的接口也应保持克制。若某处只负责展示历史记录，参数类型应是 `Reader`；只有确实需要完整读写流程时，才要求 `MessageStore`。这样既明确了依赖，也避免调用方被迫提供不需要的能力。

### 组合接口的满足条件与使用边界

### 组合接口的满足条件与使用边界

先把读取与写入能力拆开，调用方只声明自己真正需要的最小接口：

```go
type Reader interface {
    Load(id string) (Message, error)
}

type Writer interface {
    Save(Message) error
}
```

当某个流程必须“先读后写”或“写入后再校验读取结果”时，才应组合它们：

```go
type MessageStore interface {
    Reader
    Writer
}
```

这不是创建一种新的实现机制。`MessageStore` 没有提供任何方法体，也不会替某个类型自动补齐 `Load` 或 `Save`；它只是收紧了参数、字段或返回值所要求的能力。一个具体类型只有同时实现 `Reader` 与 `Writer` 的全部方法，才能赋给 `MessageStore`。

因此，选择接口应由操作路径推导，而不是由“存储对象通常很完整”的直觉决定：

- 仅展示历史消息：接收 `Reader`，避免要求无关的写权限。
- 仅追加消息：接收 `Writer`，便于测试时替换为简单记录器。
- 迁移、同步、读改写等流程：接收 `MessageStore`，因为缺少任一能力都无法完成操作。

```go
func Replay(src Reader, dst Writer, id string) error {
    msg, err := src.Load(id)
    if err != nil {
        return err
    }
    return dst.Save(msg)
}
```

这里不必把 `src` 和 `dst` 都声明为 `MessageStore`：函数实际需要的是“一个可读来源”和“一个可写目标”。组合接口适合表达同一依赖必须同时具备多项能力的边界；若能力分别来自不同对象，保留独立接口通常更准确，也让替换实现和测试桩更轻量。

### AuditedStore 嵌入接口后的方法调用

### AuditedStore 嵌入接口后的方法调用

`AuditedStore` 可以直接嵌入组合后的 `MessageStore`，并额外保存审计信息：

```go
type AuditedStore struct {
	MessageStore
	Writes int
}
```

由于嵌入字段是 `MessageStore`，只要它本身同时满足读取和写入能力，调用者就可以像调用 `AuditedStore` 自己的方法一样调用被提升的方法：

```go
var store AuditedStore
store.MessageStore = memoryStore

msg, err := store.Load("m-1")
err = store.Save(msg)
```

这里的 `Load`、`Save` 实际仍由嵌入的具体存储实现执行；`AuditedStore` 只是把这些能力暴露在自己的调用入口上。尤其要注意：嵌入不会自动产生审计逻辑。上面的 `Save` 调用完成后，`store.Writes` 仍然是 `0`，因为没有任何代码修改它。

若希望每次写入后计数，必须显式包装写入方法：

```go
func (s *AuditedStore) Save(msg Message) error {
	if s.MessageStore == nil {
		return errors.New("消息存储未初始化")
	}
	if err := s.MessageStore.Save(msg); err != nil {
		return err
	}
	s.Writes++
	return nil
}
```

构造时还应约定嵌入字段必须是可用存储。`s.MessageStore == nil` 能发现接口字段本身为空；但若接口内部装入的是“带类型的空指针”，接口通常并不等于 `nil`，继续调用仍可能在具体实现中失败。因此，构造函数应接收并验证可用的 `MessageStore`，而不是依赖调用时侥幸发现嵌套的空值。

### 显式包装写入并建立构造契约

### 显式包装写入并建立构造契约

将 `MessageStore` 嵌入 `AuditedStore` 后，外部可以调用被提升的 `Read`、`Write` 方法；但若直接调用提升后的 `Write`，并不会自动修改 `Writes`。计数属于包装层的职责，必须显式定义同名方法：

```go
type AuditedStore struct {
	MessageStore
	Writes int
}

func (s *AuditedStore) Write(m Message) error {
	if s == nil || s.MessageStore == nil {
		return errors.New("未配置消息存储")
	}

	if err := s.MessageStore.Write(m); err != nil {
		return err
	}

	s.Writes++
	return nil
}
```

顺序应当是：先确认包装对象及其嵌入存储可用，再委托底层写入，最后更新计数。这样 `Writes` 表示“已成功完成的写入次数”；若底层返回错误，计数不变。

这里的 `s.MessageStore == nil` 只能识别接口字段本身为 `nil`。还存在更隐蔽的情况：

```go
var p *FileStore = nil
store := MessageStore(p) // 接口非 nil，但内部指针为 nil
```

此时 `store != nil`，调用方法仍可能因底层接收者为空而失败甚至触发异常。因此构造阶段应建立契约：传入的 `MessageStore` 必须是可用实现，不接受空接口，也不接受包装了空指针的接口值。实际项目可通过构造函数集中校验：

```go
func NewAuditedStore(store MessageStore) (*AuditedStore, error) {
	if store == nil {
		return nil, errors.New("消息存储不能为空")
	}
	return &AuditedStore{MessageStore: store}, nil
}
```

该片段只展示写入包装的核心边界，并非完整的装饰器实现；例如日志、指标、错误分类及更严格的底层实现校验仍需按应用需求补充。

### 识别接口 nil 与装载 nil 指针

### 识别接口 nil 与装载 nil 指针

`MessageStore` 是接口时，必须区分两种看似相近、实际不同的状态：

```go
type Session struct {
    Store MessageStore
}
```

第一种是接口字段完全未赋值：

```go
s := Session{}
fmt.Println(s.Store == nil) // true
```

此时接口本身为 `nil`，没有动态类型，也没有动态值。调用 `s.Store.Load(...)` 会立刻发生运行时错误。

第二种是接口装入了“具体类型为指针、但指针值为 nil”的对象：

```go
var fileStore *FileMessageStore = nil

s := Session{
    Store: fileStore,
}

fmt.Println(s.Store == nil) // false
```

接口值可理解为“动态类型 + 动态值”。这里动态类型是 `*FileMessageStore`，动态值才是 `nil`；因此整个接口并不等于 `nil`。调用接口方法能否成功，取决于该方法是否会解引用接收者：

```go
func (f *FileMessageStore) Save(m Message) error {
    return f.write(m) // f 为 nil 时可能发生错误
}
```

仅用 `if store == nil` 只能拦截第一种情况，不能证明依赖真正可用。更可靠的做法是在构造阶段建立契约：调用者必须传入可工作的 `MessageStore`，构造函数至少拒绝空接口。

```go
func NewSession(store MessageStore) (*Session, error) {
    if store == nil {
        return nil, errors.New("消息存储不能为空")
    }
    return &Session{Store: store}, nil
}
```

对于可能传入 nil 指针的实现，应进一步约定：实现者不得把 nil 指针作为有效存储传入；或者由具体构造函数保证只返回已初始化的实现。这样，业务代码无需在每次读写前猜测嵌入依赖是否处于可调用状态。

> **要点** — 嵌入接口组合能力，嵌入字段提升调用；额外状态与 nil 安全必须由包装方法和构造契约显式保证。

通过一个可运行的本地 IM 内存存储，学习以方法命名行为、以接口隔离能力，并辨清接口替换不等于业务可靠性。

### 从消息模型到内存存储

### 从消息模型到内存存储

先把“保存消息、按键查找消息”建模为一个最小可运行程序。这里的内存存储只服务于接口与方法练习，不模拟数据库、消息队列或跨进程可靠性。

```go
package main

import (
	"fmt"
	"sync"
)

type MessageKey string

type Message struct {
	Key  MessageKey
	Body string
}

type MemoryStore struct {
	mu   sync.RWMutex
	data map[MessageKey]Message
}

func NewMemoryStore() *MemoryStore {
	return &MemoryStore{
		data: make(map[MessageKey]Message),
	}
}

func (s *MemoryStore) Put(m Message) bool {
	if m.Key == "" || m.Body == "" {
		return false
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	if _, exists := s.data[m.Key]; exists {
		return false
	}
	s.data[m.Key] = m
	return true
}

func (s *MemoryStore) Find(key MessageKey) (Message, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	m, ok := s.data[key]
	return m, ok
}

func main() {
	store := NewMemoryStore()

	fmt.Println(store.Put(Message{Key: "m-1", Body: "你好"}))
	msg, ok := store.Find("m-1")
	fmt.Println(msg, ok)
}
```

`MessageKey` 是独立类型，而非直接使用 `string`；这使“消息标识”和普通文本在类型层面有所区分。`Message` 将键与正文聚合为一个值，调用者无需分别传递多个参数。

`NewMemoryStore` 返回初始化后的指针：`data` 必须由 `make` 创建，才能写入键值对。若直接声明 `var s MemoryStore`，则 `s.data` 是 `nil`；读取 nil map 可以安全返回零值，但向 nil map 写入会触发运行时恐慌。

`Put` 的本地规则只有三条：

- `Key` 不能为空；
- `Body` 不能为空；
- 键不能重复，重复时返回 `false`，且不覆盖旧消息。

例如 `maxBytes`、文本编码、敏感词、消息格式等验证，假定已经由前置层完成，本节不重复实现。`Find` 返回 `(Message, bool)`：`bool` 表示是否真正找到，避免把“缺失”与零值 `Message{}` 混淆。

这里使用指针接收者，因此调用 `store.Put(...)` 时，方法修改的是同一个 `MemoryStore` 的 `data`。后续会把这两个方法提炼为能力接口，使业务代码依赖“能写、能读”，而不是依赖 `MemoryStore` 这一具体类型。

### 用小接口描述读写能力

### 用小接口描述读写能力

接口不描述“对象是什么”，而描述“调用者此刻需要它做什么”。消息存储可拆成写入与读取两种能力：

```go
type Reader interface {
	Find(MessageKey) (Message, bool)
}

type Writer interface {
	Put(Message) bool
}

type Store interface {
	Reader
	Writer
}
```

`Reader` 只承诺能按键查找，`Writer` 只承诺能写入，`Store` 通过嵌入组合两者。接受 `Reader` 的函数不能误写数据；接受 `Writer` 的函数也不能假定自己能读取。这比直接依赖某个 `MemoryStore` 类型更精确。

```go
func saveThenFind(s Store, m Message) (Message, bool) {
	if !s.Put(m) {
		return Message{}, false
	}
	return s.Find(m.Key)
}
```

逐行看调用过程：

1. 参数 `s` 的静态类型是 `Store`；它只暴露 `Put`、`Find` 两个方法。
2. 调用 `s.Put(m)` 时，接口值内部保存的动态类型决定实际执行哪个 `Put`。若传入的是 `*MemoryStore`，便分派到 `(*MemoryStore).Put`。
3. 写入失败时立刻返回零值 `Message{}` 与 `false`，不继续查询。
4. 写入成功后，`s.Find(m.Key)` 再次依据同一动态值分派到具体实现的 `Find`。
5. 返回的消息与布尔值来自具体实现；接口统一了调用形式，却不自动赋予持久化、并发安全或可靠投递等业务保证。

例如：

```go
mem := NewMemoryStore()
msg, ok := saveThenFind(mem, Message{Key: "m1", Body: "你好"})
```

若 `NewMemoryStore` 返回的静态类型为 `Store`，调用者仍不知道其内部是否是 map、数据库或远程服务；它只依赖读写契约。后续可替换为 `DisabledStore`：`Put` 始终失败、`Find` 始终找不到，`saveThenFind` 无须修改。这正是小接口的价值：让业务代码依赖能力，而非依赖某个具体实现。

### 方法集、nil 与实现替换

### 方法集、nil 与实现替换

接口是否被实现，取决于**方法集**，而不是类型名。若 `MemoryStore` 的方法都使用值接收者，则 `Message` 的值和指针通常都可调用；若方法使用指针接收者，则只有指针可实现接口：

```go
type Reader interface {
	Find(MessageKey) (Message, bool)
}

type MemoryStore struct {
	data map[MessageKey]Message
}

func (m *MemoryStore) Find(k MessageKey) (Message, bool) {
	v, ok := m.data[k]
	return v, ok
}

var r Reader = &MemoryStore{data: map[MessageKey]Message{}}
```

此时 `MemoryStore{}` 不能赋给 `Reader`，因为它的方法集不包含 `(*MemoryStore).Find`。指针接收者也意味着方法可能修改内部状态，或避免复制包含 map、锁等字段的结构体。

`nil` 还要区分两层含义：

```go
var a Reader = nil              // 接口本身为空
var p *MemoryStore = nil
var b Reader = p                // 接口非空，动态值是 nil 指针
```

`a == nil` 为真；`b == nil` 为假，因为 `b` 仍保存了动态类型 `*MemoryStore`。对 `b.Find(...)` 的调用会进入 `(*MemoryStore).Find`；若方法内部直接访问 `m.data`，就会因 `m == nil` 而 panic。故调用方只检查 `store != nil`，不能排除 typed nil；更稳妥的约定是构造函数返回已初始化的接口实现，或在方法中明确处理 nil 接收者。

`DisabledStore` 表示另一种语义：它不是“没有实现”，而是“实现存在，但拒绝保存”。

```go
type Writer interface {
	Put(Message) error
}
type Store interface {
	Reader
	Writer
}
```

若 `DisabledStore.Put` 返回“已禁用”错误、`Find` 恒为未找到，它仍可实现 `Store`。这使 `saveThenFind` 无须依赖 `MemoryStore`：只依赖读写能力，并根据返回值处理业务结果。

断言用于检查运行时动态类型，而非替代接口设计：

```go
m, ok := store.(*MemoryStore)
```

`ok` 为假可能是 `DisabledStore`，也可能是其他合法实现；业务代码不应把断言成功当作接口契约。组合接口 `Store` 仅要求同时具备 `Reader` 与 `Writer`，不承诺容量、持久化、队列或可靠投递。嵌入的接口字段若为 nil，转发调用同样可能 panic。

固定 OpenIM 提交中，`CommonMsgDatabase` 与 `MsgTransferDatabase` 以方法接口表达能力，构造函数返回接口值，具体实现采用指针接收者。这说明接口可以隐藏实现并支持替换；但不能据此推导其全部存储、队列或可靠性保证。下一节再处理 `error`、`defer` 与文件实现。

### 边界测试与分层练习

### 边界测试与分层练习

不要把所有边界塞进一个 `main`：每个情景独立构造输入、调用、断言结果，才能定位失败来源。内存实现至少覆盖：

1. `NewMemoryStore()` 后立刻 `Put`：应成功；反馈：构造函数必须完成内部 `map` 初始化。  
2. 零值 `MemoryStore{}` 后 `Put`：若未初始化 `map` 会发生运行时异常；反馈：零值是否可用必须明确约定。  
3. 非空 `Key`、`Body` 写入再 `Find`：应取回原消息。  
4. 空 `Key` 写入：应拒绝；反馈：这是本章实现的本地规则。  
5. 空 `Body` 写入：应拒绝。  
6. 同一键第二次 `Put`：应拒绝重复，且原值不应被覆盖。  
7. 查询不存在的键：应返回“未找到”的结果，而非伪造空消息。  
8. `DisabledStore.Put`：应明确拒绝写入。  
9. `DisabledStore.Find`：应明确表示不可用或未找到；反馈：禁用不是内存实现的偶然行为。  
10. 将 `MemoryStore` 赋给 `Reader`：只能调用 `Find`。  
11. 将其赋给 `Writer`：只能调用 `Put`。  
12. 赋给组合接口 `Store`：可同时读写；反馈：组合接口表达能力集合。  
13. `var s Store = nil` 后调用方法：接口本身为 `nil`，调用会出错，调用前应判空。  
14. `var p *MemoryStore = nil; var s Store = p`：`s != nil`；反馈：接口含“动态类型 + 动态值”，动态值仍可为 `nil`。  
15. 含嵌入接口字段的结构体未注入实现：调用其提升方法会失败；反馈：嵌入不等于自动初始化。  
16. 指针接收者方法：`*MemoryStore` 可满足接口，`MemoryStore` 值通常不能；反馈：检查方法集，而非只看类型名。  
17. 把 `saveThenFind(w Writer, r Reader, m Message)` 换为 `DisabledStore`：编译可通过，业务仍可能失败；反馈：接口替换保证能力形状，不保证成功。  
18. `maxBytes` 等文本长度校验标记为“已由前置层通过”：测试不应重复假设本章实现了它；反馈：边界责任要写清。

逐行追踪 `saveThenFind`：先经 `Writer.Put` 按接口动态类型分派到具体方法；成功后经 `Reader.Find` 再分派；返回的 `Message` 是否存在，取决于具体实现及其业务规则。接口隐藏实现，却不能推出持久化、队列或可靠投递保证。下一章再处理 `error`、`defer` 与文件存储实现。

### OpenIM 接口对照与保证边界

### OpenIM 接口对照与保证边界

在固定提交的 [OpenIM 源码](https://github.com/openimsdk/openim-sdk-core) 中，`CommonMsgDatabase` 与 `MsgTransferDatabase` 都以**方法接口**描述能力：调用方只依赖“能查询、写入或处理消息”的行为，而不直接依赖某个具体结构体。

可从接口与构造过程推知：

- 构造函数返回的是接口值，调用者拿到的是抽象能力，而非实现类型。
- 具体实现使用指针接收者，因此通常以 `&实现类型{...}` 形式放入接口；其动态类型是指针类型。
- 调用 `db.某方法()` 时，运行时根据接口中保存的动态类型，分派到该指针接收者方法。
- 更换实现时，只要新类型满足同一接口，依赖接口的业务代码通常无需改动。

这与本章的 `Store`、`Reader`、`Writer` 一致：`saveThenFind` 只要求参数同时具备写入和查询能力，不关心底层是 `MemoryStore`、禁用实现，还是未来的文件实现。

但接口并不自动承诺业务性质。仅凭 `CommonMsgDatabase`、`MsgTransferDatabase` 的接口形式，**不能**推出其使用何种存储介质、是否有队列、是否持久化、是否支持重试、是否去重，更不能推出消息一定可靠送达。接口只说明“可调用哪些方法”；可靠性、事务、容量限制与错误语义必须由方法文档、实现代码和测试共同确认。

还要警惕 `typed nil`：接口变量本身非 `nil`，但内部若保存 `(*某实现)(nil)`，调用指针接收者方法仍可能触发异常。下一章将继续处理 `error`、`defer` 与文件实现；它们尚未在这里展开。

> **要点** — 接口隐藏实现、暴露能力；内存存储只保证本章定义的本地读写规则，不承诺网络、持久或送达。
