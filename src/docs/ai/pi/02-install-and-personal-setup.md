---
title: 安装与个人配置迁移
icon: download
order: 2
date: 2026-05-25
category:
  - AI
  - Pi
tag:
  - 安装配置
  - Pi Package
  - 权限系统
---

# 安装与个人配置迁移：复刻我的 Pi 工作台

这一篇把我的个人配置迁移指南整合进专题，目标是在新机器上快速复刻一套可用的 Pi Coding Agent 环境。

> 安全提醒：Pi 扩展拥有较高系统权限。只安装可信来源的扩展；不要把 API Key、登录凭据、浏览器授权状态写入公开文档或仓库。

## 1. 前置条件

- 已安装并能正常运行 `pi`
- Node.js 建议 `>= 22.20.0`（Pi 源码当前要求 Node `>= 22.19.0`）
- 已配置至少一个模型 Provider

当前机器偏好如下：

```json
{
  "defaultProvider": "openai-codex",
  "defaultModel": "gpt-5.5",
  "defaultThinkingLevel": "xhigh"
}
```

如果另一台机器没有这些模型，启动 Pi 后用 `/model` 重新选择可用模型即可。

## 2. 安装 Pi

官方推荐 npm 安装：

```bash
npm install -g --ignore-scripts @earendil-works/pi-coding-agent
```

Linux / macOS 也可以使用安装脚本：

```bash
curl -fsSL https://pi.dev/install.sh | sh
```

启动：

```bash
cd /path/to/project
pi
```

认证方式有两种：

- 订阅账号：进入 Pi 后执行 `/login`，支持 Claude Pro/Max、ChatGPT Plus/Pro（Codex）、GitHub Copilot 等；
- API Key：设置环境变量，例如 `ANTHROPIC_API_KEY`，或在 `/login` 中写入 `~/.pi/agent/auth.json`。

## 3. 安装推荐扩展包

在新机器上执行：

```bash
pi install npm:pi-subagents
pi install npm:@gotgenes/pi-permission-system
pi install npm:pi-web-access
pi install npm:@narumitw/pi-retry
pi install npm:pi-extmgr
pi install npm:@narumitw/pi-statusline
```

安装后在 Pi 内执行：

```text
/reload
```

或者直接重启 Pi。

检查已安装包：

```bash
pi list
```

这些包分别解决：

| 包 | 作用 |
|----|------|
| `pi-subagents` | 子代理编排：scout、planner、worker、reviewer 等 |
| `@gotgenes/pi-permission-system` | 权限策略：路径、命令、外部目录访问控制 |
| `pi-web-access` | Web 搜索、网页读取、视频/内容解析 |
| `@narumitw/pi-retry` | Provider 空错误、流卡住时自动重试 |
| `pi-extmgr` | 交互式扩展管理器 |
| `@narumitw/pi-statusline` | 增强状态栏：模型、thinking、git、token、费用等 |

## 4. settings.json packages 片段

如果想直接写入 `~/.pi/agent/settings.json`，至少需要包含：

```json
{
  "packages": [
    "npm:pi-subagents",
    "npm:@gotgenes/pi-permission-system",
    "npm:pi-web-access",
    "npm:@narumitw/pi-retry",
    "npm:pi-extmgr",
    "npm:@narumitw/pi-statusline"
  ]
}
```

更推荐使用 `pi install ...` 命令，避免覆盖新机器已有设置。

## 5. 权限系统配置

创建配置目录：

```bash
mkdir -p ~/.pi/agent/extensions/pi-permission-system
```

写入默认权限配置：

```bash
cat > ~/.pi/agent/extensions/pi-permission-system/config.json <<'JSON'
{
  "$schema": "https://raw.githubusercontent.com/gotgenes/pi-permission-system/main/schemas/permissions.schema.json",
  "debugLog": false,
  "permissionReviewLog": true,
  "yoloMode": false,
  "permission": {
    "*": "allow",
    "path": {
      "*": "allow",
      "*.env": "deny",
      "*.env.*": "deny",
      "*.env.example": "allow",
      "~/.ssh/*": "deny"
    },
    "bash": {
      "rm -rf *": "deny",
      "sudo *": "ask",
      "chmod *": "ask",
      "chown *": "ask",
      "kill *": "ask",
      "git *": "allow",
      "npm *": "ask",
      "pnpm *": "ask",
      "yarn *": "ask",
      "bun *": "ask"
    },
    "external_directory": "ask"
  }
}
JSON
```

策略含义：

- 默认允许普通工具操作；
- 禁止读取或修改 `.env`、`.env.*`、`~/.ssh/*`；
- 禁止 `rm -rf *`；
- 对 `sudo`、`chmod`、`chown`、`kill`、包管理器命令进行确认；
- 访问当前项目目录外部路径时询问确认。

验证：

```text
/permission-system show
/permission-system path
```

修改配置后记得：

```text
/reload
```

## 6. 可选：Web 搜索配置

`pi-web-access` 默认可用 Exa MCP，无需 API Key。若你有 API Key，可创建：

```bash
cat > ~/.pi/web-search.json <<'JSON'
{
  "exaApiKey": "exa-...",
  "perplexityApiKey": "pplx-...",
  "geminiApiKey": "AIza..."
}
JSON
```

如果没有这些 Key，可以不创建此文件。

常用命令：

```text
/websearch
/curator on
/curator off
/search
/google-account
```

自然语言用法示例：

```text
帮我搜索 React 19 的最新官方文档，总结要点并给出处
```

```text
读取这个链接并总结：https://example.com/article
```

```text
分析这个 YouTube 视频，告诉我里面提到的库：https://youtube.com/...
```

## 7. 子代理 pi-subagents 用法

无需手动调用工具，可以直接自然语言让 Pi 使用子代理：

```text
用 scout 先帮我理解这个代码库
```

```text
让 planner 给我制定实现计划
```

```text
让 worker 根据计划实现
```

```text
让 reviewer 审查刚才的改动
```

```text
并行运行三个 reviewer：一个看正确性，一个看测试，一个看复杂度
```

常用命令：

```text
/subagents-doctor
/run reviewer "审查当前 diff"
/parallel reviewer "检查正确性" -> reviewer "检查测试覆盖" -> reviewer "检查复杂度"
```

推荐日常流程：

```text
scout/context-builder -> planner -> worker -> reviewer
```

## 8. 插件管理 pi-extmgr

打开插件管理器：

```text
/extensions
```

常用命令：

```text
/extensions list
/extensions search web
/extensions update
/extensions install npm:包名
/extensions remove npm:包名
/extensions history
```

## 9. 自动重试 pi-retry

`@narumitw/pi-retry` 安装后自动生效，用于处理模型 Provider 的空错误或流卡住问题。

可选环境变量：

```bash
PI_RETRY_STALL_TIMEOUT_MS=120000 pi
```

禁用卡住检测：

```bash
PI_RETRY_STALL_TIMEOUT_MS=0 pi
```

## 10. 状态栏 pi-statusline

`@narumitw/pi-statusline` 安装后自动替换状态栏，显示模型、thinking、git 分支、上下文、token、费用等。

切换样式：

```bash
PI_STATUSLINE_PRESET=tokyo-night pi
PI_STATUSLINE_PRESET=classic pi
```

## 11. 模型与 subagents 偏好

如果新机器模型名称一致，可以参考下面配置；否则建议通过 `/model` 重新选择。

```json
{
  "defaultProvider": "openai-codex",
  "defaultModel": "gpt-5.5",
  "defaultThinkingLevel": "xhigh",
  "retry": {
    "enabled": true
  },
  "subagents": {
    "agentOverrides": {
      "scout": {
        "model": "openai-codex/gpt-5.3-codex-spark",
        "thinking": "medium",
        "fallbackModels": ["openai-codex/gpt-5.4-mini"]
      },
      "context-builder": {
        "model": "openai-codex/gpt-5.4-mini",
        "thinking": "high",
        "fallbackModels": ["openai-codex/gpt-5.3-codex-spark"]
      },
      "planner": {
        "model": "openai-codex/gpt-5.5",
        "thinking": "xhigh",
        "fallbackModels": ["openai-codex/gpt-5.4", "openai-codex/gpt-5.3-codex"]
      },
      "worker": {
        "model": "openai-codex/gpt-5.5",
        "thinking": "xhigh",
        "fallbackModels": ["openai-codex/gpt-5.4", "openai-codex/gpt-5.3-codex"]
      },
      "reviewer": {
        "model": "openai-codex/gpt-5.5",
        "thinking": "xhigh",
        "fallbackModels": ["openai-codex/gpt-5.4", "openai-codex/gpt-5.3-codex"]
      },
      "oracle": {
        "model": "openai-codex/gpt-5.5",
        "thinking": "xhigh",
        "fallbackModels": ["openai-codex/gpt-5.4"]
      },
      "researcher": {
        "model": "openai-codex/gpt-5.4-mini",
        "thinking": "high",
        "fallbackModels": ["openai-codex/gpt-5.3-codex-spark"]
      }
    }
  }
}
```

## 12. 验证清单

新机器完成后，依次检查：

```bash
pi list
```

Pi 内执行：

```text
/reload
/permission-system show
/extensions list
/subagents-doctor
```

再测试自然语言能力：

```text
帮我搜索 Pi coding agent extensions 的资料，并总结
```

```text
用 reviewer 检查当前项目是否有明显问题
```

## 13. 日常维护

更新扩展：

```bash
pi update --extensions
```

更新 Pi 本体：

```bash
pi update --self
```

全部更新：

```bash
pi update
```

## 迁移时最容易踩的坑

1. **复制 settings.json 覆盖了新机器已有配置**：优先用 `pi install`。
2. **模型不可用**：换机器后先跑 `/model`，不要硬套旧模型 ID。
3. **扩展权限过大**：第三方 Pi Package 等同于本地代码执行，要审查来源。
4. **忘记 `/reload`**：新增扩展、技能、权限文件后先 reload。
5. **把密钥写进文档**：只迁移配置结构，不迁移凭据。

---

> 下一篇：[日常工作流](./03-daily-workflow.md)
