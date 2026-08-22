# Upstream 借鉴与程序完善 Implementation Plan（总览）

> 对照 [`../specs/2026-08-22-upstream-port-program-design.md`](../specs/2026-08-22-upstream-port-program-design.md)  
> Wave 1 执行细节见 [`2026-08-22-port-upstream-polish.md`](2026-08-22-port-upstream-polish.md)

**状态：** Wave 1 已完成（PR #13 → `d68c17e`）；Wave 2 决策已记录；Wave 3 待独立 SDD  
**当前 develop：** `0eb2f8f`

## Wave 1 — 上游抛光 ✅（PR #13）

- [x] 竞价历史日收盘投影（`mergeTradeDateClose`、历史日跳过 rt_k）
- [x] 云图 `HeatmapToolbarSelect`、hover 修复、动量文案
- [x] `package.json` beta.4 + `docs/releases/v0.1.0-beta.4.md`
- [x] SectorFlow 历史停轮询契约单测 + **E2E IPC 计数断言**（补审 Low）
- [x] 诊断公共任务（DB job 展示，不恢复 `is*Running`）

## Wave 2 — 剩余 upstream diff 决策 ✅（文档结案，不合入）

| 文件/能力 | upstream 意图 | 决策 | 理由 |
|---|---|---|---|
| `marketResonanceService` 占位 benchmark | 缺曲线时用 placeholder 填 UI | **不合入** | 本仓 FR 禁止 `change:0`/`points:[]` 假成功；现有 E2E 更严 |
| `marketResonance` 历史 `trendDays` 简化 | 统一 MAX_TREND_DAYS | **不合入** | 本仓「今日 vs 历史」分链路已验证 |
| `diagnosticsService` 去掉分钟 `whereClause` | 简化 | **不合入** | 指数后缀键会掩盖个股分钟缺失 |
| `schedulerService` 去掉 `refreshStockMinuteOnce` | 简化订阅 | **不合入** | 预测证据包 / AI handlers 依赖 |
| `morningAuction` upsert 无 dataSource | 上游旧行为 | **不合入** | #11 已修 provenance |
| 整文件 `App.tsx` upstream | AI Flyout 等 | **不合入** | 丢失 fork UI |

**结论：** `upstream/dev` @ `ea3f88d` 中**值得借鉴的产品行为已全部 modular port**；剩余 diff 多为本仓超前能力或会引入回归，**不继续 cherry-pick**。

## Wave 3 — Fork 原生完善（下一步，非 upstream）

| 项 | 规模 | 建议 |
|---|---|---|
| Agent Hub spec §8 手工验收 | 中 | 下一独立 plan |
| 策略实验室通用日线 DSL | 大 | 新 design |
| 消息中心跨会话持久化 | 中 | 新 design + Migration |
| 云端分钟 `saveCloudConfig` | 中 | 新 design |
| 竞价价史 `partial` 远端失败自动重试 | 小 | 可单 PR |
| SupplyChain / MessageCenter 单测补强 | 小 | 可单 PR |

## 已 port 验收矩阵（全量）

| 能力 | 证据 | 结果 |
|---|---|---|
| 零 Key 公共池+日线 (156) | PR #8 | ✅ |
| 板块资金历史 FR-274 | PR #9、sector-flow E2E | ✅ |
| 竞价价史 FR-275 + #11 | PR #11、coordinator 单测 | ✅ |
| 云图动量+工具栏 (3a872ab) | PR #13、interaction 契约单测 | ✅ |
| 市场共振历史 (cb86247) | market-resonance E2E | ✅（严于 upstream） |
| 竞价历史收盘价 (ed3229e) | PR #13、historicalClose 契约 | ✅ |
| beta.4 发版 | PR #13、`package.json` | ✅ |
| 冗余清理 | PR #12 | ✅ |

## 设计初衷检核

| Spec § | 结果 | 说明 |
|---|---|---|
| §2 验收已 port | ✅ | 上表 + PR #8–#13 |
| §2 补齐缺口 | ✅ | Wave 1 已合入 |
| §3 不借鉴清单 | ✅ | Wave 2 决策表 |
| §4 Wave 3 | ⏳ | fork 原生项待用户择项开 SDD |
