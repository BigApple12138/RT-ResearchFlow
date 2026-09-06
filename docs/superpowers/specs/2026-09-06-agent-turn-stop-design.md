# Agent 主路径停止生成设计

**状态：** 已完成（2026-09-06）  
**日期：** 2026-09-06  
**Plan：** [`../plans/2026-09-06-agent-turn-stop.md`](../plans/2026-09-06-agent-turn-stop.md)  
**承接：** [`2026-08-30-ai-followup-stop-design.md`](./2026-08-30-ai-followup-stop-design.md)（followUp 已交付）；beta.6 已知限制「Agent 主路径无停止」

## 1. 问题

默认启用 `ai:agentTurn` 时，composer 停止按钮仅绑定 `followUpDraft.streaming`，用户几乎看不到「停止」。编排器 `runAgentTurn` **已支持** `signal?: AbortSignal` 与 `terminal: 'cancelled'`，但 `agentTurnService` / IPC / UI **未接线**，且 `reasoningCall` 未把 signal 传给 `callWithFallback`，中止无法打断 HTTP 流。

## 2. 目标

1. Agent 回合进行中（未 `done|error|cancelled`）显示「停止」，点击后 abort 当前 `requestId`。  
2. 复用现有 `followUpAbortRegistry`（同键 `requestId`）；IPC 可复用 `ai:followUpStop`（语义改为「讨论回合停止」）或新增 `ai:agentTurnStop` 调同一注册表——**推荐复用 `ai:followUpStop`**，避免双通道。  
3. `buildDefaultReasoningCall` / `reasoningCall` 将 `signal` 传入 `callWithFallback`，仅 `signal.aborted` 跳过 fallback。  
4. 编排器：`reasoningCall` 抛 Abort / `signal.aborted` → `finish('cancelled')`；外层 catch 勿把 Abort 当 `error`。  
5. 账本：用户句必留；有流式正文则助手 +「（已停止）」+ `cancelDiscussionTurnRequest`；无正文仅用户句 + cancelled。  
6. HITL 等待中停止：拒绝该 turn 下挂起的 HITL（`approved: false`），以免死等。  
7. **不**借此取消已 `wait_subagent` 的深度研究（该路径已有 `researchAgent:cancelRun`）；若 turn 已返回 waitingSubagent，stop 返回 `NOT_RUNNING`。

## 3. 非目标

- 不改深度研究取消语义。  
- 不做「重新生成」。  
- 不合并 upstream。

## 4. 方案要点

| 层 | 改动 |
|---|---|
| Registry | agentTurn 开始 `registerFollowUpAbort`，finally `remove` |
| Service | `runAgentTurn({ signal })`；cancelled 时按 §2.5 落库 |
| Reasoning | `callWithFallback(..., signal)` |
| Orchestrator | Abort → cancelled；HITL 前 `abort` 监听或 stop 时 `rejectPending` |
| HitlGate | `rejectPendingByPrefix(requestId)` |
| UI | `sendingFollowUp && agentPath && !terminal` 显示停止；点击现有 `handleFollowUpStop` |
| Docs | AIAnalysis README + README 已知限制去掉「Agent 无停止」 |

## 5. 验收

1. Agent 流式/工具回合中点停止：流中止、UI 可输入、账本诚实。  
2. 无正文停止：仅用户句。  
3. 停止后同会话可立即再发。  
4. `NOT_RUNNING` 幂等。  
5. 单测：registry + service cancel 落库 + orchestrator Abort；契约 preload/IPC。  
6. `verify` 绿。
