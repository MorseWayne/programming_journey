# 01.11 审阅记录：反射与底层边界

## 来源与生成状态

- 2026-09-25 宿主机请求因误用容器专用 `host.docker.internal` 地址而收到 HTTP 502，正式页先经人工编写审阅。
- 2026-09-28 在 DeepTutor 容器内用同一请求生成 `bk_d7df23d474` / `pg_d055025018`；八块均为 `ready`，无失败块。实际请求逐字节归档在 `generation_request.json`，原稿在 `original.md`。本目录保留 `manual_01_11` 名称以记录正式页先经人工审阅。

## 单章覆盖与教学审阅

- 从已学接口的静态类型/动态类型进入 `reflect.TypeOf/ValueOf`，区分定义类型与 Kind，并补 `TypeOf(nil)`、无效 `ValueOf(nil)` 和 typed nil 的前置检查。
- 完整纸上 Go 示例用 `ValueOf(m)` 与 `ValueOf(&m).Elem()` 对照，依次检查 `IsValid/Kind/CanSet` 后才 `SetString` 导出字段；强调反射设置成功不是 IM 正文/权限验证。
- 结构标签作为字符串元数据解释 `Tag.Get/Lookup`、`json:"body,omitempty"` 和导出规则；两个同名 `Message` 定义标为独立片段，不混作一个程序。
- 将 `encoding/json` 的语法错误、未知字段、缺失/零值与当前原始 HTTP 体 4096 B、正文 6 UTF-8 B、重复 ID 409、成员授权和确认点分层。
- 用 `unsafe.Sizeof` 对比内存布局、JSON 序列化字节和 `len([]byte("公告"))=6`，不报架构相关固定数字，也不把 unsafe 当性能默认方案。
- 8 节按 Type/Value、可设置性、标签/JSON、unsafe 递进；22 题按术语、推演、工程边界分层。第一卷十二章独立正文随本章齐备，01.12 基础版仍可先学。

## 原稿对账与修订

- 原稿多处说无效 `reflect.Value` 调用 `Kind()` 会 panic；[Go 官方 reflect 文档](https://pkg.go.dev/reflect)明确无效零 `Value` 的 `Kind()` 返回 `reflect.Invalid`，`Type()`、`IsNil()` 等才会 panic。正式页补明这个区别，同时仍以 `IsValid()` 作为通用动态检查入口。
- 原稿对 typed nil、指针 `Elem`、`CanSet`、导出字段、`Tag.Get/Lookup` 与 `unsafe.Sizeof` 的主要机制基本正确；正式页保留完整独立代码与分节片段的界线，避免原稿大量重复小标题和零散代码拼接妨碍初学者编译理解。
- 原稿用自定义 `limit:"6"` 标签说明业务校验，但未讲清当前 S2 原始 HTTP 体 **4096 B** 与解出正文 **6 UTF-8 B** 是两道独立检查，也没有完整交代同 ID 重复 **409** 和成员权限。正式页按语法、存在/类型、正文/ID、授权、确认点分层。
- 原稿正确指出 `unsafe.Sizeof` 的结构体布局与 JSON/正文编码字节不同；正式页继续不报架构相关固定大小，也不把 `unsafe` 当作默认优化路径。

## 权威核对与边界

- 以 Go 官方反射法则、`reflect`、`encoding/json` 和 `unsafe` 标准库文档核对；DeepTutor 仅生成教材原稿，没有运行课程里的 Go 示例、IM 服务或站点。完整示例与片段分别标注，编译/运行证据由学习者在自身环境记录。
- 反射额外运行期检查与分配的量级要实测，正文没有未证实的性能倍数结论。
- 接下来回到算法卷 02.09–02.12，再补网络卷 04.08–04.12。
