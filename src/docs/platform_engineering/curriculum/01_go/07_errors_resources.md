---
title: 01.07 错误与资源生命周期：让本地历史的失败原因与关闭责任可追踪
icon: /assets/icons/article.svg
order: 8
date: 2026-09-23
---

[返回第一卷](./README.md) · [上一章：方法与接口](./06_methods_interfaces.md)

# 01.07 错误与资源生命周期：让本地历史的失败原因与关闭责任可追踪

> DeepTutor 原稿经技术和教学审阅后的章节。所有程序、输出和路径都是静态推导，尚未执行 Go 程序、测试或站点构建。

## 本章从哪里开始

01.06 的 `MemoryStore.Put` 可以用 `(bool, string)` 告诉调用者“写入是否成功”。这个办法只适合很小的模型：一旦要区分消息身份为空、消息重复、存储对象不存在和文件读取失败，`false` 不再说明原因，字符串又不应成为程序分支的依据。

同一时期还会出现另一个问题：从本机打开会话历史文件后，哪一层负责关闭它？如果函数有许多提前 `return`，在每个分支手写 `Close` 很容易遗漏。错误模型和资源生命周期因此必须一起学习：前者让失败原因可交还，后者让任何退出路径都能追踪清理责任。

本章只讨论顺序执行的本地内存和本机文件模型。它不建立网络连接、身份认证、真实持久化承诺、并发安全、服务端受理、设备接收或已读状态。`history-c-a.log` 只是一个教学文件名，不是线上 IM 的历史协议。

| 阅读层次 | 本次新增 | 学完后应能解释 |
|---|---|---|
| 第一遍 | `error`、哨兵错误、`if err != nil` | 为什么错误文字不能决定业务分支 |
| 第一遍 | `defer`、`Close`、所有权 | 打开文件后谁在何时关闭它 |
| 第一遍 | `io.Reader`、`io.Writer`、`io.EOF` | 为什么一次 `Read` 不等于读完全部内容 |
| 第二遍 | `%w`、`errors.Is`、`errors.As` | 上下文怎样保留原因，何时会暴露底层契约 |
| 第二遍 | `panic`、`recover` | 哪些事应返回 `error`，哪些是代码缺陷 |

先修是 01.01–01.06：函数、多返回值、切片、map、结构体、指针、方法与接口。JSON、时间、包组织、并发和网络分别留到后面的章节。

## 一、`error` 让失败原因成为结果的一部分

### 1.1 从“失败了”走到“为什么失败”

考虑上一章的局部设计：

```go
func (s *MemoryStore) Put(message Message) (bool, string)
```

调用者能显示第二个结果，却很难可靠判断下一步。例如 `false, "消息已经存在"` 和 `false, "消息身份不完整"` 都是失败，但前者也许应停止重复写入，后者应要求上游修正输入。若代码写成 `if reason == "消息已经存在"`，改一句文案、换一种语言或增加路径信息都会改变程序行为。

Go 用预声明的接口类型 `error` 表示可预期失败。成功时返回 `nil`；失败时返回非 `nil` 的错误值。多结果函数通常把 `error` 放在最后：

```go
func (s *MemoryStore) Put(message Message) error
func (s *MemoryStore) Find(key MessageKey) (Message, error)
```

这不是把所有失败自动处理掉。`error` 只是把“发生了什么”交给调用者；调用者仍必须决定提示、停止、转换、重试，还是继续向上返回。

### 1.2 先建立稳定的本地错误身份

`errors.New` 从文字创建错误值。若程序需要让调用者识别一种稳定原因，应在包级只创建一次，再反复返回同一个值。这类值常称为**哨兵错误**（sentinel error）：它是一个可识别的信号，不是一段必须逐字比较的文案。

```go
package main

import "errors"

var (
	ErrStoreUnavailable = errors.New("本地消息存储不可用")
	ErrInvalidMessage   = errors.New("消息身份或正文不完整")
	ErrDuplicateMessage = errors.New("消息在当前会话中已存在")
	ErrMessageNotFound  = errors.New("本地消息不存在")
)
```

每次写 `errors.New("本地消息不存在")` 都会得到一个新的错误值，即使文本相同。因此下面不是稳定判断：

```go
// 错误示意：两个调用得到的不是同一个错误值。
errA := errors.New("本地消息不存在")
errB := errors.New("本地消息不存在")
_ = errA == errB // 不应期待为 true
```

稳定身份和可读文字各自有责任：`ErrDuplicateMessage` 供程序判断，“消息在当前会话中已存在”供人阅读。不要写 `err.Error() == "消息在当前会话中已存在"` 来决定业务逻辑。

### 1.3 把 01.06 的内存存储升级为错误返回

以下程序只保存当前进程内的一小组消息。`MessageKey` 由会话 ID 和消息 ID 组成，因此 `c-a/m-a` 与 `c-b/m-a` 是不同身份。它没有进行网络请求，也没有创建文件。

```go
package main

import (
	"errors"
	"fmt"
)

var (
	ErrStoreUnavailable = errors.New("本地消息存储不可用")
	ErrInvalidMessage   = errors.New("消息身份或正文不完整")
	ErrDuplicateMessage = errors.New("消息在当前会话中已存在")
	ErrMessageNotFound  = errors.New("本地消息不存在")
)

type MessageKey struct {
	ConversationID string
	MessageID      string
}

type Message struct {
	Key      MessageKey
	SenderID string
	Body     string
}

type MemoryStore struct {
	messages map[MessageKey]Message
}

func NewMemoryStore() *MemoryStore {
	return &MemoryStore{messages: make(map[MessageKey]Message)}
}

func (s *MemoryStore) Put(message Message) error {
	if s == nil {
		return ErrStoreUnavailable
	}
	if message.Key.ConversationID == "" || message.Key.MessageID == "" || message.Body == "" {
		return ErrInvalidMessage
	}
	if s.messages == nil {
		s.messages = make(map[MessageKey]Message)
	}
	if _, exists := s.messages[message.Key]; exists {
		return ErrDuplicateMessage
	}
	s.messages[message.Key] = message
	return nil
}

func (s *MemoryStore) Find(key MessageKey) (Message, error) {
	if s == nil {
		return Message{}, ErrStoreUnavailable
	}
	message, exists := s.messages[key]
	if !exists {
		return Message{}, ErrMessageNotFound
	}
	return message, nil
}

func main() {
	store := NewMemoryStore()
	message := Message{
		Key:      MessageKey{ConversationID: "c-a", MessageID: "m-a"},
		SenderID: "u-a",
		Body:     "你好",
	}

	if err := store.Put(message); err != nil {
		fmt.Println("首次写入失败：", err)
		return
	}
	if err := store.Put(message); errors.Is(err, ErrDuplicateMessage) {
		fmt.Println("预期：拒绝同一会话中的重复消息")
		return
	}
}
```

第二次 `Put` 返回的是 `ErrDuplicateMessage`，没有覆盖第一次写入的 `m-a`。这是一条本章明确约定的**本地 map 规则**。它不能推出跨进程、跨设备或服务端能够去重；那些问题需要以后定义持久身份、请求重试和确认点。

`errors.Is(err, ErrDuplicateMessage)` 在这里与直接 `err == ErrDuplicateMessage` 都能工作。优先建立 `errors.Is` 的习惯，是为了下一节加入错误包装后仍能使用同一种判断方式。

### 1.4 立即检查，而不是让零值伪装成结果

错误最容易在刚返回的地方被正确解释：

```go
message, err := store.Find(MessageKey{ConversationID: "c-a", MessageID: "m-x"})
if err != nil {
	if errors.Is(err, ErrMessageNotFound) {
		fmt.Println("本地历史中没有 m-x")
		return
	}
	fmt.Println("查询本地历史失败：", err)
	return
}
fmt.Println(message.Body)
```

下面这种写法会丢失失败原因，并把 `Message{}` 当成普通结果：

```go
// 错误示意：不要为了少写一行而丢弃 err。
message, _ := store.Find(MessageKey{ConversationID: "c-a", MessageID: "m-x"})
fmt.Println(message.Body)
```

`message.Body == ""` 并不能说明是“消息正文为空”“消息缺失”还是“存储对象不可用”。错误值让这三种情况保持不同的身份。

## 二、错误向上交还：上下文、包装与处理边界

### 2.1 谁发现，谁决定，谁处理

底层函数通常最了解哪一步失败，却不一定知道业务后果。读取文件的函数知道“打开失败”，但未必知道文件不存在代表首次使用、错误路径，还是需要停止启动。一个实用的分层方式是：

| 层 | 它知道什么 | 它通常做什么 |
|---|---|---|
| `MemoryStore` | 键、map 与本地规则 | 返回领域错误，不决定页面或命令提示 |
| `loadLocalHistory` | 路径、打开与读取动作 | 补充“哪一个会话、哪一步”上下文 |
| 入口函数 | 当前操作目的 | 选择首次初始化、向用户报告，或停止本次操作 |

原则不是“所有错误都在底层吞掉”，而是：**发现但不知道下一步时返回；知道业务下一步时处理；仍不能决定时带着上下文继续返回。**

### 2.2 `%w` 同时保留文字与原因

`fmt.Errorf` 可创建带格式的错误。格式中的 `%v` 只把旧错误显示成文字；`%w` 会把旧错误包装为可遍历的原因。两者打印出来可能相似，给上层的能力却不同：

```go
// 只有文字；后续无法从返回值中稳定找到 fs.ErrNotExist。
return fmt.Errorf("读取本地历史失败：%v", err)

// 有文字，也保留原因链。
return fmt.Errorf("读取会话 %q 的本地历史失败：%w", conversationID, err)
```

包装后的错误像一条从外层动作回到原始原因的链。调用者可读到“读取会话 c-a 的本地历史失败”，也可继续询问底层是否为“文件不存在”。

```go
if errors.Is(err, fs.ErrNotExist) {
	// 这是一个业务决定：本例可把它解释成“首次没有本地历史”。
}
```

是否使用 `%w` 也是 API 契约。一旦函数把文件系统错误包装并交给上层，调用者可能开始依赖 `fs.ErrNotExist`。如果未来希望更换实现且不暴露底层细节，应转换为本领域定义的稳定错误，并在文档中说明。

### 2.3 `Is` 问原因，`As` 取类型细节

`errors.Is(err, target)` 回答“这条错误链中是否有这个原因”。它适合哨兵错误和标准库明确提供的错误，例如 `fs.ErrNotExist`。下面的 `fs` 指标准库 `io/fs` 包；独立程序要显式 `import "io/fs"`。

`errors.As(err, &target)` 回答“链中能否找到这种具体错误类型，并把它放进变量”。打开文件失败通常会带 `*fs.PathError`，其中有操作、路径和底层原因：

```go
var pathErr *fs.PathError
if errors.As(err, &pathErr) {
	fmt.Printf("操作=%s 路径=%s 原因=%v\n", pathErr.Op, pathErr.Path, pathErr.Err)
}
```

这里 `pathErr` 的类型已经是 `*fs.PathError`；`errors.As` 需要能够给这个变量赋值的位置，所以传入 `&pathErr`，它的类型是 `**fs.PathError`。只有 `As` 返回 `true` 后，才读取 `pathErr` 的字段。

| 需求 | 使用 | 不要做的事 |
|---|---|---|
| 判断消息是否重复 | `errors.Is(err, ErrDuplicateMessage)` | 比较 `err.Error()` 的文字 |
| 判断历史文件是否不存在 | `errors.Is(err, fs.ErrNotExist)` | 把所有打开失败都解释成首次使用 |
| 诊断失败的操作和路径 | `errors.As(err, &pathErr)` | 把 `PathError` 字段当成长期业务协议 |

本章没有接入日志、指标或 HTTP 响应。以后这些边界会选择不同的展示形式：给操作者的诊断、给用户的提示和给程序的错误身份不必是同一句话。

## 三、`defer`：在取得资源后登记退出动作

### 3.1 资源和关闭责任

文件打开成功后，系统与运行时都为它保留了可读写的资源。此后如果函数从任何一个分支返回，都应该结束使用。最直观的规则是：**谁成功取得资源，谁就负责关闭；若交给调用者继续使用，关闭责任也要明确转移。**

```go
f, err := os.Open(path)
if err != nil {
	return "", fmt.Errorf("打开本地历史失败：%w", err)
}
defer f.Close()
```

顺序不能倒过来。`os.Open` 失败时没有可正常使用的文件，不能对它安排 `Close`。打开成功后立即 `defer`，后面即使新增“内容为空”“读取失败”等提前返回，关闭动作也不会漏掉。

### 3.2 `defer` 何时求值，何时执行

`defer call(...)` 执行时，会立刻求出被调用函数和参数；真正调用会在**外围函数**返回、走到函数末尾或因 panic 展开时发生。多个延后调用按后进先出顺序执行。

```go
func deferredValues() {
	for i := 0; i < 3; i++ {
		defer fmt.Println("延后：", i)
		fmt.Println("循环内：", i)
	}
}
```

静态推导顺序是：先输出三行“循环内：0、1、2”；函数即将退出时，再输出“延后：2、1、0”。登记时保存的是三次已经求值的调用 `Println(..., 0)`、`Println(..., 1)`、`Println(..., 2)`，并不是等退出时再读取变量 `i`。

`defer f.Close()` 也一样：登记时确定的是这一个 `f`，`Close` 却不是当前行立刻发生。它不是后台任务，不能替代 `Open`、`Read`、`Write` 各自的错误检查。

### 3.3 不要在长循环里无限登记关闭

若把 `defer f.Close()` 放在一个很长的外围函数循环中，这些文件会等到外围函数结束才依次关闭。应把每轮动作放进一个小函数，让 `defer` 的外围范围正好是一轮：

```go
func processOneHistory(path string) error {
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer f.Close()

	_, err = io.ReadAll(f)
	return err
}

func processMany(paths []string) error {
	for _, path := range paths {
		if err := processOneHistory(path); err != nil {
			return err
		}
	}
	return nil
}
```

每次 `processOneHistory` 返回时，自己的文件都会关闭，再进入下一轮。这个例子仍是顺序模型；它没有说明大量文件、并发任务或网络连接应怎样管理。

### 3.4 `Close` 的错误也要有合同

`defer f.Close()` 很适合确保只读文件的清理。本节 `loadLocalHistory` 以读取成功得到的字节为主要结果，示例明确选择“不以关闭错误覆盖读取结果”。这只是该函数的合同。

有些写入或提交型资源可能在 `Close` 时才报告最后的失败。若合同要求把关闭失败交给调用者，应明确保留主操作错误的优先级：

```go
func writeOneLine(path string, line string) (err error) {
	f, err := os.Create(path)
	if err != nil {
		return fmt.Errorf("创建本地历史失败：%w", err)
	}
	defer func() {
		if closeErr := f.Close(); err == nil && closeErr != nil {
			err = fmt.Errorf("关闭本地历史失败：%w", closeErr)
		}
	}()

	if _, err = f.WriteString(line); err != nil {
		return fmt.Errorf("写入本地历史失败：%w", err)
	}
	return nil
}
```

这里使用具名返回值和延后函数，推理比读文件示例复杂：写入已经失败时保留写入错误；写入成功但关闭失败时返回关闭错误。初学阶段不必在所有函数套用它，先写清资源的取得者、是否转移责任，以及哪个错误优先。

## 四、I/O：一次读取只说明这一批字节

### 4.1 三个小接口

01.06 讲过接口描述能力。标准库的 I/O 也采用相同思想：

```go
type Reader interface {
	Read(p []byte) (n int, err error)
}

type Writer interface {
	Write(p []byte) (n int, err error)
}

type Closer interface {
	Close() error
}
```

`Reader` 的调用者提供一个字节切片 `p` 作为本次缓冲区。`n` 表示本次实际写进 `p` 前 `n` 个位置的字节数；剩余位置不是本次读取结果。`Writer` 返回本次接收的字节数。`Closer` 只表示可结束使用，不能从它推断可读或可写。

文件 `*os.File` 同时具备读取和关闭能力；内存中的 `strings.Reader` 可以读取但不需要关闭；一个接口变量能做什么，由它声明的能力和函数合同共同决定。

### 4.2 先处理 `n > 0`，再看 `err`

`Read` 可以在同一次调用中同时返回数据和非 `nil` 的错误，包括输入结束。因此正确的循环顺序是先处理 `buffer[:n]`，再处理 `readErr`：

```go
func copyHistory(reader io.Reader, writer io.Writer) error {
	buffer := make([]byte, 4)
	for {
		n, readErr := reader.Read(buffer)
		if n > 0 {
			written, writeErr := writer.Write(buffer[:n])
			if writeErr != nil {
				return fmt.Errorf("写入复制结果失败：%w", writeErr)
			}
			if written != n {
				return io.ErrShortWrite
			}
		}

		if readErr == io.EOF {
			return nil
		}
		if readErr != nil {
			return fmt.Errorf("读取本地历史失败：%w", readErr)
		}
	}
}
```

`io.EOF` 是“正常地没有更多输入”的特定错误。若固定格式的数据在应有内容之前结束，调用者应使用更具体的错误，例如 `io.ErrUnexpectedEOF`，而不是把截断数据当作完整历史。本章的纯字节复制并不知道格式，所以只能把 EOF 当作复制结束。

`n == 0 && err == nil` 只表示“这一轮没有得到数据也没有错误”，不表示 EOF。标准库不鼓励读取实现反复这样返回；调用者仍不应据此武断宣布输入结束。

### 4.3 用内存端点推导复制，不制造文件

下面的完整程序只在内存中构造输入和输出，便于观察接口参数和返回值。它没有运行，输出是按规则推导的预期。

```go
package main

import (
	"fmt"
	"io"
	"strings"
)

func copyHistory(reader io.Reader, writer io.Writer) error {
	buffer := make([]byte, 3)
	for {
		n, readErr := reader.Read(buffer)
		if n > 0 {
			written, writeErr := writer.Write(buffer[:n])
			if writeErr != nil {
				return writeErr
			}
			if written != n {
				return io.ErrShortWrite
			}
		}
		if readErr == io.EOF {
			return nil
		}
		if readErr != nil {
			return readErr
		}
	}
}

func main() {
	source := strings.NewReader("m-a\nm-b\n")
	var target strings.Builder
	if err := copyHistory(source, &target); err != nil {
		fmt.Println("复制失败：", err)
		return
	}
	fmt.Print(target.String())
}
```

预期文本仍是两行 `m-a`、`m-b`。这只说明这个内存 `Reader` 的字节被交给内存 `Writer`。它没有承诺文件已经落盘，也没有进入网络。

## 五、本机历史文件：打开、读取、关闭

### 5.1 一个最小的读取合同

`os.Open(path)` 返回 `(*os.File, error)`。成功时得到可读文件；失败时错误常能用 `errors.Is` 和 `errors.As` 进一步解释。下面函数的合同很窄：读取一个预期很小的本地文件，把字节转换成字符串，并保留打开或读取失败的原因。

```go
func loadLocalHistory(path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", fmt.Errorf("打开本地历史文件失败：%w", err)
	}
	defer f.Close()

	data, err := io.ReadAll(f)
	if err != nil {
		return "", fmt.Errorf("读取本地历史文件失败：%w", err)
	}
	return string(data), nil
}
```

`io.ReadAll` 把全部内容放进内存，所以只适合本例这种大小明确、受控的教学输入。真实历史可能很大或来自不可信输入，应先定义字节上限，再采用流式处理。本章也没有定义文本行、JSON、时间字段或兼容格式；它们由 01.08 再解释。

相对路径以程序的当前工作目录为基准，不会自动以 `main.go` 所在目录为基准。`history-c-a.log` 不存在时，是否把它视为“新会话尚无本地历史”是入口层的业务决定：

```go
history, err := loadLocalHistory("history-c-a.log")
if errors.Is(err, fs.ErrNotExist) {
	history = "" // 仅本例：入口选择空历史。
} else if err != nil {
	return fmt.Errorf("准备会话 c-a 历史失败：%w", err)
}
```

不要把“路径不存在”与“所有读取失败”混为一类。权限不足、路径实际指向错误对象、设备故障等仍应保留错误，而不是静默生成空历史。

### 5.2 责任转移必须写出来

若函数自己打开、读取并返回字符串，函数自己关闭文件；若函数把 `*os.File` 返回给调用者，调用者获得继续使用它的能力，也应获得关闭责任。下面函数名和注释就应体现这种选择：

```go
// openHistoryForRead 将关闭责任转移给调用者。
// 调用者必须在不再使用返回文件时调用 Close。
func openHistoryForRead(path string) (*os.File, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("打开历史失败：%w", err)
	}
	return f, nil
}
```

不要在 `openHistoryForRead` 中 `defer f.Close()` 后再返回 `f`，那会把一个已经关闭的文件交出去；也不要让两层都在不知情时关闭同一个文件。资源责任和错误契约一样，必须属于一个清楚的边界。

## 六、`panic` 与 `recover` 只处理异常控制流

用户输入为空、消息重复、文件不存在、读取失败，都是函数可以预期并交给调用者的结果，应返回 `error`。`panic` 则会开始当前 goroutine 的异常展开，并依次执行该 goroutine 已登记的 `defer`。Go 把一条独立执行路径称为 goroutine；本章不会创建它，只需知道 panic 与 recover 都限定在同一条执行路径内。

`recover` 只有在同一 goroutine 的延后函数中、且 panic 正在展开时才取得 panic 值并停止这次展开。它不是一般错误处理语法。下面只是说明一个最窄的隔离边界：

```go
func runAtBoundary(fn func()) (panicked bool) {
	defer func() {
		if recovered := recover(); recovered != nil {
			panicked = true
		}
	}()
	fn()
	return false
}
```

即使 `runAtBoundary` 得到 `true`，也不代表内部状态仍可安全继续使用。边界层最多记录、隔离并返回受控失败；它不能把空指针、违反不变量或以后会遇到的并发问题变成正常业务分支。优先修复发生 panic 的代码，而不是在更外层持续掩盖它。

| 情况 | 本章的合适表达 |
|---|---|
| 空会话 ID、重复消息 | `ErrInvalidMessage`、`ErrDuplicateMessage` |
| 本地文件不存在、读取失败 | 包装后返回 `error` |
| 内部代码违背自己的不变量 | 先定位和修复缺陷；不能当作普通用户操作 |
| 程序最外层需要保护一个不可信扩展 | 可设计狭窄 `recover` 边界，但不继续使用未知状态 |

## 七、综合推导：三条失败路径分别意味着什么

把本章放回虚构会话 `c-a`，下面三条路径的结果不同：

| 事件 | 直接结果 | 调用者可用的判断 | 本章没有证明的事 |
|---|---|---|---|
| 第二次写入 `c-a/m-a` | `ErrDuplicateMessage`，原 map 条目保持不变 | `errors.Is(err, ErrDuplicateMessage)` | 跨设备去重或请求幂等 |
| 查询 `c-a/m-x` | `ErrMessageNotFound` 和零值 `Message{}` | `errors.Is(err, ErrMessageNotFound)` | 服务端没有该消息 |
| 打开 `history-c-a.log` 失败 | 带上下文的文件错误 | `errors.Is(err, fs.ErrNotExist)`；必要时 `As` | 任何线上历史、持久性或送达状态 |

一次本地 `Put` 成功，只说明当前 `MemoryStore` 接受了值；一次 `io.ReadAll` 成功，只说明本次文件读取返回了字节；一次 `Close` 被调用，只说明当前函数履行了关闭动作。把这些局部结论扩张成“消息已发送”“稳定保存”“对方可见”会跳过未来还未学习的网络、存储、确认与恢复边界。

## 八、分层练习与自检

下面各题先写出预测，再查看反馈。代码未执行时，把结论记录为推导而不是运行证据。

<details>
<summary>1. `nil` 错误表示什么？</summary>

`nil` 表示当前函数没有返回错误。它不自动证明更大的业务目标已经完成；例如本地 `Put` 返回 nil 不等于消息已送达。
</details>

<details>
<summary>2. 为什么不能每次都 `errors.New("消息不存在")` 后再用 `==` 判断？</summary>

每次 `errors.New` 创建不同错误值。需要稳定身份时定义一次 `var ErrMessageNotFound = errors.New(...)`，并复用这个变量；更一般地用 `errors.Is` 判断。
</details>

<details>
<summary>3. `err.Error()` 可否作为业务分支？</summary>

不应。文字可能因包装、翻译、路径或实现变化而变化。用哨兵错误配合 `errors.Is`，或用 `errors.As` 获取明确类型。
</details>

<details>
<summary>4. `%v` 和 `%w` 在 `fmt.Errorf` 中的关键差别？</summary>

`%v` 只格式化文字；`%w` 建立可遍历的错误包装关系，使上层可用 `errors.Is` 和 `errors.As` 查看原因。
</details>

<details>
<summary>5. 何时应立即检查 `err`？</summary>

在刚调用返回错误的函数后。若先忽略错误再使用零值，读取失败可能被伪装成空历史或空消息。
</details>

<details>
<summary>6. `defer f.Close()` 在执行到这一行时关闭文件了吗？</summary>

没有。此时登记了延后调用并求值了 `f`；外围函数退出、到达末尾或 panic 展开时才实际调用 `Close`。
</details>

<details>
<summary>7. 三次 `defer fmt.Println(i)`，i 依次为 0、1、2，退出时输出顺序？</summary>

输出 2、1、0。延后调用按后进先出执行，且每次登记时参数已经求值。
</details>

<details>
<summary>8. `os.Open` 返回错误后，能否立刻 `defer f.Close()`？</summary>

不能。先检查错误；只有成功取得有效资源后才登记关闭。
</details>

<details>
<summary>9. 哪一层关闭 `openHistoryForRead` 返回的文件？</summary>

调用者。函数把可用 `*os.File` 交给调用者时，也转移了关闭责任，文档和函数名应说明这一点。
</details>

<details>
<summary>10. `Read` 返回 `n > 0` 和 `io.EOF` 时，先做什么？</summary>

先处理 `buffer[:n]` 的有效字节，再把 EOF 解释为正常结束；丢掉这批字节会导致末尾数据遗失。
</details>

<details>
<summary>11. `Read` 返回 `0, nil` 等于 EOF 吗？</summary>

不等于。它只表示这一轮没有进展；不能据此宣布输入完整结束。
</details>

<details>
<summary>12. 什么时候应使用 `io.ErrUnexpectedEOF`？</summary>

当你的格式要求还应有更多字节，却在中途遇到输入结束时。单纯字节复制不知道格式，因此只能把 EOF 当作结束。
</details>

<details>
<summary>13. `io.ReadAll` 适合任何历史文件吗？</summary>

不适合。它会把全部内容放进内存。文件大小未知或来自不可信输入时，先定义限制并采用流式读取。
</details>

<details>
<summary>14. 为什么 `errors.As(err, &pathErr)` 传入两层指针？</summary>

`pathErr` 是 `*fs.PathError` 类型的变量；`As` 需要写入该变量，因此接收它的地址 `&pathErr`，类型为 `**fs.PathError`。
</details>

<details>
<summary>15. 写入成功后 Close 失败，应该返回哪个错误？</summary>

由函数合同决定。一个常见选择是写入失败优先；若写入成功而关闭失败，则返回关闭错误。关键是把优先级写出来并测试。
</details>

<details>
<summary>16. 为什么不能用 panic 处理重复消息？</summary>

重复消息是预期业务输入，调用者可以显示、拒绝或按未来规则处理；它应返回 `ErrDuplicateMessage`。panic 用于异常控制流和代码缺陷边界。
</details>

<details>
<summary>17. recover 后能否继续信任所有内部状态？</summary>

不能。recover 只能停止某次 panic 展开；发生 panic 的原因可能已破坏不变量。边界应隔离和报告，根本修复在缺陷处完成。
</details>

<details>
<summary>18. 文件不存在能否总是当作新会话？</summary>

不能。只有入口层的明确业务规则可把特定路径不存在视为“尚无历史”；权限失败、格式截断和其他错误不能静默变成空历史。
</details>

<details>
<summary>19. 本地 map 拒绝重复键是否就是分布式去重？</summary>

不是。它只覆盖同一 `MemoryStore` 实例和本章选择的复合键。跨请求、重启、服务端与多设备的去重需要后续协议与持久状态。
</details>

<details>
<summary>20. 下一章还缺少什么？</summary>

本章只读写原始字节和字符串。下一章会继续解释文件格式、JSON、时间与标准库协作，才可以讨论如何把消息字段保存为可交换的记录。
</details>

## 本章来源与下一步

- [Go `errors` 包](https://pkg.go.dev/errors)：`New`、`Is`、`As`、包装错误的定义。
- [Go `io` 包](https://pkg.go.dev/io)：`Reader`、`Writer`、`EOF` 与部分读取的合同。
- [Go `os` 包](https://pkg.go.dev/os)：`Open`、`File.Read`、`File.Write` 与 `File.Close`。
- [Go 语言规范：defer](https://go.dev/ref/spec#Defer_statements) 与 [panic/recover](https://go.dev/ref/spec#Handling_panics)：求值、退出和恢复的语言规则。

下一章是[01.08 常用标准库协作](./08_standard_library.md)。它会先定义数据格式和大小边界，再把本章的错误链、资源责任和分次 I/O 放进文件导入导出与时间处理。
