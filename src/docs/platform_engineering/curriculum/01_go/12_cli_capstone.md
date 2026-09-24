---
title: 01.12 完整命令行工具：导入、核对与导出本地 IM 历史
icon: /assets/icons/article.svg
order: 13
date: 2026-09-24
---

[返回第一卷](./README.md) · [语言前置：包设计](./09_packages_evolution.md) · [测试前置：10.02](../10_engineering/02_testing_basics.md)

# 01.12 完整命令行工具：导入、核对与导出本地 IM 历史

> DeepTutor 原稿经技术和教学审阅后的静态课程。命令、代码、输出和测试结果均为预期或学习者待完成任务；本次没有执行 Go、构建站点或连接 IM 服务。

## 本章要交付什么

前九章已分别学过消息规则、结构体、错误、JSON、文件和包；10.01、10.02 已学过从需求得到测试预期。现在把这些知识组合成一个**本地历史工具的课程项目**。学习者逐步完成 `check`、`list`、`export` 三个子命令，最后能解释正常与失败路径、记录真实运行结果，并说明工具尚不具备哪些保证。

本章使用完全虚构的 `c-a`、`u-a`、`m-a`。输入为一个不超过 1 MiB 的版本 1 JSON 文件，格式沿用 [01.08](./08_standard_library.md)；领域消息和文件适配器沿用 [01.09](./09_packages_evolution.md)。程序只读写**本机文件**，不登录、不联网、不发送消息，不把本地导出成功称为服务端持久化、设备接收或用户已读。

| 第一次阅读 | 第二次阅读 | 独立实践 |
|---|---|---|
| 命令合同、文件规则、参数解析 | 错误分类、覆盖写入、测试证据 | 按 check → list → export 逐项实现并记录结果 |

## 一、先写三项用户任务的可观察合同

下面统一使用**选项形式**，不混用“把路径当位置参数”的另一套语法：

```text
imhistory check  -file history-c-a.json [-max-bytes 1048576]
imhistory list   -file history-c-a.json [-max-bytes 1048576]
imhistory export -file history-c-a.json -out copy-c-a.json [-max-bytes 1048576] [-replace]
```

`-file` 可省略，默认路径来自环境变量 `IMHISTORY_FILE`；环境变量也不存在时才取教学默认 `history-c-a.json`。其他选项没有环境变量来源：`-max-bytes` 默认 1 MiB，`-out` 仅在 `export` 必填，`-replace` 默认关闭。若用户显式给出 `-file`，它覆盖环境默认。每个子命令解析后都拒绝多余位置参数。

| 命令 | 成功时 `stdout` | 失败时 | 对文件的作用 |
|---|---|---|---|
| `check` | 版本、会话、消息数的简短摘要 | `stderr` 诊断，非零退出码 | 只读输入 |
| `list` | 按**文件中的现有次序**逐行输出消息 ID 与规范时间，默认不打印正文 | 验证不通过则不输出部分列表 | 只读输入 |
| `export` | 目标路径与导出消息数 | 目标已存在、写入失败等给出诊断 | 先完整验证输入，再写新目标；默认不覆盖 |

`list` 保留文件顺序，不偷偷按客户端时间排序。若产品后来要按序号排序，必须引用 [02.05](../02_algorithms/05_sort_divide.md) 定义比较键、并列规则及对旧输出的兼容影响。`check` 的摘要只说明“本工具接受这份本地文件”，不说明历史完整。

## 二、包与资源责任沿用已有课程

课程项目可先按以下目录组织：

```text
imhistory/
├── go.mod                         module example.com/imhistory
├── history/                       消息字段与会话内唯一性规则
├── internal/historyfile/          版本化 JSON、大小限制、文件读取与导出
└── cmd/imhistory/                 FlagSet、输出通道、退出码
```

依赖方向是 `cmd/imhistory → internal/historyfile → history`，命令入口也可直接引用 `history` 的公开能力。`history` 不读取 `os.Args`、不打印终端、不导入文件适配器。文件包负责“如何从字节得到有效历史”，命令包决定“哪条命令用它、结果写到哪里”。源码目录结构只是课程方案，不是把工具直接添加到本项目。

对外部脚本来说，命令名称、选项、退出码和输出格式也属于 API。比如把 `-file` 改名或把历史损坏从退出码 3 改成 0，可能使已有脚本产生错误判断；设计时就要写进帮助和测试。

### `main` 只在内层返回后退出

`os.Exit` 立即结束进程，不执行尚未运行的 `defer`。因此获取文件、登记关闭、清理临时资源、写结果应发生在 `run` 及其下层函数中；`main` 只把最终状态码交给进程：

```go
// cmd/imhistory/main.go：入口片段。run 的合同和分派见下文。
func main() {
	os.Exit(run(os.Args[1:], os.Stdout, os.Stderr))
}
```

代码放入实际 `package main` 文件时还需导入 `os`。当 `run` 返回，内层已登记的延后关闭先完成；随后 `main` 调用 `os.Exit`。不要在 `Load`、`Export` 或某个子命令中直接 `os.Exit`，也不要在 `main` 中安排指望退出时执行的 `defer`。

## 三、子命令解析与配置优先级

`flag.FlagSet` 给每个子命令一套独立选项。先注册该命令允许的选项，再 `Parse(args)`；`flag.ContinueOnError` 让解析错误返回给调用者，由 `run` 统一转成用法退出码 2。下例是**完整的选项解析函数**，作为命令入口包内代码；它不读取文件：

```go
type Options struct {
	File     string
	Out      string
	MaxBytes int64
	Replace  bool
}

func parseOptions(command string, args []string, envFile string) (Options, error) {
	defaultFile := "history-c-a.json"
	if envFile != "" {
		defaultFile = envFile
	}
	set := flag.NewFlagSet(command, flag.ContinueOnError)
	set.SetOutput(io.Discard) // run 自己决定把解析错误和帮助写到哪里。
	file := set.String("file", defaultFile, "本地历史文件")
	maxBytes := set.Int64("max-bytes", 1<<20, "最大读入字节数")
	var out *string
	var replace *bool
	if command == "export" {
		out = set.String("out", "", "导出目标路径")
		replace = set.Bool("replace", false, "明确允许覆盖已有目标")
	}
	if err := set.Parse(args); err != nil {
		return Options{}, err
	}
	if set.NArg() != 0 || *file == "" || *maxBytes <= 0 || *maxBytes > 1<<20 {
		return Options{}, errors.New("参数数量、路径或最大字节数无效")
	}
	options := Options{File: *file, MaxBytes: *maxBytes}
	if command == "export" {
		if *out == "" {
			return Options{}, errors.New("export 必须指定 -out")
		}
		options.Out, options.Replace = *out, *replace
	}
	return options, nil
}
```

放进 `cmd/imhistory` 的文件时需导入 `errors`、`flag` 和 `io`。`run` 从 `os.Getenv("IMHISTORY_FILE")` 得到 `envFile`，再调用此函数。`-max-bytes` 显式为 0 或负数仍必须拒绝；默认值只是初值，不是校验。标准 `flag` 解析在遇到第一个非选项参数时会停止，因此本章约定路径只用 `-file`，避免位置参数与后续选项的歧义。

显式 `-h` 或 `-help` 会令 `Parse` 返回 `flag.ErrHelp`；本章让 `run` 将帮助写到 `stdout`，返回 0。由于示例把 `FlagSet` 输出设为 `io.Discard`，`run` 还须打印自定义的一行用法及选项说明，不能把“没有看到错误”当成已显示帮助。没有子命令或未知子命令则写 `stderr` 并返回 2。

## 四、受控导入沿一条路径完成

输入 JSON 的顶层为 `version`、`conversation_id`、`messages`；每条消息含 `id`、`sender_id`、`body`、`created_at`。本章接受 `version=1`、会话 ID 非空、`messages` 为数组、消息 ID 在会话内不重复、正文非空、时间为 RFC3339。空数组 `[]` 可表示空历史；`messages` 缺失或 `null` 必须拒绝。01.08、01.09 的示例已同步补上这条 nil 切片检查。

使用 [01.09 的文件适配器](./09_packages_evolution.md)时，读取过程应保持固定顺序：

```text
参数上限有效
→ os.Open 成功后登记 Close
→ LimitReader(maxBytes+1) 并拒绝超限
→ JSON Decoder 拒绝未知字段
→ 第二次 Decode 只允许得到 io.EOF
→ 检查 version=1 与 messages 为数组
→ 解析 RFC3339、字段非空、会话内重复 ID
→ 全部成功后返回完整 History
```

前一步失败就返回带上下文的错误，不交给命令入口半份历史。`DisallowUnknownFields` 对当前版本是一个**严格导入选择**，不能自动当作将来所有版本的兼容策略。`maxBytes+1` 多读的一个字节用于区分“恰好到上限”与“原文件超限”，不是放宽接受范围。

为了让 CLI 稳定分类，可由文件适配器新增哨兵 `ErrInvalidHistory`，在语法、版本或字段错误时用 `%w` 包装；打开、读取等 I/O 错误继续保留底层原因。命令入口用 `errors.Is` 区分它们，不能比较 `err.Error()` 的中文或系统文案。这是对 01.09 教学适配器的**接口深化**，需要同步更新错误契约与回归案例。

```go
// 文件适配器内的片段；每个无效输入分支复用同一个错误身份。
var ErrInvalidHistory = errors.New("本地历史内容无效")

if file.Version != 1 {
	return nil, fmt.Errorf("%w：不支持版本 %d", ErrInvalidHistory, file.Version)
}
```

这里的 `errors` 和 `fmt` 需要导入。调用方判断 `errors.Is(err, historyfile.ErrInvalidHistory)` 得到退出码 3；具体文字仍可说明是哪项规则失败。若只写 `fmt.Errorf("版本错误：%v", err)` 而不使用 `%w`，上层便不能沿错误链识别原始身份。

## 五、正常结果、诊断与退出码

统一约定成功结果写 `stdout`；参数和操作失败写 `stderr`；`list` 在**整份输入完成校验后**才输出第一行，避免坏文件留下“部分列表”却让下游当成完整结果。默认列表只显示消息 ID 与 RFC3339 时间，不输出正文或发送者身份。若确需全文，必须新增明确的产品需求和权限约定。

| 退出码 | 类别 | 示例 | 对目标文件的承诺 |
|---:|---|---|---|
| 0 | 成功或显式帮助 | 合法 `check`、`list`、`export`；`-help` | 按对应命令合同完成 |
| 2 | 用法错误 | 未知命令、无效 flag、缺少 `-out`、上限非法 | 不开始读取或写出 |
| 3 | 输入历史无效 | JSON 损坏、版本不支持、字段缺失、重复 ID、超限 | 不创建导出目标 |
| 4 | 文件 I/O 失败或目标冲突 | 输入不存在、无权限、导出目标已存在、写入或关闭失败 | 不宣称导出成功；目标可能已有部分内容 |
| 5 | 其他未预期错误 | 当前规则没有覆盖的内部失败 | 不报告成功，保留诊断供修复 |

未知内部错误同样不能变成退出码 0；本章使用 5 并在诊断中保留操作上下文。命令帮助明确解释这组退出码。它们是**本课程自行约定的 CLI 接口**，并非 Go 或操作系统统一规定的数字含义。

`run(args,stdout,stderr)` 应先确定子命令、解析选项、调用 `historyfile.Load`，再根据结果分派：`check` 输出版本、会话和数量摘要；`list` 按文件数组的既定次序逐条输出 ID 和时间；`export` 在完整校验后编码并写新目标。它在返回状态码之前完成所有资源清理。调用方若使用 `-help`，`run` 输出用法并返回 0；若缺少子命令则输出简短用法并返回 2。

### 不让诊断泄漏正文

诊断可以包含操作名、参数名称、错误类别和第几条记录，例如“第 3 条消息时间格式无效”；默认不回显正文、原始 JSON、访问令牌或真实用户资料。本项目的 `c-a/u-a` 都是虚构身份，但读者独立实践仍应使用虚构样本。需要结构化日志时，可在命令入口使用 `log/slog` 向 `stderr` 写阶段、数量和错误类别；领域包不必依赖日志实现。

## 六、导出前先验证，默认排他创建

`export` 的目标路径通过 `-out` 指定。先读入并验证源，转换成待输出的完整 JSON 字节，再触碰目标。默认使用排他创建：目标已存在时直接失败，避免先做“检查不存在”再创建之间的竞态。只有显式 `-replace` 才走覆盖写入。下面是**文件适配器包中的输出函数片段**，调用前已经完成领域校验和 JSON 编码：

```go
func writeExport(path string, data []byte, replace bool) error {
	flags := os.O_WRONLY | os.O_CREATE | os.O_EXCL
	if replace {
		flags = os.O_WRONLY | os.O_CREATE | os.O_TRUNC
	}
	f, err := os.OpenFile(path, flags, 0o600)
	if err != nil {
		return fmt.Errorf("创建导出目标：%w", err)
	}
	n, writeErr := f.Write(data)
	closeErr := f.Close()
	if writeErr != nil {
		return fmt.Errorf("写出目标：%w", writeErr)
	}
	if n != len(data) {
		return io.ErrShortWrite
	}
	if closeErr != nil {
		return fmt.Errorf("关闭导出目标：%w", closeErr)
	}
	return nil
}
```

这段代码需在文件适配器中导入 `fmt`、`io`、`os`。写入失败时仍调用 `Close`，主写入错误优先；写入成功但关闭失败同样不得报告导出成功。创建权限 `0o600` 受系统 umask 影响，且不会自动改写已有文件的权限。

调用前还应检查源与目标**不是同一文件**，包括不同路径指向同一对象的情形；可在两个文件都存在时用 `os.Stat` 与 `os.SameFile` 辅助核对。本章是可信本地目录的教学模型，这种预检查不消除路径在检查与写入之间被外部修改的竞态。默认 `O_EXCL` 解决“已有目标不覆盖”，却不保证写入失败时不会留下半个新文件；`-replace` 使用 `O_TRUNC` 更可能先改变旧目标。崩溃原子替换、备份与回滚须另立设计，不能从本章 `return nil` 推出。

输入与目标路径相同，即使用户指定 `-replace` 也要拒绝；不能一边读取历史，一边把源文件当导出目标截断。导出完成后才向 `stdout` 报告目标与条数，失败时 `stdout` 保持为空。

## 七、用需求表设计个人验证

本章**不执行**学习者的工具，以下是实现后应独立核对的案例。`t.TempDir()` 为文件测试提供临时目录；固定的虚构时间和消息字段使预期不依赖运行当天。真实执行记录要写明命令、代码版本、预期、实际退出码、`stdout`、`stderr` 与文件前后差异。

| 场景 | 预期类别 | 关键断言 |
|---|---|---|
| 合法 v1、一个消息 | 0 | `check` 摘要数量为 1，源字节不变 |
| 合法 v1、`messages:[]` | 0 | 明确输出 0 条，不伪造时间 |
| 缺少或 `null` 的 `messages` | 3 | 不返回部分历史 |
| 文件恰好为上限与超 1 字节 | 0 / 3 | 超限不能被静默截断 |
| 未知字段或第二个 JSON 值 | 3 | 严格拒绝，`stdout` 为空 |
| 同一会话重复消息 ID | 3 | 错误指出记录位置，源字节不变 |
| 输入文件不存在或无权限 | 4 | 不产生导出目标 |
| 未给 `-out` 或上限为 0 | 2 | 不读取输入 |
| 目标已存在且无 `-replace` | 4 | 旧目标字节不变 |
| 输入与目标为同一文件 | 4 | 拒绝，即使指定 `-replace` |
| 合法导出到新路径 | 0 | 重新读取目标，版本、身份和消息内容一致 |

`go test` 的单元测试可独立验证领域校验；本地集成测试在 `t.TempDir()` 中验证文件适配器；命令层测试可向 `run` 注入内存中的 `stdout`、`stderr` 缓冲，核对输出和退出码。覆盖率只能说明代码被执行的范围，不能替代上表的业务断言。成功的本地 CLI 测试仍不能证明远端 IM 服务、数据库或多设备同步行为。

## 八、分阶段完成课程项目

学习者可以分四轮做，每轮只加入一个可解释的能力：

1. **`check`**：先写文件版本、字节上限、严格 JSON 与领域校验；提交一张正常和失败决策表。
2. **`list`**：复用同一个完整导入入口，按文件次序输出默认安全字段；检查坏文件不产生部分列表。
3. **`export`**：先编码、再排他创建；覆盖需 `-replace`，并分别记录写入与关闭错误。
4. **变式与交付说明**：修改上限或版本规则，更新测试、帮助、退出码表；记录真实运行范围和未覆盖故障。

每轮都保留理论预期与个人实际观察两栏。课程给出的示例不是“已运行通过”的证据，静态检查也不能替代独立实现的结果。

### 分层练习：先答，再看反馈

<details><summary>1. 本章支持哪些子命令？</summary>

`check`、`list`、`export`。没有第四个隐含的 `import` 命令；从文件读取到内存属于三者共用的导入步骤。</details>

<details><summary>2. `-file` 未给出时从哪里取值？</summary>

先看 `IMHISTORY_FILE`，没有才用教学默认路径；显式 flag 优先。</details>

<details><summary>3. `flag.FlagSet` 为什么按子命令分别创建？</summary>

各命令接受的参数、帮助和解析错误彼此隔离，`check` 不应接受 `export` 的 `-replace`。</details>

<details><summary>4. `-max-bytes=0` 能因“没有消息”而合法么？</summary>

不能。它是非法资源上限，应在读取文件前以用法错误拒绝。</details>

<details><summary>5. 显式 `-help` 与没有子命令分别返回什么？</summary>

帮助是正常查询，向 `stdout` 写用法并返回 0；缺少操作向 `stderr` 提示并返回 2。</details>

<details><summary>6. 为什么 `os.Exit` 只放在最外层？</summary>

它不运行尚未执行的 `defer`。内层先完成关闭、清理与返回，再由入口退出。</details>

<details><summary>7. 为什么读取上限使用 `maxBytes+1`？</summary>

多读一个字节才可区分恰好到上限与实际超限；多出的字节只用于拒绝判断。</details>

<details><summary>8. JSON 解码成功就能显示消息吗？</summary>

不能。还要检查版本、必需字段、数组形状、时间和会话内重复 ID。</details>

<details><summary>9. `messages` 缺失和 `[]` 的合同一样吗？</summary>

不一样。v1 要求字段是数组；缺失或 `null` 拒绝，空数组表示合法空历史。</details>

<details><summary>10. 一次 `Decode` 成功还需检查什么？</summary>

再解码一次，只有得到 `io.EOF` 才能确认没有第二个 JSON 值或损坏尾部。</details>

<details><summary>11. 为什么 `list` 先完成整份文件校验？</summary>

避免输出前几条后在坏记录处失败，让下游误把部分列表当完整结果。</details>

<details><summary>12. `list` 默认输出正文吗？</summary>

不输出。只显示本章约定的 ID 和时间；全文展示需要另立显式需求与权限边界。</details>

<details><summary>13. 哪个通道写成功结果，哪个写诊断？</summary>

`stdout` 写成功结果，`stderr` 写参数或文件错误，便于脚本按退出码处理。</details>

<details><summary>14. 历史 JSON 损坏与文件不存在分别返回什么类别？</summary>

前者为 3（输入历史无效），后者为 4（I/O 失败）；它们是本课程约定的数字。</details>

<details><summary>15. 导出目标已存在且没有 `-replace` 会怎样？</summary>

排他创建失败，返回 4，旧目标不应被覆盖。</details>

<details><summary>16. 显式 `-replace` 是否保证崩溃原子更新？</summary>

不保证；覆盖模式可能先截断旧文件，中途失败留下部分内容。</details>

<details><summary>17. 写入成功、关闭失败还能返回导出成功吗？</summary>

不能。当前导出合同要求两步均成功，关闭错误也应交还。</details>

<details><summary>18. 源文件与目标路径不同就一定不是同一对象吗？</summary>

不一定。链接或路径别名可指向同一文件；还需检查对象身份，且教学预检查不消除并发修改竞态。</details>

<details><summary>19. `t.TempDir()` 的文件测试能证明线上消息已送达吗？</summary>

不能。它只验证本地文件与当前命令的协作。</details>

<details><summary>20. 交付说明要区分哪两类结果？</summary>

静态教材的预期与学习者自己执行后的实际结果；未运行就明确写未运行。</details>

## 来源与下一步

- [Go `flag.FlagSet`](https://pkg.go.dev/flag#FlagSet)、[os.Exit](https://pkg.go.dev/os#Exit)与[encoding/json Decoder](https://pkg.go.dev/encoding/json#Decoder.DisallowUnknownFields)用于核对解析、退出与严格 JSON 合同。
- [Go `testing.T.TempDir`](https://pkg.go.dev/testing#T.TempDir)用于核对临时文件测试范围；[log/slog](https://pkg.go.dev/log/slog)是后续结构化诊断的标准库入口。

完成本章的本地工具后，进入[10.04 测试替身与设计](../10_engineering/04_test_doubles_design.md)，学习怎样固定时间、注入存储错误并核对真实文件边界。此后 S1 继续学习重构与评审；进程、网络、并发和身份属于后续阶段，不能把这个 CLI 直接称为线上 IM 服务。
