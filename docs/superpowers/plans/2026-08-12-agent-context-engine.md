# 投研 Agent Context Engine Implementation Plan

> **For agentic workers:** 按任务勾选执行；对照 [`../specs/2026-08-12-agent-context-engine-design.md`](../specs/2026-08-12-agent-context-engine-design.md)。推荐 subagent-driven 或本会话 inline。

**Goal：** 落地窄 `ResearchContextEngine`：统一 assemble/compact 入口，并增加对齐 OpenClaw `shouldCompact` 的 hard 闸（字符预算）；agentTurn / followUp 共用。

**Architecture：** 新建 `researchContextEngine.ts` 封装 soft（12 对）+ hard（装配字符超 `max - reserve`）压缩与单次装配；TurnService / FollowUp 改为调用 `prepareDiscussionTurnContext`。不引入 `openclaw` 依赖；对照本地源码 `E:\代码库\git\openclaw` @ `46bdbe585f96663d6ecff932ad6790d6cd26e3a3`。

**Tech Stack：** Electron 主进程 TypeScript、既有 discussion compaction、Vitest。

**状态：** P0 已完成（2026-08-12）

## Global Constraints

- 借鉴契约，不抄栈；不 npm 依赖 openclaw  
- 硬事实 `promptSent` 不被摘要改写  
- session lock / lane 串行保持  
- Commit message 中文；仅在用户要求或本「执行」路径下提交  
- P0 零 Migration；P1/P2 不在本 plan 首批强制完成（可另开修订）

## 文件地图

| 文件 | 职责 |
|---|---|
| `electron/main/services/researchContextEngine.ts` | 新建：预算常量、`shouldHardCompact`、`prepareDiscussionTurnContext` |
| `electron/main/services/agentTurnService.ts` | 改用 prepare 入口 |
| `electron/main/services/discussionFollowUpService.ts` | 改用 prepare 入口 |
| `electron/main/agent/orchestrator.ts` | `AGENT_MODEL_CONTEXT_MAX_CHARS` 与引擎常量对齐（re-export 或共用） |
| `tests/unit/researchContextEngine.test.ts` | hard 闸与 prepare 单测 |
| `src/components/AIAnalysis/README.md` | FR：双触发 Context Engine |
| OpenClaw 对照 | `packages/agent-core/src/harness/compaction/compaction.ts`（`shouldCompact`） |

---

### Task 1: ResearchContextEngine + hard 闸单测

- [x] Step 1–4：引擎、单测、常量对齐

### Task 2: agentTurn / followUp 改接统一入口

- [x] Step 1–3：共用 prepare；assemble 仍各路径一次

### Task 3: README + plan 检核 + spec 状态

- [x] Step 1–2：README FR；检核表

---

## 设计初衷检核

| Spec 项（P0） | 结果 | 说明 |
|---|---|---|
| OpenClaw 路径写入规格 | 符合 | design §0 |
| 窄引擎 assemble/compact 入口 | 符合 | `prepareDiscussionTurnContext` + 既有 buildDiscussion* |
| hard 闸（window−reserve） | 符合 | `shouldHardCompact`；48000−8000 |
| agentTurn/followUp 共用、无双重拼接 | 符合 | prepare 只 compact；assemble 一次 |
| 不引入 openclaw 依赖 | 符合 | 无依赖变更 |
| README FR | 符合 | AIAnalysis README |
| P1 isolated / P2 flush | 未做 | 分期，另开执行 |

## 修订记录

- 2026-08-12：按批准 design 写 P0 plan 并完成实现与检核。
