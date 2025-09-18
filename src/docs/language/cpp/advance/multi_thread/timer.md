---
title: 定时器
icon: /assets/icons/article.svg
order: 2
category:
  - C++
date: 2025-08-14
---

## 概览

在夸克的面试过程中，被面试官提到了结合`epoll`实现一个定时器，当时这方面能力是欠缺的，为了记录自己的查漏补缺过程，我将在本章节介绍如何实现一个简单的定时器。

首先分析一个定时器应该支持的功能：

1. 设置定时时间，包括首次启动的时间和定时器的周期循环时间；
2. 启动定时器；
3. 停止定时器；
4. 定时事件通知；

一般来说，对于定时器的启动，应该是一个异步的行为，尽量避免阻塞调用线程的执行，当然，在有些系统上的定时器库上，可以指定线程去跑定时器，来避免多线程竞争的问题，或者达到减少系统资源占用的目的。本文不做这么复杂功能设计的尝试，面试过程中，我理解知道基础原理就好了。

## `timerfd`介绍

对于传统的定时器(比如`settimer`)，是通过信号来通知任务到期，这样会打断程序执行，且信号回调里限制多，复杂度高。有没有可替代的自定义高精度定时器实现方案？当然有！接下来我们介绍一下`timerfd`。

`timerfd` 是 Linux 专门为**将定时器事件作为文件描述符（`fd`）来使用**而设计的内核机制。它的最大特点是：**把定时事件和 I/O 事件统一起来**，让你用 `select` / `poll` / `epoll` 这样的 I/O 多路复用机制处理定时任务。

## 功能设计


我们实现一个名为 `TimerWithEpoll` 的类，将上面的行为映射到实际的成员函数：

| 功能         | 函数     | 说明                                           |
| ------------ | -------- | ---------------------------------------------- |
| 设置定时时间 | 构造函数 | 通过构造参数传入，同步行为                     |
| 启动定时器   | `Start`  | 启动定时器                                     |
| 停止定时器   | `Stop`   | 停止定时器                                     |
| 定时事件通知 | 构造函数 | 通过构造参数传入处理回调，异步接收定时事件通知 |

## 时序图设计

结合上面的功能设计，我们完成以下时序图的设计

@startuml
actor User
participant "MainThread" as Main
participant "TimerWithEpoll"
participant "ListenThread" as Listen

User -> Main : 创建 TimerWithEpoll
Main -> TimerWithEpoll : 构造函数
User -> Main : 调用 Start()
Main -> TimerWithEpoll : Start()
TimerWithEpoll -> Listen : 启动监听线程(Listen)
loop (定时器周期)
    Listen -> TimerWithEpoll : epoll_wait 检测到 timerfd 可读
    Listen -> TimerWithEpoll : read(timerfd) 获取 expirations
    Listen -> TimerWithEpoll : callback_(expirations)，通知业务回调
end
User -> Main : 调用 Stop()
Main -> TimerWithEpoll : Stop()
TimerWithEpoll -> Listen : 通知线程退出
Listen -> TimerWithEpoll : 线程退出
@enduml

## 代码实现

### 1.`timerfd`创建

我们使用系统接口`timerfd_create(clockid, flags)` 来创建一个定时器的文件描述符(也可以叫做句柄, `handle`等等), 其中函数的两个参数解释如下

- `clockid`
  - `CLOCK_REALTIME`（系统实时时钟，受系统时间调整影响）
  - `CLOCK_MONOTONIC`（单调时钟，不受系统时间更改影响）
- `flags`: 常用 `TFD_NONBLOCK`(非阻塞) 和 `TFD_CLOEXEC`。

更多代码细节直接查看下面代码把，有详细注释！

```c++
UniqueFd TimerWithEpoll::CreateTimer()
{
    auto timerFd = timerfd_create(CLOCK_MONOTONIC, 0);
    if (timerFd == -1) {
        std::cerr << "Failed to create timer" << std::endl;
        return nullptr;
    }

    auto timerFdPtr = UniqueFd(new int(timerFd));

    // POSIX定时器配置
    itimerspec timerSpec {};

    // 启动定时器后的首次触发时间，比如这里我希望我的定时器3s后才首次触发
    timerSpec.it_value.tv_sec = initialDelay_.count();
    timerSpec.it_value.tv_nsec = 0;

    // 定时器的周期触发时间设置，比如下面的设置时每隔1s就会触发定时器
    timerSpec.it_interval.tv_sec = interval_.count();
    timerSpec.it_interval.tv_nsec = 0;

    /**
     * 设置或重置 timerfd 定时器的超时时间和周期。
     * 参数1：fd, 由 timerfd_create 返回的定时器文件描述符
     *
     * 参数2：flags，常用为 0，或 TFD_TIMER_ABSTIME（表示
     * it_value是绝对时间[比如这个值时一个系统时钟的时间]，否则为相对时间
     *
     * 参数3：new_value, 新的定时器超时时间和周期
     *
     * 参数4：old_value, 如果不为 nullptr，调用前定时器的设置会被写入这里（可用于获取上一次的定时器设置），
     * 否则可传nullptr
     */
    if (timerfd_settime(*timerFdPtr, 0, &timerSpec, nullptr) == -1) {
        std::cerr << "Failed to set timer" << std::endl;
        return nullptr;
    }

    return timerFdPtr;
}
```

::: tip

`UniqueFd` 是 RAII风格的代码实现，为了避免手动管理`fd`，我们使用智能指针来保证`fd`的正常关闭，保证它在任何场景都不会泄露

```c++
// 创建智能指针管理的 fd, 使用RAII编程风格防止fd泄露
using UniqueFd = std::unique_ptr<int, FdCloser>;
```

:::

### 2.`epoll`创建

在上一步创建好定时器的`fd`后，只要定时器超时，这个定时器的`fd`就会被标记为可读，我们通过`epoll`的方式来监听这个状态。

```c++
UniqueFd TimerWithEpoll::CreateEpoll()
{
    auto timerFd = CreateTimer();
    if (timerFd == nullptr) {
        return nullptr;
    }
    timerFd_.swap(timerFd);

    int epollFd = epoll_create1(0);
    if (epollFd == -1) {
        std::cerr << "Failed to create epoll instance" << std::endl;
        return nullptr;
    }

    auto epollFdPtr = UniqueFd(new int(epollFd));
    epoll_event event {};
    event.events = EPOLLIN;
    // 自定义的带回参数，它会在 epoll 事件返回时带回给你，epoll 只负责原样带回
    // 这里你可以设置为任意值
    event.data.fd = *timerFd_;  // Use member variable timerFd_

    auto err = epoll_ctl(epollFd, EPOLL_CTL_ADD, *timerFd_, &event);
    if (err == -1) {
        std::cerr << "Failed to add timer to epoll" << std::endl;
        return nullptr;
    }

    return epollFdPtr;
}

```

### 3. 超时事件处理

下面是`epoll`的循环监听处理逻辑：

1. 通过 `epoll_wait` 等待`fd`就绪;
2. 通过`read`的系统接口读取定时器的未读的历史触发计数(`expirations`)；
  ::: important
  这一步非常重要，这一步对业务逻辑没什么用，但是必须实现这一步，这一步的操作是为了清除定时器 `fd` 的**可读状态**， 不然这个`fd`一直是可读的，定时器逻辑会失效。更多详细解释查看代码注释！
  :::
3. 触发业务回调，执行创建定时器时设置的业务`callback_`；

```c++
bool TimerWithEpoll::Listen()
{
    epoll_event events[10] {};
    while (running_) {
        int nfds = epoll_wait(*epollFd_, events, sizeof(events), -1);
        if (nfds == -1) {
            std::cerr << "Failed to wait for epoll events, errno: " << errno << std::endl;
            return false;
        }

        auto now = std::chrono::system_clock::now();
        auto seconds = std::chrono::duration_cast<std::chrono::seconds>(now.time_since_epoch()).count();
        std::cerr << "Epoll event occurres, unix time: " << seconds << std::endl;

        // 处理到来的事件
        for (int i = 0; i < nfds; ++i) {
            if (events[i].data.fd == *timerFd_) {
                /**
                 * 读取定时器的超时事件，获取定时器截止到目前未被读取(也就是下面的read操作)的总次数
                 * 必须执行这个read操作，否则 epoll 会一直报告它可读，定时事件不会被“消耗”掉
                 * 读取的数据类型是 uint64_t，表示"自上次 read以来定时器到期了多少次"。
                 * 如果你的处理慢，可能会积累多次到期。
                 * 举例：
                 *  如果定时器每秒触发一次，你 3 秒后才调用 read，expirations 可能就是 3
                 *  如果你每次都及时 read，expirations 就是 1
                 */
                uint64_t expirations = 0;
                read(*timerFd_, &expirations, sizeof(expirations));
                // 执行业务callback
                callback_(expirations);
            }
        }
    }
    return true;
}
```

### 4. 将事件监听执行放入到新的线程

第三步我们可以看到，事件的监听在一个循环里面，在没有手动停止定时器之前，这个循环都不会退出，会一直循环处理定时器事件，一定会阻塞启动定时器的线程的其他业务逻辑，所以为了去除这个影响，我们将我们的定时器事件处理逻辑放入到单独的线程里面去，代码实现如下：

```c++
bool TimerWithEpoll::Start()
{
    if (running_) {
        return false;
    }
    auto epollFd = CreateEpoll();
    if (epollFd == nullptr) {
        return false;
    }
    epollFd_.swap(epollFd);
    running_ = true;

    // 创建异步任务执行定时器函数
    listenThread_ = std::thread([this] { Listen(); });
    return true;
}
```

代码里面有一个比较重要的变量`running_`，这是为了控制定时器的退出，当它为`true`时, 代表定时器正在工作，当手动对定时器执行`Stop`操作, 这个标志位会被设置为`false`，让事件处理循环退出。

### 5. 完整代码

[点击跳转查看完整代码](https://github.com/MorseWayne/Practice/tree/main/c%2B%2B/timer)



