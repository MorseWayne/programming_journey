# 12.08 审阅记录：启动、探针与退出

DeepTutor BookEngine 八节初稿均 ready、无失败块；本地 HTTP Markdown 导出与生成稿 SHA256 一致。`original.md` 保存完整初稿。正式页以未来 P1→P4 网关摘流为纸上案例，解释 startup/readiness/liveness、EndpointSlice `ready/serving/terminating`、preStop/TERM 宽限、Go HTTP 与 WebSocket 分别排空，以及 S2/S3/B 确认，附 22 道分层练习。

## 教学重组

- startup 首次成功前抑制 liveness/readiness；readiness 失败通常从常规新流量后端移出但不杀容器；liveness 达失败门可重启，不能把共享 DB 抖动直接变成所有网关重启。
- 纸上总宽限 40 秒，preStop 目标最多 5 秒、应用排空计划 30 秒、留 5 秒余量；preStop **算在**宽限期内，端点传播与 kubelet 信号并行/异步，应用还要自身停止新工作。
- Go `http.Server.Shutdown` 管普通 HTTP，不自动等待 hijacked WebSocket；长连接会话登记、关闭通知、剩余任务/期限与客户端有权补拉归应用。
- P1 当前 S2 的 `m-a` 仅内存受理、响应可能丢失，P4 不继承；跨 Pod 重复 409 要统一身份裁决，未来 S3 权威与 B 设备 ACK 独立取证。

## 技术修订

- 初稿后段用 `S1/S2/S3/S4` 给网关 Pod 编号，与本系列 S2 当前受理、S3 未来 DB 的阶段含义冲突。正式页只用 P1/P4 表示 Pod，S2/S3 只表示业务阶段。
- 初稿曾假设“S2 已将 m-a 转发给 B”及“设备 ACK 可由本地记录判断”，超出当前 S2 200 合同。正式页只说进程内存受理，B 设备处理仍需另证。
- 初稿把“先 readiness 失败→端点移除→preStop→TERM”写成必然严格顺序。Kubernetes 终止流程在控制面与节点并行，端点传播并非同步屏障；正式页用并行时序与应用自己的 draining 门。
- 初稿使用上传、支付等其它业务举例，正式页统一回到 A 发送、B 长连接/补拉与 `m-a/m-9`。
- 初稿有“preStop sleep 满 40 秒就必立刻 SIGKILL”与“readiness fail 绝不再有新流量”的过度绝对说法。正式页写预算风险、端点传播/代理及选项例外，不给零新流量或零丢包保证。
- 固定 OpenIM 两处源码只支持所读发送与 Mongo 消费的异步边界，不证明实际探针、宽限期、端点状态或 WebSocket 排空。

## 静态边界与同步

- 没有运行 Kubernetes、kubectl、Go、IM、部署或站点；所有时间与 Pod 状态是纸上教学输入。
- 同步正式页、12.07 下一章链接、第十二卷目录、总目录、侧边栏、学习路线、能力验收与来源散列。
