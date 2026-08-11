# AI 交互流式输出 Implementation Plan

> **For agentic workers:** 按任务勾选推进；完成后填写文末「设计初衷检核」。

**Goal:** AI 分析聊天 token 流式展示；深度研究保留阶段进度并在写作步推送报告草稿 delta；持仓预测等批跑不变。  

**Architecture:** `AIProviderRequest.onDelta(accumulated)` → Fallback 透传 → followUp / researchAgentRunner push IPC；Renderer 绑 `requestId`/`runId` 草稿，结束以权威会话/run 替换；中途不写 DB。  

**Tech Stack:** Electron IPC push、OpenAI/Anthropic stream SDK、React、Vitest  

**状态：** 已完成  
**Spec：** [`../specs/2026-08-11-ai-chat-streaming-design.md`](../specs/2026-08-11-ai-chat-streaming-design.md)  

## Global Constraints

- 禁止荐股 / 自动交易文案变化  
- 流式期禁止多次覆盖 `messages` JSON  
- 批跑（持仓预测等）不传 `onDelta`  
- Web search turn 可降级整段，不得假装打字机  
- CI 禁止真实付费流式调用  

## File map

| 文件 | 职责 |
|---|---|
| `electron/main/services/aiProvider.ts` | `onDelta`；OpenAI 兼容 / DeepSeek / Claude 流式；web search 不流 |
| `electron/main/services/aiFallbackService.ts` | 透传 `onDelta`；换厂商前由调用方 `reset` |
| `electron/main/services/discussionFollowUpService.ts` | `onDelta` 选项；调用 AI 时接入 |
| `electron/main/ipc/aiHandlers.ts` | `ai:followUpDelta` push |
| `electron/preload/index.ts` | `onFollowUpDelta` / researchAgent `onDelta` |
| `src/components/AIAnalysis/AIAnalysis.tsx` | 流式草稿气泡 |
| `electron/main/services/researchAgentRunner.ts` | 写作步 `onDelta` |
| `electron/main/services/researchAgentRunManager.ts` | `researchAgent:delta` send |
| `src/components/AIAnalysis/ResearchAgentPanel.tsx` | 阶段 + 草稿展示 |
| `src/components/AIAnalysis/README.md` | FR 更新 |
| `tests/unit/*` | mock stream / IPC 契约 |

## Tasks

- [x] Task 1：Provider + Fallback `onDelta` + 单测  
- [x] Task 2：`ai:followUp` delta push + preload + AIAnalysis UI  
- [x] Task 3：深度研究 writing delta + Panel UI  
- [x] Task 4：README、spec 状态、设计初衷检核  

## 设计初衷检核（完成后填写）

| Spec 项 | 结果 | 说明 |
|---|---|---|
| A 聊天出现增长正文 | 通过 | `ai:followUpDelta` + `ai-followup-streaming` |
| B 结束后与 DB 一致 | 通过 | 仍仅结束时 `updateSessionMessages` 一次 |
| C requestId 幂等 | 通过 | 既有 turn request 逻辑未改 |
| D 深度研究阶段+草稿 | 通过 | progress + `researchAgent:delta` + Panel 草稿区 |
| E 批跑无回归 | 通过 | 预测等未传 `onDelta` |
| F 降级不假装流式 | 通过 | web search `streaming:false` + 明示文案 |
| G 无荐股文案 | 通过 | 未改投研文案边界 |

**总评：** 聊天与深度研究写作具备真流式；持仓预测等批跑保持整段。  
**检核人 / 日期：** Auto / 2026-08-11  
