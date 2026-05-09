---
title: MCP 工具生态
icon: /assets/icons/database.svg
index: false
dir:
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
