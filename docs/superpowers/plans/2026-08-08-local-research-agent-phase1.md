# 本地投研 Agent Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 研判记录常驻聊天 + 持仓快捷芯片 + 不含成本价的持仓简报工具。

**Architecture:** UI 去掉空态门槛与盲选旧会话；新对话 create-and-send 走 `startResearchDiscussion` + `followUp`。持仓简报在主进程 `portfolioBriefService` 组事实包并调 AI，经 `ai:runPortfolioBrief` 写入会话。

**Tech Stack:** Electron main/preload、React、Vitest、现有 `callWithFallback` / discussion IPC。

## Global Constraints

- 简报与「列持仓」不得向模型或芯片列表暴露 `costPrice`
- 不自动调度深度/产业研究
- 遵守 `AGENTS.md`：窄 IPC、本地优先、可验证测试
- 同步更新 `src/components/AIAnalysis/README.md`

---

### Task 1: portfolioBrief 纯函数与单测

**Files:**
- Create: `electron/main/services/portfolioBriefService.ts`
- Test: `tests/unit/portfolioBrief.service.test.ts`

**Interfaces:**
- Produces: `buildPortfolioBriefFacts`, `formatEmptyPortfolioMessage`, `formatPortfolioListMessage`, `formatAiConfigCheckMessage`, `PORTFOLIO_BRIEF_SYSTEM_HINT`

- [x] **Step 1: Write failing tests** for: facts omit costPrice; empty portfolio copy mentions 缓存≠持仓; list message has names/codes without cost; config check reflects hasApiKey

- [x] **Step 2: Implement pure helpers + `runPortfolioBrief` orchestration** (modes: analyze / list / checkConfig)

- [x] **Step 3: Run** unit tests — PASS

---

### Task 2: IPC + preload

**Files:**
- Modify: `electron/main/ipc/aiHandlers.ts`
- Modify: `electron/preload/index.ts`

**Interfaces:**
- `ai:runPortfolioBrief` input: `{ requestId: string, sessionId?: number | null, mode?: 'analyze' | 'list' | 'checkConfig' }`
- output: `{ ok, sessionId?, messages?, text?, code?, message? }`

- [x] Register handler; expose `window.api.ai.runPortfolioBrief`
- [x] Typecheck node/web — PASS

---

### Task 3: AIAnalysis ungated chat + chips

**Files:**
- Modify: `src/components/AIAnalysis/AIAnalysis.tsx`
- Modify: `src/components/AIAnalysis/README.md`

- [x] Remove empty-state early return that only shows「发起研究讨论」
- [x] Remove auto-select `aiSessions[0]` when `selectedId === null` (keep pendingDiscussionSessionId path)
- [x] Add「新对话」清除选中；`selectedId == null` 时展示 composer + chips
- [x] create-and-send on first message; chips wire to list / config / runPortfolioBrief
- [x] data-testid: `research-composer`, `chip-analyze-portfolio`, `chip-list-portfolio`, `chip-check-ai-config`, `new-conversation`

---

### Task 4: Verify

- [x] Run focused unit tests + typecheck node/web
- [ ] Manual smoke: open 研判记录 → type/send → chips（需本地跑应用确认）
