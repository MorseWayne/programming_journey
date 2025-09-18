---
title: 简介
icon: /assets/icons/article.svg
order: 1
category:
  - Redis
  - Database
date: 2025-08-08
---

## 1 简介

Redis(Remote Dictionary Server)是一个速度非常快的non-relational database(非关系型数据库， NoSQL)。Redis以字典(键值对)作为数据存储的关键基础结构，支持数据持久化，支持主从复制等多种数据库特性。

### 1.1  Redis vs 其他数据库

<table data-header-hidden>
    <thead>
        <tr>
            <th></th>
            <th width="347.99993896484375"></th>
            <th width="328"></th>
            <th width="325.39990234375"></th>
            <th width="321.86669921875"></th>
        </tr>
    </thead>
    <tbody>
        <tr>
            <td><strong>名称</strong></td>
            <td><strong>类型</strong></td>
            <td><strong>数据存储选项</strong></td>
            <td><strong>查询类型</strong></td>
            <td><strong>附加功能</strong></td>
        </tr>
        <tr>
            <td>Redis</td>
            <td>使用内存存储（in-memory）的非关系数据库</td>
            <td>字符串、列表、集合、散列表、有序集合</td>
            <td>每种数据类型都有自己的专属命令，另外还有批量操作（bulk operation）和不完全（partial）的事务支持</td>
            <td>发布与订阅，主从复制（master/slave replication），持久化，脚本（存储过程，stored procedure）</td>
        </tr>
        <tr>
            <td>memcached</td>
            <td>使用内存存储的键值缓存</td>
            <td>键值之间的映射</td>
            <td>创建命令、读取命令、更新命令、删除命令以及其他几个命令</td>
            <td>为提升性能而设的多线程服务器</td>
        </tr>
        <tr>
            <td>MySQL</td>
            <td>关系数据库</td>
            <td>每个数据库可以包含多个表，每个表可以包含多个行；可以处理多个表的视图（view）；支持空间（spatial）和第三方扩展</td>
            <td><code>SELECT</code>、 <code>INSERT</code>、 <code>UPDATE</code>、 <code>DELETE</code>、函数、存储过程</td>
            <td>
                <p>支持ACID性质（需要使用InnoDB），</p>
                <p>主从复制和主主复制 （master/master replication）</p>
            </td>
        </tr>
        <tr>
            <td>PostgreSQL</td>
            <td>关系数据库</td>
            <td>每个数据库可以包含多个表，每个表可以包含多个行；可以处理多个表的视图；支持空间和第三方扩展；支持可定制类型</td>
            <td><code>SELECT</code>、 <code>INSERT</code>、 <code>UPDATE</code>、 <code>DELETE</code>、内置函数、自定义的存储过程</td>
            <td>支持ACID性质，主从复制，由第三方支持的多主复制（multi-master replication）</td>
        </tr>
        <tr>
            <td>MongoDB</td>
            <td>使用硬盘存储（on-disk）的非关系文档存储</td>
            <td>每个数据库可以包含多个表，每个表可以包含多个无schema（schema-less）的BSON文档</td>
            <td>创建命令、读取命令、更新命令、删除命令、条件查询命令等</td>
            <td>支持map-reduce操作，主从复制，分片，空间索引（spatial index）</td>
        </tr>
    </tbody>
</table>
