# 趋势结构复核「需重核」误触发 — 修复设计

**状态：** 已完成  
**日期：** 2026-08-11  
**Plan：** 本文件含实现要点；改动面小，不另开长 plan  

## 问题

AI 结构复核保存后，交易时段约 60s 的实时评分重算会改写白名单事实中的收益/回撤等浮点字段，导致 `factsHash` 变化，徽章错误显示「需重核」。

## 目标

结构复核的 `scoreDate + factsHash` 只绑定 **本地日线结算（EOD）结构事实**，不含盘中实时价叠加。行内仍可展示实时价与实时评分；**不得**因 tick/60s 重算单独作废已保存复核。

## 非目标

- 不取消「评分日或 EOD 结构事实真变化 → 需重核」  
- 不关闭 `scoresUpdated` 刷新  
- 不改 AI 词表 / revision 不可变语义  

## 方案

新增/调整 `buildEodTrendReviewFacts(db, item)`（或等价）：从日线 + 基准 **不传 realtimePrice** 重算白名单字段；`scoreDate` = 个股本地日线最新 `tradeDate`。  
`reviewStructure` 保存与 `attachStructureReviews` 判 stale **共用**该构建器。

## 验收

1. 同日线、无新日线时，实时价变化 / `scoresUpdated` 刷新后，已保存复核 `stale === false`。  
2. 换评分日或 EOD 收益等白名单字段变化后，`stale === true`。  
3. 单测覆盖；更新 `TrendWatcher/README.md`。  
