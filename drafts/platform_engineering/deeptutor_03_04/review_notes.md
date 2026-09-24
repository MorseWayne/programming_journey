# DeepTutor 03.04 生成与审阅记录

## 生成材料

- DeepTutor 书籍 `bk_d5e5af7873`、正文页 `pg_f1d8b96e13`；8 个正文块 ready、失败块 0。HTTP Markdown 导出与容器 `generated.md` 的 SHA-256 相同。
- `original.md` 保留自动导览、重复小节和原始案例；`reviewed.md` 是统一假设、指标与 IM 边界后的静态教材，已同步到正式页。`generation_request.json` 保存八节要求。
- 本地生成使用 BookEngine 与进程内参数适配，没有修改 DeepTutor 持久配置。

## 技术与教学审阅

1. 原稿部分段落把“典型 IM 网关采用少量 epoll 事件线程”写得近似当前项目事实。审阅稿只把空闲连接与群聊扇出作为**未来教学 IM 需求情景**，不宣称 OpenIM 或本项目具体线程、goroutine、队列实现。
2. 统一单核数值模型：A/B 同时 t=0 到达、各需 4 ms CPU、无 I/O、切换成本 0；FCFS 为 A 0–4/B 4–8，RR 片 2 ms 为 A 0–2/B 2–4/A 4–6/B 6–8。逐项复算首次响应、完成、周转与 CPU 就绪等待，避免把首次获 CPU 说成用户消息送达。
3. 单独推演 A 在运行 1 ms 后等待 I/O 到 t=6，B 在 t=1–5 用完 CPU，t=5–6 在题设仅 A/B 时可空闲；A 总周转 9 ms = 4 ms CPU + 5 ms I/O 等待，不把阻塞时间算成 CPU 排队。
4. 说明 `ps` 的 `R` 合并 running/runnable，`S`、`D` 只是采样线索；上下文切换不等于每次系统调用进入内核态，连接数不等于可运行线程数。单个 CPU 百分比没有时间窗口、对象范围和阶段耗时就不足以归因。
5. 操作系统调度线程，Go 运行时另管理 goroutine；`GOMAXPROCS` 不等于线程或连接数量，默认值/容器关系须按实际 Go 版本和资源核对。FCFS/RR 明确是教学抽象，不是对当前 Linux 调度器的实现声称。
6. 加入带单位的 `r×fanout×c` 虚构 CPU 预算及应用队列、Go 可运行队列、内核线程运行队列的区别；没有把纸上比例当成真实网关容量或送达保证。
7. 22 道练习从状态、单核数值、I/O 变式逐步走到多核和 IM 业务取舍。未运行 Go、Linux 实验、性能基准、站点构建或 IM 服务。

## 核对资料与验证范围

- [OSTEP：CPU Scheduling](https://pages.cs.wisc.edu/~remzi/OSTEP/cpu-sched.pdf)、[作者目录](https://pages.cs.wisc.edu/~remzi/OSTEP/)：经典调度模型与指标。
- [Linux `ps(1)`](https://man7.org/linux/man-pages/man1/ps.1.html)：`R/S/D` 状态说明。
- [Linux 调度设计文档](https://www.kernel.org/doc/html/latest/scheduler/sched-design-CFS.html)：实际策略的版本化参考。
- [Go `runtime.GOMAXPROCS`](https://pkg.go.dev/runtime#GOMAXPROCS)：Go 并行执行边界。
- 本章只做文档结构、链接、来源哈希和纸上模型运算核对。
