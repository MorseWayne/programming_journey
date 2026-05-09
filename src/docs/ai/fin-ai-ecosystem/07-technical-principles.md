---
title: 技术原理
icon: /assets/icons/brain.svg
order: 8
---

# 技术原理 —— 跨项目的共同模式

**一句话**：前面六章介绍了"有什么"，这一章讲"怎么实现的"——从 TradingAgents 到 AI-Trader，这些项目背后共享的技术原理。

---

## 1. 多 Agent 编排模式

所有多 Agent 金融系统都需要解决同一个核心问题：**如何让多个 AI Agent 有序协作？** 目前形成了四种主流模式。

### 1.1 层级流水线（Pipeline）

最简单也最常见的模式。Agent 按固定顺序执行，上游输出作为下游输入。

```
数据采集 → 分析师 → 研究员辩论 → 交易员 → 风控 → 决策
```

**代表项目**：TradingAgents、AI Hedge Fund、TradingCrew

**优点**：可预测、易调试、每一步的输出可审计
**缺点**：无法动态调整流程，遇到意外情况不会"绕路"

**实现关键**：每个阶段完成后需要**结构化输出**（Pydantic Schema），确保下游 Agent 能可靠解析上游的结果。

---

### 1.2 监督者模式（Supervisor）

一个 Supervisor Agent 作为总调度，根据任务动态分派给不同的子 Agent。

```
用户提问 → Supervisor 分析意图
              ├─→ Researcher（搜索新闻）
              ├─→ Market Analyst（获取数据）
              ├─→ Coder（需要时执行计算）
              └─→ Reporter（汇总结果）
```

**代表项目**：LangAlpha、TheNZT

**优点**：灵活，可以根据输入动态调整流程
**缺点**：Supervisor 本身可能成为瓶颈或错误源

**实现关键**：LangGraph 的 `conditional_edges`——Supervisor 节点根据当前状态决定下一步路由到哪个 Agent。

```python
# LangGraph 的 Supervisor 路由
graph.add_conditional_edges(
    "supervisor",
    lambda state: state["next_agent"],  # Supervisor 决定下一步
    {
        "researcher": "researcher",
        "market": "market_analyst",
        "coder": "coder",
        "FINISH": END
    }
)
```

---

### 1.3 辩论模式（Debate）

多个 Agent 对同一问题发表不同观点，通过结构化辩论逼近最优解。

```
┌─────────────────────────────────────────────┐
│  研究员-A（多头）  ⟷  研究员-B（空头）        │
│  "应该买入，理由是..."  "应该卖出，理由是..."  │
│                   ↕                          │
│           研究主管（评判+裁决）                │
└─────────────────────────────────────────────┘
```

**代表项目**：TradingAgents（牛熊辩论 + 风控三方辩论）、Swarm Trader（20 个投资大师人格的独立判断）

**优点**：能暴露盲点，通过对抗提升决策质量
**缺点**：成本高（辩论需要多轮 LLM 调用），可能陷入"为了辩论而辩论"

**实现关键**：辩论不是简单的"A 说一句 B 回一句"，而是**结构化回合制**——每轮有预设的分析框架，Agent 必须按框架输出，最后由 Manager 综合裁决。

---

### 1.4 竞争/跟单模式（Competitive）

多个独立 Agent 各自交易，彼此不直接协作，而是通过**公开信号 + 跟单机制**形成集体智慧。

```
Agent-A 发布信号 → 表现好 → 获得跟单者 → 影响力上升
Agent-B 发布信号 → 表现差 → 无人跟单 → 自然淘汰
```

**代表项目**：AI-Trader

**优点**：去中心化、自演化、市场机制自然筛选
**缺点**：没有协同，好信号可能被埋没

**实现关键**：信号标准化（统一的数据格式）+ 跟单执行引擎（follower 实时镜像 leader 的持仓变动）。

---

## 2. LangGraph 状态机原理

LangGraph 是 TradingAgents 和大多数多 Agent 交易系统的**编排引擎**。它的核心概念只有三个。

### 2.1 三个核心概念

```
┌──────────────────────────────────────────┐
│              LangGraph State              │
│  {                                        │
│    messages: [...],      // 对话历史       │
│    analyst_report: {...}, // 分析师报告    │
│    debate_result: {...},  // 辩论结果      │
│    trade_decision: {...}, // 交易决策      │
│  }                                        │
└──────────────┬───────────────────────────┘
               │
    ┌──────────┼──────────┐
    ▼          ▼          ▼
  Node      Node       Node
(Analyst) (Researcher) (Trader)
    │          │          │
    └──────────┼──────────┘
               ▼
           State（更新后）
```

- **State**：共享状态对象，所有节点读写同一个 State
- **Node**：执行单元（一个 Agent 的一次推理），接收 State，返回 State 更新
- **Edge**：连接节点的边（普通边 = 固定顺序，条件边 = 动态路由）

### 2.2 条件路由：Agent 系统的"if-else"

条件路由是多 Agent 系统的灵魂——它让流程不再是死的。

```python
# TradingAgents 中的典型条件路由
def should_continue_debate(state):
    """判断辩论是否继续"""
    if state["debate_round"] >= state["max_rounds"]:
        return "end_debate"
    if state["consensus_reached"]:
        return "end_debate"
    return "continue_debate"

graph.add_conditional_edges(
    "debate_round",
    should_continue_debate,
    {
        "continue_debate": "next_researcher",  # 继续辩论
        "end_debate": "trader"                 # 进入交易环节
    }
)
```

### 2.3 Checkpoint：断点续跑

金融分析的 LLM 调用成本很高。如果分析到一半崩溃了，没有 Checkpoint 就得重来。

```
分析 NVDA 完整流程（10+ LLM 调用，~30 分钟）
  Step 1: 市场分析师   ✓ (已保存 checkpoint)
  Step 2: 新闻分析师   ✓ (已保存 checkpoint)
  Step 3: 基本面分析师 ✓ (已保存 checkpoint)
  Step 4: 社交分析师   ✗ 崩溃！
  
  → 恢复后从 Step 4 继续，前 3 步的结果都还在
```

TradingAgents v0.2.4 引入了 SQLite Checkpoint——每一步完成后自动持久化 State 到 SQLite，重启后自动恢复。

---

## 3. 记忆架构

金融 Agent 不能是"金鱼记忆"——它需要记住历史分析、交易决策和反思。

### 3.1 三种记忆层次

| 记忆类型 | 存什么 | 生命周期 | 实现方式 |
|---------|--------|---------|---------|
| **工作记忆** | 当前分析上下文 | 单次分析 | LangGraph State |
| **情景记忆** | 历史交易决策+结果 | 长期 | 向量数据库 / SQLite |
| **反思记忆** | "上次为什么错了" | 长期 | LLM 生成的总结文本 |

### 3.2 各项目的实现对比

| 项目 | 记忆方式 |
|------|---------|
| **TradingAgents** | SQLite Checkpoint（工作记忆持久化）+ 事后反思记录 |
| **FinMem** | 分层记忆（Layered Memory）：短期（最近交易）+ 长期（历史模式） |
| **Dexter** | 文件系统 scratchpad（`.dexter/scratchpad/`），记录每次工具调用和推理过程 |
| **OpenAlice** | Brain 模块：持久记忆 + 情绪追踪 |
| **Swarm Trader** | AutoResearch 循环：AI 夜间分析历史交易，写入策略改进建议 |

---

## 4. 工具调用模式

Agent 的"手"——如何与外部世界交互。

### 4.1 金融 Agent 的工具分类

```
                    ┌──────────────────┐
                    │   金融 Agent 工具  │
                    └────────┬─────────┘
           ┌─────────┬───────┼───────┬─────────┐
           ▼         ▼       ▼       ▼         ▼
       行情数据   基本面   新闻    搜索     交易执行
      yfinance   FMP API  Finnhub  Tavily   Alpaca
      Polygon    SEC EDGAR Google  Exa     IBKR
      Alpaca                       News    CCXT
```

### 4.2 MCP：工具调用的标准化

以前每个 Agent 项目都要自己对接 yfinance、Alpha Vantage、券商 API。有了 MCP：

```
以前：
  Agent-A → 自己对接 yfinance
  Agent-B → 自己对接 yfinance
  Agent-C → 自己对接 yfinance
  （三个项目重复造轮子）

现在：
  所有 Agent → MCP Server → 统一对接所有数据源
  （一次对接，所有 Agent 共享）
```

这就是为什么 Dexter、OpenAlice、Fortio 等项目都不直接对接数据源，而是依赖 MCP Server。

---

## 5. 结构化输出

不让 LLM 自由发挥——用 Schema 约束输出格式，确保下游 Agent 能解析。

```python
# TradingAgents 中的结构化输出示例
from pydantic import BaseModel

class TradeDecision(BaseModel):
    action: Literal["buy", "sell", "hold"]
    ticker: str
    quantity: int
    confidence: float  # 0.0 - 1.0
    reasoning: str
    risk_assessment: RiskAssessment

class RiskAssessment(BaseModel):
    max_drawdown_pct: float
    position_size_pct: float
    risk_level: Literal["low", "medium", "high"]

# Agent 输出被强制约束为这个结构
# 如果 LLM 返回了不符合 Schema 的内容，框架会自动重试
```

**为什么重要**：在多 Agent 系统中，Agent-A 的输出是 Agent-B 的输入。如果没有结构化输出，Agent-B 需要自己解析 Agent-A 的自由文本——这不可靠。

---

## 6. 风控架构

这是金融系统区别于通用 AI 系统的关键——**必须有人对风险说"不"**。

### 6.1 三种风控范式

| 范式 | 机制 | 代表项目 | 优势 | 劣势 |
|------|------|---------|------|------|
| **辩论式** | 激进/中性/保守三方风控 Agent 辩论 | TradingAgents | 全面覆盖各种视角 | 无法阻止 LLM 幻觉 |
| **代码强制** | 硬止损线写死在代码里 | Swarm Trader | 绝对可靠 | 不够灵活 |
| **Pipeline 审批** | 每笔交易经过 Guard 检查 | OpenAlice | 可审计、可配置 | 延迟较高 |

### 6.2 为什么代码强制 > Agent 辩论（在安全层面）

```
辩论式风控的问题：
  风控 Agent（LLM 驱动）："这笔交易风险可控"
  但 LLM 可能因为 prompt 注入或幻觉而误判
  
代码强制的优势：
  if position_size > max_position:
      REJECT  # 无论 LLM 说什么，代码不通过就是不通过
```

这也是为什么 Swarm Trader 把风控做成"代码强制执行，Agent 无法覆盖"——在安全层面，确定性 > 智能。

---

## 延伸阅读

- 这些技术选择背后的设计哲学 → [08 设计思路](./08-design-philosophy.md)
- 用 TradingAgents 验证这些原理 → [03 多智能体交易 - TradingAgents 深度剖析](./03-multi-agent-trading/tradingagents/README.md)
