---
title: 实践环境：从个人小程序到整合示例
icon: /assets/icons/article.svg
order: 0.5
date: 2026-09-23
---

## 第一次只准备 Go 与编辑器

详细章稿从 [01.01](./curriculum/01_go/01_program_toolchain.md)创建个人 arena-hello 目录，再按 01.02 使用 arena-types、01.03 使用 im-control、01.04 使用 im-collections、01.05 使用 im-identity。若使用 A 篇衔接材料，则按 [A01](./beginner/01_first_program.md)创建 go-course 模块，逐步建立 main.go、points.go 和 points_test.go。采用当前章节的目录约定即可。

后端、数据库和 AI 工具按进度引入。以下命令是学习时执行的说明，预期输出与自己的实际结果分别记录。

## IM 主项目的环境边界

[OpenIM 参照版本](./curriculum/im_reference.md)的 go.mod 声明 Go 1.25.0，并有 MongoDB、Redis、Kafka、etcd 等依赖。到需要复现上游行为的章节再按固定版本准备；初学 Go 与本地消息模型不要求先部署整套服务。

本页下方的 labs/platform_path 和 MySQL 命令属于已有通用机制实验，并非 OpenIM 的启动说明。SQL 教学模型与 OpenIM 的 MongoDB 消息路径分别学习，不能混用模块、端口或配置。

| 学习位置 | 工作目录 | 所需环境 |
|---|---|---|
| 01.01–01.05 长篇正文 | 章内指定的个人 arena-hello、arena-types、im-control、im-collections、im-identity 目录 | Go、编辑器与终端 |
| 02.01 数学计数模型 | 个人 im-cost 模块 | 纸面推导可先完成；代码示例用 Go |
| 03.01 系统资源模型 | 个人 im-resource 模块 | 纸面推导可先完成；不需要硬件实验或外部服务 |
| 10.01 需求小模型 | 个人 im-requirements 模块 | Go、编辑器与终端；纸面部分可先阅读 |
| 10.03 Git 起步 | 仓库之外新建的 im-git-practice | Git 2.28+；基础部分无需远端 |
| A01–A10 | 个人 go-course 模块 | Go、编辑器与终端 |
| B01 的账户示例 | 本仓库 labs/platform_path | Go 1.24+ |
| B02–B03 | 个人 go-course 模块 | Go；浏览器或 curl |
| B04–B05 | 本仓库 labs/platform_path | Docker、Compose、本地 MySQL |
| B06–B07 | 个人 go-course 模块 | Go |
| C 篇整合示例 | 本仓库 labs/platform_path | 按课选择 Go、MySQL/Redis 或条件集群 |
| D 篇离线工具 | 本仓库 labs/platform_path | Python 3.11+，核心例子只用标准库 |

## 两个目录为何不同

个人目录帮助你从空白文件理解包与模块；教材 labs 保存后续的参考模型。它们各有自己的 go.mod，不能把一个模块的 import 路径直接写进另一个却不解释依赖。

A01 介绍路径，A08 介绍模块。如果遇到找不到文件或包，先检查当前目录和 go.mod，再检查代码。

## B01：第一次阅读参考账户

从教材仓库根目录执行：

```bash
cd labs/platform_path
GOWORK=off go run ./cmd/foundations
GOWORK=off go test ./foundations -v
```

GOWORK=off 让当前模块独立运行，避免父目录 go.work 影响；使用的 shell 写法见 B04。这里只读 foundations 的顺序账户，完整 Ledger 的回执与事件等到 C 篇。

## B04–B05：数据库入门

先读 [B04 环境概念](./backend_basics/04_local_tools.md)，再操作。进入 labs/platform_path 后：

```bash
docker compose config --quiet
docker compose up -d --wait --wait-timeout 90
docker compose exec mysql mysql -uroot -pjourney-local-only journey_lab
```

进入 SQL 客户端后，按 B05 创建 beginner_tasks 等虚构练习表。课程数据库名是 journey_lab，公开的本地示例密码只用于该练习环境。

MySQL 的宿主机端口为 34067，Redis 为 36379；容器网络、端口映射和数据卷已在 B04 解释。已有同名练习数据时，先查询再决定如何继续，重复 INSERT 可能触发主键冲突。

结束 SQL 客户端用 exit。回到终端后，`docker compose stop` 停止课程服务并保留 volume。

## C05–C07：初始化进阶数据模型

这组表与 B05 的入门表不同。完成 B05 后再按 C05、C06 需要初始化：

```bash
docker compose exec -T mysql mysql -uroot -pjourney-local-only < sql/schema.sql
docker compose exec -T mysql mysql -uroot -pjourney-local-only journey_lab < sql/procedures.sql
```

`<` 把文件内容作为命令输入，-T 适合这类非交互输入。不要把它与进入客户端后手工输入 SQL 的方式混淆。

```bash
# C05：虚构索引数据。
docker compose exec -T mysql mysql -uroot -pjourney-local-only journey_lab < sql/index_lab.sql
# C06：事务、重复、冲突与回滚。
bash sql/check.sh
# C07：稳定复现迟到缓存回填。
bash sql/cache_race.sh
```

这些脚本会写入专用练习数据。MySQL 数据卷保留记录；缓存实验键带过期时间。镜像采用 MySQL 8.4、Redis 7.4 系列，个人验证时记录实际版本与配置。

## C 篇按课查命令

以下入口都在 labs/platform_path，不是个人 go-course：

| 课程 | 示例入口 |
|---|---|
| C01 | `go test ./foundations -run '^TestCreditContract$' -v` |
| C02 | `go test -run '^TestOwnership$' -v` |
| C03 | `go test -race -run '^TestPipeline' -v` |
| C04 | `go test -run '^TestFrame' -v`；`go test -run '^$' -bench BenchmarkGrant -benchmem` |
| C06 | `go test -race -run '^TestConcurrentDuplicate$' -v` 与 SQL 脚本 |
| C08 | `go test -run '^TestOutboxCrashWindow$' -v` |
| C09 | `go test -race -run '^TestFencing$' -v` |
| C10 | `go run ./cmd/latency` |
| C11–C12 | `go test -run '^TestHTTPIsolationAndDrain$' -v`；`go run ./cmd/server` |

race 需要对应平台支持与 C 工具链。基准参数由 C04 解释，运行时先记录环境，不把一个数字直接当成业务容量。

整合 HTTP 服务默认监听 127.0.0.1:8097，和 B03 自己写的 8080 示例不同。使用环境变量 ARENA_ADDRESS 可以改变整合示例地址。它仍使用内存状态，连接 SQL 是 D06 的后续实践。

C11 中 Kubernetes 步骤需要另行准备个人本地环境，独立记录完成情况。

## D 篇离线实践

```bash
python3 -m unittest discover -s ai -v
python3 ai/agent_lab.py retrieve --tenant team-a --query "timeout retry"
python3 ai/agent_lab.py evaluate
python3 ai/agent_lab.py workflow-demo
```

先完成 D01 的 Python 基础。这里使用英文词项检索与 SQLite，不调用真实模型；生成、embedding 和外部工具接入有独立要求。

## 记录实际完成范围

环境问题、代码错误、业务规则失败分别记录。没有执行的步骤保持未验证，可以先完成对应推导与练习设计。

本轮教材的实际检查范围见[修订记录](./verification.md)，个人学习结果放在[进度页](./progress.md)。
