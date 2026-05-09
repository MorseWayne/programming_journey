---
title: 金融终端
icon: /assets/icons/server.svg
order: 2
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

## 架构对比：数据管道

两条技术路线的核心差异在于"数据如何流动"：

```
┌─────────────────────────────────────────────────────────────────────┐
│                        架构对比：两种技术路线                         │
├─────────────────────────────┬───────────────────────────────────────┤
│     OpenBB (ODP 架构)        │      FinceptTerminal (原生桌面)        │
├─────────────────────────────┼───────────────────────────────────────┤
│                             │                                       │
│  ┌─────────────┐            │     ┌─────────────────────────┐       │
│  │  Data Source│            │     │   C++20 / Qt6 GUI        │       │
│  │  Adapters   │            │     │   (原生渲染, 无 Electron)  │       │
│  │  (100+)     │            │     └───────────┬─────────────┘       │
│  └──────┬──────┘            │                 │                     │
│         │                   │        ┌────────▼────────┐             │
│         ▼                   │        │ Embedded Python │             │
│  ┌─────────────┐            │        │  (QuantLib/AI)  │             │
│  │  ODP Core   │◄───────────┼────────┤  Script Engine  │             │
│  │  (统一数据层) │            │        └────────┬────────┘             │
│  │  REST/WS    │            │                 │                     │
│  └──────┬──────┘            │        ┌────────▼────────┐             │
│         │                   │        │  37 AI Agents   │             │
│    ┌────┴────┐              │        │  (本地 LLM/API) │             │
│    ▼         ▼              │        └─────────────────┘             │
│ ┌──────┐  ┌──────┐          │                                       │
│ │Python│  │ Web  │          │   特点: 单二进制, 启动秒级,            │
│ │ SDK  │  │ UI   │          │   全部计算在本地完成                    │
│ └──┬───┘  └──────┘          │                                       │
│    │                        │                                       │
│    ▼                        │                                       │
│ ┌──────┐                    │                                       │
│ │MCP   │                    │                                       │
│ │Server│                    │                                       │
│ └──────┘                    │                                       │
│                             │                                       │
│ 特点: 数据与表现分离,         │                                       │
│ 适合编程和自动化              │                                       │
└─────────────────────────────┴───────────────────────────────────────┘
```

**OpenBB 的 ODP 优势**：数据层独立，同一份数据可以同时给 Python 脚本、Web UI、Excel 插件和 MCP Server 使用。如果你想在公司内部搭建一个"数据底座"，让多个团队共享清洗后的数据，ODP 是更好的选择。

**FinceptTerminal 的原生优势**：全部计算在本地完成，没有网络延迟，适合盘中高频盯盘。C++ 层负责渲染和实时数据推送，嵌入式 Python 负责量化计算和 AI 推理，两者通过内部消息总线通信。

---

## 代码实战

### 用 OpenBB Python SDK 获取股票数据

OpenBB 的 Python SDK 是它最成熟的接口。以下示例展示如何获取历史价格和基本面数据：

```python
from openbb import obb

# 使用免费层即可, 无需登录也能访问 Yahoo Finance
obb.account.login(pat="your_pat_here")  # 可选, 解锁更多数据源

# 获取 AAPL 2024 年日线数据
data = obb.equity.price.historical(
    symbol="AAPL",
    interval="1d",
    start_date="2024-01-01",
    end_date="2024-12-31",
    provider="yfinance"
)

# 转换为 pandas DataFrame
df = data.to_df()
print(df.head())

# 获取年度利润表
income = obb.equity.fundamental.income(
    symbol="AAPL",
    limit=5,
    period="annual",
    provider="yfinance"
)

# 只看营收和净利润
print(income.to_df()[["revenue", "net_income"]])

# 获取期权链
options = obb.derivatives.options.chains(
    symbol="AAPL",
    provider="yfinance"
)
print(options.to_df().head())
```

**关键点**：`provider` 参数让你可以在不同数据源之间切换，比如把 `yfinance` 换成 `polygon` 或 `intrinio`，代码结构完全不变。这就是 ODP "一次接入"的价值。

### 在 FinceptTerminal 中写 Python 脚本

FinceptTerminal 内置了嵌入式 Python 解释器，可以直接调用终端的数据和量化库：

```python
# 在 FinceptTerminal -> Script Editor 中运行

# 1. 获取实时行情
price = terminal.data.get_last_price("AAPL")
print(f"AAPL Current Price: ${price}")

# 2. 使用内置 QuantLib 计算期权希腊值
from QuantLib import *

today = Date.today()
maturity = Date(20, 6, 2025)
calendar = UnitedStates(UnitedStates.NYSE)
day_count = Actual365Fixed()

spot = SimpleQuote(price)
strike_price = 180
payoff = PlainVanillaPayoff(Option.Call, strike_price)
exercise = EuropeanExercise(maturity)

option = EuropeanOption(payoff, exercise)
underlying = QuoteHandle(spot)

# 假设无风险利率 4.5%, 股息率 0.5%, 波动率 25%
risk_free = YieldTermStructureHandle(FlatForward(today, 0.045, day_count))
dividend = YieldTermStructureHandle(FlatForward(today, 0.005, day_count))
vol = BlackVolTermStructureHandle(BlackConstantVol(today, calendar, 0.25, day_count))

process = BlackScholesMertonProcess(QuoteHandle(spot), dividend, risk_free, vol)

# 计算理论价格
option.setPricingEngine(AnalyticEuropeanEngine(process))
theoretical = option.NPV()
delta = option.delta()

print(f"Theoretical Price: ${theoretical:.2f}")
print(f"Delta: {delta:.4f}")

# 3. 将结果推送到终端面板
terminal.portfolio.update_greek(
    symbol="AAPL",
    delta=delta,
    gamma=option.gamma(),
    theta=option.theta(),
    vega=option.vega()
)
```

**关键点**：FinceptTerminal 的 Python 不是外部调用，而是**嵌入式运行**。脚本可以直接读写终端的内存数据，延迟极低，适合把自定义计算集成到工作流中。

---

## 部署方式对比

三个项目的上手路径完全不同：

| 维度 | OpenBB | FinceptTerminal | Ghostfolio |
|------|--------|-----------------|------------|
| **安装方式** | `pip install openbb` | 下载预编译二进制 | `docker compose up` |
| **系统要求** | Python 3.10+ | Windows 10+/macOS 12+/Linux | Docker + PostgreSQL |
| **启动时间** | 5-10 秒 | <2 秒 | 10-15 秒（容器冷启动） |
| **离线使用** | 部分（需缓存数据） | 完全离线 | 完全离线 |
| **更新方式** | `pip install -U` | 自动更新 / 手动下载 | `docker pull` |
| **网络依赖** | 高（实时拉取数据） | 低（本地计算为主） | 中（拉取行情） |
| **企业部署** | 支持 VPC 私有化 | 需商用授权 | 自托管 |
| **移动端** | Web UI 响应式 | 暂无 | 响应式 Web |

**实际建议**：
- OpenBB 最适合已经配置好 Python 环境的量化环境，一行命令就能加入 Jupyter workflow。
- FinceptTerminal 最适合不想配环境的 Windows 用户，下载 `.exe` 双击即用。
- Ghostfolio 适合有 Nas 或树莓派的用户，Docker 镜像一拉，长期运行无压力。

---

## 数据源生态覆盖

| 数据源 | 类型 | OpenBB | FinceptTerminal | Ghostfolio |
|--------|------|:------:|:---------------:|:----------:|
| Yahoo Finance | 免费行情 | ✅ | ✅ | ✅ |
| Alpha Vantage | 基本面 | ✅ | ❌ | ❌ |
| Polygon.io | 实时美股 | ✅ | ✅ | ❌ |
| FRED | 宏观数据 | ✅ | ✅ | ❌ |
| IMF / World Bank | 全球经济 | ❌ | ✅ | ❌ |
| DBnomics | 学术数据 | ✅ | ✅ | ❌ |
| AkShare | A股数据 | 社区插件 | ✅ | ❌ |
| OANDA | 外汇 | ✅ | ❌ | ❌ |
| Kraken | 加密货币 | ✅ | ✅ | ❌ |
| IBKR / Alpaca | 券商直连 | ❌ | ✅ | ❌ |
| 自定义 CSV | 本地数据 | ✅ | ✅ | ✅ |

**解读**：
- OpenBB 在**美股数据源**上覆盖最全，Alpha Vantage、Polygon、OANDA 等都可以通过 provider 参数切换。
- FinceptTerminal 在**宏观和 A 股**上更有优势，AkShare 和 IMF 数据是原生集成。
- Ghostfolio 只关注持仓跟踪，行情来源以 Yahoo Finance 为主，但支持手动导入任何 CSV。

---

## 深度选型：具体场景分析

除了"我会不会写 Python"这个维度，实际选型还要看**数据在哪里、计算在哪里、决策在哪里**。

### 场景一：量化研究员的日常 Workflow

你每天在 Jupyter Notebook 里跑回测，需要频繁切换数据源（今天用 Yahoo 做原型，明天用 Polygon 跑实盘），还要把结果自动同步到团队的共享数据库。

**选 OpenBB**。ODP 的 provider 抽象让你切换数据源时不需要改业务代码，`obb.equity.price.historical()` 既可以接免费源也可以接付费源。配合 MCP Server，你的 AI Agent 可以直接调用 OpenBB 获取数据，不需要再封装一层 API。

### 场景二：盘中盯盘 + AI 辅助决策

你需要一个常驻桌面的窗口，实时显示自选股行情，同时让"巴菲特 Agent"点评你的持仓，让"宏观 Agent"提醒你美联储决议风险。

**选 FinceptTerminal**。原生桌面性能意味着 100ms 内的 UI 刷新，37 个 AI Agent 本地运行，不会因为网络波动中断。券商直连功能让你看到信号后可以一键下单。

### 场景三：家庭财富管理

你有 3 个券商账户（A 股、港股、美股），想统一看总资产的配置比例，定期再平衡。

**选 Ghostfolio**。多账户聚合是它的核心能力，ROAI 绩效计算覆盖了你需要的时间维度。数据存在自己的 Nas 上，隐私性最好。

### 场景四：搭建公司内部投研平台

你们团队有 10 个研究员，需要统一的数据源管理、权限控制和审计日志。

**选 OpenBB**。SOC2 Type II 合规、RBAC、VPC 私有化部署都是企业级功能。ODP 作为数据底座，可以对接你们内部的因子数据库，上层再挂 Web UI 给非技术同事使用。

### 场景五：A 股 + 量化定价

你需要 A 股实时数据，同时用 QuantLib 做固收和衍生品定价。

**选 FinceptTerminal**。AkShare 提供 A 股免费数据，内置 QuantLib 18 个模块覆盖定价需求。C++ 层的性能也能支撑日内级别的计算。

### 场景六：快速验证一个交易想法

你周末有一个灵感，想花 30 分钟验证，不想配环境。

**OpenBB**（如果你电脑已有 Python）：`pip install openbb`，5 分钟后就能拉数据画图。
**FinceptTerminal**（如果你电脑没有 Python）：下载安装包，双击启动，用内置脚本编辑器写逻辑。
两者在这个场景下差距不大，取决于你的机器环境。

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
