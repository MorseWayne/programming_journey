---
title: B05 数据库与 SQL：从表、查询到约束
icon: /assets/icons/article.svg
order: 5
date: 2026-09-22
---

先修：[A06 数据对象](../beginner/06_structs_pointers.md)、[A10 文件](../beginner/10_files_json.md)、[B04 本地数据库环境](./04_local_tools.md)。

## 小需求：按用户查询未完成任务

一个 JSON 文件可以保存任务，但当多个程序要查询和更新大量数据时，需要共同管理定位、并发与持久性。数据库服务提供这些能力的一部分，应用通过协议与它交互。

**SQL**是操作关系数据的语言。关系表用行保存记录、用列定义属性。本课先学习基本语句，索引内部与事务并发留到 C05、C06。

## 数据库、表、行、列

一个数据库可以包含多张表。一张任务表里，一行表示一个任务，列分别保存 ID、所属用户、标题、奖励和完成状态。

表的结构称为 schema 或表定义，规定字段类型与约束。这里的“数据库 schema”与 Go 结构体不是同一个对象，但二者都在描述某种数据形式。

| id | owner | title | reward | done |
|---|---|---|---:|---|
| t1 | u1 | 学习 SQL | 10 | false |
| t2 | u1 | 复习函数 | 5 | true |

不要把行当前显示的位置当作身份。数据重新组织或查询顺序变化时，位置可能不同，应使用明确的 ID。

## 进入练习数据库

如果准备动手，先完成 B04 的环境步骤，再执行：

```bash
docker compose exec mysql mysql -uroot -pjourney-local-only journey_lab
```

下面的代码块是 SQL，写在数据库客户端里。每条语句用分号结束；不是保存进 Go 的 main 函数，也不是直接当 shell 命令运行。

## 创建表与声明约束

```sql
CREATE TABLE IF NOT EXISTS beginner_tasks (
    id VARCHAR(32) PRIMARY KEY,
    owner VARCHAR(32),
    title VARCHAR(100) NOT NULL,
    reward INT NOT NULL,
    done BOOLEAN NOT NULL DEFAULT FALSE,
    CHECK (reward >= 0)
) ENGINE=InnoDB;
```

VARCHAR 表示有长度限制的文本，INT 表示整数，BOOLEAN 表示布尔含义。MySQL 的 BOOLEAN 是一种整数类型别名，常以 0/1 显示；本例只写 TRUE/FALSE，若业务要求只能保存 0 或 1，还要增加对应约束。不要把它等同于 Go bool 的完整类型规则。

PRIMARY KEY 指定主键，要求能唯一标识一行；NOT NULL 不允许缺失值；DEFAULT 提供默认值；CHECK 限制奖励不能为负。InnoDB 是本例使用的存储引擎，后续事务课会介绍其作用。

IF NOT EXISTS 表示已有表时不再次创建，它不会自动把旧表结构改成新定义。

## 插入数据与查询

```sql
INSERT INTO beginner_tasks (id, owner, title, reward, done)
VALUES ('t1', 'u1', '学习 SQL', 10, FALSE),
       ('t2', 'u1', '复习函数', 5, TRUE);

SELECT id, title, reward
FROM beginner_tasks
WHERE owner='u1' AND done=FALSE;
```

INSERT 指定列与对应值。文本使用单引号；SELECT 指定返回哪些列，FROM 指定表，WHERE 筛选条件。预期只返回 t1。

重复执行同一 INSERT 会遇到主键冲突，因为 t1、t2 已存在。这个结果说明唯一约束生效，不是需要随意删除已有数据。可以换用自己的新练习 ID，或先查看已有行。

## 更新与删除的范围

```sql
UPDATE beginner_tasks
SET done=TRUE
WHERE id='t1';
```

它修改 id=t1 的任务。省略 WHERE 可能修改整张表，所以执行前先用相同条件 SELECT，确认范围。

DELETE 删除符合条件的行，DROP TABLE 删除表本身，含义与影响范围不同。初学练习需要删除时，选择自己明确创建的一条虚构数据：

```sql
INSERT INTO beginner_tasks (id, title, reward) VALUES ('delete-demo', '临时练习', 0);
DELETE FROM beginner_tasks WHERE id='delete-demo';
```

SQL 正常执行不代表业务条件一定满足。UPDATE 匹配零行时，也需要结合目标判断是否应报告“任务不存在”。

## NULL 与零值不同

NULL 表示缺失或未知，并不是整数 0、空字符串或 false。上面临时任务没有提供 owner，因此 owner 可以是 NULL。

判断使用 `owner IS NULL` 或 `owner IS NOT NULL`，不能用 `owner = NULL` 期待普通相等比较。涉及 NULL 的表达式可能产生未知结果，WHERE 只保留条件成立的行。

Go 解码和读取数据库时，也需要表达“值不存在”与“值就是零”的差异；不能一律用一个整数或字符串掩盖状态。

## 排序、分页与聚合

```sql
SELECT id, reward FROM beginner_tasks ORDER BY reward DESC, id ASC LIMIT 10;
SELECT owner, COUNT(*) AS task_count, SUM(reward) AS total_reward
FROM beginner_tasks
GROUP BY owner;
```

ORDER BY 指定顺序，DESC 降序、ASC 升序，LIMIT 限制返回数量。相同奖励时再按 ID 排序，可以消除一部分并列歧义。

COUNT(*) 统计行数，SUM 求和，GROUP BY 按某组键分别聚合，AS 给结果列取名。没有 ORDER BY 时，不应依赖显示顺序。

大表分页不只关乎 LIMIT，扫描与游标问题在 C05 继续推导。

## 多张表如何关联

```sql
CREATE TABLE IF NOT EXISTS beginner_users (
    id VARCHAR(32) PRIMARY KEY,
    name VARCHAR(100) NOT NULL
) ENGINE=InnoDB;
INSERT INTO beginner_users (id, name) VALUES ('u1', '示例用户');

SELECT t.id, u.name, t.title
FROM beginner_tasks AS t
JOIN beginner_users AS u ON t.owner=u.id;
```

JOIN 根据 ON 条件把相关记录组合起来。t、u 是便于书写的表别名；点号说明取哪张表的列。

这个内连接只保留匹配到用户的任务。LEFT JOIN 可以保留左边任务，即使右边没有匹配行；缺失的右侧字段用 NULL 表达。

外键约束可以进一步限制引用是否存在，本例没有定义它，不能因为查询用了 JOIN 就认为数据库已强制所有 owner 合法。

`SELECT 0 AS n UNION ALL SELECT 1` 把两次查询结果合在一起，保留两行；UNION ALL 不执行重复行消除。

CROSS JOIN 将两边组合成所有配对，2 行与 3 行会产生 6 个组合。C05 的造数脚本用多个小数字表组合出 10,000 个 ID，这是生成练习数据的用途。

## 从 SQL 走向索引与事务

主键通常有对应索引结构来定位数据。索引用空间和维护成本帮助查询，不是添加越多越好。C05 会解释数据量、查询条件与树形索引。

BEGIN/COMMIT/ROLLBACK 组织一组操作的提交与回滚。它们需要结合并发与持久性理解，先在本课掌握每条语句的作用，C06 再完整展开。

程序接收外部输入时应使用驱动提供的参数绑定，不能把字符串随意拼成 SQL。后续选择 Go SQL 驱动时，也要区分 database/sql 通用接口与具体数据库协议实现。

## 练习与反馈

为 u2 创建两项任务，查询其未完成任务；完成其中一项，再查询；尝试负奖励和重复 ID，分别指出是哪条约束拒绝。

<details>
<summary>参考方向</summary>

查询结果为空可能意味着条件没有匹配行，不一定是连接失败。重复 ID 与负奖励由不同约束保护；应用可以提前校验，数据库仍负责它定义的约束范围。

</details>

下一课：[B06 goroutine、等待与互斥](./06_goroutines_mutex.md)。
