# 观察池加股对齐走势图数据链路 — 设计

**状态：** 已完成  

**日期：** 2026-08-09  
**归档：** 实现对照见 [`../plans/2026-08-09-watchlist-add-parity.md`](../plans/2026-08-09-watchlist-add-parity.md)  
**方法论：** SDD  

## 1. 问题

观察池搜索仅查 `stock_basic_cache`；字典为空时无法选股加入。用户误以为「清空观察池」清掉了基础数据，且红字「需配置 Tushare」来自全市场同步，误挂在加股区。股票走势图已支持：本地/东财公开链路解析六位代码，Tushare 为可选增强。

## 2. 目标

- 观察池加股与走势图同语义：`datasource:searchStock` + `datasource:fetchStock`。  
- 无 Tushare、无 `stock_basic_cache` 时，**六位代码回车可加入**（公开行情可用时带真名）。  
- 全市场同步缺 Tushare 的错误只出现在数据维护区。  
- 澄清：清空观察池只删 `trend_watchlist`，不影响 `stock_basic_cache`。

## 3. 非目标

- 用东财重做全市场 `stock_basic` 全量同步（下一任务另开 SDD）。  
- 改清空观察池语义。  
- 修复全局东财网络故障本身（仅对齐文案与可重试）。

## 4. 行为

1. 搜索走 `datasource:searchStock`；`empty:true` 时提示名称搜索不可用，可输六位代码。  
2. `Enter` + 六位数字 → `datasource:fetchStock` → 成功则自动 `trend:addStocks` 并触发 backfill；失败文案与走势图一致，不提「必须配 Tushare」。  
3. 字典有数据时名称模糊搜索与多选批量加入保留。  
4. 六位代码无字典命中时，下拉可展示合成候选（按 A 股后缀规则），点选后加入。

## 5. 产品原则

- 基础链路：本地缓存 → 公开行情 → 可加入。  
- Tushare：可选增强（全量字典、全市场日线等）。  
