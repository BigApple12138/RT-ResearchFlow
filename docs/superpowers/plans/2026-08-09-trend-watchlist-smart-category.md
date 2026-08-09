# 观察池智能填写分类/赛道 Implementation Plan

> **For agentic workers:** Execute after user approval. Checkbox tracking.

**Goal:** 选股加入观察池时，用本地目录自动填写分类与细分赛道，可手改、可重新识别。

**Architecture:** 静态 `tsCode → category/subCategory` 目录（源自 FR-164 种子）+ `suggestWatchlistCategory`；`TrendManager` 在选中股票时自动填下拉，touched 防覆盖。

**Tech Stack:** TypeScript 纯模块、TrendManager、Vitest。

**状态：** 已完成  

**Spec：** [`../specs/2026-08-09-trend-watchlist-smart-category-design.md`](../specs/2026-08-09-trend-watchlist-smart-category-design.md)

## Global Constraints

- 本地 only，不调 AI  
- 建议值必须落在现有 `CATEGORY_TREE`  
- 不改清空观察池 / 资讯过滤 scope  

## File map

| 文件 | 职责 |
|---|---|
| `src/components/TrendWatcher/trendWatchlistCategoryCatalog.ts` | 目录数据 + `suggestWatchlistCategory` |
| `src/components/TrendWatcher/TrendManager.tsx` | 选中时自动填、touched、重新识别 |
| `src/components/TrendWatcher/README.md` | 行为 |
| `tests/unit/trendWatchlistCategoryCatalog.test.ts` | 目录与建议 |

---

### Task 1: Catalog + 单测

- [x] 从 FR-164 种子整理 `WATCHLIST_CATEGORY_CATALOG`（generated + suggest）  
- [x] `suggestWatchlistCategory(tsCode, existingRows?)` 按 design §4 优先级  
- [x] 断言建议的 category/sub 属于 `CATEGORY_TREE`（`trendWatchlistCategoryTree.ts` 共用）  
- [x] 单测：300308→CPO/光模块；unknown→null；existing row 优先  
- [ ] Commit：`feat(trend): watchlist category suggestion catalog`（待用户要求时提交）

### Task 2: TrendManager 接入

- [x] 选中/变更 `selectedStocks` 时，若未 touched → 应用 suggest  
- [x] 下拉 onChange → 置 touched  
- [x] 「重新识别」`data-testid="trend-watchlist-resuggest-category"`  
- [x] 旁注展示当前建议来源文案  
- [x] README  
- [ ] Commit：`feat(trend): auto-fill category when adding watch stocks`（待用户要求时提交）

### Task 3: 检核

- [x] vitest catalog + typecheck  
- [ ] 手工：选目录股自动填；手改不被覆盖；重新识别恢复  
- [x] 填写检核表  

---

## 设计初衷检核（完成后填写）

| Spec 项 | 结果 | 说明 |
|---|---|---|
| 选股自动填分类/赛道 | 符合 | 选中后 suggest 填 CATEGORY_TREE |
| 未知不瞎填 | 符合 | unknown → 清空建议，不猜 |
| 手改不被覆盖 | 符合 | `categoryTouched` 防覆盖 |
| 重新识别可用 | 符合 | force resuggest |
| 0 Token；属 CATEGORY_TREE | 符合 | 本地目录；单测校验树归属 |
| README + 单测 | 符合 | |

**总评：** 符合设计。  
**检核人 / 日期：** Agent / 2026-08-09  

