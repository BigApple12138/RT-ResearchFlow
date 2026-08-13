# Task 2 报告 — 带全事实包 + 双 parse + implied

**状态：** DONE  
**日期：** 2026-08-13

## 完成内容

1. 扩展 `TrendReviewFacts` 接口，纳入 spec §5 全部白名单字段：
   - 身份与尺子：`scoreSource`、`scoreVersion`
   - 本地结论：原有字段保留
   - 七维分：`dimensions`
   - 表字段镜像：`maScore`、`alphaScore`、`drawdown`、`turnoverRatio`、`macdAboveZero`、`bollAboveMid`
   - 事实窗口：原有 `facts`
   - 轨迹：`scoreHistory`
   - 基准健康：`benchmarkHealth`
2. 修改 `buildTrendReviewFactsFromItem`（`trendStructureReviewTypes.ts`）与 `buildEodTrendReviewFactsForItem`（`trendWorkbenchService.ts`），确保带全事实包进入 `factsHash`。
3. 禁止敏感字段进入事实包：`costPrice`、`profitPct`、`positionAdvice` 等仍为 workbench item 字段，不会出现在 `TrendReviewFacts` 中。
4. 新增双 parse：
   - `parseAiTrendReviewBundle(raw, localScore)`：支持 bundle 结构，兼容旧扁平 JSON（只有 `verdict/rationale/focusPoints` 时偏差 `skipped`）。
   - `parseAiTrendScoreAssessment(score, localScore)`：校验 `scoreDelta` 为整数且在 `[-15, +15]`，rationale 非空且 ≤120，返回 `scored/skipped/invalid`。
   - `deriveImpliedScore(localScore, scoreDelta)`：clamp 到 `[0, 100]`。
5. `hashTrendReviewFacts` 稳定算法不变；因输入对象内容扩展，扩包后 hash 自然与瘦包不同（旧复核按既有 stale 语义过期）。
6. 单元测试覆盖：
   - `tests/unit/trendStructureReview.scoreDelta.test.ts`：12 个用例，覆盖扩包字段、hash 差异、bundle parse、越界 invalid、implied clamp、旧扁平 skipped 等。
   - 既有 `trendStructureReview.service.test.ts` 与 `trendStructureReview.repository.test.ts` 共 23 个用例全部通过。
   - `npx tsc --noEmit` 通过。

## 验证

```powershell
npx vitest run tests/unit/trendStructureReview.scoreDelta.test.ts tests/unit/trendStructureReview.service.test.ts tests/unit/trendStructureReview.repository.test.ts
```

结果：`Test Files 3 passed (3)，Tests 35 passed (35)`

## 修改文件

- `electron/main/services/trendStructureReviewTypes.ts`
- `electron/main/services/trendWorkbenchService.ts`
- `tests/unit/trendStructureReview.service.test.ts`（调整白名单断言）
- `tests/unit/trendStructureReview.scoreDelta.test.ts`（新建）
