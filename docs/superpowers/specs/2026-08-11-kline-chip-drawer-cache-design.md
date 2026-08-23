# 日K筹码抽屉会话缓存 — 设计

**状态：** 已完成  
**日期：** 2026-08-11  

## 问题

`StockKlineChipDrawer` 每次打开都卸载/重挂，强制 `loading` 转圈，即使本地库已有日K/筹码。体验差。

## 目标

- **会话级内存缓存**（按 `tsCode`）：日K、最新筹码、技术因子。  
- 再次打开：**缓存命中且未变化 → 立即展示，不转全屏「正在读取」**。  
- **有变化才后台/显式重载**：变化指纹含个股日线最新 `tradeDate`、筹码最新日、因子 `tradeDate`（与现有 IPC 结果一致）；可选短 TTL（如 5 分钟）防止盘中一直不刷。  
- 关闭抽屉不清空该股缓存；换股互不影响。  

## 非目标

- 不持久化到 SQLite（仅本次应用进程）  
- 不改主进程筹码/因子拉取语义  
- 不做跨窗口共享  

## 方案

`src/components/shared/stockKlineChipDrawerCache.ts`：`get/set/isFresh`；`StockMiniChart.tsx` 打开时先 hydrate，再按需 `reloadKey`/静默 refresh。

## 验收

1. 同股连续打开两次：第二次无全屏转圈（或仅极短），内容立刻可见。  
2. 日线最新日变化后打开会刷新。  
3. 单测覆盖 cache fresh/stale；README 注明。  
