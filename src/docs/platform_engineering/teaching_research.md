---
title: 教学设计与资料调研
icon: /assets/icons/article.svg
order: 91
date: 2026-09-23
---

## 本轮系列重构

新增[经典书籍与教程调研](./curriculum/source_review.md)，形成 [14 卷、168 个章节单元](./curriculum/README.md)的分章设计。35 课保留为入门与衔接正文，每卷新增一篇连接关键机制的专题讲义。

这是覆盖范围与教学深度的重新组织。分章设计、专题讲义与独立长篇章稿分别记录，当前尚未将 168 个单元全部编写成独立正文。后续章节应达到[编写深度要求](./curriculum/assessment.md)，而不能仅通过增加标题或术语扩充数量。

## 调研如何影响这套课程

本专题于 2026-09-22 调研下列原始资料，并阅读本站已经同步的 DeepTutor Go 章节，参考其概念解释与例子组织。当时的系列重构没有调用 DeepTutor 生成接口，也没有复制大学课程作业答案。

2026-09-23 开始用 DeepTutor BookEngine 生成独立长篇章稿，已将 [01.01](./curriculum/01_go/01_program_toolchain.md)与 [01.02](./curriculum/01_go/02_types_data.md)审阅后接入课程。原稿、修订稿、生成标识和来源哈希保存在仓库 drafts/platform_engineering。审阅包括前置补充、重复内容合并、技术纠错和练习深化；生成成功与教学效果、示例运行结果分别记录。

| 来源 | 参考的组织方式 | 本课程中的具体体现 |
|---|---|---|
| [DeepTutor Mastery Path](https://docs.deeptutor.info/explore/mastery-path/) | 分模块与知识类型组织，区分评估掌握与自行声明，安排复习 | 每课独立目标、证据式验收、进度与复习记录 |
| [DeepTutor Books](https://docs.deeptutor.info/explore/book/) | 内容按概念、练习、交互等不同形式组织 | 正文解释、折叠提示、排队交互实验 |
| [CMU Eberly 学习目标](https://www.cmu.edu/teaching/designteach/design/learningobjectives.html) | 学习目标、活动和评估相互对应 | 用解释、预测、实现、验证等可观察动作描述目标 |
| [The Carpentries：认知负荷](https://carpentries.github.io/instructor-training/05-memory.html) | 注意先修知识与一次引入的信息量 | 单进程先于数据库，数据库先于分布式，副作用先于 Agent |
| [The Carpentries：反馈](https://carpentries.github.io/instructor-training/06-feedback.html) | 用学习过程中的反馈调整教学 | 预测与实际差异、常见误区和独立变式 |
| [CMU 15-445 作业组织](https://15445.courses.cs.cmu.edu/fall2025/assignments.html) | 逐层构建系统能力，理论题与工程项目配合 | 数据定位、事务、恢复逐步增加难度 |
| [MIT 6.5840 课程结构](https://pdos.csail.mit.edu/6.824/general.html) | 阅读、案例讨论、编程实验和评估结合 | 故障时间线、可运行模型、设计答辩 |

这些课程和产品提供教学组织参考；本专题没有声称复制其全部深度或具有同样学习效果。使用独立的小型模型，使读者能在有限时间内看到一个机制的前提与失败边界。

## 学习路线的再次审阅

将原有五轮概述细化为[八个主线阶段与 AI 扩展](./curriculum/learning_path.md)，明确章节顺序、最早先修、阶段项目和验收。修正指针缺少首次位置、SQL/测试起步的循环前置、数据访问过晚以及 AI 与主线答辩混在一起的问题。

本轮再次核对了 [Learn Go with Tests 的起步章节](https://quii.gitbook.io/learn-go-with-tests/go-fundamentals/hello-world)、[MIT 6.006 先修](https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-spring-2020/pages/syllabus/)和 [CMU 15-445 Fall 2025 历史安排](https://15445.courses.cs.cmu.edu/fall2025/schedule.html)。据此采用早期反馈、补足数学与编程基础、区分应用与内部机制的教学安排；具体跨卷路线为本课程设计。

课程生产流程记录在 drafts/platform_engineering/authoring_workflow.md。每章审阅后必须同步正式正文、导航、进度和来源，再做静态接入检查；完成状态以项目实际可读内容为准。

随后将 14 卷全部 168 个单元的练习与验收目标逐项落到 IM 问题，并完成 [01.03 控制流与函数](./curriculum/01_go/03_control_functions.md)。普通函数版本先完成，递归与闭包第二遍深化；章末借助已核对的 OpenIM 函数控制结构衔接源码。生成要求仅提供实际核对摘要，没有声称已将仓库导入知识库。

用户授权并行后，首批由三个独立写作任务完成 [01.04 集合与文本](./curriculum/01_go/04_collections_text.md)、[10.01 可验证需求](./curriculum/10_engineering/01_verifiable_requirements.md)和 [10.03 Git 状态](./curriculum/10_engineering/03_git_state.md)。每章实际调用 DeepTutor、独立审阅，再统一复核前置和共同规则，最后集中同步导航与来源。学习顺序继续按知识依赖安排。

第二批展开 [01.05 对象与指针](./curriculum/01_go/05_maps_structs_pointers.md)、[02.01 数学与成本](./curriculum/02_algorithms/01_discrete_cost.md)和 [03.01 数据与存储](./curriculum/03_systems/01_data_instructions_storage.md)。语言章说明对象与修改关系，数学章明确计数及分析前提，系统章建立单位、地址、缓存和预算的模型；三章分别补齐自己的必要定义，避免循环先修。

## 学习者起点与案例来源

课程默认学习者尚未掌握 Go 语法、测试、HTTP、SQL 与并发。A、B 两篇提供现有基础与衔接讲解，独立长篇按路线继续补齐深度；后续章节通过具体链接回顾，尚缺正文明确标记。其他专题和官方手册用于核对与深化。

当前主线采用虚构 IM，以 [OpenIM](./curriculum/im_reference.md)为工程参照。旧任务与积分例子保留为基础补充，后续章稿按 IM 需求逐章适配；课程只使用虚构身份、群组和消息，不记录真实组织材料。

每章增加固定源码版本、实际读取位置、项目事实与教学模型差异。选型核对了 OpenIM、WuKongIM 与 Tinode 的公开资料，服务端快照和文件哈希记录在 drafts/platform_engineering/im_reference_manifest.json。课程不会只凭项目 Stars 或 README 性能描述认定运行保证。

## 四篇课程的依赖关系

A 篇先解释 Go 语法与工程操作。函数类型先于 handler，接口先于 error 与 I/O 的深化，测试写法先于整合测试命令。

B 篇将代码接到进程、网络与数据服务。HTTP 协议先于 HTTP 代码，容器与端口先于 Compose 命令，SQL 语法先于索引与事务，goroutine/channel/context 先于工作池。

C 篇保留五个逐步深入的单元：状态与所有权、并发与性能、数据正确性、跨服务故障、平台运行。各课开头列出对应基础课以及使用目的。

D05–D06 对应主线的需求、方案与综合实践。D01–D04 属于 AI 方向，从 Python 起步，先建立评测基线，再进入检索与工具；复杂技术通过已经学过的状态、失败和证据概念衔接。

每课采用小需求、必要概念、完整示例或明确片段、执行过程、常见错误、独立练习与反馈。正文中的预期输出属于教学说明，实际验证范围见[修订记录](./verification.md)。

[概念索引](./concept_map.md)用于返回首次讲解位置；主线所需前置由课程本身承担，外部资料用于核对和深化。

## 每课的质量检查

- 是否说明本课使用了哪些已经讲过的知识，并提供具体链接？
- 新术语第一次出现时是否给出含义与最小例子？
- 是否先提出一个具体问题，再定义必要术语？
- 是否解释机制和条件，而不只给结论？
- 是否有能实际运行的例子，或明确标注为设计/条件实验？
- 是否给出预期现象、失败线索、提示和反馈？
- 是否要求至少一个独立变式，避免照抄参考实现？
- 是否区分教学模型与生产保证？

参考代码用于验证说明；学生作业仍需要自己增加变式。通过自动测试是完成实验的一部分，不能替代解释与迁移能力。
