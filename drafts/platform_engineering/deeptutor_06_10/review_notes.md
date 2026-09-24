# DeepTutor 06.10 生成与审阅记录

## 生成材料

- DeepTutor 书籍 `bk_4235d3bc0e`、正文页 `pg_f968a3aeb0`；8 个正文块 ready、失败块 0。HTTP Markdown 导出与容器 `generated.md` 的 SHA-256 相同。
- `original.md` 原样保留自动导览、重复小节和多套数据访问示例；`reviewed.md` 是按“业务查询→资源所有者→Go API→错误/取消→文档驱动对照”重组的静态课程，已同步正式页。`generation_request.json` 保存八节要求。
- 本地 BookEngine 使用进程内参数适配，没有修改 DeepTutor 持久配置。

## 技术与教学审阅

1. 原稿多次重复 `sql.Open`、`QueryRowContext`、`Rows`、MongoDB Cursor 的入口和生命周期。审阅稿以 `u-a` 读 `c-a` 的更旧消息为唯一贯穿案例，先区分认证主体、会话参数、当前成员资格、数据库结果和设备交付，再逐层引入 API。
2. `sql.Open` 成功只得到驱动支持的 `*sql.DB` 句柄，不证明网络可用；`PingContext` 只是当时的主动探测。`*sql.DB` 与 MongoDB Client 应随应用复用，Rows/Cursor 由一次查询函数及时关闭，不能每请求重建池或忘记查询结果资源。
3. `QueryRowContext` 的 `sql.ErrNoRows` 在 `Scan` 才出现；本章成员资格查询中的无行可映射无权限，消息详情查询中的无行则可表示不存在，数据库错误不能伪装成其中一种。多行 `Rows` 读取必须在成功获得后安排 `Close`、按列序 `Scan`、循环后查 `Err`；部分扫描结果不能当完整历史页。
4. PostgreSQL `$1/$2` 只绑定**值**，不能安全地把客户端自由表名、列名和排序方向作为参数；这些结构由服务端白名单选择。`sql.NullString.Valid` 保留“旧消息昵称快照未知”与“没有消息行”的区别。`RowsAffected` 与 `LastInsertId` 的支持依赖驱动；PostgreSQL 返回新消息 ID 可用 `RETURNING` 加 `QueryRowContext`。
5. Context 控制等待和取消，但请求超时不等于服务端绝未写入。原稿中事务和批量示例容易让初学者把 API 名称当成原子性保证；审阅稿只讲同一 Tx 的资源责任，明确隔离、冲突、批量部分成功与崩溃确认后置 06.07–06.09。
6. MongoDB Go 驱动只作 Client/Collection/Cursor 生命周期与有界查询对照；`Find` 后迭代 `Next/Decode/Err/Close`，不对无界历史使用 `Cursor.All`。文档引用不自动成为关系数据库外键，写入确认须按具体驱动/服务端配置核对，不声称 OpenIM 的实现事实。
7. 22 道练习覆盖池句柄、扫描、NULL、参数、取消、事务入口、Cursor 与 IM 业务确认。没有运行 Go、数据库、IM 服务或站点；Go 片段仅为教学示意。

## 核对资料与验证范围

- [Go：关系数据库](https://go.dev/doc/database/)、[打开句柄](https://go.dev/doc/database/open-handle)、[查询](https://go.dev/doc/database/querying)、[连接管理](https://go.dev/doc/database/manage-connections/)与[`database/sql` API](https://pkg.go.dev/database/sql)：驱动、池、Rows 和错误。
- [Go：修改数据](https://go.dev/doc/database/change-data)、[SQL 注入](https://go.dev/doc/database/sql-injection)、[取消操作](https://go.dev/doc/database/cancel-operations)：参数、Context 与结果边界。
- [MongoDB Go 驱动：连接池](https://www.mongodb.com/docs/drivers/go/current/connect/connection-options/connection-pools/)、[查询](https://www.mongodb.com/docs/drivers/go/current/crud/query/retrieve/)与[Cursor](https://www.mongodb.com/docs/drivers/go/current/crud/query/cursor/)：Client/Collection/Cursor 生命周期。
- 本章只做文档结构、链接、来源哈希、隐私词和纸上资源/错误路径审阅。
