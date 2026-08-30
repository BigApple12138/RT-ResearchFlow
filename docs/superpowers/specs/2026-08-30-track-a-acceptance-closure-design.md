# Track A 验收闭环设计（自动化证据优先）

**状态：** 已批准执行（总控 §4.1；承接手工清单）  
**日期：** 2026-08-30  
**挂靠：** [`2026-08-30-gap-closure-program-design.md`](./2026-08-30-gap-closure-program-design.md)  
**清单：** [`../plans/_briefs/2026-08-30-track-a-acceptance-checklist.md`](../plans/_briefs/2026-08-30-track-a-acceptance-checklist.md)  
**Plan：** [`../plans/2026-08-30-track-a-acceptance-closure.md`](../plans/2026-08-30-track-a-acceptance-closure.md)

## 1. 问题

A1–A5 代码早已落地，但 design/plan 长期停在「待手工验收」，阻塞缺口闭环 Goal。真人全量点验依赖本机 AI Key、外部 MCP、长时 Electron 操作，且不可重复。

## 2. 闭环原则

1. **行为可测项**：以可重复单测 / 既有 E2E / 契约测试为验收权威证据，回填 design/plan 检核表。  
2. **环境依赖项**（活体外部 MCP 连通、真实厂商 Key 烧 Token）：不作为本程序阻塞条件；在清单标注「环境可选」；门禁与拒绝路径必须有自动化证据。  
3. **UI 口径项**（A5 偏差分展示）：以 view 单测 + 既有趋势 E2E / README 口径为证据；禁止荐股承诺由审计/单测覆盖。

## 3. 映射（验收权威）

| ID | 手工原意 | 本程序权威证据 |
|---|---|---|
| A1 | §8.11–13 / 联网门禁 | `agentToolRegistry` / `agentPlannerExecutor` / `agentLocalTools` / `agentSkillPrompt` / MCP 相关单测；联网关默认关与拒绝路径 |
| A2 | One-page 深挖时间线 | `researchAgent.view` / one-page 相关单测；`ai-analysis-progress-minimize` / research-agent E2E 族 |
| A3 | 「深度分析一下」继承持仓 | `agent-turn-session-memory` plan 检核已填；相关 session memory 单测 |
| A4 | 联网搜索 MCP 通道 | `appWebSearchGateway` 单测（配置/降级/门禁） |
| A5 | 偏差分 UI/口径 | `aiTrendReviewBadge.view` + `trendStructureReview.service` 单测；无荐股 |

## 4. 非目标

- 不强制在本机配置外部 MCP 才能结案。  
- 不重新实现 A1–A5 功能。

## 5. 验收

1. 清单「自动化跑分」全绿。  
2. 各源 design 状态改为「已完成」，plan 检核不再写「待手工阻塞」。  
3. 总控 Wave 1 勾选。
