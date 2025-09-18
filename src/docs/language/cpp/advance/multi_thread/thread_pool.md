---
title: 线程池
icon: /assets/icons/article.svg
order: 1
category:
  - C++
date: 2025-08-11
---

## 1 简介

**线程池(Thread Pool)** 是多线程编程中一种常见的线程管理机制。它旨在优化线程的使用效率，避免频繁创建和销毁线程带来的性能开销。线程池是一种预先创建并管理一组线程的资源池。这些线程被保存在“池”中，处于空闲状态，等待任务分配。当有新任务到来时，线程池会从池中分配一个空闲线程来执行任务，任务完成后，线程不会被销毁，而是返回到池中等待下一个任务。这样，线程可以被重复利用，就像一个“线程的共享库”。

## 2 线程池的核心组件

- **线程集合**：池中固定或动态数量的线程。
- **任务队列**：用于存储待执行的任务（通常是Runnable或Callable对象）。
- **管理器**：负责线程的创建、分配、回收和监控。

在编程语言中，线程池通常由框架或库提供实现，例如：

- `Java`：`java.util.concurrent.ThreadPoolExecutor`；
- `Python`：`concurrent.futures.ThreadPoolExecutor`;
- `C++`：`std::thread`（结合自定义实现）或第三方库如`Boost.Asio`

## 3 为什么需要线程池

在多线程编程中，如果不使用线程池，每次执行任务时都需要手动创建新线程，执行完后销毁它。这会导致以下问题：

- **线程创建和销毁的开销大** ：创建线程涉及系统调用、分配栈内存、上下文切换等操作，这些操作耗时且消耗CPU和内存资源。销毁线程同样需要释放资源;
- **频繁操作导致性能瓶颈** ：在高并发场景(如Web服务器处理大量请求)，如果每个请求都创建一个线程，系统可能会因线程过多而崩溃(例如Java中的`OutOfMemoryError`)，或因频繁上下文切换而降低效率;
- **资源浪费** ：线程的生命周期短，如果不复用，每次都重新创建会浪费系统资源;
- **难以控制并发** ：没有机制限制同时运行的线程数，容易导致系统过载、死锁或资源争抢;

线程池通过 **复用** 线程来解决这些问题，使得多线程应用更高效和可控

## 4 线程池的好处

使用线程池可以带来多方面的优势，主要包括：

- **减少开销，提高性能** ：预先创建线程，避免了反复的创建/销毁过程。实验显示，在高负载下，使用线程池可以将响应时间缩短数倍。
- **资源利用率高** ：线程复用减少了内存和CPU的浪费。池的大小可以配置（例如核心线程数、最大线程数），根据系统能力动态调整。
- **控制并发度** ：可以设置线程池的最大容量，防止线程爆炸式增长，避免系统崩溃。例如，在服务器中限制同时处理的请求数。
- **任务管理更灵活** ：支持任务队列，当线程忙碌时，任务可以排队等待；还支持拒绝策略（当队列满时拒绝新任务）。
- **异常处理和监控** ：线程池通常提供钩子来处理任务异常、监控线程状态（如活跃线程数、完成任务数），便于调试和优化。
- **简化编程** ：开发者无需手动管理线程生命周期，只需提交任务给线程池，框架负责调度。

## 5 线程池的工作原理

简单来说，线程池的工作流程如下：

1. **初始化** ：创建固定数量的核心线程(`corePoolSize`)，并启动它们等待任务;
2. **提交任务** ：当任务到来时，如果有空闲线程，直接分配执行；否则放入任务队列;
3. **动态扩展** ：如果队列满且线程数未达上限(`maximumPoolSize`)，创建新线程;
4. **任务执行** ：线程从队列取任务执行，完成后返回池中;
5. **回收** ：空闲线程超过一定时间(`keepAliveTime`)可被回收，以节省资源;
6. **拒绝策略** ：队列满且线程满时，根据策略处理新任务(如抛异常、丢弃任务);

## 6 注意事项和潜在缺点

- **优点虽多，但需合理配置**：线程池大小过小会导致任务积压；过大会消耗过多资源。建议根据`CPU`核心数和任务类型调优(例如`IO`密集型任务可设更多线程);
- **潜在问题**：如果任务是长时阻塞的（如`IO`操作），可能导致线程池饥饿；另外，线程池不适合非常短的任务(开销可能高于收益);
- **替代方案**：对于某些场景，可以考虑协程(`Coroutine`)或异步编程(例如`Rust`中的`Async`编程)，它们在轻量级任务中更高效；

## 7 实战

接下来，让我们实现一个简易版本的线程池，包含线程池初始化，提交任务，执行任务，线程池回收这几个功能。

### 7.1 定义任务类

提供一个`Task`的类定义，用于表示需要提交的任务，类里面有一个`Excute`方法来模拟任务的执行。

```c++
class Task {
public:
    Task(int taskId) : taskId_(taskId) {}
    void Excute()
    {
        this_thread::sleep_for(std::chrono::seconds(1));
        cout << std::format("[{}] task {} finished", std::this_thread::get_id(), taskId_) << endl;
    }

private:
    int taskId_ { 0 };
};
```

### 7.2 定义线程池类

提供一个类`ThreadPool`表示我们的线程池对象，回顾第2和第6小节，我们需要的方法如下：

| 方法                           | 功能                               |
| ------------------------------ | ---------------------------------- |
| `ThreadPool(int maxThreadCnt)` | 线程池初始化，直接放到构造函数中   |
| `~ThreadPool()`                | 线程池资源回收，直接放到析构函数中 |
| `void AddTask(Task&& task)`    | 提交任务，这里是同步函数设计       |

#### 7.2.1 线程池初始化

使用C++的`std::thread`库，创建指定数量线程到添加到我们的线程管理容器 `threads_` 中。

守护函数 `Daemon` 的实现我们后续再讲，它的主要逻辑是检测任务队列是否有任务需要执行，如果有，就执行。

```c++
ThreadPool::ThreadPool(int maxThreadCnt)
{
    for (int i = 0; i < maxThreadCnt; ++i) {
        threads_.emplace_back([this]() { Daemon(); });
    }
}
```

#### 7.2.1 提交任务

我们使用队列的结构管理提交的任务，因为存在多线程提交任务，还需要对提交过程加锁。

提交任务后，我们需要通知线程池中空闲的线程从任务队列里面取任务来执行。

值得注意的是，这里面我们还用到了一个条件变量，这个条件变量是用于唤醒线程池中的空闲线程进行任务消费。

```c++
void ThreadPool::AddTask(Task&& task)
{
    {
        std::unique_lock lock(mutex_);
        tasks_.emplace(task);
    }
    // 只需要通知到一个空闲的线程即可
    cv_.notify_one();
}
```

#### 7.2.2 线程函数实现

在7.2.1小节，我们初始化线程，并将 `ThreadPool::Daemon` 作为线程函数，在这个函数里面会循环等待任务进行消费。

下面是这个线程函数的定义，主体逻辑是循环等待任务队列里面有任务，被提交任务`AddTask`唤醒后，从队列里面取出任务进行执行

另外，为了实现线程的回收，我们增加了 `needStop_` 用于线程的退出。

```c++
void ThreadPool::Daemon()
{
    while (true) {
        std::unique_lock lock(mutex_);
        cout << std::format("[{}]holding lock, waitting task!", std::this_thread::get_id()) << endl;
        
        // 持续等待，直到 !tasks_.empty() || needStop_ 为 true, 等待的过程中不会占有锁
        cv_.wait(lock, [this]() { return !tasks_.empty() || needStop_; });
        
        if (needStop_) {
            return;
        }
        if (tasks_.empty()) {
            continue;
        }
        auto task = tasks_.front();
        task.Excute();
        tasks_.pop();
    }
}
```

#### 7.2.3 线程池回收

值得注意的是，通知完所有的线程后，需要对线程池所有线程执行 `join` 操作等待它们退出，否则主线程先退出，子线程后退出，会导致子线程运行抛出异常。

```c++
ThreadPool::~ThreadPool()
{
    needStop_ = true;
    // 通知所有在等待的线程退出
    cv_.notify_all();
    for (auto& t : threads_) {
        if (t.joinable()) {
            t.join();
        }
    }
}
```

### 7.3 完整实现

::: details 查看代码

```c++
#include <format>
#include <iostream>
#include <memory>
#include <mutex>
#include <queue>
#include <thread>
#include <vector>

using namespace std;
class Task {
public:
    Task(int taskId) : taskId_(taskId) {}
    void Excute()
    {
        this_thread::sleep_for(std::chrono::seconds(1));
        cout << std::format("[{}] task {} finished", std::this_thread::get_id(), taskId_) << endl;
    }

private:
    int taskId_ { 0 };
};

class ThreadPool {
public:
    ThreadPool(int maxThreadCnt);

    ~ThreadPool();

    void AddTask(Task&& task);

private:
    void Daemon();

private:
    std::vector<std::thread> threads_;
    std::queue<Task> tasks_;
    std::mutex mutex_;
    std::condition_variable cv_;
    atomic<bool> needStop_ { false };
};

ThreadPool::ThreadPool(int maxThreadCnt)
{
    for (int i = 0; i < maxThreadCnt; ++i) {
        threads_.emplace_back([this]() { Daemon(); });
    }
}

void ThreadPool::AddTask(Task&& task)
{
    {
        std::unique_lock lock(mutex_);
        tasks_.emplace(task);
    }
    cv_.notify_one();
}

void ThreadPool::Daemon()
{
    while (true) {
        std::unique_lock lock(mutex_);
        cout << std::format("[{}]holding lock, waitting task!", std::this_thread::get_id()) << endl;
        cv_.wait(lock, [this]() { return !tasks_.empty() || needStop_; });
        if (needStop_) {
            return;
        }
        if (tasks_.empty()) {
            continue;
        }
        auto task = tasks_.front();
        task.Excute();
        tasks_.pop();
    }
}

ThreadPool::~ThreadPool()
{
    needStop_ = true;
    // 通知所有在等待的线程退出
    cv_.notify_all();
    for (auto& t : threads_) {
        if (t.joinable()) {
            t.join();
        }
    }
}

int main()
{
    {
        ThreadPool pool(5);
        this_thread::sleep_for(std::chrono::seconds(1));
        cout << endl;

        pool.AddTask(Task(1));
        pool.AddTask(Task(2));
        pool.AddTask(Task(3));
        pool.AddTask(Task(4));
        pool.AddTask(Task(5));
    }

    this_thread::sleep_for(std::chrono::seconds(10));
    cout << "All threads have been cleared" << endl;
}
```

运行结果如下：

```bash
[12992]holding lock, waitting task!
[35480]holding lock, waitting task!
[18860]holding lock, waitting task!
[13088]holding lock, waitting task!
[38288]holding lock, waitting task!

[12992] task 1 finished
[12992]holding lock, waitting task!
[12992] task 2 finished
[12992]holding lock, waitting task!
[12992] task 3 finished
[12992]holding lock, waitting task!
[18860] task 4 finished
[18860]holding lock, waitting task!
All threads have been cleared
```

:::

