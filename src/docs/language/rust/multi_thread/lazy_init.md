---
title: 通道(channel)
icon: /assets/icons/article.svg
order: 6
category:
  - Rust
---

## Once 与 Lazy 静态初始化

### 基本原理

在多线程环境中，确保某些初始化操作只执行一次或延迟执行是常见的同步需求。`Rust` 提供了 `std::sync::Once` 用于一次性初始化，以及懒初始化机制（如 `std::sync::LazyLock` 或第三方 `lazy_static`）用于静态变量的延迟计算。这些工具通过原子操作和锁机制，保证线程安全，避免多次初始化或数据竞争。

- `Once` 适合执行一次性代码块，如全局配置加载;
- 懒初始化适合静态变量，仅在首次访问时计算值，提高启动效率;

### std::sync::Once

`Once` 是一个同步原语，用于确保一段代码在多线程环境中只执行一次。即使多个线程同时调用，它也会原子地选择一个线程执行初始化，其他线程等待。

**典型用法与代码示例：**

```rust
use std::sync::Once;

static INIT: Once = Once::new();

fn main() {
    let mut handles = vec![];

    for _ in 0..5 {
        handles.push(std::thread::spawn(|| {
            INIT.call_once(|| {
                println!("初始化只执行一次！");
                // 这里执行昂贵的初始化操作
            });
        }));
    }

    for handle in handles {
        handle.join().unwrap();
    }
}
```

**说明：**
- `call_once()`：如果尚未初始化，执行闭包；否则直接返回。
- 适用于全局单次操作，如加载配置或注册钩子。

### `std::sync::LazyLock`（或 `lazy_static`）

Rust 标准库（1.80+）提供了 `std::sync::LazyLock<T>` 用于线程安全的懒初始化静态变量。它在首次解引用时计算值，并使用锁确保安全。对于更早版本或更灵活的使用，可以引入 `lazy_static` crate。

**典型用法与代码示例（使用 `std::sync::LazyLock`）：**

```rust
use std::sync::LazyLock;

static GLOBAL_DATA: LazyLock<String> = LazyLock::new(|| {
    println!("懒初始化执行！");
    "计算得到的值".to_string()
});

fn main() {
    println!("访问值: {}", *GLOBAL_DATA);  // 首次访问时初始化
    println!("再次访问: {}", *GLOBAL_DATA);  // 已初始化，直接返回
}
```

**使用 lazy_static crate 的示例（常见于旧项目）：**

首先在 `Cargo.toml` 添加依赖：`lazy_static = "1.4.0"`。

```rust
use lazy_static::lazy_static;

lazy_static! {
    static ref GLOBAL_VEC: Vec<i32> = {
        println!("懒初始化执行！");
        vec![1, 2, 3]
    };
}

fn main() {
    println!("访问值: {:?}", *GLOBAL_VEC);
}
```

**说明：**
- 初始化仅在首次访问时发生，线程安全。
- 适用于全局常量、配置或昂贵计算的单例。

### 单例模式实现

单例模式确保一个类只有一个实例，在 Rust 中可以使用 `Once` 或 `LazyLock` 实现线程安全的单例。

**代码示例：**

```rust
use std::sync::{Arc, Mutex, Once};

struct Singleton {
    value: i32,
}

static mut SINGLETON: Option<Arc<Mutex<Singleton>>> = None;
static INIT: Once = Once::new();

fn get_singleton() -> Arc<Mutex<Singleton>> {
    unsafe {
        INIT.call_once(|| {
            let instance = Singleton { value: 42 };
            SINGLETON = Some(Arc::new(Mutex::new(instance)));
        });
        SINGLETON.clone().unwrap()
    }
}

fn main() {
    let s1 = get_singleton();
    let s2 = get_singleton();
    assert!(Arc::ptr_eq(&s1, &s2));  // 同一个实例
}
```

**说明：**
- 使用 `Once` 确保初始化只发生一次，结合 `Arc<Mutex>` 实现共享和同步。
- 这是一种安全的单例实现，避免全局可变状态的风险。

### 注意事项

- `Once` 只适合不可逆的单次操作；如果需要重置，使用其他机制。
- 懒初始化可能引入首次访问的延迟，适合非实时场景。
- 在使用 `unsafe` 时需谨慎，确保线程安全。
- 对于复杂单例，考虑第三方 crate 如 `once_cell` 或 `lazy_static` 以简化代码。

### 小结

Once 和 Lazy 静态初始化是 Rust 中处理一次性或延迟初始化的高效工具，能在多线程环境中保证安全和性能。它们常用于单例模式和全局配置，帮助开发者构建可靠的并发系统。
