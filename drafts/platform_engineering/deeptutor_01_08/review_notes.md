# DeepTutor 01.08 生成与审阅记录

- 书籍 `bk_08336b4093`，正文页 `pg_fb0299bd77`；8 个 section 块均为 ready，HTTP Markdown 导出已核对。
- 原稿保留生成器导出；审阅稿移除重复书籍导航，统一为单一 JSON 文件、JSON Lines、时间、上限、覆盖写入和 flag 的八层教材结构。
- 移除了以 `panic` 处理普通编码/解码失败的示例；所有导入失败改为返回带上下文的 `error`。
- 明确 JSON 解码不等于业务有效；严格未知字段、第二个 JSON 值、RFC3339、Scanner `Err`、`LimitReader(max+1)` 和 `WriteFile` 的部分写入边界分别解释。
- 本章只引用 Go 标准库文档，不新增 OpenIM、网络、并发、可靠交付或持久化保证结论。
- 已同步正文、01.07 链接、卷入口、侧栏、路线和进度；未运行 Go、测试或站点构建。
