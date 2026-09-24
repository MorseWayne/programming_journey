# DeepTutor 01.12 生成与审阅记录

## 生成材料

- DeepTutor 书籍 `bk_6dddf700b0`、正文页 `pg_0a56fc784b`；8 个正文块均 ready、失败块为 0，HTTP Markdown 导出已核对。
- `original.md` 保留自动导览、重复论述和原始示例；`reviewed.md` 是重组后的静态课程，`generation_request.json` 保存章节要求。
- 生成使用本地 BookEngine 与单进程 token 参数适配，未修改 DeepTutor 的源码或持久配置。

## 技术与教学审阅

1. 原稿混用 `check/list/export`、`import/check/export` 和位置参数/Flag 两套命令语法；审阅稿固定 `check/list/export`，所有文件路径由 `-file` 与 `-out` 明确给出。
2. 统一配置优先级为显式 `-file` > `IMHISTORY_FILE` > 教学默认路径，其他选项只有 Flag 与默认值；`FlagSet` 对每个子命令单独解析，帮助和无子命令的退出结果分别约定。
3. 原稿的退出码在不同节中冲突；审阅稿统一为 0 成功或帮助、2 用法、3 输入历史无效、4 文件 I/O/目标冲突、5 其他未预期错误，`stdout` 与 `stderr` 各有固定职责。
4. 严格沿用版本 1 JSON 的字段、大小限制、尾随值检查和会话内重复规则。同步修正 01.08、01.09 的示例：缺失或 `null` 的 `messages` 为 nil 应拒绝，显式空数组合法。
5. `main` 只在 `run` 完成后调用 `os.Exit`；内层保持 `defer`、写入和关闭责任，不把 `os.Exit` 放进资源路径。
6. `list` 在整份文件成功校验后才输出，默认只显示 ID 与时间，不输出完整正文或真实身份；本章身份均为虚构数据。
7. `export` 默认用 `O_CREATE|O_EXCL` 排他创建，目标已存在时拒绝；显式 `-replace` 才允许覆盖。写入和关闭错误分别处理，源/目标同一文件拒绝，覆盖或中途失败均不被描述成崩溃原子操作。
8. 测试矩阵分别核对领域、文件和命令行为，真实执行结果留给学习者记录。本章没有增加 OpenIM 的文件格式、同步或送达实现事实。

## 核对资料与验证范围

- [Go `flag.FlagSet`](https://pkg.go.dev/flag#FlagSet)、[os.Exit](https://pkg.go.dev/os#Exit)、[encoding/json Decoder](https://pkg.go.dev/encoding/json#Decoder.DisallowUnknownFields)、[testing.T.TempDir](https://pkg.go.dev/testing#T.TempDir)、[log/slog](https://pkg.go.dev/log/slog)。
- 本章只进行文档结构、链接、来源哈希和示例静态推导检查；未执行 Go、测试、站点构建或 IM 服务。
