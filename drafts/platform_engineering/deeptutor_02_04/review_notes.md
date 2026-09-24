# DeepTutor 02.04 生成与审阅记录

## 生成材料

- DeepTutor 书籍 `bk_08d9d3f134`、正文页 `pg_625daddc4d`；8 个正文块均 ready、失败块为 0，HTTP Markdown 导出已核对。
- `original.md` 保留生成器导览、重复论述和原始示例；`reviewed.md` 是统稿后的八节教材；`generation_request.json` 保存章节约束。
- 使用本地 BookEngine 与单进程 token 参数适配，未修改 DeepTutor 源码或持久配置。

## 技术与教学审阅

1. 固定消息身份为 `MessageKey{ConversationID, MessageID}`，延续 01.05 与 02.03 的会话内唯一教学规则。原稿后段自行加入 `SenderID` 或任务 ID 作为身份键，造成范围漂移，审阅稿删除这种不一致，并说明真实协议若有不同唯一性范围须另定。
2. 将键、哈希值、桶和完整键比较分开；玩具 `k%4` 的 1、5、9 冲突只说明候选位置相同，不会自动把不同消息判重。
3. 链式与开放寻址分别解释碰撞布局和删除边界；负载因子 `α=N/M` 在链式可大于 1，开放寻址需要保留空槽，不套用同一公式。
4. 平均或期望常数查找带均匀散列、受控负载、固定键成本的前提；极端碰撞与重哈希的最坏单次成本、可变长字符串的字节成本分别保留。Go 语言规范只提供 `map` 语义，不把本章玩具布局当成具体实现。
5. Go 集合使用可比较复合结构体键、`struct{}` 值与 comma-ok 成员判断；nil map 的可读不可写、`range` 次序未指定分别解释。
6. 原稿窗口示例先插再逐出且没有完整构造、容量验证或 nil map 处理。审阅稿改为 02.02 的环形次序结构配合集合：先判重，重复不刷新，满时删最旧键及集合成员，再加入新键；容量 3 的 A/B/C/A/D/A 状态表与代码逐步一致。
7. 区分 02.02 的“待处理发送队列满时拒绝”和本章“去重缓存窗口满时驱逐最旧”；两者内部都可用环形数组，但业务合同不同。
8. 窗口只覆盖本进程最近 N 个不同键；重启、跨节点、改变 ID 的重试、同键不同正文冲突和长期幂等均在范围外。本章不声称 OpenIM 实现何种去重策略或交付保证。

## 核对资料与验证范围

- [Algorithms, 4th Edition：哈希表](https://algs4.cs.princeton.edu/34hash/)、[Go map 规范](https://go.dev/ref/spec#Map_types)、[Go maps in action](https://go.dev/blog/maps)、[MIT 6.006 笔记](https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-spring-2020/pages/lecture-notes/)用于核对定义与教学覆盖。
- 本章仅进行文档结构、链接、来源哈希和静态状态推导检查；没有执行 Go、测试、站点构建或 OpenIM。
