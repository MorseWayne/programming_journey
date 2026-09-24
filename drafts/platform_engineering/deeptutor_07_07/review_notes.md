# 07.07 审阅记录：确认、重投与去重

DeepTutor BookEngine 八节初稿均 ready，HTTP Markdown 导出与本地渲染 SHA256 一致。原稿保存在 `original.md`；正式页围绕未来教学 S3 权威消息 `m-9` 与事件 E9，分层讲生产 ACK 丢失、消费 ACK 顺序、版本化幂等、去重窗口和跨系统空窗，附 22 道练习。

## 教学重组

- 生产者发布 `event_id=evt:m-9:v1` 已被 broker 接受、确认返程丢失时结果未知。五分钟是**玩具配置**：首次后四分钟重试与首次后六分钟重试为**两条独立分支**，避免暗猜一次重复命中是否刷新 broker 滑动窗口。
- SearchIndex W1 假定 ACK 已被 broker 记录后再写索引而崩溃，可能漏效果；先写索引再 ACK，ACK 未记录即崩溃，可能重投 W1/W2。消费确认不等于外部索引恰好一次或 B 设备已读。
- 去重/条件更新按 `(message_id,version,side_effect)`：E9 的 m-9/v1 重投无害，合法编辑 v2 必须更新搜索，Notify 不得被 SearchIndex 的去重标记误吞。
- 消费者去重记录仅保留十分钟，**另行配置**的第十一分钟重投会越过窗口；目标版本化条件更新或与最大回放范围匹配的持久去重才可承接更久重放。
- Redis `XACK` 仅清对应消费组 PEL 引用；NATS `Nats-Msg-Id`/AckWait、Kafka 位点各有自己的作用域。S2 HTTP 同 ID 重复仍一律 409，不因 broker 的事件去重改成 200。

## 技术修订

- 原稿前段把“相同 `message_id` 且相同请求体的 HTTP 重试”说成返回第一次 `200/202`，后段才说既有重复 ID 返回 409；正式页始终保持 [09.02](../../../src/docs/platform_engineering/curriculum/09_backend_security/02_http_api_contract.md) 的**相同 ID 一律 409**，另用授权查验解决响应未知。
- 原稿某一题把第 4 分钟和第 6 分钟重试堆成连续同一轨迹，推成最多三条事件；若命中可能刷新去重窗口，不能不核对实现就这样算。正式页将它们定义为从首次发布分叉的两条独立反例。
- 原稿把 producer 窗口、consumer 窗口和 HTTP 重复标识多次写成可互相替代；正式页区分事件发布 ID、业务消息 ID、消息版本和副作用范围，短窗口只保护其自身阶段。
- NATS/Redis/Kafka 消费确认不与外部 SearchIndex 写入自动原子；DB Commit 后、broker 发布前的崩溃仍会漏事件，outbox 留 07.10，不声称已部署。

## 静态边界与同步

- 所有事件、时间窗、worker 与故障均为虚构；没有运行 NATS、Redis、Kafka、数据库、Go 或站点，无 OpenIM 真实消息路径声明。
- 已同步正式页、07.06 下一章链接、卷目录、总目录、侧边栏、学习路线、计数与来源散列。
