# Task 2 Brief — 带全事实包 + 双 parse + implied

**Plan:** `docs/superpowers/plans/2026-08-13-trend-ai-score-delta-in-review.md`  
**Spec:** `docs/superpowers/specs/2026-08-13-trend-ai-score-delta-in-review-design.md` §5–§6

## Files
- Modify: `electron/main/services/trendStructureReviewTypes.ts`
- Modify: `electron/main/services/trendWorkbenchService.ts`（`buildEodTrendReviewFactsForItem` + `buildTrendReviewFactsFromItem`）
- Test: `tests/unit/trendStructureReview.service.test.ts`（或新建 `trendStructureReview.scoreDelta.test.ts`）

## Requirements

### 事实包扩展（带全）

扩展 `TrendReviewFacts` 接口，必须包含 spec §5 所有字段：

| 组 | 字段 |
|---|---|
| 身份与尺子 | `tsCode`、`stockName`、`scoreDate`、`scoreSource`（`'realtime'|'eod'`）、`scoreVersion`（`'v2'|'legacy'`）、`validWeight`、`dataCoverage` |
| 本地结论 | `trendState`、`totalScore`、`scoreDelta5d`、`scoreDelta20d`、`maAbove60` |
| 七维分 | `dimensions`：`maArrangement`、`maAbove60`、`relativeStrength`、`drawdownQuality`、`turnoverQuality`、`macd`、`boll` |
| 表字段镜像 | `maScore`、`alphaScore`、`drawdown`、`turnoverRatio`、`macdAboveZero`、`bollAboveMid` |
| 事实窗口 | `facts`：20 日个股/基准/超额收益、最大回撤、换手比 |
| 轨迹 | `scoreHistory`：`Array<{ tradeDate: string; totalScore: number }>` |
| 基准健康 | `benchmarkHealth`：`state` + 简短 `message` |

### 禁止

- 任何 `costPrice`、`profitPct`、`positionAdvice`、原始 workbench item 透传。
- 不能改 `hashTrendReviewFacts` 的稳定算法，只能改输入对象的内容。

### parse

新增：

```ts
export type AiScoreAssessmentStatus = 'scored' | 'skipped' | 'invalid'
export interface AiScoreAssessment {
  status: 'scored'
  localScore: number
  scoreDelta: number
  scoreRationale: string
  impliedScore: number
} | {
  status: 'skipped' | 'invalid'
  localScore: number | null
  scoreDelta: number | null
  scoreRationale: string | null
  impliedScore: null
}
export interface AiTrendReviewBundle {
  structure: AiTrendReviewPayload
  scoreAssessment: AiScoreAssessment
}
```

- `parseAiTrendReviewBundle(rawText, localScore): AiTrendReviewBundle`：先尝试 bundle 结构；如只有旧扁平字段，则结构按旧 parse、偏差 `skipped`。
- `parseAiTrendScoreAssessment(score, localScore): AiScoreAssessment`：校验 `scoreDelta` 为整数且在 `[-15, +15]`；rationale 非空且长度 ≤120；`impliedScore = clamp(localScore + delta, 0, 100)`。
- `deriveImpliedScore(localScore: number, scoreDelta: number): number`：clamp 到 [0, 100]。

### TDD

1. 写失败测试：
   - 扩包后 `buildTrendReviewFactsFromItem` 含 `dimensions`/`scoreHistory`/`benchmarkHealth`/`scoreSource`/`scoreVersion`，`hashTrendReviewFacts` 与瘦包不同。
   - bundle parse：合法 → 结构与偏差均解析；delta=16 → 偏差 `invalid`；delta=-5 + local=59 → implied=54。
   - 旧扁平 JSON 只有 `verdict/rationale/focusPoints` → 结构成功、偏差 `skipped`。
2. 运行测试失败。
3. 实现类型/parse/facts。
4. 测试通过；既有 `trendStructureReview.service.test.ts` 不回归。

## Commit
- 实现与测试通过后：`feat(trend): 复核事实包带全并解析锚定偏差`
