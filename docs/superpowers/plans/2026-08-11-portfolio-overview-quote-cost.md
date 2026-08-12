# 持仓总览现价回退与成本按股绑定 Implementation Plan

> **For agentic workers:** 按任务勾选推进；完成后填写文末「设计初衷检核」。

**Goal:** 持仓总览成本按股绑定；无 `rt_k` 时用本地最新价填充现价/涨跌并算浮盈亏。  

**状态：** 已完成  
**Spec：** [`../specs/2026-08-11-portfolio-overview-quote-cost-design.md`](../specs/2026-08-11-portfolio-overview-quote-cost-design.md)  

**Architecture:** UI 用 `key`/受控同步修 CostEditor；主进程 `getTrendScoreSnapshot` 实时评分分支对齐 EOD 分支的 `getLatestPriceSnapshot` 回退。  

**Tech Stack:** React、Electron main、Vitest  

## Global Constraints

- 不新拉付费实时接口；不改 Migration / 持仓 schema  
- 不把本地价标注为 realtime  

## Tasks

- [x] Task 1：`resolveDisplayQuote` + 实时评分分支回退本地价；重算 position advice  
- [x] Task 2：`CostEditor` 按 `tsCode` 受控绑定 + `key`  
- [x] Task 3：更新 `TrendWatcher/README.md`；单测 + tsc；填检核表  

## 设计初衷检核（完成后填写）

| Spec 项 | 结果 | 说明 |
|---|---|---|
| A 成本按股 | 符合 | `key={tsCode}` + 受控 `value`/`useEffect` 同步 `costPrice` |
| B 无 rt_k 本地价 | 符合 | 实时评分分支缺价时 `getLatestPriceSnapshot`；`quoteSource=eod` |
| C 有 rt_k 优先实时 | 符合 | `resolveDisplayQuote` 优先 `rtPrice`/`rtChange`；单测覆盖 |
| D 无价诚实空态 | 符合 | 全 null 仍返回 null；单测覆盖 |

**总评：** 符合设计。  
**检核人 / 日期：** Agent / 2026-08-11  
