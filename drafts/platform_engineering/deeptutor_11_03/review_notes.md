# DeepTutor 11.03 生成与审阅记录

## 生成材料

- DeepTutor 书籍 `bk_7c5b81e4fb`、正文页 `pg_4eba59efea`；8 个正文块 ready、失败块 0。HTTP Markdown 导出与容器 `generated.md` 的 SHA-256 相同。
- `original.md` 原样保留自动导览、重复小节和不同提法；`reviewed.md` 为统一业务确认点后的静态课程，已同步到正式页。`generation_request.json` 保存八节要求。
- 本地 BookEngine 使用进程内参数适配；没有修改 DeepTutor 持久配置。

## 技术与教学审阅

1. 原稿在直方图的名称与单位上同时出现 `duration_ms` 和 `duration_seconds`，还在同一章交替称“服务端内存提交”与“客户端获得回应”为时延终点。审阅稿沿用 11.02 的十项纸上样本，统一为 A 点击提交至 A 收到受理回应，直方图叫 `im_accept_response_duration_seconds`；服务端入口至内存提交应另设指标。完成样本数为 10、总和为 0.326 s、累计桶 `≤0.020/≤0.100/+Inf` 分别为 9/9/10。超时及结果未知必须并排报告，不能默默从分母消失。
2. 将 `Counter` 的已受理结果与响应写出错误拆为两个不同计数器的事件，避免同一 `result` 枚举记录两个终点。解释 Counter 重启重置、窗口增量与速率，Gauge 当前存量，以及累积直方图桶不能求和。
3. 原稿多次重复三类证据、`request_id/trace_id/message_id`、标签和采样说明。审阅稿按“问题→基础概念→纸上例子→组合证据→练习”组织八节，面向 Go 初学者逐步进入术语，不直接堆监控产品配置。
4. 原稿用 `POST /m-a` 作为路由，混淆消息 ID 与路由模板。正式页用 `/v1/conversations/{id}/messages` 作为固定路由模板，并说明原始 URL、用户 ID、消息 ID 或哈希后的用户 ID 都不适合做普通指标标签；纸上 3×4=12 个组合加入 100000 用户标签的理论上界是 1200000。
5. Trace 树使用一个明确的理想时钟示例：客户端 0–40 ms，服务端 handler 12–30 ms，应用 13–25 ms，内存追加 20–25 ms。父子时长不可简单相加；服务端 `Write` 返回不能证明客户端收到 200；跨进程只有正确注入/提取上下文才可建立同一追踪关系。重试可生成新 Trace，不能把 `trace_id` 当去重消息 ID。
6. 日志必须在内存提交点之后记录已提交事件；服务端规划写 200、完成本地写调用和 A 实际收到回应是不同证据。观测可丢失或采样，缺失不等于业务事件没有发生。未来持久、设备送达、已读阶段均未实现、未观测，不写成 0% 或 100%。
7. 22 道练习覆盖术语、单位、标签组合、身份边界、采样、延迟与业务证据。所有例子为静态课程；没有运行 Go、IM 服务、监控/Trace 后端、基准或站点构建。

## 核对资料与验证范围

- [Google SRE：Monitoring Distributed Systems](https://sre.google/sre-book/monitoring-distributed-systems/)：黑盒/白盒观察及其局限。
- [OpenTelemetry：可观测性基础](https://opentelemetry.io/docs/concepts/observability-primer/)与[Trace 概念](https://opentelemetry.io/docs/concepts/signals/traces/)：Span、父子关联与传播。
- [Prometheus：指标类型](https://prometheus.io/docs/concepts/metric_types/)与[采集实践](https://prometheus.io/docs/practices/instrumentation/)：Counter、Gauge、Histogram 和标签基数。
- [Go `log/slog`](https://pkg.go.dev/log/slog)：结构化日志的 Go 标准库入口。
- 本章只做文档结构、链接、来源哈希、隐私词和纸上算例校核；不声称检查了 OpenIM 实现或运行时行为。
