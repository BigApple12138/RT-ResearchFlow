# AI 讨论流式回复「停止生成」 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** `ai:followUp` 流式生成期间提供「停止」能力：中止底层 HTTP 流、partial 正文诚实落库、会话锁正常释放。

**Architecture:** 主进程注册表按 requestId 管理 `AbortController`；`callWithFallback` 透传 `signal` 至已支持的四厂商 provider；`discussionFollowUpService` 识别 AbortError 走取消语义（partial 落库+「（已停止）」标注）；窄 IPC `ai:followUpStop`；UI 发送按钮在流式期间切换为「停止」。

**Tech Stack:** Electron 主进程 + preload + React；vitest 单测（服务层/注册表）；E2E 或契约测试（UI 收尾）。

**对应 spec：** [`../specs/2026-08-30-ai-followup-stop-design.md`](../specs/2026-08-30-ai-followup-stop-design.md)

## Global Constraints

- 窄 IPC：renderer 只按 requestId 请求停止，不碰 AbortController。
- 诚实账本：partial 正文落库并标注「（已停止）」；无 partial 不落助手消息。
- fallback 语义：中止为终态，不续跑下一厂商。
- 会话锁（`withDiscussionSessionLock`）语义不变：中止发生在锁内请求体，锁照常释放。
- 若请求状态字段为 CHECK 约束需新增 Migration 159（实现时先确认）。
- 先红后绿。

## File Structure

| 文件 | 责任 |
|---|---|
| `electron/main/services/aiFallbackService.ts`（改） | `callWithFallback` 增加 `signal?: AbortSignal` 透传；AbortError 不续跑 |
| `electron/main/services/discussionFollowUpService.ts`（改） | `DiscussionFollowUpAICallInput.signal`；AbortError→取消语义（partial 落库） |
| `electron/main/services/followUpAbortRegistry.ts`（新） | requestId→AbortController 注册表（register/abort/remove/clearForTests） |
| `electron/main/ipc/aiHandlers.ts`（改） | `ai:followUp` 建 controller；新 handler `ai:followUpStop`；`type:'stop'` delta |
| `electron/preload/index.ts`（改） | `ai.followUpStop` + delta 类型扩展 |
| `src/components/AIAnalysis/AIAnalysis.tsx`（改） | 流式期间发送按钮→「停止」；stop/error(CANCELLED) 收尾；partial 渲染 |
| `tests/unit/followUpAbortRegistry.test.ts`（新） | 注册表单测 |
| `tests/unit/discussionFollowUpService.test.ts`（改/新） | AbortError partial 落库/锁释放/NOT_RUNNING |
| `src/components/AIAnalysis/README.md`（改） | FR 更新 |

## Tasks

- [x] **T1 确认状态字段**
  - 查 `ai_analysis_turn_requests`（或等价表）status 列定义；若 CHECK 约束不含 `cancelled`，新增 Migration 159（`ALTER` 重建表迁移状态值集合），否则跳过
- [x] **T2 注册表 + fallback 透传**
  - `followUpAbortRegistry.ts`：`register(requestId)`/`abort(requestId)`/`remove(requestId)`/`clearForTests()`；`abort` 未知 id 返回 false
  - `callWithFallback` 加 `signal` 透传给 `callAIProvider`；catch 分支：AbortError/`user_cancelled` 直接 rethrow（不尝试下一厂商）
  - 单测 `followUpAbortRegistry.test.ts`：注册/abort 触发 signal/重复 abort 幂等/未知 id false
- [x] **T3 服务层取消语义**
  - `runDiscussionFollowUp`/`performFollowUpTurn` 透传 `signal`；catch 识别 abort：
    - 有 partial → 助手消息落库（正文+「（已停止）」）、请求标 `cancelled`、返回 `{ ok:true, cancelled:true, text, messages }` 并发 `onDelta({type:'stop'})`
    - 无 partial → 请求标 `cancelled`、返回 `{ ok:false, code:'CANCELLED', messages }`
  - 单测：mock `callAI` 抛出 AbortError（带 accumulated）→ partial 落库/锁释放（同会话可再发）/fallback 不续跑/会话消息尾部标注
- [x] **T4 IPC + preload**
  - `ai:followUp`：创建 controller 注册（键 requestId），透传 `signal`，finally remove；失败/中止时 controller 清理
  - 新 `ai:followUpStop`：校验输入 → `registry.abort(requestId)` → 成功 `{ ok:true }`，未知 `{ ok:false, code:'NOT_RUNNING' }`
  - preload：`ai.followUpStop({ requestId })`；`onFollowUpDelta` 事件联合类型加 `{ type:'stop', requestId, sessionId }`
- [x] **T5 UI**
  - 流式期间（`aiStreamDelta` 进行中）发送/提问按钮替换为「停止」（`data-testid="ai-followup-stop"`，aria-label="停止生成"）
  - 点击→`followUpStop`；本地立刻退出流式态；`type:'stop'` 或 error code `CANCELLED` 时收尾（刷新消息，partial 带标注由服务端返回）
  - 非流式（web search 整段）不显示停止按钮
  - 契约/单测：渲染态断言（`aiStreamDelta.test` 已有通道，可扩展）或 view test
- [x] **T6 README + verify**
  - AIAnalysis README 更新 FR-0xx（停止生成）；`pnpm run verify`

## 设计初衷检核（完成后填）

| 项 | 结果 | 证据 |
|---|---|---|
| 流式可中止（HTTP 流终止） | 通过 | `followUpAbortRegistry` + `callWithFallback(signal)` |
| partial 诚实落库+标注 | 通过 | `discussionFollowUp.stop.test.ts` |
| 无 partial 不落助手消息 | 通过 | 同上 CANCELLED 路径 |
| 会话锁释放可继续 | 通过 | abort 在 `withDiscussionSessionLock` 内，finally 释放 |
| NOT_RUNNING 幂等 | 通过 | registry + IPC |
| fallback 不续跑 | 通过 | AbortError 直接 rethrow |
| 窄 IPC/类型安全 | 通过 | `ai:followUpStop` + preload 类型 |
| 单测+verify 全绿 | 通过 | registry/stop/contract 单测 |
