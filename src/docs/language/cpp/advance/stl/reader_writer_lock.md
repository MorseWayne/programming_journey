---
title: 读写锁
icon: /assets/icons/article.svg
order: 2
category:
  - C++
date: 2025-08-08
---

# Reader-Writer Lock

## 1 简介

读写锁是一种特殊的同步原语，它允许多个线程同时读取共享资源，但是写操作必须独占访问。这种模式下，最大化降低了锁对读操作的影响，适用于多读少写的场景。

### 1.1 读写锁的基本原则

| 模式          | 描述           | 是否阻塞其他线程      |
| ----------- | ------------ | ------------- |
| **读锁（共享锁）** | 允许多个线程同时读取数据 | 不阻塞其他读锁，但阻塞写锁 |
| **写锁（排他锁）** | 只允许一个线程写入数据  | 阻塞所有读锁和写锁     |
| **无锁**      | 没有任何线程持有锁    | 不阻塞任何操作       |

### 1.2 C++中的读写锁

c++17版本引入读写锁(`std::shared_mutex`)到STL，简要代码使用示例如下：

```c++
#include <shared_mutex>
std::shared_mutex rw_mutex;

// 读操作（共享锁）
{
    std::shared_lock<std::shared_mutex> lock(rw_mutex);
    // 读取数据...
}

// 写操作（排他锁）
{
    std::unique_lock<std::shared_mutex> lock(rw_mutex);
    // 修改数据...
}
```

### 1.3 潜在问题

1.  **写者饥饿**

    （如果读操作持续不断，写者可能长时间无法获取锁）

    * **解决方案**：使用 **写者优先** 策略，或限制最大读者数量。
2.  **性能下降**

    （如果写竞争激烈，读写锁可能比互斥锁更慢）

    * **解决方案**：改用 **无锁数据结构** 或 **分段锁**。

### 1.4 使用场景

读写锁特别适合于以下场景：

1. **读多写少**的数据结构（如缓存、配置信息）
2. **查询频繁但更新较少**的数据库操作
3. **需要提高读取性能**但仍需保证数据一致性的系统

### 1.5 性能考虑

* 在**读操作远多于写操作**的场景下，读写锁可以显著提高系统吞吐量
* 在**写操作频繁**的场景下，读写锁可能比普通互斥锁性能更差，因为它的实现通常更复杂
* 在多核系统上，读写锁的实现通常需要考虑缓存一致性问题

## 2 自定义实现读写锁

**基本依赖**：**一个互斥锁（Mutex）** 和 **两个条件变量（Condition Variables）**

### 2.1 内部状态变量设计

| 名称               | 类型                        | 用途                                                                           |
| ---------------- | ------------------------- | ---------------------------------------------------------------------------- |
| `reader_count`   | `int`                     | 记录当前正在读取的线程数                                                                 |
| `writer_active`  | `bool`                    | 记录当前是否在执行写操作                                                                 |
| `mutex`          | `std::mutex`              | 互斥锁，用于保护上面这些状态变量的访问。任何对 `reader_count` 和 `writer_active` 的修改都必须先获得这个 `mutex` |
| `read_cv`        | `std::condition_variable` | 用于在“**有写入者**”或“**有等待的写入者**”时，让试图读取的线程等待                                      |
| `write_cv`       | `std::condition_variable` | 用于在“**有读取者**”或“**有写入者**”时，让试图写入的线程等待                                         |
| `writer_waiting` | `int`                     | 记录等待写的线程数量，防止因为读者过多导致写者“饿死”                                                  |

### 2.2 可能的伪代码实现

```c++
#include <atomic>
#include <condition_variable>
#include <mutex>

class RWLock {
public:
    RWLock() : reader_count(0), writer_active(false), writer_waiting(0) {}

    // 读锁（共享锁）
    void lock_shared() {
        // c++条件变量仅能接受排它锁(unique_lock)
        // 这里不能使用lock_guard, 因为它不能手动加解锁
        std::unique_lock<std::mutex> lock(mutex_);
        
        // 写者优先：如果有写者持锁或者有写者等待，读者等待
        read_cv.wait(lock, [this]() {
            return !writer_active && writer_waiting == 0;
        });
        ++reader_count;
    }

    // 释放读锁
    void unlock_shared() {
        std::unique_lock<std::mutex> lock(mutex_);
        --reader_count;
        if (reader_count == 0 && writer_waiting > 0) {
            // 最后一个读者释放锁时通知等待的写者
            write_cv.notify_one();
        }
    }

    // 写锁（独占锁）
    void write_lock() {
        std::unique_lock<std::mutex> lock(mutex_);
        ++writer_waiting;
        // 等待没有活跃读者且没有写者
        write_cv.wait(lock, [this]() {
            return !writer_active && reader_count == 0;
        });
        --writer_waiting;
        writer_active = true;
    }

    // 写解锁
    void write_unlock() {
        std::unique_lock<std::mutex> lock(mutex_);
        writer_active = false;
        if (writer_waiting > 0) {
            // 优先唤醒写者
            write_cv.notify_one();
        } else {
            // 没有写者等待，唤醒所有读者
            read_cv.notify_all();
        }
    }

private:
    std::mutex mutex_;
    std::condition_variable read_cv;
    std::condition_variable write_cv;

    int reader_count;      // 当前读者数量
    int writer_waiting;    // 等待写者数量
    bool writer_active;    // 写者是否活跃
};

```

## 3 STL库的实现

真实的 `std::shared_mutex` 通常是一个**薄薄的C++封装层**，它直接调用了操作系统提供的原生读写锁API。在Linux环境下，`std::shared_mutex` 几乎总是基于 **`pthreads`** 库中的 `pthread_rwlock_t` 实现的，

```c++
// 这是libstdc++中<shared_mutex>的简化示意
namespace std {
  class shared_mutex {
    pthread_rwlock_t _M_rwlock; // 核心：一个pthread读写锁

  public:
    shared_mutex();
    ~shared_mutex();

    void lock() { // 写锁定
        pthread_rwlock_wrlock(&_M_rwlock)
        ... // 其他逻辑
    }      
    void unlock() { // 写解锁
        pthread_rwlock_unlock(&_M_rwlock);
        ... // 其他逻辑
    }     
    void lock_shared() { // 读锁定
        pthread_rwlock_rdlock(&_M_rwlock);
        ... // 其他逻辑
    }

    void unlock_shared() { // 读解锁
        pthread_rwlock_unlock(&_M_rwlock);
        ... // 其他逻辑
    }
    // ... try_lock等
  };
}
```

### 3.1 `pthread_rwlock_t` 的底层又是什么

在现代Linux的`glibc`中，`pthread_rwlock_t` 的实现本身就极其精妙， 它结合了**原子操作**和`futex` (Fast Userspace Mutex)

1. **状态字 (State Word)**: 它内部使用一个整数（通常是 `unsigned int`）作为状态字，通过位操作（bit manipulation）来存储所有信息：
   * 一个位表示是否有写入者。
   * 一个位表示是否有写入者正在等待。
   * 其余的位用作一个计数器，表示当前有多少读者。
2. **快速路径 (Fast Path)**:
   * 当一个线程尝试获取锁（读或写）时，它首先会使用一个**原子指令**（如 `cmpxchg`，Compare-and-Swap）去尝试修改这个状态字。
   * 如果此时锁是可用的（例如，一个读者到来时没有写入者），原子操作会成功，线程**立即获得锁并返回，完全不涉及系统调用**。这是它性能极高的关键。
3. **慢速路径 (Slow Path)**:
   * 如果原子操作失败（意味着有争用），线程就会进入慢速路径。
   * 它会调用 `futex` 这个**系统调用**，将自己放入内核的等待队列中，并休眠，直到被其他线程唤醒。
   * 当持有锁的线程释放锁时，它会再次通过原子操作修改状态字，并检查是否有人在等待。如果有人等待，它会调用 `futex` 去唤醒一个或多个休眠的线程。
