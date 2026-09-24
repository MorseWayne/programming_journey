# DeepTutor 05.01 生成与审阅记录

## 生成材料

- DeepTutor 书籍 `bk_7b2121c84e`、正文页 `pg_1fc2d13c45`；8 个正文块 ready，失败块 0。HTTP Markdown 导出与容器原稿 SHA-256 一致。
- `original.md` 保留自动导览、重复小节和原始案例；`reviewed.md` 是重组后的初学者静态教材，已同步到正式页。`generation_request.json` 保存八节要求。
- 生成使用本地 BookEngine 与进程内参数适配，没有修改 DeepTutor 持久配置。

## 技术与教学审阅

1. 原稿在某些任务树中把 `c-a` 当作连接/父任务、`u-a/u-b` 当作子任务名；审阅稿保持系列身份约定：`c-a` 会话、`u-a/u-b` 用户、`m-a` 消息，任务用 A/B 或职责命名。
2. 从 03.04 的可运行/等待进入并发与并行，按 Go 规范解释 `go f(args)` 的参数求值和新 goroutine 执行；`go` 语句只启动，不能保证完成、错误被接收或消息送达。
3. 05.01 只预教固定批量需要的 `WaitGroup.Add/Done/Wait`，强调先登记后启动、主管返回前等待，以及 WaitGroup 不传递错误、取消或业务确认。05.02 再系统讲同步原语，05.03 再讲 channel/context。
4. 把原稿中多个互不相接的代码片段收敛为两个可读的 `history` 包教学函数：`BodyByteLengths` 写独立索引且 `Wait` 后返回；`CheckAll` 用每项独立错误槽按输入次序收集，要求 `check` 可并发调用。`len` 很便宜，示例目的不是加速。
5. 明确 `main` 返回可能终止尚未完成的 goroutine，`time.Sleep` 不是同步；处理任务需要启动者、等待者、错误接收者、资源所有者和停止路径。
6. 共享 map/计数可能竞争，等待网络不占满 CPU 但仍持有资源；以每秒 100 项、停留 60 秒的**假设**推得约 6000 个在途任务，不把它当真实 IM 网关测量或默认 goroutine 架构。
7. 22 道练习从术语和静态代码推进到未来 HTTP/WebSocket 任务树；没有执行 Go、测试、站点构建或 IM 服务，也没有声称 OpenIM 运行行为。

## 核对资料与验证范围

- [Go 规范：Go statements](https://go.dev/ref/spec#Go_statements)：goroutine 启动与参数语义。
- [Go `sync.WaitGroup`](https://pkg.go.dev/sync#WaitGroup)：计数与等待边界。
- [Go 官方博客：Pipelines and cancellation](https://go.dev/blog/pipelines)、[Effective Go：goroutines](https://go.dev/doc/effective_go#goroutines)：后续任务与取消模型。
- 本章只做文档结构、链接、来源哈希与静态执行顺序推导检查。
