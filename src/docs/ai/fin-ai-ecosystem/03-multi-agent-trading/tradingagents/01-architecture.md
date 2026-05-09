---
title: 多智能体交易系统架构全景
icon: sitemap
order: 1
date: 2026-05-09
category:
  - AI
  - TradingAgents
tag:
  - 架构设计
  - LangGraph
  - Multi-Agent
  - LLM
  - 量化交易
---

# 多智能体交易系统架构全景：从传统量化到 AI Agent 交易

传统量化交易系统依赖人工编写的规则和统计模型：技术指标交叉、均线策略、布林带突破……这些方法的共同问题是**无法理解非结构化信息**（新闻、财报、社交媒体情绪），更无法像人类分析师那样**综合多维度信息进行推理判断**。

TradingAgents 的答案是：**用多个专业化 LLM Agent 模拟一个真实的交易分析团队**。

## 架构总览

TradingAgents 采用 **分层 + 管道** 的混合架构，核心编排引擎是 LangGraph：

```
┌─────────────────────────────────────────────────────────────────┐
│                      CLI 层 (Typer + Rich)                       │
│            命令行交互、参数解析、实时状态展示                      │
├─────────────────────────────────────────────────────────────────┤
│                  TradingAgentsGraph (主编排器)                    │
│     LangGraph StateGraph 构建 · 条件路由 · 状态传播 · 断点管理    │
├───────────────┬─────────────────────┬───────────────────────────┤
│   Agent 层    │    DataFlow 层       │      LLM Client 层        │
│  12个专业Agent │  Yahoo Finance /    │  OpenAI / Anthropic /     │
│  角色扮演+工具  │  Alpha Vantage      │  Google / Azure 统一抽象  │
└───────────────┴─────────────────────┴───────────────────────────┘
```

### 核心模块对应源码

| 模块 | 源码路径 | 职责 |
|------|---------|------|
| CLI 入口 | `cli/main.py` | Typer 命令行，Rich 终端展示 |
| 编排引擎 | `tradingagents/graph/trading_graph.py` | 主编排器，状态管理 |
| 图构建 | `tradingagents/graph/setup.py` | LangGraph StateGraph 组装 |
| 条件路由 | `tradingagents/graph/conditional_logic.py` | 工具调用循环、辩论轮次控制 |
| 状态传播 | `tradingagents/graph/propagation.py` | 初始状态创建与参数传递 |
| Agent 工厂 | `tradingagents/agents/__init__.py` | 所有 Agent 的创建函数导出 |
| 数据接口 | `tradingagents/dataflows/interface.py` | 统一数据源适配 |
| LLM 抽象 | `tradingagents/llm_clients/factory.py` | Provider 工厂模式 |

## LangGraph：多智能体编排的核心引擎

TradingAgents 不使用简单的顺序调用，而是基于 **LangGraph 的状态图（StateGraph）** 实现复杂的条件路由和多轮循环。

### 为什么选择 LangGraph？

普通的 LLM 调用链路是线性的：

```python
# 传统方式：线性调用
report1 = analyst_a(ticker)  # 等待完成
report2 = analyst_b(ticker)  # 等待完成
decision = manager(report1, report2)  # 等待完成
```

而 TradingAgents 需要处理：
- **工具调用循环**：Analyst 查询数据 → LLM 决定是否需要更多数据 → 继续查询或结束
- **多轮辩论**：Bull 发言 → Bear 回应 → Bull 再回应 → ... → Manager 裁决
- **条件分支**：根据辩论轮次、工具调用状态动态路由

LangGraph 的 StateGraph 天然支持这些场景：

```python
# tradingagents/graph/setup.py
from langgraph.graph import END, START, StateGraph

workflow = StateGraph(AgentState)

# 添加节点
workflow.add_node("Market Analyst", create_market_analyst(llm))
workflow.add_node("tools_market", tool_nodes["market"])
workflow.add_node("Bull Researcher", create_bull_researcher(llm))
workflow.add_node("Bear Researcher", create_bear_researcher(llm))
# ...

# 条件边：根据状态决定下一步
workflow.add_conditional_edges(
    "Market Analyst",
    should_continue_market,         # 条件函数
    ["tools_market", "Msg Clear Market"]  # 可选路径
)
workflow.add_edge("tools_market", "Market Analyst")  # 工具调用后回到分析师
```

### 条件路由机制

每个 Analyst 节点都配有一个工具调用循环：

```python
# tradingagents/graph/conditional_logic.py
class ConditionalLogic:
    def should_continue_market(self, state: AgentState):
        """市场分析师是否还需要调用工具？"""
        last_message = state["messages"][-1]
        if last_message.tool_calls:
            return "tools_market"        # → 执行工具调用
        return "Msg Clear Market"       # → 分析完成，进入下一阶段
```

辩论阶段的循环控制更加精细：

```python
def should_continue_debate(self, state: AgentState) -> str:
    # 达到最大轮次 → 交给研究经理裁决
    if state["investment_debate_state"]["count"] >= 2 * self.max_debate_rounds:
        return "Research Manager"
    # 多头刚发言 → 空头回应
    if state["investment_debate_state"]["current_response"].startswith("Bull"):
        return "Bear Researcher"
    # 空头刚发言 → 多头回应
    return "Bull Researcher"
```

### 状态设计

TradingAgents 使用 TypedDict 定义状态，在 LangGraph 中跨节点共享：

```python
# tradingagents/agents/utils/agent_states.py
class InvestDebateState(TypedDict):
    bull_history: str       # 多头研究员的历史发言
    bear_history: str       # 空头研究员的历史发言
    history: str            # 完整辩论记录
    current_response: str   # 当前发言
    judge_decision: str     # 研究经理的裁决
    count: int              # 辩论轮次计数

class RiskDebateState(TypedDict):
    aggressive_history: str
    conservative_history: str
    neutral_history: str
    history: str
    latest_speaker: str     # 最后发言者（用于轮转）
    current_aggressive_response: str
    current_conservative_response: str
    current_neutral_response: str
    judge_decision: str
    count: int

class AgentState(TypedDict):
    messages: List          # LangGraph 消息历史（含工具调用）
    company_of_interest: str
    trade_date: str
    past_context: str       # 历史反思记忆注入
    investment_debate_state: InvestDebateState
    risk_debate_state: RiskDebateState
    market_report: str
    fundamentals_report: str
    sentiment_report: str
    news_report: str
```

关键设计决策：
- **辩论状态独立**：`InvestDebateState` 和 `RiskDebateState` 各自维护自己的发言历史和轮次计数
- **报告字段**：四个 Analyst 的分析报告存储在 `market_report`、`fundamentals_report` 等字段中，供下游 Agent 消费
- **past_context**：注入历史交易反思，形成记忆闭环

## LLM Provider 抽象层

TradingAgents 需要支持多个 LLM 提供商，同时处理各家的 thinking/reasoning 配置差异。

### 工厂模式设计

```python
# tradingagents/llm_clients/factory.py
def create_llm_client(
    provider: str,      # "openai" | "anthropic" | "google" | "azure"
    model: str,         # "gpt-5.4" | "claude-4.6" | ...
    base_url: str = None,
    **kwargs
) -> BaseLLMClient:
    if provider == "openai":
        return OpenAIClient(model, base_url, **kwargs)
    elif provider == "anthropic":
        return AnthropicClient(model, base_url, **kwargs)
    # ...
```

### 双模型策略

TradingAgents 区分两种 LLM 使用场景：

| 类型 | 用途 | 默认模型 | 特征 |
|------|------|---------|------|
| `deep_thinking_llm` | 复杂推理任务 | `gpt-5.4` | ResearchManager、PortfolioManager |
| `quick_thinking_llm` | 轻量任务 | `gpt-5.4-mini` | Analyst、Trader、Debater |

```python
# tradingagents/graph/trading_graph.py
deep_client = create_llm_client(
    provider=self.config["llm_provider"],
    model=self.config["deep_think_llm"],
    **llm_kwargs,
)
deep_thinking_llm = deep_client.get_llm()  # 用于管理层决策

quick_client = create_llm_client(
    provider=self.config["llm_provider"],
    model=self.config["quick_think_llm"],
    **llm_kwargs,
)
quick_thinking_llm = quick_client.get_llm()  # 用于分析师和辩论
```

这种设计的核心洞察：**不是所有推理都需要深度思考**。分析师的数据查询和初步分析用快模型节省成本，而在关键决策点（研究裁决、最终买卖建议）切换到深模型确保质量。

### Provider 特有配置

不同 Provider 的 thinking budget 配置方式不同，TradingAgents 通过配置字典统一管理：

```python
# tradingagents/graph/trading_graph.py
def _get_provider_kwargs(self) -> Dict[str, Any]:
    kwargs = {}
    provider = self.config.get("llm_provider", "").lower()

    if provider == "google":
        kwargs["thinking_level"] = self.config.get("google_thinking_level")
    elif provider == "openai":
        kwargs["reasoning_effort"] = self.config.get("openai_reasoning_effort")
    elif provider == "anthropic":
        kwargs["effort"] = self.config.get("anthropic_effort")

    return kwargs
```

## 数据源适配层

TradingAgents 的数据层使用 **策略模式** 抽象了不同数据供应商：

```python
# tradingagents/dataflows/interface.py (简化示意)
class DataVendorInterface:
    """数据供应商统一接口"""
    def get_stock_data(self, ticker, start, end): ...
    def get_indicators(self, ticker, start, end): ...
    def get_fundamentals(self, ticker): ...
    def get_news(self, ticker): ...

# 运行时根据配置选择实现
vendor = create_vendor(config["data_vendors"]["core_stock_apis"])
stock_data = vendor.get_stock_data("AAPL", "2024-01-01", "2024-12-31")
```

配置粒度到**类别级别**，也可以到**工具级别**：

```python
config["data_vendors"] = {
    "core_stock_apis": "yfinance",       # 股票行情
    "technical_indicators": "alpha_vantage",  # 技术指标
    "fundamental_data": "yfinance",      # 基本面
    "news_data": "yfinance",             # 新闻
}

# 工具级覆盖
config["tool_vendors"] = {
    "get_stock_data": "alpha_vantage",   # 只覆盖这一个工具
}
```

## 配置系统

TradingAgents 的配置采用**约定大于配置**的设计：

```python
# tradingagents/default_config.py
DEFAULT_CONFIG = {
    "project_dir": "...",
    "results_dir": "~/.tradingagents/logs",
    "data_cache_dir": "~/.tradingagents/cache",
    "memory_log_path": "~/.tradingagents/memory/trading_memory.md",

    # LLM
    "llm_provider": "openai",
    "deep_think_llm": "gpt-5.4",
    "quick_think_llm": "gpt-5.4-mini",
    "backend_url": None,

    # Provider thinking 配置
    "google_thinking_level": None,
    "openai_reasoning_effort": None,
    "anthropic_effort": None,

    # 功能开关
    "checkpoint_enabled": False,         # 断点续跑
    "output_language": "English",        # 输出语言

    # 辩论参数
    "max_debate_rounds": 1,
    "max_risk_discuss_rounds": 1,
    "max_recur_limit": 100,
}
```

环境变量覆盖：
- `TRADINGAGENTS_RESULTS_DIR`
- `TRADINGAGENTS_CACHE_DIR`
- `TRADINGAGENTS_MEMORY_LOG_PATH`

## 小结

TradingAgents 的架构设计体现了几个核心原则：

1. **关注点分离**：Agent 层、数据层、LLM 层各有清晰的职责边界
2. **可替换性**：通过工厂模式，LLM Provider 和数据源可热切换
3. **状态驱动**：LangGraph 的 StateGraph 使得复杂的多轮交互变得可管理
4. **成本意识**：双模型策略在质量和成本间取得平衡

下一篇文章我们将深入每个 Agent 角色的设计细节。
