# 02.09 加权路径与状态空间：最少跳数不等于最低代价

> 本章面向已学 02.08 BFS/DFS 和 02.07 最小堆的 Go 初学者，从纸上加权图进入最短路径、非负权前提、负权/不可达反例与扩展状态。虚构的 IM 投递路径只是**算法练习图**，并非上游 OpenIM 拓扑、实测网络时延或业务选路方案；没有运行 Go、IM 服务或基准。当前 S2 `/v1` 正文非空最多 **6 UTF-8 B**、原始 HTTP 请求正文最多 **4096 B**、同 ID 重复 **409**、非成员隐藏 **404**，`200 accepted_in_memory` 只到本进程；未来 S3 `/v2` 存库提案仍为 6 B，R9 6→9 B 待审。图上最低代价不改变这些合同。[09.02 当前合同](../../../src/docs/platform_engineering/curriculum/09_backend_security/02_http_api_contract.md)

## 一、给边加权之前先定“代价”与问题范围

02.08 在无权图中用 BFS 找**最少边数**：每走一条边都按 1 计。现在给一条有向边 `X→Y` 附一个数字 `w(X,Y)`，表示本章纸上定义的**代价**。一条路径的代价是其边权相加；例如 `A→B` 权 2、`B→C` 权 1，路径代价是 3，而跳数是 2。必须说明单位和可加性：若一个数字是排队时间，另一个是费用，直接相加没有意义；真实链路延迟也会随负载变化，纸上固定权重不保证线上稳定。[Princeton Algorithms：Shortest Paths](https://algs4.cs.princeton.edu/44sp/) · [02.01 成本单位](../../../src/docs/platform_engineering/curriculum/02_algorithms/01_discrete_cost.md)

本章从源点 `A` 到目标 `E` 找**总权重最小的有向路径**，所有第一张图的边权为非负整数。图中 `F` 是孤立顶点，用来检查不可达。假设每条边只代表虚构的“处理步骤代价”，不代表消息已持久化、已送达或用户有权读取。

| 有向边 | 纸上代价 |
|---|---:|
| `A→B` | 2 |
| `A→C` | 5 |
| `B→C` | 1 |
| `B→D` | 4 |
| `C→D` | 1 |
| `C→E` | 7 |
| `D→E` | 3 |

最少跳数的 `A→C→E` 只有 **2 跳**，代价却是 `5+7=12`；`A→B→C→D→E` 有 **4 跳**，代价 `2+1+1+3=7`。BFS 能回答前者的跳数目标，不能据此认定前者最低代价。若所有边权**相同且非负**，最少边数才与最低总权重一致；一般非负权要换算法。[02.08 BFS 的保证](../../../src/docs/platform_engineering/curriculum/02_algorithms/08_graph_dependency_traversal.md)

## 二、从松弛开始：暂定距离不是已经证明的最短距离

为每个顶点记 `dist[v]`，表示**目前找到的**从 A 到 v 的最小路径代价；初始化 `dist[A]=0`，其余为“∞/未发现”，并保存 `parent[v]` 以便还原路径。若已知到 u 的暂定代价，加上一条 `u→v` 的权 `w`，得到候选 `dist[u]+w`；更小就更新 v 与父节点。这一步叫**松弛（relaxation）**。松弛发现更好路线，不代表 v 已经定型。[Princeton：松弛与最短路径](https://algs4.cs.princeton.edu/44sp/)

从 A 出发，先松弛得到 `B=2`、`C=5`；再从 B 可把 C 改成 `2+1=3`，把 D 设成 `2+4=6`。如果在第一次看见 C 的 5 时就标“最终最短”，会漏掉经 B 的 3。与 02.08 BFS 的“入队即定距离”不同，这里暂定值可能多次下降。[02.08 BFS 层次](../../../src/docs/platform_engineering/curriculum/02_algorithms/08_graph_dependency_traversal.md)

Go 纸上表示可写 `type Edge struct { To string; Cost int64 }` 与 `map[string][]Edge`；`map[string]int64` 查不到键时给 0，所以**不能把 0 当“未发现”**，要用 `value, ok`、单独布尔状态或经检查的无穷哨兵。若用 `MaxInt64` 当哨兵，做 `dist[u]+Cost` 前还须避免溢出；负权、非法顶点和单位也要先校验。课程只读这个数据模型，未实现或运行求解器。

## 三、非负权下的 Dijkstra：每次取最小暂定点

**Dijkstra 算法**从未定型顶点中取 `dist` 最小的 u，认定它的最短代价已确定，再松弛 u 的出边。可用 02.07 的最小堆/优先队列高效取候选。**关键前提是所有可用边权非负**：在 u 以最小暂定代价被取出时，任何绕过尚未定型顶点再回到 u 的路径都不能靠后续非负边降低它。若有负边，这个“取出即定型”论证失效。[Princeton：Dijkstra 非负权](https://algs4.cs.princeton.edu/44sp/) · [02.07 堆](../../../src/docs/platform_engineering/curriculum/02_algorithms/07_heap_priority_scheduling.md)

按本章邻接表顺序，纸上状态表为：

| 定型顶点 | 本轮有效松弛 | 定型后主要暂定值 `B/C/D/E` |
|---|---|---|
| `A(0)` | `B=2`，`C=5` | `2 / 5 / ∞ / ∞` |
| `B(2)` | `C=min(5,3)=3`，`D=6` | `2 / 3 / 6 / ∞` |
| `C(3)` | `D=min(6,4)=4`，`E=10` | `2 / 3 / 4 / 10` |
| `D(4)` | `E=min(10,7)=7` | `2 / 3 / 4 / 7` |
| `E(7)` | 无 | `2 / 3 / 4 / 7` |

`parent[B]=A, parent[C]=B, parent[D]=C, parent[E]=D`，反向追溯得到 `A→B→C→D→E`、总代价 7。`F` 从未发现，不能返回“距离 0”或虚构一条路径。若存在等价代价路线，要固定邻居和并列规则才能保证纸上**选中的路径**可复现；最小代价的数值不依赖该并列顺序。[Princeton：最短路径树](https://algs4.cs.princeton.edu/44sp/)

最小堆里可能同时留下旧条目 `C(5)` 和新条目 `C(3)`。若采用**允许重复入堆**的简单实现，弹出旧条目时先检查它是否等于当前 `dist[C]` 且未定型，不符合就跳过；否则旧值可污染结果。边权非负时，可在目标 E **被取出并定型**时提前结束，不能在 E 第一次被入堆时停止，因为 E 起初可能是 10，后来降到 7。[Go 标准库：container/heap](https://pkg.go.dev/container/heap)

## 四、证明、成本与反例：非负权不是可省的小字

定型最小 u 时，假设还有一条更短的 A 到 u 路径。沿那条路径找**第一个未定型顶点 x**，它前面的顶点 y 已定型；当 y 定型时会松弛 y→x，因此 `dist[x]` 至多是真实路径走到 x 的代价。后面所有边非负，整条到 u 的代价不会小于走到 x 的代价；若整条路径比 `dist[u]` 更小，就会出现某个未定型点的暂定值比 u 更小，与“取最小 u”矛盾。这是 Dijkstra 正确性核心的纸上直觉，需依赖非负、有效加法与全部边被处理。[Princeton：Dijkstra](https://algs4.cs.princeton.edu/44sp/) · [MIT 6.006 最短路径课程](https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-spring-2020/)

**负权反例**另造小图：`S→A` 权 2、`S→B` 权 5、`B→A` 权 **−4**。标准“顶点出堆后只定型一次”做法先定型 A=2，再定型 B=5；但真正经 B 到 A 的代价 `5−4=1`，更小。不能在原图里偷偷加 −4 后仍套上一节的定型证明。负权不等于负环：本反例没有环，却已足以使定型一次版本失败。某些允许反复重新处理顶点的实现可能在特定负权无负环图上算对，但不保留这里的 Dijkstra 非负权复杂度保证。[Princeton：Dijkstra 与负权讨论](https://algs4.cs.princeton.edu/44sp/)

若允许负边且**从源点可达的相关区域没有负权环**，可学 Bellman–Ford：多轮松弛所有边，最坏 `O(VE)`，还能检测源点可达的负权环；若沿可到达目标的路径可反复绕负环，路径代价可持续降低，有限最短解不存在。若图是有向无环图，按拓扑顺序松弛还能处理负边；不要只记算法名称，先核图的前提。这里的 V 是顶点数、E 是边数。[Princeton：Bellman–Ford 与 DAG](https://algs4.cs.princeton.edu/44sp/) · [02.08 拓扑顺序](../../../src/docs/platform_engineering/curriculum/02_algorithms/08_graph_dependency_traversal.md)

邻接表加二叉堆的非负权实现通常随 `V+E` 和堆操作的对数成本增长；若用重复入堆，堆可保留到 `O(E+1)` 条候选，纸上宽松上界可写 `O((V+E)log(V+E+1))`，还需邻接表 `O(V+E)` 空间。不要把这个渐进上界当网络实测延迟；权重测量、输入验证和堆常数仍影响真实选择。[Princeton：算法复杂度](https://algs4.cs.princeton.edu/44sp/) · [02.01 成本模型](../../../src/docs/platform_engineering/curriculum/02_algorithms/01_discrete_cost.md)

## 五、从顶点扩成状态：带约束的路径不是普通 visited 集

有些虚构 IM 路径题还规定“**最多使用一次受限 broker 转发边**”。到达同一个顶点 D 时，若一条路径已经用掉这次额度，另一条还没用，后续可走的边不同；只用 `visited[D]` 把第二种状态删掉会漏合法路线。应把搜索节点扩成 `(vertex, usedBroker)`，其中 `usedBroker` 为 `false/true`，转移时更新它并拒绝超额度。每个原顶点最多变成两个状态；**具体允许路径由业务约束定义**，不是图算法替产品决定。[02.08 visited 与图建模](../../../src/docs/platform_engineering/curriculum/02_algorithms/08_graph_dependency_traversal.md)

```text
(A,false) --经过普通边--> (B,false)
(B,false) --经过受限边--> (C,true)
(C,true)  --再遇受限边--> 不允许
```

若扩展状态的边权仍非负，可在扩展图上用 Dijkstra；若全部权重相同可用 BFS。父节点也要存**完整状态**才能重建符合约束的路径。若某个 `(D,false)` 的代价比 `(D,true)` 高，能否剪掉其中一个要先证明**剩余额度、未来可用动作和成本**的支配关系，不能只因顶点同名就删。[02.08 visited 与状态](../../../src/docs/platform_engineering/curriculum/02_algorithms/08_graph_dependency_traversal.md)

## 六、算法输出必须经过业务边界复核

纸图中的代价只是为了练“最小总权重”。实际 IM 投递会受节点健康、队列、权限、地域、容量、重试和确认语义约束；这些条件可能随时间改变、未必可加。即使纸上路径代价 7，也不证明 `c-a` 的 B 设备在线或收到 m-9。当前 S2 的 `200 accepted_in_memory` 只到本进程，未来 S3 存库仍为提议；不能用最短路图把“内存受理”跳写成“已送达”。[09.02 确认点](../../../src/docs/platform_engineering/curriculum/09_backend_security/02_http_api_contract.md) · [11.01 业务测量](../../../src/docs/platform_engineering/curriculum/11_reliability/01_business_measurement.md)

业务应用先过滤无权、不健康或不符合合同的边，再在**同一版本快照**上算可用路径；不能先用无权边算出最低值，再用一句“请忽略无权结果”交付。输入校验包括顶点/边身份、方向、权重单位、负值/溢出、并列规则与不可达响应。路线变更后旧 `dist/parent` 可能失效，须明确何时重算；本章没有线上拓扑或实测成本。[13.05 容量与数据设计](../../../src/docs/platform_engineering/curriculum/13_architecture/05_capacity_data_design.md)

算法选型卡应说明：目标到底是**最少跳数、最小静态代价、满足约束的最小代价**还是其它业务指标；输入图是否有向、是否非负、有无环、规模 V/E、更新频率和结果可复现要求。不同目标对应不同保证，不可把“找到一条路径”当“找到最低代价且可交付”。

## 七、按失败层审一张路径报告

纸上报告可列 `A→E` 路径、总代价、权重版本、不可达集合、前置过滤、算法前提、父节点和松弛表；让同学能复算。若答案错，先找第一个失败层：建图漏边、权重单位混用、负权误用 Dijkstra、旧堆条目未跳、提前在入堆停止、不可达当 0，或把图算法结果误解释成业务送达。[02.03 循环不变量](../../../src/docs/platform_engineering/curriculum/02_algorithms/03_search_invariants.md)

| 纸上症状 | 先查 | 正确边界 |
|---|---|---|
| 输出 A→C→E 为“最短” | 问的是跳数还是代价 | 2 跳但代价 12，不是最低代价 |
| 输出 A→B→C→D→E | 权重/parent/松弛 | 4 跳、代价 7，为本图最低 |
| 输出 F 距离 0 | 未发现的表示 | F 不可达，不得伪造 0 |
| 负权图仍一次定型 | 非负前提 | 要改问题/算法并查负环 |
| 已出结果却无权投递 | 授权/确认点 | 图解不是 IM 业务受理或送达 |

按 02.01 的“输入规模 + 操作次数 + 正确性”方法，学习者可先手算小图，再在自身实现中验证空图、孤立点、同代价、权重零、负权拒绝与溢出；课程没有运行这些实现。[02.01 成本模型](../../../src/docs/platform_engineering/curriculum/02_algorithms/01_discrete_cost.md)

## 八、22 道分层练习：从路径相加到负权与状态

1–8 练单位/路径，9–16 推演松弛与算法前提，17–22 审业务与复杂状态。答案均基于本章虚构图。

### 基础 1–8：权重、路径与可达

<details><summary>1. 一条路径的总代价怎样算？</summary>

在已约定同一可加单位下，将路径上每条边的权重相加。</details>

<details><summary>2. A→C→E 有几跳、代价多少？</summary>

2 跳，`5+7=12`。</details>

<details><summary>3. A→B→C→D→E 有几跳、代价多少？</summary>

4 跳，`2+1+1+3=7`。</details>

<details><summary>4. BFS 的最少边数能自动给最低代价吗？</summary>

不能；只有所有可用边同权等特殊前提才相合。</details>

<details><summary>5. `dist[A]` 初始为多少，F 初始为何不能当 0？</summary>

A 为 0；F 未发现应是 ∞/缺失，不是代价 0。</details>

<details><summary>6. 松弛边 u→v 做什么？</summary>

若 `dist[u]+w(u,v)` 更小，就更新 v 暂定代价和 parent。</details>

<details><summary>7. 纸图的 F 从 A 可达吗？</summary>

不可达；无边连接，不能构造 A 到 F 路径。</details>

<details><summary>8. 代价 2 ms 与 3 元可直接相加吗？</summary>

不能；单位和优化目标必须先一致或明确定义换算。</details>

### 推演 9–16：堆与非负前提

<details><summary>9. 从 B 松弛后 C 的暂定代价由 5 降到多少？</summary>

`2+1=3`。</details>

<details><summary>10. 从 C 松弛后 D 的暂定代价由 6 降到多少？</summary>

`3+1=4`。</details>

<details><summary>11. E 第一次入堆为 10，可马上停止吗？</summary>

不可；经 D 后降为 7，应在 E 被有效取出并定型时停。</details>

<details><summary>12. 堆中旧 C(5) 与新 C(3) 共存，旧条目怎么办？</summary>

弹出时核当前 dist/定型状态，旧 C(5) 跳过。</details>

<details><summary>13. Dijkstra 定型一次版本为何要非负权？</summary>

后续路径不能靠负边把已取出的最小暂定代价再降低。</details>

<details><summary>14. S→A=2、S→B=5、B→A=−4 的真正 A 代价多少？</summary>

经 B 为 `5−4=1`，比直接 2 小；一次定型 A=2 会错。</details>

<details><summary>15. 负边就必有负环吗？</summary>

不必；上一题只有一条负边、无环。</details>

<details><summary>16. 可达负环能使沿它到目标的路径怎样？</summary>

反复绕行可继续降低总代价，相关目标可能没有有限最短代价。</details>

### 决策 17–22：状态、业务和证明

<details><summary>17. 已用 broker 额度与未用额度到同一 D，可合并 visited[D] 吗？</summary>

不可直接合并；后续可行动作不同，应区分 `(D,true/false)`。</details>

<details><summary>18. 扩展状态图仍为非负权，可用什么算法？</summary>

可在完整状态上用 Dijkstra；若全边同权可用 BFS。</details>

<details><summary>19. parent 只存顶点名能重建额度合法路径吗？</summary>

不一定；应存完整状态与转移。</details>

<details><summary>20. `map[string]int64` 缺键返回 0，可当未发现吗？</summary>

不可；要看 `ok` 或用可靠的单独状态/哨兵，并防溢出。</details>

<details><summary>21. 纸上最低代价 7 能证明 B 设备收到消息吗？</summary>

不能；S2 200 只到本进程内存受理，图成本不是确认点。</details>

<details><summary>22. 评审路径算法时至少核哪些前提？</summary>

目标和单位、图方向/版本、边权正负、可达性、溢出、并列规则、规模与业务授权。</details>

## 本章完成标准与后续路径

能在本章图上区分最少跳数与最低代价，逐行复算 Dijkstra 的松弛、定型和 parent，给出不可达 F 与负权反例，并说明带 broker 额度时必须扩展状态，才算完成本章。下一章 02.10 从“能拆成哪些子问题”进入动态规划和贪心，继续用有限 IM 预算解释算法条件。[第二卷路线](../../../src/docs/platform_engineering/curriculum/02_algorithms/README.md)
