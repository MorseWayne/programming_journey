# 12.07 配置与权限：ConfigMap、Secret、身份和网络边界

> DeepTutor 八节初稿经技术与教学审阅后的静态课程。`gateway/transfer/history-migrate/db/events`、配置、Secret、ServiceAccount、策略与结果均为**虚构纸上评审**；没有创建 Kubernetes 对象、运行 Go/IM、部署或构建站点，也没有真实凭据或用户资料。当前 S2 `/v1` 仍是正文非空且最多 **6 UTF-8 B**、原始 HTTP 请求正文最多 **4096 B**、同 ID 重复 **409**、非成员隐藏 **404**、成功 `200 accepted_in_memory` 仅为本进程内存受理；未来 S3 `/v2` 的 `stored_in_teaching_db` 是提议且仍为 6 B，R9 6→9 B 待审。[09.02 当前合同](../../../src/docs/platform_engineering/curriculum/09_backend_security/02_http_api_contract.md)

## 一、四种边界问的是四个不同的问题

在未来纸上平台里，`gateway` 要加载非秘密配置，未来 S3 可能需要 DB 凭据；`transfer` 需要与事件/派生依赖通信；`history-migrate` 只能处理被批准的历史范围。要分别问：**配置值能否公开；工作负载以什么身份调用 Kubernetes API；哪条网络连接可建立；用户 `u-c` 是否有权读会话 `c-a`。** 即使前三项全通过，非成员 `u-c` 仍应按当前业务合同得到 **404**，不能因 Pod 有网络或数据库凭据就放行私有历史。[09.07 对象权限](../../../src/docs/platform_engineering/curriculum/09_backend_security/07_authentication_authorization.md)

| 边界 | Kubernetes 中的常见对象/机制 | 它不能替代 |
|---|---|---|
| 非秘密配置 | ConfigMap、有效运行配置版本 | Secret 保护、R9 审批 |
| 敏感凭据 | Secret 或受控外部秘密来源 | 数据库事务与 IM 用户授权 |
| 工作负载访问 Kubernetes API | ServiceAccount + RBAC | DB 用户/客户端 `u-a/u-c` 身份 |
| Pod 间/出站连接 | NetworkPolicy 与支持它的网络插件 | 消息 ID 去重、成员权限和设备 ACK |

**运行环境是否安全**不能只看“有 Secret”“有 NetworkPolicy”。还要看谁能创建 Pod、谁能读配置、秘密怎样到容器、规则是否被网络插件真正执行，以及应用收到请求后如何裁决会话成员。[Kubernetes：ConfigMaps](https://kubernetes.io/docs/concepts/configuration/configmap/) · [Secrets](https://kubernetes.io/docs/concepts/configuration/secret/) · [NetworkPolicies](https://kubernetes.io/docs/concepts/services-networking/network-policies/)

## 二、ConfigMap 装非秘密；Secret 的 base64 不是加密

ConfigMap 用于**非机密**键值，例如纸上 `LOG_LEVEL=info`、未来服务地址名称或允许的功能配置版本。它把环境差异从镜像文件中分离，**不提供秘密性或加密**。数据库口令、签名密钥等若将来需要，应交给 Secret 或受控外部秘密机制，不能先 base64 后放进 ConfigMap。Kubernetes Secret 的 `data` 字段常以 base64 表达，**编码可以还原，不提供保密**；Kubernetes 官方文档还提醒，Secret 在 API 后端存储默认不加密，实际集群需另检查加密静态数据、备份与访问控制配置。[Kubernetes：ConfigMaps](https://kubernetes.io/docs/concepts/configuration/configmap/) · [Secret good practices](https://kubernetes.io/docs/concepts/security/secrets-good-practices/)

| 纸上信息 | 合理归属 | 风险 |
|---|---|---|
| `LOG_LEVEL=info` | 非秘密配置 | 打开 debug 可能增加日志量/泄漏风险，仍需审阅 |
| `DB_SERVICE=db` | 未来环境的非秘密地址名 | 地址正确不代表权限/事务可用 |
| 未来 DB 凭据 | Secret/受控身份或秘密来源 | 不可写入镜像、Git、ConfigMap、普通日志 |
| 当前 `/v1` 正文上限 6 B | 已批准的接口合同/版本政策 | 不能被某环境变量偷偷改成 9 B |

Pod 将 Secret 挂成文件或注入环境变量，并不意味着应用的 ServiceAccount 必须拥有 Kubernetes API 的 `get/list secrets` 权限：由 Pod 声明和节点机制提供给容器的值，与**应用主动调用 API 读取 Secret 对象**是不同动作。反过来，能在命名空间创建 Pod/Deployment 的操作者，可能通过让自己创建的 Pod 挂载 Secret **间接取得该命名空间的秘密**；只禁止其直接 `get secrets` 不一定足够。[Kubernetes：Secret good practices](https://kubernetes.io/docs/concepts/security/secrets-good-practices/) · [RBAC good practices](https://kubernetes.io/docs/concepts/security/rbac-good-practices/)

记录配置时留**来源/版本/是否存在**，不打印秘密值、可逆编码或真实连接串。当前课程没有实际 DB 密码，页面不提供可以直接复制的凭据或部署清单。[12.01 构建与运行秘密](../../../src/docs/platform_engineering/curriculum/12_platform/01_runtime_artifacts.md)

## 三、ServiceAccount 是平台身份，RBAC 管 Kubernetes API

ServiceAccount（SA）是 Pod 中工作负载用于**向 Kubernetes API 等受信任系统表明身份**的一种命名空间对象。RBAC 的 Role/ClusterRole 定义 Kubernetes API 资源与 `get/list/create/...` 等动作许可，RoleBinding/ClusterRoleBinding 把许可授给主体；RBAC 许可是**累加的，没有普通 deny 规则**。若 gateway 根本不需要调用 Kubernetes API，就不应为“读取 DB 密码”给它 `list secrets` 或 `cluster-admin`；可评审不自动挂载 API token。未来 DB 账号/工作负载身份映射是另一个边界，SA 本身不会自动变成 DB 用户或 IM 用户。[Kubernetes：ServiceAccounts](https://kubernetes.io/docs/concepts/security/service-accounts/) · [RBAC](https://kubernetes.io/docs/reference/access-authn-authz/rbac/) · [Application Security Checklist](https://kubernetes.io/docs/concepts/security/application-security-checklist/)

| 纸上主体 | Kubernetes API 所需权限候选 | 另有的业务/依赖权限 |
|---|---|---|
| gateway Pod | 若不主动调用 API，尽量不授读/写对象权限 | 未来可用受控 DB 身份；当前仍按 `u-c` 成员授权返回 404 |
| transfer Pod | 只在确需 Kubernetes API 协调时给最小对象/动词 | 事件读取、派生结果写入与幂等责任 |
| history-migrate Job | 不因“迁移”自动给集群管理员 | 仅获批准的 DB 范围/操作及审计 |
| 运维/构建主体 | 按发布与回退职责限定 | 能创建 Pod 者可能间接接触 Secret，要额外审 |

**RBAC 不裁决 IM 会话成员。** 一个 gateway Pod 即使有权从 Kubernetes API 读 ConfigMap，收到 `u-c` 请求 `c-a` 私聊时仍必须按应用认证/授权查成员，再按合同隐藏目标；RBAC 不知道 `u-c/c-a/m-9` 的业务关系。[09.07 服务端授权](../../../src/docs/platform_engineering/curriculum/09_backend_security/07_authentication_authorization.md)

## 四、NetworkPolicy 只管理连接，且要看插件与两个方向

Kubernetes NetworkPolicy 表达 Pod/namespace/IP/端口等**网络三/四层连接**的允许关系。它需要支持 NetworkPolicy 的网络插件真正执行；只在 API 中创建一个对象，若插件不支持，可能没有预期效果。通常没有任何适用策略时 Pod 对 ingress/egress **不隔离**；选中某 Pod 并在方向上施加策略后，允许规则按方向**累加**，不是最后一条覆盖前一条。A→B 的连接还要同时满足 A 的 egress 与 B 的 ingress 约束。[Kubernetes：Network Policies](https://kubernetes.io/docs/concepts/services-networking/network-policies/)

| 未来纸上连接 | 平台边界需允许什么 | 仍不代表 |
|---|---|---|
| 外部入口 → gateway | 入口控制器到 gateway 的 ingress | 任意用户都可访问私有会话 |
| gateway → 未来 db | gateway egress 与 db ingress/端口，必要 DNS | DB 账号有权、`m-9` 已提交 |
| transfer → events/派生目标 | 相应两端连接与 DNS | E9 恰好一次或 B 设备已 ACK |
| history-migrate → 限定 DB | 任务的目标和端口、审计身份 | Job 重跑不会双写 |

纸上如果先采用“默认拒绝”并仅为 db 写一条允许 gateway 入站的规则，却忘了 gateway 出站也被隔离，或者忘了名称解析必需的 DNS 出站，gateway 可能仍无法连接。这是**网络策略缺口**，与 DB 端口没启动、凭据错误、数据库未就绪又是不同故障。网络能连通，也不能按消息正文或会话成员筛选；`u-c` 非成员 404、同 ID 重复 409 仍由应用/权威状态决定。[12.03 名称、端口与就绪](../../../src/docs/platform_engineering/curriculum/12_platform/03_local_multi_service.md) · [Kubernetes：Policy isolation](https://kubernetes.io/docs/concepts/services-networking/network-policies/)

## 五、配置变化何时进入已有 Pod

ConfigMap 作为**环境变量**注入容器时，已运行进程的环境变量不会随源对象更新而自动变化，需通过受控 Pod 替换/重启让新值进入进程。若以**投影卷文件**挂载，文件内容可在传播后更新，但应用必须实际重新读取/热加载；使用 `subPath` 的挂载还有不自动收到更新的例外。Secret 的注入与轮换也需核对具体方式和应用刷新能力，不能把“API 对象已经改了”当“所有网关同秒生效”。[Kubernetes：ConfigMap updates](https://kubernetes.io/docs/concepts/configuration/configmap/) · [Secrets](https://kubernetes.io/docs/concepts/configuration/secret/)

如果三个 gateway Pod 先后替换，可能出现 K1/K2 混部；需记录**有效配置版本、镜像 digest、客户端/协议支持窗口**。但当前 `/v1` 最多 6 B 是固定合同，任何 K2 让它接纳 9 B 都属漂移，不能借“配置灰度”绕过 R9 的需求审批。未来 S3 DB 凭据轮换也需让旧新实例在明确兼容窗口内受控读取，不把秘密值打印到探针、日志或审阅页。[10.10 版本与回退](../../../src/docs/platform_engineering/curriculum/10_engineering/10_continuous_delivery_versions.md) · [10.12 R9 影响](../../../src/docs/platform_engineering/curriculum/10_engineering/12_maintainability_assessment.md)

## 六、四个反例：安全对象存在也可能不安全或不可用

| 纸上错误 | 表面看似正确 | 真正问题与修订方向 |
|---|---|---|
| 把 base64 DB 密码放 ConfigMap | 值“看不懂” | base64 可逆；移到受控秘密来源，核访问与静态加密，不记录明文 |
| gateway SA 被授 `list secrets` 或 `cluster-admin` | “方便应用取配置” | 工作负载通常无需这种 API 权限；缩到确有的对象/动词，审 Pod 创建权 |
| 只配 db ingress、忽略 gateway egress/DNS | “DB 有允许规则” | 源/目的两个方向都要允许，核插件和实际名称解析 |
| ConfigMap env 已更新，旧 Pod 仍用旧值 | “API 已改” | env 不热更新；记录配置版本并受控替换/验证 |

不要为修复网络不通把策略全部删掉，也不要为修复凭据错误给全 namespace 读 Secret。每次先找**最小可反驳证据**：Pod/SA/RoleBinding 是谁、有效配置从哪来、插件是否实施策略、源与目的哪一向被拒、DB/IM 应用各自返回什么。再做一个可回退的最小权限/配置改动，并确认 `u-c` 仍无法读 `c-a`。[11.04 假设与反证](../../../src/docs/platform_engineering/curriculum/11_reliability/04_diagnostic_method.md)

## 七、按角色交“能做什么、不能做什么”验收卡

一份静态权限设计至少列：镜像/配置版本、非秘密配置与凭据**引用**、SA 是否真要访问 API、Role/Binding 的对象/动词/范围、NetworkPolicy 的源/目的/端口和插件前提、数据库账户/业务成员授权、失败/回退门。不能只交 YAML 名称清单；要为每个角色给一个**允许样本**和一个**应拒绝样本**。[Kubernetes：RBAC good practices](https://kubernetes.io/docs/concepts/security/rbac-good-practices/) · [Network Policies](https://kubernetes.io/docs/concepts/services-networking/network-policies/)

| 角色 | 允许样本（未来条件） | 应拒绝/保留未知 |
|---|---|---|
| gateway | 有权 `u-a` 在当前 `/v1` 发 6 B、得到 200 内存受理 | `u-c` 不是 `c-a` 成员仍 404；9 B 当前拒绝 |
| transfer | 仅消费被授权事件、按 E9 稳定身份推进派生 | 不能因网络通就读所有用户私聊或重写权威 seq |
| history-migrate | 仅处理被批准的会话/时间/版本范围 | 不得默认全库读写，重复 Job 要对账 |
| 未来 db | 接收具备正确身份/网络边界的请求 | Pod Ready、PVC Bound 不证明权威事务已提交 |

固定 `openimsdk/open-im-server` 提交 `f6411a8a1a31d3df36f4c2b3ad28481a94141e1f` 的 [`send.go` 选定分支](https://github.com/openimsdk/open-im-server/blob/f6411a8a1a31d3df36f4c2b3ad28481a94141e1f/internal/rpc/msg/send.go#L46-L70)调用 `MsgToMQ` 后返回；[另一 Mongo 消费路径](https://github.com/openimsdk/open-im-server/blob/f6411a8a1a31d3df36f4c2b3ad28481a94141e1f/internal/msgtransfer/online_msg_to_mongo_handler.go#L43-L69)调用 `BatchInsertChat2DB`。它们只支持所读发送与 Mongo 消费异步边界，**不证明** OpenIM 或本课程项目的 ServiceAccount、RBAC、Secret、NetworkPolicy、数据库账户或成员授权实现。[OpenIM 阅读地图](../../../src/docs/platform_engineering/curriculum/im_reference.md)

## 八、22 道分层练习：安全和业务各写一份拒绝证据

先判断问题属于哪种边界，再展开反馈。

### 基础 1–8：认清对象

<details><summary>1. ConfigMap 适合存 DB 密码吗？</summary>

不适合。它用于非秘密配置，不提供秘密性。</details>

<details><summary>2. Secret 中 base64 文本等于已加密吗？</summary>

不等于。base64 可还原，实际集群还需核静态加密与访问控制。</details>

<details><summary>3. ServiceAccount 是 `u-a` 的 IM 登录身份吗？</summary>

不是。它是 Kubernetes 工作负载身份；IM 用户认证/成员授权另做。</details>

<details><summary>4. RBAC Role 主要管什么？</summary>

Kubernetes API 资源和动词的许可，不直接管 DB 行/IM 会话成员。</details>

<details><summary>5. RBAC 有普通“最后一条 deny 覆盖 allow”规则吗？</summary>

没有。RBAC 许可累加，不靠普通 deny 撤销先前许可。</details>

<details><summary>6. 有 NetworkPolicy 对象就必然生效吗？</summary>

不一定。网络插件必须支持并实施它。</details>

<details><summary>7. 默认无 NetworkPolicy 时 Pod 自动全部隔离吗？</summary>

不是。通常各方向默认非隔离。</details>

<details><summary>8. `u-c` 能到 gateway 端口，就有权读 `c-a` 吗？</summary>

没有。当前非成员目标仍应隐藏为 404。</details>

### 推导 9–16：找出错误的权限假设

<details><summary>9. Pod 通过挂载读 Secret，应用 SA 一定要 `get secrets` 吗？</summary>

不一定。挂载/注入与应用主动调 API 读 Secret 是不同动作。</details>

<details><summary>10. 能创建本 namespace Pod 的人，即使不能直接 get Secret，也可能怎样取得值？</summary>

可能创建挂载该 Secret 的 Pod 使其暴露，因此工作负载创建权也要审。</details>

<details><summary>11. 只允许 db ingress，源 gateway egress 被隔离，会通吗？</summary>

不会。源出站和目的入站都须允许，DNS 也要按实际解析路径考虑。</details>

<details><summary>12. 两条 NetworkPolicy 一条允许 A、一条允许 B，后者会覆盖前者吗？</summary>

不会。适用方向的允许规则累加。</details>

<details><summary>13. NetworkPolicy 可以按消息 ID `m-9` 判断可读吗？</summary>

不能。它面向网络连接，不做应用消息/成员授权。</details>

<details><summary>14. ConfigMap 以 env 注入，源对象改后旧进程变量会自动改吗？</summary>

不会。需受控替换/重启使新环境进入进程。</details>

<details><summary>15. ConfigMap 卷内容更新后，应用一定已用到新值吗？</summary>

不一定。传播有延迟且应用要重读；subPath 挂载另有不自动更新例外。</details>

<details><summary>16. 某配置让旧 `/v1` 接纳 9 B，可称 R9 已灰度成功吗？</summary>

不能。R9 尚待批准，当前 `/v1` 仍最多 6 B。</details>

### 决策 17–22：最小权限与业务验收

<details><summary>17. gateway 不用 Kubernetes API，还要给它 cluster-admin 吗？</summary>

不应。API 权限按需最小化，若不需要可评审不自动挂 token。</details>

<details><summary>18. 未来 DB 凭据放 Secret 就能证明 m-9/seq9 已提交吗？</summary>

不能。凭据提供访问条件，权威事务/恢复另证。</details>

<details><summary>19. 网络连通但 DB 认证失败，应改 NetworkPolicy 放宽所有出站吗？</summary>

不应。先分清连接和认证失败，检查最小凭据/权限。</details>

<details><summary>20. history-migrate Job 有权读全库就能保证不会泄露私聊吗？</summary>

不能。任务范围、最小 DB 权限、应用授权、审计与幂等均需设计。</details>

<details><summary>21. 两处固定 OpenIM 源码能证明真实 K8s RBAC 或 NetworkPolicy 吗？</summary>

不能。只支持所读发送与 Mongo 消费的异步边界。</details>

<details><summary>22. 一张可审权限卡至少交什么？</summary>

配置/Secret 来源与版本、SA/RBAC API 权限、网络两个方向/插件、DB 身份、当前业务允许/拒绝样本和未证项。</details>

## 本章完成标准与后续路径

能把 ConfigMap、Secret、ServiceAccount/RBAC、NetworkPolicy 与 IM 成员授权的责任逐一说清，指出 base64/Pod 创建权/双向网络/配置传播四个反例，并用 `u-c` 非成员 404 和同 ID 409 守住现行合同，才算完成第一轮。本章未创建任何权限或秘密对象。下一章[12.08 启动、探针与退出](../../../src/docs/platform_engineering/curriculum/12_platform/08_startup_probes_exit.md)将让网关把启动、就绪、存活与有界退出和长连接摘流分开。
