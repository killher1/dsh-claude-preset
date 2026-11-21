# dsh-claude-preset

> **中文** | [English](#english)

为 [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness) 打造的 **Claude Code 智能体预设插件**。  
将 Claude Code 的行为系统提示词、13 项核心工具描述、Plan Mode 规划结构与 9 段式上下文压缩无缝接入 DSH，同时保留 DSH 原生的沙箱策略、扩展工具与运行时上下文。

---

## 实测对比（DeepSeek V4.1 1017）

在同一模型、同一提示词任务（制作“鹈鹕骑自行车”交互网页）下的实测结果：

| 指标 | 标准模式 | 插件模式 (`dsh-claude-preset`) | 提升幅度 |
| --- | --- | --- | --- |
| **任务总耗时** | 11 分 26 秒 (686s) | **6 分 23 秒 (383s)** | **快 44.2%** |
| **Token 总用量** | 5,370,913 tok | **2,292,784 tok** | **省 57.3%** |
| **输出 Token** | 83,010 tok | **56,574 tok** | **省 31.8%** |

---

## 下载与安装使用

### 方式一：在 DSH 官方插件界面直接添加（推荐）

打开 DeepSeek Harness → 左侧 **「插件」** → 右上角 **「+ 添加插件」**，在输入框中填写 `dsh-claude-preset`，点击 **「安装」** 即可（也可以直接填写本仓库地址）：

### 方式二：从 GitHub 克隆后本地安装

```bash
git clone https://github.com/killher1/dsh-claude-preset.git
dsh plugin --profile web add ./dsh-claude-preset
```

Windows PowerShell 可直接传入本地绝对路径：

```powershell
dsh plugin --profile web add D:\path\to\dsh-claude-preset
```

### 方式三：通过 CLI 从 npm 安装

```bash
dsh plugin --profile web add dsh-claude-preset
```

> 若只用于命令行环境，可将 `--profile web` 替换为目标 profile 或省略。

### 启用插件

1. 安装完成后，**重启 `dsh web`**（或重启 DSH 服务），让 Host 与浏览器客户端加载新插件。
2. 新建会话时，在智能体预设（Preset）下拉列表中选择 **「Claude Code 预设」** 即可生效。
3. 插件以 bundle layer 形式挂载到目标 profile，**不会修改 DSH 本体安装目录**，其他预设保持完全独立。

> **注意**：
> - `dsh plugin` 底层调用 `pnpm`，若未安装请先执行 `npm install -g pnpm`。
> - 若使用 **DSH 桌面端（Electron）**，`dsh plugin --profile desktop` 会提示由桌面端独立管理，请在桌面端界面内的插件管理 / 插件市场中安装。

---

## 核心改动

1. **行为系统提示词（`index.js` + `prompt-text.js`）**
   - 置空默认 `harness:identity`，并在 `deployment:persona-prefix` 中注入完整的 Claude Code 行为规范（任务处理、代码风格、谨慎执行、完整交付、沟通汇报与安全边界）。
2. **作用域级工具描述覆盖（`index.js` + `tool-descriptions.js`）**
   - 仅在 `claude-code` 子作用域内替换 13 个核心工具的 `description`：`read`、`write`、`edit`、`glob`、`grep`、`bash`、`pwsh`、`todo_write`、`ask_user_question`、`subagent`、`subagent_fork`、`web_fetch`、`web_search`。
   - 保留 DSH 原生的参数校验、沙箱执行器以及 `apply_patch`、`read_image`、`jobs`、`schedule`、`goal`、`workflow`、`office` 等独有能力。
3. **Plan Mode 规划增强（`cordis.patch.yml`）**
   - 将 `plan-mode` 的引导模板对齐 Claude Code 的计划结构（`Context` → 单一推荐方案 → 关键文件 → 复用工具 → `Verification` 验证闭环）。
4. **9 段式上下文压缩（`compaction.js` + `cordis.patch.yml`）**
   - 在隔离的 `compaction` 分组内继承 `BasicCompactionEngine`，保留 DSH 压缩阈值与检查点锁，将压缩指令替换为 Claude Code 9 段式结构化摘要，并自动剥离 `<analysis>...</analysis>` 过程草稿。

---

<a id="english"></a>

## English

A **Claude Code agent preset plugin** for [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness).  
It ports Claude Code's behavioral system prompt, 13 core tool descriptions, Plan Mode structure, and 9-section context compaction into DSH while keeping DSH's native sandbox policies, extended tools, and runtime context intact.

### Benchmark (DeepSeek V4.1 1017)

Same model, same prompt ("Pelican on a Bicycle" interactive webpage):

| Metric | Standard Mode | Plugin Mode (`dsh-claude-preset`) | Improvement |
| --- | --- | --- | --- |
| **Total Time** | 11m 26s (686s) | **6m 23s (383s)** | **44.2% faster** |
| **Total Tokens** | 5,370,913 tok | **2,292,784 tok** | **57.3% fewer** |
| **Output Tokens** | 83,010 tok | **56,574 tok** | **31.8% fewer** |

### Installation & Usage

#### Option 1: Install in DSH Plugin UI (Recommended)

Open DeepSeek Harness → **Plugins** → **+ Add Plugin**, enter `dsh-claude-preset`, and click **Install** (you can also enter the GitHub repository URL or a local directory path):


#### Option 2: Install from GitHub Clone

```bash
git clone https://github.com/killher1/dsh-claude-preset.git
dsh plugin --profile web add ./dsh-claude-preset
```

On Windows PowerShell, pass the local checkout path:

```powershell
dsh plugin --profile web add D:\path\to\dsh-claude-preset
```

#### Option 3: Install via CLI from npm

```bash
dsh plugin --profile web add dsh-claude-preset
```

#### Enable the Preset

1. Restart `dsh web` (or your DSH host) so both the host and browser client load the plugin.
2. Start a new session and select **Claude Code** (`Claude Code 预设`) from the agent preset selector.
3. The plugin is layered onto the target profile as a bundle without modifying your DSH installation directory.

### What It Changes

1. **Behavioral system prompt (`index.js` + `prompt-text.js`)**:
   - Replaces `harness:identity` with empty text and injects the adapted Claude Code prompt into `deployment:persona-prefix`.
2. **Scoped tool-description shadowing (`index.js` + `tool-descriptions.js`)**:
   - Shadows descriptions on each `claude-code` agent's child scope (`agent.ctx.tools.register`) for 13 tools: `read`, `write`, `edit`, `glob`, `grep`, `bash`, `pwsh`, `todo_write`, `ask_user_question`, `subagent`, `subagent_fork`, `web_fetch`, `web_search`, while keeping DSH-only tools (`apply_patch`, `read_image`, `jobs`, `schedule`, `goal`, `workflow`, `office`, etc.) untouched.
3. **Plan mode (`cordis.patch.yml`)**:
   - Incorporates Claude Code's plan-writing structure (`Context`, single recommended approach, critical files, reused utilities, `Verification`) while preserving DSH's `exit_plan_mode` / `ask_user_question` / `todo_write` mechanics.
4. **Context compaction (`compaction.js` + `cordis.patch.yml`)**:
   - Subclasses `BasicCompactionEngine` inside the isolated `compaction` group (`isolate: { compaction: true, toolResultPruner: true }`) to swap in Claude Code's 9-section compaction prompt, stripping `<analysis>...</analysis>` and unwrapping `<summary>...</summary>`.

### Known Caveat (`glob` / `grep` overflow spill files)

`dsh-tool-fs-search`'s `tools/post-execute` hook saves over-cap results to a spill file only when `ctx.tools.get(exec.name, exec.agent) === tool` (exact object identity with the unshadowed `ToolDefinition`). Because `glob` and `grep` are shadowed with updated descriptions on `agent.ctx`, inline result caps remain enforced via `output.render`, while overflow spill-file creation is bypassed.

### Prompt Provenance

Adapted from Claude Code v2.1.329 (`claude-code-system-prompts`): template variables were resolved to literal text, tool names were mapped to DSH equivalents (`read`, `write`, `edit`, `glob`, `grep`, `bash`, `todo_write`, `subagent`, `subagent_fork`), `CLAUDE.md` became `AGENTS.md`, and Claude Code-specific capabilities not present in DSH (hooks, output styles, persistent memory, Chrome automation, etc.) were dropped.
