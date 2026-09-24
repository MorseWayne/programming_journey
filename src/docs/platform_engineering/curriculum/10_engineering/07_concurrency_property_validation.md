---
title: 10.07 并发与属性验证：没有 data race 为何还重复发送
icon: /assets/icons/article.svg
order: 8
date: 2026-09-24
---

[返回第十卷](./README.md) · [测试基础：10.02](./02_testing_basics.md) · [可控替身：10.04](./04_test_doubles_design.md) · [并发验证前置：05.09](../05_runtime/09_concurrency_verification.md) · [分布式验证区别：08.11](../08_distributed/11_distributed_validation.md)

# 10.07 并发与属性验证：没有 data race 为何还重复发送

> DeepTutor 八节初稿经技术与教学审阅后的静态课程。`m-9/c-a`、纸上 `DecodeMessage`、W1/W2 与连接代次均为**脱敏教学例子**；没有新增可运行 Go 程序，也没有执行 `go test`、`-race`、fuzz、IM、数据库或站点。当前 S2 消息 POST 仍是正文非空且最多 **6 UTF-8 字节**、总请求最多 **4096 B**、同 ID 即使同正文也 **409**、非成员隐藏 **404**、成功 `200 accepted_in_memory`；未来 S3 `stored_in_teaching_db` 仍是[教学提议](../09_backend_security/12_im_service_capstone.md)。

## 一、先把三条 IM 规则写成可反驳的性质

本章选三个局部问题：**解码**会不会接受超限正文或被坏输入弄崩；**去重**在两个 Go goroutine 同时送 `m-9` 时是否只受理一次；**连接生命周期**在 B 的设备从 G1 重连 G2 后，旧回调是否会把 owner 状态倒退。先写“什么结果算错”，再选工具；看到工具全绿后再倒推业务性质，会把没有测到的行为也算作通过。[10.01 可验证需求](./01_verifiable_requirements.md)

| 被检对象 | 本章纸上不变量 | 不能由它推断 |
|---|---|---|
| 消息解析/校验 | 若接受，正文非空且 `len([]byte(body))≤6`、请求总大小有界、字段/可信发送者按合同检查；若拒绝，不新增消息 | 数据库持久、设备已收 |
| 同会话同 ID 创建 | 两个并发相同 `m-9` 创建最多一条，当前合同中一项可受理，另一项为 409，旧正文不被覆盖 | 网络恰好只发一次 E9/提示 |
| 设备连接状态 | 新有效代次 42 已生效后，旧 G1/gen41 的迟到状态写不能把 owner 改回 41 | 旧 TCP 字节从未发出、B 已读 |

第一遍用少量手写正反例理解规则；第二遍才用随机输入、门闩交错和状态模型扩大探索范围。`-race`、fuzz、业务断言和[08.11 的跨节点有界历史](../08_distributed/11_distributed_validation.md)验证的是不同层，不能互相代替。

## 二、模糊测试找输入边界：性质先于随机字节

Go 的模糊测试用 `FuzzXxx(*testing.F)`、`f.Add` 种子语料与 `f.Fuzz` 目标函数，把新输入反复送进解析/校验逻辑；官方教程强调用**性质**而非事先为每个随机输入写死预期输出。给纸上 `DecodeMessage(raw []byte)` 一组脱敏种子：空体、`"你好"`（UTF-8 **6 B**）、`"你好呀"`（**9 B**）、截断 JSON、未知字段、边界附近大小和非 UTF-8 原始字节。[Go Fuzzing 教程](https://go.dev/doc/tutorial/fuzz) · [testing.F 文档](https://pkg.go.dev/testing)

```go
// 纸上片段：DecodeMessage 与 ValidateMessage 均需由学习者实现，本文未执行。
func FuzzDecodeMessage(f *testing.F) {
    for _, seed := range [][]byte{
        []byte(`{"message_id":"m-9","body":"你好"}`),
        []byte(`{"message_id":"m-9","body":"你好呀"}`),
        []byte(`{"message_id":`),
    } {
        f.Add(seed)
    }
    f.Fuzz(func(t *testing.T, raw []byte) {
        if len(raw) > 4096 { return } // 本题有界输入；HTTP 层仍须先拒绝超限
        msg, err := DecodeMessage(raw)
        if err != nil { return }      // 错误类别/状态未变由另一个边界测试核对
        if err := ValidateMessage(msg); err == nil {
            if n := len([]byte(msg.Body)); n == 0 || n > 6 { t.Fatalf("bad body bytes: %d", n) }
        }
    })
}
```

这段只展示**性质形状**，不应照抄为已通过测试：`DecodeMessage` 是否接受非法 UTF-8、未知 JSON 字段、默认值，以及 `ValidateMessage` 是否读取可信发送者，都要按当前合同/具体解码器定义。对 HTTP handler 的“拒绝时状态不变、稳定错误体不泄密”，要用可控存储和请求级验证，不能只调用一个纯解码函数便宣称所有副作用未发生。错误输入也要有长度/时间资源预算，避免 fuzz 目标自己无界分配。[09.02 HTTP 输入表](../09_backend_security/02_http_api_contract.md) · [09.08 输入输出防护](../09_backend_security/08_input_output_defense.md)

Go 会把导致 fuzz 失败的输入留入 `testdata/fuzz/<FuzzName>` 等种子语料；将**最小且脱敏**的失败样本保留为回归入口，修复后既检查该样本，也检查相邻合法/非法边界。随机跑了多少秒只描述搜索范围，不能证明任意字节都安全。[testing.F 语料与失败输入](https://pkg.go.dev/testing)

## 三、`-race` 找内存冲突，锁分两段仍会错

data race 是两个并发执行者无适当同步地访问同一内存位置，且至少一个写入。`go test -race` 能在**实际运行到冲突路径**时报告 Go 内存数据竞争；官方明确指出没执行到的路径不会被发现。它不能证明业务操作按正确顺序，也不能证明跨 SQL/broker/设备的外部效果。[Go Race Detector](https://go.dev/doc/articles/race_detector) · [Go 内存模型](https://go.dev/ref/mem)

设 `seen["m-9"]` 由 `sync.Mutex` 保护，但程序把“检查不存在”和“插入”放在**两个分别上锁的临界区**。纸上交错如下：

| 顺序 | T1 | T2 | 共同结果 |
|---|---|---|---|
| 1 | 加锁查 `m-9` 不存在，解锁 | — | `seen` 仍空 |
| 2 | — | 加锁查 `m-9` 不存在，解锁 | 两人都相信可创建 |
| 3 | 加锁插入，解锁，尝试派生 E9 | — | `seen` 有一条 |
| 4 | — | 加锁覆盖/再插，解锁，也尝试派生 E9 | 可能两次业务效果，尽管每次 map 访问有锁 |

这里可以**完全没有 Go data race**，但仍违反“一项受理、另一项 409、旧正文不变”。修复需把**检查→占用 ID/插入**放进同一个原子裁决，或在未来 SQL 方案用唯一约束/事务作最终裁决，并让事件发布/响应按该结果走。即使最终 map 只有一键，若两个 goroutine 都已对外尝试 E9，计数正确也不代表业务正确。[05.09 data race 与逻辑竞态](../05_runtime/09_concurrency_verification.md)

因此两项证据都要有：`-race` 检查实际内存竞争，**受控交错下的业务断言**检查返回码、消息内容/数量、事件意图与外部尝试。只跑一种都覆盖不了另一类失败。

## 四、连接生命周期用状态机，不用一句 `connected=true`

虚构 B 的设备 `d-b1` 原连接在 G1，代次 **41**；重连后新 owner 在 G2，代次 **42**。本地连接状态可画成 `DISCONNECTED→CONNECTING→ACTIVE(gen41)→DRAINING→CLOSED`；新连接是另一实例的 `ACTIVE(gen42)`。定义操作 `Connect(generation)`、`Disconnect`、`Deliver(E9)`、`Timeout` 和旧回调 `OnClose(gen41)`，再写“从某状态接受什么、拒绝什么”。[08.07 协调与对象归属](../08_distributed/07_coordination_ownership.md)

| 当前状态 | 事件 | 合法转移/效果 |
|---|---|---|
| `DISCONNECTED` | 新的有效 Connect(gen41) | `CONNECTING→ACTIVE(gen41)`，记录受信设备身份 |
| `ACTIVE(gen41)` | 新 Connect(gen42) | 注册/目标规则决定新 owner，旧 41 进入排空/关闭 |
| 当前 owner 已是 gen42 | 旧 `OnClose(gen41)` 晚到 | 只能清理旧连接，**不能**把 owner 改回 41 或删除 gen42 |
| 当前 owner 已是 gen42 | 旧 `Deliver(E9,gen41)` 晚到 | 目标端代次条件拒绝旧状态写；已出网字节与设备去重另证 |

状态模型能让学习者枚举合法/非法转移，配合门闩安排“新连接先注册、旧关闭回调后到”的顺序。但本地模型不证明复制协调服务的租约已过期，也不能撤回旧 G1 可能已经发到 B 的字节。稳定 `message_id/version` 的设备去重与有权历史补拉仍是另一层。[08.07 旧 socket 与围栏](../08_distributed/07_coordination_ownership.md)

## 五、用门闩与假时钟指定故障交错

并发测试若只 `time.Sleep(10*time.Millisecond)` 后希望 T1 一定先于 T2，调度器、CI 负载或 `-race` 插桩一变，就可能走另一条路径。纸上可用 channel/barrier 明确阶段：让 T1、T2 **都到达“查缺完成”**，再同时释放“尝试插入”，记录最终结果；用可控时钟驱动租约/TTL，而不是等待真实 5 秒碰运气；用 fake 外部依赖安排“已受理但回应丢”和“取消先到”。[10.04 可控替身](./04_test_doubles_design.md) · [05.09 受控交错](../05_runtime/09_concurrency_verification.md)

| 故障/交错 | 应控制的点 | 应断言的业务不变量 |
|---|---|---|
| T1/T2 同 ID 同时创建 | 两者查缺后、插入前的门闩 | 仅一条消息/一次必要意图，另一项 409 |
| W1 租约过期 W2 接管 | 假时钟与 owner token 41→42 | W1 迟到状态写拒绝；外部可能已发生另记 |
| G2 注册后 G1 回调 | 连接状态事件顺序 | gen42 不被 gen41 关闭/投递回调倒退 |
| Decode 遇截断/大输入 | fuzz 种子和资源上限 | 无 panic；错误类别/状态按合同，不泄露正文 |

每个受控测试仍需**有限超时**以发现死锁，并记录种子、参与者、初态和最后到达哪个门闩；超时是本次测试失败证据，不要无限加 Sleep 使其偶然变绿。Go `context` 取消可帮助本进程任务退出，不等于外部推送/SQL 已回滚。[05.08 取消与有界任务](../05_runtime/08_concurrency_composition.md)

## 六、性质、失败语料和回归：别把实现当自己的答案

一个好的性质应从**独立业务规则**来：例如“接受的 S2 正文长度在 1–6 UTF-8 B”“当前同 ID 第二次创建给 409 且旧消息不变”“较小连接代次不能覆盖更大代次”。若把实际 `DecodeMessage` 再调用一遍当 expected 值，测试只是镜像同一实现错误。对 `decode(encode(x))==x` 这类往返性质，也先定义**规范化字段**和允许的输入域；Protobuf→ProtoJSON 可能丢未知字段，不能在那条有损路径要求所有原字节逐位相等。[09.10 线格式与语义](../09_backend_security/10_protocol_compatibility_rpc.md)

模糊测试发现反例后，记录触发的最小脱敏输入、Go/依赖版本、种子或语料文件、触发的性质和最短路径；修复后用该样本作回归，再加紧邻边界（5/6/7 B、4096/4097 B、字段缺失/未知、合法/非法授权）的例子。Go fuzz 引擎会把失败输入保存为语料，普通 `go test` 也会运行种子；仍要检查失败是否由测试自己错误假设引起。[Go testing.F](https://pkg.go.dev/testing)

状态机反例也要缩到最短事件序列，例如“Connect41→Connect42→OnClose41”就足以暴露回退；再加入重复关闭、取消、断连重连等近邻。对真实网络和跨节点顺序，转到[08.11 的调用/返回历史与故障生效证据](../08_distributed/11_distributed_validation.md)，不把本机 fake 证明扩大为整个 IM 系统已线性化。

## 七、五类证据各有范围，固定源码只算阅读证据

| 证据层 | 能支持什么结论 | 仍不能支持什么 |
|---|---|---|
| 手写例子/表驱动测试 | 指定输入/状态结果符合独立预期 | 未列出的所有字节与交错 |
| Go fuzz | 已执行输入中的崩溃/性质反例与语料回归 | 所有无限输入、其他服务状态 |
| `-race` | 已运行路径上的内存数据竞争报告/未发现 | 无数据竞争的逻辑重复、跨节点一致性 |
| 门闩/假时钟模型 | 指定可控交错下的状态与错误传播 | 真实内核、网络、数据库崩溃语义 |
| 隔离集成/分布式实验 | 指定版本/环境/故障的端到端观察 | 未覆盖的全部环境与未来版本 |

报告至少写代码提交、Go/工具版本、输入/初态、受控顺序或 fuzz 种子、命令、实际结果、失败样本、修复前后差异与**尚未覆盖**的范围；日志保持脱敏。**本章没有执行这些命令**，所以没有可以填“已通过”的运行结果。若需要实际练习，学习者在自己的隔离实现/公开项目检出中操作，再把证据与静态教材分开保存。[10.09 CI 与制品证据](./09_ci_artifacts.md)

固定 `openimsdk/open-im-server` 提交 `f6411a8a1a31d3df36f4c2b3ad28481a94141e1f` 的 [`send.go` 所述路径](https://github.com/openimsdk/open-im-server/blob/f6411a8a1a31d3df36f4c2b3ad28481a94141e1f/internal/rpc/msg/send.go#L46-L70)调用 `MsgToMQ` 后返回；[另一路 MongoDB 消费处理](https://github.com/openimsdk/open-im-server/blob/f6411a8a1a31d3df36f4c2b3ad28481a94141e1f/internal/msgtransfer/online_msg_to_mongo_handler.go#L43-L69)调用 `BatchInsertChat2DB`。这两处只读源码**不等于**已对 OpenIM 跑过本章的 fuzz、`-race`、去重交错或连接状态机实验；实际项目测试须另追该版本的具体解析、去重和连接代码并记录运行证据。[OpenIM 阅读地图](../im_reference.md)

## 八、交付最小反例与 22 道分层练习

第一遍列 S2 的正反例与 fuzz 性质；第二遍交 T1/T2 两段锁的最短交错、gen41/42 状态机序列、故障注入门闩和五类证据的范围表。以下题目先预测，再展开反馈。

### 基础 1–8：性质来自合同

<details><summary>1. `"你好"` 与 `"你好呀"` 分别占多少 UTF-8 字节？</summary>

通常分别为 6 B 和 9 B；当前 S2 前者合法，后者超过 6 B 上限。</details>

<details><summary>2. 当前 S2 正文上限是 6 个汉字吗？</summary>

不是。按 UTF-8 字节计，非空且最多 6 B。</details>

<details><summary>3. 原始 HTTP 请求体 4097 B 与正文 7 B 应分别检查什么？</summary>

前者超过总请求 4096 B，后者超过解码后正文字节上限；两层限额和错误类别不同。</details>

<details><summary>4. 同一 `message_id=m-9`、相同正文再 POST，当前预期是什么？</summary>

409，旧消息与顺序不变；不是幂等 200。</details>

<details><summary>5. `u-c` 登录后知道 `c-a` ID，能绕过成员权限吗？</summary>

不能。当前隐藏目标合同为 404。</details>

<details><summary>6. Go fuzz 的 `f.Add` 用来做什么？</summary>

提供种子语料，既供普通回归执行，也帮助生成更多输入。</details>

<details><summary>7. fuzz 目标只需断言“没有 panic”就够吗？</summary>

不够。还要按独立合同检查接受值合法、拒绝时状态/错误边界和资源预算。</details>

<details><summary>8. `-race` 一次通过能证明所有业务交错都正确吗？</summary>

不能。它只检查实际运行路径里的内存数据竞争，不验证业务唯一性。</details>

### 并发与状态 9–16：没有 data race 仍会重

<details><summary>9. T1/T2 的每次 map 访问都加锁，为何仍可能双发 E9？</summary>

“查缺”和“插入”分两段，二者都可先看到不存在，再各自执行外部效果。</details>

<details><summary>10. 最小修复要把哪一步放进同一原子裁决？</summary>

同一业务 ID 的检查/占用/插入；未来数据库可用唯一约束/事务作最终裁决。</details>

<details><summary>11. 最终 map 只有一个 `m-9` 就证明只发过一次吗？</summary>

不能。两个 goroutine 可能各自已尝试派生或推送 E9。</details>

<details><summary>12. 用 `time.Sleep` 等 10ms 能稳定强制 T1 先查缺吗？</summary>

不能。用门闩/可控阶段明确交错，并给有限超时。</details>

<details><summary>13. gen42 已是 owner，迟到 `OnClose(gen41)` 能删除 gen42 吗？</summary>

不能。旧代次只能清理旧连接，不得回退当前归属。</details>

<details><summary>14. 拒绝 gen41 状态写能证明旧 G1 没发出 TCP 字节吗？</summary>

不能。目标状态围栏与网络已发生效果是不同证据。</details>

<details><summary>15. Go context 取消能撤销提供方已接受的通知吗？</summary>

不能。它是本进程协作停止信号，不是远端回滚。</details>

<details><summary>16. fuzz 的非法 UTF-8 输入应直接假设 `encoding/json` 总会报错吗？</summary>

不应。按具体解析器和教学输入合同核对，不能凭想象写断言。</details>

### 证据评审 17–22：失败怎样留在课程里

<details><summary>17. fuzz 找到失败输入后，下一步最重要的可复核材料是什么？</summary>

最小脱敏失败样本、触发性质、环境/版本及修复后的回归入口。</details>

<details><summary>18. `decode(encode(x))==x` 可对 ProtoJSON 中未知字段原字节无条件成立吗？</summary>

不可。先定义规范化字段/输入域，JSON 转换可能丢未知字段。</details>

<details><summary>19. fake 时钟测出 lease 到期，就证明真实 etcd 已删键吗？</summary>

不能。那只验证本地模型；真实协调状态须在隔离环境另核对。</details>

<details><summary>20. 门闩复现双受理的测试可证明真实网络端到端安全吗？</summary>

不能。它证明指定本机交错及模型行为，真实 I/O/跨节点另验。</details>

<details><summary>21. 固定 OpenIM 两处源码等于已对其运行 `go test -race` 吗？</summary>

不等于。本章只读源码，未执行上游测试。</details>

<details><summary>22. 一份完整的本章练习证据应怎样限定结论？</summary>

写明被测性质、提交/Go版本、命令、种子、初态/交错、实际结果/失败样本和未覆盖范围；不能把一项绿写成全系统保证。</details>

## 本章完成标准与下一步

能不看答案解释三个性质、构造 data-race-free 的双发交错、说清 `-race`/fuzz/门闩/跨节点历史各自能证明什么，并把失败输入变成脱敏回归用例，才算完成第一轮。真实 Go、IM 和故障证据仍由学习者在隔离环境另行取得。下一章 [10.08 依赖与质量工具](./08_dependency_quality_tools.md) 将检查依赖版本、生成代码、格式与静态分析工具所提供的证据边界。
