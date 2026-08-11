# 今日复盘持仓日结 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 一键复盘日报接入市场环境、资金要点、持仓走势、今日关注；AI prompt 吃新事实；周报本批不扩。

**Architecture:** 生成时并行 `market.getMarketOverview` + `portfolio.getDashboard`，与内存 `WATCHING` 一并传入扩展后的 `buildDailyReviewReport`；精简摘要写入快照；`ReviewReportPanel` / `formatReviewReportText` / `reviewAiNarrativeService` 同步。

**Tech Stack:** TypeScript、React、vitest、既有 IPC。

**状态：** 已完成  
**Spec：** `docs/superpowers/specs/2026-08-11-daily-review-day-context-design.md`

## Tasks

- [x] Task 1: `reviewReportModel` 类型 + dayContext 派生 + format 文本 + 单测
- [x] Task 2: `DecisionCenter` 并行取数接线；`ReviewReportPanel` UI 新四节
- [x] Task 3: `reviewAiNarrativeService` prompt + 类型/校验可选字段；README + 设计初衷检核

## 设计初衷检核（完成后填写）

| Spec 项 | 结果 | 说明 |
|---|---|---|
| 1 日结四节 | 符合 | 市场环境/资金要点/持仓走势/今日关注 |
| 2 旧信号处理节保留 | 符合 | 已处理/风险/缺口/待验证未删 |
| 3 emptyDay 不省略日结 | 符合 | 单测覆盖有持仓无待办仍含日结 |
| 4 关注中进报告 | 符合 | `WATCHING` → watchedSignals |
| 5 单路失败不阻断 | 符合 | overview/dashboard 错误写入 unavailableReason |
| 6 AI prompt 含日结 | 符合 | `buildReviewAiNarrativePrompt` 增四节 |
| 7 周报不扩 | 符合 | dayContext 仅 daily |
| 8 快照向前兼容 | 符合 | 可选字段 + validate 放宽 |
| 9 README FR-263 | 符合 | DecisionCenter README |

**总评：** 符合已批准 design。需重启主进程后点「一键复盘」验证有料日结。  
**检核人 / 日期：** Agent / 2026-08-11

**验证命令：**

```powershell
npm run test:unit -- tests/unit/reviewReportModel.test.ts tests/unit/reviewAiNarrative.service.test.ts tests/unit/decisionReviewReport.repository.test.ts
```
