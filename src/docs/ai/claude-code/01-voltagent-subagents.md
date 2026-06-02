---
title: VoltAgent subagents 配置与使用
icon: /assets/icons/programming.svg
order: 1
---

# VoltAgent / awesome-claude-code-subagents 配置与使用

[`VoltAgent/awesome-claude-code-subagents`](https://github.com/VoltAgent/awesome-claude-code-subagents) 是一个面向 Claude Code 的社区 subagent 集合。它不是新的运行时，而是一批可被 Claude Code 原生加载的 agent 定义和插件包。

可以把它理解为：给 Claude Code 增加一组可复用的“专家角色”，例如代码审查、TypeScript、Python、DevOps、安全审计、数据分析、产品、研究和多 agent 编排等。

## 它解决什么问题？

Claude Code 官方已经支持 subagents，但手动创建每个专家角色会比较繁琐。VoltAgent 做的是：

- 把常见工程角色整理成现成 agent；
- 按能力域拆成多个 Claude Code plugin；
- 支持全局安装、项目安装、交互式选择和 Claude Code 内部安装；
- 让用户用自然语言或 `@agent` 直接调用这些角色。

## 推荐安装方式：Claude Code Plugin

最推荐把它作为 Claude Code 插件市场添加：

```bash
claude plugin marketplace add VoltAgent/awesome-claude-code-subagents
```

然后按需安装插件包：

```bash
claude plugin install voltagent-lang
claude plugin install voltagent-qa-sec
```

如果是在已经打开的 Claude Code 会话里安装，安装后执行：

```text
/reload-plugins
```

也可以直接重启 Claude Code。

## 插件包分类

| Plugin | 内容定位 | 典型 agent |
|---|---|---|
| `voltagent-core-dev` | 日常开发 | backend、frontend、fullstack、mobile、API |
| `voltagent-lang` | 语言与框架专家 | TypeScript、Python、Go、Rust、Java、React、Vue |
| `voltagent-infra` | 基础设施与运维 | Docker、Kubernetes、Terraform、SRE、Cloud |
| `voltagent-qa-sec` | 质量、安全与测试 | code-reviewer、security-auditor、debugger、test-automator |
| `voltagent-data-ai` | 数据、机器学习与 AI | data-engineer、mlops、llm-architect |
| `voltagent-dev-exp` | 开发者体验 | docs、build、CLI、refactor、DX |
| `voltagent-domains` | 专门领域 | blockchain、fintech、IoT、payment、game |
| `voltagent-biz` | 产品与业务 | product、legal、PM、UX research |
| `voltagent-meta` | 编排与多 agent workflow | orchestration、workflow、meta agents |
| `voltagent-research` | 研究与分析 | market research、competitive analysis、trend |

仓库 README 特别提示：`voltagent-meta` 这类编排型 agent 最好和其他分类一起安装，因为它们通常需要调用或组织其他角色。

## 推荐的起步组合

日常编码可以先装这几个：

```bash
claude plugin marketplace add VoltAgent/awesome-claude-code-subagents
claude plugin install voltagent-core-dev
claude plugin install voltagent-lang
claude plugin install voltagent-qa-sec
claude plugin install voltagent-meta
```

这样会覆盖大部分常见需求：实现、语言专家、代码审查、安全、测试和基础编排。

## 手动安装方式

如果不想通过 plugin marketplace，也可以直接复制 agent 文件。

先克隆仓库：

```bash
git clone https://github.com/VoltAgent/awesome-claude-code-subagents.git
cd awesome-claude-code-subagents
```

然后把需要的 `.md` 文件复制到 Claude Code 的 agent 目录：

```bash
# 全局可用
mkdir -p ~/.claude/agents
cp categories/04-quality-security/code-reviewer.md ~/.claude/agents/
cp categories/02-language-specialists/typescript-pro.md ~/.claude/agents/

# 当前项目可用
mkdir -p .claude/agents
cp categories/04-quality-security/code-reviewer.md .claude/agents/
```

路径含义：

| 位置 | 作用域 |
|---|---|
| `~/.claude/agents/` | 当前用户所有项目可用 |
| `.claude/agents/` | 当前项目可用，适合团队共享 |

手动新增或修改 agent 文件后，通常需要重启 Claude Code 才能加载。

## 交互式 installer

仓库还提供 `install-agents.sh`，可以交互式选择分类和 agent。

克隆后运行：

```bash
git clone https://github.com/VoltAgent/awesome-claude-code-subagents.git
cd awesome-claude-code-subagents
./install-agents.sh
```

不克隆也可以直接下载脚本：

```bash
curl -sO https://raw.githubusercontent.com/VoltAgent/awesome-claude-code-subagents/main/install-agents.sh
chmod +x install-agents.sh
./install-agents.sh
```

脚本会引导你选择：

- 全局安装：`~/.claude/agents/`
- 项目安装：`.claude/agents/`
- 本地仓库源或 GitHub 远程源
- 分类目录
- 要安装或卸载的 agent

这种方式适合只想挑几个 agent，而不是安装整组 plugin 的场景。

## 用 `agent-installer` 在 Claude Code 内安装

VoltAgent 还提供一个专门的安装器 agent。先把它下载到全局 agent 目录：

```bash
curl -s https://raw.githubusercontent.com/VoltAgent/awesome-claude-code-subagents/main/categories/09-meta-orchestration/agent-installer.md \
  -o ~/.claude/agents/agent-installer.md
```

然后在 Claude Code 里说：

```text
Use the agent-installer to show me available categories
```

或：

```text
Find PHP agents and install php-pro globally
```

这种方式的优点是可以直接在 Claude Code 对话里浏览、搜索和安装 agent。

## 如何调用已安装 agent？

安装后，Claude Code 会把这些 agent 作为 subagent 发现。常见调用方式有三种。

### 1. 自然语言调用

```text
Use the code-reviewer subagent to review my latest changes.
```

```text
Use the typescript-pro agent to refactor this module.
```

```text
Ask security-auditor to check auth and session handling.
```

Claude Code 会根据 agent 的 `description` 和当前任务决定是否委派。

### 2. `@agent` 显式调用

在 Claude Code 输入 `@`，从选择器里选择对应 agent。这样可以更明确地指定本次任务交给谁。

### 3. 以某个 agent 启动会话

```bash
claude --agent code-reviewer
```

后台执行也可以：

```bash
claude --agent code-reviewer --bg "review this repository for security issues"
```

## agent 文件结构

VoltAgent 的 agent 本质上是 Claude Code 支持的 Markdown agent 定义，核心是 YAML frontmatter + prompt body：

```md
---
name: code-reviewer
description: Code quality guardian
tools: Read, Grep, Glob
model: sonnet
---

You are a code review specialist...
```

常见字段：

| 字段 | 作用 |
|---|---|
| `name` | agent 名称，调用时使用 |
| `description` | Claude 判断何时委派给它 |
| `tools` | 允许使用的工具列表 |
| `model` | 使用 `haiku`、`sonnet`、`opus` 或 `inherit` |
| 正文 | 该 agent 的系统提示词和行为约束 |

如果需要调整行为，可以修改 prompt body、工具权限或模型。

## 如何自定义或覆盖？

如果是 plugin 安装，不建议直接修改插件缓存里的文件。更稳妥的方式是把对应 agent 复制到项目级目录：

```bash
mkdir -p .claude/agents
cp ~/.claude/agents/code-reviewer.md .claude/agents/code-reviewer.md
```

然后修改 `.claude/agents/code-reviewer.md`。

Claude Code 的加载优先级会让项目级 agent 覆盖用户级或插件级 agent，因此这种方式更适合团队沉淀自己的规则。

## 与 pi-subagents 的差异

VoltAgent 依赖的是 Claude Code 原生 subagent/plugin 体系；`pi-subagents` 则更像一个显式编排扩展。

| 能力 | VoltAgent + Claude Code | pi-subagents |
|---|---|---|
| 专家角色 | 大量现成 Claude Code agent | 内置 scout、planner、worker、reviewer、oracle 等 |
| 安装方式 | Claude Code plugin / agent 文件 | Pi package |
| 链式 workflow | 主要靠自然语言、Skills 或 Agent SDK | `/chain`、`.chain.md`、`{previous}` 更明确 |
| 并行执行 | Claude Code subagents、background agents、agent teams | `/parallel` 和 tool 参数更直接 |
| 子代理通信 | 普通 subagent 只回主会话；agent teams 支持协作但仍偏实验 | 可搭配 `pi-intercom` |
| 生态 | Claude Code 官方和社区生态较大 | Pi 扩展生态更偏可塑形工作台 |

一句话：**VoltAgent 更像“Claude Code 专家库”，pi-subagents 更像“Pi 的子代理编排器”。**

## 安全注意事项

第三方 agent 和 plugin 会影响 Claude Code 的行为，有些还可能引入工具权限、MCP 或 hooks。安装前建议：

- 先看对应 `.md` agent 的 frontmatter 和 prompt；
- 避免给不可信 agent 配置过宽的工具权限；
- 项目级安装前确认团队是否接受这些行为约束；
- 对安全、生产、基础设施相关 agent，优先使用只读权限开始。

## 实用调用模板

```text
Use code-reviewer to review this diff. Focus on correctness, tests, and unnecessary complexity.
```

```text
Use typescript-pro to inspect this module and suggest type-safety improvements before editing.
```

```text
Ask security-auditor to audit the auth flow. Do not edit files; report findings with severity.
```

```text
Use agent-installer to find agents suitable for a Python FastAPI backend project.
```
