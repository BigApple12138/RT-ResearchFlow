# Agent 回合继承会话历史 Implementation Plan

> **For agentic workers:** 按任务执行；对照 [`../specs/2026-08-12-agent-turn-session-memory-design.md`](../specs/2026-08-12-agent-turn-session-memory-design.md)。

**Goal:** Agent turn 与 followUp 共用压缩装配，编排器带入会话历史，避免「深度分析一下」失忆。

**Architecture:** Turn 前 auto-compact → `buildDiscussionModelMessages` 单次装配 → `runAgentTurn({ conversationMessages })` → reasoningCall 透传、不再二次拼接。

**状态：** 已完成  

## 设计初衷检核

| Spec 项 | 结果 | 说明 |
|---|---|---|
| Agent 带入历史 | 通过 | `conversationMessages` 注入编排器 |
| 共用 compact | 通过 | turn 前 `shouldAutoCompact` + 同装配 |
| 无双重拼接 | 通过 | reasoningCall 不再 `buildDiscussionAIRequest` |
| tool 不进 messages | 通过 | 仍只落 user+final |
| deep_start 抽标的 | 通过 | `promptSent`+热消息进 loadMessages；单测覆盖 |
