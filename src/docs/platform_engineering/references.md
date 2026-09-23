---
title: 权威资料导航
icon: /assets/icons/article.svg
order: 92
date: 2026-09-22
---

经典书籍、教程目录和课程覆盖的融合关系见[调研报告](./curriculum/source_review.md)。本页保留各机制的官方查阅入口。

资料核对日期：2026-09-22。优先阅读本课对应小节，每次带着一个具体问题；无需先读完所有手册再做实验。版本相关行为应以自己使用版本为准。

| 学习位置 | 资料 | 带着什么问题读 |
|---|---|---|
| A01 | [Go 官方入门](https://go.dev/doc/tutorial/getting-started) | 工具、模块和第一个程序如何关联？ |
| A02–A07 | [A Tour of Go](https://go.dev/tour/) | 用小例子核对类型、方法与接口 |
| A07 | [Go 错误处理](https://go.dev/blog/error-handling-and-go) | 调用者怎样理解失败？ |
| A08 | [Go 模块管理](https://go.dev/doc/modules/managing-dependencies) | 包路径与依赖版本怎样对应？ |
| A09 | [testing](https://pkg.go.dev/testing) | 测试名称、参数和断言怎样工作？ |
| B03 | [net/http](https://pkg.go.dev/net/http) | handler、客户端和响应体分别负责什么？ |
| B05 | [MySQL 数值类型](https://dev.mysql.com/doc/refman/8.4/en/numeric-type-syntax.html) | Go 类型与数据库表示为何不同？ |
| B06、C02 | [Go 内存模型](https://go.dev/ref/mem) | 同步怎样建立可见性？ |
| B07、C03 | [Go Pipelines](https://go.dev/blog/pipelines) | 接收方结束后发送方怎样退出？ |
| C04 | [Go Diagnostics](https://go.dev/doc/diagnostics) | 计算、内存和等待分别怎样观察？ |
| C06 | [InnoDB 事务](https://dev.mysql.com/doc/refman/8.4/en/innodb-transaction-model.html)、[锁定读取](https://dev.mysql.com/doc/refman/8.4/en/innodb-locking-reads.html) | 哪些操作处在同一个保护边界？ |
| C07 | [Redis Pub/Sub](https://redis.io/docs/latest/develop/pubsub/) | 实时提醒为何需要独立恢复来源？ |
| C08 | [gRPC Deadlines](https://grpc.io/docs/guides/deadlines/)、[NATS Consumers](https://docs.nats.io/learn/jetstream/pull-consumers) | 等待预算、确认和重投如何影响业务？ |
| C09 | [Etcd API](https://etcd.io/docs/v3.6/learning/api/) | 租约如何与接收端写入校验配合？ |
| C10 | [SRE：SLO](https://sre.google/workbook/implementing-slos/)、[OpenTelemetry 上下文](https://opentelemetry.io/docs/concepts/context-propagation/) | 用户结果与跨服务证据怎样关联？ |
| C11 | [Pod 生命周期](https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/) | 平台和应用各负责哪些退出动作？ |
| C12 | [Protobuf 实践](https://protobuf.dev/best-practices/dos-donts/) | 字段编号与业务语义为何都要兼容？ |
| D01 | [Python sqlite3](https://docs.python.org/3/library/sqlite3.html) | 事务上下文与连接关闭有何差别？ |
| D02 | [RAG 原始研究](https://arxiv.org/abs/2005.11401) | 检索与生成怎样结合？ |
| D03 | [工作流与 Agent](https://www.anthropic.com/engineering/building-effective-agents)、[LangGraph Persistence](https://docs.langchain.com/oss/python/langgraph/persistence) | 流程状态与外部效果如何分别处理？ |

## 深化阅读

主线所需知识先在本课程正文讲解。希望进一步研究数据库内部时，可阅读 [CMU 15-445](https://15445.courses.cs.cmu.edu/fall2025/)；研究复制与一致性时，可阅读 [MIT 6.5840](https://pdos.csail.mit.edu/6.824/)。把它们放在相应基础之后，按问题选择内容。

RAG 论文讨论其研究模型，本课程离线词项示例并未实现论文模型；Agent 工程文章帮助区分职责，不作为当前具体产品能力的承诺。

技术资料用于核对机制，课程中的虚构需求、示例和先修安排由教材独立组织。教学方法来源见[教学设计](./teaching_research.md)。
