# DeepTutor 10.06 生成与审阅记录

## 生成材料

- DeepTutor 书籍 `bk_03b12c5a62`、正文页 `pg_a60aac2e5e`；8 个正文块 ready，失败块为 0。HTTP Markdown 导出与容器 `generated.md` 的 SHA-256 相同。
- `original.md` 保留自动导览、重复标题和各块原始案例；`reviewed.md` 是统一合同后接入正式课程的审阅稿，`generation_request.json` 保存八节要求。
- 生成只用本地 BookEngine 和进程内 token 参数适配，没有修改 DeepTutor 持久配置。

## 技术与教学审阅

1. 原稿将同一 IM 案例先写成“正文上限 6→9 字节”，后又改成“历史保留 6→9 天”，并多次把 `c-a/u-a/m-a` 当作提交或分支身份。审阅稿固定它们为虚构会话、用户、消息；提交用 B0/T1/M1，需求为单条正文 R9。
2. 原稿把课程 CLI 的 `-max-bytes` 写作 `file-max-bytes`，并为其自造退出码分类。审阅稿沿 01.12：整份文件默认 1 MiB，成功/帮助 0、用法 2、无效历史 3、文件 I/O 或目标冲突 4、其他未预期错误 5。
3. 原稿有将 `messages:null` 按空列表处理的段落。审阅稿维持 v1 合同：缺失或 `null` 拒绝，显式 `[]` 合法。
4. 先从 10.03 的工作区/索引/提交回到差异范围，再用 R9 的 9 字节等号边界讲评审意见，最后推进共同祖先、三方合并、文本冲突、语义冲突、rebase 和合并后回归；每个术语依赖前一层。
5. 明确 `git diff main...topic` 取共同祖先到主题端点的内容差异，`git diff --check` 只查部分格式问题，不证明业务正确；PR 是托管平台协作记录，不是 Git 提交对象，也不假定仓库启用了审批或保护规则。
6. 合并示例用 B0:6、T1:9、M1:12 说明冲突内容必须由业务需求决定。注明 rebase 会生成新的提交身份；`--skip` 可能丢改动，`--abort` 只撤销进行中的操作；全部教学命令留给个人隔离仓库执行。
   教学冲突标记在代码块中额外缩进一格，避免 Git 把课程示例误判为未解决冲突；正文已说明实际标记从行首开始。
7. 提供 22 道分层练习与完整审查材料清单，区分静态预期、个人真实运行、审批、推送、合并和发布。未声称 OpenIM 运行或投递事实。

## 核对资料与验证范围

- [Pro Git：基础分支与合并](https://git-scm.com/book/en/v2/Git-Branching-Basic-Branching-and-Merging)、[变基](https://git-scm.com/book/en/v2/Git-Branching-Rebasing)。
- [Git `merge` 手册](https://git-scm.com/docs/git-merge)、[Git `rebase` 手册](https://git-scm.com/docs/git-rebase)。
- [GitHub Pull Request Reviews](https://docs.github.com/en/pull-requests/reference/pull-request-reviews)。
- 本次只做文档结构、链接、来源哈希与案例静态推导检查；未执行教学 Git 合并、Go 测试、站点构建或 IM 服务。
