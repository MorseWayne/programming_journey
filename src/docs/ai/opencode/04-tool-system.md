---
title: 工具系统设计
icon: wrench
order: 4
date: 2025-01-20
category:
  - AI
  - OpenCode
tag:
  - Tool System
  - Function Calling
  - AI Agent
---

# 工具系统设计：让 AI 拥有行动能力

在前面的文章中，我们了解了 Agent Loop 如何让 AI 自主决策。但决策之后需要**行动**，这就是工具系统的作用。

本文将深入 OpenCode 的工具系统，看看如何让 AI 从"纸上谈兵"变成"真正做事"。

## 什么是 Tool（工具）？

在 AI Agent 的语境中，Tool 是指 AI 可以调用的**外部能力**。

### 没有 Tool 的 AI

```
用户: 帮我创建一个文件
AI:   好的，你可以运行这个命令：
      touch myfile.txt
      然后把以下内容粘贴进去...
```

AI 只能**告诉你怎么做**，你需要自己去执行。

### 有 Tool 的 AI

```
用户: 帮我创建一个文件
AI:   [调用 WriteTool]
      ✓ 已创建文件 myfile.txt
```

AI 直接**帮你做了**。

### Tool 的本质

Tool 是一个函数，LLM 可以决定调用它：

```typescript
interface Tool {
  name: string           // 工具名称
  description: string    // 描述（让 LLM 理解何时使用）
  parameters: Schema     // 参数定义（让 LLM 知道传什么）
  execute: Function      // 执行逻辑
}
```

LLM 通过 **Function Calling**（或 Tool Use）协议，生成一个结构化的调用请求：

```json
{
  "tool": "write",
  "arguments": {
    "filePath": "/path/to/myfile.txt",
    "content": "Hello World"
  }
}
```

## OpenCode 的工具定义接口

### Tool.define：统一的定义方式

```typescript
// packages/opencode/src/tool/tool.ts
export namespace Tool {
  export interface Info<Parameters extends z.ZodType = z.ZodType> {
    id: string
    init: (ctx?: InitContext) => Promise<{
      description: string
      parameters: Parameters
      execute(args: z.infer<Parameters>, ctx: Context): Promise<{
        title: string
        metadata: Record<string, any>
        output: string
        attachments?: MessageV2.FilePart[]
      }>
    }>
  }

  export function define<Parameters extends z.ZodType, Result>(
    id: string,
    init: Info<Parameters, Result>["init"]
  ): Info<Parameters, Result> {
    return {
      id,
      init: async (initCtx) => {
        const toolInfo = init instanceof Function ? await init(initCtx) : init
        const execute = toolInfo.execute
        
        // 包装执行函数，添加参数验证和输出截断
        toolInfo.execute = async (args, ctx) => {
          // 1. 参数验证
          try {
            toolInfo.parameters.parse(args)
          } catch (error) {
            throw new Error(
              `The ${id} tool was called with invalid arguments: ${error}`
            )
          }
          
          // 2. 执行工具
          const result = await execute(args, ctx)
          
          // 3. 输出截断（防止输出过大）
          const truncated = await Truncate.output(result.output, {}, initCtx?.agent)
          return {
            ...result,
            output: truncated.content,
            metadata: {
              ...result.metadata,
              truncated: truncated.truncated,
            },
          }
        }
        
        return toolInfo
      },
    }
  }
}
```

### 关键设计点

1. **Zod Schema 验证**：使用 Zod 定义参数，自动验证 LLM 传入的参数
2. **输出截断**：防止工具输出过大，超出上下文限制
3. **统一的返回格式**：`title` + `output` + `metadata` + `attachments`

## 内置工具详解

### ReadTool：读取文件

```typescript
// packages/opencode/src/tool/read.ts
export const ReadTool = Tool.define("read", {
  description: DESCRIPTION,
  parameters: z.object({
    filePath: z.string().describe("The path to the file to read"),
    offset: z.coerce.number().describe("Line offset (0-based)").optional(),
    limit: z.coerce.number().describe("Number of lines to read").optional(),
  }),
  async execute(params, ctx) {
    let filepath = params.filePath
    if (!path.isAbsolute(filepath)) {
      filepath = path.join(process.cwd(), filepath)
    }
    
    // 1. 权限检查
    await ctx.ask({
      permission: "read",
      patterns: [filepath],
      always: ["*"],
      metadata: {},
    })
    
    // 2. 文件存在性检查
    const file = Bun.file(filepath)
    if (!(await file.exists())) {
      throw new Error(`File not found: ${filepath}`)
    }
    
    // 3. 特殊文件处理（图片、PDF）
    const isImage = file.type.startsWith("image/")
    const isPdf = file.type === "application/pdf"
    if (isImage || isPdf) {
      return {
        title: filepath,
        output: `${isImage ? "Image" : "PDF"} read successfully`,
        attachments: [{ type: "file", url: `data:...;base64,...` }],
      }
    }
    
    // 4. 读取文本内容
    const lines = await file.text().then(text => text.split("\n"))
    const content = lines.slice(offset, offset + limit)
      .map((line, i) => `${(i + offset + 1).toString().padStart(5, "0")}| ${line}`)
    
    return {
      title: filepath,
      output: `<file>\n${content.join("\n")}\n</file>`,
      metadata: { preview: content.slice(0, 20).join("\n") },
    }
  },
})
```

#### 设计亮点

- **行号标注**：输出带行号，方便 LLM 引用具体位置
- **分页读取**：支持 `offset` 和 `limit`，处理大文件
- **智能文件建议**：文件不存在时，推荐相似文件名
- **多媒体支持**：图片和 PDF 返回 base64，让多模态 LLM 可以"看"

### EditTool：编辑文件

```typescript
// packages/opencode/src/tool/edit.ts
export const EditTool = Tool.define("edit", {
  description: DESCRIPTION,
  parameters: z.object({
    filePath: z.string().describe("The absolute path to the file"),
    oldString: z.string().describe("The text to replace"),
    newString: z.string().describe("The replacement text"),
    replaceAll: z.boolean().optional().describe("Replace all occurrences"),
  }),
  async execute(params, ctx) {
    // 1. 基本验证
    if (params.oldString === params.newString) {
      throw new Error("oldString and newString must be different")
    }
    
    // 2. 读取原文件
    const contentOld = await Bun.file(filePath).text()
    
    // 3. 执行替换（使用智能匹配算法）
    const contentNew = replace(contentOld, params.oldString, params.newString)
    
    // 4. 生成 diff
    const diff = createTwoFilesPatch(filePath, filePath, contentOld, contentNew)
    
    // 5. 权限确认
    await ctx.ask({
      permission: "edit",
      patterns: [filePath],
      metadata: { diff },
    })
    
    // 6. 写入文件
    await file.write(contentNew)
    
    // 7. LSP 诊断检查
    await LSP.touchFile(filePath, true)
    const diagnostics = await LSP.diagnostics()
    const errors = diagnostics[filePath]?.filter(d => d.severity === 1)
    
    let output = "Edit applied successfully."
    if (errors?.length > 0) {
      output += `\n\nLSP errors detected:\n${errors.map(LSP.Diagnostic.pretty).join("\n")}`
    }
    
    return {
      title: filePath,
      output,
      metadata: { diff, diagnostics },
    }
  },
})
```

#### 设计亮点

- **基于文本匹配**：不需要行号，更适合 LLM 的输出特点
- **智能容错**：使用 Levenshtein 距离容忍轻微的格式差异
- **Diff 预览**：生成标准 diff 格式，方便用户审查
- **LSP 集成**：编辑后自动检查语法错误

### BashTool：执行命令

```typescript
// packages/opencode/src/tool/bash.ts
export const BashTool = Tool.define("bash", async () => {
  const shell = Shell.acceptable()  // 自动检测可用 shell
  
  return {
    description: DESCRIPTION,
    parameters: z.object({
      command: z.string().describe("The command to execute"),
      timeout: z.number().optional().describe("Timeout in milliseconds"),
      workdir: z.string().optional().describe("Working directory"),
      description: z.string().describe("What this command does (5-10 words)"),
    }),
    async execute(params, ctx) {
      const timeout = params.timeout ?? DEFAULT_TIMEOUT
      
      // 1. 解析命令（使用 tree-sitter）
      const tree = await parser().then(p => p.parse(params.command))
      
      // 2. 提取命令模式用于权限检查
      const patterns = new Set<string>()
      for (const node of tree.rootNode.descendantsOfType("command")) {
        const command = []
        for (let i = 0; i < node.childCount; i++) {
          if (node.child(i)?.type === "command_name" || node.child(i)?.type === "word") {
            command.push(node.child(i)!.text)
          }
        }
        patterns.add(command.join(" "))
      }
      
      // 3. 权限检查
      await ctx.ask({
        permission: "bash",
        patterns: Array.from(patterns),
        metadata: {},
      })
      
      // 4. 执行命令
      const proc = spawn(params.command, {
        shell,
        cwd: params.workdir || Instance.directory,
        stdio: ["ignore", "pipe", "pipe"],
      })
      
      // 5. 收集输出
      let output = ""
      proc.stdout?.on("data", chunk => {
        output += chunk.toString()
        ctx.metadata({ metadata: { output, description: params.description } })
      })
      proc.stderr?.on("data", chunk => {
        output += chunk.toString()
      })
      
      // 6. 等待完成或超时
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          proc.kill()
          reject(new Error("Command timed out"))
        }, timeout)
        
        proc.on("exit", code => {
          clearTimeout(timer)
          resolve(code)
        })
      })
      
      return {
        title: params.description,
        output,
        metadata: { exitCode: proc.exitCode },
      }
    },
  }
})
```

#### 设计亮点

- **命令解析**：使用 tree-sitter 解析 bash 语法，准确提取命令
- **细粒度权限**：按命令模式（如 `rm *`）控制权限
- **实时输出**：通过 `ctx.metadata` 实时更新执行状态
- **超时保护**：防止命令无限执行

## 工具注册表

### ToolRegistry：管理所有工具

```typescript
// packages/opencode/src/tool/registry.ts
export namespace ToolRegistry {
  async function all(): Promise<Tool.Info[]> {
    const custom = await loadCustomTools()
    
    return [
      InvalidTool,      // 处理无效调用
      QuestionTool,     // 向用户提问
      BashTool,         // Shell 命令
      ReadTool,         // 读取文件
      GlobTool,         // 文件模式匹配
      GrepTool,         // 内容搜索
      EditTool,         // 编辑文件
      WriteTool,        // 写入文件
      TaskTool,         // 创建子任务
      WebFetchTool,     // 获取网页
      TodoWriteTool,    // Todo 管理
      TodoReadTool,
      WebSearchTool,    // 网络搜索
      CodeSearchTool,   // 代码搜索
      SkillTool,        // 技能系统
      ApplyPatchTool,   // 应用补丁
      ...custom,        // 自定义工具
    ]
  }

  // 根据模型和 Agent 过滤工具
  export async function tools(model, agent) {
    const allTools = await all()
    
    return allTools.filter(t => {
      // GPT 模型使用 apply_patch 而非 edit
      const usePatch = model.modelID.includes("gpt-")
      if (t.id === "apply_patch") return usePatch
      if (t.id === "edit" || t.id === "write") return !usePatch
      
      // GPT 模型不使用 todo 工具
      if (t.id === "todoread" || t.id === "todowrite") {
        if (model.modelID.includes("gpt-")) return false
      }
      
      return true
    })
  }
}
```

### 模型适配

不同的 LLM 对工具有不同的偏好。OpenCode 会根据模型动态调整：

| 模型 | 特殊处理 |
|------|---------|
| GPT 系列 | 使用 `apply_patch` 而非 `edit`，禁用 todo 工具 |
| Claude | 标准工具集 |
| OpenCode | 启用 websearch/codesearch |

## 工具执行上下文

### Tool.Context：工具的执行环境

每个工具执行时都会收到一个 Context 对象：

```typescript
interface Context {
  sessionID: string       // 会话 ID
  messageID: string       // 消息 ID
  agent: string           // 当前 Agent 名称
  abort: AbortSignal      // 取消信号
  callID?: string         // 工具调用 ID
  
  // 更新元数据（实时反馈）
  metadata(input: { title?: string; metadata?: any }): void
  
  // 请求权限
  ask(input: PermissionRequest): Promise<void>
}
```

### 权限请求

工具可以通过 `ctx.ask()` 请求执行权限：

```typescript
await ctx.ask({
  permission: "edit",           // 权限类型
  patterns: ["src/app.ts"],     // 影响的资源
  always: ["*"],                // "始终允许"时使用的模式
  metadata: { diff },           // 额外信息（显示给用户）
})
```

如果用户配置了 `deny`，会抛出异常；如果是 `ask`，会暂停等待用户确认。

## 自定义工具

### 项目级自定义

在项目目录创建 `tools/` 文件夹：

```typescript
// tools/my-database.ts
import { z } from "zod"

export default {
  description: "Query the project database",
  args: {
    query: z.string().describe("SQL query to execute"),
  },
  async execute(args, ctx) {
    // 执行数据库查询
    const result = await db.query(args.query)
    return JSON.stringify(result)
  },
}
```

OpenCode 会自动加载并注册这个工具。

### 插件工具

通过 npm 插件提供工具：

```json
// opencode.json
{
  "plugins": ["@opencode/plugin-jira"]
}
```

```typescript
// @opencode/plugin-jira/index.ts
export const tool = {
  "jira-create": {
    description: "Create a JIRA issue",
    args: { ... },
    execute: async (args) => { ... },
  },
  "jira-search": {
    description: "Search JIRA issues",
    args: { ... },
    execute: async (args) => { ... },
  },
}
```

## 输出截断机制

### 为什么需要截断？

LLM 的上下文窗口有限。如果一个工具返回了 100MB 的日志，会：
1. 超出上下文限制
2. 浪费大量 token
3. 淹没真正有用的信息

### Truncate 模块

```typescript
// packages/opencode/src/tool/truncation.ts
export namespace Truncate {
  export const MAX_LINES = 2000
  export const MAX_BYTES = 51200  // 50KB

  export async function output(content: string, options: {}, agent?: Agent.Info) {
    const lines = content.split("\n")
    
    if (lines.length <= MAX_LINES && content.length <= MAX_BYTES) {
      return { content, truncated: false }
    }
    
    // 截断并保存完整输出到文件
    const outputPath = path.join(Truncate.DIR, `${ulid()}.txt`)
    await Bun.write(outputPath, content)
    
    const truncatedContent = lines.slice(0, MAX_LINES).join("\n")
    
    return {
      content: truncatedContent + `\n\n[Output truncated. Full output saved to ${outputPath}]`,
      truncated: true,
      outputPath,
    }
  }
}
```

工具输出如果超限，会：
1. 截断到 2000 行 / 50KB
2. 完整输出保存到临时文件
3. 在输出末尾告知 LLM 可以用 `read` 工具读取完整内容

## InvalidTool：处理无效调用

LLM 有时会"幻觉"出不存在的工具或传入错误参数：

```typescript
// packages/opencode/src/tool/invalid.ts
export const InvalidTool = Tool.define("invalid", {
  description: "Placeholder for invalid tool calls",
  parameters: z.object({
    tool: z.string(),
    error: z.string(),
  }),
  async execute(params, ctx) {
    return {
      title: "Invalid tool call",
      output: `Error: ${params.error}. The tool "${params.tool}" does not exist or was called incorrectly.`,
      metadata: {},
    }
  },
})
```

当 LLM 调用不存在的工具时，请求会被路由到 `InvalidTool`，返回一个友好的错误信息，让 LLM 知道需要换种方式。

## 工具转换：适配不同 LLM

### AI SDK 工具格式

OpenCode 使用 Vercel AI SDK，需要将工具转换为 SDK 格式：

```typescript
// packages/opencode/src/session/prompt.ts
async function resolveTools(input) {
  const tools: Record<string, AITool> = {}
  
  for (const item of await ToolRegistry.tools(input.model, input.agent)) {
    // 转换 Zod Schema 为 JSON Schema
    const schema = ProviderTransform.schema(
      input.model, 
      z.toJSONSchema(item.parameters)
    )
    
    // 包装为 AI SDK tool
    tools[item.id] = tool({
      id: item.id,
      description: item.description,
      inputSchema: jsonSchema(schema),
      execute: async (args, options) => {
        const ctx = createContext(args, options)
        
        // 插件钩子
        await Plugin.trigger("tool.execute.before", { tool: item.id })
        
        const result = await item.execute(args, ctx)
        
        await Plugin.trigger("tool.execute.after", { tool: item.id }, result)
        
        return result
      },
    })
  }
  
  return tools
}
```

### Schema 适配

不同的 LLM 对 Schema 有不同的要求：

```typescript
// packages/opencode/src/provider/transform.ts
export namespace ProviderTransform {
  export function schema(model: Provider.Model, schema: JSONSchema) {
    // Anthropic 不支持 additionalProperties
    if (model.providerID === "anthropic") {
      delete schema.additionalProperties
    }
    
    // OpenAI 要求 strict mode 时所有字段必填
    if (model.providerID === "openai" && model.options?.strict) {
      makeAllRequired(schema)
    }
    
    return schema
  }
}
```

## 工具系统的安全设计

### 1. 参数验证

所有工具参数都经过 Zod Schema 验证：

```typescript
toolInfo.execute = async (args, ctx) => {
  try {
    toolInfo.parameters.parse(args)
  } catch (error) {
    throw new Error(`Invalid arguments: ${error}`)
  }
  // ...
}
```

### 2. 权限控制

每个敏感操作都需要权限：

```typescript
await ctx.ask({
  permission: "bash",
  patterns: ["rm -rf *"],
  metadata: {},
})
```

### 3. 外部目录保护

防止 AI 修改项目外的文件：

```typescript
// packages/opencode/src/tool/external-directory.ts
export async function assertExternalDirectory(ctx, filepath, options) {
  if (!Instance.containsPath(filepath)) {
    await ctx.ask({
      permission: "external_directory",
      patterns: [filepath],
      metadata: {},
    })
  }
}
```

### 4. 超时保护

Bash 工具有超时机制，防止命令无限执行。

### 5. 死循环检测

Session Processor 会检测连续相同的工具调用。

## 总结

OpenCode 的工具系统是一个精心设计的能力层：

| 组件 | 职责 |
|------|-----|
| `Tool.define` | 统一的工具定义接口 |
| `ToolRegistry` | 工具注册与管理 |
| `Tool.Context` | 执行环境与权限控制 |
| `Truncate` | 输出截断 |
| `InvalidTool` | 无效调用处理 |

关键设计原则：

1. **声明式定义**：Zod Schema 描述参数，自动验证和类型推断
2. **权限最小化**：每个操作都需要明确的权限
3. **输出安全**：自动截断防止上下文溢出
4. **可扩展性**：支持项目级自定义和插件扩展
5. **模型适配**：根据不同 LLM 调整工具集

理解了工具系统，你就理解了 AI Agent 如何"行动"。下一篇，我们将探讨 MCP 协议，看看如何将 Agent 的能力扩展到更广阔的世界。

---

> **下一篇**：[MCP 协议深度解析 - 构建可扩展的 AI 能力生态](./05-mcp-protocol.md)
