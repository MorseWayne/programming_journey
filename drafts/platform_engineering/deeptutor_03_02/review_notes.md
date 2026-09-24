# DeepTutor 03.02 生成与审阅记录

## 生成材料

- DeepTutor 书籍 `bk_6e1413a929`、正文页 `pg_cd98bb5a4e`；8 个正文块 ready，失败块 0。HTTP Markdown 导出与容器 `generated.md` 的 SHA-256 相同。
- `original.md` 保留自动导览、重复标题和原始片段；`reviewed.md` 是按本课程先修与合同重组的静态教材，已同步到正式页。`generation_request.json` 保存八节具体要求。
- 本地生成只使用 BookEngine 与进程内 token 参数适配，没有修改 DeepTutor 持久配置。

## 技术与教学审阅

1. 原稿在生命周期一节为同一个 CLI 自造“路径失败 2、读取失败 3、内容失败 4、关闭失败 5”，后又列出另一套 0/2/3/4/5。审阅稿统一沿 01.12：2 用法、3 无效历史或超限、4 文件 I/O/目标冲突、5 未预期错误；底层 `error` 与进程退出码分开。
2. 原稿部分例子使用 `im check ./messages.log`、`config.json` 或含签名校验的日志协议，偏离本地历史 v1。审阅稿固定 `imhistory check -file history-c-a.json`，只断言已定义的 v1 字段、版本、限量读取与会话内重复规则。
3. 按“程序文件→进程→运行时→用户/内核权限边界→本地文件→业务校验→退出”重排解释。Go goroutine 不等于线程或进程；虚拟地址图是概念角色，不是固定物理布局。
4. 不把 `os.Open` 固定为一次同名 `open` 系统调用，也不把普通 Go 函数、JSON 解码或网络 RPC 全部叫系统调用。平台、Go 版本和运行时路径可不同；本章只给有条件的 Linux 概念路径。
5. `*os.File` 与底层描述符是资源句柄，不是文件内容；`maxBytes+1` 保留 1 MiB 文件上限，`messages:[]` 合法而缺失或 `null` 拒绝。打开、读取、解码、领域校验的证据范围逐层说明。
6. `os.Exit` 不运行尚未执行的 `defer`，资源清理留在内层；短片段只演示打开和关闭，导出关闭失败仍须另行处理。不从退出 0 推断崩溃耐久、远端受理或送达。
7. 保留 22 道从基础概念、机制、故障分类到业务迁移的反馈练习，附完整 12 步 `check` 时间线与三种失败变式。未执行 Go、Linux 观察命令、测试、站点构建或服务。

## 核对资料与验证范围

- [OSTEP 作者章节](https://pages.cs.wisc.edu/~remzi/OSTEP/)：进程与地址空间的体系结构。
- [Linux `syscalls(2)`](https://man7.org/linux/man-pages/man2/syscalls.2.html)、[`open(2)`](https://man7.org/linux/man-pages/man2/open.2.html)、[`proc(5)`](https://man7.org/linux/man-pages/man5/proc.5.html)：Linux 接口与进程信息。
- [Go `os.Open`](https://pkg.go.dev/os#Open)、[`os.Exit`](https://pkg.go.dev/os#Exit)：标准库文件与退出语义。
- 本章只核对文档结构、链接、来源哈希和静态案例的机制与单位，没有运行样例或真实系统实验。
