# 07.02 审阅记录：Redis 数据模型

DeepTutor BookEngine 八节初稿均 ready，HTTP Markdown 导出与本地渲染 SHA256 一致。原稿保存在 `original.md`；正式页以同一组虚构 IM 数据手算 String/Hash、Set/ZSET、List、Bitmap 与 Stream，先问访问形状、权威来源和失败后能否重建，再选类型，附 22 道练习。

## 教学重组

- 固定 `c-a` 的 `m-9/seq9`、成员候选 `{u-a,u-b}`、`u-c` 非成员；String 近似在线/短期速率、Hash 派生预览、Set 仅候选成员、ZSET `c-a:100,c-b:90` 降序、List `[m-9,m-8,m-7]` 有界近期窗口。
- Bitmap 用三个稳定设备偏移 0/1/2，仅 bit2 为 1，`BITCOUNT=1`；它是 String 上的位操作。没有稳定且有界的偏移映射，就不能直接把任意用户 ID 当位。
- Stream 用 N1/N2 **教学标签**表示两条事件，G1 只 ACK N1，N2 仍 pending；`XACK` 解的是消费组待确认引用，不自动删除整个 Stream 条目，也不证明 B 设备收到。
- Pub/Sub 只是在线订阅分发、官方为至多一次交付；List pop、Stream 消费组和设备回执的含义分开。Redis/SQL 两系统写入不自动同事务，07.10 再讲 outbox。

## 技术修订

- 原稿曾写 `SISMEMBER` 未命中 `u-c` “可直接判定无权访问”；正式页把 Redis Set 明确降为**候选筛选**，最终授权仍由足够新的 `members` 权威状态裁决。
- 原稿说 `INCR` 可“安全生成递增序号”，若拿来替 06.12 的 `conversation_counters.next_seq` 会失去与 SQL 消息插入同成同败的边界。正式页仅将 Redis `INCR` 用于可按风险政策重置的临时限流计数，明确不能未经新协议替代权威序号。
- 原稿用临时 `m-9` 缓存对象描述 S2/S3 权威时有混淆；正式页不声称当前 S2 使用 Redis，也不把缓存副本当未来 S3 权威历史。
- Redis Stream 保留、消费组 pending、认领和 Redis 自身持久都需要独立配置/协议；`XACK` 不是目标设备或数据库事务确认。N1/N2 不是可直接传给 `XADD` 的真实 Stream ID。
- List 只保有界近期窗口，ZSET 分数是教学派生值而非多设备物理时间；Set/Hash/Bitmap/Stream 的最大大小、TTL、权限和重建来源均须评审。

## 静态边界与同步

- 所有键、TTL、分数、条目、位标志均虚构；没有运行 Redis、Go、数据库、消息服务或站点，也没有 OpenIM Redis 实现声明。
- 已同步正式页、07.01 下一章链接、卷目录、总目录、侧边栏、学习路线、计数和来源散列。
