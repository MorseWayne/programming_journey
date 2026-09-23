# DeepTutor 课程生成与审阅档案

课程正文按审核后的章节逐步接入 src；本目录保留生成来源、修订稿和审阅记录。原稿可能含不准确说明，学习请阅读课程正文。

每次生成或刷新章稿，先遵循[单章课程生产与项目同步流程](./authoring_workflow.md)。**同步到本项目是每章交付的必需步骤**：审阅正文、导航、学习状态与来源记录一起接入，静态检查后才报告交付完成。路线调整依据见[学习路线审阅记录](./learning_path_review.md)。

当前业务主线为 IM，主参照为 OpenIM。见[项目阅读地图](../../src/docs/platform_engineering/curriculum/im_reference.md)与[固定源码来源清单](./im_reference_manifest.json)。01.01–01.02 保留基础原稿，01.03 起按 IM 主线展开；最新新增 01.08 标准库协作。分工与统稿见[并行批次](./parallel_batches.md)，共用规则见[教学约定](./common_contracts.md)。

| 章节 | 正式课程文件 | 原稿与审阅 | 状态 |
|---|---|---|---|
| 01.01 程序、源代码与一次运行 | [课程正文](../../src/docs/platform_engineering/curriculum/01_go/01_program_toolchain.md) | [原稿](./deeptutor_01_01/original.md) · [审阅稿](./deeptutor_01_01/reviewed.md) · [修订记录](./deeptutor_01_01/review_notes.md) · [来源](./deeptutor_01_01/provenance.json) | 用户认可后已接入本地课程 |
| 01.02 类型与数据表示 | [课程正文](../../src/docs/platform_engineering/curriculum/01_go/02_types_data.md) | [生成要求](./deeptutor_01_02/generation_request.json) · [原稿](./deeptutor_01_02/original.md) · [审阅稿](./deeptutor_01_02/reviewed.md) · [修订记录](./deeptutor_01_02/review_notes.md) · [来源](./deeptutor_01_02/provenance.json) | 生成、审阅并接入本地课程 |
| 01.03 IM 控制流与函数 | [课程正文](../../src/docs/platform_engineering/curriculum/01_go/03_control_functions.md) | [生成要求](./deeptutor_01_03/generation_request.json) · [原稿](./deeptutor_01_03/original.md) · [审阅稿](./deeptutor_01_03/reviewed.md) · [修订记录](./deeptutor_01_03/review_notes.md) · [来源](./deeptutor_01_03/provenance.json) · [前置交接](./deeptutor_01_03/handoff.json) | 8 个正文块完成，已审阅并接入 |
| 01.04 数组、切片与文本 | [课程正文](../../src/docs/platform_engineering/curriculum/01_go/04_collections_text.md) | [生成要求](./deeptutor_01_04/generation_request.json) · [原稿](./deeptutor_01_04/original.md) · [审阅稿](./deeptutor_01_04/reviewed.md) · [修订记录](./deeptutor_01_04/review_notes.md) · [来源](./deeptutor_01_04/provenance.json) · [交接](./deeptutor_01_04/handoff.json) | 8 个正文块完成，已统稿接入 |
| 01.05 map、结构体与指针 | [课程正文](../../src/docs/platform_engineering/curriculum/01_go/05_maps_structs_pointers.md) | [生成要求](./deeptutor_01_05/generation_request.json) · [原稿](./deeptutor_01_05/original.md) · [审阅稿](./deeptutor_01_05/reviewed.md) · [修订记录](./deeptutor_01_05/review_notes.md) · [来源](./deeptutor_01_05/provenance.json) · [交接](./deeptutor_01_05/handoff.json) | 9 个正文块完成，已统稿接入 |
| 01.06 方法与接口 | [课程正文](../../src/docs/platform_engineering/curriculum/01_go/06_methods_interfaces.md) | [生成要求](./deeptutor_01_06/generation_request.json) · [原稿](./deeptutor_01_06/original.md) · [审阅稿](./deeptutor_01_06/reviewed.md) · [修订记录](./deeptutor_01_06/review_notes.md) · [来源](./deeptutor_01_06/provenance.json) · [交接](./deeptutor_01_06/handoff.json) | 8 个正文块完成，已统稿接入 |
| 01.07 错误与资源生命周期 | [课程正文](../../src/docs/platform_engineering/curriculum/01_go/07_errors_resources.md) | [生成要求](./deeptutor_01_07/generation_request.json) · [原稿](./deeptutor_01_07/original.md) · [审阅稿](./deeptutor_01_07/reviewed.md) · [修订记录](./deeptutor_01_07/review_notes.md) · [来源](./deeptutor_01_07/provenance.json) · [交接](./deeptutor_01_07/handoff.json) | 8 个正文块完成，已统稿接入 |
| 01.08 标准库协作 | [课程正文](../../src/docs/platform_engineering/curriculum/01_go/08_standard_library.md) | [生成要求](./deeptutor_01_08/generation_request.json) · [原稿](./deeptutor_01_08/original.md) · [审阅稿](./deeptutor_01_08/reviewed.md) · [修订记录](./deeptutor_01_08/review_notes.md) · [来源](./deeptutor_01_08/provenance.json) · [交接](./deeptutor_01_08/handoff.json) | 8 个正文块完成，已统稿接入 |
| 02.01 离散对象与成本模型 | [课程正文](../../src/docs/platform_engineering/curriculum/02_algorithms/01_discrete_cost.md) | [生成要求](./deeptutor_02_01/generation_request.json) · [原稿](./deeptutor_02_01/original.md) · [审阅稿](./deeptutor_02_01/reviewed.md) · [修订记录](./deeptutor_02_01/review_notes.md) · [来源](./deeptutor_02_01/provenance.json) · [交接](./deeptutor_02_01/handoff.json) | 8 个生成块审阅为 9 节，已统稿接入 |
| 03.01 数据、指令与存储层次 | [课程正文](../../src/docs/platform_engineering/curriculum/03_systems/01_data_instructions_storage.md) | [生成要求](./deeptutor_03_01/generation_request.json) · [原稿](./deeptutor_03_01/original.md) · [审阅稿](./deeptutor_03_01/reviewed.md) · [修订记录](./deeptutor_03_01/review_notes.md) · [来源](./deeptutor_03_01/provenance.json) · [交接](./deeptutor_03_01/handoff.md) | 8 个正文块完成，已统稿接入 |
| 10.01 可验证需求 | [课程正文](../../src/docs/platform_engineering/curriculum/10_engineering/01_verifiable_requirements.md) | [生成要求](./deeptutor_10_01/generation_request.json) · [原稿](./deeptutor_10_01/original.md) · [审阅稿](./deeptutor_10_01/reviewed.md) · [修订记录](./deeptutor_10_01/review_notes.md) · [来源](./deeptutor_10_01/provenance.json) · [交接](./deeptutor_10_01/handoff.json) | 7 个生成块审阅为 8 节，已统稿接入 |
| 10.03 Git 状态与版本记录 | [课程正文](../../src/docs/platform_engineering/curriculum/10_engineering/03_git_state.md) | [生成要求](./deeptutor_10_03/generation_request.json) · [原稿](./deeptutor_10_03/original.md) · [审阅稿](./deeptutor_10_03/reviewed.md) · [修订记录](./deeptutor_10_03/review_notes.md) · [来源](./deeptutor_10_03/provenance.json) · [交接](./deeptutor_10_03/handoff.md) | 8 个正文块完成，已统稿接入 |

当前共接入 12 章，不代表 168 个计划单元已全部完成。生成使用已有 DeepTutor BookEngine 和模型配置；HTTP 创建接口的参数兼容问题通过单次 SDK 进程适配绕行，持久服务仍需另行修复。

本轮没有执行站点构建或 Go 练习。正式页面保留教学预期，个人运行记录由学习者另行填写。
