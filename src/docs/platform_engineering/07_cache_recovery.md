---
title: 07 缓存、日志与恢复：数据究竟在哪里
icon: /assets/icons/article.svg
order: 7
date: 2026-09-22
---

## 本课问题与前置

服务里有 map、Redis、数据库、本地文件。进程突然退出时，哪一份数据可以作为恢复依据？前置：第 5–6 课。建议用时 3–4 小时。

目标：指定权威数据源，解释陈旧缓存的成因，区分缓存淘汰与业务数据丢失。

## 权威状态与派生状态

**权威状态**是业务判定依据；**派生状态**可以由它重新生成。Arena 的 SQL 钱包和回执是权威状态，Redis 余额可以是派生缓存。

读取缓存未命中时查数据库再写缓存，称为 cache-aside。它减少数据库访问，但会产生更新顺序问题：

```text
A 读数据库旧值 → B 更新数据库并删除缓存 → A 把旧值写回缓存
```

因此“先写库再删缓存”并不是任意并发下的强一致性证明。TTL 限制部分陈旧窗口；版本号、条件写、绕过缓存的关键读、事件驱动更新等方法各有成本。选择取决于业务能容忍多久的旧值。

## 实验：制造可观察的陈旧值

启动环境后，从实验目录执行：

```bash
docker compose exec -T redis redis-cli SET arena:cache-lab:balance 100 EX 30
docker compose exec -T redis redis-cli GET arena:cache-lab:balance
docker compose exec -T redis redis-cli TTL arena:cache-lab:balance
```

假设数据库余额已变为 110，这里的 GET 仍返回 100。只改变数据库不会自动更新 Redis。手工删除这个练习键，再查应为 nil：

```bash
docker compose exec -T redis redis-cli DEL arena:cache-lab:balance
docker compose exec -T redis redis-cli GET arena:cache-lab:balance
```

该操作只删除本课创建的虚构缓存键，可再次 SET 重建。然后用两个终端按上面的 A/B 时间线重放“迟到回填”，说明为什么第二次删除仍不能证明所有时序都安全。

## 周期落盘意味着什么

内存对象每隔几秒保存一次，如果进程在下一次保存前异常退出，未保存的修改可能丢失。增加优雅退出不能处理断电、强杀等所有故障。

**WAL（预写日志）**的思路是在确认更新之前，把足以重做的记录按持久性约定写入日志。是否同步到稳定存储、磁盘或节点故障如何处理，决定它能保证什么。数据库恢复还需处理提交状态与日志重放，单纯 append 一个文件不等于完整事务系统。

HBase、关系型数据库与本地嵌入式数据库的恢复机制和部署边界不同，不能把“都有日志”当作相同保证。

## 状态提醒与持久事件

Redis Pub/Sub 的实时订阅提醒不能自动当成可回放日志。若邮件通知丢失后可以按持久化 mail_id 补拉，恢复依赖的是邮件存储与游标，而非提醒本身。用 Redis 事务也不能获得 SQL 式任意回滚语义；核对 [Redis 事务说明](https://redis.io/docs/latest/develop/using-commands/transactions/)。

<details>
<summary>练习：缓存清空后必须丢失哪些业务数据？</summary>

理想的纯派生缓存清空后不应永久丢失业务事实，但可能造成读取延迟上升和数据库压力。如果 Redis 还承担唯一的任务、在线状态或锁记录，它就不再仅仅是缓存，要分别定义恢复语义。

</details>

独立练习：给余额、在线状态、邮件、匹配运行态、配置版本分别标出权威存储、允许丢失量、恢复来源与最长恢复时间。无法确认时标记未知，不从组件名字推断。

达标证据：一条陈旧回填时间线与状态恢复表。下一课：[RPC 与消息](./08_rpc_messages.md)。
