# 快捷 K 线抽屉量能柱 + AI 量能上下文 — 设计

**状态：** 已完成（实现已落地，未 commit）  

**日期：** 2026-08-10  
**方法论：** SDD  
**关联 plan：** [`../plans/2026-08-10-mini-kline-volume-and-ai-context.md`](../plans/2026-08-10-mini-kline-volume-and-ai-context.md)  
**用户已定范围：**  
1. **量能口径统一为成交量（`vol` / `volume`，单位：手）** — 抽屉柱、完整日 K 柱、「近 5 日量能」、AI 量能摘要/「量能」强调字段均以此为主度量；不再以成交额作「量能」主口径。  
2. **AI 方案 3** — 凡已向模型注入日线 / 行情 OHLCV 上下文的路径，均应一致带上量能事实（以成交量为主，可选附带成交额及紧凑摘要）。

## 1. 问题

1. **快捷抽屉**（`StockKlineChipDrawer` / `StockMiniChart`）日 K 仅蜡烛 + MA/BOLL，故意未挂 `HistogramSeries`；完整 `StockChart` 日 K 已有量能柱，但当前画的是 **成交额**。用户在趋势雷达 / 持仓等共用抽屉里看不到量，且与完整图指标不一致时更难做统一量价观察。  
2. **AI 上下文**里「量」参差不齐：部分路径已带逐日 `volume`，但缺少统一口径的量能摘要（如近 5 日量能变化）；部分文案/摘要若偏成交额会与「量能 = 成交量」产品口径冲突；preload 对 `getStockMiniKline` 的类型漏掉运行时已有的 `vol`。  
3. 结构洞察 UI（`stockStructureInsightModel` / `StockStructureInsight`）「近 5 日量能」当前用 **amount** 计算，与「都统一用成交量」决策及 AI 注入口径不一致，易漂移。

## 2. 目标

- 抽屉日 K **蜡烛下方**增加量能柱，**主序列 = 成交量 `vol`（手）**；视觉手法对齐完整图（独立 `priceScale`、涨跌着色、`scaleMargins`），不新引图表库。  
- **同一统一口径**：完整 `StockChart` 日 K 直方图由 **成交额 → 成交量**；结构洞察「近 5 日量能」改为 **成交量** 前后窗对比；AI 量能摘要 / 「量能」主字段以 **vol** 为准。  
- **方案 3**：所有已序列化「日线 OHLCV / 行情 bar」给模型的路径，经**共享 helper** 注入一致的量能字段与紧凑摘要；优先扩展现有 context builder / fact tool，**不新开 IPC**。  
- 厘清并在类型与文案中固定：`vol` / `volume` = 成交量（手）；`amount` = 成交额（千元，与 Tushare daily / `stock_price_cache` 一致）。**「量能」产品语义 = 成交量**；成交额可为辅信息（hover / 表可选列），不得再充当「近 5 日量能」或直方图主指标。  
- 补齐 preload / 前端类型，使 `vol`（及已有 `amount`）与运行时一致。

## 3. 非目标

- 不荐股、不给买卖/仓位/止损指令，不因「放量」输出交易建议语气。  
- 不新增拉取量能的 IPC；不改全市场同步任务语义。  
- 不把产业研究「收益窗口 / 估值对照」类 *非 OHLCV 序列* 上下文强行塞入逐日量（见 §4.3 排除项）。  
- 不改分时图主交互；分钟路径若已带 `v=vol` 则仅做口径一致性检查，不作为本批主改造面。  
- 不把结构洞察 UI 重做成 AI 产品面（改其量能**计算口径**为成交量，并与 helper 公式一致即可）。  
- 不强制删除所有 amount 字段或缓存合并逻辑：额仍可保留为辅列/hover，只是不再定义「量能」。

## 4. 现状盘点（已复核）

### 4.1 UI / 数据

| 位置 | 现状 | 本批目标 |
|---|---|---|
| `StockKlineChipDrawer` / `StockMiniChart` | `lightweight-charts` 蜡烛 + MA/BOLL；**无** Histogram | 增 Histogram，**成交量 vol（手）** |
| `StockChart` 日 K | `HistogramSeries`，数据为 **成交额**（`成交额` / `amount`），涨跌色，`priceScaleId: "volume"`，`scaleMargins.top ≈ 0.7` | **迁移为成交量**，与抽屉统一（见 §5.4） |
| `shortTerm:getStockMiniKline` | 返回行含 `vol`、`amount`（amount 自 `stock_price_cache` 合并；今日合成 bar 可带两者） | 类型补 `vol`；柱用 `vol` |
| preload `getStockMiniKline` 类型 | 有 `amount`，**漏 `vol`** | 补 `vol` |
| `stockStructureInsightModel` / `StockStructureInsight` | 「近 5 日量能」用 **amount** 前后 5 日对比 | **改为成交量（vol）** 同窗对比；文案仍可叫「近 5 日量能」但语义 = 成交量 |

### 4.2 已向 AI 注入日线 / 行情 bar 的路径（方案 3 纳入）

| # | 路径 | 注入形态 | 量能现状 | 本批动作 |
|---|---|---|---|---|
| A | 资讯第二轮 `prepareArticleRound2MarketContext` / `buildStockSection` | Markdown：摘要 + OHLC 表 | 表已有「成交量(手)」列；无紧凑量能摘要；无额列 | **主列保持/强调成交量**；摘要行调共享 helper（**近 5 日量能基于 vol**）；额列可选（有则填，标注千元，不作「量能」） |
| B | `stock.price_history`（`researchFactToolRegistry`） | 结构化 bars → Agent / Round2 / 证据 | bars 有 `volume`，**无 `amount`** | 保证 `volume` 完整；`amount` 可选扩展（缓存合并，与 mini K 同源），**摘要以 volume 为主** |
| C | `researchFactPromptService.formatStockFacts`（含 `includePriceHistory`） | 事实底稿 Markdown | 仅最新收盘等，**无量能摘要** | 追加一行紧凑量能摘要（**成交量口径**） |
| D | 深度研究 Agent 消费 `stock.price_history` 投影 | JSON/投影 | 随 B | 随 schema；摘要可由 helper 写入投影或依赖模型读 bars |
| E | `aiHandlers` 预测/走势类：`predictTrendMorrow` 等「近 30 日日线 CSV」 | `日期,开,高,低,收,量` | 有 volume；部分 prompt 对「量能」可能未标明单位/口径 | CSV **量 = 成交量(手)** 为主；单位标注清晰；旁路摘要行用 helper（vol）；额列可选 |
| F | 同文件内其它拼「近 30 日日线…量」的 prompt 分支 | 同上 | 同上 | 与 E 同一 helper；凡强调「量能」处对齐 **成交量**，勿只写额 |
| G | `aiEvaluationSuite` Round2 样例 `marketContext` | 评测夹具 | 无量能摘要 | 夹具对齐新摘要字段（vol 口径），免评测漂移 |

### 4.3 明确排除（非「日线 OHLCV 注入」）

- **产业** `buildIndustryResearchMarketContext`：共同交易日收益窗口 / 归一化曲线，不序列化逐日 OHLCV → **不纳入**本批量能注入。  
- **趋势评分 / SMC 结构摘要**：消费 OHLCV 做本地计算，不把逐日量表格塞进 prompt（除非日后改为注入 raw bars）。  
- **仅分时**且已含 `v` 的片段：保持现状；若缺单位说明可顺手标注「手」，不做大改。  
- **非「量能」产品面的成交额用法**（选股筛选、板块成交额排序、策略规则里的成交额放大等）**不在本批强制改为成交量**；仅统一「量能 / K 线量柱 / 近 5 日量能 / AI 量能摘要」这条产品语义。

## 5. 方案

### 5.1 语义与数据（已锁定）

- **`vol` / `volume`**：成交量，单位 **手**（与 `daily_close_cache.vol`、Tushare `vol` 一致）。**= 本设计「量能」主度量。**  
- **`amount`**：成交额，单位 **千元**（与 `stock_price_cache.amount`、mini K 合并逻辑一致；rt_k 合成时已 `/1000`）。**= 辅信息**，可出现在 hover / 可选表列，**不得**再作为直方图主序列或「近 5 日量能」公式输入。  
- 缺失时写 `--` / `null`，**禁止**用 0 冒充。  
- `ResearchPriceBar` 可保留/增加可选 `amount: number | null`（辅）；`loadPriceBars` 合并 `stock_price_cache.amount` 时不改变「量能 = volume」定义。  
- Preload / 渲染类型：`getStockMiniKline` 行补上 `vol: number | null`。

### 5.2 共享 helper（主进程）

新增纯函数模块（建议名如 `volumeContextSummary.ts`，实现阶段定路径），对「按日排序的 bar 列表」提供：

1. **`summarizeVolumeEnergy(bars)`**（紧凑事实，供 Markdown / 旁注）  
   - 最新一日：**优先** `vol`（手）；`amount` 有则可附带（千元），文案区分「成交量 / 成交额」，避免混称「量能」。  
   - **近 5 日量能变化（主口径 = 成交量）**：近 5 日 **`vol` 均值** vs 前 5 日 **`vol` 均值**；不足则 `null` + 说明。  
     - **口径变更说明（相对旧实现 / 旧稿）**：旧结构洞察与早期 design 草稿曾用 **amount**；用户决定「都统一、都用成交量」后，**废止 amount 作为近 5 日量能输入**。结构洞察与 AI helper **必须同公式（vol）**。  
   - **量比观察（可选一行）**：最新 `vol` / 近 20 日（不含当日）均量；样本不足则省略。  
   - 文案须标明「观察事实、非买卖信号」口径，与 Round2 支撑压力免责一致。  

2. **`formatDailyBarVolumeCells(bar)`** / CSV 列帮助函数：统一「手」为主列格式；额列若存在则单独标注「千元」，避免 Round2 表与 forecast CSV 各写一套。  

消费方：§4.2 A–G 只调用 helper，不复制百分比公式。Renderer 结构洞察应改为同一 **vol** 公式（抽 shared 纯 TS 或复制锁定单测）；本设计要求**公式一致**，不强制同文件。

### 5.3 AI 注入策略（方案 3）

- **有逐日表 / CSV 的路径**：保留（或补齐）**成交量**列为主；表头/CSV 头写清「手」。成交额列为可选增强，不得取代量列，也不得在 prompt 中把「量能」仅绑到额。  
- **有事实摘要、无全表的路径**（如 `formatStockFacts`）：至少注入 helper 的**一行量能摘要**（vol 口径）。  
- **工具 JSON**（`stock.price_history`）：bars 必带可用的 `volume`；`amount` 可选；Agent 侧不另造「量能专用工具」。  
- Prompt 默认文案：Round2 已要求「量价特征」→ 保持；凡强调「量能」处对齐 **成交量(手)**；必要时在边界段加一句「量能摘要口径见上下文（成交量/手），不得用记忆补量」。  
- **不**为量能单独增加用户可见开关或新模型调用。

### 5.4 UI：抽屉 + 完整图 + 结构洞察（统一成交量）

**抽屉（`StockMiniChart`）**

- 同一 chart 增加 `HistogramSeries`：  
  - **主序列：成交量 `vol`（手）**（已锁定）。  
  - 涨跌色：与当日 K 线涨跌一致（对齐现有 StockChart 半透明红/绿手法）。  
  - `priceScale` 独立，`scaleMargins` 约 `top: 0.7~0.75`，保证蜡烛区可读、抽屉总高度可接受（30/60/120 切换不另开第二图）。  
- 十字光 / hover：展示 **量(手)**；若有 `amount` 可附带 **额(千元)**（辅）。  
- 无 `vol` 的 bar：跳过该直方图点，不画 0 柱充数。  

**完整 `StockChart` 日 K 直方图（纳入本批，统一口径）**

- 现状：`HistogramSeries` 使用 `成交额` / `amount`。  
- **本批验收内迁移为成交量（`vol` / 等价字段）**，布局手法可不变（独立 volume scale、涨跌色、margins）。  
- hover / 图例 / README：标明「成交量(手)」；额若仍展示则明确为辅。  
- 范围判断：改动集中在日 K histogram 数据源与文案，**不**借机重构整个 `StockChart`；若实现时发现牵连过大，plan 阶段可拆子任务，但**仍属本 design 验收范围**，不得以「完整图继续用额」作为最终态。  

**结构洞察「近 5 日量能」**

- `stockStructureInsightModel` 计算输入由 `amount` → **`vol`（成交量）**；UI 标签可保留「近 5 日量能变化」，语义与 AI helper 一致。  
- 字段命名若仍叫 `amountChangePercent` 会造成误导：实现阶段应改名或增加 vol 字段并弃用旧语义（plan 细化）；设计要求：**对外语义 = 成交量变化百分比**。

实现后更新相关 README（`shared`、`StockChart` 等，实现阶段）。

### 5.5 产品原则

- 本地优先；量能来自已有缓存 / 既有补拉路径。  
- 窄 IPC：只修类型与消费，不新 channel。  
- 量能是**观察依据**（成交量），文案与 AI 边界不得滑向荐股或自动交易。

## 6. 验收

| # | 场景 | 期望 |
|---|---|---|
| A | 打开快捷抽屉（雷达 / 持仓 / 策略等共用）有日 K | 蜡烛下方可见 **成交量** 柱；涨跌色可辨；抽屉仍紧凑、无横向溢出 |
| B | 某日 `vol` 缺失 | 该日无柱或跳过；不出现假 0 量堆 |
| C | preload / TS | `getStockMiniKline` 类型含 `vol`；与运行时一致 |
| D | Round2 行情上下文 | **成交量**列 + 紧凑量能摘要（vol 口径）；单位正确；额列若有则标注千元且不充当「量能」 |
| E | `stock.price_history` + 事实底稿 | volume 可用；format 含量能摘要行（成交量） |
| F | 近 30 日日线 CSV 类预测 / 走势 prompt | **量 = 成交量(手)**；摘要/单位说明一致；无新 IPC |
| G | 近 5 日量能变化 | 结构洞察与 helper **均基于 vol**；单测锁定；**不得**再以 amount 为该指标输入 |
| H | 完整 `StockChart` 日 K 直方图 | 主序列为 **成交量**；图例/hover 口径与抽屉一致 |
| I | 合规 | 无新增荐股 / 下单 / 仓位控制文案 |

## 7. 风险与缓解

| 风险 | 缓解 |
|---|---|
| 抽屉加柱后变挤 | 复用 StockChart margins；必要时略增图区高度，不引入双 chart |
| 完整图从额改量，用户短期习惯变化 | hover/图例明确「成交量(手)」；README 写清统一口径；可选 hover 仍显示额作辅 |
| 结构洞察从 amount 改 vol，数值与旧版不可比 | 属有意口径统一；单测固定新公式；不在 UI 承诺与历史截图数值一致 |
| amount 缓存缺口 | 额为辅；摘要主路径不依赖 amount；不阻断 K 线 |
| 方案 3 触达面散 | 强制单 helper + 验收表逐路径勾选；单测覆盖 summary 与 Round2 片段 |
| Token 变长 | 摘要固定短行；不因本批把 limit 提到 30 根以上 |

## 8. 实现触达（批准后 plan 细化）

- `src/components/shared/StockMiniChart.tsx`（抽屉 Histogram → vol）  
- `src/components/shared/stockStructureInsightModel.ts` / `StockStructureInsight.tsx`（近 5 日量能 → vol）  
- `src/components/StockChart/StockChart.tsx`（日 K Histogram → vol）  
- `src/components/shared/README.md`、`src/components/StockChart/README.md`  
- `electron/preload/index.ts`（类型）  
- `electron/main/services/`：volume summary helper；`researchFactToolRegistry`；`aiRound2MarketContextService`；`researchFactPromptService`；必要时 `aiHandlers` 日线 CSV 分支；`aiEvaluationSuite` 夹具  
- 单测：summary **vol** 口径、结构洞察公式、Round2/markdown 片段、类型契约  

## 9. 开放问题

**无阻塞开放问题。**  

用户已确认：**都统一，都用成交量（手）**；AI 范围维持方案 3。  
用户已批准整份 design（「可以了」/ AFK 授权执行），进入 plan → implement → verify。

## 10. Spec 自检（相对旧稿）

- [x] 已删除「近 5 日量能保持 amount」与「抽屉用量、完整图用额」并存的矛盾表述。  
- [x] 抽屉柱、完整图柱、结构洞察、AI「量能」摘要均锁定 **成交量(vol/手)** 为主。  
- [x] `amount` 降为辅信息；非量能产品面的成交额用法明确排除。  
- [x] AI 仍为方案 3；design 已批准；plan 已编写。  
