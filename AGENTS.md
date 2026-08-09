# AGENTS.md — RT-ResearchFlow

给编码 Agent 的仓库说明书。人类贡献者请同时阅读 [`CONTRIBUTING.md`](CONTRIBUTING.md) 与 [`README.md`](README.md)。

## 项目是什么

本地优先的 A 股个人投研 Electron 应用：本地事实、可追溯证据、AI 辅助研判与复盘闭环。不构成投资建议，不提供自动交易。

## 技术栈与命令

- Node.js 20.x、pnpm 10.x、Electron、React 18、TypeScript、SQLite（better-sqlite3）
- Windows 上若符号链接权限不足：`pnpm install --config.node-linker=hoisted`（或用户级 `pnpm config set node-linker hoisted`）
- 原生模块变更后需按 Electron ABI 重建 `better-sqlite3`

```powershell
pnpm install --frozen-lockfile
pnpm dev
pnpm run verify
./.github/scripts/Test-PublicBoundary.ps1
```

`verify` 含 TypeScript、ESLint、单元测试与生产构建。涉及真实交互时更新 Playwright；涉及时间/网络/AI 的测试必须可重复，禁止依赖付费调用或公网瞬时状态。

## 硬边界（不可破）

- 本地优先；用户显式授权才联网。
- 不增加荐股、收益承诺、自动下单、仓位控制，或削弱风险提示。
- Renderer 不直接持有凭据、数据库连接或任意网络权限；新能力走窄 IPC + 主进程校验。
- 数据库结构变化必须新增向前 Migration（旧库升级、幂等、失败行为）。
- 不篡改历史研究账本；修订须保留来源、时间与前序关系。
- 不提交凭据、真实持仓、个人路径、运行数据库、构建产物或日志。
- 复用现有类型/服务/UI；避免无关大重构。

## 功能开发流程 — Spec-Driven Development（SDD）硬门禁

### 核心 vs 工具（必须分清）

| | 是什么 | 不是什么 |
|---|---|---|
| **核心：SDD** | 本仓库开发方法论：**先规格、再计划、再实现、再对照规格验收**。`docs/superpowers/specs` + `plans` 是一等产物，须进 git 归档并供事后检核设计初衷。 | 不是某个 Cursor 插件名，也不是「写完可以扔掉的脚手架」。 |
| **工具：superpowers skills** | 可选、可借鉴的执行辅助（如 brainstorming、writing-plans、executing-plans、verification-before-completion）。用来帮你走完 SDD 各阶段。 | **不是**方法论本身。没有装 skill、或换用别的 Agent，**仍必须走 SDD**。不得用「跑了某个 skill」替代归档的 spec/plan/检核。 |

一句话：**必须走 SDD；superpowers 只是可选工具箱。**

社区对照（概念参考，不强制引入 Spec Kit 等外部工具链）：

- [GitHub Spec Kit / SDD 概念](https://github.com/github/spec-kit/blob/main/docs/concepts/sdd.md)（Specify → Plan → Tasks → Implement → Validate）
- [Microsoft：Spec-Driven Development](https://developer.microsoft.com/blog/spec-driven-development-ai-native-engineering/)
- 实践档位：**spec-anchored**（规格与代码并存、行为变更时更新意图文档）；不是用完即弃的 spec-first，也暂不要求 spec-as-source 全量代码生成。

**默认：任何会改产品行为、UI、IPC、数据模型、投研逻辑或用户可见文案的开发，都必须走完整 SDD。**  
Agent 不得以「改动很小」「先写代码再补文档」「用户催得急」「没调用 superpowers skill」为由跳过。未批准 design/plan 之前，禁止改 `src/`、`electron/` 等业务代码（含「先实现再补 spec」）。

### 必经步骤（顺序不可跳）

| SDD 阶段 | 本仓库动作 | 可选工具（非必须） |
|---|---|---|
| Specify / Clarify | 对齐问题与非目标 → **Design** 写入 [`docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`](docs/superpowers/specs/)，**用户批准**后再继续 | brainstorming 等 skill |
| Plan / Tasks | **Plan** 写入 [`docs/superpowers/plans/YYYY-MM-DD-<feature>.md`](docs/superpowers/plans/)（任务勾选、路径、测试、提交节奏）。**必须进 git** | writing-plans 等 skill |
| Implement | 用户明确说执行后，按 task 改业务代码；改行为同步更新 `src/components/*/README.md` / FR | executing-plans / subagent-driven-development |
| Validate | 相关单测/typecheck/`verify` + 在同一份 plan 末尾填「设计初衷检核」，更新文首 `状态` | verification-before-completion |

偏差不得靠改写旧 design 正文掩盖；决策变更应追加修订说明或新日期文档。

过程稿**只**放 [`docs/superpowers/`](docs/superpowers/)（索引见 [`docs/superpowers/README.md`](docs/superpowers/README.md)）。禁止写入 `docs/community/`、`docs/releases/`。总目录见 [`docs/README.md`](docs/README.md)。  
Cursor alwaysApply 规则 [`.cursor/rules/superpowers-workflow.mdc`](.cursor/rules/superpowers-workflow.mdc) 与本节一致；**若有歧义，以本文件为准。**

### 唯一可豁免完整 spec/plan 的情形（窄名单，不得自行扩充）

同时满足才可跳过 design/plan，直接改代码：

- typo / 纯注释或文案错别字（不改语义与行为），或  
- 已有失败单测/类型错误的**明确**绿修（不借机改产品行为），或  
- 用户**书面点名**「跳过 SDD / 小修复直接改」且范围仍落在上一类。

即便豁免：改动必须可验证；涉及模块行为时仍更新对应 README。  
**新功能、行为变更、交互调整、Migration、新 IPC、趋势/AI/讨论逻辑 —— 一律不可豁免。**

## 文档地图

| 位置 | 真相类型 |
|---|---|
| `src/components/*/README.md` | 模块运行时行为与 **FR-xxx** 约束 |
| `docs/superpowers/specs/` | 设计初衷归档（批准后保留，供事后检核） |
| `docs/superpowers/plans/` | 实现计划归档（含完成后的设计初衷检核表） |
| `docs/superpowers/README.md` | superpowers 归档与检核约定 |
| `docs/community/`、`docs/releases/` | 对外社区与发版，非开发过程稿 |
| `skills/` | 应用内投研技能（巴菲特/产业链等），**不是** Cursor 开发流程 |
| `CONTRIBUTING.md` | 人类贡献与验证要求 |

实现前阅读将改动的组件 README；改行为必须更新对应 README。

## 架构提示

- 主进程：`electron/main/`（IPC、SQLite、服务）
- 预加载：`electron/preload/index.ts`（暴露 `window.api`）
- 渲染：`src/`
- AI 讨论复用 `ai:startResearchDiscussion` / `ai:followUp` 与 `ai_analysis_sessions`；深度研究有全局单 `running` 租约；会话 `messages` 为整段 JSON 覆盖写入，并发写会丢消息。

## UI 与测试

- 默认窗口约 1680×960；检查最大化、亮暗主题、键盘焦点、减少动态效果与溢出。
- 新增/改名 `data-testid` 时同步 E2E。
