# 快捷 K 线抽屉量能柱 + AI 量能上下文 Implementation Plan

> **For agentic workers:** 按任务勾选推进；优先 TDD；完成后填写文末「设计初衷检核」。本线程用户未要求 commit —— **不要提交**，仅保留工作区改动。

**Goal:** 统一「量能 = 成交量(手)」：抽屉/完整日 K 直方图、结构洞察「近 5 日量能」、以及所有已注入日线 OHLCV 的 AI 路径，均以 vol 为主口径。

**状态：** 已完成（代码未 commit）  
**Spec：** [`../specs/2026-08-10-mini-kline-volume-and-ai-context-design.md`](../specs/2026-08-10-mini-kline-volume-and-ai-context-design.md)

**Architecture:**  
在 `src/utils/volumeEnergy.ts` 锁定近 5 日量能 / 量比纯计算；主进程 `volumeContextSummary.ts` 基于同一公式产出 Markdown/CSV 单元格文案。UI（`StockMiniChart`、`StockChart`）日 K Histogram 改画 `vol`；结构洞察字段改名为 vol 语义；AI Round2 / fact prompt / forecast CSV 只调用 helper，不复制公式。不新开 IPC。

**Tech Stack:** React + lightweight-charts、Electron main services、Vitest、TypeScript

## Global Constraints

- 量能主度量 = `vol`/`volume`（手）；`amount`（千元）仅辅信息  
- 缺失量写 `--`/`null`，禁止用 0 冒充  
- 不荐股、不自动交易、不新 IPC  
- 产业收益窗口上下文、非量能产品面的成交额用法不在本批  
- 不 commit（本线程未授权）

## File Map

| 文件 | 职责 |
|---|---|
| `src/utils/volumeEnergy.ts` | 共享纯计算：近 5 日量能变化%、量比 |
| `tests/unit/volumeEnergy.test.ts` | 锁定 vol 公式 |
| `electron/main/services/volumeContextSummary.ts` | AI Markdown/CSV 量能摘要与单元格格式 |
| `tests/unit/volumeContextSummary.test.ts` | 摘要文案与口径单测 |
| `src/components/shared/stockStructureInsightModel.ts` | 「近 5 日量能」改 vol；字段改名 |
| `src/components/shared/StockStructureInsight.tsx` | UI 消费新字段 |
| `tests/unit/stockStructureInsightModel.test.ts` | 结构洞察 vol 口径 |
| `src/components/shared/StockMiniChart.tsx` | 抽屉 Histogram + tooltip 量(手) |
| `src/components/StockChart/StockChart.tsx` | 日 K Histogram 额→量；legend 口径 |
| `electron/preload/index.ts` | `getStockMiniKline` 类型补 `vol` |
| `electron/main/services/aiRound2MarketContextService.ts` | 注入 helper 量能摘要 |
| `electron/main/services/researchFactPromptService.ts` | formatStockFacts 追加量能摘要行 |
| `electron/main/services/researchFactToolRegistry.ts` | bars 可选 `amount`（辅）；volume 保持 |
| `electron/main/ipc/aiHandlers.ts` | 日线 CSV「量=成交量(手)」+ 旁路摘要 |
| `electron/main/services/aiEvaluationSuite.ts` | Round2 夹具对齐摘要 |
| `src/components/shared/README.md`、`StockChart/README.md` | FR/行为说明 |

## Tasks

### Task 1: 共享量能纯计算 + 单测

- [x] **Step 1–3:** `volumeEnergy.ts` + 单测 PASS；Commit 跳过

### Task 2: 主进程 volumeContextSummary helper + 单测

- [x] **Step 1–3:** helper + 单测 PASS；Commit 跳过

### Task 3: 结构洞察「近 5 日量能」→ vol

- [x] **Step 1–3:** `volumeChangePercent` + UI + 单测 PASS；Commit 跳过

### Task 4: preload 类型 + 抽屉 Histogram

- [x] **Step 1–3:** preload `vol`、抽屉 Histogram、README；Commit 跳过

### Task 5: 完整 StockChart 日 K 直方图 额→量

- [x] **Step 1–3:** 直方图/legend/README；Commit 跳过

### Task 6: AI 路径方案 3 接入 helper

- [x] **Step 1–3:** Round2 / formatStockFacts / price_history amount / aiHandlers CSV / 评测夹具；Commit 跳过

### Task 7: 验证 + 设计初衷检核

- [x] **Step 1:** focused 单测 27 PASS（Electron ABI）  
- [x] **Step 2:** `typecheck:node` + `typecheck:web` PASS  
- [x] **Step 3:** 自审对照 A–I；修 unused `h`；摘要仅有限 amount 才附带额  
- [x] **Step 4:** 勾选与检核完成；未 commit

## 设计初衷检核（完成后填写）

| Spec 项 | 结果 | 说明 |
|---|---|---|
| A 抽屉成交量柱 | 符合 | `StockMiniChart` HistogramSeries，主序列 `vol`，涨跌半透明色，`scaleMargins.top≈0.72` |
| B 缺 vol 不画假 0 | 符合 | filter 跳过 null/非有限；摘要/单元格写 `--` 或空串 |
| C preload 含 vol | 符合 | `getStockMiniKline` 行类型补 `vol: number \| null` |
| D Round2 量列+摘要 | 符合 | 表列成交量(手)+`summarizeVolumeEnergy`；单测断言 |
| E price_history + 事实底稿 | 符合 | bars 可带可选 `amount`；`formatStockFacts` 追加量能摘要行 |
| F 近 30 日 CSV 量=手 | 符合 | `buildRecentDailyOhlcvPromptBlock`：头注明量=成交量手 + 摘要 |
| G 近 5 日量能均基于 vol | 符合 | 共享 `computeNear5dVolumeChangePercent`；结构洞察 `volumeChangePercent`；单测证明不受 amount 干扰 |
| H 完整图直方图=成交量 | 符合 | `StockChart` 日 K Histogram 用 `成交量`；legend 主显量、额为辅 |
| I 合规无荐股/下单 | 符合 | 摘要固定「观察事实、非买卖信号」；无新交易能力 |

**总评：** 符合设计；未 commit，待用户 smoke-test（抽屉量柱 + AI 上下文）后按需提交。  
**检核人 / 日期：** Agent / 2026-08-10  

### 自审备注 / 残余风险

- 完整图从「额柱」改为「量柱」为有意口径统一，旧截图数值不可比。  
- 结构洞察数值从 amount 改 vol，与历史 UI 截图不可比。  
- 抽屉加柱后视觉密度上升；若过挤可再微调图高/margins（未另开第二 chart）。  
- `AI_EVALUATION_SUITE_FINGERPRINT` 因夹具文案变更而变化（版本号未抬），属预期。  
- 需重启/热重载 Electron 后验证 preload 类型与抽屉运行时。
