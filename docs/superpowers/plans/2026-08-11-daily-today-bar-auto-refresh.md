# 日 K 今日 bar 盘中自动刷新 Implementation Plan

> **For agentic workers:** 按任务勾选推进；完成后填写文末「设计初衷检核」。

**Goal:** 盘中自动覆盖刷新日 K 今日合成 bar；收盘后不覆盖正式日线。  

**状态：** 已完成  
**Spec：** [`../specs/2026-08-11-daily-today-bar-auto-refresh-design.md`](../specs/2026-08-11-daily-today-bar-auto-refresh-design.md)  

**Architecture:** `todayDailyBarRefresh` 决策与聚合；`backfillTodayDailyFromIntradayIfMissing` 盘中 REPLACE；IPC `refreshTodayBar`；StockChart 日 K 60s + minute 事件静默刷新。  

**Tech Stack:** Electron main、React StockChart、Vitest  

## Tasks

- [x] Task 1：纯函数 + 单测（决策 / 分钟聚合 / 分时聚合）  
- [x] Task 2：改造 backfill + IPC `refreshTodayBar` + preload  
- [x] Task 3：StockChart 自动刷新 + README  
- [x] Task 4：tsc / 单测；填检核表  

## 设计初衷检核（完成后填写）

| Spec 项 | 结果 | 说明 |
|---|---|---|
| A 盘中自动 | 符合 | 日 K 60s + `stockMinuteUpdated` → `refreshTodayBar` 静默重载 |
| B 更新覆盖 | 符合 | `forceFetch` 后 `force: true` 可覆盖无 amount 合成 bar；盘中始终可覆盖 |
| C 不覆盖正式日线 | 符合 | 非盘中 + 有 amount → `shouldRefreshTodayDailyBar` 为 false |
| D 换手诚实 | 符合 | 合成路径 `turnoverRate: null` |

**总评：** 符合设计。  
**检核人 / 日期：** Agent / 2026-08-11  
