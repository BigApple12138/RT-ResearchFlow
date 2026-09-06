# 日线预筛→分钟确认两阶段（F2）设计

**状态：** 已完成  
**日期：** 2026-08-30  
**Plan：** [`../plans/2026-08-30-strategy-two-phase.md`](../plans/2026-08-30-strategy-two-phase.md)

## 1. 目标

1. `scanMode === 'twoPhase'` 且同时启用 `dailyDslProfile` + `conditionBlocksProfile` 时：先日线 DSL 得候选，再以 `manual` 池跑分钟积木。  
2. UI：配置齐全时显示「两阶段（日线→分钟）」，否则「两阶段（待配置日线+分钟）」，不伪装。  
3. 内置模板「两阶段：日线预筛→分钟确认」。  
4. 单测：编排分支在无日线命中时跳过分钟且 matched=0。

## 2. 非目标

- 不改分钟条件语义。  
- 不自动烧云端分钟配额以外的既有上限。
