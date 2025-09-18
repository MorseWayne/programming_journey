---
title: 秒杀购物系统实现
icon: /assets/icons/article.svg
order: 1
category:
  - Project
date: 2025-09-17
sticky: true
star: true
---

## 项目概览

- **目标**：搭建一个支持秒杀（Spike）的后端购物系统，聚焦 Go 后端常见能力：API 设计、数据库交互、缓存、消息队列与高并发实战。
- **定位**：教学与练习项目，仅后端 API（可用 Postman/HTTPie/k6 进行验证与压测）。
- **技术栈**：Go、Gin、PostgreSQL、Redis、RabbitMQ、JWT、OpenTelemetry、Docker。
- **规模**：小型；建议 2-4 周完成（每天 1-2 小时）。

## 快速开始

1. 安装依赖：Go 1.22+、Docker、Docker Compose。

1. 启动基础设施（可作为 `docker-compose.yml` 模板）：

```yaml
version: '3.8'
services:
  postgres:
    image: postgres:15
    environment:
      POSTGRES_USER: spike
      POSTGRES_PASSWORD: spike
      POSTGRES_DB: spike
    ports:
      - "5432:5432"
  redis:
    image: redis:7
    ports:
      - "6379:6379"
  rabbitmq:
    image: rabbitmq:3-management
    ports:
      - "5672:5672"
      - "15672:15672"
```

1. 配置与运行：

```bash
cp .env.example .env
go run ./cmd/spike-api
```

1. 健康检查：

```bash
curl -s http://localhost:8080/healthz | jq
```

## 架构总览

- 分层架构（MVC-like）：API 层（Gin）→ 服务层（业务）→ 数据层（DB/Cache/MQ）。
- Sidecar/中间件：JWT、日志、错误处理、限流、观测性中间件。
- 秒杀链路异步化：Redis 预减库存 + MQ 异步落库，消费者保证幂等。

```text
[Client] -> [Gin Router] -> [JWT/RateLimit]
                         -> [Service Layer]
                         -> [Redis (Spike Cache)]
                         -> [RabbitMQ Producer]  -> [RabbitMQ] -> [Consumer Worker] -> [PostgreSQL]
```

## 模块与职责

- **用户**：注册、登录、JWT 发放与刷新、简单 RBAC。
- **商品**：商品 CRUD、库存查询、索引优化与缓存。
- **订单**：创建订单、支付模拟、事务保证、超时关闭。
- **秒杀**：活动管理、库存预减、限流排队、消息投递与幂等消费。
- **通用**：日志、错误码、配置加载、CORS、请求 ID、追踪。

## 数据建模（最小可用集）

- `users(id, email, password_hash, role)`
- `products(id, title, price, ... )`
- `inventory(product_id, stock)`
- `orders(id, user_id, status, total_amount, created_at)`
- `order_items(order_id, product_id, quantity, price)`
- `spike_events(id, product_id, start_at, end_at, spike_price)`
- `spike_orders(id, spike_event_id, user_id, order_id)`

关键约束与索引：

- 唯一：(`user_id`, `spike_event_id`) 保证同一活动不重复下单。
- 索引：`inventory.product_id`、`spike_events(product_id, start_at, end_at)`。
- 事务：下单与库存更新在同一事务；读多写少场景引入缓存。

## 核心流程（秒杀）

1. 请求命中限流，通过后进入秒杀接口。
2. Redis 使用 Lua 原子预减库存；库存不足直接返回售罄。
3. 预减成功：写入“用户-活动”去重标记，消息投递到 MQ。
4. 消费者从 MQ 拉取消息，开启 DB 事务创建订单并更新持久化库存。
5. 成功提交事务并记录流水；若失败则按策略回补库存并记录告警。
6. 若启用支付流程：延时队列 T+X 关闭未支付订单并回补库存。

## 秒杀设计要点

- 库存策略：Redis 预减 + 售罄标记；热点 Key 预热与合理 TTL；Lua 保证原子性。
- 幂等与去重：DB 唯一约束 + Redis 标记 + 幂等键（请求头）。
- 限流与降级：令牌桶或滑动窗口；必要时排队（漏桶）并返回排队态。
- MQ 可靠性：消息去重、重试退避、死信队列（DLX）；消费者幂等处理。
- 一致性：DB 事务 +（可选）Outbox 本地消息表，避免“写库成功但发消息失败”。

## 工程化与规范

- 配置：多环境（dev/staging/prod），环境变量优先，启动前校验必填项。
- 日志：结构化日志（zap/zerolog），请求 ID 与 trace 贯穿。脱敏与采样策略。
- 中间件：错误恢复、超时控制、限流、CORS、鉴权、指标与追踪挂载点。
- 目录结构建议：

```text
.
├─ cmd/spike-api              # 入口（main）
├─ internal/
│  ├─ api/                    # handler, router
│  ├─ service/                # 业务逻辑
│  ├─ repo/                   # db、cache、mq 访问
│  ├─ domain/                 # 实体、DTO
│  ├─ middleware/
│  └─ pkg/                    # 工具库
├─ configs/
├─ migrations/                # 数据库迁移
├─ scripts/
├─ deploy/
└─ docs/
```

## API 规范

- 版本与路径：统一前缀 `/api/v1`。
- 身份认证：`Authorization: Bearer <access_token>`，支持 Refresh 流程。
- 分页约定：`page`、`page_size`；排序 `sort=field,asc|desc`；过滤使用查询参数。
- 错误与响应包裹：

```json
{
  "code": 0,
  "message": "OK",
  "data": {"items": [], "page": 1, "page_size": 20, "total": 0}
}
```

## 质量与可观测

- 测试策略：
  - 单元：服务与仓储层的业务单元；边界与异常覆盖。
  - 集成：使用 testcontainers-go 启动 PG/Redis/RabbitMQ 验证端到端链路。
  - 基准/压测：`go test -bench`、`k6/hey/wrk`，关注 P95/P99 延迟与错误率。
- 指标：QPS、延迟、错误率、缓存命中率、队列积压、消费者重试数。
- 追踪：OpenTelemetry 覆盖 HTTP/MQ/DB；采样与上下文透传。

## 部署与交付

- 容器化：多阶段 Dockerfile；Compose 一键开发环境。
- CI/CD：lint/test/build 镜像；推送镜像与变更日志。
- （选做）K8s：部署清单、HPA、ConfigMap/Secret 管理。

## 学习里程碑

- 阶段 1：项目骨架/配置/日志/用户与认证。
- 阶段 2：商品与库存、迁移、数据库访问层（sqlc/GORM 二选一）。
- 阶段 3：缓存与统一错误处理、接口限流、错误码与响应规范。
- 阶段 4：接入 MQ，异步下单，消费者幂等与延时取消。
- 阶段 5：可观测性完善、压测优化、CI/CD 与部署实践。

## 附录：术语与约定

- 幂等：同一操作重复执行，最终结果一致（以资源状态为准）。
- 一致性：面向“写库/发消息”跨组件的最终一致保障（事务 + Outbox）。
- 售罄标记：缓存侧快速短路避免无意义请求打穿后端。
