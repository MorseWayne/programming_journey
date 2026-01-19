---
title: 核心思想
icon: /assets/icons/article.svg
order: 1
category:
  - Algorithm
date: 2025-08-08
---


## 概要

初识`DP(dynamic programming)`问题，我觉得这是一个非常抽象的算法思想，我反反复复想了很久，一直在思考这类问题为什么可以这么做。

DP问题解法的一个核心概念就是要理解`状态转移`以及找到`状态转移公式`，我们求解的答案是程序在某个特定状态下的表现，而这个状态是一个或者多个历史的状态变化(多个历史状态压缩成一个状态，这个就叫`状态压缩`)而来。对于程序每一个可能出现的状态，都能通过一个通用的方式从历史状态变化而来，这一类问题我们就将其叫做DP问题，寻找`状态转移公式`也就是我们常说的寻找`最优子问题`。

## 一维DP

也许上面的解释很抽象，我们来看一些具体的例子 [跳台阶](https://leetcode.cn/problems/climbing-stairs/description/)

> 假设你正在爬楼梯。需要 `n` 阶你才能到达楼顶。
>
> 每次你可以爬 `1` 或 `2` 个台阶。你有多少种不同的方法可以爬到楼顶呢？

如果不考虑使用DP，用模拟的思路来解决这个问题，应该如何实现？

```tex
初始状态 从 位置 0开始起跳，我们记录每一次可以到达的位置
跳一次：0 + 1, 0 + 2 = {1, 2}
跳两次：从 {1, 2} 里面的任意位置起跳，得到 {1 + 1, 1 + 2, 2 + 1, 2 + 2} = {2,3,3,4}
跳三次：从 {2, 3, 3, 4} 里面的任意位置起跳, 得到 {3,4,4,5,4,5,5,6}
```

通过直接模拟，统计每次出现n的次数，直到集合里的元素都大于n为止，统计出的总次数就是我们想要知道的方案,
我们看下上面这个思路转换成代码应该如何实现，很明显这是一个重复迭代的过程，我们可以使用循环或者递归的方式来实现
::: details 展开代码
```c++
#include <vector>
using namespace std;
class Solution {
public:
    int climbStairs(int n)
    {
        vector<int> positions { 0 };  // 记录当前可到达的位置
        int ans = 0;  // 记录答案
        while (true) {
            vector<int> next;
            int lessThanNCnt = 0;  // 记录比n小的位置的个数
            for (auto pos : positions) {
                if (pos < n) {
                    next.emplace_back(pos + 1);
                    next.emplace_back(pos + 2);
                    ++lessThanNCnt;
                } else if (pos == n) {
                    ++ans;
                }
            }
            if (lessThanNCnt == 0) {
                break;
            }
            positions = std::move(next);
        }
        return ans;
    }
};
```
:::
从上面模拟的过程，我们可以看到空间复杂度和时间复杂度都是随着n的增大呈现指数型倍增的，模拟的实现，效率极其地下。
回到DP的思路上来，结合题目，我们发现，位置 `n` 只能是 从 `n  - 1` 或者 `n - 2` 的位置跳跃而来，位置 `n` 为一个状态，
位置为 `n - 1` 和 `n - 2 `为历史的一个状态，换句话说，跳到位置n的方式，等于从 n -1 和 n - 2的方式之和，

那么DP的状态转移公式是：
$$
dp(n) = dp(n -1) + dp(n - 2)
$$
那转换成这个思想，我们的代码是不是就可以写的很简洁了：
::: details 展开代码
```c++
#include <vector>
using namespace std;
class Solution {
public:
    int climbStairs(int n) {
        vector<int> dp(n + 1, 0);
        dp[0] = 1; // 特殊状态，从dp[2] = 2来看，这个值设置为1是合理的
        dp[1] = 1;
        for (int i = 3; i <= n; ++i) {
            dp[i] = dp[i - 1] + dp[i - 2];
        }
        return dp[n];
    }
};
```
:::

::: details 展开代码
换一种更节省空间的做法，我们其实可以看出这是一个斐波那契数列，答案是第n个斐波那契数，更优实现如下：

```c++
#include <vector>
using namespace std;
class Solution {
public:
    int climbStairs(int n)
    {
        int num1 = 1;
        int num2 = 1;
        while (--n > 0) {
            auto temp = num2;
            num2 += num1;
            num1 = temp;
        }
        return num2;
    }
};
```
:::

上面只是一个简单的一维DP处理问题，实际考察的还有更复杂的多维DP，状态压缩DP，树状DP等，可以详细展开学习。
推荐阅读：[Hello算法-动态规划篇](https://www.hello-algo.com/chapter_dynamic_programming/intro_to_dynamic_programming/)
系统学习一下DP思路。
其实DP简单理解也是一种枚举法，它枚举了程序的初始状态到最终要求解的状态之间所有状态来得出最终结果。

## 基础练习

- [买卖股票的最佳时机](https://leetcode.cn/problems/best-time-to-buy-and-sell-stock/description)
- [卖股票的最佳时机 II](https://leetcode.cn/problems/best-time-to-buy-and-sell-stock-ii/description)
- [打家劫舍](practice/house_robber.md)

## 进阶练习

- [互不侵犯](practice/luogu_p1896.md)