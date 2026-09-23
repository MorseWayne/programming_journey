---
title: B03 HTTP 与 JSON：连接客户端和处理函数
icon: /assets/icons/article.svg
order: 3
date: 2026-09-22
---

先修：[B02 网络与 HTTP](./02_network.md)、[A04 函数值](../beginner/04_functions.md)、[A07 接口与错误](../beginner/07_interfaces_errors.md)、[A10 JSON](../beginner/10_files_json.md)。

## 小需求：提供一个只读任务列表

本课把网络概念接到实际代码。先返回固定的虚构任务，学习请求怎样进入函数、响应怎样生成。共享状态的并发修改等到 B06 以后再加入。

## 先解释代码中的角色

`http.Request` 保存方法、URL、头部与正文等请求信息。`http.ResponseWriter` 是接口，提供设置头部、状态码和写入正文的能力。

处理函数形如 `func(w http.ResponseWriter, r *http.Request)`：r 是请求指针，w 用于向调用者返回结果。调用者通过 HTTP 发送数据，不是直接调用这个 Go 函数；标准库完成中间的协议处理。

`ServeMux` 把路径匹配到处理函数，类似一个路由表。`http.Server` 负责在指定地址监听，并使用指定的处理器接收请求。

## 完整服务端示例

在个人 go-course 下创建 b03server/main.go：

```go
package main

import (
    "encoding/json"
    "log"
    "net/http"
    "time"
)

type Task struct {
    ID    string `json:"id"`
    Title string `json:"title"`
}

func tasks(w http.ResponseWriter, r *http.Request) {
    if r.Method != http.MethodGet {
        w.Header().Set("Allow", "GET")
        http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
        return
    }
    result := []Task{{ID: "t1", Title: "学习 HTTP"}}
    w.Header().Set("Content-Type", "application/json")
    if err := json.NewEncoder(w).Encode(result); err != nil {
        log.Printf("write response: %v", err)
    }
}

func main() {
    mux := http.NewServeMux()
    mux.HandleFunc("/tasks", tasks)
    server := &http.Server{
        Addr:              "127.0.0.1:8080",
        Handler:           mux,
        ReadHeaderTimeout: 3 * time.Second,
    }
    log.Fatal(server.ListenAndServe())
}
```

学习时从 go-course 根目录执行 `go run ./b03server`。程序等待请求，不会像前面的计算例子一样立即结束；结束练习时在此终端按 Ctrl-C。

log 包输出运行信息。ListenAndServe 返回错误时，log.Fatal 显示原因并结束程序；本课先不处理优雅退出，C11 会替换成更完整的生命周期设计。

## 沿一次请求读代码

请求到 /tasks 后，先检查方法。GET 请求创建当前调用自己的结果切片，设置正文类型，再编码为 JSON 写回。

没有显式设置成功状态码时，首次正常写入通常会发送 200。错误分支在写正文前设置 405；响应一旦开始发送，就不能假定可以随时改成另一状态。

Encoder 可以把数据写到满足写入接口的对象，ResponseWriter 提供这种能力。这连接了 A07 的接口概念：编码器不必知道最终数据是发到网络还是写进文件。

标准库可能并发处理多个请求。本例每次创建自己的结果，没有修改共享 map；这不代表所有 HTTP 代码都天然并发安全。

## 用浏览器或 curl 查看响应

保持服务端运行，在浏览器访问 `http://127.0.0.1:8080/tasks`。或者在另一个终端使用 curl 这个命令行 HTTP 客户端：

```bash
curl -i http://127.0.0.1:8080/tasks
```

-i 显示响应头。预期看到成功状态与任务 JSON；具体 Date 等头部取决于运行时刻。

```bash
curl -i -X POST http://127.0.0.1:8080/tasks
```

-X 指定方法，预期得到 405。服务端明确只提供读取，所以更换方法不会自动创建任务。

## 完整 Go 客户端示例

另存为 b03client/main.go：

```go
package main

import (
    "encoding/json"
    "fmt"
    "net/http"
    "time"
)

type Task struct {
    ID    string `json:"id"`
    Title string `json:"title"`
}

func main() {
    client := &http.Client{Timeout: 3 * time.Second}
    response, err := client.Get("http://127.0.0.1:8080/tasks")
    if err != nil {
        fmt.Println("request failed:", err)
        return
    }
    defer response.Body.Close()
    if response.StatusCode != http.StatusOK {
        fmt.Println("unexpected status:", response.StatusCode)
        return
    }
    var tasks []Task
    if err := json.NewDecoder(response.Body).Decode(&tasks); err != nil {
        fmt.Println("invalid response:", err)
        return
    }
    fmt.Println(tasks)
}
```

服务端仍在运行时执行 `go run ./b03client`，预期读到一条任务。客户端先区分请求错误与 HTTP 状态，再解码正文，最后关闭响应体资源。

## 提交数据时还需要什么

后续 POST 接口会读取 r.Body 中的 JSON，但至少应区分：请求能否解析、字段是否有效、调用者是谁、是否有资格执行、效果是否已经保存。

正文大小也需要上限。直接把任意大请求全部读进内存可能消耗过多资源；C12 的整合示例会使用 MaxBytesReader 等限制，并说明其边界。

本课只返回固定任务，不提前声称实现了身份、数据库、重试或发布保证。

## 独立练习

增加第二条固定任务；访问不存在路径，解释 404 与进程不运行时的差别；停止服务端后运行客户端，记录与 HTTP 500 不同的失败路径。

<details>
<summary>反馈</summary>

没有服务监听时，可能在连接阶段就失败，根本没有 HTTP 响应。500 则是已收到服务端返回的状态。客户端必须分别处理这两类结果。

</details>

下一课：[B04 本地环境、配置与容器](./04_local_tools.md)。
