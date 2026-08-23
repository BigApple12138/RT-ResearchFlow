# 持仓批量预测强制重跑 Implementation Plan

**Goal:** 手动批量预测可确认后 force 重跑；cron 保持日去重。  

**状态：** 已完成  
**Spec：** [`../specs/2026-08-11-portfolio-forecast-force-rerun-design.md`](../specs/2026-08-11-portfolio-forecast-force-rerun-design.md)  

## Tasks

- [x] `runPortfolioForecastJob({ force })`  
- [x] IPC/preload `forecastNow({ force? })`  
- [x] PortfolioDashboard 确认 + 调用  
- [x] 契约单测 + README  

## 设计初衷检核

| Spec 项 | 结果 | 说明 |
|---|---|---|
| A 无预测直跑 | 通过 | `alreadyTodayCount===0` 直接 `force:false` |
| B 确认可取消 | 通过 | `TrendConfirmDialog` 取消只关弹层 |
| C force 重跑 | 通过 | 确认后 `forecastNow({ force: true })` |
| D cron 不去 force | 通过 | scheduler 仍 `runPortfolioForecastJob(db, win)` |

**总评：** 手动可重跑，定时仍省调用。  
**检核人 / 日期：** Auto / 2026-08-11  
