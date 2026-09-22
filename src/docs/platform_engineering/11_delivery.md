---
title: 11 生命周期与发布：从进程启动到业务可用
icon: /assets/icons/article.svg
order: 11
date: 2026-09-22
---

[阶段五导读](./stages/05_platform.md) · 前置：[取消](./03_concurrency.md)、[恢复](./07_cache_recovery.md)、[归属](./09_distributed_state.md)、[指标](./10_observability.md)

## 需求场景：更新镜像之后，匹配短暂异常

发布系统显示滚动更新完成，但玩家请求仍可能落到旧节点，新的房间 owner 也可能尚未恢复状态。进程、路由、状态与用户结果各有自己的变化时间。

本课先理解部署对象和探针，再推导可解释的启动与退出顺序。第一轮在本地完成 HTTP 实验，具备环境后再进入集群实践。

## 基础理论：镜像、容器、Pod 与服务

镜像封装程序与运行所需文件；容器是基于镜像启动的受隔离进程环境。容器重启不等于内存继续存在，本地文件是否保留则取决于实际存储方式。

Pod 是 Kubernetes 调度和管理的一组容器运行单元。Deployment 维护期望的副本与更新过程；Service 提供访问后端实例的抽象。它们解决部署和路由的一部分问题，不会替应用共享余额或恢复内存房间。

将内存 Ledger 直接扩成两个副本，会出现两份各自独立的余额和去重记录。部署了多个实例，并不自动获得正确的多副本业务语义。

### 资源请求与限制

资源 request 参与调度，limit 约束运行使用。CPU 受限可能增加排队与延迟，内存超限可能触发进程终止。配置应来自测量和运行目标，课程清单中的数值只是本地演示起点。

## 探针回答不同问题

| 探针 | 关心什么 | 设计错误的后果 |
|---|---|---|
| startup | 启动过程是否已完成到允许后续探测的阶段 | 慢启动被过早当故障 |
| readiness | 当前实例是否应该接受新流量 | 未恢复完成就接请求 |
| liveness | 是否需要重启来恢复实例 | 下游短故障引发所有实例反复重启 |

短暂数据库不可用时，重启进程未必解决问题。探针应与实际恢复方式一致；还需要区分整个服务的依赖故障与单实例自身失效。

Kubernetes 的探针和终止行为可核对 [Pod 生命周期](https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/)。应用仍负责定义“准备好”和“清理完成”的业务含义。

## 机制推导：启动必须建立完整状态

一个有状态服务可能需要：加载配置 → 连接依赖 → 恢复检查点和日志 → 校验状态 → 注册可接流量 → 开放处理。

不能只因为监听端口已打开就声明业务就绪。若恢复阶段还会修改对象，过早接收请求可能让新操作与恢复重放交错。

启动顺序还形成依赖关系。组件退出通常要按依赖反向安排，例如工作线程停止使用存储后，才能关闭存储连接。若先关数据库再等待任务落盘，清理过程自己就会失败。

## 退出需要讨论哪些并发过程

退出时通常发生三类事情：通知路由不再选择该实例，停止本机接收新业务，等待或记录在途任务。传播、连接复用和请求执行并不同步。

```text
发出退出意图
  → 本机拒绝新业务，同时触发摘流
  → 处理在途请求或留下恢复记录
  → 完成必要持久状态
  → 释放资源并退出
```

这是需要协调的责任关系，并非对所有架构都适用的固定命令顺序。终止宽限期提供时间预算，超时后仍可能被强制结束，因此第 7 课的异常恢复不可省略。

### 自定义服务发现需要额外验证

如果客户端绕过 Service，直接根据 Etcd 列表选节点，那么 readiness 变化不会自动让它停止直连。需检查注册状态传播、resolver 缓存、旧连接、重试选路和对象交接。

同样，删除注册记录只是影响未来选路，不会撤销已经送达的请求；有状态写入仍需 owner 协议和存储保护。

## 实验一：本机观察就绪与内存重启

```bash
cd labs/platform_path
go test -run '^TestHTTPIsolationAndDrain$' -v
go run ./cmd/server
```

另一个终端发送：

```bash
curl -i http://127.0.0.1:8097/readyz
curl -s http://127.0.0.1:8097/rewards \
 -H 'Authorization: Bearer lab-a-token' -H 'Content-Type: application/json' \
 -d '{"user":"u1","request_id":"r1","amount":10}'
```

初次奖励余额为 10；再次使用同一请求，返回原结果并标记重复。Ctrl-C 后重新启动，再发同样请求，它会作为新进程中的首次操作，因为当前服务未接持久存储。

单元测试验证 Drain 后 readyz 返回 503，而 healthz 仍为 200。进程主函数在收到 Interrupt 或 SIGTERM 后先 Drain，再调用 Shutdown 等待，最长五秒。该测试不等同于真实信号和网络路径验证，做实验时分别记录。

## 实验二：本地 Kubernetes 条件练习

需要 Docker、kubectl、kind 和足够资源；下面明确使用个人实验 context：

```bash
docker build -t arena-lab:local .
kind create cluster --name arena-course
kind load docker-image arena-lab:local --name arena-course
kubectl --context kind-arena-course create namespace arena-course
kubectl --context kind-arena-course -n arena-course apply -f k8s/deployment.yaml
kubectl --context kind-arena-course -n arena-course rollout status deployment/arena-lab
kubectl --context kind-arena-course -n arena-course port-forward service/arena-lab 8097:8097
```

该清单只有一个副本。观察部署、就绪、请求与内存状态，再主动重启这个实验 Deployment，记录中断与恢复。端口转发本身也可能随目标 Pod 退出而中断，应重新建立并区分其影响。

```bash
kubectl --context kind-arena-course -n arena-course rollout restart deployment/arena-lab
kubectl --context kind-arena-course -n arena-course rollout status deployment/arena-lab
```

缺少集群时，标记本实验未执行；可以先完成本机部分，但不能把 YAML 存在当成无损发布的证据。

## 业务应用：发布与回滚分别验收

发布奖励服务前，确认新旧版本能读写哪些数据，灰度影响哪些租户，怎样测量重复效果、超时和积压。停止条件应具体，例如新增冲突、恢复失败或业务指标超出约定。

回滚二进制不自动撤销新版本写入的数据。若新版本改变存储结构、枚举含义或业务状态，旧版本可能无法解释，需要先设计兼容读取与数据恢复。

<details>
<summary>反馈：preStop 中 sleep 几秒为何不构成无损证明？</summary>

等待可能给传播留出时间，但传播和在途工作没有固定上界。要观察实际摘流、排空和持久状态，并定义超时后的恢复路径。一次无错误发布也不能覆盖所有连接和故障时序。

</details>

交付一条启动/退出时间线、本机实验记录和发布回滚条件。下一课：[平台契约与租户](./12_platform_design.md)。
