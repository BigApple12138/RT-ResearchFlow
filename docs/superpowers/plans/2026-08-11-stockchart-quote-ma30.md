# 走势图抬头现价涨跌幅与 MA30 Implementation Plan

> **For agentic workers:** 按任务勾选推进；完成后填写文末「设计初衷检核」。

**Goal:** 走势图抬头显示现价与涨跌幅；日 K 增加 MA30。  

**状态：** 已完成  
**Spec：** [`../specs/2026-08-11-stockchart-quote-ma30-design.md`](../specs/2026-08-11-stockchart-quote-ma30-design.md)  

## Tasks

- [x] Task 1：派生 `headerQuote`（日 K / 分时）并渲染抬头  
- [x] Task 2：MA 序列加入 30 + 图例  
- [x] Task 3：README + 检核；相关自检  

## 设计初衷检核（完成后填写）

| Spec 项 | 结果 | 说明 |
|---|---|---|
| A 抬头价幅 | 符合 | `data-testid=stock-chart-header-quote`；日 K / 分时分支 |
| B MA30 | 符合 | 序列 `#14b8a6` + 图例；单测覆盖 period=30 |
| C 盘中同步 | 符合 | 依赖 `prices` / `intradayItems` 派生，今日 bar 刷新后抬头更新 |

**总评：** 符合设计。  
**检核人 / 日期：** Agent / 2026-08-11  
