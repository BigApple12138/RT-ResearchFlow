# 观察池一键清空 — 设计

**状态：** 已完成  

**日期：** 2026-08-09  
**归档：** 实现对照见 [`../plans/2026-08-09-trend-watchlist-clear-all.md`](../plans/2026-08-09-trend-watchlist-clear-all.md)  
**方法论：** SDD（规格驱动）；superpowers 仅为可选工具  

**依赖：** `trend_watchlist`、`trend:removeStock`、观察池 `TrendManager` / `TrendConfirmDialog`

## 1. 问题

观察池可有数十条（含库种子赛道股）。现仅支持逐条「移除」，清空成本过高。

## 2. 目标

- 观察池提供 **一键清空**（清空整表观察池登记）。  
- 二次确认：展示将删除的**股票只数**（按 distinct `ts_code`）与条目数（行数，含多赛道）。  
- 成功后刷新列表与雷达/工作台依赖的 watchlist 聚合（走现有 reload）。  

## 3. 非目标

- 按当前「列表分类/赛道」筛选结果做「清空当前筛选」（若需要另开需求）。  
- 删除 `trend_scores` / 日线缓存 / 趋势事件历史（只删观察池登记）。  
- 自动恢复 migration 种子股（清空后不会自动再插入；用户可手动加回）。  
- 无确认静默清空。  

## 4. 行为

1. 入口：观察池页头或工具条，文案 **「清空观察池」**，`data-testid="trend-watchlist-clear-all"`。  
2. 池为空时按钮禁用。  
3. 确认框（复用 `TrendConfirmDialog`）：说明不可恢复观察池登记；不声称删除行情缓存。  
4. IPC：`trend:clearWatchlist` → 主进程 `DELETE FROM trend_watchlist`（事务），返回 `{ ok, removedRows, removedStocks }`。  
5. Renderer：成功 Toast「已清空 N 只股票」；失败 Toast。  

## 5. 验收

1. 一键清空后列表为 0。  
2. 确认前取消则不变。  
3. 空池按钮不可点。  
4. 单测：clear 后 count=0；不误删 scores（若同库有 scores 行则仍在）。  

## 6. README

更新 `src/components/TrendWatcher/README.md`。  
