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

## 功能开发流程（superpowers）

较大功能或改行为时：

1. Brainstorm，对齐用户问题与范围。
2. 设计写入 [`docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`](docs/superpowers/specs/)，用户批准后再继续。
3. 实现计划写入 [`docs/superpowers/plans/YYYY-MM-DD-<feature>.md`](docs/superpowers/plans/)。
4. 用户选择执行方式后再写业务代码；改行为时同步更新相关组件 README / FR。

小修复（typo、单测转绿、明确 bugfix）可豁免完整 spec，但改动须可验证。文档目录分工见 [`docs/README.md`](docs/README.md)。不要把过程稿写进 `docs/community/` 或 `docs/releases/`。

## 文档地图

| 位置 | 真相类型 |
|---|---|
| `src/components/*/README.md` | 模块运行时行为与 **FR-xxx** 约束 |
| `docs/superpowers/specs/` | 已批准设计 |
| `docs/superpowers/plans/` | 可执行实现计划 |
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
