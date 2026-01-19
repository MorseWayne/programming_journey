---
title: 会话循环机制
icon: sync
order: 3
date: 2025-01-20
category:
  - AI
  - OpenCode
tag:
  - Agent Loop
  - LLM
  - 流式处理
---

# 会话循环机制：Agent 如何与 LLM 交互

在上一篇文章中，我们了解了 OpenCode 的整体架构。现在，让我们深入到最核心的部分：**Agent Loop（会话循环）**。

这是 AI Agent 的"心脏"，理解它，就理解了 Agent 为什么能自主完成任务。

## 什么是 Agent Loop？

传统的 Chat 应用是**单轮交互**：
```
用户发消息 → AI 回复 → 结束
```

而 Agent Loop 是**多轮自动交互**：
```
用户发消息 → AI 决定行动 → 执行行动 → AI 看到结果 → AI 决定下一步 → ... → 任务完成
```

关键区别：**AI 在中间会主动调用工具，并根据工具的执行结果决定下一步。**

## 核心代码剖析

OpenCode 的 Agent Loop 核心在 `src/session/prompt.ts` 的 `loop` 函数：

```typescript
// packages/opencode/src/session/prompt.ts
export const loop = fn(Identifier.schema("session"), async (sessionID) => {
  const abort = start(sessionID)
  
  // 如果已有循环在运行，等待其完成
  if (!abort) {
    return new Promise<MessageV2.WithParts>((resolve, reject) => {
      const callbacks = state()[sessionID].callbacks
      callbacks.push({ resolve, reject })
    })
  }

  using _ = defer(() => cancel(sessionID))

  let step = 0
  const session = await Session.get(sessionID)
  
  // 🔥 核心：无限循环
  while (true) {
    SessionStatus.set(sessionID, { type: "busy" })
    log.info("loop", { step, sessionID })
    
    if (abort.aborted) break
    
    // ... 获取消息历史、处理 Tool Call、调用 LLM ...
    
    step++
  }
  
  // 循环结束，返回最终的 Assistant 消息
  for await (const item of MessageV2.stream(sessionID)) {
    if (item.info.role === "user") continue
    return item
  }
})
```

### 循环的退出条件

循环不会无限进行，它有明确的退出条件：

```typescript
// 1. 用户取消
if (abort.aborted) break

// 2. AI 完成了任务（没有 Tool Call）
if (
  lastAssistant?.finish &&
  !["tool-calls", "unknown"].includes(lastAssistant.finish) &&
  lastUser.id < lastAssistant.id
) {
  log.info("exiting loop", { sessionID })
  break
}

// 3. 达到最大步数限制
const maxSteps = agent.steps ?? Infinity
const isLastStep = step >= maxSteps
```

### 循环内做了什么？

每次循环迭代大致执行以下步骤：

```
┌─────────────────────────────────────────────────────────────┐
│                    一次循环迭代                              │
├─────────────────────────────────────────────────────────────┤
│ 1. 获取会话历史                                              │
│    msgs = await MessageV2.filterCompacted(...)              │
├─────────────────────────────────────────────────────────────┤
│ 2. 检查是否需要上下文压缩                                     │
│    if (overflow) → SessionCompaction.create(...)            │
├─────────────────────────────────────────────────────────────┤
│ 3. 解析可用工具                                              │
│    tools = await resolveTools(...)                          │
├─────────────────────────────────────────────────────────────┤
│ 4. 调用 LLM (核心)                                          │
│    result = await processor.process({                       │
│      messages, tools, system, model                         │
│    })                                                       │
├─────────────────────────────────────────────────────────────┤
│ 5. 处理结果                                                  │
│    - "stop" → break 退出循环                                │
│    - "compact" → 创建压缩任务，继续循环                       │
│    - 有 Tool Call → 执行工具，继续循环                        │
└─────────────────────────────────────────────────────────────┘
```

## 消息处理系统

### 消息结构

OpenCode 使用 `MessageV2` 来管理消息：

```typescript
// packages/opencode/src/session/message-v2.ts (概念示意)
namespace MessageV2 {
  // 用户消息
  interface User {
    id: string
    role: "user"
    sessionID: string
    model: { providerID: string; modelID: string }
    agent: string
    time: { created: number }
  }
  
  // 助手消息
  interface Assistant {
    id: string
    role: "assistant"
    sessionID: string
    agent: string
    tokens: {
      input: number
      output: number
      reasoning: number
      cache: { read: number; write: number }
    }
    cost: number
    finish?: "stop" | "tool-calls" | "length" | "content-filter" | "unknown"
    time: { created: number; completed?: number }
  }
}
```

### 消息的 Parts

每条消息可以有多个 Part（部分）：

```typescript
// 文本部分
interface TextPart {
  type: "text"
  text: string
}

// 推理部分（用于显示 AI 的思考过程）
interface ReasoningPart {
  type: "reasoning"
  text: string
  time: { start: number; end?: number }
}

// 工具调用部分
interface ToolPart {
  type: "tool"
  tool: string       // 工具名称
  callID: string     // 调用 ID
  state: {
    status: "pending" | "running" | "completed" | "error"
    input: any       // 工具输入参数
    output?: string  // 工具输出
    title?: string   // 执行摘要
    time?: { start: number; end?: number }
  }
}

// 文件部分
interface FilePart {
  type: "file"
  url: string
  filename: string
  mime: string
}
```

### 消息流

`MessageV2.stream` 提供了消息的流式迭代：

```typescript
for await (const item of MessageV2.stream(sessionID)) {
  // item 包含消息信息和所有 parts
  console.log(item.info.role, item.parts)
}
```

## LLM 调用详解

### streamText：流式调用

OpenCode 使用 Vercel AI SDK 的 `streamText` 进行流式调用：

```typescript
// packages/opencode/src/session/llm.ts
export async function stream(input: StreamInput) {
  // 1. 获取语言模型
  const language = await Provider.getLanguage(input.model)
  
  // 2. 构建 System Prompt
  const system = SystemPrompt.header(input.model.providerID)
  system.push(
    [
      input.agent.prompt,    // Agent 专属 prompt
      ...input.system,       // 额外的 system prompt
    ].filter(x => x).join("\n")
  )
  
  // 3. 构建参数
  const params = {
    temperature: input.agent.temperature ?? defaultTemp,
    topP: input.agent.topP ?? defaultTopP,
    options: mergeDeep(input.model.options, input.agent.options),
  }
  
  // 4. 调用 streamText
  return streamText({
    model: language,
    messages: input.messages,
    tools: input.tools,
    system: system,
    temperature: params.temperature,
    maxOutputTokens: OUTPUT_TOKEN_MAX,
    abortSignal: input.abort,
    // ... 其他参数
  })
}
```

### 为什么用流式（Streaming）？

流式响应有几个关键优势：

1. **更低的首字延迟**：用户立即看到输出，而不是等待完整响应
2. **可中断**：用户可以随时取消
3. **实时反馈**：Tool Call 的执行状态可以实时展示
4. **更好的错误处理**：流中断时可以优雅恢复

## SessionProcessor：响应处理器

`SessionProcessor` 负责处理 LLM 的流式响应：

```typescript
// packages/opencode/src/session/processor.ts
export function create(input) {
  const toolcalls: Record<string, MessageV2.ToolPart> = {}
  
  return {
    async process(streamInput: LLM.StreamInput) {
      while (true) {
        const stream = await LLM.stream(streamInput)
        
        for await (const value of stream.fullStream) {
          input.abort.throwIfAborted()
          
          switch (value.type) {
            // 🧠 处理 AI 的思考过程
            case "reasoning-start":
              // 创建 reasoning part
              break
              
            case "reasoning-delta":
              // 追加思考内容
              break
              
            case "reasoning-end":
              // 完成思考
              break
            
            // 🔧 处理工具调用
            case "tool-input-start":
              // 工具调用开始，创建 pending 状态的 part
              break
              
            case "tool-call":
              // 工具参数完整，开始执行
              // 🔥 检测 Doom Loop（死循环）
              break
              
            case "tool-result":
              // 工具执行完成
              break
              
            case "tool-error":
              // 工具执行失败
              break
            
            // 📝 处理文本输出
            case "text-delta":
              // 追加文本内容
              break
          }
        }
        
        // 处理完成后的逻辑...
      }
    }
  }
}
```

### Doom Loop 检测

一个重要的安全机制是**Doom Loop（死循环）检测**：

```typescript
case "tool-call": {
  const parts = await MessageV2.parts(input.assistantMessage.id)
  const lastThree = parts.slice(-DOOM_LOOP_THRESHOLD)  // 最后 3 次调用
  
  // 如果连续 3 次调用相同的工具和参数，可能陷入了死循环
  if (
    lastThree.length === DOOM_LOOP_THRESHOLD &&
    lastThree.every(
      (p) =>
        p.type === "tool" &&
        p.tool === value.toolName &&
        JSON.stringify(p.state.input) === JSON.stringify(value.input)
    )
  ) {
    // 询问用户是否继续
    await PermissionNext.ask({
      permission: "doom_loop",
      patterns: [value.toolName],
      metadata: { tool: value.toolName, input: value.input },
    })
  }
}
```

## 工具解析系统

### resolveTools：动态构建工具列表

```typescript
// packages/opencode/src/session/prompt.ts
async function resolveTools(input: {
  agent: Agent.Info
  model: Provider.Model
  session: Session.Info
  processor: SessionProcessor.Info
}) {
  const tools: Record<string, AITool> = {}
  
  // 从 ToolRegistry 获取所有工具
  for (const item of await ToolRegistry.tools(
    { modelID: input.model.api.id, providerID: input.model.providerID },
    input.agent,
  )) {
    // 转换 Schema 以适配特定模型
    const schema = ProviderTransform.schema(
      input.model, 
      z.toJSONSchema(item.parameters)
    )
    
    // 包装为 AI SDK 工具
    tools[item.id] = tool({
      id: item.id,
      description: item.description,
      inputSchema: jsonSchema(schema),
      async execute(args, options) {
        const ctx = context(args, options)
        
        // 触发插件钩子
        await Plugin.trigger("tool.execute.before", {...})
        
        // 执行工具
        const result = await item.execute(args, ctx)
        
        // 触发插件钩子
        await Plugin.trigger("tool.execute.after", {...})
        
        return result
      },
    })
  }
  
  // 加载 MCP 工具
  for (const mcp of await MCP.list()) {
    for (const mcpTool of await mcp.tools()) {
      tools[mcpTool.name] = tool({...})
    }
  }
  
  return tools
}
```

### 权限控制

每个工具执行前都会检查权限：

```typescript
const ctx: Tool.Context = {
  async ask(req) {
    await PermissionNext.ask({
      ...req,
      sessionID: input.session.id,
      ruleset: PermissionNext.merge(
        input.agent.permission,   // Agent 级别权限
        input.session.permission  // Session 级别权限
      ),
    })
  },
}
```

## 上下文管理

### Context Window 限制

LLM 有上下文长度限制（如 Claude 3 是 200K tokens）。当对话过长时，需要压缩：

```typescript
// 检查是否溢出
if (
  lastFinished &&
  lastFinished.summary !== true &&
  (await SessionCompaction.isOverflow({ tokens: lastFinished.tokens, model }))
) {
  // 创建压缩任务
  await SessionCompaction.create({
    sessionID,
    agent: lastUser.agent,
    model: lastUser.model,
    auto: true,
  })
  continue  // 继续循环处理压缩
}
```

### 压缩机制

压缩由专门的 `compaction` Agent 执行：

```typescript
// packages/opencode/src/agent/agent.ts
compaction: {
  name: "compaction",
  mode: "primary",
  hidden: true,  // 用户不可见
  prompt: PROMPT_COMPACTION,  // 专门的压缩 prompt
  permission: PermissionNext.fromConfig({
    "*": "deny",  // 只能读，不能执行任何工具
  }),
}
```

压缩 prompt 指示 AI 将长对话压缩为摘要：

```
你是一个对话压缩助手。请将以下对话历史压缩为简洁的摘要，
保留关键信息（已完成的任务、重要发现、待处理事项）。
```

## System Prompt 构建

### 多层 System Prompt

OpenCode 的 System Prompt 由多层组成：

```typescript
// packages/opencode/src/session/system.ts
export namespace SystemPrompt {
  // 1. 头部信息（项目路径、时间等）
  export function header(providerID: string): string[] {
    return [
      `Current working directory: ${Instance.worktree}`,
      `Current time: ${new Date().toISOString()}`,
      `Platform: ${os.platform()}`,
      // ...
    ]
  }
  
  // 2. Provider 特定的指令
  export function provider(model: Provider.Model): string[] {
    // 根据不同提供商返回优化的 prompt
  }
  
  // 3. 自定义规则文件
  export async function custom(): Promise<string[]> {
    // 读取 AGENTS.md, CLAUDE.md, .cursorrules 等
    const files = await findCustomPromptFiles()
    return Promise.all(files.map(f => fs.readFile(f, "utf-8")))
  }
  
  // 4. 环境信息
  export async function environment(): Promise<string[]> {
    // Git 状态、LSP 诊断等
  }
}
```

### 完整的 Prompt 组装

```typescript
const result = await processor.process({
  system: [
    ...await SystemPrompt.environment(),  // 环境信息
    ...await SystemPrompt.custom(),       // 自定义规则
  ],
  messages: [
    // System Prompt 作为第一条消息
    ...system.map(item => ({ role: "system", content: item })),
    // 历史消息
    ...MessageV2.toModelMessage(sessionMessages),
    // 如果是最后一步，添加提醒
    ...(isLastStep ? [{ role: "assistant", content: MAX_STEPS }] : []),
  ],
  tools,
  model,
})
```

## 错误处理与重试

### 自动重试机制

OpenCode 有完善的重试机制：

```typescript
// packages/opencode/src/session/retry.ts
export namespace SessionRetry {
  export async function shouldRetry(error: Error, attempt: number): Promise<boolean> {
    // 1. 超过最大重试次数
    if (attempt >= MAX_RETRIES) return false
    
    // 2. 检查错误类型
    if (isRateLimitError(error)) {
      await sleep(exponentialBackoff(attempt))
      return true
    }
    
    if (isTransientError(error)) {
      await sleep(1000)
      return true
    }
    
    return false
  }
}
```

### 工具执行错误

工具执行失败时的处理：

```typescript
case "tool-error": {
  const match = toolcalls[value.toolCallId]
  if (match && match.state.status === "running") {
    await Session.updatePart({
      ...match,
      state: {
        status: "error",
        error: value.error.message,
        input: match.state.input,
        time: {
          start: match.state.time.start,
          end: Date.now(),
        },
      },
    })
  }
  break
}
```

错误会被反馈给 LLM，让它决定如何处理（重试、换种方式、告知用户）。

## 实际执行流程示例

让我们用一个具体例子来理解整个流程：

```
用户: "帮我创建一个 hello.py 文件，内容是打印 Hello World"

Step 1:
├─ 构建消息: [System, User("帮我创建...")]
├─ 调用 LLM
└─ LLM 响应: Tool Call(write, {path: "hello.py", content: "print('Hello World')"})

Step 2:
├─ 执行 WriteTool
│   ├─ 检查权限 → allow
│   └─ 写入文件 → 成功
├─ 构建消息: [System, User, Assistant(Tool Call), Tool Result("成功")]
├─ 调用 LLM
└─ LLM 响应: "我已经创建了 hello.py 文件..."

Step 3:
├─ LLM 的 finish 是 "stop"（没有 Tool Call）
└─ 退出循环，返回最终消息
```

## 总结

OpenCode 的会话循环机制是一个精心设计的系统：

| 组件 | 职责 |
|------|-----|
| `loop()` | 主循环控制 |
| `SessionProcessor` | 处理 LLM 响应流 |
| `LLM.stream()` | 调用 LLM API |
| `resolveTools()` | 动态构建工具列表 |
| `SessionCompaction` | 上下文压缩 |
| `PermissionNext` | 权限控制 |

关键设计原则：

1. **流式优先**：所有 LLM 交互都是流式的
2. **可中断**：用户随时可以取消
3. **安全第一**：死循环检测、权限控制
4. **可扩展**：插件钩子贯穿整个流程
5. **错误恢复**：完善的重试和错误处理

理解了这个循环机制，你就理解了 AI Agent 为什么能够"自主"完成任务——它本质上是一个 while 循环，不断地：

```
推理 → 行动 → 观察 → 推理 → ...
```

直到任务完成。

---

> **下一篇**：[工具系统设计 - 让 AI 拥有行动能力](./04-tool-system.md)
