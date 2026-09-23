---
title: 经典书籍与教程调研：知识覆盖如何进入课程
icon: /assets/icons/article.svg
order: -4
date: 2026-09-22
---

## 调研范围

课程主案例已改为 IM，工程参照见 [OpenIM 项目选择与固定源码](./im_reference.md)。经典资料继续补足语言、数学、系统和工程理论；每章将 IM 需求、小模型与实际源码连接起来。

本轮核对作者网站、出版社公开目录、大学课程安排和官方项目资料。下表区分目录、公开说明与课程结构；没有将目录调研表述为已经逐页读完全部付费正文。

教材据此检查遗漏领域和先修顺序，再用原创虚构案例组织讲解与练习。原书的具体例题、图示与完整段落不搬运进仓库。

## 已核对的主要材料

| 材料与核对入口 | 观察到的覆盖或组织特点 | 融合到本课程的位置与调整 |
|---|---|---|
| [The Go Programming Language](https://www.gopl.io/)，作者公开目录 | 从类型、函数、方法与接口进入并发、工具、测试及底层主题 | 01、05 卷；保留初学起点，补模块、泛型与现代工具资料 |
| [Learn Go with Tests](https://quii.gitbook.io/learn-go-with-tests/)，作者教程介绍 | 用小例子与测试逐步形成语言理解 | 01、10 卷；测试随概念出现，先教语法再进入复杂替身 |
| [Algorithms, 4th Edition](https://algs4.cs.princeton.edu/)，作者教材站 | 基本结构、查找排序与图等知识形成连续体系 | 02 卷；增加数学起步与 Go 表达，采用原创任务调度案例 |
| [MIT 6.006](https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-spring-2020/)，公开课程 | 用分析、算法设计与问题求解训练相互配合 | 02 卷；要求不变量、反例和规模证据 |
| [Operating Systems: Three Easy Pieces](https://pages.cs.wisc.edu/~remzi/OSTEP/)，作者章节目录 | 用资源虚拟化、并发和持久化组织系统知识 | 03 卷；增加 Go 程序与 Linux 观测之间的桥接 |
| [Computer Networking: A Top-Down Approach](https://gaia.cs.umass.edu/kurose_ross/online_lectures.htm)，作者课程 | 从应用逐层进入传输、网络与链路等机制 | 04 卷；以请求路径和失败分类衔接网络编程 |
| [CMU 15-445/645，Fall 2025](https://15445.courses.cs.cmu.edu/fall2025/schedule.html)，课程安排 | 从关系与 SQL 进入存储、索引、执行、并发与恢复 | 06 卷；先补 SQL 和系统基础，内部机制与应用访问结合 |
| [DDIA 第一版](https://www.oreilly.com/library/view/designing-data-intensive-applications/9781491903063/)，出版社目录 | 连通数据模型、复制分区、事务、故障及派生数据 | 06–08、13 卷；按先修拆开，避免让初学者直接背分布式结论 |
| [Let's Go](https://lets-go.alexedwards.net/)、[Let's Go Further](https://lets-go-further.alexedwards.net/)，作者公开内容与样章入口 | 通过完整应用逐步增加数据、协议、身份、测试与运行能力 | 09 卷；使用本课程原创业务，关注从函数到完整服务的连接 |
| [Pro Git 第二版](https://git-scm.com/book/en/v2)，官方全文目录 | 从版本状态与分支进入协作和更深入的历史操作 | 10 卷；先理解模型，再讨论评审、冲突和交付记录 |
| [Systems Performance 第二版](https://www.brendangregg.com/systems-performance-2nd-edition-book.html)，作者目录 | 先建立诊断方法，再进入系统资源与工具 | 03、11 卷；增加单位、统计、假设与对照的基础 |
| [Site Reliability Engineering](https://sre.google/sre-book/table-of-contents/)、[Workbook](https://sre.google/workbook/table-of-contents/)，官方目录 | 将目标、运行实践、故障响应与协作放在同一体系 | 11–13 卷；保留业务结果与可操作证据，采用小规模虚构练习 |
| [A Philosophy of Software Design](https://web.stanford.edu/~ouster/cgi-bin/aposd.php)，作者版本与公开节选说明 | 关注复杂度、重要性判断及模块接口的设计视角 | 10、13 卷；结合具体 API、变更与迁移讨论，避免机械套用规则 |
| [Hands-On Large Language Models](https://github.com/HandsOnLLM/Hands-On-Large-Language-Models)，作者目录 | 从表示与模型进入生成、检索和适应方法 | 14 卷；先补向量、概率、Python 与模型术语 |
| [AI Engineering](https://www.oreilly.com/library/view/ai-engineering/9781098166298/)，出版社目录 | 将模型、评测、数据、应用架构与优化连接起来 | 14 卷；以独立评测和后端执行保证组织工程实践 |

## 现代机制由官方资料补充

经典书的覆盖与当前 API 不必一致。例如 GOPL 的原版早于现代 Go 泛型；课程使用[泛型教程](https://go.dev/doc/tutorial/generics)、[内存模型](https://go.dev/ref/mem)和 [GC Guide](https://go.dev/doc/gc-guide)核对相关机制。

应用安全参考 [OWASP ASVS 官方项目](https://github.com/OWASP/ASVS)的要求组织思路；容器平台参考 [Kubernetes Concepts](https://kubernetes.io/docs/concepts/)；消息与数据库使用各产品文档确认具体配置和保证。参考标准不表示教材或示例已经获得任何认证。

资料版本会影响实现细节。课程保留机制与实验条件，新增版本特性须说明最低版本，不把某一本书的环境默认当成所有读者的环境。

## 对原有内容的具体修正

- Go 从语法速览扩大到值语义、方法集、接口、错误、标准库、模块、泛型与底层边界。
- 新增算法与系统两条完整主干，补齐后续索引、性能、内存和调度的先修。
- 网络从“会发 HTTP”扩展为协议层次、可靠传输、流控、连接、TLS 与排障。
- 数据库从 CRUD 与一次事务扩展为模式、执行、缓冲、并发和恢复。
- 缓存消息与分布式分别展开，避免把产品命令当成一致性理论。
- 应用、测试协作、可靠性、平台运行和架构分别设卷，连接功能交付与长期维护。
- AI 先补模型与数学基础，再讨论检索、工具、数据、评测和优化。

这些是课程设计决定。对应 14 卷的 168 个单元见[系列总纲](./README.md)，实际正文完成度见[编写与能力验收](./assessment.md)。
