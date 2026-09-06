# 资讯详情「+观察池」Implementation Plan

> 对照 [`../specs/2026-08-30-briefing-detail-watchlist-design.md`](../specs/2026-08-30-briefing-detail-watchlist-design.md)  
> 承接已批准 [`2026-08-12-watchlist-candidate-bridge-design.md`](../specs/2026-08-12-watchlist-candidate-bridge-design.md) P0 资讯入口遗留

**状态：** 实现完成，检核如下  
**Goal：** BriefingDetail 相关股票映射区 + `+观察池`；纯函数可测；复用 `trend:addStocks`

## Tasks

- [x] Task 1：`briefingRelatedStocksModel` + 单测（抽码 / STOCK_CODES / 合并 / 上限 12）
- [x] Task 2：BriefingDetail 接入映射区 UI 与入池
- [x] Task 3：README + design/plan 检核

## 设计初衷检核（完成后填）

| Spec 项 | 结果 | 说明 |
|---|---|---|
| 映射区 + 观察池 | ✅ | `briefing-detail-related-stocks` + 行按钮 |
| 已在池灰态 | ✅ | `listTrackedTsCodes` |
| 无代码不渲染 | ✅ | `relatedStocks.length === 0` 不渲染 |
| 复用 addStocks | ✅ | 单只与批量 |
| README | ✅ | BriefingDetail/README.md |
| 单测 | ✅ | `briefingRelatedStocksModel.test.ts` 6 passed |
