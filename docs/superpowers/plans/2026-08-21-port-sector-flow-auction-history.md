# 合入板块资金历史与竞价涨跌完整性 Implementation Plan

> **For agentic workers:** 对照 [`../specs/2026-08-21-port-sector-flow-auction-history-design.md`](../specs/2026-08-21-port-sector-flow-auction-history-design.md)。来源 `upstream/dev` 内 `d562051`。禁止整 commit cherry-pick / 整支 merge。

**Goal：** 板块资金按日历史回看 + 早盘竞价 3/5 日涨跌完整性（coverage + coordinator）。

**Architecture：** observation dates IPC → SectorFlow 历史模式；MorningAuctionPriceHistoryCoordinator → 竞价快照覆盖反馈。

**Tech Stack：** Electron 主进程、既有 SQLite 观察表、Vitest、Playwright。

**状态：** 已完成（2026-08-21）  
**Spec：** [`../specs/2026-08-21-port-sector-flow-auction-history-design.md`](../specs/2026-08-21-port-sector-flow-auction-history-design.md)  
**分支：** `port/sector-flow-auction-history-cao`

## Global Constraints

- 对照最新 `upstream/dev`；无新 Migration  
- preload 仅增量合并本功能 IPC  
- 复用已有 `morningAuctionPriceProjection`  
- Commit 中文；Renderer 不直连行情  

## Tasks

- [x] Phase A：竞价 PriceHistory coordinator + morningAuctionService/UI/viewModel  
- [x] Phase B：sectorFlow observation dates + handlers/service/UI  
- [x] Phase C：单测/E2E、README FR、检核  
- [x] Phase D：verify + PR → develop  

## 验证证据

| 项 | 证据 |
|---|---|
| 单测 | coordinator / viewModel / sectorFlowHandlers / history / observation / projection 绿 |
| E2E | `sector-flow-history` + `morning-auction-price-history` 通过 |
| typecheck:node | 通过 |
| build | 通过 |
| upstream/dev | `ea3f88d`（含 `d562051`） |

## 设计初衷检核（完成后填写）

| Spec 项 | 结果 | 说明 |
|---|---|---|
| §6.1 板块历史回看停轮询 | 符合 | SectorFlow + handlers/service；E2E 绿 |
| §6.2 竞价 3/5 日覆盖可解释 | 符合 | Coordinator + UI coverage；E2E 绿 |
| §6.3 单测 + E2E | 符合 | 见上 |
| §6.4 README + 检核 | 符合 | MarketOverview FR-274；ShortTermStrategy FR-275（避让本仓 FR-265 数据目录） |
| §6.5 upstream/dev 已刷新 | 符合 | tip `ea3f88d` |

## 修订记录

- 2026-08-21：按已批准 design 执行；E2E 造数改为关应用后写 `${userDataDir}-dev` 并对齐日期选择。
