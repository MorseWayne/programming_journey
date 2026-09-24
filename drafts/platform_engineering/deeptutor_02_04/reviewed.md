# 02.04 哈希与集合：在有限窗口内识别重复消息身份

> DeepTutor 原稿经技术和教学审阅后的章节。身份、任务、容量、代码和结果均为静态教学设定；本次没有运行 Go、测试、站点构建或 OpenIM。

## 本章从哪里开始

02.03 在**有序**键中找一个范围起点。现在换一个问题：虚构会话 `c-a` 的消息 `m-a` 又出现了一次，本地程序怎样快速判断它的身份是否已经在最近记录中？按消息正文判断会误伤两条内容相同的合法消息；按切片下标判断又会随插删改变。因此先定义键，再选择查找结构。

本章使用 `MessageKey{ConversationID, MessageID}` 作为**当前教学模型的身份范围**：同一会话内，同一消息 ID 的再次出现是候选重复；`c-a/m-a` 与 `c-b/m-a` 不同。若真实协议规定 ID 仅在发送者范围内唯一，身份键还需增加发送者等字段。这应由业务契约决定，不能在教材中途悄悄改键。

| 第一遍 | 第二遍 | 综合 |
|---|---|---|
| 键与集合、哈希和冲突、Go map | 冲突策略、负载与成本、有限去重窗口 | N=3 的逐步状态表和保证范围 |

先修是 01.05 的 `map` 与结构体、02.01 的成本模型、02.02 的队列与环形缓冲，以及 02.03 的精确查找和有序边界。`map` 的语言行为可以直接学习；哈希桶是帮助理解算法的模型，不能把本章玩具桶当成 Go 当前实现的内部布局。

## 一、集合回答“这个精确身份在吗”

消息 `c-a/m-a` 可以与 `c-b/m-a` 有相同正文；甚至 `c-a/m-a` 与 `c-a/m-b` 也都可以写“你好”。正文不是稳定身份。当前切片的 `messages[2]` 只是一个位置，前面插入或删除消息后下标会变化。需要把会话和消息 ID 组成可比较的键：

```go
type MessageKey struct {
	ConversationID string
	MessageID      string
}

seen := make(map[MessageKey]struct{})
key := MessageKey{ConversationID: "c-a", MessageID: "m-a"}
_, exists := seen[key]
_ = exists
```

`MessageKey` 的字段都是 `string`，因此结构体可比较，可作为 Go `map` 的键。`map[MessageKey]struct{}` 只保存“成员在不在”，不需要额外值；这就是一种**集合**表示。`_, exists := seen[key]` 用第二个结果明确区分“键缺失”与“键存在但值为零值”。

它解决的是**精确键存在性**。若需求是“按序号 5 以后读取一段历史”，02.03 的有序数组与二分边界更贴切；`map` 不提供按键排序的范围结果。选结构之前先说清楚查询的形状。

## 二、哈希值、桶位置和键相等

哈希函数把一个键转换为用于定位的数据。先用纯整数玩具函数 `h(k)=k%4`，想象有编号 0、1、2、3 的四个桶：

| 整数键 | `k%4` | 桶 |
|---:|---:|---:|
| 1 | 1 | 1 |
| 5 | 1 | 1 |
| 6 | 2 | 2 |

键 1 和 5 进入同一桶，叫**碰撞**。查找 5 时不能因为桶 1 有键 1 就说“5 已存在”；还要比较桶里的完整键。正确性依赖键相等规则，哈希只是缩小候选范围。

换成消息身份，`c-a/m-a` 与 `c-b/m-a` 即使进入同一候选桶，仍是不同键；它们的 `ConversationID` 不相等。反过来，同一复合键再次出现，即使正文、切片位置不同，也会命中这个身份。

玩具 `k%4` 只为解释冲突。它不是 Go `map` 使用的哈希函数、桶数、扩容方式，也不是密码学哈希。不同键空间很大、桶数有限时，碰撞无法仅靠“选一个好数字”彻底消除；实现必须有冲突处理和最终相等判断。

### 两种基本冲突处理

**链式法**在每个桶下保存一条键的列表。若 1 和 5 都映到桶 1，可想象 `bucket[1] = [1,5]`。查找 5 先定位桶，再从这条小列表中逐项比较。若所有键都映到同一桶，最后仍能找对键，却可能要线性扫描。

**开放寻址**把键放进表的槽位。若槽 1 已被键 1 占用，键 5 按约定探查槽 2、3 等，直到找到空槽或已有的同键。查询要沿相同探查序列走；删除不能随意把中间槽直接当“从未使用”，否则可能让后面的键无法被找到。这里的线性探查只是另一种教学策略，不代表 Go `map` 内部就用它。

| 方案 | 碰撞后去哪儿 | 一个容易漏掉的边界 |
|---|---|---|
| 链式 | 留在同桶的列表 | 桶内很长时查找会退化 |
| 开放寻址 | 沿探查规则找其他槽 | 装载接近满表、删除后探查链不能被错误截断 |

把键 `1、5、9` 都放进容量 4 的玩具表，可以看出两种方法的**布局**与**相等判断**：

| 方法 | 插入 1 后 | 插入 5 后 | 插入 9 后 |
|---|---|---|---|
| 链式 | 桶 1 有 `[1]` | 桶 1 有 `[1,5]` | 桶 1 有 `[1,5,9]` |
| 线性探查示意 | 槽 1 放 1 | 槽 2 放 5 | 槽 3 放 9 |

查找 9 时，链式检查桶 1 的各键；线性探查从槽 1 走到槽 3。两种方法都必须在候选位置比较“完整键是否等于 9”。如果表里只有 1 和 5，查找 9 应返回不存在，而不是把哈希或起始桶相同当作命中。表中没有模拟删除或 Go 的实际实现。

## 三、负载因子与成本结论要带前提

设表中有 `N` 个不同键，准备了 `M` 个桶或槽，**负载因子**记为 `α=N/M`。这个比例在不同方案中意义不同：链式法允许同桶多个键，所以 `α` 可以大于 1；开放寻址每个有效槽至多一个键，需要留空位，通常要求 `α<1`。

若散列能把键较均匀地分布，且负载受控，链式法的平均桶长与 `α` 有关，查找常被近似为 O(1+α) 次键比较。当 α 有固定上界、键比较和散列计算也按固定成本处理时，可概括为**平均或期望 O(1)**。这不是对每个输入的最坏保证：所有键碰到一个桶时，链式查找可退化到 O(N)。开放寻址在高负载下也会有长探查序列。

表扩容可能重新分配并迁移许多键，一次插入因而可能做 O(N) 工作。要说连续操作的摊还成本，必须说明何时扩容、如何增长以及负载维持什么范围。Go `map` 的语言规范给出键、查找、删除等**语义**，并不承诺本章玩具哈希、固定桶布局、每次操作 O(1) 或稳定迭代顺序。

还有键长度的成本。玩具整数 `k%4` 只做固定宽整数运算；实际字符串键可能需要读取许多字节才能散列或比较。若消息 ID 长度 `L` 随输入增长，不能把处理整个键的成本无条件视为常数。这与 02.01 “先选基本操作和输入维度”的原则一致。

## 四、Go `map` 做本地集合的三个边界

以下独立程序只检查当前进程的精确复合键。预期 `c-a/m-a` 第二次出现时为重复，`c-b/m-a` 则为新键。

```go
package main

import "fmt"

type MessageKey struct {
	ConversationID string
	MessageID      string
}

func main() {
	seen := make(map[MessageKey]struct{})
	keys := []MessageKey{
		{ConversationID: "c-a", MessageID: "m-a"},
		{ConversationID: "c-a", MessageID: "m-b"},
		{ConversationID: "c-a", MessageID: "m-a"},
		{ConversationID: "c-b", MessageID: "m-a"},
	}
	for _, key := range keys {
		if _, exists := seen[key]; exists {
			fmt.Println(key.ConversationID, key.MessageID, "重复")
			continue
		}
		seen[key] = struct{}{}
		fmt.Println(key.ConversationID, key.MessageID, "首次出现")
	}
}
```

第一，`map` 的**零值为 nil**：可以查询、读取长度和遍历，却不能向 nil map 赋值；写前用 `make` 或 map 字面量初始化。第二，`range` 遍历 `map` 的次序**没有排序或插入顺序保证**。上例遍历的是 `keys` 切片，所以输出的教学顺序由切片给出；如果改为 `for key := range seen`，不能把结果当消息到达顺序。第三，`map` 的键必须可比较：包含两个字符串的结构体可以，包含 `[]byte` 字段的结构体不能直接作键。

如果需要既快速判断存在，又记住谁最早进入，必须增加顺序结构。02.02 的固定环形队列就是一个可复用的前置模型。

## 五、容量 N 的去重窗口：集合配合次序

设窗口容量为正数 `N`。它只记住**当前进程中最近接纳的 N 个不同复合键**：`seen` 集合快速回答“是否仍在窗口”，`order` 结构按首次接纳时间保存由旧到新的次序。重复命中时本章约定**不刷新位置**；满时接纳新键前淘汰最旧键。这与 02.02 的“待发送任务队列满时拒绝”是两个业务合同，不能因为内部都用环形数组就混用返回含义。

状态不变量为：`0≤count≤N`；有效顺序槽中每个键只出现一次；有效槽中的键集合恰好等于 `seen`。处理步骤是：

1. 先检查键的两个身份字段非空。
2. 若键已在 `seen`，返回重复，顺序与集合都不变。
3. 若新键到来且窗口已满，从环形队首删除最旧键，同时从 `seen` 删除。
4. 把新键写到环形队尾并加入 `seen`，返回首次出现。

容量为 3，输入 A、B、C、A、D、A 的纸面轨迹：

| 输入 | 返回 | 有效次序（旧→新） | `seen` |
|---|---|---|---|
| A | 新 | A | A |
| B | 新 | A,B | A,B |
| C | 新 | A,B,C | A,B,C |
| A | 重复，不刷新 | A,B,C | A,B,C |
| D | 新，淘汰 A | B,C,D | B,C,D |
| A | 新，淘汰 B | C,D,A | C,D,A |

最后的 A 不命中，因为它已在 D 到来时被驱逐。若只删顺序槽、不删 `seen`，最后的 A 会被错误判成重复；若只删集合、不删顺序槽，后续淘汰次序会错。两份状态必须一起更新。

### 顺序环形实现

以下是独立完整程序。它使用 02.02 的 `head/count/tail` 思路避免从切片前部不断截短；没有并发访问、落盘或网络。`SeenOrAdd` 的 `bool` 表示**当前窗口内已见过**，`error` 表示输入或构造状态无效。

```go
package main

import (
	"errors"
	"fmt"
)

type MessageKey struct {
	ConversationID string
	MessageID      string
}

type DedupWindow struct {
	slots []MessageKey
	head  int
	count int
	seen  map[MessageKey]struct{}
}

func NewDedupWindow(capacity int) (*DedupWindow, error) {
	if capacity <= 0 {
		return nil, errors.New("窗口容量必须大于零")
	}
	return &DedupWindow{
		slots: make([]MessageKey, capacity),
		seen:  make(map[MessageKey]struct{}),
	}, nil
}

func (w *DedupWindow) SeenOrAdd(key MessageKey) (bool, error) {
	if w == nil || len(w.slots) == 0 || w.seen == nil {
		return false, errors.New("窗口尚未正确创建")
	}
	if key.ConversationID == "" || key.MessageID == "" {
		return false, errors.New("消息身份不完整")
	}
	if _, exists := w.seen[key]; exists {
		return true, nil // 重复不移动队列位置。
	}
	if w.count == len(w.slots) {
		old := w.slots[w.head]
		delete(w.seen, old)
		w.slots[w.head] = MessageKey{}
		w.head = (w.head + 1) % len(w.slots)
		w.count--
	}
	tail := (w.head + w.count) % len(w.slots)
	w.slots[tail] = key
	w.count++
	w.seen[key] = struct{}{}
	return false, nil
}

func main() {
	w, err := NewDedupWindow(3)
	if err != nil {
		fmt.Println(err)
		return
	}
	for _, id := range []string{"A", "B", "C", "A", "D", "A"} {
		duplicate, err := w.SeenOrAdd(MessageKey{ConversationID: "c-a", MessageID: id})
		if err != nil {
			fmt.Println(err)
			return
		}
		fmt.Println(id, "窗口内重复:", duplicate)
	}
}
```

按表静态推导，六次返回依次为 `false,false,false,true,false,false`。已在窗口的 A 不刷新；D 驱逐 A 后，最后的 A 是新键。窗口内最多保留 N 个不同键，故额外状态空间随 N 增长。散列集合的查找可在有前提的成本模型下按平均常数处理，环形次序更新是固定次数操作；若键很长或出现极端碰撞、重哈希，不能把整次调用无条件称为 O(1)。

可以像 02.02 那样按“初始化、保持”检查不变量。构造后 `count=0`、`seen` 为空，集合恰好等于有效槽中的键。重复分支不改变任何状态，所以保持成立。新键在未满时写到唯一空闲尾槽，并同步加入 `seen`，两边各增加同一个键。满时先删除队首键，清槽并将 `count` 减一，再把新键写入腾出的尾槽并加入集合；由于最开始已查过新键不在 `seen`，窗口里仍不会出现相同键两次。容量 1 也符合这条推理：新键替换唯一旧键，重复键则不动。

构造函数拒绝容量 0，是不变量的前置。若有人绕过构造直接建立零值 `DedupWindow{}`，`SeenOrAdd` 返回错误，不会执行 `%0` 或向 nil map 写入。这个防护属于本例的 API 合同，不能推广为所有 Go 结构体的零值都可直接使用。

本例只在顺序执行和 `NewDedupWindow` 构造契约下说明不变量。若多条执行路径同时修改 `seen`、`head`、`count`，还需要同步和原子业务规则；这要到并发章节。即使本地判断“重复”，也没有证明上一次尝试已被服务端处理。

## 六、窗口命中不等于长期幂等

上面的窗口按**最近接纳的不同身份**计数，不按时间计数。到达大量其他新键后，旧键会被驱逐；再次出现就返回“新”。进程重启会丢失整个内存窗口；两个节点各有窗口，彼此不知道对方见过什么。若客户端换一个 `MessageID` 重发同一业务意图，当前复合键也无法识别。这些都是合同边界，不能因 `map` 查找很快就忽略。

还要处理“同键、不同正文”的业务冲突。本章只判断身份是否在窗口；如果相同键携带不同内容，`SeenOrAdd` 仍返回“重复”。真实系统可能需要比较原请求摘要、拒绝冲突或返回首次处理结果，不能默默把冲突当安全重试。谁有权声明会话与消息 ID，也不能由一个客户端传来的字符串自行证明。

**端到端幂等**需要明确：同一个业务操作使用哪个稳定键；首次成功或失败结果存在哪里；多实例怎样共同判断；保留多久；过期后如何解释重试；超时但结果未知时怎样回应。有限内存窗口只解决其中一小段时间和单实例的“见过此键吗”，不提供服务端受理、持久性、送达或已读保证。

## 七、选择结构时同时写出查询与保证

| 需求 | 起步结构 | 前置 | 本章能说的成本 | 不能由此推出 |
|---|---|---|---|---|
| 在无序列表按 ID 找一条 | 顺序扫描 | 明确复合键 | 最坏 O(n) 次键比较 | 全局去重 |
| 在有序序号中找 `≥x` 起点 | 切片加二分 | 非降序、单调谓词 | O(log(n+1)) 次比较 | 历史完整 |
| 在当前进程按 ID 判断存在 | `map[MessageKey]struct{}` | 可比较键、已初始化 | 均匀和受控负载下平均常数模型 | 有序遍历或持久化 |
| 只记最近 N 个不同键 | 顺序结构加集合 | N>0、同步维护不变量 | 平均查找加固定次数队列更新 | 超出窗口的长期幂等 |

Go `map` 的 `range` 次序没有承诺，不能用它选“最旧消息”或按时间展示。若要保留到达顺序，使用切片、队列或明确的排序键；若要范围查询，使用有序结构并解释维护成本。哈希与二分回答的问题不同，不是一个“总比另一个快”的选择题。

哈希集合的成本还有两个输入维度：保留键数 `N` 与单个键的字节长度 `L`。即使桶分布理想、只需检查一个候选，计算某个新字符串键的散列仍可能读取它的字节；如果产品允许任意长 ID，不能只写“查找 O(1)”便结束评审。反过来，固定长度、经过合法性校验的 ID 更容易使用简化的单位成本模型，但这仍没有提供最坏 O(1) 或网络时延保证。

阅读固定版本的 [OpenIM 消息存储接口](https://github.com/openimsdk/open-im-server/blob/f6411a8a1a31d3df36f4c2b3ad28481a94141e1f/pkg/common/storage/controller/msg.go)时，应提出待核对问题：消息身份在哪一层定义，重复请求在哪一层判断，状态保存多久，失败结果如何返回。本章没有审计这些行为，也不由文件名推断其去重保证。

## 八、分层练习：从碰撞到窗口边界

<details><summary>1. 正文都为“你好”的两条消息一定重复吗？</summary>

不一定。正文是内容；本章按会话 ID 与消息 ID 的复合键判断身份。</details>

<details><summary>2. `c-a/m-a` 和 `c-b/m-a` 在本模型中相等吗？</summary>

不相等，会话字段不同。若真实协议另有唯一性范围，需要按契约修订键。</details>

<details><summary>3. 玩具哈希 `k%4` 中，1 与 5 映到同桶就相等吗？</summary>

不相等。同桶是碰撞，仍需比较完整键。</details>

<details><summary>4. 把所有键都映到桶 0，正确性与成本分别怎样？</summary>

若桶内逐键比较，正确性仍可保持；查找却可能退化到 O(N)。</details>

<details><summary>5. 链式法的 `α=N/M` 能大于 1 吗？</summary>

能。一个桶可保存多个键；α 是平均桶长度的量纲。</details>

<details><summary>6. 开放寻址接近满表会怎样？</summary>

空槽稀少，探查可能变长；删除还要维护探查链语义。</details>

<details><summary>7. 一次扩容为什么可能不再是 O(1)？</summary>

可能要迁移许多旧键；摊还结论需要明确的增长与负载策略。</details>

<details><summary>8. `map[[]byte]struct{}` 可直接编译吗？</summary>

不能，切片不可比较；本章使用只含字符串字段的可比较结构体键。</details>

<details><summary>9. 从 nil map 读取和写入各会怎样？</summary>

读取会得到零值和 `ok=false`；赋值写入会运行时失败，写前要初始化。</details>

<details><summary>10. 只看 `seen[key]` 的零值能区分缺失吗？</summary>

不能。用 `_, exists := seen[key]` 明确取得是否存在。</details>

<details><summary>11. `range seen` 能得到最早进入窗口的键吗？</summary>

不能。Go map 迭代无顺序保证，最早键由顺序结构记录。</details>

<details><summary>12. N=3，依次到达 A、B、C、A 后窗口怎样？</summary>

仍为 A、B、C；重复 A 不刷新位置。</details>

<details><summary>13. 接着到达 D 后窗口怎样？</summary>

满时淘汰最旧 A，窗口为 B、C、D。</details>

<details><summary>14. 此后 A 再到达，算窗口重复吗？</summary>

不算。A 已被驱逐；接纳 A 并淘汰 B 后窗口为 C、D、A。</details>

<details><summary>15. 只从队列删 A、忘记从集合删，会发生什么？</summary>

已驱逐 A 仍被误判为重复，集合与队列的不变量被破坏。</details>

<details><summary>16. 为什么窗口容量 N 必须为正？</summary>

本章环形索引要对 N 取模；零容量也没有“接纳新身份”的明确定义。</details>

<details><summary>17. 窗口重启后能继续认出旧键吗？</summary>

不能。当前窗口只在进程内存中，重启后要重新建立状态。</details>

<details><summary>18. 两节点各自有窗口，能保证全局一次效果吗？</summary>

不能。没有共享的权威记录和一致性规则，彼此不能判断对方处理结果。</details>

<details><summary>19. 同键却不同正文应直接当安全重试吗？</summary>

不能自动这样判断；需要定义冲突处理、首次结果和可信身份来源。</details>

<details><summary>20. 哈希集合能替代 02.03 的范围查找吗？</summary>

不能。集合只按精确键判断存在；范围查询需要有序表示或另建索引。</details>

## 来源与下一步

- [Algorithms, 4th Edition：哈希表](https://algs4.cs.princeton.edu/34hash/)用于核对冲突、负载因子与成本假设。
- [Go map 语言规则](https://go.dev/ref/spec#Map_types)与[Go maps in action](https://go.dev/blog/maps)用于核对键可比较性、nil、成员查询和迭代边界。
- [MIT 6.006 笔记目录](https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-spring-2020/pages/lecture-notes/)用于核对哈希与分析主题的学习顺序。

下一章[02.05 排序与分治](../../../src/docs/platform_engineering/curriculum/02_algorithms/05_sort_divide.md)讲明当业务需要按序号、时间和次级键展示或范围读取消息时，如何定义比较规则并计算排序成本。
