# 持仓总览现价回退与成本按股绑定 — 设计

**状态：** 已完成  

**日期：** 2026-08-11  
**方法论：** SDD  
**关联 plan：** [`../plans/2026-08-11-portfolio-overview-quote-cost.md`](../plans/2026-08-11-portfolio-overview-quote-cost.md)  

## 1. 问题

持仓总览详情中：

1. **现价 / 当日涨跌** 常为 `—`（无 `rt_k` 或实时评分缓存未带价时），有成本也无法算浮盈亏。
2. **成本输入框** 切换股票后仍显示上一只刚编辑/展示的数值（如全局 `4.508`），未按选中股绑定。

## 2. 目标

- 每只持仓的成本编辑框展示并提交**该股** `portfolio_stocks.cost_price`；切换选中即换值。
- 无盘中实时价时，趋势评分快照与持仓总览仍展示**本地已有**最新价与涨跌幅（日线优先，其次价格缓存），并据此算浮盈亏与处置提示。
- 有 `rt_k` 时仍优先实时价。

## 3. 非目标

- 不新增付费实时接口、不强制全市场 `rt_k`。
- 不改持仓表结构 / Migration；不改列表「5 日趋势分变化」语义。
- 不计算仓位市值、不接入券商。

## 4. 行为

1. **成本 UI（`CostEditor`）**  
   - 按 `tsCode`（或等价键）重挂载或受控同步，避免 React 复用未受控 `defaultValue` 导致串股。  
   - 保存逻辑仍走既有 `portfolio.updateCostPrice`；仅修展示绑定。

2. **行情回退（`getTrendScoreSnapshot`）**  
   - 在「有实时评分缓存」分支中：若 `rt_k` 与缓存均无 `price`/`change`，回退 `getLatestPriceSnapshot`（与无实时评分分支一致）。  
   - `quoteSource`：有 `rt_k` 为 `realtime`，否则 `eod`。  
   - 用回退后的价重算 `profitPct` / `positionAdvice*`。

3. **文案 / README**  
   - `TrendWatcher/README.md` 注明：持仓总览无实时价时用本地最新价，不冒充盘中实时。

## 5. 验收

| # | 场景 | 期望 |
|---|---|---|
| A | 三只持仓成本不同，依次点选 | 输入框分别显示各自成本，不串值 |
| B | 有本地日线、无 `rt_k`、有实时评分缓存 | 详情现价/当日涨跌有数（来自本地）；有成本则浮盈亏有数 |
| C | 有 `rt_k` | 仍优先实时价与涨跌 |
| D | 本地无价且无实时 | 仍可为 `—`（诚实空态） |

## 6. 主要触达路径

- `src/components/TrendWatcher/PortfolioDashboard.tsx`
- `electron/main/services/trendWatchlistService.ts`（`getTrendScoreSnapshot`）
- `src/components/TrendWatcher/README.md`
