# 指数分时统一为专业版（蜡烛+VWAP）— 设计

**状态：** 已批准 · 已实现（2026-08-13）  

**日期：** 2026-08-13  
**方法论：** SDD  

## 1. 问题

「股票走势图」中个股分时已有 lightweight-charts 蜡烛+VWAP 专业版，但三个预设指数（上证指数 `000001.SH`、深成指 `399001.SZ`、创业板指 `399006.SZ`，定义于 `StockChart.tsx` `PRESET_INDICES`/`PRESET_CODES`）永远走 Recharts 传统折线，样式切换按钮对指数隐藏。

根因：`StockChart.tsx` 中三处 `PRESET_CODES` 守卫把指数排除在分钟 OHLCV 链路之外——

1. `handleToggleChartMode`（约 :1633）：指数跳过 `subscribeStockMinute` 与 `loadMinuteFromDb`/`loadMinuteOHLCVFromDb`；
2. 分时 60s 订阅 effect（约 :896）：指数直接 `return`，不订阅、不轮询刷新；
3. 样式切换按钮（约 :3452）：`!PRESET_CODES.includes(selected)` 条件隐藏按钮。

于是指数只能落入 `datasource:getIntradayData`（东财 `klt=5`，仅 `time/price/volume` 三字段、不持久化），进而命中渲染三分叉的 Recharts 折线降级分支。这些守卫的原始动机是「Tushare `rt_min` 不支持指数」，但后端东财 `klt=1` 回退链实际已支持指数，屏蔽属于升级遗漏。

附加缺陷：前端 `toTsCodeForMinute`（`StockChart.tsx:202`）不识别已含 `.` 的指数代码，会生成 `000001.SH.SZ` 之类的错误后缀。

用户已批准目标：**指数统一成专业版（蜡烛+VWAP），传统折线保留为可切换的降级路径。**

## 2. 目标

- 三个预设指数的分时默认渲染专业版蜡烛+VWAP，与个股同一 lightweight-charts 管线。
- 指数分钟数据接入 `datasource:getStockMinuteKline` 回退链并持久化到 `stock_minute_cache`（东财 `klt=1` 落库）。
- 样式切换按钮对指数显示，可切回传统折线。
- 指数分钟链路打开期间有盘中刷新（轮询），行为对用户可感知且不打扰。

## 3. 非目标

- 不改日线/K线模式（含日线蜡烛、MA/BOLL、筹码、因子）。
- 不改 MarketContext、观察池、AI 预测线等其他数据消费方对指数的既有行为（AI 预测线在指数上的现有行为原样保留）。
- 不做指数 Tushare 订阅（`rt_min` 本身不支持指数；不引入新行情源）。
- 不改 `getIntradayData`（东财 5 分钟折线）本身，它保留为降级路径。
- 不改其他页面（如 MarketContext 看板）中 `useMarketIndexQuotes` 等指数数据消费方。
- 交易所展示代码 `1A0001` 不引入：本项目数据层统一 Tushare/东财口径 `000001.SH`。

## 4. 指数缓存键策略（关键决策）

- **决策：指数以带后缀 tsCode（如 `000001.SH`）作为 `stock_minute_cache.stock_code` 键**，与个股的裸 6 位键并存于同一表。
- 理由：`stock_code` 为 TEXT 列且主键为 `(stock_code, trade_date, ts_minute)`（Migration 031，`db.ts:471-486`），`000001.SH` 与平安银行的 `000001` 是不同键，天然规避撞键；无需区分「指数表/个股表」。
- **无需新增 Migration**：本改动不新增/修改/删除任何表结构、列、索引，仅是写入值的约定变化（指数行写带后缀键）。仓库硬要求「数据库结构变化必须新增向前 Migration」，此处不属于结构变化，故不新增；依据即上文表结构核实。
- 幂等与旧库行为：旧库升级后首次打开，表结构无变化，Migration 031 原样 `CREATE TABLE IF NOT EXISTS` 执行；存量裸键数据（个股）不受影响，指数键空间此前为空，无历史数据冲突。`upsertStockMinute` 使用 `INSERT OR REPLACE`，重复轮询写入同一 `(000001.SH, 当日, ts_minute)` 天然幂等。
- 读侧对齐：`getStockMinuteByDate` 按 `stock_code = ?` 精确匹配，指数查询必须传完整 `000001.SH`；个股查询继续传裸 6 位码，两者互不影响。

## 5. 数据链路放行

1. **后端 `datasource:getStockMinuteKline`（`aiHandlers.ts:2234`）对指数短路：**
   - 识别指数：`INDEX_SECID` 已含 `000001.SH / 399001.SZ / 399006.SZ`（`tushareService.ts:63-69`），以 tsCode 命中该映射即判定指数。
   - 指数时：跳过 Tushare `fetchStockMinute`（`rt_min` 不支持指数，调用必失败、白耗一次请求）；缓存命中判断也按指数键 `000001.SH` 查询，避免 `split('.')[0]` 得到裸 `000001` 与平安银行撞键。
   - 缓存未命中 → 直接 `fetchEastmoneyMinuteOHLCV(tsCode, tradeDate)`（已支持指数 secid 映射 `000001.SH → 1.000001`），落库时 `stock_code` 写完整 tsCode。
2. **前端 `toTsCodeForMinute` 修复：** 已含 `.` 的代码原样透传（返回自身），不再追加后缀；与既有 `toTsCodeWithSuffix` 的「含点返回空串跳过」语义区分开——分钟链路是「透传」，chips/factor 链路保持「跳过」不变。
3. **前端 `loadMinuteFromDb`/`loadMinuteOHLCVFromDb` 对指数放行**：修复 2 之后这两个函数对指数自然可用，无需额外分支。
4. 三处 `PRESET_CODES` 守卫按第 6、7 节方案改写；守卫不完全删除，改为区分「指数走轮询、个股走订阅」的行为分叉。

## 6. 渲染与交互

- 指数进入分时且 `intradayOHLCV` 非空时，默认走专业版蜡烛+VWAP（三分叉第一分支），与个股同一路径。
- 样式切换按钮对指数显示；指数同样可切到传统折线（`intradayItems` 折线分支保留为显式降级路径）。
- **`intradayStyle` localStorage 语义：不按标的区分，维持全局单键。** 理由：这是用户的展示偏好而非数据属性，指数与个股共用一套渲染管线，按标的拆分只会增加状态复杂度而无收益；指数与个股跟随同一偏好切换即可。
- 传统折线分支所需的 `intradayItems`（`time/price/volume`）对指数继续由分钟链路数据映射生成（close 作 price），不再单独依赖 `getIntradayData`；仅当分钟链路为空时才回退 `getIntradayData`（见第 8 节）。

## 7. 刷新策略

- **指数无 Tushare 订阅（`rt_min` 不支持），盘中刷新采用轮询**：分时视图打开且选中指数时，按既有 60s 节奏定时调用 `getStockMinuteKline`（DB 未命中时其内部自动东财补拉），成功后刷新 `intradayOHLCV`/`intradayItems`。
- 与个股的差异明示：个股是「订阅推送」（`subscribeStockMinute` + `onStockMinuteUpdated` 事件驱动），指数是「前端定时拉取」。指数不调用 `subscribeStockMinute`（其内部会尝试 Tushare 374，指数必失败）；离开分时模式/切换标的时清除轮询定时器。
- 节奏与个股 60s 一致；东财 `klt=1` 探针实测 1 次/60s 不触发反爬（见 `fetchEastmoneyMinuteOHLCV` 注释），指数与个股共用该节奏无额外风险。

## 8. 空态与降级

指数分钟数据不可用时的展示次序（与个股既有降级对齐）：

1. 分钟链路（DB + 东财 `klt=1`）有数据 → 专业版蜡烛（或用户偏好的折线）。
2. 分钟链路为空 → 回退 `getIntradayData` 东财 5 分钟折线（`klt=5`，现有路径，不持久化），作为空态前降级。
3. 两者皆空 → 现有空态文案「当日暂无分时数据」（盘前/非交易日指数亦走此态）。

## 9. 本改动明确不改

- AI 预测线在指数上的现有行为（`forecast-menu-btn` 等逻辑不动）。
- 日线模式、筹码、因子、基本面抽屉对指数的既有守卫。
- MarketContext、观察池、`useMarketIndexQuotes` 等其他指数数据消费方。
- 除 `src/components/StockChart/README.md`（行为变更后同步更新 FR 描述）之外的文档；不新增对外文档。

## 10. 风险清单与缓解

| # | 风险 | 缓解 |
|---|---|---|
| R1 | 指数 `000001` 与平安银行 `000001.SZ` 缓存撞键 | 指数键强制带后缀（第 4 节）；`getStockMinuteKline` 指数分支不做 `split('.')[0]` 落库 |
| R2 | 指数成交量单位为手、量级远大于个股，vol 轴/量能展示失衡 | 蜡烛分支 vol 轴按标的自身量级自动缩放（lightweight-charts 独立 priceScale）；VWAP 计算 Σclose·vol/Σvol 对指数语义成立（成分加权近似），无需特殊处理；若量轴标签格式化溢出则复用现有大数缩写格式化 |
| R3 | 盘后/非交易日/午休指数的边界行为 | 东财 `klt=1` 带 beg/end 取单日，非交易日返回空 → 走第 8 节降级；午休过滤复用现有 `isAShareLunchBreak` |
| R4 | 指数轮询与个股订阅定时器并存导致重复请求 | 轮询定时器与订阅 effect 互斥：指数只轮询不订阅，个股只订阅不轮询；切换标的时统一清理 |
| R5 | `toTsCodeForMinute` 透传改动影响 chips/factor 等其他调用方 | 该函数仅被分钟链路（`loadMinuteFromDb`/`loadMinuteOHLCVFromDb`）调用；chips/factor 用的是另一个 `toTsCodeWithSuffix`，不动 |
| R6 | 东财接口瞬时不可用导致指数分时全空 | 回退链保留（5 分钟折线 → 空态文案），不出现一直转圈；首拉 await 后再判空态（沿用 2026-08-11 设计的等首轮策略） |

## 11. 验收

| # | 场景 | 期望 |
|---|---|---|
| A | 盘中选中上证指数进分时 | 默认蜡烛+VWAP，`stock_minute_cache` 出现 `stock_code='000001.SH'` 行 |
| B | 同一库中已有平安银行 `000001` 分钟数据 | 两者互不覆盖、互不串读 |
| C | 指数蜡烛态点「传统版」 | 切为折线且刷新后偏好保留（全局 `intradayStyle`） |
| D | 东财 `klt=1` 不可用（mock 失败） | 指数降级到 5 分钟折线；再失败显示空态文案，不转圈 |
| E | 个股（如 600519）全流程 | 与现网一致：订阅推送、蜡烛/折线切换均不回归 |
| F | 非交易日/盘前打开指数分时 | 空态文案明确，无错误渲染 |

## 12. 测试计划

- **单测（Vitest，不依赖付费调用与公网瞬时状态）：**
  - 键策略：指数 tsCode 以带后缀键写入/读取 `stock_minute_cache`；`000001.SH` 与裸 `000001` 隔离。
  - 短路逻辑：`getStockMinuteKline` 对指数 tsCode 不调用 `fetchStockMinute`（mock Tushare 断言零调用），直接走 `fetchEastmoneyMinuteOHLCV`（mock 返回）。
  - 后缀透传：`toTsCodeForMinute('000001.SH') === '000001.SH'`；`'600519' → '600519.SH'` 等既有用例不回归。
- **既有回归面：** 分时相关 Vitest 用例（个股分钟链路、东财回退）全部复跑；`verify` 全量。
- **E2E（Playwright）：** 若新增/改名 `data-testid`（如指数样式切换按钮的 testid）必须同步 E2E；指数分时的端到端用例使用本地 mock/预置数据，不打公网。

## 13. 主要路径

- `src/components/StockChart/StockChart.tsx`（三处守卫、`toTsCodeForMinute`、轮询 effect、样式按钮）+ README
- `electron/main/ipc/aiHandlers.ts`（`datasource:getStockMinuteKline` 指数短路）
- `electron/main/services/tushareService.ts`（`INDEX_SECID` / `fetchEastmoneyMinuteOHLCV`，预计无需改动，仅复用）
- `electron/main/database/stockMinuteCacheRepository.ts`（键约定，无结构变更）
