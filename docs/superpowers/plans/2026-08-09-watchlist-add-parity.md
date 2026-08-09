# 观察池加股对齐走势图 Implementation Plan

**Goal:** 观察池加股复用 datasource 链路；六位代码无 Tushare 可加入；同步错误分区。  

**状态：** 已完成  
**Spec：** [`../specs/2026-08-09-watchlist-add-parity-design.md`](../specs/2026-08-09-watchlist-add-parity-design.md)

## Tasks

- [x] Helper：六位 → tsCode；fetch 结果 → 加入载荷  
- [x] TrendManager：searchStock / fetchStock Enter 自动加入；空字典 UI；sync 错误分区  
- [x] 单测 + README + 检核表  

## 设计初衷检核（完成后填写）

| Spec 项 | 结果 | 说明 |
|---|---|---|
| 与走势图同搜索/解析 API | 符合 | `datasource.searchStock` / `fetchStock` |
| 无字典六位可加入 | 符合 | Enter → fetchStock → addStocks；合成候选 |
| 失败不误导必须 Tushare | 符合 | 加股错误注明公开行情可重试 |
| 同步错误不占加股区 | 符合 | `syncMessage` + `trend-watchlist-sync-error` |
| 清空不影响 stock_basic | 符合 | 既有 clear 仅删 watchlist；README 已写明 |
| README + 单测 | 符合 | AddResolve 单测 + README |

**总评：** 符合设计。  
**检核人 / 日期：** Agent / 2026-08-09  

