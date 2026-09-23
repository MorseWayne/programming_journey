---
title: D01 Python 工程基础：从数据、异常到资源边界
icon: /assets/icons/article.svg
order: 13
date: 2026-09-22
---

[D01–D04 单元导读](./stages/06_ai.md) · 前置：[契约](./01_contracts.md)、[所有权](./02_ownership.md)、[事务](./06_transactions.md)

## 先修回顾

本课会直接使用下列知识；不熟悉时先阅读链接中的完整讲解。

| 已学内容 | 本课用它做什么 |
|---|---|
| [A04 函数](./beginner/04_functions.md) | 区分参数、返回与效果 |
| [A05 集合](./beginner/05_collections.md) | 理解列表与映射 |
| [A07 错误与 defer](./beginner/07_interfaces_errors.md) | 比较异常与资源清理 |
| [C06 事务](./06_transactions.md) | 理解提交边界 |

## 需求场景：把资料变成一个可测试的工具

团队已有 Go 服务，希望用 Python 整理文档、检索材料并创建工单。首先需要稳定读取数据、验证输入、传播错误和保存状态，之后才接模型。

本课围绕配套离线工具建立语言基础。完成后应能阅读函数、容器和 dataclass，区分数据转换与外部效果，并正确使用异常和资源上下文。

## 基础语法：名字绑定到对象

Python 用缩进表示代码块，用 `def` 定义函数。变量名绑定对象，赋值通常不会复制整个对象。列表与字典可变，多个名字可以访问同一个对象。

```python
request = {"summary": "inspect latency"}
other = request
other["summary"] = "inspect retry"
print(request["summary"])  # inspect retry
```

这与C02 课的别名分析相通。`dict.copy()` 复制外层映射，嵌套列表或字典仍可能共享。参数传递也应明确函数是否允许修改传入对象。

### 常用结构与操作

| 类型 | 表达什么 | 本课程中的用途 |
|---|---|---|
| list | 有序可变序列 | 排序后的候选文档 |
| tuple | 不可变序列结构 | 固定文档集合；元素仍可能是可变对象 |
| dict | 键值映射 | JSON 请求与结果 |
| set | 不重复元素集合 | 词项去重与交集 |
| str | 不可变文本 | 查询、文档与身份 |

`for item in items` 遍历元素；列表推导式用一行表达遍历、过滤与转换。先把输入和输出写清楚，再判断压缩表达是否容易理解。

## 从合法 JSON 到合法业务输入

`json.loads` 把 JSON 文本解析为 Python 对象，成功解析并不意味着字段齐全或语义正确。`request["summary"]` 缺失时触发 KeyError，`request.get("summary")` 缺失时返回 None，二者要求调用方不同处理。

```python
def validate_summary(payload):
    if not isinstance(payload, dict):
        raise ValueError("payload must be an object")
    summary = payload.get("summary")
    if not isinstance(summary, str) or not summary.strip():
        raise ValueError("summary must be a non-empty string")
    return summary.strip()

print(validate_summary({"summary": " inspect latency "}))
```

这段可以保存为自己的练习文件运行。先预测缺失、空字符串、只有空格、数字四类输入的结果，再加入测试。

Python 类型标注有助于阅读与静态检查，不会自动验证外部 JSON。Python 的 bool 还是 int 的子类；如果数值输入不能接受 true/false，需要明确检查规则。跨语言时也要考虑 Python 整数与数据库固定整数范围的差别。

## 异常与错误传播

Go 常用显式 error 返回，Python 常用异常展开调用栈。两者都需要在能够处理错误的边界作决定。

```python
try:
    summary = validate_summary({"summary": ""})
except ValueError as exc:
    print("invalid:", exc)
```

捕获后应该修正、转换成可理解的失败，或记录必要上下文后继续传播。捕获所有异常并返回成功，会让调用者无法区分真实完成与依赖失败。

参数错误通常需要改输入；权限错误需要合法授权；依赖临时失败可能有界重试；结果未知则需要查询或稳定幂等身份。异常类型本身不能替代业务语义分析。

## class、对象与方法

Python 的 class 可以定义对象类型。self 代表当前对象，`__init__` 在创建对象时进行初始化。先用一个完整小例子对应 A06 的结构体与方法：

```python
class Task:
    def __init__(self, title):
        self.title = title
        self.done = False

    def finish(self):
        self.done = True

task = Task("学习 Python")
task.finish()
print(task.title, task.done)
```

保存为自己的 practice.py，学习时用 `python3 practice.py` 运行，预期输出标题与 True。Python 方法通过 self 访问对象字段；这里没有 Go 的字段静态声明形式。

`@...` 写在定义前通常表示装饰器，用来对定义应用额外处理。接下来用的 dataclass 提供常见数据类方法，先理解它负责什么，再深入实现。

## 数据模型：纯函数与外部效果

纯函数依据输入计算结果，便于构造小测试；文件、网络、数据库写入会改变或依赖外部环境，需要单独管理失败与生命周期。

`agent_lab.py` 中的 `Document` 用 `@dataclass(frozen=True)` 定义。dataclass 自动生成常见数据方法，frozen 限制字段重新绑定；它不会递归冻结任意嵌套对象。当前字段为字符串和整数，所以较容易把文档当作稳定输入。

检索函数只接受文档和查询，返回候选；Workflow 负责持久状态。这样的拆分允许先验证排序，再验证副作用恢复，不必一开始启动所有依赖。

## 资源基础：with、事务与关闭

`with` 使用上下文管理协议，在进入和离开代码块时执行约定动作。不同对象的上下文行为不同，不能从相同语法推断它们都负责关闭资源。

```python
from contextlib import closing
import sqlite3

with closing(sqlite3.connect("/tmp/arena-python-practice.db")) as db:
    with db:
        db.execute("CREATE TABLE IF NOT EXISTS notes(id TEXT PRIMARY KEY, text TEXT)")
        db.execute("INSERT OR IGNORE INTO notes VALUES (?, ?)", ("n1", "synthetic note"))
```

外层 closing 负责关闭连接；内层连接上下文按其事务模式处理提交或回滚。SQL 使用参数占位符绑定数据，避免把输入拼进 SQL 语句。SQLite 不同版本和连接模式对事务控制有细节差异，本课程 Workflow 显式开始所需事务，核对 [sqlite3 文档](https://docs.python.org/3/library/sqlite3.html)时应关注实际 Python 版本。

同样，“文件写入成功”“事务提交成功”和“连接已关闭”也是不同的事件，要分别理解。

## 实验：阅读并运行确定性工具

```bash
cd labs/platform_path
python3 -m unittest discover -s ai -v
python3 ai/agent_lab.py retrieve --tenant team-a --query "timeout retry"
```

预期测试通过，检索来源包含 retry-v1，没有网络请求或模型调用。先阅读 Document、tokens、retrieve、answer，再读 Workflow；流程恢复会在D03 课展开。

独立练习：为 validate_summary 补齐正常、缺失、空白、错误类型四类测试。当前 Workflow 只检查 summary 是否为字符串，未严格拒绝空白字符串；把本课规则接进去是一个明确的改进练习。

<details>
<summary>工程深化：环境与异步</summary>

学习标准库实验时不需要第三方包。后续接入 SDK 时，创建独立环境并固定依赖版本，记录模型、提示与数据版本。async/await 可以组织异步等待，但不会自动使 CPU 密集计算变快，也不自动保证任务可取消和外部效果可撤销。

先沿用C03 课的方法，列出输入量、并发上限、超时、资源释放和退出路径，再选择异步实现。

</details>

本课验收：输入验证测试、异常分类表、连接与事务生命周期解释。下一课：[检索、证据与生成](./14_rag.md)。
