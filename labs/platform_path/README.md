# 平台与 AI 工程课程实验

正文：`src/docs/platform_engineering/`，站点入口 `/docs/platform_engineering/`。

## 核心实验

```bash
GOWORK=off go test -race ./...
go run ./cmd/latency
python3 -m unittest discover -s ai -v
python3 ai/agent_lab.py evaluate
python3 ai/agent_lab.py workflow-demo
```

Go 1.24+、Python 3.11+，仅标准库。`go run ./cmd/server` 启动 127.0.0.1:8097 的教学 HTTP 服务，数据在内存中，重启清空。

## 可选服务环境

```bash
docker compose up -d --wait
bash sql/check.sh
docker compose stop
```

环境创建课程专用数据库与 Redis，测试数据为虚构。MySQL volume 保留；SQL 过程只修改 journey_lab。脚本重装过程并为每次运行使用不同租户。

## 模型边界

- Go Ledger、Sink、FencedStore 是内存参考模型，没有持久化或分布式共识。
- HTTP 与 SQL 过程尚未连接，连接它们是综合项目 C 层练习。
- Python 是英文关键词检索，不是 embedding 或 LLM；八条用例通过率不是模型效果。
- SQLite 模拟幂等工具，真实工具需要相应接口或恢复方案。
- Kubernetes 清单演示单副本生命周期，内存版本不能靠增加副本获得共享状态。
- 参考实现包含答案，请先完成预测，再读源码，以独立变式证明掌握。
