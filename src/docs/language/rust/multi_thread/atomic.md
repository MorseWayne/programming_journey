---
title: 原子类型
icon: /assets/icons/article.svg
order: 3
category:
  - Rust
---

### 原子操作的原理

原子类型是一类支持原子操作的基本数据类型，所谓“原子操作”是指不可被中断的操作，能够保证在多线程环境下对数据的读写不会发生数据竞争。Rust 标准库通过 `std::sync::atomic` 模块，提供了多种原子类型，如 `AtomicBool`、`AtomicIsize`、`AtomicUsize` 等。

原子类型底层依赖于 CPU 的原子指令，能够在无需加锁的情况下实现线程安全的数据共享和同步，适用于高性能、低延迟的并发场景。与传统的锁机制相比，原子操作避免了上下文切换和锁争用的开销，但仅限于简单数据类型。

### 常用原子类型

- `AtomicBool`：原子布尔值，常用于实现简单的标志位（如开关或信号）。
- `AtomicIsize` / `AtomicUsize`：原子整数，适合计数器、自增等场景。
- 其他类型如 `AtomicI32`、`AtomicU64` 等，满足不同位宽需求。

这些类型支持常见的原子操作，如 `load`（读取）、`store`（写入）、`fetch_add`（原子加法）、`fetch_sub`（原子减法）等。

### 典型用法与代码示例

原子类型通常与 `Arc` 结合使用，实现多线程共享。以下是一个简单的计数器示例：

```rust
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::thread;

fn main() {
    let counter = Arc::new(AtomicUsize::new(0));
    let mut handles = vec![];

    for _ in 0..10 {
        let counter = Arc::clone(&counter);
        let handle = thread::spawn(move || {
            for _ in 0..1000 {
                counter.fetch_add(1, Ordering::SeqCst);
            }
        });
        handles.push(handle);
    }

    for handle in handles {
        handle.join().unwrap();
    }

    println!("最终计数结果: {}", counter.load(Ordering::SeqCst));
}
```

**说明：**

- `fetch_add`、`fetch_sub` 等方法用于原子地自增/自减。
- `Ordering` 参数指定内存序，影响操作的可见性和重排序行为。
- 原子类型无需显式加锁，适合高并发场景下的简单数据同步。

### CAS 操作（Compare-And-Swap）

CAS（比较并交换）是一种常见的原子操作，允许线程在并发环境下安全地更新数据。其基本原理是：只有当内存中的值等于预期值时，才将其更新为新值，否则不做任何操作。CAS 是无锁并发编程的基础，广泛用于实现原子计数器、无锁队列等高性能数据结构。

在 `Rust` 中，原子类型提供了 `compare_exchange` 和 `compare_exchange_weak` 方法（旧的 `compare_and_swap` 已废弃）。示例：

```rust
use std::sync::atomic::{AtomicUsize, Ordering};

let atomic_val = AtomicUsize::new(5);
let result = atomic_val.compare_exchange(
    5,                // 期望值
    10,               // 新值
    Ordering::SeqCst, // 成功时的内存序
    Ordering::SeqCst, // 失败时的内存序
);
assert!(result.is_ok());
assert_eq!(atomic_val.load(Ordering::SeqCst), 10);
```

**说明：**

- `compare_exchange` 返回 `Result`，成功时返回旧值，失败时返回当前值。
- `compare_exchange_weak` 可能会伪失败（`spurious failure`），适合在循环中重试（如实现自旋锁）。
- `CAS` 操作常用于乐观并发控制，避免不必要的锁开销。

### 内存序（`Ordering`）详解

内存序（`Memory Ordering`）决定了原子操作在多线程环境下的可见性和执行顺序。Rust 提供了多种内存序选项，以平衡安全性和性能：

- `Relaxed`：最弱的内存序，只保证操作的原子性，不保证与其他操作的顺序。适合无依赖的计数等场景。
- `Acquire`：保证当前线程在获取该值后，之前的所有写操作对当前线程可见。常用于读取操作。
- `Release`：保证当前线程在写入该值前，之前的所有写操作对其他线程可见。常用于写入操作。
- `AcqRel`：同时具备 Acquire 和 Release 的语义，常用于读写操作。
- `SeqCst`（Sequentially Consistent）：最强的内存序，保证全局顺序一致性。推荐初学者优先使用，虽然性能略低，但最安全。

**示例：**

```rust
use std::sync::atomic::{AtomicBool, Ordering};

let flag = AtomicBool::new(false);

// 线程A
flag.store(true, Ordering::Release);

// 线程B
if flag.load(Ordering::Acquire) {
    // 能看到线程A在store之前的所有写操作
}
```

**选择建议：**

- 如果不确定，优先使用 `SeqCst` 以确保正确性;
- 追求极致性能时，可根据具体场景选择更弱的内存序，但需谨慎测试以避免可见性问题或数据竞争;

### 适用场景

- 计数器、自增 ID 等无需复杂同步的数据;
- 实现自旋锁、无锁队列等高性能并发结构的基础;
- 需要极致性能、避免锁带来的性能损耗时（如游戏引擎或实时系统）;

### 注意事项

- 原子类型只适合管理简单的数值或布尔状态，不适合复杂数据结构（如需要保护整个对象时，应考虑 Mutex）;
- 内存序选择不当可能导致难以发现的并发 bug，推荐初学者优先使用 `SeqCst`;
- 原子操作虽然避免了锁，但并不意味着完全没有性能开销（如缓存一致性维护），且代码可读性和维护性会降低;
- 在使用 `CAS` 时，需处理 `ABA` 问题（通过版本号或引用计数解决）;

### 小结

原子类型为 Rust 提供了无锁并发的能力，是实现高性能并发程序的重要工具。通过原子操作和 CAS，开发者可以构建高效的无锁结构，而内存序的灵活选择进一步优化了性能与安全的平衡。合理使用原子类型可以极大提升程序的吞吐量，但也需要开发者具备一定的并发编程基础。
