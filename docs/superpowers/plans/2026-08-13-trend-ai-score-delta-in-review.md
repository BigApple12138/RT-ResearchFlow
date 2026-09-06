# 趋势 AI 复核内嵌锚定偏差分 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在既有「AI复核结构」链路内，用带全白名单事实包一次显式调用产出结构复核 + 相对本地分的锚定偏差分，并排展示且不覆盖本地趋势分。

**Architecture:** 扩展 `TrendReviewFacts` 与 `factsHash`；Migration 155 为复核 revision/投影表增加偏差列；`trendStructureReviewService` 一次模型调用、两个 parse 方法（structure / scoreAssessment）；Workbench DTO 与 `AiTrendReviewBadge` 并排展示 impliedScore。

**Tech Stack:** Electron 主进程、better-sqlite3 向前 Migration、既有 `callWithFallback` / 研究文本审计、React TrendWatcher、Vitest。

**状态：** 已完成（实现已落地；2026-08-30 Track A 自动化验收闭环）  
**Spec（设计初衷）：** [`../specs/2026-08-13-trend-ai-score-delta-in-review-design.md`](../specs/2026-08-13-trend-ai-score-delta-in-review-design.md)  
**归档：** 本 plan 必须保留在 `docs/superpowers/plans/`；执行完毕后填写文末「设计初衷检核」。约定见 [`../README.md`](../README.md)。

## Global Constraints

- 不覆盖本地 `totalScore` / `trendState` / `trend_scores`  
- 显式点击才调模型；批量仍串行、上限 20  
- 锚定偏差：`scoreDelta ∈ [-15, +15]`；`impliedScore = clamp(local + delta, 0, 100)`；`localScore` 只取自事实包  
- 事实包带全 spec §5；禁止 `costPrice`、`profitPct`、`positionAdvice`、Renderer 上传事实正文  
- 禁止买卖/目标价/仓位/收益承诺（审计拦截）  
- 应用层 `scoreDate`；库表 `score_trade_date`；禁止 `scoreTradeDate` DTO  
- 新表/列必须向前 Migration（本计划使用 **155**）  
- revisions 保持不可变（仅新 INSERT 带新列）  
- 改行为同步更新 `src/components/TrendWatcher/README.md`  
- 只在用户明确说执行后改 `src/` / `electron/` 业务代码

## File map

| 文件 | 职责 |
|---|---|
| `electron/main/database/db.ts` | Migration 155：偏差列 |
| `electron/main/database/types.ts` | Row 类型扩展 |
| `electron/main/database/trendStructureReviewRepository.ts` | 读写 `ai_score_*` |
| `electron/main/services/trendStructureReviewTypes.ts` | 扩包 facts、双 parse、派生 implied |
| `electron/main/services/trendStructureReviewService.ts` | Prompt bundle、短路 skipped、落库 |
| `electron/main/services/trendWorkbenchService.ts` | workbench review DTO 带偏差 |
| `electron/main/services/trendReviewDiscussionBridge.ts`（若存在） | 快照附带 scoreAssessment 摘要 |
| `electron/preload/index.ts` | 类型暴露（若显式） |
| `src/components/TrendWatcher/trendWorkbenchTypes.ts` | Review 类型 |
| `src/components/TrendWatcher/AiTrendReviewBadge.tsx` | 并排展示 |
| `src/components/TrendWatcher/PortfolioDashboard.tsx` / `TrendDashboard.tsx` | 如需文案/testid |
| `src/components/TrendWatcher/README.md` | FR |
| `tests/unit/trendStructureReview*.test.ts` | facts/hash/parse/implied/skipped |
| `tests/unit/aiTrendReviewBadge*.test.ts`（或既有） | UI 展示 |

---

### Task 1: Migration 155 + repository 列

**Files:**
- Modify: `electron/main/database/db.ts`
- Modify: `electron/main/database/types.ts`
- Modify: `electron/main/database/trendStructureReviewRepository.ts`
- Test: `tests/unit/trendStructureReview.repository.test.ts`

**Interfaces:**
- Produces: revision/投影行含 `ai_score_delta`、`ai_score_rationale`、`ai_score_status`（`'scored'|'skipped'|'invalid'`）；`SaveTrendStructureReviewInput` 同步扩展；映射到 `TrendStructureReview.aiScoreDelta` 等 camelCase 字段

- [ ] **Step 1:** 写失败单测：save 带 `aiScoreStatus='scored'`、`aiScoreDelta=-5`、rationale，读回一致；旧默认 `skipped` 且 delta/rationale 为空
- [ ] **Step 2:** 跑测确认失败（列不存在或未映射）
- [ ] **Step 3:** 添加 Migration `version: 155`：`ALTER TABLE` 两表增加三列（delta INTEGER NULL、rationale TEXT NULL、status TEXT NOT NULL DEFAULT 'skipped' + CHECK）；注意 SQLite 对既有表 CHECK 限制——若无法原地加 CHECK，用应用层校验 + 可空列，并在 README/计划偏差记录中写明
- [ ] **Step 4:** 更新 types + repository INSERT/SELECT/map
- [ ] **Step 5:** 跑 `tests/unit/trendStructureReview.repository.test.ts` 通过
- [ ] **Step 6:** Commit（用户要求时）：`feat(trend): 复核表增加 AI 偏差分列`

---

### Task 2: 带全事实包 + 双 parse + implied

**Files:**
- Modify: `electron/main/services/trendStructureReviewTypes.ts`
- Modify: `electron/main/services/trendWorkbenchService.ts`（若 `buildEodTrendReviewFactsForItem` 在此）
- Test: `tests/unit/trendStructureReview.service.test.ts`（或新建 `trendStructureReview.scoreDelta.test.ts`）

**Interfaces:**
- Produces:
  - `TrendReviewFacts` 含 spec §5 字段
  - `parseAiTrendReviewBundle(raw) => { structure, scoreAssessment }`
  - `parseAiTrendStructurePayload` / `parseAiTrendScoreAssessmentPayload` 可拆测
  - `deriveImpliedScore(localScore: number, scoreDelta: number): number`
  - `AiScoreAssessmentStatus = 'scored' | 'skipped' | 'invalid'`
  - scoreAssessment scored 形如 `{ status:'scored', scoreDelta, scoreRationale, localScore, impliedScore }`

- [ ] **Step 1:** 写失败单测：扩包后 hash 含 `dimensions`/`scoreHistory`；delta=16 → invalid；delta=-5 + local=59 → implied=54；`need_more_data` / null totalScore → skipped
- [ ] **Step 2:** 跑测失败
- [ ] **Step 3:** 实现 `buildTrendReviewFactsFromItem` 扩字段；禁止敏感字段进入
- [ ] **Step 4:** 实现 bundle parse、边界、兼容旧扁平 structure-only JSON（偏差 skipped）
- [ ] **Step 5:** 跑相关单测通过
- [ ] **Step 6:** Commit（用户要求时）：`feat(trend): 复核事实包带全并解析锚定偏差`

---

### Task 3: Service prompt / 短路 / 落库串联

**Files:**
- Modify: `electron/main/services/trendStructureReviewService.ts`
- Modify: discussion bridge 若写入复核快照
- Test: `tests/unit/trendStructureReview.service.test.ts`

**Interfaces:**
- Consumes: Task 2 parse + Task 1 save 字段
- Produces: `reviewStructure` 结果中 `review` 含偏差字段；审计文本含偏差摘要；不足数据时 structure=`need_more_data` 且 score=`skipped`

- [ ] **Step 1:** 写/扩展单测：mock AI 返回 bundle，断言落库两列；不足数据不调 AI；越界 delta → status invalid 且不把假分当 scored
- [ ] **Step 2:** 跑测失败
- [ ] **Step 3:** 更新 `buildTrendReviewPrompt` 要求返回 bundle；说明锚定规则与禁止交易用语
- [ ] **Step 4:** `reviewStructure` 串联 parse → audit（structure+score 渲染）→ save
- [ ] **Step 5:** 单测通过
- [ ] **Step 6:** Commit（用户要求时）：`feat(trend): 复核服务产出结构与偏差双结果`

---

### Task 4: Workbench DTO + UI 徽章

**Files:**
- Modify: `electron/main/services/trendWorkbenchService.ts`
- Modify: `src/components/TrendWatcher/trendWorkbenchTypes.ts`
- Modify: `src/components/TrendWatcher/AiTrendReviewBadge.tsx`
- Modify: `src/components/TrendWatcher/README.md`
- Test: `tests/unit/aiTrendReviewBadge.view.test.tsx`（或等价）

**Interfaces:**
- Produces: review summary 含 `aiScoreStatus`、`aiScoreDelta`、`aiScoreRationale`、`impliedScore`（仅 scored）；徽章 testid 如 `trend-ai-score-delta-{code}`

- [ ] **Step 1:** 写 UI/映射单测：scored 展示本地与 AI 隐含分；skipped 不显示数字分
- [ ] **Step 2:** 跑测失败
- [ ] **Step 3:** DTO 映射 + Badge UI（弱文案「模型意见」）
- [ ] **Step 4:** 更新 TrendWatcher README FR（显式复核产出双轨：结构 + 锚定偏差）
- [ ] **Step 5:** 相关单测通过；必要时补 e2e 断言徽章存在（若现有 `trend-ai-review` e2e 易扩）
- [ ] **Step 6:** Commit（用户要求时）：`feat(trend): 徽章并排展示 AI 锚定偏差分`

---

### Task 5: 验收与设计初衷检核

**Files:**
- Modify: 本 plan 文末检核表
- Modify: spec 文首状态 → 已完成（仅状态字段，不改目标正文）

- [ ] **Step 1:** 跑 `pnpm exec vitest run tests/unit/trendStructureReview*` 与徽章相关单测
- [ ] **Step 2:** 对照 spec §9 逐条勾选；偏差写入检核表
- [ ] **Step 3:** 用户确认后更新状态；需要时再提 commit

---

## 设计初衷检核

| Spec 验收项 | 结果 | 说明 |
|---|---|---|
| 一次显式复核产出结构 + 偏差（或 skipped） | 符合 | `reviewStructure` 落库 verdict + aiScore*；不足/need_more_data/越界分流 |
| 事实包带全 §5 并进 factsHash | 符合 | `TrendReviewFacts` 扩包；EOD builder + FromItem 同步 |
| 不覆盖本地分/状态 | 符合 | 仅读写本地 totalScore/trendState，不写 trend_scores |
| delta 越界/违规不展示为 scored | 符合 | status=invalid；徽章不显示假分数 |
| 事实变更 stale | 符合 | 既有 scoreDate/factsHash stale 逻辑保留；扩包会自然过期旧复核 |
| 单测 + README | 符合 | repository/scoreDelta/service/bridge/badge 47 测通过；TrendWatcher README 已更新 |

**检核结论：** 符合设计初衷；未做 e2e 增量（既有 trend-ai-review e2e 未扩徽章断言，可作后续加固）。  
**检核日期：** 2026-08-13
