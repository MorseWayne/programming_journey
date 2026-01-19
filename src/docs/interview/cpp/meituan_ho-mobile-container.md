---
title: 美团-移动端-容器开发
icon: /assets/icons/article.svg
order: 1
category:
  - Interview
  - C++
  - Meituan
date: 2025-08-08
---

[职位详情](https://zhaopin.meituan.com/web/position/detail?jobUnionId=3535142664&source=interviewEmail)

## 二面内容

第二轮讲了50多分钟，基本没有问太多技术层面的东西，话题主要是在讲个人在实际项目中的工作职责。

1. 个人的整体项目经历，以及你在项目中承担的工作；
2. 讲一下你印象深刻或者觉得有价值的工作或者技术；
3. 讲一下你在实际项目中的你觉得好的设计，为什么好，好的点在哪里；

第一个我讲了下自己Rust项目的经历，讲了一下为什么要从C++过渡到Rust，它的价值和优势在哪里，最后的收益是啥。
第二个我主要讲了下我在鸿蒙系统里面的设计工作是怎么开展的，鸿蒙系统和安卓，`ios`的差异，在我负责的特性对标竞品，有哪些好的地方，有哪些不如竞品的地方。

然后我问了下美团面试官关于该业务组负责的核心业务和技术，主要是提供美团APP的基础UI渲染能力(有点类似于ARKUI)，其次还做了JS引擎(听介绍主要是做一些编译原理上的工作)，感觉比较核心和基础，但是听得出来业务范围广，做的东西比较底层，可能猜测到业务组的压力。

## 一面内容

面试时长大概一个半小时左右，主要是C++基础知识和算法能力考察。

### 1.项目经历介绍

1. 介绍个人的主要项目，讲技术难点，技术亮点，技术价值；
2. 介绍一下个人快速解决问题的能力，遇到一个项目上的问题的解决过程是啥；
::: details 查看答案
// to do
:::

### 2.C++基础知识

1. **谈一下程序的编译执行链接过程，每个阶段干了啥**
    1. 编译干了什么
    2. 链接干了什么(动态库和静态库的区别，静态库链接到可执行性程序干了什么)
    3. 执行干了什么
    ::: details 查看答案
    [C++编译过程超详解](/docs/language/cpp/memory/)
    :::
2. **谈一下堆栈的区别，哪些东西在栈上，哪些东西在堆上**
    1. 函数调用过程中，参数放在哪里
    2. `rbp`，`rsp`的考察
    3. 函数怎么返回的
    ::: details 查看答案
    // to do
    :::
3. **谈一下C++的内存管理**
    1. c++避免内存泄露，如何优雅的实现内存管理
    2. `shared_ptr`和`unique_ptr`的原理；
    ::: details 查看答案
    // to do
    :::
4. **谈一下C++多态是怎么实现的**
    1. 虚指针和虚地址放在哪里的
    2. 析构为什么需要时虚函数
    3. 什么情况下因为没有执行父类析构函数导致内存泄漏
    ::: details 查看答案
    // to do
    :::
5. **谈一下左值引用和右值引用的区别以及使用的场景**
::: details 查看答案
// to do
:::
6. **谈一下map和unordered_map的区别以及增删改查的复杂度**
::: details 查看答案
// to do
:::

### 3.算法题

BST树搜索，树的每个节点额外携带父节点的信息，找给定某个节点的中序后继节点，**树里面可能有重复节点**。
下来之后，我在Leetcode上找到原题[二叉树的中序后继II](https://leetcode.cn/problems/inorder-successor-in-bst-ii/)

```c++
struct Node {
    Node* left;
    Node* right;
    Node* parent;
    int val;
}

// 找到P的中继后续遍历节点
Node* find_next(Node* p)
{
    return nullptr;
}
```
::: details 查看答案
```c++
Node* dfs(Node* node) {
    if (node->left) {
        return dfs(node->left);
    }
    return node;
}

Node* find_next(Node* node) {
    if (!node) {
        return nullptr;
    }
    if (node->right) {
        return dfs(node->right);
    }
    auto next = node->parent;
    auto current = node;
    /**
        * 面试时，脑袋短路，我这里写的是 next->val < node->val
        * 面试官问了BST有重复数据怎么办，这个细节我当时没有做好
        */
    while (next && next->left != current) {
        current = next;
        next = next->parent;
    }
    return next;
}
```
:::
