# 01.03 控制流与函数：把 IM 消息规则写清楚

> DeepTutor 原稿经技术与教学审阅后的章稿。以下输出是静态推导的预期，本次未运行示例。

## 本章怎样接上前面的知识

先修为 [01.01 程序与工具链](../deeptutor_01_01/reviewed.md)和 [01.02 类型与数据表示](../deeptutor_01_02/reviewed.md)。你已经见过变量、类型、比较、逻辑条件、字符串、`len`、最小 `if` 和 `main` 中的 `return`。现在把这些能力放进一个 IM 场景，再逐步加入循环与函数。

需求是：用户 u-a 准备提交一段文本，程序先判断会话类型是否认识，再判断文本是否符合规则。我们只做本地校验和路径选择，最终结果称为“本地校验通过”。网络发送、可信身份、存储和对端接收会在后续阶段增加。

本章有八节，可以分次学习：

| 阅读层次 | 小节 | 本次学习成果 |
|---|---|---|
| 起步 | 一、分支与提前返回 | 把规则拆成互不矛盾的执行路径 |
| 起步 | 二、switch 分流 | 给已知与未知分类明确结果 |
| 起步 | 三、有限循环 | 按轮次追踪状态，解释何时停止 |
| 起步 | 四、普通函数 | 区分定义、调用、参数与返回 |
| 应用 | 五、多返回值与副作用 | 让规则给出结果，由调用者决定动作 |
| 第二遍深化 | 六、递归与调用栈 | 解释停止条件、每层参数与返回过程 |
| 第二遍深化 | 七、函数值与闭包 | 把规则当作值，并理解捕获变量 |
| 综合 | 八、完整程序与源码对照 | 串起规则、检查边界、阅读真实入口 |

第一次可按一至五节 → 第八节学习，先完成普通函数版本；能解释它之后再读第六、七节。递归和闭包是本章的进一步理解目标，不要求在最初一小时同时掌握。

**代码约定：** 可以新建 `im-control` 目录，按第一章的方法初始化模块 `example.com/im-control`。每个“完整程序”单独替换 `main.go`。片段会说明放在 `main` 内还是与它并列；不要把多个完整程序、同名函数或重复变量直接拼在一起。故意错误例子单独观察。

## 一、把消息规则变成分支

### 1.1 先写输入和预期，再选择语法

先只检查文本，使用两个变量：`body` 保存原始文本，`maxBytes` 保存允许的最大字节数。本题约定：

1. `maxBytes` 必须大于 0。
2. 文本不能是空字符串。
3. 字节数不能超过上限，恰好等于上限合法。
4. 多项同时不合法时，按上述顺序报告第一项原因。

例如 `"你好"` 使用这里的 UTF-8 字面量写法，占 6 字节。`len("你好")` 确定为 6，不是 2，也不是一个随机器变化的估计值。

| 输入 | 规则判断 | 应得到什么 |
|---|---|---|
| `"你好"`、上限 6 | 恰好达到上限 | 通过 |
| `"你好"`、上限 5 | 字节数大于上限 | 拒绝超限 |
| `""`、上限 6 | 没有文本 | 拒绝空文本 |
| `"你好"`、上限 0 | 上限配置无效 | 先拒绝上限 |
| `""`、上限 0 | 两项都不合法 | 仍先拒绝上限 |
| `" "`、上限 1 | 一个空格，占 1 字节 | 按当前规则通过 |

最后一行提醒我们：空字符串与纯空格文本不同。本题没有“去除空格后再判断”的要求，程序不会自动替你增加这条规则。以后需求改变时，清理输入的方式和处理顺序也需要写进约定。

### 1.2 一组 if/else if/else 选择一条结果路径

**控制流**是语句执行的顺序和选择方式。普通顺序代码从前往后执行；分支根据条件决定执行哪部分。完整程序：

```go
package main

import "fmt"

func main() {
	body := "你好"
	maxBytes := 6

	if maxBytes <= 0 {
		fmt.Println("拒绝：字节上限无效")
	} else if body == "" {
		fmt.Println("拒绝：文本不能为空")
	} else if len(body) > maxBytes {
		fmt.Println("拒绝：文本超过字节上限")
	} else {
		fmt.Println("本地校验通过")
	}
}
```

`if` 后面是布尔条件；`else if` 表示前面的条件不成立时继续判断；`else` 表示前面都不成立时的结果。程序命中某个分支后，会执行该分支，然后离开这一整组判断。

当前输入的路径为：`6 <= 0` 为假 → 文本不为空 → `6 > 6` 为假 → 执行最后的 `else`。预期只打印一行：

```text
本地校验通过
```

如果 `maxBytes` 改为 0，第一项条件就成立，后面的文本判断不会继续执行。检查顺序决定了多个问题同时存在时先报告哪个问题。

### 1.3 多个独立 if 可能同时执行

下面是 `main` 内的**逻辑错误片段**，需要导入 `fmt`：

```go
body := ""
maxBytes := 6

if body == "" {
	fmt.Println("拒绝：文本不能为空")
}
if len(body) <= maxBytes {
	fmt.Println("本地校验通过")
}
```

两次判断互不隶属。空文本满足第一项，又满足 `0 <= 6`，因此预期既打印拒绝，又打印通过。编译器不一定能发现这样的业务矛盾，因为每个语句本身都合法。

若多个动作本来就可以同时发生，例如分别记录两项独立观察，多个 `if` 可以成立。本例要输出一个校验结论，应使用互斥结果结构，或在每个拒绝分支中明确结束当前处理。

这里的问题来自**条件有重叠且没有停止后续动作**。几个互斥的字符串相等判断不会仅因写成独立 `if` 就自动执行多次；要根据实际条件分析。

### 1.4 提前返回让拒绝路径清楚可见

第二种完整写法使用独立 `if`，但每次拒绝之后都有 `return`：

```go
package main

import "fmt"

func main() {
	body := "你好"
	maxBytes := 6

	if maxBytes <= 0 {
		fmt.Println("拒绝：字节上限无效")
		return
	}
	if body == "" {
		fmt.Println("拒绝：文本不能为空")
		return
	}
	if len(body) > maxBytes {
		fmt.Println("拒绝：文本超过字节上限")
		return
	}

	fmt.Println("本地校验通过")
}
```

`return` 结束当前函数。在这个没有后台工作的示例里，当前函数就是 `main`，因此后面的语句不再执行。这样，只有全部拒绝条件都不成立，才能到达最后一行。

**打印错误是一种输出动作，return 才改变这里的后续路径。** 删除某个拒绝分支里的 `return`，就要重新检查程序是否还能走到“通过”。

也可以用 `maxBytes <= 0 || body == "" || len(body) > maxBytes` 合并拒绝条件。`||` 从左向右短路：已经能确定为真时，不再计算右侧。但合并后只得到一个布尔结果，想说明具体失败原因时通常还需进一步判断。本章使用独立拒绝路径来保留原因。

### 1.5 if 的初始化语句与名字范围

有时只在这一组条件里需要字节数，可以在 `if` 中先声明。以下是 `main` 内片段，导入 `fmt`；本例上限固定为有效值 6：

```go
body := "你好"
maxBytes := 6

if n := len(body); n == 0 {
	fmt.Println("文本为空")
} else if n > maxBytes {
	fmt.Println("文本超限")
} else {
	fmt.Println("字节数：", n)
}
// fmt.Println(n) // 故意错误：这里看不到 n
```

分号左边的 `n := len(body)` 先执行，右边才是条件。这个 `n` 在条件及整组 `if/else if/else` 中可用，组外不可见。不可见描述的是名字的作用域，不是在声称某块内存立即被销毁。

如果外层已经有一个 `n`，这里的短声明会建立另一个名字相同的变量并遮蔽外层。需要在组外继续使用结果时，可以先在外层声明再使用；只服务于当前判断时，缩小名字范围能帮助阅读。

**停下来检查：** 对空文本和上限 0，你的程序报告哪一种原因？能否指出这是哪条需求决定的，而不是语法自动决定的？

## 二、用 switch 表达会话分流

### 2.1 给一种分类集中列出所有结果

接下来增加本地会话类型 `kind`。本章综合程序只认识 `"single"` 和 `"group"`，分别显示单聊与群聊标签；其他输入拒绝。它们是教学字符串，实际项目的协议编码会在源码对照中单独说明。

完整程序：

```go
package main

import "fmt"

func main() {
	kind := "group"

	switch kind {
	case "single":
		fmt.Println("计划路径：单聊")
	case "group":
		fmt.Println("计划路径：群聊")
	default:
		fmt.Println("拒绝：未知会话类型")
	}

	fmt.Println("分类判断结束")
}
```

预期输出：

```text
计划路径：群聊
分类判断结束
```

`switch kind` 先求得需要分类的值；`case` 后面写候选值，冒号后是匹配时执行的语句；所有候选都不匹配时，执行 `default`。

普通表达式 `switch` 只选择第一个匹配项。执行完这个分支后离开 `switch`，接着执行后面的语句；它不会自动结束 `main`，也不会自动进入下一个 `case`。

因此，不需要在每个分支末尾再写 `break`。若要从分支直接结束当前函数，应按目的使用 `return`。在这里打印“拒绝”后仍会打印“分类判断结束”，这是当前程序明确写出的流程。

### 2.2 多个候选共享动作，使用逗号

下面的片段放在 `main` 内，并导入 `fmt`：

```go
kind := "single"
switch kind {
case "single", "group":
	fmt.Println("认识这种会话类型")
default:
	fmt.Println("未知会话类型")
}
```

逗号表示这个分支接受两个候选值。故意错误的 `case "single" || "group":` 不能编译，因为 `||` 要求布尔值，两个字符串不能这样组合。

`default` 可以省略，省略后未匹配时什么分支都不执行。对于需要明确拒绝未知输入的本题，写出它能够让遗漏的类型有清楚结果。

如果以后要支持通知类型，应该一起修改分类规则、标签和用例，不能只让未知值悄悄走进默认的单聊路径。

### 2.3 没有表达式的 switch 按条件选择

有些分类由不同条件决定，而不是一个值等于什么。可以写没有表达式的 `switch`，它相当于 `switch true`。以下是另一份 `main` 内片段，需要 `fmt`：

```go
body := "你好"
maxBytes := 6

switch {
case maxBytes <= 0:
	fmt.Println("字节上限无效")
case body == "":
	fmt.Println("文本不能为空")
case len(body) > maxBytes:
	fmt.Println("文本超限")
default:
	fmt.Println("本地文本规则通过")
}
```

每个 `case` 是布尔条件，按顺序检查，只执行第一个为真的分支。此处与第一节的拒绝优先级保持一致。

`if/else if` 与这种 `switch` 都能表达顺序判断。选择时看哪种写法让本次规则更容易核对，不需要为了使用新语法而改写所有 `if`。

Go 还有显式的 `fallthrough`，会进入下一分支的语句而不重新检查其条件。本章路由不需要它；现在掌握普通分支的停止规则即可。循环里遇到 `break` 的作用范围，下一节会专门比较。

## 三、用 for 表达有限重复

### 3.1 先分清“重复几次”和“每次做什么”

假设我们要在本地模拟三次检查。集合还没学到，因此先重复处理同一个固定输入，观察执行次数；这不代表已经读取了三条不同消息。

复制三段判断会把次数和规则散落在多处。循环把“重复条件”和“本轮工作”分别写清楚。完整程序：

```go
package main

import "fmt"

func main() {
	body := "你好"
	maxBytes := 6

	for i := 0; i < 3; i++ {
		fmt.Println("开始第", i+1, "次本地检查")
		if maxBytes > 0 && body != "" && len(body) <= maxBytes {
			fmt.Println("本次文本规则通过")
		} else {
			fmt.Println("本次文本规则不通过")
		}
	}
}
```

`for` 后的三部分用分号分隔：初始化 `i := 0`、继续条件 `i < 3`、后置语句 `i++`。`i++` 将 i 增加 1，它是一条语句，不产生可以交给 `fmt.Println(i++)` 的值。

执行顺序是：初始化一次 → 检查条件 → 执行循环体 → 执行后置 → 再检查条件。

| 条件检查时 i | `i < 3` | 执行什么 | 后置之后 |
|---:|---|---|---:|
| 0 | 真 | 第 1 次检查 | 1 |
| 1 | 真 | 第 2 次检查 | 2 |
| 2 | 真 | 第 3 次检查 | 3 |
| 3 | 假 | 循环体不再执行 | 不执行后置 |

预期有三次“开始检查”和三次“规则通过”。显示编号使用 `i+1`，循环状态仍然从 0 开始。把显示编号与内部计数分开，后面学习数组下标会更容易。

### 3.2 边界决定次数

对 `i := 0` 而言，`i < 3` 经过 0、1、2，执行三次；`i <= 3` 多包含 3，执行四次。对 `i := 1` 而言，`i <= 3` 则刚好三次。不能只看比较符号，必须一起看起点、条件与每次变化。

把次数写成变量时，同样先定义输入范围。以下片段放在 `main` 中并导入 `fmt`：

```go
count := 3
if count < 0 || count > 10 {
	fmt.Println("模拟次数必须在 0 到 10 之间")
	return
}
for i := 0; i < count; i++ {
	fmt.Println("本地模拟编号：", i)
}
```

count 为 0 时，第一次条件检查就为假，循环体执行零次。这是允许“本次没有工作”的一种约定。负数在进入循环前被拒绝，不能依赖它碰巧不执行就认为输入合法。

对于此处的小范围，i 每轮增加 1，最终到达 count，使条件为假。这就是一份简单的**停止性说明**：指出状态怎样变化，为什么一定会达到停止条件。不要把它无条件推广到任意整数范围或任何带副作用的循环。

### 3.3 条件形式由循环体负责推进状态

有时写成“只要还有工作就继续”更自然。片段放在 `main` 中并导入 `fmt`：

```go
remaining := 3
for remaining > 0 {
	fmt.Println("尚未计数的步骤：", remaining)
	remaining = remaining - 1
}
fmt.Println("计数结束")
```

条件形式没有独立后置部分，状态更新写在循环体中。预期先打印剩余 3、2、1，再打印计数结束。

如果忘记最后的减法，remaining 一直是 3，条件就无法按预期变为假。循环是否停止取决于状态变化，不取决于代码看起来有多少行。

`for { ... }` 表示没有显式继续条件的循环。它需要通过 `break`、`return` 或其他明确路径结束。本章优先使用能直接看出边界的形式，再学习提前结束的情况。

### 3.4 continue、break 与 return 的范围不同

完整程序用一个模拟编号表示“这一项需要跳过”，不引入尚未学习的消息集合：

```go
package main

import "fmt"

func main() {
	for i := 0; i < 3; i++ {
		if i == 1 {
			fmt.Println("跳过模拟项", i)
			continue
		}
		fmt.Println("处理模拟项", i)
	}
	fmt.Println("模拟结束")
}
```

预期输出：

```text
处理模拟项 0
跳过模拟项 1
处理模拟项 2
模拟结束
```

`continue` 跳过本轮剩余语句。对这个三段式循环，它会先进入后置 `i++`，再重新检查条件，所以不会一直停留在 i=1。

将 `continue` 改为 `break`，预期只处理 0、打印跳过 1，然后输出“模拟结束”；编号 2 不再进入。将它改为 `return`，当前 `main` 直接结束，连“模拟结束”也不会输出。

| 语句 | 当前作用 | 循环之后的 main 语句 |
|---|---|---|
| `continue` | 结束本轮，按循环规则进入下一轮 | 循环整体结束后仍可执行 |
| `break` | 退出最近的循环或 switch 等结构 | 仍可执行 |
| `return` | 结束当前函数调用 | 若当前函数是 main，其后语句不再执行 |

### 3.5 两个容易漏看的循环陷阱

**陷阱一：continue 跳过了手动推进。** 以下是故意错误的 `main` 内片段，需要 `fmt`，不要作为正常示例持续运行：

```go
checked := 0
for checked < 3 {
	if checked == 1 {
		continue
	}
	fmt.Println(checked)
	checked++
}
```

checked 从 0 变为 1 后，`continue` 总会跳过末尾的 `checked++`。条件形式没有另一个后置部分替它更新，于是状态不再前进。可以改用三段式循环，让后置推进在 continue 之后仍会发生；也可以重新组织循环体，确保每条继续路径都会推进。

**陷阱二：switch 内的 break 结束的是 switch。** 片段放在 `main` 中并导入 `fmt`：

```go
for i := 0; i < 3; i++ {
	switch i {
	case 1:
		break
	}
	fmt.Println(i)
}
```

预期仍打印 0、1、2。无标签 `break` 结束最近包围它的 `for`、`switch` 或 `select`；本例最近的是 switch。`select` 是后续并发语法，目前只需识别这里的 for 与 switch。

两层循环也要分清范围：外层模拟 2 台设备，内层每台做 3 次本地计数，总计 6 次。内层 break 只结束当前设备的内层循环，外层仍可能继续。设备与用户是不同概念；同一用户可以使用多台设备，本章编号只是计数练习。

## 四、把规则提取为普通函数

### 4.1 为什么需要给一段规则取名字

如果两处都要检查文本长度，而每处各写一套判断，以后上限改变时可能只改一处。把规则集中到一个函数中，可以让调用位置表达“做哪件事”，让函数体表达“怎样完成它”。

**函数定义**写清这个步骤的名字、输入、输出和执行语句；**函数调用**才会让它对一组具体输入执行一次。先看只有一个结果的完整程序：

```go
package main

import "fmt"

func textLengthOK(text string, limit int) bool {
	return limit > 0 && text != "" && len(text) <= limit
}

func main() {
	messageA := "你好"
	messageB := ""

	okA := textLengthOK(messageA, 6)
	okB := textLengthOK(messageB, 6)
	fmt.Println("第一条规则结果：", okA)
	fmt.Println("第二条规则结果：", okB)
}
```

预期输出：

```text
第一条规则结果： true
第二条规则结果： false
```

这里两次调用都使用同一个函数定义，但提供不同的文本。函数没有自动读到 main 中的 messageA；它通过参数得到这一次需要处理的值。

### 4.2 逐符号阅读声明

读取 `func textLengthOK(text string, limit int) bool` 时，可以分成以下部分：

| 部分 | 含义 |
|---|---|
| `func` | 声明一个函数 |
| `textLengthOK` | 函数名字，调用时用这个名字 |
| `(text string, limit int)` | 两个输入参数：一个字符串，一个整数 |
| `bool` | 返回一个布尔结果 |
| `{ ... }` | 函数体，写每次调用要执行的语句 |
| `return 表达式` | 计算结果，结束本次调用，将结果交回调用位置 |

`textLengthOK(messageA, 6)` 中的 messageA 和 6 是**实参**，即这次实际提供的值；声明中的 text 和 limit 是**形参**，是函数本次接收值所使用的局部名字。实参和形参不必同名，类型和位置需要匹配。

这里 `return` 后的逻辑表达式先得到 true 或 false，再作为调用结果返回。它没有替调用者打印结果，打印发生在 main 的后续语句中。

参数与返回值的类型组合构成函数使用方式的重要部分，也常称为函数的签名。调用一个接收 string、int 的函数时，不能把参数顺序随意交换。

### 4.3 定义的位置与调用的位置

本章的命名函数声明放在包级，也就是与 `main` 并列。可以写在 main 前面，也可以写在后面；文件中的声明顺序不代表这两个函数的执行顺序。

真正的执行从 main 进入，在调用出现时才执行辅助函数。例如前面的 `textLengthOK` 写在 main 上方，程序也不会先自动调用它。

下面是故意错误的结构示意：

```go
func main() {
	func textLengthOK(text string, limit int) bool {
		return limit > 0 && text != "" && len(text) <= limit
	}
}
```

Go 不允许在这里直接嵌套这种命名函数声明。第七节会学习可以放在函数体内的匿名函数表达式，那是另一种语法。

独立写函数片段时，也要确认它被放在 main 的闭花括号之外。编辑器里缩进相似，不代表作用范围相同。

### 4.4 一次调用的完整过程

对 `okA := textLengthOK(messageA, 6)`，可以按下面的逻辑模型追踪：

| 步骤 | main 中的状态 | 本次辅助函数中的状态 |
|---|---|---|
| 调用前 | messageA 为 `"你好"` | 本次调用尚未开始 |
| 接收参数 | main 等待调用结果 | text 得到 `"你好"`，limit 得到 6 |
| 计算 | 等待结果 | `limit > 0`、非空和 `6 <= 6` 都成立 |
| 返回 | 准备接收结果 | `return true` 结束本次调用 |
| 继续 main | okA 得到 true | 本次调用已经完成 |

第二次调用重新接收 `""` 和 6，得到 false。两次调用中的 text 虽然名字相同，分别属于各自调用，不能因为同名就认为是一个会被上一条消息污染的局部变量。

**调用栈**可以先理解为“当前有哪些调用还在等待下层结果”的记录：main 调用辅助函数时等待，辅助函数返回后 main 继续。这个逻辑模型帮助阅读，不能据此断言每个变量总在物理栈上；实际存放位置、内联和逃逸在后续系统与运行时课程解释。

### 4.5 参数按值传递，重新赋值不会改掉调用者变量

完整程序演示一个刻意修改参数的函数：

```go
package main

import "fmt"

func showChangedLimit(limit int) {
	limit = 1
	fmt.Println("函数里面：", limit)
}

func main() {
	limit := 6
	showChangedLimit(limit)
	fmt.Println("main 里面：", limit)
}
```

预期输出：

```text
函数里面： 1
main 里面： 6
```

这次调用把整数值 6 交给形参 limit。函数内重新赋值修改的是形参，main 的 limit 仍为 6。函数没有返回类型，表示它不向调用处交回业务结果；它的动作是打印。

如果希望得到修改后的值，需要明确返回，再由调用者赋值，例如以下函数声明放在 main 外：

```go
func reducedLimit(limit int) int {
	return limit - 1
}
```

调用片段放在 main 内，需要 `fmt`：

```go
limit := 6
next := reducedLimit(limit)
fmt.Println(limit, next) // 预期：6 5
limit = next
fmt.Println(limit) // 预期：5
```

该函数只演示传值与返回，实际业务仍需定义是否允许结果为零或负数。参数传递与业务合法性是两个需要分别考虑的问题。

Go 的参数都是按值传递。但下一章的切片、map 和指针，其值可能关联同一份底层数据，所以不能把本节结论扩大成“函数内部所有修改都不会影响外面”。当前先掌握整数和字符串变量的重新赋值。

## 五、用多返回值表达校验契约

### 5.1 通过与原因应该一起约定

只有一个 bool 能回答是否通过，却不能告诉调用者为什么拒绝。沿用前面的规则，我们定义：

```text
输入：body string，maxBytes int
输出：ok bool，reason string
通过：ok 为 true，reason 为空字符串
拒绝：ok 为 false，reason 说明第一项失败原因
```

这是函数的**契约**：输入和输出分别代表什么，调用者可以依赖哪些行为。它不仅包含类型，还包括原因的优先级和结果之间的关系。

例如 body 为空且 maxBytes 为 0，规则要求先报告上限无效。两个实现即使都返回 false，如果返回原因不同，也可能违反已经约定的行为。

### 5.2 完整函数与调用者各负责什么

下面是完整程序：

```go
package main

import "fmt"

func validateText(body string, maxBytes int) (bool, string) {
	if maxBytes <= 0 {
		return false, "字节上限必须大于 0"
	}
	if body == "" {
		return false, "文本不能为空"
	}
	if len(body) > maxBytes {
		return false, "文本超过字节上限"
	}
	return true, ""
}

func main() {
	body := "你好"
	maxBytes := 6
	ok, reason := validateText(body, maxBytes)
	if !ok {
		fmt.Println("本地拒绝：", reason)
		return
	}
	fmt.Println("本地文本规则通过")
}
```

参数列表后的 `(bool, string)` 是两个返回类型。每条 return 都按这个顺序交回两个值。`ok, reason := ...` 按位置接收结果，并根据相应类型建立两个变量。

预期输出为 `本地文本规则通过`。将上限改为 5，预期输出为 `本地拒绝： 文本超过字节上限`；冒号后的空格来自 `fmt.Println` 在两个参数之间插入的空格。

在这个函数中，走到最后一行就意味着三项拒绝条件均未命中，因此返回 `true, ""`。每个可能完成的路径都给出与签名匹配的结果，阅读者可以沿分支逐条核对。

### 5.3 类型按位置确定，变量名字不决定类型

正确接收方式使用有意义的名字 `ok, reason`。但下面这条声明本身也能够成立，放在 main 内并使用同一 `validateText` 定义：

```go
reason, ok := validateText("", 6)
fmt.Println(reason, ok) // 预期：false 文本不能为空
// if !ok { } // 故意错误：这里的 ok 实际是 string
```

变量名不会告诉编译器它“应该是什么类型”。第一项返回 bool，所以名为 reason 的变量被推断为 bool；第二项返回 string，所以名为 ok 的变量被推断为 string。直到尝试用 `!ok`，才因为操作对象不是 bool 而报错。

若变量已经用 `var reason string`、`var ok bool` 声明，再用 `reason, ok = validateText(...)` 赋值，会在赋值时发生类型不匹配。需要区分声明时推断类型，与已有变量接收结果这两种情况。

其他故意错误包括：

- 在 `(bool, string)` 函数中写 `return false`：返回数量不匹配。
- 写 `return "文本不能为空", false`：返回顺序与类型不匹配。
- 写 `if validateText(body, maxBytes) { ... }`：条件需要一个 bool，这个调用给出两个结果。

语法规则可以检查数量和类型；名字是否贴合含义、错误原因是否符合需求，仍需要我们审阅。

### 5.4 helper 的 return 不会替 main 作决定

校验失败时，`validateText` 返回 false 和原因，只是结束本次辅助函数调用，main 会接着往下走。

下面是逻辑错误的 main 内片段，需导入 `fmt` 并已有 validateText：

```go
ok, reason := validateText("", 6)
fmt.Println(ok, reason)
fmt.Println("本地校验通过")
```

前一行会显示 false 与拒绝原因，但后一行仍然输出通过。修复方式是根据 ok 选择后续路径；可以在 `if !ok` 内返回，也可以把通过动作放在 else 中。

因此，校验函数提供结果，调用者必须决定如何使用。即使直接调用而忽略返回结果在语法上可能允许，也不能据此认为错误已经被处理。

### 5.5 将判断与副作用分开，方便复用和验证

**副作用**是计算结果之外对外部可观察状态产生的影响，例如向终端打印、写文件、发送网络数据，或者修改函数外部的变量。

本例 validateText 只使用输入参数，返回规则结果。同样的输入会得到同样的输出，没有打印或外部状态修改。我们把这种小函数称为纯校验函数；这里不仅检查“有没有写外部数据”，也要看它是否依赖会变化的外部状态。

main 负责打印反馈。以后同一校验函数可以放到命令行、HTTP 接口或测试中，调用者各自决定怎样展示错误，而不用让校验函数知道所有展示方式。

这不是要求所有函数都没有副作用。程序最终需要与外部交互；重要的是把规则输入、结果和实际动作写清楚，使失败路径可以被检查。

### 5.6 先做手工用例，再学习自动测试

给 validateText 建立一组与实现分开写出的规则用例：

| body | maxBytes | ok | reason |
|---|---:|---|---|
| `"你好"` | 6 | true | 空字符串 |
| `"你好"` | 5 | false | 文本超过字节上限 |
| `""` | 6 | false | 文本不能为空 |
| `""` | 0 | false | 字节上限必须大于 0 |
| `"a"` | -1 | false | 字节上限必须大于 0 |
| `" "` | 1 | true | 空字符串 |

用例先来源于业务规则，再与函数结果比较。如果只照着代码的每个 if 抄一份答案，可能同时把同一个业务错误复制到两边。

现在可以逐个替换输入、预测并观察。后续在讲清指针与方法之后，10.02 会解释 `_test.go`、`testing.T` 和自动报告失败的方法；本节先把什么应当通过、什么必须拒绝说清楚。

**本层验收：** 不看正文写出 validateText 的输入输出约定，并指出它里面的 return 与 main 里面的 return 各结束谁。通过后可先跳到第八节完成基础综合程序。

## 六、第二遍阅读：递归与调用栈

### 6.1 用一个有限模型观察“函数调用自己”

**递归**指函数在执行中再次调用自己。当前问题需要的结果，可以由一个规模更小、形式相同的问题得到。理解它之前，应当已经能追踪普通函数的参数和返回。

下面人为地把“还剩几步”拆成“当前一步，加上剩余步骤”。它用于观察调用关系；这种简单计数实际用循环会更直接，不把它包装成高效消息处理算法。

完整程序：

```go
package main

import "fmt"

func countSteps(remaining int) int {
	if remaining == 0 {
		return 0
	}
	return 1 + countSteps(remaining-1)
}

func main() {
	remaining := 3
	if remaining < 0 || remaining > 10 {
		fmt.Println("计数必须在 0 到 10 之间")
		return
	}
	fmt.Println("计数结果：", countSteps(remaining))
}
```

预期输出：

```text
计数结果： 3
```

main 在调用前限定 0 到 10，这是小模型的输入契约。递归函数的正确性说明依赖这个前提；若以后允许其他调用者，就要重新检查这个前提由谁维护。

### 6.2 停止条件与减小量缺一不可

函数分为两部分：remaining 为 0 时直接返回，这称为**基础情况**；否则把 remaining 减 1，再调用同一个函数。

对非负整数输入，`remaining-1` 每次使问题缩小，最终到达 0。这里需要同时证明“能够达到基础情况”和“基础情况不再递归”。

如果递归时仍写 `countSteps(remaining)`，输入为 3 时，每一层都拿到 3，永远没有按规则接近 0。如果去掉基础情况，即使到达 0，也还会继续调用。两者都破坏了停止性说明。

对于负数输入，继续减 1 先远离了 0，这份非负递减的证明不再成立。不能依赖整数溢出或运行时失败来结束工作；输入检查应在开始递归前完成。

### 6.3 先向下调用，再向上交回结果

把 countSteps(3) 展开：

```text
countSteps(3) 等待 1 + countSteps(2)
countSteps(2) 等待 1 + countSteps(1)
countSteps(1) 等待 1 + countSteps(0)
countSteps(0) 直接返回 0

countSteps(1) 收到 0，返回 1
countSteps(2) 收到 1，返回 2
countSteps(3) 收到 2，返回 3
main 收到 3，继续打印
```

不是一个 remaining 变量被反复改写成 3、2、1、0；每次调用都有自己的参数。外层调用暂时等待内层结果，再完成自己那一层的加法。

| 调用层 | 参数 | 此层尚未完成的工作 |
|---|---:|---|
| 第一层 | 3 | 等待 countSteps(2)，再加 1 |
| 第二层 | 2 | 等待 countSteps(1)，再加 1 |
| 第三层 | 1 | 等待 countSteps(0)，再加 1 |
| 第四层 | 0 | 无需继续等待，返回 0 |

这是逻辑调用栈。它同时帮助解释为什么过深递归会带来额外资源风险：存在很多尚未结束的调用。当前课程不承诺编译器会把这种递归自动改成循环。

### 6.4 与循环表达比较

下面是放在 main 外的另一种函数定义；调用前沿用 0 到 10 的输入检查：

```go
func countStepsLoop(remaining int) int {
	steps := 0
	for remaining > 0 {
		steps++
		remaining = remaining - 1
	}
	return steps
}
```

循环版在同一次调用内维护 steps 和 remaining，递归版通过不同调用之间的等待与返回完成计算。合法输入为 3 时，两者都返回 3，但执行过程不同。

不要因为合法输入的结果一致，就忽略各自前置。循环版遇到负数时会直接返回 0，递归版则没有这条合理的处理路径；本题选择在调用前统一拒绝负数。

今后树遍历、分治或嵌套结构会提供更自然的递归问题。当前验收是能画出进入与返回顺序，指出基础情况、减小量和输入边界。真实消息重试还涉及时间、重复效果和外部状态，不能由这个计数函数直接推导。

## 七、第二遍阅读：函数值、匿名函数与闭包

### 7.1 一个变量也可以保存规则函数

之前变量保存 int、string 和 bool。Go 中函数也可以作为值交给变量。完整程序：

```go
package main

import "fmt"

func nonEmpty(text string) bool {
	return text != ""
}

func main() {
	var allow func(string) bool
	allow = nonEmpty
	fmt.Println(allow("你好")) // 预期：true
	fmt.Println(allow(""))     // 预期：false
}
```

`func(string) bool` 是一个函数类型：接收一个 string，返回一个 bool。`allow = nonEmpty` 保存函数值，此时没有执行文本判断；`allow("你好")` 才调用它，并得到一个 bool。

这与 `ok := nonEmpty("你好")` 不同：后者先执行调用，再将布尔结果保存到 ok。阅读时要看名字后面有没有调用所需的参数括号。

### 7.2 函数类型也会限制输入与输出

`allow` 可以保存具有相应参数和返回类型的函数。接收 int 的函数、返回 int 的函数，都不能直接赋给 `func(string) bool` 变量。

下列片段使用上一完整程序中的 allow，放在 main 内分别观察：

```go
fmt.Println(allow("hi")) // 合法
// fmt.Println(allow(123)) // 故意错误：参数不是 string
// allow = func(text string) int { return len(text) } // 返回类型不匹配
```

函数变量也有零值：声明 `var allow func(string) bool` 后、赋值之前，它为 nil。调用 nil 函数会导致运行时错误，可以先通过 `allow == nil` 检查是否已经取得规则。两个函数值不能用 `==` 直接比较；与 nil 的比较是允许的情况。

类型检查只认识类型。例如消息文本和会话类型在本章都使用 string，将 `"single"` 误当文本交给 nonEmpty，在类型层面仍然合法。不同业务数据的含义需要清楚命名、接口约定与测试来表达，后续还会学习自定义类型。

### 7.3 匿名函数是在使用处写出的函数值

**匿名函数**没有单独的声明名字，但仍有参数、返回类型和函数体。它可以作为表达式放在 main 中。完整程序：

```go
package main

import "fmt"

func main() {
	allow := func(text string) bool {
		return text != "" && len(text) <= 6
	}

	fmt.Println(allow("你好"))   // 预期：true
	fmt.Println(allow("你好呀")) // 预期：false
}
```

`allow :=` 声明变量，右侧匿名函数成为这个变量的值。这个写法与第四节被禁止的“在 main 内声明普通命名函数”不同，右侧是合法的函数表达式。

匿名函数还可以直接调用。以下是独立的 main 内片段，需导入 `fmt`：

```go
ok := func(text string) bool {
	return text != "" && len(text) <= 6
}("你好")
fmt.Println(ok) // 预期：true
```

紧接函数体的 `("你好")` 是调用参数，因此整个表达式的结果为 bool。第一次阅读不习惯时，可以先把函数存入变量，再调用；选择写法时以能清楚表达当前步骤为准。

### 7.4 闭包可以继续使用外层变量

匿名函数使用外层函数里的变量时，会形成**闭包**。可以先把它理解为“函数值连同它仍能访问的外层变量”。

完整程序：

```go
package main

import "fmt"

func main() {
	limit := 6
	allow := func(text string) bool {
		return limit > 0 && text != "" && len(text) <= limit
	}

	fmt.Println(allow("你好")) // 预期：true
	limit = 5
	fmt.Println(allow("你好")) // 预期：false
}
```

前后使用同一个 allow，输入文本也相同，但结果改变，因为匿名函数引用的是外层 limit 变量。后续调用会观察到它当前的值，不会自动把创建函数时的 6 拍成一张不可变快照。

从调用表看：

| 时刻 | 外层 limit | allow 使用的上限 | 结果 |
|---|---:|---:|---|
| 第一次调用 | 6 | 6 | true |
| 修改之后 | 5 | 5 | false |

这也说明，一个不写外部状态的函数，如果读取了会变化的外部变量，同样可能对相同的显式输入返回不同结果。第五节的纯校验函数把上限作为明确参数传入，便于知道它依赖什么。

### 7.5 返回一个函数：按上限生成规则

希望单聊示例上限为 6、群聊示例上限为 12 时，可以让一个函数根据配置返回另一个函数。完整程序：

```go
package main

import "fmt"

func makeLengthRule(limit int) func(string) bool {
	if limit <= 0 {
		return func(text string) bool {
			return false
		}
	}
	return func(text string) bool {
		return text != "" && len(text) <= limit
	}
}

func main() {
	allowSingle := makeLengthRule(6)
	allowGroup := makeLengthRule(12)
	allowInvalid := makeLengthRule(0)

	fmt.Println(allowSingle("你好"))   // 预期：true，6 字节
	fmt.Println(allowSingle("你好呀")) // 预期：false，9 字节
	fmt.Println(allowGroup("你好呀"))  // 预期：true，9 字节
	fmt.Println(allowInvalid("hi"))    // 预期：false
}
```

按两次调用来读：

1. `makeLengthRule(6)` 接收整数上限，返回一个函数值。
2. `allowSingle("你好")` 再用具体文本调用这个函数，取得 bool。

签名中 `(limit int)` 是外层函数的输入；后面的 `func(string) bool` 是外层函数的输出类型。两次调用 makeLengthRule 各有自己的 limit 参数变量，因此 allowSingle 与 allowGroup 使用的是不同上限。

这个例子里，没有其他路径继续修改相应 limit，规则上限因而保持稳定。闭包使变量在仍可访问时继续可用，不要求它必须随着外层函数返回而失效；具体内存实现留到后续运行时章节。

上限不合法时返回永不通过的规则，是本例主动写出的约定，不是闭包自动具有的能力。上层如果还需要知道配置为什么无效，就应另外设计错误返回，而不是只能得到 false。

这些 6、12 字节限制仍是教学设定，不代表真实单聊和群聊应该采用这种产品限制。

**本节验收：** 解释函数值与 bool 结果的差别，解释外层 limit 变化为何影响闭包，并画出两次工厂调用各自关联的变量。当前仅讨论顺序执行，并发访问闭包捕获变量会在并发课程再分析。

## 八、综合程序、源码对照与分层练习

### 8.1 把整体契约写清楚

现在将会话分流和文本校验组合起来。整体检查顺序为：

1. 识别会话类型，本题只允许 single、group。
2. 对已识别会话检查文本规则：有效上限 → 原始非空 → 字节数不超限。
3. 任意步骤拒绝时，停止当前 main 的后续处理。
4. 全部通过时，只输出本地结论与计划路径。

这里存在两个层次的顺序：main 决定“先会话、后文本”；validateText 决定文本内部三项条件的优先级。它们分别承担自己的契约，因此未知类型与空文本同时出现时，会先报告未知类型。

### 8.2 一份完整的普通函数程序

该版本只依赖一至五节。用它单独替换 main.go，之前的演示程序不需要同时复制：

```go
package main

import "fmt"

func routeSession(kind string) string {
	switch kind {
	case "single":
		return "单聊"
	case "group":
		return "群聊"
	default:
		return ""
	}
}

func validateText(body string, maxBytes int) (bool, string) {
	if maxBytes <= 0 {
		return false, "字节上限必须大于 0"
	}
	if body == "" {
		return false, "文本不能为空"
	}
	if len(body) > maxBytes {
		return false, "文本超过字节上限"
	}
	return true, ""
}

func main() {
	kind := "single"
	body := "你好"
	maxBytes := 6

	label := routeSession(kind)
	if label == "" {
		fmt.Println("本地拒绝：未知会话类型")
		return
	}

	ok, reason := validateText(body, maxBytes)
	if !ok {
		fmt.Println("本地拒绝：", reason)
		return
	}

	fmt.Println("本地校验通过，计划路径：", label)
}
```

预期输出：

```text
本地校验通过，计划路径： 单聊
```

routeSession 只负责把已知字符串分类翻译为标签。返回空字符串代表“未知”，这是本地约定；如果以后改成返回 `"未知"`，main 的检查也必须一起改变，否则它会把非空标签误当成有效分类。

validateText 只负责文本规则。main 接收两个结果，按 ok 决定是否继续；原来的 message body 不会因为校验函数返回而自动被修改。

### 8.3 沿一次输入逐步追踪

| 执行位置 | 输入或当前值 | 取得什么结果 | 下一步 |
|---|---|---|---|
| 调用 routeSession | kind 为 single | 返回单聊标签 | 回到 main |
| main 检查 label | label 非空 | 不是未知会话 | 调用 validateText |
| 检查上限 | maxBytes 为 6 | 上限合法 | 检查空文本 |
| 检查空文本 | body 为 `"你好"` | 非空 | 比较字节数 |
| 比较字节数 | 6 不大于 6 | 未超限 | 返回 true、空原因 |
| main 检查 ok | ok 为 true | 不走拒绝分支 | 输出本地结论 |

如果把 maxBytes 改为 5，执行到字节数比较时返回 false 和原因；main 仍会继续接收结果，但随后进入自己的拒绝分支并 return，最后一行不再执行。

如果 kind 未知，validateText 根本没有被调用。可以通过这种“哪一行能到达，哪一行不能到达”的分析检查拒绝路径。

### 8.4 十二组边界与失败用例

每次只替换表中输入，并记录预测。下面的结论按这份完整程序推导；个人运行时再填写实际结果。

| kind | body | maxBytes | 预期结论 |
|---|---|---:|---|
| single | `"你好"` | 6 | 通过，标签单聊 |
| group | `"你好"` | 6 | 通过，标签群聊 |
| other | `"你好"` | 6 | 拒绝未知会话，不调用文本校验 |
| single | `"你好"` | 5 | 拒绝超限 |
| single | `""` | 6 | 拒绝空文本 |
| single | `"hi"` | 0 | 拒绝上限无效 |
| single | `""` | 0 | 先拒绝上限无效 |
| single | `"hi"` | -1 | 拒绝上限无效 |
| single | `" "` | 1 | 按本题规则通过 |
| single | `" 你好 "` | 6 | 长度为 8，拒绝超限 |
| single | `" 你好 "` | 8 | 恰好到上限，通过 |
| other | `""` | 0 | 仍先拒绝未知会话 |

两个带空格的例子说明：空格不会自动被清除，也仍然计入长度。只说“空格文本可以合法”不够，还要满足当前字节上限。

### 8.5 对照 OpenIM，先读控制结构

本章实际核对的上游版本为 **OpenIM v3.8.3-patch.16**，提交 `f6411a8a1a31d3df36f4c2b3ad28481a94141e1f`。只把已经读过的函数事实用于对照。

第一处是 [internal/rpc/msg/send.go 的 SendMsg](https://github.com/openimsdk/open-im-server/blob/f6411a8a1a31d3df36f4c2b3ad28481a94141e1f/internal/rpc/msg/send.go#L34)：它检查消息数据是否存在，补齐消息数据，再根据 SessionType 使用 switch 分到单聊、通知或群聊处理；未知类型返回错误。

第二处是 [internal/msggateway/message_handler.go 的 SendMessage](https://github.com/openimsdk/open-im-server/blob/f6411a8a1a31d3df36f4c2b3ad28481a94141e1f/internal/msggateway/message_handler.go#L151)：对载荷解码、结构校验、调用消息服务、编码结果等步骤分别检查错误，发生错误时提前返回。

先用本章已经学过的概念阅读它们：

| 已学概念 | 真实入口中可以观察的问题 |
|---|---|
| 分支 | 输入条件决定进入哪一条路径 |
| switch | 不同会话类别分别委托不同处理 |
| 函数调用 | 一个入口把工作交给另一个明确步骤 |
| 返回值 | 被调用步骤将结果或错误交给调用者 |
| 提前返回 | 出错之后，哪些后续步骤不会再执行 |

上游函数还使用指针、结构体、协议序列化和 RPC，这些不属于本章先修。现在不要求逐字读懂整份函数；后续在 01.05、01.07、04 和 09 卷讲清后再沿同一入口深入。主项目的整体位置见 [IM 阅读地图](../../../src/docs/platform_engineering/curriculum/im_reference.md)。

**教学模型与源码事实分开：** 本章的 single/group 字符串、6 字节上限、返回中文标签及 `(bool, string)` 校验结果都是教学设定；上游的会话类型、消息结构与错误机制按实际代码解释。本地函数也没有实现可信身份、网络、持久性或消息去重。

### 8.6 三层结论不要混淆

| 当前有什么证据 | 可以说明什么 |
|---|---|
| 程序能够通过语法与类型检查 | 使用了编译器允许的代码结构 |
| 校验函数对某输入返回 true | 按本题规则，该输入可进入后续路径 |
| 某个系统返回发送结果或收到回执 | 需要结合对应协议与故障条件解释其保证 |

本章输出只属于第二层。它没有调用网络接口，因此不能据此推出服务端已经受理、已经持久保存、接收设备已经处理或用户已经读过。

后续课程会分别定义这些状态与证据。现在先把一条有限规则的输入、过程和输出解释准确，才有能力分析更长的消息链路。

### 8.7 十二道分层练习与反馈

以下练习先独立作答，再展开反馈。参考输出属于预测；故意错误代码与正常程序分开。

#### 练习 1：一个输入为什么出现两种结论

空文本、上限 6，先独立判断 `body == ""` 并打印拒绝，再独立判断 `len(body) <= maxBytes` 并打印通过。预期发生什么？给出两种修正方式。

<details>
<summary>提示与反馈</summary>

两项条件都成立，会打印两种结论。可以将结果组织为完整的 if/else if/else；也可以保留独立 if，在拒绝之后 return。修正后还要覆盖上限无效和超限，不能只处理这一份空文本输入。

</details>

#### 练习 2：switch 的兜底与共享分支

把 single 和 group 的动作合并为“已知类型”，未知类型拒绝。应该写 `case "single" || "group"` 还是使用其他形式？没有 default 时未知输入会怎样？

<details>
<summary>提示与反馈</summary>

写 `case "single", "group":`。`||` 要求布尔值，不能组合两个字符串候选。没有 default 且没有匹配时，不会执行任何分支；这不自动构成拒绝路径，需要由程序明确安排。

</details>

#### 练习 3：次数来自起点、条件和推进

分别预测 `i := 0; i < 3; i++`、`i := 0; i <= 3; i++`、`i := 1; i <= 3; i++` 的循环次数。如果循环上限是 0，哪一种仍可能执行一次？

<details>
<summary>提示与反馈</summary>

次数分别为 3、4、3。把右侧上限改为 0 后，第二种的初始比较 `0 <= 0` 仍成立，执行一次；另外两种不进入循环。只背“用小于号”不够，应列出实际取值。

</details>

#### 练习 4：continue 为什么导致停不下来

阅读第三节 checked 的错误片段，指出哪个状态让更新语句永远不可达。改成三段式循环后，continue 后面先执行哪一部分？

<details>
<summary>提示与反馈</summary>

checked 为 1 时，continue 跳过末尾 checked++，条件形式又没有独立后置。改成 `for checked := 0; checked < 3; checked++` 后，continue 先转到后置 checked++，再判断条件。修改时不要留下两份递增，导致某些路径一次加两次。

</details>

#### 练习 5：break 到底结束谁

在 `for i := 0; i < 3; i++` 中嵌套 switch，case 1 只有 break，switch 后打印 i。输出什么？如果把 break 改为 return，输出又怎样？

<details>
<summary>提示与反馈</summary>

使用 break 时输出 0、1、2，因为只结束 switch。若这段在 main 中，改为 return 后只输出 0，到 i=1 时 main 结束。答案要指出最近的结构和当前函数，不能把 break 泛化成“结束整个处理”。

</details>

#### 练习 6：定义了函数为什么还没执行

把 textLengthOK 放在 main 前面，但 main 只打印欢迎语，是否会自动校验文本？如何获得一个 bool 结果？可以将整个命名函数定义放进 main 吗？

<details>
<summary>提示与反馈</summary>

定义描述可被调用的步骤，不会因为位置靠前就自动运行。调用 `ok := textLengthOK("你好", 6)` 才取得结果。普通命名函数声明与 main 并列；main 内可在学会函数表达式后使用匿名函数。

</details>

#### 练习 7：名字颠倒时，哪里首先出错

`reason, ok := validateText("", 6)` 这一声明能否成立？两个变量各是什么类型？再执行 `if !ok` 时会怎样？

<details>
<summary>提示与反馈</summary>

声明可以成立，reason 被推断为 bool，ok 被推断为 string。`!ok` 因对象不是 bool 而不能编译。应按含义接收为 `ok, reason`；不能声称变量只要叫 ok 就自动具有布尔类型。

</details>

#### 练习 8：参数改变与调用者赋值

main 的 limit 为 6，调用 reducedLimit(limit) 得到 5。如果没有给 limit 重新赋值，limit 是多少？怎样使 main 的 limit 变为返回结果？

<details>
<summary>提示与反馈</summary>

仍为 6。显式写 `limit = reducedLimit(limit)` 才把结果写回。当前结论针对重新赋值；以后共享底层数据的值仍需按具体类型分析。

</details>

#### 练习 9：失败函数已经 return，为什么 main 还在继续

validateText 对空文本返回 false 和原因；main 打印两个结果后，无条件输出“通过”。问题在哪里？如何保证拒绝后不会到达通过动作？

<details>
<summary>提示与反馈</summary>

辅助函数只结束了自己的调用。main 必须用 `if !ok` 选择拒绝路径，并 return，或将通过动作放入 else。仅调用校验、仅打印 false，都没有自动停止后续处理。

</details>

#### 练习 10：画一次递归，再反驳一个错误修改

画出 countSteps(2) 的调用与返回。若递归时仍传 remaining，输入 2 为什么不能按原说明停止？输入 -1 又违反了什么前提？

<details>
<summary>提示与反馈</summary>

调用依次为 2、1、0，返回依次为 0、1、2。不减小参数就没有逼近基础情况。-1 违反调用前非负且不大于 10 的约束，不能使用这份终止性说明。一个正确的基础情况，还需要正确输入范围和进展方式配合。

</details>

#### 练习 11：闭包引用变量还是保存结果

外层 limit 从 6 改为 5，同一个 allow 对 `"你好"` 的结果怎样变化？如果先用 `makeLengthRule(limit)` 创建规则，再修改 main 的 limit，是否也必然改变该规则？

<details>
<summary>提示与反馈</summary>

直接引用 main 的 limit 的闭包，结果从 true 变为 false。工厂函数接收整数值，为自己的参数建立变量；返回的闭包引用该参数，main 后来给自己的 limit 重新赋值，不会修改工厂那次调用的参数。在本文工厂实现中，该规则上限保持创建时传入的值。

</details>

#### 练习 12：独立修改一项 IM 需求

将综合程序改为：single 上限 6 字节，group 上限 12 字节，新增 notification 上限 9 字节，未知类型仍拒绝。先写预期表，再决定函数如何组织；不要引入集合、结构体或网络代码。

<details>
<summary>提示与反馈</summary>

可以新增 `limitForSession(kind string) int`，用 switch 返回各类上限；routeSession 同时补通知标签。main 仍先拒绝未知标签，再取得上限并调用 validateText。还可以设计一个返回标签和上限的普通函数，但需要逐项讲清返回契约。

至少验证：single 的 `"你好呀"` 为 9 字节，应拒绝；group 同样文本应通过；notification 的 `"你好呀"` 恰好到上限；`"欢迎来到这里"` 为 18 字节，对三个上限都超限；未知类型无论文本如何都拒绝；空文本仍拒绝。新增类型不只改一条 case，还需要分类、规则与验证相互一致。

以上限制为教学需求。不要把练习的新通知类型或上限说成已经修改了 OpenIM。

</details>

### 8.8 最后留下什么学习证据

完成基础阅读后，留下：一份正常与拒绝路径表、一张循环状态表、一张普通函数调用表，以及一份自己改过规则的本地程序。第二遍阅读后，再补递归展开和闭包变量关系。

实际运行时记录输入、命令、输出和自己的解释；没有运行时标为预测。看到参考答案不等于已经能处理新输入，至少再改变一个条件独立分析。

下一章 [01.04 数组、切片与文本](../deeptutor_01_04/reviewed.md) 将把固定单条输入扩展为多条消息，讲清列表、下标、底层共享、复制与文本边界。此时再回到循环，就能区分“重复处理一个固定值”和“遍历一组不同消息”。

## 核对资料

- [Go 规范：if](https://go.dev/ref/spec#If_statements)、[switch](https://go.dev/ref/spec#Switch_statements)与[for](https://go.dev/ref/spec#For_statements)：分支与循环的执行规则。
- [Go 规范：break](https://go.dev/ref/spec#Break_statements)、[continue](https://go.dev/ref/spec#Continue_statements)与[return](https://go.dev/ref/spec#Return_statements)：控制转移的作用范围。
- [Go 规范：函数调用](https://go.dev/ref/spec#Calls)与[函数字面量](https://go.dev/ref/spec#Function_literals)：参数、调用结果与闭包。
- [OpenIM 固定发布版本](https://github.com/openimsdk/open-im-server/releases/tag/v3.8.3-patch.16)：本章源码定位的版本依据。

官方规范用于核对行为，练习需要的基础已在正文给出；上游源码按已学概念逐步阅读。
