# 复盘 AI 取消输出硬拦截 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 去掉今日/本周复盘「AI 研判」对模型正文的交易词硬拒收，保留空正文校验、长度截断与 prompt 软约束。

**Architecture:** 仅改 `sanitizeReviewAiNarrativeText`；不改其它模块 `auditResearchText` 硬门。

**Tech Stack:** TypeScript、vitest、既有 decision review AI IPC。

**状态：** 已完成  
**日期：** 2026-08-11  
**Spec：** `docs/superpowers/specs/2026-08-11-review-ai-no-output-reject-design.md`

## Tasks

- [x] 删除 `FORBIDDEN_PATTERN` 及交易语气拒收分支
- [x] 更新单测：含买卖词可通过；空串仍拒收
- [x] 更新 `DecisionCenter/README.md` FR-250
- [x] 设计状态 + 本计划检核

## 设计初衷检核（完成后填写）

| Spec 项 | 结果 | 说明 |
|---|---|---|
| 1 删除交易词硬拦截 | 符合 | `sanitizeReviewAiNarrativeText` 不再匹配买卖/加仓等词 |
| 2 空正文仍拒收 | 符合 | 空/空白 → `OUTPUT_REJECTED`「模型未返回可用研判正文」 |
| 3 长度截断保留 | 符合 | `REVIEW_AI_NARRATIVE_MAX_CHARS` 仍截断 |
| 4 Prompt 软约束保留 | 符合 | `REVIEW_AI_SYSTEM_CONSTRAINTS` 未删 |
| 5 其它模块硬门不动 | 符合 | 未改 `researchEvidenceAuditService` |
| 6 README FR-250 | 符合 | 写明不做交易词输出硬拒收 |
| 7 单测 | 符合 | `reviewAiNarrative.service.test.ts` 4 PASS |

**总评：** 符合已批准 design；一键复盘 AI 区不再因交易词红字拒收。  
**检核人 / 日期：** Agent / 2026-08-11

**验证命令：**

```powershell
npm run test:unit -- tests/unit/reviewAiNarrative.service.test.ts
```
