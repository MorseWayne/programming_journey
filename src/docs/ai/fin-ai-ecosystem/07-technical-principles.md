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

## 7. 测试策略

多 Agent 系统测试比普通软件复杂——LLM 输出不确定，交互路径不固定。

### 7.1 单元测试：Mock LLM 响应

测试单个 Agent 时用 Mock 替代 LLM 返回，避免依赖真实调用（太慢、太贵、不稳定）。Mock LLM 返回，测试 Agent 的处理逻辑——是否正确解析 Schema、是否触发风控规则。

```python
@pytest.fixture
def mock_llm_response():
    return AnalystReport(ticker="AAPL", action="buy", confidence=0.85)

def test_analyst_decision(mock_llm_response):
    agent = MarketAnalystAgent()
    result = agent.process(mock_llm_response)
    assert result.risk_level in ["low", "medium", "high"]
    assert result.position_size_pct <= MAX_POSITION_LIMIT
```

### 7.2 集成测试：确定性模式

固定随机种子、temperature=0、使用固定数据集，让多 Agent 协作流程可重复。

```python
TEST_CONFIG = {"llm": {"temperature": 0, "seed": 42},
               "data": {"use_mock_market": True},
               "agents": {"max_debate_rounds": 2}}

def test_full_pipeline():
    with deterministic_mode(TEST_CONFIG):
        result = run_trading_pipeline(ticker="NVDA")
        assert result.final_decision.action in ["buy", "sell", "hold"]
```

### 7.3 评估框架与黄金数据集

建立**黄金数据集**——人工标注标准答案，衡量 Agent 输出质量。

| 评估维度 | 方法 | 指标 |
|---------|------|------|
| **答案准确性** | 与黄金答案对比 | Exact Match / F1 |
| **推理合理性** | 人工评分（1-5 分） | 平均得分 |
| **风险识别率** | 故意植入风险案例 | 召回率 |
| **Schema 合规性** | 自动校验输出格式 | 通过率 |

```python
from deepeval.metrics import AnswerRelevancyMetric
metric = AnswerRelevancyMetric(threshold=0.7)
score = metric.measure(query="...", actual_output=out, expected_output="...")
```

---

## 8. 监控与可观测性

生产环境的多 Agent 系统没有监控，就像开车不看仪表盘。

### 8.1 关键指标

| 指标类别 | 具体指标 | 告警阈值 |
|---------|---------|---------|
| **LLM 性能** | 延迟（P50/P95/P99）、Token 消耗、调用次数 | P95 > 10s |
| **决策质量** | 准确率（与回测对比）、置信度分布 | 准确率 < 60% |
| **系统健康** | Agent 崩溃次数、Checkpoint 恢复次数 | 崩溃 > 3 次/小时 |
| **成本** | 单次分析成本、日累计费用 | 日费用 > $50 |

```python
from prometheus_client import Histogram, Counter

llm_latency = Histogram("llm_duration", "", ["agent", "model"])
llm_tokens = Counter("llm_tokens", "", ["agent", "direction"])

def call_llm_with_metrics(agent, prompt, model):
    with llm_latency.labels(agent.name, model).time():
        r = llm_client.call(prompt, model=model)
    llm_tokens.labels(agent.name, "input").inc(r.usage.prompt_tokens)
    llm_tokens.labels(agent.name, "output").inc(r.usage.completion_tokens)
    return r
```

### 8.2 日志模式：结构化 + Trace ID

每个 Agent 日志必须包含 **Trace ID**，才能把分散的日志串成完整调用链。交易决策出错时，通过 Trace ID 追踪每个 Agent 的中间输出和数据源——这是事后审计的基础。

```python
{"trace_id": "trace_abc123", "agent": "market_analyst",
 "event": "llm_response", "latency_ms": 4200,
 "tokens": {"input": 2048, "output": 512},
 "decision": {"action": "buy", "confidence": 0.82}}
```

### 8.3 分布式追踪

LangGraph 支持导出 OpenTelemetry 数据，可接入 Jaeger 或 Grafana Tempo。

```
用户请求 → Supervisor → Researcher → LLM (3.2s)
               ↓
         Market Analyst → yfinance API (0.8s)
               ↓
         Risk Guard → 风控检查 (0.1s)
               ↓
         Trader → 决策输出
```

---

## 9. 错误恢复与优雅降级

金融系统不能"一崩全崩"——数据源失效或 LLM 超时时，系统需要有退路。

### 9.1 重试策略

LLM 调用可能因网络抖动或 Rate Limit 失败，金融场景不能无限重试，连续三次异常后转人工审核。

```python
from tenacity import retry, stop_after_attempt, wait_exponential

@retry(stop=stop_after_attempt(3), wait=wait_exponential(min=2, max=10))
def call_llm_with_retry(prompt, model):
    return llm_client.call(prompt, model=model)
```

### 9.2 降级 LLM 模型

主力模型不可用时自动降级到备用模型，同时提高置信度阈值。

```python
LLM_FALLBACK_CHAIN = [
    {"model": "gpt-4o", "threshold": 0.7},
    {"model": "gpt-4o-mini", "threshold": 0.8},
    {"model": "local-llama-3", "threshold": 0.9}
]

def call_with_fallback(prompt):
    for cfg in LLM_FALLBACK_CHAIN:
        try: return llm_client.call(prompt, **cfg)
        except Exception: continue
    raise AllModelsUnavailable("所有模型不可用")
```

### 9.3 数据源失败的优雅降级

yfinance 不可用时自动切换 Polygon；实时数据不可用时使用缓存数据并标注过期。

```python
def get_market_data(ticker):
    for src in [YFinanceClient(), PolygonClient(), CachedDataStore()]:
        try:
            data = src.fetch(ticker)
            if isinstance(src, CachedDataStore): data.stale = True
            return data
        except DataSourceError: continue
    raise NoDataAvailable(f"{ticker} 无可用数据源")
```

### 9.4 Checkpoint 恢复

Checkpoint 不只是"断点续跑"，也是**错误恢复**的基础设施。Agent 失败后可以从 Checkpoint 重试，或跳过失败节点继续。

```python
graph = builder.compile(checkpointer=checkpointer)
for event in graph.stream(None, config={"configurable": {"thread_id": "001"}}, subgraphs=True):
    if event["agent"] == "failed_agent":
        event["state"]["fallback_used"] = True; continue
```

---

## 10. LLM 可靠性

金融场景中一个错误数字可能导致错误交易决策，可靠性问题比通用场景更严重。

### 10.1 输出验证模式

不要相信 LLM 原始输出，必须经过多层验证。

```python
from pydantic import BaseModel, field_validator

class TradeDecision(BaseModel):
    action: Literal["buy", "sell", "hold"]
    ticker: str
    confidence: float
    position_size_pct: float

    @field_validator("confidence")
    @classmethod
    def check_range(cls, v):
        assert 0 <= v <= 1, "置信度必须在 0-1 之间"
        return v

    @field_validator("position_size_pct")
    @classmethod
    def check_limit(cls, v):
        assert v <= MAX_POSITION_PCT, f"仓位不能超过 {MAX_POSITION_PCT}%"
        return v
```

框架自动重试直到输出符合 Schema，多次失败后标记异常并告警。

### 10.2 Pydantic Schema 强制

LangChain / LangGraph 的 `with_structured_output` 在底层做 Schema 强制：

```python
structured_llm = llm.with_structured_output(TradeDecision, method="json_mode")
# LLM 返回 action="买入" 而非 "buy" 时
# 框架先尝试映射，无法映射则重新调用要求修正
```

### 10.3 置信度评分

金融决策需要量化不确定性。LLM 输出置信度，低置信度时触发人工审核。

```python
def handle_decision(d: TradeDecision):
    if d.confidence >= 0.85: execute_immediately(d)
    elif d.confidence >= 0.6: queue_for_review(d)
    else: reject_and_log(d)
```

**关键洞察**：置信度不能只是 LLM 的"自我感觉"，应结合历史准确率校准。如果 Agent 过去 confidence=0.8 时实际准确率只有 55%，那它的 0.8 应该被打折。

### 10.4 幻觉检测

金融场景的幻觉尤其危险——LLM 可能"编造"不存在的财报数据。

**三层防御**：

1. **事实校验层**：用结构化数据源交叉验证 LLM 引用的数字。LLM 说 "AAPL Q1 营收 950 亿"，自动查 yfinance 确认。

2. **溯源要求**：要求 LLM 在输出中标注数据来源。

```python
class Fact(BaseModel):
    statement: str
    source: Literal["yfinance", "FMP", "SEC", "news"]
    confidence: float

class VerifiedDecision(BaseModel):
    action: str; reasoning: str; facts: list[Fact]
```

3. **异常值检测**：输出与历史模式偏差过大时自动触发二次验证。

```python
def detect_anomaly(d, history):
    avg = mean([x.position_size_pct for x in history])
    if d.position_size_pct > avg * 3:
        return AnomalyAlert(type="异常仓位", action="要求额外论证")
```

---

## 延伸阅读

- 这些技术选择背后的设计哲学 → [08 设计思路](./08-design-philosophy.md)
- 用 TradingAgents 验证这些原理 → [03 多智能体交易 - TradingAgents 深度剖析](./03-multi-agent-trading/tradingagents/README.md)
