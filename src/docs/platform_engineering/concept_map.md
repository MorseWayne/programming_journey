---
title: 概念与先修索引
icon: /assets/icons/article.svg
order: -0.5
date: 2026-09-23
---

读正式章稿时遇到陌生术语，先在下表找到**第一次系统讲解**，完成其中最小例子和基础练习，再回到当前章节。[S0–S7 学习路线](./curriculum/learning_path.md)规定实际学习顺序；这里用于定点补前置，不要求按表从头到尾阅读。

## Go 语言与程序起点

| 卡住的概念 | 先读哪章 | 回到 IM 时要解释什么 |
|---|---|---|
| 文件、终端、当前目录、运行命令 | [01.01 工具链与一次运行](./curriculum/01_go/01_program_toolchain.md) | 源码、进程和输出各在哪里 |
| 变量、类型、零值、数值边界 | [01.02 类型与数据](./curriculum/01_go/02_types_data.md) | 消息 ID、长度与缺失字段不能混作一个值 |
| if、for、switch、函数、返回值 | [01.03 控制流与函数](./curriculum/01_go/03_control_functions.md) | 逐步执行消息校验和失败分支 |
| 数组、切片、range、UTF-8 与共享 | [01.04 集合与文本](./curriculum/01_go/04_collections_text.md) | 历史列表、预览和正文字节上限 |
| map、结构体、指针、副本 | [01.05 对象与指针](./curriculum/01_go/05_maps_structs_pointers.md) | 按身份查消息，区分复制与修改原对象 |
| 方法、接口、typed nil | [01.06 方法与接口](./curriculum/01_go/06_methods_interfaces.md) | 为会话存储定义最小能力边界 |
| error、defer、Reader、关闭责任 | [01.07 错误与资源](./curriculum/01_go/07_errors_resources.md) | 正文错误、部分 I/O 与文件关闭 |
| JSON、文件、时间、flag | [01.08 标准库协作](./curriculum/01_go/08_standard_library.md) | 本地消息格式、时间与资源上限 |
| 包、模块、公开 API | [01.09 包设计](./curriculum/01_go/09_packages_evolution.md) | 拆分消息规则、存储适配和命令入口 |
| 测试、预期与实际结果 | [10.02 测试基本方法](./curriculum/10_engineering/02_testing_basics.md) | 为正常、边界和拒绝结果写独立预期 |
| 泛型、反射与运行期检查 | [01.10 泛型](./curriculum/01_go/10_generics_reusable_algorithms.md)、[01.11 反射](./curriculum/01_go/11_reflection_unsafe_boundaries.md) | 基础工具完成后第二遍深化；抽象不改变业务合同 |

## 系统、网络与并发

| 卡住的概念 | 先读哪章 | 回到 IM 时要解释什么 |
|---|---|---|
| 进程、内存、系统调用 | [03.02 进程与系统调用](./curriculum/03_systems/02_process_syscalls.md) | 本进程受理为何不等于跨重启历史 |
| 文件、刷盘和持久化 | [03.07 文件与目录](./curriculum/03_systems/07_files_directories.md)、[03.08 持久化机制](./curriculum/03_systems/08_persistence_mechanisms.md) | 本地写入、确认与崩溃窗口 |
| IP、端口、DNS、路由 | [04.02 地址与名称](./curriculum/04_networks/02_addresses_names_routes.md) | 两端如何定位服务及失败发生在哪一跳 |
| TCP 字节流、HTTP、WebSocket | [04.03 HTTP/WebSocket](./curriculum/04_networks/03_http_websocket_basics.md)、[04.04 可靠传输](./curriculum/04_networks/04_reliable_transport.md) | 帧、连接与业务消息边界 |
| TLS 与服务身份 | [04.07 TLS](./curriculum/04_networks/07_tls_identity.md) | 连接对端身份不代替会话成员授权 |
| goroutine、等待与 Mutex | [05.01 任务生命周期](./curriculum/05_runtime/01_concurrent_tasks_lifecycle.md)、[05.02 同步原语](./curriculum/05_runtime/02_sync_primitives.md) | 发送任务退出与共享状态保护 |
| channel、select、context | [05.03 通道与取消](./curriculum/05_runtime/03_channels_cancellation.md) | 有界工作、停止意图和结果未知 |
| 排队、背压、容量 | [05.08 并发组合](./curriculum/05_runtime/08_concurrency_composition.md)、[11.09 过载级联](./curriculum/11_reliability/09_overload_cascades.md) | 慢客户端、大群扇出与资源拒绝 |

## 数据、分布式与业务合同

| 卡住的概念 | 先读哪章 | 回到 IM 时要解释什么 |
|---|---|---|
| 表、主键、SQL 与查询 | [06.01 关系身份](./curriculum/06_databases/01_relational_identity.md)、[06.02 SQL 查询](./curriculum/06_databases/02_sql_queries.md) | 会话、消息与查询范围怎样表示 |
| 索引、执行计划 | [06.05 索引结构](./curriculum/06_databases/05_index_structures.md)、[06.06 查询执行](./curriculum/06_databases/06_query_execution.md) | 历史分页的正确性与成本 |
| 事务、隔离、MVCC | [06.07 事务与异常](./curriculum/06_databases/07_transactions_anomalies.md)、[06.08 锁与 MVCC](./curriculum/06_databases/08_locks_mvcc.md) | 发消息与退群并发时谁能看见什么 |
| 缓存、权威数据、失效 | [07.01 状态角色](./curriculum/07_cache_messaging/01_access_state_roles.md)、[07.03 缓存更新](./curriculum/07_cache_messaging/03_cache_read_update.md) | 哪些状态可丢、撤权后旧值如何失效 |
| 消息确认、重投与去重 | [07.06 消息抽象](./curriculum/07_cache_messaging/06_message_abstractions.md)、[07.07 确认与重投](./curriculum/07_cache_messaging/07_ack_retry_dedup.md) | 传输成功、内存受理与设备确认 |
| 部分失败、超时、结果未知 | [08.01 系统模型](./curriculum/08_distributed/01_system_partial_failure.md) | 响应丢失后为何不能按失败自动重试 |
| 复制、一致性、归属 | [08.03 复制目标](./curriculum/08_distributed/03_replication_goals_costs.md)、[08.04 一致性](./curriculum/08_distributed/04_consistency_models.md)、[08.07 协调与归属](./curriculum/08_distributed/07_coordination_ownership.md) | 多设备、跨节点和故障接管的保证范围 |
| 身份认证、对象授权 | [09.07 认证与授权](./curriculum/09_backend_security/07_authentication_authorization.md) | 当前 actor 是否可对目标会话执行动作 |
| API 合同与错误码 | [09.02 HTTP API 合同](./curriculum/09_backend_security/02_http_api_contract.md) | 当前 6 B、重复 409、非成员 404 和内存确认点 |

## 高级工程与方向扩展

| 卡住的概念 | 先读哪章 | 应交付的证据 |
|---|---|---|
| 契约、边界、不变量 | [10.01 可验证需求](./curriculum/10_engineering/01_verifiable_requirements.md) | 需求表、失败状态和独立预期 |
| Git、评审与交付 | [10.03 Git 状态](./curriculum/10_engineering/03_git_state.md)、[10.06 代码评审](./curriculum/10_engineering/06_code_review_merge.md) | 可追溯的版本、评审与修订记录 |
| 指标、Trace、SLO | [11.03 日志指标与 Trace](./curriculum/11_reliability/03_logs_metrics_traces.md)、[11.08 SLO](./curriculum/11_reliability/08_slo_alerting.md) | 用户结果与跨服务失败层的关联 |
| 容器、探针、发布 | [12.02 容器机制](./curriculum/12_platform/02_container_mechanisms.md)、[12.08 启动探针与退出](./curriculum/12_platform/08_startup_probes_exit.md)、[12.09 发布回滚](./curriculum/12_platform/09_release_rollback.md) | 启动、接流量、停止和回滚证据 |
| 架构取舍与迁移 | [13.07 设计评审](./curriculum/13_architecture/07_design_review_adr.md)、[13.08 迁移兼容](./curriculum/13_architecture/08_migration_compatibility.md) | 方案比较、旧端兼容和接手说明 |
| 模型、检索、RAG 与工具 | [14.03 语言模型](./curriculum/14_ai/03_language_model_foundations.md)、[14.06 检索](./curriculum/14_ai/06_retrieval_indexing.md)、[14.07 RAG](./curriculum/14_ai/07_rag_pipeline.md)、[14.08 工具](./curriculum/14_ai/08_tools_workflows_agents.md) | 有权限、有证据、可评测且受控的选修助手 |

## 找不到入口时

把不懂的一句拆成最小前置。例如看不懂“用 context 取消工作池”，先回 01.03 的函数、01.07 的错误，再读 05.01 的任务生命周期与 05.03 的通道取消。理解单个机制后再回原题，不需重学整卷。
