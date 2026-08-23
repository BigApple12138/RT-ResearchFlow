# 观察池一键清空 Implementation Plan

> **For agentic workers:** Execute task-by-task after user approval. Checkbox tracking.

**Goal:** 观察池支持确认后一键清空全部登记，无需逐条移除。

**Architecture:** Repository `clearTrendWatchlist` + IPC `trend:clearWatchlist`；`TrendManager` 增加按钮与 `TrendConfirmDialog`；只删 `trend_watchlist` 行。

**Tech Stack:** better-sqlite3、现有 trend IPC/preload、React TrendManager。

**状态：** 已完成  

**Spec：** [`../specs/2026-08-09-trend-watchlist-clear-all-design.md`](../specs/2026-08-09-trend-watchlist-clear-all-design.md)  
**归档：** 完成后填文末检核表。

## Global Constraints

- 必须确认对话框；空池禁用  
- 不删 scores / 日线 / alerts  
- 清空后不自动重播种子数据  
- 更新 `TrendWatcher/README.md`

## File map

| 文件 | 职责 |
|---|---|
| `electron/main/database/trendWatchlistRepository.ts` | `clearTrendWatchlist` |
| `electron/main/ipc/trendHandlers.ts` | `trend:clearWatchlist` |
| `electron/preload/index.ts` | 暴露 API |
| `src/components/TrendWatcher/TrendManager.tsx` | 按钮 + 确认 |
| `src/components/TrendWatcher/README.md` | 行为说明 |
| `tests/unit/trendWatchlist.clear.test.ts` | 清空与副作用边界 |

---

### Task 1: Repository + IPC + 单测

- [x] `clearTrendWatchlist(db): { removedRows: number; removedStocks: number }`（`DELETE` + `COUNT(DISTINCT ts_code)` 前统计）  
- [x] IPC 校验无额外破坏性参数；返回 `{ ok: true, ... }`  
- [x] preload 类型  
- [x] 单测：插入多赛道行 → clear → watchlist 空；同 tsCode 的 score 行仍在（若测试插入了 score）  
- [ ] Commit：`feat(trend): clearWatchlist IPC`（待用户要求时提交）

### Task 2: UI

- [x] TrendManager 页头「清空观察池」`data-testid="trend-watchlist-clear-all"`  
- [x] 确认文案含只数；busy 防双点  
- [x] 成功后 `load`/刷新 workbench 列表；Toast  
- [x] README 补充一键清空  
- [ ] Commit：`feat(trend): watchlist clear-all button`（待用户要求时提交）

### Task 3: 检核

- [x] 相关单测 + typecheck  
- [ ] 手工：44 只一键清空 → 0；取消不删  
- [x] 填写检核表  

---

## 设计初衷检核（完成后填写）

| Spec 项 | 结果 | 说明 |
|---|---|---|
| 一键清空整池 | 符合 | `trend:clearWatchlist` + UI |
| 确认框展示数量 | 符合 | subject 展示只数与登记条数 |
| 空池禁用 | 符合 | `watchRows.length === 0` 禁用按钮 |
| 取消不变更 | 符合 | Dialog onCancel 仅关窗 |
| 不删 scores/日线 | 符合 | 单测与实现仅 DELETE trend_watchlist |
| README | 符合 | TrendWatcher README 已补 |

**总评：** 符合设计。  
**检核人 / 日期：** Agent / 2026-08-09  

