---
title: 打家劫舍
icon: /assets/icons/article.svg
order: 1
category:
  - Algorithm
date: 2025-08-08
---

## [题目内容](https://leetcode.cn/problems/house-robber/description/)

你是一个专业的小偷，计划偷窃沿街的房屋。每间房内都藏有一定的现金，影响你偷窃的唯一制约因素就是相邻的房屋装有相互连通的防盗系统，**如果两间相邻的房屋在同一晚上被小偷闯入，系统会自动报警**。

给定一个代表每个房屋存放金额的非负整数数组，计算你 **不触动警报装置的情况下** ，一夜之内能够偷窃到的最高金额。

**示例 1：**

```tex
输入：[1,2,3,1]
输出：4
解释：偷窃 1 号房屋 (金额 = 1) ，然后偷窃 3 号房屋 (金额 = 3)。
     偷窃到的最高金额 = 1 + 3 = 4 。
```

**示例 2：**

```tex
输入：[2,7,9,3,1]
输出：12
解释：偷窃 1 号房屋 (金额 = 2), 偷窃 3 号房屋 (金额 = 9)，接着偷窃 5 号房屋 (金额 = 1)。
     偷窃到的最高金额 = 2 + 9 + 1 = 12 。
```

**提示：**

- `1 <= nums.length <= 100`
- `0 <= nums[i] <= 400`

## 解题思路

拿到这个题目，我们知道针对于每个房屋都有偷和不被偷的两种情况，总共有 $2^{n}$ 种情况，如果使用递归或者循环的方式，按照题目的规模，必然会超时，所以我们尝试使用DP的思想来解决这个问题。

根据题意，当前房屋是否可以被偷取决于上一个房屋是否被偷。如果有n个房屋，我们假设知道了前 $n-1$ 个房屋的最佳偷取方案，是不是很容易就能得出第 $n$个房屋如何选择(偷和不偷的最大化收益)。

1.  第$n - 1$ 个房屋被偷，那么第$n$个房屋不能偷；
2. 第$n-1$个房屋不被偷，那么第$n$个房屋可以被偷，也可以不被偷；

我们使用$dp(i, 0)$和 $dp(i,1)$ 分别记录第 $i$ 次偷取的最佳收益，$0$ 和 $1$ 分别代表第i间房偷与不偷。按照我们前面所说，我们可以得出如下的转移方程：
$$
\begin{cases} 
dp[n, 0] = \max(dp[n - 1, 1],\ dp[n - 1, 0]) \\
dp[n, 1] = dp[n - 1, 0] + nums[n - 1]
\end{cases}
$$
根据上面这个公式，实际上我们还可以继续简化状态方程，假设 $f(n)$ 为偷取到了第$n$间房的最大收益，从上面公式可以看出
$$
\begin{cases} 
dp[n, 0] = \max(dp[n -1, 1], dp[n -1, 0]) \equiv f(n -1) \\
dp[n, 1] = dp[n - 1, 0] + + nums[i-1] \equiv f(n - 2) + + nums[n - 1]
\end{cases}
$$
于是，最终的一个状态转移公式是：
$$
f(n) = max(dp[i][0], dp[i][1]) = max(f[n -1], f(n - 2) + nums[n - 1])
$$
我们成功将二维DP压缩到了一维DP。代码实现如下，代码时间复杂度为$O(n)$

::: details 展开代码
```c++
#include <vector>
using namespace std;

class Solution {
public:
    int rob(vector<int>& nums) {
        if (nums.size() < 2) {
            return nums.back();
        }
        int n = nums.size();
        vector<int> dp(n + 1, 0);
        dp[0] = 0;
        dp[1] = nums.front();
        for (int i = 2; i <= n; ++i) {
            dp[i] = max(dp[i - 1], dp[i - 2] + nums.at(i - 1));
        }
        return dp[n];
    }
};
```
:::

### 空间优化

在上述代码我们发现，每次处理循环的过程，只依赖 `i - 1`, `i - 2`的值，我们采用两个变量来记录，来代替n维数组

::: details 展开代码
```c++
#include <vector>
using namespace std;

class Solution {
public:
    int rob(vector<int>& nums) {
        int n = nums.size();
        int curr = 0;
        int prev = 0;
        for (int i = 0; i < n; ++i) {
            auto next = std::max(curr, prev + nums.at(i));
            prev = curr;
            curr = next;
        }
        return curr;
    }
};
```
:::

## [打家劫舍进阶版](https://leetcode.cn/problems/house-robber-ii/description/)

在上面题目的基础上，增加一个限制，将n间房组成一个环，相邻的两间房不能连续被偷，这就意味着第1间房和第n间房也只能同时有一间房可以被偷。

经过思考发现，直接操作n个数据来使用DP求值，很难，你需要知道在做第n个位置处理的时候，不确定第1个位置的处理情况，实际上我也尝试将第一个房屋的偷取情况带到第n个房间处理的，实际在转移的过程，很难讲这个信息保留下来，有兴趣的伙伴可以自己尝试思考试一下。

这里有一个比较巧妙的思路，既然首尾有特殊性，就将首尾分开处理，其他元素按照基础版本的解法即可。由于第1个位置和第n个位置不能同时选，我们对`[0, n -2]`和`[1, n-1]`这两个范围内的元素运行基础版的DP公式计算，然后取两者的最大值即可，代码如下：

::: details 展开代码
```c++
#include <vector>
using namespace std;
class Solution {
public:
    int robRange(vector<int>& nums, int start, int end)
    {
        int prev = 0;
        int curr = 0;
        for (int i = start; i <= end; ++i) {
            auto next = max(curr, prev + nums.at(i));
            prev = curr;
            curr = next;
        }
        return curr;
    }

    int rob(vector<int>& nums)
    {
        if (nums.size() == 1) {
            return nums.back();
        }
        int n = nums.size();
        return max(robRange(nums, 0, n - 2), robRange(nums, 1, n - 1));
    }
};
```
:::

