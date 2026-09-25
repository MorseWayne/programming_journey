---
title: 第 12 卷 · 容器、Kubernetes 与平台运行
icon: /assets/icons/server.svg
article: false
index: false
order: 12
date: 2026-09-23
---

## 本卷的定位与入口

先修：起步需要进程、网络与应用配置；学习容器机制前补齐隔离与资源限制，集群运行前具备基本服务目标。按[学习路线](../learning_path.md)，S3 只按实验需要解释本地环境，S6 从制品、单实例和本地多服务完整进入集群。

现有入门讲解：B04、C11；原内容仅基础清单与生命周期。A/B/C/D 的具体链接见[原有讲解索引](../../concept_map.md)。本卷把这一领域拆成独立章节，每章还需要分次阅读、推导和练习。

[阅读本卷专题讲义](./core.md) · [系列总纲](../README.md)

## 已完成的独立章稿

[12.01 运行环境与制品](./01_runtime_artifacts.md)已完成。它承接 01.09 的 Go 模块、10.08–10.10 的依赖/制品/回退及 03.11–03.12 的进程与资源边界，用虚构 IM 网关区分源提交、二进制、OCI 镜像、可变标签、内容摘要、运行配置和外部数据。[12.02 容器机制](./02_container_mechanisms.md)再把镜像层、容器可写层、volume、namespace/cgroup 与 PID 1 关停接到 IM 状态重建。[12.03 本地多服务环境](./03_local_multi_service.md)用服务名、端口、健康与就绪串起纸上 gateway/db/events。[12.04 集群控制模型](./04_cluster_control_model.md)用三副本网关说明 spec/status、控制器、调度与业务自愈边界。[12.05 工作负载与服务发现](./05_workloads_service_discovery.md)按 gateway、transfer、db 和迁移任务的状态责任选择对象及入口。[12.06 资源与持久存储](./06_resources_persistent_storage.md)手算 request/limit，区分 CPU 节流、OOM、Pod 临时卷与 PV/PVC。[12.07 配置与权限](./07_config_permissions.md)分清非秘密配置、Secret、SA/RBAC、网络策略与 IM 成员授权。[12.08 启动、探针与退出](./08_startup_probes_exit.md)用 P1→P4 摘流案例拆 startup/readiness/liveness 与有界排空。[12.09 发布与回滚](./09_release_rollback.md)以 D1→D2 纸上变更审滚动预算、金丝雀曝光与多轴回退。[12.10 扩缩容与故障域](./10_autoscaling_fault_domains.md)手算 HPA、Pod/Node N−1 与重连尖峰。[12.11 声明式交付与可重复环境](./11_declarative_delivery.md)沿非秘密 IM 配置变更解释 GitOps、配置生效、漂移与审计。[12.12 平台作为产品](./12_platform_as_product.md)以虚构新网关接入评估契约、默认值、自助率与维护成本。十二章各含 8 节讲解、22 道分层练习，已完成本卷独立章稿。

## IM 主线中的位置

网关及转发服务的配置、依赖、就绪、连接排空、滚动升级、重连与故障域；先单实例再集群。

主参照与源码入口见 [OpenIM 阅读地图](../im_reference.md)。下方章号继续用于知识定位；已有正文中的旧业务例子作为补充，独立章稿生成时按本节主线适配。

## 参考材料怎样进入课程

- [Kubernetes Concepts](https://kubernetes.io/docs/concepts/)
- [SRE，发布与运行主题](https://sre.google/sre-book/table-of-contents/)
- [Systems Performance，云环境主题](https://www.brendangregg.com/systems-performance-2nd-edition-book.html)

采用其知识覆盖与递进思路，结合 Go 和虚构业务重新组织。以下为分章教学设计，不是原书目录翻译，也不表示所有独立章稿已经完成。现有正文与新增专题讲义是当前可读内容。

## 起步层

| 章节 | 要详细讲解的内容 | IM 练习与验收目标 |
|---|---|---|
| [12.01 运行环境与制品](./01_runtime_artifacts.md) | 二进制、依赖、配置、镜像、标签与摘要；环境差异。 | 解释同一IM制品如何加载环境配置，区分二进制、镜像、标签、摘要和数据。 |
| [12.02 容器机制](./02_container_mechanisms.md) | namespace、cgroup、文件层、volume、信号与进程一号。 | 沿网关进程理解隔离、限制、文件层、数据卷、信号与容器重建。 |
| [12.03 本地多服务环境](./03_local_multi_service.md) | Compose、健康、网络、端口、配置与日志；依赖就绪。 | 定位教学依赖环境中的名称、端口、就绪、配置和日志，区别无法连接与尚未启动。 |

## 原理层

| 章节 | 要详细讲解的内容 | IM 练习与验收目标 |
|---|---|---|
| [12.04 集群控制模型](./04_cluster_control_model.md) | 期望状态、控制循环、节点、Pod、控制器与调度。 | 解释期望副本数怎样形成运行实例，识别调度、控制循环和应用就绪的职责。 |
| [12.05 工作负载与服务发现](./05_workloads_service_discovery.md) | Deployment、StatefulSet、Job、Service、DNS、Ingress。 | 按网关、消息转发和后台任务的状态与生命周期选择工作负载及服务发现。 |
| [12.06 资源与持久存储](./06_resources_persistent_storage.md) | request/limit、调度、CPU 限制、OOM、PV/PVC 与数据身份。 | 分析网关资源限制、OOM、存储身份和扩副本，说明状态并不会自动共享。 |

## 工程层

| 章节 | 要详细讲解的内容 | IM 练习与验收目标 |
|---|---|---|
| [12.07 配置与权限](./07_config_permissions.md) | ConfigMap、Secret、ServiceAccount、RBAC、网络访问边界。 | 按职责限制服务读取配置、凭据与资源的权限，区分身份、配置和网络边界。 |
| [12.08 启动、探针与退出](./08_startup_probes_exit.md) | startup/readiness/liveness、依赖、摘流、排空、终止预算。 | 为长连接网关安排停止接入、摘流、在途处理、关闭与重连的时间线。 |
| [12.09 发布与回滚](./09_release_rollback.md) | 滚动、蓝绿、金丝雀、配置灰度、数据兼容与制品追溯。 | 设计滚动升级、观察窗口和停止条件，说明旧客户端与历史数据的兼容。 |

## 进阶层

| 章节 | 要详细讲解的内容 | IM 练习与验收目标 |
|---|---|---|
| [12.10 扩缩容与故障域](./10_autoscaling_fault_domains.md) | 水平/垂直扩容、指标滞后、节点分布、可用区与中断。 | 估计节点退出和重连突发所需余量，处理扩容指标滞后与故障域分布。 |
| [12.11 声明式交付与可重复环境](./11_declarative_delivery.md) | 配置分层、模板、GitOps 思想、漂移、权限与审计。 | 从一次IM配置变更追踪到制品、权限和运行状态，解释漂移与审计。 |
| [12.12 平台作为产品](./12_platform_as_product.md) | 接入契约、默认配置、可观测性、自助流程与维护负担。 | 以接入、升级和排障成本评估平台默认能力，避免只按组件数量评价平台。 |

## 本卷综合任务

为虚构 IM 编写从本地到集群的运行说明，覆盖连接生命周期、配置、权限、发布、积压恢复与容量；环境由学习者按需准备。

任务由学习者在具备环境时执行。理论推导、参考示例、个人实现和真实运行记录分别保存，故障与反例属于必需部分。

## 达到的能力

能解释平台控制机制与应用职责，能制定有证据的部署和恢复方案。

用解释、最小实现、失败变式、业务取舍四类证据评审。只有目录、术语定义或参考代码通过，不能直接记为掌握本卷。

## 本卷章节展开规则

每章从一个明确问题开始，先补齐本章所需定义，再推导机制；至少含一条完整执行过程、一个反例、分层练习、反馈与业务迁移。复杂章节拆成多课，不把整卷知识压成一次速读。

当前编写状态和章节深度要求见[课程编写与能力验收](../assessment.md)。
