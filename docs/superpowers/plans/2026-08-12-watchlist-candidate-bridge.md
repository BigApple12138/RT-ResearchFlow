# 候选股加入观察池桥接 Implementation Plan

> **For agentic workers:** 对照 [`../specs/2026-08-12-watchlist-candidate-bridge-design.md`](../specs/2026-08-12-watchlist-candidate-bridge-design.md)。

**Goal：** P0 三入口一键加入观察池；P1 建议入池列表；顺带修 Agent 空 criteria 误 complete。

**Architecture：** Renderer 调既有 `trend:addStocks`；新增 `trend:listTrackedTsCodes` / `trend:listWatchlistCandidates`；共享 `normalizeAshareTsCode`。

**Tech Stack：** Electron IPC、React、Vitest。

**状态：** 已完成（2026-08-12）

## 设计初衷检核

| Spec 项 | 结果 | 说明 |
|---|---|---|
| P0 走势图 +观察池 | 符合 | StockChart 行按钮 |
| P0 AI 候选 +观察池 | 符合 | AIAnalysis 侧栏 |
| P0 资讯入口 | 部分 | 解析结果常落缓存后走走势图/建议入池；资讯详情行按钮可后续补 |
| P1 建议入池 | 符合 | TrendManager 折叠区 |
| 不自动入池 | 符合 | 仅显式按钮 |
| 空 criteria 误 complete | 符合 | completionEvaluator + 单测 + skill |
| README | 符合 | 三模块已更新 |

## 修订记录

- 2026-08-12：落地 P0/P1 与误完成刹车；资讯详情行按钮留作后续（缓存→建议入池已覆盖主路径）。
