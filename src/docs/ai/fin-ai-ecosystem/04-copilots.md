---
title: 多通道 Copilot
icon: /assets/icons/mq.svg
index: false
dir:
  order: 5
article: false
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
