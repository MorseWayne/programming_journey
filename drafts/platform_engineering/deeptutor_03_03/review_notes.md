# DeepTutor 03.03 生成与审阅记录

## 生成材料

- DeepTutor 书籍 `bk_8a06a3805d`、正文页 `pg_43e9313303`；8 个正文块 ready、失败块 0。HTTP Markdown 导出与容器原稿的 SHA-256 一致。
- `original.md` 保留自动导览、重复小节与原始案例；`reviewed.md` 是统一课程合同后的静态教材，已同步到正式页。`generation_request.json` 保存八节请求。
- 本地生成使用 BookEngine 与进程内参数适配，没有修改 DeepTutor 持久配置。

## 技术与教学审阅

1. 原稿后半段偏离既定本地历史 CLI，换成 `imcli send`、附件、`--file`、服务脚本和线上排障。审阅稿固定 `imhistory check -file history-c-a.json`、v1 本地文件与 `c-a/u-a/m-a` 虚构身份；线上网关只作为后续迁移问题。
2. 固定 01.12 的路径优先级：显式 `-file` > 非空 `IMHISTORY_FILE` > 教学默认相对路径。空环境值回默认，非法显式参数退出 2，文件访问失败退出 4，内容无效退出 3。
3. PID/PPID 是带时刻的进程观察，非程序永久身份、IM 用户身份或服务健康证据；进程可退出、PID 可复用。cwd 以实际进程为准，不等同源码或可执行文件目录。
4. Linux FD 是相对进程与时间的整数句柄，0/1/2 是常见标准流约定但可重定向；FD 数量高不自动证明泄漏。`/proc/<PID>/fd` 仅在自己隔离样本中读必要信息，不把真实路径或令牌扩散到课程记录。
5. SIGTERM/SIGINT 的处理取决于程序，SIGKILL 无法被捕获；不承诺 `defer` 在信号终止时执行，也不给所有 shell 固定的信号退出码。`os.Exit` 同样不运行尚未执行的 `defer`。
6. `/proc` 是伪文件系统且部分接口可写；只选 `ps`、`/proc/<PID>/cwd`、`/proc/<PID>/fd` 的只读观察示意，并说明 `hidepid`、权限、容器视角和短命进程的限制。原稿多次建议查看完整环境，审阅稿改为避免读取或传播 `/proc/<PID>/environ` 全文。
7. 以“相同相对路径、不同 cwd”形成完整现象、假设、只读证据、修正和复核链；22 道练习从术语进到权限/信号/业务取舍。没有运行 Linux 命令、Go 示例、测试、站点构建或服务。

## 核对资料与验证范围

- [Linux `proc(5)`](https://man7.org/linux/man-pages/man5/proc.5.html)、[`ps(1)`](https://man7.org/linux/man-pages/man1/ps.1.html)、[`signal(7)`](https://man7.org/linux/man-pages/man7/signal.7.html)。
- [Linux `getcwd(2)`](https://man7.org/linux/man-pages/man2/getcwd.2.html)、[`environ(5)`](https://man7.org/linux/man-pages/man5/environ.5.html)。
- [Go `os.Getenv`](https://pkg.go.dev/os#Getenv)、[`os.LookupEnv`](https://pkg.go.dev/os#LookupEnv)。
- 本章只检查文档结构、链接、来源哈希与静态案例的条件推导。
