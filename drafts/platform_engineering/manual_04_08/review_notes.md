# 04.08 审阅记录：Go 网络 I/O

## 来源与生成状态

- 2026-09-25 请求 DeepTutor BookEngine 生成八节中文深度课程；ideation 阶段五次 HTTP 502，90 秒后停止，没有 book/page/原稿。
- 本目录保存人工编写、审阅的静态 Go 网络章稿与生成请求；无 `original.md`，不声称 DeepTutor 已生成。端点恢复后生成原稿并审阅差异。

## 单章覆盖与教学审阅

- 从 TCP 字节流没有业务消息边界进入。教学帧为 2 B 大端长度 `00 06` 加 `公告` 的 UTF-8 `E5 85 AC E5 91 8A`，合计 8 B；明确不是现行 IM/HTTP/WebSocket 线协议。
- `io.ReadFull` 的完整/零字节 EOF/部分 ErrUnexpectedEOF 区分清楚；先验证 n=1..6 再分配，坏帧后关闭或安全同步；HTTP 原始体 4096 B 与解码正文 6 B 是两道门。
- 短写按 n/err 处理，Writer 本地接受全部字节仍不等于 TCP 对端/业务受理；响应丢失与当前同 ID 409 不能变幂等成功。
- `SetReadDeadline/SetWriteDeadline` 为绝对时间并影响后续 I/O；`DialContext` 只约束建连，连成后不自动取消普通 Read。
- `net.Conn` 可并发调用方法不保证多次头/载荷写组成的应用帧不交错；连接池仍需边界、所有权、超时与权限。
- 从名称/连接/TLS/帧/HTTP/业务六层分类错误，22 题按帧基础、部分结果、并发/确认点三层。

## 权威核对与边界

- 以 Go `io`、`net`、`net/http`、`context`、`encoding/binary` 和 `unicode/utf8` 官方文档核对；纸上 UTF-8 与帧十六进制经独立算术验证。
- 未运行 Go、IM、HTTP/WebSocket、TLS 或站点；片段只用于理解 API 前置和失败状态，不声称已实现教学服务。
- 下一章 04.09 追踪代理/负载均衡与超时预算。
