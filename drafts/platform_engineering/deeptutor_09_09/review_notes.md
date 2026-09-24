# 09.09 审阅记录：异步与长任务

DeepTutor BookEngine 八节初稿均 ready、无失败块；本地 HTTP Markdown 导出与引擎渲染 SHA256 一致。`original.md` 保存完整初稿。正式页以虚构 B 导出 `c-a` 截至 seq9 的有权历史为主线，分层讲新纸上 `/v3` 的 202/Location、幂等键、操作状态、取消竞态、权限、轮询与 OpenIM 证据边界，附 22 道练习。

## 教学重组

- 当前 S2 `/v1` 发消息 200 `accepted_in_memory` 和拟议 S3 `/v2` 200 `stored_in_teaching_db` 原样保持；`/v3/conversations/c-a/exports` 是**未部署的另一资源**，不改变当前 6 UTF-8 字节/409/404 合同。
- 服务端只有在操作记录与可靠待调度意图同库持久后才答 202，并用 `Location: /v3/operations/exp-9` 和状态正文给客户端后续查询入口；202 不是“文件已生成”。
- 新 `/v3` 的相同受信主体/幂等键/规范请求指纹在保留窗复用同一 `exp-9`，键相同请求不同为 409；与 S2 的同 `message_id` 一律 409 是两套合同。
- 任务状态、取消请求、成功结果与下载分别审阅：`CANCEL_REQUESTED` 不等于 `CANCELED`，`SUCCEEDED` 不等于 B 已下载；提交、执行、状态/下载各查当前对象权限。

## 技术修订

- 原稿前段有另一组 `Location: /v3/exports/e-x7k` 与后段 `/v3/operations/exp-9` 并存，初学者无法确定状态资源。正式页固定 `exp-9` 操作资源与独立结果资源。
- 原稿个别段落把旧 OpenIM `MsgToMQ` 源码写成可说明现有 S2 `accepted_in_memory` 或拟议 S3 `stored_in_teaching_db` 语义；正式页明确这两段只证明所述调用/返回位置，不能证明本项目 `/v3` 导出或教学 HTTP 合同的部署。
- 原稿对 `Cache-Control: no-store` 的隐私效果写得过强。正式页按 RFC 9111 限定：它约束正常缓存行为，不替代授权、传输保护或对象存储 ACL。
- 原稿将 `FAILED_REPAIR` 有时当终态、有时又继续修复，并在部分竞态里仅用 `context` 取消推断外部文件消失。正式页以状态/版本 CAS 决定 `SUCCEEDED` 与取消谁先赢，未知 artifact 用稳定 ID 查/清理，不以本机取消回滚外部效果。
- B 在任务提交后退群或消息撤回，需要执行/下载再鉴权和结果保护；`before_seq=9` 是业务范围，不是数据库一致快照 ID。
- RFC 9110 的 202 是非最终受理，`Location` 是本题主动选定的状态监视合同；新 `/v3` 的具体 409/取消映射均标为教学方案。

## 静态边界与同步

- 请求、响应、任务状态、文件和故障都是纸上输入；未运行 Go、HTTP 服务、数据库、对象存储、worker、浏览器或站点。
- 已同步正式页、08.12 后续链接、第九卷目录、总目录、侧边栏、学习路线、能力验收与来源散列。
