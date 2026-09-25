---
title: 12.03 本地多服务环境：服务名、端口、就绪与配置
icon: /assets/icons/article.svg
order: 4
date: 2026-09-25
---

[返回第十二卷](./README.md) · [制品身份：12.01](./01_runtime_artifacts.md) · [容器机制：12.02](./02_container_mechanisms.md) · [地址与名称：04.02](../04_networks/02_addresses_names_routes.md) · [程序组织：09.03](../09_backend_security/03_program_organization.md)

# 12.03 本地多服务环境：服务名、端口、就绪与配置

> DeepTutor 八节初稿经技术与教学审阅后的静态课程。`gateway/db/events`、端口、健康、配置、卷与错误均是**未来隔离教学环境的纸上设计**；本章没有新增 Compose 文件、启动容器/IM/数据库/队列、运行 Go 或构建站点。当前 S2 `/v1` 仍是正文非空且最多 **6 UTF-8 B**、原始 HTTP 请求正文最多 **4096 B**、同 ID 重复 **409**、非成员隐藏 **404**、成功 `200 accepted_in_memory` 仅为本进程内存受理；未来 S3 `/v2` 的 `stored_in_teaching_db` 是提议且仍为 6 B，R9 6→9 B 待审。[09.02 当前合同](../09_backend_security/02_http_api_contract.md)

## 一、三个服务画在一张图，不代表已经能互相调用

12.01–12.02 已区分镜像、运行容器、网络视图与数据卷。现在纸上为**未来 S3 教学实现**安排三类服务：`gateway` 接 HTTP/WebSocket，`db` 保存权威 `m-9/seq9` 与 outbox，`events` 代表异步事件依赖。它们只是理解 Compose 的虚构角色，**当前 S2 不依赖一份已运行的 DB/outbox/broker**。把 `docker compose up` 想成“把三个服务的进程/网络/挂载按声明启动”，不能想成“`m-9` 已写盘、B 已收到”。[09.12 未来服务课程](../09_backend_security/12_im_service_capstone.md)

| 纸上角色 | 它将来负责什么 | 本章不承诺 |
|---|---|---|
| `gateway` | 入口与当前接口版本的校验/响应 | 当前仓库已有在线 IM 服务 |
| `db` | 未来 S3 权威消息/成员与事务 | 只要容器 running 就已完成模式/权限/持久验证 |
| `events` | 未来派生事件传递 | broker 事件等于 B 设备处理或权威历史 |

Compose 是描述本地多服务、网络和卷的工具，**启动顺序、容器健康、应用业务就绪**是三个不同问题。后两者要由明确的探测和用户正反例回答。[Docker Compose：Services](https://docs.docker.com/reference/compose-file/services/) · [Startup Order](https://docs.docker.com/compose/how-tos/startup-order/)

## 二、gateway 找 db 用服务名和容器端口

假设三个服务加入同一个纸上 Compose 网络。Compose 在该网络提供服务名解析，`gateway` 容器访问数据库应使用 **`db:5432`**，不是 `localhost:5432`。`localhost`/`127.0.0.1` 指的是**发起连接的进程所在网络 namespace**：在 `gateway` 里它回到 gateway 自己，在宿主终端里它回到宿主。[Docker Compose：Networking](https://docs.docker.com/compose/how-tos/networking/) · [03.11 网络 namespace](../03_systems/11_isolation_limits.md)

再假设为了本地人工检查，纸上把**宿主端口 15432** 映射到 `db` 的**容器端口 5432**。于是：

| 发起连接的位置 | 应使用的纸上地址 | 原因 |
|---|---|---|
| 同网络的 `gateway` | `db:5432` | 服务名由 Compose 网络解析，目标使用容器端口 |
| 宿主机上的有权本地工具 | `127.0.0.1:15432` | 走有意声明的宿主端口映射 |
| `gateway` 内误用 `127.0.0.1:15432` | 指向 gateway 自己 | 不会因宿主映射自动转到 db |

**宿主映射并非服务间调用的必要条件。** 若只有 gateway 需要访问 db，数据库未必需要对宿主暴露端口；上表仅为理解两个视角的教学情景。实际端口、绑定地址、权限与秘密由学习者在隔离环境另定，不把教学 `15432` 当生产配置。[Docker Compose：HOST_PORT vs CONTAINER_PORT](https://docs.docker.com/compose/how-tos/networking/)

服务重建后容器 **IP 可改变而服务名不变**。已建立到旧 IP 的连接仍会断；应用需要发现断线、重新解析服务名并在安全的请求身份/期限下重连。把某次容器 IP 直接写死在 `DB_ADDR`，可能启动时能用，重建后突然失败。[Docker Compose：Updating containers on the network](https://docs.docker.com/compose/how-tos/networking/) · [04.02 名称与地址](../04_networks/02_addresses_names_routes.md)

## 三、`depends_on` 管顺序，healthcheck 也只测它被设计成测的事

**服务已启动**常表示容器主进程在运行；**依赖健康**取决于 healthcheck 的命令与判据；**业务就绪**则问“这次有权请求能否完成正确事务和结果”。Compose 普通启动顺序并不会等数据库完成初始化；`depends_on: {db: {condition: service_healthy}}` 可要求 `db` 的健康检查先通过再启动依赖它的服务，但如果健康检查只测“5432 端口打开”，它仍不能证明 `m-9` 所需表、迁移、身份和读写权限全部可用。[Docker Compose：Startup Order](https://docs.docker.com/compose/how-tos/startup-order/)

| 阶段 | 纸上可能的检查 | 仍不能证明 |
|---|---|---|
| `db` 容器 started | 主进程存在 | SQL 连接已经可服务 |
| TCP 端口可连 | 网络路由/监听至少部分可达 | 认证、模式、事务和权限正确 |
| DB healthcheck green | 该 healthcheck 定义的探测通过 | 所有真实查询/写事务都满足合同 |
| 未来 S3 业务验收 | 有权 `m-9/seq9` 与 outbox 的明确提交/查询样本 | B 的设备 ACK 已到 |

若未来有一项**明确批准的**模式迁移一次性任务，Compose 还可用 `service_completed_successfully` 表达“该依赖任务成功结束后再继续”，但这不能代替迁移的幂等性、回退和数据兼容评审，也不说明 S3 已在本仓库部署。[Docker Compose：服务依赖条件](https://docs.docker.com/reference/compose-file/services/) · [06.03 模式演进](../06_databases/03_schema_evolution.md)

启动门只对**某次启动顺序**有帮助。运行中数据库重启、网络短断或凭据轮换，gateway 仍需有界重连和清楚的失败语义，不能寄希望于 `depends_on` 永远保持依赖可用。相反，若重试太激进，又会形成 11.09 的过载正反馈；诊断时记录首次/重试、期限与用户可见结果。[11.09 多层重试](../11_reliability/09_overload_cascades.md)

## 四、`.env` 插值与容器环境不是一回事

Compose CLI 可从 shell、指定环境文件或项目 `.env` 取得值，**先用于插值 Compose 模型**；容器里最终有没有某个变量，还取决于服务的 `environment`、`env_file`、运行命令和镜像默认 `ENV` 等设置及优先级。`.env` 中写了 `DB_PORT=15432` 不意味着 `gateway` 容器自动获得 `DB_PORT`，更不意味着它应在内部连接 `db:15432`。[Docker Compose：Variable Interpolation](https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/) · [Environment Precedence](https://docs.docker.com/compose/how-tos/environment-variables/envvars-precedence/)

| 纸上值 | 它的对象 | 正确理解 |
|---|---|---|
| `HOST_DB_PORT=15432` | Compose 宿主端口插值输入 | 影响对宿主发布哪一端口，不是 db 容器监听端口 |
| `DB_ADDR=db:5432` | gateway 容器的运行配置 | 同网络按服务名/容器端口访问 db |
| `LOG_LEVEL=debug` | 允许的非秘密运行配置 | 可影响日志，但不能改变 `/v1` 正文业务上限 |
| 数据库凭据引用 | 受控秘密来源 | 不把明文写入课程、镜像、普通日志或公开配置 |

调试配置时要记录**配置来源、有效版本与允许覆盖项**；完整解析配置的工具可能把敏感值也显示出来，不能未经脱敏把输出贴进课程或事故报告。当前 `/v1` 的正文最多 6 B，不能因某个 `.env` 或容器变量悄悄改成 9 B；R9 仍待审，未来新能力须有独立版本合同。[10.12 规则与版本政策](../10_engineering/12_maintainability_assessment.md)

## 五、四个“连接不上 db”的反例别都归咎于网络

让学习者先观察**从哪儿发起、用什么名称与端口、错误发生在解析/连接/认证/SQL 哪一段**，再选下一份证据：

| 纸上症状 | 候选原因 | 最小反证/定位 |
|---|---|---|
| gateway 配 `localhost:15432` 报连接拒绝 | 地址指向 gateway 自己，误用宿主端口 | 改用同网络 `db:5432` 的隔离对照；核对 db 服务名 |
| gateway 已启动、db 显示 running，但初次 SQL 失败 | `depends_on` 只保证 started，DB 还未就绪 | 看 db health、实际 SQL/认证/模式阶段与启动时间 |
| db 容器重建后旧连接断开 | 原 IP 变了，进程还复用旧连接/地址 | 重新解析 `db`、有界重连，核对新实例状态 |
| db health green，但 `m-9` 写事务失败 | healthcheck 只测端口/简单查询，迁移或权限仍不满足 | 用有权、隔离的业务样本核对模式、事务与身份 |

“改用 `db:5432`”只修第一个地址错误；若真实是迁移没完成，它不会让未来 S3 的权威事务自动成功。反过来把 DB 端口随便映射到宿主，也无法解决容器里错用 `localhost` 的配置。先分段、再反证，避免对一个“无法连接”的宽泛报错做多处无关改动。[11.04 诊断方法](../11_reliability/04_diagnostic_method.md)

Compose 的 `docker compose logs` 可显示服务输出，帮助把 gateway 的连接错误与 db 的启动/权限错误按时间对齐；它**不保证**日志完整、脱敏、跨机器时钟一致，也不能用一条“发送成功”日志证明 B 设备处理。必要时另看业务确认与有权权威数据。[Docker Compose：logs](https://docs.docker.com/reference/cli/docker/compose/logs/) · [11.03 日志/指标/Trace](../11_reliability/03_logs_metrics_traces.md)

## 六、卷和服务替换：有文件不等于消息已权威提交

未来 db 服务若明确挂了 named volume，容器重建后**卷可以继续存在并被重挂**；但是否挂的是**同一卷**、文件可否被数据库恢复、`m-9/seq9` 与 outbox 是否在同一事务提交、成员权限是否仍正确，都要分别核查。某些管理动作可主动删除卷，不能把“Compose 默认没有删”当永远保证；本章不运行这些动作。[Docker：Volumes 生命周期](https://docs.docker.com/engine/storage/volumes/) · [06.09 日志与恢复](../06_databases/09_logging_recovery.md)

当前 S2 `accepted_in_memory` 则更简单：它本来只承诺**当前进程内存**。即使未来 Compose 纸上环境存在 `db` 和 `events`，也不能反向推断 `/v1` 的 200 已落库或 B 已收到；S3 `/v2` 是否实现必须有明确接口、事务和部署证据。B 如果离线 **25 小时**、教学 broker 只保留 **24 小时**，恢复仍要从有权限的权威 DB 历史按 `seq9` 缺口补，不能只看 `events` 服务是否 healthy。[07.12 历史/事件分工](../07_cache_messaging/12_cross_system_consistency_case.md)

## 七、一张本地环境验收卡把“启动了”和“能用”分开

学习者以后若自己准备隔离环境，可按顺序留证；本章只给**静态卡片**，不运行 Compose：

| 检查层 | 可记录的非秘密证据 | 不能在此层宣称 |
|---|---|---|
| 制品 | gateway/db/events 镜像 digest、平台架构、项目名 | 镜像存在就代表服务健康 |
| 网络 | 有效服务名、网络身份、容器/宿主端口映射 | 宿主 `localhost` 能自动从 gateway 使用 |
| 启动/健康 | started、healthcheck 定义和结果 | DB 模式/权限和 IM 业务必定就绪 |
| 配置 | 非秘密值/版本、变量来源、秘密引用 | 公开粘贴密钥或用环境值放宽 v1 合同 |
| 数据 | 卷名/挂载、事务/恢复样本的有权证据 | 卷存在就证明 `m-9` 已提交 |
| 业务 | 当前 6 B 正例、9 B 当前拒绝、重复 409、非成员 404、200 内存受理 | S3 持久或设备 ACK 已经兑现 |

失败时记录“无法连接、未就绪、无权限、模式不符、请求被正确拒绝、业务结果未知”各自类别。下一章 12.04 才进入集群控制循环；Compose 的单机服务名、启动门和健康语义不能直接当作 Kubernetes 的控制器或调度保证。[12.01 制品身份](./01_runtime_artifacts.md)

固定 `openimsdk/open-im-server` 提交 `f6411a8a1a31d3df36f4c2b3ad28481a94141e1f` 的 [`send.go` 选定分支](https://github.com/openimsdk/open-im-server/blob/f6411a8a1a31d3df36f4c2b3ad28481a94141e1f/internal/rpc/msg/send.go#L46-L70)调用 `MsgToMQ` 后返回；[另一 Mongo 消费路径](https://github.com/openimsdk/open-im-server/blob/f6411a8a1a31d3df36f4c2b3ad28481a94141e1f/internal/msgtransfer/online_msg_to_mongo_handler.go#L43-L69)调用 `BatchInsertChat2DB`。它们只说明所读发送/消费分处异步阶段，**不证明**本章纸上 Compose 有同样拓扑、数据库类型、端口、健康检查、持久合同或设备结果。[OpenIM 阅读地图](../im_reference.md)

## 八、22 道分层练习：诊断一张纸上 Compose 环境

先画出从宿主与 gateway 各自访问 db 的地址，再展开反馈。

### 基础 1–8：名称、地址和端口

<details><summary>1. gateway 内的 `127.0.0.1` 指向 db 容器吗？</summary>

不指向。它是 gateway 所在网络 namespace 的回环。</details>

<details><summary>2. 同网络 gateway 访问 db 应用哪个纸上地址？</summary>

`db:5432`，按服务名与容器端口。</details>

<details><summary>3. 宿主映射 `15432:5432` 时，有权宿主工具用哪个端口？</summary>

宿主的 `127.0.0.1:15432`，不是 gateway 内部的 db 地址。</details>

<details><summary>4. 服务间通信一定要把 db 端口暴露到宿主吗？</summary>

不一定。同 Compose 网络可以使用服务名和容器端口。</details>

<details><summary>5. db 容器重建后旧 IP 一定不变吗？</summary>

不一定。名称可保持，IP 可变；旧连接要重连并重新解析。</details>

<details><summary>6. `depends_on` 普通启动顺序能证明 DB 已执行 SQL 吗？</summary>

不能。它可能只保证容器已 started。</details>

<details><summary>7. `service_healthy` 等的是什么？</summary>

依赖服务声明的 healthcheck 通过；能力只到 healthcheck 实际覆盖范围。</details>

<details><summary>8. 当前 S2 的 200 能证明纸上 db 或 events 已运行吗？</summary>

不能。它仅代表本进程内存受理。</details>

### 定位 9–16：四个故障变式

<details><summary>9. gateway 配 `localhost:15432` 被拒绝，第一步查什么？</summary>

查发起进程网络视图和有效 `DB_ADDR`；gateway 同网络应连 `db:5432`。</details>

<details><summary>10. db 容器 running、gateway 首个 SQL 失败，可以直接判网络坏吗？</summary>

不能。还可能是 DB 初始化、认证、模式或权限未就绪。</details>

<details><summary>11. healthcheck 只测 TCP 端口绿，能证明 m-9/outbox 事务可写吗？</summary>

不能。还要有权业务样本和数据库模式/事务证据。</details>

<details><summary>12. db 重建后 gateway 缓存旧 IP，应怎样恢复？</summary>

检测旧连接断开，重新解析服务名并有界重连，核对新 db 状态。</details>

<details><summary>13. `.env` 定义变量就一定进入容器环境吗？</summary>

不一定。它可先用于 Compose 模型插值，容器环境还取决于 environment/env_file 等设置。</details>

<details><summary>14. Compose 配置工具输出可以原样贴进课程排障记录吗？</summary>

不应。可能含秘密或敏感值，只保留脱敏的有效配置来源/版本。</details>

<details><summary>15. `docker compose logs gateway` 中“发送成功”能证明 B 已读吗？</summary>

不能。日志仅是某服务输出，设备应用 ACK/已读另需证据。</details>

<details><summary>16. `service_completed_successfully` 可直接证明 S3 已上线吗？</summary>

不能。它只表达某依赖任务成功结束的启动条件，S3 合同/迁移/运行另验。</details>

### 验收 17–22：从健康到业务

<details><summary>17. named volume 存在等于 m-9/seq9 权威事务已提交吗？</summary>

不等于。还需同一卷身份、数据库提交/恢复与权限证据。</details>

<details><summary>18. B 离线 25h、教学 broker 留 24h，靠什么补历史？</summary>

靠有权权威 DB 历史按 `seq9` 缺口补，不能只靠 events 健康。</details>

<details><summary>19. 某 `.env` 让旧 `/v1` 接纳 9 B，合理吗？</summary>

不合理。当前合同仍最多 6 B，R9 待审。</details>

<details><summary>20. 只看到三个容器 healthy，足以发布“IM 已可用”吗？</summary>

不足。要按当前/未来确认点做有权请求正反例、事务和设备结果验证。</details>

<details><summary>21. OpenIM 两处固定源码可证明本题 Compose 服务名或端口吗？</summary>

不能。只支持所读发送与 Mongo 消费的异步边界。</details>

<details><summary>22. 一张可复核多服务环境卡至少交什么？</summary>

制品 digest、服务名/端口/网络、启动/health 定义、有效配置/秘密引用、卷/权威数据、有权业务结果及未证项。</details>

## 本章完成标准与后续路径

能不看答案区分 `db:5432` 与宿主 `127.0.0.1:15432`，说明 Compose 启动顺序、healthcheck 和业务就绪的不同证据范围，逐项反驳四个连接/模式故障候选，并守住当前 S2 与未来 S3/B 设备结果的边界，才算完成第一轮。本章没有运行 Compose 或 IM。下一章[12.04 集群控制模型](./04_cluster_control_model.md)进入期望状态、控制循环、节点、Pod 与调度。
