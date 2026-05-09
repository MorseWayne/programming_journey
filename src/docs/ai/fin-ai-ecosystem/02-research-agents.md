---
title: AI 研究 Agent
icon: /assets/icons/brain.svg
index: false
dir:
  order: 3
article: false
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

## 选型建议

```
需要自动生成专业研报（PDF）？
├── 是 → FinRobot（8 Agent + 自动研报）
└── 否 → 需要自主深度研究？
          ├── 是 → Dexter（最智能，但需要付费数据源）
          └── 否 → LangAlpha（灵活，适合研究/探索场景）
```

---

## 延伸阅读

- 这些研究 Agent 的分析结果如何用于交易决策？→ [03 多智能体交易](./03-multi-agent-trading/README.md)
- 如何给 Agent 接入更多数据？→ [05 MCP 工具生态](./05-mcp-tools.md)
