---
title: 实战第四步：Client 开发
icon: laptop-code
order: 4
date: 2026-02-09
category:
  - AI
  - MCP
tag:
  - 实战
  - Client
  - Python
---

# 实战第四步：编写 MCP 客户端 (`client.py`)

最后，我们将创建一个简单的客户端来模拟 AI 模型（或 IDE）如何与 MCP 服务器交互。

### 1. 创建客户端文件

创建一个名为 `client.py` 的文件。

### 2. 编写客户端代码

```python
import asyncio
import httpx
import json

SERVER_URL = "http://127.0.0.1:8000"
MCP_ENDPOINT = f"{SERVER_URL}/mcp"

async def main():
    async with httpx.AsyncClient() as client:
        print("--- 1. 初始化与MCP服务器的会话 ---")
        init_response = await client.post(
            MCP_ENDPOINT,
            json={"jsonrpc": "2.0", "method": "initialize", "params": {"clientVersion": "0.1"}, "id": 1}
        )
        print("✅ 初始化成功！")

        print("\n--- 2. 列出服务器上所有可用的工具和资源 ---")
        list_tools_response = await client.post(
            MCP_ENDPOINT,
            json={"jsonrpc": "2.0", "method": "listTools", "params": {}, "id": 2}
        )
        tools = list_tools_response.json()["result"]["tools"]
        for tool in tools:
            print(f"  - 工具/资源名称: {tool['name']}")

        print("\n--- 3. 调用'web_search'工具 ---")
        search_query = "FastAPI"
        call_tool_response = await client.post(
            MCP_ENDPOINT,
            json={
                "jsonrpc": "2.0",
                "method": "callTool",
                "params": {"name": "web_search", "arguments": {"query": search_query}},
                "id": 3
            }
        )
        # 注意：实际返回结构可能因实现而异，这里假设标准返回结构
        print(f"🔍 搜索结果: {call_tool_response.json()['result']['content']['text']}")

if __name__ == "__main__":
    asyncio.run(main())
```

### 3. 运行客户端并验证功能

确保 `server.py` 仍在运行中，然后在新的终端窗口中运行客户端脚本：

```bash
python client.py
```

您应该会看到成功的输出，表明客户端已成功通过 MCP 协议与服务器通信，完成了初始化、工具列表获取和工具调用。
