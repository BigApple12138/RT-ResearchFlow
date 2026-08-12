# 讨论压缩检查点 Restore UI Implementation Plan

> **For agentic workers:** 按任务勾选执行；对照 [`../specs/2026-08-12-compaction-checkpoint-restore-ui-design.md`](../specs/2026-08-12-compaction-checkpoint-restore-ui-design.md)。推荐 inline 或 subagent-driven。

**Goal：** 讨论区展示压缩检查点列表，并支持「恢复最近整理」（仅最新一层）。

**Architecture：** 复用已有 `listDiscussionCompactionCheckpoints` / `restoreDiscussionCompaction` IPC；Renderer 在 `AIAnalysis` 讨论 tab 加载列表；纯函数标记 latest；恢复后刷新 session detail。无 Migration、不改 restore 栈语义。

**Tech Stack：** React 18、TypeScript、既有 `window.api.ai`、Vitest。

**状态：** 已完成（2026-08-12）

## Global Constraints

- 仅恢复最新检查点；更早条目只读提示。
- UI 文案用「整理 / 检查点 / 恢复最近一层」，不暴露 OpenClaw/方舟品牌。
- 不新增 Migration；不扩展任意 `compactionId` 跳点恢复。
- Renderer 不直连 DB；`requestId` 必须 UUID。
- 忙碌态与「整理聊天上下文」一致（追问 / 整理 / Agent busy 禁用）。

---

### Task 1: 检查点列表视图模型 + 单测

**Files:**
- Create: `src/components/AIAnalysis/compactionCheckpointListModel.ts`
- Create: `tests/unit/compactionCheckpointListModel.test.ts`

- [x] **Step 1–4:** 视图模型与单测已落地并通过

---

### Task 2: AIAnalysis 加载列表 + 恢复交互 + README

**Files:**
- Modify: `src/components/AIAnalysis/AIAnalysis.tsx`
- Modify: `src/components/AIAnalysis/README.md`

- [x] **Step 1–5:** 列表/恢复 UI、busy 禁用、README、相关单测

---

### Task 3: 设计初衷检核

## 设计初衷检核

| Spec 项 | 结果 | 说明 |
|---|---|---|
| 检查点列表可见 | 符合 | `ai-compaction-checkpoints` |
| 仅恢复最新 | 符合 | 按钮不传旧 id；更早条目只读文案 |
| 忙碌禁用 | 符合 | 与整理/追问/Agent busy 联动 |
| 无检查点不渲染 | 符合 | length===0 不显示按钮与列表 |
| 不扩展任意 id 恢复 | 符合 | 未改 IPC 语义；P2 单测仍覆盖 NOT_LATEST |
| README 更新 | 符合 | Context Engine P2 条 |

---

## 修订记录

- 2026-08-12：用户批准 design（方案 B）；写 plan 并执行完成。
