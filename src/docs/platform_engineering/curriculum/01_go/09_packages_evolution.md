---
title: 01.09 包设计与依赖演进：让消息规则和文件细节各守边界
icon: /assets/icons/article.svg
order: 10
date: 2026-09-24
---

[返回第一卷](./README.md) · [上一章：常用标准库协作](./08_standard_library.md)

# 01.09 包设计与依赖演进：让消息规则和文件细节各守边界

> DeepTutor 原稿经技术和教学审阅后的章节。示例目录、程序和结果均为静态推导；本次没有执行 Go 程序、测试或站点构建。

## 本章从哪里开始

01.08 已把虚构会话 `c-a` 的消息历史编码为本地 JSON，并分别处理了解码、验证、大小限制和覆盖写入。若校验规则、文件读写和命令行参数都留在 `main.go`，增加一个业务条件就可能碰到文件格式，改变文件格式也可能误改消息规则。我们要让不同原因引起的变化落在清楚的位置。

本章使用三个职责：`history` 定义消息规则，`internal/historyfile` 负责本机 JSON，`cmd/historytool` 处理命令参数并组合前两者。它们只代表教学工具的局部能力；本机文件不是服务端权威历史，写入成功也不是设备接收或已读。

| 阅读层次 | 先回答的问题 | 最后留下的成果 |
|---|---|---|
| 起步 | 目录、包、导入路径、模块各是什么？ | 能沿目录树找到一个调用的定义 |
| 原理 | 哪些名字可以被其他包使用？ | 能画出 `cmd → historyfile → history` |
| 工程 | 导入环和 `internal` 怎样限制依赖？ | 能把循环拆到上层编排 |
| 深化 | 模块版本、文件版本和 API 兼容如何区分？ | 能审查一次格式变更的影响 |

先修是 01.01–01.08：函数、结构体、方法、接口、`error`、JSON、文件与 `flag`。测试框架、网络、数据库和并发不作为本章前提。

## 一、从一个越来越忙的 `main.go` 出发

本地历史工具最初可能只有一个命令：读取 `history-c-a.json`，找出 `u-a` 的消息并打印正文。入口同时解析 `-path`，打开文件，检查字节上限，解码 JSON，验证消息 ID，筛选发送者，最后输出。需求增加“只读旧格式”或“正文为空时拒绝”，都要修改同一个文件。

问题不是文件行数。我们先按**变化原因**给步骤分类：

| 步骤 | 谁提出变化 | 合适的归属 |
|---|---|---|
| 消息 ID 在会话内不能重复 | 消息规则 | `history` |
| JSON 的 `created_at` 字段如何解析 | 文件格式 | `historyfile` |
| 从哪个路径读取，错误打印在哪里 | 命令使用方式 | `cmd/historytool` |

这三个位置并非三个进程，也不代表必须部署三个服务。它们是同一 Go 模块中的包。包边界让调用者只看到需要的能力，并让文件格式可以改变而不迫使消息规则导入 `os` 或 `encoding/json`。

## 二、目录、包、导入路径和模块

先看一个完整的**教学目录示意**。`example.com/imhistory` 只是示例模块路径，没有指向要下载的真实依赖。

```text
imhistory/
├── go.mod                         module example.com/imhistory
├── history/
│   └── history.go                 package history
├── internal/
│   └── historyfile/
│       └── file.go                 package historyfile
└── cmd/
    └── historytool/
        └── main.go                 package main
```

**目录**是文件所在位置，例如 `history/`。**包**是同一个目录中一起编译的 Go 源文件所声明的代码单元，例如 `package history`。一个目录的普通源文件使用同一个包名；导入的是包，不是某个 `.go` 文件。**模块**由根目录的 `go.mod` 声明，它是版本和依赖管理的单元，可以包含多个包。

**导入路径**定位一个包：模块路径加上模块内的相对目录。因而 `history/` 的路径是 `example.com/imhistory/history`，文件适配器的路径是 `example.com/imhistory/internal/historyfile`。源文件写：

```go
import "example.com/imhistory/history"
```

使用导出名字时写 `history.Message`。通常代码中使用的包名来自被导入文件的 `package history` 声明；目录名和包名通常保持一致，便于阅读，但它们并非同一概念。`package main` 的目录构成命令程序入口；领域包不应导入它。

| 名称 | 回答的问题 | 本例 |
|---|---|---|
| 目录 | 文件在磁盘何处？ | `history/` |
| 包名 | 源码里如何称呼这组声明？ | `package history` |
| 导入路径 | 其他包怎样定位它？ | `example.com/imhistory/history` |
| 模块路径 | 这一组包的版本根路径是什么？ | `example.com/imhistory` |

### 从导出规则到公开 API

Go 根据标识符首字母是否为大写决定它能否从其他包访问。`Message`、`New`、`Add` 可以导出；`messages`、`validateMessage` 只能在同包使用。导出的是**名字的访问能力**，不自动保证方法安全、输入合法或数据持久。

一个公开字段也会扩大兼容责任。若写 `type History struct { Messages []Message }`，外部代码可直接追加、删除、重排，跳过 `Add` 的重复检查。将切片设为小写字段，再通过 `Messages()` 返回副本，调用方仍能读取，却不能借这个返回切片改写内部元素。消息的 `ID`、`SenderID`、`Body` 等若导出，则字段名和含义也进入 API 契约。

公开前可问三个问题：谁要调用它？输入、输出和失败意义是否明确？以后实现改变时能否继续履行同一意义？没有实际第二种实现时，不必因为“将来也许换存储”就立刻导出一个大接口。

## 三、让领域包只认识消息规则

以下是 `history/history.go` 的完整教学文件。它只依赖 `errors` 和 `time`；时间在这里是领域值，不是 JSON 字段格式。消息 ID 按**当前会话内唯一**检查，`Add` 只改变当前进程的内存对象。

```go
package history

import (
	"errors"
	"time"
)

var (
	ErrInvalidConversation = errors.New("会话身份不能为空")
	ErrInvalidMessage      = errors.New("消息字段不完整")
	ErrDuplicateMessage    = errors.New("消息在本会话内已存在")
)

type Message struct {
	ID        string
	SenderID  string
	Body      string
	CreatedAt time.Time
}

type History struct {
	conversationID string
	messages       []Message
}

func New(conversationID string) (*History, error) {
	if conversationID == "" {
		return nil, ErrInvalidConversation
	}
	return &History{conversationID: conversationID}, nil
}

func (h *History) ConversationID() string {
	if h == nil || h.conversationID == "" {
		return ""
	}
	return h.conversationID
}

func (h *History) Add(message Message) error {
	if h == nil || h.ConversationID() == "" {
		return ErrInvalidConversation
	}
	if message.ID == "" || message.SenderID == "" ||
		message.Body == "" || message.CreatedAt.IsZero() {
		return ErrInvalidMessage
	}
	for _, old := range h.messages {
		if old.ID == message.ID {
			return ErrDuplicateMessage
		}
	}
	h.messages = append(h.messages, message)
	return nil
}

func (h *History) Messages() []Message {
	if h == nil {
		return nil
	}
	return append([]Message(nil), h.messages...)
}
```

`New` 保证有效的会话身份；`Add` 在修改前完成检查，重复时保持原切片不变。`Messages` 返回切片副本，调用者重排或替换其中的元素不会修改 `History` 内部切片。不过 `Message` 中目前只有字符串和 `time.Time` 值；以后若加入指针、map 或切片字段，仅复制外层切片不能保证所有嵌套数据独立，需要重新审查复制契约。

`ErrInvalidMessage` 和 `ErrDuplicateMessage` 是调用方可用 `errors.Is` 判断的身份。错误文字只是给人阅读的说明。`history` 没有 `Load(path)`，因为它不知道路径和 JSON；也没有 `flag.Parse`，因为它不知道命令入口。将来出现服务端消息规则时，应重新定义可信身份、授权和同步契约，不能把这个内存模型直接当作线上实现。

## 四、让文件适配器承担 JSON 和路径

领域消息使用 `time.Time`；本地文件使用 RFC3339 文本。中间需要一个**文件结构**，它是编码格式的一部分，不能直接把 `History` 的私有切片丢给 `json.Marshal`。下面的 `wireFile` 和 `wireMessage` 只在文件适配器包内可见。

```go
package historyfile

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"time"

	"example.com/imhistory/history"
)

type wireFile struct {
	Version        int           `json:"version"`
	ConversationID string        `json:"conversation_id"`
	Messages       []wireMessage `json:"messages"`
}

type wireMessage struct {
	ID        string `json:"id"`
	SenderID  string `json:"sender_id"`
	Body      string `json:"body"`
	CreatedAt string `json:"created_at"`
}

func Load(path string, maxBytes int64) (*history.History, error) {
	if maxBytes <= 0 || maxBytes > 1<<30 {
		return nil, errors.New("文件上限超出本工具允许范围")
	}
	f, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("打开本地历史 %q：%w", path, err)
	}
	defer f.Close()

	data, err := io.ReadAll(io.LimitReader(f, maxBytes+1))
	if err != nil {
		return nil, fmt.Errorf("读取本地历史 %q：%w", path, err)
	}
	if int64(len(data)) > maxBytes {
		return nil, fmt.Errorf("本地历史超过 %d 字节", maxBytes)
	}

	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	var file wireFile
	if err := decoder.Decode(&file); err != nil {
		return nil, fmt.Errorf("解析本地历史：%w", err)
	}
	var extra any
	if err := decoder.Decode(&extra); err != io.EOF {
		if err == nil {
			return nil, errors.New("本地历史包含第二个 JSON 值")
		}
		return nil, fmt.Errorf("本地历史尾部无效：%w", err)
	}
	if file.Version != 1 {
		return nil, fmt.Errorf("不支持历史文件版本 %d", file.Version)
	}

	h, err := history.New(file.ConversationID)
	if err != nil {
		return nil, fmt.Errorf("会话字段无效：%w", err)
	}
	for index, record := range file.Messages {
		createdAt, err := time.Parse(time.RFC3339, record.CreatedAt)
		if err != nil {
			return nil, fmt.Errorf("第 %d 条消息时间无效：%w", index+1, err)
		}
		message := history.Message{
			ID: record.ID, SenderID: record.SenderID,
			Body: record.Body, CreatedAt: createdAt,
		}
		if err := h.Add(message); err != nil {
			return nil, fmt.Errorf("第 %d 条消息无效：%w", index+1, err)
		}
	}
	return h, nil
}

func Save(path string, h *history.History) error {
	if h == nil || h.ConversationID() == "" {
		return errors.New("没有可保存的历史")
	}
	messages := h.Messages()
	file := wireFile{
		Version: 1, ConversationID: h.ConversationID(),
		Messages: make([]wireMessage, 0, len(messages)),
	}
	for _, message := range messages {
		file.Messages = append(file.Messages, wireMessage{
			ID: message.ID, SenderID: message.SenderID,
			Body: message.Body,
			CreatedAt: message.CreatedAt.UTC().Format(time.RFC3339Nano),
		})
	}
	data, err := json.MarshalIndent(file, "", "  ")
	if err != nil {
		return fmt.Errorf("编码本地历史：%w", err)
	}
	if len(data) > 1<<20 {
		return errors.New("导出的本地历史超过 1 MiB")
	}
	if err := os.WriteFile(path, data, 0o600); err != nil {
		return fmt.Errorf("写入本地历史 %q：%w", path, err)
	}
	return nil
}
```

这个文件只依赖 `history`；`history` 不导入 `historyfile`。`Load` 在文件打开后承担关闭责任，先用 `maxBytes+1` 区分“刚好等于上限”和“超限”，再严格解码并由 `history.New`、`Add` 判断领域规则。任一记录失败时不会返回部分历史。`Save` 从领域值生成文件结构，先编码后覆盖写入。

`Save` 将时刻规范化为 UTC，并使用 `RFC3339Nano` 保留可表示的亚秒精度；`Load` 的 RFC3339 解析器接受带小数秒的文本。示例导出上限为 1 MiB，编码后先检查大小再触碰目标文件。`os.WriteFile` 可能先截断已有文件，中途出错可能留下部分内容；返回 `nil` 也不承诺崩溃后的原子恢复或稳定介质。课程此处关注**包边界**，可靠文件更新与服务端持久化需要另立契约。

### 命令入口只做编排

`cmd/historytool` 可同时导入领域包和文件适配器。它读取用户给出的 `-path`、`-max-bytes`，调用 `Load`，决定“文件不存在”在这个命令里是否代表新会话，再展示或保存结果。`flag` 的全局解析适合单一小命令；以后有多子命令时再引入 `FlagSet`。

```go
package main

import (
	"errors"
	"flag"
	"fmt"
	"io/fs"
	"os"

	"example.com/imhistory/history"
	"example.com/imhistory/internal/historyfile"
)

func run() error {
	path := flag.String("path", "history-c-a.json", "本地历史文件")
	maxBytes := flag.Int64("max-bytes", 1<<20, "最大读取字节数")
	flag.Parse()
	if *path == "" || *maxBytes <= 0 || flag.NArg() != 0 {
		return errors.New("命令行参数无效")
	}

	h, err := historyfile.Load(*path, *maxBytes)
	if errors.Is(err, fs.ErrNotExist) {
		h, err = history.New("c-a") // 本命令的首次使用规则。
	}
	if err != nil {
		return err
	}
	fmt.Println("会话", h.ConversationID(), "本地消息数", len(h.Messages()))
	return nil
}

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
```

入口决定“首次使用可得到空历史”只是这个命令的策略；其他调用者可以把文件不存在作为错误。领域包无需知道文件或命令行，所以可以被另一个入口复用。示例中的 `main` 只读取并报告，不调用 `Save`；`Save` 是供导出动作使用的适配器能力。

## 五、循环导入与 `internal` 的边界

若 `history` 为了提供 `Load(path)` 导入文件包，而文件包又为了返回 `history.Message` 导入领域包，依赖成为 `history → historyfile → history`。Go 拒绝包级导入环；把函数移到同包的另一个 `.go` 文件并不能消除环，因为编译关系仍在两个包之间。

本章采用上层编排：`cmd/historytool` 调用 `historyfile.Load`，文件包调用 `history.New` 和 `Add`。也可以在调用者确实需要第二种实现时，于使用方定义小接口，让具体适配器提供相同的方法。接口表达调用者所需能力，不能靠接口名字本身解决错误的职责划分。

`internal` 是 Go 工具链的导入范围限制。位于 `imhistory/internal/historyfile` 的包可被 `imhistory` 目录树内的代码导入，外部目录树中的代码不可以。它适合放尚未承诺给外部使用者的文件格式实现；它不验证运行时用户身份，也不控制用户能否读取磁盘文件。

一个改动的定位练习：若要把文件格式改成另一种 JSON 字段命名，改 `historyfile` 的文件结构与兼容读取；若要拒绝空发送者，改 `history.Add` 的规则；若要新增 `-path` 别名，改命令入口。遇到两处都要改时，先检查这是否是跨边界的契约变更。

## 六、模块版本与文件版本分别管理什么

`go.mod` 第一行的 `module` 声明模块路径；`go` 指令说明所需的 Go 语言版本语义；`require` 列出本模块所需其他模块的版本。当前教学目录只用标准库，因此最小的 `go.mod` 可以是：

```text
module example.com/imhistory

go 1.25
```

实际项目的 `require` 图可能包含间接依赖，不能把 `go.mod` 简化为“只列自己直接导入的模块”。Go 的**最小版本选择**不是选择网络上最新版本，也不是取所有要求中最低的那个：如果依赖图对同一模块分别要求至少 `v1.3.0` 与至少 `v1.6.0`，构建列表会选择 `v1.6.0`。具体构建还应连同 `go.sum` 和工具链行为核对；本章只建立读懂依赖图的前置，不执行下载或升级命令。

语义版本写作 `vMAJOR.MINOR.PATCH`。`PATCH` 通常用于兼容修复，`MINOR` 用于兼容新增能力，`MAJOR` 表示可能破坏已有 API。Go 模块的 v2 及以上主版本通常要在模块路径中加入 `/v2` 这样的后缀；旧代码的导入路径不会因为安装了新版本就自动变成新 API。版本号是对使用者的兼容承诺，实际改动仍需按契约审阅。

本地 JSON 的 `"version": 1` 管的是**数据格式**。模块可以发布新补丁而继续读写文件 v1；也可以在保持 Go API 兼容时新增文件 v2。两个版本轴分开记录：

| 版本 | 管什么 | 使用者关心什么 |
|---|---|---|
| 模块 `v1.4.0` | Go 包的代码与依赖 | 旧调用方是否还能导入、编译并保持约定行为 |
| 文件 `version: 1` | JSON 字段与语义 | 旧文件能否读，新文件能否被旧程序读 |

## 七、审查兼容变更：源码、行为、数据与发布顺序

假设要为消息增加 `EditedAt`。它可能涉及 `history.Message` 字段、JSON 的 `edited_at`、旧文件的默认解释和界面的排序。不能只因 `json.Unmarshal` 返回 `nil` 就说升级完成。

| 变更 | 源码兼容 | 行为兼容 | 数据兼容 | 还要决定什么 |
|---|---|---|---|---|
| 新增 `EditedAt` | 命名字段字面量通常可继续用；位置式字面量可能失效 | “未编辑”与“时间未知”要区分 | v1 文件没有该字段 | 旧值如何转换 |
| `Save()` 改成 `Save(path) error` | 旧调用点需修改 | 失败由调用者处理 | 可保持文件格式 | 默认路径和迁移期 |
| 文件 v1 改 v2 | Go API 可保持 | 新增字段可能影响排序 | 旧程序未必会读 v2 | 升级与回退顺序 |
| 改错误文字 | 通常可编译 | 用户提示和脚本可能受影响 | 无直接影响 | 稳定错误身份是否保留 |

**源码兼容**问旧代码能否继续编译；**行为兼容**问同样输入是否仍有约定结果；**数据兼容**问磁盘旧记录能否正确解释；**发布顺序**问新旧程序共存期间谁会写出哪种格式。它们需要分别审查。

文件升级常采用“新程序先能读旧格式，再开始写新格式”。如果旧程序还会在回退时打开同一文件，新程序写出的 v2 可能使它失败，必须明确延后写新、保留旧格式或提供受控迁移。未知未来版本应返回清楚错误；不应猜测字段含义后覆盖原文件。这个决定与模块主版本是否为 v2 没有必然关系。

错误身份也是 API 的一部分。若调用方使用 `errors.Is(err, history.ErrDuplicateMessage)`，外层增加 `%w` 上下文仍可保留该识别；若把错误改成另一种新值，即使文字相同，旧分支也可能不再匹配。公开的 `Message` 字段、`New` 参数、`Add` 返回值和零值行为都应一起审查。

## 八、用一条 IM 需求检查包边界

需求：从 `history-c-a.json` 导入会话 `c-a`，拒绝重复消息，再显示本地消息数。沿上面的三个包追踪：

1. `main` 接收路径与最大字节数，并决定文件不存在时是否建立空历史。
2. `historyfile.Load` 打开并限量读取文件，严格解析 v1 JSON，将 RFC3339 文本变成 `time.Time`。
3. `history.New` 建立会话；每条记录经 `Add` 检查身份、正文、时间和会话内重复 ID。
4. 有任何错误时，适配器补充文件或行号上下文，入口决定如何展示；没有错误时入口读取 `Messages()` 的副本并报告数量。

这一流程只产生本机文件或内存状态的结论。它没有联系 OpenIM 服务端，也没有证明消息曾经被受理、持久化、交付或阅读。

阅读固定版本的 [OpenIM 消息存储接口](https://github.com/openimsdk/open-im-server/blob/f6411a8a1a31d3df36f4c2b3ad28481a94141e1f/pkg/common/storage/controller/msg.go)时，可以用同样的问题寻找边界：接口的使用者在哪个包？具体实现和构造函数在哪个包？错误由哪一层补充上下文？01.06 已核对该文件中的方法接口与构造函数返回接口值这一局部事实；本章没有进一步审计其包图、错误行为或可靠性保证。

### 分层练习：先预测，再核对

<details><summary>1. `history/` 目录与 `package history` 是同一件事吗？</summary>

不是。目录定位文件，`package` 声明编译单元的名字；保持一致是降低阅读成本的约定。</details>

<details><summary>2. `go.mod` 写 `module example.com/imhistory`，`history/` 的导入路径是什么？</summary>

`example.com/imhistory/history`；导入一个包，不导入 `history.go` 文件。</details>

<details><summary>3. `messages` 小写字段为何外部包不能直接赋值？</summary>

它是未导出标识符。调用者只能通过公开方法操作，因而不能绕开 `Add` 的检查。</details>

<details><summary>4. `Messages()` 返回切片副本，是否保证未来任何嵌套数据都独立？</summary>

不保证。当前元素由值字段组成；若后来含指针、map 或切片，还需重新审查复制深度。</details>

<details><summary>5. `history` 可以导入 `encoding/json` 吗？</summary>

语言上可以；本章的职责设计不需要。JSON 字段属于文件格式，应由 `historyfile` 负责。</details>

<details><summary>6. `history` 导入 `historyfile`，后者又导入 `history`，拆成四个文件能解决吗？</summary>

不能。循环发生在包依赖图上。将文件调用移到入口，恢复单向依赖。</details>

<details><summary>7. `internal/historyfile` 能被本模块的命令导入吗？</summary>

能，命令位于 `internal` 父目录树内；外部目录树不在允许范围内。</details>

<details><summary>8. `internal` 是否能阻止用户读取 JSON 文件？</summary>

不能。它只限制源码导入，不是运行时访问控制；文件权限另行决定。</details>

<details><summary>9. 什么时候值得给文件存储定义接口？</summary>

当某个调用者确实要依赖一组能力，并有明确实现替换或隔离需求时；接口在使用方按所需方法保持小。</details>

<details><summary>10. `History` 私有切片能直接交给 `json.Marshal` 得到全部消息吗？</summary>

不能依赖这一点。私有字段不会按默认 JSON 规则输出；文件适配器应构造明确的可导出文件结构。</details>

<details><summary>11. `Load` 返回文件不存在时，哪一层决定“新会话”？</summary>

本例由命令入口决定。文件适配器保留 `fs.ErrNotExist` 原因，其他入口可作不同决定。</details>

<details><summary>12. `Add` 拒绝重复后，已有切片怎样？</summary>

本章实现先检查再追加，因此原切片不变；这只覆盖同一内存对象内的会话键。</details>

<details><summary>13. `go.mod` 的模块版本能替代 JSON 的 `version` 吗？</summary>

不能。前者管理代码与导入兼容，后者管理磁盘记录的字段和含义。</details>

<details><summary>14. 两个依赖分别要求同一模块至少 v1.3 和 v1.6，会选哪一个？</summary>

在这个简化图里选 v1.6；这是依赖要求中的最高最低版本，不是自动选网络上的最新版本。</details>

<details><summary>15. 新增公开结构体字段一定源码兼容吗？</summary>

不一定。命名字段字面量通常继续可用，位置式字面量可能因字段数量改变而无法编译。</details>

<details><summary>16. 新程序能读旧文件，就能安全回退旧程序吗？</summary>

不能推断。若新程序已写出 v2，旧程序可能不认识它；要审查新旧读写矩阵和发布顺序。</details>

<details><summary>17. 只改错误文字，会影响 `errors.Is` 吗？</summary>

若保留同一个错误身份，`errors.Is` 仍可匹配；依赖原文字的脚本或展示则可能受影响。</details>

<details><summary>18. `Save` 返回 nil，是否代表崩溃后旧文件仍完整？</summary>

不代表。`os.WriteFile` 的覆盖过程不承诺原子替换或稳定介质；这要另设计。</details>

<details><summary>19. 本地文件缺少 `m-a`，能否断言服务端也没有？</summary>

不能。文件只是当前教学工具的一份本地记录；未定义服务端同步范围。</details>

<details><summary>20. 要支持另一种文件格式，先修改哪个包？</summary>

先在适配层定义新格式及兼容读取，再由入口选择；领域消息规则只在业务含义变化时调整。</details>

## 来源与下一步

- [Go 语言规范：包](https://go.dev/ref/spec#Packages)与[导出标识符](https://go.dev/ref/spec#Exported_identifiers)：包及跨包访问规则。
- [Go 模块参考](https://go.dev/ref/mod)与[依赖管理](https://go.dev/doc/modules/managing-dependencies)：模块路径、版本与选择规则。
- [Go 官方包名建议](https://go.dev/blog/package-names)：简短、清楚的包名如何帮助调用方阅读。

下一次把本地历史工具交给学习者独立实现时，再进入 01.12《完整命令行工具》。在此之前，10.02 的测试正文会补上实际结果与预期的核对方法；01.10–01.11 的泛型和反射留到需要它们的高级问题中学习。
