---
title: 概念与先修索引
icon: /assets/icons/article.svg
order: -0.5
date: 2026-09-23
---

## 这份索引怎样使用

正文遇到陌生词时，先找到对应基础课。这里用一句话帮你定位，完整的例子、推导和练习在链接页面。实际顺序见[分阶段学习路线](./curriculum/learning_path.md)，按先修跨卷进入；A/B/C/D 用于定位衔接材料，AI 不作为主线架构答辩的前置。

已完成的独立章稿提供更细的先修讲解：[01.01 程序与工具链](./curriculum/01_go/01_program_toolchain.md)对应文件、终端、包和模块；[01.02 类型与数据表示](./curriculum/01_go/02_types_data.md)对应变量、零值、常量、作用域、整数边界、浮点、最小 if、文本与解析错误。下表保留原有短课定位，便于回顾；控制流、集合和错误机制的完整深化仍按后续章节推进。

已完成的新章还包括：[01.04 集合与文本](./curriculum/01_go/04_collections_text.md)定位数组、切片、共享、UTF-8 与字素簇；[10.01 可验证需求](./curriculum/10_engineering/01_verifiable_requirements.md)定位契约、状态、决策表和边界用例；[10.02 测试方法](./curriculum/10_engineering/02_testing_basics.md)定位测试入口、表驱动、状态断言和证据边界；[10.03 Git 状态](./curriculum/10_engineering/03_git_state.md)定位工作区、索引、提交和远端。

第二批新增：[01.05](./curriculum/01_go/05_maps_structs_pointers.md)定位 map、对象身份、指针和复制；[02.01](./curriculum/02_algorithms/01_discrete_cost.md)定位集合、计数、渐近界与概率前提；[03.01](./curriculum/03_systems/01_data_instructions_storage.md)定位位、字节、地址、缓存与资源预算。新增 [01.06](./curriculum/01_go/06_methods_interfaces.md)定位方法与接口；[01.07](./curriculum/01_go/07_errors_resources.md)定位错误与资源；[01.08](./curriculum/01_go/08_standard_library.md)定位 JSON、时间和文件边界；[01.09](./curriculum/01_go/09_packages_evolution.md)定位包、导入路径、模块、循环依赖和兼容演进。

## Go 语法与工程基础

[01.03 IM 控制流与函数](./curriculum/01_go/03_control_functions.md)已补齐分支、switch、有限循环、函数调用、多返回值、副作用以及递归与闭包的长篇讲解。基础主线先读一至五节和第八节，深化部分第二遍阅读；下表保留原有短课入口。

| 概念 | 先理解什么 | 首次系统讲解 | 后面会在哪里用到 |
|---|---|---|---|
| 文件、终端、当前目录 | 代码保存位置与命令执行位置不同 | [A01](./beginner/01_first_program.md) | 所有实践命令 |
| package main、import、入口函数 | 程序从哪里开始执行 | [A01](./beginner/01_first_program.md) | HTTP、命令行与实验 |
| 变量、类型、零值 | 数据是什么、允许怎样操作 | [A02](./beginner/02_values_types.md) | 字段校验、状态模型 |
| if、for、switch、作用域 | 分支、重复和名字的可见范围 | [A03](./beginner/03_control_flow.md) | 业务规则、状态机 |
| 参数、返回、函数值、闭包 | 工作步骤与数据怎样传递 | [A04](./beginner/04_functions.md) | HTTP handler、工作池 |
| 数组、切片、map、range | 顺序访问、键查找和共享 | [A05](./beginner/05_collections.md) | 所有权、缓存、事件集合 |
| 字节、rune、字符串 | 数据大小与文字含义不同 | [A02](./beginner/02_values_types.md)、[A05](./beginner/05_collections.md) | JSON、网络帧 |
| struct、指针、接收者 | 副本与同一对象的修改 | [A06](./beginner/06_structs_pointers.md) | Account、Ledger、请求对象 |
| interface、error、nil | 能力约定与失败返回 | [A07](./beginner/07_interfaces_errors.md) | 存储接口、I/O、context |
| defer、panic | 函数退出与异常控制流 | [A07](./beginner/07_interfaces_errors.md) | 文件关闭、解锁、取消清理 |
| 包、模块、导出、依赖 | 跨文件复用与访问边界 | [A08](./beginner/08_packages_modules.md) | 整合实验与多入口 |
| Test、断言、子测试 | 实际结果如何与规则比较 | [A09](./beginner/09_testing.md) | 所有正确性实践 |
| JSON、编码与解码 | 对象如何转成可交换字节 | [A10](./beginner/10_files_json.md) | HTTP、Python、配置 |
| 时间点、Duration、单位 | 何时发生与持续多久不同 | [A10](./beginner/10_files_json.md) | 超时、测量与期限 |

## 后端运行与协作

| 概念 | 含义入口 | 基础课 | 进阶应用 |
|---|---|---|---|
| 进程、内存、持久状态 | 数据在哪里，退出后怎么办 | [B01](./00_system_model.md) | C01、C07 |
| 客户端、服务端、IP、端口 | 谁请求谁，怎样找到对方 | [B02](./backend_basics/02_network.md) | C04、C08 |
| TCP 字节流、HTTP、URL | 运送字节与解释消息的不同层面 | [B02](./backend_basics/02_network.md) | C04 帧解析 |
| handler、路由、状态码 | 请求怎样对应函数与响应 | [B03](./backend_basics/03_http.md) | C11–C12 |
| 环境变量、镜像、容器、volume | 启动配置与依赖的数据位置 | [B04](./backend_basics/04_local_tools.md) | SQL 环境、C11 |
| 表、主键、约束、CRUD、JOIN | 查询和修改关系数据 | [B05](./backend_basics/05_sql.md) | C05–C06 |
| goroutine、WaitGroup、Mutex | 启动、等待和共享保护 | [B06](./backend_basics/06_goroutines_mutex.md) | C02–C03 |
| channel、close、select | 通信、结束和等待条件 | [B07](./backend_basics/07_channels_context.md) | C03 工作池 |
| context、deadline、取消 | 传递停止意图与等待预算 | [B07](./backend_basics/07_channels_context.md) | C08、C11 |

CRUD 指创建、读取、更新、删除四类基本数据操作，B05 对应 INSERT、SELECT、UPDATE、DELETE。它只是这组操作的简称。

## 高阶概念也有明确讲解位置

| 概念 | 首次完整讨论 | 不应混淆的边界 |
|---|---|---|
| 契约、不变量 | [C01](./01_contracts.md) | 返回无错误与业务正确 |
| 所有权、业务竞争 | [C02](./02_ownership.md) | 传值与底层独立；race 与业务顺序 |
| 排队、背压、并发上限 | [C03](./03_concurrency.md) | 缓冲容量与处理能力 |
| profile、吞吐、尾延迟 | [C04](./04_performance.md) | 计算时间与等待时间 |
| 索引、B+ 树、访问路径 | [C05](./05_storage.md) | 查询正确与成本合理 |
| 事务、隔离、MVCC、幂等 | [C06](./06_transactions.md) | 原子提交、请求重复与领域唯一性 |
| 缓存、WAL、恢复目标 | [C07](./07_cache_recovery.md) | 权威数据与派生结果 |
| RPC、outbox、交付语义 | [C08](./08_rpc_messages.md) | 超时与失败、传输与业务效果 |
| 路由、租约、CAS、fencing | [C09](./09_distributed_state.md) | 去哪里、谁能处理、谁能写入 |
| SLI、SLO、Trace | [C10](./10_observability.md) | 中间状态与用户成功 |
| Kubernetes、探针与生命周期 | [C11](./11_delivery.md) | 进程存活、接流量与持久性 |
| 多租户、认证、授权与兼容 | [C12](./12_platform_design.md) | 请求字段与可信身份 |
| token、embedding、RAG | [D02](./14_rag.md) | 相似、证据充分与正确回答 |
| Agent、工具与 checkpoint | [D03](./15_agents.md) | 流程状态与实际副作用 |

## 不知道该回哪一课

先把卡住的句子拆开。例如“用 context 控制工作池取消”包含函数接口、goroutine、channel、select 与取消协议，按 A07 → B06 → B07 的顺序补齐，再回 C03。

如果基础概念都理解，却仍无法解释某个故障，就把正常路径缩小成几步，再只加入一个失败位置。这样能区分知识缺口与具体设计尚未确定。
