# 今日提炼默认主表面 Implementation Plan

> **For agentic workers:** 按任务勾选推进；完成后填写文末「设计初衷检核」。

**Goal:** 今日看板中间栏默认「今日提炼」，本地派生持仓必看 + 市场观察 + 噪音折叠；信号列表降为明细 Tab。  

**Architecture:** 纯前端派生 `buildTodayBriefModel` + `TodayBriefPanel`；接入 `DecisionCenter` 工作区默认 Tab=`brief`；不改信号状态机。  

**Tech Stack:** React、既有 DecisionSignal / homeModel / actionQueue、Vitest  

**状态：** 已完成  
**Spec：** [`../specs/2026-08-11-today-brief-default-surface-design.md`](../specs/2026-08-11-today-brief-default-surface-design.md)  

## Global Constraints

- 禁止荐股、买卖点、收益承诺、自动交易文案  
- 不自动 markRead/dismiss  
- 本地事实优先；v1 可不调用 AI  

## Tasks

- [x] Task 1：`todayBriefModel.ts` + 单测  
- [x] Task 2：`TodayBriefPanel.tsx`  
- [x] Task 3：`DecisionCenter` 默认 Tab 与接线  
- [x] Task 4：README + 检核  

## 设计初衷检核（完成后填写）

| Spec 项 | 结果 | 说明 |
|---|---|---|
| A 默认提炼 | 通过 | 默认 `workspaceTab='brief'`，首 Tab「提炼」 |
| B 持仓必看 | 通过 | `portfolioClues` + 可点走势图/信号 |
| C 市场观察 | 通过 | 板块热度行 + 短线/资讯线索；组合视图补拉上下文 |
| D 不自动改状态 | 通过 | 仅导航与打开抽屉，无批量状态写入 |
| E 无荐股文案 | 通过 | disclaimer + 单测断言 |

**总评：** v1 本地提炼可看，后续可加 AI 润色与云图直连。  
**检核人 / 日期：** Auto / 2026-08-11  
