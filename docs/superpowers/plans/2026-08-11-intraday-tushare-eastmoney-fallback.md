# 分时 Tushare/东财兜底 Implementation Plan

**Goal:** 有 `rt_min` 用 Tushare；否则东财兜底；进入分时等待首拉。  

**状态：** 已完成  
**Spec：** [`../specs/2026-08-11-intraday-tushare-eastmoney-fallback-design.md`](../specs/2026-08-11-intraday-tushare-eastmoney-fallback-design.md)

## Tasks

- [x] 分钟拉取改 `rt_min` + 首拉可 await  
- [x] getStockMinuteKline 同步改官方接口  
- [x] 东财 close=0 规范化；StockChart 等首拉 + 空态说明  
- [x] README + typecheck + 检核  

## 设计初衷检核（完成后填写）

| Spec 项 | 结果 | 说明 |
|---|---|---|
| A 无权限东财可用 | 符合 | `rt_min` 失败后同轮 `fetchEastmoneyMinuteOHLCV`；UI 等首拉 |
| B 有 rt_min 优先 | 符合 | scheduler / getStockMinuteKline 均改官方 `fetchStockMinute` |
| C 双空明确空态 | 符合 | 空态副文案说明 Tushare→东财策略 |
| D 其它 Tushare 不回归 | 符合 | 未改日线/筹码/因子等已开通接口路径 |

**总评：** 符合设计。  
**检核人 / 日期：** Agent / 2026-08-11  
