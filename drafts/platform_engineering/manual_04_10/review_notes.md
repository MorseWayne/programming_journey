# 04.10 审阅记录：HTTP 版本与 RPC

## 来源与生成状态

- 2026-09-25 请求 DeepTutor BookEngine 生成八节中文深度课程；ideation 阶段五次 HTTP 502，90 秒后停止，没有 book/page/原稿。
- 本目录保存人工编写、审阅的静态网络章稿与生成请求；无 `original.md`，不声称 DeepTutor 已生成。端点恢复后生成原稿并审阅差异。

## 单章覆盖与教学审阅

- 将应用 URL `/v1`、HTTP/1.1、未来应用 `/v2` 和 HTTP/2 明确分开；HTTP/1.1 复用/管线、HTTP/2 同 TCP 多 stream 及 stream/connection 流控、HTTP/3 QUIC 独立 stream 按 RFC 核对。
- HTTP/2 的 TCP 丢包队头仍存在；HTTP/3 减轻跨 stream 传输队头，但仍有拥塞/流控/兼容成本，不能承诺实际速度。
- gRPC 服务/方法与常见 HTTP/2 传输、protobuf field number 兼容、unary/streaming 的责任分开；纸上内部方法不是当前教学 S2 已实现 RPC。
- 审阅修正 `grpc-status` **线上为数字**（`0` 表 OK），客户端 `DEADLINE_EXCEEDED` 未必作为同一尾部字段到达；HTTP 200、RPC OK、S2 `accepted_in_memory` 是三层不同结果。
- gRPC deadline/取消不回滚已发生的业务改动，流式写交框架不等于对端处理；当前同 ID 409 不能因为库有 retry 就变幂等。
- 兼容矩阵按客户端/代理/服务端版本、旧端、模式字段号、流控、错误映射与授权评审；22 题分协议、状态、决策三层。

## 权威核对与边界

- 以 RFC 9113/9114/9000、gRPC 官方 core/status/flow/retry/HTTP2 协议、Protobuf 官方模式指南和 Go `net/http` 文档核对；没有运行 HTTP/2/3、gRPC、Go 或 IM 服务。
- 当前 S2 `/v1` 6 UTF-8 B、重复 409、非成员 404 与进程内存 200 未因协议示例被改写。
- 下一章 04.11 讲转发/NAT/MTU 和无线/移动可达性。
