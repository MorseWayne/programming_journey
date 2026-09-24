---
title: 10.04 测试替身与设计：控制依赖，验证消息规则
icon: /assets/icons/article.svg
order: 5
date: 2026-09-24
---

[返回第十卷](./README.md) · [测试前置：10.02](./02_testing_basics.md) · [本地 CLI：01.12](../01_go/12_cli_capstone.md)

# 10.04 测试替身与设计：控制依赖，验证消息规则

> DeepTutor 初稿经技术与教学审阅后的静态课程。代码、测试报告和执行步骤是教学示例或预期；本次没有运行 Go 测试、示例、站点构建或 IM 服务。

## 本章从哪里开始

10.01 已把虚构 IM 消息的要求写成决策表；10.02 已学过 `_test.go`、`testing.T`、`got/want` 和失败前后状态。01.06 讲过方法与小接口，01.07 讲过错误身份，01.12 则提出本地历史工具的 `check/list/export` 合同。本章解决下一步问题：**业务逻辑需要文件、时钟或输出流时，怎样让测试仍能准确控制输入、注入故障并观察结果？**

学习时只使用虚构的 `c-a` 会话、`u-a` 用户和 `m-a` 消息。这里的“保存”限定为教学用本地历史，不表示登录、远端受理、送达或已读。先读第一至四节建立概念，再用第五、六节处理故障和时间，最后用第七、八节评估证据范围和业务变更。

| 层次 | 本章要解决的问题 | 留下的证据 |
|---|---|---|
| 起步 | 哪个对象被测，哪个依赖需要控制？ | 画出输入、调用和可观察结果 |
| 原理 | 接口、注入、fake、stub、spy、mock 各做什么？ | 根据测试目的解释替身选择 |
| 工程 | 怎样制造存储失败、固定时间、检查状态？ | 错误身份、调用记录和前后状态 |
| 业务 | 哪些结论必须穿过真实文件边界？ | 一张分层验收表与未覆盖范围 |

## 一、先识别依赖，再决定是否需要替身

一个只计算 `len(body) <= maxBytes` 的函数，输入都在参数里，返回值直接可见；给它准备字符串和整数即可测试。另一段逻辑若在函数内部直接 `os.Open`、`time.Now`、`fmt.Println`，测试就依赖固定路径、当天时间和进程输出。它们可能掩盖真正要核对的消息规则，也让“磁盘返回错误”这种路径难以主动触发。

把测试中的角色分开：**被测对象**（system under test，SUT）是本次要核对的函数或服务；**协作者**是它调用的存储、时钟和输出流；**可观察结果**包括返回值、错误身份、外部可见状态与合同要求的交互。测试替身是用于某次测试的可控协作者，并不天然比真实实现更好。

以“记录一条文本消息”为例，先给出独立于实现的合同：会话种类为 `single` 或 `group`，正文非空且 UTF-8 字节数不超过上限；保存同一会话的重复消息 ID 要拒绝；拒绝后已保存的消息不得改变。上限为 6 时，`你好` 恰为 6 字节应接受，`你好呀` 为 9 字节应拒绝。这里的 `want` 来自需求表，不从被测函数的分支倒推。

测试可按问题选边界：

| 要验证什么 | 优先使用什么 | 这次仍不能证明什么 |
|---|---|---|
| 纯消息校验规则 | 直接调用真实函数 | 文件是否写成功 |
| 记录服务在校验失败时不调用存储 | 记录调用的简单 spy | 真实文件的全部写入语义 |
| 存储报错如何传到调用方 | 固定返回错误的 stub | 报错后真实文件没有部分内容 |
| 本地文件的格式与覆盖合同 | `t.TempDir` 中真实文件适配器 | 网络服务受理、跨设备同步 |

先问“我需要控制什么、观察什么”，再选工具。为了让每个方法都能被模拟而制造大量接口，会增加理解和维护成本。

## 二、从直接依赖走到小接口与显式注入

假设 `Record` 既校验正文又自己打开文件。校验错误和文件错误会混在一次调用里；若要测试保存失败，必须寻找一个容易失败的真实路径。我们把“保存一条已校验消息”作为边界，由调用方把实现传给记录服务。**依赖注入**在这里就是把协作者作为参数或字段提供，不要求容器或框架。

Go 接口是一组方法签名。实现了这些方法的类型无需写 `implements` 声明，就满足接口。接口宜由使用能力的代码按需定义：记录服务只需 `Save`，无需被迫知道 `DeleteAll`、`Connect`、`Flush` 等无关方法。下例是教学用 `history` 包片段；`ValidateMessage` 是 10.02 已给出的函数，签名为 `ValidateMessage(kind, body string, maxBytes int) (bool, string)`。

```go
package history

import (
	"errors"
	"fmt"
	"time"
)

type Message struct {
	ConversationID string
	ID             string
	SenderID       string
	Body           string
	CreatedAt      time.Time
}

type MessageSaver interface {
	Save(Message) error
}

var ErrInvalidMessage = errors.New("invalid message")

type Recorder struct {
	Saver    MessageSaver // 构造 Recorder 时必须提供可用实现。
	MaxBytes int
}

func (r Recorder) Record(kind string, m Message, now time.Time) (Message, error) {
	if m.ConversationID == "" || m.ID == "" || m.SenderID == "" {
		return Message{}, ErrInvalidMessage
	}
	if ok, reason := ValidateMessage(kind, m.Body, r.MaxBytes); !ok {
		return Message{}, fmt.Errorf("%w: %s", ErrInvalidMessage, reason)
	}
	m.CreatedAt = now.UTC()
	if err := r.Saver.Save(m); err != nil {
		return Message{}, fmt.Errorf("save message: %w", err)
	}
	return m, nil
}
```

`Record` 只决定校验、时间和是否请求保存；**拒绝重复 ID 并保留原值是 `Save` 实现的合同**。在当前单人、顺序执行的本地练习中可以先用内存实现理解它；并发时“先查重再写入”可能被另一个调用插入，不能凭这个例子宣称并发安全。`Recorder` 的调用方负责提供非 nil 的 `Saver`；01.06 讲过接口中装有 typed nil 的特殊情形，真正的构造 API 要另行防护。

把 `now` 显式传入让测试指定时刻，生产入口才使用真实时钟。保存失败时返回零值消息和带 `%w` 的错误，调用方可用 `errors.Is` 识别原因。失败后底层文件状态是否不变，需要文件层自己的证据。

注入也适用于标准库接口：01.12 的 `run(args, stdout, stderr)` 接收 `io.Writer`，实际入口传 `os.Stdout`、`os.Stderr`，测试可传 `bytes.Buffer`。若逻辑读入文本，`io.Reader` 可由文件或 `strings.Reader` 提供。只有一个简单确定性计算时，直接传值通常更清楚，不必先造接口。

## 三、替身词汇：看行为而不是名字

“test double”是测试协作者的总称。术语在团队里有时被统称为 mock；本章按它在测试里**提供什么、记录什么、验证什么**区分，避免名称争论。

| 类型 | 典型行为 | 本地 IM 例子 | 适合回答的问题 |
|---|---|---|---|
| dummy | 为满足参数形状而传入，调用中不使用 | 校验失败前就返回，保存参数不会被调用 | 该路径是否不依赖它 |
| fake | 有可工作的简化实现 | 用 map 保存会话内消息 | 服务与内存存储能否配合 |
| stub | 对调用返回预设值 | `Save` 固定返回 `errDisk` | 上层遇到该错误怎样处理 |
| spy | 记录调用，供测试事后检查 | 收集 `Save` 收到的消息 | 拒绝时是否没有调用存储 |
| mock（狭义） | 预先设置需要发生的交互并在结束时核对 | 预期一次指定的保存请求 | 交互本身是否是合同 |

fake 的 map 并不等于真实 JSON 文件；stub 返回一个错误也不代表磁盘真的进入过这种状态。spy 和 mock 很接近，关键区别是“事后读取记录”与“预先声明交互期待”。某些库把所有替身都叫 mock，阅读代码时应先看它的行为。关于这组名称与状态验证、交互验证的来源，可读 [Martin Fowler 对测试替身的解释](https://martinfowler.com/articles/mocksArentStubs.html)。

**状态验证**比较调用后的返回值和对象状态；**交互验证**比较协作者收到的调用。若业务规则只是“消息成功后可再读取”，优先核对可观察结果。若合同明确规定“非法消息不得触碰存储”，才有理由检查 `Save` 没有被调用。把内部每个 helper 的调用次数都锁进测试，会使无行为变化的重构也大量失败。

## 四、用内存实现走通正常路径，但认清它的范围

下面的 fake 为单次测试提供真实可工作的内存保存。键由“会话 ID + 消息 ID”组成；不同会话可以使用相同消息 ID。初始化 map 是它的前置条件；测试各自创建新实例，不共享状态。

```go
var ErrDuplicate = errors.New("duplicate message id")

type memorySaver struct {
	items map[memoryKey]Message
}

func newMemorySaver() *memorySaver {
	return &memorySaver{items: make(map[memoryKey]Message)}
}

type memoryKey struct {
	conversationID string
	messageID      string
}

func (s *memorySaver) Save(m Message) error {
	key := memoryKey{m.ConversationID, m.ID}
	if _, exists := s.items[key]; exists {
		return ErrDuplicate
	}
	s.items[key] = m
	return nil
}
```

这个结构体键只供教学内存 map 使用；两个字段各占一个位置，避免手工拼接字符串产生边界歧义。生产文件格式、索引和并发原子性都未由它定义。测试 `Recorder` 时可以传入 `newMemorySaver()`：固定 `now`，记录 `u-a` 给 `c-a` 的 `m-a`，观察返回消息中的 UTC 时间以及 map 里确有该条。再提交同会话的 `m-a`，按 `Save` 合同得到 `ErrDuplicate`，前后 map 的条数和原值不变。

这里有一条重要的证据界限：若**被测对象正是 `memorySaver.Save`**，测试调用了真实内存方法；若被测对象是 `Recorder`，它的协作者才是 fake。测试 fake 的重复检查，不能代替对真实文件适配器的重复检查。不要把生产实现的校验分支逐字复制进 fake 和测试预期；两处同错时测试仍可能通过。

一张从需求来的案例表比复制代码更可靠：

| 初始状态 | 操作 | 预期返回 | 保存后的状态 |
|---|---|---|---|
| 空会话 | 保存 `c-a/m-a`，正文 `你好`，上限 6 | 成功，时间为固定 UTC 值 | 恰有该消息 |
| 已有 `c-a/m-a` | 再保存 `c-a/m-a` | `ErrDuplicate` | 原消息未被替换 |
| 已有 `c-a/m-a` | 保存 `c-b/m-a` | 可成功 | 两个会话各有一条 |
| 已有 `c-a/m-a` | 保存 9 字节正文，上限 6 | `ErrInvalidMessage` | 原消息未改变 |

最后一行还应核对 `Save` 是否没被调用，因为非法正文应在存储边界之前拒绝。下一节给出受控记录方法。

## 五、用 stub 注入失败，用 spy 核对必要交互

先造一个只返回预设错误的 stub。它的职责不是模拟真实磁盘，也不需要复制重复 ID 规则：

```go
type failingSaver struct{ err error }

func (s failingSaver) Save(Message) error { return s.err }
```

给它传一个独立的 `errDisk := errors.New("teaching disk failure")`，用有效消息调用 `Record`，应得到非 nil 错误和零值 `Message`；`errors.Is(err, errDisk)` 应为真，因为 `Record` 用 `%w` 保留了错误身份。如果误用 `%v`，错误文字可能相似，`errors.Is` 却无法穿透包装。这样的测试证明的是**服务如何处理协作者返回的错误**，不证明真实文件在报错时没有部分写入。

需要验证“非法消息根本不调用保存”时，使用简短 spy：

```go
type spySaver struct {
	calls []Message
	err   error
}

func (s *spySaver) Save(m Message) error {
	s.calls = append(s.calls, m)
	return s.err
}
```

例如测试 `Record("single", Message{ConversationID:"c-a", ID:"m-a", SenderID:"u-a", Body:"你好呀"}, fixedTime)`，上限为 6。预期 `errors.Is(err, ErrInvalidMessage)`、返回零值消息、`len(spy.calls)==0`。有效的 6 字节正文应使 spy 收到一次完整消息，其 `CreatedAt` 等于固定 UTC 时间。这一次调用次数与“非法消息不得触碰存储”及“成功请求一次保存”的合同直接相关；若业务只要求最终文件内容，不必对内部函数调用顺序编造额外期待。

把这条预期写成完整测试函数如下。它与上面定义的 `Message`、`Recorder`、`spySaver` 放在同一 `history` 包的 `_test.go` 文件中，需导入 `errors`、`testing`、`time`；这里展示的是**静态示例**，没有执行后的通过记录：

```go
func TestRecordRejectsLongBodyBeforeSave(t *testing.T) {
	saver := &spySaver{}
	recorder := Recorder{Saver: saver, MaxBytes: 6}
	fixed := time.Date(2026, 1, 2, 3, 4, 5, 0, time.UTC)
	m := Message{ConversationID: "c-a", ID: "m-a", SenderID: "u-a", Body: "你好呀"}

	got, err := recorder.Record("single", m, fixed)
	if !errors.Is(err, ErrInvalidMessage) {
		t.Fatalf("Record error = %v, want ErrInvalidMessage", err)
	}
	if got != (Message{}) {
		t.Errorf("Record result = %+v, want zero Message", got)
	}
	if len(saver.calls) != 0 {
		t.Errorf("Save calls = %d, want 0", len(saver.calls))
	}
}
```

这三个断言分别核对错误身份、失败结果和存储边界。若删去第三个断言，即使某个实现先错误地尝试保存、随后返回校验错误，测试仍可能误判为满足合同。`Message` 在这个简化例子中只有字符串和 `time.Time` 字段，因此可以与零值结构体直接比较；若日后加入切片等不可比较字段，应改为逐字段或其他明确的比较方式。

若 spy 带着 `errDisk`，它会先记录一次调用再报错；这能证明 `Record` 传入了什么，以及错误如何返回。它不持久化消息，因此不能用 `len(calls)==1` 推断已有历史已改变或未改变。要检查真实故障后文件字节和可解析状态，须到文件适配器层选择受控 I/O 失败或真实临时文件案例，并写清故障点。

### 失败前后状态要说清是哪一层

10.01 的“拒绝不改状态”可以分解：校验失败时不调用存储；重复 ID 时保留已有消息；文件写入失败时不报告成功。前三句能分别用 spy、真实内存实现、真实文件适配器观察到不同范围。01.12 已提醒普通写入可能留下部分目标；不能把“返回错误”偷换成“磁盘状态原样”。

## 六、固定时间与输出：减少偶然结果

直接在业务函数中调用 `time.Now()`，会让测试只能模糊比较“接近现在”，也很难稳定命中日期边界。本章优先采用 `Record(..., now time.Time)`：真实入口传 `time.Now()`，测试传 `time.Date(2026, 1, 2, 3, 4, 5, 0, time.FixedZone("+08", 8*3600))`。结果经 `UTC()` 变成前一日 `19:04:05Z`；测试比较这一确定时刻，而非等待墙上时间流逝。

若多个方法都必须读取当前时间，才考虑一个很小的 `Clock` 接口：

```go
type Clock interface { Now() time.Time }

type realClock struct{}
func (realClock) Now() time.Time { return time.Now() }

type fixedClock struct{ at time.Time }
func (c fixedClock) Now() time.Time { return c.at }
```

固定时间能验证过期规则的恰好等于边界、早一瞬与晚一瞬；它不能替代真实进程的定时器、时钟漂移或跨机器时间实验。`time.Sleep` 让测试等一会儿，既慢又依赖调度时机，通常不适合表达这一类纯业务边界。

01.12 的命令入口已经把 `stdout`、`stderr` 定为 `io.Writer`。测试时可分别传 `bytes.Buffer`，在调用结束后比较退出码、成功结果与诊断；`check`、`list` 必须先读完整文件并校验再输出，坏文件不应留下部分列表。默认列表只含 ID 与时间，不输出消息正文。这里的缓冲只检验**命令层文本合同**；文件读取、覆盖保护和关闭错误要用 `t.TempDir()` 中的真实文件适配器另测。初学者可先在 10.02 的表驱动测试里练习一个缓冲，再在本章组合两个输出流。

## 七、常见反例与证据层次

**反例一：测试把每个内部方法都设成“必须调用一次”。** 业务结果和文件状态完全一样，重构时仅改了 helper 划分，测试却失败。应回看需求是否真的要求该交互；若无要求，改为观察返回值与外部状态。

**反例二：fake 抄了生产存储的所有校验。** 生产把“恰好 6 字节”误判为过长，fake 也照抄，两个都通过同一套错误预期。预期必须从 10.01 的边界表得到，真实适配器还需要独立合同测试。

**反例三：所有 stub 都返回成功。** 正常路径看起来很绿，磁盘错误、重复 ID 和关闭失败没有覆盖。给每一种有业务含义的失败指定错误身份，并核对上层承诺；无需模拟所有操作系统错误文字。

**反例四：测试共享一个可变 fake。** 前一个案例保存的消息会影响后一个案例，执行顺序变成隐藏输入。每个案例创建新 fake 或显式恢复状态；若需要并发测试，先具备 10.07 的并发前置和同步模型。

| 证据层 | 本章可做的观察 | 不可直接推出 |
|---|---|---|
| 纯规则 | 6/9 字节、错误优先级 | `Save` 有没有调用 |
| 服务加替身 | 校验前拒绝、固定时间、错误包装、必要交互 | 真实文件是否可解析 |
| `t.TempDir` 真实文件 | 格式、大小限制、同一文件拒绝、目标已存在和前后字节 | 崩溃原子、服务端历史 |
| 将来端到端 | 需有真实进程、网络、身份和接收端观察 | 仍须按确认点区分受理、送达、已读 |

如果上限从 6 改成 9，9 字节由拒绝改为合法，10 字节仍拒绝；会话种类先检查、重复 ID 不替换、存储错误传播仍要保留。改需求时先改独立决策表，再改测试和实现；不能只为让测试通过而修改 `want`。

## 八、把一次 IM 需求变更变成可交付练习

按以下顺序完成个人练习。代码实际运行与输出应由学习者在自己的隔离目录记录；本章只提供静态预期。

1. 从 10.01 抄出允许会话种类、正文上限、重复 ID 和拒绝后状态四条规则，给每条标出输入、初态、预期和观察点。
2. 先直接测试 `ValidateMessage` 的 5/6/7 字节边界与“未知种类优先”分支，再给 `Recorder` 接入 `newMemorySaver()`，保存虚构 `c-a/m-a`。
3. 用 `failingSaver` 注入存储错误，用 `spySaver` 验证非法消息不保存；固定 `now`，分别核对本地和 UTC 表示。
4. 在 `t.TempDir()` 中用**真实**文件适配器核对 v1 JSON、重复 ID、超限输入、已有导出目标和输入输出同文件。逐项记录预期、实际、代码版本和文件前后差异。
5. 修改上限为 9 字节，重新解释 6/9/10 字节三种结果；列出哪些测试需要改预期，哪些错误与文件合同不应受影响。

### 分层练习：先作答，再看反馈

<details><summary>1. `ValidateMessage` 没有外部依赖，必须造接口吗？</summary>

不必。直接传入字符串和上限，比较返回结果；接口解决可替换边界，不是测试语法的必选项。</details>

<details><summary>2. SUT 是什么？</summary>

本次要核对的函数或服务。测试 `Recorder` 时，`MessageSaver` 是协作者。</details>

<details><summary>3. `want` 从哪里来？</summary>

从 10.01 的需求和边界表来，不从当前实现的 `if` 分支复制。</details>

<details><summary>4. `MessageSaver` 为什么只有一个方法？</summary>

记录服务只需要保存能力；接口越宽，替身和调用方越容易被无关方法牵连。</details>

<details><summary>5. Go 类型需要显式声明实现接口吗？</summary>

不需要。方法集满足签名即可；01.06 还讲了指针和值方法集的区别。</details>

<details><summary>6. 把 `now time.Time` 当参数有什么好处？</summary>

测试能指定唯一时刻，精确检查边界和 UTC 结果。</details>

<details><summary>7. `memorySaver` 是 stub 吗？</summary>

按本章定义它是 fake：它用 map 真正保存和拒绝重复消息，而非只返回预设答案。</details>

<details><summary>8. `failingSaver` 证明磁盘必然会失败吗？</summary>

不能。它只控制协作者向 `Recorder` 返回指定错误。</details>

<details><summary>9. spy 的 `calls` 在什么时候看？</summary>

调用 SUT 之后读取它记录的请求；狭义 mock 则预设交互期待。</details>

<details><summary>10. 非法正文时 `len(calls)==0` 说明什么？</summary>

说明这次服务调用没有越过保存边界；不能据此证明所有输入都如此。</details>

<details><summary>11. 为什么检查 `errors.Is(err, errDisk)`？</summary>

核对错误身份沿 `%w` 包装被保留，避免依赖文字描述。</details>

<details><summary>12. 保存失败返回错误，就证明文件字节不变吗？</summary>

不能。文件可能在中途写了一部分；需真实文件层观察故障点与前后状态。</details>

<details><summary>13. 同会话重复 ID 的核心断言是什么？</summary>

得到 `ErrDuplicate`，消息数不增且原消息内容不被替换。</details>

<details><summary>14. 不同会话都使用 `m-a` 一定冲突吗？</summary>

本题以会话 ID 和消息 ID 组成键，因此不冲突；若需求改为全局唯一，键和测试都要调整。</details>

<details><summary>15. 为什么每个测试案例新建 fake？</summary>

避免前一案例留下的状态改变后一案例的初始条件。</details>

<details><summary>16. 为什么不能只用 fake 测试 JSON 文件？</summary>

fake 没有经过编码、解码、路径、写入和关闭边界，不能证明文件合同。</details>

<details><summary>17. `bytes.Buffer` 适合检查什么？</summary>

接住 `io.Writer` 的输出，核对 CLI `stdout`、`stderr` 文本与敏感字段边界。</details>

<details><summary>18. `t.TempDir()` 的作用是什么？</summary>

给真实文件测试一个独立临时目录，避免使用共享真实历史或固定绝对路径。</details>

<details><summary>19. 6 字节上限改 9 时，哪些边界预期变化？</summary>

9 字节由拒绝改为接受；10 字节仍拒绝，6 字节仍接受。重复 ID 与错误身份合同不随之改变。</details>

<details><summary>20. 为什么 `sleep` 不适合测试纯时间规则？</summary>

等待依赖调度与墙上时间，慢且不稳定；直接传固定时刻能准确命中边界。</details>

<details><summary>21. 只检查 `Save` 调用一次，能证明消息会被收件设备看到吗？</summary>

不能。本章没有网络、服务端或接收端；调用次数只涉及本地服务与协作者。</details>

<details><summary>22. 何时值得断言调用次数？</summary>

当次数本身是明确合同，例如非法输入不得调用存储；内部 helper 的次数通常不必固定。</details>

## 来源与下一步

- [Martin Fowler：Mocks Aren't Stubs](https://martinfowler.com/articles/mocksArentStubs.html)：测试替身词汇、状态验证与交互验证。
- [Learn Go with Tests：Dependency Injection](https://quii.gitbook.io/learn-go-with-tests/go-fundamentals/dependency-injection) 与 [Mocking](https://quii.gitbook.io/learn-go-with-tests/go-fundamentals/mocking)：以 `io.Writer` 和可控时间说明 Go 的测试边界。
- [Go `testing`](https://pkg.go.dev/testing) 与 [Go `time`](https://pkg.go.dev/time)：`T.TempDir`、时间值和标准库接口的具体行为。

下一章 10.05《重构与模块边界》将沿本地历史工具讨论保持外部行为不变时如何改变内部结构；章节设计见[第十卷目录](./README.md)。进入之前，请能明确说出每项替身测试覆盖哪个边界、还需哪项真实文件证据。
