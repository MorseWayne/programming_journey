# DeepTutor 课程来源与审阅档案

正式学习入口是 [Go 系统课程](../../src/docs/platform_engineering/README.md)及其 [S0–S7 学习路线](../../src/docs/platform_engineering/curriculum/learning_path.md)。本目录只保存生成要求、原始稿、审阅稿、来源散列、差异记录和课程编写流程；原稿可能含未被采用的结论，不作为学习正文。

14 卷共 **168 章**独立正文均已接入 `src/docs/platform_engineering/curriculum`。各章来源通常保存在 `deeptutor_卷号_章号` 目录；先经人工编写的 18 章保存在 `manual_卷号_章号`，其 DeepTutor 原稿也已补齐并审阅。[补生成清单](./deeptutor_backfill_manifest.json)现为 0。每章的 `provenance.json` 记录正式页、审阅稿与原稿的散列；修订原因见该章 `review_notes.md`。

修改课程时遵循[单章生产与项目同步流程](./authoring_workflow.md)：核先修和 IM 业务合同，保留原稿，审阅并同步正式页、导航与来源散列，再做静态链接检查和 VuePress 构建。项目源码参照与固定版本见[阅读地图](../../src/docs/platform_engineering/curriculum/im_reference.md)和[来源清单](./im_reference_manifest.json)。

生成、静态构建和学习者亲自运行 Go/IM 示例是不同证据。个人实践范围由学习者按[进度模板](../../src/docs/platform_engineering/progress.md)记录；课程原稿和本目录中的旧批次记录不自动证明示例已运行。
