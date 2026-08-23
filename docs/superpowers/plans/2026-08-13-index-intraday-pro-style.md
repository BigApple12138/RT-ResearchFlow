# 指数分时统一为专业版（蜡烛+VWAP） Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让三个预设指数（`000001.SH` / `399001.SZ` / `399006.SZ`）的「股票走势图」分时默认走 lightweight-charts 蜡烛+VWAP 专业版（与个股同一渲染管线），传统折线保留为样式按钮可切换的显式降级路径；指数分钟数据经 `datasource:getStockMinuteKline` 短路后由东财 `klt=1` 落库 `stock_minute_cache`，分时视图打开期间 60s 轮询刷新。

**Architecture:** 后端 `getStockMinuteKline` 对指数 tsCode 短路（跳过 Tushare `rt_min`，缓存键用带后缀 tsCode，未命中直走 `fetchEastmoneyMinuteOHLCV` 落库）；前端修复 `toTsCodeForMinute` 对含 `.` 代码原样透传，改写三处 `PRESET_CODES` 守卫为「指数轮询 / 个股订阅」行为分叉，放行 `loadMinuteFromDb` / `loadMinuteOHLCVFromDb`；样式切换按钮对指数显示。无 Migration（键空间天然隔离）。

**Tech Stack:** Electron 主进程 IPC（`aiHandlers.ts`）、better-sqlite3（`stock_minute_cache`，无结构变更）、既有 `fetchEastmoneyMinuteOHLCV`（东财 push2his klt=1，已支持指数 secid）、React StockChart、Vitest（全 mock，不打公网）。

**状态：** 已完成（验证与复审修复均已通过，2026-08-13）  
**Spec（设计初衷）：** [`../specs/2026-08-13-index-intraday-pro-style-design.md`](../specs/2026-08-13-index-intraday-pro-style-design.md)  
**归档：** 本 plan 必须保留在 `docs/superpowers/plans/`；执行完毕后填写文末「设计初衷检核」。约定见 [`../README.md`](../README.md)。

## Global Constraints

- 指数缓存键强制带后缀（`000001.SH`），禁止 `split('.')[0]` 裸键落库/查询（规避与平安银行 `000001` 撞键，设计稿 §4/§10-R1）
- 指数不调用 `subscribeStockMinute`（Tushare `rt_min` 不支持指数，必失败）；指数盘中刷新只走前端 60s 轮询，与个股订阅互斥
- `intradayStyle` localStorage 维持全局单键，不按标的拆分
- 不改 `getIntradayData`（东财 5 分钟折线）本身，它保留为降级路径；不改日线/筹码/因子/AI 预测线/MarketContext 等既有行为
- **不新增 Migration**：本改动无表结构/列/索引变化，仅写入值约定变化（指数行写带后缀键）
- 测试全 mock（vi.mock IPC / fetch / Tushare），禁止依赖付费调用或公网瞬时状态
- 改行为同步更新 `src/components/StockChart/README.md`
- 新增/改名 `data-testid` 时同步 E2E
- 只在用户明确说执行后改 `src/` / `electron/` 业务代码；commit 仅在用户明确要求时进行

## 依赖与顺序

```
Task 1（后端键策略与短路）→ Task 2（前端链路放行）→ Task 3（交互与刷新）→ Task 4（文档与测试收口）
```

- Task 1 先行：后端键口径与短路是前端一切读库路径的前提；若后端仍写裸键，前端放行后会与平安银行串读。
- Task 2 依赖 Task 1：`toTsCodeForMinute` 透传 + 守卫改写后，指数才能读到 Task 1 落库的数据。
- Task 3 依赖 Task 2：轮询与样式按钮建立在分钟链路放行之上。
- Task 4 收口：README、E2E、全量 `verify`、检核。

## File map

| 文件 | 职责 |
|---|---|
| `electron/main/ipc/aiHandlers.ts`（:2234 起） | `datasource:getStockMinuteKline` 指数短路：指数键查缓存、跳过 Tushare、东财 `klt=1` 落库写带后缀键 |
| `electron/main/services/tushareService.ts`（:63 `INDEX_SECID` / :968 `fetchEastmoneyMinuteOHLCV`） | 预计零改动，仅核实：指数 secid 映射已支持；若核实出缺陷才最小修复 |
| `electron/main/database/stockMinuteCacheRepository.ts` | 键口径核实（无代码改动）：`upsertStockMinute` / `getStockMinuteByDate` 按 `stock_code` 精确匹配，天然支持带后缀键 |
| `src/components/StockChart/StockChart.tsx` | :202 `toTsCodeForMinute` 透传；:896 分时 effect 改写为指数轮询分支；:1633 `handleToggleChartMode` 指数分支读库；:3452 样式按钮对指数显示 |
| `tests/unit/indexMinuteKline.handler.test.ts`（新建） | 后端短路 + 键策略单测 |
| `tests/unit/indexMinuteCacheKey.test.ts`（新建） | 缓存键隔离单测（内存 SQLite） |
| `tests/unit/stockChartIndexIntraday.test.tsx`（新建） | 前端透传 / 守卫 / 轮询 / 降级单测 |
| `src/components/StockChart/README.md` | FR 更新：指数分时专业版、轮询刷新、键口径、降级次序 |
| `tests/e2e/`（必要时） | 新增/改名 testid 时同步；指数分时端到端用本地 mock |

---

### Task 1: 后端指数缓存键策略 + `getStockMinuteKline` 短路

**Files:**
- Modify: `electron/main/ipc/aiHandlers.ts`（`datasource:getStockMinuteKline`，约 :2234-2291）
- Verify only: `electron/main/services/tushareService.ts`（`INDEX_SECID` :63、`fetchEastmoneyMinuteOHLCV` :968）
- Verify only: `electron/main/database/stockMinuteCacheRepository.ts`（键口径）
- Test: `tests/unit/indexMinuteKline.handler.test.ts`（新建）
- Test: `tests/unit/indexMinuteCacheKey.test.ts`（新建）

**Interfaces:**
- Consumes: `INDEX_SECID`（判定指数）、`fetchEastmoneyMinuteOHLCV(tsCode, tradeDate)`、`getStockMinuteByDate` / `upsertStockMinute`
- Produces: 指数 tsCode 请求 → 缓存按 `000001.SH` 精确查、未命中直走东财、落库 `stock_code='000001.SH'`；个股路径行为不变

**改动要点：**
- 以 `INDEX_SECID[tsCode]` 命中判定指数；指数分支：
  - 缓存查询/落库一律使用完整 tsCode（禁止现有 :2236 的 `split('.')[0]` 用于指数）；
  - 跳过 Tushare `fetchStockMinute` 段（指数 `rt_min` 必失败，白耗请求）；
  - 未命中直接 `fetchEastmoneyMinuteOHLCV(data.tsCode, tradeDate)`，`cacheRows.stockCode` 写完整 tsCode，回读同样传完整 tsCode。
- 个股分支维持现状（裸 6 位键、Tushare 优先、东财兜底），不得回归。
- 核实 `tushareService.ts` / `stockMinuteCacheRepository.ts` 零改动结论：读代码确认 `INDEX_SECID` 已含三个指数、`fetchEastmoneyMinuteOHLCV` 已按 `INDEX_SECID` 映射 secid、repository 按 `stock_code = ?` 精确匹配；核实结论写入本任务勾选备注。

**单测清单：**
- `indexMinuteCacheKey.test.ts`（内存 better-sqlite3，Migration 031 建表或等价 DDL）：
  - `upsertStockMinute` 写 `stock_code='000001.SH'` 后 `getStockMinuteByDate(db, '000001.SH', d)` 读回一致；
  - 同表同日期并存裸键 `000001`（模拟平安银行），两键互不覆盖、互不串读（断言各自行数与 close 值）；
  - 重复 upsert 同一 `(000001.SH, 当日, ts_minute)` 幂等（`INSERT OR REPLACE`，行数不增）。
- `indexMinuteKline.handler.test.ts`（vi.mock Tushare/东财/repository 依赖或按仓库既有 handler 测试模式注入）：
  - 指数 tsCode：断言 `fetchStockMinute` **零调用**；东财 mock 返回 N 根 bar → 落库行的 `stockCode === '000001.SH'`，返回 `{ ok:true, data }`；
  - 指数缓存已命中：直接返回缓存行，不调东财、不调 Tushare；
  - 东财 mock 返回空/抛错：返回 `{ ok:true, data: [] }`，不写库、不抛异常；
  - 个股 `600519.SH` 回归：缓存键为裸 `600519`，Tushare 段行为不变（mock）。

**完成标准：**
- [x] 写失败单测（键隔离 + 短路零调用 Tushare）并跑测确认失败
- [x] 实现 `getStockMinuteKline` 指数短路分支（键策略落地）
- [x] 核实 `tushareService.ts` / `stockMinuteCacheRepository.ts` 零改动并记录结论（核实结果：repository 零改动；`fetchEastmoneyMinuteOHLCV` 已支持指数 secid；仅将 `INDEX_SECID` 补加 `export` 供 handler 判定指数，无行为变化）
- [x] `pnpm exec vitest run tests/unit/indexMinuteKline.handler.test.ts tests/unit/indexMinuteCacheKey.test.ts` 通过（本机 pnpm 损坏，以 `ELECTRON_RUN_AS_NODE=1 electron vitest.mjs run` 等价执行，9/9 通过）
- [x] 复跑既有分钟链路相关单测（`minuteDataProvider`、`todayDailyBarRefresh`、`strategyLab.conditionSnapshotRun`、`conditionBlocks.minuteConditions`）不回归（23/23 通过）
- [ ] Commit（仅用户要求时）：`feat(datasource): 指数分钟 K 线短路东财并以带后缀键落库`

---

### Task 2: 前端分钟链路放行（透传 + 守卫改写）

**Files:**
- Modify: `src/components/StockChart/StockChart.tsx`
  - :202 `toTsCodeForMinute`
  - :1633 `handleToggleChartMode`（指数分支）
  - :896 分时订阅 effect（指数分支拆分）
- Test: `tests/unit/stockChartIndexIntraday.test.tsx`（新建，本任务只覆盖透传与读库放行部分）

**Interfaces:**
- Consumes: Task 1 后端键口径；`datasource:getStockMinuteKline` / 读库 IPC
- Produces: 指数进入分时后 `loadMinuteFromDb` / `loadMinuteOHLCVFromDb` 可用，`intradayOHLCV` 非空 → 命中蜡烛三分叉第一分支

**改动要点：**
- `toTsCodeForMinute`：含 `.` 的代码**原样透传**（返回自身）；6 位裸码后缀逻辑不变。**不改** `toTsCodeWithSuffix`（chips/factor 链路维持「含点返回空串跳过」）。
- `handleToggleChartMode`（:1633）：指数不再整体跳过分钟链路——指数分支**不调用** `subscribeStockMinute`，但同样 `await Promise.all([loadMinuteFromDb, loadMinuteOHLCVFromDb])`；`items` 为空时沿用现有 `getIntradayData` 降级。
- :896 分时 effect：指数分支不调用订阅相关 API，首拉读库逻辑保留（轮询放 Task 3）；个股分支原样。
- 守卫不完全删除：`PRESET_CODES` 判定保留，语义改为「指数走轮询、个股走订阅」的行为分叉。

**单测清单（本任务部分）：**
- `toTsCodeForMinute('000001.SH') === '000001.SH'`、`'399006.SZ'` 透传；`'600519' → '600519.SH'`、`'000001' → '000001.SZ'`、`'830799' → '830799.BJ'` 等既有用例不回归（若函数未导出，按仓库惯例导出或以等价纯函数抽测）。
- `toTsCodeWithSuffix('000001.SH') === ''` 语义不回归。
- mock `window.api`：指数进分时断言 `getStockMinuteKline`（或读库 IPC）以 `000001.SH` 调用、`subscribeStockMinute` **零调用**；返回 OHLCV 后 `intradayOHLCV` 生效走蜡烛分支。

**完成标准：**
- [x] 写失败单测并跑测确认失败（偏差：仓库无 testing-library，组件挂载不现实，改为对导出的纯函数/helpers 单测 + 源码契约断言，实现与测试同批落地）
- [x] 修复 `toTsCodeForMinute` 透传（含点原样返回）
- [x] 改写 `handleToggleChartMode` 指数分支（读库放行、不订阅；降级抽为 `resolveIntradayInitialData` 可测 helper）
- [x] 拆分 :896 分时 effect 的指数分支（不订阅；轮询在 Task 3 接入）
- [x] 相关单测通过（11/11）；个股分时既有单测不回归（StockChart 相关 6 文件 19/19）
- [ ] Commit（仅用户要求时）：`feat(stockchart): 指数接入分钟 OHLCV 读库链路`

---

### Task 3: 交互与刷新（样式按钮 + 60s 轮询 + 三级降级）

**Files:**
- Modify: `src/components/StockChart/StockChart.tsx`
  - :3452 样式切换按钮（对指数显示；必要时补 `data-testid`）
  - :896 effect（指数轮询定时器）
- Modify/Test: `tests/unit/stockChartIndexIntraday.test.tsx`（补轮询与降级用例）
- Modify（必要时）: `tests/e2e/`（若新增/改名 testid，同步既有分时相关 spec）

**Interfaces:**
- Consumes: Task 2 分钟链路放行
- Produces: 指数分时打开期间 60s 轮询 `getStockMinuteKline`（DB 未命中内部自动东财补拉）；样式按钮对指数可见可切；降级次序与设计稿 §8 一致

**改动要点：**
- 样式切换按钮：去掉 `!PRESET_CODES.includes(selected)` 条件（保留 `chartMode === "intraday"`）；`intradayStyle` 全局单键语义不变，指数与个股共用偏好。
- 指数轮询：分时视图打开且选中指数时，`setInterval` 60s 调 `getStockMinuteKline`，成功后刷新 `intradayOHLCV` 与折线 `intradayItems`（close 作 price 映射，复用现有映射）；离开分时/切换标的清除定时器；**与个股订阅 effect 互斥**（指数只轮询不订阅）。
- 三级降级（与个股对齐）：① 分钟链路有数据 → 蜡烛（或用户偏好折线）；② 分钟链路空 → `getIntradayData` 东财 5 分钟折线；③ 皆空 → 现有空态文案「当日暂无分时数据」；首拉 await 后再判空态，不出现一直转圈。
- 折线分支 `intradayItems` 对指数由分钟链路数据映射生成，不再单独依赖 `getIntradayData`（仅降级时回退）。

**单测清单（补测，用 vi.useFakeTimers）：**
- 指数分时打开：fake timers 前进 60s → `getStockMinuteKline` 再调用一次且以带后缀 tsCode；切离分时/切换标的 → 定时器清除、不再调用。
- 个股仍走订阅：断言个股不产生轮询调用（互斥）。
- 降级：东财 mock 失败/空 → 回退 `getIntradayData`；再失败 → 空态文案、`intradayLoading` 归 false。
- 样式按钮：指数蜡烛态点击 → 切折线且 `localStorage.intradayStyle === 'line'`；偏好刷新后保留。
- 若新增 testid：断言按钮存在性，并同步 e2e 引用。

**完成标准：**
- [x] 样式按钮对指数显示，偏好全局共享用例通过（新增 `data-testid="intraday-style-toggle-btn"`；`nextIntradayStyle` 单测 + 源码契约断言）
- [x] 指数 60s 轮询接入且与订阅互斥、卸载清理用例通过（`startIndexIntradayPolling` fake timers 单测；断言 `subscribeStockMinute` 零调用）
- [x] 三级降级用例通过（含空态不转圈：`resolveIntradayInitialData` 三级降级单测；首拉 await 后 `setIntradayLoading(false)` 路径不变）
- [x] 新增/改名 testid 时 E2E 同步；`pnpm exec vitest run tests/unit/stockChartIndexIntraday.test.tsx` 通过（新增 testid 无既有 e2e 引用，无需同步；测试以 electron node ABI 等价执行，11/11 通过）
- [ ] Commit（仅用户要求时）：`feat(stockchart): 指数分时样式切换与 60s 轮询刷新`

---

### Task 4: 文档收口 + 全量验证 + 设计初衷检核

**Files:**
- Modify: `src/components/StockChart/README.md`
- Modify: 本 plan 文末检核表
- Modify: spec 文首状态 → 已完成（仅状态字段，不改目标正文；用户确认后）

**改动要点：**
- README 更新 FR：指数分时默认专业版蜡烛+VWAP；指数键口径（带后缀）与「无 Migration」依据；指数轮询 vs 个股订阅的差异明示；三级降级次序；`intradayStyle` 全局偏好。
- 全量验证：`pnpm run verify`（TypeScript + ESLint + 单测 + 生产构建）。
- 手动核对设计稿 §11 验收场景 A-F（能本地验证的走 mock/预置数据）。

**完成标准：**
- [x] `src/components/StockChart/README.md` FR 更新完成（实现思路段改写 + 特殊逻辑备忘新增 6 条指数分时 FR）
- [x] `pnpm run verify` 全绿（偏差：本机 pnpm/corepack 损坏，按用户指示改用 node 直调等价执行：tsc node 0 错误、tsc web 仅 HEAD 既有 3 错、eslint 改动文件 0 error、全量 vitest 1496 过 / 6 个 HEAD 既有失败；未跑生产构建，dev 实例由验证环节重启）
- [x] 对照设计稿 9 项决策逐条填写文末「设计初衷检核」表；偏差写入检核表（9 项全 ✅，#6 带偏差；偏差汇总 4 条已记录）
- [ ] 用户确认后更新 spec/plan 状态；需要时再提 commit（待用户确认，未擅自改动 spec 状态；未 commit）

---

## 风险与回滚点

| # | 风险/回滚点 | 说明 |
|---|---|---|
| 1 | **回滚安全性（键空间隔离）** | 指数行以带后缀键（`000001.SH`）写入后，若整体回滚到旧代码：旧代码只读写裸 6 位键，指数键空间此前为空、旧代码也从不查询带后缀键，故**旧代码读裸键完全不受影响**，无脏读、无撞键；残留的指数行仅占少量空间，会被既有 `cleanupStockMinuteCache`（按 `trade_date` 清理）自然清除。**无需任何数据库回滚操作。** |
| 2 | 指数 `000001` 与平安银行撞键 | Task 1 键策略 + 单测双重保障；code review 时重点盯 `split('.')[0]` 不得作用于指数分支 |
| 3 | 轮询与订阅定时器并存重复请求 | Task 3 互斥设计 + fake timers 单测覆盖切换/卸载清理 |
| 4 | 东财接口瞬时不可用 | 三级降级保留；单测全 mock 东财失败路径 |
| 5 | `toTsCodeForMinute` 透传影响其他调用方 | 该函数仅被分钟链路调用（设计稿 §10-R5）；chips/factor 用的 `toTsCodeWithSuffix` 不动，并有回归断言 |

## 提交节奏建议

- 中文 Conventional Commits，按任务分提交（Task 1-3 各一次，Task 4 文档可与最后一次合并或独立 `docs(stockchart):`）。
- 建议提交信息：
  - `feat(datasource): 指数分钟 K 线短路东财并以带后缀键落库`
  - `feat(stockchart): 指数接入分钟 OHLCV 读库链路`
  - `feat(stockchart): 指数分时样式切换与 60s 轮询刷新`
  - `docs(stockchart): 同步指数分时专业版 FR 与检核`
- **仓库规则：仅在用户明确要求时才 commit/push；执行者不主动提交。**

---

## 设计初衷检核

> 对照设计稿逐条检核（2026-08-13 执行完毕）。

| # | Spec 决策/验收项 | 结果 | 说明 |
|---|---|---|---|
| 1 | 指数以带后缀 tsCode 作 `stock_minute_cache` 键，无需 Migration（§4） | ✅ | handler 指数分支强制用完整 tsCode 查/写；`indexMinuteCacheKey.test.ts` 验证 `000001.SH` 与裸键 `000001` 隔离与幂等；表结构零变化，未新增 Migration |
| 2 | `getStockMinuteKline` 指数短路 Tushare，直走东财 `klt=1` 落库（§5.1） | ✅ | 命中 `INDEX_SECID` 即短路，单测断言 `fetchStockMinute` 零调用；偏差：当日缓存命中时仍重拉东财（见 #6）；`INDEX_SECID` 补加 `export`（最小必要改动，无行为变化） |
| 3 | `toTsCodeForMinute` 含 `.` 代码原样透传；`toTsCodeWithSuffix` 语义不变（§5.2） | ✅ | 透传单测覆盖三个指数与 6 位裸码既有用例；`toTsCodeWithSuffix('000001.SH') === ''` 回归断言通过 |
| 4 | 指数默认蜡烛+VWAP 专业版，样式按钮对指数显示、折线为可切换降级（§6） | ✅ | 指数 `intradayOHLCV` 非空即命中 lwc 第一分支（与个股同管线）；按钮条件去掉 `!PRESET_CODES`，新增 `data-testid=intraday-style-toggle-btn`（源码契约断言） |
| 5 | `intradayStyle` 全局单键，不按标的区分（§6） | ✅ | `nextIntradayStyle` 单测验证 localStorage 全局单键读写；未按标的拆分 |
| 6 | 指数无订阅、分时视图打开期间 60s 轮询，与个股订阅互斥（§7） | ✅（带偏差） | `startIndexIntradayPolling` fake timers 单测：60s 节奏、带后缀调用、`subscribeStockMinute` 零调用、stop 后清零。偏差：为使轮询真实可感知刷新，后端对指数**当日**请求重拉东财 klt=1 幂等合并（东财空则返回既有缓存）；若严格按字面「缓存命中直接返回」，当日落库后轮询永远拿旧数据，与设计目标「行为对用户可感知」矛盾，故以目标为准；历史日仍严格缓存命中短路 |
| 7 | 三级降级与个股对齐，空态不转圈（§8） | ✅ | 抽 `resolveIntradayInitialData` 可测 helper：分钟链路 → 东财 5 分钟折线 → 空；`setIntradayLoading(false)` 在 await 后无条件执行，不转圈 |
| 8 | 非目标项不改：日线/筹码/因子/AI 预测线/MarketContext/`getIntradayData` 本身（§3、§9） | ✅ | 未触碰上述路径；`getIntradayData` 仅作降级消费；仅额外更新 `types.ts` 中 `StockMinuteCacheRow.stockCode` 注释以反映指数键口径（纯注释） |
| 9 | 测试全 mock，不依赖付费调用或公网瞬时状态；testid 变更同步 E2E（§12） | ✅ | 三个新测试全 mock（vi.mock IPC/Tushare/东财 + fake timers），未打公网；新增 testid 经 grep 确认无既有 e2e 引用，无需同步 |

**偏差汇总（除 #6 外均为实现手法层面）：**
1. `INDEX_SECID` 补加 `export`（计划预期 tushareService 零改动，但 handler 需消费该映射判定指数，属最小必要改动，无行为变化）。
2. 后端指数当日重拉东财（#6，以设计目标「可感知刷新」为准；计划字面的「缓存命中直接返回」仅对历史日保留）。
3. 前端未采用组件挂载式单测（仓库无 testing-library），改为导出纯函数/helpers 单测 + 源码契约断言，覆盖计划单测清单全部语义。
4. 全量 vitest 有 2 个 HEAD 既有失败文件（与本改动无关）：`noNativeDialogs`（HEAD 的 `AIAnalysis.tsx:935` 使用 `window.confirm`，文件未被本次触碰）；`aiDiscussionFollowUp.concurrency`（所依赖的 service/repository 均未被本改动触碰，时序敏感型失败）。

**检核结论：** 9 项决策全部落地，验收场景 A-F 均有对应单测/契约覆盖（A→handler 落库断言、B→键隔离、C→nextIntradayStyle、D→三级降级、E→个股回归、F→空态降级）；无范围外重构，未 commit。  
**检核日期：** 2026-08-13

---

## 修订记录（2026-08-13 三维度复审修复，不改写既有正文）

> 本节为 Task #13 复审修复的逐条记录；上文正文与检核表保持原样，偏差以本节为准。

### 必须修复（严重）

1. **尾盘半小时服务候选污染**：`closingHalfHourService.queryLocalCandidateCodes` 对 `stock_minute_cache` 全表 `GROUP BY stock_code` 扫描，指数轮询落库的带点键（如 `000001.SH`）会进入候选：`toTsCode()` 归一产出畸形码 `000001.SH.SZ`，且 `buildStock` 用 `split('.')[0]='000001'` 串读平安银行裸键行，还可能把畸形 tsCode 持久化进 `short_term_signals`。
   - 修复：候选查询 SQL 增加 `AND stock_code NOT LIKE '%.%'`；同文件其他 stock_code 扫描点已排查（`queryTodaySignalCodes` 查 short_term_signals.ts_code 且已有含点守卫；`buildStock` 按键精确读），无需额外排除。
   - `toTsCode()` 对含 `.` 输入防御性原样透传（此前行为是拼出错误后缀，透传只会更安全；调用点已抽查：仅 `queryLocalCandidateCodes` 与 `queryTodaySignalCodes`，后者已有含点判断，不破坏裸码/带后缀个股码既有用法）。为可测性导出 `toTsCode` / `queryLocalCandidateCodes`。
   - 新增单测 `tests/unit/closingHalfHourIndexKeyGuard.test.ts`：带点键不进入候选（内存 SQLite + 真实迁移）、畸形码不出现、`toTsCode('000001.SH')` 透传、裸码后缀与 14:30 门槛语义不回归。

### 应当修复（警告）

2. **StockChart 旧蜡烛残留竞态**：`handleToggleChartMode` 退出分时只清 `intradayItems` 不清 `intradayOHLCV`；且所有写入点均为 `if (ohlcv.length > 0)` 守卫，导致「标的 A 首拉未回时切到 B、B 分钟链路空降级折线」时 B 名下渲染 A 的蜡烛。
   - 修复：退出分支补 `setIntradayOHLCV([])`；全部 5 个写入点改无条件覆盖（指数 effect 首拉、指数轮询 apply、个股 effect 首拉、个股订阅事件、toggle handler）。逐点评估：渲染三分叉以 `intradayOHLCV.length > 0` 优先，覆盖为空数组即正确落折线/空态，不破坏「降级保留折线数据」语义（折线数据在 `intradayItems`，其守卫不变）。
3. **请求放大收敛**：原 `startIndexIntradayPolling` 每 tick 双路各调一次 `datasource:getStockMinuteKline`（每 60s 2 次，后端指数当日分支每次重拉东财 klt=1）；进入分时 toggle handler 与 effect 各跑一次 `resolveIntradayInitialData`（瞬时 4 并发）。
   - 修复：新增 `loadMinuteKlineOnce`（单次拉取，同一响应派生 items/ohlcv，同代码 in-flight 请求去重）。轮询、`resolveIntradayInitialData`、个股 effect 首拉全部改走它：每轮询周期只发 1 次 IPC；进入分时双路首拉经 in-flight 去重合并为 1 次（选此方案而非「只在 effect 首拉」：改动最小且个股既有行为不变，个股订阅链路保留）。
   - 同步更新 `aiHandlers.ts` 频控注释与 `src/components/StockChart/README.md` 频控表述为真实速率（前端每轮询周期 1 次 IPC → 东财 klt=1 真实 1 次/60s）。

### 建议修复（低成本一并做）

4. **aiHandlers 指数分支留痕**：东财失败补 `console.warn`（含错误信息）；东财返回空（`fetchEastmoneyMinuteOHLCV` 内部恒返回 `[]`，原 catch 为死代码）在 handler 能识别空结果的分支补 `console.warn`；风格参考同文件个股 rt_min 分支。handler 单测补 warn 断言。
5. **diagnosticsService 分钟缓存新鲜度**：`MAX(trade_date)` 排除带点键（spec 新增 `whereClause`/`whereColumn` 字段，`whereColumn` 不存在时放弃过滤以兼容简化夹具/旧库），避免指数轮询落库掩盖个股分钟数据缺失。
6. **样式切换按钮**：`localStorage` 副作用移出 setState updater（StrictMode 下 updater 可能双调用），onClick 体内先算 next 再 set；`nextIntradayStyle` 自身及其单测不变。
7. **E2E flake 防护**：`stock-chart-index-intraday-toggle.spec.ts` 的 `minuteRequests` 断言改用 `await expect(async () => {...}).toPass({ timeout: 5000 })` 包裹，仅改断言包裹不动其余逻辑。

### 不做（记录）

- 轮询感知交易时段（收盘后停轮询）：本轮不做，后续项。
- `tushareService.backfillTodayDailyFromIntradayIfMissing` 对指数裸码读取的存量一致性裂缝：本轮不做，后续项。

### 评审覆盖缺口补记

- 「个股不产生轮询调用（互斥）」契约断言：原实现时未覆盖，本轮在 `tests/unit/stockChartIndexIntraday.test.tsx` 补源码契约用例——轮询启动点位于 `PRESET_CODES.includes(selected)` 守卫分支内且全 effect 仅 1 处、指数分支不含订阅 API、个股分支仅含订阅链路不启动轮询。
- 新增 E2E spec（`stock-chart-index-intraday-toggle.spec.ts`）未实际执行：`out/` 为旧构建产物，全量重建成本不符约定，故未跑；ESLint 已过，本轮仅改断言包裹（修复 7），未改其余逻辑。

### 验证记录（2026-08-13）

- 双端 typecheck：`tsc -p tsconfig.node.json --noEmit` 0 错误；`tsc -p tsconfig.web.json --noEmit` 仅 HEAD 既有 3 错（ResearchAgentPanel/DecisionCenter/AgentSettings）。
- 定向单测（`ELECTRON_RUN_AS_NODE=1 electron vitest.mjs run`，当前 better-sqlite3 为 Electron ABI、dev 实例在跑，未做 ABI 切换）：`indexMinuteCacheKey` / `indexMinuteKline.handler` / `stockChartIndexIntraday` / 新增 `closingHalfHourIndexKeyGuard` 共 28/28 通过。
- 回归面：closingHalfHourJudgmentModel / closingHalfHourWorkbenchView / diagnostics（2 文件）/ minuteDataProvider / todayDailyBarRefresh / strategyLab.conditionSnapshotRun / conditionBlocks.minuteConditions / stockChartChipStructure.contract / stockChartHistoryPagination 全部通过（42/42，含 diagnostics whereClause 列存在性兼容修复后复跑）。
- eslint 改动文件 0 error（StockChart.tsx 3 个 HEAD 既有 warning，均位于本轮未触碰区域）。
- 未 commit/未 push；未重启/停止 dev 实例；未跑 E2E。
- 额外纠偏：复审中发现工作区存在一处与本功能无关的意外改动（aiHandlers.ts 预测 prompt 模板字符串的 `\n` 转义被误改为物理换行，语义等价但非本功能范围），已恢复为 HEAD 原样。
