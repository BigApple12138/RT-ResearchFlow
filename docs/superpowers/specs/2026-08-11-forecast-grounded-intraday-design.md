# 预测面板接地：分时主包 + Tushare 因子 — 设计

**状态：** 已完成  

**日期：** 2026-08-11  
**方法论：** SDD  
**关联 plan：** [`../plans/2026-08-11-forecast-grounded-intraday.md`](../plans/2026-08-11-forecast-grounded-intraday.md)  

## 1. 问题

走势图「预测今日」写入预测面板的 `aiReason` 常出现「无法访问东财/同花顺」与基本面空话，很少引用成交量、成交额、换手率、MACD 等。根因：

1. 默认提示词要求模型自行联网收集基本面。  
2. 分时注入过瘦：分钟 K 有 `amount` 未写入 prompt；东财 5 分钟回退有 `volume` 却只传 `price`。  
3. 技术因子摘要仅读本地 `stk_factor_cache`，预测前不主动 ensure；Tushare 已开时仍可能空包。

## 2. 目标

- **分时为主证据包**：预测前尽量刷新当日分钟；prompt 含价量（及成交额）；缺量诚实标注。  
- **Tushare 开启时**：预测前 ensure 日频技术因子（MACD/KDJ/RSI/BOLL/MA/换手/量比等），摘要标明交易日与「日频非秒级」。  
- **提示词接地**：禁止假装外联网站实时终端；必须引用已给量价与因子；缺字段写「本包未提供」。

## 3. 非目标

- 不把整篇 Markdown 报告封成 MCP tool（后续可复用同一证据包）。  
- 不要求盘中实时重算全套因子。  
- 不新增荐股、自动交易或削弱风险提示。  
- 不强制改用户已自定义的 `trendForecastPrompt`（默认与空配置走新默认；自定义提示后仍追加 grounding 硬约束块）。

## 4. 行为

### 4.1 证据包（今日预测）

1. 预测前调用一次分钟刷新（与订阅同路径：Tushare `rt_min` → 东财 1m OHLCV 落库），再读 `stock_minute_cache`。  
2. 有分钟行：JSON 含 `t,o,h,l,c,v,a`（`a`=成交额，缺则省略或 null）+ 盘中量能摘要（累计量/额、近 N 分钟均量 vs 全场均量）。  
3. 仍无分钟：东财 5 分钟分时回退须带 `volume`（已有字段），并标明「仅 5 分钟价量、无完整 OHLCV」。  
4. 大盘/板块分时继续附带。  
5. `buildTechnicalSummary` 等增强摘要保留；因子路径见下。

### 4.2 技术因子（Tushare）

1. 先读最新 `stk_factor_cache`。  
2. 若空且 Tushare 已启用：拉最近可用交易日 `stk_factor_pro` 并 upsert，再生成摘要。  
3. 摘要末尾固定说明：日频因子、非盘中秒级。  
4. 未开 Tushare / 失败：有缓存用缓存；否则写明本包无技术因子。

### 4.3 提示词

1. 替换默认今日/明日 prompt：去掉「请去东财/同花顺收集基本面」类指令。  
2. 每次预测在用户 prompt 末（结构化输出要求前）追加 **Grounding 硬约束**（即使用户自定义了厂商 prompt 也追加）：  
   - 仅基于本消息已提供数据；  
   - 禁止声称无法访问却又编造东财/同花顺实时终端状态；  
   - 必须讨论量价（及本包中的因子）；矛盾信号保守；  
   - 缺字段写「本包未提供」，禁止编造数值。

### 4.4 覆盖路径

`performPredictTrendToday`、单厂商 / 多厂商 / fallback 的 `ai:predictTrendToday`，以及明日预测中复用同一分时/因子 ensure 逻辑（明日仍保留近 30 日日线块）。

## 5. 验收

| # | 场景 | 期望 |
|---|---|---|
| A | 本地/刷新后有分钟 K | prompt 含 v，有 amount 则含 a；有量能摘要 |
| B | 仅东财 5 分钟回退 | prompt 含 volume，不丢量 |
| C | Tushare 开且因子可拉/可缓存 | extraContext 含 MACD 等与交易日说明 |
| D | 默认 prompt | 不含「去东财同花顺收集基本面」；含 grounding 硬约束 |
| E | 无量无因子 | 诚实缺数文案，不要求模型编指标 |

## 6. 触达路径

- `electron/main/services/forecastEvidencePackage.ts`（新建：证据包 + grounding 文案）  
- `electron/main/services/schedulerService.ts`（导出单次分钟刷新）  
- `electron/main/ipc/aiHandlers.ts`（默认 prompt + 各预测路径改用证据包）  
- `electron/main/services/volumeContextSummary.ts`（盘中量能摘要，可选）  
- `src/components/StockChart/README.md`  
- 单测：prompt/序列化/量能摘要  
