# 投研 Agent Context Engine Implementation Plan

> **For agentic workers:** 按任务勾选执行；对照 [`../specs/2026-08-12-agent-context-engine-design.md`](../specs/2026-08-12-agent-context-engine-design.md)。推荐 subagent-driven 或本会话 inline。

**Goal：** 落地窄 `ResearchContextEngine`：统一 assemble/compact 入口，并增加对齐 OpenClaw `shouldCompact` 的 hard 闸（字符预算）；agentTurn / followUp 共用。

**Architecture：** 新建 `researchContextEngine.ts` 封装 soft（12 对）+ hard（装配字符超 `max - reserve`）压缩与单次装配；TurnService / FollowUp 改为调用 `prepareDiscussionTurnContext`。不引入 `openclaw` 依赖；对照本地源码 `E:\代码库\git\openclaw` @ `46bdbe585f96663d6ecff932ad6790d6cd26e3a3`。

**Tech Stack：** Electron 主进程 TypeScript、既有 discussion compaction、Vitest。

**状态：** P0+P1 已完成（2026-08-12）

## Global Constraints

- 借鉴契约，不抄栈；不 npm 依赖 openclaw  
- 硬事实 `promptSent` 不被摘要改写  
- session lock / lane 串行保持  
- Commit message 中文；仅在用户要求或本「执行」路径下提交  
- P0 零 Migration；P1 Migration 153（tokens_before/after）

## 设计初衷检核

| Spec 项 | 结果 | 说明 |
|---|---|---|
| OpenClaw 路径写入规格 | 符合 | design §0 |
| 窄引擎 assemble/compact 入口 | 符合 | `prepareDiscussionTurnContext` |
| hard 闸（window−reserve） | 符合 | `shouldHardCompact` |
| agentTurn/followUp 共用、无双重拼接 | 符合 | prepare 只 compact |
| 不引入 openclaw 依赖 | 符合 | |
| README FR | 符合 | |
| P1 deep_start isolated | 符合 | `contextMode` + 装配快照拷贝 |
| P1 afterTurn compact | 符合 | `afterDiscussionTurnCompact` |
| P1 检查点 tokens 字段 | 符合 | Migration 153 |
| P2 flush / restore | 部分 | list 检查点已落地；flush/restore UI 另开 |

### Task 4–7（P1）+ 加固

- [x] isolated / fork
- [x] afterTurn
- [x] Migration 153
- [x] README + 检核
- [x] soft 关 hard 仍触发；session lane 注释；list checkpoints

## 修订记录

- 2026-08-12：按批准 design 写 P0 plan 并完成实现与检核。
- 2026-08-12：用户要求继续推进 → 追加并完成 P1。
- 2026-08-12：加固后提 PR（hard 独立于 soft、检查点 list）。
