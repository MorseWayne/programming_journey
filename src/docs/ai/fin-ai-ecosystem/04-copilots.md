---
title: 多通道 Copilot
icon: /assets/icons/mq.svg
order: 5
---

# 多通道 Copilot —— 随时随地的金融 AI

**一句话**：在微信、钉钉、Telegram、Slack 里直接 @AI 问股票——多通道、多市场的金融 AI 助手。

这类项目的特点是**轻量、多通道、即用**。它们不追求深度投研或自动交易，而是让你在任何聊天工具里都能快速获取市场信息和分析。

---

## 核心项目

### 1. FinClaw — 9 通道 × 14 LLM × 双市场

| | |
|:---|:---|
| **GitHub** | [Fin-Chelae/FinClaw](https://github.com/Fin-Chelae/FinClaw) |
| **Stars** | 新兴 |
| **技术栈** | Python, LiteLLM |
| **许可证** | MIT |

FinClaw 是通道覆盖最广的金融 AI Agent。它在被问"某只股票怎么样"时，会自动搜索数据、分析推理、给出答复——无论你从哪个平台发消息。

**通道覆盖**：

| 平台 | 场景 |
|------|------|
| Telegram | 个人/群组机器人 |
| Discord | 社区服务器 |
| Slack | 团队协作 |
| WhatsApp | 国际通讯 |
| 飞书 / 钉钉 | 国内企业协作 |
| QQ | 国内个人通讯 |
| Email | 异步查询 |
| CLI | 命令行 |

**数据能力**：
- **美股**（Yahoo Finance）：实时行情、基本面、分析师预测、内部交易
- **A 股**（AKShare）：行情、K 线、财报、板块排名
- **宏观**（FRED）：GDP、CPI、失业率、国债收益率
- **加密货币**（DexScreener + CoinGecko）
- **预测市场**（Polymarket + Kalshi）：事件概率、跨平台差异分析

**适合人群**：团队里有不同聊天习惯的人；需要中美双市场覆盖。

**上手难度**：需 Docker 部署 + 配置 LLM API key

---

### 2. Fortio — Ghostfolio 的 AI 伴侣

| | |
|:---|:---|
| **GitHub** | [meghamegs-lab/agentForge](https://github.com/meghamegs-lab/agentForge) |
| **Stars** | 新兴 |
| **技术栈** | Python, LangGraph, FastAPI |
| **许可证** | MIT |

Fortio 是专门为 [Ghostfolio](https://github.com/ghostfolio/ghostfolio)（开源财富管理平台）打造的 AI Agent。它连接你的持仓数据，让你可以用自然语言问：

> "我的组合最近表现怎么样？"
> "我有哪些股票需要止损了？"
> "按行业分类，我的风险敞口合理吗？"

**核心能力**：
- 16 个领域工具（组合总览、绩效、持仓明细、配置分析、市场数据）
- 5 阶段验证管道（免责声明 → 幻觉检测 → 数据时效 → 集中度检查 → 置信度评分）
- MCP Server 模式（可被 Claude Desktop / Cursor 直接调用）
- FIRE 目标追踪（财务自由计算器，基于实时 FRED 宏观数据）
- 370+ eval 测试
- CLI + REPL 交互模式

**适合人群**：已经在用 Ghostfolio 管理持仓的人。

**上手难度**：需部署 Ghostfolio + Fortio，中等

---

### 3. Ghostfolio AI Agent — 社区版本

| | |
|:---|:---|
| **GitHub** | [christensenca/ghostfolio-agent](https://github.com/christensenca/ghostfolio-agent) |
| **Stars** | 新兴 |
| **技术栈** | Python, LangGraph, OpenRouter |
| **许可证** | AGPL-3.0 |

另一个 Ghostfolio 的 AI Agent 实现，更轻量，专注于：
- 组合绩效查询
- 税务估算（已实现收益、资本利得、股息收入）
- 合规检查（持仓集中度、分散化程度）
- FastAPI Server 模式

---

## 部署架构

一个典型的多通道金融 Copilot 部署如下：

```
                    ┌─────────────────────────────────────────────┐
                    │              终端用户层                        │
                    │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ │
                    │  │Telegram│ │ 钉钉   │ │ Slack  │ │ Discord│ │
                    │  └────┬───┘ └────┬───┘ └────┬───┘ └────┬───┘ │
                    └───────┼──────────┼──────────┼──────────┼─────┘
                            │          │          │          │
                            ▼          ▼          ▼          ▼
                    ┌─────────────────────────────────────────────┐
                    │              通道适配层                        │
                    │  Webhook / Bot API / 消息队列统一接入          │
                    └─────────────────────┬───────────────────────┘
                                          │
                                          ▼
                    ┌─────────────────────────────────────────────┐
                    │              Copilot 核心层                    │
                    │  ┌─────────────────────────────────────┐    │
                    │  │  意图识别 → 工具路由 → 数据聚合        │    │
                    │  │  (LangGraph / LiteLLM / Function Call)│    │
                    │  └─────────────────┬───────────────────┘    │
                    └────────────────────┼─────────────────────────┘
                                         │
                    ┌────────────────────┼─────────────────────────┐
                    │                    ▼                         │
                    │  ┌─────────────────────────────────────┐    │
                    │  │           LLM 推理层                 │    │
                    │  │  GPT-4 / Claude / DeepSeek / 本地模型 │    │
                    │  └─────────────────┬───────────────────┘    │
                    │                    │                         │
                    └────────────────────┼─────────────────────────┘
                                         │
                    ┌────────────────────┼─────────────────────────┐
                    │                    ▼                         │
                    │  ┌─────────────┐ ┌──────────┐ ┌──────────┐  │
                    │  │Yahoo Finance│ │ AKShare  │ │  FRED    │  │
                    │  └─────────────┘ └──────────┘ └──────────┘  │
                    │  ┌─────────────┐ ┌──────────┐ ┌──────────┐  │
                    │  │ CoinGecko   │ │Ghostfolio│ │ 本地DB   │  │
                    │  └─────────────┘ └──────────┘ └──────────┘  │
                    │              数据源与持久化层                  │
                    └─────────────────────────────────────────────┘
```

在这个架构中，**通道适配层**负责把不同平台的消息格式统一成内部标准事件；**Copilot 核心层**处理意图识别、工具选择和数据聚合；**LLM 推理层**生成最终回复。各层之间通过 HTTP API 或消息队列通信，便于独立扩展。

---

## 快速开始

### FinClaw 部署示例

FinClaw 提供了开箱即用的 Docker Compose 配置。以下是一个最小可运行的示例：

```yaml
version: "3.8"
services:
  finclaw:
    image: finchelae/finclaw:latest
    container_name: finclaw
    ports:
      - "8000:8000"
    environment:
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN}
      - DISCORD_BOT_TOKEN=${DISCORD_BOT_TOKEN}
      - SLACK_BOT_TOKEN=${SLACK_BOT_TOKEN}
      - DINGTALK_APP_KEY=${DINGTALK_APP_KEY}
      - DINGTALK_APP_SECRET=${DINGTALK_APP_SECRET}
      - LARK_APP_ID=${LARK_APP_ID}
      - LARK_APP_SECRET=${LARK_APP_SECRET}
      - ENABLE_A_SHARE=true
      - ENABLE_US_STOCK=true
      - ENABLE_CRYPTO=true
    volumes:
      - ./data:/app/data
    restart: unless-stopped
```

部署步骤：

1. 复制上述配置到 `docker-compose.yml`
2. 在项目根目录创建 `.env` 文件，填入至少一个 LLM API key 和一个通道 Token
3. 执行 `docker compose up -d`
4. 在对应平台（如 Telegram @BotFather）配置 Webhook 指向 `http://你的服务器:8000/webhook/telegram`

FinClaw 使用 LiteLLM 做底层模型路由，所以 `OPENAI_API_KEY` 字段可以替换为任意兼容 OpenAI API 格式的服务商 key。如果你需要接入 Claude 或 DeepSeek，只需修改 `LLM_PROVIDER` 和对应 key 即可。

### Fortio 与 Ghostfolio 集成

Fortio 依赖 Ghostfolio 的 API 获取持仓数据。以下是一个本地开发环境的集成配置：

```python
# config.py
GHOSTFOLIO_URL = "http://localhost:3333"
GHOSTFOLIO_ACCESS_TOKEN = "your-ghostfolio-access-token"

# Fortio 通过 Ghostfolio API 获取原始数据，
# 再用 LangGraph 编排分析流程
FORTIO_LLM_MODEL = "gpt-4o"
FORTIO_ENABLE_MCP = True  # 开启 MCP Server 模式
FORTIO_MCP_PORT = 8080
```

```bash
# 1. 先启动 Ghostfolio（参考 Ghostfolio 官方 Docker 部署文档）
docker compose -f ghostfolio/docker-compose.yml up -d

# 2. 在 Ghostfolio 设置中生成 Access Token

# 3. 克隆并配置 Fortio
git clone https://github.com/meghamegs-lab/agentForge.git
cd agentForge
cp .env.example .env
# 编辑 .env，填入 GHOSTFOLIO_URL 和 GHOSTFOLIO_ACCESS_TOKEN

# 4. 安装依赖并启动
pip install -r requirements.txt
python -m fortio.server
```

启动后，你可以通过以下方式交互：

- **CLI 模式**：`python -m fortio.cli`，直接输入自然语言查询
- **REPL 模式**：`python -m fortio.repl`，支持对话历史
- **MCP 模式**：在 Claude Desktop 配置中填入 `http://localhost:8080/sse`，即可直接调用 Fortio 工具

如果你已经在使用 Ghostfolio 追踪投资组合，整个集成过程大约需要 15 分钟。

---

## 多通道架构

让同一个 AI Agent 同时服务 Telegram、钉钉、Slack 等平台，核心挑战在于**消息格式差异**和**状态隔离**。

### 消息格式统一

不同平台的回调格式各不相同。FinClaw 的做法是在通道适配层引入一个统一的事件模型：

```
平台原始消息 → 适配器解析 → 标准化 Event（user_id, channel, text, timestamp）→ 业务处理
```

例如，Telegram 的消息体是 `{"message": {"chat": {"id": xxx}, "text": "..."}}`，而钉钉的是 `{"senderStaffId": "xxx", "text": {"content": "..."}}`。适配器只负责提取关键字段，业务逻辑完全无感。

### 用户状态隔离

金融查询往往涉及多轮对话。比如用户先问"贵州茅台的 PE 是多少"，接着追问"那五粮液呢"。Copilot 需要在对话历史中维护上下文。

多通道场景下的状态管理有两种常见策略：

| 策略 | 实现方式 | 优点 | 缺点 |
|------|---------|------|------|
| 单通道隔离 | 每个平台的 `user_id` 独立维护对话历史 | 实现简单，无跨平台干扰 | 同一用户在不同平台体验不连续 |
| 全局统一 | 通过手机号/邮箱绑定统一用户 ID | 跨平台体验一致 | 需要额外的用户绑定流程 |

FinClaw 默认采用**单通道隔离**，因为金融场景下用户往往把不同平台用于不同目的（Telegram 用于个人查询，钉钉用于团队共享），强制统一反而可能造成隐私混淆。

### 限流与队列

当机器人在大群中被多人同时 @ 时，容易出现请求洪峰。生产环境建议：

- 在每个适配器前加令牌桶限流（单用户每秒 1 次，全群每秒 5 次）
- 对耗时操作（如深度财报分析）引入异步任务队列（Celery / RQ）
- 对 LLM 调用做并发控制，避免 API rate limit

---

## 安全考量

把金融 AI Agent 部署到公共聊天平台，安全是不可回避的话题。

### API Key 管理

FinClaw 和 Fortio 都需要多个 API key：LLM 服务商、金融数据商、聊天平台 Bot Token。

**最佳实践**：

- **绝不把 key 提交到代码仓库**。使用 `.env` 文件或 Docker Secrets 注入
- **按环境分离 key**。生产环境的 Telegram Bot Token 和测试环境分开
- **定期轮换**。尤其是具有支付权限或群管理权限的 Bot Token
- **最小权限原则**。Telegram Bot 只开 `read message` 和 `send message`，关闭 `admin` 权限

如果你需要服务多个用户（比如一个 SaaS 化的 Copilot），不要把所有用户的请求都用同一个 LLM key 转发。应该在后端为每个用户维护独立的 key 池，或使用支持多租户的路由层。

### Rate Limiting

LLM API 按 token 计费，金融数据 API（如 Yahoo Finance）也有调用上限。多用户场景下必须做限流：

| 层级 | 限制对象 | 典型阈值 |
|------|---------|---------|
| 用户层 | 单个 user_id | 每小时 30 次查询 |
| 群组层 | 单个 group_id | 每小时 100 次查询 |
| 全局层 | 整个实例 | 每小时 1000 次 LLM 调用 |

超出限流时，机器人应友好提示："当前查询过多，请稍后再试"，而不是直接报错或静默失败。

### Prompt 注入风险

金融 Copilot 的特殊之处在于，它往往被赋予**工具调用能力**（查询行情、计算指标）。如果攻击者通过精心构造的 prompt 诱导 Agent 执行非预期操作（比如把持仓数据发送到外部服务器），后果比普通聊天机器人更严重。

**缓解措施**：

1. **输入过滤**：对消息做关键词过滤，拦截明显的注入模式（如"忽略之前的指令"）
2. **工具白名单**：明确列出 Agent 可调用的工具，禁止动态加载新工具
3. **输出审核**：对包含持仓、账户信息的回复做敏感数据脱敏
4. **权限分层**：查询类工具（看行情）对所有用户开放，操作类工具（修改配置）只对管理员开放

Fortio 在这方面做了较好的示范：它的 5 阶段验证管道中，第二阶段就是**幻觉检测**，第三阶段验证**数据时效**，这在一定程度上也能拦截基于过时或伪造数据的注入攻击。

---

## 实时数据推送

股票价格是实时变化的。当用户在群里问"特斯拉现在多少钱"，Copilot 返回的数据如果延迟几分钟，体验会大打折扣。

### 架构选型：WebSocket vs 轮询

| 维度 | WebSocket 推送 | HTTP 轮询 |
|------|---------------|----------|
| 实时性 | 毫秒级 | 秒级到分钟级（取决于间隔）|
| 资源消耗 | 连接数多，服务端压力大 | 请求离散，易于水平扩展 |
| 实现复杂度 | 需要维护长连接和心跳 | 简单，定时发请求即可 |
| 适用场景 | 高频行情、交易提醒 | 低频查询、异步分析 |
| 与 LLM 配合 | 推送数据可作为上下文触发 Agent 推理 | 每次轮询都是一次独立请求 |

**实际选择**：

- **FinClaw** 采用**按需轮询**。用户查询时才触发 Yahoo Finance / AKShare 请求，不做后台持续拉取。这是因为聊天场景下用户提问频率远低于行情刷新频率，持续推送会造成大量无效数据。
- **Fortio** 采用**缓存 + 懒加载**。Ghostfolio 本身有定时同步机制，Fortio 直接读取 Ghostfolio 的本地缓存数据，只有在用户明确要求"最新市场价"时才穿透到外部 API。

### 推送场景的最佳实践

如果你确实需要主动推送（比如股价突破止损线时自动发消息到 Telegram），建议：

1. **独立行情服务**：用一个单独的进程维护 WebSocket 连接到交易所行情网关，把价格变动写入 Redis Pub/Sub
2. **规则引擎订阅**：Copilot 订阅 Redis 频道，当某只股票触发用户预设条件时，调用 Bot API 发消息
3. **削峰处理**：开盘和收盘时价格波动剧烈，消息推送要做聚合（比如 5 秒内同一股票的多次触发合并为一条消息）

不要把行情 WebSocket 和 LLM 推理放在同一个进程里。行情连接要求低延迟、高稳定，LLM 推理则是 CPU/GPU 密集型、响应慢，两者资源模型完全不同。

---

## Fortio 与 ghostfolio-agent 深度对比

两者都是 Ghostfolio 的 AI Agent，但设计哲学和实现路径差异明显。

### 架构差异

| 维度 | Fortio | ghostfolio-agent |
|------|--------|------------------|
| 工作流引擎 | LangGraph（状态机 + 条件分支） | LangGraph（更简单的线性链） |
| 工具数量 | 16 个领域工具 | 6 个核心工具 |
| 验证管道 | 5 阶段（免责声明 → 幻觉检测 → 数据时效 → 集中度检查 → 置信度评分） | 2 阶段（输入校验 → 输出格式化） |
| 交互模式 | CLI + REPL + MCP Server + API | FastAPI Server + 简单 CLI |
| 测试覆盖 | 370+ eval 测试 | 基础功能测试 |
| 部署方式 | Python 环境 + Ghostfolio | Python 环境 + Ghostfolio |

Fortio 的架构更像一个**生产级金融助手**：它有明确的验证管道，每一步都有回退机制。例如，如果幻觉检测发现 LLM 引用了不存在的持仓数据，流程会自动重试或降级到"基于公开市场的通用分析"。

ghostfolio-agent 的架构更偏向**快速原型**：6 个工具覆盖最常用的查询场景，代码量少，易于二次开发。

### 功能对比

| 功能 | Fortio | ghostfolio-agent |
|------|--------|------------------|
| 组合总览 | 支持，带行业分布图 | 支持，纯文本 |
| 绩效归因 | 支持，可对比基准指数 | 基础收益率计算 |
| 税务估算 | 部分支持（依赖 Ghostfolio 数据） | 完整支持（已实现收益、资本利得、股息） |
| 合规检查 | 集中度 + 分散化 + 波动率 | 集中度 + 分散化 |
| FIRE 计算 | 支持，基于实时宏观数据 | 不支持 |
| MCP 协议 | 原生支持 | 不支持 |
| 多语言回复 | 支持 | 英文为主 |

如果你追求**稳健和全面**，Fortio 是更好的选择。它的 5 阶段验证和大量 eval 测试意味着你在生产环境遇到的边缘情况会更少。

如果你追求**轻量和可定制**，ghostfolio-agent 的代码结构更简单，添加新工具或修改提示词的成本更低。它的 AGPL-3.0 许可证也适合愿意开源衍生项目的开发者。

### 成熟度与社区

截至 2026 年初，两个项目都处于早期阶段。Fortio 的更新频率更高，作者对 issue 的响应速度较快，且文档中提供了详细的本地开发指南。ghostfolio-agent 的社区相对小一些，但它的 FastAPI 设计使得前后端分离的二次开发更容易。

**选择建议**：

- 个人使用，希望"开箱即用" → Fortio
- 需要把 Ghostfolio AI 能力集成到自己的前端 → ghostfolio-agent（FastAPI 更标准）
- 想基于 Ghostfolio 做深度定制，比如添加自己的分析模型 → ghostfolio-agent（代码更简单，改起来快）

---

## 选型建议

```
你的场景？
│
├─ 团队分散在不同聊天平台（有人用微信有人用 Slack）
│   └─ → FinClaw（9 通道覆盖）
│
├─ 已经在用 Ghostfolio 管理持仓
│   └─ 需要深度分析 → Fortio（5 阶段验证 + FIRE）
│   └─ 需要简单查询 → ghostfolio-agent（轻量）
│
└─ 想给 Discord/Telegram 社区加个股票机器人
    └─ → FinClaw（开箱即用的多通道支持）
```

---

## 延伸阅读

- 想从零搭建自己的 Copilot？需要先了解数据接入 → [05 MCP 工具生态](./05-mcp-tools.md)
- 想了解 Ghostfolio 的更多细节 → [01 金融终端](./01-terminals.md)
