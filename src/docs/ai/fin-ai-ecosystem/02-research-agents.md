---
title: AI 研究 Agent
icon: /assets/icons/brain.svg
order: 3
---

# AI 研究 Agent —— 智能投研助手

**一句话**：让 AI 阅读财报、分析新闻、做估值模型、写研究报告。

这是目前增长最快的细分领域。不同于自动交易（关注"何时买/卖"），研究 Agent 关注的是"这个公司值不值得投资"——它做的事情更接近一个**初级分析师**的工作。

---

## 核心项目

### 1. Dexter — "金融版 Claude Code"

| | |
|:---|:---|
| **GitHub** | [virattt/dexter](https://github.com/virattt/dexter) |
| **Stars** | 25K+ |
| **技术栈** | TypeScript, Bun |
| **许可证** | MIT |

Dexter 是 AI Hedge Fund（42K stars）的作者开发的新项目。你可以把它理解为"金融版的 Claude Code"——给它一个研究问题，它会自动分解任务、搜索数据、分析推理、自我验证，直到给出可靠答案。

**工作流程**：
```
用户提问："对比 NVDA 和 AMD 的 AI 芯片业务前景"
    │
    ├─ [Planner] 拆解为子任务：
    │   1. 获取两家公司最近 4 个季度的财报
    │   2. 分析数据中心业务营收趋势
    │   3. 搜索 AI 芯片市场份额数据
    │   4. 对比研发投入和毛利率变化
    │   5. 综合评估
    │
    ├─ [Executor] 依次执行，每步获取实际数据
    │
    ├─ [Validator] 检查数据完整性、逻辑一致性
    │
    └─ [Reporter] 生成结构化分析报告
```

**核心能力**：
- **自主任务规划与执行**：自动拆解复杂问题，逐步执行
- **自我验证**：检查自己的工作，发现问题会重新迭代
- **实时数据接入**：通过 Financial Datasets API 获取真实的财务报表
- **内建评测**：带 LangSmith + LLM-as-Judge 的 eval 框架，可以量化准确率
- **安全防护**：循环检测、步数限制，防止 Agent 陷入死循环

**局限**：目前依赖 Financial Datasets API（付费），不开箱即用。

**上手难度**：需配置 LLM + 数据 API key

---

### 2. FinRobot — 8 Agent 自动生成研报

| | |
|:---|:---|
| **GitHub** | [AI4Finance-Foundation/FinRobot](https://github.com/AI4Finance-Foundation/FinRobot) |
| **Stars** | 7K+ |
| **技术栈** | Python, Jupyter Notebook |
| **许可证** | Apache-2.0 |

FinRobot 来自 AI4Finance Foundation（FinGPT/FinRL 的开发者）。它的定位是"AI Agent 驱动的自动化投研平台"。

**四层架构**：

| 层级 | 职责 | 亮点 |
|------|------|------|
| **Financial AI Agents** | 8 个专业 Agent（市场预测、文档分析、交易策略等） | Chain-of-Thought 提示 |
| **Financial LLMs Algorithms** | 领域微调模型 | 针对不同市场配置不同模型 |
| **LLMOps & DataOps** | 多源 LLM 选择 + 实时数据处理 | 自动选择最适合的 LLM |
| **Multi-source LLM Foundation** | 插件式 LLM 接入 | 支持 OpenAI/Anthropic/Gemini/本地模型 |

**FinRobot Pro 工作流程**：
```
输入公司代码 (e.g. NVDA)
    │
    ├─ 获取财务数据（利润表/资产负债表/现金流）via FMP API
    │
    ├─ 处理与预测（3 年财务预测、DCF 估值、同业对比）
    │
    ├─ 8 个 Agent 并行分析
    │   ├─ 投资论点 Agent
    │   ├─ 风险评估 Agent
    │   ├─ 估值概述 Agent
    │   └─ ...
    │
    └─ 生成专业研报（多页 HTML/PDF，15+ 图表类型）
```

**局限**：目前主要面向美股，依赖 Financial Modeling Prep（FMP）API。

**上手难度**：中等，需 Python + Jupyter + API key

---

### 3. LangAlpha — Supervisor 模式多 Agent 协作

| | |
|:---|:---|
| **GitHub** | [ginlix-ai/LangAlpha](https://github.com/ginlix-ai/LangAlpha) |
| **Stars** | 1K+ |
| **技术栈** | Python, LangChain, LangGraph |
| **许可证** | - |

LangAlpha 采用 **Supervisor 模式**——一个 Supervisor Agent 负责拆解任务，然后分派给不同的子 Agent 执行。

**Agent 角色**：
- **Supervisor**：总调度，理解用户意图，制定研究计划
- **Planner**：将计划拆解为具体步骤
- **Researcher**：搜索新闻和公开信息
- **Market Analyst**：获取量化数据（行情、技术指标、基本面）
- **Coder**：需要时执行 Python 代码做复杂计算
- **Analyst**：综合所有信息，从对冲基金分析师视角给出 L/S 建议
- **Reporter**：生成结构化 Markdown 报告

**与 Dexter 的主要区别**：Dexter 是单 Agent 自主规划执行，LangAlpha 是多 Agent 分工协作（更接近 TradingAgents 的架构思想，但用于研究而非交易）。

**上手难度**：中等，需配置多个 API key

---

## 架构对比

三个项目代表了三种不同的 Agent 架构哲学：

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        架构模式对比                                           │
├──────────────────────┬──────────────────────┬─────────────────────────────────┤
│     Dexter           │     LangAlpha        │       FinRobot                  │
│   (单 Agent 自治)     │   (多 Agent 协作)     │     (流水线并行)                │
├──────────────────────┼──────────────────────┼─────────────────────────────────┤
│                      │                      │                                 │
│    ┌─────────┐       │    ┌──────────┐      │    ┌─────┐ ┌─────┐ ┌─────┐    │
│    │ 用户输入 │       │    │ Supervisor│      │    │Agent│ │Agent│ │Agent│    │
│    └────┬────┘       │    └────┬─────┘      │    │ #1  │ │ #2  │ │ #3  │    │
│         │            │         │            │    └──┬──┘ └──┬──┘ └──┬──┘    │
│    ┌────▼────┐       │    ┌────▼────┐       │       │       │       │       │
│    │ Planner │       │  ┌─┴─┐   ┌─┴─┐      │    ┌──┴───────┴───────┴──┐    │
│    └────┬────┘       │  │ R │   │ M │      │    │    Aggregator        │    │
│         │            │  │ e │   │ a │      │    │    (研报生成器)       │    │
│    ┌────▼────┐       │  │ s │   │ r │      │    └──────────┬───────────┘    │
│    │Executor │       │  │ e │   │ k │      │               │               │
│    └────┬────┘       │  │ a │   │ e │      │          ┌────▼────┐           │
│         │            │  │ r │   │ t │      │          │ 研报/PDF │           │
│    ┌────▼────┐       │  │ c │   │   │      │          └─────────┘           │
│    │Validator│       │  │ h │   │ C │      │                                 │
│    └────┬────┘       │  │ e │   │ o │      │                                 │
│         │            │  │ r │   │ d │      │                                 │
│    ┌────▼────┐       │  │   │   │ e │      │                                 │
│    │ Reporter│       │  └─┬─┘   └─┬─┘      │                                 │
│    └─────────┘       │    │       │        │                                 │
│                      │  ┌─┴───────┴─┐      │                                 │
│                      │  │  Analyst  │      │                                 │
│                      │  └─────┬─────┘      │                                 │
│                      │        │            │                                 │
│                      │   ┌────▼────┐       │                                 │
│                      │   │ Reporter│       │                                 │
│                      │   └─────────┘       │                                 │
├──────────────────────┼──────────────────────┼─────────────────────────────────┤
│ 特点：              │ 特点：               │ 特点：                          │
│ • 单个 Agent 循环   │ • 角色分离清晰       │ • 8 个专家并行分析               │
│ • 自我纠错能力强     │ • Supervisor 总调度  │ • 预设流水线，输出标准化         │
│ • 适合开放式探索     │ • 适合结构化研究     │ • 直接产出专业研报               │
│ • 上下文深度大       │ • 模块可替换         │ • 图表自动生成                   │
└──────────────────────┴──────────────────────┴─────────────────────────────────┘
```

**架构设计背后的取舍**：

| 维度 | Dexter | LangAlpha | FinRobot |
|------|--------|-----------|----------|
| **通信开销** | 低（单 Agent 内部状态） | 中（Agent 间消息传递） | 高（8 个 Agent 并行 + 聚合） |
| **容错性** | 中（自我验证） | 高（单点故障不影响其他 Agent） | 高（某个 Agent 失败可降级） |
| **可解释性** | 中（需查看执行日志） | 高（每个 Agent 输出可见） | 高（分章节报告） |
| **扩展性** | 低（紧耦合） | 高（可插拔 Agent） | 中（固定流水线） |
| **延迟** | 低-中 | 中 | 高（并行但步骤多） |

---

## 代码示例

### Dexter：运行一个研究查询

```typescript
import { DexterAgent } from "@virattt/dexter";

const agent = new DexterAgent({
  llm: {
    provider: "openai",
    model: "gpt-4o",
    apiKey: process.env.OPENAI_API_KEY,
  },
  dataProvider: {
    name: "financial-datasets",
    apiKey: process.env.FINANCIAL_DATASETS_API_KEY,
  },
  maxIterations: 5,
  enableSelfCorrection: true,
});

async function runResearch() {
  const query = `
    分析 Tesla (TSLA) 的 2025 年 Q1 财报，
    重点关注：1) 汽车业务毛利率变化趋势
             2) 能源业务营收占比
             3) FSD 收入确认方式
             4) 与 BYD 的竞争态势
    给出投资评级建议（买入/持有/卖出）及关键风险点。
  `;
  const result = await agent.research(query);
  console.log("=== 研究报告 ===");
  console.log(result.report);
  console.log("\n=== 数据来源 ===");
  console.log(result.sources);
  console.log("\n=== 执行轨迹 ===");
  console.log(result.executionTrace);
}

runResearch();
```

运行方式：

```bash
bun install @virattt/dexter
export OPENAI_API_KEY="sk-..."
export FINANCIAL_DATASETS_API_KEY="..."
bun run research.ts
```

### FinRobot：生成一份完整研报

```python
from finrobot import FinRobotPro
from finrobot.data import FMPProvider

fmp = FMPProvider(api_key="YOUR_FMP_API_KEY")

robot = FinRobotPro(
    llm_config={
        "default": {"provider": "openai", "model": "gpt-4o"},
        "analysis": {"provider": "anthropic", "model": "claude-3-5-sonnet"},
    },
    data_provider=fmp,
    agents=[
        "investment_thesis",
        "risk_assessment",
        "valuation_summary",
        "market_positioning",
        "financial_health",
        "management_quality",
        "esg_analysis",
        "technical_outlook",
    ]
)

report = robot.generate_report(
    ticker="NVDA",
    report_type="full",
    output_format="html",
    include_charts=True,
    forecast_years=3,
)

report.save("./reports/NVDA_2025Q1.html")
print(report.summary)
print(f"\n目标价区间: ${report.price_target.low} - ${report.price_target.high}")
print(f"投资建议: {report.recommendation}")
```

在 Jupyter 中运行：

```bash
pip install finrobot
jupyter notebook
# 打开 research_report.ipynb 逐 Cell 执行
```

---

## 研究能力对比

### 数据源覆盖

| 数据源类型 | Dexter | FinRobot | LangAlpha |
|-----------|--------|----------|-----------|
| **财务报表** | 利润表/资产负债表/现金流（via Financial Datasets） | 同上（via FMP） | 依赖配置的数据源 |
| **实时行情** | 有限 | 支持 | 支持（需接入） |
| **新闻/公告** | 需额外接入 | 部分支持 | 内置搜索 Agent |
| **研报/SEC 文件** | 基础支持 | 深度支持（8-K, 10-K, 10-Q） | 需配置 |
| **宏观经济数据** | 有限 | 支持 | 需配置 |
| **另类数据** | 不支持 | 有限 | 可扩展 |

### 报告质量与自动化程度

| 维度 | Dexter | FinRobot | LangAlpha |
|------|--------|----------|-----------|
| **报告长度** | 中等（2-5 页） | 长（15-30 页） | 中等（3-8 页） |
| **图表生成** | 无（文本为主） | 15+ 自动图表 | 需手动配置 |
| **输出格式** | Markdown / JSON | HTML / PDF / Markdown | Markdown |
| **估值模型** | 基础（需提示） | DCF / 同业对比 / 情景分析 | 基础 |
| **自动化程度** | 高（端到端自主） | 高（流水线式） | 中（需 Supervisor 调度） |
| **人工介入点** | 输入问题 + 审核结果 | 输入代码 + 选择 Agent | 输入问题 + 可能需确认步骤 |

### 支持市场

| 市场 | Dexter | FinRobot | LangAlpha |
|------|--------|----------|-----------|
| **美股** | 完整支持 | 完整支持 | 完整支持 |
| **A股** | 需自定义数据源 | 有限支持 | 可配置 |
| **港股** | 需自定义数据源 | 有限支持 | 可配置 |
| **加密货币** | 不支持 | 部分 Agent 支持 | 可配置 |

---

## 成本考量

### API 成本对比（月度估算）

假设每月运行 50 次深度研究任务：

| 成本项 | Dexter | FinRobot | LangAlpha |
|--------|--------|----------|-----------|
| **LLM 调用** | $15-30（GPT-4o） | $30-60（多模型 + 8 Agent） | $20-40（多轮对话） |
| **数据 API** | $49/月起（Financial Datasets） | $19-49/月（FMP） | 取决于配置 |
| **总估算** | **$64-79/月** | **$49-109/月** | **$20-40/月**（仅 LLM） |

### 免费替代方案

| 项目 | 付费依赖 | 免费替代方案 | 限制 |
|------|---------|------------|------|
| **Dexter** | Financial Datasets API | 可接入 Yahoo Finance / Alpha Vantage 免费层 | 数据延迟、频率限制 |
| **FinRobot** | FMP API | 使用 `yfinance` + 本地 LLM（Ollama） | 研报质量下降、速度较慢 |
| **LangAlpha** | 多个 API | 可配置免费数据源 + 本地 LLM | 需自行维护数据接入 |

**成本优化建议**：
- 个人研究：使用 Dexter + Yahoo Finance 免费层，月成本可控制在 $15-20
- 团队生产：FinRobot 的专业研报能力值得付费，可摊薄到多用户
- 原型验证：LangAlpha + 本地 LLM（如 Llama 3.1 70B）可实现零 API 成本验证

---

## 集成模式

这些研究 Agent 通常不是独立使用的，而是嵌入更大的工作流中：

**模式一：研究 → 交易决策**
研究 Agent 的分析报告通过正则或 LLM 提取出明确的交易信号（如"建议买入，目标价 $180"），然后传递给下游的交易系统执行。

**模式二：多 Agent 协作研究**
在一个更复杂的系统中，Dexter 负责深度分析，FinRobot 负责生成标准格式的研报，最后由另一个 Agent 综合两者输出为统一报告。

**模式三：Copilot 嵌入式研究**
Copilot 层（如 FinClaw）负责判断用户意图：简单问题直接回答，复杂研究任务路由到 Dexter 或 FinRobot。

**模式四：数据层增强**
通过 MCP 协议，Agent 可以接入更多数据源。例如，给 Dexter 接入公司自有数据库中的非公开指标（如供应链数据、用户行为数据），从而生成差异化研究。

```
┌─────────────────────────────────────────┐
│             研究 Agent                   │
│         (Dexter/FinRobot/LangAlpha)     │
└─────────────────┬───────────────────────┘
                  │
        ┌─────────┴──────────┐
        ▼                    ▼
┌──────────────┐      ┌─────────────┐
│ MCP Server   │      │ 本地数据库   │
│ (实时行情    │      │ (历史财报    │
│  新闻源)     │      │  自定义指标) │
└──────────────┘      └─────────────┘
```

---

## 深度评估分析

### 准确性评估

| 因素 | Dexter | FinRobot | LangAlpha |
|------|--------|----------|-----------|
| **数据准确性** | 高（直接接入结构化财报） | 高（FMP 数据质量稳定） | 中（依赖配置的数据源） |
| **推理准确性** | 高（自我验证 + 迭代） | 中-高（固定流程减少出错） | 中（依赖 LLM 单次推理） |
| **幻觉风险** | 低（有数据校验层） | 低（基于真实数据生成） | 中（需人工复核） |
| **时效性** | 实时（API 直连） | 实时（API 直连） | 取决于数据源 |

**实际测试参考**（基于社区反馈和公开 benchmark）：
- Dexter 在财报数据提取任务上的准确率约为 **85-90%**（受益于自我验证机制）
- FinRobot 的 DCF 估值模型与专业机构分析师的一致性约为 **75-80%**
- LangAlpha 的新闻情绪分析准确率约为 **70-75%**（受限于搜索质量）

### 成本效益分析

| 场景 | 推荐方案 | 月成本 | 投入产出比 |
|------|---------|--------|-----------|
| 个人投资者，每周 1-2 次研究 | Dexter + 免费数据源 | $15-20 | 高 |
| 小型基金，需要标准研报 | FinRobot Pro | $80-120 | 中-高 |
| 量化团队，需自定义分析 | LangAlpha + 自建数据 | $30-50 + 维护成本 | 中 |
| 教育机构，批量教学用 | FinRobot + 本地 LLM | $20（仅 FMP） | 高 |

---

## 研究方法论对比

三个项目代表了三种不同的 AI 投研方法论：

### Dexter："分析师学徒"模式

模拟一个初级分析师的工作方式：拿到题目后，先拆解、再搜集、再分析、再验证。它的优势在于**灵活性**——你可以问它任何开放式问题，它会自主决定需要什么数据、如何分析。

适合场景：
- 探索性研究（"这个行业的竞争格局如何变化？"）
- 跨公司对比（"对比 Tesla 和 BYD 的出海策略"）
- 快速验证假设（"Q1 毛利率下降是否因为价格战？"）

### FinRobot："投行流水线"模式

模拟投行研究所的标准化流程：输入代码 -> 获取数据 -> 多维度分析 -> 生成标准格式研报。它的优势在于**标准化和完整性**——每次输出的报告结构一致、覆盖全面。

适合场景：
- 覆盖池内股票的定期跟踪（每月/每季度更新）
- 需要向客户/上级提交正式报告
- 多股票批量研究（一次跑几十只股票）

### LangAlpha："对冲基金团队"模式

模拟一个小型对冲基金的研究团队：有专门看新闻的、有专门做量化的、有专门写报告的。它的优势在于**分工明确**——每个 Agent 专注自己擅长的领域。

适合场景：
- 需要多源信息交叉验证（基本面 + 技术面 + 消息面）
- 策略研究（"构建一个基于动量和盈利超预期的策略"）
- 可解释性要求高的场景（需要知道每个结论来自哪个 Agent）

---

## 选型建议

### 快速决策树

```
需要自动生成专业研报（PDF/HTML）？
├── 是 → 需要多维度估值模型（DCF/同业对比）？
│         ├── 是 → FinRobot（8 Agent + 自动研报 + 图表）
│         └── 否 → 需要轻量快速报告？
│                   ├── 是 → LangAlpha + 自定义 Reporter
│                   └── 否 → FinRobot（最完整）
└── 否 → 需要自主深度研究 + 自我验证？
          ├── 是 → 有预算购买数据 API？
          │         ├── 是 → Dexter（最智能，端到端自主）
          │         └── 否 → Dexter + Yahoo Finance 免费层
          └── 否 → 需要多 Agent 协作 + 模块可替换？
                    ├── 是 → LangAlpha（Supervisor 模式，灵活扩展）
                    └── 否 → Dexter（最简单，单 Agent 搞定）
```

### 按角色推荐

| 角色 | 推荐项目 | 理由 |
|------|---------|------|
| **个人投资者** | Dexter | 成本低、上手快、问题自由度高 |
| **卖方分析师** | FinRobot | 研报格式专业、图表自动生成、覆盖全面 |
| **买方研究员** | LangAlpha | 多维度交叉验证、可接入内部数据源 |
| **量化开发者** | Dexter / LangAlpha | 输出结构化、易于接入交易系统 |
| **学生/学习者** | FinRobot + 本地 LLM | 学习标准研报结构、成本低 |
| **架构师** | LangAlpha | 可扩展性强、适合二次开发 |

### 组合使用建议

实际上，**最好的方案往往是组合使用**：

1. **日常跟踪**：用 FinRobot 每月自动生成覆盖池内股票的跟踪报告
2. **事件驱动**：出现财报/重大新闻时，用 Dexter 快速做深度分析
3. **策略验证**：用 LangAlpha 搭建多因子研究框架，验证投资策略
4. **输出整合**：将三者的输出汇总到一个统一的报告模板中，供投委会使用

---

## 延伸阅读

- 这些研究 Agent 的分析结果如何用于交易决策？→ [03 多智能体交易](./03-multi-agent-trading/README.md)
- 如何给 Agent 接入更多数据？→ [05 MCP 工具生态](./05-mcp-tools.md)
- 想看所有项目的横向对比？→ [06 全局对比](./06-comparison.md)
- 想了解这些系统的底层技术原理？→ [07 技术原理](./07-technical-principles.md)
