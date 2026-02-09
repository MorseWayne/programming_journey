---
title: 实战第一步：环境搭建
icon: tools
order: 1
date: 2026-02-09
category:
  - AI
  - MCP
tag:
  - 实战
  - 环境配置
  - Python
---

# 实战第一步：环境设置

在开始编码之前，我们需要准备好开发环境。推荐使用虚拟环境来管理项目依赖，以避免库版本冲突。

### 1. 创建项目目录和虚拟环境

```bash
mkdir mcp_project
cd mcp_project
python -m venv venv
source venv/bin/activate  # 在 Windows 上使用 `venv\Scripts\activate`
```

### 2. 安装必要的库

我们将使用 `fastapi` 来构建 Web 服务，`uvicorn` 作为服务器运行它，`fastapi-mcp` 将其转换为 MCP 服务器，以及 `httpx` 库来执行网络请求。

```bash
pip install fastapi uvicorn "fastapi-mcp[all]" httpx
```

准备好环境后，我们就可以开始[编写服务器代码](./02_server.md)了。
