---
title: 数据结构
icon: /assets/icons/article.svg
order: 2
category:
  - Redis
  - Database
date: 2025-08-08
---

# 数据结构

Redis可以存储键与5种不同数据结构类型之间的映射，包括`STRING`（字符串）、`LIST`（列表）、`SET`（集合）、`HASH`（散列）和`ZSET`（有序集合）。各个类型的详细能力如下：
<table data-header-hidden>
    <thead>
        <tr>
            <th width="107.39996337890625"></th>
            <th width="406"></th>
            <th width="406.20001220703125"></th>
        </tr>
    </thead>
    <tbody>
        <tr>
            <td>结构类型</td>
            <td>结构存储的值</td>
            <td>结构的读写能力</td>
        </tr>
        <tr>
            <td><code>STRING</code></td>
            <td>可以是字符串、整数或者浮点数</td>
            <td>对整个字符串或者字符串的其中一部分执行操作；对整数和浮点数执行自增（increment）或者自减（decrement）操作</td>
        </tr>
        <tr>
            <td><code>LIST</code></td>
            <td>一个链表，链表上的每个节点都包含了一个字符串</td>
            <td>从链表的两端推入或者弹出元素；根据偏移量对链表进行修剪（trim）；读取单个或者多个元素；根据值查找或者移除元素</td>
        </tr>
        <tr>
            <td><code>SET</code></td>
            <td>包含字符串的无序收集器（unordered collection），并且被包含的每个字符串都是独一无二、各不相同的</td>
            <td>添加、获取、移除单个元素；检查一个元素是否存在于集合中；计算交集、并集、差集；从集合里面随机获取元素</td>
        </tr>
        <tr>
            <td><code>HASH</code></td>
            <td>包含键值对的无序散列表</td>
            <td>添加、获取、移除单个键值对；获取所有键值对</td>
        </tr>
        <tr>
            <td>
                <p><code>ZSET</code></p>
                <p>(有序集合)</p>
            </td>
            <td>字符串成员（member）与浮点数分值（score）之间的有序映射，元素的排列顺序由分值的大小决定</td>
            <td>添加、获取、删除单个元素；根据分值范围（range）或者成员来获取元素</td>
        </tr>
    </tbody>
</table>

