---
title: 06.04 页与缓冲池：从会话历史行到缓存命中
icon: /assets/icons/article.svg
order: 5
date: 2026-09-24
---

[返回第六卷](./README.md) · [行与身份前置：06.01](./01_relational_identity.md) · [历史查询前置：06.02](./02_sql_queries.md) · [树前置：02.06](../02_algorithms/06_trees_ordered_index.md) · [系统内存前置：03.05](../03_systems/05_virtual_memory.md)

# 06.04 页与缓冲池：从会话历史行到缓存命中

> DeepTutor 初稿经技术与教学审阅后的静态课程。64 条消息、每页 4 条、P0–P15、容量 2 与 LRU 都是**纸上教学模型**；没有运行 SQL、数据库、Go、基准或站点。PostgreSQL、SQLite、MongoDB 文档只用于核对各自真实系统确有页/缓存机制；本章不声称 OpenIM 或任何引擎按玩具布局存 `c-a` 消息，也不把缓冲池未命中直接说成物理磁盘读取。

## 一、查询四条消息，为什么需要知道“页”？

06.01 已把 `c-a` 的消息写成行，06.02 用 `conversation_id` 和 `seq` 查询历史，02.06 则用树说明有序索引的定位。现在追问资源问题：查四行到底要触碰多少**数据库页**，其中哪些页已经在内存？一个业务消息是一条记录，数据库管理数据常按页组织；**消息、数据库页、操作系统虚拟内存页**是不同层次，名称相似不能画等号。

固定一个理想模型：`c-a` 有序号 **1..64** 的 64 条消息，每个**教学数据页**恰容纳连续 4 条，得到 `64/4=16` 页，命名 `P0..P15`。于是 `P0` 放 seq 1..4，`P1` 放 5..8，`P2` 放 9..12，直到 `P15` 放 61..64。闭区间 `[5,8]` 的四条在 P1；如果已经知道 P1 的位置，只需看这**一个玩具数据页**。真实行有不同长度、页头、索引、权限和可能的外置内容，不能凭“四行”保证真实查询只读一页。

| 第一遍 | 第二遍 | 交付物 |
|---|---|---|
| 页、槽、记录、页号、内存 frame、命中/未命中 | 替换、pin/dirty、OS 缓存、访问模式与计划证据 | 一张 16 页排布、一张 LRU 状态表、一份 IM 查询成本边界 |

本章先解决页和缓存。06.05 再讲 B+ 树、哈希和 LSM 如何**定位**数据，06.06 再用执行计划验证实际读取量，06.09 才深入 WAL、刷盘与崩溃恢复。

## 二、页内为什么有槽：记录位置与逻辑身份分开

一个数据库页可包含**页头、槽/项目标识目录、记录内容、空闲空间**。页头可保存管理信息；槽指向页内具体记录的位置，记录若因整理而在页内移动，外部引用可仍通过页号+槽号定位。PostgreSQL 官方页格式提供了这种思路：表/索引通常使用固定大小页（常见构建为 8 KiB），页头后有项目标识数组；一个 `ItemIdData` 含记录偏移等信息。SQLite 官方文件格式也按页组织 B-tree，页大小可配置。**它们的页头字节、槽格式与本章每页 4 条完全不是同一参数。**

```text
玩具数据页 P1
┌────────页头────────┐
│ 槽 0 → seq 5      │
│ 槽 1 → seq 6      │
│ 槽 2 → seq 7      │
│ 槽 3 → seq 8      │
│ 空闲空间与记录体   │
└────────────────────┘
```

这里 `seq` 是**会话内业务顺序键**，不是页号、槽号或 TCP 字节序号。记录大小若变化，可能不再是四条一页；一条大消息还可能需要别的页/外置内容。更新和删除也会产生页内空洞或版本信息。页号+槽号这种物理定位的入门模型帮助解释“记录在哪里”，不能替代 `message_id` 或 `(conversation_id,seq)` 的稳定业务身份。

03.05 的操作系统页用于地址转换；数据库页用于数据库文件和访问管理，二者可能有不同大小与生命周期。一次数据库页读取可能经操作系统缓存，也可能触及实际设备；不能从“页号 P1”直接算物理 RAM 页框号或磁盘扇区。

## 三、从历史查询走到 P1：先定位，再读取

按纸上排列，`[5,8]` 对应 `P1`。同样，教学历史查询 `WHERE conversation_id='c-a' AND seq<9 ORDER BY seq DESC LIMIT 4` 的结果为 **8、7、6、5**；若直接得到 P1，四条都在一个数据页。注意“若直接得到”是前提：没有索引时可能要检查多页才能找到它；有索引时也需读取**索引页**，还可能检查成员资格、查询计划、排序或其他行。我们只给**目标数据页**数，不冒充整个 SQL 的实际页数。

| 问题 | 纸上答案 | 尚未计入 |
|---|---|---|
| 64 条、每页 4 条 | 16 个数据页 | 页头、空洞、可变正文、外置页 |
| seq 5..8 在哪页 | P1 | 从索引/扫描怎样找到 P1 |
| `seq<9 DESC LIMIT4` 返回什么 | 8、7、6、5 | 权限、排序、索引页与真实计划 |

这也解释顺序访问与随机访问的不同直觉：按 seq 连续读一段，若相关记录在相邻页，可能从空间局部性获益；按独立 `message_id` 随机点查可能访问分散的数据/索引页。但真实数据库的页布局与查询计划须用引擎证据核对，不能把教学排序表直接当成 PostgreSQL、SQLite 或 OpenIM/MongoDB 的物理存储事实。

## 四、缓冲池：数据库页号在内存 frame 里暂住

**缓冲池**把某个数据库页装入内存中的一个**frame**。查找时先看“这个页 ID 当前对应哪块 frame”：若已在池中，是**缓冲命中**；若不在，是**未命中**，要取得空 frame 或选择一个可替换页，再把需要的页带入。页 ID 应至少能区分属于哪个关系/文件及其块号，不能把两个表各自的第 1 页当成同一对象。frame 是一块可复用的内存槽，不等于业务消息 ID，也不等于 OS 物理页框号。

数据库还须记录**pin（正在使用，不可被随意替换）**与**dirty（内存中的页已改动，尚未按协议写回对应位置）**。读者取页时 pin，完成访问后 unpin；若修改了页，再标 dirty。它们是数据库缓冲管理状态，不是 Go 指针固定、`mlock` 或“已提交事务”的同义词。CMU 数据库课程的缓冲池项目用 pin count、dirty 和 page-id→frame 映射帮助建立这个机制直觉。

PostgreSQL 有 `shared_buffers` 缓冲层；SQLite 的 B-tree 模块通过 pager/page cache 与文件页交互；MongoDB 官方说明 WiredTiger 同时使用内部缓存与操作系统文件系统缓存。**三者真实缓存结构和替换策略不同**：本章下面的 LRU 只为手算，不表示 PostgreSQL 或 WiredTiger 就采用这一精确算法。

## 五、容量 2 的 LRU：五次访问是四次未命中、一次命中

缓冲池只有 **2 个 frame**，初始为空；用**最近最少使用（LRU）**玩具规则，从左到右写“旧→新”的页。访问序列固定为 `P0,P1,P0,P2,P1`，所有页在此小题中都是干净、可替换的：

| 访问 | 命中？ | 进入/逐出 | 池内旧→新 | 累计命中/未命中 |
|---|---|---|---|---|
| P0 | miss | 放入空 frame | `[P0]` | 0 / 1 |
| P1 | miss | 放入第二空 frame | `[P0,P1]` | 0 / 2 |
| P0 | hit | 更新最近使用位置 | `[P1,P0]` | 1 / 2 |
| P2 | miss | 逐出最旧 P1，放 P2 | `[P0,P2]` | 1 / 3 |
| P1 | miss | 逐出最旧 P0，放 P1 | `[P2,P1]` | **1 / 4** |

所以共有 **1 次缓冲命中、4 次未命中、2 次逐出**。如果容量扩到 3、仍从空开始，相同序列在第三个不同页 P2 到来时无须逐出，末次 P1 也能命中：会变成 2 次命中、3 次未命中、0 次逐出。但这只比较**玩具池**容量，不是要求真实数据库随意调大缓存；索引页、其他会话、写入、系统缓存和并发都未进入模型。

重要边界：**缓冲池 miss 不是物理磁盘读次数。** 数据库向文件请求未在内部池里的页时，操作系统文件页缓存可能已经有相应内容；反之内部池 hit 可避免再向文件层取页。实际设备 I/O 还受预读、并发、写回和存储实现影响。不要把表里的 4 miss 直接写成“硬盘读 4 次”。

## 六、pin 和 dirty：正在读的页不可随意丢，改过的页不等于已提交

再把 LRU 小题改成一个边界反例：容量 2 的两个 frame 正放 P0、P1，且**都被正在使用的任务 pin 住**；此时新请求要 P2。即使按 LRU P0 更旧，缓冲管理器也不能把读者正使用的 frame 内容直接覆盖。它可能等待某页 unpin、从别处取得可用空间或报告资源条件，具体由实现决定；“最旧页”不是无条件受害者。

写入另有 dirty 规则：若修改 P0 的某条消息状态，内存中的 P0 与对应持久位置暂时不同，P0 被标为 dirty。驱逐 dirty 页前可能需要写回，而有 WAL 的数据库还必须遵守相应日志/数据写回顺序；06.09 才系统讲。**dirty 写回不等于业务事务已提交，提交也不要求每次先把对应数据页直接写到最终文件位置**；06.07 的事务边界不能用缓冲页状态代替。也不能从“缓存写入成功”推断接收设备已经收到 IM 消息。

| 页状态 | 缓冲池要保护什么 | 不可推断 |
|---|---|---|
| pinned | 当前使用者读写的 frame 不被任意替换 | 事务已提交或会话已授权 |
| dirty | 内存页与对应持久位置有未完成写回的差异 | 已经耐久或设备已确认 |
| clean、unpinned | 可作为某些替换策略的候选 | 一定马上被逐出 |

## 七、把页成本放回 IM 查询，并认清引擎观测范围

历史顺序翻页通常希望把同会话相邻 seq 的读取成本压低，但查询是否从一个页还是很多页返回，取决于索引、行宽、更新历史、过滤和缓存。若工作集大于可用缓冲，热点页会竞争 frame；若大群写入使 dirty 页与读历史页竞争，读写都可能受影响。解决方向须先确认真实访问模式与计划，不能只根据“数据总共有 16 页”盲调缓存。

PostgreSQL 的 `EXPLAIN (ANALYZE, BUFFERS)` 可显示 shared block 的 hit/read/dirtied/written 等**数据库缓冲访问**证据；节点计数还涉及子节点与重复访问，不能读成“独立物理磁盘扇区数”。`shared read` 表示 PostgreSQL 需要从其 shared buffers 之外取得块，仍可能由 OS 文件系统缓存满足；若要确认设备负载，应与设备/系统 I/O 时间线对照。`EXPLAIN ANALYZE` 本身会执行查询并有测量开销，本章没有运行它；06.06 才深入估计行数、算子与实际计划。

MongoDB 的 WiredTiger 内部缓存和文件系统缓存也有不同表示与统计口径；不能把 PostgreSQL 的 `shared_buffers` 指标名、SQLite 的页格式或本章 `P1` 直接贴到 MongoDB。固定 OpenIM 参考项目的实际 MongoDB 使用、索引和确认路径，只有在查看其固定版本的对应源码与部署配置后才能下结论；本章没有核对上游页面布局。

## 八、交付页图、LRU 状态与分层练习

学习者交付：画出 P0–P15 的 64 条消息分布；解释 `[5,8]` 与 `seq<9 DESC LIMIT4` 的目标数据页；复算五次 LRU 访问；另画“两 frame 均 pinned 时 P2 到来”和“P0 dirty 但事务状态未知”的反例。每个结果应注明只在固定玩具假设下成立，不是实际数据库计划或 I/O 测量。

### 分层练习：先答，再展开反馈

<details><summary>1. 一条 IM 消息等于一个数据库页吗？</summary>

不等于。记录和数据库页是不同层次，一个页可存多条记录。</details>

<details><summary>2. 数据库页与 OS 虚拟内存页必定同大小吗？</summary>

不必定，它们分别服务存储访问与地址映射。</details>

<details><summary>3. 64 条、每玩具页 4 条，共多少数据页？</summary>

16 页，即 P0..P15。</details>

<details><summary>4. P0、P1、P2 各放哪段 seq？</summary>

分别是 1..4、5..8、9..12。</details>

<details><summary>5. `[5,8]` 的四条位于哪页？</summary>

P1，这是理想连续排列的玩具数据页。</details>

<details><summary>6. `seq<9 DESC LIMIT4` 返回哪些序号？</summary>

8、7、6、5。</details>

<details><summary>7. “结果都在 P1”证明整个 SQL 只访问一页吗？</summary>

不能。定位、索引、权限和计划可能访问更多页。</details>

<details><summary>8. 页内槽的作用是什么？</summary>

保存页内记录的定位入口，便于管理记录与空闲空间。</details>

<details><summary>9. PostgreSQL 常见页为 8 KiB，就表示每页正好 4 消息吗？</summary>

不表示。真实页头、行宽和外置内容等决定容量。</details>

<details><summary>10. 缓冲池 frame 等于 OS 物理页框吗？</summary>

不是。frame 是数据库缓存中容纳数据库页的内存槽。</details>

<details><summary>11. 缓冲 hit 说明什么？</summary>

需要的数据库页已在内部缓冲池中，可复用该 frame。</details>

<details><summary>12. 玩具访问 P0,P1,P0,P2,P1 共几次 hit？</summary>

1 次，即第三次访问 P0。</details>

<details><summary>13. 同序列共几次 miss、几次 eviction？</summary>

4 次 miss、2 次逐出：先 P1，后 P0。</details>

<details><summary>14. 第四次访问 P2 前谁是 LRU？</summary>

P1；第三次 P0 命中让 P0 成为较新页。</details>

<details><summary>15. 容量改为 3，同序列从空开始的 hit/miss 是多少？</summary>

2 hit、3 miss，且无需逐出。</details>

<details><summary>16. 4 次 buffer miss 必定是 4 次物理磁盘读吗？</summary>

不必；操作系统页缓存或其他存储层可满足读取。</details>

<details><summary>17. P0 与 P1 都 pinned，能直接逐出 P0 装 P2 吗？</summary>

不能按本章模型覆盖正在被使用的页；需等待/别的资源策略。</details>

<details><summary>18. dirty 页表示什么？</summary>

内存页已有修改，尚未按协议写回对应持久位置。</details>

<details><summary>19. dirty 页写回等于事务提交了吗？</summary>

不等于。提交、WAL 与页写回的顺序另有保证。</details>

<details><summary>20. `EXPLAIN BUFFERS shared read` 可直接当物理盘读次数吗？</summary>

不能。它是 PostgreSQL 缓冲层指标，OS 缓存和重复访问另计。</details>

<details><summary>21. 可把本章 LRU 表当 PostgreSQL 或 WiredTiger 替换算法吗？</summary>

不能。它只建立容量与访问序列的机制直觉。</details>

<details><summary>22. 本章已核对 OpenIM 的实际消息页布局吗？</summary>

没有。上游存储实现与配置需独立源码/运行证据。</details>

## 来源与下一步

- [PostgreSQL 页布局](https://www.postgresql.org/docs/current/storage-page-layout.html)、[`shared_buffers`](https://www.postgresql.org/docs/current/runtime-config-resource.html)与[`EXPLAIN BUFFERS`](https://www.postgresql.org/docs/current/using-explain.html)：页、项目标识和缓冲观测口径。
- [SQLite 架构](https://www.sqlite.org/arch.html)与[文件页格式](https://www.sqlite.org/fileformat.html)：pager/page cache 与页大小在具体引擎中的角色。
- [CMU 15-445 缓冲池项目](https://15445.courses.cs.cmu.edu/fall2024/project1/)与[MongoDB WiredTiger 文档](https://www.mongodb.com/docs/manual/core/wiredtiger/)：pin/dirty 教学机制与另一种缓存层次；本章玩具 LRU 不是这些系统的实现声明。

按[学习路线](../learning_path.md)，下一章[06.05 索引结构](./05_index_structures.md)说明 B+ 树、哈希与 LSM 怎样定位页，并进一步比较复合键、范围查询和写入代价。离开本章前，应能说清**目标消息在哪个教学数据页、缓冲里是否有它、谁正在使用它、它是否被改过，以及还有哪些实际 I/O/提交证据未取得**。
