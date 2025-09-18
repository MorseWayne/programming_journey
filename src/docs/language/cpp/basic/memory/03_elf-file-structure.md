---
title: 什么是ELF文件
icon: /assets/icons/article.svg
order: 3
category:
  - C++
date: 2025-08-11
---

ELF（Executable and Linkable Format）是一种用于可执行文件、目标文件、共享库和核心转储的标准文件格式。在类Unix系统中，C++编译后的程序通常采用ELF格式。本文将详细介绍ELF文件的整体结构及其各部分的实际用途。

## ELF文件的整体结构

一个典型的ELF文件包含以下主要部分：

1. ELF头部（ELF Header）
2. 程序头表（Program Header Table）
3. 节区（Sections）
4. 节区头表（Section Header Table）

### ELF文件结构可视化

@startjson
<style>
.h1 {
    BackGroundColor Gray
    FontColor white
    FontStyle italic
}
</style>

# highlight "ELF_File" / "description" <<h1>>

# highlight "ELF_File" / "ELF_Header" / "description" <<h1>>

# highlight "ELF_File" / "Program_Header_Table" / "description" <<h1>>

# highlight "ELF_File" / "Sections" / "description" <<h1>>

# highlight "ELF_File" / "Section_Header_Table" / "description" <<h1>>

{
    "ELF_File": {
        "description": "<b>ELF文件整体结构</b>",
        "ELF_Header": {
            "description": "<color:#99CC00><b>ELF头部</b></color>，包含文件标识和基本信息",
            "fields": {
                "e_ident": "魔数和标识信息",
                "e_type": "文件类型（可执行文件、目标文件等）",
                "e_machine": "目标架构（x86_64、ARM等）",
                "e_entry": "程序入口点地址",
                "e_phoff": "程序头表偏移量",
                "e_shoff": "节区头表偏移量",
                "e_phnum": "程序头表条目数",
                "e_shnum": "节区头表条目数"
            }
        }
        ,
        "Program_Header_Table": {
            "description": "<color:#99CC00><b>程序头表</b></color>，描述如何加载程序到内存",
            "fields": {
                "p_type": "段类型",
                "p_offset": "文件中的偏移量",
                "p_vaddr": "虚拟地址",
                "p_paddr": "物理地址",
                "p_filesz": "文件中的大小",
                "p_memsz": "内存中的大小",
                "p_flags": "段标志（可读、可写、可执行）",
                "p_align": "对齐要求"
            }
        }
        ,
        "Sections": {
            "description": "<color:#99CC00><b>节区</b></color>，存储实际数据和代码",
            "types": {
                "Code_Sections": {
                    ".text": "<i>编译后的机器代码</i>",
                    ".rodata": "<i>只读数据（字符串常量、const变量）</i>"
                }
                ,
                "Data_Sections": {
                    ".data": "<i>已初始化的全局变量和静态变量</i>",
                    ".bss": "<i>未初始化的全局变量和静态变量</i>",
                    ".comment": "<i>编译器版本信息</i>"
                }
                ,
                "Symbol_Sections": {
                    ".symtab": "<i>符号表</i>",
                    ".strtab": "<i>字符串表</i>",
                    ".rel.text/.rela.text": "<i>重定位表</i>"
                }
                ,
                "Debug_Sections": {
                    ".debug_info": "<i>调试信息</i>",
                    ".line": "<i>源代码行号与机器码地址映射</i>"
                }
            }
        }
        ,
        "Section_Header_Table": {
            "description": "<color:#99CC00><b>节区头表</b></color>，描述节区信息",
            "fields": {
                "sh_name": "节区名称",
                "sh_type": "节区类型",
                "sh_flags": "节区标志",
                "sh_addr": "节区在内存中的地址",
                "sh_offset": "节区在文件中的偏移量",
                "sh_size": "节区大小",
                "sh_link": "链接到其他节区的索引",
                "sh_info": "附加信息",
                "sh_addralign": "对齐要求",
                "sh_entsize": "表项大小（如果节区包含表）"
            }
        }
    }
}
@endjson

## 详细介绍

### 1. ELF头部（ELF Header）

ELF头部位于文件的开始位置，用于标识文件的类型、目标架构、入口点地址等关键信息。它的主要作用是让系统能够识别这是一个ELF文件，并了解如何处理它。

**主要字段及用途：**

- `e_ident`：包含魔数（Magic Number）和其他标识信息，用于快速识别ELF文件
- `e_type`：指定文件类型（如可执行文件、目标文件、共享库等）
- `e_machine`：指定目标架构（如x86_64、ARM等）
- `e_entry`：程序入口点地址，操作系统加载程序后从该地址开始执行
- `e_phoff`：程序头表的偏移量
- `e_shoff`：节区头表的偏移量
- `e_phnum`：程序头表中的条目数
- `e_shnum`：节区头表中的条目数

### 2. 程序头表（Program Header Table）

程序头表包含了多个程序头（Program Header），每个程序头描述了一个段（Segment）的信息。段是操作系统加载程序时的基本单位。

**主要用途：**

- 告诉操作系统如何将文件映射到内存中
- 指定段的类型（如可加载段、动态链接段等）
- 指定段的虚拟地址、物理地址、大小等信息

### 3. 节区（Sections）

节区是ELF文件中实际存储数据和代码的地方。目标文件和可执行文件都包含多个节区，每个节区负责存储特定类型的信息。

**常见节区及其用途：**

| 节区类别       | 节区名称                 | 描述                                                                 |
|----------------|--------------------------|----------------------------------------------------------------------|
| 代码相关节区   | .text                    | 存储编译后的机器代码（指令）                                         |
| 代码相关节区   | .rodata                  | 存储只读数据（如字符串常量、const变量）                             |
| 数据相关节区   | .data                    | 存储已初始化的全局变量和静态变量                                     |
| 数据相关节区   | .bss                     | 存储未初始化的全局变量和静态变量<br>(在文件中不占用空间，加载时分配内存并初始化为0) |
| 数据相关节区   | .comment                 | 存储编译器版本信息等注释                                             |
| 符号相关节区   | .symtab                  | 符号表，存储函数、变量等符号的信息                                   |
| 符号相关节区   | .strtab                  | 字符串表，存储符号名称等字符串                                       |
| 符号相关节区   | .rel.text / .rela.text   | 重定位表，存储需要重定位的代码位置信息                               |
| 调试相关节区   | .debug_info              | 存储调试信息                                                         |
| 调试相关节区   | .line                    | 存储源代码行号与机器码地址的映射关系                                 |

### 4. 节区头表（Section Header Table）

节区头表包含了多个节区头（Section Header），每个节区头描述了一个节区的信息。

**主要用途：**

- 提供节区的名称、类型、偏移量、大小等信息
- 帮助链接器和调试器定位和解析节区内容
- 对于可执行文件，节区头表不是必需的，但通常会包含以支持调试

## ELF文件的实际应用

1. **编译和链接过程**：编译器生成目标文件（.o），链接器将多个目标文件和库文件合并成可执行文件或共享库
2. **程序加载**：操作系统根据ELF文件的程序头表将文件加载到内存中并执行
3. **动态链接**：运行时动态链接器根据ELF文件中的信息加载和链接共享库
4. **调试**：调试器（如gdb）使用ELF文件中的符号表和调试信息来定位源代码和变量

## 总结

ELF文件是C++程序在类Unix系统中的标准格式，它包含了程序运行所需的所有信息。了解ELF文件的结构有助于我们更好地理解程序的内存布局、编译链接过程以及调试原理。通过分析ELF文件，我们可以深入了解程序的内部工作机制，从而编写出更高效、更可靠的C++程序。
