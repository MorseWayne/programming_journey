# 01.07 错误与资源生命周期：让本地历史的失败原因与关闭责任可追踪

*面向已完成 01.01—01.06 的 Go 初学者，以虚构 IM 身份 c-a/u-a/m-a 的本地消息历史为贯穿案例，建立从错误返回、错误链与业务判断，到文件资源关闭与 I/O 分次读写的完整心智模型。读者将通过可静态推导的完整程序和分层练习，学会让失败原因、状态影响与关闭责任都可追踪。*

**章节:** 2

---

## 本书导览

- 了解整本书的章节脉络
- 掌握各章之间的概念依赖关系
- 选择最合适的阅读顺序

# 01.07 错误与资源生命周期：让本地历史的失败原因与关闭责任可追踪

面向已完成 01.01—01.06 的 Go 初学者，以虚构 IM 身份 c-a/u-a/m-a 的本地消息历史为贯穿案例，建立从错误返回、错误链与业务判断，到文件资源关闭与 I/O 分次读写的完整心智模型。读者将通过可静态推导的完整程序和分层练习，学会让失败原因、状态影响与关闭责任都可追踪。

下方的概念图展示了本书 0 个核心概念以及它们之间的依赖关系；再下方是 1 个章节的入口。你可以按从上到下的顺序阅读，也可以根据自己的兴趣或先验知识选择切入点。

#### 概念图

```mermaid
graph TD
  empty["(no concepts yet)"]
```

## 章节索引

- **01.07 错误与资源生命周期：让本地历史的失败原因与关闭责任可追踪** — 承接方法和接口，建立 error、错误包装、defer、io.Reader/io.Writer/io.Closer 与 os.File 的基本模型。使用虚构 IM 的本地消息历史说明失败原因、资源取得后的关闭责任和读取边界；不涉及网络、并发、数据库、JSON 编码或真实消息送达。

## 01.07 错误与资源生命周期：让本地历史的失败原因与关闭责任可追踪

- 用 error 而非 bool、字符串混合返回表达可处理的失败
- 区分可供程序分支的错误身份和给人阅读的上下文文本
- 理解 sentinel error、fmt.Errorf 的 %w、errors.Is 与 errors.As 的不同用途
- 解释 defer 的求值时机、LIFO 顺序和资源所有者的关闭责任
- 读懂 io.Reader、io.Writer、io.Closer 的结果，先处理 n > 0 的数据再处理 err
- 用 os.Open 与 File.Close 表达本地历史读取的资源生命周期
- 说明 panic/recover 与普通业务失败的边界
- 为下一章的文件格式、JSON 和时间保留清晰前提

从本地消息历史的“找不到、重复保存、读取失败”出发，区分失败状态、失败原因与调用者应承担的处理责任。

### 失败不只是一个假值

### 失败不只是一个假值

设本地历史仓库有两个早期接口：

```go
func (r *History) Find(id string) (Message, bool)
func (r *History) Put(m Message) (bool, string)
```

`Find` 的第二个结果适合回答一个很窄的问题：这个 `id` 是否存在。

```go
m, ok := history.Find("m-a")
if !ok {
    // 本地历史中没有 m-a
}
```

这里的 `false` 含义相对稳定：未找到。因为查找只有“找到”与“缺失”这一个主要分支。

但 `Put` 返回 `(bool, string)` 很快会失去清晰性：

```go
ok, text := history.Put(message)
if !ok {
    fmt.Println(text)
}
```

`false` 到底表示什么？可能是消息 ID 重复、消息内容不合法、仓库尚未初始化，未来还可能是本地写入失败。`string` 虽然能展示“重复消息”之类的文案，却不适合机器稳定判断：

```go
if text == "消息已存在" {
    // 依赖文字做分支，脆弱
}
```

文案可能因改写、翻译或补充上下文而变化；调用者也无法从中看出自己应当重试、提示用户修改，还是直接忽略。

因此，失败至少包含三层：

- **是否失败**：操作是否成功完成；
- **失败原因**：例如消息不存在、消息重复；
- **调用者责任**：提示用户、跳过重复项、重试，或停止后续处理。

一个假值只能表达“没有成功”，展示字符串只能面向人，二者都不能可靠承载原因与责任。后续应让 `Put` 返回专门的错误结果，使调用者按可识别的失败原因作出明确处理。需要注意：即使本地保存 `m-a` 成功，也只能说明本地历史已接受它，不能推导服务端已受理、已持久化、其他设备已接收，更不能推导对方已读。

### 用 error 表达失败原因

### 用 `error` 表达失败原因

对本地消息历史而言，一次操作至少有四种需要区分的结果：

- **成功**：例如消息已写入本地历史，`Find` 找到了对应消息。
- **失败**：操作没有完成预期目标。
- **失败原因**：例如消息不存在、消息重复、存储介质读取失败。
- **调用者责任**：调用者根据原因决定提示用户、跳过、重试、记录日志，或改走其他流程。

此前若把查找写成：

`func (h *History) Find(id string) (Message, bool)`

其中 `false` 可以表达“没有找到”，因为查找的失败原因暂时只有“缺失”。但保存若使用 `(bool, string)`，问题就出现了：`false` 表示失败，字符串既想给机器判断，又想给用户展示。调用者若写 `if text == "消息已存在"`，就把业务逻辑绑在文案上；改一个标点、换一种语言都可能破坏判断。

Go 用预声明接口类型 `error` 表示失败原因。`nil` 表示没有错误；非 `nil` 表示发生了某种错误。惯例是：在有多个返回值时，把 `error` 放在最后。

```go
func (h *History) Put(m Message) error
func (h *History) Find(id string) (Message, error)
```

于是调用者的责任更明确：

```go
msg, err := history.Find("m-a")
if err != nil {
    // 根据错误原因决定如何处理
    return
}
// 此处才能使用 msg
```

`error` 是接口，不是“自动打印的文字”。它携带的是失败信息；是否展示、如何展示、是否继续执行，都由调用者决定。后续还会看到：本地保存成功只说明本地历史写入成功，不能推导服务端已受理、已持久化、其他设备已接收，或对方已经阅读。

### 为缺失消息定义哨兵错误

### 为缺失消息定义哨兵错误

本地历史查询只有“是否找到”还不够。`false`能表示缺失，却不能把失败原因作为一个可传递、可稳定判断的值交给调用者。对于会话 `c-a`、用户 `u-a`、消息 `m-a`，可以定义一个可复用的哨兵错误：

```go
package main

import (
	"errors"
	"fmt"
)

type Message struct {
	ID   string
	Text string
}

var ErrMessageNotFound = errors.New("本地消息不存在")

type History struct {
	messages map[string]Message
}

func (h *History) Find(messageID string) (Message, error) {
	message, ok := h.messages[messageID]
	if !ok {
		return Message{}, ErrMessageNotFound
	}
	return message, nil
}

func main() {
	history := History{
		messages: map[string]Message{
			"m-a": {ID: "m-a", Text: "你好"},
		},
	}

	message, err := history.Find("m-x")
	if err == ErrMessageNotFound {
		fmt.Println("c-a 中未找到 u-a 的消息 m-x")
		return
	}
	if err != nil {
		fmt.Println("查询本地历史失败")
		return
	}
	fmt.Println(message.Text)
}
```

`error`是预声明的接口类型；`nil`表示没有错误。因此惯例是把 `error`放在最后一个返回值：成功时返回消息和`nil`，缺失时返回零值`Message{}`与`ErrMessageNotFound`。

`errors.New("本地消息不存在")`创建一个错误值。若每次缺失都写：

`return Message{}, errors.New("本地消息不存在")`

虽然文本相同，但每次创建的错误值不同，调用者不能可靠地用`==`比较。把它保存为包级变量`ErrMessageNotFound`后，查询与判断复用同一个值，`err == ErrMessageNotFound`才有明确含义。

错误文本用于人类阅读，不应用作业务分支；不要写`err.Error() == "本地消息不存在"`。文本可能被修改、翻译或补充上下文，而哨兵错误表达的是稳定的程序语义。

最后，本地找到或成功保存 `m-a`，只说明当前程序的本地历史状态；不能推出服务端已受理、已持久化、其他设备已接收，或对方已经阅读。

### 调用者按原因分支处理

### 调用者按原因分支处理

`Find` 返回的 `false` 只能说明“没有找到”，却无法表达“数据损坏、读取失败”等其他情况。改为返回 `error` 后，调用者应按**错误原因**决定行为，而不是猜测错误文本。

```go
package main

import (
	"errors"
	"fmt"
)

var ErrMessageNotFound = errors.New("消息不存在")

type Message struct {
	ID   string
	Text string
}

type History struct {
	items map[string]Message
}

func (h *History) Find(id string) (Message, error) {
	msg, ok := h.items[id]
	if !ok {
		return Message{}, ErrMessageNotFound
	}
	return msg, nil
}

func main() {
	history := History{
		items: map[string]Message{
			"m-a": {ID: "m-a", Text: "你好"},
		},
	}

	msg, err := history.Find("m-x")
	if err == ErrMessageNotFound {
		fmt.Println("本地历史中没有这条消息，可提示用户或发起后续同步。")
		return
	}
	if err != nil {
		fmt.Println("读取本地历史失败：", err)
		return
	}

	fmt.Println("找到消息：", msg.Text)
}
```

这里有三条路径：

- `err == nil`：成功取得消息，可以使用 `msg`。
- `err == ErrMessageNotFound`：这是可预期的业务状态，调用者可显示“消息不存在”。
- 其他非 `nil` 错误：表示另一类失败；即使当前示例尚未实现文件读取，也应保留独立处理位置。

不要写成 `if err.Error() == "消息不存在"`。错误文本是给人阅读的展示信息，未来可能改为“找不到消息”“message not found”，或附带更多上下文；业务分支应比较复用的哨兵错误值。

也不要因用户查找了不存在的 `m-a`、重复保存消息，或本地文件暂时不可读就调用 `panic`。这些都是程序可预期面对的情况，应由调用者处理、提示或继续返回错误。最后，本地 `Put` 成功只说明本地历史已保存；它不能证明服务端已经受理、持久化，也不能证明其他设备已接收或用户已读。

### 本地保存不等于消息送达

### 本地保存不等于消息送达

对 `m-a` 而言，`Put` 返回 `nil` 只能承诺一件事：这条消息已按当前函数的规则成功写入**本地历史**。例如：

```go
func (h *History) Put(m Message) error {
	if _, exists := h.messages[m.ID]; exists {
		return ErrDuplicateMessage
	}
	h.messages[m.ID] = m
	return nil
}
```

调用：

```go
err := history.Put(msg)
if err != nil {
	// 本地保存失败：例如消息 ID 重复
}
```

这里的 `nil` 不应被解释为“消息已经送达”。它更不证明以下任何事实：

| 事实 | 本地 `Put` 成功能否证明 |
|---|---|
| 消息已写入 `m-a` 的内存历史 | 能 |
| 服务端已收到请求 | 不能 |
| 服务端已持久化消息 | 不能 |
| 对方设备已收到消息 | 不能 |
| 对方用户已阅读消息 | 不能 |

原因很简单：当前 `Put` 只操作本地 `map`，既没有连接服务端，也没有等待回执，更没有观察对方设备状态。函数的 `error` 范围必须与它实际完成的工作一致。

因此，调用者应按责任分层理解结果：`Put` 的错误由本地历史调用者处理；未来“发送到服务端”的函数需要单独返回其发送错误；“已读”则必须由另一个明确表示阅读回执的状态或结果表达。不要把一次本地写入成功，扩张解释成整个消息链路成功。

> **要点** — error 让失败原因可供程序判断；哨兵错误表达稳定原因，本地成功只能说明本地操作成功。

错误处理的关键不只是“有错误就返回”，而是让失败原因沿调用栈可追踪，并由合适的一层决定恢复、提示或终止。

### 失败应由谁处理

### 失败应由谁处理

错误应由**最了解“下一步该做什么”**的一层处理，而不一定是最先发现错误的一层。底层函数通常知道“操作失败了”，却不知道失败后应重试、跳过、提示用户，还是终止程序；因此它应返回 `err`，把决策权交给调用者。

```go
func loadHistory(id string) ([]Message, error) {
    // 知道读取失败，但不知道用户界面或程序策略
    return nil, err
}
```

调用者应紧邻调用处检查错误，避免错误被忽略后继续使用零值：

```go
history, err := loadHistory(conversationID)
if err != nil {
    return fmt.Errorf("读取会话 %q 的本地历史: %w", conversationID, err)
}
```

这里 `loadHistory` 发现失败但无法决定策略，所以返回；上层若仍不能决定，也继续包装并上交。直到某层拥有足够业务上下文：

- `validate`：重复消息应拒绝、提示，还是视为幂等成功？
- `store`：写入冲突是否值得重试？
- `load`：文件不存在是“无历史”，还是数据损坏？
- `main`：最终是输出提示、返回退出码，还是终止程序？

例如，`load` 读不到文件时不应擅自打印并退出，因为 `main` 可能希望把“首次使用、尚无历史”当作正常情况。相反，`main` 不应忽略 `err` 后继续使用空历史，否则零值会掩盖真正的失败原因。

原则是：**发现但不能处理，就返回；能够决定业务后果，就在调用点处理；仍无法决定，就带着上下文继续上交。**

### 立即检查与避免错误用法

### 立即检查与避免错误用法

读取本地历史后，最靠近调用点的代码最清楚“这次读取失败会影响什么”，因此应立即检查：

```go
history, err := load(conversationID)
if err != nil {
	return fmt.Errorf("读取会话 %q 的本地历史: %w", conversationID, err)
}
```

不要忽略 `err` 后继续使用返回值：

```go
history, _ := load(conversationID)
fmt.Println(history.Messages) // 可能把读取失败误当成“没有历史”
```

失败时 `history` 往往只是零值。这样会把“文件损坏、权限不足、路径不存在”等问题伪装为空历史，后续甚至可能重复写入消息。

也不要比较错误文字：

```go
if err.Error() == "file does not exist" { ... }
```

错误文本可能因操作系统、路径、包装上下文而变化；文字是给人看的，不是稳定接口。应使用：

```go
if errors.Is(err, fs.ErrNotExist) {
	// 首次会话：可创建空历史
}
```

同样，下面的写法虽然增加了说明，却丢失了原始错误身份：

```go
return fmt.Errorf("读取本地历史失败: %v", err)
```

`%v` 只把错误格式化成文本，`errors.Is` 无法继续找到 `fs.ErrNotExist`。使用 `%w` 才会建立可遍历的错误链：

```go
return fmt.Errorf("读取会话 %q 的本地历史: %w", conversationID, err)
```

包装并非越多越好：是否让调用者看见底层错误，是函数 API 契约的一部分。只有调用者确实需要据此决定“创建文件、重试或提示用户”时，才暴露该原因。

### 用包装保留上下文与原因

### 用包装保留上下文与原因

底层函数最了解“发生了什么”，但往往不知道“这对当前操作意味着什么”。例如读取本地历史时，文件层只能返回“不存在”或权限错误；上层却知道这是哪个会话、正在执行加载还是保存。因此，发现错误但无法决定恢复策略的函数应返回 `err`，由紧邻调用处补充语境或处理。

```go
history, err := store.Load(conversationID)
if err != nil {
	return fmt.Errorf("读取会话 %q 的本地历史: %w", conversationID, err)
}
```

这里的 `%w` 有两层作用：

- 外层文本补充了操作和会话标识，日志更容易定位；
- 原始 `err` 被包装进错误链，调用者仍可检查其真实原因。

例如最终在 `main` 层可以区分“消息不存在”和“历史文件不存在”：

```go
if errors.Is(err, ErrMessageNotFound) {
	// 提示用户消息编号无效
}
if errors.Is(err, fs.ErrNotExist) {
	// 提示本地历史尚未创建
}
```

不要写成：

```go
fmt.Errorf("读取会话 %q 的本地历史: %v", conversationID, err)
```

`%v` 只会把错误转成文本；打印结果看似相同，却没有建立可遍历的包装关系，`errors.Is` 无法继续识别底层的 `fs.ErrNotExist`。同样，不应通过 `err.Error() == "文件不存在"` 判断原因：错误文本不是稳定契约，包装、路径和系统差异都可能改变它。

是否使用 `%w` 也是 API 契约：一旦包装底层错误，调用方就可能依赖该身份。只在确实希望上层据此决策时暴露它；若底层实现细节不应成为接口的一部分，就应转换为自己的稳定错误。

### 沿错误链识别类型与原因

### 沿错误链识别类型与原因

错误被 `%w` 包装后形成一条可遍历的错误链。调用者不应依赖 `err.Error()` 的文案，而应询问：这条链中是否包含我能处理的原因？

```go
if errors.Is(err, ErrMessageNotFound) {
    // 重复消息：可忽略、提示，或改走更新逻辑
}

if errors.Is(err, fs.ErrNotExist) {
    // 本地历史文件尚不存在：可初始化为空历史
}
```

`errors.Is` 适合匹配哨兵错误：它会从外层错误逐层调用 `Unwrap`，因此即使错误已附加上下文，仍能识别底层的 `ErrMessageNotFound` 或 `fs.ErrNotExist`。前提是上游使用了 `%w`；若写成 `%v`，底层错误只变成文本，匹配会失败。

有时仅知道“文件不存在”还不够，还需要路径、操作等细节。此时使用 `errors.As` 提取特定类型：

```go
var pathErr *fs.PathError
if errors.As(err, &pathErr) {
    fmt.Printf("操作=%s，路径=%s，原因=%v\n",
        pathErr.Op, pathErr.Path, pathErr.Err)
}
```

这里 `pathErr` 的类型是 `*fs.PathError`，因为目标错误本身通常是指针；`errors.As` 需要一个“可写入目标变量”的地址，所以传入 `&pathErr`，其类型为 `**fs.PathError`。匹配成功后，函数将链中找到的 `*fs.PathError` 赋给 `pathErr`。

`Is` 回答“是否属于某种原因”，`As` 回答“能否取得某种错误类型及其附加字段”。是否向外包装 `*fs.PathError` 等底层类型，是接口契约：一旦暴露，调用方就可能依赖它，不能随意更换存储实现。

### 四层调用中的错误契约

### 四层调用中的错误契约

设本地历史流程为 `validate → store → load → main`。错误应由**最了解原因的一层产生**，由**最能决定下一步的一层处理**；中间层若不能恢复，就补充语境后返回。

- `validate` 了解消息内容与业务规则。发现重复消息时返回稳定的领域错误 `ErrDuplicateMessage`，不打印、不退出：
  `return ErrDuplicateMessage`
- `store` 负责持久化边界。它可将底层冲突转换为领域错误，但不应把文件系统实现细节随意变成公开契约。
- `load` 了解文件路径与读取动作。文件缺失时可保留原因链：
  `return fmt.Errorf("读取会话 %q 的本地历史: %w", conversationID, err)`
- `main` 最接近用户交互，决定提示“消息已存在”、创建新历史，或报告“历史文件不存在”。

例如：

```go
err := load(conversationID)
if err != nil {
    if errors.Is(err, fs.ErrNotExist) {
        // 决定初始化空历史
    }
    return err
}
```

`%w` 建立可遍历的错误链，因此 `errors.Is(err, fs.ErrNotExist)` 能穿透“读取会话”这一层上下文；`%v` 只把错误转成文本，之后无法可靠识别原始身份。不要用 `err.Error() == "文件不存在"` 比较文字：措辞、路径和系统语言都可能变化。

重复消息路径同理：`main` 用 `errors.Is(err, ErrDuplicateMessage)` 选择恢复策略。若确实需要路径等附加信息，可写：

`var pathErr *fs.PathError`  
`if errors.As(err, &pathErr) { /* pathErr.Path */ }`

这里 `pathErr` 是目标类型的指针，`&pathErr` 是供 `errors.As` 写入该指针的位置。

是否用 `%w` 暴露 `fs.ErrNotExist`、`*fs.PathError` 等底层错误，是 API 契约：一旦包装，调用方可能依赖它；不要仅为“信息更全”而无意承诺内部实现。

> **要点** — 错误应携带上下文向上交还；用 %w 保留原因，并由稳定契约决定调用方可识别哪些错误。

多个返回分支会让关闭责任变得脆弱。掌握 defer 的登记时机、执行顺序与作用域，才能让文件等资源的生命周期清晰可查。

### 从漏关文件识别资源责任

### 从漏关文件识别资源责任

读取本地历史时，函数常有多个提前返回：文件不存在、读取失败、内容为空、解析失败。若在每个分支手写 `f.Close()`，很容易漏掉其中一个：

```go
f, err := os.Open(historyPath)
if err != nil {
    return nil, err
}

data, err := io.ReadAll(f)
if err != nil {
    return nil, err // 若忘记关闭，文件仍被占用
}
if len(data) == 0 {
    return nil, nil
}
return parseHistory(data)
```

这里的 `f` 不是普通变量，而是一个**资源**：成功取得后，程序必须在合适的边界结束使用它。文件描述符数量有限；遗漏关闭可能在少量调用时不明显，却会在反复读取历史、长时间运行或并发执行后累积为“打开文件过多”等故障。

一个实用的责任规则是：

- `os.Open` 成功的函数，默认承担关闭责任；
- 若该函数把文件对象交给调用者继续使用，必须明确转移责任；
- `Open` 失败时没有可用文件，不能写 `defer f.Close()`；
- 资源边界应覆盖“取得后到不再需要它”的完整路径，而不是只覆盖某个成功分支。

因此，成功打开后立刻登记关闭：

```go
f, err := os.Open(historyPath)
if err != nil {
    return nil, err
}
defer f.Close()

data, err := io.ReadAll(f)
if err != nil {
    return nil, err
}
return parseHistory(data)
```

这样，后续无论在哪个 `return` 离开，关闭责任都与 `f` 的取得位置绑定。文件是最直观的例子；以后遇到连接、锁、事务等对象，也应先问：它何时取得、谁负责结束、结束失败又该如何处理？

### 成功取得后立即登记关闭

### 成功取得后立即登记关闭

`Open` 的返回值划出一条清晰边界：成功之前，没有可关闭的资源；成功之后，当前函数就承担关闭责任。

```go
f, err := os.Open(path)
if err != nil {
	return err
}
defer f.Close()
```

这里的顺序不能颠倒。若 `Open` 失败，`f` 不代表一个可正常使用的文件，调用 `f.Close()` 既没有意义，也可能导致空指针问题。因此，应先检查 `err`，确认取得资源后，立刻登记关闭动作。

“立刻”不是代码风格上的洁癖，而是为了防止后续新增的返回分支遗漏释放：

```go
f, err := os.Open(path)
if err != nil {
	return err
}
defer f.Close()

if headerInvalid(f) {
	return fmt.Errorf("文件头无效")
}

data, err := io.ReadAll(f)
if err != nil {
	return err
}
return process(data)
```

无论函数在“文件头无效”“读取失败”还是正常处理完成时返回，`defer f.Close()` 都会在函数退出时执行。资源生命周期因而集中在取得资源的位置：谁成功取得，谁立即登记结束使用。

对只读文件，常见示例会暂时忽略 `Close` 的错误，或仅记录它：

```go
defer func() {
	if err := f.Close(); err != nil {
		log.Printf("关闭文件失败：%v", err)
	}
}()
```

但这不是“关闭错误永远可忽略”的规则。写入、刷新、提交型资源可能在关闭时才报告失败；是否返回该错误，应遵循该资源的契约。

### 区分 defer 的求值时机与执行时机

### 区分 `defer` 的求值时机与执行时机

`defer` 容易被误解为“把这一行代码以后再执行”。更准确地说：执行到 `defer` 语句时，**被调用函数和它的参数立刻求值并登记**；真正的调用则延后到外围函数退出时执行。

```go
func demo() {
	for i := 0; i < 3; i++ {
		defer fmt.Println(i)
		fmt.Println("循环内：", i)
	}
	fmt.Println("准备退出")
}
```

执行过程可拆开看：

| 当前 `i` | 执行 `defer fmt.Println(i)` 时 | 立刻输出 | 登记的延后调用 |
|---|---|---|---|
| 0 | 参数 `i` 求值为 `0` | `循环内：0` | `Println(0)` |
| 1 | 参数 `i` 求值为 `1` | `循环内：1` | `Println(1)` |
| 2 | 参数 `i` 求值为 `2` | `循环内：2` | `Println(2)` |

循环结束后先输出：

```text
准备退出
```

随后 `demo` 返回，已登记的调用按**后进先出**执行，因此输出：

```text
2
1
0
```

这里延后的不是变量 `i` 的“未来值”，而是已经求值完成的调用：`Println(0)`、`Println(1)`、`Println(2)`。多个 `defer` 像栈一样，最后登记的最先执行。

因此，`defer f.Close()` 中的 `f` 会在登记时确定，但 `Close` 在函数返回、执行到末尾或因 `panic` 展开时才调用；它不是后台任务，也不会在当前代码行立刻关闭资源。

### 用小函数限制循环中的资源作用域

### 用小函数限制循环中的资源作用域

`defer` 要等**外围函数**返回时才执行。如果在一个可能很长、甚至无界的循环中不断登记 `defer f.Close()`，文件不会在本轮处理结束时关闭，而会一直累积到整个函数结束。结果可能是文件描述符耗尽、后续打开失败，或写入缓冲迟迟未提交。

容易忽略的问题写法：

```go
for _, name := range names {
	f, err := os.Open(name)
	if err != nil {
		continue
	}
	defer f.Close()

	// 处理 f
}
```

这里每次循环都成功登记一个关闭动作，但所有关闭动作都被推迟到包含该循环的函数返回。即使某个文件已经处理完毕，它仍占用资源。

应当把“一次迭代取得、使用、关闭资源”的责任放进小函数：

```go
for _, name := range names {
	if err := processFile(name); err != nil {
		log.Println("处理失败:", err)
	}
}

func processFile(name string) error {
	f, err := os.Open(name)
	if err != nil {
		return err
	}
	defer f.Close()

	// 读取并处理 f
	return nil
}
```

现在 `defer f.Close()` 绑定的是 `processFile` 的返回时刻：每轮处理完成，无论正常 `return`、中途出错，还是发生 `panic` 展开，都会及时执行关闭；下一轮开始前，上一轮文件已不再被占用。

若循环中需要写文件，也采用同样结构，但要根据资源契约处理 `Close` 的错误：某些写入或提交型资源可能在关闭时才报告最终失败，不能简单忽略。小函数不仅限制了资源作用域，也让“本轮处理失败”与“本轮关闭失败”的责任更容易分别追踪。

### 处理 Close 错误而不误用 defer

### 处理 `Close` 错误而不误用 `defer`

`defer f.Close()` 的价值是保证退出路径上的关闭动作被登记，但它不会自动决定如何处理 `Close` 返回的错误。策略取决于资源契约。

- **只读文件**：读取成功后，关闭错误通常不改变已经获得的数据；可以按日志或监控策略记录，而非覆盖主错误。

```go
f, err := os.Open(name)
if err != nil {
	return err
}
defer func() {
	if err := f.Close(); err != nil {
		log.Printf("关闭文件失败: %v", err)
	}
}()

data, err := io.ReadAll(f)
return err
```

- **写入、刷新或提交型资源**：`Close` 可能执行最后一次缓冲区刷新、提交或校验。此时关闭失败可能意味着数据未完整落盘，不能笼统忽略；应依据接口契约把它返回给调用者。

```go
func save(name string, data []byte) (err error) {
	f, err := os.Create(name)
	if err != nil {
		return err
	}
	defer func() {
		if closeErr := f.Close(); err == nil {
			err = closeErr
		}
	}()
	_, err = f.Write(data)
	return err
}
```

上例保留原有的写入错误，仅当写入成功时才返回关闭错误。它使用具名返回值和 `defer` 修改结果，虽然必要时可用，却增加了推理难度；初学阶段默认避免这种写法，优先把资源接口和错误优先级设计清楚。

还要记住：`defer` 不是后台任务，也不会在声明行立刻关闭资源；它只是在外围函数返回、结束或发生 `panic` 展开时执行。它能安排清理，却不能替代 `Open`、`Write`、`Close` 等每一步的错误处理。

> **要点** — 资源一旦成功取得，就由当前所有者立即登记退出动作；理解 defer 的延迟执行、后进先出与作用域，才能避免遗漏关闭。

本节先建立本地历史读写的最小 I/O 心智模型：数据按字节分批流动，完成一次调用不等于完成整个文件。

### I/O 是字节在端点间分批流动

### I/O 是字节在端点间分批流动

I/O（输入/输出）描述的是字节在两个端点之间移动：读取时，程序从输入端点取得字节；写入时，程序把字节交给输出端点。本地历史文件可以是输入端点，内存缓冲区也可以是输出端点；关键不在于端点“像不像文件”，而在于它能否提供或接收字节。

Go 中，字节通常放在 `[]byte` 中。它既是数据容器，也是调用者提供的工作区。例如：

```go
buf := make([]byte, 4096)
```

这里的 `buf` 是一个容量为 4096 字节的缓冲区。读取操作会把新得到的内容填入其中的一部分；写入操作则把其中已有的内容发送出去。实际有效范围不一定是整个缓冲区，而应由本次调用返回的字节数决定。

可以把 I/O 想成分批搬运历史记录：

- 输入端点：保存旧记录的文件、字符串或内存数据；
- 缓冲区：一次暂存一小批字节的 `[]byte`；
- 输出端点：接收并保存复制结果的文件或内存缓冲区；
- 循环：持续读取一批、写入一批，直到确认输入结束。

一次读取成功，只说明“这次拿到了一批字节”，并不说明完整历史已经读完；一次写入成功，也只说明“这批字节已被交给写入端点”，并不自动等价于整个历史已经写完。文件内容可能远大于缓冲区，也可能底层实现故意每次只返回少量数据。

因此，处理本地历史时不能写出“读一次就得到完整文件”的假设。正确的基本模型是：

`读取一批 → 处理有效字节 → 写入这一批 → 继续读取`

缓冲区大小只影响每批搬运多少字节，通常不应改变程序是否正确。完整性来自循环、返回值检查和明确的结束条件，而不是某一次调用恰好返回了很多数据。

### Reader：先处理读到的字节

### Reader：先处理读到的字节

`io.Reader` 只承诺一种能力：把数据读入调用者提供的缓冲区。

```go
Read(p []byte) (n int, err error)
```

其中每一项都必须单独理解：

- `p []byte`：调用者准备的字节缓冲区。`Read` 会尝试把输入写入 `p`；它不是“整个文件”，只是本次接收数据的容器。
- `n int`：本次实际写入 `p` 的字节数，满足 `0 <= n <= len(p)`。有效数据只在 `p[:n]` 中，不能处理完整的 `p`，因为其余位置可能是旧内容或未使用空间。
- `err error`：本次读取的状态信息。它可能表示正常结束，也可能表示异常；不能看到非 `nil` 就直接丢弃本次读到的数据。

关键顺序是：**先处理 `p[:n]`，再判断 `err`**。一次调用可以同时返回数据和错误：

```go
n, err := r.Read(buf)
if n > 0 {
    consume(buf[:n])
}
if err == io.EOF {
    // 正常输入结束
} else if err != nil {
    return err
}
```

例如读取最后一批字节时，Reader 可能返回 `n == 3, err == io.EOF`。这 3 个字节仍属于历史内容；若先检查错误并立即返回，就会漏掉末尾数据。

`io.EOF` 表示输入已正常结束，不等于“网络失败”或“文件损坏”。若读取的是有固定结构的数据，而输入在预期字段、记录或长度尚未完成时结束，调用方或更高层解析器可使用 `io.ErrUnexpectedEOF` 表达“结束得不合时宜”。

还要避免另一种误解：`n == 0 && err == nil` **不表示 EOF**。它只表示这次调用暂未交付字节且未报告结束；通用循环不能把它擅自当作文件结束。Reader 描述的是分批交付字节的能力，而不是“一次调用返回完整内容”的承诺。

### EOF、意外结束与零字节读取

### EOF、意外结束与零字节读取

`Read(p)` 的返回值必须结合 `n` 与 `err` 一起判断，不能只看错误是否为空。对本地历史文件而言，常见情形可对比如下：

| 返回结果 | 含义 | 调用者动作 |
|---|---|---|
| `n > 0, err == nil` | 本次读到一些字节，后面可能还有数据 | 处理 `p[:n]`，继续读 |
| `n > 0, err == io.EOF` | 本次读到了最后一批字节 | 先处理 `p[:n]`，再结束循环 |
| `n == 0, err == io.EOF` | 已无更多输入 | 正常结束 |
| `n == 0, err == nil` | 本次暂未取得数据 | 不能据此认定结束；按接口约定谨慎重试或交由上层处理 |
| `n == 0, err != nil` | 未读到数据且发生错误 | 返回或报告该错误 |

`io.EOF` 表示输入已自然耗尽，不等于“读取失败”，更不能笼统称为网络失败。读取完整历史文本时，EOF 往往正是成功完成的标志：

```go
n, err := r.Read(buf)
if n > 0 {
    consume(buf[:n])
}
if err == io.EOF {
    break
}
if err != nil {
    return err
}
```

结构化数据则有更严格的“完整性”要求。例如格式规定先读 8 字节头部，却只获得 3 字节后输入结束；此时虽然底层结束仍与 EOF 有关，但对解析器而言是内容被截断，应使用 `io.ErrUnexpectedEOF` 表达“在预期还有数据时意外结束”。

特别注意：`0, nil` 不代表 EOF。`Reader` 接口只承诺一次调用的结果，不承诺每次都交付字节；因此“本次没有读到”与“以后永远没有数据”是两回事。EOF 才是明确的输入结束信号。

### Writer：写入数量不是持久化承诺

### Writer：写入数量不是持久化承诺

`io.Writer` 的核心方法是：

`Write(p []byte) (n int, err error)`

它接收待写入的字节切片 `p`，返回实际接受的字节数 `n` 与错误 `err`。通常应满足：

- `0 <= n <= len(p)`
- 当 `err == nil` 时，调用者通常期望 `n == len(p)`
- 若 `n < len(p)`，说明发生了短写；即使 `err == nil`，也不能把剩余字节当作已经写入

因此，写入一段历史文本不能只看“调用了 `Write`”，而要检查结果：

```go
n, err := w.Write(p)
if err != nil {
    return err
}
if n != len(p) {
    return io.ErrShortWrite
}
```

若返回 `n > 0, err != nil`，前 `n` 个字节已经被 writer 接受，错误说明后续部分未能按要求完成；调用者不能忽略已写入的前缀，也不能假设整段数据失败后完全不存在。

一次 `Write` 成功只表示该 writer 已接受这批字节。例如写入 `strings.Builder` 或 `bytes.Buffer` 时，字节已进入内存缓冲区；但对于文件 writer，这不等于数据已经稳定落到物理磁盘，更不等于断电后必然可恢复。是否刷新、同步或关闭，由具体实现及函数契约决定。

因此，`Write` 的最小语义是“接受多少字节”，不是“永久保存成功”。调用方应以 `n == len(p)` 和 `err == nil` 判断本次逻辑写入完整，再根据资源类型处理后续的刷新、关闭或持久化责任。

### 用小接口复制本地历史

### 用小接口复制本地历史

本地历史可以看作一串字节；`Read` 和 `Write` 每次只处理其中一部分。下面的函数只依赖第 01.06 节的能力接口：可读者提供 `Read`，可写者提供 `Write`，不假定它们来自文件、网络或内存。

```go
func copyHistory(reader io.Reader, writer io.Writer) error {
	buf := make([]byte, 32)

	for {
		n, readErr := reader.Read(buf)
		if n > 0 {
			written := 0
			for written < n {
				m, writeErr := writer.Write(buf[written:n])
				written += m

				if writeErr != nil {
					return writeErr
				}
				if m == 0 {
					return io.ErrShortWrite
				}
			}
		}

		if readErr == io.EOF {
			return nil // 正常读完
		}
		if readErr != nil {
			return readErr
		}
		// n == 0 && readErr == nil 不是 EOF；继续等待下一次读取。
	}
}
```

可用纯内存对象观察结果：

```go
source := strings.NewReader("第一条\n第二条\n")
var target strings.Builder

if err := copyHistory(source, &target); err != nil {
	panic(err)
}
fmt.Print(target.String())
```

关键顺序是：`Read` 即使同时返回 `n > 0` 和非空错误，`buf[:n]` 中的字节仍然有效，必须先写出，再处理错误。`io.EOF` 表示正常输入结束；若结构化记录在预期位置中途结束，调用方可返回 `io.ErrUnexpectedEOF` 等更准确的错误，而不能笼统称为“网络失败”。

写入时，`m < 剩余字节数` 是短写；若没有伴随错误，仍不能默默丢弃未写部分，因此循环补写，`m == 0` 则以 `io.ErrShortWrite` 终止。一次 `Write` 成功只表示写入方接受了字节，不等于已经稳定落盘。

这里没有调用 `Close`：`io.Reader`、`io.Writer` 本身不承诺可关闭，内存对象也无需关闭。若函数自行打开文件，它通常负责关闭；若资源由调用者传入，是否关闭必须由函数契约明确约定。

> **要点** — I/O 按批次传递字节；读取先消费有效数据再处理错误，关闭责任由资源取得者和函数契约决定。

本节以虚构 IM 的本地历史文件为例，建立“打开后谁负责关闭、失败后如何保留原因”的文件访问边界。

### 先划清本地历史的边界

### 先划清本地历史的边界

`history-c-a.log` 在这里是一个**当前机器上的普通文件**：程序按给定路径读取字节，再把它解释为历史文本。它可以用于演示文件访问、错误传播与关闭责任，但不应被误解为聊天系统真实历史的权威来源。

它尤其**不代表**以下含义：

- 不是服务器保存的历史：服务器可能根本没有这份文件，或保存着不同版本的数据。
- 不是消息协议：文件中的一行文本不等于网络请求、响应、确认或重试语义。
- 不是可靠送达证明：即使消息写进本地文件，也不能证明对方已收到、服务器已持久化，或文件本身已安全落盘。
- 不是多端同步结果：另一台设备、另一个用户或另一次运行，可能看到完全不同的本地内容。

因此，读取它的函数合同应保持克制：给定路径，尝试读取本地文件；成功时返回其内容，失败时返回可诊断的错误。诸如“历史是否完整”“消息是否送达”“内容是否可信”等问题，属于更高层的存储、协议与业务设计，不能由一次 `os.Open` 推断出来。

这种边界也帮助解释错误：`不存在` 通常只说明当前工作目录下找不到该路径；`权限不足` 只说明本机访问受限。它们不是服务器故障，更不是通信失败。

### 打开文件：成功值与失败原因

### 打开文件：成功值与失败原因

`os.Open(name)` 的签名是：

`func Open(name string) (*os.File, error)`

它把一次“尝试打开本机路径”的结果拆成两部分：成功值 `*os.File` 与失败原因 `error`。这并不表示文件来自服务器，也不涉及消息协议、同步或可靠交付；`history-c-a.log` 在这里仅是当前机器上的普通文件。

最基本的判断顺序是先检查 `err`：

```go
f, err := os.Open("history-c-a.log")
if err != nil {
    return err
}
defer f.Close()
```

当 `err == nil` 时，`f` 才是可使用的已打开文件。它实现了 `io.Reader`，因此可被读取；也实现了 `io.Closer`，因此随后必须关闭以释放文件描述符等本地资源。

反过来，若打开失败，就不应继续把 `f` 当作有效文件使用。失败可能是路径不存在、目标其实是目录、权限不足，或运行环境的工作目录与预期不同。尤其是相对路径 `"history-c-a.log"` 并不天然指向源码目录，而是由进程启动时的工作目录解释。

因此，`(*os.File, error)` 的核心约定是：成功时使用文件值，失败时优先处理错误原因。不要为了“试试看”而忽略 `err`，更不要假定某个相对路径在所有启动方式下都有效。

### 读取与关闭：最小完整实现

### 读取与关闭：最小完整实现

把 `history-c-a.log` 当作一个普通的本机文件：它不代表服务器历史，不涉及消息协议，更不保证可靠交付。这里的目标只是安全地读取给定路径中的小型文本内容。

```go
func loadLocalHistory(path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", fmt.Errorf("打开本地历史文件失败: %w", err)
	}
	defer f.Close()

	data, err := io.ReadAll(f)
	if err != nil {
		return "", fmt.Errorf("读取本地历史文件失败: %w", err)
	}
	return string(data), nil
}
```

`os.Open` 的签名是：

`os.Open(name) (*os.File, error)`

成功时返回可用的 `*os.File`；失败时应检查 `err`，此时不能使用文件对象。`*os.File` 既实现了读取所需的 `io.Reader`，也实现了关闭所需的 `io.Closer`，因此可以直接交给 `io.ReadAll`，并在打开成功后立刻登记：

```go
defer f.Close()
```

这体现“谁创建，谁关闭”：`loadLocalHistory` 打开文件，也在函数退出时关闭它。`defer` 放在错误检查之后，保证只有获得有效文件时才关闭；无论后续读取成功、读取失败还是将来新增提前返回，关闭动作都不会遗漏。

错误包装中的 `%w` 保留了底层原因。调用方仍可用 `errors.Is(err, fs.ErrNotExist)` 判断文件不存在，或用 `errors.As` 检查更具体的系统错误；同时，`打开本地历史文件失败`、`读取本地历史文件失败` 说明失败发生在哪一步。

`io.ReadAll` 会把全部内容读入内存，仅适合本例这种明确很小的教学输入。真实历史文件可能很大，应增加大小限制，或改用流式读取与逐行处理。对于面向不可信用户的错误展示，也应避免直接暴露不必要的内部绝对路径。

### 关闭错误与函数合同

### 关闭错误与函数合同

`defer f.Close()` 常被写成“一行收尾”，但 `Close` 也可能失败：例如写入缓冲区在关闭时才真正落盘，或底层文件系统返回错误。对只读本地历史文件而言，关闭错误通常较少见，却仍应由函数合同明确说明如何处理。

匿名返回值的写法最直接，但通常只能忽略关闭错误：

`func load(path string) (string, error) { f, err := os.Open(path); if err != nil { return "", fmt.Errorf("打开历史文件: %w", err) }; defer f.Close(); b, err := io.ReadAll(f); if err != nil { return "", fmt.Errorf("读取历史文件: %w", err) }; return string(b), nil }`

这里 `defer f.Close()` 保证资源释放；但若读取成功、关闭失败，调用者仍得到成功结果。若合同要求“关闭失败也必须报告”，可使用具名返回值，让延迟函数在主操作成功时写入关闭错误：

`func load(path string) (text string, err error) { f, err := os.Open(path); if err != nil { return "", fmt.Errorf("打开历史文件: %w", err) }; defer func() { if closeErr := f.Close(); err == nil && closeErr != nil { err = fmt.Errorf("关闭历史文件: %w", closeErr) } }(); b, err := io.ReadAll(f); if err != nil { return "", fmt.Errorf("读取历史文件: %w", err) }; return string(b), nil }`

关键决策是优先级：

- 主操作成功而 `Close` 失败：返回关闭错误，避免把不完整的资源收尾伪装成成功。
- `ReadAll` 已失败而 `Close` 也失败：保留读取错误；它通常更接近调用失败的直接原因。
- 若业务确实需要同时保留两者，可用 `errors.Join(err, closeErr)`，但调用方须能处理多重原因。

这不是所有函数都必须套用的模板。函数应在文档或接口语义中说明：是否报告关闭错误、错误优先级是什么。尤其是写文件、压缩流或网络连接时，关闭可能承担最终提交责任；而纯读取小文件时，忽略关闭错误也可以是经过说明的简化选择。

### 责任转移与安全的错误边界

### 责任转移与安全的错误边界

`os.Open` 成功后返回的 `*os.File` 同时实现了读取器和关闭器。默认规则很简单：**谁创建资源，谁负责关闭；谁接收被返回的资源，谁接收关闭责任。**

若函数只在内部读取文件，就应在内部关闭：

```go
func loadLocalHistory(path string) ([]byte, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("打开本地历史失败: %w", err)
	}
	defer f.Close()

	data, err := io.ReadAll(f)
	if err != nil {
		return nil, fmt.Errorf("读取本地历史失败: %w", err)
	}
	return data, nil
}
```

这里调用者拿到的是数据，不是文件句柄，因此不应也无法关闭文件。反之，若函数返回 `*os.File`，责任必须明确转移：

```go
func openLocalHistory(path string) (*os.File, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("打开本地历史失败: %w", err)
	}
	return f, nil // 调用者负责调用 f.Close()
}
```

此时函数文档应写明“调用者必须关闭返回的文件”。不要在返回前 `defer f.Close()`，否则调用者收到的是已关闭文件；也不要让上下两层都“顺手关闭”，重复关闭会令资源边界难以审计。

相对路径如 `history-c-a.log` 由进程当前工作目录解释，不是由源码所在目录或可执行文件所在目录自动解释。排查“找不到文件”时，应先确认工作目录，再区分错误类型：

```go
if errors.Is(err, fs.ErrNotExist) {
	// 文件不存在
}
var pathErr *fs.PathError
if errors.As(err, &pathErr) {
	// 可检查 pathErr.Op、pathErr.Err
}
```

包装错误时保留 `%w`，让上层仍可用 `errors.Is/As` 判断不存在、权限不足等原因。但面向不可信用户的响应不应原样暴露完整内部路径、目录结构或操作细节；日志可保留诊断信息，对外则返回经过裁剪的错误说明。

> **要点** — 文件打开成功即产生关闭责任；错误要保留操作上下文，资源责任转移必须由函数合同明确说明。

错误处理的重点不只是返回失败，更要保留错误身份、补充诊断线索，并让调用方能作出正确业务决定。

### 建立本地历史的错误分类表

### 建立本地历史的错误分类表

本地历史操作应先定义“失败属于什么”，再决定调用方如何响应。建议至少区分四类：

| 类别 | 代表错误 | 对调用方的含义 |
|---|---|---|
| 可预期业务规则 | `ErrInvalidMessage`、`ErrDuplicateMessage` | 输入不合法或违反去重规则，应拒绝本次操作 |
| 查询缺失 | `ErrMessageNotFound` | 指定消息不存在；查询历史为空时可展示首次使用状态 |
| 环境错误 | 文件不存在、权限不足、磁盘故障 | 本地资源不可用，应保留原因并上报 |
| 程序缺陷 | 空指针、违反内部不变量 | 不应伪装成正常业务失败，应尽快暴露和修复 |

同一个外层操作返回错误，并不自动表示状态完全未变。例如未来操作可能先写入内存、再保存文件，保存失败时内存已更新。本章的小函数采用“先校验、后写入”的本地内存规则，尽量避免无效消息进入历史；跨资源原子性、持久化失败后的重试与补偿，留给后续事务和可靠性机制处理。

调用方应使用 `errors.Is` 判断稳定的错误身份：

```go
switch {
case errors.Is(err, ErrMessageNotFound):
    // 显示空历史或“首次使用”
case errors.Is(err, ErrDuplicateMessage):
    // 拒绝重复提交
case err != nil:
    // 交给更上层处理，不能吞掉后返回空历史
}
```

若需要诊断环境问题，可用 `errors.As` 提取类型字段，例如从 `*fs.PathError` 读取操作和路径；但必须先检查匹配是否成功。类型细节适合日志与排障，不应成为脆弱的业务协议。

| 调用边界 | 主要责任 |
|---|---|
| 函数内部 | 返回保留身份的错误，不静默忽略 |
| 命令入口 | 将业务错误转为用户提示，将环境错误报告给用户 |
| 未来 HTTP 边界 | 映射为合适响应状态，并记录诊断与指标 |

### 错误身份决定业务分支

### 错误身份决定业务分支

错误值的文字会因包装、路径、运行环境而变化，因此业务代码不能依赖：

`if err.Error() == "message not found" { ... }`

应先为稳定的业务规则定义哨兵错误，例如：

```go
var (
	ErrInvalidMessage   = errors.New("无效消息")
	ErrDuplicateMessage = errors.New("重复消息")
	ErrMessageNotFound  = errors.New("消息不存在")
)
```

底层函数可以补充上下文，但必须用 `%w` 保留错误身份：

```go
return fmt.Errorf("写入本地历史失败: %w", ErrDuplicateMessage)
```

调用方再用 `errors.Is` 决定分支：

```go
switch {
case errors.Is(err, ErrMessageNotFound):
	// 历史尚不存在：展示首次使用时的空状态
case errors.Is(err, ErrDuplicateMessage):
	// 拒绝重复提交，提示用户消息已存在
case errors.Is(err, ErrInvalidMessage):
	// 提示输入不符合本地规则
case errors.Is(err, fs.ErrNotExist):
	// 所需目录或文件缺失：属于环境问题
default:
	// 保留错误并交给更高层报告
}
```

`ErrMessageNotFound` 表示“查询结果为空”，而 `fs.ErrNotExist` 表示“依赖的文件系统对象不存在”；两者不能混为一谈。前者通常可被界面解释为正常空历史，后者可能意味着目录未初始化、路径配置错误或文件被删除。

外层操作返回错误，也不自动表示状态完全未变。例如未来一次操作可能先成功写入内存、再在落盘时失败。本章的小函数采用“先校验、后写入”的本地内存规则，尽量避免无效输入造成部分修改；但跨文件、跨进程资源的一致性、回滚与重试，需要由后续事务和可靠性机制处理。

核心原则是：按错误身份选择业务动作，按错误文本辅助人类阅读。不要因为读取失败就一律返回空历史，否则重复消息、损坏文件和权限问题都会被伪装成“第一次使用”。

### 外层失败不等于状态未变

### 外层失败不等于状态未变

一次“发送消息”之类的外层操作返回错误，并不能自动推出“什么都没发生”。它可能已经完成前半段工作：消息写入内存后，后续通知失败；文件创建成功后，写入内容失败；多个资源中第一个更新成功，第二个更新失败。错误只说明操作**没有按承诺完整成功**，不说明所有状态都自动回滚。

本章的本地历史函数刻意缩小保证范围：对单个内存历史，先检查输入和业务规则，再写入状态。

```go
if err := validateMessage(msg); err != nil {
    return err
}
if exists(history, msg.ID) {
    return ErrDuplicateMessage
}
history = append(history, msg)
return nil
```

因此：

- 返回 `ErrInvalidMessage` 或 `ErrDuplicateMessage` 时，当前函数尚未写入，内存历史不变。
- 返回 `nil` 时，消息已加入本地历史。
- 若未来函数在写入后还要调用文件、网络或其他资源，即使最终返回错误，也必须假设部分状态可能已改变，并明确记录、补偿或交由更高层处理。

这里的“先校验后写入”只保障**当前进程中的单个内存对象**；它不是跨文件、数据库、网络请求的原子事务，也不解决崩溃恢复、重复执行与重试问题。这些问题需要后续的事务与可靠性机制处理。调用方不能把“收到错误”简单翻译为“可以放心原样重试”，而应先判断错误发生在什么阶段，以及哪些状态可能已经生效。

### 用 errors.As 提取诊断细节

### 用 `errors.As` 提取诊断细节

`errors.Is` 用于判断“是不是某类已知错误”；`errors.As` 用于取得错误链中某个具体类型携带的附加信息。文件访问失败时，底层错误常被包装为 `*fs.PathError`，其中包含操作和路径：

```go
var pathErr *fs.PathError
if errors.As(err, &pathErr) {
    fmt.Printf("文件操作失败：操作=%s，路径=%s\n", pathErr.Op, pathErr.Path)
}
```

这里必须先以 `errors.As` 的返回值确认断言成功。不能直接读取 `pathErr.Op`：错误链中未必存在 `*fs.PathError`，此时 `pathErr` 仍可能为 `nil`。

这些字段适合用于诊断：命令入口可提示“无法读取历史文件”，并附带路径；未来日志可记录 `Op`、`Path` 和原始错误；指标可按“读取失败”“写入失败”聚合。它们回答的是“哪里、做什么操作时失败”，而非业务规则本身。

不要把 `PathError.Path` 或底层错误文本当作业务协议。例如，不能通过字符串包含“no such file”来判定首次使用，也不应规定“某路径失败就返回空历史”。首次使用应由稳定的错误身份或明确的文件存在性检查决定；重复消息、消息缺失等业务分支仍应依赖 `errors.Is` 判断 `ErrDuplicateMessage`、`ErrMessageNotFound`。

底层类型会随操作系统、文件系统和实现变化。`errors.As` 提取的细节应增强诊断，而不应成为脆弱的业务决策依据。

### 在调用边界分配处理责任

### 在调用边界分配处理责任

同一错误在不同边界需要不同处理：底层负责保留身份并补充事实，上层负责决定用户体验与运行治理。不要让存储函数既打印提示、又记指标、又猜测是否重试。

| 边界 | 主要责任 | 不应承担的责任 |
|---|---|---|
| 函数内部 | 校验规则；返回 `ErrInvalidMessage`、`ErrDuplicateMessage`、`ErrMessageNotFound`；对底层失败用 `%w` 包装操作语境 | 输出用户文案、吞错后伪造空历史、直接退出程序 |
| 命令入口 | 用 `errors.Is` 选择可预期分支：缺失历史显示首次使用的空状态，重复消息明确拒绝；其余错误报告给上层或终端 | 依赖字符串匹配错误；把所有失败都当作“没有历史” |
| 未来 HTTP 边界 | 将业务错误映射为合适响应；记录请求、用户、状态码等上下文；在此处累计失败指标 | 把 `*fs.PathError` 等底层类型直接暴露为稳定接口协议 |

例如内部可返回：

`return fmt.Errorf("读取本地历史: %w", err)`

这样命令入口仍可用 `errors.Is(err, fs.ErrNotExist)` 区分环境缺失。若诊断需要路径和操作，可用 `errors.As(err, &pathErr)` 读取 `*fs.PathError` 的 `Op`、`Path`，但必须先检查匹配是否成功；这些字段适合日志和排障，不应成为业务分支的脆弱依据。

日志、用户提示、指标记录也不应混为一谈：日志需要具体路径与调用动作，用户提示需要可理解的下一步，指标只关心可聚合的错误类别。当前本地程序只建立返回与分支责任；跨资源原子性、重试策略以及 HTTP 映射留给后续章节。

> **要点** — 保留错误身份、按边界补充上下文；业务分支依赖 errors.Is，诊断细节可用 errors.As，切勿吞掉未知错误。

本节划清可预期失败与程序缺陷的边界：用 error 保留可处理原因，用 panic 表示不应被业务流程吞没的异常状态。

### 两类失败：error 与 panic 的职责边界

### 两类失败：error 与 panic 的职责边界

`error` 用于调用者能够预期、理解并决定后续动作的失败。它是正常控制流的一部分：函数返回结果与失败原因，调用者可以提示用户、重试、选择其他输入或终止当前操作。

对本地 IM 的历史数据而言，以下通常应返回 `error`：

- 键为空、格式不合法；
- 要写入的消息或会话已存在；
- 历史文件不存在；
- 文件无法打开、读取、解析或写入；
- 数据内容损坏，但调用者可选择重建、跳过或报告。

例如：

`msg, err := store.Load(key)`

这里 `err != nil` 不表示程序必然失控，而表示此次读取未完成；调用者必须检查它，不能把零值结果误当成有效消息。

`panic` 则表示程序进入了不应由业务流程承担的异常状态。典型情形是内部不变量被破坏：代码已确认索引有效却仍越界、内部映射本应已初始化却为 `nil`、维护的消息数量与实际容器状态矛盾。此时优先任务是修复缺陷、补足测试和不变量检查，而不是用恢复机制掩盖问题。

可用一个判断问题区分两者：

> 调用者是否能根据失败原因采取合理、预先设计好的动作？

能，则返回 `error`；不能，且说明代码自身的假设已失效，才可能触发 `panic`。不要把空键、重复记录或文件读取失败写成 `panic`，也不要把 `nil` 指针、并发写映射等运行时崩溃包装成“可安全继续的业务分支”。

### 本地历史操作中的 error 分类

### 本地历史操作中的 error 分类

本地消息历史的失败多数是**预期可处理的操作结果**，应通过 `error` 返回，而不是触发 `panic`。调用方据此决定提示用户、跳过记录、创建新历史，或终止本次操作。

可先按原因分类，而非只返回笼统的“失败”：

- **空键**：会话 ID、用户 ID 或历史文件名为空，无法定位存储目标。属于输入或调用参数错误。
- **重复**：写入的消息 ID 已存在，或同一会话的初始化被重复执行。调用方可选择拒绝、幂等返回，或显式覆盖。
- **文件不存在**：读取某会话历史时目标文件尚未创建。这通常不是“读取损坏”；应用可以返回专门错误，并决定展示空历史或执行初始化。
- **读取失败**：文件存在但打开、读取或解析失败，例如权限不足、磁盘 I/O 错误、内容格式损坏。应保留底层原因，避免把所有情况误报为“不存在”。

```go
var ErrEmptyKey = errors.New("历史键为空")
var ErrDuplicate = errors.New("消息已存在")
var ErrHistoryNotFound = errors.New("历史不存在")
```

例如，`LoadHistory(key)` 可对空键返回 `ErrEmptyKey`；若 `os.Open` 得到“不存在”，包装为 `ErrHistoryNotFound`；其他系统错误则保留原错误链：

`fmt.Errorf("读取历史 %q: %w", key, err)`

调用方可用 `errors.Is(err, ErrHistoryNotFound)` 区分“可创建”的空历史与真正的读取故障。

相反，若历史索引声称某消息存在，却找不到其内部对象；或写入后内存索引与持久化状态违反自身不变量，这更接近代码缺陷。此类问题应定位并修复状态维护逻辑，而不是用 `panic`、`recover` 或模糊的业务错误掩盖。

### panic 时 defer 的展开与 recover 条件

### panic 时 defer 的展开与 recover 条件

`panic` 不是普通的错误返回：它会立即中断当前位置之后的常规执行，并沿着**当前 goroutine 的同步调用栈**向外展开。展开到每一层函数时，该函数先前登记的 `defer` 会按后进先出顺序执行；若始终没有恢复，最终程序以 panic 终止。

```go
func inner() {
	defer fmt.Println("inner 清理")
	panic("内部不变量被破坏")
}

func outer() {
	defer fmt.Println("outer 清理")
	inner()
	fmt.Println("不会执行")
}
```

调用 `outer()` 时，输出顺序是：

1. `inner 清理`
2. `outer 清理`
3. panic 信息

因此，`defer` 很适合承担已获得资源的关闭责任：即使后续路径发生 panic，已打开的文件、已加锁的互斥量等仍有机会在展开过程中释放。它不是“忽略异常”的机制，而是保证退出路径可执行清理。

`recover` 只有在严格条件下才有效：它必须由**延迟执行的函数**调用，并且调用时同一 goroutine 正在处理 panic。否则 `recover()` 只返回 `nil`，不能拦截任何异常。

```go
func safeBoundary(run func()) (panicked bool) {
	defer func() {
		if v := recover(); v != nil {
			panicked = true
			// 此处可记录 v，并返回受控结果
		}
	}()
	run()
	return false
}
```

这里的边界只能用于隔离不可继续传播的异常，例如顶层入口记录故障后终止当前操作。它不应用于空键、重复记录、文件不存在或读取失败；这些都是可预期的 `error`。更不能把恢复后的未知状态继续当作正常业务状态使用。若本地 IM 的内部索引与消息存储出现不变量矛盾，应修复代码和数据维护逻辑，而不是用 `recover` 掩盖缺陷。

### 最小隔离边界：safeBoundary

### 最小隔离边界：`safeBoundary`

`recover` 的用途不是把异常变成普通成功路径，而是在少数明确的隔离边界中，阻止 `panic` 继续向外展开，并返回受控结果。最小模式如下：

```go
func safeBoundary(fn func()) (panicked bool) {
	defer func() {
		if v := recover(); v != nil {
			// 在真实边界中记录 v、调用栈和上下文。
			panicked = true
		}
	}()

	fn()
	return false
}
```

这里有三个关键点：

- `recover` 必须由 `defer` 调用的函数执行；普通函数中直接调用通常得到 `nil`。
- 它只能恢复**同一 goroutine**正在发生的 `panic`。本节的同步代码可将其理解为：`fn` 及其调用链发生 `panic` 时，栈会逐层执行 `defer`，直到此处停止展开。
- 必须检查 `recover()` 的返回值。不能写成“无条件 `defer recover()`”：没有发生 `panic` 时，`recover()` 返回 `nil`；发生 `panic(nil)` 等边缘情形也不应据此设计业务协议。

调用方只能把结果视为“该操作未能可靠完成”：

```go
if safeBoundary(func() {
	applyLocalHistory()
}) {
	// 记录异常，隔离当前操作，返回失败结果；
	// 不继续假定局部状态仍然完整可用。
}
```

`safeBoundary` 不应用于空键、重复记录、文件不存在、读取失败等预期问题；这些应返回带原因的 `error`。它更不是修复 `nil` 指针、并发写 map、内部不变量被破坏等代码缺陷的手段。即使边界捕获了此类异常，也只能记录和终止当前受控操作，随后修复缺陷，而不能把恢复后的未知状态当作正常业务状态继续使用。

### 恢复不是继续运行的许可

### 恢复不是继续运行的许可

`error`、边界恢复与掩盖缺陷解决的是三类不同问题：

| 情况 | 合适做法 | 含义 |
|---|---|---|
| 空键、重复键、文件不存在、读取失败 | 返回 `error` | 调用者可预期、可选择重试或提示 |
| 插件式入口、任务执行边界 | 有限地 `recover` | 记录异常、隔离本次操作、返回受控结果 |
| `nil` 指针、内部索引越界、模型不变量被破坏 | 修复代码与测试 | 这是缺陷，不应伪装成业务失败 |

最小边界可以明确报告是否发生了异常：

```go
func safeBoundary(fn func()) (panicked bool) {
	defer func() {
		if r := recover(); r != nil {
			panicked = true
			// 在此记录 r 和必要上下文；不要继续使用可疑状态。
		}
	}()
	fn()
	return false
}
```

这里的 `recover` 只在同一 goroutine 正在 `panic` 展开、且由 `defer` 调用时才有效。恢复后，当前调用链停止展开，但不意味着被破坏的对象、部分写入的文件或本地 IM 索引仍然可信。

例如，若“消息 ID 必须唯一”这一内部不变量被代码错误地破坏，不能捕获 panic 后改为“重复消息”并继续运行；应定位产生矛盾状态的代码。尤其不要把 `nil` 指针、运行时 panic 或并发 map 写入设计成可恢复的业务流程。

边界恢复的目标是**记录、隔离、返回受控结果**，不是获得“带病继续运行”的许可。

> **要点** — error 用于可预期失败；panic 只在隔离边界受控捕获，恢复后优先记录、隔离并修复根因。

通过一段可独立阅读的本地历史程序，追踪错误从发生、包装到判断的路径，并明确文件资源由谁关闭、何时关闭。

### 完整程序与责任边界

### 完整程序与责任边界

以下程序只处理本地内存与字节流；`main` 用 `if false` 展示预期分支，实际不执行：

`package main`  
`import ("errors"; "fmt"; "io"; "os")`  
`type MessageKey string`  
`type Message struct { Key MessageKey; Body string }`  
`var ( ErrInvalidMessage=errors.New("无效消息"); ErrDuplicateMessage=errors.New("重复消息"); ErrMessageNotFound=errors.New("消息不存在") )`  
`type MemoryStore struct { messages map[MessageKey]Message }`  
`func (s *MemoryStore) Put(m Message) error {`  
` if m.Key=="" { return ErrInvalidMessage }`  
` if s.messages==nil { s.messages=make(map[MessageKey]Message) }`  
` if _,ok:=s.messages[m.Key]; ok { return ErrDuplicateMessage }`  
` s.messages[m.Key]=m; return nil`  
`}`  
`func (s *MemoryStore) Find(k MessageKey) (Message,error) {`  
` m,ok:=s.messages[k]; if !ok { return Message{},ErrMessageNotFound }; return m,nil`  
`}`  
`func loadLocalHistory(path string) ([]byte,error) {`  
` f,err:=os.Open(path); if err!=nil { return nil,fmt.Errorf("打开本地历史 %q: %w",path,err) }`  
` defer f.Close()`  
` b,err:=io.ReadAll(f); if err!=nil { return nil,fmt.Errorf("读取本地历史 %q: %w",path,err) }`  
` return b,nil`  
`}`  
`func main() {`  
` if false {`  
`  s:=MemoryStore{}; _=s.Put(Message{Key:"c-a",Body:"第一次"})`  
`  if err:=s.Put(Message{Key:"c-a",Body:"重复"}); errors.Is(err,ErrDuplicateMessage) { fmt.Println("预期：重复写入") }`  
`  if _,err:=s.Find("missing"); errors.Is(err,ErrMessageNotFound) { fmt.Println("预期：内存缺失") }`  
`  if _,err:=loadLocalHistory("history-c-a.log"); err!=nil { fmt.Println("预期：本地文件不存在") }`  
` }`  
`}`  

`Put` 负责验证与保持状态：重复键在赋值前返回，因此原消息不变。`Find` 负责区分“找到但内容为空”与“根本不存在”。`loadLocalHistory` 取得文件后立即承担关闭责任；若 `os.Open` 失败，尚未获得文件对象，不能调用 `Close`。`defer f.Close()` 在函数返回时执行，读取成功、读取失败都会关闭文件。

### 三种失败的逐层追踪

### 三种失败的逐层追踪

以下追踪假定程序中 `MemoryStore.Put` 用 `ErrDuplicateMessage` 表示键已存在，`Find` 用 `ErrMessageNotFound` 表示缺失；`loadLocalHistory` 用 `os.Open` 打开文件，并以 `fmt.Errorf("读取本地历史 %q: %w", path, err)` 包装失败。

1. **重复本地写入**

   调用 `store.Put(Message{Key: "c-a", ...})` 时，第一次写入成功，内部映射新增 `"c-a"`。第二次以相同键调用时，`Put` 先检查键是否存在，发现重复后直接：

   `return ErrDuplicateMessage`

   因而不会覆盖旧消息，也不会产生部分更新；状态保持为“第一次写入后的内容”。调用者收到非 `nil` 错误，可用：

   `errors.Is(err, ErrDuplicateMessage)`

   判断失败类别。不要依赖 `err.Error()` 的文本比较：字符串适合展示，sentinel 错误的身份才适合分支。

2. **缺失内存消息**

   `store.Find("missing")` 查映射失败后返回：

   `return Message{}, ErrMessageNotFound`

   返回的零值 `Message{}` 不是有效结果，必须结合 `error` 判断。调用者若忽略错误而使用该零值，会把“未找到”误当成“找到一条空消息”。此路径不改变存储状态；`errors.Is(err, ErrMessageNotFound)` 为真。

3. **`history-c-a.log` 不存在**

   `loadLocalHistory("history-c-a.log")` 首先执行 `os.Open`。若文件不存在，`Open` 返回 `nil, err`；此时没有成功取得文件句柄，不能也无需 `Close`。函数立即包装并逐层返回：

   `return nil, fmt.Errorf("打开本地历史 %q: %w", path, err)`

   `main` 可用 `errors.Is(err, os.ErrNotExist)` 判断文件缺失；需要路径、操作名等诊断信息时，可用 `errors.As(err, &pathErr)` 取得 `*os.PathError`。由于打开失败，`defer file.Close()` 尚未登记；只有 `Open` 成功后，关闭责任才转移给当前函数，并在返回时执行。

### 错误链、身份与诊断信息

### 错误链、身份与诊断信息

Go 中 `error` 的首要约定是：`nil` 表示成功，非 `nil` 表示调用者必须处理失败路径。不要根据错误文本判断业务结果；文本面向人，错误身份才面向程序。

```go
var ErrDuplicateMessage = errors.New("重复消息")

if err := store.Put(msg); err != nil {
	if errors.Is(err, ErrDuplicateMessage) {
		// 预期分支：重复写入
	}
}
```

`ErrDuplicateMessage` 是哨兵错误。即使另一个错误也写成 `errors.New("重复消息")`，它仍是不同实例；因此下面的字符串比较既脆弱又无法保留包装关系：

```go
if err.Error() == "重复消息" { /* 不推荐 */ }
```

向上层补充上下文时，应使用 `%w`：

```go
return fmt.Errorf("读取本地历史 %q: %w", path, err)
```

`%w` 建立错误链，`errors.Is` 会沿链查找 `ErrMessageNotFound`、`os.ErrNotExist` 等目标身份。相对地，`%v` 只把错误格式化进文本：

```go
fmt.Errorf("读取本地历史 %q: %v", path, err) // 错误链在此断开
```

打开不存在的 `history-c-a.log` 时，底层通常携带 `*os.PathError`。它既可用 `errors.Is(err, os.ErrNotExist)` 判断“是否不存在”，也可用 `errors.As` 提取诊断细节：

```go
var pe *os.PathError
if errors.As(err, &pe) {
	fmt.Println(pe.Op, pe.Path) // 例如 open history-c-a.log
}
```

这里应只记录或展示诊断，不应依赖完整文本作控制流。错误链回答“失败属于哪类”，`PathError` 回答“哪一步、哪个路径失败”；两者共同让本地历史失败可追踪。

### 文件读取与关闭顺序

### 文件读取与关闭顺序

`os.Open` 成功后，返回的文件句柄由当前函数负责关闭；失败时返回的文件通常为 `nil`，因此绝不能调用 `Close`。

```go
func loadLocalHistory(path string) ([]byte, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("打开本地历史 %q: %w", path, err)
	}
	defer f.Close()

	data, err := io.ReadAll(f)
	if err != nil {
		return nil, fmt.Errorf("读取本地历史 %q: %w", path, err)
	}
	return data, nil
}
```

追踪 `history-c-a.log` 不存在的情景：

1. `os.Open` 返回 `nil, *os.PathError`。
2. 函数立即用 `%w` 返回；尚未建立关闭责任，也不会登记 `defer`。
3. 调用方可用 `errors.Is(err, os.ErrNotExist)` 判断不存在，或用 `errors.As(err, &pathErr)` 取得路径与底层操作信息。

若打开成功，执行到 `defer f.Close()` 时，`f.Close` 的接收者已经确定；`defer` 不是“出错才关闭”，而是在函数返回时执行。多个延迟调用按后进先出顺序运行：

```go
defer first.Close()
defer second.Close() // 返回时先关闭 second，再关闭 first
```

`io.ReadAll` 会持续读取直到正常遇到 `io.EOF`，并将 EOF 视为成功结束；成功时通常返回 `data, nil`，空文件则是长度为零的字节切片与 `nil`。读取失败时，仍应由已登记的 `defer` 关闭文件。这里关闭责任没有转移给 `io.ReadAll`，也没有转移给调用者。

练习：  
- `Open` 返回错误后能否 `Close`？不能：没有可关闭的已打开资源。  
- 将 `%w` 改为 `%v` 有何后果？错误文字仍在，但 `errors.Is` 与 `errors.As` 无法穿透包装层。  
- `ReadAll` 成功后是否还要显式关闭？不需要：`defer` 会在返回时关闭。  

参考：[errors](https://pkg.go.dev/errors)、[io](https://pkg.go.dev/io)、[os](https://pkg.go.dev/os)。未来阅读固定版本 OpenIM 代码时，可继续追问：每个错误如何返回？每个已打开资源最终由谁关闭？

### 分层练习与本地历史边界

### 分层练习与本地历史边界

以下练习以“错误可判断、资源有归属、状态可验证”为目标；`MessageKey`、`Message`、`MemoryStore` 及本地 `history-c-a.log` 均是虚构对象。

1. `Put` 成功应返回什么？  
   **反馈：**返回 `nil`，表示调用者无需进入失败分支。

2. 重复 `Put` 同一 `MessageKey` 应返回什么？  
   **反馈：**返回同一身份的 `ErrDuplicateMessage`，而非临时拼接的字符串。

3. 重复写入后原消息应如何变化？  
   **反馈：**状态保持不变；失败不能部分覆盖既有消息。

4. `Find` 找不到消息应返回什么？  
   **反馈：**消息值可为零值，但错误必须是 `ErrMessageNotFound`。

5. 为什么不能只比较 `err.Error()`？  
   **反馈：**字符串适合展示，不保证身份、包装层次或稳定文本。

6. `errors.Is(err, ErrDuplicateMessage)` 判断什么？  
   **反馈：**判断错误链中是否含该哨兵错误。

7. `fmt.Errorf("读取本地历史: %w", err)` 的作用？  
   **反馈：**增加上下文，同时保留原始错误链。

8. 若改用 `%v` 呢？  
   **反馈：**仅格式化文本，`errors.Is` 无法继续穿透到原错误。

9. `loadLocalHistory` 中每层为何都要 `return err`？  
   **反馈：**错误必须沿调用链显式返回，不能悄悄吞掉。

10. `os.Open` 失败后能否 `defer file.Close()`？  
    **反馈：**不能；没有成功获得文件，就没有关闭责任。

11. `Open` 成功后谁负责关闭？  
    **反馈：**成功接收文件句柄的函数负责；通常立刻 `defer file.Close()`。

12. `defer file.Close()` 何时执行？  
    **反馈：**函数返回时执行，且多个 `defer` 按后进先出顺序执行。

13. `defer f.Close()` 中接收者何时求值？  
    **反馈：**注册 `defer` 时求值，因此应在确认 `f` 有效后注册。

14. `Read` 返回 `n>0, io.EOF` 时应丢弃字节吗？  
    **反馈：**不能；先处理这 `n` 个字节，再处理 EOF。

15. `Read` 返回 `0, nil` 是否等于结束？  
    **反馈：**不等于；调用方不能把它当作 EOF。

16. 写入发生短写应如何处理？  
    **反馈：**写入字节数小于期望值必须视为失败，常对应 `io.ErrShortWrite`。

17. EOF 与 `io.ErrUnexpectedEOF` 有何区别？  
    **反馈：**EOF 表示正常到末尾；后者表示结构化内容尚未完整便结束。

18. `history-c-a.log` 不存在时如何诊断？  
    **反馈：**用 `errors.Is(err, os.ErrNotExist)` 判断类别；必要时用 `errors.As` 取得 `*os.PathError` 查看路径、操作与底层原因。

19. 能否用 `panic/recover` 替代文件读取错误返回？  
    **反馈：**不能；可预期的打开、读取、关闭失败应返回 `error`。`panic` 只留给不可恢复的程序不变量破坏，`recover` 应限于明确边界。

20. 本地文件是否等于服务端历史？  
    **反馈：**不是；它只是本程序读取的一段本地字节流，不能据此推断服务端状态、同步结果或消息真实性。

可查阅官方文档：[errors](https://pkg.go.dev/errors)、[io](https://pkg.go.dev/io)、[os](https://pkg.go.dev/os)、[语言规范](https://go.dev/ref/spec)。未来阅读固定版本 OpenIM 时，应逐项追问：该函数如何返回错误？谁获得并关闭资源？本章不声称已核对其具体实现。下一章才讨论文件格式、JSON 与时间；本章只处理字节流、错误链和资源生命周期。

> **要点** — 错误应保留可判断的原因链；成功取得文件的一方必须明确并完成关闭责任。
