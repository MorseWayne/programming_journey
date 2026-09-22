---
title: 实践说明与按阶段准备环境
icon: /assets/icons/article.svg
order: 0.5
date: 2026-09-22
---

## 按学习进度准备

本页是学习者需要动手时使用的操作说明。课程正文、推导、时间线和业务练习均可先静态阅读，外部环境按对应阶段准备。

| 阶段 | 练习材料 | 动手时需要的条件 |
|---|---|---|
| 一：运行与契约 | 顺序账户、共享与复制 | Go 1.24+ |
| 二：并发与性能 | 工作池、帧解析、基准 | Go；race 需平台支持和 C 工具链 |
| 三：持久化 | 索引、事务与缓存 | Docker 与 Compose；独立 MySQL/Redis |
| 四：分布式机制 | 重放、fencing 时间线 | Go；真实多进程集成为后续实践 |
| 五：平台运行 | HTTP、退出和接口 | Go；集群部分另需 Docker、kubectl、kind |
| 六：AI 工程 | 检索、SQLite、评测 | Python 3.11+；核心练习不调用模型 |
| 七：综合实践 | 个人选定的业务项目 | 按方案准备并记录依赖 |

配套示例在仓库根的 `labs/platform_path/`。下文命令用于你学习时执行；教学模型、预期结果与实际运行记录应分别理解。

## 第一阶段：先运行最小示例

```bash
cd labs/platform_path
go version
GOWORK=off go run ./cmd/foundations
GOWORK=off go test ./foundations -v
```

如果父目录存在 go.work，GOWORK=off 让本模块独立运行；后续命令可以保留这个前缀。foundations 只讲顺序账户；根目录 Ledger 的回执、事件与锁在后续章节逐步引入。

## 第二与第四阶段：按课选择实验

以下命令均在 `labs/platform_path` 执行。同一终端已经进入后，无需反复 cd。

| 课程 | 练习入口 |
|---|---|
| 00–01 | `go run ./cmd/foundations`；`go test ./foundations -run '^TestCreditContract$' -v` |
| 02 | `go test ./foundations -run '^TestAccountCopy$' -v`；`go test -run '^TestOwnership$' -v` |
| 03 | `go test -race -run '^TestPipeline' -v` |
| 04 | `go test -run '^TestFrame' -v`；`go test -run '^$' -bench BenchmarkGrant -benchmem -count=3` |
| 06 内存对照 | `go test -race -run '^TestConcurrentDuplicate$' -v`，其余见[第 6 课](./06_transactions.md) |
| 08 | `go test -run '^TestOutboxCrashWindow$' -v` |
| 09 | `go test -race -run '^TestFencing$' -v` |
| 10 | `go run ./cmd/latency` |
| 11–12 | `go test -run '^TestHTTPIsolationAndDrain$' -v`；`go run ./cmd/server` |

排队网页实验可直接在第 3 课操作；其模型检查入口是 `node --test queue-model.test.mjs`。

## 第三阶段：课程专用数据库

需要 Docker 与 Compose，并为数据库预留约 2–3GB 可用内存。首次使用可能下载镜像，实际资源使用与环境有关。

```bash
docker compose config --quiet
docker compose up -d --wait --wait-timeout 90
docker compose exec -T mysql mysql -uroot -pjourney-local-only < sql/schema.sql
docker compose exec -T mysql mysql -uroot -pjourney-local-only journey_lab < sql/procedures.sql
```

环境名为 journey-platform-lab；MySQL 绑定本机 34067，Redis 绑定 36379。示例密码是公开的本地实验值，操作对象应始终是课程环境。

按章节选择：

```bash
# 第 5 课：添加 index-lab 虚构数据，观察执行计划。
docker compose exec -T mysql mysql -uroot -pjourney-local-only journey_lab < sql/index_lab.sql
# 第 6 课：重复、冲突、并发与回滚。
bash sql/check.sh
# 第 7 课：固定顺序复现迟到缓存回填。
bash sql/cache_race.sh
```

索引脚本补充固定虚构租户；事务脚本和缓存脚本为每次执行使用独立练习身份。它们会写入教学数据，数据库 volume 保留这些数据；缓存实验的键自动过期。

需要两会话实验时，分别打开两个终端：

```bash
docker compose exec mysql mysql -uroot -pjourney-local-only journey_lab
```

练习结束可停止课程容器，保留已有数据：

```bash
docker compose stop
```

镜像使用 MySQL 8.4 与 Redis 7.4 系列。补丁更新可能改变具体镜像，可在自己的实验记录中保存 digest。

## 第五阶段：本机 HTTP 与条件集群练习

`go run ./cmd/server` 默认监听 127.0.0.1:8097。若端口占用，可用 `ARENA_ADDRESS=127.0.0.1:8098 go run ./cmd/server`，并对应修改 curl 地址。

HTTP 默认使用内存状态，没有连接 SQL。重启清空是当前模型行为；连接持久存储是综合实践任务。第 11 课提供个人 kind 集群的可选步骤，集群实践与本机实践单独记录完成情况。

## 第六阶段：离线 AI 模型

```bash
python3 --version
python3 -m unittest discover -s ai -v
python3 ai/agent_lab.py retrieve --tenant game-a --query "timeout retry"
python3 ai/agent_lab.py evaluate
python3 ai/agent_lab.py workflow-demo
```

这些练习只用标准库、英文词项检索和 SQLite。真实模型、embedding、外部工具和 SDK 接入是后续条件实践，应单独记录成本与效果。

## 遇到环境问题时

先记录命令、工作目录、版本与具体错误。连接失败与事务逻辑失败不同；没有环境时，将相应实验标为未验证，继续可独立完成的理论、预测和业务分析。

参考示例与验证范围见[交付记录](./verification.md)。不要因为代码或配置文件存在，就把对应业务能力记为已完成。
