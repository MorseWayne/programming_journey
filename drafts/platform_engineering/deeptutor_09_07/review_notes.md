# DeepTutor 09.07 生成与审阅记录

## 生成材料

- DeepTutor 书籍 `bk_5d357c4cb9`、正文页 `pg_9d0a65e522`；8 个正文块 ready、失败块 0。HTTP Markdown 导出与容器 `generated.md` 的 SHA-256 相同。
- `original.md` 原样保留自动导览、重复小节和多套成员角色假设；`reviewed.md` 统一 `u-a/u-b/u-c/c-a/m-a` 与当前成员政策后同步正式页。`generation_request.json` 保存八节要求。
- 本地 BookEngine 使用进程内参数适配，没有修改 DeepTutor 持久配置。

## 技术与教学审阅

1. 原稿在开头将 `c-a` 设为 A/B 的会话，结尾又称 A/C 的会话；有的表让 `u-b` 是管理员，有的段落用 A/C 解释权限。审阅稿固定 `u-a` 普通成员、`u-b` 会话管理员、`u-c` 已登录但非成员，所有读、发、管理、退群例子共用同一政策。
2. 先讲认证确定主体、授权判断具体动作/对象/当前状态，再讲凭据、会话、角色和撤销。对象 ID 是定位输入，不是授权凭证；修改 `conversation_id/message_id` 的 BOLA 负例要求服务端重新判该对象权限，不能只比请求体 `sender_id` 或是否已登录。
3. 口令存储按 OWASP 官方资料说明：不存明文或快速 SHA-256，使用带独立盐和成本参数的专用口令哈希，Argon2id 是当前推荐入口。Go `x/crypto/argon2.IDKey` 只是底层函数，不自动完成盐、格式、比较、迁移、限速和登录会话。
4. Cookie 只承载不可预测 Session ID，服务端映射主体并执行过期/撤销；Bearer 令牌被持有即可使用。JWT 签名有效不自动表示当前会话成员资格或令牌未撤销，退群/角色变更需另查权威状态或有界失效机制。原稿部分段落把 opaque token 的查询描述成“立刻生效”，审阅稿要求写明后端状态与权限缓存的最长陈旧边界，不把设计意图冒充运行结果。
5. 登出当前设备、登出所有设备、退群和会话内管理员降权分别建表；退群撤销 `c-a` 资源权限却不注销 `u-a` 身份。旧 WebSocket 在建连后仍须逐操作检查或按有明确延迟上界的撤销机制失效。09.06 的 CSRF/浏览器来源与本章资源授权不是同一个检查。
6. 错误按无凭据、已认证无权、对象不可见、依赖故障和提交结果未知分类；对外可按合同统一防枚举，但内部不丢分类。日志不存原始密码、Session ID、Bearer Token 或消息正文，只留受控关联与结果。
7. 22 道练习覆盖认证/授权、密码哈希、Session/Token、对象级权限、旧连接与多设备撤销。本章没有运行 Go、登录服务、IM、数据库、浏览器或站点；不声称检查了 OpenIM 认证源码。

## 核对资料与验证范围

- [OWASP：认证](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)、[口令存储](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)、[Session](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)、[授权](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)和[对象级授权失效](https://api-security.owasp.org/editions/2023/en/0xa1-broken-object-level-authorization/)：身份、凭据和逐对象权限。
- [OWASP：JWT](https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_Cheat_Sheet.html)、[Bearer 标准](https://www.rfc-editor.org/rfc/rfc6750)、[Go Argon2](https://pkg.go.dev/golang.org/x/crypto/argon2)：令牌持有/撤销与 Go 算法入口。
- 本章只做文档结构、链接、来源哈希、隐私词和纸上权限矩阵校核。
