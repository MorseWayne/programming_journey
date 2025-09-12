---
title: 模拟面试
icon: /assets/icons/article.svg
order: 1
category:
  - Interview
  - Rust
---

## 问题1

Rust 最核心的特性之一是 **所有权（Ownership）**。
请你用自己的话解释一下什么是所有权，以及它和借用（Borrowing）、生命周期（Lifetime）之间的关系。

::: details 查看答案

**所有权规则：** rust中的每一个值都被一个变量拥有，且只能有一个拥有者，当拥有者离开作用域时，这个值会被drop；
**借用**：分可变和不可变引用；可同时有多个不可变引用，或一个可变引用，但不能混用；

**生命周期（Lifetime）**
Rust 编译器用“生命周期”来静态检查引用的有效性，确保不会出现悬垂引用。比如函数返回引用时，编译器需要知道这个引用和输入值的生命周期关系。

**移动与拷贝**
当所有权转移（`move`）时，旧变量就不能再使用该值；如果类型实现了 `Copy` trait，才会发生按值拷贝而不是移动。

:::

## 问题2

在 Rust 中，`String` 和 `&str` 有什么区别？它们各自适合在什么场景下使用？

::: details 查看答案

**`String`**：

- 堆上分配，拥有自己的所有权。
- 可变、可增长、可以修改内容。
- 适合需要动态拼接、修改字符串的场景。

**`&str`**：

- 字符串切片（引用），不拥有数据。
- 通常是不可变的（`&mut str` 也存在但少见）。
- 常用于字符串字面量（`"hello"`）、函数参数接收时避免拷贝。

**底层结构**：
 `String` 本质上是对 `Vec<u8>` 的封装，带有容量（`capacity`）、长度（`len`）等元信息，而 `&str` 只是指向 `UTF-8` 字节序列的一段不可变切片，不包含容量信息。

**类型转换**：

- `String` 可以通过 `as_str()` 或 `&*my_string` 得到 `&str`。
- `&str` 可以通过 `to_string()` 或 `String::from()` 变成 `String`。

:::

## 问题3

在 Rust 中，`Result<T, E>` 和 `Option<T>` 都是常见的枚举类型。
 请你分别解释它们的含义和使用场景，并说说为什么 Rust 要用这两种枚举类型来处理错误或缺失值，而不是像 C/C++ 用 `NULL` 或异常机制。

::: details

- `Option<T>`
    - 用 `Some(T)` 表示有值，用 `None` 表示无值。
    - 主要用于“值可能缺失”的场景（例如查找不到元素、配置项为空等）。
- `Result<T, E>`
    - 用 `Ok(T)` 表示成功，用 `Err(E)` 表示错误。
    - 主要用于“操作可能失败”的场景（文件 I/O、网络请求、解析等）。
- **相比 C/C++ 的 NULL 或异常机制**
    - Rust 通过类型系统把“可能为空/错误”的情况**显式**化，编译器强制你处理 `None` 或 `Err`，大幅降低了空指针/未处理异常带来的运行时崩溃。
    - 配合 `?` 运算符可以写出很流畅的错误传播，比传统的 `if/else` 或返回码更清晰。

可以再补充两点让回答更亮眼：

1. `Option` 只是“有无值”的语义，`Result` 是“成功/失败”的语义；二者通过 `match`、`if let`、`?` 运算符都能优雅处理。
2. 这两种枚举都是 **零开销抽象**（zero-cost abstraction），在优化后不会有额外运行时开销。

:::

## 问题4

Rust 里的并发模型有一个很重要的概念是 `Send` 和 `Sync` 这两个 trait。
 请你解释一下它们分别表示什么含义，什么时候需要自己实现（或避免实现）它们？以及为什么 Rust 要用这两个 trait 来保证并发安全？

::: details 查看答案

### 1️⃣ `Send` trait

- **含义**：
     `Send` 表示“这个类型的值可以**安全地被移动到另一个线程**”。
    - 所有基本类型（`i32`、`bool`、`String` 等）默认都实现了 `Send`。
    - 但像 `Rc<T>` 这种引用计数的非线程安全类型**没有**实现 `Send`。
- **用途**：
     当你把一个值通过 `std::thread::spawn` 传给新线程时，编译器会要求这个值是 `Send`，否则编译不过。

------

### 2️⃣ `Sync` trait

- **含义**：
     `Sync` 表示“这个类型的**引用**可以安全地在多个线程之间共享”。
    - `&T` 实现 `Sync` 的前提是 `T` 可以在多个线程中安全地同时访问。
    - 例如 `Arc<T>` 实现了 `Sync`，因为内部有原子引用计数；`Mutex<T>` 也实现了 `Sync`。
    - 但 `Cell<T>`、`RefCell<T>` 等非线程安全的内部可变类型**没有**实现 `Sync`。

------

### 3️⃣ 什么时候需要自己实现

- 绝大多数情况下不需要自己手动实现 `Send`/`Sync`，Rust 会根据类型组成自动推导。
- 如果你自己实现底层并发安全机制（例如用 `unsafe` 包装系统资源），可以通过 `unsafe impl Send` / `unsafe impl Sync` 告诉编译器你保证线程安全。
- 如果实现不当，会引入数据竞争或未定义行为，所以必须非常小心。

------

### 4️⃣ 为什么 Rust 要用这两个 trait

- 它们是 Rust 保证**编译期并发安全**的基石：
    - `Send` 确保跨线程传递的对象在内存上是安全的。
    - `Sync` 确保跨线程共享的对象在内存访问上是安全的。
- 有了它们，Rust 才能在不依赖运行时锁和垃圾回收的情况下提供 **无数据竞争** 的并发模型。

------

总结：

- `Send` = 值可被安全**移动**到另一个线程
- `Sync` = 值的**引用**可在多个线程间安全共享
- 默认由编译器推导，除非你写底层并发代码，一般不需要手动实现

:::

## 问题5

Rust中的模式匹配（Pattern Matching）是一个非常强大的特性。请解释一下match表达式和if let的区别，并举例说明什么时候使用match，什么时候使用if let？

::: details 查看答案

- `match`适合多个模式或复杂条件 , `match`是穷尽的，必须处理所有可能的分支;
- `if let`适合解析`Option`等类型，判断有效性后取值，只关心 Some 的情况，忽略 None;
- `match`可以返回值，`if let`通常用于副作用操作;

:::

## 问题6

`Rust`中的`trait`是核心概念之一。请解释什么是`trait`，它与接口（`interface`）有什么区别？并说明`trait bound`、`trait object`和`associated types`的概念。请思考一下trait的基本概念，以及这三个相关概念的含义和用途。

::: details

`Rust` 中的 `trait` 是一种定义共享行为的机制，它类似于其他语言中的接口（`interface`），但更灵活。`trait` 可以定义方法签名（抽象方法），也可以提供默认实现（具体方法）。类型可以通过 `impl Trait for Type` 来实现一个 `trait`，从而“继承”这些行为。`trait` 是 `Rust` 多态性和代码复用的核心，用于实现泛型编程和抽象。例如：

```rust
trait Animal {
    fn speak(&self);  // 抽象方法
    fn eat(&self) {   // 默认实现
        println!("Eating...");
    }
}

struct Dog;
impl Animal for Dog {
    fn speak(&self) {
        println!("Woof!");
    }
}
```

**与接口（interface）的区别：**

**相似点**：两者都定义了行为契约，允许不同类型实现相同的接口/trait 来实现多态；

**区别：**

- `trait` 可以提供默认方法实现，而传统接口（如 Java 的 interface 在 Java 8 之前）通常不允许默认实现（Java 8 后引入了默认方法，但 Rust 的 trait 更早且更灵活）。

- Rust 的 trait 支持关联类型（associated types）和 trait bound（泛型约束），这在许多接口系统中没有直接对应；

- trait 是零开销抽象(zero-cost abstraction)，编译时解析，而接口往往涉及运行时开销(如虚表);

- trait 可以作为对象使用(trait object)，支持动态分发，但默认是静态分发；接口通常是动态的。

- Rust 的 trait 支持链式继承和多重继承，因为类型可以实现多个 trait，但 trait 本身可以继承其他 trait（supertrait）

    总体上，trait 更注重编译时安全和性能；

**Trait Bound 的概念和用途：**

`Trait bound` 是泛型编程中的约束，用于指定泛型类型必须实现某些 `trait`。它通过语法如 `T: Trait` 或 `where T: Trait` 来表示，确保函数或结构体在编译时知道类型支持哪些操作。

用途：

- 实现泛型函数的安全性，例如 `fn add<T: Add>(a: T, b: T) -> T::Output`，要求 T 实现 `Add trait`。
- 避免运行时错误，推动编译时检查。
- 支持条件实现，如 `impl<T: Display> ToString for T`。 这使得代码更通用且类型安全。

**Trait Object 的概念和用途：**

`Trait object` 是 `trait` 的动态版本，使用 `&dyn Trait` 或 `Box<dyn Trait>` 表示，允许在运行时处理不同类型，只要它们实现了该 trait。它启用动态分发`（dynamic dispatch）`，类似于虚函数，但会引入虚表`（vtable）`开销。 用途：

- 处理异构集合，例如 `Vec<Box<dyn Animal>>`，可以存储不同类型的动物。
- 当静态类型未知时使用，如插件系统或 `trait` 作为返回类型。
- 注意：`trait object` 要求 `trait` 是 `object-safe` 的（不能有泛型方法或 `Self` 返回等）。相比静态分发，它牺牲了一些性能以换取灵活性。

**Associated Types 的概念和用途：**

`Associated types` 是 `trait` 中定义的类型别名，使用 `type` 关键字，如 `type Item;`。它允许 `trait` 定义与实现相关的类型，而不指定具体类型，由实现者决定。 用途：

- 避免泛型参数过多，例如在 `Iterator trait` 中：`trait Iterator { type Item; fn next(&mut self) -> Option<Self::Item>; }`，`Item` 是关联类型。
- 提高可读性和灵活性，例如在图算法中定义 `type Node` 和 `type Edge`。
- 与泛型 `trait` 结合，支持更精确的类型约束，如 `T: Iterator<Item = i32>`。 这使得 trait 更抽象和可扩展，避免了像 `trait Iterator<T>` 这样的泛型参数在某些场景下的不便。

总结：`Trait` 是 `Rust` 抽象的核心，`trait bound` 确保静态安全，`trait object` 提供动态灵活性，`associated types` 增强类型表达力。这些概念共同构筑了 Rust 的强大类型系统。

:::

## 问题7

在 Rust 中，`async` 和 `await` 是异步编程的核心关键字。请解释一下 `Rust` 的异步模型是什么样的，它和 `JavaScript` 或 `C#` 中的异步有什么区别？另外，谈谈在 `Rust` 中使用 `async` 时需要注意的点，比如 `Futures`、执行器（`Executor`）和 `Pinning` 的作用。

::: details

Rust 的异步编程基于 `Future trait` 和 `async/await` 语法，是一种零开销的异步抽象。`async` 关键字将函数或代码块标记为异步，生成一个实现 `Future trait` 的类型。`await` 用于暂停异步函数的执行，直到 `Future` 完成并返回结果。**Rust 的异步模型是显式的，**依赖用户选择的执行器（`Executor`）来调度任务，而不是像其他语言内置运行时。 核心组件：

- **Future**: `Future trait` 定义了异步计算，包含 `poll` 方法，描述了一个可以被轮询（`polled`）以检查完成状态的任务;
- **执行器**: Rust 不提供内置运行时，用户需要选择一个执行器（如 `tokio、async-std`）来驱动 `Future` 执行;
- **任务调度**: 执行器负责调度多个异步任务，处理 `I/O` 事件和唤醒机制;

Rust 的异步是零开销抽象，`async` 函数在编译时被转换为状态机，性能接近手写状态机, 而像 `JavaScript` 和 `C#` 的异步模型通常有运行时开销（如垃圾回收或线程池管理)。

### 问题7的标准答案

**Rust 的异步模型：**  
Rust 的异步编程基于 `Future` trait 和 `async`/`await` 语法，是一种零开销的异步抽象。`async` 关键字将函数或代码块标记为异步，生成一个实现 `Future` trait 的类型。`await` 用于暂停异步函数的执行，直到 `Future` 完成并返回结果。Rust 的异步模型是显式的，依赖用户选择的执行器（Executor）来调度任务，而不是像其他语言内置运行时。  
核心组件：  
- **Future**: `Future` trait 定义了异步计算，包含 `poll` 方法，描述了一个可以被轮询（polled）以检查完成状态的任务。  
- **执行器**: Rust 不提供内置运行时，用户需要选择一个执行器（如 `tokio`、`async-std`）来驱动 `Future` 执行。  
- **任务调度**: 执行器负责调度多个异步任务，处理 I/O 事件和唤醒机制。

**与 JavaScript 和 C# 的区别：**  
1. **运行时支持**：  
   - **JavaScript**: 内置事件循环（单线程模型），由浏览器或 Node.js 提供，`async`/`await` 直接与事件循环集成。  
   - **C#**: 依赖 .NET 运行时，内置任务调度器（Task Scheduler）和线程池，`async`/`await` 自动与运行时集成。  
   - **Rust**: 无内置运行时，需显式选择执行器（如 `tokio`、`async-std`）。这使得 Rust 更轻量且灵活，但需要开发者手动配置。  
2. **性能**：  
   - Rust 的异步是零开销抽象，`async` 函数在编译时被转换为状态机，性能接近手写状态机。  
   - JavaScript 和 C# 的异步模型通常有运行时开销（如垃圾回收或线程池管理）。  
3. **生态系统**：  
   - JavaScript/C# 的异步生态高度统一，内置大量异步 API。  
   - Rust 的异步生态依赖外部库（如 `tokio`），不同库可能不完全兼容，增加了学习曲线。  
4. **错误处理**：  
   - Rust 使用 `Result` 和 `Option` 结合 `?` 运算符处理异步错误，显式且类型安全。  
   - JavaScript 使用 `try/catch` 和 Promise 链，C# 也使用 `try/catch`，错误处理更动态但可能丢失类型信息。

**使用 `async` 时需要注意的点：**  
1. **Futures**：  
   - `Future` 是惰性的，只有被执行器轮询（`poll`）时才会执行。  
   - 开发者需显式调用 `.await` 或将其交给执行器，否则异步代码不会运行。  
   - 必须确保 `Future` 的生命周期正确，避免悬垂引用。  
   - 示例：
     ```rust
     use std::future::Future;
     async fn example() -> i32 { 42 }
     let fut = example(); // 创建 Future，但未执行
     let result = futures::executor::block_on(fut); // 使用执行器运行
     ```
2. **执行器（Executor）**：  
   - Rust 没有默认运行时，必须选择一个执行器（如 `tokio::runtime::Runtime` 或 `async-std`）。  
   - 不同执行器有不同特性（如 `tokio` 适合高性能 I/O，`async-std` 更轻量）。  
   - 需要在程序入口（如 `main`）设置运行时，例如：
     ```rust
     #[tokio::main]
     async fn main() {
         let result = async_function().await;
     }
     ```
3. **Pinning**：  
   - 某些 `Future`（如自引用类型）在内存中不能移动，需要 `Pin` 来固定其内存位置。  
   - `async` 块和函数编译后是状态机，可能包含自引用数据结构，`Pin` 确保这些结构在轮询期间保持稳定。  
   - 使用 `Pin` 的场景：  
     - 手动实现 `Future` 或使用 `async` 块时，可能需要 `Pin<&mut T>` 或 `Box::pin`。  
     - 常见库（如 `tokio`）会自动处理 `Pin`，但开发者需了解其存在。  
     - 示例：
       ```rust
       use std::pin::Pin;
       async fn pinned_future() {
           // 内部状态机可能需要 Pin
       }
       let pinned = Box::pin(pinned_future());
       ```
4. **其他注意点**：  
   - **性能**：避免在 `async` 函数中执行阻塞操作（如 `std::thread::sleep`），应使用异步版本（如 `tokio::time::sleep`）。  
   - **Send 和 Sync**：异步任务通常需要 `Future: Send` 以跨线程运行，需确保使用的类型满足线程安全要求。  
   - **取消安全**：Rust 的异步不支持内置取消，需手动实现取消逻辑（如 `tokio::select!`）。  
   - **生态分裂**：选择异步库时需注意兼容性（如 `tokio` 和 `async-std` 的 API 差异）。

**总结**：  
Rust 的异步模型通过 `Future`、`async`/`await` 和外部执行器提供灵活、高效的异步编程。相比 JavaScript 和 C#，Rust 更加显式和低开销，但需要开发者手动管理运行时和 Pinning 等复杂性。正确使用 Futures、选择合适的执行器并理解 Pinning 的作用，是编写高效异步 Rust 代码的关键。

:::

## 问题8

在 Rust 中，`unsafe` 关键字允许开发者绕过某些编译器安全检查。请详细解释 Rust 中 `unsafe` 的作用和使用场景，并举例说明哪些情况下必须使用 `unsafe`。此外，谈谈在编写 `unsafe` 代码时，如何确保安全性和避免常见错误（如内存泄漏或数据竞争)?

::: details 查看答案

在 Rust 中，`unsafe` 关键字允许开发者绕过 `Rust` 的编译时安全检查，执行一些编译器无法静态验证的操作。Rust 的安全模型（所有权、借用检查等）确保内存安全和线程安全，但某些场景需要直接操作底层资源或实现特定优化，这时需要 `unsafe`。它告诉编译器：“我保证这段代码是安全的，尽管你无法验证。” `unsafe` 本身并不意味着代码不安全，而是将安全责任转移给开发者。

:::

## 问题9

Rust 的闭包（closure）是一个强大的特性，它允许你创建可以捕获其周围环境的匿名函数。编译器会根据闭包如何使用这些捕获的变量，为其自动推断三个 `trait` 中的一个：`Fn`、`FnMut` 和 `FnOnce`。

请你详细解释一下这三个 `trait` 之间的区别，它们分别对应哪种环境变量的捕获方式？并为每种 `trait` 提供一个简单的代码示例。

::: details

`Fn`、`FnMut` 和 `FnOnce` 这三个 `trait` 是由编译器自动为闭包实现的，用来约束闭包如何与其捕获的环境进行交互。它们的核心区别在于**对捕获变量的所有权处理方式不同**，从而决定了闭包可以被调用的次数。

这个关系可以看作一个层级：所有实现 `Fn` 的闭包也自动实现了 `FnMut` 和 `FnOnce`；所有实现 `FnMut` 的闭包也自动实现了 `FnOnce`。

`Fn` ⊂ `FnMut` ⊂ `FnOnce`

编译器会根据闭包体内的代码，尽可能地为闭包推断出最通用的 `trait`（即最左边的 `Fn`）。

#### 1. `FnOnce`

- **捕获方式**：获取捕获变量的**所有权**（Move）。
- **含义**：`Once` 表示这个闭包**最多只能被调用一次**。
- **解释**：因为它会消耗掉（move）捕获的变量，一旦调用完成，这些变量的所有权就移出了闭包，闭包自身也变为无效状态，因此无法再次调用。所有闭包都至少实现了 `FnOnce`。

示例：

这个闭包捕获了 name 变量的所有权。当 goodbye() 被调用时，name 的所有权被移交给了 println! 宏，因此 goodbye 无法被再次调用。

```rust
fn main() {
    let name = String::from("Alice");

    // move关键字强制获取所有权，但即使没有它，
    // println! 也会消耗String，所以编译器仍会推断为 FnOnce
    let goodbye = move || {
        println!("Goodbye, {}", name);
    };

    goodbye();

    // 如果取消下面的注释，代码将无法编译，因为 goodbye 已经被消耗
    // goodbye();
}
```

#### 2. `FnMut`

- **捕获方式**：以**可变借用**（`&mut T`）的方式捕获变量。
- **含义**：`Mut` 表示这个闭包可以**被多次调用**，并且在调用过程中**可以修改**其捕获的环境变量。
- **解释**：因为它只是可变地借用了变量，而不是拿走所有权，所以闭包在调用后依然有效，可以重复调用以持续修改环境。

示例：

这个闭包 increment 捕获了 count 的可变引用。每次调用它时，都会修改 count 的值。

Rust

```rust
fn main() {
    let mut count = 0;

    // 闭包内部修改了 count 的值，所以它需要可变借用
    let mut increment = || {
        count += 1;
        println!("Count is now: {}", count);
    };

    increment(); // 输出: Count is now: 1
    increment(); // 输出: Count is now: 2
}
```

#### 3. `Fn`

- **捕获方式**：以**不可变借用**（`&T`）的方式捕获变量。
- **含义**：这是最严格的 `trait`，表示闭包可以**被多次调用**，但**不能修改**其捕获的环境变量。
- **解释**：闭包只对环境变量进行只读访问，这是最安全、最灵活的捕获方式。

示例：

闭包 greet 不可变地借用了 greeting。它只是读取 greeting 的值，而没有做任何修改，因此它可以被安全地多次调用。

Rust

```rust
fn main() {
    let greeting = String::from("Hello");

    // 闭包只是读取 greeting 的值，所以它只需要不可变借用
    let greet = || {
        println!("{}, world!", greeting);
    };

    greet();
    greet();
}
```

总结

| Trait    | 捕获方式            | 行为             | 调用次数 |
| -------- | ------------------- | ---------------- | -------- |
| `Fn`     | 不可变借用 (`&T`)   | 只能读取环境变量 | 多次     |
| `FnMut`  | 可变借用 (`&mut T`) | 可以修改环境变量 | 多次     |
| `FnOnce` | 获取所有权 (`T`)    | 会消耗掉环境变量 | 一次     |

:::

## 问题10

Rust 的借用检查器在编译时强制执行了非常严格的规则：在一个作用域内，一个值要么只能有多个不可变引用（`&T`），要么只能有一个可变引用（`&mut T`）。

但在某些特殊场景下，我们需要在一个持有不可变引用的上下文中去修改数据。为了解决这个问题，`Rust` 提供了“内部可变性”（`Interior Mutability`）模式。

请你解释一下什么是**内部可变性**，并详细说明 `Cell<T>` 和 `RefCell<T>` 这两种主要类型的区别、各自的开销以及它们的使用场景。最后，请简要说明为什么它们不适用于多线程环境，以及在多线程中应该使用什么替代方案。

::: details

#### 1. 什么是内部可变性？

**内部可变性**（Interior Mutability）是 Rust 中的一种设计模式。它允许你在拥有一个不可变引用 `&T` 的情况下，依然能够修改 `T` 内部的数据。

这看起来违背了 Rust 的核心借用规则（不可变引用无法修改数据），但实际上，它并没有绕过安全性。它只是将**借用规则的检查从编译时（compile time）推迟到了运行时（runtime）**。如果违反了规则（例如，在运行时创建了多个可变借用），程序会立即 `panic`，从而阻止了未定义行为的发生。

这个模式对于某些无法在编译期静态证明其安全性的场景至关重要，例如：

- 实现循环数据结构（如图、树）。
- 在回调函数或API边界中修改捕获的状态。
- 用于测试中的模拟对象（Mocking）。

#### 2. `Cell<T>` 和 `RefCell<T>`

`Cell<T>` 和 `RefCell<T>` 是实现内部可变性的两种主要单线程类型。

##### `Cell<T>`

- **核心机制**：通过**拷贝**（`Copy`）或**移动**（`move`）值来工作。它不提供内部数据的引用，而是直接操作整个值。
    - `set(value: T)`: 替换内部的值。
    - `get() -> T`: （要求 `T` 实现 `Copy` trait）拷贝并返回内部的值。
- **开销**：**零运行时开销**。因为它的操作在编译时就能保证安全，不需要在运行时进行任何检查。
- **使用场景**：专门用于实现了 `Copy` trait 的简单类型，如 `u32`, `bool`, `f64` 等。当你需要在一个不可变结构体中修改一个字段时，`Cell` 是最轻量、最高效的选择。

**示例：**

```rust
use std::cell::Cell;

struct Config {
    version: u32,
    is_dirty: Cell<bool>, // 标记配置是否被临时修改
}

fn main() {
    let config = Config {
        version: 1,
        is_dirty: Cell::new(false),
    };

    // 尽管 config 是不可变的，我们仍然可以修改 is_dirty 字段
    config.is_dirty.set(true);

    assert_eq!(config.is_dirty.get(), true);
    println!("Config is dirty: {}", config.is_dirty.get());
}
```

##### `RefCell<T>`

- **核心机制**：在**运行时动态地执行借用检查**。它内部维护一个借用计数器。
    - `borrow() -> Ref<T>`: 返回一个不可变引用（的包装类型）。如果已经存在可变借用，则 `panic`。
    - `borrow_mut() -> RefMut<T>`: 返回一个可变引用（的包装类型）。如果已经存在任何其他借用（可变或不可变），则 `panic`。
- **开销**：有**轻微的运行时开销**，因为它需要在每次借用时检查和更新内部的计数器。
- **使用场景**：用于那些没有实现 `Copy` trait 的类型（如 `String`, `Vec<T>`），或者当你需要获得内部数据的真实引用时。

**示例：**

```rust
use std::cell::RefCell;
use std::collections::HashMap;

struct UserCache {
    // RefCell 允许我们在拥有 &UserCache 的情况下修改内部的 HashMap
    cache: RefCell<HashMap<u32, String>>,
}

impl UserCache {
    fn get_user(&self, user_id: u32) -> Option<String> {
        // 使用 borrow() 获取不可变访问权限来读取
        let cache = self.cache.borrow();
        cache.get(&user_id).cloned()
    }

    fn set_user(&self, user_id: u32, name: String) {
        // 使用 borrow_mut() 获取可变访问权限来写入
        let mut cache = self.cache.borrow_mut();
        cache.insert(user_id, name);
    }
}
```

#### 3. 区别总结

| 特性         | `Cell<T>`                                | `RefCell<T>`                           |
| ------------ | ---------------------------------------- | -------------------------------------- |
| **机制**     | 通过移动/拷贝值 (`set`/`get`)            | 运行时借用检查 (`borrow`/`borrow_mut`) |
| **类型约束** | `T` 必须实现 `Sized` (`get` 要求 `Copy`) | `T` 必须实现 `Sized`                   |
| **开销**     | 零运行时开销                             | 轻微运行时开销（用于借用计数）         |
| **失败模式** | 编译时错误（如对非`Copy`类型用`get`）    | 运行时 `panic`（如果违反借用规则）     |
| **适用场景** | `Copy` 类型，简单的状态标志              | 非 `Copy` 类型，需要获得内部数据引用时 |

#### 4. 多线程环境

`Cell<T>` 和 `RefCell<T>` 都**不是线程安全的**。它们没有实现 `Sync` trait，这意味着你无法在多个线程之间安全地共享它们的引用。它们的内部计数器（对于 `RefCell`）不是原子的，如果在多线程中访问，会引发数据竞争。

在多线程环境中，你需要使用提供了原子操作和线程同步机制的类型：

- **`Mutex<T>`**: 提供了**互斥锁**。在任何时候，只允许一个线程锁定并访问内部数据。它可以被看作是 `RefCell<T>` 的线程安全版本。如果锁已经被其他线程持有，当前线程会**阻塞**等待。
- **`RwLock<T>`**: 提供了**读写锁**。它允许多个线程同时进行读取访问，但只允许一个线程进行写入访问（且写入时不能有任何读取）。它在“读多写少”的场景下比 `Mutex` 性能更好。

:::