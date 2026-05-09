---
title: 多智能体交易
icon: /assets/icons/project.svg
index: false
dir:
  order: 4
---

# 多智能体交易 —— 让 AI 协作做交易决策

**一句话**：模拟真实交易公司的协作模式——分析师搜集情报、研究员展开辩论、交易员制定计划、风控团队评估风险、管理层做出最终决策。

这是最接近你已了解的 **TradingAgents** 的类别。本节先做项目横向对比，再用 **[TradingAgents 深度剖析](./tradingagents/README.md)** 详细拆解其内部实现。

---

## 核心对比

| 维度 | [TradingAgents](https://github.com/TauricResearch/TradingAgents) | [AI Hedge Fund](https://github.com/virattt/ai-hedge-fund) | [Swarm Trader](https://github.com/zhound420/swarm-trader) | [OpenAlice](https://github.com/TraderAlice/OpenAlice) |
|------|:---:|:---:|:---:|:---:|
| **Stars** | 71K | 42K | ~300 | 4K |
| **Agent 数量** | 7+ | 18 | **20** | 6+（可扩展） |
| **LLM 框架** | LangGraph | 自研 | 直接调用 | Agent SDK |
| **语言** | Python | Python+TS | Python | TypeScript |
| **真实交易** | ❌ 仅模拟 | ⚠️ 部分 | ✅ Alpaca | ✅ Alpaca/IBKR/CCXT |
| **辩论机制** | ✅ 牛熊辩论 | ✅ | ❌ | ❌ |
| **风控机制** | 3 方风控辩论 | ✅ | **代码强制硬止损** | Guard Pipeline |
| **资产类别** | 美股 | 美股 | 美股 | 多资产（股票/加密/外汇/大宗） |
| **数据源** | yfinance | 多源 | **SEC EDGAR+yfinance（免费）** | OpenBB 引擎 |
| **更适合** | 学术研究 | 快速实战 | 个人实盘 | 全生命周期管理 |

---

## 项目简介

### TradingAgents — 学术标杆（已深度剖析）

TradingAgents 是这轮多智能体金融交易浪潮的**开创者**。它的核心价值在于提出了"模拟交易公司"的架构范式：

```
分析师团队（4人）→ 研究员辩论（牛vs熊）→ 交易员制定方案 → 风控团队评估 → 投资经理最终决策
```

详见 **[TradingAgents 深度剖析](./tradingagents/README.md)**。

---

### AI Hedge Fund — 最热门实战项目

42K stars，18 个 Agent。它的特点是**工程化程度高、直接可跑、社区活跃**。与 TradingAgents 相比：
- **更偏应用**：TradeAgent 直接对接券商，不是纯模拟
- **更多 Agent**：18 个角色分工更细（比如专门的经济周期分析师）
- **更多市场**：不仅美股，还支持一些国际市场

**适合**：想快速搭建实战交易系统的人。

---

### Swarm Trader — 最激进的个人方案

虽然 star 不多，但它是**功能密度最高**的项目之一：
- **20 个 Agent**（13 个 LLM 投资大师人格 + 7 个量化/数据专家）
- **完全免费**：SEC EDGAR + yfinance，零付费数据源
- **双模式**：Swing + Day Trading，Agent 可自主切换
- **代码级硬风控**：写死在代码里的止损线，Agent 无法覆盖
- **AutoResearch 循环**：AI 夜间自动优化策略代码

**适合**：想低成本跑自己实盘策略的个人量化开发者。

---

### OpenAlice — 全生命周期管理

"你一个人的华尔街"。覆盖了交易的全链条：

```
研究 → 建仓 → 持仓监控 → 风控调整 → 平仓
```

独特设计：
- **Trading-as-Git**：订单像 Git commit 一样有版本历史，需要人工审批
- **Unified Trading Account**：AI 不和券商直接打交道，通过统一的 UTA 抽象层
- **Brain**：持久记忆系统，Agent 会记住之前的研究和交易背景

**适合**：需要完整交易生命周期管理 + 严格人工审批的专业场景。

---

### AI-Trader — Agent 之间的交易所

| | |
|:---|:---|
| **GitHub** | [HKUDS/AI-Trader](https://github.com/HKUDS/AI-Trader) |
| **Stars** | 15K |
| **技术栈** | Python, TypeScript, FastAPI, React |
| **许可证** | MIT |

AI-Trader 是一个全新品类的项目——它不是"帮你构建交易 Agent 的框架"，而是**"Agent 之间互相交易的平台"**。

核心理念：就像人类有交易所一样，AI Agent 也需要自己的交易平台。任何 AI Agent（Claude Code、Cursor、OpenClaw 等）只需读取一个 SKILL.md 文件，就能在平台上注册并开始交易。

**独特能力**：

- **秒级 Agent 接入**：任何 Agent 发送一条消息就能注册，自动安装所需组件
- **集体智慧交易**：多个 Agent 在此发布信号、讨论策略、互相辩论
- **一键跟单**：Agent 可以 follow 其他表现好的 Agent，自动镜像持仓
- **三类信号**：
  - **策略信号**（Strategies）：发布交易策略供讨论
  - **操作信号**（Operations）：发布实盘操作供跟单
  - **讨论信号**（Discussions）：社区协作交流
- **积分奖励**：发布信号、获得跟单者都能赚积分
- **跨平台同步**：Agent 在自己的券商（Binance/Coinbase/IBKR）交易，同步信号到 AI-Trader
- **Paper Trading**：$100K 模拟资金，零风险入场
- **全市场覆盖**：股票、加密货币、外汇、期权、期货

**与 TradingAgents 的本质区别**：

| | TradingAgents | AI-Trader |
|------|:---:|:---:|
| **定位** | 构建交易 Agent 的**框架** | Agent 交易的**平台** |
| **Agent 关系** | 一个系统内的协作 | 平台上多个独立 Agent 竞争/跟单 |
| **使用者** | 人类开发者 | AI Agent 本身 |
| **交易方式** | Agent 在系统内模拟决策 | Agent 在自己的券商真实交易，信号上链 |

**适合**：想探索"Agent-to-Agent 交易"新范式；想让自己开发的 Agent 参与公开竞技。

---

## 选型决策树

```
你的主要目标？
│
├─ 学术研究、理解多 Agent 交易架构
│   └─ → [TradingAgents 深度剖析](./tradingagents/README.md)
│
├─ 快速搭建一个能跑的实战交易系统
│   └─ → AI Hedge Fund
│
├─ 用最少的钱跑自己的实盘策略（免费数据 + 本地 LLM）
│   └─ → Swarm Trader
│
├─ 需要完整的交易生命周期 + 人工审批 + 多资产
│   └─ → OpenAlice
│
└─ 想让自己的 Agent 和其他 Agent 在公开平台上竞技/跟单
    └─ → AI-Trader
```

---

## 延伸阅读

- 深入了解 TradingAgents 的内部实现 → [TradingAgents 深度剖析](./tradingagents/README.md)
- 想对比更多维度？→ [06 全局对比](./06-comparison.md)
