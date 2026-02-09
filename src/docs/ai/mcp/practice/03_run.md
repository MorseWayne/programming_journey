---
title: 实战第三步：运行与调试
icon: play
order: 7
date: 2026-02-09
category:
  - AI
  - MCP
tag:
  - 实战
  - 调试
---

# 实战第三步：运行和测试 MCP 服务器

### 1. 启动服务器

在终端中运行：

```bash
python server.py
```

服务器启动后，通常会监听 `http://127.0.0.1:8000`。

### 2. （可选）使用 FastAPI 文档测试

访问 [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs) 可以手动测试 API 接口。由于 `fastapi-mcp` 将 MCP 功能集成到了 FastAPI 中，您可以在这里看到 `search` 和 `read_file` 接口，并直接进行测试。

确保服务器运行正常后，我们将编写一个[MCP 客户端](./04_client.md)来与之进行标准的 MCP 协议通信。
