# 结构复核 force / reuse 确认 Implementation Plan

> **For agentic workers:** 按任务勾选推进；优先 TDD；完成后填写文末「设计初衷检核」。本线程用户未要求 commit —— **不要提交**，仅保留工作区改动。

**Goal:** 有可复用本地模型复核时，先确认「是→强制再调 LLM 并新 revision / 否→同 hash 复用 / 取消→不发起」；批量整批一次、单条同语义；门闸与 requestId 幂等保留；Migration 去掉 code-date-hash UNIQUE。

**状态：** 已完成（代码未 commit）  
**Spec：** [`../specs/2026-08-10-structure-review-always-call-model-design.md`](../specs/2026-08-10-structure-review-always-call-model-design.md)

**Architecture:** Renderer 用 workbench 快照判定「可复用」（`structureReview` 存在、`!stale`、`source==='model'`）。有可复用则弹一次 Modal；IPC 传整批/单条 `forceModelRefresh?: boolean`。Service：requestId 幂等优先；`force!==true` 时同 hash early-bind；`force===true` 跳过 early-bind，过门闸后调模型并以 `forceNewRevision` 强制 INSERT。Repository 同 hash 多行取最新；Gate 仍 G1。

**Tech Stack:** Electron IPC、SQLite Migration、React、Vitest

## Global Constraints

- 方案 A only；不做会话记住、不做逐股弹窗、不改五枚举/`factsHash`/讨论桥/`trendState`
- `forceModelRefresh` 不能推翻确定性门闸
- requestId 幂等优先于 force
- Gate 落库 G1；无新 npm 依赖
- 不 commit（本线程未授权）

## File Map

| 文件 | 职责 |
|---|---|
| `electron/main/database/db.ts` | Migration 147：DROP UNIQUE `idx_trend_structure_review_revisions_code_date_hash`，建非唯一同名索引 |
| `electron/main/database/trendStructureReviewRepository.ts` | `forceNewRevision`；lookup 多行取最新 |
| `electron/main/services/trendStructureReviewService.ts` | `forceModelRefresh` 跳过同 hash early return；门闸优先 |
| `electron/main/ipc/trendHandlers.ts` | 单条/批量解析 `forceModelRefresh` |
| `electron/preload/index.ts` | preload 入参类型 |
| `src/components/TrendWatcher/reusableModelReview.ts` | 可复用判定纯函数 |
| `src/components/TrendWatcher/TrendForceModelConfirmDialog.tsx` | 是/否/取消 Modal |
| `src/components/TrendWatcher/TrendDashboard.tsx` | 批量+单条确认流 |
| `src/components/TrendWatcher/README.md` | 行为说明 |
| `tests/unit/trendStructureReview.service.test.ts` | force / 非 force / 幂等 / 门闸 |
| `tests/unit/trendStructureReview.repository.test.ts` | 同 hash 多 revision + migration |
| `tests/unit/reusableModelReview.test.ts` | 可复用判定 |
| `tests/unit/trendReview.handlers.test.ts` | 批量透传 force |

### Task 1: Migration + Repository forceNewRevision

- [x] Migration 147 DROP UNIQUE → non-unique index
- [x] `getTrendStructureReviewByCodeDateFactsHash`：`ORDER BY created_at DESC, id DESC LIMIT 1`
- [x] `SaveTrendStructureReviewInput.forceNewRevision?: boolean`；true 时跳过 sameFacts bind
- [x] 单测：同 hash 两次 force 写入 → 两 revision，projection 指向最新；非 force 仍 bind

### Task 2: Service + IPC + preload

- [x] `ReviewStructureInput.forceModelRefresh?: boolean`
- [x] requestId 重放优先；`force!==true` 同 hash early bind；`force===true` 跳过 early bind
- [x] 门闸不足仍本地 gate、不调 LLM；模型成功 `forceNewRevision: true`
- [x] Batch/single validate 接受可选 boolean（缺省 false）
- [x] 单测覆盖矩阵

### Task 3: UI 确认 + README

- [x] `isReusableModelStructureReview` + Dialog（标题/正文/三按钮）
- [x] 批量：N≥1 弹一次；是→`forceModelRefresh:true`；否→false；取消不 IPC；N=0 直跑（去掉旧「确认串行」与 force 对话框冲突）
- [x] 单条可复用同语义；stale/无记录/仅 gate 不弹
- [x] README 更新

### Task 4: 验证 + 检核

- [x] focused vitest 27 PASS + typecheck PASS
- [x] 设计初衷检核；自审 must-fix；**未 commit**

## 设计初衷检核（完成后填写）

| Spec 项 | 结果 | 说明 |
|---|---|---|
| 1 批量含可复用时一次确认，文案含 N | 符合 | `TrendForceModelConfirmDialog`；`reusableCount` 写入正文 |
| 2 「是」→ 过门闸强制模型 + 新 revisionId | 符合 | `forceModelRefresh` + `forceNewRevision`；Migration 147 |
| 3 「否」→ 同 hash bind，不调模型 | 符合 | service early bind；单测覆盖 |
| 4 「取消」→ 不发起 IPC | 符合 | 仅关闭 dialog |
| 5 0 只可复用不弹窗直跑 | 符合 | `requestBatchReview` 直调 `runBatchReview` |
| 6 门闸不足不弹该确认、不调 LLM；force 不推翻门闸 | 符合 | 仅 model+!stale 弹窗；service 门闸优先 |
| 7 同 requestId 重放不弹窗、不二次模型 | 符合 | requestReplay 优先于 force |
| 8 Migration 后同 hash 多模型 revision 合法；stale 仍比事实指纹 | 符合 | 非唯一索引；stale 逻辑未改 |
| 9 单条确认语义与批量一致 | 符合 | 同一 Dialog / force 标志 |
| 10 README + 单测；无荐股语气 | 符合 | README 更新；27 tests；无荐股文案 |

**总评：** 符合方案 A 设计初衷；未 commit，待用户 smoke-test 后按需提交。  
**检核人 / 日期：** Agent / 2026-08-10

**验证命令：**

```powershell
pnpm run test:unit -- tests/unit/trendStructureReview.service.test.ts tests/unit/trendStructureReview.repository.test.ts tests/unit/reusableModelReview.test.ts tests/unit/trendReview.handlers.test.ts
pnpm run typecheck
```

### 自审备注（must-fix only）

- 无会话记住；批量整批一次；force 不推翻门闸；requestId 幂等优先。
- 旧「确认串行复核」条已移除，避免与 force/reuse 对话框叠两层（对齐验收「N=0 不弹窗」）。
- `forceModelRefresh=true` 整批透传对无可复用项无害（无同 hash early-bind 可跳过；门闸仍生效）。
