---
title: 条件变量
icon: /assets/icons/article.svg
order: 5
category:
  - Rust
date: 2025-09-16
---

## 条件变量（`Condvar`）

### 作用与原理

条件变量（`Condvar`, Condition Variable）是一种线程同步机制，用于让线程在等待特定条件满足时阻塞自己，直到被其他线程通知醒来。`Rust` 标准库提供了 `std::sync::Condvar`，它通常与 `Mutex` 结合使用：线程在持有互斥锁时检查条件，如果不满足则通过 `Condvar` 等待，同时释放锁以允许其他线程修改状态。

`Condvar` 的核心是“等待-通知”模型，避免了线程忙等待（轮询），从而节省 `CPU` 资源。通知可以是针对单个线程（`notify_one`）或所有等待线程（`notify_all`）。

### 典型使用场景

- 生产者-消费者模型中，消费者等待队列非空。
- 线程等待特定事件或状态变化（如资源可用）。
- 实现自定义同步结构，如信号量或屏障。

### 代码示例

以下是一个简单的生产者-消费者示例，使用 `Condvar` 结合 `Mutex` 实现队列非空等待：

```rust
use std::sync::{Arc, Condvar, Mutex};
use std::thread;

fn main() {
    let pair = Arc::new((Mutex::new(false), Condvar::new()));  // (状态锁, 条件变量)
    let pair_clone = Arc::clone(&pair);

    // 消费者线程
    thread::spawn(move || {
        let (lock, cvar) = &*pair_clone;
        let mut started = lock.lock().unwrap();

        while !*started {
            started = cvar.wait(started).unwrap();  // 等待通知，同时释放锁
        }

        println!("消费者收到通知，状态已改变！");
    });

    // 生产者线程（主线程）
    let (lock, cvar) = &*pair;
    let mut started = lock.lock().unwrap();
    *started = true;  // 修改状态
    cvar.notify_one();  // 通知一个等待线程

    thread::sleep(std::time::Duration::from_secs(1));  // 等待消费者执行
}
```

**说明：**

- `wait()`：阻塞当前线程，释放关联的 Mutex，直到被通知。返回时重新获取锁。
- `notify_one()`：唤醒一个等待的线程。
- `notify_all()`：唤醒所有等待的线程。
- `Condvar` 必须与 `Mutex` 配对使用，以确保条件检查的原子性。

另一个示例：使用 `notify_all()` 通知多个消费者。

```rust
// ... 类似以上设置
cvar.notify_all();  // 通知所有等待线程
```

### 注意事项

- **虚假唤醒**：`wait()` 可能因系统原因被虚假唤醒，因此需要在循环中检查条件（while 循环）。
- **与 Mutex 的结合**：`Condvar` 不管理锁，必须手动处理 Mutex 的获取和释放。
- **性能**：`Condvar` 适合低频通知场景；高频时可能不如通道高效。
- **错误处理**：如果 `Mutex` 被毒化（`poisoned`），`wait()` 会返回错误。

### 小结

条件变量是 `Rust` 中实现线程等待和通知的强大工具，与 `Mutex` 结合能高效处理条件依赖的同步场景。它避免了忙等待，提高了程序的效率，适用于各种事件驱动的并发模型。
