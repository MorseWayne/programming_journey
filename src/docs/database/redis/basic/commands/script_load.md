---
title: 脚本加载
icon: /assets/icons/article.svg
order: 1
category:
  - Redis
  - Database
date: 2025-08-08
---

## 1. **概述**

`SCRIPT LOAD` 是 Redis 提供的一种命令，用于将 Lua 脚本加载到 Redis 中并返回其 SHA1 哈希值。通过 `EVALSHA` 命令，可以使用该哈希值执行脚本，避免重复传输脚本内容，从而提高性能。

***

## 2. **核心功能**

* **加载脚本**：将 Lua 脚本加载到 Redis 中，返回 SHA1 哈希值。
* **执行脚本**：通过 `EVALSHA` 使用 SHA1 哈希值执行脚本。
* **缓存脚本**：加载的脚本会被 Redis 缓存，避免重复加载。

***

## 3. **使用场景**

* **限流器**：实现基于时间窗口的限流逻辑。
* **原子操作**：将多个 Redis 命令封装为一个原子操作。
* **复杂逻辑**：执行需要多次 Redis 交互的复杂逻辑。

***

## 4. **基本用法**

### 4.1 加载脚本

```bash
SCRIPT LOAD "local key = KEYS[1]; local limit = tonumber(ARGV[1]); local expire_time = tonumber(ARGV[2]); local current = redis.call('incr', key); if current == 1 then redis.call('expire', key, expire_time); end; if current > limit then return 'ERROR: too many requests'; else return 'ALLOW: request accepted'; end"
```

返回：

```bash
"d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e"
```

### 4.2 执行脚本

```bash
EVALSHA d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e 1 rate_limit:user_123 10 1
```

返回：

```bash
"ALLOW: request accepted"
```

***

## 5. **优雅实践**

### 5.1 预加载脚本

在应用启动时，使用 `SCRIPT LOAD` 预加载常用脚本，并存储 SHA1 哈希值。

### 5.2 缓存 SHA1 哈希值

将 SHA1 哈希值存储在应用的配置或缓存中，避免每次执行时重新加载脚本。

### 5.3 错误处理

在执行 `EVALSHA` 时，如果脚本未加载（返回 `NOSCRIPT` 错误），则重新加载脚本并执行。

### 5.4 参数化脚本

通过 `KEYS` 和 `ARGV` 传递参数，使脚本更具通用性。

***

## 6. **从文件加载脚本**

Redis 本身不支持直接从文件加载脚本，但可以通过以下方式实现：

### 6.1 使用 `redis-cli`

```bash
cat script.lua | redis-cli -x SCRIPT LOAD
```

### 6.2 使用编程语言

以 Python 为例：

```python
import redis
r = redis.Redis(host='localhost', port=6379, db=0)
with open('script.lua', 'r') as f:
    script_content = f.read()
sha1_hash = r.script_load(script_content)
```

### 6.3 使用 Shell 脚本

```bash
#!/bin/bash
script_content=$(cat script.lua)
sha1_hash=$(redis-cli SCRIPT LOAD "$script_content")
```

***

## 7. **优势**

1. **减少网络开销**：使用 `EVALSHA` 避免了重复传输脚本内容。
2. **原子性保证**：Lua 脚本在 Redis 中是原子执行的。
3. **高效缓存**：通过 `SCRIPT LOAD` 预加载脚本，减少脚本加载时间。
4. **灵活性**：参数化脚本使其适用于不同的场景。

***

## 8. **总结**

`SCRIPT LOAD` 是 Redis 中管理 Lua 脚本的高效工具，尤其适合需要频繁执行的脚本。通过预加载、缓存和参数化，可以进一步提升其性能和灵活性。结合外部工具或编程语言，还可以实现从文件加载脚本的功能。
