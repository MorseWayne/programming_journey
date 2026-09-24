# DeepTutor 05.02 生成与审阅记录

## 生成材料

- DeepTutor 书籍 `bk_90156ca2fe`、正文页 `pg_f159da6493`；8 个正文块 ready，失败块 0。HTTP Markdown 导出与容器 `generated.md` 的 SHA-256 相同。
- `original.md` 保留自动导览、重复小节与原始代码；`reviewed.md` 是按一条会话业务不变量重组后的静态教材，已同步到正式课程。`generation_request.json` 保存八节要求。
- 生成使用本地 BookEngine 与进程内参数适配，没有修改 DeepTutor 持久配置。

## 技术与教学审阅

1. 原稿多次把 `c-a`、`c-b` 当成任务名称，与系列固定的会话身份冲突。审阅稿固定 `c-a` 为单会话、`m-a/m-b` 为消息，两个并发任务用 T1/T2 标记。
2. 从“同 ID 不覆盖、order 与 map 一致”推导临界区，指出即使每次 map 访问单独有锁，检查与写入分离仍可能产生业务竞争。`Mutex` 要覆盖查重→map 写→order 追加的一次完整变化。
3. 正式稿的 `History` 使用可用的零值、指针方法和同一把 `RWMutex`；`Append` 只保护内存单会话状态，`List` 在读锁内构造独立切片。两任务同 ID 时仅承诺“先取得锁者成功、后者拒绝”，不凭源码行序指定 T1 一定获胜。
4. `Body` 用 `string` 使返回结构体快照不泄漏可变字节；若后来加入 `[]byte`、map 或指针，外层切片复制不足，需重新定义所有权与深复制。
5. `WaitGroup` 只等登记任务结束，不保护共享 map 或携带错误；`Once` 即使初始化失败也不自动重试，不能称为“成功初始化一次”。读锁不可直接升级为写锁，`RWMutex` 也不是默认更快。
6. `Cond.Wait` 释放关联锁等待、被通知后重新获得锁；消费者在 `for` 中重查条件，因为其他任务可先消费。Cond 例子明确缺少关闭、取消和容量，留给 05.03 与 05.08。
7. 两锁反序、早退忘解锁和锁内 I/O 的反例与 Go race detector 的证据限制分别讲清。22 道练习从术语到状态表与业务取舍；没有执行 Go、测试、竞争检测、站点构建或 IM 服务。

## 核对资料与验证范围

- [Go `sync`](https://pkg.go.dev/sync)：Mutex、RWMutex、WaitGroup、Once、Cond 的官方语义。
- [Go maps 说明](https://go.dev/blog/maps)、[内存模型](https://go.dev/ref/mem)：共享数据与同步的进一步阅读。
- [Go race detector](https://go.dev/doc/articles/race_detector)：后续个人验证的工具与覆盖边界。
- 本章只做文档结构、链接、来源哈希、代码静态推导及交错表检查。
