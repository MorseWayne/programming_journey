# 14.01 Python 与数据工作：Go 学习者怎样整理虚构 IM 样本

> DeepTutor 八节初稿经技术与教学审阅后的静态课程。所有 `u-a/u-b`、`c-a`、`m-a`、文档与问题均为**虚构样本**；没有读取真实会话、运行 Python/Go/IM、调用模型、数据库或站点。当前 S2 `/v1` 正文非空且最多 **6 UTF-8 B**、原始 HTTP 请求正文最多 **4096 B**、同 ID 重复 **409**、非成员隐藏 **404**、成功 `200 accepted_in_memory` 只表示本进程内存受理。未来 S3 `/v2` 的 `stored_in_teaching_db` 尚是提议且仍为 6 B，R9 6→9 B 待审。本章的 JSONL 不是当前 S2 导出的权威历史。[09.02 当前合同](../../../src/docs/platform_engineering/curriculum/09_backend_security/02_http_api_contract.md)

## 一、为何已有 Go 主线，还要从 Python 和数据重新起步

第十四卷是 AI 应用的**可选支线**：Go 仍承担前面学过的服务、权限、并发和运行主线；Python 在本卷用于整理虚构资料、固定查询集、做模型与检索实验。换一种语言不会让 IM 业务合同自动变化。我们先处理**数据从哪来、是否可用、怎样复现**，再进向量、模型、检索和评测；不能先把整段聊天塞给模型，等出现错误回答再追溯语料。[本卷学习顺序](../../../src/docs/platform_engineering/curriculum/14_ai/README.md) · [Python 官方教程](https://docs.python.org/3/tutorial/index.html)

本章纸上小任务：给两条**人工编写**的 IM 消息与两份虚构资料，生成一份可审的样本清单，供 14.09 建立固定查询与基线。下面 `m-a` 只是样本里的 `message_id`；`r-1` 可以是某次 HTTP 请求 ID；JSONL 文件第 1 行只是**文件位置**。三者都不是“第 1 条权威 DB 消息”，也不能因名字相近互相替换。[13.02 身份账本](../../../src/docs/platform_engineering/curriculum/13_architecture/02_domain_state_modeling.md)

| 先修的 Go 概念 | Python 本章对应入口 | 仍要守的业务边界 |
|---|---|---|
| 变量、字符串/字节 | 名字绑定对象、`str`/`bytes`、`encode` | 6 B 按 UTF-8 编码字节算 |
| 切片与 map | 可变 `list`、`dict`，索引/键 | 不把原始样本无意修改成“清洗结果” |
| 函数与 `error` | `def`、返回值、`raise`/`try`/`except` | 拒绝数据要有原因，不能吞错 |
| 文件与 JSON | `pathlib.Path`、逐行 `json.loads` | JSONL 每行独立校验，不能替历史授权 |
| 可复现构建 | Python 版本/环境、输入 SHA256、清洗规则 | 哈希是版本线索，不是权限或保密证明 |

## 二、名字指向对象：列表与字典的别名会改变原始记录

在 Go 中学过“变量有类型、slice/map 可能共享底层状态”。Python 里也要关心**对象是否可变及别名**：`str` 值不可原地改写，`list` 和 `dict` 可以改；两个名字若指向同一个字典，通过其中一个修改会影响另一个看到的内容。写 `records_copy = records[:]` 只复制外层列表，里面的字典仍可能共享，不能把它当深拷贝或原始数据保护。[Python：Data Structures](https://docs.python.org/3/tutorial/datastructures.html) · [Python：Classes 与 aliasing](https://docs.python.org/3/tutorial/classes.html)

```python
raw = {"message_id": "m-a", "conversation_id": "c-a", "body": "你好"}
alias = raw
alias["body"] = "收到"  # raw 也会看到被改后的字典值
```

这段示意提醒清洗流程应保留原始文件，产生**新的**规范化记录和拒绝报告，而非在读入对象上随手改写原始证据。`==` 通常问值是否相等，`is` 问是否同一个对象；判断是否为 `None` 常写 `value is None`，不能用 `is` 比较两个消息 ID 的文字内容。`type hint`（如 `def f(body: str) -> int`）给读者和检查工具信息，**Python 运行时本身不会自动强制验证注解**；外部 JSON 的字段仍须显式检查。[Python：typing 文档](https://docs.python.org/3/library/typing.html)

| 纸上值 | Python 的类型/行为 | 在 IM 数据里的陷阱 |
|---|---|---|
| `"你好"` | `str`，`len` 为 2 个代码点 | UTF-8 编码是 6 B，不能用字符数验 `/v1` |
| `b"abc"` | `bytes`，长度按字节 | JSON 解出的是 `str`，要明确编码转换点 |
| `[]` / `{}` | 可变列表/字典 | 多处共享同一对象时清洗会污染原始记录 |
| `None` | 表示无值的单例对象 | 缺字段、`null` 与空字符串的业务意义要另定 |

## 三、函数、类型提示和异常：解析错误不能变成静默丢行

Python 用 `def` 声明函数，缩进是语法结构，函数可用 `return` 交结果；未显式返回时结果为 `None`。Go 常把 `error` 作为返回值显式检查，Python 常用异常把失败交给调用者：`json.loads` 可抛 `JSONDecodeError`，文件访问可抛 `OSError`，自己验字段可抛 `ValueError`。只在知道怎样处理时捕获特定异常，不用裸 `except:` 把未知程序错误也算成“脏数据”。[Python：Errors and Exceptions](https://docs.python.org/3/tutorial/errors.html) · [Python：json](https://docs.python.org/3/library/json.html)

以下是**未运行、供阅读的 Python 3.11+ 示意**。输入来自虚构 JSONL，`dict[str, str]` 注解帮助阅读；真正保证值类型的是 `isinstance` 与长度校验：

```python
def validate_message(row: object) -> dict[str, str]:
    if not isinstance(row, dict):
        raise ValueError("expected object")
    fields: dict[str, str] = {}
    for key in ("message_id", "conversation_id", "sender_id", "body"):
        value = row.get(key)
        if not isinstance(value, str) or not value:
            raise ValueError(f"missing or invalid {key}")
        fields[key] = value
    if len(fields["body"].encode("utf-8")) > 6:
        raise ValueError("body exceeds current v1 limit")
    return fields
```

该函数**仅校验样本字段**，不执行线上成员鉴权、原始 HTTP 请求体上限或重复请求响应。若 JSON 中 `body` 为 `null`、数字、空串或 7 B，必须在样本层明确拒绝；若另有真实授权数据，也不能仅凭 `sender_id` 字段自称有权。错误消息只需字段名/行号/类别，避免把可能含私密内容的正文直接打印到日志。[09.07 对象权限](../../../src/docs/platform_engineering/curriculum/09_backend_security/07_authentication_authorization.md)

## 四、JSONL 是“一行一个 JSON 值”，UTF-8 要看编码后的字节

JSONL 的约定是**每行一份 JSON 值**；本章再要求每行必须是含指定字段的对象。标准库 `json.loads` 一次解析一行，不能把整个多行文件直接交给 `json.loads` 并期望它自动返回列表。`Path.open(encoding="utf-8")` 明确文本编码，`with` 负责在读取结束或异常时关闭文件。[Python：json 模块](https://docs.python.org/3/library/json.html) · [pathlib：读写文件](https://docs.python.org/3/library/pathlib.html)

```json
{"message_id":"m-a","conversation_id":"c-a","sender_id":"u-a","body":"你好"}
{"message_id":"m-b","conversation_id":"c-a","sender_id":"u-b","body":"收到"}
```

两行都是**人为构造的示例**，不能据此声称 S2 真保存了 `m-a/m-b`。对于当前 `/v1` 消息正文，“你好”有 **2 个汉字**、UTF-8 编码占 **6 B**；`len("你好")` 与 `len("你好".encode("utf-8"))` 回答不同问题。若正文为 7 B，应按当前限制拒绝。HTTP **原始请求正文最多 4096 B** 是接入层对完整原始请求正文的限制；仅看导出的 JSONL `body` 无法回溯当初 HTTP 包装/原始字节是否在限额内。[09.02 字节合同](../../../src/docs/platform_engineering/curriculum/09_backend_security/02_http_api_contract.md)

```python
import json
from pathlib import Path

rejections: list[tuple[int, str]] = []
accepted: list[dict[str, str]] = []
with Path("messages.jsonl").open("r", encoding="utf-8") as source:
    for line_no, line in enumerate(source, start=1):
        try:
            accepted.append(validate_message(json.loads(line)))
        except (json.JSONDecodeError, ValueError) as exc:
            rejections.append((line_no, type(exc).__name__))
```

这仍只是小文件示意：文件不存在或读失败会抛 `OSError`，上层要报告路径和失败类型；大文件不应无界把所有接受行放进内存。即便两行有相同 `message_id`，也要在数据审查中保留原始行并标冲突，不可直接推断“线上发生了同 ID 重复请求并返回 409”：请求日志、导出重复、派生事件重放都可能产生重复行，证据来源不同。[Python：异常处理](https://docs.python.org/3/tutorial/errors.html)

## 五、校验不等于授权：IM 语料还要写 owner、范围与版本

让 JSON “能解析”只是第一门。数据校验还要分**结构、业务、来源、访问范围**：字段是否缺失/错型，正文是否空或超 6 UTF-8 B，稳定消息 ID 是否冲突，会话/发送者是否属于**本题虚构命名空间**，原始文件从何而来。对于未来聊天资料助手，资料记录还应有 `document_id`、`owner_id`、`access_scope`、版本/更新时间和可引用片段；检索前须依据用户身份/会话范围过滤。**不能把所有私聊内容默认当公开语料**。[09.07 应用授权](../../../src/docs/platform_engineering/curriculum/09_backend_security/07_authentication_authorization.md) · [本卷 IM 主线](../../../src/docs/platform_engineering/curriculum/14_ai/README.md)

| 问题行 | 数据层处理 | 不可据此推断 |
|---|---|---|
| JSON 语法坏或不是对象 | 记录行号/拒绝类别，保留原始输入 | 线上服务一定返回某 HTTP 状态 |
| `body` 空、错型或 7 B | 若标注为当前 `/v1` 消息样本则拒绝 | R9 已批准、可静默截断为 6 B |
| 两行同 `message_id` | 标冲突并查来源/版本，不覆盖原始 | 一定是线上重复请求 409 |
| `sender_id` 为 `u-a` | 可当虚构字段值 | `u-a` 已获 `c-a` 成员授权 |
| 文档缺 `access_scope` | 不进公开可检索语料，待来源方决定 | 只要文本无秘密就人人可看 |

拒绝行的统计要分原因，不能把它们悄悄丢掉再给“100% 清洗成功”的分母。被接受的规范化记录也不是权威消息历史：当前 S2 只给进程内存受理语义，本章样本更是手工构造。以后若使用真实材料，应先取得允许使用的来源与权限，再设计去标识和生命周期；此处不引入任何真实公司或用户数据。[13.01 证据来源](../../../src/docs/platform_engineering/curriculum/13_architecture/01_problem_stakeholders.md)

## 六、环境与 manifest 让下一位学习者复算结果

Python 环境会影响代码和依赖如何工作。官方 `venv` 可为一个项目创建隔离环境，例如 `python -m venv .venv`；环境目录通常不进入 Git，换机器应从**记录的 Python 版本与依赖清单**重新创建，而非复制整个 `.venv`。本章代码示意只用标准库，也应在将来真实练习时记录解释器版本，避免“我这里可以”却不知道差在哪。[Python：venv](https://docs.python.org/3/library/venv.html)

可复现数据清单（manifest）至少记：原始文件标识及 SHA256、数据许可/访问范围、schema 版本、清洗程序/规则版本、Python 版本、参数、接受/拒绝及各原因数、输出排序规则和输出文件 SHA256；若后续用随机抽样，还要记录种子及划分规则。对小虚构文件，`hashlib.sha256(Path(...).read_bytes()).hexdigest()` 能作为**内容变化标识**；大文件改流式计算。SHA256 **不证明数据正确、脱敏充分或有权使用**。[Python：hashlib](https://docs.python.org/3/library/hashlib.html) · [14.09 评测设计入口](../../../src/docs/platform_engineering/curriculum/14_ai/README.md)

| 复现输入 | 本章纸上示意 | 漏掉会怎样 |
|---|---|---|
| 代码/解释器 | 清洗规则版本、Python 版本 | 异常/序列化行为难定位 |
| 数据/权限 | 原始 SHA256、owner/scope、schema | 混入过期或无权资料不自知 |
| 规则与输出 | UTF-8 验证、拒绝分类、按稳定 ID 排序 | 两次结果差异无法归因 |
| 后续评测 | 固定问题 ID、证据版本、划分/随机种子 | 方案对比受样本变化或泄漏干扰 |

输出顺序应显式规定，不依赖文件系统遍历顺序或一次偶然的输入行序。原始样本、规范化样本和拒绝报告分开保存；拒绝报告只留必要元数据，不回显可能敏感的正文。把“记录了 hash”当作复现链的一环，不是整个链的替代品。[Python：pathlib](https://docs.python.org/3/library/pathlib.html)

## 七、纸上最小管线先有固定问题，再进入模型与检索

本章把虚构 `messages.jsonl` 与虚构资料 `docs.jsonl` 分开：消息样本用于练 UTF-8 和 ID/错误校验，资料样本用于未来助手的证据与权限。纸上管线是“**原始输入 → 逐行解析 → 字段/字节/访问范围校验 → 规范化与拒绝报告 → manifest → 固定问题草案**”。此时**不调用模型**，也不把“问题草案”直接当有金标准答案的评测集。[本卷实际顺序](../../../src/docs/platform_engineering/curriculum/14_ai/README.md)

| 固定问题草案 | 可能需的虚构资料 | 首先要核对 |
|---|---|---|
| `q-01`：`c-a` 中 `m-a` 的正文占多少 UTF-8 B？ | 人工样本 `m-a` | 与 6 B 当前合同、消息 ID 和来源版本对应 |
| `q-02`：B 是否能看某文档？ | 有 owner/scope 的虚构资料 | `u-b` 的授权上下文和资料可见规则，缺规则则不得猜答案 |

14.02 再补向量、概率和训练/验证直觉；14.03 再讲 token、embedding 与生成；在首次比较方案前，14.09 会正式讨论代表性、标注、数据泄漏和关键词基线。一个“模型回答正确”不能替代当前 `/v1` 的 409/404 业务合同，AI 的资料权限也不能凭数据处理脚本中的字段自我证明。[学习路线 AI 顺序](../../../src/docs/platform_engineering/curriculum/learning_path.md)

## 八、22 道分层练习：审一份虚构 IM JSONL

先做语言与字节基础，再推数据拒绝/复现，最后把样本转成未来可评测问题。答案均基于静态示意。

### 基础 1–8：Python 对象与异常

<details><summary>1. Python 的 `list` 与 `dict` 可变吗？</summary>

可变；多个名字指向同一对象时一处修改会影响其它别名看到的内容。</details>

<details><summary>2. `a == b` 与 `a is b` 问的是同一件事吗？</summary>

不是。前者比较值，后者比较对象身份；消息 ID 文字相等一般用 `==`。</details>

<details><summary>3. `body: str` 注解会自动拒绝 JSON 数字吗？</summary>

不会。Python 运行时不自动强制注解，要显式验证字段类型。</details>

<details><summary>4. `json.loads` 解析坏行可能抛什么？</summary>

`json.JSONDecodeError`；报告行号和类别，不能裸 `except` 吞掉。</details>

<details><summary>5. `Path.open(..., encoding="utf-8")` 的 `with` 做什么？</summary>

按指定编码读文本，并在作用域结束/异常时关闭文件。</details>

<details><summary>6. 一个 JSONL 文件应直接整体交给一次 `json.loads` 吗？</summary>

通常不应；本章约定每行一份 JSON 值，逐行解析和定位错误。</details>

<details><summary>7. `.venv` 应当作为可复制制品提交进 Git 吗？</summary>

不应。记录版本与依赖，在目标环境重建。</details>

<details><summary>8. SHA256 能证明数据已获聊天成员授权吗？</summary>

不能。它只帮助标识内容版本，不证明来源、权限或脱敏。</details>

### 推演 9–16：字节、拒绝与身份

<details><summary>9. `len("你好")` 与 UTF-8 编码后长度各是多少？</summary>

分别为 2 个字符和 6 B；当前 `/v1` 限制按 UTF-8 字节。</details>

<details><summary>10. 若纸上 `/v1` 消息正文 7 B，应怎样？</summary>

按当前 6 B 合同拒绝，不截断；R9 尚待审。</details>

<details><summary>11. JSONL `body` 为 `null`，有类型提示就够了吗？</summary>

不够。显式检查其为非空 `str`，否则记拒绝原因。</details>

<details><summary>12. 导出的 `body` 为 6 B，能证明原始 HTTP 请求体≤4096 B 吗？</summary>

不能。body 字段不含当初完整原始 HTTP 请求正文。</details>

<details><summary>13. 两行都有 `message_id=m-a`，能断言线上曾返回 409 吗？</summary>

不能。先保留两原始行并查来源/版本，数据重复不等于请求响应证据。</details>

<details><summary>14. 文件第 1 行、`request_id=r-1`、`message_id=m-a` 可互换吗？</summary>

不能；分别是文件位置、请求尝试和消息意图。</details>

<details><summary>15. 文件不存在时若只捕获 `JSONDecodeError` 会怎样？</summary>

文件访问的 `OSError` 会交给上层；应清楚报告路径/失败类型，不能误记脏行。</details>

<details><summary>16. `records[:]` 是安全的原始数据深拷贝吗？</summary>

不是；只复制外层列表，内层可变字典仍可能共享。</details>

### 决策 17–22：权限与可复现

<details><summary>17. 文档没 `access_scope`，可以默认公开给所有会话吗？</summary>

不能。先排除公开检索并请来源/权限负责人定义规则。</details>

<details><summary>18. `sender_id=u-a` 字段能证明 `u-a` 有权发送到 `c-a` 吗？</summary>

不能。字段是数据声称，成员授权需独立证据。</details>

<details><summary>19. 拒绝行直接丢弃且不计数，有什么问题？</summary>

无法复核覆盖率和错误类型，可能把清洗失败冒称成功。</details>

<details><summary>20. 一份最小复现 manifest 应至少记录什么？</summary>

Python/程序与规则版本、原始输入 SHA256、schema/权限范围、参数、接受/拒绝数及输出排序/哈希。</details>

<details><summary>21. `q-02` 缺成员可见规则，可以预填“B 能看”吗？</summary>

不能。标待定问题，不能把猜测做成评测金标准。</details>

<details><summary>22. 本章为什么不先调用模型回答问题？</summary>

尚需先固定虚构数据来源、校验、权限、问题集和基线；模型输出不能修复不可信输入。</details>

## 本章完成标准与后续路径

能用 Python 对象、函数、异常和 `pathlib/json` 解释纸上 JSONL 管线，按 UTF-8 字节与字段规则拒绝不合格行，区分样本重复与线上 409，并交付无真实数据、权限状态清楚的复现清单，才算完成第一轮。下一章[14.02 必要数学与机器学习直觉](../../../src/docs/platform_engineering/curriculum/14_ai/02_math_ml_intuition.md)将从向量、相似度、概率和训练/验证的手算进入下一层。
