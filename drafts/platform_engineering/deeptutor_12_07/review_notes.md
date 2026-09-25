# 12.07 审阅记录：配置与权限

DeepTutor BookEngine 八节初稿均 ready、无失败块；本地 HTTP Markdown 导出与生成稿 SHA256 一致。`original.md` 保存完整初稿。正式页按未来 gateway/transfer/history-migrate/db/events 角色，逐层分离非秘密配置、Secret、工作负载 API 身份/RBAC、网络连接与 IM 成员授权，附 22 道分层练习。

## 教学重组

- ConfigMap 只承载非秘密配置；Secret 用于敏感材料但 base64 可还原，实际集群还需审 etcd 静态加密、访问/工作负载创建权、注入与日志泄漏。
- ServiceAccount 是 Kubernetes 工作负载/API 身份，不自动成为 DB 用户或 IM 用户；Role/Binding 管 Kubernetes API 对象/动词，授权累加无普通 deny。
- Pod 通过引用挂载 Secret 不要求应用 SA 主动 `get/list secrets`；能在同一命名空间创建 Pod/Deployment 的主体可能间接读取可挂 Secret，须审工作负载创建权。
- NetworkPolicy 要网络插件实施；入站/出站方向分别隔离，允许规则累加，源 egress 与目标 ingress 都需允许。它只管网络连接，不会把非成员 `u-c` 变成 `c-a` 成员。
- ConfigMap env 改动不自动改变旧进程；投影卷更新需传播/应用重读，subPath 有例外。配置不能把当前 `/v1` 的 6 B 偷偷改为待审 R9 9 B。

## 技术修订

- 初稿多处把 **R9** 叫“数据库提议”或“群成员上限变化”；本系列 R9 固定只表示**消息正文 6→9 UTF-8 B 待审**，S3 教学 DB 是独立未来方案。正式页和练习均守这个边界。
- 初稿早段暗示 gateway SA 应有读取某 Secret 的 `get` 权限，后段又解释挂载并不要求此权限。正式页统一分“节点按 Pod 引用注入”与“应用主动调用 API 读 Secret”，不默认给运行 SA `get/list secrets`。
- 初稿有把 NetworkPolicy 选择器写成直接按 ServiceAccount 限定的句子。标准 NetworkPolicy 以 Pod/namespace/IP/端口等匹配网络，不能把 SA 或 IM 用户成员身份当成原生 L3/L4 裁决；正式页不使用该暗示。
- 初稿给出可解码的密码/base64 示例、实际样式的 Secret/RBAC 清单和命令。正式页只用非秘密配置名/秘密引用的纸上矩阵，不提供或外发真实凭据/可误部署配置。
- 初稿有“Secret 已存在/NetworkPolicy 已创建就安全”的表述。正式页要求验证实际插件实施、双向连通、Pod 创建的间接取密风险，以及应用 `u-c` 非成员 404。
- 固定 OpenIM 两处源码只支持选定发送与 Mongo 消费异步边界，不证明真实 SA/RBAC/Secret/NetworkPolicy 或业务授权实现。

## 静态边界与同步

- 未创建 Kubernetes 对象、运行 Go/IM、部署或构建站点；没有真实秘密或用户资料。
- 同步正式页、12.06 下一章链接、第十二卷目录、总目录、侧边栏、学习路线、能力验收与来源散列。
