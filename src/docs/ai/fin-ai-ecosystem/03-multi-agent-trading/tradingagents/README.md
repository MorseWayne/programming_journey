---
title: TradingAgents 专栏
icon: /assets/icons/project.svg
index: false
dir:
  order: 1
---

# TradingAgents：多智能体 LLM 金融交易框架

TradingAgents 是一个基于 **LangGraph** 多智能体协作框架的开源 LLM 金融交易决策系统。它将传统的量化分析流程拆解为多个专业化 AI Agent，模拟真实交易团队的协作模式：分析师搜集情报、研究员展开辩论、交易员制定计划、风控团队评估风险、管理层做出最终决策。

本专栏将通过源码剖析，深入讲解 TradingAgents 的架构设计、智能体协作机制和核心技术实现。

## 📚 系列文章

### 第一部分：架构与核心设计

1. **[多智能体交易系统架构全景](./01-architecture.md)**
   - 从传统量化到 AI Agent 交易的范式转变
   - LangGraph 状态图编排引擎
   - 系统分层架构与核心模块
   - LLM Provider 抽象层设计

### 第二部分：智能体角色

2. **[智能体角色体系设计](./02-agent-roles.md)**
   - 四大分析师：市场、社交、新闻、基本面
   - 多空研究员辩论机制
   - 风控三方辩论的设计哲学
   - 管理层决策与结构化输出

### 第三部分：工作流与数据流

3. **[端到端交易决策工作流](./03-workflow.md)**
   - 从数据采集到最终决策的完整链路
   - LangGraph 条件路由与状态传播
   - 事后反思与记忆系统
   - SQLite Checkpoint 断点续跑机制

### 第四部分：实战指南

4. **[使用方式与应用场景](./04-usage-and-scenarios.md)**
   - Python API 与 CLI 两种使用模式
   - 模型选择、辩论深度、数据源配置策略
   - 五大实战场景：每日信号、历史回测、研究辅助、组合审查、事件响应
   - 成本优化与生产部署建议

## 🌟 核心亮点

### 多智能体协作
- **角色专业化**：12+ 独立 AI Agent，各司其职
- **辩论驱动**：多头 vs 空头研究员辩论、激进 vs 中性 vs 保守风控三方辩论
- **层级决策**：分析师 → 研究员 → 交易员 → 风控 → 投资经理的完整决策链

### 灵活的 LLM 后端
- 统一抽象层支持 **OpenAI / Anthropic / Google Gemini / Azure**
- 可配置 reasoning effort（thinking budget）
- DeepSeek / Qwen / GLM 等国产模型支持

### 数据源适配
- **Alpha Vantage**：专业金融数据 API
- **Yahoo Finance**：免费、无需额外 API Key
- 按类别可独立配置：股票行情、技术指标、基本面、新闻

### 工程化设计
- **LangGraph**：基于状态图的编排引擎，支持复杂的条件路由
- **SQLite Checkpoint**：断点续跑，异常中断后可从最后成功步骤恢复
- **结构化输出**：ResearchManager、Trader、PortfolioManager 使用 Pydantic Schema 保证输出格式
- **事后反思**：每笔交易结束后记录决策得失，反馈到未来的分析中

<Catalog />
