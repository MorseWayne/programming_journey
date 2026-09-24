# DeepTutor 10.04 生成与审阅记录

## 生成材料

- DeepTutor 书籍 `bk_cda1b5a861`、正文页 `pg_3d6ed75268`；8 个正文块均 ready，失败块为 0。HTTP 导出与 `generated.md` 的 SHA-256 相同。
- `original.md` 保留 DeepTutor 的自动导览、重复小节和原始案例；`reviewed.md` 是同步到课程的审阅稿。`generation_request.json` 保留八节具体要求。
- 生成只用了本地 BookEngine 与单进程参数适配，没有修改 DeepTutor 持久配置。

## 技术与教学审阅

1. 原稿反复解释 SUT、fake/stub/spy/mock，且在若干段落换成订单、库存和支付案例。审阅稿按虚构 IM 本地历史的一条需求线组织八节，从纯函数、接口、内存实现到故障、时间和真实文件证据。
2. 原稿有中文 Go 标识符示例、多个互不兼容的 `Store`/`Append` 签名和重复标题。审阅稿选定 `ValidateMessage`、`MessageSaver.Save(Message) error`、`Recorder.Record` 一套教学 API，并标明代码片段归属。
3. 统一 10.01 的 6 字节教学边界与 10.02 的错误/状态断言；`你好` 6 字节可接受，`你好呀` 9 字节拒绝。重复 ID 以会话和消息 ID 的结构体键表达，不用字符串拼接造成边界歧义。
4. fake 的 map 只证明教学内存语义；stub 只固定返回错误；spy 只记录请求；mock 只在交互本身有业务合同价值时使用。真实 JSON、部分写入和关闭责任仍需文件层证据，不从替身测试越界推断。
5. `Record` 在校验后才调用 `Save`，以 `%w` 包装底层错误；测试预期用 `errors.Is` 和零值返回核对。存储返回错误不能推出实际文件字节保持不变。
6. 单一时间点先显式传 `now time.Time`，多处读时钟才引入小 `Clock` 接口；固定时区及 UTC 预期，拒绝用 `sleep` 代替时间边界输入。
7. 延续 01.12 的 `stdout`/`stderr` 注入、默认不输出正文、`t.TempDir` 真实本地文件测试层次。未增加 OpenIM 运行、投递或持久化实现事实。
8. 加入 22 道按基础、原理、工程和业务迁移递进的练习反馈；正式页、导航、学习路线和来源记录同步更新。

## 核对资料与验证范围

- [Martin Fowler 原文](https://martinfowler.com/articles/mocksArentStubs.html)：替身五类与状态/交互验证。
- [Learn Go with Tests：Dependency Injection](https://quii.gitbook.io/learn-go-with-tests/go-fundamentals/dependency-injection)、[Mocking](https://quii.gitbook.io/learn-go-with-tests/go-fundamentals/mocking)：Go 的流边界、可控时间与 mock 教学案例。
- [Go `testing`](https://pkg.go.dev/testing)、[Go `time`](https://pkg.go.dev/time)：测试目录与时间值的官方文档。
- 本章只进行文档结构、链接、来源哈希和示例的静态推导检查；未运行 Go、测试、构建或 IM 服务。
