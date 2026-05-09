---
title: 智能体角色体系设计
icon: users-gear
order: 2
date: 2026-05-09
category:
  - AI
  - TradingAgents
tag:
  - Multi-Agent
  - Role Design
  - LLM Agent
  - 交易策略
---

# 智能体角色体系设计：从分析师到投资经理的决策链

TradingAgents 模拟了一个完整的交易团队，包含 **12 个独立 AI Agent**，分布在四个层级。每个 Agent 都有专属的 system prompt、工具集和决策逻辑。

## 角色全景图

```
┌──────────────────────────────────────────────────────────────┐
│                      📊 分析师层 (Analyst Layer)                │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │
│  │  Market  │  │  Social  │  │   News   │  │ Fundamentals │  │
│  │ Analyst  │  │ Analyst  │  │ Analyst  │  │   Analyst    │  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └──────┬───────┘  │
│       │              │             │               │          │
│  技术指标/走势   社交媒体情绪   财经新闻分析   财报/基本面数据   │
├──────────────────────────────────────────────────────────────┤
│                      🔬 研究员层 (Researcher Layer)            │
│            ┌──────────────┐  ┌──────────────┐                 │
│            │ Bull         │  │ Bear         │                 │
│            │ Researcher   │←→│ Researcher   │  多轮辩论        │
│            └──────┬───────┘  └──────┬───────┘                 │
│                   └────────┬───────┘                         │
│                    👤 Research Manager (裁决)                  │
├──────────────────────────────────────────────────────────────┤
│                      💰 交易层 (Trading Layer)                  │
│                      ┌──────────────┐                         │
│                      │    Trader    │  制定交易计划            │
│                      └──────────────┘                         │
├──────────────────────────────────────────────────────────────┤
│                   ⚠️ 风控层 (Risk Management Layer)            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐ │
│  │  Aggressive  │  │   Neutral    │  │    Conservative      │ │
│  │   Analyst    │←→│   Analyst    │←→│      Analyst         │ │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬───────────┘ │
│         └─────────────────┼─────────────────────┘             │
│                  👤 Portfolio Manager (最终决策)                │
└──────────────────────────────────────────────────────────────┘
```

## 第一层：分析师（Analyst Layer）

分析师是决策链的**起点**，负责从不同维度收集和分析数据。每个分析师都有专属的工具集和评估框架。

### 市场分析师（Market Analyst）

**职责**：分析价格走势、技术指标、交易量等市场数据

```python
# tradingagents/agents/analysts/market_analyst.py
def create_market_analyst(llm):
    """创建市场技术面分析师，配备技术指标计算工具"""
    tools = [
        get_stock_data,       # 获取历史价格和成交量
        get_indicators,       # 计算技术指标（RSI、MACD、布林带等）
        get_global_news,      # 获取宏观经济新闻
    ]
    return llm.bind_tools(tools)
```

**System Prompt 设计要点**：
- 引导关注趋势、支撑/阻力位、成交量异常
- 要求使用工具获取数据后再下结论
- 输出结构：市场概况 → 技术指标分析 → 趋势判断 → 风险提示

### 社交媒体分析师（Social Analyst）

**职责**：追踪社交媒体情绪，分析市场舆论走向

```python
# tradingagents/agents/analysts/social_media_analyst.py
def create_social_media_analyst(llm):
    tools = [
        get_stock_data,
        get_news,  # 新闻数据中提取社交媒体情绪指标
    ]
    return llm.bind_tools(tools)
```

**设计挑战**：真正的社交媒体情绪分析需要 X/Twitter API、Reddit API 等。当前版本通过新闻数据的情绪指标作为代理。

### 新闻分析师（News Analyst）

**职责**：追踪和分析与股票相关的新闻事件

```python
# tradingagents/agents/analysts/news_analyst.py
def create_news_analyst(llm):
    tools = [
        get_news,              # 获取公司新闻
        get_global_news,       # 获取宏观/行业新闻
        get_stock_data,        # 结合价格走势判断新闻影响
    ]
    return llm.bind_tools(tools)
```

**System Prompt 设计要点**：
- 区分短期噪音和趋势性新闻
- 评估新闻对股价的潜在影响程度
- 关注行业政策、竞争格局变化

### 基本面分析师（Fundamentals Analyst）

**职责**：分析公司财务数据，评估内在价值

```python
# tradingagents/agents/analysts/fundamentals_analyst.py
def create_fundamentals_analyst(llm):
    tools = [
        get_fundamentals,       # 获取关键财务指标
        get_balance_sheet,      # 资产负债表
        get_cashflow,           # 现金流量表
        get_income_statement,   # 利润表
        get_insider_transactions, # 内部人交易
    ]
    return llm.bind_tools(tools)
```

**System Prompt 设计要点**：
- 关注盈利质量、负债水平、现金流健康度
- P/E、P/B、ROE 等估值指标分析
- 同比/环比趋势变化
- 内部人交易信号的权重评估

### 分析师选择机制

用户可以按需选择分析师组合：

```python
# 全部分析师
ta = TradingAgentsGraph(selected_analysts=["market", "social", "news", "fundamentals"])

# 只用市场和基本面
ta = TradingAgentsGraph(selected_analysts=["market", "fundamentals"])
```

在 LangGraph 中，分析师以**链式管道**执行，前一个分析师的报告会流入后面的分析中，但顺序不影响最终结果的完整性——每个分析师都可以独立调用工具获取所需数据。

## 第二层：研究员辩论（Researcher Layer）

这是 TradingAgents 最具特色的设计：**多头研究员和空头研究员进行多轮辩论**，最后由研究经理裁决。

### 多头研究员（Bull Researcher）

**角色**：积极寻找做多理由，发现投资价值

系统提示词引导它：
- 从四个分析报告中挖掘支持上涨的论据
- 挑战空头提出的悲观观点
- 提出具体的催化剂（catalyst）和估值上行空间

### 空头研究员（Bear Researcher）

**角色**：识别风险、质疑多头论证、寻找做空理由

系统提示词引导它：
- 从同样的分析报告中挖掘风险点
- 反驳多头过于乐观的假设
- 提出下行风险情景和潜在雷区

### 辩论机制

```python
# tradingagents/graph/setup.py (简化)
# 辩论循环的核心逻辑
workflow.add_node("Bull Researcher", create_bull_researcher(quick_thinking_llm))
workflow.add_node("Bear Researcher", create_bear_researcher(quick_thinking_llm))

# 循环：Bull → Bear → Bull → Bear → ... → Research Manager
workflow.add_edge("Bull Researcher", "Bear Researcher")
workflow.add_edge("Bear Researcher", "Bull Researcher")

# 条件边：当辩论轮次达到上限时，跳出循环
def should_continue_debate(state: AgentState) -> str:
    if state["investment_debate_state"]["count"] >= 2 * max_debate_rounds:
        return "Research Manager"  # 跳出
    # 继续循环
    if last_speaker == "Bull":
        return "Bear Researcher"
    return "Bull Researcher"
```

每轮辩论中，研究员能看到的上下文包括：
- 上一个发言者的全部观点
- 所有四个分析师报告
- 历史辩论记录（`bull_history` / `bear_history`）

### 研究经理（Research Manager）

**角色**：裁决多空辩论，生成综合研报

这是第一个使用 `deep_thinking_llm` 的节点——因为需要综合两个对立观点做出判断：

```python
# tradingagents/graph/setup.py
research_manager_node = create_research_manager(self.deep_thinking_llm)
```

研究经理的决策被设计为**结构化输出**（v0.2.4 新增）：

```python
# tradingagents/agents/schemas.py (简化)
class ResearchDecision(BaseModel):
    thesis_summary: str          # 投资论点摘要
    bull_case_strength: str      # 多头论据强度评估
    bear_case_risks: str         # 空头风险点评估
    conviction_level: str        # 确信度：High/Medium/Low
    key_catalysts: List[str]     # 关键催化剂
    key_risks: List[str]         # 关键风险
    recommendation: str          # 建议方向
```

## 第三层：交易员（Trader）

**角色**：基于研究经理的研报制定具体的交易计划

```python
# tradingagents/agents/trader/trader.py
def create_trader(llm):
    tools = [get_stock_data]  # 当前价格对于制定计划很重要
    return llm.bind_tools(tools)
```

交易员同样输出结构化决策：

```python
class TraderDecision(BaseModel):
    action: str                  # Buy / Sell / Hold
    quantity_ratio: str          # 仓位比例建议（如 30%）
    entry_strategy: str          # 入场策略
    exit_strategy: str           # 退出策略
    stop_loss: Optional[str]     # 止损位
    take_profit: Optional[str]   # 止盈位
    time_horizon: str            # 持仓时间
    reasoning: str               # 决策理由
```

## 第四层：风控辩论（Risk Management Layer）

这是第二层辩论——三个不同风险偏好的分析师围绕交易员的计划进行讨论。

### 激进分析师（Aggressive Analyst）

- 关注潜在收益，主张承担适度风险
- 评估市场情绪是否支持激进策略

### 中性分析师（Neutral Analyst）

- 平衡收益与风险
- 提出折中方案

### 保守分析师（Conservative Analyst）

- 关注下行风险，主张安全第一
- 强调仓位控制、止损设置

### 辩论轮转机制

```python
# tradingagents/graph/conditional_logic.py
def should_continue_risk_analysis(self, state: AgentState) -> str:
    # 达到最大轮次 → 交给投资组合经理
    if state["risk_debate_state"]["count"] >= 3 * self.max_risk_discuss_rounds:
        return "Portfolio Manager"

    # 三人循环：Aggressive → Conservative → Neutral → Aggressive → ...
    latest = state["risk_debate_state"]["latest_speaker"]
    if latest.startswith("Aggressive"):
        return "Conservative Analyst"
    if latest.startswith("Conservative"):
        return "Neutral Analyst"
    return "Aggressive Analyst"
```

设计巧妙之处：**不是两两辩论，而是三人循环**。每次发言只能看到上一个人的观点和全局上下文，避免了"站队"现象。

### 投资组合经理（Portfolio Manager）

**角色**：最终决策者，综合所有信息给出五档评级

这是整个系统的**最终出口**，使用 `deep_thinking_llm`：

```python
portfolio_manager_node = create_portfolio_manager(self.deep_thinking_llm)
```

结构化输出——五档评级：

```python
class PortfolioDecision(BaseModel):
    rating: str             # Buy / Overweight / Hold / Underweight / Sell
    confidence: str         # High / Medium / Low
    summary: str            # 决策摘要
    reasoning: str          # 详细推理
    risk_assessment: str    # 风险评估
    key_factors: List[str]  # 关键决策因素
```

五档评级通过**确定性规则**从输出中提取（`tradingagents/agents/utils/rating.py`），不依赖额外的 LLM 调用：

```python
def parse_rating(text: str) -> str:
    """从 Portfolio Manager 输出中提取五档评级"""
    # 匹配 "Rating: Buy" 或 "**Rating**: Buy" 等模式
    patterns = [
        (r"\*\*Rating\*\*:\s*(Buy|Overweight|Hold|Underweight|Sell)", 1),
        (r"Rating:\s*(Buy|Overweight|Hold|Underweight|Sell)", 1),
    ]
    for pattern, group in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return match.group(group).capitalize()
    return "Hold"  # 默认保守
```

## 系统提示词设计原则

所有 Agent 的 system prompt 遵循统一原则：

1. **角色明确**：每个 Agent 清楚地知道自己是谁、对谁负责
2. **工具优先**：在发表观点前，必须先用工具获取数据
3. **基于证据**：所有观点必须有数据支撑，引用具体的指标或数字
4. **禁止幻觉**：如果数据不可得，明确说明而非编造
5. **专业术语**：使用金融领域标准术语，保持专业性
6. **输出结构化**：管理层 Agent 使用 Pydantic Schema 保证输出格式

## 小结

TradingAgents 的 Agent 体系设计体现了"专业化分工"和"对抗性思维"两个核心思想：

- **专业化分工**：每个 Agent 只关注自己的领域，避免了一个模型"什么都懂但什么都不精"的问题
- **对抗性思维**：多空辩论和风控三方辩论确保任何一个方向的极端观点都会被质疑和平衡
- **层级递进**：从数据收集 → 分析 → 辩论 → 交易计划 → 风控审核 → 最终决策，每个环节都有明确的输入和输出

下一篇文章我们将深入完整的交易决策工作流。
