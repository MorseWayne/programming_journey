---
title: 05 按访问方式设计数据与索引
icon: /assets/icons/article.svg
order: 5
date: 2026-09-22
---

## 本课问题与前置

余额放进 map 很直观，为什么到数据库里还要设计主键、索引和事务？本课先解决“数据如何定位”，下一课再讨论多次写入怎样一起成功。

前置：第 1–4 课，知道表由行和列组成。建议用时 4 小时。目标：把请求转换为查询条件，解释复合索引顺序，核对执行计划。

## 从查询倒推数据

Arena 有三个查询：按游戏和玩家找余额；按游戏和请求 ID 找回执；按发送状态与事件编号找待发送事件。这对应三种不同身份，而不是一个万能 ID。

```sql
SELECT balance FROM wallets WHERE ns='game-a' AND uid='u1';
SELECT * FROM receipts WHERE ns='game-a' AND request_id='r1';
SELECT * FROM outbox WHERE sent=FALSE ORDER BY event_id LIMIT 100;
```

**主键**唯一标识一行。`PRIMARY KEY(ns,uid)` 让两个游戏中的 u1 保持独立。**索引**是额外维护的数据结构，用写入成本和空间换取定位效率。InnoDB 主键组织数据，二级索引还关联主键；索引越多并非越快。

`(sent,event_id)` 按发送状态再按事件编号组织，适合筛选未发送并取一批。`(event_id,sent)` 是否更合适，要看访问方式；不能因为包含同样两列就当作等价。

## 行模型、键值模型与访问限制

关系型数据库可以组合条件、连接和事务；HBase 的设计更强调按行键组织访问。行键会影响扫描局部性和热点分布；单调递增前缀可能集中写入，打散前缀又可能增加范围查询成本。[HBase 行键设计](https://hbase.apache.org/book.html#rowkey.design)提供了这些取舍的原理。

因此，从“用了哪个数据库”继续追问：常见读取是什么？一致性范围是什么？最热 key 是哪个？数据保留多久？增长后怎样分区？

## 实验：建立表并观察计划

先完成[环境页](./environment.md)的数据库启动与初始化。以下均从 `labs/platform_path` 运行：

```bash
docker compose exec -T mysql mysql -uroot -pjourney-local-only journey_lab -e \
 "EXPLAIN SELECT balance FROM wallets WHERE ns='game-a' AND uid='u1';"
docker compose exec -T mysql mysql -uroot -pjourney-local-only journey_lab -e \
 "EXPLAIN SELECT * FROM outbox WHERE sent=FALSE ORDER BY event_id LIMIT 100;"
```

预期余额查询能够使用复合主键。空表或极小表的计划可能选择扫描，不能据此判定索引错误。记录实际 `key`、估计行数和 `Extra`；估计值不是实际执行计时。

练习：在专用实验库生成 10,000 条虚构余额。依次比较按 `ns,uid` 查询、仅按 uid 查询、对 uid 使用函数查询。使用 SQL 客户端的 `EXPLAIN ANALYZE` 观察真实行数与耗时，它会实际执行查询，因此这里仅对 SELECT 使用。

<details>
<summary>可用的造数语句与提示</summary>

```sql
INSERT IGNORE INTO wallets(ns,uid,balance)
SELECT 'index-lab', CONCAT('u', a.n+10*b.n+100*c.n+1000*d.n), 100
FROM
 (SELECT 0 n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) a
CROSS JOIN
 (SELECT 0 n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) b
CROSS JOIN
 (SELECT 0 n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) c
CROSS JOIN
 (SELECT 0 n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) d;
```

造数完成后执行 `ANALYZE TABLE wallets` 更新统计信息，再对照访问方式。不同机器上的微秒差距不是结论；扫描行数与访问路径更能解释机制。

</details>

## 检查与迁移

为什么给 uid 单独加唯一索引会破坏多游戏设计？因为它将唯一性范围扩大到所有游戏。为什么查出结果正确还不够？因为随着规模增长，扫描成本可能不可接受。

为“按玩家查询最近 50 封邮件”设计字段与索引，说明排序、游标和跨游戏边界。参考方向是 `(ns,uid,mail_id)`，而不是仅按全局 mail_id 查完后在内存过滤。

达标证据：三条查询的索引理由与执行计划。下一课：[事务与幂等](./06_transactions.md)。
