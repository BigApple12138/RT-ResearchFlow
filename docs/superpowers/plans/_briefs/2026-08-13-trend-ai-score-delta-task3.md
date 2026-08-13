# Task 3 Brief — Service prompt / 短路 / 落库串联

**Plan:** `docs/superpowers/plans/2026-08-13-trend-ai-score-delta-in-review.md`  
**Spec:** `docs/superpowers/specs/2026-08-13-trend-ai-score-delta-in-review-design.md` §6–§7

## Files
- Modify: `electron/main/services/trendStructureReviewService.ts`
- Modify: `electron/main/services/trendReviewDiscussionBridge.ts`（如存在）——把偏差摘要带进讨论快照
- Test: `tests/unit/trendStructureReview.service.test.ts`

## Requirements

### Service 串联

- `buildTrendReviewPrompt(facts)` 输出 bundle prompt，要求模型返回：
  ```json
  {
    "structure": { "verdict": "...", "rationale": "...", "focusPoints": ["..."] },
    "scoreAssessment": { "scoreDelta": <int>, "scoreRationale": "..." } | null
  }
  ```
- 长度限制同旧：rationale ≤120 字；focusPoints ≤3 条且每条 ≤80 字；scoreRationale ≤120 字。
- 明确禁止：买入、卖出、目标价、止盈、止损、仓位、收益承诺。
- 明确锚定规则：模型输出相对本地 `totalScore` 的整数偏差；`scoreDelta ∈ [-15, +15]`；不输出绝对分。
- 输入事实白名单使用 §5 全部字段。

### 短路 skipped

在 `reviewStructure` 中：

- 若 `facts.totalScore == null` 或 `facts.validWeight < 0.7` 或 `facts.dataCoverage.state !== 'ready'`：
  - 结构侧生成 `need_more_data` payload（沿用现有 `buildNeedMoreDataPayload`）。
  - 偏差侧 `status = 'skipped'`，不调用模型。
- 若模型调用后 `structure.verdict === 'need_more_data'`：偏差侧也 `status = 'skipped'`。
- 其他情况：偏差侧按模型输出 parse；越界/违规 → `status = 'invalid'`。

### 落库

- `reviewStructure` 返回的 `review` 需把 `aiScoreStatus`、`aiScoreDelta`、`aiScoreRationale` 写入 repository。
- `renderTrendReview` 扩展为同时渲染偏差摘要，便于审计。
- `source` 沿用 `deriveTrendReviewSource(provider, model)`。

### Discussion bridge（若相关文件存在）

- 在桥接创建讨论快照时，可附加 `scoreAssessment` 摘要（status/delta/implied/rationale），但不得包含成本/仓位/交易建议。

## TDD

1. 写/扩展 `trendStructureReview.service.test.ts`：
   - mock AI 返回合法 bundle，断言落库含 `aiScoreStatus='scored'`、`aiScoreDelta`、rationale。
   - mock 返回旧扁平 JSON，断言结构成功、偏差 skipped。
   - 数据不足路径：断言未调 AI，结构 `need_more_data`，偏差 skipped。
   - delta 越界：断言 `aiScoreStatus='invalid'`。
2. 跑测失败。
3. 实现 prompt、短路、parse、落库。
4. 测试通过；既有 service 测试不回归。

## Commit
- 实现与测试通过后：`feat(trend): 复核服务产出结构与偏差双结果`
