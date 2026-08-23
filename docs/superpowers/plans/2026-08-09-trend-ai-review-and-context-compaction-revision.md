# 趋势 AI 复核 + 讨论上下文压缩契约修订 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在已有趋势复核骨架上完成契约收敛、不可变 revision、sequence 归档、累计摘要、并发锁、幂等 IPC、UI 与全量验证。

**状态：** 已完成（实现、全量验证、whole-branch review 与 scoped re-review 均通过）

**Architecture:** 主进程以 `discussionSessionLock` 串行化所有会话级 AI 写入；`discussionContextCompactionService` 负责热消息规范化、累计摘要、归档和模型上下文；趋势复核 Repository 把不可变 revisions 与最新 projection 分离。Renderer 只提交身份和展示 DTO，所有事实、sequence、busy 判断与词表校验均由主进程负责。

**Tech Stack:** Electron 主进程、better-sqlite3 migration、React 18、TypeScript、Vitest、Playwright。

## Global Constraints

- 本地 `trendState` 是真相源，AI 只做第二意见。
- 新 verdict 只能是 `agree` / `possible_false_break` / `possible_false_hold` / `evidence_weak` / `need_more_data`。
- rationale ≤120 字，focusPoints ≤3 条且每条 ≤80 字。
- 事实包不得包含 `costPrice`、`profitPct`、`positionAdvice`、`price`、`change`、`quoteTime`、Renderer 文本或原始 workbench item。
- 自动压缩阈值固定为 12 个完整 user/assistant 对，热尾部固定 6 条，默认开启且可关闭。
- FR-239 新游标使用 sequence；旧 index 只兼容读取。
- 同一 session 的 follow-up、compact、portfolio brief、研究报告写回必须走主进程锁。
- 不提交用户未提交改动、凭据、运行数据库、构建产物或日志。

---

### Task 1: 修订规格归档与迁移契约

**Files:**
- Create: `docs/superpowers/specs/2026-08-09-trend-ai-review-and-context-compaction-revision-design.md`
- Create: `docs/superpowers/plans/2026-08-09-trend-ai-review-and-context-compaction-revision.md`
- Modify: `electron/main/database/db.ts`
- Modify: `electron/main/database/types.ts`
- Test: `tests/unit/trendStructureReview.repository.test.ts`

- [x] **Step 1: Write the failing migration/revision tests** — 断言迁移后存在 `trend_structure_review_revisions`、新 projection 接受五个新 verdict、旧 projection 被保留到 legacy 表，且 sequence 游标列存在。
- [x] **Step 2: Run the tests to verify they fail** — `pnpm exec vitest run tests/unit/trendStructureReview.repository.test.ts`；失败原因必须是表/列/新词表尚不存在。
- [x] **Step 3: Add migrations 140–141** — 140 创建 revisions、重建 projection 并保留旧表；141 增加 `summarized_through_message_sequence` 与批次/变更集/候选的 start/end sequence 列；更新数据库行类型。
- [x] **Step 4: Run migration tests to verify they pass** — 同一 Vitest 命令，确认空库和含旧 projection 的数据库均能完成迁移。
- [x] **Step 5: Commit only the migration/docs files** — `git add docs/superpowers/specs/2026-08-09-trend-ai-review-and-context-compaction-revision-design.md docs/superpowers/plans/2026-08-09-trend-ai-review-and-context-compaction-revision.md electron/main/database/db.ts electron/main/database/types.ts tests/unit/trendStructureReview.repository.test.ts && git commit -m "docs(db): settle review revision and discussion sequence contracts"`。

### Task 2: 趋势复核契约与不可变 revision

**Files:**
- Modify: `electron/main/services/trendStructureReviewTypes.ts`
- Modify: `electron/main/services/trendStructureReviewService.ts`
- Modify: `electron/main/database/trendStructureReviewRepository.ts`
- Modify: `electron/main/services/trendWorkbenchService.ts`
- Modify: `src/components/TrendWatcher/trendWorkbenchTypes.ts`
- Modify: `src/components/TrendWatcher/AiTrendReviewBadge.tsx`
- Test: `tests/unit/trendStructureReview.service.test.ts`
- Test: `tests/unit/trendStructureReview.repository.test.ts`

- [x] **Step 1: Write failing tests** — 新词表可解析、超 120 字 rationale/超过 3 条 focus 拒绝；facts 不含行情易变字段；同 code/date 新 hash 新增 revision 且旧 revision 仍存在。
- [x] **Step 2: Run RED** — `pnpm exec vitest run tests/unit/trendStructureReview.service.test.ts tests/unit/trendStructureReview.repository.test.ts`。
- [x] **Step 3: Implement minimal contract** — 重写 facts builder 白名单；更新 prompt/parser；Repository 新增 revision insert/get/list 与 latest projection；同 hash request 重放复用，不覆盖 revision；更新前端类型和徽章五态文案/颜色。
- [x] **Step 4: Run GREEN** — 同一命令，确认旧测试按新契约更新后全绿。
- [x] **Step 5: Refactor only after green** — 删除旧 verdict 类型和重复 facts 类型，保持 DTO 只暴露稳定字段。
- [x] **Step 6: Commit** — `git add electron/main/services electron/main/database/trendStructureReviewRepository.ts src/components/TrendWatcher/trendWorkbenchTypes.ts src/components/TrendWatcher/AiTrendReviewBadge.tsx tests/unit/trendStructureReview*.test.ts && git commit -m "fix(trend): enforce immutable review revisions and stable facts"`。

### Task 3: 趋势批量进度与导航回归

**Files:**
- Modify: `electron/main/ipc/trendHandlers.ts`
- Modify: `electron/preload/index.ts`
- Modify: `src/components/TrendWatcher/TrendDashboard.tsx`
- Modify: `tests/unit/trendReview.handlers.test.ts`
- Modify: `tests/unit/researchDiscussion.navigation.test.ts`
- Test: `tests/e2e/trend-ai-review.spec.ts`

- [x] **Step 1: Write failing progress tests** — batch dependency callback 每完成一条即收到 running/succeeded/failed progress，且最大并发为 1。
- [x] **Step 2: Run RED** — `pnpm exec vitest run tests/unit/trendReview.handlers.test.ts`。
- [x] **Step 3: Implement event plumbing** — 增加 `trend:reviewProgress` DTO、preload listener、主进程 sender；Renderer 按事件更新完成数/逐条结果，保留最终 response 兜底。
- [x] **Step 4: Run GREEN and E2E** — 先跑 handler/navigation 单测，再跑趋势 E2E；导航断言 `aiAnalysisWorkbench` 和 return target，不再期待隐藏旧子页签。
- [x] **Step 5: Commit** — `git add electron/main/ipc/trendHandlers.ts electron/preload/index.ts src/components/TrendWatcher tests/unit/trendReview.handlers.test.ts tests/unit/researchDiscussion.navigation.test.ts tests/e2e/trend-ai-review.spec.ts && git commit -m "feat(trend): stream review progress and preserve return navigation"`。

### Task 4: sequence、归档 Repository 与模型上下文

**Files:**
- Modify: `electron/main/database/aiAnalysisSessionRepository.ts`
- Modify: `electron/main/database/discussionCompactionRepository.ts`
- Modify: `electron/main/database/discussionMessageArchiveRepository.ts`
- Modify: `electron/main/database/researchDiscussionRepository.ts`
- Modify: `electron/main/services/researchDiscussionContextService.ts`
- Modify: `electron/main/services/industryResearchChangeGenerationService.ts`
- Modify: `electron/main/ipc/industryResearchHandlers.ts`
- Modify: `electron/preload/index.ts`
- Modify: `electron/main/database/types.ts`
- Test: `tests/unit/discussionContextCompaction.repository.test.ts`
- Test: `tests/unit/researchDiscussionArchive.repository.test.ts`
- Test: `tests/unit/researchDiscussionContext.service.test.ts`

- [x] **Step 1: Write failing sequence/archive tests** — create/update 会话自动生成单调 sequence；归档与热消息可按 sequence 完整恢复；`buildDiscussionModelMessages` 包含 prompt、最新 summary、热消息但不含旧原文；FR-239 通过 sequence 选择范围。
- [x] **Step 2: Run RED** — `pnpm exec vitest run tests/unit/discussionContextCompaction.repository.test.ts tests/unit/researchDiscussionArchive.repository.test.ts tests/unit/researchDiscussionContext.service.test.ts`。
- [x] **Step 3: Implement sequence normalization and repositories** — 主进程规范化历史 JSON；新增 full-message loader；扩展 context/batch DTO 和 IPC 为 sequence，同时兼容旧 index；模型组装读取最新累计摘要。
- [x] **Step 4: Run GREEN** — 同一命令，并回归现有产业研究变更测试。
- [x] **Step 5: Commit** — `git add electron/main/database electron/main/services/researchDiscussionContextService.ts electron/main/services/industryResearchChangeGenerationService.ts electron/main/ipc/industryResearchHandlers.ts electron/preload/index.ts tests/unit/discussionContextCompaction.repository.test.ts tests/unit/researchDiscussionArchive.repository.test.ts tests/unit/researchDiscussionContext.service.test.ts && git commit -m "feat(ai): add stable discussion sequences and archive-aware context"`。

### Task 5: 压缩服务与主进程 session lock

**Files:**
- Create: `electron/main/services/discussionSessionLock.ts`
- Create: `electron/main/services/discussionContextCompactionService.ts`
- Modify: `electron/main/services/researchDiscussionContextService.ts`
- Modify: `electron/main/database/aiAnalysisSessionRepository.ts`
- Modify: `electron/main/database/discussionCompactionRepository.ts`
- Modify: `electron/main/database/discussionMessageArchiveRepository.ts`
- Modify: `electron/main/database/types.ts`
- Test: `tests/unit/discussionContextCompaction.service.test.ts`
- Test: `tests/unit/discussionSessionLock.test.ts`

- [x] **Step 1: Write failing service tests** — 12 对触发自动压缩；摘要携带上一轮累计摘要；成功事务归档旧 sequence、保留 6 条热消息、不写 summary message；模型失败不改热 JSON；同一 session lock 串行。
- [x] **Step 2: Run RED** — `pnpm exec vitest run tests/unit/discussionContextCompaction.service.test.ts tests/unit/discussionSessionLock.test.ts`。
- [x] **Step 3: Implement minimal service** — `AUTO_COMPACT_MIN_PAIRS=12`、`HOT_TAIL_MESSAGE_COUNT=6`；`compactDiscussionContext` 和 lock-internal 版本；摘要 prompt/长度校验；SQLite 事务写 compaction/archive/hot tail；`loadFullDiscussionMessages`。
- [x] **Step 4: Run GREEN** — 同一命令，确认失败路径事务未改变 messages。
- [x] **Step 5: Commit** — `git add electron/main/services/discussionSessionLock.ts electron/main/services/discussionContextCompactionService.ts electron/main/services/researchDiscussionContextService.ts electron/main/database tests/unit/discussionContextCompaction.service.test.ts tests/unit/discussionSessionLock.test.ts && git commit -m "feat(ai): compact discussion context into cumulative archive"`。

### Task 6: follow-up 幂等、自动/手动 compact、portfolio 与深度研究写回

**Files:**
- Modify: `electron/main/ipc/aiHandlers.ts`
- Modify: `electron/main/services/portfolioBriefService.ts`
- Modify: `electron/main/services/researchAgentRunManager.ts`
- Modify: `electron/main/database/discussionTurnRequestRepository.ts`
- Modify: `electron/preload/index.ts`
- Modify: `src/components/AIAnalysis/AIAnalysis.tsx`
- Modify: `src/components/AIConfig/AIConfig.tsx`
- Modify: `src/components/AIAnalysis/README.md`
- Modify: `src/components/ResearchDiscussion/README.md`
- Test: `tests/unit/aiDiscussionFollowUp.concurrency.test.ts`
- Test: `tests/unit/portfolioBrief.service.test.ts`

- [x] **Step 1: Write failing concurrency tests** — follow-up requestId 重放不重复消息；busy 时 follow-up/compact 被主进程拒绝；auto compact 失败仍发送原问题；portfolio brief 与 follow-up 不交错覆盖。
- [x] **Step 2: Run RED** — `pnpm exec vitest run tests/unit/aiDiscussionFollowUp.concurrency.test.ts tests/unit/portfolioBrief.service.test.ts`。
- [x] **Step 3: Implement IPC/service integration** — follow-up 在 lock 内做 request receipt、busy、auto compact、AI 调用、审计和写回；加入 `ai:compactDiscussionContext`；portfolio brief 和 research agent report 走相同 lock/sequence；配置和 UI 接通 autoCompact 开关及“整理聊天上下文”按钮。
- [x] **Step 4: Run GREEN** — 同一命令，加跑 research agent 与现有 AI 分析单测。
- [x] **Step 5: Commit** — `git add electron/main/ipc/aiHandlers.ts electron/main/services/portfolioBriefService.ts electron/main/services/researchAgentRunManager.ts electron/main/database/discussionTurnRequestRepository.ts electron/preload/index.ts src/components/AIAnalysis src/components/AIConfig tests/unit/aiDiscussionFollowUp.concurrency.test.ts tests/unit/portfolioBrief.service.test.ts && git commit -m "feat(ai): serialize discussion turns and support compact replay"`。

### Task 7: UI/E2E 与行为文档

**Files:**
- Modify: `src/components/AIAnalysis/AIAnalysis.tsx`
- Modify: `src/components/AIAnalysis/README.md`
- Modify: `src/components/ResearchDiscussion/ResearchDiscussionChangePanel.tsx`
- Modify: `src/components/ResearchDiscussion/researchDiscussionTypes.ts`
- Modify: `src/components/ResearchDiscussion/README.md`
- Modify: `src/components/TrendWatcher/README.md`
- Create: `tests/e2e/ai-discussion-compaction.spec.ts`

- [x] **Step 1: Add E2E assertions** — 手动“整理聊天上下文”、压缩后热尾部/摘要元数据、busy 禁止、失败提示、FR-239 使用 sequence。
- [x] **Step 2: Run E2E RED/GREEN** — `node node_modules/@playwright/test/cli.js test --workers=1 tests/e2e/trend-ai-review.spec.ts tests/e2e/ai-discussion-compaction.spec.ts`，2/2 通过；Windows 下使用 Node 直接调用 Playwright CLI。
- [x] **Step 3: Update component READMEs** — 写入实际 IPC、busy、sequence、summary/archive 与文案约束，不写实现未有的承诺。
- [x] **Step 4: Commit** — `git add src/components/AIAnalysis src/components/ResearchDiscussion src/components/TrendWatcher tests/e2e/ai-discussion-compaction.spec.ts && git commit -m "docs(ui): document compact discussion and review behavior"`。

### Task 8: 全量验证与设计初衷检核

**Files:**
- Modify: `docs/superpowers/plans/2026-08-09-trend-ai-review-and-context-compaction-revision.md`
- Modify: `docs/superpowers/specs/2026-08-09-trend-ai-review-and-context-compaction-revision-design.md`

- [x] **Step 1: Run targeted unit tests** — 初次定向回归 9 files / 52 tests passed；final review fix wave 扩展到 10 files / 73 tests passed，覆盖全量 busy 查询、session-lock 竞态、归档 fail-closed、requestId 绑定与 portfolio brief 串行化。
- [x] **Step 2: Run typecheck/lint/build** — `pnpm run verify` 已包含并通过 typecheck、lint、unit、build；lint 仅有既有 warnings。
- [x] **Step 3: Rebuild Electron native ABI and run verify** — 本轮没有原生依赖变更；Electron unit 与 E2E 均实际加载 `better-sqlite3`，ABI 可用；随后 `pnpm run verify` 通过。
- [x] **Step 4: Run boundary/E2E** — `./.github/scripts/Test-PublicBoundary.ps1` 通过（912 个文件）；两组目标 E2E 通过（2/2）。
- [x] **Step 5: Audit every requirement** — 已填写设计初衷检核；whole-branch review 的 4 个 Important 与 1 个 Minor finding 由 `cf35d88` 修复，scoped re-review 判定 5/5 ADDRESSED，未发现新 Critical/Important。
- [x] **Step 6: Commit documentation only if changed** — 初次验收归档为 `a1cac8c`、`59f4e13`；最终 review/验证状态在本次文档提交归档。

## 设计初衷检核（完成后填写）

| Spec 项 | 结果（符合 / 偏差 / 未做） | 证据 |
|---|---|---|
| 五枚举、rationale/focusPoints 有界 | 符合 | `trendStructureReviewTypes.ts`、`trendStructureReview.service.test.ts`、`trendStructureReview.repository.test.ts` 覆盖词表与长度边界。 |
| 白名单事实不含易变行情和持仓字段 | 符合 | `trendStructureReviewService.ts` 白名单构造；趋势复核服务/Workbench 单测验证不带行情、持仓和 Renderer 字段。 |
| 复核 revision 不可覆盖、latest projection 正确 | 符合 | Migration 140–143 与 `trendStructureReview.repository.test.ts` 验证 legacy 保留、同 hash 重放、新 hash 追加 revision，以及每个成功 requestId 的不可变身份绑定。 |
| AI 不改本地 trendState | 符合 | `trendWorkbench.review.test.ts` 与 `trend-ai-review.spec.ts` 验证本地徽章状态在 AI 复核前后不变。 |
| 批量 ≤20、串行、逐条进度 | 符合 | `trendReview.handlers.test.ts` 验证并发/进度；E2E 验证批量确认和完成结果。 |
| stale 与带事实去讨论 | 符合 | Workbench stale 回归与 `trend-ai-review.spec.ts` 验证身份化入口、最新事实重建和 return target。 |
| sequence 由主进程生成并可恢复 | 符合 | 会话/归档/上下文 Repository 单测与 `researchDiscussionContext.service.test.ts` 验证 sequence 生成、恢复和旧 index 兼容。 |
| 累计摘要、归档、热尾部、失败原子性 | 符合 | `discussionContextCompaction.service.test.ts`、follow-up 并发回归和 `ai-discussion-compaction.spec.ts` 验证 12 对阈值、6 条热尾部、归档及失败不改写。 |
| FR-239 不受 compaction 游标污染 | 符合 | `researchDiscussionArchive.repository.test.ts` 与 `industryResearchChangeGeneration.service.test.ts` 验证 through sequence 读取和独立游标推进。 |
| busy、session lock、requestId 幂等 | 符合 | all-row busy 查询、研究启动/follow-up/compact/portfolio session lock 回归、`aiDiscussionFollowUp.concurrency.test.ts` 与 compaction E2E 验证 busy 拒绝、串行写回和 requestId 重放。 |
| 自动/手动 compact 与配置开关 | 符合 | AI IPC/Follow-up 单测、AI 配置与分析 UI 改动，以及 compaction E2E 覆盖自动失败继续追问、手动整理和开关。 |
| 三份组件 README、单测、E2E、verify | 符合 | 三份 README 已更新；final fix 定向 10 files/73 tests、最终 `pnpm run verify`、Public Boundary（912 文件）、目标 E2E 2/2 全部通过。 |

**总评：** 设计约束已落地，代码、Migration 140–143、IPC、并发、UI 与审计证据闭环；whole-branch review 的全部 finding 已修复并通过 scoped re-review，最终全量门禁通过。没有引入荐股、自动交易或跨会话长期记忆扩张。
**检核人 / 日期：** Codex / 2026-08-09
