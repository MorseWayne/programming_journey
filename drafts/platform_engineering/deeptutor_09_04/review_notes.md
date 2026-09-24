# DeepTutor 09.04 生成与审阅记录

## 生成材料

- DeepTutor 书籍 `bk_f808b51dde`、正文页 `pg_c8fefd187a`；8 个正文块 ready、失败块 0。HTTP Markdown 导出与容器 `generated.md` 的 SHA-256 相同。
- `original.md` 保留自动导览、重复小节和原始中间件/异常案例；`reviewed.md` 是按 09.02–09.03 固定合同审阅重组的静态教材，已同步正式页。`generation_request.json` 保存八节要求。
- 生成使用本地 BookEngine 与进程内参数适配，没有修改 DeepTutor 持久配置。

## 技术与教学审阅

1. 原稿在某些代码片段把请求体上限从 4096 B 改为 1 MiB，并临时换用订单业务案例。审阅稿固定虚构 `u-a/c-a/m-a` POST 和 4096 B 原始 JSON、6 B 正文、本进程内存受理的系列合同。
2. 统一中间件示意 `requestID(recovery(limitBody(auth(api))))`：请求外到内、正常返回内到外，`auth` 可短路；`MaxBytesReader` 只包装 Body，真正超限要到读取时才显现。
3. 可信主体来自认证边界而非 `sender_id`；真实认证 S3 未实现，固定身份仅作私有教学桩，不能被课程示意图误当公开服务。应用层按动作授权，拒绝不应进入内存提交。
4. `r.Context()` 的取消、内部 300 ms 示例期限与请求完成各是协作信号，不能自动撤销已完成的锁内内存追加；handler 返回后，依附 `r.Context()` 的后台任务也会失去该请求上下文。
5. 原稿若干“恢复只处理提交前 panic”的短句容易误导。审阅稿区分：同 goroutine 的 panic 无论在提交前后都可能被捕获，但**只有响应未写出时**才有机会生成完整新 500；不同 goroutine 的 panic 不会被这个 handler 的 defer 捕获，恢复不等于业务回滚。
6. 依据 `ResponseWriter` 官方语义说明首次 `Write` 隐式 200、小 JSON 先准备再提交最终状态、已写部分响应不能再改成完整 500；日志包装器还需注意 Flusher/Hijacker 等可选接口，不在本章贸然实现。
7. 日志仅有脱敏关联标识、阶段、稳定错误码、计数和未来实际测量的耗时；不能把日志中 `status=200` 当客户端收到或 `u-b` 已读的证据。22 道练习从嵌套次序逐步走到未知结果；没有运行 Go、HTTP 服务、测试或站点构建。

## 核对资料与验证范围

- [Go `net/http.Handler`](https://pkg.go.dev/net/http#Handler)、[`Request.Context`](https://pkg.go.dev/net/http#Request.Context)、[`ResponseWriter`](https://pkg.go.dev/net/http#ResponseWriter)、[`MaxBytesReader`](https://pkg.go.dev/net/http#MaxBytesReader)。
- [Go `context`](https://pkg.go.dev/context)、[`log/slog`](https://pkg.go.dev/log/slog)。
- 本章只做文档结构、链接、来源哈希与纸上时序/提交点检查。
