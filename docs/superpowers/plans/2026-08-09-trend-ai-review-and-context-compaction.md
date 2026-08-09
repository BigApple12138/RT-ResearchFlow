# 趋势 AI 复核 + 讨论上下文压缩 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 趋势雷达并排展示 AI 结构复核标签（本地状态不变），支持单只/批量显式复核与带事实去讨论；研究讨论具备硬事实保留 + 对话压缩的上下文管理。

**Architecture:** 主进程新增 `trendStructureReviewService`（白名单事实打包、factsHash、模型调用、词表校验、审计与落库）与 `trendReviewDiscussionBridge`（按复核身份创建受信讨论快照）。上下文压缩由 `discussionContextCompactionService`、压缩 Repository 和消息归档 Repository 协作：热会话只保留未归档尾部，累计摘要与旧消息分别落库；`researchDiscussionContextService` 组装硬事实、最新累计摘要和热消息。Renderer 只做徽章、勾选、进度、入口和按钮。

**Tech Stack:** Electron 主进程、better-sqlite3 migrations、现有 `callWithFallback` / 讨论审计、React TrendWatcher + AIAnalysis + ResearchDiscussion、Vitest。

**状态：** 已由 2026-08-09 契约修订计划收敛；实现与最终验收以修订版计划为准  
**Spec（设计初衷）：** [`../specs/2026-08-09-trend-ai-review-and-context-compaction-design.md`](../specs/2026-08-09-trend-ai-review-and-context-compaction-design.md)  
**归档：** 本 plan 必须保留在 `docs/superpowers/plans/`；执行完毕后填写文末「设计初衷检核」。约定见 [`../README.md`](../README.md)。

## Global Constraints

- 不覆盖本地 `trendState`；AI 仅第二标签  
- 显式点击才调模型；批量上限 20、串行  
- 禁止买卖/目标价/仓位建议（审计拦截）  
- 硬事实压缩时不得丢弃；session busy 时禁止 compact/追问  
- 应用层统一使用 `scoreDate`；数据库层使用 `score_trade_date`，不得出现 `scoreTradeDate` DTO 变体  
- 复核事实只能由主进程白名单构造；不得包含 `costPrice`、`profitPct`、`positionAdvice` 或 Renderer 上传的事实正文  
- 新表必须向前 Migration（当前最新约 135，本计划使用 136–139）  
- 上下文压缩使用稳定 `message.sequence`；不插入 summary message，不修改 FR-239 的 `summarized_through_message_index`  
- 同一 session 的 followUp/compact 必须由主进程锁串行；重复 requestId 不得重复追加消息  
- `autoCompactDiscussion` 必须是可关闭的 AI 配置项，默认 true；自动阈值固定为 12 个 user+assistant 对  
- 只推 fork；不推 upstream；不提交密钥/真实持仓  
- 改行为同步更新模块 README / FR

## File map

| 文件 | 职责 |
|---|---|
| `electron/main/database/db.ts` | Migration 136–139：复核、压缩、归档、幂等请求与 AI 配置 |
| `electron/main/database/trendStructureReviewRepository.ts` | 复核 CRUD |
| `electron/main/database/discussionCompactionRepository.ts` | 压缩记录 CRUD |
| `electron/main/database/discussionMessageArchiveRepository.ts` | 归档消息写入、按 sequence 恢复完整讨论 |
| `electron/main/database/discussionTurnRequestRepository.ts` | followUp requestId 幂等记录 |
| `electron/main/services/trendStructureReviewService.ts` | 白名单事实、factsHash、调模型、词表/审计校验 |
| `electron/main/services/trendReviewDiscussionBridge.ts` | 复核身份校验、reviewKey、讨论快照创建 |
| `electron/main/services/discussionContextCompactionService.ts` | 累计摘要、归档范围、热消息与模型消息组装策略 |
| `electron/main/services/researchDiscussionContextService.ts` | `buildDiscussionModelMessages` 接入累计摘要与热消息 |
| `electron/main/services/industryResearchChangeGenerationService.ts` | 按完整 message sequence 读取归档 + 热消息，保留 FR-239 游标语义 |
| `electron/main/database/aiAnalysisSessionRepository.ts` / `electron/main/database/types.ts` | ConversationMessage sequence、requestId、热消息读写 |
| `electron/main/database/aiConfigRepository.ts` / `src/components/AIConfig/AIConfig.tsx` | `autoCompactDiscussion` 配置 |
| `electron/main/services/trendWorkbenchService.ts` | workbench 附加 reviews |
| `electron/main/ipc/trendHandlers.ts` / `electron/main/ipc/aiHandlers.ts` | 注册趋势复核、去讨论、压缩与 followUp IPC |
| `electron/preload/index.ts` | 暴露 API |
| `src/components/TrendWatcher/TrendDashboard.tsx` 等 | 徽章、单只/批量、去讨论 |
| `src/components/shared/StockMiniChart.tsx` | 为 K 线抽屉增加可选复核/讨论 action，不影响其他调用方 |
| `src/components/TrendWatcher/AiTrendReviewBadge.tsx` | AI 徽章展示 |
| `src/components/AIAnalysis/AIAnalysis.tsx` | 「整理聊天上下文」按钮 |
| `src/components/ResearchDiscussion/*` | 文案/busy 与压缩提示 |
| `tests/unit/trendStructureReview*.test.ts` | 词表/过期/服务 |
| `tests/unit/discussionContextCompaction*.test.ts` | 累计摘要、sequence、归档、组装与阈值 |
| `tests/unit/researchDiscussionArchive*.test.ts` | 归档恢复与 FR-239 整理回归 |
| `tests/e2e/trend-ai-review*.spec.ts` | 复核徽章、批量限制、去讨论入口 |
| `tests/e2e/ai-discussion-compaction*.spec.ts` | 手动压缩、热消息与 busy 禁止 |
| `*/README.md` | FR 与行为 |

---

### Task 0: 执行前基线与分期隔离

**Files:**
- Read: `AGENTS.md`, `docs/superpowers/README.md`, 三份受影响组件 README
- No product code changes

- [ ] 记录执行前 `git status --short`、当前分支和 HEAD；当前工作树若有 Cursor 未提交改动，先在独立 `codex/` 分支或 worktree 执行，禁止把既有改动混入本计划 commit
- [ ] 将任务分成两个可独立验收的阶段：Phase A 为 Task 1–5（趋势复核与去讨论），Phase B 为 Task 6–8（消息归档、压缩与 followUp 改造）；Phase B 必须等待 Phase A 集成测试通过
- [ ] 只在用户批准本 plan/design 后开始业务代码；文档修订本身不改变产品行为

---

### Task 1: Migration + repositories

**Files:**
- Modify: `electron/main/database/db.ts`
- Create: `electron/main/database/trendStructureReviewRepository.ts`
- Create: `electron/main/database/discussionCompactionRepository.ts`
- Create: `electron/main/database/discussionMessageArchiveRepository.ts`
- Create: `electron/main/database/discussionTurnRequestRepository.ts`
- Modify: `electron/main/database/aiConfigRepository.ts`
- Modify: `electron/main/database/types.ts`
- Create: `tests/unit/trendStructureReview.repository.test.ts`
- Create: `tests/unit/discussionContextCompaction.repository.test.ts`
- Create: `tests/unit/researchDiscussionArchive.repository.test.ts`

- [ ] 添加 migration **136** `trend_structure_reviews`：`(ts_code, score_trade_date)` 主键；保存 `facts_hash`、`request_id`、`audit_json`、`created_at`、`updated_at`；不保存 `session_id`
- [ ] 添加 migration **137** `ai_discussion_context_compactions`：累计摘要、`source_start_sequence`、`covered_through_sequence`、`source_messages_hash`、`summary_hash`、唯一 `request_id`、Provider/Model；外键删除会话时级联
- [ ] 添加 migration **138** `ai_discussion_message_archives`：`(session_id, message_sequence)` 主键，保存原始 `message_json`、`compaction_id`、`archived_at`；增加 session/sequence 索引
- [ ] 添加 migration **139**：`ai_config.autoCompactDiscussion INTEGER NOT NULL DEFAULT 1`，并建立 `ai_discussion_turn_requests` 幂等记录表（`request_id` 主键、`session_id`、状态、用户消息、响应文本、时间戳）
- [ ] Repository：复核 `upsert/getByCodeDate/listByCodes`；压缩 `insert/getLatest`；归档 `archive/listFullDiscussionMessages`；turn request `get/insert/complete`
- [ ] 所有迁移在旧库和空库上幂等；迁移失败回滚；单测覆盖 upsert、按 codes 批量读、归档恢复顺序、重复 requestId 和配置默认值
- [ ] Commit：`db: add trend review and discussion archive tables`

---

### Task 2: 词表校验与复核服务（TDD）

**Files:**
- Create: `electron/main/services/trendStructureReviewTypes.ts`（枚举与 DTO）
- Create: `electron/main/services/trendStructureReviewService.ts`
- Create: `tests/unit/trendStructureReview.service.test.ts`

- [ ] 定义 `AiTrendVerdict` 五枚举 + `TrendReviewFacts` + `parseAiTrendReviewPayload(raw)`；非法 JSON、未知枚举、超长 rationale/focusPoints、缺字段均拒绝
- [ ] `buildTrendReviewFacts(db, tsCode)` 只返回固定白名单，应用字段使用 `scoreDate`；明确不包含 `costPrice`、`profitPct`、`positionAdvice`、原始 workbench item 或 Renderer 文本
- [ ] `hashTrendReviewFacts(facts)` 对稳定序列化事实计算 SHA-256；`reviewStructure(db, { requestId, tsCode })` 返回 `factsHash` 并以 `scoreDate + factsHash` 判断过期
- [ ] 无评分/数据不足/有效权重不足时直接落 `need_more_data`，不调用模型；其他情况调用 `callWithFallback`
- [ ] 将结构化结果渲染成受审计文本，调用 `auditResearchText({ documentKind: 'discussion', allowedFactTexts })`；audit blocked 或结构化校验失败均不得写库，成功后保存 `audit_json`、Provider/Model、requestId
- [ ] 单测：假破词表、非法 JSON、超长字段、白名单不含持仓成本/仓位、未 ready 短路径、factsHash 变化判 stale、审计失败不写库
- [ ] Commit：`feat(trend): structure review service with enforced verdict vocab`

---

### Task 3: IPC + workbench 附加字段

**Files:**
- Modify: `electron/main/ipc/trendHandlers.ts`
- Modify: `electron/main/services/trendWorkbenchService.ts`
- Modify: `electron/preload/index.ts`
- Modify: TrendWatcher 相关 TS 类型（preload / 前端 type）
- Create: `tests/unit/trendWorkbench.review.test.ts`

- [ ] 主进程校验 UUID requestId、A 股代码格式、代码属于当前 workbench；`trend:reviewStructureBatch` 校验 1–20 条并在主进程串行，不能只依赖 UI；为每个 code 派生稳定 item request key
- [ ] `trend:getWorkbench` 每条 item 附加 `structureReview: null | { verdict, rationale, focusPoints, stale, scoreDate, factsHash, createdAt }`
- [ ] `stale` = review 的 `scoreDate`、`factsHash` 或当前行情/评分事实与 workbench 不一致；应用层不出现 `scoreTradeDate`
- [ ] batch 返回逐条 `{ tsCode, ok, review?, error? }`，单条失败不阻断后续；同一批次重放时对相同 `factsHash` 复用已有结果，不重复调模型
- [ ] preload 与 `src/components/TrendWatcher/trendWorkbenchTypes.ts` 类型同步，补齐单只、批量和去讨论 API
- [ ] 单测覆盖 batch 上限/串行/部分失败、DTO 映射、过期判定和未知代码拒绝
- [ ] Commit：`feat(trend): IPC for structure review and workbench attachment`

---

### Task 4: 雷达 UI（单只 + 批量 + 徽章）

**Files:**
- Create: `src/components/TrendWatcher/AiTrendReviewBadge.tsx`
- Modify: `src/components/TrendWatcher/TrendDashboard.tsx`
- Modify: `src/components/shared/StockMiniChart.tsx`（增加可选 `onReview` / `onDiscuss` action，不改变其他调用方默认行为）
- Modify: `src/components/TrendWatcher/README.md`
- Create: `tests/e2e/trend-ai-review.spec.ts`

- [ ] `AiTrendReviewBadge`：五态文案 + stale「需重核」
- [ ] 行内并排本地徽章 + AI 徽章
- [ ] 「AI 复核结构」按钮 → invoke review → toast → reload workbench
- [ ] 勾选列按 `tsCode` 管理，筛选/刷新后保留可解释选择；「批量复核」确认严格限制 1–20，显示逐条成功/失败进度
- [ ] 行内操作阻止表格行点击冒泡；K 线抽屉的复核/讨论按钮只在 TrendDashboard 传入时出现，避免影响其他模块
- [ ] data-testid：`trend-ai-review-{code}`、`trend-ai-review-batch`、`trend-ai-review-discussion-{code}`；同步 Playwright 键盘焦点、暗色主题和横向溢出验收
- [ ] Commit：`feat(trend): radar UI for AI structure review badges`

---

### Task 5: 带着复核去讨论

**Files:**
- Create: `electron/main/services/trendReviewDiscussionBridge.ts`
- Modify: `electron/main/services/researchDiscussionContextService.ts`
- Modify: `electron/main/ipc/trendHandlers.ts`
- Modify: `electron/main/ipc/aiHandlers.ts`
- Modify: `electron/preload/index.ts`
- Modify: `src/components/ResearchDiscussion/researchDiscussionTypes.ts`
- Modify: `src/components/ResearchDiscussion/useResearchDiscussionNavigation.ts`
- Modify: `src/components/TrendWatcher/TrendDashboard.tsx`
- Modify: `src/components/shared/StockMiniChart.tsx`
- Modify: `src/components/ResearchDiscussion/README.md`
- Create: `tests/unit/trendReviewDiscussionBridge.test.ts`

- [ ] 定义 `startTrendReviewDiscussion(db, { requestId, tsCode, scoreDate, factsHash, initialQuestion, returnTarget })`；主进程重新读取复核记录和当前事实，身份不匹配直接返回 `STALE_REVIEW`
- [ ] 生成稳定 `reviewKey = trend-review:${normalizedTsCode}:${scoreDate}:${factsHash}`；底层仍使用现有 `origin_type = 'manual'` + `origin_id = reviewKey`，snapshot 标记 `contextKind: 'trend_review'`，不改 FR-239 的 origin CHECK
- [ ] 扩展 `researchDiscussionContextService` 的内部 `ResolvedOrigin`/snapshot 构造，使 bridge 可传 `trendReviewFacts`；普通 `manual` 路径仍只接受用户问题，Renderer 不可直接指定 snapshot
- [ ] 将白名单本地事实、AI verdict、rationale、focusPoints 和 factsHash 写入 `promptSent`/context snapshot；Renderer 不得上传事实正文；不写回 `trend_structure_reviews.session_id`
- [ ] `initialQuestion` 默认「复核 {name} 趋势结构」；`returnTarget` 固定为 `{ tab: 'trend-watcher', subTab: 'dashboard', entityId: tsCode, stateKey: 'trend-radar' }`
- [ ] UI「带着复核去讨论」只创建/恢复会话并导航 AI 分析，首条问题只预填，不自动 followUp；不同 factsHash 不得恢复到旧复核讨论
- [ ] 单测覆盖非法身份、过期复核、reviewKey 隔离、快照不含持仓成本/仓位和手动发送前零 AI 调用
- [ ] Commit：`feat(trend): open research discussion with structure review facts`

---

### Task 6: 压缩服务 + 改造消息组装（TDD）

**Files:**
- Create: `electron/main/services/discussionContextCompactionService.ts`
- Modify: `electron/main/services/researchDiscussionContextService.ts`（`buildDiscussionModelMessages` 与完整消息读取）
- Modify: `electron/main/services/industryResearchChangeGenerationService.ts`（按 sequence 读取归档 + 热消息）
- Modify: `electron/main/database/aiAnalysisSessionRepository.ts`
- Modify: `electron/main/database/discussionCompactionRepository.ts`
- Modify: `electron/main/database/discussionMessageArchiveRepository.ts`
- Modify: `electron/main/database/types.ts`
- Modify: `electron/preload/index.ts` / `src/components/AIAnalysis` 相关 session 类型
- Create: `tests/unit/discussionContextCompaction.service.test.ts`
- Create: `tests/unit/researchDiscussionArchive.regression.test.ts`

- [ ] 将 `ConversationMessage` 扩展为带稳定 `sequence`、可选 `requestId` 的 user/assistant 消息；对历史无 sequence JSON 在主进程锁内一次性规范化，不能由 Renderer 计算
- [ ] 固定 `AUTO_COMPACT_MIN_PAIRS = 12`；`shouldAutoCompact` 只统计未归档 user+assistant 对，并支持测试注入消息
- [ ] `compactDiscussionContext(db, { sessionId, requestId, mode })` 先在 session lock 内读取 hot messages 与最新累计摘要，再调用可注入的 `callWithFallback` 生成累计摘要
- [ ] 摘要 prompt 明确：硬事实不进入可变摘要；不得改写事实数值、日期或 AI 枚举；只压缩对话层；新摘要必须包含上一条累计摘要和本次新增原文
- [ ] 成功写入同一事务：archive 旧 sequence → insert compaction（源消息哈希、累计摘要哈希、覆盖范围）→ 将 `ai_analysis_sessions.messages` 改为热尾部；摘要不插入 `messages`
- [ ] `buildDiscussionModelMessages` 组装 `promptSent + 最新累计摘要 + 热尾部`，继续保留 `webSearchPolicy` 和 Provider 的纯 role/content 投影
- [ ] `loadFullDiscussionMessages(db, sessionId)` 按 sequence 合并归档表与热消息；`prepareDiscussionChanges` 使用它并将 IPC 参数 `throughMessageIndex` 改为 `throughMessageSequence`，不得读取压缩后的数组位置
- [ ] 单测：阈值边界、累计摘要不丢上次摘要、sequence 归档/恢复、失败不改 hot messages、不插入非法 role、模型组装不带全量旧原文、FR-239 变更范围回归
- [ ] Commit：`feat(ai): archive discussion history and assemble compact context`

---

### Task 7: followUp 接入自动压缩 + UI 手动入口

**Files:**
- Modify: `electron/main/ipc/aiHandlers.ts`（`ai:followUp`）
- Modify: `electron/main/services/researchAgentRunManager.ts`（导出 session busy 只读查询）
- Modify: `electron/main/database/discussionTurnRequestRepository.ts`
- Modify: `electron/preload/index.ts`（`ai:compactDiscussionContext`、`ai:followUp` requestId）
- Modify: `src/components/AIAnalysis/AIAnalysis.tsx`
- Modify: `src/components/AIConfig/AIConfig.tsx`
- Modify: `src/components/AIAnalysis/README.md`
- Modify: `src/components/ResearchDiscussion/README.md`
- Create: `tests/unit/aiDiscussionFollowUp.concurrency.test.ts`
- Create: `tests/e2e/ai-discussion-compaction.spec.ts`

- [ ] 将 `ai:followUp` 改为 `{ requestId, sessionId, message }`；主进程先查 request log，已成功请求直接返回已有 turn，不重复追加 user/assistant
- [ ] 同一 session 获取主进程 Promise lock，锁覆盖 busy 检查、读取 hot messages、自动 compact、调用 followUp 模型和写回结果；不同 session 可并行
- [ ] 主进程通过 research agent run manager 重新检查 `queued|running|paused`，busy 时拒绝追问、自动压缩和手动压缩；Renderer 状态只用于展示/禁用
- [ ] followUp 前读取 `ai_config.autoCompactDiscussion`；达到 12 对且非 busy 时调用 auto compact；压缩失败写 warning/Toast 后仍用原 hot context 发送，不吞掉用户追问
- [ ] 手动「整理聊天上下文」按钮与「整理本次讨论」明确区分；成功后刷新 session detail/累计摘要元数据，失败不改变热消息
- [ ] 更新 AI 配置 UI、preload 类型和 README，默认开启但允许用户关闭自动压缩
- [ ] 单测覆盖并发 followUp、compact/followUp 交错、busy 主进程拒绝、requestId 重放、压缩失败继续追问；E2E 覆盖手动压缩和 busy 文案
- [ ] Commit：`feat(ai): auto/manual compact before discussion follow-up`

---

### Task 8: 验证与收尾

- [ ] `pnpm exec vitest run tests/unit/trendStructureReview*.test.ts tests/unit/discussionContextCompaction*.test.ts tests/unit/researchDiscussionArchive*.test.ts tests/unit/aiDiscussionFollowUp*.test.ts`
- [ ] `pnpm run typecheck`
- [ ] `pnpm run verify`（包含 TypeScript、ESLint、全量单测与生产构建）
- [ ] `./.github/scripts/Test-PublicBoundary.ps1`
- [ ] `pnpm exec playwright test tests/e2e/trend-ai-review.spec.ts tests/e2e/ai-discussion-compaction.spec.ts`
- [ ] 手工验收对照 design §10：亮/暗主题、键盘焦点、减少动态效果、表格横向溢出、批量失败反馈、busy 禁止、旧消息归档可恢复
- [ ] 回归验证 `industryResearch:prepareDiscussionChanges` 使用 `throughMessageSequence`，不会把 compaction 当成 FR-239 研究变更游标
- [ ] 确认三份 README 已更新
- [ ] 最终 commit（若有文档微调）：`docs: trend AI review and context compaction readiness`

---

## 执行说明

1. 用户确认本 plan / design 后，再改产品代码。  
2. 先完成 Task 0；在当前工作树有 Cursor 改动时使用独立 `codex/` 分支或 worktree，按文件边界提交。  
3. 推荐 `subagent-driven-development` 按 Task 1→8 顺序；Task 5 完成 Phase A 验收后才能进入 Task 6。  
4. 推送仅 `origin`（fork），禁止 upstream。  
5. 全部 Task 完成后填写下方检核表，并把文首 **状态** 改为「已完成」或「已完成（有偏差）」。

---

## 设计初衷检核（完成后填写，归档用）

对照 spec §10 验收与 §2/§3 目标/非目标。勿删改 spec 正文来「对齐」实现。

| Spec 项 | 结果（符合 / 偏差 / 未做） | 说明（偏差或未做时必填） |
|---|---|---|
| 并排 AI 徽章，本地 `trendState` 不变 | | |
| 显式单只复核；不自动烧 Token | | |
| 批量 ≤20、串行 | | |
| 评分日或 factsHash 变化 →「需重核」 | | |
| 带着复核去讨论，硬事实进 `promptSent`/快照 | | |
| 词表五枚举 + 主进程校验；审计拦截交易语 | | |
| 对话压缩：硬事实保留；累计摘要 + 热尾部；旧消息进入归档表 | | |
| FR-239「整理本次讨论」与 compaction 游标互不污染 | | |
| 自动/手动「整理聊天上下文」；主进程 busy/锁/幂等 | | |
| 三份组件 README 已更新 | | |
| 单测：词表 / 过期 / 消息组装 / classify 未被 AI 改写 | | |

**总评（完成后）：** _（一句话：是否符合设计初衷；若有偏差列决策依据）_  
**检核人 / 日期：** _|_
