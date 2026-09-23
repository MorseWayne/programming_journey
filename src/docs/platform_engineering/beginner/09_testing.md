---
title: A09 测试与调试：把预期变成可检查的结果
icon: /assets/icons/article.svg
order: 9
date: 2026-09-22
---

先修：[A08 points 包](./08_packages_modules.md)、[A05 集合](./05_collections.md)、[A07 error](./07_interfaces_errors.md)。

## 小需求：修改规则后，边界仍然正确

手工运行一次 80 分得到 10，不能证明 -1、59、60 和 101 都符合约定。测试让程序反复调用同一规则，并比较实际与预期。

先写规则，再据此选择测试输入。这样失败时能指出违反了什么承诺，而不仅是“测试红了”。

## Go 怎样发现测试

文件名以 `_test.go` 结尾，测试函数名以 Test 开头，接收 `*testing.T`。testing 是标准库，t 提供报告失败的能力。

在 A08 的 points 目录添加 points_test.go：

```go
package points

import "testing"

func TestReward(t *testing.T) {
    got, err := Reward(80)
    if err != nil {
        t.Fatalf("unexpected error: %v", err)
    }
    if got != 10 {
        t.Fatalf("got %d, want 10", got)
    }
}
```

got 保存实际结果，want 表示预期，是常见命名约定。Fatalf 输出格式化失败原因并停止当前测试的正常执行，不是业务程序里的错误处理方式。

这里测试文件也使用 package points，所以能直接调用本包函数。另一种外部测试包组织方式可以以后再学。

## 执行与读取结果

在 go-course 根目录：

```bash
go test ./points -v
go test ./points -run '^TestReward$' -v
```

-v 输出详细测试名称；-run 后是匹配测试名的正则表达式，`^` 和 `$` 表示从名称开头到结尾完全匹配。预期当前实现通过。

临时把期望 10 改成 20，观察失败文件、行号、got 和 want。随后恢复规则要求的预期。故意错误用于认识测试反馈，不代表发现失败后都应该改预期来迎合实现。

## 一次检查一组边界

将测试替换为下列完整版本，避免同一个包里出现两个同名 TestReward：

```go
package points

import "testing"

func TestReward(t *testing.T) {
    cases := []struct {
        name    string
        score   int
        want    int
        wantErr bool
    }{
        {"negative", -1, 0, true},
        {"below", 59, 0, false},
        {"threshold", 60, 10, false},
        {"maximum", 100, 10, false},
        {"too high", 101, 0, true},
    }
    for _, tc := range cases {
        t.Run(tc.name, func(t *testing.T) {
            got, err := Reward(tc.score)
            if (err != nil) != tc.wantErr {
                t.Fatalf("error=%v, wantErr=%v", err, tc.wantErr)
            }
            if got != tc.want {
                t.Fatalf("got %d, want %d", got, tc.want)
            }
        })
    }
}
```

`[]struct{...}` 是结构体切片，用每个元素描述一个案例。t.Run 接收名称和一个处理函数，A04 已讲过函数值；这里每个案例会成为有名字的子测试。

普通 t.Run 会等待此子测试结束，再继续循环。并行测试有额外共享规则，B06 之后再学习；本例没有调用 t.Parallel。

## 测试层次与证据范围

**单元测试**检查一个较小逻辑边界；**集成测试**检查模块与数据库等依赖如何协作；**端到端测试**从实际入口检查整个操作结果。

当前 TestReward 只验证函数规则，不证明 HTTP 服务、磁盘持久化或并发访问正确。测试覆盖率说明执行到了哪些代码，也不直接等于业务条件都被正确断言。

测试前必须有预期来源。例如“失败不改变余额”，需要同时检查错误与状态；只断言返回了 error 还不够。

## 调试：缩小差异出现的位置

发现实际与预期不同，可以按输入、分支、状态变化、输出逐步检查。先用最小输入重现，再观察关键变量，避免同时改变许多地方。

fmt.Printf 可以临时显示变量；编辑器调试器可以设置断点暂停并检查状态。两者都帮助观察执行，不能代替清楚的预期规则。

```text
输入是什么 → 哪条分支成立 → 数据怎样变化 → 返回了什么
```

## 常见错误

忘记保存文件，会测试旧代码；文件不是 `_test.go`，工具可能找不到测试；在错误目录运行，会检查另一个包；把错误结果硬改成预期，只会隐藏问题。

后面的 `go test -race` 用于观察实际执行中的数据竞争，C03、B06 会解释。基准使用 Benchmark 函数与 -bench 参数，在 C04 学习测量时再讲；它们与普通 Test 的目的不同。

## 独立练习

增加 0 和 90 两个输入；给 ScoreLabel 写测试；再把合格边界从 `>=60` 临时改成 `>60`，用测试找到漏掉的边界，最后恢复正确实现。

<details>
<summary>参考解释</summary>

如果只测试 80，两个实现都会通过。60 这个边界用例能直接区分它们，因此案例质量比简单增加很多相似数字更有价值。

</details>

下一课：[A10 文件、JSON 与时间](./10_files_json.md)。参考：[testing 标准库说明](https://pkg.go.dev/testing)。
