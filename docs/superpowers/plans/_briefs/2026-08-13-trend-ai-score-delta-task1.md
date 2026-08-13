# Task 1 Brief — Migration 155 + repository 偏差列

**Plan:** `docs/superpowers/plans/2026-08-13-trend-ai-score-delta-in-review.md`  
**Spec:** `docs/superpowers/specs/2026-08-13-trend-ai-score-delta-in-review-design.md`

## Files
- Modify: `electron/main/database/db.ts`
- Modify: `electron/main/database/types.ts`
- Modify: `electron/main/database/trendStructureReviewRepository.ts`
- Test: `tests/unit/trendStructureReview.repository.test.ts`

## Requirements
- 当前最新 migration 为 **154**；新增 **`version: 155`** 的向前 Migration，不得改写旧 migration。
- 为 `trend_structure_review_revisions` 与投影表 `trend_structure_reviews` 增加：
  - `ai_score_delta INTEGER NULL`
  - `ai_score_rationale TEXT NULL`
  - `ai_score_status TEXT NOT NULL DEFAULT 'skipped'`（语义：`'scored'|'skipped'|'invalid'`）
- SQLite `ALTER TABLE ADD COLUMN` 对既有表通常无法追加 CHECK；若如此，用应用层约束 + 可空列，并在仓库测试中覆盖合法值。
- 扩展 `types.ts` 中相关 Row 接口（snake_case）与 `trendStructureReviewRepository.ts` 的：
  - `SaveTrendStructureReviewInput`：增加 `aiScoreStatus`、`aiScoreDelta`、`aiScoreRationale`（camelCase）
  - `TrendStructureReview` 映射结果：同上字段
  - INSERT/SELECT 同步
- 默认落库 `ai_score_status = 'skipped'` 时 `aiScoreDelta`/`aiScoreRationale` 必须为 `null`（由实现保证，测试断言）。
- **禁止**：把 `local_total_score` 或 `local_trend_state` 语义改成 AI 值；禁止成本/仓位字段。

## TDD
1. 在 `tests/unit/trendStructureReview.repository.test.ts` 增加（或调整）测试：save 带 `aiScoreStatus: 'scored'`、`aiScoreDelta: -5`、rationale，读回字段一致；以及 `skipped` 时 delta/rationale 为空。
2. 运行 `pnpm exec vitest run tests/unit/trendStructureReview.repository.test.ts` 观察失败。
3. 实现 migration + types + repository。
4. 同一测试通过；运行相关既有测试不回归。

## Commit
- 仅在实现与测试通过后：`git add -A` 指定文件并 commit，message 中文，例如：`feat(trend): 复核表增加 AI 偏差分列`
