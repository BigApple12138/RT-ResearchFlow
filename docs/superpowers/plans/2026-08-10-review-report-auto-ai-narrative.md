# 复盘报告自动附带 AI 研判段落 Implementation Plan

> **For agentic workers:** 按任务勾选推进；优先 TDD；完成后填写文末「设计初衷检核」。本线程用户要求执行但 **不要 commit**。

**Goal:** 一键复盘 / 生成本周复盘在本地报告生成后自动调用一次模型，在报告内写入可持久化的「AI 研判」单段落；软失败不阻断本地保存；关抽屉取消 in-flight；失败可「仅重试 AI」。

**状态：** 已完成（代码未 commit）  
**Spec：** [`../specs/2026-08-10-review-report-auto-ai-narrative-design.md`](../specs/2026-08-10-review-report-auto-ai-narrative-design.md)（已批准；§9 OQ 已锁定）

**Architecture:** Renderer 本地先 `build*ReviewReport` → 保存快照 → 窄 IPC `decision:generateReviewAiNarrative`（主进程校验本地事实摘要 → `resolveProviderCredentials` + `callWithFallback` → 消毒单段落）→ 同 `requestId` 行 `updateReviewReportSnapshot` 补写 `aiNarrative`。UI 用代际 token 防重入；关抽屉递增代际取消回调。不新开讨论会话。

**Tech Stack:** Electron IPC、better-sqlite3、React、TypeScript、Vitest、`callWithFallback`

## Global Constraints

- daily + weekly 一并；生成后自动 1 次模型调用（重试为显式二次）
- 软失败：AI 失败/未配置不回滚本地报告
- 同轮 AI 成功：**补写同一 version**（非 AI-only 新 version）
- 单段落纯文本 + 长度上限（默认 2500 字截断）
- 关抽屉：**取消** in-flight（忽略过期回调，不后台补写）
- 失败/缺失提供「仅重试 AI」
- 复用 `callWithFallback` / `resolveProviderCredentials`；Renderer 不持凭据
- 禁止荐股 / 买卖点 / 收益承诺 / 自动交易话术；保留免责声明语境
- 保留「和 AI 讨论」（FR-239）；不替换本地统计段
- 更新 `DecisionCenter/README.md`（FR-250）
- **不 commit**

## Locked OQ defaults

| # | 锁定 |
|---|---|
| 1 | 同轮 UPDATE 同一 `requestId` 快照 |
| 2 | 单段落 |
| 3 | 关抽屉取消代际 |
| 4 | 有「仅重试 AI」 |

## File Map

| 文件 | 职责 |
|---|---|
| `src/components/DecisionCenter/reviewReportModel.ts` | `ReviewAiNarrative` 类型；`formatReviewReportText` 含 AI 节 |
| `electron/main/database/types.ts` | `DecisionReviewReportSnapshot.aiNarrative?` |
| `electron/main/database/decisionReviewReportRepository.ts` | 可选字段校验；`updateReviewReportSnapshot` |
| `electron/main/services/reviewAiNarrativeService.ts` | prompt、调用、消毒、错误码 |
| `electron/main/ipc/decisionHandlers.ts` | `decision:generateReviewAiNarrative` + patch save |
| `electron/preload/index.ts` | 暴露 API + 类型 |
| `src/components/DecisionCenter/ReviewReportPanel.tsx` | AI 区 loading/error/retry |
| `src/components/DecisionCenter/DecisionCenter.tsx` | 自动触发、代际取消、补写、重试 |
| `src/components/DecisionCenter/README.md` | FR-250 |
| `tests/unit/reviewReportModel.test.ts` | format 含 AI / 失败文案 |
| `tests/unit/decisionReviewReport.repository.test.ts` | 可选字段 + update 同 version |
| `tests/unit/reviewAiNarrative.service.test.ts` | prompt 约束、软失败、消毒 |
| `tests/unit/reviewAiNarrative.handlers.test.ts` | IPC 契约 |

### Task 1: 类型、格式化、快照校验与同 version 补写

- [x] 扩展 `ReviewReport.aiNarrative?` / `DecisionReviewReportSnapshot.aiNarrative?`
- [x] `formatReviewReportText`：ready 输出正文；error/pending 写明状态；缺字段则省略或「未生成」
- [x] `validateSnapshot` 允许缺省 `aiNarrative`；若有则校验 `status/text/...`
- [x] 新增 `updateReviewReportSnapshot(db, { id, report })`：UPDATE `snapshot_json`（及必要摘要列），**不**增 version
- [x] 单测：旧快照兼容、format、update 同 id/version

### Task 2: 主进程 AI 研判服务 + IPC

- [x] `reviewAiNarrativeService.ts`（prompt / soft-fail / sanitize / `callWithFallback`）
- [x] IPC `decision:generateReviewAiNarrative` + `decision:updateReviewReportSnapshot`
- [x] preload 暴露
- [x] 服务/IPC 单测

### Task 3: UI 自动流、重试、关抽屉取消

- [x] DecisionCenter 自动触发 + 同 version 补写 + 代际取消
- [x] ReviewReportPanel AI 区 + 「仅重试 AI」
- [x] 生成中 disable 防连点

### Task 4: README + 验收 + 检核

- [x] README FR-250
- [x] focused vitest 17 PASS + typecheck PASS
- [x] 设计初衷检核 + 自审 must-fix
- [x] **未 commit**

## 设计初衷检核（完成后填写）

| Spec 项 | 结果 | 说明 |
|---|---|---|
| 1 日报自动 AI 节 | 符合 | `handleGenerateDailyReview` 本地成功后 `runReviewAiNarrative` |
| 2 周报对称 | 符合 | `handleGenerateWeeklyReview` 同路径 |
| 3 软失败保留本地 | 符合 | AI error 写入 narrative；本地 save 不回滚；服务返回 `AI_NOT_CONFIGURED` |
| 4 复制文本含 AI | 符合 | `formatReviewReportText` 含 `## AI 研判`；单测覆盖 |
| 5 再生成新 version + AI 重调；旧不篡改 | 符合 | 新 `requestId` 仍走 `saveReviewReport` 增 version；AI 补写用 `updateReviewReportSnapshot` |
| 6 保留和 AI 讨论 | 符合 | FR-239 入口未删；仍要求 savedMeta |
| 7 无荐股/收益承诺 | 符合 | 系统约束 + `FORBIDDEN_PATTERN` 拒收 |
| 8 单次调用默认；重试显式 | 符合 | 自动路径一次；`仅重试 AI` 显式 |
| 9 README + 单测 | 符合 | FR-250 + 17 测 |
| OQ1 同 version 补写 | 符合 | `updateReviewReportSnapshot`；仓库测断言 version 不变 |
| OQ2 单段落 | 符合 | 纯文本一段，无强制三节 |
| OQ3 关抽屉取消 | 符合 | `cancelReviewAiInFlight` 递增 seq；过期回调 no-op |
| OQ4 仅重试 AI | 符合 | `review-report-ai-retry` |

**总评：** 符合已批准 design 与锁定 OQ；未 commit，待用户 smoke-test 后按需提交。  
**检核人 / 日期：** Agent / 2026-08-10

**验证命令：**

```powershell
pnpm run test:unit -- tests/unit/reviewReportModel.test.ts tests/unit/decisionReviewReport.repository.test.ts tests/unit/reviewAiNarrative.service.test.ts tests/unit/reviewAiNarrative.handlers.test.ts
pnpm run typecheck
```

### 自审备注（must-fix only）

- AI 失败不得阻断或回滚本地事实保存。
- AI 成功只 UPDATE 同 version，禁止 AI-only 刷出半成品新 version。
- 关抽屉必须 cancel 代际，禁止关后后台补写。
- Renderer 不得直连模型；只走 `generateReviewAiNarrative` + `callWithFallback`。
- 输出与 prompt 禁止买卖/仓位/收益承诺；「和 AI 讨论」不可删除或强制替代。
