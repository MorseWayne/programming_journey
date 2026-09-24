# 01.09《包设计与依赖演进：让消息规则和文件细节各守边界》

*本章以虚构的本地 IM 历史工具为贯穿案例，带领已掌握消息结构、错误、JSON、文件与 flag 的 Go 初学者，理解如何将失控的 main.go 拆分为职责清晰的包。读者将从包、模块与导入路径的基本概念出发，逐步掌握依赖方向、循环导入消除、internal 边界、最小接口、模块版本与兼容演进的实际判断方法。*

**章节:** 2

---

## 本书导览

- 了解整本书的章节脉络
- 掌握各章之间的概念依赖关系
- 选择最合适的阅读顺序

# 01.09《包设计与依赖演进：让消息规则和文件细节各守边界》

本章以虚构的本地 IM 历史工具为贯穿案例，带领已掌握消息结构、错误、JSON、文件与 flag 的 Go 初学者，理解如何将失控的 main.go 拆分为职责清晰的包。读者将从包、模块与导入路径的基本概念出发，逐步掌握依赖方向、循环导入消除、internal 边界、最小接口、模块版本与兼容演进的实际判断方法。

下方的概念图展示了本书 0 个核心概念以及它们之间的依赖关系；再下方是 1 个章节的入口。你可以按从上到下的顺序阅读，也可以根据自己的兴趣或先验知识选择切入点。

#### 概念图

```mermaid
graph TD
  empty["(no concepts yet)"]
```

## 章节索引

- **01.09 包设计与依赖演进：让消息规则和文件细节各守边界** — 承接本地消息历史，将领域规则、JSON 文件、命令入口拆成依赖方向清楚的 Go 包；建立导出 API、内部实现、模块与兼容边界。没有网络、数据库、并发、真实发布或 OpenIM 运行结论。

## 01.09 包设计与依赖演进：让消息规则和文件细节各守边界

- 解释目录、package 名、import path、module path 的关系
- 用导出标识符设计小而稳定的消息历史 API
- 区分领域规则、文件编码和命令入口的依赖方向
- 识别并拆开 import cycle
- 解释 internal 的访问边界
- 理解 go.mod、模块版本和最小版本选择的基本目的
- 用兼容表处理字段与函数演进
- 用虚构 IM 历史工具说明 API 变更的业务后果

先从混乱的单文件历史工具出发，厘清代码位置、命名与依赖边界，建立后续拆包的共同语言。

### 从臃肿 main 识别边界缺失

### 从臃肿 main 识别边界缺失

设想一个本地 IM 历史工具：用户传入 `-input history.json` 与 `-user alice`，程序读取文件、解析 JSON、筛选消息、校验消息字段，最后打印统计结果。起初它可能全部写在 `main` 中：

- 用 `flag` 读取参数，并判断路径、用户名是否为空；
- 用 `os.ReadFile` 读取历史文件；
- 用 `json.Unmarshal` 解码；
- 遍历消息，检查时间、发送者、内容等业务规则；
- 计算数量、输出错误和格式化结果；
- 在多个分支中重复“读取—解码—报错”的流程。

这并非只是“文件太长”。问题在于不同变化原因被塞进同一处：命令行参数变化会改动 `main`；JSON 文件格式变化会改动 `main`；消息合法性规则变化仍会改动 `main`；输出从终端改为文件，还是改动 `main`。一个入口函数同时依赖 `flag`、`os`、`encoding/json`、消息结构和展示格式，任何局部需求都会牵动整体。

可以先按职责给代码贴标签，而不急于拆分：

| 代码行为 | 应关注的边界 |
|---|---|
| `Message`、字段校验、筛选规则 | 消息规则 |
| 文件路径、读取、写入、JSON 解码 | 文件与编码细节 |
| 参数解析、调用顺序、打印结果 | 程序入口与交互 |

重复通常是边界缺失的信号。例如，每个命令分支都自行解码 JSON，说明“从文件获得历史记录”尚未成为独立能力；每次输出前都重新判断消息是否有效，说明校验规则没有集中；业务代码直接拼接文件路径，则消息规则已经知道了不该知道的存储细节。

因此，后续拆包的目标不是把 `main` 机械切成多个文件，而是让消息规则不依赖文件如何保存，让文件处理不决定规则是否正确，让 `main` 只负责组装这些能力。

### 目录、包、导入路径与模块

### 目录、包、导入路径与模块

拆包前，先把四个常被混用的概念分开。它们都和“代码放在哪里、怎样被引用”有关，但负责的层次不同。

- **目录**是文件系统中的位置，用来承载源码文件。例如：

  `history/codec/`  
  `history/store/`  
  `cmd/history/`

  目录本身不决定代码对外叫什么，也不自动形成可导入单元。

- **包**由同一目录内 Go 文件顶部的 `package` 声明确定，表示这些文件共同归属的代码单元。例如 `history/codec/decode.go` 写着：

  `package codec`

  则该文件属于 `codec` 包。通常一个目录对应一个普通包；同目录中的非测试文件必须使用同一个包名。目录名常与包名一致，但这是约定，不是语法上的同一件事。

- **导入路径**是其他代码定位某个包时使用的名字。例如：

  `import "example.com/local-history/history/codec"`

  这里导入的是一个包，而不是某个 `.go` 文件。导入后默认使用该包声明的名称，如 `codec.Decode`；因此，调用名取决于 `package codec`，定位地址取决于导入路径。

- **模块**是由 `go.mod` 定义的版本与依赖边界。若根目录的 `go.mod` 声明：

  `module example.com/local-history`

  那么模块根下 `history/codec` 目录中包的导入路径自然是：

  `example.com/local-history/history/codec`

可以把关系理解为：

`模块路径 + 子目录 = 包的导入路径`  
`目录中的 package 声明 = 代码使用时的包名`

因此，`cmd/history` 可以放命令入口，`history/codec` 放消息解码，`history/store` 放文件写入；它们位于不同目录、形成不同包，却仍可属于同一个模块。后续调整依赖时，应先问“哪个包需要哪个包”，而不是仅看文件恰好放在哪个目录。

### 按依赖方向划分职责

### 按依赖方向划分职责

拆包的关键不是“文件变多”，而是让依赖只朝一个方向流动。以本地消息历史工具为例，可以先按职责规划三层：

- `history`：领域层，定义消息历史的核心规则，例如消息结构、追加记录、查询记录、校验时间或发送者等。它只关心“什么是一条有效历史”，不关心数据来自 JSON、终端还是网络。
- `store`：文件层，负责把历史读成 JSON、把历史写回文件、处理路径和文件不存在等问题。它依赖 `history`，因为解码后的结果必须是领域消息；但 `history` 不应导入 `store`。
- `cmd`：命令入口层，解析 `flag` 参数、决定执行“查看”还是“追加”、调用应用能力，并把结果打印到终端。它可以同时依赖前两层，但不应把业务规则塞回 `main`。

依赖关系应当近似为：

`cmd → store → history`

其中，箭头表示“左侧导入或使用右侧”。例如，文件层可以调用 `history.Validate` 来确认解码出的记录是否有效；领域层却不能调用“读取某个文件”，否则消息规则会被本地磁盘细节污染。

还要区分几个容易混淆的概念：目录是磁盘上的位置；包是同一目录中共享 `package` 名称的一组 Go 文件；导入路径是其他包引用它的名称；模块则由 `go.mod` 定义，是一组包的版本与依赖边界。目录名常常与包名接近，但它们不是同一个概念。

这样的划分使 JSON 格式或文件位置变化主要影响 `store`，命令参数变化主要影响 `cmd`，而消息有效性的规则仍稳定地留在 `history`。

### 导出 API 与内部实现边界

### 导出 API 与内部实现边界

包的使用者只能依赖**导出的标识符**：首字母大写的类型、函数、变量或常量。它们构成包的 API；小写标识符则是实现细节，可以在不通知调用方的情况下重构。

对于消息历史工具，`history` 包应暴露少量稳定能力，而不是把解析、路径处理和文件格式全部泄漏出去：

```go
type Message struct {
    Role    string
    Content string
}

type Store interface {
    Append(Message) error
    List() ([]Message, error)
}

var ErrInvalidMessage = errors.New("无效消息")
```

调用方只需知道：如何表示一条消息、如何追加与读取、哪些错误可据此做分支处理。比如收到 `ErrInvalidMessage` 时提示用户修正输入；其他错误则按“无法保存历史”处理。错误语义是 API 的一部分，因此不要让调用方依赖易变的文本，例如通过比较 `"json: ..."` 判断失败原因。

相反，下列内容通常不应导出：

- `decodeLine`、`encodeRecord`：JSON 行格式可能随时调整；
- `historyFileName`、`defaultPath`：文件布局属于存储策略；
- `validateRole`：若只服务于包内校验，无需成为公共承诺；
- 具体的 `fileStore` 类型：调用方依赖接口或构造函数即可。

仓库内还可使用 `internal` 目录保存不可被外部模块导入的实现：

```text
historytool/
├── history/          // 可供外部导入的稳定 API
└── internal/
    ├── record/       // JSON 记录编解码
    └── fileio/       // 文件读写细节
```

Go 对 `internal` 有编译期约束：只有位于其父目录树内的包才能导入它。例如 `historytool/history` 可以导入 `historytool/internal/record`，但另一个独立模块不能导入。这样，公开包负责表达“能做什么”，`internal` 负责实现“如何做到”；文件格式、辅助函数和试验性代码便不会意外变成长期兼容负担。

### 为演进预留兼容空间

### 为演进预留兼容空间

`go.mod` 不只是“记录依赖版本”的文件，它还声明了本模块的导入根路径，例如：

`module example.com/imhistory`

于是调用者通过 `example.com/imhistory/message` 导入消息规则，通过 `example.com/imhistory/archive` 导入文件读写实现。目录名决定代码位置，`package` 名决定源码中的包名，模块路径决定跨模块导入时写出的完整路径；三者相关，但不能混为一谈。

Go 的模块版本遵循最小版本选择：若主程序依赖 `imhistory v1.4.0`，另一个依赖又要求 `v1.2.0`，构建结果通常选用 `v1.4.0`。因此，`v1` 中升级应尽量保持旧调用者可编译、可运行。历史工具尤其如此：旧归档文件、旧脚本和旧命令行自动化往往存活很久。

设原有消息为：

`type Message struct { ID string; Text string }`

若直接把 `Text` 改为 `Body`，所有读取 `msg.Text` 的调用者都会编译失败；若 JSON 标签也改变，旧历史文件还可能解码失败。更稳妥的演进方式是保留旧字段或提供转换入口，并明确弃用期：

| 调整 | 旧调用者影响 | 较稳妥的处理 |
|---|---|---|
| 新增可选字段 | 通常兼容 | 使用零值或指针表示“未提供” |
| 重命名导出字段 | 编译失败 | 保留旧字段，逐步迁移 |
| 修改函数参数 | 编译失败 | 新增函数，旧函数作为包装保留 |
| 改变 JSON 字段名 | 旧文件可能失败 | 同时接受新旧名称，写出统一格式 |
| 删除包或移动目录 | 导入失败 | 保留旧包作转发层 |

例如不要立刻删除 `LoadFile(path)`，可新增更明确的 `LoadArchive(path)`，再让前者调用后者。这样应用层命令仍能使用旧接口，文件细节可在 `archive` 包内部演进。

还要警惕导入环：若 `message` 导入 `archive` 来读取文件，而 `archive` 又导入 `message` 来解码记录，就形成 `message → archive → message`，Go 无法构建。消息包应只定义数据与规则；归档包依赖消息包；`main` 负责把两者组合。依赖方向一旦稳定，兼容层就有明确的安放位置，未来调整也不必让每个调用者同步重写。

> **要点** — 先分清模块与包，再让领域规则独立于文件和命令细节，才能以稳定 API 支撑安全演进。

先把消息历史能力收拢为一个小包：明确谁能创建、追加、加载和保存历史，再让命令入口只负责调用。

### 从目录到包名：先定清消息历史的归属

### 从目录到包名：先定清消息历史的归属

Go 中，目录首先表达代码的归属边界：同一目录下的 `.go` 文件通常声明同一个包，并共同编译。若项目模块路径为：

`example.com/chatapp`

则可以建立如下结构：

- `history/`：消息历史这一领域能力；
- `main.go`：程序启动与命令编排。

```text
chatapp/
├── go.mod
├── main.go
└── history/
    └── history.go
```

`go.mod` 中的 `module example.com/chatapp` 是模块路径；子目录 `history` 对应导入路径 `example.com/chatapp/history`。目录名、包名与导入路径通常保持一致，因此 `history/history.go` 应写为：

`package history`

而根目录的启动文件写为：

`package main`

`main` 包有特殊地位：它负责生成可执行程序，并提供 `func main()` 作为入口。它应读取参数、决定文件位置、调用业务能力并展示结果，却不应承载消息追加、序列化或文件读写规则。

相对地，`history` 包拥有“历史记录是什么、如何新增、如何加载和保存”的规则。入口包通过导入使用它：

`import "example.com/chatapp/history"`

这种划分让依赖方向保持清晰：

`main → history`

而不是让 `history` 反过来知道命令行、标准输入或具体界面。将来即使增加图形界面、HTTP 服务或测试工具，它们也可以复用 `history`，不必复制消息规则。

包名应短小、描述领域，而非技术实现。`history` 比 `fileutil` 或 `jsonhelper` 更稳定：前者说明能力归属，后者容易把无关文件操作和编码细节混进同一边界。先确定“消息历史属于谁”，再决定哪些类型和函数需要导出，公开 API 才不会随着目录杂乱而失控。

### 导出规则决定可依赖的边界

### 导出规则决定可依赖的边界

Go 不用 `public`、`private` 关键字，而是用标识符首字母控制可见性：首字母大写即可被其他包访问，首字母小写则只在当前包内可见。

```go
package history

type Message struct {
	Role    string
	Content string
}

type History struct {
	messages []Message
}

func New() *History { /* ... */ }
func (h *History) Add(role, content string) { /* ... */ }
```

这里，外部包能够依赖 `Message`、`History`、`New` 与 `Add`；但不能直接访问 `messages`。这不是语法上的小细节，而是在声明依赖边界：

- `package main` 可以创建历史、追加消息、请求加载或保存。
- `package history` 自己决定消息如何存储、是否去重、如何校验、文件采用何种格式。
- 将来即使把 `[]Message` 换成其他内部表示，只要公开方法的含义不变，调用方通常无需修改。

因此，导出前应问：调用者是否真的必须知道或操作这个名字？例如，若外部只需要读取消息，可以提供 `Messages()` 或迭代能力；不要因为方便就导出 `Messages []Message` 字段。公开字段允许调用者任意替换、修改甚至置空，后续每一次约束调整都会变成兼容性负担。

同样，`loadFile`、`encodeJSON`、`validateRole` 这类实现步骤应保持小写。它们可以自由重命名、拆分或删除；真正稳定的契约应集中在少量导出类型和函数上。包的价值不在于暴露全部内部细节，而在于让外部只依赖完成任务所必需的能力。

### 为 Message 与 History 选择最小公开表面

### 为 Message 与 History 选择最小公开表面

先公开调用者确实需要表达和操作的概念，而不是把内部存储方式一并暴露。一个足够小的起点可以是：

```go
type Message struct {
    Role    string
    Content string
}

type History struct {
    messages []Message
}

func New() *History
func (h *History) Add(m Message)
func (h *History) Load(path string) error
func (h *History) Save(path string) error
```

`Message` 的 `Role`、`Content` 是消息的业务数据：命令入口、文件加载逻辑和后续模型调用都可能需要读写它们，因此首字母大写。代价是字段名和含义成为兼容承诺；以后即使内部改用别的编码格式，也应尽量继续支持这两个字段。

`History` 可以公开类型名，却不公开 `messages`。调用者知道“有一段历史”即可，不应依赖它是切片、链表还是带索引的缓存。隐藏状态让包以后能够在 `Add` 中做校验、复制、防止空消息，或维护额外元数据，而无需修改外部代码。

`New` 负责建立有效初始状态；即使当前只是返回空历史，也比让调用者直接构造内部字段更稳定。`Add` 是追加消息的唯一入口，语义应明确为“按顺序加入一条消息”。若追加可能失败，例如拒绝非法角色或过长内容，应改为：

`func (h *History) Add(m Message) error`

`Load` 与 `Save` 负责文件边界：路径、编码、解析和写入错误都通过 `error` 返回。错误不是附属信息，而是契约的一部分；调用者据此决定提示、重试或退出。不要急于引入“存储接口”、泛型容器或多种构造器：在只有本地文件历史这一种需求时，它们只会扩大公开表面和维护负担。

### 返回值、错误与字段为何都是兼容契约

### 返回值、错误与字段为何都是兼容契约

导出标识符不只是“能被外部调用”，更是在向调用者承诺：未来版本仍会以可预期的方式工作。字段、返回值、错误和零值，都属于这种承诺。

比较三种公开方式：

- **公开字段**最难收回：

  ```go
  type Message struct {
      Text string
      Time time.Time
  }
  ```

  调用者可以直接读取、修改、构造该值，并依赖字段名、类型和零值。以后若想把 `Text` 改为延迟加载、把 `Time` 改为字符串存储，都会破坏使用方。公开字段适合确实稳定、自然且无需校验的数据。

- **构造函数**保留创建策略：

  ```go
  func New() *History
  ```

  `New` 可以保证内部切片已初始化、默认路径已设置，未来也能增加内部缓存而不改变调用方式。若约定 `New` 永不返回 `nil`，就不要在后续版本中改为可能返回空指针；若创建可能失败，应从一开始返回 `(*History, error)`。

- **方法返回值**定义操作结果：

  ```go
  func (h *History) Add(m Message) error
  func Load(path string) (*History, error)
  ```

  `Add` 返回错误意味着“追加并非必然成功”，调用者会据此处理校验失败。`Load` 返回空历史和错误时，必须明确二者关系：文件不存在时是返回空 `History` 与 `nil`，还是返回 `nil` 与错误？两种都可行，但不能含糊，更不能日后互换。

错误语义同样需要稳定。例如调用者可能使用 `errors.Is(err, os.ErrNotExist)` 区分“文件不存在”和“文件内容损坏”。因此，`Load` 不应把所有错误都改写成同一句文本；应保留可识别的底层错误，必要时用 `%w` 增加上下文。

还要约定零值：`var h History` 是否可直接 `Add`？`Save` 面对空历史会写出空文件、合法空数组，还是报错？零值可用能降低调用成本；若不可用，则应让 `New` 成为唯一推荐入口，并在方法中给出明确错误。小而稳定的契约，比提前加入接口、泛型或大量可选字段更容易演进。

### 虚构 IM 历史工具：克制设计避免后续绑死

### 虚构 IM 历史工具：克制设计避免后续绑死

设想一个命令行工具：读取历史文件，追加一条消息，再保存回去。`main` 只编排流程，不理解文件格式：

`history.Load(path) → h.Add(sender, text) → h.Save(path)`

此时包的最小公开表面可以是：

- `Message`：一条聊天消息的数据。
- `History`：消息集合及其不变量的拥有者。
- `New()`：创建空历史；若零值同样合法，则未必需要它。
- `Add(...) error`：校验并追加消息。
- `Load(path string) (*History, error)`：读取并解析文件。
- `Save(path string) error`：将当前历史持久化。

首字母决定可见性。`Message`、`History`、`Load`、`Save` 是调用方需要认识的名字；解析辅助函数、文件版本常量、内部索引应保持小写。尤其不要轻易公开结构体字段：

`type History struct { Messages []Message }`

一旦这样暴露，调用方就能绕过 `Add` 直接修改切片；未来若要增加排序、去重、时间校验或索引，兼容负担会迅速扩大。更稳妥的做法是让字段私有，通过方法维护规则；若确实需要读取，可提供受控的查询方法或副本。

返回值和错误同样是契约。`Load` 的错误应让命令入口能够区分“文件不存在”“内容损坏”“无法读取”；`Save` 必须把写入失败返回给调用方，而不是打印后假装成功。`Add` 若可能拒绝空内容、非法发送者，也应明确返回错误。

此阶段不要为了“未来可能换存储”先定义空泛接口，也不要把消息做成泛型容器。当前只有一种文件格式、一个调用者和明确流程时，具体类型最容易理解；真实出现第二种存储方式或多种消息载荷后，再依据重复变化提炼抽象。

> **要点** — history 包公开稳定的领域操作，main 包负责调用；字段、返回值和错误都应视为长期兼容契约。

本节以虚构的 IM 历史工具为例，拆分领域、文件适配与命令入口，建立单向且可演进的 Go 包依赖。

### 从目录到模块：先辨清四种命名边界

### 从目录到模块：先辨清四种命名边界

Go 中同一段代码常同时涉及四种“名字”，它们相关但不相同：

- **目录**：磁盘上的位置，例如 `history/`、`historyfile/`。
- **package 名**：源文件首行声明的包标识，例如 `package history`。同一目录内的普通 `.go` 文件必须使用同一个包名。
- **import path**：其他包导入时写的完整路径，例如 `example.com/imhistory/history`。
- **module path**：`go.mod` 中声明的模块根路径，例如 `module example.com/imhistory`。

教学项目可组织为：

```text
imhistory/
├── go.mod
├── history/
│   ├── message.go
│   ├── history.go
│   └── validate.go
├── historyfile/
│   ├── json.go
│   └── file.go
└── cmd/
    └── historytool/
        └── main.go
```

若 `go.mod` 为：

`module example.com/imhistory`

则三个教学包及其导入路径分别是：

| 目录 | package 名 | import path |
|---|---|---|
| `history/` | `history` | `example.com/imhistory/history` |
| `historyfile/` | `historyfile` | `example.com/imhistory/historyfile` |
| `cmd/historytool/` | `main` | `example.com/imhistory/cmd/historytool` |

其中，`cmd/historytool` 虽是一个目录，也有导入路径，但它声明 `package main`，目标是生成命令程序，不应作为业务库被其他包依赖。

依赖方向应保持单向：

`cmd/historytool → historyfile → history`

`cmd/historytool → history`

目录名通常与包名保持一致，能降低阅读成本；但真正决定导入位置的是 `module path + 相对目录`。领域包 `history` 只表达消息与校验规则，不应因为文件位于哪个路径、命令行参数如何命名而改变。

### history：只承载消息历史规则

### history：只承载消息历史规则

`history` 是领域包：它只表达“消息历史是什么”以及“什么样的历史有效”，不关心数据来自文件、网络还是命令行参数。

建议将其公开面收敛为三个名称：

- `Message`：一条消息的领域数据；
- `History`：消息集合及其相关操作；
- `Validate`：检查历史是否满足业务规则。

目录规划如下：

```text
history/
├── message.go
├── history.go
└── validate.go
```

例如：

`message.go`

```go
package history

type Message struct {
	ID      string
	Sender  string
	Content string
}
```

`history.go`

```go
package history

type History struct {
	Messages []Message
}
```

`validate.go`

```go
package history

import "errors"

func Validate(h History) error {
	for i, m := range h.Messages {
		if m.ID == "" {
			return errors.New("第 " + strconv.Itoa(i) + " 条消息缺少 ID")
		}
		if m.Content == "" {
			return errors.New("消息内容不能为空")
		}
	}
	return nil
}
```

上例中的 `strconv` 只是标准库的纯计算工具；更重要的是，`history` 不应导入 `os`、`encoding/json`、`flag` 等基础设施包。它不读取路径、不编码 JSON，也不解析命令行。

依赖方向应保持为：

```text
cmd/historytool ──> historyfile ──> history
       └──────────────────────────> history
```

领域规则不能依赖命令入口：否则每次新增 HTTP 接口、定时任务或测试工具，都可能把入口细节带入核心规则。同样，领域层不应知道“文件路径”这一概念；路径、文件权限和 JSON 字节属于外部适配问题，应留给 `historyfile`。这样 `history` 可在内存测试中直接构造 `History` 并调用 `Validate`，无需创建文件或模拟参数。

### historyfile：把 JSON 与路径隔离在适配层

### historyfile：把 JSON 与路径隔离在适配层

`historyfile` 是面向存储介质的适配层：它知道 JSON 字节、文件路径和 `os` 的读写接口，但不改变历史消息的业务含义。其依赖方向应始终是：

`cmd/historytool → historyfile → history`

而不是让 `history` 导入 `os`、`encoding/json` 或命令行参数包。领域层只负责消息是否合法、历史记录如何组织；“保存到哪个路径”属于外部环境细节。

目录可以组织为：

```text
imhistory/
├── history/
│   ├── message.go
│   ├── history.go
│   └── validate.go
├── historyfile/
│   └── jsonfile.go
└── cmd/
    └── historytool/
        └── main.go
```

`historyfile` 接收和返回 `history.History`，因此它只需单向导入领域包：

```go
package historyfile

import (
	"encoding/json"
	"os"

	"imhistory/history"
)

func Encode(h history.History) ([]byte, error) {
	return json.Marshal(h)
}

func Decode(data []byte) (history.History, error) {
	var h history.History
	err := json.Unmarshal(data, &h)
	if err != nil {
		return history.History{}, err
	}
	return h, h.Validate()
}

func Save(path string, h history.History) error {
	data, err := Encode(h)
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0o644)
}

func Load(path string) (history.History, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return history.History{}, err
	}
	return Decode(data)
}
```

这里 `Decode` 在反序列化后调用 `Validate`，避免格式正确但内容非法的数据进入系统。注意：以上是包职责划分片段，不是可直接运行的完整命令。路径由调用者传入，领域对象既不知道文件位于何处，也不需要知道数据最终是否来自文件、网络或数据库。

### cmd/historytool：收集参数并编排调用

### `cmd/historytool`：收集参数并编排调用

命令入口属于应用层：它理解用户输入的 `flag`、决定执行顺序、处理进程级错误，但不承载消息校验或 JSON 编解码规则。

```text
historytool
    │
    ├── 解析 -file、-sender
    ├── historyfile.Load(path)
    ├── history.Validate(messages)
    ├── 按条件筛选或展示
    └── historyfile.Save(path, messages)
```

目录中的职责可保持为：

```text
history/                 领域规则：Message、History、Validate
historyfile/             文件适配器：JSON 字节、读写文件
cmd/historytool/         命令入口：flag、标准输入输出、编排
```

入口代码只把参数转换为调用所需的数据：

```go
path := flag.String("file", "history.json", "历史文件路径")
sender := flag.String("sender", "", "按发送者筛选")
flag.Parse()

items, err := historyfile.Load(*path)
if err != nil {
    return err
}
if err := history.Validate(items); err != nil {
    return err
}

for _, m := range items {
    if *sender == "" || m.Sender == *sender {
        fmt.Println(m.Text)
    }
}
```

依赖箭头应始终向内：

```text
cmd/historytool ──→ historyfile ──→ history
       └──────────────────────────→ history
```

`history` 不应导入 `cmd/historytool`。否则领域规则会知道 `flag`、终端输出甚至命令名称；测试校验规则时也会被迫携带命令环境。类似地，`history` 不应知道文件路径：路径是文件适配器和命令入口的基础设施细节，而消息是否合法应只由消息内容决定。

以上仅展示多文件项目中的包边界与调用片段，不是可直接运行的完整命令。

### 画出依赖箭头，预防循环与错误耦合

### 画出依赖箭头，预防循环与错误耦合

面对“导入 IM 消息、校验历史、导出 JSON 文件”的需求，先画依赖箭头，比先写代码更能暴露耦合问题。推荐的方向是：

`cmd/historytool → historyfile → history`

其中：

- `history` 是领域包，只定义 `Message`、`History` 与 `Validate` 等业务规则。
- `historyfile` 是文件适配器，负责把 JSON 字节解析为 `history.History`，以及读写文件。
- `cmd/historytool` 是命令入口，收集 `flag` 参数，选择输入输出路径，并编排调用。

目录可表达为：

```text
history/
  message.go
  history.go
  validate.go
historyfile/
  json.go
  file.go
cmd/historytool/
  main.go
```

这是一组教学片段，不是可直接运行的完整命令；真实项目还需要模块路径、错误处理、测试和具体的序列化细节。

正确依赖意味着：新增 `--input`、`--output` 或 `--strict` 等命令行参数时，通常只修改 `cmd/historytool`；替换 JSON 文件为网络请求、数据库或内存数据时，主要修改或新增适配器包；而“消息时间不能倒退”“发送者不能为空”等校验规则仍留在 `history`。

错误设计常形成循环：

`cmd/historytool → history → historyfile → history`

例如，若 `history.Validate` 为了读取配置而导入命令包，或领域对象为了保存自身而导入 `os`、`json`、文件包，依赖就会反向。Go 会直接拒绝导入循环；即使通过接口、全局变量等方式绕开，领域规则也会被路径、参数格式和 JSON 表示绑死。

因此，`history` 不应知道文件路径，更不应知道 `flag`。路径属于命令入口的用户交互细节，JSON 字节属于文件适配器的传输细节；领域包只接收消息和历史值，并回答它们是否满足业务规则。

> **要点** — 让领域规则居中稳定，文件和命令作为外层适配器单向依赖它，才能避免循环并降低演进成本。

当历史领域包既要调用文件加载，又被文件包用于构造消息时，循环导入会暴露职责边界不清的问题。本节通过重画依赖方向，建立可编译、可演进的包结构。

### 从循环导入看清职责混杂

### 从循环导入看清职责混杂

设想 `history` 包提供历史消息领域能力，并希望直接加载文件：

`history.Load(path)` → 调用 `historyfile.Read(path)`

而 `historyfile` 读取完磁盘内容后，又要返回领域消息：

`historyfile.Read(path)` → 构造 `history.Message`

依赖便形成闭环：

`history → historyfile → history`

Go 要求包依赖图必须是有向无环图，因此编译器会拒绝这种结构。问题不只是“编译顺序无法安排”：无论先编译哪一方，另一方的类型或函数都尚不可用；更深层地说，两个包都在同时承担了对方的一部分职责。

- `history` 本应关注消息、时间线、查询与业务规则；
- `historyfile` 本应关注路径、文件格式、字节读取、解析和写入；
- 但前者知道了具体存储实现，后者又知道了核心领域类型。

这说明“加载历史”被混成了两件事：**从何处取得数据**与**数据在领域中表示为何物**。包循环正是这种边界不清的编译期信号，而不是靠调整导入位置、全局变量或复制一份 `Message` 类型就能真正消除的问题。

### 为什么 Go 必须拒绝循环

### 为什么 Go 必须拒绝循环

把包之间的导入关系看成一张有向图：`A -> B` 表示包 `A` 需要先获得包 `B` 的声明、类型和初始化结果。Go 要求这张图是**有向无环图**，因此编译器可以进行拓扑排序：

`基础类型包 → 文件实现包 → 领域服务包 → 命令入口`

排序后，编译器能够按依赖顺序完成类型检查、编译与链接；运行时也能保证每个包只初始化一次，并且在使用前，其依赖已经初始化完毕。

若出现：

`history -> historyfile -> history`

就不存在“第一个可编译的包”。编译 `history` 前要先检查 `historyfile`；检查 `historyfile` 又必须回到尚未完成的 `history`。这不仅是工具链的限制，更意味着设计上的层次消失了：究竟谁拥有 `Message`，谁负责加载，谁负责把加载结果组装为历史记录，已经无法从依赖方向判断。

尤其要区分“函数调用可以互相递归”和“包导入不能成环”。同一包内的函数可在声明完整后递归调用；而包导入涉及独立的类型检查单元、编译产物和初始化顺序。允许循环会迫使编译器处理部分完成的类型、含糊的初始化先后及隐藏的跨包耦合。

因此，循环导入应被视为架构信号：两个包不再是清晰的上下层，而是在共同承担某个未被明确安放的职责。解决方式不是绕过检查，而是重新确定依赖方向。

### 拆法一：由上层命令编排调用

### 拆法一：由上层命令编排调用

最直接的拆法，是把“加载历史记录”从任一底层包中拿出来，交给更高一层的命令或应用服务编排。此时包不再互相请求对方完成工作，而是各自提供单一能力：

- `history`：定义并操作领域对象，例如 `Message`、追加消息、查询记录。
- `historyfile`：负责文件格式、路径、打开文件、读取字节与写回字节。
- `command` 或 `app`：决定“从哪个文件加载、如何解析、加载后交给谁使用”。

依赖方向变为：

`command → history`  
`command → historyfile`

而不是：

`history → historyfile → history`

例如，文件包只返回原始内容或独立的读取结果：

```go
// historyfile
func Read(path string) ([]byte, error)
```

应用层取得内容后，再调用领域包完成解释和恢复：

```go
data, err := historyfile.Read(path)
if err != nil {
    return err
}

messages, err := history.Parse(data)
if err != nil {
    return err
}

h := history.New(messages)
```

也可以反过来：`history` 暴露序列化与反序列化规则，`historyfile` 只负责持久化字节。关键不在于谁解析文本，而在于文件包不能为了构造 `history.Message` 而导入领域包，同时领域包也不能为了读取文件而导入文件包。

这种结构使调用顺序清晰：命令层先读取，再解析，再组装领域对象。底层包只描述“我能做什么”，上层才决定“何时把它们串起来”。因此，命令层虽然多写了几行胶水代码，却换来了稳定的依赖方向和更容易替换的存储实现。

### 拆法二：共享消息类型归属领域包

### 拆法二：共享消息类型归属领域包

若 `Message` 表示“历史记录中的一条消息”，它就是稳定的领域概念，不应归属于 `historyfile`。将其放入 `history`（或更小的 `domain`）包后，依赖方向可以固定为：

`historyfile → history`

此时文件包只知道如何读取 JSON、校验文件格式，并把外部表示转换为领域对象；领域包不再知道文件、路径或 JSON 的存在。

```text
history/
  message.go      // Message、History 等领域类型
historyfile/
  load.go         // JSON 读取、解码、转换
```

例如，领域包声明核心类型：

`type Message struct { Role string; Content string }`

文件包则直接返回领域类型：

`func Load(path string) ([]history.Message, error)`

调用方负责把两者串起来：

`messages, err := historyfile.Load(path)`

关键不在于“把类型挪走”本身，而在于类型归属应由语义决定。`Message` 描述的是业务中的消息，而不是某种 JSON 文件格式；即使未来改为数据库、网络接口或内存缓存，`Message` 仍然成立。相反，JSON 字段名、版本号、文件包装结构等应留在 `historyfile` 内部，例如定义私有的 `fileMessage`，再转换为 `history.Message`。

不要为消除循环而在两个包中复制同名 `Message`：它们会变成不同类型，转换代码和字段同步会不断扩散。也不要借助全局变量让领域包“回调”文件包；这只是把显式依赖改成隐式依赖。让稳定领域类型位于依赖图下游，文件细节单向依赖它，包边界才会清晰。

### 拆法三：在使用方定义小接口

### 拆法三：在使用方定义小接口

当 `history` 只需要“加载消息”这一项能力，而不应知道文件格式、路径策略或缓存细节时，可由**使用方**声明最小接口：

```go
type Loader interface {
    Load() ([]Message, error)
}

func Import(l Loader) (*History, error) {
    msgs, err := l.Load()
    if err != nil {
        return nil, err
    }
    return New(msgs), nil
}
```

`historyfile` 只需实现该接口：

```go
func (f File) Load() ([]history.Message, error) { /* 读取文件 */ }
```

这样依赖方向变为 `historyfile → history`；`history` 依赖的是自己定义的抽象能力，而非 `historyfile` 的具体实现。调用处负责组装：

```go
h, err := history.Import(historyfile.New(path))
```

接口应小且贴近调用需求。若 `history` 只调用 `Load`，就不要声明包含 `Save`、`Close`、`Path` 的“大而全”接口；否则抽象会反过来泄漏基础设施细节。

三种拆法的选择可概括为：

- **上层编排**：导入动作本质是应用流程，领域包无需暴露“导入”用例时采用；依赖最直观。
- **共享领域类型包**：`Message`、事件、值对象被多个稳定包共同使用，且不属于任何单一实现时采用。
- **使用方小接口**：领域逻辑需要某项外部能力，但应允许文件、数据库、网络等多种实现替换时采用。

不要用全局 `Loader` 注册实现：初始化顺序、并发测试和运行时替换都会变得脆弱。也不要在两个包各复制一份 `Message`：字段相同不等于类型相同，转换代码会扩散，未来字段演进也容易产生静默不一致。

> **要点** — 循环导入不是语法小问题，而是依赖方向错误；应让领域模型稳定、文件细节外置，并由上层组织流程。

本节从访问边界与接口归属出发，安排消息历史的内存、文件实现及命令入口，避免把可替换细节误做公开承诺。

### internal 是编译期访问边界

### internal 是编译期访问边界

在 Go 中，`internal` 表达的是一种**源码导入规则**：某个包位于 `a/internal/b` 时，只有目录 `a` 及其子目录中的代码，才能导入 `a/internal/b`。

例如：

```text
project/
├── cmd/history/
├── history/
└── internal/historyfile/
```

`cmd/history`、`history` 都位于 `project/` 目录树下，因此可以导入 `project/internal/historyfile`；而另一个独立模块、或 `project` 目录树之外的代码，即使知道该包路径，也会在编译时被 Go 工具链拒绝。

这条规则适合保护尚未承诺的实现细节，例如：

- 文件历史记录的 JSON 编码、临时文件与原子写入策略；
- 具体文件名、目录布局和迁移逻辑；
- 仅供本项目命令入口使用的辅助函数；
- 未来可能替换为 SQLite、远程存储或其他格式的实现。

但 `internal` 不是安全机制。它不验证“谁在调用”，不区分用户身份，也不会在程序运行后阻止访问。已经编译进同一可执行文件的代码仍可互相调用；文件是否可读写仍由操作系统权限决定；接口是否允许某种操作仍应由业务授权逻辑决定。

因此可以把它理解为：`internal` 防止外部源码**依赖**不稳定细节，而不是防止外部主体**攻击**系统。若文件实现只服务当前项目，可放入 `internal/historyfile`；若准备向其他项目承诺可复用的文件适配器，才应将其作为公开包设计，并接受其路径与行为成为兼容性承诺。

### 文件实现该内部化还是公开

### 文件实现该内部化还是公开

JSON 文件存储看似只是“另一种历史实现”，但它的位置决定了包是否对外承诺这项能力。可先比较两种方案：

| 方案 | 典型位置 | 对外含义 | 适用条件 |
|---|---|---|---|
| 内部文件实现 | `internal/historyfile` | 文件格式、路径策略和写入细节均可自由调整 | 仅服务当前应用或父目录树内多个命令 |
| 公开文件适配器 | `historyfile` 或独立公开模块 | 外部程序可以构造、配置并依赖该实现 | 明确希望其他项目复用文件持久化能力 |

若代码位于：

`example.com/chat/internal/historyfile`

则只有 `example.com/chat` 及其子目录中的代码能够导入它；外部模块即使知道包路径，也会在编译阶段被拒绝。这里的 `internal` 是**编译访问边界**，不是认证、授权或运行时安全机制：它不能防止用户读取 JSON 文件，也不能替代文件权限控制。

当文件实现只是命令程序的基础设施时，内部化通常更稳妥：

- 可以随时把 JSON 改为 SQLite、分片文件或加密格式；
- 可以调整目录布局、默认文件名和写入时机；
- 不必维护外部调用者可能依赖的构造函数与错误语义。

反之，若产品明确要支持“其他程序将消息历史保存为兼容 JSON 文件”，就应提供公开适配器，并把稳定契约写清楚，例如：

`New(path string) (History, error)`

此时应承诺哪些字段、编码规则、并发限制和损坏文件的处理方式；否则公开包只会把尚未设计成熟的细节固化为兼容负担。

无论文件实现是否公开，调用方通常只需要小接口：

`Append(Message) error`  
`List() ([]Message, error)`

内存实现与文件实现都满足它，命令入口便只依赖该接口。接口应由调用者的操作需求产生，而不是因为某个 JSON 类型已经存在就提前暴露。

### 接口由调用者的需要塑形

### 接口由调用者的需要塑形

命令入口和领域用例并不关心历史记录写入的是内存、JSON 还是数据库；它们只提出行为需求：

- 收到消息后，能够保存；
- 指定会话或用户时，能够读取历史；
- 按条件查询最近若干条记录。

因此，接口应放在使用历史能力的一侧，并以调用者的语言描述。例如：

`History`：`Append(record)`、`List(conversationID, limit)`。

这里的 `record` 可以是领域层定义的消息记录，包含会话标识、发送者、内容、时间等必要事实。命令层只依赖这个小接口：处理消息时调用 `Append`，展示上下文时调用 `List`。它无需知道文件路径、JSON 编码、追加写入、文件锁或损坏恢复策略。

反过来，若接口直接暴露 `SaveJSON(path, data)`、`LoadJSON(path)`，调用者就被迫理解存储格式和文件细节；一旦改用 SQLite、远程服务或缓存，业务代码也会跟着变化。这不是抽象，而是把实现泄漏成依赖。

可以先静态推演两种实现：

- `MemoryHistory`：用切片或映射保存记录，适合快速运行与测试；
- `HistoryFile`：把同一批记录持久化到文件，负责 JSON 编解码与路径处理。

两者只要满足 `History`，命令入口便无需修改。此时 JSON 文件实现是可替换的适配细节；若暂不承诺给外部复用，可置于 `internal/historyfile`。接口的稳定性来自领域调用者长期不变的需求，而不是某种存储格式暂时方便的操作。

### 内存与文件实现的静态推演

### 内存与文件实现的静态推演

先让领域层只表达“历史消息能做什么”，而不关心消息存在哪里：

```go
type History interface {
    Append(Message) error
    List() []Message
}
```

`Message` 属于领域模型，例如包含发送者、内容、时间等。命令处理或消息规则只依赖 `History`：收到消息时调用 `Append`，需要上下文时调用 `List`。因此，它可以接受内存实现：

```go
type MemoryHistory struct {
    messages []Message
}
```

也可以接受 JSON 文件实现：

```go
type JSONFileHistory struct {
    path string
}
```

两者都满足同一接口，但职责不同。`MemoryHistory` 直接维护切片，适合进程内运行、演示和快速验证规则；`JSONFileHistory` 在读写时将 `[]Message` 编码、解码为 JSON，以获得跨进程保存能力。

关键依赖方向应保持为：

`命令入口 / 领域规则 → History ← 内存实现、文件实现`

其中，文件实现可以依赖 `Message`，因为它必须知道要编码什么；但 `Message`、消息规则和 `History` 不应导入 JSON、路径或文件系统包。否则“保存格式”会反向污染领域概念。

接口也不应因为“可能有文件实现”而预先设计得很大。它来自调用者的实际需要：若规则只追加和读取，就只声明 `Append`、`List`。以后出现按会话查询、清理历史等调用需求，再谨慎扩展，避免把存储细节伪装成领域能力。

### 变更边界与测试预告

### 变更边界与测试预告

设想一个 IM 历史工具最初只有内存存储：

```go
type History interface {
    Append(Message) error
    List() []Message
}
```

命令入口只依赖 `History`：它追加消息、读取历史，却不关心数据是否写入文件。因此，后续加入 `JSONFileHistory` 时，真正稳定的是调用方所需的这两个行为，而不是某个具体构造函数。

若 `jsonfile` 只是命令程序内部的持久化细节，可放入 `internal/historyfile`。`internal` 的限制是：只有其父目录树内的代码能够导入它；这是编译期访问边界，用来阻止外部项目形成依赖，并不是用户认证、权限校验或运行时安全机制。这样可以自由调整文件格式、路径策略和缓存实现，而不必维护外部兼容性。

反之，若明确希望其他程序复用 JSON 文件历史能力，就应提供公开适配器，并谨慎承诺其 API。例如把原先的：

`NewHistory()`

改为：

`NewHistory(path string)`

会迫使所有调用者理解文件路径，即使它们只需要内存历史。更稳妥的方式是保留内存构造入口，另设文件构造入口，或让应用层负责选择实现。

消息新增 `Sender`、`Timestamp` 等字段也有边界：领域接口通常无需变化；文件实现则要考虑旧 JSON 缺字段时的默认值与读取兼容。测试将随后验证这些约束：命令测试可注入内存替身，文件实现测试关注序列化与持久化。此处先不运行测试，重点是让接口由调用者需要的能力决定，而非由存储细节反推。

> **要点** — internal 隔离可替换实现；公开接口应由调用者需求决定，文件格式不应反向塑造领域规则。

本节建立 Go 模块与包的版本边界：依赖如何被声明、版本如何被选择，以及代码版本为何不能替代历史文件格式版本。

### 模块、目录与导入路径的对应关系

### 模块、目录与导入路径的对应关系

Go 中几个看似相近的名称，实际描述的是不同层次的对象：

- **模块路径**：`go.mod` 第一行的 `module` 值，例如 `example.com/archiver`。它标识一个可独立发布、带版本的代码单元，也是本模块内包导入路径的公共前缀。
- **目录**：文件系统中的位置。例如模块根目录下的 `message/`、`storage/jsonfile/`。目录用于组织源码；通常一个目录对应一个包。
- **包名**：源码中 `package` 后的标识符，例如 `package message`。它决定代码中引用该包成员时使用的默认名称，如 `message.Record`，但不必与目录名完全一致。
- **导入路径**：其他代码定位包时写入 `import` 的路径。例如目录 `message/` 对应 `example.com/archiver/message`；目录 `storage/jsonfile/` 对应 `example.com/archiver/storage/jsonfile`。

可将映射理解为：

`模块路径` + `/` + `模块内目录` → `包的导入路径`

例如：

- `go.mod`：`module example.com/archiver`
- 文件：`message/record.go`，声明 `package message`
- 导入：`import "example.com/archiver/message"`
- 使用：`message.Record`

其中，导入路径回答“代码从哪里获得这个包”，包名回答“获得后在当前文件中如何称呼它”。一个模块可以包含多个包；同一模块内的 `message` 只依赖领域规则，而 `storage/jsonfile` 则承载文件读写细节。通过不同目录和导入路径分开它们，依赖方向便能清晰表达：基础消息规则不应反向导入具体文件实现。

### go.mod 中记录什么依赖信息

### go.mod 中记录什么依赖信息

`go.mod` 是模块的依赖契约，而不是某次构建的完整文件清单。它通常围绕三类声明组织：

- `module`：定义当前模块路径，例如 `module example.com/chat/app`。这个路径既是模块身份，也是其他代码导入本模块包时使用的前缀；包的完整导入路径通常是“模块路径 + 子目录”。
- `go`：声明模块采用的 Go 语言版本语义，例如 `go 1.22`。它用于约束语言、模块行为及工具链理解该模块时应遵循的兼容规则，不等同于“机器上唯一允许安装的 Go 版本”。
- `require`：声明当前模块直接使用的外部模块及其最低需求版本，例如 `require example.com/jsonutil v1.4.0`。

这里的“直接”很重要：若本项目导入了 `jsonutil`，则应由本项目的 `go.mod` 记录它；而 `jsonutil` 内部又依赖哪些日志库、编码库，属于其实现细节，通常不应由本项目手工逐项声明。它们仍可能参与最终构建，但不意味着都是本项目的直接设计选择。

因此，`go.mod` 表达的是“我明确依赖什么能力及其版本下界”，而不是锁定每个传递依赖的具体实现组合。消息规则、历史 JSON 格式等业务兼容性，也不能仅靠一条 `require` 声明来定义：模块版本描述代码发布演进，文件中的 `Version` 字段描述数据格式演进，二者职责彼此独立。

### 语义版本表达兼容承诺

### 语义版本表达兼容承诺

语义版本通常写作 `vMAJOR.MINOR.PATCH`。它不是简单的发布编号，而是模块对使用者作出的兼容性承诺：调用方能否在不改代码的前提下更新依赖，取决于变动落在哪一位。

- `PATCH`：修复缺陷、优化实现或补充不改变既有行为的细节。例如修正文件读取时的资源释放问题。原有导入、函数签名和合法输入的语义应保持不变。
- `MINOR`：在兼容前提下增加能力。例如新增 `DecodeOptions`、增加一个导出的辅助函数，或让解析器接受一种此前不支持但合法的新消息形式。旧调用方无需修改。
- `MAJOR`：允许不兼容变更。例如删除导出函数、修改参数或返回值类型、改变错误处理约定，或将原本接受的输入改为拒绝。此时旧调用方可能无法编译，或虽能编译却得到不同语义。

因此，API 演进的基本推导是：若希望使用者能够安全地从 `v1.3.0` 更新到 `v1.4.0`，就不能破坏 `v1.3.0` 已公开的契约；若确实需要破坏契约，应进入 `v2.0.0`，而不是伪装成一次普通的小版本更新。

Go 将这一承诺编码到导入路径中。主版本为 `v0` 或 `v1` 时，模块路径可为：

`example.com/acme/message`

从 `v2` 起，路径必须体现主版本：

`example.com/acme/message/v2`

调用方也相应写成：

`import "example.com/acme/message/v2"`

这使 `v1` 与 `v2` 成为不同的包路径，能够在同一项目中并存。它们不是“同一依赖的两个可互换版本”，而是两套独立 API：旧代码继续依赖 `v1`，新代码可逐步迁移到 `v2`，迁移成本不会被一次依赖更新隐式扩散。

### 最小版本选择的概念边界

### 最小版本选择的概念边界

最小版本选择（MVS）并非“总是挑选版本号最小的依赖”，而是：对依赖图中同一模块的多个最低版本要求，选择其中**最高的最低要求**。

例如，主模块同时依赖 `A` 与 `B`：

- `A@v1.2.0` 要求 `C@v1.3.0`
- `B@v1.5.0` 要求 `C@v1.6.0`

最终构建会选择 `C@v1.6.0`。原因是 `C@v1.3.0` 无法满足 `B` 的最低要求，而 `v1.6.0` 同时满足两条路径。可将其概括为：

$$
C = \max(v1.3.0,\ v1.6.0)=v1.6.0
$$

这里的“最小”指每个模块声明的是“至少需要此版本”，而不是对整个依赖树逐项锁死。`go.mod` 主要记录当前模块直接依赖及其版本约束；传递依赖的具体实现版本由整张依赖图共同推导。

这种规则服务于可重复构建：在相同模块声明集合下，版本选择结果可预测，不会因为某个依赖发布了更高的新版本就自动漂移。它也不等同于锁文件：MVS 关注依赖要求能否共同满足，而非保存每个传递包的全部历史细节。

### 模块版本不等于历史 JSON 版本

### 模块版本不等于历史 JSON 版本

设想一个 IM 历史工具：程序把会话记录写入 `history.json`，并在文件中保存字段：

```json
{"Version": 2, "Messages": [...]}
```

这里的 `Version: 2` 描述的是**文件数据格式**：读取器应按第 2 版 JSON 规则解释字段，例如消息时间从字符串改为 Unix 时间戳，或新增了附件信息。它服务于“这份旧文件还能否被正确读回”。

而模块版本描述的是**代码发布契约**。例如工具模块从 `example.com/im/history v1.8.0` 升到 `v1.9.0`，可能只是修复排序错误；升到 `v2.0.0`，则可能修改了 Go API 的导入路径、函数签名或包结构。模块主版本变化影响的是编译该程序的源码及其依赖关系，不自动说明 JSON 格式发生变化。

两者可以独立演进：

- 模块从 `v1.8.0` 升到 `v1.9.0`，仍读写 `Version: 2`：代码修复了问题，磁盘格式不变。
- 模块仍是 `v1.9.0`，写入时从 JSON `Version: 2` 改为 `3`：这是文件格式演进，必须保留旧版本读取或提供迁移。
- 模块发布 `v2.0.0`，却继续支持 JSON `Version: 1`、`2`、`3`：Go API 不兼容不等于历史数据必须失效。

因此，读取逻辑应先检查 JSON 的 `Version`，再选择对应解码与迁移路径；`go.mod` 中的模块版本则用于约束构建时采用哪套代码。不要用模块主版本猜测文件格式，更不要拿 JSON 的 `Version` 替代依赖版本管理。

> **要点** — 模块版本管理代码依赖兼容性；JSON Version 管理持久化数据兼容性，两者必须分别演进。

消息历史的演进不只是新增字段或修改函数签名，而是一次对源码、行为、数据与迁移成本的兼容性决策。

### 四类兼容性：先界定变更影响

### 四类兼容性：先界定变更影响

一次接口或文件格式变更，至少要分别判断四类兼容性；“能编译”并不等于“可安全升级”。

| 变更 | 源码兼容 | 行为兼容 | 数据兼容 | 运营迁移 |
|---|---|---|---|---|
| 增加 `EditedAt` | 通常兼容 | 可能改变展示、排序或同步语义 | 旧记录缺字段需有默认解释 | 一般可渐进升级 |
| `Save()` 改为 `Save(path) error` | 不兼容，调用点必须修改 | 调用者必须处理失败 | 不直接影响历史文件 | 需协调所有调用方发布 |
| JSON `version: 1 → 2` | 取决于解析接口 | 新旧读取规则可能不同 | 必须定义旧文件如何读取 | 可能需要扫描、转换、回滚方案 |

**源码兼容**关注调用方是否仍能编译。例如将：

`Save()`

改为：

`Save(path string) error`

会立即暴露全部旧调用点。这是有价值的强制迁移信号；若保留旧方法作为包装器，则可暂时兼容，但必须明确其默认路径和弃用期限。

**行为兼容**关注相同输入是否仍产生可预期结果。`EditedAt` 即使只是新增字段，也要规定零值含义：它表示“从未编辑”，还是“时间未知”？若界面开始按编辑时间排序，旧消息的排序结果可能改变。`Save` 新增 `error` 后，错误身份也属于契约：调用者应能用 `errors.Is` 识别诸如“路径非法”或“写入失败”，而不能依赖易变的错误文字。

**数据兼容**关注磁盘上的历史 JSON。推荐策略是“先读旧，再写新”：读取器识别 `version: 1` 与 `version: 2`，将 v1 缺失的 `EditedAt` 映射为约定零值；写入器只生成 v2。对未知未来版本应明确拒绝，而非猜测解析，以避免静默损坏数据。

**运营兼容**则问：用户升级时文件、脚本、备份和回滚是否可管理。并非每次 v1→v2 都要提供批量迁移工具；若运行时可读取旧文件，延迟迁移往往更稳妥。只有旧格式即将被移除、文件量巨大或外部系统只能接受 v2 时，才值得引入显式迁移工具，并配套备份、幂等执行与失败恢复。

### 兼容矩阵：把改动转成可审查契约

### 兼容矩阵：把改动转成可审查契约

“增加 `EditedAt`”“把 `Save()` 改为 `Save(path) error`”“历史 JSON 从 version 1 升到 version 2”看似是局部改动，实际影响不同类型的使用者。应先列出兼容矩阵，再决定实现与发布顺序：

| 使用者/状态 | 改动后是否可用 | 必须满足的契约 | 处理方式 |
|---|---:|---|---|
| 旧源码调用方：`Save()` | 否 | 编译期签名已变化 | 修改为 `Save(path)`，并处理 `error` |
| 新源码调用方 | 是 | 必须检查保存失败，而非忽略错误 | 通过编译与测试约束 |
| 旧历史文件：version 1 | 是 | 读取器识别旧版本；缺失 `EditedAt` 有明确默认语义 | 先读旧，内存中归一化 |
| 新历史文件：version 2 | 是 | 写入 `version: 2` 与 `EditedAt` | 只写新格式 |
| 未知版本文件 | 否 | 不得猜测字段含义或静默降级 | 返回可识别的版本错误 |
| 依赖错误文字的脚本/测试 | 视契约而定 | 错误身份、包装层级和关键文字稳定 | 优先用 `errors.Is` 或错误类型判断 |
| 灰度部署中的旧二进制 | 取决于文件流向 | 旧程序可能无法读取新写出的 version 2 | 控制发布顺序或隔离存储路径 |

这里的“可用”不等于“无需关注”。例如 version 1 文件可被新程序读取，属于**数据兼容**；但旧程序读取 version 2 文件失败，则意味着部署期间存在**行为兼容**风险。若多个版本会同时运行，必须明确谁能读、谁能写，以及新文件何时开始落盘。

推荐的边界是：读取端兼容已知旧格式，写入端统一生成新格式；未知版本明确拒绝。这样避免“宽松解析”把损坏文件、未来版本或语义不兼容的内容误当成可恢复数据。

错误同样是契约的一部分。调用方应能区分“路径不可写”“JSON 损坏”“版本不支持”；若已有测试或自动化依赖错误文字，修改措辞也可能构成破坏性变更。迁移工具是否提供，取决于旧文件规模、旧程序存活时间和是否需要提前批量验证；本章只定义兼容边界，不实现迁移。

### API 演进：EditedAt 与 Save(path) error

### API 演进：EditedAt 与 `Save(path) error`

给消息增加 `EditedAt`，表面上只是新增字段：

```go
type Message struct {
    ID        string
    Text      string
    EditedAt  time.Time
}
```

对使用命名字段初始化的调用者而言，新增字段通常保持源码兼容；旧代码仍可编译，且零值 `time.Time{}` 可表示“从未编辑”。但位置式复合字面量会立即失效：

```go
Message{"m1", "hello"} // 新增字段后编译失败
```

因此，公开结构体一旦可能扩展，应优先使用命名字段初始化，并明确零值语义。行为层面还要区分“未编辑”与“编辑时间恰好缺失”：前者是正常状态，后者若来自损坏数据则应在读取边界报错。

将：

```go
func Save() 
```

改为：

```go
func Save(path string) error
```

则是主动收紧契约，通常不具备源码兼容性：所有旧调用都必须补充路径并处理返回值。它同时改变调用语义：保存位置不再由隐藏全局状态决定，失败也不再只能打印、忽略或崩溃，而必须由调用方决定重试、提示还是向上返回。

| 变更 | 源码兼容 | 行为兼容 | 主要风险 |
|---|---|---|---|
| 新增 `EditedAt` | 命名初始化通常兼容 | 需定义零值 | 位置式字面量、缺失时间 |
| `Save()` 改为 `Save(path) error` | 不兼容 | 不兼容 | 路径归属、错误处理责任 |

`error` 不是普通文本。调用者应能通过 `errors.Is` 判断稳定的错误身份，例如 `ErrInvalidPath`、`ErrHistoryCorrupt`；错误文字则面向日志、终端与测试，也应视为用户可见契约，避免随意改写。可采用“稳定身份 + 带上下文文字”：

```go
return fmt.Errorf("保存历史文件 %q: %w", path, ErrInvalidPath)
```

这样，程序依赖错误身份分支，人类依赖清晰文字定位；两者都不应被偶然实现细节绑架。

### JSON v1 到 v2：先读旧，再写新

### JSON v1 到 v2：先读旧，再写新

历史文件应把“格式版本”作为显式协议，而非根据字段是否存在猜测年代。例如：

`{"version":1,"messages":[...]}`

升级到 v2 后，新增 `edited_at`，写入格式统一为：

`{"version":2,"messages":[{"text":"…","edited_at":"2025-03-08T10:00:00Z"}]}`

核心策略是**读兼容旧版本，写只产生新版本**：

| 输入版本 | 解码策略 | 内存模型 | 后续保存 |
|---|---|---|---|
| v1 | 按旧结构解码 | 为缺失的 `EditedAt` 补零值 | 编码为 v2 |
| v2 | 按新结构解码 | 保留完整字段 | 编码为 v2 |
| 缺失、未知或未来版本 | 返回版本不支持错误 | 不产生部分结果 | 不覆盖原文件 |

v1 解码时，“缺少字段”不应直接等同于“空字符串”。应先确认 v1 的语义确实没有编辑时间，再将 `EditedAt` 补为约定的零值，例如 `time.Time{}`。该零值应在领域层被明确解释为“从未编辑”，而不是“编辑时间未知”；若两者需要区分，就不能靠默认值掩盖信息缺失，必须增加独立状态或迁移标记。

不要让 `json.Unmarshal` 直接解到最终结构后便假定成功：版本号决定字段语义、默认值和校验规则。较稳妥的流程是先读取最小信封结构中的 `version`，再分派到 `decodeV1` 或 `decodeV2`，最后转换为统一的领域对象。这样 v1 的兼容逻辑不会泄漏到业务代码。

对未知版本应明确拒绝，而非“尽量读取”。未来 v3 可能改变时间格式、删除字段含义或增加加密信息；若旧程序忽略这些差异并随后按 v2 保存，可能造成不可逆的数据丢失。错误应保留可判断的身份，例如 `ErrUnsupportedHistoryVersion`，文字可说明具体版本号，但调用方不应依赖文字匹配。

“先读旧，再写新”意味着一次成功保存会自然完成格式升级；它简单，但也意味着未保存的旧文件保持 v1。是否提供批量迁移工具，取决于运营需求：需要预检查、统一备份、审计或跨机器升级时可提供；仅为减少格式分支时，则让正常保存渐进迁移通常更安全。

### 运营迁移：虚构 IM 历史工具的取舍

### 运营迁移：虚构 IM 历史工具的取舍

设想本地 IM 客户端把历史记录保存在 `history.json`：版本 `1` 没有 `EditedAt`，版本 `2` 为每条消息增加该字段。面对旧文件，产品并非只有“能否解析”这一项技术判断，还要决定用户何时承担升级成本。

| 策略 | 读取旧版 | 写入结果 | 业务后果 | 适用场景 |
|---|---|---|---|---|
| 惰性升级 | 可读 `v1` | 下次保存写为 `v2` | 用户无感，但首次写入隐含迁移 | 单机、本地数据、旧格式可无损解释 |
| 显式迁移工具 | 默认不自动改写 | 用户执行工具后写 `v2` | 可预览、备份、审计和批量处理 | 数据量大、迁移不可逆或需运维控制 |
| 直接拒绝旧数据 | 拒绝 `v1` | 不写入 | 用户必须升级或导入，支持成本高 | 旧格式语义错误、存在安全风险或无法可靠转换 |

惰性升级常最符合个人 IM 的体验：读取 `v1` 时将缺失的 `EditedAt` 解释为零值，内存中统一为新模型；只有 `Save(path) error` 成功后，磁盘才变为 `v2`。但这意味着一次普通“退出保存”可能改变文件格式，用户若回退到旧客户端，旧客户端必须明确是拒绝、只读，还是容忍未知字段。

显式迁移工具例如 `im-history migrate --input old.json --backup`，适合运营侧需要统计失败原因、生成备份、分批执行的情形。它还能在正式改写前报告：可迁移记录数、损坏记录数、目标版本与预计文件大小。不过，工具本身也是长期接口：命令参数、退出码、错误身份和提示文字都可能被脚本、客服手册或监控规则依赖。

直接拒绝旧数据最简单，却把兼容成本转移给用户。若采用它，错误应可判别，例如返回“历史版本不受支持”的稳定错误身份；错误文字则需谨慎变更，避免破坏依赖固定提示的自动化流程。

本章只分析这些取舍，不实现迁移工具。实现前应先写清契约：支持哪些历史版本、是否“先读旧再写新”、未知版本是否拒绝、失败时是否保证原文件不变，以及回退旧客户端时的预期行为。

> **要点** — 兼容性必须同时审查代码、行为、数据和运营路径；版本化读取、明确拒绝与稳定错误契约缺一不可。

本节以虚构 IM 历史工具为例，将消息规则、JSON 文件细节与命令入口拆入不同 Go 包，并沿依赖、错误与兼容性逐项追踪。

### 从目录树辨认包、路径与模块

### 从目录树辨认包、路径与模块

设项目根目录的 `go.mod` 为：

```text
module example.com/im/historytool
```

目录树可写成：

```text
historytool/
├── go.mod
├── main.go
├── history/
│   ├── message.go
│   ├── service.go
│   └── errors.go
├── historyfile/
│   ├── file.go
│   └── json.go
└── internal/
    └── testdata/
        └── sample.json
```

先区分四个容易混淆的概念：

- **目录**：文件系统位置，如 `history/`。
- **包名**：`.go` 文件中的声明，如 `package history`；同一目录中参与同一构建的源文件必须使用同一包名。
- **导入路径**：代码中 `import` 使用的名字，由模块路径加目录相对路径组成，例如 `example.com/im/historytool/history`。
- **模块路径**：`go.mod` 中的 `module` 值，即本模块内所有公开导入路径的前缀。

因此对应关系如下：

| 目录 | 包声明 | 导入路径 | 责任 |
|---|---|---|---|
| 根目录 | `main` | `example.com/im/historytool` | 命令组装与进程入口 |
| `history/` | `history` | `example.com/im/historytool/history` | 消息、查询规则、领域错误 |
| `historyfile/` | `historyfile` | `example.com/im/historytool/historyfile` | JSON 文件读取、写入与格式适配 |
| `internal/testdata/` | 通常不编译为业务包 | 受 `internal` 规则限制 | 测试样本，不是公开 API |

根目录名不必等于模块路径最后一段，目录名也不必等于包名；但刻意保持一致能降低认知成本。导入时使用的是**路径**，代码引用时使用的是**包名**：

`import "example.com/im/historytool/historyfile"` 后，调用写作 `historyfile.Load(...)`。

依赖方向应保持单向：

`main → historyfile → history`

其中 `history` 不知道 JSON、文件名或命令行参数；`historyfile` 依赖 `history` 的消息类型和规则；`main` 负责选择文件适配器并把结果交给用户。若 `history` 反向导入 `historyfile`，领域规则就被文件细节污染，也更容易形成循环导入。

`internal/` 下的包只能被其父目录树内的代码导入。例如本项目内可使用 `example.com/im/historytool/internal/testdata`，外部模块即使知道路径也不能导入。它适合放实现细节，不适合承诺给调用方的稳定能力。

可进一步参阅：[Go 规范的包与导入规则](https://go.dev/ref/spec#Packages)、[模块参考文档](https://go.dev/ref/mod)、[包名设计建议](https://go.dev/blog/package-names)。

### 用 history 固化领域 API

### 用 `history` 固化领域 API

`history` 只表达“消息历史是什么、哪些消息可被接受”，不认识 JSON、文件路径或命令行参数。核心代码可收敛为一个文件：

- `package history`
- `import ("errors"; "strings"; "time")`
- `var ErrEmptySender = errors.New("发送者不能为空")`
- `var ErrEmptyText = errors.New("消息内容不能为空")`
- `type Message struct { Sender string; Text string; SentAt time.Time }`
- `type History struct { messages []Message }`
- `func New() *History { return &History{} }`
- `func (h *History) Add(m Message) error {`
- `if strings.TrimSpace(m.Sender) == "" { return ErrEmptySender }`
- `if strings.TrimSpace(m.Text) == "" { return ErrEmptyText }`
- `if m.SentAt.IsZero() { m.SentAt = time.Now() }`
- `h.messages = append(h.messages, m)`
- `return nil`
- `}`
- `func (h *History) Messages() []Message {`
- `result := make([]Message, len(h.messages))`
- `copy(result, h.messages)`
- `return result`
- `}`

`Message`、`History`、`New`、`Add` 与 `Messages` 首字母大写，因此是包对外承诺的 API；`messages` 小写，外部无法绕过规则直接修改历史。`Add` 是唯一写入口：它校验发送者和内容，并补齐缺失时间。这样，无论消息来自文件、网络还是测试夹具，规则只维护一份。

两个哨兵错误同样是领域契约。调用方可用 `errors.Is(err, history.ErrEmptyText)` 判断失败原因，而不应匹配错误文本。若未来需要更多上下文，可在外层用 `%w` 包装原错误，仍保持兼容。

`Messages` 返回副本而非内部切片，避免调用方通过切片元素重排或覆盖领域状态。这里刻意不导出 `messages`，也不提供“随意替换全部历史”的方法：小 API 比预留接口更稳定。文件格式升级、模块版本变化时，只要这些导出符号和错误语义不变，`history` 的使用者通常无需修改。

### 让 historyfile 适配 JSON 文件

### 让 historyfile 适配 JSON 文件

`historyfile` 是基础设施适配器：它负责把 `history` 的值读写为 JSON 文件，但不决定“哪些消息有效”“如何排序”等领域规则。

```go
package historyfile

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"

	"example.com/im/history"
)

type Store struct{ Path string }

func (s Store) Load() (history.History, error) {
	b, err := os.ReadFile(s.Path)
	if errors.Is(err, os.ErrNotExist) {
		return history.New(), nil // 首次运行：空历史不是领域失败
	}
	if err != nil {
		return history.History{}, fmt.Errorf("读取历史文件 %q: %w", s.Path, err)
	}

	var h history.History
	if err := json.Unmarshal(b, &h); err != nil {
		return history.History{}, fmt.Errorf("解析历史文件 %q: %w", s.Path, err)
	}
	if err := h.Validate(); err != nil {
		return history.History{}, fmt.Errorf("历史文件包含非法记录: %w", err)
	}
	return h, nil
}

func (s Store) Save(h history.History) error {
	if err := h.Validate(); err != nil {
		return fmt.Errorf("拒绝保存非法历史: %w", err)
	}
	b, err := json.MarshalIndent(h, "", "  ")
	if err != nil {
		return fmt.Errorf("编码历史 JSON: %w", err)
	}
	if err := os.WriteFile(s.Path, b, 0o600); err != nil {
		return fmt.Errorf("写入历史文件 %q: %w", s.Path, err)
	}
	return nil
}
```

命令入口只组装依赖，导入方向为 `main → historyfile → history`；`history` 不得反向导入文件包，否则会形成循环并污染领域层。

```go
store := historyfile.Store{Path: config.HistoryFile}
h, err := store.Load()
if err != nil { return err }

h, err = h.Append(msg)
if err != nil { return err }

return store.Save(h)
```

注意三类错误：`os.ErrNotExist` 被适配为初始空状态；权限、磁盘等文件错误保留并用 `%w` 包装；`Validate` 或 `Append` 返回的错误属于领域错误。JSON 文件只是本地持久化副本，不等于服务端历史的权威状态。

### 拆开循环并守住 internal 边界

### 拆开循环并守住 `internal` 边界

错误结构常让领域包与文件包互相认识：

```text
history ──导入──> historyfile
historyfile ──导入──> history
```

例如 `history` 调用 `historyfile.Load`，而 `historyfile` 又返回 `history.Message`、调用 `history.Validate`。这会触发 Go 的“导入循环不允许”错误；更深层的问题是：消息规则被 JSON 文件格式反向绑架。

应将接口放在**使用能力的一侧**。`history` 只需要“读取和保存历史”的能力，就定义：

```go
type Store interface {
	Load() ([]Message, error)
	Save([]Message) error
}
```

随后由 `internal/historyfile` 实现该接口：

```text
cmd/imhistory ──> history ──> Store
       │                         ▲
       └────> internal/historyfile┘
```

这里 `history` 不导入文件适配器；`main` 负责组装 `history.New(store)`。命令包只解析参数、选择实现、打印错误和设置退出码，不能承载去重、排序、时间校验等领域规则，否则同一规则会随命令入口复制。

`internal/historyfile` 仅可被其父目录及子目录导入。若模块根目录为 `example.com/imhistory`，则 `example.com/imhistory/cmd/imhistory` 可以导入它，外部模块不可以。这不是保密机制，而是防止文件格式成为被外部代码依赖的公共承诺。

- `history`：稳定的消息模型、规则与接口。
- `internal/historyfile`：JSON、路径、权限和编码细节。
- `cmd/imhistory`：依赖装配，不定义领域语义。

因此，替换 JSON 为 SQLite 时主要新增适配器；本地文件只是一个 `Store` 实现，并不等同于服务端历史的权威副本。

### 演进 API、模块版本与历史兼容

### 演进 API、模块版本与历史兼容

演进时先区分三类兼容：**源码兼容**（调用方能编译）、**数据兼容**（旧 JSON 能读取）、**语义兼容**（读取后仍表示同一业务事实）。后两者常比前者更危险。

| 变更 | 旧调用方影响 | 旧 JSON 影响 | 建议 |
|---|---|---|---|
| 新增结构体字段 | 通常无 | 可兼容，缺失值为零值 | 用 `omitempty`，明确零值语义 |
| 删除或改名导出字段 | 不兼容 | 可能丢数据 | 保留旧字段，或写迁移器 |
| 修改字段类型 | 不兼容 | 常解码失败 | 新增字段并兼容读取旧字段 |
| 新增函数 | 兼容 | 无影响 | 保持窄小 API |
| 修改函数参数/返回值 | 不兼容 | 无影响 | 新增函数，旧函数标记废弃 |
| 改变排序、去重规则 | 可编译但语义变 | 无影响 | 记录行为契约并写回归测试 |

`go.mod` 中声明的是模块路径与依赖最低版本：

```go
module example.com/imhistory

go 1.22

require example.com/history v1.4.0
```

Go 使用**最小版本选择**：构建列表中同一模块取所需版本的最高者，而非自动追逐最新版本。因此升级依赖应先阅读发行说明、运行测试，再执行 `go get example.com/history@v1.5.0`；不要把“能编译”当作兼容证明。若导入路径出现 `/v2`，它是新的主版本模块，意味着可能存在不兼容 API。

本地 `history.json` 只是某次导出、缓存或客户端视图，不等于服务端权威历史。它可能缺少已撤回消息、跨设备消息、分页窗口外记录，或保留服务端已删除的数据。故 `historyfile` 应报告“文件读取结果”，业务层再决定是否与服务端同步、合并或覆盖；不能把“文件为空”解释为“会话从未发生”。

**反馈练习（先作答，再核对）：**

1. 包声明为 `package historyfile`，目录应是什么？→ 通常为 `historyfile`，导入路径由模块路径加目录决定。  
2. `History` 首字母大写意味着什么？→ 可被其他包导出使用。  
3. 两包互相导入能否通过拆文件解决？→ 不能；循环发生在包级依赖。  
4. 应把共享接口放在哪个包？→ 放在消费者或更高层抽象包，避免基础设施反向依赖业务。  
5. `internal/historyfile` 能被模块外项目导入吗？→ 不能。  
6. `v1.9.0` 到 `v1.10.0` 可删除导出函数吗？→ 不应删除，这是不兼容变更。  
7. 何时需要 `/v2`？→ 发布不兼容的主版本时。  
8. 给结构体新增 `Pinned bool`，旧 JSON 能解码吗？→ 能，字段得到零值 `false`。  
9. `ID string` 改为 `ID int64` 的风险？→ 调用方和旧 JSON 都可能失败。  
10. 如何平滑改名 `Text` 为 `Body`？→ 保留旧字段或自定义解码并迁移。  
11. `omitempty` 是否适合所有字段？→ 否；零值与“未设置”不同就需指针或显式状态。  
12. `go get` 升级后为什么检查 `go.mod`？→ 确认实际选中的版本及间接依赖变化。  
13. 最小版本选择会自动降级到最新稳定版吗？→ 不会；它选择依赖图要求的最低充分版本。  
14. 本地文件缺少消息，能断言服务端没有吗？→ 不能，可能只是未同步或未导出。  
15. 文件存在已撤回消息，服务端查询应直接复用吗？→ 不应，须遵守服务端当前规则。  
16. 读取 JSON 失败应由适配器返回什么？→ 带上下文包装的错误，例如“读取历史文件：…”。  
17. 业务层应知道 `json.SyntaxError` 吗？→ 通常不应；适配器可转换为稳定的领域错误。  
18. 修改排序规则为何属于兼容问题？→ 调用方可能依赖顺序，即使类型签名未变。  

参考：[Go 规范](https://go.dev/ref/spec)、[模块参考](https://go.dev/ref/mod)、[模块版本编号](https://go.dev/doc/modules/version-numbers)、[包名建议](https://go.dev/blog/package-names)。

> **要点** — 稳定领域 API 向内隔离文件细节，命令入口只负责装配；依赖方向与兼容边界决定后续演进成本。
