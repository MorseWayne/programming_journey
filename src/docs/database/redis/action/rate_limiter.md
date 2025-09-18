---
title: 限流器实现
icon: /assets/icons/article.svg
order: 1
category:
  - Redis
  - Database
date: 2025-08-08
---

## Redis 限流器实现优化

### 背景

在高并发场景下，Redis 常被用于实现限流器。本文将介绍三种模式的实现，并分析它们的优缺点，最终提供基于 Redis 6.2 新特性的优化方案。

***

### 模式一：简单计数法

#### 实现原理

1. 使用 `INCR` 对键进行递增操作。
2. 如果键的值超过限流阈值（如 10），则拒绝请求。
3. 使用 `EXPIRE` 设置键的过期时间。

#### 代码示例

```lua
local current
current = redis.call("incr", KEYS[1])
if tonumber(current) > 10 then
    return "ERROR: too many requests per second"
else
    redis.call("expire", KEYS[1], 1)
    return "ALLOW: request accepted"
end
```

#### 优点

* 实现简单，易于理解。

#### 缺点

* **键位泄露风险**：如果 `INCR` 和 `EXPIRE` 之间发生异常（如 Redis 崩溃），键可能永久存在。
* **高并发问题**：多个客户端可能同时设置过期时间，导致不必要的性能开销。

***

### 模式二：首次递增设置过期时间

#### 实现原理

1. 使用 `INCR` 对键进行递增操作。
2. 如果键的值是 1（即第一次递增），则设置过期时间（`EXPIRE`）。

#### 代码示例

```lua
local current
current = redis.call("incr", KEYS[1])
if tonumber(current) > 10 then
    return "ERROR: too many requests per second"
else
    if tonumber(current) == 1 then
        redis.call("expire", KEYS[1], 1)
    end
    return "ALLOW: request accepted"
end
```

#### 优点

* 减少重复设置过期时间的开销。

#### 缺点

* **高并发问题**：多个客户端可能同时判断 `value == 1`，导致过期时间被重复设置。
* **键位泄露风险**：如果 `INCR` 和 `EXPIRE` 之间发生异常，键可能永久存在。

***

### 模式三：基于 Lua 脚本的原子操作

#### 实现原理

1. 使用 Lua 脚本将 `INCR` 和 `EXPIRE` 操作封装为一个原子操作。
2. 通过 Lua 脚本确保限流逻辑的原子性。

#### 代码示例

```lua
local current
current = redis.call("incr", KEYS[1])
if tonumber(current) > 10 then
    return "ERROR: too many requests per second"
else
    redis.call("expire", KEYS[1], 1)
    return "ALLOW: request accepted"
end
```

#### 优点

* **原子性保证**：避免高并发下的竞争条件。
* **减少键位泄露风险**：通过原子操作确保过期时间被正确设置。

#### 缺点

* **实现复杂**：需要熟悉 Lua 脚本。
* **性能开销**：Lua 脚本的执行可能增加 Redis 的负载。

***

### 优化方案：结合 Redis 6.2 的 `EXPIRE NX` 特性

#### 实现原理

1. 使用 `INCR` 递增键的值。
2. 使用 `EXPIRE NX` 设置过期时间，确保仅在键未设置过期时间时设置。

#### 代码示例

```lua
local current
current = redis.call("incr", KEYS[1])
if tonumber(current) > 10 then
    return "ERROR: too many requests per second"
else
    redis.call("expire", KEYS[1], 1, "NX")
    return "ALLOW: request accepted"
end
```

#### 优点

1. **避免键位泄露**：`EXPIRE NX` 确保键的过期时间只会被设置一次。
2. **简化实现**：无需额外处理竞争条件，代码更加简洁。
3. **原子性保证**：结合 Lua 脚本，可以确保操作的原子性。

***

### 总结

| 模式   | 优点             | 缺点                 | 适用场景             |
| ---- | -------------- | ------------------ | ---------------- |
| 模式一  | 实现简单           | 键位泄露风险，高并发问题       | 低并发场景            |
| 模式二  | 减少过期时间设置开销     | 高并发问题，键位泄露风险       | 中低并发场景           |
| 模式三  | 原子性保证，减少键位泄露风险 | 实现复杂，性能开销          | 高并发场景            |
| 优化方案 | 避免键位泄露，简化实现    | 需要 Redis 6.2 及以上版本 | 高并发场景，Redis 6.2+ |

通过结合 Redis 6.2 的 `EXPIRE NX` 特性，我们可以更安全地实现限流器，避免键位泄露的问题。这种方法简单高效，适合在高并发场景下使用。如果你的 Redis 版本支持这一特性，强烈推荐采用这种实现方式。
