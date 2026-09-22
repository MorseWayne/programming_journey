---
title: 04 从延迟现象找到运行瓶颈
icon: /assets/icons/article.svg
order: 4
date: 2026-09-22
---

## 本课问题与前置

CPU 只有 30%，请求为什么很慢？读 socket 一次，为什么可能拿不到完整消息？

前置：第 1–3 课。建议用时 4 小时。目标：分解耗时、选择诊断工具、验证字节流协议边界。

## 拆开时间

请求耗时包含排队、计算、同步等待、网络和存储等待。CPU 利用率只反映一部分。锁竞争、下游变慢、工作池占满，都可能让 CPU 不满而尾延迟很高。

**吞吐**是单位时间完成数量；**延迟**是一次请求耗时；**P99**是样本分布中约 99% 请求不超过的值。比较时说明时间窗、样本量、是否包含失败，以及负载模型。

近似稳定系统中，平均在途数约等于到达速率乘平均耗时。1,000 次/秒、平均 0.05 秒，对应约 50 个在途请求。这是估算，不是 goroutine 数的通用配置公式。

## 运行时与诊断工具

goroutine 需要运行时调度，阻塞并不等于占用一个 CPU 核。大量短命分配增加垃圾回收工作；仍被引用的对象不会因为业务已用完而自动释放。

按 [Go 官方诊断指南](https://go.dev/doc/diagnostics)选择工具：CPU profile 看计算热点，heap 看分配和存活，mutex/block 看等待，execution trace 看调度事件。采集会带来开销，比较时保持条件一致。

## 实验 A：可重复基线

```bash
cd labs/platform_path
go test -run '^$' -bench BenchmarkGrant -benchmem -count=3
go test -run '^$' -bench BenchmarkGrant -benchtime=2s -cpuprofile /tmp/arena-cpu.pprof
go tool pprof -top /tmp/arena-cpu.pprof
```

预期看到 `ns/op`、`B/op`、`allocs/op`，数值取决于机器。基准重复查询同一回执，测的是重复请求路径，不能当作首次发奖吞吐或线上容量。

练习：另写基准测不同请求 ID。说明回执累积如何影响内存与公平比较。保留三个样本，报告范围，不能只选最好的一次。

## TCP 字节流与消息边界

一次写入不对应一次读取。先用四字节大端整数表示正文长度，再读指定长度，就能从字节流中分出消息。`io.ReadFull` 累计读取，直到缓冲填满或遇到错误。

```text
[长度 4 字节][正文 N 字节][长度 4 字节][正文 M 字节]
```

先限制 N 再分配内存，避免无界分配。合法长度仍可能只收到一半；真实连接需要超时、连接数与总内存限制。

## 实验 B：拆包与半包

```bash
go test -run '^TestFrame' -v
```

`TestFrame` 每次只返回一个字节，仍应读出 hello 和 world。边界测试验证截断正文和超长声明。

<details>
<summary>预测题反馈</summary>

一次 `Read` 可能返回少量字节且没有错误。忽略实际读取数量，会把不完整缓冲当完整消息。缓冲足够大也无法改变字节流语义。

</details>

独立练习：添加零长度消息、两字节头、两条消息之间断开三种测试，解释 `io.EOF` 与 `io.ErrUnexpectedEOF`。再比较等待发生在网络、队列和锁时分别需要什么证据。

达标证据：注明路径和条件的基准报告、协议边界测试。下一课：[数据建模与索引](./05_storage.md)。
