# 08.08 审阅记录：跨服务事务

DeepTutor BookEngine 八节初稿均 ready、无失败块；本地 HTTP Markdown 导出与引擎渲染 SHA256 一致。`original.md` 保存完整初稿。正式页从“`m-9` 已提交而 Notify 失败”的 IM 业务结果出发，依次解释本地原子范围、2PC 准备/决议、Saga 局部步骤与补偿、状态查询、故障对账和固定源码证据，附 22 道分层练习。

## 教学重组

- 当前 S2 `accepted_in_memory` 与拟议 S3 `stored_in_teaching_db` 的成功点先写清；本文讨论的 `messages+outbox` 只在未来 SQL 教学方案中同库同事务。
- 用两个可 prepare 的**虚构数据库** MessagesDB/DeliveryLedgerDB 讲 2PC；C0–C3 明示 prepare 后协调者故障的待决与持锁，以及持久全局决议后的重发责任。
- 用已承诺消息作为本题 Saga 的业务 pivot；后续 SearchIndex/Notify 各有子状态、重试或修复，而不是拿一个 `done` 或“删除消息”掩盖错误。
- 区分原事件重试、权威状态重建、外部更正动作与对 A 的状态查询；B 的接收/已读仍有独立证据。

## 技术修订

- 原稿多次把 S3 已提交消息写成“可搜索”，容易把权威事实与 SearchIndex 的派生效果混成一个确认。正式页明确 DB Commit 只证明本地消息与 outbox 意图；索引、通知与设备各自可滞后。
- 原稿有“Saga、Outbox 与状态查询共同保证 Notify 失败后消息不丢”式表述，过度合并方案保证。正式页分别限定：同库事务留下发布意图，工作流记录责任和重试，状态查询只帮助观察未知，任何一项都不自动完成外部效果。
- 原稿部分段落把 `operation_id` 与当前 S2 重复消息 ID/409 直接等同。正式页坚持当前 S2 同 ID 即使同正文仍 409；未来按操作 ID 查询或改变重试结果必须另审 API 版本和权限。
- 原稿 2PC 例子偶尔拿搜索索引库作可 prepare 参与者；正式页固定两个**可 prepare 的玩具数据库**，并明确普通 WebSocket/broker 调用不能仅靠 PostgreSQL `PREPARE` 参加全局原子提交。
- PostgreSQL prepared 事务会持锁、影响 VACUUM，须外部事务管理器及时收尾；协调者崩溃后的 in-doubt 参与者不能各自猜 COMMIT/ABORT。该限制按 PostgreSQL 官方文档与 Gray/Lamport 论文核对。
- 已发提示或用户已见内容不能由本地 ROLLBACK 抹去；若业务需撤回，用新事实/版本/权限和可审计补偿。固定 OpenIM 两段源码不支持宣称 2PC、Saga 或教学 SQL outbox 已实现。

## 静态边界与同步

- MessagesDB、DeliveryLedgerDB、C0–C3、Saga 状态与故障均为纸上教学输入；未运行 Go、数据库、broker、IM、故障或站点。
- 已同步正式页、08.07 下一章链接、第八卷目录、总目录、侧边栏、学习路线、能力验收与来源散列。
