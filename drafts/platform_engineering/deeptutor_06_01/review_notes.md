# DeepTutor 06.01 生成与审阅记录

## 生成材料

- DeepTutor 书籍 `bk_310b896a2b`、正文页 `pg_12b1e72fe1`；8 个正文块 ready、失败块 0。HTTP Markdown 导出与容器 `generated.md` 的 SHA-256 相同。
- `original.md` 原样保留自动导览、重复小节、不同的四表字段与类型方案；`reviewed.md` 是统一模型后接入课程的静态审阅稿。`generation_request.json` 保存八节要求。
- 本地 BookEngine 使用进程内参数适配，没有修改 DeepTutor 持久配置。

## 技术与教学审阅

1. 原稿多处重复“内存受理、保存、设备送达”，并容易把“出现一条持久记录”当作已有耐久确认。审阅稿明确本章只设计模式；写入、提交、崩溃恢复和设备确认分别后续教学，纸上有一行不能当运行证据。
2. 原稿在四张表间切换文本/数字 ID、`nickname/display_name`、`accepted_at/sent_at` 与成员主键，有一处又把历史成员资格的三列复合键当作当前四表模型。审阅稿统一为文本身份 `u-a/u-b/c-a/m-a`，`members(conversation_id,user_id)` 只代表当前关系；退出再加入需要独立历史事件或资格身份，不能由当前复合主键保存两段历史。
3. 静态 PostgreSQL 草案按用户、会话、成员、消息依次定义；主键唯一且非空，外键只验证引用存在，`UNIQUE(conversation_id,seq)` 只限制同会话重复序号。它不自动分配序号，也不证明发送者当时具有成员权限。
4. 原稿一处用字符数 `char_length` 限制正文，容易偏离 S2 的字节上限。跨章复核后，审阅稿在 PostgreSQL 教学方言和 UTF-8 编码假定下统一使用当前 09.02 合同的 `octet_length(body) BETWEEN 1 AND 6`；`你好` 6 字节合法、`中文甲` 9 字节拒绝。工程卷 R9 是单独待审变更，不是当前接口。应用层仍须与数据库保持同一业务合同。
5. `NULL` 与空字符串、0、没有记录分开；`left_at IS NULL` 只按字段合同表示当前行未记退出时刻。PostgreSQL `CHECK` 遇到 UNKNOWN 可通过，因此必填字段还需 `NOT NULL`。不能由 NULL 推断在线、已读或全部历史成员资格。
6. 文档对照只比较集合/文档/字段、嵌入与引用；无界消息历史不塞进一个会话文档，引用也不能被说成自动外键。没有检查 OpenIM 的具体存储实现，不能把教学 SQL/文档例子称为上游事实。
7. 22 道练习从表与类型进到键、约束、NULL、成员权限及文档增长边界。本章没有运行 SQL、数据库、Go、IM 服务或站点构建。

## 核对资料与验证范围

- [PostgreSQL：基本概念](https://www.postgresql.org/docs/current/tutorial-concepts.html)与[约束](https://www.postgresql.org/docs/current/ddl-constraints.html)：表、列、主外键、CHECK 和 NULL。
- [SQLite：外键](https://www.sqlite.org/foreignkeys.html)：引用对象存在与可空外键的基础语义；本文示例仍为 PostgreSQL 方言。
- [MongoDB：数据建模](https://www.mongodb.com/docs/manual/data-modeling/)、[嵌入](https://www.mongodb.com/docs/manual/data-modeling/embedding/)与[引用](https://www.mongodb.com/docs/manual/data-modeling/referencing/)：文档结构、访问模式和增长边界。
- 本章只做文档结构、链接、来源哈希、隐私词和纸上数据/约束校核。
