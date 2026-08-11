# 预测面板接地：分时主包 + Tushare 因子 Implementation Plan

> **For agentic workers:** 按任务勾选推进；完成后填写文末「设计初衷检核」。

**Goal:** 预测今日/明日证据包含分时量价；Tushare 开启时 ensure 技术因子；提示词禁止假联网并强制引用已给数据。  

**状态：** 已完成  
**Spec：** [`../specs/2026-08-11-forecast-grounded-intraday-design.md`](../specs/2026-08-11-forecast-grounded-intraday-design.md)  

**Architecture:** 新建 `forecastEvidencePackage` 统一分时刷新/序列化/量能摘要/因子 ensure/grounding 文案；`schedulerService` 导出单次分钟刷新；`aiHandlers` 各预测路径改用该包并替换默认 prompt。  

**Tech Stack:** Electron main、SQLite 分钟/因子缓存、Vitest  

## Global Constraints

- 不荐股、不下单；日频因子须标明非秒级  
- 自定义 `trendForecastPrompt` 仍追加 grounding 硬约束  
- 不把用户 Token 写入仓库  

## Tasks

- [x] Task 1：`volumeContextSummary` 盘中量能摘要 + 单测  
- [x] Task 2：`forecastEvidencePackage` + `refreshStockMinuteOnce`；默认 prompt / grounding  
- [x] Task 3：`aiHandlers` 今日/明日/批量预测路径接入  
- [x] Task 4：StockChart README + 设计初衷检核；tsc / 单测  

## 设计初衷检核（完成后填写）

| Spec 项 | 结果 | 说明 |
|---|---|---|
| A 分钟含量额 | 符合 | `serializeMinuteBarsForPrompt` 含 `v`/`a`；预测前 `refreshStockMinuteOnce` |
| B 东财回退含 volume | 符合 | 5 分钟 JSON 含 `volume`；量能摘要覆盖 |
| C Tushare 因子 | 符合 | `ensureStkFactorForForecast` + 日频说明注记 |
| D 默认 prompt / grounding | 符合 | 默认去掉东财同花顺收集指令；硬约束块必追加；单测覆盖 |
| E 诚实缺数 | 符合 | 无量/无因子有「本包未提供」文案 |

**总评：** 符合设计。  
**检核人 / 日期：** Agent / 2026-08-11  
