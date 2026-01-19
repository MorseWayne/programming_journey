---
title: MCP 协议深度解析
icon: plug
order: 5
date: 2025-01-20
category:
  - AI
  - OpenCode
tag:
  - MCP
  - Model Context Protocol
  - 协议
---

# MCP 协议深度解析：构建可扩展的 AI 能力生态

在前面的文章中，我们了解了 OpenCode 的内置工具系统。但内置工具终究有限，如何让 AI 获得**无限的能力**？

答案是 **MCP (Model Context Protocol)**——一个让 AI 应用与外部服务无缝对接的开放协议。

## 什么是 MCP？

### 问题：能力孤岛

想象一下，你希望 AI 能够：
- 查询你的数据库
- 发送 Slack 消息
- 创建 JIRA 工单
- 访问内部 API

传统做法是为每个服务单独开发集成。每个 AI 应用都要重复这个工作，形成一个个"能力孤岛"。

### 解决方案：标准化协议

MCP (Model Context Protocol) 由 Anthropic 在 2024 年底开源，它定义了一套标准协议，让：

```
AI 应用 ←→ MCP 协议 ←→ 外部服务
```

| 角色 | 职责 |
|------|-----|
| **MCP Host** | AI 应用（如 OpenCode, Claude Desktop） |
| **MCP Server** | 能力提供者（数据库、API、服务） |
| **MCP Protocol** | 通信规范 |

好处是：
- **服务提供者**：只需实现一次 MCP Server
- **AI 应用**：只需实现一次 MCP Client
- **用户**：任意组合，即插即用

## MCP 的核心概念

### 三种能力原语

MCP 定义了三种基本能力：

#### 1. Tools（工具）

让 AI 执行操作：

```typescript
// MCP Server 暴露的工具
{
  name: "query_database",
  description: "Execute a SQL query",
  inputSchema: {
    type: "object",
    properties: {
      sql: { type: "string" }
    }
  }
}
```

AI 可以调用这个工具执行 SQL 查询。

#### 2. Resources（资源）

提供上下文信息：

```typescript
// MCP Server 暴露的资源
{
  name: "schema",
  uri: "db://schema",
  description: "Database schema definition",
  mimeType: "application/json"
}
```

AI 可以读取这个资源了解数据库结构。

#### 3. Prompts（提示词模板）

预定义的交互模式：

```typescript
// MCP Server 暴露的提示词
{
  name: "analyze_table",
  description: "Analyze a database table",
  arguments: [
    { name: "table_name", required: true }
  ]
}
```

用户可以调用这个提示词启动特定的分析流程。

## OpenCode 的 MCP 实现

### 配置 MCP 服务器

在 `opencode.json` 中配置：

```json
{
  "mcp": {
    "postgres": {
      "type": "local",
      "command": ["npx", "-y", "@modelcontextprotocol/server-postgres"],
      "environment": {
        "POSTGRES_CONNECTION_STRING": "postgresql://..."
      }
    },
    "github": {
      "type": "remote",
      "url": "https://mcp.github.com/v1",
      "oauth": true
    }
  }
}
```

### 两种连接方式

#### 1. Local（本地进程）

```typescript
// packages/opencode/src/mcp/index.ts
if (mcp.type === "local") {
  const [cmd, ...args] = mcp.command
  const transport = new StdioClientTransport({
    command: cmd,
    args,
    cwd: Instance.directory,
    env: {
      ...process.env,
      ...mcp.environment,
    },
  })
  
  const client = new Client({
    name: "opencode",
    version: Installation.VERSION,
  })
  
  await client.connect(transport)
}
```

本地 MCP Server 作为子进程运行，通过 **stdio** 通信：

```
OpenCode ←→ stdio ←→ MCP Server 进程
```

#### 2. Remote（远程服务）

```typescript
if (mcp.type === "remote") {
  // 尝试多种传输方式
  const transports = [
    new StreamableHTTPClientTransport(new URL(mcp.url), { authProvider }),
    new SSEClientTransport(new URL(mcp.url), { authProvider }),
  ]
  
  for (const transport of transports) {
    try {
      await client.connect(transport)
      break
    } catch (error) {
      // 尝试下一种传输方式
    }
  }
}
```

远程 MCP Server 通过 HTTP/SSE 通信：

```
OpenCode ←→ HTTP/SSE ←→ 远程 MCP Server
```

### MCP Client 实现

OpenCode 使用官方的 `@modelcontextprotocol/sdk`：

```typescript
// packages/opencode/src/mcp/index.ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
```

### 获取 MCP 工具

```typescript
export namespace MCP {
  // 列出所有可用的 MCP 服务器
  export async function list() {
    const s = await state()
    const result: Array<{
      name: string
      tools: () => Promise<Tool[]>
      resources: () => Promise<Resource[]>
      prompts: () => Promise<Prompt[]>
    }> = []
    
    for (const [name, client] of Object.entries(s.clients)) {
      result.push({
        name,
        async tools() {
          const response = await client.listTools()
          return response.tools.map(t => convertMcpTool(t, client))
        },
        async resources() {
          const response = await client.listResources()
          return response.resources
        },
        async prompts() {
          const response = await client.listPrompts()
          return response.prompts
        },
      })
    }
    
    return result
  }
}
```

### 转换 MCP 工具为 AI SDK 格式

```typescript
async function convertMcpTool(mcpTool: MCPToolDef, client: MCPClient): Promise<Tool> {
  const inputSchema = mcpTool.inputSchema

  const schema: JSONSchema7 = {
    ...inputSchema,
    type: "object",
    properties: inputSchema.properties ?? {},
    additionalProperties: false,
  }

  return dynamicTool({
    description: mcpTool.description ?? "",
    inputSchema: jsonSchema(schema),
    execute: async (args: unknown) => {
      // 调用 MCP Server 的工具
      return client.callTool({
        name: mcpTool.name,
        arguments: args as Record<string, unknown>,
      })
    },
  })
}
```

## MCP 协议细节

### 消息格式

MCP 使用 JSON-RPC 2.0：

```json
// 请求
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "query_database",
    "arguments": {
      "sql": "SELECT * FROM users"
    }
  }
}

// 响应
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "[{\"id\": 1, \"name\": \"Alice\"}]"
      }
    ]
  }
}
```

### 能力协商

连接时，双方会交换能力信息：

```typescript
// Client 发送初始化请求
const initResult = await client.initialize({
  protocolVersion: "2024-11-05",
  capabilities: {
    roots: { listChanged: true },
    sampling: {},
  },
  clientInfo: {
    name: "opencode",
    version: "1.0.0",
  },
})

// Server 返回其能力
// {
//   protocolVersion: "2024-11-05",
//   capabilities: {
//     tools: { listChanged: true },
//     resources: { subscribe: true },
//     prompts: { listChanged: true },
//   },
//   serverInfo: { name: "postgres-server", version: "1.0.0" }
// }
```

### 工具列表变更通知

MCP Server 可以动态添加/删除工具：

```typescript
// packages/opencode/src/mcp/index.ts
function registerNotificationHandlers(client: MCPClient, serverName: string) {
  client.setNotificationHandler(ToolListChangedNotificationSchema, async () => {
    log.info("tools list changed notification received", { server: serverName })
    // 通知系统刷新工具列表
    Bus.publish(ToolsChanged, { server: serverName })
  })
}
```

## OAuth 认证支持

### 远程 MCP Server 的认证

许多 MCP Server 需要认证。OpenCode 支持 OAuth 流程：

```typescript
// packages/opencode/src/mcp/index.ts
if (mcp.type === "remote") {
  const oauthConfig = typeof mcp.oauth === "object" ? mcp.oauth : undefined
  
  const authProvider = new McpOAuthProvider(
    key,
    mcp.url,
    {
      clientId: oauthConfig?.clientId,
      clientSecret: oauthConfig?.clientSecret,
      scope: oauthConfig?.scope,
    },
    {
      onRedirect: async (url) => {
        // 打开浏览器进行认证
        await open(url.toString())
      },
    },
  )
  
  const transport = new StreamableHTTPClientTransport(new URL(mcp.url), {
    authProvider,
  })
}
```

### 认证流程

```
1. 连接 MCP Server
2. Server 返回 401 Unauthorized
3. OpenCode 检测到需要认证
4. 打开浏览器进行 OAuth 登录
5. 用户授权后，获取 token
6. 使用 token 重新连接
```

```typescript
// 处理需要认证的情况
if (error instanceof UnauthorizedError) {
  // 存储 transport 以便完成认证
  pendingOAuthTransports.set(key, transport)
  status = { status: "needs_auth" }
  
  // 提示用户进行认证
  Bus.publish(TuiEvent.ToastShow, {
    title: "MCP Authentication Required",
    message: `Server "${key}" requires authentication. Run: opencode mcp auth ${key}`,
    variant: "warning",
  })
}
```

## 将 MCP 工具集成到 Agent

### 工具解析流程

在 `resolveTools` 中，MCP 工具与内置工具合并：

```typescript
// packages/opencode/src/session/prompt.ts
async function resolveTools(input) {
  const tools: Record<string, AITool> = {}
  
  // 1. 加载内置工具
  for (const item of await ToolRegistry.tools(input.model, input.agent)) {
    tools[item.id] = tool({
      id: item.id,
      description: item.description,
      inputSchema: jsonSchema(schema),
      execute: async (args, options) => { ... },
    })
  }
  
  // 2. 加载 MCP 工具
  for (const mcp of await MCP.list()) {
    for (const mcpTool of await mcp.tools()) {
      // MCP 工具名称添加前缀避免冲突
      const toolName = `${mcp.name}:${mcpTool.name}`
      tools[toolName] = mcpTool
    }
  }
  
  return tools
}
```

### 工具命名

为避免冲突，MCP 工具使用 `server:tool` 的命名格式：

```
postgres:query_database
github:create_issue
slack:send_message
```

## 常用 MCP Server 示例

### 1. PostgreSQL

```json
{
  "mcp": {
    "postgres": {
      "type": "local",
      "command": ["npx", "-y", "@modelcontextprotocol/server-postgres"],
      "environment": {
        "POSTGRES_CONNECTION_STRING": "postgresql://user:pass@localhost/db"
      }
    }
  }
}
```

提供的工具：
- `query`：执行 SQL 查询
- `list_tables`：列出所有表
- `describe_table`：描述表结构

### 2. 文件系统

```json
{
  "mcp": {
    "filesystem": {
      "type": "local",
      "command": ["npx", "-y", "@modelcontextprotocol/server-filesystem", "/path/to/allowed/dir"]
    }
  }
}
```

提供的工具：
- `read_file`：读取文件
- `write_file`：写入文件
- `list_directory`：列出目录

### 3. GitHub

```json
{
  "mcp": {
    "github": {
      "type": "local",
      "command": ["npx", "-y", "@modelcontextprotocol/server-github"],
      "environment": {
        "GITHUB_TOKEN": "ghp_..."
      }
    }
  }
}
```

提供的工具：
- `create_issue`：创建 Issue
- `create_pull_request`：创建 PR
- `search_code`：搜索代码

### 4. Slack

```json
{
  "mcp": {
    "slack": {
      "type": "local",
      "command": ["npx", "-y", "@anthropic/mcp-server-slack"],
      "environment": {
        "SLACK_BOT_TOKEN": "xoxb-..."
      }
    }
  }
}
```

提供的工具：
- `send_message`：发送消息
- `list_channels`：列出频道
- `search_messages`：搜索消息

## 构建自定义 MCP Server

### 最小示例（TypeScript）

```typescript
import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"

const server = new Server({
  name: "my-mcp-server",
  version: "1.0.0",
}, {
  capabilities: {
    tools: {},
  },
})

// 定义工具
server.setRequestHandler("tools/list", async () => ({
  tools: [{
    name: "hello",
    description: "Say hello to someone",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Name to greet" },
      },
      required: ["name"],
    },
  }],
}))

// 实现工具
server.setRequestHandler("tools/call", async (request) => {
  if (request.params.name === "hello") {
    const { name } = request.params.arguments as { name: string }
    return {
      content: [{ type: "text", text: `Hello, ${name}!` }],
    }
  }
  throw new Error(`Unknown tool: ${request.params.name}`)
})

// 启动服务器
const transport = new StdioServerTransport()
await server.connect(transport)
```

### 运行和测试

```bash
# 作为 MCP Server 运行
npx ts-node my-server.ts

# 在 OpenCode 中配置
# opencode.json
{
  "mcp": {
    "my-server": {
      "type": "local",
      "command": ["npx", "ts-node", "my-server.ts"]
    }
  }
}
```

## MCP 的安全考量

### 1. 权限隔离

每个 MCP Server 运行在独立的进程中，互不干扰。

### 2. 配置审查

敏感信息（如数据库密码）通过环境变量传递，不会进入 AI 上下文。

### 3. 工具权限

MCP 工具同样受 OpenCode 权限系统约束：

```typescript
await ctx.ask({
  permission: "mcp",
  patterns: [`${serverName}:${toolName}`],
  metadata: { args },
})
```

### 4. 本地 vs 远程

- **本地 MCP**：代码在你的机器上运行，更可控
- **远程 MCP**：需要信任服务提供者，建议使用 OAuth 而非直接传递 token

## MCP 生态现状

### 官方 Server

Anthropic 和社区维护的官方 Server：

| Server | 用途 |
|--------|-----|
| `@modelcontextprotocol/server-postgres` | PostgreSQL 数据库 |
| `@modelcontextprotocol/server-filesystem` | 文件系统访问 |
| `@modelcontextprotocol/server-github` | GitHub API |
| `@modelcontextprotocol/server-sqlite` | SQLite 数据库 |
| `@modelcontextprotocol/server-google-maps` | Google Maps |
| `@anthropic/mcp-server-slack` | Slack |
| `@anthropic/mcp-server-memory` | 持久化记忆 |

### 社区生态

社区也在积极贡献：
- Linear
- Notion
- Jira
- Confluence
- Kubernetes
- AWS
- ...

可在 [mcp.run](https://mcp.run) 查看更多。

## 总结

MCP 是 AI Agent 能力扩展的关键基础设施：

| 概念 | 说明 |
|------|-----|
| **Protocol** | JSON-RPC 2.0，标准化通信 |
| **Transport** | stdio（本地）/ HTTP+SSE（远程） |
| **Capabilities** | Tools（操作）+ Resources（数据）+ Prompts（模板） |
| **Authentication** | 支持 OAuth 2.0 |

关键设计原则：

1. **标准化**：一次实现，多处使用
2. **安全性**：进程隔离、权限控制
3. **可扩展**：任何人都可以创建 MCP Server
4. **灵活性**：支持本地和远程部署

通过 MCP，OpenCode 可以连接到几乎任何外部服务，让 AI 的能力边界不再受限于内置工具。

---

> **下一篇**：[Provider 抽象层 - 如何支持多种 LLM 提供商](./06-provider-abstraction.md)
