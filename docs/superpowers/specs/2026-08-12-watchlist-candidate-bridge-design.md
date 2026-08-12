# 候选股加入观察池桥接层设计

**状态：** 起草（待用户审阅批准）  
**日期：** 2026-08-12  
**方案：** 候选桥接（三入口一键/批量加入 + 建议入池抽屉）  
**关联：**  
- [`2026-08-09-watchlist-add-parity-design.md`](./2026-08-09-watchlist-add-parity-design.md)（加股链路对齐走势图；本文在此基础上补「从哪加」）  
- `src/components/StockChart/README.md`（已缓存个股）  
- `src/components/TrendWatcher/README.md`（观察池 / 趋势雷达）  
- `src/components/AIAnalysis/README.md`（结构化候选股）  

## 1. 问题

资讯解析 / AI 分析会把股票写进行情缓存（`stock_price_cache` + `stock_info`），出现在股票走势图「已缓存个股」；但趋势雷达只认 `trend_watchlist ∪ portfolio_stocks`，**不读缓存**。

两套名单 by design 不同（缓存 = 看过 / 分析过；观察池 = 要持续跟踪），但产品上缺少**从缓存/AI 候选到观察池的桥**，用户体感是「分析出来的票在雷达里看不到」。

## 2. 目标

- **P0**：在三个入口提供「加入观察池」按钮（单只 + 批量）：  
  1. 股票走势图「已缓存个股」列表行  
  2. AI 分析结构化候选股列表行  
  3. 资讯详情 / 简报解析出的股票映射区  
- **P1**：在趋势雷达观察池提供「建议入池」折叠区：  
  - 列出近期出现在缓存但**不在观察池也不在持仓**的股票  
  - 按出现频次 / 近期性排序  
  - 支持单选 / 全选 → 一键批量加入  
- 加入走现有 `trend:addStocks` 链路（含智能分类填写）。  
- 保留用户对观察池质量的控制权：**不自动入池**。

## 3. 非目标

- 不合并 `stock_price_cache` 与 `trend_watchlist` 表；两套真相不变。  
- 不做「全自动入池」开关（可后续在建议层加，不在本设计）。  
- 不改清空观察池语义（仍只删 `trend_watchlist`）。  
- 不改资讯解析逻辑本身。  
- 不增加荐股、收益承诺、自动交易。

## 4. 数据模型

### 4.1 候选来源（只读查询，不新建表）

| 来源 | 已有表 | 查询方式 |
|---|---|---|
| 已缓存个股 | `stock_price_cache` + `stock_info` | `SELECT DISTINCT stockCode FROM stock_price_cache` LEFT JOIN `stock_info` |
| AI 候选股 | `ai_analysis_sessions.structuredResult` JSON | 解析 `candidateStocks[].code` |
| 资讯映射股 | 分析 `promptSent` 中 `STOCK_CODES` | 已有 `parseStockCodes` |

### 4.2 「是否已在池」判定

```sql
SELECT ts_code FROM trend_watchlist
UNION
SELECT ts_code FROM portfolio_stocks
```

候选 − 已在池 = 可建议列表。

### 4.3 建议排序（P1）

| 维度 | 权重逻辑 |
|---|---|
| 近 7 天出现次数（缓存写入 / AI 候选命中） | 多次 > 单次 |
| 最近出现时间 | 近 > 远 |
| 是否有本地日线 ≥ 20 根 | 有 > 无（雷达评分可用性） |

不需要 AI 打分，纯本地规则，不烧 Token。

## 5. IPC / 服务

### P0：三入口按钮

- Renderer 调用现有 `trend:addStocks`（已有链路；含智能分类）。  
- 按钮状态：检查 `trend:getWorkbench` 返回的 subjects 判断「已在池」→ 灰态 + 文案「已在观察池」。  
- 批量：多选后一次 `trend:addStocks` 传数组。

### P1：建议入池列表

- 新增 IPC `trend:listWatchlistCandidates`（主进程查询）：  
  - 入参：`{ limit?: number }`（默认 20）  
  - 出参：`{ ok, candidates: Array<{ tsCode, stockName, hitCount, lastSeenAt, hasEnoughKline }> }`  
  - 实现：查 `stock_price_cache` 去重 → 排除已在池/持仓 → 按 hitCount desc, lastSeenAt desc 排序。  
- `hitCount`：同一 `stockCode` 在 `stock_price_cache` 中的 distinct `tradeDate` 数（近 7 天写入；粗略近似「出现频次」）。  
- `lastSeenAt`：该 code 在 `stock_price_cache` 中最大 `tradeDate`。

## 6. UI

### P0 按钮形态

- 走势图左侧已缓存个股行：行末小图标按钮 `+观察池`（`data-testid="stockchart-add-to-watchlist"`）  
- AI 分析候选股列表行：行末 `+观察池`（`data-testid="ai-candidate-add-to-watchlist"`）  
- 资讯详情映射区：行末同理  
- 已在池的行：灰态 `✓ 已在池`  
- 批量：列表顶部「全部加入观察池」按钮（带数量 badge + 确认）

### P1 建议入池

- 位置：趋势雷达观察池页顶部折叠区（`data-testid="watchlist-candidates"`）  
- 默认折叠，badge 显示候选数  
- 展开后：勾选 → 「加入观察池」  
- 成功后从列表移除、刷新 workbench

## 7. 验收标准

1. 走势图已缓存个股行可一键加入观察池；加入后趋势雷达可见该股。  
2. AI 候选股行同理。  
3. 已在观察池/持仓的股票灰态提示，不可重复加。  
4. 建议入池列表按频次/近期性排序；批量加入后雷达刷新。  
5. 不自动入池；不改清空语义。  
6. 加入走 `trend:addStocks`（含智能分类）。  
7. 更新 `StockChart/README.md`、`TrendWatcher/README.md`、`AIAnalysis/README.md`。

## 8. 风险

| 风险 | 缓解 |
|---|---|
| `stock_price_cache` 量大导致候选列表慢 | 限 7 天窗口 + limit 20 |
| 分类填不准 | 走现有 `suggestWatchlistCategory`；用户可改 |
| 建议与用户意图不匹配 | 只建议不自动；用户可忽略 |

## 9. 后续（不在本设计）

- P2：高置信 + 多次命中 + 非黑名单 → 可选「自动入池」开关  
- 建议入池排序加入 AI 置信度（需结构化结果 confidence 字段）

## 10. 修订记录

- 2026-08-12：用户确认 P0+P1（不自动入池、三入口按钮 + 建议抽屉）。
