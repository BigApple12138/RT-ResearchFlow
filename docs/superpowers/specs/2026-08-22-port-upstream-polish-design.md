# 上游值得借鉴能力合入设计

**状态：** 已批准执行（2026-08-22；用户 `/goal`：把值得借鉴的全部拿过来）  
**日期：** 2026-08-22  
**对照上游：** `upstream/dev` @ `ea3f88d`（beta.4）  
**Plan：** [`../plans/2026-08-22-port-upstream-polish.md`](../plans/2026-08-22-port-upstream-polish.md)

## 1. 原则

- **模块化 cherry-pick**，禁止整分支 merge（会覆盖本仓 Agent/Context Engine、趋势 AI 偏差分、自定义数据目录、SDD 门禁、#11/#12 修复等独有提交）。
- **已合入不重做**：零 Key 156、板块历史 FR-274、竞价价史 FR-275、市场共振历史、云图动量恢复服务层。
- **本仓更优则保留**：`upsertDailyClose` 的 `dataSource:'tushare'`、诊断分钟新鲜度 `whereClause` 排除指数键、`refreshStockMinuteOnce`/`patchMissingAmounts`、删除 `sector_flow_daily` 死仓库。

## 2. 待 port 清单（按 PR 分批）

### PR-A 竞价历史收盘价投影（上游 `ed3229e` / beta.4）

| 项 | 动作 |
|---|---|
| `mergeTodayClose` → `mergeTradeDateClose` | 用 `queryDailyCloseExact` + `limit_list_daily` + `applyMorningAuctionCloseProjection` |
| 历史日不看 rt_k | `isCurrentMorningAuctionTradeDate` 为 false 时不调用 `mergeCurrentPrices` |
| 单测 | 扩 `morningAuctionPriceProjection.test.ts` + service 契约 |

### PR-B 行业云图 UI 抛光（上游 `3a872ab`）

| 项 | 动作 |
|---|---|
| `HeatmapToolbarSelect` | 窗口内下拉，修复双悬浮详情 + 录屏捕获 |
| `dismissAllHover` | 工具栏打开时清 hover |
| 动量文案 | `momentumStateLabel` / 盘中滚动 vs 历史回放语义 |
| 单测/E2E | port `industryHeatmapInteraction.contract.test.ts`；对齐 `industry-heatmap-momentum-retention.spec.ts` |

### PR-C 发版与 Low 项收尾

| 项 | 动作 |
|---|---|
| beta.4 | `package.json` + `docs/releases/v0.1.0-beta.4.md`（含本仓独有功能摘要） |
| SectorFlow E2E | 历史模式断言 60s 轮询停止（补审 Low） |
| 诊断公共任务 | 恢复 `isPublic*SyncRunning` 并接入 Diagnostics 快照（若 UI 缺展示） |

## 3. 明确不 port

| 项 | 原因 |
|---|---|
| 整文件 `App.tsx` 上游版 | 会丢失 AI 分析 Flyout / workbench |
| 上游去掉 `whereClause` 分钟诊断 | 本仓三维复审修复更准 |
| 恢复 `sectorFlowDailyRepository` | 已 Migration 157 废弃 |
| 上游 `schedulerService` 分钟订阅签名变更 | 本仓 `refreshStockMinuteOnce` 被预测/AI 依赖 |

## 4. 验收

1. 各 PR 相关单测/E2E 绿  
2. plan 设计初衷检核表填满  
3. 每 PR Review 后合入 `develop`  

## 5. 修订记录

- 2026-08-22：初稿；用户要求全部值得借鉴项计划并执行。
