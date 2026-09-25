# 12.05 审阅记录：工作负载与服务发现

DeepTutor BookEngine 八节初稿均 ready、无失败块；本地 HTTP Markdown 导出与生成稿 SHA256 一致。`original.md` 保存完整初稿。正式页从未来虚构 gateway/transfer/db/history-migrate 的状态责任出发，依次解释 Deployment、StatefulSet、Job、Service/DNS/EndpointSlice、Ingress 和四个业务反例，附 22 道分层练习。

## 教学重组

- gateway Deployment+Service 只维持可替换入口；WebSocket 断线、当前 S2 本地内存 `m-a` 与跨 Pod 重试 409 仍需应用设计。
- transfer 若外部检查点/分区归属可安全接管，可以考虑 Deployment；Pod 可替换不等于消费恰好一次、顺序与去重已解决。
- 自管 db 若需要稳定 Pod 身份/PVC 可考虑 StatefulSet，但复制、仲裁、事务、备份、授权和恢复另验；外部数据库也是状态责任选项，本章不作采购建议。
- 一次性 history-migrate 可考虑 Job；即使单并行/单完成也可能重复启动，必须有稳定任务范围、幂等写、检查点和双向对账。Service/DNS 稳定入口不迁移旧 TCP；Ingress HTTP(S) 规则依控制器实现。

## 技术修订

- 初稿开头把当前 S2 `/v1` 的重复 409/非成员 404 说成“最终依赖可共享数据库的一致事实”。当前课程 S2 仅本进程内存受理；正式页只说**将来多 Pod 部署时**要有可验证的统一身份/权限裁决，不能倒推当前已接 DB。
- 初稿中段换成订单、账目、客户等泛业务 Job 示例，还给出很宽泛的数据修复权限。正式页统一用 `c-a/m-9/seq9` 的有权历史回填，强调最小任务范围、权限与对账。
- 初稿有“Ready Pod 必然被 Service 转发”和“Service 只转发新连接”的绝对表述。正式页按 EndpointSlice 的 ready/serving/terminating 与 Service 选项保留例外，并只说既有长连接不能透明迁移；实际路由依实现和时间窗。
- 初稿建议自管 DB 的场景与团队能力标准过于像产品推荐，且脱离学习者未有实际环境的前提。正式页只对照 StatefulSet 能提供的身份/卷与数据库本身要承担的保证，不给购买结论。
- Ingress 只解释 HTTP(S) 外部路由且需要控制器；任意 TCP 与 WebSocket 长连接的具体实现待选定入口后验证，不从 API 对象推已可用。
- 固定 OpenIM 两处源码只支持所读发送与 Mongo 消费的异步边界，不证明真实 Kubernetes 对象或本课程部署。

## 静态边界与同步

- 没有运行 Kubernetes、kubectl、Go、IM、数据库、Job、部署或站点；所有工作负载与流量路径是纸上方案。
- 同步正式页、12.04 下一章链接、第十二卷目录、总目录、侧边栏、学习路线、能力验收与来源散列。
