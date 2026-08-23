# Task 8 review-fix report

## 状态

已完成 Task 8 review-fix。实现基线为 `53d7b226847dabe238c3b2a63542a9040e826f01`；未创建 worktree，未执行 `reset`、`checkout` 或 `clean`，也未改动设计规格正文或普通 plan 的目标内容。

## 根因与修复

1. 会话 messages 读取会过滤坏项并回写规范化结果，可能在普通读取时覆写不可解析的研究账本。读取现在严格校验整个数组；坏 raw 保持原样，写入遇到坏 raw 明确拒绝，合法 legacy 数组仍可补齐 sequence。
2. compaction requestId 仅按 session 或过早按阈值处理，跨 session/race 和已压缩重放都不能校验完整身份。现在以 session、源序列范围、源消息 hash（及 repository 内 summary hash）校验，冲突返回 `REQUEST_CONFLICT`；migration 142 为 compaction/archive 增加 session 一致性和正序列保护。已压缩后，即使当前热消息不足阈值，也先返回同身份既有 compaction。
3. follow-up receipt 创建后的自动压缩异常可绕过收口。自动压缩错误现在降级为 warning 并沿用原 hot context；后续异常会将未成功 receipt 终结为 failed 并返回结构化错误。
4. trend review requestId 重放与唯一冲突后的重读没有校验完整身份。现在将 tsCode、scoreDate、factsHash 一并验证，不一致返回 `TREND_REVIEW_REQUEST_CONFLICT`。
5. 累计摘要曾只做长度/空值处理。现在经 `auditResearchText`，并保守阻断交易/目标价/仓位、不可追溯日期、趋势枚举改写和提示词注入；失败不会落库或归档。
6. 讨论返回 trend watcher 时未保留 dashboard 子状态。store 现在保存 trend return state，App 根据 target 进入 radar dashboard。
7. trend drawer 曾缓存过期 workbench item，且讨论 testid/可用性不正确。drawer 仅保存 tsCode、从最新 snapshot 派生 item；仅在当前 review 且非 stale 时开放讨论，并使用抽屉专用 testid。

## 修改文件

- 业务/数据库：`electron/main/database/aiAnalysisSessionRepository.ts`、`db.ts`、`discussionCompactionRepository.ts`、`discussionMessageArchiveRepository.ts`、`trendStructureReviewRepository.ts`、`electron/main/services/discussionContextCompactionService.ts`、`discussionFollowUpService.ts`、`trendStructureReviewService.ts`。
- Renderer/store：`src/App.tsx`、`src/store/appStore.ts`、`src/components/TrendWatcher/TrendDashboard.tsx`、`src/components/shared/StockMiniChart.tsx`。
- 行为文档：`src/components/TrendWatcher/README.md`、`src/components/shared/README.md`。
- 测试：`tests/unit/aiAnalysisSessionRepository.messages.test.ts`、`aiDiscussionFollowUp.concurrency.test.ts`、`discussionContextCompaction.repository.test.ts`、`discussionContextCompaction.service.test.ts`、`researchDiscussion.navigation.test.ts`、`researchDiscussionArchive.repository.test.ts`、`stockKlineChipDrawerView.test.tsx`、`trendStructureReview.repository.test.ts`、`trendStructureReview.service.test.ts`。

## 测试记录

先行 RED：对上述每个缺口加入最小测试后，以 `pnpm run test:unit -- <对应测试文件>` 执行；修复前均按预期失败（exit code 1），包括 malformed messages、跨 session/migration 142、follow-up 自动压缩异常与 terminal receipt、trend request identity、对抗 summary、return navigation/drawer freshness，以及压缩成功后 requestId replay。

| 命令 | 退出码 | 结果 |
| --- | ---: | --- |
| `pnpm run test:unit -- tests/unit/aiAnalysisSessionRepository.messages.test.ts tests/unit/aiDiscussionFollowUp.concurrency.test.ts tests/unit/discussionContextCompaction.repository.test.ts tests/unit/discussionContextCompaction.service.test.ts tests/unit/researchDiscussion.navigation.test.ts tests/unit/researchDiscussionArchive.repository.test.ts tests/unit/stockKlineChipDrawerView.test.tsx tests/unit/trendStructureReview.repository.test.ts tests/unit/trendStructureReview.service.test.ts` | 0 | GREEN；9 files / 54 tests，覆盖 Task 8 针对性回归。 |
| `pnpm run test:unit -- tests/unit/discussionContextCompaction.service.test.ts` | 0 | GREEN；10 tests，包含已压缩 requestId 的 replay 回归。 |
| `pnpm run test:unit` | 0 | GREEN；完整 unit suite。 |
| `pnpm run typecheck` | 0 | GREEN；node 与 web TypeScript 检查。 |
| `git diff --check` | 0 | GREEN；无 whitespace 错误。 |

首次在受限 Windows sandbox 中运行 Vitest 出现 `spawn EPERM`；已改用获准 escalation 的同一 targeted/full-unit 命令，未发生后台空转。

## 自审与剩余 concerns

- 已核对 Task 8 brief 的七项必修行为和用户追加的两个 review 点；其中 `TrendDashboard` 键盘 Enter/Space 现调用 `setSelectedTsCode(item.tsCode)`，compaction 在阈值/`findArchiveEndIndex` 分支也保留既有 requestId replay。
- 未运行 `pnpm run verify`（会额外执行 lint/build）或 Playwright E2E；本波次的相关单测、完整 unit suite 和 typecheck 已运行。
- summary 的保守审计刻意可能拒绝无法从 `promptSent` 追溯的日期/趋势枚举，属于防止硬事实被改写的预期取舍。
