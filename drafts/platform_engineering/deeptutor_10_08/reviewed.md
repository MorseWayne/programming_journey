# 10.08 依赖与质量工具：版本固定之后还要查什么

> DeepTutor 八节初稿经技术与教学审阅后的静态课程。`example.org/im/...` 模块与 `MessageEvent` 字段是**虚构教学例子**；没有在本仓库运行 Go、protoc、govulncheck、测试、IM 或站点。当前 S2 的正文非空且最多 **6 UTF-8 字节**、总请求最多 **4096 B**、同消息 ID 即使同正文重复 **409**、非成员目标隐藏 **404**、成功 `200 accepted_in_memory` 仍成立；未来 S3 `stored_in_teaching_db` 和 R9 6→9 字节均未部署。[09.02 当前合同](../../../src/docs/platform_engineering/curriculum/09_backend_security/02_http_api_contract.md)

## 一、一次 IM 字段变更会经过哪些来源和工具

假设教学 `MessageEvent` 要加 `message_version` 和 `visible`，以便旧 `m-9:v1` 重放时不覆盖 v2、不让无权内容进搜索。这个需求不是“改一行 Go 结构体”就结束：`.proto` 字段号定义二进制格式，`protoc` 与 Go 插件产生 `.pb.go`，Go 模块图选择运行时/协议库版本，生产者和消费者各有旧新实例，HTTP 入口仍要守 09.02 的身份/错误合同。每个工具只对其中一段给证据。[09.10 版本轴与 RPC](../../../src/docs/platform_engineering/curriculum/09_backend_security/10_protocol_compatibility_rpc.md)

| 问题 | 应先看什么 | 工具可提供的有限证据 |
|---|---|---|
| 代码格式一致吗 | Go 源文件 | `gofmt` 产出统一排版差异 |
| 有常见可疑 Go 构造吗 | 具体包源码 | `go vet` 的启发式诊断 |
| 构建选了哪个协议模块版本 | `go.mod` 图、工作区与 Go 版本 | MVS 的 build list，`go list -m all` 等解释路径 |
| 下载到的是预期模块内容吗 | 模块 cache、`go.sum`/校验来源 | 哈希校验与 `go mod verify` 的各自范围 |
| 已知漏洞怎样触达代码 | 选中依赖与调用路径 | `govulncheck` 所用数据库中的已知报告及调用分析 |
| 新旧事件语义安全吗 | `.proto`、生成代码、生产/消费流程 | 混部、权限、版本与重放的合同/实践证据，不能由格式工具代替 |

第一遍先会读这些输入/输出，不要求初学者记命令参数；第二遍才用固定版本、生成记录、漏洞处置和兼容矩阵解释一次真正可审的变更。当前这是一份**课程设计**，不是实际工具检查通过报告。

## 二、`go.mod` 选版本：require 是最低要求，不是所有包的锁

Go 的一个 module 可含多个 package，`go.mod` 声明模块路径和所需依赖版本。用**玩具图**手算：主模块 `example.org/im/app` 直接要求 `example.org/im/protocol v1.4.0` 与 `example.org/im/transport v1.2.0`；后者自己的 `go.mod` 又要求 `example.org/im/protocol v1.6.0`。Go 的最小版本选择（MVS）对同一模块路径取满足整张图要求的选中版本，故本题 **protocol 选 v1.6.0**，并非主模块那行 v1.4.0。该版本只是练习数字，不是 OpenIM 的依赖版本。[Go Modules Reference：MVS](https://go.dev/ref/mod)

```text
example.org/im/app
  ├─ require protocol v1.4.0
  └─ require transport v1.2.0 ── require protocol v1.6.0
构建列表中 protocol → v1.6.0
```

审阅真实 IM 依赖变更，要同时核对主模块 `go.mod`、被选择的 build list、`replace/exclude`、Go 工具链和可能存在的 `go.work`：工作区可改变哪些模块被当作主模块，也会影响选中列表。`go list -m all` 问“选中了什么”，`go mod graph/why` 问“要求或导入路径从哪里来”；只看 `require` 一行，不能说“部署时固定用它”。版本固定还要和构建提交、工具链、生成器版本一起记录。[Go Modules Reference：build list 与工作区](https://go.dev/ref/mod)

## 三、`go.sum`、`tidy` 与 `verify` 各检查一件事

`go.sum` 存模块 `.mod`/`.zip` 内容的校验哈希，Go 下载时可按本地哈希及公共 checksum database 机制验证；它可能同时有**同一模块多个版本**或历史所需条目，**不是最终选中版本清单**。MVS 的 build list 才回答“本次构建选了哪个版本”。也不能因为某版本哈希匹配就推断没有恶意逻辑、没有已知漏洞、对 IM 协议兼容。[Go Modules Reference：go.sum 与认证](https://go.dev/ref/mod)

`go mod tidy` 会补齐/移除模块要求与不再需要的哈希，运行后应审 `go.mod/go.sum` 的**实际差异**，不能把“格式整理”理解为无行为影响。`go mod verify` 则对**模块缓存中已下载**的依赖 `.zip` 和展开目录比对其下载时记录的哈希，帮助发现缓存被改；官方明确它不是重新使用 `go.sum` 逐项验证内容，更不是漏洞扫描或业务测试。缓存里没有的模块也不是被它“全部验证通过”了。[Go Modules Reference：tidy/verify](https://go.dev/ref/mod)

| 看到的输出 | 可以说什么 | 不能说什么 |
|---|---|---|
| `go list -m all` 有 protocol v1.6.0 | 此命令环境下 build list 选中 v1.6.0 | 所有部署环境一定相同，或字段升级安全 |
| `go.sum` 有 v1.4.0、v1.6.0 哈希 | 这些内容校验记录存在 | 构建会同时链接两个版本，或已通过安全审计 |
| `go mod verify` 报 cache 未改 | 其检查范围内缓存内容未被后改 | 应用无缺陷、无漏洞、生成代码与 `.proto` 一致 |

任何实际结论都要带命令、工作区、工具链、提交与输出；本项目的课程作者这次**没有**对真实 Go 工程执行这些命令。

## 四、`gofmt` 与 `go vet`：排版/可疑构造不是 IM 业务验收

`gofmt` 标准化 Go 源格式，可用差异或文件列表使评审不被排版噪声遮住；它不推导 `m-9` 去重、`u-c` 权限或 B 的设备状态。`go vet` 会报告常见**可疑构造**，例如 `Printf` 参数不匹配、把锁按值复制、遗失 `context` 取消函数等；官方说明它依启发式，可能有误报/漏报，不是程序正确性的严格判定器。[gofmt 文档](https://pkg.go.dev/cmd/gofmt) · [go vet 文档](https://pkg.go.dev/cmd/vet)

编译通过说明类型/构建条件足以生成目标；表驱动测试检查列出的输入；[10.07 的 fuzz 和 `-race`](../../../src/docs/platform_engineering/curriculum/10_engineering/07_concurrency_property_validation.md)分别探索输入边界与**已执行路径**的内存竞争；[08.11 的有界历史](../../../src/docs/platform_engineering/curriculum/08_distributed/11_distributed_validation.md)才用于指定分布式读写合同。一个 “`gofmt` clean + vet clean” 的 CI 结果不会自动检查当前 S2 同 ID 409、非成员 404、正文 6 B，更不会证明 OpenIM 真实链路的设备送达。

| 工具 | 合适的纸上检查对象 | 一项绿色仍未覆盖 |
|---|---|---|
| `gofmt` | Go 排版差异 | 分支逻辑、协议版本、授权 |
| `go vet` | 工具支持的可疑语句与 API 误用 | 运行时数据竞争、业务规则、所有未知错误 |
| `go test`/`-race` | 实际执行到的测试/内存路径 | 未覆盖输入、跨节点协议、设备收读 |
| fuzz | 种子邻域与性质反例 | 所有无限输入、不同环境中的外部副作用 |

## 五、`.proto` 与生成 `.pb.go`：源、工具和产物要配套

Protobuf Go 代码由 `.proto` 经 `protoc` 和 `protoc-gen-go` 等插件生成；生成物对 Go 编译有用，但**手改 `.pb.go` 不等于改变 schema 源事实**。评审要保存/核对 `.proto` 变更、字段号/`optional` 存在性、`go_package`/导入路径、`protoc` 与插件版本、生成命令、产物差异和新旧二进制用例。固定生成链有助另一个人复现“为何同一字段在两端被解释不同”，不使 Protobuf 自动懂业务权限。[Protobuf Go Generated Code Guide](https://protobuf.dev/reference/go/go-generated/) · [proto3 字段规则](https://protobuf.dev/programming-guides/proto3/)

教学 `MessageEvent` 从字段 1–3 加 `optional message_version=4` 与 `optional visible=5`：已用字段号不重用，删除后按官方规则 `reserved`。旧二进制消费者可跳过新增字段，但它若不理解 `visible`，就不能对敏感内容沿旧逻辑照常索引；若不比较 `message_version`，迟到 `m-9:v1` 可能覆盖 v2。即使 `.pb.go` 能编译，仍需[09.10 的六格混部矩阵](../../../src/docs/platform_engineering/curriculum/09_backend_security/10_protocol_compatibility_rpc.md)检查旧新生产/消费、存量事件、JSON 中间层、权限和回退。[Protobuf 二进制与未知字段](https://protobuf.dev/programming-guides/proto3/)

对于 OpenIM，固定 `send.go` 中可见 `pbmsg`/`sdkws` 相关类型传递和 `MsgToMQ` 调用；这**没有**给出其所有 `.proto` 源、生成器版本或本次构建所选 `github.com/openimsdk/protocol` 模块版本。本章不填写未经核对的真实版本号，留给学习者在固定提交的 `go.mod/go.sum`、外部 protocol 仓库与构建记录中逐项追踪。[固定 `send.go` 源码](https://github.com/openimsdk/open-im-server/blob/f6411a8a1a31d3df36f4c2b3ad28481a94141e1f/internal/rpc/msg/send.go)

## 六、漏洞扫描：已知报告与调用路径，不能变成“零风险”

Go 的漏洞数据库汇集已知报告，`govulncheck` 结合项目依赖和可到达的受影响函数，帮助区分“仅依赖了某模块”与“代码调用了报告所涉及的路径”。这有助决定要升哪个版本、是否有实际使用路径；报告结论依赖**当时数据库、构建选择、分析模型与代码**。新漏洞、未建模的反射/插件/外部服务风险或业务授权缺陷不会因 “no findings” 自动消失。[Go Vulnerability Management](https://go.dev/doc/security/vuln/) · [govulncheck 教程](https://go.dev/doc/tutorial/govulncheck)

若需升级教学 `protocol v1.6.0→v1.7.0` 修某条已知问题，评审不只看扫描变绿：新生成代码是否改变字段存在性？旧消息 E9 是否仍可解码？`u-c` 的可见性负例是否保持 404？S2 的 6 B/409 是否被无意改写？新二进制发布后如何回退旧消费者？漏洞处置与兼容矩阵、测试数据和发布门要一起设计，但**不能因为某修复版本更高就假设所有行为向后兼容**。[09.10 扩展迁移收缩](../../../src/docs/platform_engineering/curriculum/09_backend_security/10_protocol_compatibility_rpc.md)

实际扫描若发现问题，要保留 advisory ID、受影响/修复版本、可达路径、暴露条件、临时缓解、升级/回退证据与复核日期；若没发现，也只报告扫描时的范围和数据库时点，不用“安全通过”替代权限/输入/输出防护。[09.08 输入输出防护](../../../src/docs/platform_engineering/curriculum/09_backend_security/08_input_output_defense.md)

## 七、固定 OpenIM 与本仓库静态课程：证据各放原位

固定 `openimsdk/open-im-server` 提交 `f6411a8a1a31d3df36f4c2b3ad28481a94141e1f` 的 [`send.go` 所述分支](https://github.com/openimsdk/open-im-server/blob/f6411a8a1a31d3df36f4c2b3ad28481a94141e1f/internal/rpc/msg/send.go#L46-L70)调用 `MsgToMQ` 后返回；[另一路 MongoDB 消费处理](https://github.com/openimsdk/open-im-server/blob/f6411a8a1a31d3df36f4c2b3ad28481a94141e1f/internal/msgtransfer/online_msg_to_mongo_handler.go#L43-L69)调用 `BatchInsertChat2DB`。两段只证明所述调用/返回位置，不能由此推出固定提交的 MVS build list、实际 `.proto` 字段号、生成器版本、`go vet` 或 govulncheck 的通过结果，更不能推出 B 的设备已收。要做真实项目依赖审计，须在固定检出里另读 `go.mod/go.sum`、生成指令/CI、protocol 依赖提交并保存原始输出。[OpenIM 阅读地图](../../../src/docs/platform_engineering/curriculum/im_reference.md)

给学习者的最小记录模板是：**问题与业务合同 → 固定源码/工具链版本 → 具体命令/环境 → 原始诊断或差异 → 修复与兼容验证 → 剩余未知**。本仓库新增的是教学正文和 DeepTutor 来源归档，没有运行 Go 命令、生成代码、漏洞扫描或上游 IM；页面中的命令名是未来实践入口，不是本次已通过的门。[10.09 CI 证据分层](../../../src/docs/platform_engineering/curriculum/10_engineering/09_ci_artifacts.md)

## 八、交付一次依赖变更评审与 22 道分层练习

第一遍手算 MVS 与 `go.sum` 角色；第二遍给 `MessageEvent` 加版本/可见性字段时，交 `.proto→插件→.pb.go→Go build list→消费者/回放→CI` 的证据矩阵，说明每项工具“能证/未证”。以下问题先预测，再展开答案。

### 基础 1–8：版本与校验

<details><summary>1. 玩具主模块要求 protocol v1.4.0，transport 又要求 v1.6.0，MVS 选谁？</summary>

同一模块路径选 v1.6.0，满足整张要求图。</details>

<details><summary>2. `go.mod` 的 v1.4.0 是最终锁死的构建版本吗？</summary>

不是。它是最低要求之一，要看 MVS build list 与工作区。</details>

<details><summary>3. `go.sum` 有两个 protocol 版本哈希，就表示二者都被链接进同一构建？</summary>

不表示。它保存内容校验记录，可含多版本；build list 回答选中版本。</details>

<details><summary>4. `go mod tidy` 可以不看差异就当纯排版操作吗？</summary>

不能。它可能增删 `go.mod/go.sum` 条目，要审实际变更与选中版本。</details>

<details><summary>5. `go mod verify` 检查的主要对象是什么？</summary>

模块缓存中已下载的依赖是否自下载后被改，非漏洞/业务正确性。</details>

<details><summary>6. `gofmt` clean 能证明同 ID 第二次提交返回 409 吗？</summary>

不能。它只管 Go 格式，不执行 IM 合同。</details>

<details><summary>7. `go vet` 会证明所有 Go bug 都不存在吗？</summary>

不会。它启发式报告支持的可疑构造，可能误报/漏报。</details>

<details><summary>8. 当前 S2 正文上限是几个 UTF-8 字节？</summary>

非空且最多 6 B；总请求正文另有 4096 B 上限。</details>

### 生成代码与工具 9–16：别把一个绿勾当全部

<details><summary>9. 只手改 `.pb.go` 而不改 `.proto`，能构成可复现协议升级吗？</summary>

不能。生成源、插件版本、命令和产物要配套，生成代码不应手改冒充 schema。</details>

<details><summary>10. 新增 `optional visible=5` 后旧二进制可解析，旧索引就一定不会泄露吗？</summary>

不一定。旧业务逻辑可能忽略可见性，需混部/权限负例验证。</details>

<details><summary>11. 已发布字段号删除后可用新含义重用吗？</summary>

不可随意重用，应按 Protobuf 规则保留旧编号防历史字节误解。</details>

<details><summary>12. proto3 `optional` 对“缺字段”有什么帮助？</summary>

可区分未提供与明确设置默认值，供旧事件安全分支使用。</details>

<details><summary>13. `govulncheck` 没报告，就能宣布所有依赖永远安全？</summary>

不能。它限于当时已知报告、所选构建/调用分析范围。</details>

<details><summary>14. `go mod verify` 与 govulncheck 可互相替代吗？</summary>

不能。前者看缓存内容未改，后者分析已知漏洞与调用路径。</details>

<details><summary>15. 只要新 protocol 模块版本更高，S2 6 B/409/404 会自动保持吗？</summary>

不会。要按接口/授权负例和新旧协议矩阵验证。</details>

<details><summary>16. ProtoJSON/逐字段复制会无条件保留未知字段吗？</summary>

不会，可能有损；要核对真实中间层。</details>

### 评审 17–22：把来源与实际结果分开

<details><summary>17. `go list -m all` 能直接证明 B 设备收到了 m-9 吗？</summary>

不能。它只列当前命令环境的模块选择。</details>

<details><summary>18. `go vet` 报 `copylocks`，下一步是什么？</summary>

核对诊断与代码语义，修复后按并发性质/回归验证，不只压掉告警。</details>

<details><summary>19. govulncheck 有可达已知漏洞，升级后还需什么？</summary>

复扫并核对接口、协议混部、权限/重放与回退证据。</details>

<details><summary>20. 固定 OpenIM 的两处源码能给出其 protocol 模块确切选中版本吗？</summary>

不能。需在固定检出审 `go.mod`、build list/工作区与依赖仓库。</details>

<details><summary>21. 没运行 Go 命令时，课程可写“govulncheck 已通过”吗？</summary>

不能。这里只提供未来实践的检查矩阵，没有实际扫描结果。</details>

<details><summary>22. 一份可复核的依赖升级记录至少有什么？</summary>

业务需求/合同、源码与工具链版本、选中 build list、原始命令/差异/诊断、生成链、兼容与回退证据、剩余未知。</details>

## 本章完成标准与下一步

能不看答案手算 protocol v1.6.0 的 MVS 选择，分开 `go.mod`、`go.sum`、`go mod verify`、`govulncheck`、`gofmt/go vet` 和 `.proto/.pb.go` 的责任，并为 `visible/message_version` 变更写出旧新消费者的权限/版本负例，才算完成第一轮。真实 Go 命令、生成器和漏洞报告须在学习者隔离环境另行执行保存。下一章 10.10 将把依赖与协议变化放进持续交付、迁移和回滚的发布窗口。
