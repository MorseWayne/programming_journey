---
title: 实践案例
icon: /assets/icons/article.svg
order: 8
category:
  - Rust
---

---

## 实践案例

本节通过几个典型案例，展示 Rust 线程间数据同步机制的实际应用。每个案例都附带完整代码和分析，旨在帮助读者从实践中理解同步工具的选择和使用。

### 多线程计数器

#### 场景描述

在多线程环境中，实现一个共享计数器，每个线程独立递增计数器，最终汇总结果。需要避免数据竞争，确保计数准确。

#### 同步机制选择

- 使用 `AtomicUsize`：无锁、高性能，适合简单数值操作。
- 备选：`Mutex<usize>`，如果需要更复杂的状态管理。

#### 代码示例

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

    println!("最终计数: {}", counter.load(Ordering::SeqCst));  // 输出: 10000
}
```

#### 分析说明

- `fetch_add` 原子操作确保每个递增都是线程安全的，无需锁。
- 使用 `SeqCst` 内存序保证一致性。
- 优势：高并发性能好；局限：仅限简单数据。如果计数器需伴随复杂逻辑，可切换到 Mutex。

### 生产者-消费者模型

#### 场景描述

多个生产者线程生成数据，放入队列；一个消费者线程从队列中取出数据处理。需要同步队列访问，避免空队列阻塞或数据丢失。

#### 同步机制选择

- 使用 `mpsc::channel`：消息传递模型，简单高效。
- 备选：`Mutex<VecDeque<T>> + Condvar`，如果需要自定义队列。

#### 代码示例

```rust
use std::sync::mpsc;
use std::thread;
use std::time::Duration;

fn main() {
    let (tx, rx) = mpsc::channel::<i32>();

    // 生产者线程
    for i in 0..3 {
        let tx = tx.clone();
        thread::spawn(move || {
            for j in 0..5 {
                tx.send(i * 10 + j).unwrap();
                thread::sleep(Duration::from_millis(100));
            }
        });
    }

    // 消费者线程（主线程）
    let mut count = 0;
    while count < 15 {
        match rx.recv() {
            Ok(val) => {
                println!("接收到: {}", val);
                count += 1;
            }
            Err(_) => break,  // 所有发送者关闭
        }
    }
}
```

#### 分析说明

- 通道自动处理同步和所有权转移，避免共享内存问题。
- `recv()` 阻塞等待数据，实现高效等待。
- 优势：代码简洁、安全；局限：标准 mpsc 只支持单消费者，多消费者需第三方库如 crossbeam。

### 并发任务调度

#### 场景描述

实现一个简单的线程池，调度多个任务并发执行。任务从队列中取出，线程间需同步访问任务队列。

#### 同步机制选择

- 使用 `Arc<Mutex<VecDeque<Task>>> + Condvar`：保护队列，通知空闲线程。
- 备选：通道作为任务队列。

#### 代码示例

```rust
use std::sync::{Arc, Condvar, Mutex};
use std::thread;
use std::collections::VecDeque;

type Task = Box<dyn FnOnce() + Send + 'static>;

struct ThreadPool {
    workers: Vec<thread::JoinHandle<()>>,
    sender: std::sync::mpsc::Sender<Task>,
}

impl ThreadPool {
    fn new(size: usize) -> ThreadPool {
        let (sender, receiver) = std::sync::mpsc::channel();
        let receiver = Arc::new(Mutex::new(receiver));
        let mut workers = Vec::with_capacity(size);

        for id in 0..size {
            let receiver = Arc::clone(&receiver);
            let worker = thread::spawn(move || loop {
                let task = receiver.lock().unwrap().recv().unwrap();
                println!("线程 {} 执行任务", id);
                task();
            });
            workers.push(worker);
        }

        ThreadPool { workers, sender }
    }

    fn execute<F>(&self, f: F)
    where
        F: FnOnce() + Send + 'static,
    {
        let task = Box::new(f);
        self.sender.send(task).unwrap();
    }
}

fn main() {
    let pool = ThreadPool::new(4);

    for i in 0..8 {
        pool.execute(move || {
            println!("任务 {} 执行完成", i);
        });
    }

    // 等待一段时间以完成任务（实际中需实现 shutdown）
    thread::sleep(std::time::Duration::from_secs(2));
}
```

#### 分析说明

- 使用通道作为任务分发器，结合 Mutex 保护接收端。
- 线程池中每个 worker 循环从通道接收任务。
- 优势：可扩展为完整线程池；局限：示例简化了 shutdown 逻辑，实际需添加终止机制（如 poison pill）。
- 扩展：可集成 Condvar 处理空队列等待。

### 小结

这些实践案例展示了如何将 Mutex、Atomic、Channel 等机制应用到真实场景中。通过计数器、生产者-消费者和任务调度，读者可以练习并发编程的实际设计。建议根据具体需求调整同步工具，并使用 cargo test 验证线程安全。
