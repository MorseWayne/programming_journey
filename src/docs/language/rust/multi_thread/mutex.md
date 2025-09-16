---
title: 互斥锁
icon: /assets/icons/article.svg
order: 2
category:
  - Rust
---

## 互斥锁（Mutex）

### 基本原理

互斥锁（`Mutex`, `Mutual Exclusion`）是一种最常见的线程同步原语，用于保护临界区资源，确保同一时刻只有一个线程能够访问被保护的数据。`Rust` 标准库提供了 `std::sync::Mutex<T>`，它通过内部加锁机制，防止多个线程同时修改同一份数据，从而避免数据竞争。

### 使用方法与典型代码示例

在 Rust 中，`Mutex` 通常与 `Arc`（原子引用计数智能指针）结合使用，实现多线程间安全共享和修改数据。常见用法如下：

```rust
use std::sync::{Arc, Mutex};
use std::thread;

fn main() {
    let counter = Arc::new(Mutex::new(0));
    let mut handles = vec![];

    for _ in 0..10 {
        let counter = Arc::clone(&counter);
        let handle = thread::spawn(move || { // move语义自动捕获闭包所需要的变量
            let mut num = counter.lock().unwrap();
            *num += 1;
        });
        handles.push(handle);
    }

    for handle in handles {
        handle.join().unwrap();
    }

    println!("result: {}", *counter.lock().unwrap());
}
```

**说明：**

- `Arc` 用于在多个线程间安全地共享所有权。
- `Mutex::lock()` 返回一个智能指针，自动实现解锁（`RAII`）。
- 如果加锁失败（如发生死锁），`lock()` 会返回错误。

### 死锁与避免策略

死锁是指两个或多个线程因互相等待对方释放锁而导致程序永久阻塞。常见死锁场景包括：

- 多个锁嵌套时获取顺序不一致
- 一个线程在持有锁的情况下再次尝试获取同一把锁

**避免死锁的建议：**

- 保持加锁顺序一致
- 尽量缩小锁的作用域
- 避免在持有锁时执行可能阻塞的操作
- 使用 `try_lock` 等非阻塞方式获取锁

### `Mutex` 与 `RefCell` 的区别

- `Mutex` 用于多线程环境下的数据共享与同步，保证线程安全。
- `RefCell` 只适用于单线程环境，提供运行时的可变借用检查，不具备线程安全能力。

### 小结

`Mutex` 是 Rust 并发编程中最基础、最常用的同步工具，适合需要保护共享可变数据的场景。合理使用 `Mutex` 能有效避免数据竞争，但也要注意死锁等并发陷阱。
