---
title: 07.03 缓存读取与更新：迟到回填怎样复活旧值
icon: /assets/icons/article.svg
order: 4
date: 2026-09-24
---

[返回第七卷](./README.md) · [状态角色前置：07.01](./01_access_state_roles.md) · [Redis 结构前置：07.02](./02_redis_data_model.md) · [一致性前置：08.04](../08_distributed/04_consistency_models.md) · [数据库事务前置：06.07](../06_databases/07_transactions_anomalies.md)

# 07.03 缓存读取与更新：迟到回填怎样复活旧值

> DeepTutor 八节初稿经技术与教学审阅后的静态课程。数据库版本 V8/V9、Redis 键、TTL、读写交错均为**虚构纸上模型**；没有运行 Redis、数据库、Go、IM 服务、基准或站点，不声称 OpenIM 使用下述策略。当前 S2 的 `200 accepted_in_memory` 仍是进程内受理；本章的数据库写入沿用未来 S3 v2 的**教学提议**。

## 一、缓存读得快之前，先规定数据从哪里来

07.01 判定未来教学 S3 中已提交消息是权威，`preview:c-a` 是可重建会话预览；07.02 选小 Hash 或 String 保存其 `last_id` 和 `seq`。固定源数据库里原有最新 `seq=8`，之后提交新消息 `m-9/seq=9`。缓存可能仍有 `seq=8`，也可能没有键。若产品要求 A 发后会话列表立刻出现 9，这份预览的旧值就不能被当作正确结果；若允许短暂陈旧，则须明确时长与修复责任。[07.01 状态角色](./01_access_state_roles.md) · [08.04 一致性模型](../08_distributed/04_consistency_models.md)

**Cache-aside** 的基本读路径是“先查缓存；命中就按合同用值；未命中再查权威数据库，必要时回填缓存并给有限 TTL”。写路径常选“先提交权威数据库，再失效相关缓存键”。Redis 官方给出这种常见模式，但**数据库事务与 Redis 命令不是一个原子步骤**；下面要手算两种交错，不能从模式名称推出严格一致。[Redis cache-aside 文档](https://redis.io/docs/latest/develop/use-cases/cache-aside/)

```text
读：GET preview:c-a → hit? 检查版本/权限合同 → 返回
                  └→ miss → 查权威 → 可缓存时 SET + TTL → 返回
写：DB 事务提交 seq9 → DEL preview:c-a → 后续读按需回填
```

| 第一遍 | 第二遍 | 交付物 |
|---|---|---|
| hit/miss/不存在/依赖失败、读写先后 | 两种旧值交错、版本、负缓存、权限与降级 | 两张逐步状态表、一份缓存故障合同与 22 道练习 |

## 二、四种“没有可用值”：不能都翻译成 404

读 `preview:c-a` 时至少区分：① **hit**，键有值，但仍可能陈旧；② **miss**，该缓存当前没有值；③ 权威数据库明确回答业务对象不存在，且调用者有权得到这种结论；④ Redis/数据库/网络依赖错误，无法形成权威结论。`miss` 只能导向回源/降级，**不能直接返回“会话不存在”**；数据库错误也不能写入“未找到”的负缓存，否则依赖恢复后仍会错误拒绝。[Redis cache-aside 文档](https://redis.io/docs/latest/develop/use-cases/cache-aside/)

还有安全边界：已登录但非成员 `u-c` 读取私有 `c-a/m-9`，09.02 的隐藏目标政策给 `404`，这是一条**授权响应**，不表示 `m-9` 真不存在。若错误地把这次 404 按 `message_id=m-9` 做**全局**负缓存，随后有权的 `u-a` 也会被旧负值误拒绝，甚至暴露/混淆权限范围。保护资源的负缓存至少要明确身份、会话、可见版本与失效责任；本章不预设它值得缓存。[09.02 HTTP 合同](../09_backend_security/02_http_api_contract.md)

| 观察 | 能确定 | 不能直接确定 |
|---|---|---|
| Redis hit `seq=8` | 缓存键当前有值 | 数据库仍是 8；A 有权读 |
| Redis miss | 这次没可用缓存值 | 数据库没有会话/消息 |
| 权威查询明确“无此对象” | 在本次可见范围内没有匹配 | 对其他用户也不存在、将来不会出现 |
| 权威/Redis 依赖错误 | 查询路径失败 | 可安全返回业务 404 或缓存 ABSENT |

## 三、先删缓存再写数据库：旧值会趁空窗回填

先固定 `DB=V8`、`cache=V8`。写者 W 想提交新 `V9`，却先执行 `DEL cache`；读者 R 在这段空窗碰上 miss，读取数据库旧 V8 并回填，W 最后才提交 V9。纸上逐项写状态：[Redis 缓存一致性资料](https://redis.io/docs/latest/develop/use-cases/cache-aside/)

| 步骤 | W 写者 | R 读者 | DB | cache |
|---|---|---|---|---|
| 0 | — | — | V8 | V8 |
| 1 | `DEL preview:c-a` | — | V8 | 空 |
| 2 | — | miss，查 DB 得 V8 | V8 | 空 |
| 3 | — | `SET preview:c-a=V8` | V8 | **V8** |
| 4 | `COMMIT V9`，后面没有再失效 | — | **V9** | **V8** |

最后 DB 是 9、cache 是 8；如果没有后续写入/失效，缓存可能一直旧到本次键 TTL 到期或被逐出。**因此“先删再写”在此交错里不成立**。把顺序改成“先提交 DB 再删缓存”能消除上面这一条具体路径，却并不消除所有竞态；下一节有另一条。[Redis cache-aside 文档](https://redis.io/docs/latest/develop/use-cases/cache-aside/)

## 四、先提交再删除，仍可能被迟到的读回填 V8

这次 `DB=V8`、**cache 初始为空**。R miss 后从 DB 读到 V8，却在写缓存前暂停；W 抢先提交 V9，并 `DEL` 此刻仍为空的键；R 醒来后才 `SET V8`。注意 W 的顺序已经是“DB 成功再 DEL”：

| 步骤 | R 读者 | W 写者 | DB | cache |
|---|---|---|---|---|
| 0 | — | — | V8 | 空 |
| 1 | miss，DB 读取 V8，暂停 | — | V8 | 空 |
| 2 | — | `COMMIT V9` | **V9** | 空 |
| 3 | — | `DEL preview:c-a`（仍为空） | V9 | 空 |
| 4 | **迟到 `SET V8`** | — | V9 | **V8** |

旧值被**复活**。给 R 的 `SET` 加 `NX`（只在键不存在时设）也挡不住：W 在步骤 3 已确保键为空，R 的 `SET NX V8` 仍可成功。给值带 `source_version=V8` 可帮助识别陈旧，却**不自动**阻止它覆盖失效结果；若要让填入时的版本比较生效，需要有**不会被简单 DEL 一并抹掉的最低有效版本/围栏**、与填入一起受控的条件比较，以及写侧围栏失败时的回退策略。跨 DB/Redis 的提交与围栏更新也不自动原子，不能只画一个 `version` 字段便宣称严格一致。

对“发完必须立刻看见 9”的读请求，最简单的**可审阅**方向仍是读权威 P 或携带最低提交水位，等指定数据副本/派生视图至少可见 V9；达不到就按合同等待、回退或明确失败，不从已知旧缓存返回 8。07.04 才处理同一个热键大量 miss 同时回源的容量问题。

## 五、TTL 与负缓存：过期限制一次驻留，不证明读时新鲜

假设迟到的 V8 在步骤 4 被写入 Redis 并带**30 秒玩具 TTL**。若之后没有刷新/重新回填，它最多按这条键的 TTL 继续被缓存读取，到期后必须回源；但这不能保证这 30 秒内读到 V9。更不能把“源在 t=2 提交”到“客户端最多 t=32 恢复”当绝对保证：TTL 从**实际填入时**起算，反复旧值回填、时钟/故障和不同缓存副本还要另外分析。TTL 短会增加回源，TTL 长会扩大某些旧值窗口，选择须看业务容忍和真实负载。[Redis EXPIRE](https://redis.io/docs/latest/commands/expire/) · [Redis Eviction](https://redis.io/docs/latest/develop/reference/eviction/)

**负缓存**把权威查得“确实不存在”的结果暂存为 `ABSENT`，可避免重复查无效 ID，但同样会竞态。固定 `m-x` 原本不存在：R 回源得到“无”，暂停；W 插入 `m-x` 并提交、失效该键（当时仍空）；R 迟到写入 `ABSENT`。以后有权用户可能被误答“无 m-x”，直到负值过期或正确失效。正值旧回填和负值迟到回填是同一类顺序问题；对私有消息还需先把**授权隐藏 404**与真正无记录分开，不能全局缓存一个“404”。

## 六、权限与读己之写：有些路径不该接受旧缓存

`members.left_at` 是当前资格的权威依据。A 退群后旧缓存仍标“活跃”，若发送用它直接放行，会违反 06.07–06.08 的并发裁决；若历史读取只看旧许可，还可能泄露私有正文。权限缓存即使有 TTL，也不能把“几十秒可能旧”作为默认安全承诺。真实授权方案需让每条关键操作获得足够新的权威/版本证据，处理退群/再入群和故障，不把缓存 hit 当授权。[06.08 锁与 MVCC](../06_databases/08_locks_mvcc.md) · [09.07 认证与授权](../09_backend_security/07_authentication_authorization.md)

A 在未来 S3 提议里已知提交 `m-9/seq9`，紧接着会话预览 hit V8：若产品承诺“发后立即在自己的会话列表看见 9”，这违反读己之写；若仅允许预览稍后追平，需标明显示与刷新规则。08.04 已把最低水位与失败策略解释清楚；缓存层不能因处理了 `DEL` 就替业务作出更强承诺。[08.04 一致性模型](../08_distributed/04_consistency_models.md)

## 七、DB 已提交而失效失败：返回、修复和观测都要有答案

再画一个没有并发读的简单故障：DB `COMMIT V9` 已成功，接着 Redis `DEL preview:c-a` 因依赖失败没有完成，缓存仍为 V8。**数据库消息没有因此自动回滚**；客户端看到什么，要按本接口的缓存一致性合同决定。若预览只是允许陈旧、可重建的派生值，可以在已知提交后对外保持数据库提交结果，同时标记失效失败、安排有界重试/对账，并在需读己之写的路径绕过旧预览。若产品把预览同步新鲜性列为同一次操作的硬保证，就须设计能证明该保证的跨系统协议或明确返回无法满足，不能靠一次 `DEL` 成功率来假装原子。[Redis cache-aside 文档](https://redis.io/docs/latest/develop/use-cases/cache-aside/)

观测应分开记录：DB 提交已知/未知、源版本 V8/V9、缓存命中/未命中、缓存版本、DEL 成败、回填版本、用户读到的版本、退群权限版本。日志用脱敏 ID/版本与 Trace 关联，不记录私有正文或凭据；命中率高却经常旧值仍是坏结果。重试与补偿也需确定幂等身份、保留窗口和失败升级办法；未来可研究 CDC/outbox，但**它们不是此页已经部署的自动修复**。[11.03 日志、指标与 Trace](../11_reliability/03_logs_metrics_traces.md)

## 八、交付两条交错和一份业务合同

交付“先删后写”和“先提交后迟到回填”两张逐步状态表、`m-x` 负缓存反例、30 秒玩具 TTL 的真实起算点，以及对预览/权限/写后读的三个不同陈旧政策。每条策略都要写：依赖失效时如何答、多久后重查、谁负责修复、用什么证据证明用户看见的版本；只背“cache-aside + TTL”不算完成。

### 分层练习与反馈

1–8 先认 hit/miss/权威，9–16 手算两条竞态与负缓存，17–22 评审授权、TTL 和故障。先独立预测，再展开答案。

<details><summary>1. `GET preview:c-a` miss 可以直接说明数据库没有会话吗？</summary>

不能。只说明这次缓存没有可用值，应按权限回源或按故障政策处理。</details>

<details><summary>2. 命中缓存 V8，权威已是 V9，就算“新鲜 hit”吗？</summary>

不是。键存在但值旧，是否能返回取决于预览合同。</details>

<details><summary>3. Redis 错误与数据库明确“不存在”能用同一个 404 吗？</summary>

不能。依赖失败没有形成业务不存在的权威证明。</details>

<details><summary>4. `u-c` 查私有 `m-9` 得隐藏 404，能全局缓存“m-9 不存在”吗？</summary>

不能。那是授权隐藏结果，不是真实不存在；会污染有权用户的查询。</details>

<details><summary>5. Cache-aside 读 miss 后通常做哪两步？</summary>

查权威源；若结果可安全缓存，再按版本/TTL 政策回填。</details>

<details><summary>6. 写入 V9 时 DB Commit 与 Redis DEL 自动同事务吗？</summary>

不自动。两系统各有独立成功/失败与竞态窗口。</details>

<details><summary>7. TTL 还没到，缓存值就必是数据库最新吗？</summary>

不必然。源可能已更新，缓存尚未正确失效。</details>

<details><summary>8. SET NX 单独能阻止第 4 节的 V8 回填吗？</summary>

不能。W 已删除/键原本空，R 的 NX 条件仍能成立。</details>

<details><summary>9. 先删再写表：W DEL 后 R 读到哪个 DB 版本？</summary>

W 尚未提交 V9，所以 R 读到 V8。</details>

<details><summary>10. 同一表最后 W Commit V9，cache 留什么？</summary>

R 已回填 V8，若 W 没有再失效，cache 仍为 V8。</details>

<details><summary>11. 先提交再删表：R 在 W Commit 前读了什么？</summary>

R 从 DB 读到 V8，随后暂停，尚未 SET。</details>

<details><summary>12. W Commit V9 并 DEL 空键后，R 迟到 SET 会怎样？</summary>

cache 被回填为旧 V8，形成“旧值复活”。</details>

<details><summary>13. 回填值多带 `source_version=V8` 就自动阻止复活了吗？</summary>

不自动。要有受控的最低有效版本/围栏和条件比较；写侧失败也需有回退方案。</details>

<details><summary>14. `m-x` 先被查无，W 后插入并失效，R 再写 ABSENT，后果是什么？</summary>

有权用户可能被旧负缓存错误告知“不存在”，直到过期/修正。</details>

<details><summary>15. 30 秒 TTL 从哪一刻开始限制第 4 节那次旧值？</summary>

从 R 实际把 V8 回填进缓存并设置 TTL 的时刻起，不从 W Commit 时起。</details>

<details><summary>16. 同一旧值被反复重新回填，还能把首次 TTL 当绝对陈旧上限吗？</summary>

不能。每次重填可能有新生命周期，须设计版本/失效与测量范围。</details>

<details><summary>17. A 已退群、许可缓存仍活跃，能按旧键放行发送吗？</summary>

不能。发送资格须按足够新的受控权威/版本状态判断。</details>

<details><summary>18. A 已提交 m-9，预览 hit V8，若承诺发后立刻可见应怎样？</summary>

不能返回旧预览冒充满足合同；可读权威或等待可见水位，达不到就按合同失败/降级。</details>

<details><summary>19. DB Commit V9 成功但 Redis DEL 失败，消息会自动回滚吗？</summary>

不会。DB 提交已发生；派生预览修复和用户答复要按合同另处理。</details>

<details><summary>20. 缓存命中率 90% 就证明没有陈旧读吗？</summary>

不能。hit 只表示缓存给了值，还要比较版本、授权和用户可见结果。</details>

<details><summary>21. 如果要求严格的写后读，单靠 cache-aside + TTL 能证明吗？</summary>

不能。需要权威读或受控水位/围栏协议及失败策略，TTL 只管理生命周期。</details>

<details><summary>22. 修复方案上线前要保留哪几类可核对证据？</summary>

至少 DB 提交/源版本、DEL 与回填顺序、缓存版本、用户读版本、权限版本及故障注入结果。</details>

## 本章完成标准与下一步

能不看答案手画两个交错的最后状态 `DB=V9, cache=V8`，解释负缓存迟到回填、SET NX 失效和 TTL 起算点，并把预览旧读与权限旧读分开处理，才算完成第一轮。第二轮由学习者在隔离环境以受控时序与版本记录验证；本章没有代替运行。

按[学习路线](../learning_path.md)，下一章 07.04 将在缓存 miss 成批出现时解释热点、击穿、穿透和雪崩，再评审合并加载、限流与降级。
