# 12.04 审阅记录：集群控制模型

DeepTutor BookEngine 八节初稿均 ready、无失败块；本地 HTTP Markdown 导出与生成稿 SHA256 一致。`original.md` 保存完整初稿。正式页以未来三副本网关的 t0–t4 纸上故障，先讲对象/spec/status，再沿 Deployment→ReplicaSet→Pod→scheduler→Node/kubelet→Readiness 追控制链，并用跨 Pod 重复 409 守业务边界，附 22 道分层练习。

## 教学重组

- `Deployment.spec.replicas=3` 是期望，不是同步已运行或已 Ready 的事实；对象 status 与就绪、业务有权请求分别取证。
- t0 三 Pod Ready；t1 **P1 被删除**、Ready=2；t2 ReplicaSet 补建 P4 但未绑定 Node；t3 调度器选 Node；t4 kubelet运行且应用就绪后 Ready=3。所有时刻均为理想纸上观察，没有固定恢复时长。
- Pod 替代产生新 UID、可能新 IP/Node/进程内存；旧 WebSocket 断开，当前 S2 `m-a` 的内存受理不自动复制。未来 S3 权威 `m-9/seq9` 与 B 设备 ACK 仍是独立提议/确认。
- 多副本应用若只靠各 Pod 本地内存判重，A 的响应丢失后重试落到 P2/P4 不保证同 ID 409；平台恢复副本数不能替应用设计跨 Pod 身份裁决。

## 技术修订

- 初稿多处将 `Ready=2` 直接写成控制器一定补建 P4，混淆“原 Pod 被删除/不再计数”和“原 Pod 仍存在、仅 Readiness 失败”。正式页限定 t1 为 **Pod P1 被删除**；仅不 Ready 时容器可能在同一 Pod 内恢复，ReplicaSet 未必另建 Pod。
- 初稿把 `spec.replicas=3` 表述为“希望维持 3 个可用/Ready 副本”。Deployment/ReplicaSet 维护的是 Pod 副本与模板，是否 Ready 还取决于调度、容器和探针；正式页将这几类状态分栏。
- 初稿把 Pending 简化为“必定未绑定 Node”。Kubernetes Pod 可在已绑定后仍处 Pending，例如镜像拉取阶段；正式页的 t2 特意写“P4 尚未绑定”，排障表则区分未绑定和已绑定未启动。
- 初稿有“相同副本来自三台固定机器/容器自动持久”的风险。正式页明确没有放置策略不能推断三台 Node，Pod UID/内存/连接不跨替换；N−1 余量需后续验证。
- 固定 OpenIM 两处源码只支持所读发送与 Mongo 消费的异步边界，不证明真实 Deployment、Pod、探针或用户恢复。

## 静态边界与同步

- 没有运行 Kubernetes、kubectl、Go、IM、容器部署或站点；所有对象、状态与时间线均为纸上案例。
- 同步正式页、12.03 下一章链接、第十二卷目录、总目录、侧边栏、学习路线、能力验收与来源散列。
