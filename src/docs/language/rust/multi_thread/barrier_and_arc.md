---
title: 其他同步机制
icon: /assets/icons/article.svg
order: 7
category:
  - Rust
date: 2025-09-16
---

## 其他同步机制

Rust 标准库提供了丰富的同步原语，但有时需要更高级或特定功能的工具。本节介绍一些其他常用同步机制，包括 Barrier（屏障）、Arc（原子引用计数）用于多线程共享所有权，以及自旋锁、信号量等（通常通过第三方库实现）。

### Barrier（屏障）

#### 基本原理

Barrier 是一种同步点，允许多个线程等待彼此到达同一阶段后才继续执行。Rust 标准库提供了 `std::sync::Barrier`，它指定一个线程数量阈值，当所有线程调用 `wait()` 时，才会集体释放。

Barrier 适用于并行计算中的阶段同步，如多线程算法的分步执行。

#### 使用方法与典型代码示例

```rust
use std::sync::{Arc, Barrier};
use std::thread;

fn main() {
    let barrier = Arc::new(Barrier::new(3));  // 等待3个线程
    let mut handles = vec![];

    for i in 0..3 {
        let barrier = Arc::clone(&barrier);
        let handle = thread::spawn(move || {
            println!("线程 {} 到达屏障前", i);
            barrier.wait();  // 等待所有线程到达
            println!("线程 {} 通过屏障", i);
        });
        handles.push(handle);
    }

    for handle in handles {
        handle.join().unwrap();
    }
}
```

**说明：**

- `Barrier::new(n)`：指定等待 n 个线程。
- `wait()`：阻塞直到所有线程到达，返回 `BarrierWaitResult`（可检查是否是最后一个线程）。
- 适合固定线程数的同步。

#### 注意事项

- Barrier 可以重用，但不适合动态线程数变化的场景。
- 如果线程数量不足，会永久阻塞。

### Arc（原子引用计数）与多线程共享所有权

#### 基本原理

`std::sync::Arc<T>`（Atomic Reference Counting）是一个线程安全的引用计数智能指针，允许在多线程间安全共享不可变数据的所有权。它使用原子操作管理引用计数，当计数为零时释放资源。

Arc 常与其他同步工具（如 `Mutex`）结合，实现多线程共享可变数据，避免手动内存管理。

#### 使用方法与典型代码示例

```rust
use std::sync::Arc;
use std::thread;

fn main() {
    let data = Arc::new(5);  // 创建共享数据
    let mut handles = vec![];

    for _ in 0..3 {
        let data = Arc::clone(&data);
        let handle = thread::spawn(move || {
            println!("线程访问共享数据: {}", *data);
        });
        handles.push(handle);
    }

    for handle in handles {
        handle.join().unwrap();
    }
}
```

**说明：**

- `Arc::clone()`：原子地增加引用计数。
- 与 Mutex 结合：`Arc<Mutex<T>>` 用于共享可变数据。
- 相比 `Rc`（单线程），`Arc` 使用原子操作确保线程安全。

#### 注意事项

- Arc 只提供共享所有权，不提供互斥；需结合 Mutex 或 RwLock 处理可变性。
- 引用计数可能导致循环引用问题，使用 Weak 指针解决。

### 自旋锁、信号量等第三方库

#### 基本原理

- **自旋锁**：一种忙等待锁，如果锁不可用，线程会循环检查而不是阻塞。适用于短时锁争用场景。
- **信号量**（Semaphore）：控制并发访问资源的数量，支持 acquire/release 操作。适用于限流或资源池。

Rust 标准库不直接提供这些，但可以通过第三方 crate 如 `parking_lot`（高性能锁）、`crossbeam`（信号量和通道）或 `std::sync` 的扩展实现。

#### 使用方法与典型代码示例

**自旋锁示例（使用 spin crate）**：
首先在 `Cargo.toml` 添加 `spin = "0.9"`。

```rust
use spin::Mutex;
use std::sync::Arc;
use std::thread;

fn main() {
    let data = Arc::new(Mutex::new(0));
    let mut handles = vec![];

    for _ in 0..3 {
        let data = Arc::clone(&data);
        let handle = thread::spawn(move || {
            let mut guard = data.lock();
            *guard += 1;
        });
        handles.push(handle);
    }

    for handle in handles {
        handle.join().unwrap();
    }
}
```

**信号量示例（使用 crossbeam crate）**：
首先在 `Cargo.toml` 添加 `crossbeam = "0.8"`。

```rust
use crossbeam::sync::Parker;
use std::thread;

// 简单信号量模拟（crossbeam 提供更高级工具）
fn main() {
    let parker = Parker::new();
    let unparker = parker.unparker().clone();

    thread::spawn(move || {
        // 模拟工作
        thread::sleep(std::time::Duration::from_secs(1));
        unparker.unpark();  // 释放信号
    });

    parker.park();  // 等待信号
    println!("信号收到，继续执行！");
}
```

**说明：**

- 自旋锁适合低争用场景，避免上下文切换。
- 信号量常用于线程池或资源限制。

#### 注意事项

- 自旋锁可能浪费 CPU，适合短操作；否则使用阻塞锁。
- 引入第三方库需评估性能和兼容性。
- 推荐 crate：`parking_lot`（更快 `Mutex/RwLock`）、`crossbeam`（高级同步）。

### 小结

这些其他同步机制扩展了 Rust 的并发能力：Barrier 用于阶段同步，Arc 实现安全共享，自旋锁和信号量提供细粒度控制。通过标准库和第三方工具，开发者可以构建更灵活的并发系统。选择时需根据场景权衡性能和复杂度。
