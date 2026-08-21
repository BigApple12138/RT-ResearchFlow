# 合入上游板块资金历史与竞价涨跌完整性设计

**状态：** 已完成（2026-08-21；对照 plan 设计初衷检核通过）  
**日期：** 2026-08-21  
**来源：** [caoritian002-wq/RT-ResearchFlow](https://github.com/caoritian002-wq/RT-ResearchFlow) `dev` @ **`d562051`**（跟踪 tip `upstream/dev` = `ea3f88d`）  
**Plan：** [`../plans/2026-08-21-port-sector-flow-auction-history.md`](../plans/2026-08-21-port-sector-flow-auction-history.md)  
**先例：** [`2026-08-21-port-public-zero-key-daily-design.md`](./2026-08-21-port-public-zero-key-daily-design.md)、[`2026-08-12-port-market-resonance-heatmap-design.md`](./2026-08-12-port-market-resonance-heatmap-design.md)

## 1. 问题

1. **板块资金**：本仓已有当日观察落库与展示，但缺少按交易日历史回看、日期导航，以及「历史模式」下停止轮询、本地快照优先的隔离。  
2. **早盘竞价**：3 日/5 日涨跌易因早期候选缓存长期缺失；上游已用 `MorningAuctionPriceHistoryCoordinator` 做候选扩张收敛、本地优先补齐与覆盖反馈。本仓仅有零 Key port 留下的 `morningAuctionPriceProjection` 辅助，未接入完整 coordinator。

无新 Migration（对照 `d562051` 无 schema 变更）；本仓 tip Migration **156** 保持不动。

## 2. 目标

1. 板块资金支持按已存档交易日回看：日期选择/前后日/回最新；历史模式停 60s 轮询；本地完整观察优先，缺失再受控补采。  
2. 早盘竞价快照披露 3/5 日涨跌覆盖摘要；coordinator 本地优先补齐，避免早期候选导致长期空洞。  
3. 窄 IPC + preload 增量暴露；Renderer 不直连行情。  
4. 单测 + 相关 E2E 绿；`MarketOverview` / `ShortTermStrategy` README 补 FR。  
5. 对照最新 `upstream/dev` 做模块拆 port，禁止整支 merge。

## 3. 非目标

- 不合入 `ea3f88d` / `ddc0404` 发版 bump 与 release notes（发版另开）。  
- 不重开 `3a872ab` 云图大 diff（文件多已在 develop；行为缺口另评估）。  
- 不 merge `upstream/dev`、不 cherry-pick 整 commit。  
- 不荐股、不自动交易、不削弱风险提示。

## 4. 方案选项

| 方案 | 做法 | 利弊 |
|---|---|---|
| A. 整 commit cherry-pick `d562051` | 一次合入 | 与本仓 preload/会话面冲突风险高 |
| B. 模块拆 port（推荐） | 新文件直接取；无分歧服务/UI 可 checkout；`preload` 三路合并只加 IPC | 与零 Key/共振先例一致，可回滚单层 |
| C. 只合竞价半边 | 缩小范围 | 丢掉板块历史，与上游体验不一致 |

**采用 B。** 预检：相对 merge-base，`sectorFlow*` / `MorningAuction.tsx` / `morningAuctionService` 本仓几乎无独有改动；**`electron/preload/index.ts` 本仓大幅领先**，必须手工增量合并。

## 5. 架构要点

```text
SectorFlow UI ──IPC──► sectorFlowHandlers
                         ├ listObservationDates / getByDate / refresh
                         └ sectorFlowService + observationRepository

MorningAuction UI ──既有竞价 IPC──► morningAuctionService
                         └ MorningAuctionPriceHistoryCoordinator
                              （本地 daily_close 优先 → 受控补齐 → coverage）
```

- 历史模式：所选日 ≠ 当日北京交易日则停轮询。  
- 竞价：复用已有 `morningAuctionPriceProjection`；coordinator 负责覆盖与收敛，不重复发明投影语义。

## 6. 验收

1. 有多日观察数据时，板块资金可切换历史日并停轮询；回最新恢复实时行为。  
2. 竞价列表在本地日线足够时给出稳定 3/5 日涨跌或可解释的缺失覆盖状态。  
3. 相关单测绿；E2E `sector-flow-history` / `morning-auction-price-history`（或等价）通过。  
4. README FR 已更新；plan「设计初衷检核」填完。  
5. `upstream/dev` 在开干与验收时已 `fetch` 为最新 tip。

## 7. 风险

| 风险 | 缓解 |
|---|---|
| preload 合并丢 IPC / 撞名 | 只增 sectorFlow/竞价相关导出；对照 develop 类型 |
| morningAuctionService 行为回退 | 以 d562051 diff 为准做审查；保留本仓零 Key 投影辅助 |
| 历史补采打爆外部源 | 沿用上游「本地优先、受控补采」；不扩大并发 |

## 8. 修订记录

- 2026-08-21：基于最新 `upstream/dev`（`ea3f88d`）与 `d562051` 起草；用户要求 SDD 全流程推动。
