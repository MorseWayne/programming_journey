---
title: 04.11 网络层与链路层：NAT、MTU 与移动路径
icon: /assets/icons/article.svg
order: 12
date: 2026-09-25
---

[返回第四卷](./README.md) · [地址与名称：04.02](./02_addresses_names_routes.md) · [长连接：04.05](./05_tcp_connection_lifecycle.md) · [HTTP 版本：04.10](./10_http_versions_rpc.md)

# 04.11 网络层与链路层：NAT、MTU 与移动路径

> 本章把 04.02 的 IP/路由、04.04–04.06 的 TCP/流控与 04.10 的 HTTP/QUIC 连接下沉到逐跳路径。所有地址、MTU 和故障为**文档用纸上值**；没有抓包、运行 Go、Wi‑Fi/蜂窝或 IM 服务。当前 S2 `/v1` 正文非空且最多 **6 UTF-8 B**、原始 HTTP 请求正文最多 **4096 B**、同 ID 重复 **409**、非成员隐藏 **404**、`200 accepted_in_memory` 只到本进程；未来 S3 `/v2` 存库提案仍为 6 B，R9 6→9 B 待审。换网络路径不会改变这些业务确认点。[09.02 当前合同](../09_backend_security/02_http_api_contract.md)

## 一、从 A 的一包出发：本地下一跳与远端目标不同

纸上客户端 A 在 Wi‑Fi 内网 `10.0.0.2`，默认网关 `10.0.0.1`（均取自私有地址范围）；它要连示例服务 `203.0.113.10:443`。前缀/路由表决定远端不在本地链路，A 把**本地链路帧**交给网关，而不是直接寻找远端服务的网卡地址。IPv4 本地 ARP 可帮助找网关的链路地址；IPv6 邻居发现承担对应的本地邻居/下一跳发现工作。每经路由器，链路层封装会换成下一段网络所需格式；网络层按目标地址继续转发。[RFC 1918：私有地址](https://www.rfc-editor.org/rfc/rfc1918.html) · [RFC 826：ARP](https://www.rfc-editor.org/rfc/rfc826.html) · [RFC 4861：IPv6 Neighbor Discovery](https://www.rfc-editor.org/rfc/rfc4861.html) · [04.02 地址/路由](./02_addresses_names_routes.md)

```text
A(10.0.0.2) --本地 Wi‑Fi/网关--> NAT/路由器 --公网路径--> 服务(203.0.113.10:443)
              本地链路地址随下一跳变化      IP/端口与转发规则决定后续路径
```

`203.0.113.0/24` 和 NAT 外侧 `198.51.100.0/24` 都是文档示例网段，本图不指向真实服务。[RFC 5737：文档用 IPv4 地址](https://www.rfc-editor.org/rfc/rfc5737.html)**路由可达**只说数据包可能找到某网络路径，不证明 TLS 对端名称正确、用户 `u-a` 有权向 `c-a` 发言，也不证明消息被存储或设备 B 已收到。[04.07 TLS 服务身份](./07_tls_identity.md) · [09.07 会话授权](../09_backend_security/07_authentication_authorization.md)

## 二、NAT 改地址/端口映射，不创造 IM 身份与持久化

示意 NAT 把内侧 `10.0.0.2:53000` 的出站流量映射为外侧 `198.51.100.7:62000`；服务器看到的源地址/端口可能是后者。映射让返回包能回到内侧连接，可能随时间、重连或外部网络变化。不同 NAT 的映射/过滤与超时条件不同，不能凭“有 NAT”推某条连接会在固定秒数断开。TCP 与 UDP 的行为要求分别见 RFC 5382/4787；本章只用抽象映射解释现象。[RFC 5382：TCP NAT](https://www.rfc-editor.org/rfc/rfc5382.html) · [RFC 4787：UDP NAT](https://www.rfc-editor.org/rfc/rfc4787.html)

| 纸上观察 | 合理解释 | 不应推出 |
|---|---|---|
| 服务端日志见 `198.51.100.7:62000` | 中间可能有地址/端口转换 | 这是 `u-a` 的稳定身份 |
| 旧端口映射消失 | 旧连接可能不可继续复用 | IM 用户主动退出 |
| A 重连后外侧端口变了 | 需建新连接/重新核业务状态 | 旧消息自动撤回或已送达 |

很多内侧设备可共享一个外侧 IP，仅靠客户端 IP 做对象授权会混人；即使代理传来更精确地址，身份和会话范围仍由应用认证/授权决定。NAT 也不能把 N1 的 S2 进程内存同步到 N2；地址转换与数据复制属于不同机制。[04.09 代理信任与 N1/N2](./09_proxies_load_balancing.md)

## 三、MTU 约束单包，不等于应用消息上限

**MTU（最大传输单元）**是某段链路/路径对网络层包大小的约束，不是 `Message.Body` 可放多少字节。假设纸上一段 IPv4 链路 MTU 为 **1500 B**，IPv4 头取最小 **20 B**、TCP 头也取最小 **20 B**、没有任何选项/隧道额外开销，则一次 IP 包里可留给 TCP 数据最多 `1500−20−20=1460 B`。现实上头部选项、TLS/HTTP、隧道和更小的路径 MTU 都会改变分段；不能把 1460 写成通用 MSS、HTTP body 或现行 IM 正文上限。[RFC 791：IPv4 报头](https://www.rfc-editor.org/rfc/rfc791.html) · [RFC 9293：TCP 与分段](https://www.rfc-editor.org/rfc/rfc9293.html)

当前 IM 正文最多 **6 UTF-8 B**，原始 HTTP body 最多 **4096 B**。即使请求体恰为 4096 B，也可能被 TCP/QUIC 分成多段，再封装成多个包；一次 `Read` 不必恰好拿到一个业务请求。反过来，正文 6 B 也还会有 HTTP、TLS、TCP/IP 头和链路开销，不能说“整条网络包只有 6 B”。大附件/图片若将来有单独产品需求，应另定上传合同和传输方案；不能借 MTU 讨论放宽当前文本消息 6 B。[04.08 字节流与教学帧](./08_go_network_io.md) · [09.02 两个字节上限](../09_backend_security/02_http_api_contract.md)

路径中若有一跳 MTU 更小，发送方需按路径可承受的大小分段/发现。IPv6 路由器不会替源端随意分片；PMTUD/PLPMTUD 的细节、ICMP 回报或探测失败可能造成“大请求卡住、小请求可过”的表象。要按协议/路径实测与诊断，不能仅凭现象断言是 MTU，也不能把超时自动归为 IM 应用慢。[RFC 8201：IPv6 路径 MTU 发现](https://www.rfc-editor.org/rfc/rfc8201.html) · [RFC 8899：DPLPMTUD 与黑洞](https://www.rfc-editor.org/rfc/rfc8899.html)

## 四、无线与移动：链路短断、地址变化和连接状态分层

Wi‑Fi 与蜂窝链路的信号、竞争、重传、切换和网络提供方路径都可能变化，造成丢包、抖动或短暂不可达；不能从一次晚到的 IM 消息反推“应用没有调用 Write”。A 从 Wi‑Fi 换到蜂窝时，IP/NAT 映射可能改变，原 TCP/WebSocket 连接常需重新建立；此后要重做 TLS/应用身份、重订阅或补拉等由产品合同允许的恢复步骤。连接恢复不等于旧消息自动补齐，当前 S2 内存受理也没有跨重启历史保证。[RFC 3819：子网特性与传输](https://www.rfc-editor.org/rfc/rfc3819.html) · [04.05 重连](./05_tcp_connection_lifecycle.md)

QUIC 有 connection ID 与路径验证机制，**在满足协议/端点条件时**可支持地址迁移或 NAT 重绑定；这不意味着所有 HTTP/3 部署都无感迁移，也不补业务授权、回放控制或 B 离线 25h 的历史。原 TCP 连接不能仅靠“同一个用户登录”跨新四元组继续；应用需要按真实传输结果恢复。[RFC 9000：Connection Migration](https://www.rfc-editor.org/rfc/rfc9000.html) · [04.10 HTTP/3 概念](./10_http_versions_rpc.md)

若 B 设备网络切换，A 的 S2 `200 accepted_in_memory` 仍只到 A 请求落入的服务进程；B 的在线 bit、心跳或 NAT 映射只能给某段时间窗口的线索，不能当设备 ACK。未来若设计离线 25h 补拉，还要有真实存储保留与有权查询，不能只靠 24h 教学 broker。[09.02 确认点](../09_backend_security/02_http_api_contract.md) · [14.09 `q-06` 标签](../14_ai/09_evaluation_data_engineering.md)

## 五、逐层诊断三类“连不上/大包慢/切网断”

**连不上**先分 DNS、路由/网关、NAT 映射、TCP/QUIC 建连、TLS 名称、代理和应用 404；**小请求可过而大请求卡住**再看请求体限制、路径 MTU/封装、丢包重传、代理限额和服务端解析，不能直接归因为 PMTU；**切网后长连接断**看旧地址/端口、心跳、连接关闭/重建、身份、后端落点与补拉。所有观察都标时间与来源，避免一条“网络失败”掩盖第一个坏边界。[04.02 名称/路由分层](./02_addresses_names_routes.md) · [04.09 代理/重试](./09_proxies_load_balancing.md)

| 纸上表象 | 首次应收的证据 | 不能仅凭它判断 |
|---|---|---|
| 本地网关不可达 | 本地地址/链路/邻居/路由表 | 远端应用 404 |
| 外侧源端口改变 | NAT/切网时间线与连接重建 | 用户身份改变或旧消息已撤销 |
| 小体正常、大体超时 | body 限额、路径 MTU 与分段、重传/代理日志 | 必为 MTU 黑洞 |
| TCP/WebSocket 重连后可用 | 握手、TLS、鉴权与会话恢复记录 | 断线期间消息自动全补齐 |

纸上地址不是真网，不要求学习者抓包；将来做实际故障演练时才按许可收集 `pcap`/阶段计时，保护用户正文与凭据。[11.04 诊断方法](../11_reliability/04_diagnostic_method.md)

## 六、路由/链路观察还要有时间、作用域和单位

一次请求经过多跳，IP 包往返时间、Wi‑Fi 本地重传、TCP 重传、HTTP/代理处理和 IM 业务等待是不同阶段。网络层可看下一跳/路由是否变化、路径可否到达；链路层看邻居/局部传输；传输层看连接/重传/窗口；应用层看身份、请求和 200/409/404。每项测量需标**从哪里到哪里、时间窗口、单位和适用版本**，否则“延迟 100ms”无法比较。[04.01 时延分解](./01_application_communication_layers.md) · [11.03 日志指标 Trace](../11_reliability/03_logs_metrics_traces.md)

NAT 后的外侧地址、代理的 `Forwarded` 头和移动切换前后的 IP 都可能变；日志关联应使用授权范围内的请求/会话标识及版本，而不是把 IP 当用户永久主键。敏感地址与正文还要按数据最小化处理。离线纸图只训练观察选择，不产生真实用户指标。[RFC 7239：转发头隐私/信任](https://www.rfc-editor.org/rfc/rfc7239.html)

## 七、业务验收卡：路径可达、协议完成与用户结果分开

给虚构问题“B 离线 25h 后能收到 m-9 吗？”的验收卡，至少要分：A 的请求能到哪一跳、S2 是否收到 `200 accepted_in_memory`、N1 是否还有进程内数据、未来 S3 DB 是否真的保留、B 是否有权补拉、B 是否有设备 ACK。单看 NAT/MTU/QUIC 能否连通，不能回答最后几个业务问题。当前 24h broker 不足以保证 25h 离线完整补齐；这是 14.09 的固定标签，不因切换到蜂窝就改变。[14.09 `q-06` 评测标签](../14_ai/09_evaluation_data_engineering.md)

| 层 | 本章可说明 | 不得宣称 |
|---|---|---|
| 链路/网络 | 本地下一跳、转发、NAT/路径 MTU 条件 | `u-b` 有权、B 已读 |
| TCP/QUIC | 连接、可靠交付到对端传输层、迁移可能性 | 应用已存库/设备已展示 |
| HTTP/IM | 具体响应/业务状态的已观察边界 | 200 自动跨重启、R9 已生效 |

迁移/MTU 优化若让连接更顺畅，也要回到同一用户任务与失败桶实测，而不是只报数据包更少。04.12 会把这些层的证据汇总成排障和协议演进评审。[04.12 本卷收束设计](./README.md)

## 八、22 道分层练习：从下一跳到业务确认

1–8 认地址/转发/NAT，9–16 推演 MTU/移动，17–22 做诊断与业务判断。所有答案基于虚构路径。

### 基础 1–8：下一跳与映射

<details><summary>1. A 发远端 IP 包时，本地链路先找服务 MAC 还是网关链路地址？</summary>

本章远端不在本地链路，先把帧交给默认网关的链路地址。</details>

<details><summary>2. 路由器转发后链路层封装会一直不变吗？</summary>

不会；每一跳按下一段链路重新封装。</details>

<details><summary>3. NAT 将 `10.0.0.2:53000` 映射成什么纸上外侧端点？</summary>

`198.51.100.7:62000`；只是虚构示意。</details>

<details><summary>4. 公网 IP 与端口能唯一证明 actor 是 `u-a` 吗？</summary>

不能；可共享、改变或受代理/NAT 影响，应用身份须另验证。</details>

<details><summary>5. NAT 会自动复制 N1 的本进程消息到 N2 吗？</summary>

不会；地址转换与数据复制/持久是不同机制。</details>

<details><summary>6. IPv4 的 ARP/IPv6 邻居发现主要解决哪一段？</summary>

本地链路上的邻居/下一跳寻址，不是远端 IM 用户授权。</details>

<details><summary>7. 路由可达就说明 TLS 名称正确吗？</summary>

不说明；网络路由与服务身份验证分层。</details>

<details><summary>8. IP 目的地址 `203.0.113.10` 是本章真实服务吗？</summary>

不是，是文档保留的示例地址。</details>

### 推演 9–16：MTU 与移动

<details><summary>9. 纸上 MTU1500、IPv4/TCP 最小头各20，剩多少 TCP 数据 B？</summary>

`1500−20−20=1460 B`，忽略选项/隧道/其它开销。</details>

<details><summary>10. 1460 B 就是当前 IM 正文上限吗？</summary>

不是；当前正文仍最多 6 UTF-8 B，MTU 是单包路径条件。</details>

<details><summary>11. 原始 HTTP body 4096 B 能保证装进一个 IP 包吗？</summary>

不能；可能被传输层分段并有各层头部。</details>

<details><summary>12. 小请求可过、大请求超时就必是路径 MTU 黑洞吗？</summary>

不必；还要排 body 限额、代理、应用解析、重传与负载。</details>

<details><summary>13. Wi‑Fi 切蜂窝时旧 TCP/WebSocket 常需什么？</summary>

按实际路径重新建连、鉴权、恢复/补拉，不能假定旧连接仍有效。</details>

<details><summary>14. QUIC 有迁移机制就保证任何实现无感换网吗？</summary>

不能；需连接 ID、路径验证、端点允许与应用状态配合。</details>

<details><summary>15. 外侧 NAT 端口变化就说明 B 设备收到了 m-9 吗？</summary>

不能；映射变化只提供路径线索，与 B 设备 ACK 不同。</details>

<details><summary>16. IPv6 路由器会任意替源端分片解决所有大包问题吗？</summary>

不会；需要按协议处理路径 MTU 和源端分段/发现。</details>

### 决策 17–22：诊断与业务边界

<details><summary>17. 连接拒绝后先怪 R9 未生效吗？</summary>

不应；先查地址、路由、NAT、端口/连接层，再回应用合同。</details>

<details><summary>18. 同一用户换 IP 后可继续用旧 IP 作永久身份主键吗？</summary>

不可；按可信身份/请求 ID 关联并控制隐私。</details>

<details><summary>19. S2 `200 accepted_in_memory` 能证明跨重启历史吗？</summary>

不能；只到受理进程内存。</details>

<details><summary>20. B 离线 25h，可只凭 24h broker 保证完整补拉吗？</summary>

不能；未来 DB 要真实保留且 B 有权可读才可能补。</details>

<details><summary>21. 网络迁移后连接恢复，旧消息自动全补齐吗？</summary>

不保证；还需权威历史、游标、权限与设备确认协议。</details>

<details><summary>22. “延迟 100ms”若没起止点/单位窗口，可用于排障结论吗？</summary>

不充分；要标哪一跳、阶段、时间窗口与关联请求。</details>

## 本章完成标准与后续路径

能画出 A 的本地下一跳与 NAT 映射，算出 MTU1500 的简化 1460 B TCP 数据并说清它与正文 6 B 的区别；能按网络切换、PMTU、代理和应用确认点定位三类故障，不用路由/NAT/QUIC 结果冒充 B 设备 ACK，才算完成本章。下一章[04.12 网络排障与协议演进](./12_network_diagnostics_evolution.md)汇总抓包观察、阶段计时、失败分类与协议兼容评审。[第四卷路线](./README.md)
