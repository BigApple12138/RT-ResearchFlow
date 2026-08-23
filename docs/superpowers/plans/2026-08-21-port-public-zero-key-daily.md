# 合入零 Key 公共日线 Implementation Plan

> **For agentic workers:** 对照 [`../specs/2026-08-21-port-public-zero-key-daily-design.md`](../specs/2026-08-21-port-public-zero-key-daily-design.md)。来源 `upstream` @ `ed3229e`。禁止整 commit cherry-pick。

**Goal：** 无/弱 Tushare 时用公共证券池与历史日线完成冷启动底座；Tushare 优先；Migration 156。

**Architecture：** public governor → universe / historical sync / snapshot → 写入既有 cache 表 + provenance；Onboarding 任务可 defer/continue。

**Tech Stack：** Electron 主进程、SQLite Migration、Vitest、既有 diagnostics IPC。

**状态：** 已完成（2026-08-21）  
**Spec：** [`../specs/2026-08-21-port-public-zero-key-daily-design.md`](../specs/2026-08-21-port-public-zero-key-daily-design.md)  
**分支：** `port/public-zero-key-daily-cao`

## Global Constraints

- Migration **156**（勿用 137）  
- 不改 137–155 既有语义  
- 不 port IndustryHeatmap 大改、不 port d562051  
- Commit message 中文；仅用户要求时 push/PR  
- Renderer 不直连公共行情 HTTP

## Tasks

- [x] Phase A：Migration 156 + repositories  
- [x] Phase B：Governor + scripts/lib  
- [x] Phase C：Universe + scheduler  
- [x] Phase D：Daily sync + diagnostics 软降级  
- [x] Phase E：Onboarding/App + README  
- [x] Phase F：测试、检核、PR  

## 验证证据（验收）

| 项 | 证据 |
|---|---|
| Migration 156 | `tests/unit/publicMarketMigration.test.ts` 绿；`db.ts` version 156 |
| Governor / Universe / Daily | `publicMarketRequestGovernor` / `publicStockUniverse` / `publicHistoricalDailySync` / `publicDailySnapshot` / `publicDailyProvenance` 单测绿 |
| 调度契约 | `afterCloseScheduler.contract.test.ts` 绿（含 public resume timer） |
| Onboarding 语义 | `initializationTaskModel.test.ts` 绿；README FR-273 |
| Diagnostics 软降级 | `diagnostics.dailyCloseQuality` / `dataQualityActions` / `historicalDailySync` 单测绿 |
| Transformer 探针 | `pnpm run test:daily-source-transformer` 15 pass |
| E2E 新用户韧性 | `tests/e2e/new-user-initialization-resilience.spec.ts` 1 passed |
| typecheck:node | 通过 |
| build | `pnpm run build` 通过 |
| typecheck:web | develop 既有 3 处错误（非本 port 引入；stash 对照同失败） |
| 非目标 | 未合入 IndustryHeatmap 大改；未合入 `morningAuctionPriceHistoryCoordinator` / d562051 |

## 设计初衷检核（完成后填写）

| Spec 项 | 结果 | 说明 |
|---|---|---|
| §5.1 零 Key 可初始化 | 符合 | stockBasic/historical 不硬要求 Tushare；公共 sync + deferred quick-start |
| §5.2 Tushare 优先 | 符合 | scheduler / diagnostics 有 Token 时走原路径，失败或无 Token 才公共降级 |
| §5.3 Migration 156 幂等 | 符合 | 单测空表 ALTER + 新表；legacy 行 `data_source=legacy` |
| §5.4 诊断/无凭据泄露 | 符合 | 诊断披露 job 进度；README 明确不展示凭据 |
| §5.5 单测 + README | 符合 | 上述单测绿；Onboarding/Diagnostics README 已写 FR-273 |

## 修订记录

- 2026-08-21：按 design 开写；用户 goal 要求完整实现并验收。
- 2026-08-21：Phase A–F 落地；Migration 137→156；检核完成。
