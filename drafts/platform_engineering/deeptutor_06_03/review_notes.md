# DeepTutor 06.03 生成与审阅记录

## 生成材料

- DeepTutor 书籍 `bk_f606685275`、正文页 `pg_8247c2abac`；8 个正文块 ready、失败块 0。HTTP Markdown 导出与容器 `generated.md` 的 SHA-256 相同。
- `original.md` 原样保留自动导览、重复小节和各节不同的快照字段/迁移假设；`reviewed.md` 是统一身份与历史语义后的静态课程，已同步正式页。`generation_request.json` 保存八节要求。
- 本地 BookEngine 使用进程内参数适配，没有修改 DeepTutor 持久配置。

## 技术与教学审阅

1. 原稿正确指出“当前昵称”与“发送时昵称”不同，但一处建议用当前 `users.display_name` 回填旧消息的快照，只附注它是迁移时的名字。审阅稿将旧事实是否可恢复作为硬边界：没有可信历史来源就保持 NULL/未知；即使 UI 回退显示当前名，也须明确标记不是历史快照，不把当前名写入 `sender_display_name_at_send` 冒充过去。
2. 统一使用 06.01 的 `users/conversations/members/messages` 与 `u-a/c-a/m-a`。`members(conversation_id,user_id)` 只代表当前关系；要保存退出再加入，另设带 `membership_id` 的资格区间或事件。行内 CHECK 不能防跨行时间重叠，外键不能证明发送时权限。
3. 函数依赖先用 `user_id → current_display_name`、`message_id → sender_id`、`(conversation_id,seq) → 消息行` 建立直觉，再分别用当前昵称重复、会话标题只依赖复合键一部分、当前昵称经 sender_id 传递依赖解释更新异常与 1NF/2NF/3NF。避免“所有数组违法 1NF”或“所有冗余都错误”的过强说法；发送时快照有独立业务语义。
4. 原稿多处将迁移写成“所有旧行最终有快照、然后加 NOT NULL”。正式页说明历史不可恢复时旧行应继续允许 NULL，不能直接全表收紧；新增可空列→新写入→兼容读取→可信来源回填与核对→有条件收紧/清理。PostgreSQL 加列只作静态语法示意，不宣称所有版本/表都瞬时无锁。
5. 有意冗余 `last_message_preview` 与消息权威记录分开；须写更新、失效、对账、重建与可容忍陈旧条件。MongoDB 文档嵌入仅用于有界相关字段，无界消息历史保持独立引用，不把文档灵活性误读为无模式或免除业务规则。
6. 22 道练习覆盖依赖、异常、范式、成员历史、文档取舍、回填与旧版兼容。没有运行数据库、Go、IM 服务、迁移或站点；没有检查 OpenIM 的具体存储实现。

## 核对资料与验证范围

- [CMU 数据库课程：Normal Forms](https://15445.courses.cs.cmu.edu/fall2017/notes/05-notes-normalforms.pdf)：函数依赖、异常、规范化与分解。
- [PostgreSQL：约束](https://www.postgresql.org/docs/current/ddl-constraints.html)与[修改表结构](https://www.postgresql.org/docs/current/ddl-alter.html)：主外键、CHECK、可空列和收紧约束。
- [MongoDB：识别工作负载](https://www.mongodb.com/docs/manual/data-modeling/schema-design-process/identify-workload/)、[嵌入](https://www.mongodb.com/docs/manual/data-modeling/embedding/)、[引用](https://www.mongodb.com/docs/manual/data-modeling/referencing/)与[数据一致性](https://www.mongodb.com/docs/manual/data-modeling/data-consistency/)：访问模式、冗余和一致性取舍。
- 本章只做文档结构、链接、来源哈希、隐私词和纸上迁移顺序校核。
