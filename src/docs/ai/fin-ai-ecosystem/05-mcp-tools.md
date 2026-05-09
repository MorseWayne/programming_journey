---
title: MCP 工具生态
icon: /assets/icons/database.svg
order: 6
---

# MCP 金融工具生态 —— Agent 的数据基础设施

**一句话**：Model Context Protocol（MCP）正在成为 AI Agent 连接金融数据的标准协议。这一章介绍最好的开源金融 MCP Server。

如果你在前面章节看到的任何一个 Agent 让你心动，但你想让它接入更多数据源——这一章就是给你的。

---

## 什么是 MCP？为什么重要？

MCP（Model Context Protocol）是 Anthropic 提出的开放协议，定义了 AI Agent 如何安全、标准化地调用外部工具和数据。

在金融 AI 领域，这意味着：

```
以前：每个 Agent 项目都要自己对接 yfinance / Alpha Vantage / 券商 API
现在：安装一个 MCP Server → Agent 自动获得所有金融数据能力
```

---

## MCP 协议内幕

MCP 底层基于 JSON-RPC 2.0，整个交互生命周期非常清晰。理解这个流程，对排查连接问题或自己写 Server 都有帮助。

### JSON-RPC 消息格式

每一条消息都是一个标准的 JSON-RPC 对象：

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "get_stock_price",
    "arguments": { "symbol": "AAPL" }
  }
}
```

Server 返回的结果也是 JSON-RPC 格式：

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [{ "type": "text", "text": "178.35" }]
  }
}
```

### 完整交互流程

Client（Claude Desktop / Cursor）和 MCP Server 之间会经历四个阶段：

```
Client                              MCP Server
  |                                     |
  | --- 1. initialize ----------------> |
  |     {protocolVersion, capabilities} |
  |                                     |
  | <--- 2. initialize result --------- |
  |     {serverInfo, capabilities}      |
  |                                     |
  | --- 3. initialized notification -> |
  |     (握手完成，通道就绪)              |
  |                                     |
  | --- 4. tools/list ----------------> |
  |     (Client 请求可用工具列表)        |
  |                                     |
  | <--- 5. tools/list result --------- |
  |     [{name, description, inputSchema}, ...]
  |                                     |
  | --- 6. tools/call ----------------> |
  |     {name: "get_stock_price",       |
  |      arguments: {symbol: "AAPL"}}   |
  |                                     |
  | <--- 7. tools/call result --------- |
  |     {content: [...], isError: false}
  |                                     |
```

**关键点**：

- **initialize 是双向能力协商**。Client 和 Server 各自声明支持哪些特性（如是否支持进度通知、是否支持资源订阅）。如果协议版本不匹配，连接会在第一步就失败。
- **tools/list 是发现机制**。Server 不会硬编码工具列表，而是动态暴露。这意味着同一个 Server 在不同配置下（比如启用了不同的 toolset）可以返回不同的工具集。
- **tools/call 是无状态调用**。每次调用都是独立的 JSON-RPC 请求，Server 不保存会话状态。这简化了水平扩展，但也意味着需要缓存时要在 Server 内部实现。
- **错误处理通过 JSON-RPC error 对象或 isError 字段**。协议层面的错误（如方法不存在）用 error 对象；业务层面的错误（如 API 限流）通常在 result 里设置 `isError: true`。

### 为什么基于 JSON-RPC？

JSON-RPC 足够简单（比 gRPC 轻量），又足够标准化（比自定义 HTTP API 更统一）。MCP 目前支持两种传输层：

- **stdio**：Server 作为子进程启动，通过标准输入输出通信。这是 Claude Desktop 的默认方式，配置最简单。
- **SSE（Server-Sent Events） over HTTP**：适合远程部署或需要多客户端共享同一个 Server 的场景。

金融数据 MCP Server 目前几乎都是 stdio 模式，因为每个用户有自己的 API Key，本地隔离最安全。

---

## 核心项目

### 1. Financial Datasets MCP Server

| | |
|:---|:---|
| **GitHub** | [financial-datasets/mcp-server](https://github.com/financial-datasets/mcp-server) |
| **Stars** | 2K+ |
| **技术栈** | Python |
| **许可证** | MIT |

目前最流行的金融数据 MCP Server，被 Dexter 等项目直接使用。

**提供的工具**：
- 利润表、资产负债表、现金流表查询
- 股票/加密货币实时价格
- 公司新闻搜索
- 历史财务数据

**优势**：数据质量高（来自专业的 Financial Datasets API）、API 设计简洁。
**劣势**：依赖 Financial Datasets API（需要付费 key，有免费额度）。

---

### 2. FMP MCP Server（Financial Modeling Prep）

| | |
|:---|:---|
| **GitHub** | [imbenrabi/Financial-Modeling-Prep-MCP-Server](https://github.com/imbenrabi/Financial-Modeling-Prep-MCP-Server) |
| **Stars** | 128 |
| **技术栈** | TypeScript |
| **许可证** | Apache-2.0 |

**工具数量最多**的金融 MCP Server——**253+ 个工具**，覆盖 24 个类别。

**提供的工具类别**：
- 实时行情（股票/外汇/加密货币）
- 基本面数据（财务报表、估值比率、关键指标）
- 另类数据（内部交易、国会交易、卖空数据）
- 宏观指标（CPI、GDP、PPI、国债收益率）
- 盈利电话会议记录
- 分析师预测
- ETF 持仓、商品数据

**动态工具加载**：通过 5 个元工具（`enable_toolset` / `disable_toolset` 等）按需加载，避免一次性暴露 253 个工具导致上下文爆满。

---

### 3. Yahoo Finance MCP (yfnhanced)

| | |
|:---|:---|
| **GitHub** | [kanishka-namdeo/yfnhanced-mcp](https://github.com/kanishka-namdeo/yfnhanced-mcp) |
| **技术栈** | TypeScript |
| **类型** | MCP Server |

基于 yfinance 但做了**生产级加固**的 MCP Server。

**加固特性**：
- **断路器**：API 连续失败时自动熔断
- **多策略限流**：避免被 Yahoo 封 IP
- **数据质量评分**：标注数据完整度
- **多层缓存**：减少重复请求

**提供的工具**：行情、历史价格、财务报表、盈利数据、分析师评级、期权链、新闻、筛选器

**优势**：免费（底层是 Yahoo Finance），有生产级的可靠性处理。
**劣势**：Yahoo Finance 数据覆盖面有限（如不支持某些国际市场）。

---

### 4. FinMCP — 多市场统一 MCP 生态

| | |
|:---|:---|
| **GitHub** | [Finance-LLMs/FinMCP](https://github.com/Finance-LLMs/FinMCP) |
| **技术栈** | Python + Node.js |
| **许可证** | MIT |

试图做"金融 MCP 的一站式商店"。

**差异化能力**：
- **深度研究引擎**：网页抓取 + 内容合成（类似 Dexter 的研究能力，但作为 MCP 工具提供）
- **双市场覆盖**：印度 NSE/BSE + 全球 Yahoo Finance
- **券商集成**：Upstox 交易平台对接
- **金融 AI 训练管线**：针对金融文档分析的专用模型训练工具

---

## 数据质量对比

四个 MCP Server 在数据维度上的差异非常显著，直接决定了它们适合什么场景：

| 维度 | Financial Datasets | FMP | yfnhanced | FinMCP |
|:---|:---|:---|:---|:---|
| **数据新鲜度** | 实时（API 直连） | 实时（API 直连） | 分钟级延迟（Yahoo 缓存） | 混合（Yahoo + 抓取） |
| **覆盖广度** | 美股财报 + 加密 | 253+ 工具 / 全球多市场 | 全球主要市场 | 印度市场 + 全球 |
| **数据准确性** | 高（专业数据商） | 高（专业数据商） | 中（偶有延迟修正） | 中（依赖抓取源） |
| **历史深度** | 20+ 年财报 | 20+ 年 + 宏观历史 | 依赖 Yahoo | 有限 |
| **另类数据** | 无 | 有（国会交易、内部交易） | 无 | 无 |
| **Rate Limit** | 500-2000 req/min | 300 req/min（免费） | 依赖 Yahoo（约 2000 req/hr） | 未明确 |
| **成本** | 免费额度 + 付费 | 免费额度 + 付费 | 完全免费 | 免费 |
| **数据合规性** | 合规（授权数据） | 合规（授权数据） | 灰色（Yahoo ToS） | 灰色（抓取） |

### 怎么理解这张表？

- **做量化回测**：Financial Datasets 或 FMP。Yahoo Finance 的历史数据偶有拆分/分红调整后复权错误，回测结果可能失真。
- **做实时盯盘**：FMP 或 Financial Datasets。yfnhanced 的分钟级延迟对高频场景不够。
- **做另类策略（如跟踪内部交易）**：只有 FMP 提供这类数据。
- **预算为零的个人投资者**：yfnhanced 是最务实的选择，但要接受数据质量波动。
- **印度市场**：FinMCP 几乎是唯一选择，它的 NSE/BSE 数据来自本地券商接口。

---

## 性能与限流

金融数据 API 的限流是生产环境的头号敌人。四个 MCP Server 的应对策略差异很大。

### 各 Server 的限流现状

| Server | 限流机制 | 超限后果 | 内置保护 |
|:---|:---|:---|:---|
| Financial Datasets | API Key 级别限流 | 返回 429，需等待 | 无（依赖上游） |
| FMP | 按套餐限流（免费 300/min） | 返回 429 或计费 | 无（依赖上游） |
| yfnhanced | Yahoo IP 级限流（约 2000/hr） | 被封 IP | **断路器 + 限流 + 缓存** |
| FinMCP | 未明确 | 未明确 | 无 |

### 自建 MCP Server 时的最佳实践

如果你基于这些 Server 做二次开发，或者写自己的金融 MCP Server，建议实现以下三层保护：

**1. 客户端缓存（Client-Side Cache）**

股价数据在秒级内不会剧烈变化。对 `get_stock_price` 这类工具，内存缓存 30 秒到 1 分钟可以大幅减少 API 调用：

```python
from functools import lru_cache
import time

# 简单的 TTL 缓存示例
_cache = {}
_cache_ttl = {}

def get_cached_price(symbol: str) -> float:
    now = time.time()
    if symbol in _cache and now - _cache_ttl[symbol] < 60:
        return _cache[symbol]
    price = fetch_from_api(symbol)
    _cache[symbol] = price
    _cache_ttl[symbol] = now
    return price
```

**2. 断路器（Circuit Breaker）**

当上游 API 连续失败（比如 Yahoo 服务维护），继续重试只会浪费配额并拉长响应时间。断路器模式在失败达到阈值后自动"熔断"，直接返回错误：

```
状态转换：
CLOSED（正常） --连续失败 5 次--> OPEN（熔断）
OPEN --等待 30 秒--> HALF_OPEN（试探）
HALF_OPEN --成功 2 次--> CLOSED
HALF_OPEN --失败 1 次--> OPEN
```

yfnhanced 内置了这个逻辑，这也是它比原始 yfinance 更适合生产的原因。

**3. 指数退避重试（Exponential Backoff）**

遇到 429（Too Many Requests）或 503（Service Unavailable）时，不要立即重试。等待时间按指数增长：1s → 2s → 4s → 8s，并加入随机抖动（jitter）避免惊群效应：

```python
import random
import time

for attempt in range(max_retries):
    try:
        return call_api()
    except RateLimitError:
        sleep = (2 ** attempt) + random.uniform(0, 1)
        time.sleep(sleep)
```

### 性能调优 checklist

- [ ] 对静态数据（如财报历史）设置 1 小时以上的缓存 TTL
- [ ] 对实时行情设置 30-60 秒缓存 TTL
- [ ] 监控 429 错误率，超过 5% 时触发告警
- [ ] 为每个 API Key 维护独立的配额计数器
- [ ] 在 Server 启动时预加载热门股票列表，减少冷启动延迟

---

## 组合使用 MCP Server

实际生产环境中，**单一 MCP Server 往往不够**。你可能需要 FMP 的另类数据 + Financial Datasets 的财报质量 + yfnhanced 的免费实时行情。

好消息是：Claude Desktop、Cursor 和其他 MCP Client 都支持同时挂载多个 Server。Agent 会在每次调用时自动选择最合适的工具。

### 多 Server 配置示例

当多个 Server 提供了同名工具时（比如都有 `get_stock_price`），Client 通常会把所有工具暴露给 LLM，由 LLM 根据工具描述决定调用哪一个。你也可以通过命名空间区分：

```json
// claude_desktop_config.json
{
  "mcpServers": {
    "financial-datasets": {
      "command": "uvx",
      "args": ["financial-datasets-mcp"],
      "env": {
        "FINANCIAL_DATASETS_API_KEY": "your-key"
      }
    },
    "fmp": {
      "command": "npx",
      "args": ["-y", "@imbenrabi/fmp-mcp-server"],
      "env": {
        "FMP_API_KEY": "your-fmp-key"
      }
    },
    "yfinance": {
      "command": "npx",
      "args": ["-y", "yfnhanced-mcp"]
    }
  }
}
```

### Cursor 中的配置

Cursor 在 `Cursor Settings → MCP` 页面支持添加多个 Server。和 Claude Desktop 的区别是：

- Cursor 目前只支持 stdio 模式
- 每个 Server 需要独立配置环境变量
- 工具列表会在 Composer 中自动展开

### 组合策略建议

| 场景 | 推荐组合 | 原因 |
|:---|:---|:---|
| 美股深度研究 | Financial Datasets + FMP | 财报质量 + 另类数据互补 |
| 个人投资组合跟踪 | yfnhanced + FMP（免费层） | 免费行情 + 基础财务数据 |
| 多市场扫描 | FinMCP + FMP | 印度/全球覆盖 + 宏观指标 |
| 量化策略开发 | Financial Datasets + yfnhanced | 高质量历史 + 免费实时验证 |

**注意**：组合使用时要注意 API 配额叠加。如果三个 Server 同时被触发，一次用户请求可能消耗 3 倍配额。

---

## 构建自定义 MCP Server

理解了协议原理后，写一个自己的金融 MCP Server 并不复杂。以下是一个最小可用的示例，使用 Python 官方 `mcp` SDK，暴露一个查询股票实时价格的工具。

### 环境准备

```bash
pip install mcp yfinance
```

### 完整代码（`stock_mcp_server.py`）

```python
import yfinance as yf
from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import TextContent, Tool

app = Server("stock-price-server")

@app.list_tools()
async def list_tools() -> list[Tool]:
    return [
        Tool(
            name="get_stock_price",
            description="获取指定股票的最新实时价格",
            inputSchema={
                "type": "object",
                "properties": {
                    "symbol": {
                        "type": "string",
                        "description": "股票代码，例如 AAPL、TSLA、0700.HK"
                    }
                },
                "required": ["symbol"]
            }
        )
    ]

@app.call_tool()
async def call_tool(name: str, arguments: dict) -> list[TextContent]:
    if name == "get_stock_price":
        symbol = arguments["symbol"]
        ticker = yf.Ticker(symbol)
        info = ticker.info
        price = info.get("currentPrice") or info.get("regularMarketPrice")

        if price is None:
            return [TextContent(type="text", text=f"无法获取 {symbol} 的价格")]

        return [TextContent(
            type="text",
            text=f"{symbol} 最新价格: ${price:.2f} ({info.get('currency', 'USD')})"
        )]

    raise ValueError(f"未知工具: {name}")

async def main():
    async with stdio_server() as (read_stream, write_stream):
        await app.run(
            read_stream,
            write_stream,
            app.create_initialization_options()
        )

if __name__ == "__main__":
    import asyncio
    asyncio.run(main())
```

### 配置到 Claude Desktop

```json
{
  "mcpServers": {
    "my-stock-server": {
      "command": "python",
      "args": ["/path/to/stock_mcp_server.py"]
    }
  }
}
```

### 代码要点解析

1. **`Server` 实例**：每个 MCP Server 需要一个名字（`stock-price-server`），Client 日志里会显示这个名字。
2. **`list_tools`**：必须实现。返回的工具列表决定了 LLM "知道"你能做什么。`description` 和 `inputSchema` 写得越清楚，LLM 调用越准确。
3. **`call_tool`**：实际执行业务逻辑的地方。这里做了简单的参数校验和错误处理。
4. **`stdio_server`**：创建标准输入输出流，这是和 Claude Desktop / Cursor 通信的通道。
5. **错误处理**：如果工具执行失败，返回 `isError=True` 或抛出异常都可以。建议对网络错误做封装，给 LLM 一个可理解的错误信息。

### 扩展思路

从这个最小示例出发，你可以：

- 接入专业数据 API（如 Financial Datasets、FMP）替代 yfinance
- 添加缓存层（用 `functools.lru_cache` 或 Redis）
- 实现断路器（用 `pybreaker` 库）
- 暴露多个工具：财务报表查询、技术指标计算、新闻搜索
- 用 SSE 传输部署为远程服务，供团队共享

---

## 选型建议

```
你的数据需求？
│
├─ 只需要高质量美股财报数据，预算充足
│   └─ → Financial Datasets MCP（最流行，Dexter 同款）
│
├─ 需要最全的数据覆盖（253+ 工具）
│   └─ → FMP MCP Server（最丰富的工具集）
│
├─ 想要免费的，能接受数据质量有些波动
│   └─ → yfnhanced MCP（Yahoo Finance + 生产加固）
│
├─ 需要非美股市场（印度、A股等）
│   └─ → FinMCP（多市场统一接口）
│
└─ 想把多个 MCP Server 组合起来用
    └─ → Claude Desktop / Cursor 支持同时挂载多个 MCP Server
```

---

## 选型决策矩阵

如果上面的决策树还不够，这里是一个更细粒度的评分矩阵。满分 5 星，按你的优先级加权：

| 维度 | 权重建议 | Financial Datasets | FMP | yfnhanced | FinMCP |
|:---|:---|:---:|:---:|:---:|:---:|
| **数据质量** | 高 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ |
| **覆盖广度** | 高 | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ |
| **成本** | 中 | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **维护负担** | 中 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ |
| **社区支持** | 中 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ |
| **生产可靠性** | 高 | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| **协议合规** | 低 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ |
| **上手难度** | 低 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |

### 评分说明

- **数据质量**：基于数据源权威性。Financial Datasets 和 FMP 都对接专业数据商；yfnhanced 和 FinMCP 依赖免费/抓取来源。
- **维护负担**：指你需要花多少精力保持它运行。yfnhanced 内置了断路器和缓存，反而比裸用 Yahoo Finance 更省心；FinMCP 生态较复杂，需要更多配置。
- **社区支持**：GitHub Stars、Issue 响应速度、文档完整度。Financial Datasets 生态最活跃。
- **生产可靠性**：yfnhanced 得分最高是因为它专门做了限流、缓存、断路器处理。其他 Server 主要依赖上游 API 的稳定性。
- **协议合规**：指数据来源的合法性。Yahoo Finance 的 API 使用条款存在争议；FinMCP 的网页抓取也要注意 robots.txt 限制。
- **上手难度**：配置步骤和文档清晰度。yfnhanced 和 Financial Datasets 基本是一行命令启动。

### 快速选型公式

如果你还是难以决定，可以用这个简单公式：

```
总分 = 数据质量×2 + 覆盖广度×1.5 + 成本×1 + 生产可靠性×2
```

按这个权重（假设你对数据质量和可靠性最敏感）：
- **Financial Datasets**：5×2 + 3×1.5 + 3×1 + 4×2 = 23.5
- **FMP**：5×2 + 5×1.5 + 3×1 + 4×2 = 26.5
- **yfnhanced**：3×2 + 4×1.5 + 5×1 + 5×2 = 24
- **FinMCP**：3×2 + 3×1.5 + 5×1 + 3×2 = 19.5

在这个假设下，**FMP 综合得分最高**。但如果你的权重不同（比如成本优先），结果会完全相反。关键是明确自己的优先级。

---

## 如何使用（以 Claude Desktop 为例）

```json
// claude_desktop_config.json
{
  "mcpServers": {
    "financial-datasets": {
      "command": "uvx",
      "args": ["financial-datasets-mcp"],
      "env": {
        "FINANCIAL_DATASETS_API_KEY": "your-key"
      }
    },
    "yfinance": {
      "command": "npx",
      "args": ["-y", "yfnhanced-mcp"]
    }
  }
}
```

配置好后，Claude Desktop 就能直接查询美股财报和实时行情了。

---

## 延伸阅读

- 想了解具体 Agent 如何使用这些数据？→ [02 AI 研究 Agent](./02-research-agents.md)
- 想自己做技术选型？→ [06 全局对比](./06-comparison.md)
