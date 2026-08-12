# 加股自动补齐公开基本面 — 设计

**状态：** 已实现  

**日期：** 2026-08-11  
**方法论：** SDD  
**关联 plan：** [`../plans/2026-08-11-auto-prefetch-fundamentals.md`](../plans/2026-08-11-auto-prefetch-fundamentals.md)  

## 1. 问题

基本面抽屉默认空态，须手点「获取公开资料」才联网补齐，新加股体验不友好。加股时已通过 `fetchStock` 联网拉行情，同一意图下应顺带补公开基本面。

## 2. 目标

- 新股成功加入走势图后，若本地基本面为 `missing`，后台自动 `stockFundamentals.refresh`。  
- 打开基本面抽屉且仍为 `missing` 时自动拉一次兜底。  
- 不阻塞图表；失败可手点「获取/刷新」。

## 3. 非目标

- 不扫全市场、不定时狂刷已有事实。  
- 不改变公开源接口与本地表结构。  
- 预置指数不拉基本面。

## 4. 行为

1. **加股成功**（搜索 Enter / 点选候选 / 云图跳转触发的 `fetchStock` 成功）：`get` 若 `status === 'missing'` → fire-and-forget `refresh`（服务层单飞去重）。  
2. **打开抽屉**：本地读完若仍 `missing` → 自动 `refresh`（显示「正在获取…」）。  
3. 本地已有 `partial`/`complete`：不自动 refresh；用户可手动「刷新资料」。

## 5. 验收

| # | 期望 |
|---|---|
| A | 新加无基本面缓存的股，稍候开抽屉不应三块仍「尚未获取」（网络失败除外） |
| B | 已有本地事实的股，打开抽屉不重复自动联网 |
| C | 自动失败后按钮仍可用 |

## 6. 触达

- `src/components/StockChart/StockChart.tsx`  
- `src/components/StockChart/StockFundamentalDrawer.tsx`  
- 可选小工具函数 + `StockChart/README.md`  
