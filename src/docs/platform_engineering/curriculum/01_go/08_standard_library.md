---
title: 01.08 常用标准库协作：把本地消息历史变成可检查的记录
icon: /assets/icons/article.svg
order: 9
date: 2026-09-23
---

[返回第一卷](./README.md) · [上一章：错误与资源生命周期](./07_errors_resources.md)

# 01.08 常用标准库协作：把本地消息历史变成可检查的记录

> DeepTutor 原稿经技术和教学审阅后的章节。示例、路径和结果均为静态推导；没有执行 Go 程序、测试或站点构建。

## 本章要解决的业务问题

01.07 能把 `history-c-a.log` 当成字节读取，也能说明错误与关闭责任。仍有一个空缺：字节怎样成为一条可解释、可检查、可演进的消息记录？本章为虚构会话 `c-a` 建立一个小型本地文件契约，依次处理 JSON、时间、逐行导入、大小限制、覆盖写入和命令行参数。

本章的成功范围很窄：函数可以把一个小型本机文件读成已校验的内存值，或把已校验的内存值编码后交给 `os.WriteFile`。它不建立服务端历史、身份认证、加密、崩溃原子更新、稳定介质保证、并发写入协调或消息送达。

| 层次 | 要回答的问题 | 不能跳过的检查 |
|---|---|---|
| 字节和格式 | 字节怎样划分为记录？ | JSON 或 JSON Lines 的格式必须先选一个 |
| 解码 | 字节能否写入 Go 结构体？ | 语法、字段类型、未知字段和尾随值 |
| 业务 | 这条记录是否能加入 `c-a`？ | 版本、ID、正文、时间和重复规则 |
| 文件 | 输入输出是否在大小范围内？ | 读取上限、打开错误、覆盖写入边界 |
| 入口 | 用户给的参数是否合理？ | flag 解析后仍须验证 |

## 一、格式、模式与业务规则不是同一件事

内存里的消息是 `struct` 值；文件保存的是 `[]byte`。JSON 规定这些字节如何写成对象、数组、字符串和数字。**模式**再规定有哪些字段、字段如何命名；**业务规则**最后决定这些字段在本题中是否有效。

例如下面是语法正确的 JSON：

```json
{"conversation_id":"c-a","messages":[]}
```

它仍可能不符合课程文件：也许缺少版本，或者课程规则要求至少一条消息。反过来，正文含换行并不必然破坏一条 JSON 记录，因为换行可作为字符串中的 `\n` 表示；直接用逗号或竖线拼文本却会在正文包含相同符号时失去字段边界。

本章选一个单一 JSON 文档作为 `history-c-a.json` 的格式。JSON Lines（每个非空行一个 JSON 对象）会在后面作为另一种导入格式单独说明；数组文件和 JSON Lines 不能混读。

## 二、用结构体和 tag 写出文件契约

```go
type HistoryFile struct {
	Version        int             `json:"version"`
	ConversationID string          `json:"conversation_id"`
	Messages       []StoredMessage `json:"messages"`
}

type StoredMessage struct {
	ID        string `json:"id"`
	SenderID  string `json:"sender_id"`
	Body      string `json:"body"`
	CreatedAt string `json:"created_at"`
}
```

大写开头的 `Version`、`ConversationID` 等是导出字段，`encoding/json` 才能按默认反射规则读写它们。反引号中的 `json:"conversation_id"` 是结构体 tag：它把 Go 字段名映射为稳定的文件字段名。tag 不会验证非空、不会阻止重复、不会加密，也不会自动迁移旧版本。

本章文件契约如下：

1. `Version` 必须是 `1`。
2. `ConversationID`、每条 `ID`、`SenderID`、`Body` 都非空。
3. 同一文件内 `ID` 不重复。
4. `CreatedAt` 是带时区的 RFC3339 文本。

`Messages` 缺失、`null` 和空数组在 Go 中可能都需要额外判断，不能因为解码后得到一个零值切片就假设三者具有同一个业务含义。本章把顶层字段缺失或不符合规则视为导入失败；以后若支持旧版本，必须明确版本和迁移规则。

## 三、编码与解码之后仍要验证

`json.MarshalIndent` 把 Go 值变成带缩进的 JSON 字节；`json.Unmarshal` 把 JSON 字节写入传入指针指向的值。

```go
data, err := json.MarshalIndent(history, "", "  ")
if err != nil {
	return fmt.Errorf("编码本地历史失败：%w", err)
}

var decoded HistoryFile
if err := json.Unmarshal(data, &decoded); err != nil {
	return fmt.Errorf("解码本地历史失败：%w", err)
}
```

`&decoded` 是必需的：解码器要修改这个变量。`Unmarshal` 成功只说明 JSON 能转换到目标类型，不能证明文件版本正确、字段未缺失、消息不重复或时间可信。

对当前版本的本地导入，使用 `Decoder` 可明确拒绝未知字段：

```go
func decodeOneHistory(r io.Reader) (HistoryFile, error) {
	decoder := json.NewDecoder(r)
	decoder.DisallowUnknownFields()

	var history HistoryFile
	if err := decoder.Decode(&history); err != nil {
		return HistoryFile{}, fmt.Errorf("解码历史 JSON 失败：%w", err)
	}
	var extra interface{}
	if err := decoder.Decode(&extra); err != io.EOF {
		if err == nil {
			return HistoryFile{}, errors.New("历史文件含有第二个 JSON 值")
		}
		return HistoryFile{}, fmt.Errorf("历史文件尾部无效：%w", err)
	}
	if err := validateHistory(history); err != nil {
		return HistoryFile{}, err
	}
	return history, nil
}
```

第二次 `Decode` 的目的不是再读一条历史，而是确认第一个 JSON 值之后没有第二个对象、数组或损坏的尾随内容。`DisallowUnknownFields` 必须在第一次 `Decode` 前设置；它是当前严格格式的选择，不等于长期兼容策略。以后支持新字段时，应通过新版本或迁移规则决定接不接受它。

```go
func validateHistory(history HistoryFile) error {
	if history.Version != 1 || history.ConversationID == "" {
		return errors.New("历史版本或会话身份无效")
	}
	seen := make(map[string]bool)
	for index, message := range history.Messages {
		if message.ID == "" || message.SenderID == "" || message.Body == "" {
			return fmt.Errorf("第 %d 条消息字段不完整", index+1)
		}
		if seen[message.ID] {
			return fmt.Errorf("消息 %q 重复", message.ID)
		}
		seen[message.ID] = true
		if _, err := time.Parse(time.RFC3339, message.CreatedAt); err != nil {
			return fmt.Errorf("消息 %q 的时间无效：%w", message.ID, err)
		}
	}
	return nil
}
```

这个函数只验证本章的本地文件规则。通过验证不表示发送者身份真实，也不表示记录在全局顺序中可靠。

## 四、时间字段必须说明时区和格式

`time.Time` 表示一个时刻，显示它的字符串则是另一层事情。`2026-09-23T09:30:00Z` 末尾的 `Z` 表示 UTC；同一个时刻可以在其他时区显示成不同钟表时间。没有偏移量的文本不能自动说明是哪个用户所在地的时间。

```go
sentAt, err := time.Parse(time.RFC3339, "2026-09-23T09:30:00Z")
if err != nil {
	return fmt.Errorf("created_at 不符合 RFC3339：%w", err)
}
text := sentAt.Format(time.RFC3339)
```

Go 的 layout 不是 `yyyy-mm-dd` 占位符，而是参考时刻 `2006-01-02 15:04:05 -0700` 写成目标格式后的样子。`time.RFC3339` 是预定义布局，适合本章这种带数值偏移的记录契约。

若所有文本都固定为 UTC、使用同一 RFC3339 精度，文本字典序与时刻先后可在这个有限契约下相同；混合 `+08:00`、`Z` 或不同精度时，先解析为 `time.Time` 再比较。解析成功只说明格式合法，不能证明客户端报告的时间、消息顺序或身份可信。

## 五、JSON Lines、Scanner 与行大小

JSON Lines 是另一种格式：每个非空行恰好是一条 JSON 对象，而不是一个完整数组文件被随意换行。`bufio.Scanner` 默认按行扫描，并在 `Scan()` 后通过 `Bytes()` 给出不含行终止符的字节。循环结束后必须调用 `Err()`；否则读取失败或 token 过长可能被误当成正常结束。

```go
func scanMessages(r io.Reader, maxLineBytes int) ([]StoredMessage, error) {
	if maxLineBytes <= 0 {
		return nil, errors.New("每行上限必须为正数")
	}
	scanner := bufio.NewScanner(r)
	scanner.Buffer(make([]byte, 4*1024), maxLineBytes+1)

	var messages []StoredMessage
	for lineNo := 1; scanner.Scan(); lineNo++ {
		line := bytes.TrimSpace(scanner.Bytes())
		if len(line) == 0 {
			continue
		}
		if len(line) > maxLineBytes {
			return nil, fmt.Errorf("第 %d 行超过大小限制", lineNo)
		}
		var message StoredMessage
		if err := json.Unmarshal(line, &message); err != nil {
			return nil, fmt.Errorf("第 %d 行不是消息 JSON：%w", lineNo, err)
		}
		if message.ID == "" || message.Body == "" {
			return nil, fmt.Errorf("第 %d 行消息字段不完整", lineNo)
		}
		messages = append(messages, message)
	}
	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("逐行读取失败：%w", err)
	}
	return messages, nil
}
```

上限约束的是一整行序列化 JSON 字节，正文中的引号、反斜杠、时间字段和键名都会占用字节，不能只限制 `Body`。这个示例适合有明确上限的本地小文件；大对象、无限输入和网络流需要另一套流式策略。

## 六、读入上限与覆盖写入的边界

`io.LimitReader` 不会报告“原文件被截断”。若只读 `max` 字节，读到恰好 `max` 时无法知道原文件本来正好这么大，还是还有更多内容。因此多读一个字节，再明确拒绝：

```go
func readLimited(path string, max int) ([]byte, error) {
	if max <= 0 {
		return nil, errors.New("文件上限必须为正数")
	}
	f, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("打开历史文件失败：%w", err)
	}
	defer f.Close()

	data, err := io.ReadAll(io.LimitReader(f, int64(max+1)))
	if err != nil {
		return nil, fmt.Errorf("读取历史文件失败：%w", err)
	}
	if len(data) > max {
		return nil, fmt.Errorf("历史文件超过 %d 字节", max)
	}
	return data, nil
}
```

导出方向先在内存完成验证和编码，随后再覆盖写文件：

```go
func writeHistory(path string, history HistoryFile) error {
	if err := validateHistory(history); err != nil {
		return err
	}
	data, err := json.MarshalIndent(history, "", "  ")
	if err != nil {
		return fmt.Errorf("编码历史失败：%w", err)
	}
	if err := os.WriteFile(path, data, 0o600); err != nil {
		return fmt.Errorf("写入历史失败：%w", err)
	}
	return nil
}
```

文件不存在时 `WriteFile` 创建它；文件已存在时先截断后写入。`0o600` 是新建文件的权限请求，受系统 umask 影响，不会自动改变已存在文件的权限。写入包含多个系统调用，中途失败可留下截断或部分新内容。因此这里的 `nil` 只说明该调用按其语义完成，不能视为崩溃原子更新、稳定落盘、备份或多端同步保证。

## 七、`flag` 只收集入口输入

命令行 flag 也是不可信输入。定义完成后调用一次 `flag.Parse()`，再读取结果并验证；底层的 `readLimited`、`decodeOneHistory` 不应自行解析全局命令行状态。

```go
path := flag.String("path", "", "本地历史路径")
maxBytes := flag.Int("max-bytes", 1<<20, "允许读入的最大字节数")
format := flag.String("format", "json", "json 或 jsonl")
flag.Parse()

if flag.NArg() != 0 || *path == "" || *maxBytes <= 0 {
	return errors.New("命令行参数无效")
}
if *format != "json" && *format != "jsonl" {
	return fmt.Errorf("不支持格式 %q", *format)
}
```

在 `main` 中不能直接 `return error`，完整程序会把这段判断放进返回 `error` 的普通函数，再由 `main` 输出受控错误。默认值只是在调用者未给参数时提供初始值，不证明路径、大小或格式符合业务规则。多个子命令和可测试的解析逻辑将在包设计章节再用 `FlagSet` 展开。

## 八、综合路径与练习

导入单一 JSON 文件的顺序应是：参数验证 → `readLimited` → `decodeOneHistory` → `validateHistory` → 交给内存存储。导出顺序应是：验证内存值 → `MarshalIndent` → `WriteFile`。每一层保留自己的错误上下文，入口再决定对“文件不存在”“格式无效”采取什么行动。

| 路径 | 应得到的结论 |
|---|---|
| 文件比上限大 1 字节 | `readLimited` 拒绝；不能把前 `max` 字节当完整文件 |
| JSON 有未知键 | 当前严格导入拒绝；未来版本是否兼容须另立规则 |
| JSON 能解码但 ID 为空 | `validateHistory` 拒绝 |
| 时间没有 RFC3339 时区 | `time.Parse` 失败或不符合本章契约 |
| 写入中间失败 | 返回错误，旧文件可能已改变；不承诺原子恢复 |
| 本地导出成功 | 只说明本机写入调用成功，不说明服务端或设备状态 |

<details><summary>1. JSON 解码成功是否等于消息可用？</summary>
不是。还要检查版本、字段完整性、重复 ID、时间和业务规则。</details>

<details><summary>2. tag `json:"id"` 会阻止空 ID 吗？</summary>
不会。tag 只映射字段名；非空规则由 `validateHistory` 检查。</details>

<details><summary>3. 为什么 `Unmarshal` 的目标传 `&history`？</summary>
解码器需要写回变量；没有指针无法把字段更新到调用者变量。</details>

<details><summary>4. 为什么一次 Decode 后还要读一次？</summary>
确认没有第二个 JSON 值或损坏尾随内容，而不是把文件的其余字节悄悄忽略。</details>

<details><summary>5. 为什么 JSON 文件与 JSON Lines 不能混读？</summary>
前者是一个顶层文档，后者每行是独立对象；记录边界和解码方式不同。</details>

<details><summary>6. Scanner 循环结束后为什么要调用 Err？</summary>
Scan 返回 false 既可能是 EOF，也可能是读取失败或 token 过长；Err 才能区分。</details>

<details><summary>7. 为什么 `maxLineBytes` 限制整行而非正文？</summary>
JSON 结构、字段名、转义和时间戳也占用输入字节。</details>

<details><summary>8. `LimitReader(max)` 为什么不足？</summary>
读到刚好 max 字节时无法判断原文件是否更大；读取 max+1 后检查长度才能拒绝超限。</details>

<details><summary>9. `WriteFile` 返回 nil 是否等于崩溃后仍有完整文件？</summary>
不等于。它不承诺原子替换、稳定落盘或备份。</details>

<details><summary>10. RFC3339 中的 Z 有什么作用？</summary>
它表示 UTC，使时间文本带有明确时区；仍不证明该时间真实或可信。</details>

<details><summary>11. 为什么 flag.Parse 后还要验证默认值？</summary>
解析只把文本转换为变量，空路径、负上限和未知格式仍可能不满足业务规则。</details>

<details><summary>12. 本章下一步是什么？</summary>
下一章[01.09 包设计与依赖演进](./09_packages_evolution.md)把消息规则、文件 I/O 和命令入口拆成包与公开 API；HTTP、网络和并发仍须先完成 S2 前置。</details>

## 本章来源

- [encoding/json](https://pkg.go.dev/encoding/json)：编码、解码、Decoder 与未知字段处理。
- [bufio](https://pkg.go.dev/bufio)：Scanner、逐行读取与 token 错误。
- [time](https://pkg.go.dev/time)：RFC3339、Parse、Format 和 layout。
- [flag](https://pkg.go.dev/flag)：定义、Parse 与剩余参数。
- [os](https://pkg.go.dev/os) 与 [io](https://pkg.go.dev/io)：文件写入、部分失败和限量读取。
