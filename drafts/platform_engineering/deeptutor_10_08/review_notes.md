# 10.08 审阅记录：依赖与质量工具

DeepTutor BookEngine 八节初稿均 ready、无失败块；本地 HTTP Markdown 导出与引擎渲染 SHA256 一致。`original.md` 保存完整初稿。正式页按 Go 模块版本选择、`go.sum/tidy/verify`、格式与静态分析、`.proto/.pb.go` 生成链、已知漏洞扫描、固定 OpenIM 证据和 22 道分层练习重组。

## 教学重组

- 用虚构 `example.org/im/app` 直接 require protocol v1.4.0、transport v1.2.0 转依赖 protocol v1.6.0 手算 MVS 选 v1.6.0；真实 OpenIM 版本未核对，不把玩具数字写成上游事实。
- 把 `go.mod` 最低要求、MVS build list、`go.sum` 多版本哈希、`go mod tidy` 差异和 `go mod verify` 模块缓存检查各放独立格。
- `gofmt`、`go vet`、编译、测试、fuzz/race 与 govulncheck 都列“能证/未证”；工具绿色结果不能替 IM 的 6 B/409/404、消息版本/权限或设备确认。
- `.proto` 作为协议定义源，固定 protoc/Go 插件及依赖工具链，生成 `.pb.go` 作为产物；旧二进制可解析新增字段仍不表示旧 SearchIndex 理解 `visible/message_version`。

## 技术修订

- 原稿多处将 `go mod verify` 写成“本地缓存与 `go.sum` 逐项比对”。官方模块文档更精确：它比较缓存 zip/展开目录与**下载时记录**的哈希；模块日常下载与 `go.sum`/checksum DB 认证另有流程。正式页限定了两种检查。
- 原稿把“go.sum 证明获取内容未被替换”直接推广到“当前选中版本”；正式页说明同一模块可有多个哈希条目，选中版本看 build list，不把 go.sum 当 lockfile 或安全批准书。
- 原稿有 `.proto` “唯一契约源”一类绝对表述，易让初学者忽略发布版本、生成器、运行时与业务协议合同。正式页把 `.proto` 定为教学事件的**schema 源**，再记录生成工具链、实际 build list、新旧消费者和回放结果。
- 原稿工具表增加 `buf lint` 等未在本次来源中核对的外部能力，正式页以 Go 官方 `gofmt/vet`、Go modules、Protobuf 官方文档和 govulncheck 的可验证语义为主。
- govulncheck 只覆盖已知数据库报告与所选代码/调用分析，不把无报告写成系统无漏洞；升级修复后仍核权限、协议混部及回退门。
- 固定 OpenIM `send.go`/Mongo 消费源码未提供 go.mod 的确切选中版本或本次工具运行结果，正式页保持“待学员固定检出核对”。

## 静态边界与同步

- 模块图、字段、命令与输出均为教学设计；未运行 Go 命令、protoc、漏洞扫描、IM 或站点。
- 已同步正式页、10.07 下一章链接、第十卷目录、总目录、侧边栏、学习路线、能力验收与来源散列。
