---
title: 实验环境与运行索引
icon: /assets/icons/article.svg
order: 0.5
date: 2026-09-22
---

## 环境分层

| 实验 | 最小条件 | 外部成本 |
|---|---|---|
| Go 契约、并发、网络、HTTP | Go 1.24+，race 需要平台支持和 C 工具链 | 无 |
| Python 检索、恢复、评测 | Python 3.11+，仅标准库 | 无模型调用 |
| 网页排队模型检查 | Node.js 22.18+，使用内置测试运行器 | 无 |
| SQL 与 Redis | Docker Engine + Compose v2，约 2–3GB 可用内存 | 首次下载镜像 |
| Kubernetes | Docker、kubectl、kind，个人本地集群 | 额外内存和镜像 |
| 真实模型 | 个人测试账户与所选 SDK | 按实际调用计费 |

代码在仓库根的 `labs/platform_path/`。命令默认从仓库根开始；进入实验目录后，同一代码块无需重复进入。Go/Python 与 SQL 是分开的模型，HTTP 默认不连接 SQL。

## 基础检查

```bash
go version
python3 --version
cd labs/platform_path
GOWORK=off go test ./...
GOWORK=off go test -race ./...
python3 -m unittest discover -s ai -v
python3 ai/agent_lab.py evaluate
node --test queue-model.test.mjs
```

Go 不依赖第三方 module。若有父目录 go.work，`GOWORK=off` 可让实验独立运行；后续命令可以保留该前缀。不能运行时先检查编译器与缓存权限。

## 数据库环境

```bash
docker compose config --quiet
docker compose up -d --wait --wait-timeout 90
docker compose exec -T mysql mysql -uroot -pjourney-local-only < sql/schema.sql
docker compose exec -T mysql mysql -uroot -pjourney-local-only journey_lab < sql/procedures.sql
bash sql/check.sh
```

数据库绑定本机 34067 端口，Redis 为 36379。密码是公开本地实验值，仅用于隔离环境。MySQL named volume 保留练习数据；不要连接工作或生产数据库执行。

镜像采用 MySQL 8.4、Redis 7.4 系列。标签可能获得补丁更新，可用 `docker image inspect` 记录实际 digest。

交互式 MySQL：

```bash
docker compose exec mysql mysql -uroot -pjourney-local-only journey_lab
```

结束时停止本课容器，保留数据：

```bash
docker compose stop
```

再次 `up -d --wait` 可继续使用。校验脚本每次使用独立虚构租户。

## 按课查命令

| 课程 | 核心命令 |
|---|---|
| 01 | `go test -run '^TestContract$' -v` |
| 02 | `go test -race -run '^TestOwnership$'`，再运行 TestConcurrentDuplicate |
| 03 | `go test -race -run '^TestPipeline'` |
| 04 | `go test -run '^TestFrame'`；`go test -bench BenchmarkGrant -benchmem` |
| 05–06 | `bash sql/check.sh`，按正文做 EXPLAIN 和双会话实验 |
| 07 | Redis 虚构键的 SET、GET、TTL、DEL |
| 08 | `go test -run '^TestOutboxCrashWindow$'` |
| 09 | `go test -run '^TestFencing$'` |
| 10 | `go run ./cmd/latency` |
| 11–12 | `go test -run '^TestHTTPIsolationAndDrain$'`；`go run ./cmd/server` |
| 13–16 | `python3 -m unittest discover -s ai -v`；`python3 ai/agent_lab.py workflow-demo` |
| 17–18 | 设计记录、独立变式、分层结课验收 |

## 常见问题

端口占用时可改 Compose 宿主端口，容器内命令不变。HTTP 可用 `ARENA_ADDRESS=127.0.0.1:8098 go run ./cmd/server` 改端口。

MySQL 未就绪先查 `docker compose ps` 和本课容器日志，避免把连接失败当事务错误。没有 Docker 时先完成 Go/Python，数据库课记为未验证。

实验不调用真实模型。固定样本得分只用于学习评测流程。

交付时已执行与未执行的检查见[验证记录](./verification.md)。
