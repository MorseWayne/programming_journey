# 07.10 审阅记录：事务边界与 outbox

DeepTutor BookEngine 八节初稿均 ready、无失败块；本地 HTTP Markdown 导出与引擎渲染 SHA256 一致。`original.md` 保留完整原稿。正式页按“业务双写反例 → 同库事务 → C0–C7 崩溃点 → 多转发器与同键顺序 → 消费者/外部效果 → 对账与 CDC → 固定源码边界”重组，附 22 道分层练习。

## 教学重组

- 先用 `m-9/c-a/seq9` 与 `E9(evt:m-9:v1)` 建立权威事实、事件、派生副作用和确认点，不要求初学者先熟悉 broker 实现细节。
- DB 先写与 broker 先写各给一个明确崩溃反例；同库 `messages` + `outbox` 的一次 Commit 只闭合前者的“事实缺发布意图”裂缝，不包装成跨系统事务。
- C0–C7 每点都列“可观察到什么、结果未知时怎样恢复”；先标 `PUBLISHED` 的漏发与先 broker 确认后标记的重复分别推演。
- 多 relay 领取、租约、迟到持有者及 E9/E10 生产侧顺序分开解释；`SKIP LOCKED` 是短事务领取候选机制，不是跨网络持锁或顺序保证。
- `(message_id,version,side_effect)` 分开消费幂等；搜索索引完成不代表 Notify、gateway、B 接收或阅读完成。

## 技术修订

- 原稿有同一小节标题/机制重复，并把“固定源码通常能直接确认 outbox 状态”混入教学段落；正式页明确**固定 OpenIM 两段源码并未展示本章 SQL outbox**，不能据此断言有或没有该实现。
- 原稿有时将“broker、消费者或下游 B 必须按 event_id 幂等”合并成一句，容易把设备收/读与后台消费混为一个确认。正式页把 SearchIndex、Notify、gateway 与 B 分开，且用业务 ID、版本、副作用定义各目标幂等。
- 原稿使用 `event_id=E9` 等记法，正式页统一 E9 为事件名、`evt:m-9:v1` 为稳定事件身份；E10 是同会话下一项，broker 分区位置只沿 07.08 的玩具模型讨论。
- `PUBLISHED` 只在已知 broker 确认之后写，且含义取决于实际确认配置；ACK 丢失属于结果未知，可能重发。没有宣称端到端 exactly once。
- 对 S2 的 `accepted_in_memory` 与未来 S3 的 `stored_in_teaching_db` 加醒目边界；课程没有把 SQL outbox 写成现有服务或 OpenIM 已部署事实。
- CDC 只作为替代提取方式，仍要求稳定事件 ID、重放/消费幂等和权威对账；PostgreSQL `SKIP LOCKED` 的官方说明仅支撑跳过已锁行的队列式领取用途。

## 静态边界与同步

- 纸上事件、表、崩溃点和状态均为虚构教学输入；未运行 Go、数据库、broker、故障注入、性能测试或站点。
- 正式页同步至第七卷目录、总目录、侧边栏、学习路线、能力验收与前一章链接；来源散列在 `provenance.json` 核验。
