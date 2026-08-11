# 日 K 今日 bar 盘中自动刷新 — 设计

**状态：** 已完成  

**日期：** 2026-08-11  
**方法论：** SDD  
**关联 plan：** [`../plans/2026-08-11-daily-today-bar-auto-refresh.md`](../plans/2026-08-11-daily-today-bar-auto-refresh.md)  

## 1. 问题

盘中日视图最后一根「今日」常由分时合成（FR-093）。一旦写入缓存，`backfillTodayDailyFromIntradayIfMissing` 见「已有今日」即跳过，导致：

- 点「更新数据」也刷不动今日 K（开高低收粘死、量异常偏小）  
- 盘中不会随行情变化，用户误以为要手动刷新  

## 2. 目标

- **盘中自动**用最新分时/分钟重算并覆盖今日合成日 K（OHLCV）。  
- 「更新数据」在盘中同样刷新今日合成；收盘后以 Tushare/东财正式日线为准，不覆盖已有正式日线。  
- 用户停留在日 K 视图时无需点按钮也能看到今日高低收/量变化。

## 3. 非目标

- 不全市场广播所有股票今日 K。  
- 不伪造换手率（无 `daily_basic` 则 `--`）。  
- 不改变历史已收盘日线语义。

## 4. 行为

### 4.1 今日 bar 刷新策略

| 场景 | 行为 |
|---|---|
| 北京连续竞价时段（约 09:15–11:35、12:55–15:05） | 始终用最新数据 **REPLACE** 今日行 |
| 非盘中且今日已存在 | 跳过（保留正式或末日合成） |
| 非盘中且今日缺失 | 尝试用全日分时合成一次 |
| 非盘中且今日像正式日线（`amount` 有值）且 force | **不**用分时覆盖 |

数据优先级：本地 `stock_minute_cache` 聚合 OHLCV → 东财 5 分钟分时合成。可先单次拉分钟再聚合。

同步写入 `stock_price_cache`，并尽量 `upsertDailyClose`（`pctChg` 相对昨收；`turnoverRate` 可空）。

### 4.2 自动刷新（UI）

- 走势图 `chartMode === 'daily'` 且当前选中个股：盘中约每 60s 调轻量 IPC 刷新今日 bar，并静默重载日线页（无全屏 loading）。  
- 若已有分钟订阅推送 `stockMinuteUpdated` 且代码匹配，亦可触发同路径（防抖合并）。  
- 切到分时模式或离开页面则停止定时器。

### 4.3 「更新数据」

仍走 `refreshStock`；其后 backfill 按 4.1 在盘中覆盖今日合成。

## 5. 验收

| # | 场景 | 期望 |
|---|---|---|
| A | 盘中日 K 停留 | 不点按钮，今日高/低/收/量随时间变化 |
| B | 盘中点更新 | 今日合成被重算，不再卡死在首根残缺 bar |
| C | 收盘后已有正式日线（含 amount） | 分时路径不覆盖 |
| D | 换手 | 无 daily_basic 时仍为 `--` |

## 6. 触达路径

- `electron/main/services/tushareService.ts`（今日 bar 策略 + 分钟聚合）  
- `electron/main/ipc/aiHandlers.ts` + preload（可选 `refreshTodayBar`）  
- `src/components/StockChart/StockChart.tsx` + README  
- 单测：策略纯函数 / 聚合 OHLCV  
