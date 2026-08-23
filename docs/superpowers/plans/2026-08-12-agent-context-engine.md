# 投研 Agent Context Engine Implementation Plan

> **For agentic workers:** 按任务勾选执行；对照 [`../specs/2026-08-12-agent-context-engine-design.md`](../specs/2026-08-12-agent-context-engine-design.md)。推荐 subagent-driven 或本会话 inline。

**Goal：** 落地窄 `ResearchContextEngine`：统一 assemble/compact 入口，并增加对齐 OpenClaw `shouldCompact` 的 hard 闸（字符预算）；agentTurn / followUp 共用。

**Architecture：** 新建 `researchContextEngine.ts` 封装 soft（12 对）+ hard（装配字符超 `max - reserve`）压缩与单次装配；TurnService / FollowUp 改为调用 `prepareDiscussionTurnContext`。不引入 `openclaw` 依赖；对照本地源码 `E:\代码库\git\openclaw` @ `46bdbe585f96663d6ecff932ad6790d6cd26e3a3`。

**Tech Stack：** Electron 主进程 TypeScript、既有 discussion compaction、Vitest。

**状态：** P0+P1+P2 已完成（2026-08-12）

## 设计初衷检核

| Spec 项 | 结果 | 说明 |
|---|---|---|
| OpenClaw 路径写入规格 | 符合 | design §0 |
| 窄引擎 + hard 闸 | 符合 | |
| agentTurn/followUp 共用 | 符合 | |
| P1 isolated / afterTurn / tokens | 符合 | PR #3 |
| P2 压缩前 flush | 符合 | Migration 154 + flush 表 |
| P2 检查点 list/restore | 符合 | IPC；仅最新 restore；无 UI |
| 不引入 openclaw 依赖 | 符合 | |

## 修订记录

- 2026-08-12：P0/P1/加固/审阅修复合入 PR #3。
- 2026-08-12：P2 flush + restore IPC。
