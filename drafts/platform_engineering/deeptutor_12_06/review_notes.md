# 12.06 审阅记录：资源与持久存储

DeepTutor BookEngine 八节初稿均 ready、无失败块；本地 HTTP Markdown 导出与生成稿 SHA256 一致。`original.md` 保存完整初稿。正式页先用 Node requests/allocatable 手算调度，再区分运行时 CPU/内存 limits、OOM/驱逐、emptyDir/PV/PVC、RWO/RWOP 和 S2/S3/B 分层恢复，附 22 道分层练习。

## 教学重组

- N1 allocatable 2 CPU/4 GiB，已有 requests 1.7 CPU/3 GiB；gateway 新请求 0.5 CPU/0.5 GiB → CPU 2.2>2 不能放，内存 3.5<4 可放。即使实际 CPU 很空，调度仍按 requests 账本；N2 若各约束有余量才可被选。
- CPU limit 1 核可造成 cgroup 节流，一般不因单纯超 CPU 直接杀进程；memory limit 1 GiB 接近时可能回收或 OOM，须结合 `memory.events`、Pod 退出/驱逐和用户结果。
- `emptyDir` 与具体 Pod UID 同寿命，容器在同 Pod 内重启可保留，Pod P1 替代为 P4 不继承。PV 是集群存储对象，PVC 是命名空间申请，Bound/挂载不证明未来 `m-9/seq9` 事务与备份。
- RWO 允许单 Node 读写，不等于全局单 Pod；RWOP 在支持的 CSI 场景约束单 Pod，仍不提供 DB 仲裁/复制/唯一性。

## 技术修订

- 初稿起步示例用已有 requests **1.5 CPU**、新请求 **0.5 CPU** 刚好可放，后文又切换到已有 **1.7 CPU**、合计 **2.2>2** 的不可调度模型。正式页只用后一组统一算式，清楚解释 CPU 维阻塞和 N2 条件。
- 初稿将 request 叫“已承诺资源”，容易让人理解成每秒保证整额 CPU；正式页按 Kubernetes 文档区分调度准入、争用权重与实际运行/限制，不从 request 推业务 SLO。
- 初稿一处将未来 S3 数据库日志写成已存在的恢复权威，还给当前 S2 加上 `emptyDir` 缓存/队列实现。正式页只守 S2 本进程内存受理合同；DB/卷/日志为未来提议或纸上情景。
- 初稿对 QoS/Guaranteed 的部分描述像“不会被驱逐或 OOM”。正式页明确 QoS 只影响节点压力驱逐风险，自己的 limit、节点故障和业务数据恢复仍有独立边界。
- 初稿多处用 `OOMKilled` 与退出码 137 直接定因。正式页要求 cgroup 事件、Pod reason、Node 压力和时间窗交叉核对，不把 CPU 节流、容器 OOM 与节点驱逐混为一类。
- 固定 OpenIM 两处源码只支持所读发送与 Mongo 消费异步边界，不证明真实 request/limit、PV/PVC 或 OOM。

## 静态边界与同步

- 没有运行 Kubernetes、kubectl、Go、IM、DB、存储或站点；所有 Node/Pod/卷值为纸上案例。
- 同步正式页、12.05 下一章链接、第十二卷目录、总目录、侧边栏、学习路线、能力验收与来源散列。
