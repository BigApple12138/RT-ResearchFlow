# 趋势 AI 复核内嵌「锚定偏差分」— 设计

**状态：** 已完成（2026-08-30 Track A 自动化验收闭环；UI 口径由 view/service 单测覆盖）  
**日期：** 2026-08-13  
**归档：** 本文件为设计初衷；实现对照见 [`../plans/2026-08-13-trend-ai-score-delta-in-review.md`](../plans/2026-08-13-trend-ai-score-delta-in-review.md)。完成后不得删改本节目标/非目标以掩盖偏差。  
**依赖：** 既有趋势评分 V2、`trend:reviewStructure` / 结构复核落库（2026-08-09 设计）、研究讨论桥接与审计。

## 1. 问题

1. 长线趋势分由本地七维规则给出，用户感知「只有死尺子」，缺少并排的模型评分意见。  
2. 已有「AI 结构复核」只输出结构词表（agree / 假破等），**不**对本地综合分给出可对齐的量化第二意见。  
3. 当前复核事实包偏瘦（总分/状态/少量 facts），不足以支撑可信的分数偏差判断。

## 2. 目标

在**同一条显式 AI 复核链路**内，拆成两个可独立校验的方法产出：

| 方法 | 产出 | 关系 |
|---|---|---|
| **结构复核**（已有） | `verdict` + `rationale` + `focusPoints` | 对本地 `trendState` 的第二意见 |
| **AI 趋势分偏差**（新增） | `scoreDelta` + `scoreRationale` → 派生 `impliedScore` | 相对本地 `totalScore` 的锚定偏差，不覆盖本地分 |

一次用户点击「AI复核结构」即可得到两者；输入事实包必须**带全**评分相关白名单字段。

## 3. 非目标

- AI **改写**或覆盖本地 `totalScore` / `trendState` / `trend_scores` 表。  
- 打开雷达/持仓总览自动调模型。  
- 用户可配置七维权重（另议）。  
- 荐股、目标价、买卖、仓位、收益承诺语气。  
- 另开独立「AI 趋势分」入口或第二套黑盒 0–100 绝对分（本设计强制锚定本地分）。  
- 用 Renderer 上传的任意正文充当事实。

## 4. 产品原则

- **本地优先 / 显式 AI**：未点击不烧 Token；本地分仍是尺子。  
- **双轨并排**：本地综合分 vs AI 隐含分（或 ±N）；冲突不静默合并。  
- **锚定偏差**：模型只输出相对本地分的整数偏差，不另起绝对分体系。  
- **输入带全**：主进程白名单事实包覆盖评分全维度与轨迹，纳入 `factsHash`。  
- **两方法、可降级**：结构与偏差校验分离；证据不足时结构可 `need_more_data`，偏差标「未评」不硬编数字。  
- **可审计 / 窄 IPC**：词表与数值边界主进程强制校验；审计拦截交易指令语言。

## 5. 输入事实包（带全）

扩展 `TrendReviewFacts`（应用层仍用 `scoreDate`；库表仍用 `score_trade_date`）。主进程从 workbench item 构造，**禁止** `costPrice`、`profitPct`、`positionAdvice`、原始 item 透传。

必含字段：

| 组 | 字段 |
|---|---|
| 身份与尺子 | `tsCode`、`stockName`、`scoreDate`、`scoreSource`、`scoreVersion`、`validWeight`、`dataCoverage` |
| 本地结论 | `trendState`、`totalScore`、`scoreDelta5d`、`scoreDelta20d`、`maAbove60` |
| 七维分 | `dimensions`：`maArrangement`、`maAbove60`、`relativeStrength`、`drawdownQuality`、`turnoverQuality`、`macd`、`boll` |
| 表字段镜像 | `maScore`、`alphaScore`、`drawdown`、`turnoverRatio`、`macdAboveZero`、`bollAboveMid` |
| 事实窗口 | `facts`：20 日个股/基准/超额收益、最大回撤、换手比 |
| 轨迹 | `scoreHistory`：近期 `{ tradeDate, totalScore }[]` |
| 基准健康 | `benchmarkHealth.state` + 简短 `message`（无敏感细节） |

整包 `stableStringify` 后算 `factsHash`。扩包后旧复核因 hash 变化一律视为过期（符合既有 stale 语义）。

## 6. 双方法产出契约

一次模型调用返回单一 JSON bundle（省 Token），主进程拆成两个 parse 方法：

### 6.1 结构复核（保持既有词表）

```json
{
  "verdict": "agree|possible_false_break|possible_false_hold|evidence_weak|need_more_data",
  "rationale": "…",
  "focusPoints": ["…"]
}
```

长度限制沿用：rationale ≤120 字；focusPoints ≤3 条、每条 ≤80 字。

### 6.2 AI 趋势分偏差（新增）

```json
{
  "scoreDelta": <integer>,
  "scoreRationale": "…"
}
```

规则：

- `localScore` **只取自事实包** `totalScore`，不信任模型回显。  
- `scoreDelta` 为整数，闭区间 **[-15, +15]**；越界拒收整包或该侧失败（实现取：该侧 `status=invalid` 并记审计，结构侧若合法仍可落库——见 §7）。  
- `impliedScore = clamp(localScore + scoreDelta, 0, 100)`，仅派生展示，不落为「官方分」。  
- `scoreRationale` ≤120 字；禁止买卖/仓位/目标价用语（与结构侧同一审计管线）。  
- 当本地 `totalScore == null`、有效权重 &lt;70%、或 `dataCoverage.state !== 'ready'`：不调模型或短路时，偏差侧 `status = skipped`，字段为空；结构侧可 `need_more_data`。  
- 模型返回 `verdict=need_more_data` 时：偏差侧亦 `skipped`（不编 ±0 伪装中性）。

建议 bundle 形状：

```json
{
  "structure": { "verdict": "…", "rationale": "…", "focusPoints": ["…"] },
  "scoreAssessment": { "scoreDelta": -5, "scoreRationale": "…" } | null
}
```

兼容：若上游偶发只返回旧扁平 structure 字段，parse 时结构可用、偏差 `skipped`（过渡期可测）。

## 7. 落库与过期

- 向前 Migration（预计 **155**）：在 `trend_structure_review_revisions` 与投影表 `trend_structure_reviews` 增加可空列，例如：  
  - `ai_score_delta INTEGER NULL`  
  - `ai_score_rationale TEXT NULL`  
  - `ai_score_status TEXT NOT NULL DEFAULT 'skipped' CHECK (… IN ('scored','skipped','invalid'))`  
- revisions 仍不可 UPDATE/DELETE；新列仅影响新 INSERT；旧行默认 `skipped`。  
- 投影表随最新 revision 同步上述列。  
- `factsHash` / `scoreDate` 与当前事实不一致 → stale（既有逻辑）。  
- 讨论桥接快照：可增加只读 `scoreAssessment` 摘要（delta / implied / rationale / status），仍禁止仓位字段。

## 8. UI / IPC

- 入口不变：`trend:reviewStructure` / batch；强制刷新语义不变。  
- `AiTrendReviewBadge`（及持仓总览若已挂复核处）在结构标签旁展示：  
  - `scored`：`本地 {n} · AI {implied}（{±delta}）` + 可展开 `scoreRationale`  
  - `skipped` / `invalid`：不展示假分数，可弱提示「偏差未评」  
- 文案须标明「模型意见 / 非投资建议」，不得写成官方改分。  
- Preload DTO 扩展；Renderer 不自行算 implied（可由主进程带上 `impliedScore` 避免两端不一致）。

## 9. 验收标准

1. 显式复核一次，成功路径同时落结构词表与偏差（或明确 skipped）。  
2. Prompt/factsHash 含 §5 全部白名单组；缺维时该字段为 `null` 但仍出现在包中。  
3. 本地 `trend_scores.total_score` 与 workbench `totalScore` 不被 AI 写入。  
4. `scoreDelta` 越界或理由违规 → 不展示为 scored；审计可追踪。  
5. 事实变更后旧复核 stale；需重新复核才显示新偏差。  
6. 单元测试覆盖：facts 扩包 hash、双 parse、派生 implied、短路 skipped、越界 invalid。  
7. 更新 `src/components/TrendWatcher/README.md` FR。

## 10. 修订相对 2026-08-09

2026-08-09 设计「非目标」写明不替换七维权重、AI 不改写 `trendState`——**本设计仍遵守**。新增的是复核链路内的**并排锚定偏差分**，不是替换本地尺子。旧 design 正文不改写；以本文为增量初衷。
