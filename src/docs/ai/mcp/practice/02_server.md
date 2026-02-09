---
title: 实战第二步：Server 开发
icon: server
order: 2
date: 2026-02-09
category:
  - AI
  - MCP
tag:
  - 实战
  - Python
  - FastAPI
---

# 实战第二步：编写 MCP 服务器代码 (`server.py`)

现在，我们将创建服务器的核心逻辑。`fastapi-mcp` 库的核心思想是，它可以自动将您的 FastAPI 路由（endpoints）转换为 AI 模型可以理解的 MCP 工具和资源。

### 1. 创建服务器主文件

在您的项目目录 (`mcp_project`) 中，创建一个名为 `server.py` 的文件。

### 2. 编写服务器代码

将以下代码粘贴到 `server.py` 文件中。

```python
import os
import httpx
from fastapi import FastAPI, HTTPException
from fastapi_mcp import FastApiMCP

# 1. 创建一个 FastAPI 应用实例
app = FastAPI(
    title="我的第一个MCP服务器",
    description="一个包含网络搜索工具和文件读取资源的MCP服务器。",
    version="1.0.0",
)

# 2. 实现网络搜索“工具”
@app.post("/search", summary="执行网络搜索")
async def web_search(query: str):
    """
    使用DuckDuckGo API执行网络搜索并返回结果。
    """
    print(f"正在执行网络搜索: {query}")
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(f"https://api.duckduckgo.com/?q={query}&format=json")
            response.raise_for_status()
            data = response.json()
            if data.get("AbstractText"):
                return {"result": data["AbstractText"]}
            elif data.get("RelatedTopics"):
                return {"result": [topic.get("Text") for topic in data["RelatedTopics"][:5]]}
            else:
                return {"result": "未找到相关信息。"}
    except httpx.RequestError as exc:
        raise HTTPException(status_code=500, detail=f"网络请求错误: {exc}")

# 3. 实现文件读取“资源”
@app.get("/read_file", summary="读取本地文件的内容")
async def read_local_file(file_path: str):
    """
    根据提供的路径读取本地文件的内容。
    """
    base_dir = os.path.abspath(os.path.dirname(__file__))
    full_path = os.path.abspath(os.path.join(base_dir, file_path))

    if not full_path.startswith(base_dir):
        raise HTTPException(status_code=403, detail="禁止访问指定路径的文件。")

    try:
        with open(full_path, 'r', encoding='utf-8') as f:
            content = f.read()
        return {"file_content": content}
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="文件未找到。")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"读取文件时发生错误: {e}")

# 4. 将 FastAPI 应用转换为 MCP 服务器
mcp = FastApiMCP(
    app,
    name="MyFirstMCPServer",
    description="一个简单的MCP服务器，提供网络搜索和文件读取功能。",
    base_url="http://localhost:8000",
)
mcp.mount()

if __name__ == "__main__":
    import uvicorn
    # 创建一个测试文件
    with open("test.txt", "w", encoding="utf-8") as f:
        f.write("这是用于测试MCP服务器文件读取功能的本地文件。")
    uvicorn.run(app, host="127.0.0.1", port=8000)
```

代码编写完成后，我们将在下一步[运行和测试服务器](./03_run.md)。
