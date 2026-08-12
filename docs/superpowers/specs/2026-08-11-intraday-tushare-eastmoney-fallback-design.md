# 分时数据：有 Tushare 权限用 Tushare，否则东财兜底 — 设计

**状态：** 已完成  

**日期：** 2026-08-11  
**方法论：** SDD  

## 1. 问题

- 账号探测：分钟类接口（`rt_min` / `stk_mins`）未开通；日线/筹码/因子等已开通。
- 应用分时主路径误调非官方/不可用的 `rt_min_daily`，失败后虽有东财回退，但切分时时序上常「先读空库 → 立刻空态」，且未等首轮拉取完成。
- 用户策略：**开通的接口用起来；未开通的用东财兜底。**

## 2. 目标

- 分时/分钟：**优先官方 `rt_min`（有 Token 且接口可用时）→ 失败或无权限立即东财 `push2his` 1 分钟 OHLCV**，写入 `stock_minute_cache`。
- 切到分时视图时：**等待首轮拉取（或等价的 getStockMinuteKline 补拉）后再判定空态**。
- 空态文案区分「加载中 / 暂无数据」，避免误以为系统坏了。
- 不改变「已开通」的日线、筹码、因子等既有 Tushare 用法（已在用）。

## 3. 非目标

- 不替用户开通付费分钟权限。
- 本批不改盘前竞价 `stk_auction`、申万实时 `rt_sw_k` 等其它独立权限的完整产品方案（仍按现有降级）。
- 不引入新的第三方行情源。

## 4. 行为

1. `pullStockMinute` / `datasource:getStockMinuteKline`：今日补拉使用 **`fetchStockMinute`（`rt_min`）**，不再依赖 `rt_min_daily`。
2. Tushare 抛错或 0 行 → 同一轮立刻东财；成功落库并通知 UI。
3. `subscribeStockMinute` 首拉可被 await；走势图进入分时时先等首拉/补拉再渲染。
4. 东财返回 `close=0` 的未完成分钟：展示时用 `open` 回填 close，避免整段被当成无效。

## 5. 验收

| # | 场景 | 期望 |
|---|---|---|
| A | 无分钟权限 + 东财有当日/可取分钟 | 分时有图，日志可见 Tushare 失败后东财成功 |
| B | 有 `rt_min` 权限 | 优先 Tushare 落库并画图 |
| C | 两边皆空（未开盘且无历史可回退） | 明确「当日暂无分时数据」，非一直转圈 |
| D | 已开通日线/筹码等 | 行为与现网一致，不回归 |

## 6. 主要路径

- `electron/main/services/schedulerService.ts`
- `electron/main/ipc/aiHandlers.ts`（`getStockMinuteKline` / subscribe）
- `electron/main/services/tushareService.ts`（东财 bar 规范化可选）
- `src/components/StockChart/StockChart.tsx` + README
