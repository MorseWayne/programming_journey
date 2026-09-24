# 09.10 审阅记录：协议兼容与 RPC

DeepTutor BookEngine 八节初稿均 ready、无失败块；本地 HTTP Markdown 导出与引擎渲染 SHA256 一致。`original.md` 保存完整初稿。正式页按四条版本轴、Protobuf 字段/存在性、gRPC deadline/重试、错误映射、六格混部、扩展迁移收缩、固定源码与 22 道练习重组。

## 教学重组

- 当前 S2 `/v1` 消息发送、拟议 S3 `/v2` 本地提交、未部署 09.09 `/v3` 导出、教学事件线格式 `event_v1/v2`、`m-9:v1/v2` 业务编辑分别建轴；R9 的 9 字节仍待审。
- 教学 `MessageEvent` 用字段号 1–3 加 `optional message_version=4/visible=5` 讲二进制兼容、缺字段与默认值、删除字段号保留、JSON/逐字段复制的未知字段损失。
- gRPC `DEADLINE_EXCEEDED` 与 RPC 响应头后的 *committed* 各按官方传输语义解释；前者可能对应业务已提交，后者不等于 SQL Commit。业务恢复仍用稳定消息身份和已评审的接口合同。
- 六格矩阵分别检查旧/新 HTTP 客户端、事件生产/消费、存量重放和 Protobuf/JSON 中间层的**线格式**与**消息版本/权限语义**。

## 技术修订

- 原稿多次写“S2/v1 正文恰为 6 个 UTF-8 字节”，与当前非空且**最多** 6 B 冲突。正式页统一最多 6 B、4096 B 总请求、重复同 ID 即使同正文 409、非成员目标 404。
- 原稿有把教学 S3 的重复同 ID 回放成功或新查询接口作为自然演进的倾向。正式页保留为未决 API 兼容评审，不让 gRPC 重试/稳定 ID 偷改当前 S2 的 409。
- 原稿某些错误映射把 `DEADLINE_EXCEEDED→504` 写成默认事实。正式页只要求网关按依赖阶段定义受控 5xx/结果未知，不能从任何超时断言未提交。
- 新增 Protobuf 字段是二进制 wire-safe 的常见情况，不保证旧 SearchIndex 忽略 `visible/message_version` 后仍安全；ProtoJSON 与逐字段复制可能损失未知字段，不能笼统说所有旧程序都能无损解析。
- 内部 gRPC `PERMISSION_DENIED` 到外部 404 是本系列当前隐藏对象的**应用层映射**，不是 gRPC 自动选出的 HTTP 状态；错误体与授权负例仍要防泄露。
- 固定 OpenIM 的 `send.go`/Mongo 消费两处只证明入队返回与另一消费路径，未核对本章教学 `.proto` 字段、客户端协商或 gRPC 重试配置。

## 静态边界与同步

- Proto、RPC、版本矩阵和升级门均是教学设计；未运行 Go、protoc、gRPC、IM、协议混部或站点。
- 已同步正式页、09.09 下一章链接、第九卷目录、总目录、侧边栏、学习路线、能力验收与来源散列。
