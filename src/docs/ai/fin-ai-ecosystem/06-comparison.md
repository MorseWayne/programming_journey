---
title: 全局对比
icon: /assets/icons/directory.svg
index: false
dir:
  order: 7
---

# 全局对比矩阵 —— 选型决策指南

**一句话**：看完前面五章，你心里可能已经有几个候选了。这一章把 15+ 个项目放在同一张表里比较，帮你做最终决策。

---

## 全维度对比

| 项目 | Stars | 类型 | 技术栈 | 实盘交易 | MCP 支持 | 多Agent | 适合人群 |
|------|:---:|------|--------|:---:|:---:|:---:|------|
| **OpenBB** | 65K | 终端 | Python | ❌ | ✅ | ❌ | 量化研究员 |
| **FinceptTerminal** | 20K | 终端 | C++20/Qt6 | ✅ | ✅ | ✅ (37) | 分析师、独立交易员 |
| **Ghostfolio** | 8K | 组合管理 | TypeScript | ❌ | 第三方 | ❌ | Buy & Hold 投资者 |
| **Dexter** | 25K | 研究Agent | TypeScript | ❌ | ❌ | ❌ | 研究员、分析师 |
| **FinRobot** | 7K | 研究Agent | Python | ❌ | ❌ | ✅ (8) | 需要自动研报的研究员 |
| **LangAlpha** | 1K | 研究Agent | Python | ❌ | ❌ | ✅ (6) | 金融 AI 学习者 |
| **TradingAgents** | 71K | 交易Agent | Python/LangGraph | ❌ | ❌ | ✅ (7+) | 学术研究者 |
| **AI Hedge Fund** | 42K | 交易Agent | Python | ⚠️ | ❌ | ✅ (18) | 实战量化开发者 |
| **Swarm Trader** | 300 | 交易Agent | Python | ✅ Alpaca | ❌ | ✅ (20) | 低成本实盘个人 |
| **AI-Trader** | 15K | Agent交易平台 | Python+TS | ✅ 多券商 | ❌ | ✅ (多Agent竞技) | Agent 开发者、平台探索者 |
| **OpenAlice** | 4K | 全生命周期 | TypeScript | ✅ Alpaca/IBKR | ✅ | ✅ (6+) | 专业交易员 |
| **FinClaw** | 新兴 | Copilot | Python | ❌ | ❌ | ❌ | 多平台用户 |
| **Fortio** | 新兴 | Copilot | Python/LangGraph | ❌ | ✅ | ❌ | Ghostfolio 用户 |
| **Fin. Datasets MCP** | 2K | MCP | Python | ❌ | ✅ | ❌ | 开发者 |
| **FMP MCP** | 128 | MCP | TypeScript | ❌ | ✅ | ❌ | 需要最全数据的开发者 |
| **yfnhanced MCP** | 新兴 | MCP | TypeScript | ❌ | ✅ | ❌ | 想用免费数据的开发者 |

---

## 按角色推荐

### 👨‍💼 独立交易员 / 散户
```
需求：看盘 + 分析 + 偶尔交易

推荐组合：
  看盘分析 → FinceptTerminal（免费桌面终端，37 AI Agent）
  交易执行 → 券商自带 App（FinceptTerminal 也支持 16 家券商）
  可选增强 → Swarm Trader（如果想尝试 AI 自动交易）
```

### 📊 量化研究员 / 个人开发者
```
需求：数据 + 研究 + 策略开发

推荐组合：
  数据平台 → OpenBB（Python API，100+ 数据源）
  研究增强 → Dexter（AI 辅助深度研究）
  策略开发 → TradingAgents（学习多 Agent 架构）
  实盘执行 → Swarm Trader 或 OpenAlice
```

### 🏢 小型基金 / 投资团队
```
需求：专业分析 + 流程管理 + 合规

推荐组合：
  研究平台 → FinRobot（自动生成研报）
  交易管理 → OpenAlice（Trading-as-Git，人工审批，审计追踪）
  数据基础设施 → OpenBB（统一数据层）+ Financial Datasets MCP
  团队协作 → FinClaw（多通道共享 AI 助手）
```

### 🎓 学术研究者 / 学生
```
需求：学习 + 实验 + 论文

推荐路径：
  入门 → LangAlpha（Supervisor 模式，容易理解）
  深入 → TradingAgents 深度剖析（最经典的架构论文）
  前沿 → 关注 FinThink / QuantAgents 等学术论文
```

---

## 按技术栈选

| 你的技术背景 | 推荐 |
|-------------|------|
| **Python 为主** | TradingAgents / AI Hedge Fund / FinRobot / Dexter |
| **TypeScript 为主** | OpenAlice / FinClaw / Ghostfolio |
| **不想写代码** | FinceptTerminal（下载即用） |
| **想用 LangGraph** | TradingAgents / Fortio / LangAlpha |
| **想用 CrewAI** | AITradingCrew（简单场景） |
| **想用本地 LLM (Ollama)** | Swarm Trader / FinceptTerminal（都支持 Ollama） |

---

## 关键决策维度

### 要不要实盘交易？
```
仅研究/学习 → TradingAgents / FinRobot / Dexter
需要实盘    → OpenAlice（最安全，"Trading-as-Git"人工审批）
               Swarm Trader（最便宜，免费数据 + 本地 LLM）
               FinceptTerminal（16 家券商，覆盖最广）
```

### 预算多少？
```
0 预算    → Ghostfolio + yfnhanced MCP（完全免费）
           Swarm Trader（SEC EDGAR + yfinance 免费数据）
低预算    → FinceptTerminal（免费桌面端）+ OpenRouter（低成本 LLM）
有预算    → Dexter（Financial Datasets API）+ OpenBB（数据平台）
```

### 单人还是团队？
```
单人  → Dexter（单 Agent 自主研究，无需协作）
         Swarm Trader（20 Agent 但不需要人类协作）
团队  → FinClaw（9 通道，多人共享 AI 助手）
         FinRobot（自动生成研报，团队分发）
```

---

## 延伸阅读

- 回到全景地图 → [金融 AI 生态全景](./README.md)
- 想深入了解特定类别？选择对应的章节：
  - [01 金融终端](./01-terminals.md)
  - [02 AI 研究 Agent](./02-research-agents.md)
  - [03 多智能体交易](./03-multi-agent-trading/README.md)
  - [04 多通道 Copilot](./04-copilots.md)
  - [05 MCP 工具生态](./05-mcp-tools.md)
