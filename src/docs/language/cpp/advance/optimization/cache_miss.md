---
title: 缓存命中优化
icon: /assets/icons/article.svg
order: 1
category:
  - C++
date: 2025-09-11
---

本章节讨论在C++编程中，针对程序性能调优的一些手段。

## 1 缓存命中优化，避免cache miss

### 1.1 内存连续访问

访问数据尽量连续访问，且按照cache大小一次性读取和处理数据，这样尽可能的避免`cache miss`。

**典型场景**：遇到遍历数组的情况时，按照内存布局顺序访问，假设 `cpu` 的 `L1 Cache`是`64`字节，程序遍历的设计最好是能够连续的将这些数据处理完，再去读取后面的数据，不要比如先访问第`1`个字节，再去访问第`65`个字节，然后又回过头来访问第`2`个字节，这样会导致一直有`cache miss` 发生。针对于上述情况，合理的设置数据结构的大小也是极为重要的。

### 1.2 线程固定核心

将**计算密集型**的线程绑定到固定`CPU`核心上执行，避免一个线程在不同核心来回切换，导致`L1` 和 `L2` `Cache`命中率低。这是因为，在分时操作系统中，CPU根据时间片轮转策略对执行线程进行调度，默认策略可能会导致你的线程切出，恢复时已经在其它的`CPU`核心执行，但是`L1`和`L2 Cache`时每个核心独有的，这一定会导致`cache miss`。

在Linux中，你可以使用 `sched_setaffinity` 方法，将线程固定到某个核心运行。

### 1.3 避免伪共享

针对多线程会频繁的读写一个能够放在一个`cache line`中不同位置的数据，在多核系统中因为缓存一致性问题，这可能会导致交替性的**CPU Cache**失效问题，这种问题称之为**伪共享**(False Line)问题, 这会引发不必要的缓存同步和数据搬移，极大降低性能。

**典型场景：**

假设有如下结构体：

```c++
struct Data {
    int a; // 线程1操作
    int b; // 线程2操作
};
Data d;
```

如果a和b在内存中相邻，且都在同一个`Cache Line`内，线程1频繁写`a`，线程2频繁写`b`，虽然互不干扰，但每次写操作都会让对方的`Cache Line`失效，导致缓存同步，性能大幅下降。

**优化方案：**

让每个线程操作的变量单独占用一个Cache Line，中间插入无用的填充字节，使其分配在不同的`Cache Line`中。

1. **Data是作为数组元素的类型在使用**，需要每个数据成员独享`Cache Line`：

```c++
#include <new> // std::hardware_destructive_interference_size

struct alignas(std::hardware_destructive_interference_size) Data {
    int a;
    char pad1[std::hardware_destructive_interference_size - sizeof(int)];
    int b;
    char pad2[std::hardware_destructive_interference_size - sizeof(int)];
};
```

2. **如果Data只存在一个**，存在下面的简化写法：

```c++
struct Data {
    int a;                    // 偏移0，占4字节
    int b __cacheline_aligned; // 强制对齐到64字节偏移
} __cacheline_aligned;
```
