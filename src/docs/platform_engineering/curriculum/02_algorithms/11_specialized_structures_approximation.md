---
title: 02.11 近似与专用结构：前缀、位图、Bloom 与并查集
icon: /assets/icons/article.svg
order: 12
date: 2026-09-25
---

[返回第二卷](./README.md) · [哈希与集合：02.04](./04_hash_sets.md) · [图遍历：02.08](./08_graph_dependency_traversal.md) · [动态规划：02.10](./10_dynamic_programming_greedy.md)

# 02.11 近似与专用结构：前缀、位图、Bloom 与并查集

> 本章面向学过 Go 字符串/切片/map、02.04 集合、02.08 图的初学者。四种结构只解决各自**窄问题**：Trie 找前缀、位图存稠密整数标记、Bloom filter 做可能存在预筛、并查集维护合并式连通。所有 ID、位位置和关系为虚构纸上数据；没有运行 Go、Redis、IM 服务或基准。当前 S2 `/v1` 正文非空且最多 **6 UTF-8 B**、原始 HTTP 请求正文最多 **4096 B**、同 ID 重复 **409**、非成员隐藏 **404**、`200 accepted_in_memory` 只到本进程；未来 S3 `/v2` 存库提案仍 6 B，R9 6→9 B 待审。专用结构不改变这些合同。[09.02 当前合同](../09_backend_security/02_http_api_contract.md)

## 一、先按问题挑结构，不从名字猜用途

虚构 IM 本地工具有四类请求：输入“会话”补全关键词；标记本次纸上快照里哪些**稠密整数设备号**在线；在查权威消息 ID 集合前快速判“这个 ID 肯定不在吗”；对**只增加边**的离线关系图反复问两点是否连通。若用一个 `map` 也能解决小规模问题，先记下它的清晰性；只有数据规模、查询形状或空间约束支持，才考虑专用结构。[02.04 map 与集合](./04_hash_sets.md)

| 问题 | 纸上候选 | 回答的类型 | 它没有保证 |
|---|---|---|---|
| 已知前缀列出关键词 | Trie | 精确前缀路径及词项 | 成员授权、语义相关性 |
| 稠密编号集合的布尔标记 | 位图 | 给定快照中的精确 bit | 实时在线/设备 ACK |
| 消息 ID 可能已见？ | Bloom filter | “必不在”或“可能在” | 可能在即真重复 |
| 只并入关系后是否同一连通块 | 并查集 | 静态/增量无向连通 | 路径、方向、撤权后的实时成员关系 |

“近似”只适用于本章的 Bloom 成员判断，其它三者在**输入/版本正确**时做精确结构操作。即使精确数据结构也可能因为数据过期或建模错误给出错误业务结论。下面逐一从手算状态进入。[Princeton：Trie](https://algs4.cs.princeton.edu/52trie/) · [Union-Find](https://algs4.cs.princeton.edu/15uf/)

## 二、Trie：共同前缀共用路径，终止标记不能丢

**Trie（前缀树）**按字符串的连续单位走边。以虚构关键词 `会话`、`会话历史`、`会话列表` 为例，三词共享“会→话”路径，后面再分“历→史”和“列→表”。到“会话”节点要有**这是完整词项**的终止标记，否则只因它是更长词的前缀，无法区分“会话”本身是否在词表。查给定前缀可先沿其长度 L 走到节点，再遍历该节点下的词；列出 N 个结果当然还要付出遍历/输出成本，不能只报 `O(L)`。[Princeton Algorithms：Tries](https://algs4.cs.princeton.edu/52trie/)

```text
根
└─会─话 [词项结束]
       ├─历─史 [词项结束]
       └─列─表 [词项结束]
```

Go 字符串底层是 UTF-8 字节；教学图按**Unicode 码点**“会/话/历/史/列/表”分边。实现时可用 `for _, r := range word` 迭代码点，不能随意在汉字的多字节中间截断；码点相同也不自动处理大小写、规范化或中文分词同义。Trie 的节点/边会占内存，稀疏大字符集下直接为每节点分配完整字符表可能浪费；可用映射子边或压缩前缀，具体取舍要量数据。[01.04 UTF-8 与码点](../01_go/04_collections_text.md) · [Princeton：Trie 变体](https://algs4.cs.princeton.edu/52trie/)

前缀命中“会话历史”**不**证明 `u-b` 有权读某会话，也不证明候选词相关文档是 current。Trie 可帮助输入补全或字面词项定位，权限与资料版本仍在应用/检索链处理。[09.07 对象授权](../09_backend_security/07_authentication_authorization.md)

## 三、位图：按整数位置存布尔值，先要可靠编号映射

若纸上设备号固定为 `0…7`，一字节可放 8 个**标记位**。约定最低位是编号 0，令 1、3、6 号为 1：值为 `2¹+2³+2⁶=2+8+64=74`，写成八位二进制是 `01001010`（从左到右看 bit7…bit0）。查 3 号看第 3 位，集合交/并可用位运算；这些只是**固定快照中的精确标记**，不代表网络连接还活着或消息已送达。[02.01 离散计数与表示](./01_discrete_cost.md)

位图有效的前提是对象已映射到**稠密、稳定的非负整数范围**。真实 `user_id`/`device_id` 往往是字符串或稀疏大整数；若最大 ID 极大但只用三个编号，按最大值开位图可能比 map 浪费。字符串到小整数的映射表本身也要维护身份、生命周期和版本，不可因为位置被复用就把旧设备的状态当新设备。删除/下线要清 bit 并更新快照；并发读写同一字节还需要同步，不会因为位图紧凑就自动安全。[02.04 精确身份](./04_hash_sets.md) · [05.04 共享状态](../05_runtime/04_memory_model.md)

位图可以是候选优化，但当前 IM **非成员隐藏 404**靠身份/会话授权判断，不可把“bit=1”当访问许可；**`200 accepted_in_memory`**也不能靠在线 bit 推成 B 已收。[09.02 当前合同](../09_backend_security/02_http_api_contract.md)

## 四、Bloom filter：0 位能排除，1 位只能说“可能”

普通 Bloom filter 有一段 bit 数组和 k 个确定的哈希位置。插入一个 ID 时把它对应的 k 个位置设 1；查询时若有任何位置仍为 0，在**插入完整、哈希一致、未错误删位且未损坏**的前提下，这个 ID 肯定没插入过；若所有位置都是 1，只能说**可能插入过**，因为其它 ID 也可能把这些位置凑齐。[Bloom 原论文](https://www.cs.princeton.edu/courses/archive/spr05/cos598E/bib/p422-bloom.pdf) · [Redis：Bloom 查询语义](https://redis.io/docs/latest/data-types/probabilistic/bloom-filter/)

纸上 8 位、每 ID 两个位置：插入 `m-1→{1,5}` 和 `m-2→{2,6}`；未插过的 `m-x→{1,6}` 看到两位都为 1，得到**假阳性**“可能在”；`m-y→{0,6}` 因 bit0 为 0，可判“必不在”。这些哈希结果是**人为指定**的，不是某个 Go/Redis 哈希函数实测；位数、哈希数和加入元素数都会影响误判概率。位数组逐渐更满时，假阳性通常更容易出现。[Bloom 原论文](https://www.cs.princeton.edu/courses/archive/spr05/cos598E/bib/p422-bloom.pdf)

| 查询结果 | 合法推论 | IM 去重下一步 |
|---|---|---|
| 任一位 0 | 在上述结构前提下未插入 | 可跳过**昂贵的存在性查询**，仍核消息合同/写入结果 |
| 全部位 1 | 可能插入，也可能假阳性 | 查权威精确 ID/操作记录，不能直接丢消息 |

若把 Bloom 的“可能在”直接映射成当前同 ID 重复 **409**，`m-x` 的假阳性就会错误拒绝新消息。普通 Bloom 的 bit 还不能任意清除：某个位置可能由其它 ID 共用，清掉会制造**假阴性**。要删除可研究计数 Bloom、Cuckoo 等别的结构/版本方案，但它们各有额外成本与边界；本章不把它们当现有 IM 实现。[Redis：Bloom 容量/误判](https://redis.io/docs/latest/data-types/probabilistic/bloom-filter/) · [09.02 重复 ID 409](../09_backend_security/02_http_api_contract.md)

## 五、并查集：合并式无向连通，不给路径和撤权答案

**并查集（Union-Find/DSU）**维护若干互不相交的集合：`Find(x)` 返回 x 所在集合的代表，`Union(a,b)` 合并两个集合。纸上有编号 0…4，先各自一组；`Union(0,1)`、`Union(1,2)` 后 0/1/2 同组；`Union(3,4)` 后 3/4 同组。`Find(0)==Find(2)` 为真，`Find(0)==Find(4)` 为假。代表根的具体编号会随合并策略变化，**同组关系**才是对外结论。[Princeton Algorithms：Union-Find](https://algs4.cs.princeton.edu/15uf/)

朴素把一棵树接在另一棵下面可能形成深链；按规模/秩合并并在 `Find` 时压缩路径，可减少后续查询的摊还工作。初学者先画 parent 指向根，再看为何不能把 `Union(1,2)` 当“直接边 1—2 永久存在”的证据：并查集只回答**同一连通块**，不保存原始边列表，也不给一条具体路径。[Princeton：加权合并和路径压缩](https://algs4.cs.princeton.edu/15uf/)

它尤其适合**只加无向关系、反复问连通**的离线题。IM 成员退出、关系撤销、时间变化、方向性或“可读旧历史”需要更丰富的状态；普通并查集不支持删除一条边后自动拆集合，也不能成为实时授权源。若只是单次查一张已知图的路径，02.08 的 BFS/DFS 可能更直接。[02.08 图与可达](./08_graph_dependency_traversal.md) · [09.07 授权](../09_backend_security/07_authentication_authorization.md)

## 六、用反例审“空间省了，所以可以当权威”的推理

四种结构的**结构正确性**都依赖输入版本和维护方式。Trie 词表漏了新关键词，前缀查找会漏；位图编号映射复用会把旧 bit 错接到新设备；Bloom 加入/删除流程若错，连“0 位必不在”的前提也会失效；并查集不能处理撤销却仍报告旧连通。结构更省内存或更快，不自动证明资料权威、权限或投递结果。[14.09 资料/权限版本](../14_ai/09_evaluation_data_engineering.md)

| 结构 | 具体反例 | 应保留的权威边界 |
|---|---|---|
| Trie | 词“会话”只是前缀、无终止标记 | 词项存在与用户授权另核 |
| 位图 | 旧 6 号设备已回收，bit 未清 | 编号映射/设备状态按版本查 |
| Bloom | `m-x` 未插入却撞齐位 | “可能在”后查精确 ID，别直接 409 |
| 并查集 | 关系撤销后集合没拆 | 现行关系/成员权威源仍需核 |

**精确 map/set**虽然可能用更多空间，却适合当前消息 ID 的最终判重；Bloom 只可作预筛。专用结构要能明确“若数据源更新/重启/扩容，结构如何重建或失效”。没有这些说明的性能对比只是纸上猜测。[02.04 哈希与集合](./04_hash_sets.md)

## 七、容量、并发与业务验收一起算

Trie 的节点数取决于词项与共享前缀；位图空间与**最大编号范围**有关；Bloom 的位数 m、哈希数 k、加入量 n 决定空间/误判权衡；并查集保存每元素 parent 和规模/秩。可先用小样本数节点/bit/数组槽，再按真实 ID 分布、更新/删除比例和查询比例设计测量。Bloom 不能按“零误判”报价；若容量超出设计，误判可能上升，某些可扩展实现会加新子过滤器，也增加检查工作。[Redis：Bloom 容量与误判](https://redis.io/docs/latest/data-types/probabilistic/bloom-filter/)

这些容器若被多个 goroutine 更新，还要按 05 卷的共享状态规则设计同步或所有权，不可把普通 map/切片/bit 当线程安全。对 IM 用户可见结果，记录**正反例、误判/漏判、版本延迟、内存、更新成本和第一坏边界**；例如 Bloom 假阳性若只多一次权威查询是性能成本，若导致丢消息就是业务失败。课程没有实测吞吐或误判率。[05.04 共享状态](../05_runtime/04_memory_model.md) · [11.01 业务测量](../11_reliability/01_business_measurement.md)

## 八、22 道分层练习：结构选择与错误后果

1–8 认四类问题，9–16 推演位/哈希/连通，17–22 审删除、版本和业务硬门。答案均基于虚构输入。

### 基础 1–8：结构解决什么

<details><summary>1. Trie 的终止标记为什么必要？</summary>

区分“会话”本身是完整词项，还是只作为更长词的前缀。</details>

<details><summary>2. 查前缀“会话”应列出哪三个纸上词？</summary>

`会话`、`会话历史`、`会话列表`。</details>

<details><summary>3. Trie 查到关键词就授权读某会话吗？</summary>

不授权；词项和成员/资料权限是不同边界。</details>

<details><summary>4. 位图适合怎样的 ID？</summary>

稠密、稳定的非负整数范围；稀疏大 ID 可能浪费。</details>

<details><summary>5. Bloom 的“所有位为 1”是什么意思？</summary>

可能插入过，也可能是假阳性；需精确确认。</details>

<details><summary>6. Bloom 有任一位为 0 可以推什么？</summary>

在正确插入、哈希一致、未错误删位/损坏前提下，肯定没插入过。</details>

<details><summary>7. 并查集 Find 和 Union 各做什么？</summary>

Find 查集合代表；Union 合并两集合。</details>

<details><summary>8. 并查集能给两点间的具体路径吗？</summary>

不能；只给同组/连通判断，路径用图遍历等方法。</details>

### 推演 9–16：bit、假阳性与连通

<details><summary>9. bit1、bit3、bit6 为 1 的字节值是多少？</summary>

`2+8+64=74`，从高位到低位写 `01001010`。</details>

<details><summary>10. 未插过的 m-x 哈希到 {1,6}，当前两位均 1，属于什么结果？</summary>

假阳性：Bloom 说“可能在”，真实未插入。</details>

<details><summary>11. m-y 哈希到 {0,6} 且 bit0=0，结果是什么？</summary>

在本章前提下可判肯定没插入。</details>

<details><summary>12. 见“可能在”可直接给新 m-x 返回重复 ID 409 吗？</summary>

不能；先查权威精确 ID/操作记录，避免假阳性错拒。</details>

<details><summary>13. 普通 Bloom 删除 m-1 时可直接清它的两位吗？</summary>

不可随意清；别的 ID 可能共享位，会制造假阴性。</details>

<details><summary>14. Union(0,1)、Union(1,2) 后 0 与 2 同组吗？</summary>

同组，Find 结果相同。</details>

<details><summary>15. 另 Union(3,4) 后 0 与 4 同组吗？</summary>

不同组，除非再有跨组 Union。</details>

<details><summary>16. 并查集根编号固定能代表某真实用户吗？</summary>

不能；根随合并策略变化，只是结构代表。</details>

### 决策 17–22：删除、更新与硬门

<details><summary>17. 关系撤销后普通并查集会自动拆组吗？</summary>

不会；需重建或换能处理动态删除的方案，不能当实时授权源。</details>

<details><summary>18. 字符串设备 ID 映射到位图编号，要维护什么？</summary>

唯一、稳定且版本明确的映射，清理/复用时避免旧 bit 串身份。</details>

<details><summary>19. Trie 边按 UTF-8 任意字节截断，能保证汉字完整吗？</summary>

不能；本章按码点建边，实现需选择一致的文本单位。</details>

<details><summary>20. Bloom 假阳性只多一次精确查询，与直接丢消息等价吗？</summary>

不等价；前者是性能成本，后者是业务错误。</details>

<details><summary>21. 位图显示 B 在线能证明 S2 200 后 B 设备收到吗？</summary>

不能；当前 200 只到本进程内存受理。</details>

<details><summary>22. 为一个小词表和少量 ID 必须上四种结构吗？</summary>

不必。先用清楚的 map/切片基线，再按规模、查询、删除、误判成本选择。</details>

## 本章完成标准与后续路径

能画出三个“会话”词项的前缀树，手算 `01001010=74`，用 m-x/m-y 解释 Bloom 的“可能在/必不在”并阻止假阳性直接 409；能在并查集中区分同组与路径/撤权，再说明四种结构的版本和并发边界，才算完成本章。下一章 02.12 将把这些算法选择整理成面向真实 IM 需求的静态评审卡。[第二卷路线](./README.md)
