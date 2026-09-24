# DeepTutor 10.05 生成与审阅记录

## 生成材料

- DeepTutor 书籍 `bk_a82eb73774`、正文页 `pg_06369ba330`；8 个正文块 ready，失败块 0。HTTP Markdown 导出与容器 `generated.md` 哈希一致。
- `original.md` 保留原始导览、重复标题、草稿代码和备选论述；`reviewed.md` 是经过统一合同的审阅稿，已同步到正式课程。`generation_request.json` 保存八节请求。
- 只通过本地 BookEngine 和进程内参数适配生成，不修改 DeepTutor 的持久配置。

## 技术与教学审阅

1. 原稿前后出现多套冲突的退出码：有的把非法 JSON 记为 2、文件不存在记为 3、目标已存在记为 5，也有片段使用 1。审阅稿严格沿 01.12：0 成功/帮助，2 用法，3 无效历史，4 I/O/目标冲突，5 其他未预期错误。
2. 原稿对 `messages:null` 曾写成“可视为空列表”；审阅稿保持 v1 合同：缺失或 `null` 拒绝，显式 `[]` 合法。
3. 原稿混淆 6 字节正文教学规则与 CLI `-max-bytes` 的 1 MiB 文件读取资源上限；审阅稿逐一定义，并在重构示例中用 `bodyLimit` 避免复用参数名。
4. 原稿在个别段落假设工具曾连接外部 IM 服务或具有新增命令；审阅稿只用**假想单文件练习旧版**说明提取与移动，不把它当本课程已有实现，也不新增网络或投递事实。
5. 以用户、脚本、文件消费者和 Go 调用者分别解释可观察行为；重构、修复和加功能分开。未知旧行为先观察再与需求核对，不把偶然行为自动固化。
6. 拆分按变化原因与依赖方向，而非代码行数：纯 `history` 规则、`internal/historyfile` v1 适配、`cmd/imhistory` CLI 合同。补充切片所有权、公开 API、错误身份和脱敏诊断的边界。
7. 22 道练习从概念、反例、包边界、错误到个人迁移任务递进。真实运行证据留给学习者；本章只有静态教材、链接和来源哈希检查。

## 来源与验证范围

- [Martin Fowler：Refactoring](https://refactoring.com/)：可观察行为保持、小步改造与技术目录。
- [A Philosophy of Software Design 作者页](https://web.stanford.edu/~ouster/cgi-bin/aposd.php)：模块复杂度和信息隐藏的延伸阅读。
- [Effective Go](https://go.dev/doc/effective_go)、[Go Code Review Comments](https://go.dev/wiki/CodeReviewComments)：Go 包、命名与注释的官方参考。
- 本次未运行 Go 示例、测试、站点构建或 IM 服务。仅做文档结构、链接、哈希及示例静态推导检查。
