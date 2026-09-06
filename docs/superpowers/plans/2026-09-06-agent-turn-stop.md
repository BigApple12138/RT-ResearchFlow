# Agent 主路径停止生成 Implementation Plan

> 对照 [`../specs/2026-09-06-agent-turn-stop-design.md`](../specs/2026-09-06-agent-turn-stop-design.md)

**状态：** 实现完成，待合入  
**分支：** `feat/agent-turn-stop-generation`

## 任务

- [x] T1 HitlGate `rejectPendingByPrefix` + 单测
- [x] T2 Orchestrator：Abort → cancelled；reasoningCall 透传 signal；单测
- [x] T3 agentTurnService 注册 abort + 取消落库 + callWithFallback signal
- [x] T4 IPC（复用 followUpStop）+ UI 停止可见 + README
- [x] T5 契约单测 + verify + 检核 + PR

## 设计初衷检核

| Spec § | 结果 | 说明 |
|---|---|---|
| §2 可中止 | ✅ | registerFollowUpAbort + signal 透传 callWithFallback |
| §2 账本诚实 | ✅ | cancelDiscussionTurnRequest；有正文加「（已停止）」 |
| §2 HITL 不死等 | ✅ | rejectPendingByPrefix + abort 监听 |
| §2 不取消深挖 | ✅ | wait_subagent 后 registry 已 remove；深挖仍用 cancelRun |
| §5 验收 | ✅ | 相关单测绿；契约覆盖 UI/Agent |
