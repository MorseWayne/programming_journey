---
title: 13 用已有后端经验进入 Python 工程
icon: /assets/icons/article.svg
order: 13
date: 2026-09-22
---

## 本课问题与前置

已经会 Go，进入 AI 工程还需要把 Python 从头学一遍吗？本课围绕读取数据、调用纯函数、保存状态与测试，建立足够的语言基础。

前置：第 1、5–6 课。建议用时 4 小时。目标：读懂配套 Python 实验，正确处理异常、文件、SQL 参数和资源释放。

## 先完成一个最小程序

Python 用缩进表示代码块。字典保存键值，列表保存有序元素，函数用 `def` 定义。下面是完整程序，可保存为个人练习文件运行：

```python
def validate(request):
    if request["amount"] <= 0:
        raise ValueError("amount must be positive")
    return request["amount"]

request = {"user": "u1", "amount": 10}
try:
    amount = validate(request)
    print(amount)
except ValueError as exc:
    print("invalid:", exc)
```

预期输出 10。把 amount 改成 0，观察异常处理路径。键缺失会出现不同异常，说明调用边界还需要检查输入结构。

Python 的类型标注有助于阅读和静态检查，不会自动验证外部 JSON。字典和列表赋值也可能共享对象，沿用第 2 课的所有权分析。

## 把数据与效果分开

纯函数只根据输入计算结果，便于测试；文件、网络、数据库写入是外部效果，应集中在明确边界。

实验使用 `@dataclass(frozen=True)` 定义 Document。dataclass 自动生成常见数据方法，frozen 限制字段重新赋值，但不意味着字段中任意嵌套对象都不可变。当前字段是字符串和整数。

`Path` 表示文件路径，`json.loads` 将 JSON 文本转成对象，`json.dumps` 做相反转换。读取配置后还要检查内容，而不是把“成功解析”当作语义合法。

## 数据库与资源生命周期

阅读 `ai/agent_lab.py` 的 Workflow：SQL 使用 `?` 占位符绑定数据，避免用字符串拼接构造用户输入。事务边界由 `with db` 管理，连接则由 `contextlib.closing` 关闭。

SQLite 连接的事务上下文不会自动等同于关闭连接。把连接关闭和提交/回滚分别理解，才能避免资源泄漏。核对 [Python sqlite3 文档](https://docs.python.org/3/library/sqlite3.html)中的上下文管理规则。

## 实验与独立练习

```bash
cd labs/platform_path
python3 -m unittest discover -s ai -v
python3 ai/agent_lab.py retrieve --tenant game-a --query "timeout retry"
```

预期测试通过，检索输出包含 retry-v1。当前无网络请求，也没有模型调用。

练习 A：写一个函数，读取 JSON 请求，验证 summary 必须为非空字符串，分别测试缺失、空格和错误类型。

练习 B：给外部效果设计异常分类：参数错误、权限不足、依赖暂时失败、结果未知。哪些适合重试？

<details>
<summary>提示与参考解释</summary>

捕获你能够处理的异常，保留上下文并让意外错误显现。对所有异常返回“成功”会让调用者失去判断依据。参数与权限错误通常需要修改输入或授权；结果未知的重试需要幂等身份，仍沿用第 8 课。

</details>

迁移题：Go 的 defer、error 与 Python 的 with、异常各承担哪些职责？不要逐词翻译，重点说明资源释放与失败传播路径。

达标证据：两个输入验证测试、一个异常分类表。下一课：[检索与证据](./14_rag.md)。
