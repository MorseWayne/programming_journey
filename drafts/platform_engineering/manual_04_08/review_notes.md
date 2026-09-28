# 04.08 审阅记录：Go 网络 I/O

## 来源与生成状态

- 2026-09-25 宿主机请求因误用容器专用 `host.docker.internal` 地址而收到 HTTP 502，正式页先经人工编写审阅。
- 2026-09-28 在 DeepTutor 容器内用同一请求生成 `bk_ddb1ff1737` / `pg_ef930e3741`；八块均为 `ready`，无失败块。实际请求逐字节归档在 `generation_request.json`，原稿在 `original.md`。本目录保留 `manual_04_08` 名称以记录正式页先经人工审阅。

## 单章覆盖与教学审阅

- 从 TCP 字节流没有业务消息边界进入。教学帧为 2 B 大端长度 `00 06` 加 `公告` 的 UTF-8 `E5 85 AC E5 91 8A`，合计 8 B；明确不是现行 IM/HTTP/WebSocket 线协议。
- `io.ReadFull` 的完整/零字节 EOF/部分 ErrUnexpectedEOF 区分清楚；先验证 n=1..6 再分配，坏帧后关闭或安全同步；HTTP 原始体 4096 B 与解码正文 6 B 是两道门。
- 短写按 n/err 处理，Writer 本地接受全部字节仍不等于 TCP 对端/业务受理；响应丢失与当前同 ID 409 不能变幂等成功。
- `SetReadDeadline/SetWriteDeadline` 为绝对时间并影响后续 I/O；`DialContext` 只约束建连，连成后不自动取消普通 Read。
- `net.Conn` 可并发调用方法不保证多次头/载荷写组成的应用帧不交错；连接池仍需边界、所有权、超时与权限。
- 从名称/连接/TLS/帧/HTTP/业务六层分类错误，22 题按帧基础、部分结果、并发/确认点三层。

## 原稿对账与修订

- 原稿开头正确使用 `00 06 | E5 85 AC E5 91 8A` 的 **2 B 大端长度头 + 6 B 正文**，后段却改成 **4 B 长度头**、另一节改用 ASCII/“你好”载荷，还提出 64 KiB 或 4096 B 的帧正文上限。正式页坚持一套 8 B 教学帧，标明不是当前 IM/HTTP/WebSocket 线协议；当前 HTTP 原始请求体 **4096 B** 与解码后正文 **6 B** 分开。
- 原稿后段建议未知结果携带稳定 `Idempotency-Key` 自动有限重试，并把现行重复 `409` 解释成既有幂等记录；当前 S2 同 ID 即使正文相同仍是 **409**，响应丢失不能据此证明首次成功或自动安全重发。正式页保留 `result_unknown` 的停点，未来操作记录/查询属新协议设计。
- 原稿正确解释 `io.ReadFull` 的零字节 EOF/部分 `ErrUnexpectedEOF`、先验长再分配、短写按 n 推进、deadline 的绝对时间及 `DialContext` 只管建连；正式页保留这些 API 前提，并以统一帧手算。
- 原稿重复小标题，混入多套帧格式和额度；正式页用“字节流→读帧→写帧→deadline/context→并发/连接池→错误分层”的初学者路径。

## 权威核对与边界

- 以 Go `io`、`net`、`net/http`、`context`、`encoding/binary` 和 `unicode/utf8` 官方文档核对；纸上 UTF-8 与帧十六进制经独立算术验证，DeepTutor 仅生成教材原稿。
- 未运行 Go、IM、HTTP/WebSocket、TLS 或站点；片段只用于理解 API 前置和失败状态，不声称已实现教学服务。
- 下一章 04.09 追踪代理/负载均衡与超时预算。
