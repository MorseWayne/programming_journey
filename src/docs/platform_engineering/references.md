---
title: 权威资料导航
icon: /assets/icons/article.svg
order: 92
date: 2026-09-22
---

资料核对日期：2026-09-22。优先阅读本课对应小节，每次带着一个具体问题；无需先读完所有手册再做实验。版本相关行为应以自己使用版本为准。

| 课程 | 资料 | 带着什么问题读 |
|---|---|---|
| 00–01 | [Go 错误处理](https://go.dev/blog/error-handling-and-go) | 错误如何成为调用契约的一部分？ |
| 02 | [Go 内存模型](https://go.dev/ref/mem) | 哪种同步建立写入与读取之间的可见性？ |
| 03 | [Go Pipelines](https://go.dev/blog/pipelines) | 下游提前结束时，上游怎样退出？ |
| 04 | [Go Diagnostics](https://go.dev/doc/diagnostics) | 计算、内存和等待问题分别用什么工具？ |
| 05 | [HBase 旧版手册：Rowkey Design](https://hbase.apache.org/book.html#rowkey.design) | 行键如何同时影响扫描和热点？ |
| 06 | [InnoDB 锁定读取](https://dev.mysql.com/doc/refman/8.4/en/innodb-locking-reads.html) | 读完再写之间的竞争由谁保护？ |
| 06 | [InnoDB 事务模型](https://dev.mysql.com/doc/refman/8.4/en/innodb-transaction-model.html) | 事务提交、隔离与一致性读取各保证什么？ |
| 07 | [Redis 事务](https://redis.io/docs/latest/develop/using-commands/transactions/) | Redis 的事务与 SQL 回滚有何差别？ |
| 07 | [Redis Pub/Sub](https://redis.io/docs/latest/develop/pubsub/) | 实时提醒为什么需要独立补拉来源？ |
| 08 | [gRPC Deadlines](https://grpc.io/docs/guides/deadlines/) | 上游截止时间如何约束下游？ |
| 08 | [NATS Consumers](https://docs.nats.io/learn/jetstream/pull-consumers) | 确认与重投如何影响消费者？ |
| 09 | [Etcd API](https://etcd.io/docs/v3.6/learning/api/) | lease、revision、watch 与业务写入如何关联？ |
| 09、17 | [MIT 6.5840](https://pdos.csail.mit.edu/6.824/) | 容错、复制与一致性怎样在案例中权衡？ |
| 10 | [SRE：Implementing SLOs](https://sre.google/workbook/implementing-slos/) | 什么指标更接近用户真实体验？ |
| 10 | [OpenTelemetry 传播](https://opentelemetry.io/docs/concepts/context-propagation/) | 跨服务关联在哪里丢失？ |
| 11 | [Kubernetes Pod 生命周期](https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/) | 终止信号和应用清理分别负责什么？ |
| 12 | [Protobuf 实践](https://protobuf.dev/best-practices/dos-donts/) | 为什么字段编号和语义都需要兼容？ |
| 13 | [Python sqlite3](https://docs.python.org/3/library/sqlite3.html) | 事务上下文与连接关闭是否相同？ |
| 14 | [RAG 原始研究](https://arxiv.org/abs/2005.11401) | 如何把外部检索与生成结合？与课程词项原型有何不同？ |
| 15 | [Building Effective Agents](https://www.anthropic.com/engineering/building-effective-agents) | 预定义流程与模型选取动作的边界在哪里？ |
| 15 | [LangGraph Persistence](https://docs.langchain.com/oss/python/langgraph/persistence) | 流程 checkpoint 能否替代工具幂等？ |
| 全程 | [教学设计调研](./teaching_research.md) | 目标、练习、反馈和复习怎样对应？ |

## 扩展选择

需要深入数据库内核时，再选择 CMU 15-445 的索引、执行和恢复课程；需要深入一致性协议时，再选择 MIT 6.5840 的论文与实验。遵守各课程对作业代码和解答的使用要求，本仓库配套实验为原创。

目标是 Go 平台后端时，优先完成 SQL、分布式与可靠性；目标是 AI 应用交付时，在相同后端基础上增加真实模型评测和产品界面；目标是底层存储研发时，再补 C++/Rust、I/O 与更深入的系统论文。后两类扩展不隐含你已具备相应经验。


## 阅读材料的边界

HBase 的 book.html 已标为旧版手册，此处用于学习行键、扫描与热点的概念，具体配置应查部署版本对应文档。RAG 论文讨论其研究模型，课程离线例子没有实现该论文模型；Agent 工程文章用于理解流程职责，不作为当前产品能力承诺。

官方文档用来核对机制，课程中的业务案例、时间线和分层练习为原创教学设计。进一步材料按实际问题选读，先完成当前阶段的最小解释与变式。
