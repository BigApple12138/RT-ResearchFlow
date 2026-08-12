# 复盘积压入口接到待复盘处置 — Implementation Plan

**Goal:** 点「复盘积压」打开待复盘列表并可进明细/研判；数字用 unresolved。

**状态：** 已完成  
**Spec：** `docs/superpowers/specs/2026-08-11-review-backlog-pending-entry-design.md`

## Tasks

- [x] 积压 onClick → ReviewHintsDrawer + pending tab；limit=30；metric=unresolved
- [x] Drawer 待复盘行：事件明细/研判 + 走势图（打开时先关抽屉避免 z-index 遮挡）
- [x] README + 契约测 + 设计初衷检核

## 设计初衷检核

| Spec 项 | 结果 | 说明 |
|---|---|---|
| 1 积压→待复盘 Tab | 符合 | `setReviewHintsTab('pending')` + open drawer |
| 2 可进明细/研判 | 符合 | 行内按钮 → lifecycle/judgment |
| 3 数字 unresolved | 符合 | `summary.unresolved`；列表 limit 30 |
| 4 历史复盘分离 | 符合 | 看复盘/历史复盘仍 `setReviewReportHistoryOpen` |
| 5 README | 符合 | FR 接线说明已更新 |

**总评：** 符合 design A。  
**检核人 / 日期：** Agent / 2026-08-11
