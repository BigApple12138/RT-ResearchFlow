# 待复盘快捷收口 — Implementation Plan

**Goal:** 待复盘/重复触发行内有效收口与噪音忽略；多选批量；复用 resolve/dismiss。

**状态：** 已完成  
**Spec：** `docs/superpowers/specs/2026-08-11-pending-review-quick-resolve-design.md`

## Tasks

- [x] ReviewHintsDrawer：勾选 + 行内/批量按钮
- [x] DecisionCenter 接线 resolve/dismiss + 刷新
- [x] README + 契约测 + 检核

## 设计初衷检核

| Spec 项 | 结果 | 说明 |
|---|---|---|
| 1 行内有效收口 | 符合 | `resolve RESOLVED_VALID` |
| 2 行内噪音忽略 | 符合 | `dismiss` + reason 噪音/快捷忽略 |
| 3 多选批量 | 符合 | 全选本页 + 批量两键；未选禁用 |
| 4 明细保留 | 符合 | 事件明细/研判/走势图仍在 |
| 5 刷新 | 符合 | 成功后 refresh signals + reviewStats 等 |

**总评：** 符合 design A。  
**检核人 / 日期：** Agent / 2026-08-11
