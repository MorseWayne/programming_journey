---
title: 读写锁
icon: /assets/icons/article.svg
order: 3
category:
  - Rust
date: 2025-09-16
---

## 读写锁（RwLock）

### 基本原理

读写锁（RwLock, Read-Write Lock）是一种允许多个线程同时读取数据，但在写入时只允许一个线程访问的同步原语。这样可以提升并发性能，特别是在读多写少的场景下。Rust 标准库提供了 `std::sync::RwLock<T>`，它通过区分“读锁”和“写锁”，实现了高效的数据共享与保护。

### 读写锁的适用场景

- 适用于读操作远多于写操作的场景；
- 多线程需要频繁读取共享数据，但偶尔需要修改时，使用 `RwLock` 可以显著提升性能；
- 典型应用如缓存、配置数据等；

### 代码示例

```rust
use std::sync::{Arc, RwLock};
use std::thread;

fn main() {
    let data = Arc::new(RwLock::new(0));
    let mut handles = vec![];

    // 多个线程同时读取
    for _ in 0..5 {
        let data = Arc::clone(&data);
        let handle = thread::spawn(move || {
            let num = data.read().unwrap();
            println!("读取到的值: {}", *num);
        });
        handles.push(handle);
    }

    // 一个线程写入
    {
        let data = Arc::clone(&data);
        let handle = thread::spawn(move || {
            let mut num = data.write().unwrap();
            *num += 10;
            println!("写入后的值: {}", *num);
        });
        handles.push(handle);
    }

    for handle in handles {
        handle.join().unwrap();
    }
}
```

**说明：**

- `read()` 获取读锁，允许多个线程同时持有。
- `write()` 获取写锁，期间其他线程无法获取读锁或写锁。
- 读写锁同样需要与 `Arc` 结合，实现多线程共享所有权。

### 性能与局限性

- **优势**：在读多写少的场景下，`RwLock` 能显著提升并发性能。
- **局限**：写锁会阻塞所有读操作，写操作频繁时性能提升有限。
- **注意**：如果读锁和写锁获取顺序不当，仍可能导致死锁。

### 小结

`RwLock` 是一种高效的同步工具，适合需要频繁读取、偶尔写入的多线程场景。合理使用 `RwLock` 能在保证数据安全的同时，提升程序的并发性能。

