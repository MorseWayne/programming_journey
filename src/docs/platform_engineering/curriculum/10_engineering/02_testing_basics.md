---
title: 10.02 测试基本方法：用可核对的预期保护 IM 消息规则
icon: /assets/icons/article.svg
order: 3
date: 2026-09-24
---

[返回第十卷](./README.md) · [上一章：可验证需求](./01_verifiable_requirements.md) · [Go 语言主线](../01_go/README.md)

# 10.02 测试基本方法：用可核对的预期保护 IM 消息规则

> DeepTutor 原稿经技术和教学审阅后的章节。代码、命令与失败报告是课程示例和静态预期；本次没有运行 Go 测试、示例或站点构建。

## 本章从哪里开始

10.01 把虚构 IM 的消息规则写成决策表；01.01–01.09 已介绍函数、切片、结构体、方法、`error` 和包。现在可以把一行规则变为可重复检查的测试：给定输入和初始状态，调用一个明确的函数，再比较返回值与状态。

测试先要有**独立于当前实现的预期**。若实现错误地把 6 字节正文拒绝，而测试只是照着实现写“6 字节应拒绝”，测试会通过，却保护了错误规则。本章统一采用 10.01 的教学约定：会话种类只允许 `single`、`group`；先检查种类，再检查 `maxBytes > 0`、原始正文非空、`len(body) <= maxBytes`。等于上限合法，正文不自动去空格；`len` 的单位是 UTF-8 字节。拒绝不改变已保存的本地消息。

| 学习层次 | 内容 | 留下的证据 |
|---|---|---|
| 起步 | 需求预期、`_test.go`、`TestXxx` | 能写一个有输入、got、want 的测试 |
| 原理 | `testing.T`、失败报告、表驱动与子测试 | 能定位哪条规则、哪个边界失败 |
| 工程 | 拒绝后状态、临时文件与测试层次 | 能限定测试究竟观察了什么 |
| 深化 | 覆盖率、稳定性与规则变更 | 能说明通过与未覆盖的范围 |

第一次可先读一至五节和综合练习；能解释测试报告后，再读第六、七节的证据范围。10.04 才展开替身与依赖注入，10.07 才展开并发与模糊测试。

## 一、从需求写出 `want`，再观察 `got`

先不用测试框架，给“最多 6 字节”列出独立预期：

| 输入 | 预期结果 | 根据哪条规则 |
|---|---|---|
| `kind=single, body="a", max=6` | 通过 | 分类有效、正文非空且 1≤6 |
| `kind=single, body="你好", max=6` | 通过 | 中文这两个码点按 UTF-8 共 6 字节，等号合法 |
| `kind=single, body="你好呀", max=6` | `TOO_LONG` | 9 字节超过 6 |
| `kind=single, body="", max=6` | `EMPTY` | 原始正文为空 |
| `kind=single, body=" ", max=6` | 通过 | 空格仍是 1 字节，不自动裁剪 |
| `kind=other, body="", max=0` | `BAD_KIND` | 会话种类优先于另外两项错误 |

表格里的 `want` 来自需求，不是对函数执行结果的回忆。**测试输入**是 `kind`、`body`、`maxBytes`；**初始状态**在纯校验函数中没有，在稍后的历史对象中是已有消息；**实际观察**是函数本次返回的 `got`；**断言**是把 `got` 与 `want` 比较并报告差异。

一次测试通过只说明：在该次执行环境、该版本代码和这些输入下，已写的断言没有发现差异。它不证明所有输入都正确，也不证明服务端受理、设备接收或已读。课程中的代码尚未执行，下面所有输出都称为预期或假想报告。

### 测试也可能写错

假设规则要求 `len(body) <= 6`，实现却写 `len(body) >= 6` 时拒绝。如果测试只包含 5 字节通过和 7 字节拒绝，两种实现都可能满足测试。**恰好 6 字节**才区分它们。发现失败后要回到需求确认 `want`，不能为了绿灯把 6 字节的预期改为拒绝。

这也是为什么测试要写清来源：需求编号、版本、例子和边界。若需求后来把上限改为 9，测试的 9 字节预期才随需求一起改；未知会话优先级与失败不改状态仍应保留。

## 二、第一个 Go 测试文件

在教学模块 `example.com/imhistory` 下，假设目录为：

```text
imhistory/
├── go.mod
└── history/
    ├── validate.go
    └── validate_test.go
```

两个 `.go` 文件同处 `history/`，都声明 `package history`。生产文件 `history/validate.go` 如下；它只返回本地校验结论，不修改外部状态：

```go
package history

func ValidateText(body string, maxBytes int) (bool, string) {
	if maxBytes <= 0 {
		return false, "BAD_LIMIT"
	}
	if body == "" {
		return false, "EMPTY"
	}
	if len(body) > maxBytes {
		return false, "TOO_LONG"
	}
	return true, ""
}

func ValidateMessage(kind, body string, maxBytes int) (bool, string) {
	if kind != "single" && kind != "group" {
		return false, "BAD_KIND"
	}
	return ValidateText(body, maxBytes)
}
```

先写最小测试文件 `history/validate_test.go`：

```go
package history

import "testing"

func TestValidateTextAtLimit(t *testing.T) {
	gotOK, gotReason := ValidateText("你好", 6)
	if gotOK != true || gotReason != "" {
		t.Errorf("ValidateText(你好, 6) = (%v, %q), want (true, empty)",
			gotOK, gotReason)
	}
}
```

`_test.go` 结尾让 `go test` 将该文件编译进测试程序，普通包构建不会运行这个测试。`import "testing"` 引入标准库测试支持。`func TestValidateTextAtLimit(t *testing.T)` 的名称符合 `TestXxx` 形式；`t` 指向当前测试的 `testing.T`，负责标记失败和报告信息。`t.Errorf` 中的 `got`、`want` 使差异可检查，不负责修复代码。

学习者具备自己的 Go 环境后，可在模块根目录运行 `go test ./history` 检查该包，或用 `go test ./...` 检查模块下各包。这里描述命令的作用，没有执行它们；“按规则应通过”是静态推导，不是测试运行记录。

### 同包与外部包测试

本例的 `package history` 测试能访问同包未导出名字。若想只从外部调用者视角检查公开 API，可以写 `package history_test`，再显式导入 `example.com/imhistory/history`。两种组织方式都可用；选择取决于要观察内部规则还是公开契约，不能仅凭测试文件名推断是哪一种。

## 三、失败报告决定怎样继续检查

`t.Error`/`t.Errorf` 记录失败后，当前测试函数继续运行。`t.Fatal`/`t.Fatalf` 记录失败后，当前测试函数或当前子测试立即停止；其他独立测试仍可继续。何时用哪一个，由**后续断言是否依赖前一步成功**决定。

```go
h, err := New("c-a")
if err != nil {
	t.Fatalf("建立会话失败：%v", err) // h 不可用，后面不能继续。
}

got := h.ConversationID()
if got != "c-a" {
	t.Errorf("ConversationID() = %q, want c-a", got)
}
if len(h.Messages()) != 0 {
	t.Errorf("新会话消息数 = %d, want 0", len(h.Messages()))
}
```

最后两个断言在 `h` 已建立后相互独立，用 `Errorf` 可一次报告两处差异。若 `New` 已失败却继续访问 `h`，后续报错可能只是连锁噪声。`Fatalf` 只结束当前测试流程，不表示整个测试进程立即停止。

好的失败信息至少包含**哪条输入、实际值、预期值、必要的初始状态**。只写 `t.Error("wrong")` 很难判断是文本上限、会话种类还是状态变化。下面是一个**假想**失败，不是本轮执行输出：

```text
--- FAIL: TestValidateMessage/六字节边界
    validate_test.go:29: kind=single body="你好" max=6: got=(false,"TOO_LONG"), want=(true,"")
```

它指向 6 字节边界。下一步应核对需求和实现是否把 `>=` 写成了 `>` 的反面，或是否错误地按码点而非字节计数；不能只把测试期望改成当前输出。

`go test -run TestValidateMessage` 可筛选名称，`go test -v ./history` 可显示更细的测试运行信息。这些是学习者日后执行的命令说明，不是当前的运行证据。

## 四、表驱动与子测试把决策表变成代码

一个测试不必只放一组输入。`[]struct{...}` 是结构体切片，每个元素独立写出名称、输入和预期；`for _, tc := range cases` 逐项取值；`t.Run` 为每项建立有名字的子测试。关键仍是**先从需求选案例**，表驱动本身不会自动补齐边界。

```go
package history

import "testing"

func TestValidateMessage(t *testing.T) {
	cases := []struct {
		name, kind, body string
		maxBytes         int
		wantOK           bool
		wantReason       string
	}{
		{"单字节通过", "single", "a", 6, true, ""},
		{"六字节边界", "single", "你好", 6, true, ""},
		{"九字节超限", "single", "你好呀", 6, false, "TOO_LONG"},
		{"空正文", "group", "", 6, false, "EMPTY"},
		{"空格不裁剪", "single", " ", 6, true, ""},
		{"无效上限", "single", "a", 0, false, "BAD_LIMIT"},
		{"未知种类优先", "other", "", 0, false, "BAD_KIND"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			gotOK, gotReason := ValidateMessage(tc.kind, tc.body, tc.maxBytes)
			if gotOK != tc.wantOK || gotReason != tc.wantReason {
				t.Errorf("kind=%q body=%q max=%d: got=(%v,%q), want=(%v,%q)",
					tc.kind, tc.body, tc.maxBytes,
					gotOK, gotReason, tc.wantOK, tc.wantReason)
			}
		})
	}
}
```

每个案例名唯一，失败时能定位到 `TestValidateMessage/未知种类优先`。本例不调用 `t.Parallel`；普通子测试按顺序执行，案例也没有共享可变状态。不同 Go 版本对循环变量的闭包捕获规则曾有差异；本章的子测试同步完成，且使用教学模块 Go 1.25 的语义。学习并行测试时再单独审查变量捕获与共享状态。

表格中 `"你好"` 是 6 字节，`"你好呀"` 是 9 字节。若只测试 `"hello"`，就无法发现某人把“字节上限”误改成“字符上限”。单独增加几十个普通 ASCII 字符串，也不能替代等于上限、刚超过上限和多种错误同时成立的案例。

## 五、失败路径还要检查状态

纯 `ValidateMessage` 没有副作用；历史对象的 `Add` 会改变切片。01.09 的 `History.Add` 规定同一会话消息 ID 重复时返回 `ErrDuplicateMessage`，且原消息保持不变。一个测试若只断言 `err != nil`，实现仍可能先覆盖或追加，再返回错误。

下面的 `history/history_test.go` 片段沿用 01.09 的 `History` 和 `Message`。固定时刻使预期不依赖执行当天的本机时间：

```go
package history

import (
	"errors"
	"reflect"
	"testing"
	"time"
)

func TestAddDuplicateKeepsHistory(t *testing.T) {
	h, err := New("c-a")
	if err != nil {
		t.Fatalf("New(c-a): %v", err)
	}
	createdAt := time.Date(2026, 9, 23, 9, 30, 0, 0, time.UTC)
	first := Message{ID: "m-a", SenderID: "u-a", Body: "原文", CreatedAt: createdAt}
	if err := h.Add(first); err != nil {
		t.Fatalf("首次 Add(m-a): %v", err)
	}
	before := h.Messages()

	repeated := Message{ID: "m-a", SenderID: "u-b", Body: "覆盖企图", CreatedAt: createdAt}
	err = h.Add(repeated)
	if !errors.Is(err, ErrDuplicateMessage) {
		t.Errorf("重复消息错误 = %v, want ErrDuplicateMessage", err)
	}
	if after := h.Messages(); !reflect.DeepEqual(after, before) {
		t.Errorf("重复消息改变历史：before=%+v after=%+v", before, after)
	}
}
```

测试先成功加入一条消息，再保存 `before`，然后提交相同 ID 的第二条。它独立检查**错误身份**和**公开可观察状态**。`Messages()` 返回副本，所以 `before` 不会因为内部切片后续追加而被悄悄改写。这个案例只证明同一内存对象的会话内重复规则；跨进程、网络重试和服务端去重需要以后各自的契约与测试。

再练一个非法输入：在新建的 `History` 中提交空 ID，预期 `ErrInvalidMessage`，同时消息数仍为 0。每个案例重新创建初始对象，避免上一个测试留下的消息影响下一个。若初始对象本来已坏，“拒绝后不再改变”也不表示程序已修复坏状态。

## 六、单元、集成和端到端分别观察哪里

测试名称不能扩大证据范围。按本章的观察边界，可分为：

| 层次 | 本章示例 | 可支持的结论 | 仍缺什么 |
|---|---|---|---|
| 单元 | `ValidateMessage` 输入与返回 | 这些本地规则对已执行用例的结果 | 文件、网络、权限 |
| 本地集成 | `historyfile.Save` 与 `Load` 配合临时文件 | 这些领域值、JSON 和本机文件协作 | 崩溃恢复、数据库、服务端 |
| 端到端 | 未来从客户端发请求并观察目标用户可见消息 | 仅按实际接入和观察到的链路判断 | 未纳入的故障与设备情形 |

Go 的 `t.TempDir()` 可给每个测试提供临时目录，测试结束后由框架清理。如下片段**放在** `internal/historyfile/file_test.go`，与 01.09 的文件适配器同包；真实学习时需要在个人模块中准备 01.09 的源文件：

```go
package historyfile

import (
	"path/filepath"
	"testing"
	"time"

	"example.com/imhistory/history"
)

func TestSaveThenLoadLocalHistory(t *testing.T) {
	path := filepath.Join(t.TempDir(), "history-c-a.json")
	h, err := history.New("c-a")
	if err != nil {
		t.Fatalf("New(c-a): %v", err)
	}
	message := history.Message{
		ID: "m-a", SenderID: "u-a", Body: "你好",
		CreatedAt: time.Date(2026, 9, 23, 9, 30, 0, 0, time.UTC),
	}
	if err := h.Add(message); err != nil {
		t.Fatalf("准备消息：%v", err)
	}
	if err := Save(path, h); err != nil {
		t.Fatalf("Save: %v", err)
	}
	loaded, err := Load(path, 1<<20)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if loaded.ConversationID() != "c-a" || len(loaded.Messages()) != 1 {
		t.Errorf("读回会话=%q 消息数=%d, want c-a/1",
			loaded.ConversationID(), len(loaded.Messages()))
	}
}
```

这个测试若实际运行，只说明本地文件往返的这些断言满足；它还应增加“文件不存在”“JSON 损坏”“超出大小上限”“错误版本”等独立场景。`Save` 直接覆盖文件，不具有崩溃原子更新保证。这里没有运行数据库或 OpenIM，也没有调用网络接口。

阅读固定的 [OpenIM `SendMsg` 入口](https://github.com/openimsdk/open-im-server/blob/f6411a8a1a31d3df36f4c2b3ad28481a94141e1f/internal/rpc/msg/send.go)时，可把“缺失输入”和“未知会话种类”的已核对局部规则作为源码阅读问题。即使将来为这些分支写测试，也只有实际连接、执行并观察的边界才能形成测试证据；不能从本章的本地校验测试推断该项目消息已入队、落库或送达。

## 七、覆盖率与稳定性只回答各自的问题

`go test -cover ./history` 是学习者未来可以运行的覆盖率命令。覆盖率报告代码被测试执行到的范围；它不说明预期一定正确、业务规则全部覆盖或断言足够强。一个测试即使执行了长度判断，如果从不检查返回结果，仍可能得到很高的覆盖率并漏掉“等于上限应通过”。

稳定性也依赖输入可控。测试中直接使用 `time.Now()`，预期若写死一个时刻，就会随运行时间变化；本章改用明确的 `time.Date(..., time.UTC)`。随机消息 ID、全局可变切片或共用临时路径也可能使案例互相影响。先让每个案例有独立初始值；需要模拟时钟、文件故障或网络时，在 10.04 再学习替身与注入。

本章没有调用 `t.Parallel`，也没有运行 race detector 或模糊测试。它们分别需要共享状态、并发和属性验证的前置，安排在 10.07。测试报告应保留命令、被测版本、环境、输入、预期、实际和未覆盖的边界；只阅读教材时，“实际”应标记为**未运行**。

## 八、综合：上限从 6 字节改为 9 字节

设需求正式把 `maxBytes` 从 6 调为 9。测试先改的，是**需求指定的调用输入与预期**，不是为了迎合旧实现而改断言。列出回归矩阵：

| 场景 | 旧上限 6 | 新上限 9 | 是否需要保留 |
|---|---|---|---|
| `"你好"`，6 字节 | 通过 | 通过 | 是，保护旧合法输入 |
| `"你好呀"`，9 字节 | `TOO_LONG` | 通过 | 是，验证本次变化 |
| 10 字节 ASCII | `TOO_LONG` | `TOO_LONG` | 是，保护新上界 |
| 空正文 | `EMPTY` | `EMPTY` | 是，规则未改变 |
| 未知种类且上限无效 | `BAD_KIND` | `BAD_KIND` | 是，优先级未改变 |
| 被拒绝的历史写入 | 原状态不变 | 原状态不变 | 是，失败承诺未改变 |

在 `ValidateMessage` 的表驱动测试里，新增“9 字节通过”“10 字节拒绝”，并保留种类和空文本的例子。若仍使用 6 字节旧实现，**假想**失败会指出 9 字节案例的 `got=(false,"TOO_LONG")` 与 `want=(true,"")`。修正实现或传入的新配置之后，需要由学习者实际执行同一测试范围，再记录结果。本轮教材只有静态推导，不能填“已通过”。

### 分层练习：每题先写预测，再看反馈

<details><summary>1. 测试文件放在哪里？</summary>

与被测包同目录，文件名以 `_test.go` 结尾，例如 `history/validate_test.go`。</details>

<details><summary>2. `package history_test` 和 `package history` 的区别？</summary>

前者从外部调用者视角导入公开 API；后者与生产代码同包，可访问包内未导出名字。</details>

<details><summary>3. `TestXxx` 的参数为什么是 `*testing.T`？</summary>

它指向测试上下文，提供报告失败、命名子测试等能力；测试函数本身不返回 `bool` 表示成功。</details>

<details><summary>4. `t.Errorf` 后，当前测试函数还会继续吗？</summary>

会；测试已标记失败，但后续独立断言仍可执行。</details>

<details><summary>5. 什么时候用 `t.Fatalf`？</summary>

当前测试无法安全继续时，例如 `New` 失败导致后续对象不可用；它不会终止所有独立测试。</details>

<details><summary>6. 为什么只测试 5 和 7 字节不足以发现等号写错？</summary>

`>6` 与 `>=6` 在 5、7 上可能给相同结果；恰好 6 字节的案例才区分两种规则。</details>

<details><summary>7. `"你好"` 按本章规则占几个字节？</summary>

UTF-8 编码下为 6 字节；本章上限为 6 时应通过。</details>

<details><summary>8. 空格正文是否按空文本拒绝？</summary>

不应。10.01 选择原始字符串非空且不自动裁剪；一个空格占 1 字节。</details>

<details><summary>9. `kind=other, body="", max=0` 的预期原因？</summary>

`BAD_KIND`。分类检查优先于上限与空文本。</details>

<details><summary>10. 表驱动会自动产生好的用例吗？</summary>

不会。它只组织案例；边界、反例和预期仍要从需求推导。</details>

<details><summary>11. 为什么每条子测试最好有唯一名称？</summary>

失败报告才能清楚指向具体规则；同名案例会增加定位负担。</details>

<details><summary>12. 只检查 `err != nil` 就能证明重复消息未覆盖旧正文吗？</summary>

不能。还要比较操作前后的可观察历史，确认原消息正文和消息数不变。</details>

<details><summary>13. 为什么 `errors.Is(err, ErrDuplicateMessage)` 比比较文案合适？</summary>

它按稳定错误身份判断，能识别按 `%w` 包装后的原因；文案可能改变。</details>

<details><summary>14. `t.TempDir()` 的本地文件测试覆盖网络吗？</summary>

不覆盖。它只观察本机文件适配器与领域值协作。</details>

<details><summary>15. 端到端测试为何不能由函数名决定？</summary>

要看是否真的经过用户目标涉及的入口、依赖与可见结果；只调用一个名为 `Send` 的函数不够。</details>

<details><summary>16. 覆盖率 100% 是否证明上限需求正确？</summary>

不证明。即使执行每行代码，预期可能写错或没有断言关键边界。</details>

<details><summary>17. 需求从 6 改 9，至少新增哪两个边界？</summary>

9 字节应通过，10 字节应拒绝；还要保留 6 字节通过和其他未变规则。</details>

<details><summary>18. 测试失败时能否把 `want` 改成当前 `got`？</summary>

先核对需求。只有需求确实改变，预期才应更新；否则这样做会掩盖实现错误。</details>

<details><summary>19. 教材给出的假想 FAIL 报告算真实执行证据吗？</summary>

不算。个人记录中的“实际结果”应写未运行，直到自己执行并保存输出。</details>

<details><summary>20. 本地校验测试能证明 OpenIM 已送达消息吗？</summary>

不能。它只覆盖虚构教学函数的已观察边界；服务端和设备状态需要另行接入与验证。</details>

## 来源与下一步

- [Go `testing` 包](https://pkg.go.dev/testing)与[官方测试教程](https://go.dev/doc/tutorial/add-a-test)：文件命名、测试函数和失败报告。
- [Go 子测试说明](https://go.dev/blog/subtests)：`t.Run` 的组织和执行边界。
- [Go 覆盖率文档](https://go.dev/doc/build-cover)：覆盖率能提供的执行范围证据。
- [Learn Go with Tests](https://quii.gitbook.io/learn-go-with-tests/go-fundamentals/hello-world)：以小测试驱动学习 Go 的教学顺序参考。

下一章 10.04 会讲替身与依赖注入；01.12 再把本地历史工具组织成完整 CLI，记录真实执行范围。学习者先用本章规则在自己的目录完成 6/9/10 字节变式，并把“预期”“实际”“未覆盖范围”分开记录。
