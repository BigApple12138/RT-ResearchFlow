# 深度研究一键自动启动 Implementation Plan

> **For agentic workers:** 按任务勾选推进；完成后填写文末「设计初衷检核」。

**Goal:** 建议卡确认后，上下文充足则自动 `startRun`；短问题自动扩写；否则回落预检弹窗。  

**Architecture:** 前端 `buildAutoDeepResearchQuestion` / `decideAutoDeepResearchStart`；`ResearchAgentPanel.launchFromSuggest`：preflight → 可自动则 startRun，否则 dialog。  

**Tech Stack:** React、既有 `researchAgent.*` IPC、Vitest  

**状态：** 已完成  
**Spec：** [`../specs/2026-08-11-deep-research-auto-start-design.md`](../specs/2026-08-11-deep-research-auto-start-design.md)  

## Tasks

- [x] Task 1：`buildAutoDeepResearchQuestion` + 单测  
- [x] Task 2：`ResearchAgentPanel` 自动 start / 回落弹窗  
- [x] Task 3：建议卡接线 + README + 检核  

## 设计初衷检核（完成后填写）

| Spec 项 | 结果 | 说明 |
|---|---|---|
| A 一键开跑 | 通过 | `launchFromSuggest` 直接 `startRun` |
| B 短句可启动 | 通过 | 扩写 ≥10 字 |
| C 无主体弹窗 | 通过 | `decideAutoDeepResearchStart` 失败回落 |
| D 不双开 | 通过 | 全局 queued/running 检查保留 |
| E 无荐股 | 通过 | 未改文案边界 |

**总评：** 深度研究建议确认后按自动化 skill 开跑；缺上下文仍可手改。  
**检核人 / 日期：** Auto / 2026-08-11  
