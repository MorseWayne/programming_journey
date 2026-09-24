# DeepTutor 09.11 生成与审阅记录

## 生成材料

- DeepTutor 书籍 `bk_fd253f0c2f`、正文页 `pg_8cdc6a000f`；8 个正文块 ready、失败块 0。HTTP Markdown 导出与容器 `generated.md` 的 SHA-256 相同。
- `original.md` 原样保留自动导览、重复小节和多套互相冲突的接口预期；`reviewed.md` 是按 09.02 当前合同与待审 R9 分别重算后的静态课程，已同步正式页。`generation_request.json` 保存八节要求。
- 本地 BookEngine 使用进程内参数适配，没有修改 DeepTutor 持久配置。

## 技术与教学审阅

1. 原稿虽然多次强调当前 6 B 与待审 R9 分开，却在若干后段把正文解释成“**恰好** 6 B 才合法”，甚至把成功 POST 写成 `201`、路径写成 `/v1/messages`。09.02 实际合同是**非空且最多 6 UTF-8 字节**、成功 POST `200 accepted_in_memory`、路径 `/v1/conversations/c-a/messages`；3 B 的 `好`和 6 B 的`你好`均可接受，9 B 的`你好呀`拒绝。审阅稿统一这组事实并补齐拒绝后内存状态。
2. 编写本章时还发现旧章口径漂移：06.01/06.02/09.05/09.08 曾误把工程卷拟议 R9 的 9 B 上限当成 09.02 当前 S2 HTTP 合同。本轮将应用/数据库教学基线统一为 6 B，10.09 明确 R9 是待审 PR；相关审阅稿和来源哈希逐一重建。09.02 错误表新增 `400 TOO_LONG`，与当前业务正文超 6 B 的预期对齐。
3. Go `httptest.NewRequest`/`NewRecorder`/`Result` 只直调并观察 handler，不走真实 TCP/TLS；`NewServer` 走隔离 HTTP 网络仍不是生产服务。测试主体由私有装配提供，不在公开 handler 留伪造身份的测试后门。断言状态、头、稳定 JSON、存储变化/不变与敏感字段，不能只看是否 `200`。
4. 单元/可控 fake、handler、隔离数据库、端到端各有证据范围。fake 可触发依赖错误但不证明真实约束/驱动；隔离数据库能核对参数、排序、事务与迁移却不证明浏览器/设备结果。提交阶段断网的未知状态需要受控故障证据，纸上分析不能写成已运行通过。
5. 授权测试沿 09.07 主体/动作/对象矩阵：非成员 `u-c` 访问 `c-a` 按当前隐藏政策返回 404；无认证 401；已知成员被禁动作 403；伪造 sender、改变对象 ID、注销旧凭据/WS 和 CSRF 另列负例。附件与链接预览尚未实现，09.08 的纸上防护不能在测试报告中勾为已验证。
6. CI/交付证据需有提交 SHA、Go/数据库版本、命令、虚构种子、合同版本、预期/实际与未验证项；缓存不当制品。学习者未来运行结果要另存，不用静态教材伪造绿色报告。
7. 22 道练习从版本真值到 httptest、失败后状态、安全负例和交付身份。没有运行 Go 测试、数据库、IM 服务、CI 或站点，也不宣称 OpenIM 的运行测试事实。

## 核对资料与验证范围

- [Go `testing`](https://pkg.go.dev/testing)、[`net/http/httptest`](https://pkg.go.dev/net/http/httptest)、[Go 测试教程](https://go.dev/doc/tutorial/add-a-test)：测试入口、Recorder 与测试服务器。
- [OWASP：授权测试](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Testing_Automation_Cheat_Sheet.html)、[ASVS](https://owasp.org/projects/asvs)：权限矩阵与安全验证依据。
- [Go：事务](https://go.dev/doc/database/execute-transactions)、[GitHub：工作流制品](https://docs.github.com/en/actions/concepts/workflows-and-actions/workflow-artifacts)：集成边界与证据身份。
- 本章只做文档结构、链接、来源哈希、隐私词及当前/拟议合同的纸上算例校核。
