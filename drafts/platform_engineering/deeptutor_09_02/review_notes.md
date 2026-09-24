# DeepTutor 09.02 生成与审阅记录

## 生成材料

- DeepTutor 书籍 `bk_02297197e8`、正文页 `pg_1a20138541`；8 个正文块 ready、失败块 0。HTTP Markdown 导出与容器 `generated.md` 的 SHA-256 相同。
- `original.md` 保留自动导览、重复小节及不同版本的原始接口设想；`reviewed.md` 是统一合同后接入课程的静态教材。`generation_request.json` 保存八节要求。
- 本地生成使用 BookEngine 与进程内参数适配，没有修改 DeepTutor 持久配置。

## 技术与教学审阅

1. 原稿出现互相冲突的默认页大小 50/20、POST 原始正文 16 KiB/64 KiB、正文 2000 Unicode 字符/其他限制、首次 POST 201/200。审阅稿固定 GET `limit` 默认 20、有效 1–100，HTTP 原始 JSON 上限 4096 B，领域正文 6 UTF-8 字节，S2 已完成内存变化的 POST 返回 200 `accepted_in_memory`。
2. 解释为什么当前未选择 201/202：没有承诺稳定新资源 URI，也不是仅安排异步处理；同时明确 201 本身**不等于**持久化成功。请求响应丢失不是 HTTP 500 或确定重复，客户端结果未知。
3. 单会话内存序号降序、`before` 排他游标、可选 `sender` 过滤的顺序和绑定关系固定。用 seq 3/2/1 与中途新 seq 4 推演分页，不把游标当永久快照、认证凭据或跨进程稳定位置。
4. 非成员对 `c-a` 采用 404 隐藏目标；已知成员但此动作被禁止可 403；401 需后续认证实现和 HTTP 挑战要求。重复同键固定 409，413 原始体超限，415 媒体类型不支持，406 明确拒绝 JSON 的 `Accept`，各自与内存前后状态对应。
5. 错误体是本课程**自定义** `application/json` 中的 `error.code/message`；RFC 9457 Problem Details 作为另一种可选格式，不能把字段相似或媒体类型改名当成已符合标准。稳定机器码与可变人类文本分开，诊断不泄露真实令牌、消息正文或堆栈。
6. `/v1` 网络 API、本地文件 `version:1`、请求原始字节上限和单条文本字节上限各属不同合同。私密历史响应选 `Cache-Control: no-store`，它不替代认证或 TLS。
7. 22 道练习从资源/方法到分页、状态、错误体、限额和未知结果递进；没有运行 Go、HTTP 服务、网络请求、测试或站点构建。

## 核对资料与验证范围

- [RFC 9110](https://datatracker.ietf.org/doc/html/rfc9110)：HTTP 方法、状态与表示语义。
- [RFC 9457](https://datatracker.ietf.org/doc/html/rfc9457)：若采用 Problem Details 的类型和媒体合同。
- [Go `net/http`](https://pkg.go.dev/net/http)、[OWASP 授权指南](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)：后续实现与对象级授权负例。
- 本章只做文档结构、链接、来源哈希、静态游标与状态表检查。
