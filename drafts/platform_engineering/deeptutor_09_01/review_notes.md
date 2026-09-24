# DeepTutor 09.01 生成与审阅记录

## 生成材料

- DeepTutor 书籍 `bk_f19972c5a1`、正文页 `pg_9e7766a0e4`；8 个正文块 ready，失败块 0。HTTP Markdown 导出与容器 `generated.md` 的 SHA-256 相同。
- `original.md` 保留自动导览、重复小节和原始用例；`reviewed.md` 是统一 S2 教学承诺、身份与状态后的静态教材，已同步正式页。`generation_request.json` 保存八节要求。
- 本地生成使用 BookEngine 与进程内参数适配，没有修改 DeepTutor 持久配置。

## 技术与教学审阅

1. 原稿在前半段把成功定义为“进程内存受理”，后半段却多次改成“消息已持久化、重启可查”，并引入数据库、离线与幂等实现。审阅稿固定 S2 只到本进程内存状态；S3/S5 才分别展开持久化、重试与多端保证。
2. 两张用例卡从“读 `c-a` 历史”和“`u-a` 提交 `m-a`”出发，区分输入、可信主体、对象级读/写权限、正常结果、拒绝与状态。固定虚构主体仅用于隔离教学，不能公开部署成无认证接口。
3. 请求 JSON 中的 `sender_id`、`is_member` 不得作为可信身份或权限；`SendDTO` 不接受 `sender_id`，服务端从认证边界填 `ActorID`，从已知会话状态取得 `kind`。原稿某些例子直接信任客户端声明或以多种接口字段混用，审阅稿统一。
4. 网络原始请求上限、10.01 的单条正文 6 字节上限、01.12 的本地 v1 文件 1 MiB 上限分别说明，不用一个 `maxBytes` 偷换三种资源范围。查询范围、空列表和分页不等于完整历史。
5. 拒绝前不改状态；同会话重复 `(c-a,m-a)` 在一个内存临界区拒绝并保留旧值。响应丢失可能使客户端结果未知，不能据此推断内存状态未改变，也不预设特定跨节点幂等方案。
6. 原稿部分源码对照扩展为“已鉴权→已写数据库→可投递”的路径事实。审阅稿直接复核固定 OpenIM 提交 `SendMsg`：仅 `req.MsgData` 存在性及 `SessionType` 分支是本章采用的已读事实；不从该入口推断授权、持久性、投递或已读。
7. 22 道练习从用例、主体/权限、DTO/领域、错误到确认点递进。未运行 Go、网络、数据库、测试或站点构建，也未声称课程服务已经实现。

## 核对资料与验证范围

- [OWASP ASVS](https://github.com/OWASP/ASVS)、[授权检查指南](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)：应用授权需求。
- [RFC 9110](https://datatracker.ietf.org/doc/html/rfc9110)、[Go `net/http`](https://pkg.go.dev/net/http)：后续传输设计前置。
- [OpenIM 固定提交 `SendMsg`](https://github.com/openimsdk/open-im-server/blob/f6411a8a1a31d3df36f4c2b3ad28481a94141e1f/internal/rpc/msg/send.go#L34)：本章限定的公开源码对照。
- 本章只做文档结构、链接、来源哈希和决策表/状态机静态推导检查。
