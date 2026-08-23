# 观察池东财映射分类（一期）Implementation Plan

> **For agentic workers:** Execute after user approval. Checkbox tracking.

**Goal:** 用可维护映射规则 + 东财公开标签自动建议观察池分类/赛道；去掉 catalog 建议路径；主题树一期只读代码常量。

**Architecture:** Migration 灌入 `watchlist_category_map_rules` → 纯函数 `mapWatchlistCategory` + 东财标签拉取 → IPC suggest/CRUD → `TrendManager` 异步自动填与规则维护 UI。

**Tech Stack:** TypeScript、better-sqlite3、Electron IPC、Vitest、既有东财公开 fetch 模式。

**状态：** 已完成  

**Spec：** [`../specs/2026-08-09-watchlist-category-em-map-design.md`](../specs/2026-08-09-watchlist-category-em-map-design.md)

## Global Constraints

- 一期不做主题树编辑 UI、不做联网补充分类  
- 不改写 Migration 67；不加股自动拉日线  
- 建议值必须落在 `WATCHLIST_CATEGORY_TREE`  
- 保留既有 `electron/main/index.ts` EPIPE/EIO 防护  

## File map

| 文件 | 职责 |
|---|---|
| `docs/superpowers/specs/2026-08-09-watchlist-category-em-map-design.md` | 设计归档 |
| `docs/superpowers/plans/2026-08-09-watchlist-category-em-map.md` | 本计划 |
| `electron/main/database/db.ts` | Migration 144：表 + 默认规则 |
| `electron/main/database/watchlistCategoryMapRepository.ts` | 规则 CRUD |
| `electron/main/services/watchlistCategoryMap.ts` | 纯函数映射 |
| `electron/main/services/watchlistCategorySuggestService.ts` | 池内优先 + 东财标签 + 映射 |
| `electron/main/ipc/trendHandlers.ts` | 新 IPC |
| `electron/preload/index.ts` | `window.api.trend.*` |
| `src/components/TrendWatcher/TrendManager.tsx` | 自动填 / 维护 UI |
| `src/components/TrendWatcher/trendWatchlistCategorySuggest.ts` | 去掉 catalog；仅保留池内本地辅助 |
| `src/components/TrendWatcher/README.md` | FR 行为 |
| `tests/unit/watchlistCategoryMap.test.ts` | 纯函数 |
| `tests/unit/watchlistCategoryMap.repository.test.ts` | 仓库 / migration 种子 |
| `tests/unit/trendWatchlistCategoryCatalog.test.ts` | 改为不依赖 catalog 建议路径 |

---

### Task 1: SDD 归档

- [x] 写入 design（一期锁定范围）  
- [x] 写入本 plan（任务勾选、路径、测试）  
- [ ] Commit：随父 Agent 与 EPIPE 一并批处理（本切片不强制单独提交）

### Task 2: Migration + 仓库 + 纯函数

- [x] Migration 144：`watchlist_category_map_rules` + 默认规则（铜/PCB/锂电/光模块/算力等）  
- [x] `watchlistCategoryMapRepository` list/upsert/delete  
- [x] `mapWatchlistCategory` 纯函数 + 单测  
- [x] 仓库/种子单测  

### Task 3: 东财 suggest + IPC

- [x] `watchlistCategorySuggestService`：池内 → EM 标签（~4s）→ rules  
- [x] IPC：`suggestWatchlistCategory` / `listCategoryMapRules` / `upsertCategoryMapRule` / `deleteCategoryMapRule`  
- [x] preload / `window.api`  

### Task 4: UI + 清理 catalog 建议路径

- [x] `TrendManager` 异步自动填、来源旁注、未命中展示东财行业  
- [x] 映射规则维护区（list/upsert/delete）  
- [x] 建议路径不再引用 `WATCHLIST_CATEGORY_CATALOG`  
- [x] 更新旧 catalog 单测  

### Task 5: README + 验证 + 检核

- [x] 更新 `TrendWatcher/README.md`  
- [x] 运行聚焦单测 + typecheck  
- [x] 填写「设计初衷检核」、更新状态为已完成  

---

## 设计初衷检核（完成后填写）

| Spec 项 | 结果 | 说明 |
|---|---|---|
| 去掉 catalog 智能填写 | 符合 | `trendWatchlistCategorySuggest` 仅池内；UI/IPC 走东财映射 |
| 可维护 map rules + 默认种子 | 符合 | Migration 144 表 + 45 条默认规则；CRUD IPC + 维护 UI |
| 池内 → 东财映射 → 空 | 符合 | `suggestWatchlistCategoryFromDb` 顺序与单测覆盖 |
| 手改不被覆盖；重新识别 | 符合 | 保留 `categoryTouched` + 强制 resuggest |
| 未命中展示东财行业 | 符合 | 旁注「东财行业：xxx → 未命中规则」 |
| 无树编辑 / 无联网补充（一期） | 符合 | 下拉仍读 `WATCHLIST_CATEGORY_TREE`；无 web-search |
| README + 单测 | 符合 | README 已更新；15 个聚焦单测通过；typecheck 通过 |

**总评：** 符合一期设计初衷。  
**检核人 / 日期：** Agent / 2026-08-09  

**验证命令：**

```powershell
pnpm run test:unit -- tests/unit/watchlistCategoryMap.test.ts tests/unit/watchlistCategoryMap.repository.test.ts tests/unit/trendWatchlistCategoryCatalog.test.ts
pnpm run typecheck
```
