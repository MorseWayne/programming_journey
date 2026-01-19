---
title: Provider 抽象层
icon: cloud
order: 6
date: 2025-01-20
category:
  - AI
  - OpenCode
tag:
  - Provider
  - LLM
  - Vercel AI SDK
  - 多模型支持
---

# Provider 抽象层：如何支持 20+ LLM 提供商

在前面的文章中，我们了解了 OpenCode 如何与 LLM 交互、如何管理工具、如何通过 MCP 扩展能力。但有一个问题我们还没有深入讨论：

**OpenCode 是如何支持这么多不同的 LLM 提供商的？**

从 OpenAI 到 Anthropic，从 GitHub Copilot 到 AWS Bedrock，从 Google Vertex 到本地 Ollama——每个提供商都有不同的 API 格式、认证方式、参数规范。OpenCode 是如何优雅地处理这些差异的？

答案就在 **Provider 抽象层**。

## 问题：LLM 提供商的碎片化

### 各家 API 的差异

每个 LLM 提供商都有自己的 API 设计：

| 提供商 | API 格式 | 认证方式 | 特殊参数 |
|--------|----------|----------|----------|
| OpenAI | `/v1/chat/completions` | Bearer Token | `response_format`, `tools` |
| Anthropic | `/v1/messages` | `x-api-key` Header | `system` 单独字段, `thinking` |
| AWS Bedrock | AWS SDK | IAM/STS | 区域前缀, `reasoningConfig` |
| Google Vertex | Google Cloud SDK | Service Account | `thinkingConfig` |
| GitHub Copilot | 逆向工程接口 | OAuth Token | `reasoning.encrypted_content` |

如果为每个提供商写一套代码，维护成本会非常高。

### 解决方案：抽象层

```
用户代码
   ↓
Provider 抽象层
   ↓
┌─────────────────────────────────────────────┐
│  OpenAI  │ Anthropic │ Bedrock │ Copilot │ ...
└─────────────────────────────────────────────┘
```

Provider 抽象层负责：
1. **统一接口**：对外暴露一致的 API
2. **配置管理**：处理不同的认证和参数
3. **消息转换**：适配各家的消息格式
4. **动态加载**：按需加载 SDK

## Vercel AI SDK：抽象的基石

OpenCode 的 Provider 系统基于 [Vercel AI SDK](https://sdk.vercel.ai/docs)，这是目前最流行的 AI SDK 统一封装库。

### 什么是 Vercel AI SDK？

Vercel AI SDK 提供了一套标准化的接口来调用各种 LLM：

```typescript
import { generateText } from "ai"
import { openai } from "@ai-sdk/openai"
import { anthropic } from "@ai-sdk/anthropic"

// 调用 OpenAI
const result1 = await generateText({
  model: openai("gpt-4o"),
  prompt: "Hello",
})

// 调用 Anthropic - 接口完全一样！
const result2 = await generateText({
  model: anthropic("claude-3-5-sonnet"),
  prompt: "Hello",
})
```

### AI SDK 的 Provider 包

每个 LLM 提供商都有对应的 SDK 包：

```typescript
// packages/opencode/src/provider/provider.ts
import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock"
import { createAnthropic } from "@ai-sdk/anthropic"
import { createAzure } from "@ai-sdk/azure"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createVertex } from "@ai-sdk/google-vertex"
import { createOpenAI } from "@ai-sdk/openai"
import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import { createOpenRouter } from "@openrouter/ai-sdk-provider"
import { createXai } from "@ai-sdk/xai"
import { createMistral } from "@ai-sdk/mistral"
import { createGroq } from "@ai-sdk/groq"
import { createDeepInfra } from "@ai-sdk/deepinfra"
import { createCerebras } from "@ai-sdk/cerebras"
import { createCohere } from "@ai-sdk/cohere"
import { createTogetherAI } from "@ai-sdk/togetherai"
import { createPerplexity } from "@ai-sdk/perplexity"
// ... 还有更多
```

## OpenCode 的 Provider 系统架构

### 核心数据结构

#### Model（模型信息）

```typescript
// packages/opencode/src/provider/provider.ts
export const Model = z.object({
  id: z.string(),                    // 模型 ID，如 "gpt-4o"
  providerID: z.string(),            // 提供商 ID，如 "openai"
  api: z.object({
    id: z.string(),                  // API 调用时的模型 ID
    url: z.string(),                 // API 端点
    npm: z.string(),                 // SDK 包名
  }),
  name: z.string(),                  // 显示名称
  capabilities: z.object({
    temperature: z.boolean(),        // 是否支持温度参数
    reasoning: z.boolean(),          // 是否支持推理模式
    attachment: z.boolean(),         // 是否支持附件
    toolcall: z.boolean(),           // 是否支持工具调用
    input: z.object({
      text: z.boolean(),
      audio: z.boolean(),
      image: z.boolean(),
      video: z.boolean(),
      pdf: z.boolean(),
    }),
    output: z.object({
      text: z.boolean(),
      audio: z.boolean(),
      image: z.boolean(),
      video: z.boolean(),
      pdf: z.boolean(),
    }),
    interleaved: z.union([...]),     // 是否支持交错思维
  }),
  cost: z.object({
    input: z.number(),               // 输入价格（每百万 token）
    output: z.number(),              // 输出价格
    cache: z.object({
      read: z.number(),
      write: z.number(),
    }),
  }),
  limit: z.object({
    context: z.number(),             // 上下文窗口大小
    output: z.number(),              // 最大输出长度
  }),
  status: z.enum(["alpha", "beta", "deprecated", "active"]),
})
```

#### Provider（提供商信息）

```typescript
export const Info = z.object({
  id: z.string(),                    // 提供商 ID
  name: z.string(),                  // 显示名称
  source: z.enum(["env", "config", "custom", "api"]),  // 配置来源
  env: z.string().array(),           // 环境变量名
  key: z.string().optional(),        // API Key
  options: z.record(z.string(), z.any()),  // SDK 选项
  models: z.record(z.string(), Model),     // 支持的模型列表
})
```

### 模型信息来源：models.dev

OpenCode 不是硬编码所有模型信息，而是从 [models.dev](https://models.dev) 获取最新数据：

```typescript
// packages/opencode/src/provider/models.ts
export namespace ModelsDev {
  const filepath = path.join(Global.Path.cache, "models.json")
  
  export async function get() {
    refresh()  // 后台刷新
    const file = Bun.file(filepath)
    const result = await file.json().catch(() => {})
    if (result) return result as Record<string, Provider>
    
    // 如果本地没有，从远程获取
    const json = await fetch("https://models.dev/api.json").then(x => x.text())
    return JSON.parse(json) as Record<string, Provider>
  }
  
  export async function refresh() {
    const result = await fetch("https://models.dev/api.json", {
      headers: { "User-Agent": Installation.USER_AGENT },
      signal: AbortSignal.timeout(10 * 1000),
    })
    if (result.ok) await Bun.write(file, await result.text())
  }
}

// 每小时自动刷新
setInterval(() => ModelsDev.refresh(), 60 * 1000 * 60).unref()
```

`models.dev` 维护了一个完整的 LLM 模型数据库，包括：
- 模型 ID 和名称
- 能力支持情况
- 价格信息
- 上下文限制
- API 端点

这使得 OpenCode 可以自动获取新模型，无需手动更新。

## Provider 加载流程

### 内置 Provider 映射

OpenCode 内置了常用 Provider 的 SDK 映射：

```typescript
// packages/opencode/src/provider/provider.ts
const BUNDLED_PROVIDERS: Record<string, (options: any) => SDK> = {
  "@ai-sdk/amazon-bedrock": createAmazonBedrock,
  "@ai-sdk/anthropic": createAnthropic,
  "@ai-sdk/azure": createAzure,
  "@ai-sdk/google": createGoogleGenerativeAI,
  "@ai-sdk/google-vertex": createVertex,
  "@ai-sdk/openai": createOpenAI,
  "@ai-sdk/openai-compatible": createOpenAICompatible,
  "@openrouter/ai-sdk-provider": createOpenRouter,
  "@ai-sdk/xai": createXai,
  "@ai-sdk/mistral": createMistral,
  "@ai-sdk/groq": createGroq,
  "@ai-sdk/deepinfra": createDeepInfra,
  "@ai-sdk/cerebras": createCerebras,
  "@ai-sdk/cohere": createCohere,
  "@ai-sdk/togetherai": createTogetherAI,
  "@ai-sdk/perplexity": createPerplexity,
  "@gitlab/gitlab-ai-provider": createGitLab,
  "@ai-sdk/github-copilot": createGitHubCopilotOpenAICompatible,
}
```

### 动态 SDK 加载

对于未内置的 Provider，OpenCode 可以动态安装和加载：

```typescript
async function getSDK(model: Model) {
  const bundledKey = model.api.npm
  const bundledFn = BUNDLED_PROVIDERS[bundledKey]
  
  if (bundledFn) {
    // 使用内置 Provider
    log.info("using bundled provider", { pkg: bundledKey })
    return bundledFn(options) as SDK
  }
  
  // 动态安装并加载
  let installedPath: string
  if (!model.api.npm.startsWith("file://")) {
    // 使用 Bun 动态安装 npm 包
    installedPath = await BunProc.install(model.api.npm, "latest")
  } else {
    // 本地文件路径
    installedPath = model.api.npm
  }
  
  // 动态导入
  const mod = await import(installedPath)
  const fn = mod[Object.keys(mod).find(key => key.startsWith("create"))!]
  return fn(options) as SDK
}
```

这意味着用户可以使用任何兼容 Vercel AI SDK 的 Provider，OpenCode 会自动安装和加载。

### API Key 检测流程

OpenCode 会从多个来源检测 API Key：

```typescript
const state = Instance.state(async () => {
  const config = await Config.get()
  const modelsDev = await ModelsDev.get()
  
  const providers: { [providerID: string]: Info } = {}
  
  // 1. 从环境变量加载
  const env = Env.all()
  for (const [providerID, provider] of Object.entries(database)) {
    const apiKey = provider.env.map(item => env[item]).find(Boolean)
    if (apiKey) {
      mergeProvider(providerID, {
        source: "env",
        key: apiKey,
      })
    }
  }
  
  // 2. 从 Auth 存储加载（opencode auth login 命令保存的）
  for (const [providerID, provider] of Object.entries(await Auth.all())) {
    if (provider.type === "api") {
      mergeProvider(providerID, {
        source: "api",
        key: provider.key,
      })
    }
  }
  
  // 3. 从插件加载（如 GitHub Copilot OAuth）
  for (const plugin of await Plugin.list()) {
    if (!plugin.auth) continue
    const auth = await Auth.get(plugin.auth.provider)
    if (auth) {
      const options = await plugin.auth.loader(...)
      mergeProvider(plugin.auth.provider, {
        source: "custom",
        options,
      })
    }
  }
  
  // 4. 从配置文件加载
  for (const [providerID, provider] of configProviders) {
    mergeProvider(providerID, { source: "config" })
  }
  
  return { providers }
})
```

优先级从高到低：
1. **配置文件** (`opencode.json`)
2. **Auth 存储** (`opencode auth login`)
3. **插件认证** (OAuth 流程)
4. **环境变量** (`OPENAI_API_KEY` 等)

## 自定义 Provider 加载器

### 为什么需要自定义加载器？

不同 Provider 有特殊的初始化需求：

```typescript
// packages/opencode/src/provider/provider.ts
const CUSTOM_LOADERS: Record<string, CustomLoader> = {
  // Anthropic 需要特殊 header
  async anthropic() {
    return {
      autoload: false,
      options: {
        headers: {
          "anthropic-beta": "claude-code-20250219,interleaved-thinking-2025-05-14",
        },
      },
    }
  },
  
  // AWS Bedrock 需要复杂的认证
  "amazon-bedrock": async () => {
    const region = Env.get("AWS_REGION") ?? "us-east-1"
    const profile = Env.get("AWS_PROFILE")
    const awsBearerToken = Env.get("AWS_BEARER_TOKEN_BEDROCK")
    
    if (!profile && !awsBearerToken) return { autoload: false }
    
    // 如果没有 Bearer Token，使用 AWS 凭证链
    if (!awsBearerToken) {
      const { fromNodeProviderChain } = await import("@aws-sdk/credential-providers")
      providerOptions.credentialProvider = fromNodeProviderChain({ profile })
    }
    
    return {
      autoload: true,
      options: { region, ...providerOptions },
      // 自定义模型获取逻辑（处理区域前缀）
      async getModel(sdk, modelID, options) {
        // 为跨区域推理添加区域前缀
        if (modelID.includes("claude") && region.startsWith("us")) {
          modelID = `us.${modelID}`
        }
        return sdk.languageModel(modelID)
      },
    }
  },
  
  // Google Vertex 需要项目和位置信息
  "google-vertex": async () => {
    const project = Env.get("GOOGLE_CLOUD_PROJECT")
    const location = Env.get("VERTEX_LOCATION") ?? "us-east5"
    
    if (!project) return { autoload: false }
    
    return {
      autoload: true,
      options: { project, location },
    }
  },
  
  // GitHub Copilot 使用特殊的 API
  "github-copilot": async () => {
    return {
      autoload: false,
      async getModel(sdk, modelID) {
        // GPT-5+ 使用 responses API，其他使用 chat API
        return shouldUseCopilotResponsesApi(modelID) 
          ? sdk.responses(modelID) 
          : sdk.chat(modelID)
      },
    }
  },
}
```

### Bedrock 的区域前缀处理

AWS Bedrock 有复杂的跨区域推理规则：

```typescript
async getModel(sdk: any, modelID: string, options?: Record<string, any>) {
  // 跳过已有区域前缀的模型
  if (modelID.startsWith("global.") || modelID.startsWith("jp.")) {
    return sdk.languageModel(modelID)
  }
  
  const region = options?.region ?? defaultRegion
  let regionPrefix = region.split("-")[0]
  
  switch (regionPrefix) {
    case "us": {
      // 美国区域的特定模型需要 us. 前缀
      const modelRequiresPrefix = [
        "nova-micro", "nova-lite", "nova-pro", "claude", "deepseek"
      ].some(m => modelID.includes(m))
      if (modelRequiresPrefix) {
        modelID = `us.${modelID}`
      }
      break
    }
    case "eu": {
      // 欧洲区域使用 eu. 前缀
      if (regionRequiresPrefix && modelRequiresPrefix) {
        modelID = `eu.${modelID}`
      }
      break
    }
    case "ap": {
      // 亚太区域根据具体区域使用不同前缀
      if (isTokyoRegion) {
        regionPrefix = "jp"
      } else if (isAustraliaRegion) {
        regionPrefix = "au"
      } else {
        regionPrefix = "apac"
      }
      modelID = `${regionPrefix}.${modelID}`
      break
    }
  }
  
  return sdk.languageModel(modelID)
}
```

## GitHub Copilot 的特殊处理

### 逆向工程接口

GitHub Copilot 没有官方的 SDK，OpenCode 通过逆向工程实现了兼容：

```typescript
// packages/opencode/src/provider/sdk/openai-compatible/src/openai-compatible-provider.ts
export function createOpenaiCompatible(options: OpenaiCompatibleProviderSettings = {}): OpenaiCompatibleProvider {
  const baseURL = withoutTrailingSlash(options.baseURL ?? "https://api.openai.com/v1")
  
  const createChatModel = (modelId: string) => {
    return new OpenAICompatibleChatLanguageModel(modelId, {
      provider: `${options.name ?? "openai-compatible"}.chat`,
      headers: getHeaders,
      url: ({ path }) => `${baseURL}${path}`,
    })
  }
  
  const createResponsesModel = (modelId: string) => {
    return new OpenAIResponsesLanguageModel(modelId, {
      provider: `${options.name ?? "openai-compatible"}.responses`,
      headers: getHeaders,
      url: ({ path }) => `${baseURL}${path}`,
    })
  }
  
  provider.chat = createChatModel
  provider.responses = createResponsesModel
  
  return provider
}
```

### GPT-5 的 Responses API

GitHub Copilot 对 GPT-5+ 模型使用新的 Responses API：

```typescript
function shouldUseCopilotResponsesApi(modelID: string): boolean {
  return isGpt5OrLater(modelID) && !modelID.startsWith("gpt-5-mini")
}

function isGpt5OrLater(modelID: string): boolean {
  const match = /^gpt-(\d+)/.exec(modelID)
  if (!match) return false
  return Number(match[1]) >= 5
}

// 在自定义加载器中使用
"github-copilot": async () => {
  return {
    autoload: false,
    async getModel(sdk, modelID) {
      return shouldUseCopilotResponsesApi(modelID) 
        ? sdk.responses(modelID)  // 使用 Responses API
        : sdk.chat(modelID)       // 使用 Chat API
    },
  }
}
```

## 消息格式转换

### 不同提供商的消息差异

各家 LLM 对消息格式有不同要求：

```typescript
// packages/opencode/src/provider/transform.ts
export namespace ProviderTransform {
  export function message(msgs: ModelMessage[], model: Provider.Model) {
    // 1. 处理不支持的媒体类型
    msgs = unsupportedParts(msgs, model)
    
    // 2. 提供商特定的消息规范化
    msgs = normalizeMessages(msgs, model)
    
    // 3. Anthropic 需要缓存控制
    if (model.api.npm === "@ai-sdk/anthropic") {
      msgs = applyCaching(msgs, model.providerID)
    }
    
    return msgs
  }
}
```

### Anthropic 的特殊处理

Anthropic 拒绝空内容的消息：

```typescript
function normalizeMessages(msgs: ModelMessage[], model: Provider.Model) {
  if (model.api.npm === "@ai-sdk/anthropic") {
    msgs = msgs
      .map(msg => {
        if (typeof msg.content === "string") {
          if (msg.content === "") return undefined  // 过滤空字符串
          return msg
        }
        if (!Array.isArray(msg.content)) return msg
        
        // 过滤空的 text/reasoning 部分
        const filtered = msg.content.filter(part => {
          if (part.type === "text" || part.type === "reasoning") {
            return part.text !== ""
          }
          return true
        })
        if (filtered.length === 0) return undefined
        return { ...msg, content: filtered }
      })
      .filter(msg => msg !== undefined)
  }
  
  // Claude 模型的 toolCallId 格式化
  if (model.api.id.includes("claude")) {
    return msgs.map(msg => {
      if (Array.isArray(msg.content)) {
        msg.content = msg.content.map(part => {
          if (part.type === "tool-call" && "toolCallId" in part) {
            return {
              ...part,
              // 只保留字母数字和下划线/连字符
              toolCallId: part.toolCallId.replace(/[^a-zA-Z0-9_-]/g, "_"),
            }
          }
          return part
        })
      }
      return msg
    })
  }
  
  return msgs
}
```

### Mistral 的 Tool Call ID 要求

Mistral 对 Tool Call ID 有严格的格式要求：

```typescript
if (model.providerID === "mistral" || model.api.id.includes("mistral")) {
  return msgs.map(msg => {
    if (Array.isArray(msg.content)) {
      msg.content = msg.content.map(part => {
        if (part.type === "tool-call" && "toolCallId" in part) {
          // Mistral 要求：纯字母数字，正好 9 个字符
          const normalizedId = part.toolCallId
            .replace(/[^a-zA-Z0-9]/g, "")  // 移除非字母数字字符
            .substring(0, 9)                // 取前 9 个字符
            .padEnd(9, "0")                 // 不足 9 位补零
          
          return { ...part, toolCallId: normalizedId }
        }
        return part
      })
    }
    return msg
  })
}
```

### 缓存控制

Anthropic 支持 Prompt Caching（提示词缓存），可以大幅降低成本：

```typescript
function applyCaching(msgs: ModelMessage[], providerID: string): ModelMessage[] {
  // 缓存系统消息（前 2 条）和最近消息（后 2 条）
  const system = msgs.filter(msg => msg.role === "system").slice(0, 2)
  const final = msgs.filter(msg => msg.role !== "system").slice(-2)
  
  const providerOptions = {
    anthropic: {
      cacheControl: { type: "ephemeral" },
    },
    bedrock: {
      cachePoint: { type: "ephemeral" },
    },
  }
  
  for (const msg of unique([...system, ...final])) {
    msg.providerOptions = {
      ...msg.providerOptions,
      ...providerOptions,
    }
  }
  
  return msgs
}
```

## 推理模式（Reasoning）支持

### 不同提供商的推理参数

各家 LLM 的推理模式配置方式不同：

```typescript
// packages/opencode/src/provider/transform.ts
export function variants(model: Provider.Model): Record<string, Record<string, any>> {
  if (!model.capabilities.reasoning) return {}
  
  switch (model.api.npm) {
    case "@ai-sdk/openai":
      // OpenAI 使用 reasoningEffort
      return {
        low: { reasoningEffort: "low" },
        medium: { reasoningEffort: "medium" },
        high: { reasoningEffort: "high" },
      }
      
    case "@ai-sdk/anthropic":
      // Anthropic 使用 thinking.budgetTokens
      return {
        high: {
          thinking: {
            type: "enabled",
            budgetTokens: 16000,
          },
        },
        max: {
          thinking: {
            type: "enabled",
            budgetTokens: 31999,
          },
        },
      }
      
    case "@ai-sdk/google":
      // Google 使用 thinkingConfig
      return {
        high: {
          thinkingConfig: {
            includeThoughts: true,
            thinkingBudget: 16000,
          },
        },
      }
      
    case "@ai-sdk/amazon-bedrock":
      // Bedrock Claude 使用 reasoningConfig
      if (model.api.id.includes("anthropic")) {
        return {
          high: {
            reasoningConfig: {
              type: "enabled",
              budgetTokens: 16000,
            },
          },
        }
      }
      // Bedrock Nova 使用 maxReasoningEffort
      return {
        high: {
          reasoningConfig: {
            type: "enabled",
            maxReasoningEffort: "high",
          },
        },
      }
  }
  
  return {}
}
```

### 交错思维（Interleaved Thinking）

一些模型支持在输出中交错显示思维过程：

```typescript
if (
  model.capabilities.interleaved &&
  typeof model.capabilities.interleaved === "object" &&
  model.capabilities.interleaved.field === "reasoning_content"
) {
  return msgs.map(msg => {
    if (msg.role === "assistant" && Array.isArray(msg.content)) {
      // 提取所有 reasoning 部分
      const reasoningParts = msg.content.filter(part => part.type === "reasoning")
      const reasoningText = reasoningParts.map(part => part.text).join("")
      
      // 从内容中过滤掉 reasoning 部分
      const filteredContent = msg.content.filter(part => part.type !== "reasoning")
      
      // 将 reasoning 放到 providerOptions 中
      if (reasoningText) {
        return {
          ...msg,
          content: filteredContent,
          providerOptions: {
            openaiCompatible: {
              reasoning_content: reasoningText,
            },
          },
        }
      }
      
      return { ...msg, content: filteredContent }
    }
    return msg
  })
}
```

## 配置自定义 Provider

### opencode.json 配置

用户可以在配置文件中自定义 Provider：

```json
{
  "provider": {
    "my-provider": {
      "name": "My Custom Provider",
      "api": "https://api.my-provider.com/v1",
      "npm": "@ai-sdk/openai-compatible",
      "env": ["MY_PROVIDER_API_KEY"],
      "models": {
        "my-model": {
          "name": "My Model",
          "limit": {
            "context": 128000,
            "output": 16384
          },
          "cost": {
            "input": 1.0,
            "output": 2.0
          }
        }
      }
    }
  }
}
```

### 本地 Provider SDK

你甚至可以使用本地文件作为 Provider：

```json
{
  "provider": {
    "local-provider": {
      "npm": "file:///path/to/my-provider",
      "api": "http://localhost:8000/v1",
      "models": {
        "local-model": {
          "name": "Local Model"
        }
      }
    }
  }
}
```

### 模型白名单/黑名单

控制哪些模型可用：

```json
{
  "provider": {
    "openai": {
      "whitelist": ["gpt-4o", "gpt-4o-mini"],
      "blacklist": ["gpt-3.5-turbo"]
    }
  }
}
```

### 禁用/启用 Provider

```json
{
  "disabled_providers": ["groq", "mistral"],
  "enabled_providers": ["openai", "anthropic"]
}
```

## 小模型选择策略

OpenCode 有一个智能的"小模型"选择逻辑，用于辅助任务：

```typescript
export async function getSmallModel(providerID: string) {
  // 优先使用配置文件指定的小模型
  const cfg = await Config.get()
  if (cfg.small_model) {
    return getModel(parseModel(cfg.small_model))
  }
  
  // 根据当前 Provider 选择合适的小模型
  const provider = await state().then(s => s.providers[providerID])
  if (provider) {
    let priority = [
      "claude-haiku-4-5",
      "3-5-haiku",
      "gemini-3-flash",
      "gemini-2.5-flash",
      "gpt-5-nano",
    ]
    
    // GitHub Copilot 优先使用免费模型
    if (providerID.startsWith("github-copilot")) {
      priority = ["gpt-5-mini", "claude-haiku-4.5", ...priority]
    }
    
    for (const item of priority) {
      for (const model of Object.keys(provider.models)) {
        if (model.includes(item)) return getModel(providerID, model)
      }
    }
  }
  
  // 最后回退到 opencode 提供的免费模型
  const opencodeProvider = await state().then(s => s.providers["opencode"])
  if (opencodeProvider?.models["gpt-5-nano"]) {
    return getModel("opencode", "gpt-5-nano")
  }
  
  return undefined
}
```

## 总结

OpenCode 的 Provider 抽象层是一个精心设计的系统：

| 组件 | 职责 |
|------|------|
| **Vercel AI SDK** | 统一的 LLM 调用接口 |
| **models.dev** | 模型信息数据库 |
| **BUNDLED_PROVIDERS** | 内置 SDK 映射 |
| **CUSTOM_LOADERS** | 提供商特定的初始化逻辑 |
| **ProviderTransform** | 消息格式转换和适配 |

关键设计原则：

1. **抽象统一**：对外暴露一致的接口，隐藏各家差异
2. **动态加载**：按需加载 SDK，减少启动时间
3. **配置优先**：支持灵活的配置和覆盖
4. **兼容适配**：自动处理各家 API 的特殊要求
5. **持续更新**：通过 models.dev 自动获取新模型

通过 Provider 抽象层，OpenCode 实现了真正的"一次编写，多处运行"——用户可以自由选择任何 LLM 提供商，而无需关心底层的 API 差异。

---

> **系列总结**：通过这 6 篇文章，我们深入探索了 AI 开发工具的进化史，以及 OpenCode 的核心技术实现。从架构设计到会话循环，从工具系统到 MCP 协议，再到 Provider 抽象层——希望这些内容能帮助你更好地理解 AI Agent 的工作原理，甚至启发你构建自己的 AI 工具。
