# Upstream 借鉴与程序完善总设计

**状态：** Wave 1–2 已完成；Wave 3 由缺口闭环总控承接  
**日期：** 2026-08-22  
**Plan：** [`../plans/2026-08-22-upstream-port-program.md`](../plans/2026-08-22-upstream-port-program.md)（Wave 1 细节见 `port-upstream-polish`）  
**Wave 3 总控：** [`2026-08-30-gap-closure-program-design.md`](./2026-08-30-gap-closure-program-design.md)

## 1. 背景

本仓 `develop` 在 `upstream/dev`（`ea3f88d` / beta.4）基础上**大幅超前**（Agent/Context Engine、Cursor 会话面、趋势 AI 偏差分、自定义数据目录、SDD+PR Review、#11/#12 补审等）。  
**禁止整分支 merge upstream**——会覆盖 fork 独有功能。

上游值得借鉴的 commit 已**模块化 port** 情况：

| 上游 commit | 主题 | 本仓状态 |
|---|---|---|
| `ed3229e` | 零 Key 公共日线初始化 | ✅ PR #8 + #11 抛光 |
| `d562051` | 板块资金历史 + 竞价价史 | ✅ PR #9 + #11 |
| `3a872ab` | 云图按需刷新/动量恢复 | ✅ 已对齐（`IndustryHeatmap.tsx` 与 upstream **0 diff**） |
| `cb86247` | 市场共振历史回看 | ✅ 已 port；本仓逻辑**更严**（禁止占位曲线假成功） |
| `ea3f88d` | beta.4 发版 | ⏳ 待 fork 化 release |

## 2. 目标

1. **验收已 port 能力**：用 diff/单测/E2E 证明与上游意图一致，且不回归 fork 修复（如 `dataSource:tushare`、分钟诊断 `whereClause`）。  
2. **补齐明确缺口**：补审 Low（SectorFlow 历史停轮询 E2E）、beta.4 发版对齐、文档/Release 说明。  
3. **选择性评估剩余 diff**：`marketResonanceService` 等仅在有明确收益时 cherry-pick，**不**采纳会削弱本仓修复的上游版本。  
4. **fork 原生完善**（非 upstream）：Agent Hub 手工验收、策略实验室日线 DSL 等列入后续波次，不与「借鉴 upstream」混为一谈。

## 3. 明确不借鉴（会回归）

| 上游侧 | 本仓保留原因 |
|---|---|
| 竞价 `upsertDailyClose` 无 `dataSource` | #11 已修 provenance |
| 诊断分钟新鲜度无 `whereClause` | 排除指数后缀键，避免假绿 |
| 删除 `refreshStockMinuteOnce` / `patchMissingAmounts` | 预测证据包、自选股 amount 补写依赖 |
| 删除 `isPublic*SyncRunning` | 诊断已读 `public_market_sync_jobs` 表，更准 |
| `marketResonance` 占位 benchmark/放宽 INSUFFICIENT | 本仓禁止假曲线填齐 |

## 4. 波次

| 波次 | 内容 | 状态 |
|---|---|---|
| **Wave 1** | 验收矩阵 + 竞价历史收盘 + 云图 UI + beta.4 + 停轮询契约 | ✅ PR #13 |
| **Wave 2** | 剩余 diff 逐行决策（不合入回归项） | ✅ 已结案，见 plan |
| **Wave 3** | fork 原生 backlog（Agent §8、策略实验室 DSL 等） | ⏳ 见 [`2026-08-30-gap-closure-program-design.md`](./2026-08-30-gap-closure-program-design.md) |

## 5. 验收

- Wave 1：相关 E2E/单测绿；`docs/releases/v0.1.0-beta.4.md` 含 fork 增量说明；plan 检核表填满。  
- 全程序：各波次 PR Review 后合入 `develop`。

## 6. 修订记录

- 2026-08-22：初版；基于 develop vs upstream/dev 全量 diff 盘点。
