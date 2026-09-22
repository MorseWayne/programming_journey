---
title: 11 服务启动、退出与发布
icon: /assets/icons/article.svg
order: 11
date: 2026-09-22
---

## 本课问题与前置

滚动更新成功，是否代表请求没有中断、状态没有丢失？前置：第 3、7、9–10 课。建议用时 4 小时。

目标：区分健康、就绪、流量路由和数据持久性，验证服务退出流程。

## 从进程到可服务状态

进程启动不等于依赖已初始化。**liveness**帮助判断进程是否需要重启；**readiness**帮助判断是否应接入新流量。暂时无法访问数据库不一定应该触发进程反复重启，探针策略要配合实际恢复方式。

退出通常需要停止接受新业务、处理在途请求、保存必要状态、释放资源。顺序由依赖关系决定。Kubernetes 的终止宽限期为应用清理提供时间，超时后仍可能强制结束；它不保证应用数据自动保存。[Pod 生命周期](https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/)

## 实验 A：无需集群的退出契约

```bash
cd labs/platform_path
go test -run '^TestHTTPIsolationAndDrain$' -v
go run ./cmd/server
```

另一个终端：

```bash
curl -i http://127.0.0.1:8097/readyz
curl -s http://127.0.0.1:8097/rewards \
 -H 'Authorization: Bearer lab-a-token' -H 'Content-Type: application/json' \
 -d '{"user":"u1","request_id":"r1","amount":10}'
```

预期 readyz 返回 200，奖励结果余额为 10。重复请求返回 duplicate=true。Ctrl-C 停止后重启，余额重新开始：当前 HTTP 服务使用内存 Ledger。这正好说明“优雅退出”与“业务持久化”不同。

自动测试验证 Drain 后 readyz=503、healthz=200。服务主函数使用 SIGTERM/Interrupt 触发 Shutdown，最多等待五秒。请求处理函数仍需遵守自己的取消和提交约定。

## 实验 B：有条件的 Kubernetes 练习

需要 Docker、kubectl、kind 和一个你自己创建的本地实验集群。先完成 A，再执行：

```bash
docker build -t arena-lab:local .
kind create cluster --name arena-course
kind load docker-image arena-lab:local --name arena-course
kubectl --context kind-arena-course create namespace arena-course
kubectl --context kind-arena-course -n arena-course apply -f k8s/deployment.yaml
kubectl --context kind-arena-course -n arena-course rollout status deployment/arena-lab
kubectl --context kind-arena-course -n arena-course port-forward service/arena-lab 8097:8097
```

固定 context 与 namespace，避免操作其他集群。清单使用一个副本；未接持久存储前，直接扩成两个副本会使余额和回执分裂。清单可以演示部署机制，不是生产高可用方案。

练习：重启 Deployment，观察端口转发、就绪状态和余额。记录中断时间，并解释哪些现象来自应用、哪些来自实验访问方式。缺少集群环境时，保留为“条件实验未执行”，不得用清单检查替代运行结果。

## 自定义服务发现的额外边界

如果客户端绕过 Kubernetes Service、直接读取 Etcd 节点，readiness 失败并不自动让该客户端停止选路。需要单独设计注册、摘除、连接排空和对象交接。服务发现与业务 owner 代次也要区分。

<details>
<summary>独立题：为什么 preStop 中 sleep 几秒不能证明无损发布？</summary>

传播和在途请求时间不固定；客户端可能保留旧连接，状态写入也可能晚于等待时间。应该定义可观测的排空条件、最大等待预算和强制退出后的恢复机制。

</details>

达标证据：退出时间线、内存状态丢失实验、发布与回滚检查表。下一课：[平台契约](./12_platform_design.md)。
