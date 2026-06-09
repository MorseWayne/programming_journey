---
title: 配置 Excalidraw Diagram Skill
icon: /assets/icons/programming.svg
order: 3
---

# 配置 Excalidraw Diagram Skill

[`coleam00/excalidraw-diagram-skill`](https://github.com/coleam00/excalidraw-diagram-skill) 是一个面向 coding agent 的 diagram skill。它可以用于 Claude Code，也可以作为 Codex 的本地 skill 工作流使用。它不只是生成 `.excalidraw` JSON，而是要求 agent 先设计图的表达逻辑，再渲染成 PNG 检查效果，最后根据截图修正布局。

这类 skill 适合用在架构图、流程图、协议说明图、系统交互图等场景。它的核心价值是：让图不只是“盒子和箭头”，而是能说明关系、因果、分支、汇聚和证据。

## 它解决什么问题？

直接让 AI 生成 Excalidraw 图时，经常会遇到几个问题：

- 框很多，但每个框只是文字容器；
- 箭头绕来绕去，读者不知道主线在哪里；
- 技术细节全塞进框里，导致文字截断；
- 没有渲染验证，JSON 看起来没问题，打开后才发现重叠；
- 图缺少真实请求、数据结构、事件名这类“证据”。

这个 skill 的方法论更强调：

| 原则 | 含义 |
|---|---|
| Visual argument | 图要表达观点，而不是罗列信息 |
| Isomorphism test | 去掉文字后，结构本身也应该能传达含义 |
| Evidence artifacts | 技术图要放真实 payload、代码片段、事件名或接口名 |
| Render & validate | 生成后必须渲染查看，再修正布局 |

## 推荐安装位置：Claude Code 与 Codex

Claude Code 和 Codex 都支持 skill，但推荐目录不同。不要把两套路径混在一起。

| 工具 | 位置 | 作用域 | 适合场景 |
|---|---|---|
| Claude Code | `~/.claude/skills/excalidraw-diagram/` | 当前用户全局可用 | 个人长期使用 |
| Claude Code | `.claude/skills/excalidraw-diagram/` | 当前项目可用 | 团队共享同一套画图规范 |
| Codex | `$HOME/.agents/skills/excalidraw-diagram/` | 当前用户全局可用 | 个人长期使用 |
| Codex | `.agents/skills/excalidraw-diagram/` | 当前仓库可用 | 团队共享同一套 Codex 工作流 |

如果是 Claude Code 团队项目，可以放在项目内：

```text
.claude/
  skills/
    excalidraw-diagram/
      SKILL.md
      README.md
      references/
        color-palette.md
        render_excalidraw.py
        render_template.html
        pyproject.toml
```

如果是 Codex 团队项目，推荐放在项目内：

```text
.agents/
  skills/
    excalidraw-diagram/
      SKILL.md
      README.md
      references/
        color-palette.md
        render_excalidraw.py
        render_template.html
        pyproject.toml
```

这样其他人拉取仓库后，也能看到同一份 skill 说明、颜色规范和渲染脚本。Codex 会先看到 skill 的 `name`、`description` 和路径，真正需要使用时再读取完整 `SKILL.md`，这就是 progressive disclosure。

## 从 GitHub 安装

先克隆原仓库：

```bash
git clone https://github.com/coleam00/excalidraw-diagram-skill.git
```

安装到用户级目录：

```bash
mkdir -p ~/.claude/skills
cp -r excalidraw-diagram-skill ~/.claude/skills/excalidraw-diagram
```

安装到项目级目录：

```bash
mkdir -p .claude/skills
cp -r excalidraw-diagram-skill .claude/skills/excalidraw-diagram
```

如果复制到了已经运行中的 Claude Code 会话，建议重启 Claude Code，让它重新发现 skill。

## 在 Codex 中配置

Codex 的 skill 可以显式调用，也可以由 Codex 根据 `SKILL.md` 里的 `description` 自动匹配。显式调用时，可以在提示词里写：

```text
Use the excalidraw-diagram skill.
```

或者在支持的 Codex 界面中用 `/skills` 或 `$` 选择 skill。

### 方式一：用 `$skill-installer` 本地安装

如果只是个人使用，最方便的是让 Codex 自带的 `$skill-installer` 从 GitHub 下载。可以在 Codex 对话里输入：

```text
$skill-installer

Install the skill from https://github.com/coleam00/excalidraw-diagram-skill
```

也可以直接用自然语言对 Codex 说：

```text
Use skill-installer to install coleam00/excalidraw-diagram-skill from GitHub.
```

在当前环境里，安装器会把这个 skill 放到类似下面的位置：

```text
~/.codex/skills/excalidraw-diagram-skill/
```

安装完成后，建议重启 Codex。如果新 skill 没有出现在 `/skills` 或 `$` 选择器里，通常也是重启后生效。

### 方式二：手动放到 Codex 用户级目录

如果想按 Codex manual 推荐的用户级路径管理，可以复制到 `$HOME/.agents/skills`：

```bash
git clone https://github.com/coleam00/excalidraw-diagram-skill.git
mkdir -p ~/.agents/skills
cp -r excalidraw-diagram-skill ~/.agents/skills/excalidraw-diagram
```

目录结构应该是：

```text
~/.agents/
  skills/
    excalidraw-diagram/
      SKILL.md
      references/
```

这里的关键点是：`SKILL.md` 必须在 skill 目录根部，并且 frontmatter 里要有 `name` 和 `description`。

### 方式三：手动放到 Codex 项目级目录

如果希望团队共享这套画图工作流，把它放进仓库：

```bash
mkdir -p .agents/skills
cp -r /path/to/excalidraw-diagram-skill .agents/skills/excalidraw-diagram
```

提交时建议排除本地虚拟环境：

```gitignore
.agents/skills/excalidraw-diagram/references/.venv/
```

Codex 会从当前工作目录一路向上扫描 `.agents/skills`，所以如果一个 monorepo 里只有某个子项目需要这套画图规则，可以把 skill 放在那个子项目附近；如果整个仓库都需要，放在仓库根目录的 `.agents/skills`。

### 什么时候做成 Codex plugin？

如果只是个人或单仓库使用，直接放 skill 目录就够了。

如果要分发给更多团队、打包多个 skills、附带 MCP 配置、hooks 或 app 集成，就应该升级成 Codex plugin。可以用 Codex 内置的 `@plugin-creator` 来生成 `.codex-plugin/plugin.json` 和 marketplace 配置。

简单判断：

| 需求 | 推荐 |
|---|---|
| 个人临时试用 | `$skill-installer` |
| 个人长期使用 | `~/.agents/skills` |
| 当前仓库团队共享 | `.agents/skills` |
| 多团队分发、带 MCP/hooks/app | Codex plugin |

## 配置渲染器

这个 skill 自带 Playwright 渲染器，用来把 `.excalidraw` 文件导出成 PNG。

进入 skill 的 `references` 目录：

```bash
cd .claude/skills/excalidraw-diagram/references
```

如果你是在 Codex 项目级目录里使用，对应路径通常是：

```bash
cd .agents/skills/excalidraw-diagram/references
```

如果你是用 `$skill-installer` 安装到本机 Codex 目录，对应路径可能是：

```bash
cd ~/.codex/skills/excalidraw-diagram-skill/references
```

安装 Python 依赖：

```bash
uv sync
```

安装 Playwright Chromium：

```bash
uv run playwright install chromium
```

之后就可以渲染 `.excalidraw` 文件：

```bash
uv run python render_excalidraw.py path/to/diagram.excalidraw
```

默认会在同目录生成：

```text
path/to/diagram.png
```

也可以指定输出路径：

```bash
uv run python render_excalidraw.py path/to/diagram.excalidraw \
  --output /tmp/diagram.png
```

## 修复 esm.sh 加载超时

实际配置时可能遇到这个报错：

```text
playwright._impl._errors.TimeoutError:
Page.wait_for_function: Timeout 30000ms exceeded.
```

如果超时发生在：

```python
page.wait_for_function("window.__moduleReady === true", timeout=30000)
```

通常不是 Playwright 没装好，而是 `render_template.html` 里的 Excalidraw 模块没有加载完成。

原模板可能使用：

```js
import { exportToSvg } from "https://esm.sh/@excalidraw/excalidraw?bundle";
```

这个 URL 会解析到当前最新版本。某些版本在 esm.sh 上可能因为间接依赖问题加载失败。可以把版本固定到已验证可用的 `0.18.0`：

```js
import { exportToSvg } from "https://esm.sh/@excalidraw/excalidraw@0.18.0?bundle";
```

修改位置：

```text
.claude/skills/excalidraw-diagram/references/render_template.html
```

如果是 Codex 项目级安装，则对应为：

```text
.agents/skills/excalidraw-diagram/references/render_template.html
```

如果是 `$skill-installer` 本地安装，则对应为：

```text
~/.codex/skills/excalidraw-diagram-skill/references/render_template.html
```

修完后重新执行渲染命令即可。

## 使用方式

配置好 skill 后，可以直接在 Claude Code 或 Codex 中描述你要的图：

```text
Use the excalidraw-diagram skill to create a diagram explaining the deployment flow.
```

更好的提示方式是同时给出图的目标、受众和已有材料：

```text
Use the excalidraw-diagram skill.

请基于 docs/arch/activity-deploy-flow.md 画一张活动部署链路图。
目标读者是后端研发，重点说明：
- Online 主链路
- Event Proxy 的幂等和 fanout
- 游戏服侧写入哪些副作用
- DryRun 为什么只读不写

请先设计图的结构，再生成 .excalidraw，并渲染成 PNG 检查布局。
```

如果已经有一张图，也可以要求它优化：

```text
Use the excalidraw-diagram skill to improve this existing .excalidraw file.
重点检查文字截断、箭头交叉、主次层级和证据 artifact。
```

## 画技术图的推荐流程

这个 skill 最值得保留的是它的工作流。

### 1. 先判断图的深度

简单概念图可以只画抽象结构；技术架构图应该加入真实证据，例如：

- HTTP endpoint；
- JSON 请求体；
- RPC 方法名；
- 返回 ACK；
- 状态字段；
- 关键落库步骤。

### 2. 先设计视觉结构

不要一上来就画均匀卡片。应该让形状对应行为：

| 系统行为 | 更合适的画法 |
|---|---|
| 一对多 RPC | fan-out 扇出 |
| 多服结果汇总 | convergence 汇聚 |
| 顺序步骤 | timeline 或流水线 |
| 状态写入 | stack 或分层 |
| 预检链路 | 单独旁路 |
| 异步刷新 | 虚线或弱连接 |

### 3. 再生成 Excalidraw

生成 `.excalidraw` 时，注意：

- 主要标题使用自由文本，不需要放进框；
- 容器只用于真正需要分组的内容；
- 技术证据可以用深色代码块；
- 颜色要表达语义，而不是装饰；
- 主线箭头要比辅助线更显眼。

### 4. 最后渲染验证

每次生成后都应该渲染查看：

```bash
cd .claude/skills/excalidraw-diagram/references
uv run python render_excalidraw.py path/to/diagram.excalidraw
```

检查这些问题：

- 文本是否被框截断；
- 箭头是否穿过重要节点；
- 主链路是否一眼可见；
- 辅助信息是否抢主线；
- 图是否有足够留白；
- PNG 缩放后是否仍然可读。

## 项目内提交建议

如果要把 skill 放进 Claude Code 项目仓库，建议提交这些文件：

```text
.claude/skills/excalidraw-diagram/
  .gitignore
  README.md
  SKILL.md
  references/
    color-palette.md
    element-templates.md
    json-schema.md
    pyproject.toml
    render_excalidraw.py
    render_template.html
```

不要提交本地虚拟环境：

```text
.claude/skills/excalidraw-diagram/references/.venv/
```

也可以在 skill 目录的 `.gitignore` 里保留：

```gitignore
.venv/
*.png
uv.lock
__pycache__/
```

如果团队希望锁定依赖，也可以选择提交 `uv.lock`；如果只是作为轻量工具说明，可以不提交。

如果是 Codex 项目仓库，对应目录换成 `.agents/skills`：

```text
.agents/skills/excalidraw-diagram/
  .gitignore
  README.md
  SKILL.md
  references/
    color-palette.md
    element-templates.md
    json-schema.md
    pyproject.toml
    render_excalidraw.py
    render_template.html
```

## 小结

Excalidraw Diagram Skill 的重点不是“多一个画图工具”，而是把画图变成一个可验证的工程流程：

1. 先理解系统；
2. 再选择能表达行为的视觉结构；
3. 生成 `.excalidraw`；
4. 渲染成 PNG；
5. 根据真实截图修布局。

对于架构图和流程图来说，最后一步非常关键。很多图不是“逻辑不对”，而是没有真正看过渲染结果。
