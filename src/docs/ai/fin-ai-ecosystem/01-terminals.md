---
title: 金融终端
icon: /assets/icons/server.svg
index: false
dir:
  order: 2
article: false
---

# 金融终端 —— Bloomberg 的开源替代

**一句话**：如果你想找一个免费的、专业的看盘和分析工具，从这里开始。

这些项目对标 Bloomberg Terminal / Refinitiv Eikon / FactSet，但完全开源。它们提供实时行情、基本面分析、技术图表、宏观经济数据等功能，适合独立交易员、研究员和不想为终端付费的分析师。

---

## 核心项目

### 1. OpenBB — 最成熟的开源投研平台

| | |
|:---|:---|
| **GitHub** | [OpenBB-finance/OpenBB](https://github.com/OpenBB-finance/OpenBB) |
| **Stars** | 65K+ |
| **技术栈** | Python, FastAPI |
| **许可证** | AGPL-3.0 |

OpenBB 的前身是 Gamestonk Terminal（一个 Reddit 散户在 GameStop 热潮中写的看盘脚本），如今已演变为最成熟的开源投研平台。

**核心能力**：
- **100+ 数据源**：Yahoo Finance、Alpha Vantage、FRED、OANDA、Polygon 等
- **覆盖全资产类别**：股票、期权、加密货币、外汇、固收、宏观、另类数据
- **ODP（Open Data Platform）**："一次接入，到处消费"的数据集成层——同一份数据可以喂给 Python 脚本、Web UI、Excel 插件，以及 AI Agent 的 MCP Server
- **企业级功能**：SOC2 Type II 合规、私有化部署（VPC）、RBAC 权限控制

**适合人群**：量化研究员、需要编程能力的分析师

**上手难度**：需要 Python 基础

---

### 2. FinceptTerminal — 37 个 AI Agent 的原生桌面终端

| | |
|:---|:---|
| **GitHub** | [Fincept-Corporation/FinceptTerminal](https://github.com/Fincept-Corporation/FinceptTerminal) |
| **Stars** | 20K+ |
| **技术栈** | C++20, Qt6, Python（嵌入式） |
| **许可证** | AGPL-3.0（商用需授权） |

FinceptTerminal 是目前**唯一用 C++ 原生编写的**金融终端，没有 Electron 性能开销，启动速度秒级。它的最大特色是内置了 **37 个 AI Agent**。

**核心能力**：
- **原生桌面性能**：C++20 + Qt6，单二进制分发，跨 Windows / macOS / Linux
- **37 个 AI Agent**：
  - 🧠 **投资大师人格**：巴菲特（价值投资）、格雷厄姆（深度价值）、林奇（成长股）、芒格（优质企业）、卡拉曼（安全边际）、马克斯（周期思维）
  - 📊 **经济学家 Agent**：宏观经济分析、利率预测
  - 🌍 **地缘政治 Agent**：全球风险分析、海事追踪、卫星数据
- **100+ 数据连接器**：DBnomics、Polygon、Kraken、Yahoo Finance、FRED、IMF、World Bank、AkShare（A股）
- **16 家券商集成**：IBKR、Alpaca、Zerodha、Angel One 等，支持真实交易
- **可视化工作流**：节点编辑器拖拽搭建分析管线，支持 MCP 工具集成
- **QuantLib 套件**：18 个量化分析模块（定价、风控、随机、波动率、固收）

**适合人群**：不想写代码的分析师、需要 GUI 的个人投资者

**上手难度**：下载即用（有预编译安装包）

---

### 3. Ghostfolio — 开源财富管理

| | |
|:---|:---|
| **GitHub** | [ghostfolio/ghostfolio](https://github.com/ghostfolio/ghostfolio) |
| **Stars** | 8K+ |
| **技术栈** | TypeScript, NestJS, Angular, PostgreSQL |
| **许可证** | AGPL-3.0 |

Ghostfolio 侧重点不同——它不是看盘工具，而是**投资组合管理和财富追踪**。

**核心能力**：
- 多账户管理（多个券商账户统一视图）
- 组合绩效（ROAI：今日/本周/本月/本年/5年/历史最大）
- 静态风险分析（持仓集中度、行业敞口）
- 数据隐私优先（自托管，数据在自己服务器上）
- 已有 AI Agent 社区集成（Fortio、ghostfolio-agent）

**适合人群**：Buy & Hold 投资者、关注组合健康度的个人

**上手难度**：需要 Docker 部署

---

## 选型建议

| 你的需求 | 推荐 |
|---------|------|
| 我是量化研究员，习惯写 Python | **OpenBB** |
| 我想要一个桌面 App，开箱即用 | **FinceptTerminal** |
| 我主要想追踪持仓收益 | **Ghostfolio** |
| 我想要 Bloomberg 级别的数据覆盖面 | **OpenBB + FinceptTerminal 配合使用** |

---

## 延伸阅读

- 想了解 AI 如何增强终端体验？→ [02 AI 研究 Agent](./02-research-agents.md)
- 想用 Agent 管理持仓？→ [04 多通道 Copilot](./04-copilots.md)
