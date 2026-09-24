# 08.07 审阅记录：协调与对象归属

DeepTutor BookEngine 八节初稿均 ready、无失败块；本地 HTTP Markdown 导出与引擎渲染 SHA256 一致。`original.md` 保存完整初稿。正式页按“旧连接问题 → etcd 原语 → r101/r110/r111 接管 → 目标端围栏 → watch 恢复 → 租约取舍 → 源码证据 → 22 题”重组。

## 教学重组

- 用 `u-b/d-b1` 从 G1 重连 G2、E9 可能迟到这一条业务线，先分物理 socket、etcd 注册 owner、任务执行资格和权威历史。
- 固定 `Version(key)==0` 的原子 Txn、15 秒 L1、G1 停顿 20 秒、etcd 已确认过期删除 r110、G2 新建 r111；特别声明 **20 秒停顿本身不足以直接证明 etcd 已删键**。
- 用 `create_revision` 101/111 表示同一个 owner key 的 tenure 代次；键 `version` 删除后重置、lease ID 非单调排序令牌、revision 不等于业务 seq 或墙钟。
- watch 用线性化快照响应头 R 加 `R+1` 接续；断线从最后完整 revision 恢复，历史 compact 后重新 Get 并建路由缓存。

## 技术修订

- 原稿反复说“发送前线性化 Get owner 即可安全投递”，但 **Get→外部 SQL/Socket** 之间仍有时间检查与执行的竞态。正式页把目标端原子代次判断作为必要环节，并指出直接 WebSocket 写不能被 SQL 围栏自动撤销。
- 原稿多处把 15 秒 TTL、20 秒停顿写成确定在本机 `lease_until<now` 的充分判据。正式页仅在**etcd 确认删除**的额外纸上假设下给 r110，并将 KeepAlive 超时解释为结果未知。
- 原稿偶尔将协调键改写成 `/dispatch/E9`，与设备 owner 键混淆。正式页统一 `/owners/u-b/d-b1`；E9 是稳定事件/任务身份，不是连接 owner 键。
- 原稿虽然提到目标见 111 后拒 101，却容易使读者误以为 token 天然保证**从 etcd 切换瞬间**无旧效果。正式页明确目标尚未安装 111 时的空窗，严格保证需要同一原子仲裁域或切换屏障。
- 旧连接、G1/G2 提示尝试、设备 UI 去重、B 收到/已读与聊天历史补拉分别记证；不能由一项完成推导另一项。
- 固定 OpenIM `send.go` 和 MongoDB 消费处理仅支撑所述两处调用/返回，不证明 gateway owner 使用 etcd、租约或代次。

## 静态边界与同步

- 所有身份、租约、revision、G1/G2 和故障都是虚构教学输入；未运行 Go、etcd、IM 网关、故障注入或站点。
- 已同步正式页、08.06 下一章链接、第八卷目录、总目录、侧边栏、学习路线、能力验收与来源散列。
