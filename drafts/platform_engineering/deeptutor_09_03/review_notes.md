# DeepTutor 09.03 生成与审阅记录

## 生成材料

- DeepTutor 书籍 `bk_a72d2465a4`、正文页 `pg_00574a3b76`；8 个正文块 ready，失败块 0。HTTP Markdown 导出与容器原稿 SHA-256 一致。
- `original.md` 保留自动导览、重复小节和原始目录/接口方案；`reviewed.md` 是按既有 09.02 合同重组的静态教材，已同步到正式页。`generation_request.json` 保存八节请求。
- 生成使用本地 BookEngine 与进程内参数适配，没有修改 DeepTutor 持久配置。

## 技术与教学审阅

1. 原稿在不同节把请求体 4096 B 写成条目数，又将领域正文 6 B 写成 `6<<20`、至少 6 B，甚至把 `limit=0` 解释为默认 20。审阅稿严格沿 09.02：原始 POST JSON 最多 4096 B、正文至多 6 UTF-8 字节、GET 默认 20 但显式 0 非法，范围 1–100。
2. 固定 `cmd/teachingim`、`internal/httpapi`、`app`、`domain`、`internal/memorystore` 的职责和单向依赖；这是同一 Go 模块的**目录示意**，不是本仓库新增服务或 OpenIM 的实际目录布局。`internal` 限制导入范围，不提供认证隔离。
3. HTTP handler 限量读入、解析路径/JSON、从可信边界取主体、传递 `r.Context()`、统一映射状态与错误体；不直接改 map，也不信任客户端 `sender_id`。`ResponseWriter.Write` 隐式提交 200 的问题与先准备小 JSON 后写出的责任明确。
4. 应用服务按读/发动作检查会话权限，领域规则不依赖 HTTP；消费方小接口只需 `Append/Snapshot`，内存适配器在锁内维护 map/order/局部序号。原稿部分接口返回值与序号分配职责不一致，审阅稿把 `Append` 限为返回错误、成功响应仅需 ID 和内存受理状态。
5. 启动入口统一验证监听地址、请求上限、正文上限与分页配置；不沿用本地 CLI 的 `IMHISTORY_FILE`。固定虚构身份只能用于私有隔离实验，不构成可公开运行的认证方案。
6. 错误身份经 `%w`/`errors.Is` 到 HTTP 层只映射一次；取消不自动回滚已提交的内存状态。日志只记阶段/类别/时长等脱敏摘要，不回显正文、令牌或完整 JSON。
7. 22 道练习从包、接口与 handler 逐层推进到错误、取消和业务确认。未运行 Go、httptest、HTTP 服务、站点构建，也未增加新的 OpenIM 实现事实。

## 核对资料与验证范围

- [Go `net/http.Handler`](https://pkg.go.dev/net/http#Handler)、[`MaxBytesReader`](https://pkg.go.dev/net/http#MaxBytesReader)、[`ResponseWriter`](https://pkg.go.dev/net/http#ResponseWriter)。
- [Go `log/slog`](https://pkg.go.dev/log/slog)、[Effective Go 接口说明](https://go.dev/doc/effective_go#interfaces)。
- 本章只做文档结构、链接、来源哈希和静态调用/错误路径审阅。
