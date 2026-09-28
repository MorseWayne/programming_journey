# 04.10 审阅记录：HTTP 版本与 RPC

## 来源与生成状态

- 2026-09-25 宿主机请求因误用容器专用 `host.docker.internal` 地址而收到 HTTP 502，正式页先经人工编写审阅。
- 2026-09-28 在 DeepTutor 容器内用同一请求生成 `bk_2d89e2c246` / `pg_0c5eb7cbc5`；八块均为 `ready`，无失败块。实际请求逐字节归档在 `generation_request.json`，原稿在 `original.md`。本目录保留 `manual_04_10` 名称以记录正式页先经人工审阅。

## 单章覆盖与教学审阅

- 将应用 URL `/v1`、HTTP/1.1、未来应用 `/v2` 和 HTTP/2 明确分开；HTTP/1.1 复用/管线、HTTP/2 同 TCP 多 stream 及 stream/connection 流控、HTTP/3 QUIC 独立 stream 按 RFC 核对。
- HTTP/2 的 TCP 丢包队头仍存在；HTTP/3 减轻跨 stream 传输队头，但仍有拥塞/流控/兼容成本，不能承诺实际速度。
- gRPC 服务/方法与常见 HTTP/2 传输、protobuf field number 兼容、unary/streaming 的责任分开；纸上内部方法不是当前教学 S2 已实现 RPC。
- 审阅修正 `grpc-status` **线上为数字**（`0` 表 OK），客户端 `DEADLINE_EXCEEDED` 未必作为同一尾部字段到达；HTTP 200、RPC OK、S2 `accepted_in_memory` 是三层不同结果。
- gRPC deadline/取消不回滚已发生的业务改动，流式写交框架不等于对端处理；当前同 ID 409 不能因为库有 retry 就变幂等。
- 兼容矩阵按客户端/代理/服务端版本、旧端、模式字段号、流控、错误映射与授权评审；22 题分协议、状态、决策三层。

## 原稿对账与修订

- 原稿多处写 `grpc-status=OK`，把 API 里的状态名当成 HTTP/2 线上尾部字段；[gRPC over HTTP/2 官方协议](https://github.com/grpc/grpc/blob/master/doc/PROTOCOL-HTTP2.md)规定线上 `grpc-status` 为十进制数字，成功是 **0**。正式页使用 `grpc-status=0`，并区分客户端 `DEADLINE_EXCEEDED` 可能在本地生成，不保证收到同名尾部字段。
- 原稿说相同 `message_id`、相同正文重复提交“可返回原结果或 409”，并以稳定 ID、服务端去重推断自动重试安全；当前 S2 即使同正文也必须回 **409**，没有持久结果复用保证。正式页让写操作超时停在未知，另将可查询结果/幂等重放列为未来方案。
- 原稿一处把 `accepted_in_memory=true` 解释成“已放入内存但未必获成员批准”，容易把已通过当前 HTTP 应用校验的成功响应与假设的内部 RPC 阶段混成一层。正式页明确纸上内部方法不是现有实现，HTTP 200、RPC 状态与 IM 业务结果要分别定义。
- 原稿对应用 `/v1` 与 HTTP/1.1、HTTP/2 TCP 队头、HTTP/3 QUIC 跨 stream 收益及流控的主线基本正确；正式页保留渐进讲解和没有运行协议/性能测试的边界。

## 权威核对与边界

- 以 RFC 9113/9114/9000、gRPC 官方 core/status/flow/retry/HTTP2 协议、Protobuf 官方模式指南和 Go `net/http` 文档核对；DeepTutor 仅生成教材原稿，没有运行课程里的 HTTP/2/3、gRPC、Go 或 IM 服务。
- 当前 S2 `/v1` 6 UTF-8 B、重复 409、非成员 404 与进程内存 200 未因协议示例被改写。
- 下一章 04.11 讲转发/NAT/MTU 和无线/移动可达性。
