---
title: 互不侵犯
icon: /assets/icons/article.svg
order: 1
category:
  - Algorithm
date: 2025-08-08
---

## [题目描述](https://www.luogu.com.cn/problem/P1896)

在 *N*×*N* 的棋盘里面放 *K* 个国王，使他们互不攻击，共有多少种摆放方案。国王能攻击到它上下左右，以及左上左下右上右下八个方向上附近的各一个格子，共 8 个格子。

## 个人答案
::: details 展开代码
```c++
#include <algorithm>
#include <cstdint>
#include <iostream>
#include <numeric>
#include <vector>

using namespace std;

long long getCnt(int N, int K)
{
    int maxCnt = 1 << N;
    vector<vector<vector<long long>>> dp(N, vector<vector<long long>>(K + 1, vector<long long>(maxCnt, 0)));
    for (int val = 0; val < maxCnt; ++val) {
        if (val & ((val << 1) | (val >> 1))) {
            continue;
        }
        int currCnt = __builtin_popcount(val);
        if (currCnt > K) {
            continue;
        }
        dp[0][currCnt][val] = 1;
    }
    dp[0][0][0] = 1;

    for (int row = 1; row < N; ++row) {
        for (int totalCnt = 0; totalCnt <= K; ++totalCnt) {
            for (int currVal = 0; currVal < maxCnt; ++currVal) {
                int currCnt = __builtin_popcount(currVal);
                if (currCnt > totalCnt) {
                    continue;
                }
                if (currVal & ((currVal << 1) | (currVal >> 1))) {
                    continue;
                }
                for (int lastVal = 0; lastVal < maxCnt; ++lastVal) {
                    if (currVal & (lastVal | lastVal << 1 | lastVal >> 1)) {
                        continue;
                    }
                    dp[row][totalCnt][currVal] += dp[row - 1][totalCnt - currCnt][lastVal];
                }
            }
        }
    }
    return std::accumulate(dp[N - 1][K].begin(), dp[N - 1][K].end(), 0ll);
}

#include <iostream>

int main()
{
    int N = 0;
    int K = 0;
    cin >> N >> K;
    cout << getCnt(N, K) << endl;
}

```
:::

