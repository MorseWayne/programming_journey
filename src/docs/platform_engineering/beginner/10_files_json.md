---
title: A10 文件、JSON 与时间：让数据离开当前变量
icon: /assets/icons/article.svg
order: 10
date: 2026-09-22
---

先修：[A06 结构体](./06_structs_pointers.md)、[A07 错误与 defer](./07_interfaces_errors.md)、[A08 包](./08_packages_modules.md)。

## 小需求：保存任务，再读取出来

程序关闭后局部变量不会自动保留。先把任务写成文件，之后重新读取，是认识持久化的最小入口。今天学习编码与文件操作；数据库事务、刷盘和崩溃恢复在后面的课里展开。

## JSON 是数据文本格式

JSON 可以表达对象、数组、字符串、数值、布尔和 null。对象使用键值对，字符串与键名使用双引号：

```json
{"id":"t1","title":"学习文件","done":false}
```

JSON 不直接保存 Go 方法、锁或连接。它描述的是数据，需要双方约定字段含义。合法 JSON 也可能缺少业务必需字段，因此解析成功后仍需校验。

## 编码与解码

**编码**将 Go 值转换为字节，**解码**将字节转换为 Go 值。encoding/json 提供相关能力。

```go
type Task struct {
    ID    string `json:"id"`
    Title string `json:"title"`
    Done  bool   `json:"done"`
}
```

反引号内是结构体标签，用来给相关库提供额外说明。这里的 json 标签指定对应的 JSON 字段名，不是给字段赋值。

encoding/json 通常只处理可导出的字段，因此使用 ID、Title、Done。小写字段属于另一种可见性范围，不能假定照样会被编码。

## 完整的读写练习

保存为 a10/main.go，从 go-course 根目录执行 `go run ./a10`。本练习会在当前工作目录写入名为 task.json 的虚构任务文件；选择自己专用的练习目录。

```go
package main

import (
    "encoding/json"
    "fmt"
    "os"
)

type Task struct {
    ID    string `json:"id"`
    Title string `json:"title"`
    Done  bool   `json:"done"`
}

func main() {
    task := Task{ID: "t1", Title: "学习文件", Done: false}
    data, err := json.Marshal(task)
    if err != nil {
        fmt.Println("编码失败：", err)
        return
    }
    if err := os.WriteFile("task.json", data, 0600); err != nil {
        fmt.Println("写入失败：", err)
        return
    }
    saved, err := os.ReadFile("task.json")
    if err != nil {
        fmt.Println("读取失败：", err)
        return
    }
    var loaded Task
    if err := json.Unmarshal(saved, &loaded); err != nil {
        fmt.Println("解码失败：", err)
        return
    }
    fmt.Println(loaded.ID, loaded.Title, loaded.Done)
}
```

预期输出 `t1 学习文件 false`。Marshal 返回 `[]byte`；ReadFile 也返回字节切片。Unmarshal 接收 `&loaded`，因为它需要把解码结果写进这个对象。

WriteFile 在文件已存在时会覆盖内容。0600 是类 Unix 系统中文件权限的八进制写法，表示所有者读写；其他系统权限行为应查对应说明。这个参数不等于数据加密。

## 路径与运行位置

`"task.json"` 是相对路径，以程序当前工作目录为起点，不是自动放在 main.go 旁边。从 go-course 根目录 `go run ./a10`，文件会出现在根目录；切到 a10 再 `go run .`，位置就会变化。

大文件不适合总是一次读进内存。流式读取按批次处理数据，需要理解读取多少字节和资源关闭。B02 讲网络字节流，C04 再用 io.Reader 和 io.ReadFull 分析边界。

## 打开的资源需要结束使用

os.ReadFile 与 WriteFile 封装了打开、操作和关闭；直接 os.Open 得到文件对象时，要自己安排关闭。

```go
// 片段：放在一个返回 error 的函数里，文件仅用于读取。
f, err := os.Open("task.json")
if err != nil {
    return err
}
defer f.Close()
// 在这里读取 f。
```

对写入场景，写入、同步和关闭阶段也可能报告错误，不能总忽略 Close 的结果。当前入门例子没有实现事务与断电恢复，C07 会说明普通文件写入与可靠持久性的差别。

## 时间点、持续时间与单位

时间点描述“什么时候”，持续时间描述“多长”。Go 的 time.Time 表示时间点，time.Duration 表示时间长度。

```go
// 片段：main 中使用，并在 import 增加 time。
now := time.Now()
wait := 2 * time.Second
fmt.Println(now.Format(time.RFC3339))
fmt.Println(wait)
```

time.Second 是带明确单位的持续时间。后续超时使用 `500 * time.Millisecond`，不能把没有说明单位的数字当成统一含义。

时间输出会随实际时刻变化；示例不规定固定日期。处理业务期限时，还要定义时区、比较位置和时钟来源，C12 会继续讨论。

## 练习与反馈

先预测更换 Title 后的 JSON；再只保留读取部分，将 task.json 改成缺少 title 或使用错误字段类型，分别观察解码与业务校验的差别。不要在每次读取前又覆盖自己准备的错误文件。

<details>
<summary>参考解释</summary>

缺字段可能让对应字段保持零值，不一定是解码错误。类型不符合结构体要求则可能报错。即使能读出 Task，也仍需检查 ID 和 Title 是否满足业务规则。

</details>

完成 [A 篇验收](./README.md)，进入 [B01：程序、进程与状态](../00_system_model.md)。
