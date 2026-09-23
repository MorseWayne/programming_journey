---
title: Go 系统课程：从零起步到高级工程实践
icon: /assets/icons/server.svg
article: false
index: false
order: 11
date: 2026-09-23
---

这是一套面向 Go 技术栈初学者的长期系统课程。先学会读写并解释程序，再建立算法、计算机系统、网络、数据库和并发基础，逐步训练完整功能交付、故障分析、性能判断、平台演进和架构决策。

课程以 OpenIM 为公开项目参照，围绕虚构 IM 的消息、会话、连接、群组、多端同步和故障恢复组织理论与实践。所有组织、身份、消息和业务规则均为教学设定。

## 先看哪里

- 了解主项目：[OpenIM 选型、固定版本与源码阅读地图](./curriculum/im_reference.md)。

- 从详细章稿起步：[01.01 程序、源代码与一次运行](./curriculum/01_go/01_program_toolchain.md)，接着学习 [01.02 类型与数据表示](./curriculum/01_go/02_types_data.md)与 [01.03 IM 控制流与函数](./curriculum/01_go/03_control_functions.md)。
- 阅读较短的入门衔接课：[A01 文件、终端与第一段程序](./beginner/01_first_program.md)。
- 了解完整系列：[14 卷总纲与学习路线](./curriculum/README.md)。
- 决定下一步学什么：[阶段、先修与实践顺序](./curriculum/learning_path.md)。
- 查看经典书籍如何融合：[调研依据与知识覆盖](./curriculum/source_review.md)。
- 判断当前有哪些正文：[编写状态与能力验收](./curriculum/assessment.md)。

当前已有 **9 章独立长篇正文、35 课入门与衔接正文、14 篇分卷专题讲义**，以及 **14 卷共 168 个章节单元的教学设计**。168 个单元均已列出具体 IM 练习与验收目标；正文完成 01.01–01.05、02.01、03.01、10.01、10.03；本批新增对象与指针、数学成本、数据与存储层次三章。前两章和部分旧短课、core 的原案例继续作为基础补充，其余长篇按先修关系展开。

## 每个领域都独立展开

| 卷 | 课程领域与分章设计 | 当前可读正文 |
|---|---|---|
| 01 | [Go 语言、标准库与程序设计](./curriculum/01_go/README.md) | [01.01](./curriculum/01_go/01_program_toolchain.md) · [01.02](./curriculum/01_go/02_types_data.md) · [01.03](./curriculum/01_go/03_control_functions.md) · [01.04](./curriculum/01_go/04_collections_text.md) · [01.05](./curriculum/01_go/05_maps_structs_pointers.md) · [专题讲义](./curriculum/01_go/core.md) |
| 02 | [数学基础、数据结构与问题求解](./curriculum/02_algorithms/README.md) | [02.01 数学与成本](./curriculum/02_algorithms/01_discrete_cost.md) · [专题讲义](./curriculum/02_algorithms/core.md) |
| 03 | [计算机系统、操作系统与 Linux](./curriculum/03_systems/README.md) | [03.01 数据与存储](./curriculum/03_systems/01_data_instructions_storage.md) · [专题讲义](./curriculum/03_systems/core.md) |
| 04 | [网络协议与网络编程](./curriculum/04_networks/README.md) | [专题讲义](./curriculum/04_networks/core.md) |
| 05 | [Go 并发、运行时与内存管理](./curriculum/05_runtime/README.md) | [专题讲义](./curriculum/05_runtime/core.md) |
| 06 | [数据库、消息存储与查询执行](./curriculum/06_databases/README.md) | [专题讲义](./curriculum/06_databases/core.md) |
| 07 | [缓存、消息队列与数据流](./curriculum/07_cache_messaging/README.md) | [专题讲义](./curriculum/07_cache_messaging/core.md) |
| 08 | [分布式系统、一致性与故障恢复](./curriculum/08_distributed/README.md) | [专题讲义](./curriculum/08_distributed/core.md) |
| 09 | [Go 后端应用、API 与应用安全](./curriculum/09_backend_security/README.md) | [专题讲义](./curriculum/09_backend_security/core.md) |
| 10 | [测试、Git、代码质量与团队交付](./curriculum/10_engineering/README.md) | [10.01 需求](./curriculum/10_engineering/01_verifiable_requirements.md) · [10.03 Git](./curriculum/10_engineering/03_git_state.md) · [专题讲义](./curriculum/10_engineering/core.md) |
| 11 | [性能工程、可观测性与可靠性](./curriculum/11_reliability/README.md) | [专题讲义](./curriculum/11_reliability/core.md) |
| 12 | [容器、Kubernetes 与平台运行](./curriculum/12_platform/README.md) | [专题讲义](./curriculum/12_platform/core.md) |
| 13 | [软件设计、架构决策与高级工程实践](./curriculum/13_architecture/README.md) | [专题讲义](./curriculum/13_architecture/core.md) |
| 14 | [AI 基础、检索、Agent 与应用评测](./curriculum/14_ai/README.md) | [专题讲义](./curriculum/14_ai/core.md) |

每卷分起步、原理、工程和进阶四层。各章明确需要讲清的机制、先修与实践成果；复杂章可以继续拆成多课，避免一次堆入太多新概念。

## 初学者怎样进入这个系列

入门课号 A/B/C/D 用于定位现有讲解，它们是完整系列的基础与桥接材料：

| 入口 | 作用 |
|---|---|
| [A01–A10：Go 入门](./beginner/README.md) | 文件、变量、函数、集合、指针、接口、错误、包、测试与 JSON |
| [B01–B07：后端基础](./backend_basics/README.md) | 进程、网络、HTTP、环境、SQL、goroutine 与取消 |
| [C01–C12：系统机制衔接](./stages/01_foundations.md) | 状态、性能、事务、消息、归属、观测、发布与契约 |
| [D05–D06：方案与综合实践](./stages/07_capstone.md) | 需求、取舍、迁移与工程答辩 |
| [D01–D04：AI 方向扩展](./stages/06_ai.md) | Python、检索、工具与评测 |

按[分阶段学习路线](./curriculum/learning_path.md)跨卷推进：S0–S7 构成 Go 后端主线，AI 按方向选学。路线明确当前可读材料、尚缺章稿、每次新增的业务问题和阶段验收；无需先通读全部衔接课或整卷讲义。

## 理论与实践怎样连接

```text
消息校验 → 本地会话与历史 → HTTP 查询与 WebSocket 单聊
→ 身份、群成员权限与持久消息 → 群聊、慢客户端与性能诊断
→ 消息可靠性、离线补拉与多端同步 → 扩容发布与故障恢复 → IM 架构答辩

方向扩展：模型与数据基础 → 评测基线 → 资料助手 → 受控工具
```

每次增加机制前，先指出旧方案在哪个新条件下失效。实践包含正常路径、失败变式、恢复和方案取舍，保留能够由他人复核的证据。

## 配套阅读

- [学习方法](./study_guide.md)与[虚构业务地图](./business_map.md)
- [概念与先修索引](./concept_map.md)
- [实践环境](./environment.md)与[个人学习记录](./progress.md)
- [资料导航](./references.md)、[教学设计](./teaching_research.md)与[验证范围](./verification.md)

高级工程能力通过多次交付、评审、故障处理和约束变化来检验。课程提供知识与练习结构，学习记录说明自己在哪些条件下完成了验证。
