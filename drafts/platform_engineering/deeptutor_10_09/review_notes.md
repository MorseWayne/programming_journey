# DeepTutor 10.09 生成与审阅记录

## 生成材料

- DeepTutor 书籍 `bk_9d8b94373c`、正文页 `pg_06b6e5fb01`；8 个正文块 ready、失败块 0。HTTP Markdown 导出与容器 `generated.md` 的 SHA-256 相同。
- `original.md` 保留自动导览、重复标题与同一概念多次说明；`reviewed.md` 为按入门先修和 IM 业务合同重写的静态课程，已同步正式页。`generation_request.json` 保存八节生成要求。
- 本地 BookEngine 使用进程内参数适配，没有修改 DeepTutor 持久配置。

## 技术与教学审阅

1. 原稿重复解释 CI/workflow/job/step、缓存与制品，且一处将网络错误“最多一次重试”、另一处写“最多两次”。审阅稿按本地证据缺口→基础术语→分层合同→隔离依赖→测试数据→制品→最小设计→故障推演组织；失败重试只作为基于证据的选择，不规定互相矛盾的固定次数。
2. 原稿有“受信代码快照”一类过强表述。审阅稿区分被检查的提交身份与代码信任：外部评审请求的代码仍是不受信输入，不能在高权限环境中直接执行并获取密钥。伪配置明确标为概念图，避免读者当成可运行的 GitHub Actions YAML。
3. 原稿多处把 `go.mod`/`go.sum` 说成“锁定依赖”，容易被误读为足以锁定整个构建。审阅稿说明 `go.mod` 描述模块与版本要求、`go.sum` 校验模块内容，另外还需记录 Go 工具链、目标、CGO、构建参数和生成输入；相同源码 SHA 不自动保证二进制字节相同。
4. 审阅稿明确 `go test ./...` 是未来个人验证示例；`go build ./...` 的成功不保证留下指定路径的二进制，保存制品时必须选定主包和 `-o` 输出。所有命令只作静态教学，没有在作者环境执行。
5. 用单条正文 **9 UTF-8 字节**规则把 CI 检查连回 10.01–10.06：`abc` 3 字节、`中文甲` 9 字节、`中文甲a` 10 字节；失败请求不得改动内存列表。先定义业务预期，再说明单元、接口、构建各自能证明什么以及缺什么。
6. 制品记录关联完整提交 SHA、工作流运行、工具链、目标、命令和文件摘要；SHA-256 只能比较文件内容，不自动证明构建过程可信或业务正确。job 之间环境隔离，跨任务文件须显式交接，缓存不能当交接制品或测试结果。
7. 22 道练习从概念、字节边界、Go 模块与缓存到 PR 信任边界和 P2 未覆盖的持久/设备阶段。当前课程没有运行中的 HTTP/WS、CI、构建产物或真实上线证据，不宣称 OpenIM 实现事实。

## 核对资料与验证范围

- [GitHub Actions 基础](https://docs.github.com/en/actions/get-started/understand-github-actions/)、[工作流语法](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax)、[制品](https://docs.github.com/en/actions/tutorials/store-and-share-data)、[缓存](https://docs.github.com/en/actions/concepts/workflows-and-actions/dependency-caching)：事件、任务、步骤、环境和跨任务交接。
- [GitHub 安全使用](https://docs.github.com/en/actions/reference/security/secure-use)、[pull_request_target 信任边界](https://docs.github.com/en/actions/reference/security/securely-using-pull_request_target)：最小权限与外部代码。
- [Go 模块参考](https://go.dev/ref/mod)、[go 命令](https://pkg.go.dev/cmd/go)：依赖校验、测试与构建命令。
- 本章只做文档结构、链接、来源哈希、隐私词和纸上字节样例核对；没有运行 Go、CI、IM 服务或站点构建。
