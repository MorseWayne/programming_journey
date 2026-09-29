---
title: 实践环境：按阶段增加依赖
icon: /assets/icons/article.svg
order: 0.5
date: 2026-09-23
---

## 第一阶段只准备 Go、编辑器和终端

[01.01](./curriculum/01_go/01_program_toolchain.md)从创建文件和一次运行开始，各章分别说明个人练习目录、完整程序与需嵌入的片段。进入 [01.12 本地会话 CLI](./curriculum/01_go/12_cli_capstone.md)前，先完成函数、集合、错误、文件和[测试基础](./curriculum/10_engineering/02_testing_basics.md)。

个人练习目录用于从空白文件解释包和模块；本仓库的 `labs/platform_path` 是早期通用机制实验，两者有独立的 `go.mod`。不要把两个模块的命令、导入路径或配置拼在一起。主课程围绕虚构 IM。需要比较早期机制时，可在仓库的 `labs/platform_path/README.md` 查阅可选实验；它们不代替 P1–P5 的 IM 任务。

| 阶段 | 先准备什么 | 实践入口 |
|---|---|---|
| S0–S1 | Go、编辑器、终端；Git 在会编辑文件后加入 | [01 卷语言与 CLI](./curriculum/01_go/README.md)、[10.03 Git](./curriculum/10_engineering/03_git_state.md) |
| S2 | 两个本地进程、HTTP 客户端和端口；随后学习 TLS/WebSocket | [04 卷网络](./curriculum/04_networks/README.md)、[09 卷应用](./curriculum/09_backend_security/README.md) |
| S3 | 按选用的教学数据库准备本地实例、配置和可回收数据 | [06 卷数据库](./curriculum/06_databases/README.md)、[09.07 授权](./curriculum/09_backend_security/07_authentication_authorization.md) |
| S4–S5 | 先能复现单机负载与失败，再增加缓存、消息和多进程 | [05 卷并发](./curriculum/05_runtime/README.md)、[07 卷消息](./curriculum/07_cache_messaging/README.md)、[08 卷分布式](./curriculum/08_distributed/README.md) |
| S6–S7 | 明确制品、容量、观测和回滚要求后再进入容器与集群 | [11 卷可靠性](./curriculum/11_reliability/README.md)、[12 卷平台](./curriculum/12_platform/README.md)、[13 卷架构](./curriculum/13_architecture/README.md) |
| AI 选修 | 先有数据许可、基线和权限边界，再接模型或工具 | [14 卷 AI 工程](./curriculum/14_ai/README.md) |

## OpenIM 是源码参照，不是入门环境前置

[主项目阅读地图](./curriculum/im_reference.md)记录固定版本和已核对入口。上游服务有独立的数据库、缓存、消息和配置依赖；初学 Go 或完成 P1 本地工具时不需要启动整套 OpenIM。到章稿要求源码对照时，记录实际检出的提交、配置、启动范围和观察结果；教学 SQL 示例不能冒充上游的消息存储实现。

## 记录能复现的结果

运行前标明当前目录、模块、Go 版本、依赖和输入；运行后保存命令、输出、错误以及独立变式。纸上推导、示例运行、真实服务测试和生产测量分别记录在[个人进度页](./progress.md)。未执行的步骤保持“未验证”，按当前阶段继续学习理论和练习。
