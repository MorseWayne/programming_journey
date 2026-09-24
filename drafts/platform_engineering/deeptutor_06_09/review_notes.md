# 06.09 审阅记录：日志与崩溃恢复

DeepTutor BookEngine 八节初稿均 ready，HTTP Markdown 导出与本地渲染 SHA256 一致。完整原稿保存在 `original.md`；正式页以 `m-a` 的六个崩溃点为主线，从 WAL 顺序、REDO、检查点走到同步配置、备份与业务对账，附 22 道练习。

## 教学重组

- 明确既有 S2 HTTP `200 accepted_in_memory` 与未来 S3 持久版 `200 stored_in_teaching_db` 是不同合同；C5 只用于未来持久版情景，绝不回写 S2 语义。
- 统一 C0 BEGIN 前、C1 INSERT 后未提交、C2 提交日志产生但未达持久边界、C3 同步 WAL 持久且 COMMIT 成功但数据页仍 dirty、C4 数据页写回、C5 A 收到未来持久版 HTTP 200。
- C1/C2 不能保证已提交，C2 也不能说“必丢”；C3 在同步、`fsync` 和可靠存储前提下本机可恢复。C3–C5 响应丢失则客户端未知，须凭稳定 `m-a`/操作 ID 对账。
- 先区分日志产生、OS 缓存、持久 flush，再讲 REDO 和通用 UNDO 概念、检查点与 RPO/RTO；SQLite/MongoDB 仅按各自官方口径对照。

## 技术修订

- 原稿前段把 C4 写成“HTTP 200 尚未到达”、C5 写成“随后数据页回写完成或未完成”，后段又按 C4 数据页已写回定义。正式页固定单一 C0–C5 序列，所有练习共用同一时间线。
- WAL 必须先于**相关数据页的持久写回**，但数据页可在事务提交前或后写回；提交成功不要求每笔刷数据页。正式页修正了容易把“提交→刷页”读成固定顺序的图。
- `WAL record` 已生成、`INSERT` 已执行或 dirty 页存在都不等于事务已持久提交；C2 不断言必然丢失。PostgreSQL 的崩溃恢复不能机械等同教材中的“每笔 REDO+传统独立 UNDO 日志”。
- 检查点推进数据文件和 redo 起点，不是每笔 COMMIT 或备份；旧 WAL 还可能因归档、复制等需要保留。`synchronous_commit=off` 的近期已报成功事务丢失窗与 `fsync=off` 的一致性风险分开。
- 本机持久、同步副本、HTTP 回答、B 设备投递与阅读是不同确认点；SQLite WAL checkpoint 和 MongoDB journal/write concern 不套 PostgreSQL 参数。

## 静态边界与同步

- 所有消息、日志、故障点均虚构，无公司内容或 OpenIM 存储实现声明；未运行 SQL、数据库、Go、崩溃实验或站点。
- 已同步正式页、06.07/06.08 链接、卷目录、总目录、侧边栏、学习路线、计数与来源散列。
