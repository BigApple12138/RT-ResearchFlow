# AI 结构复核 rationale / focusPoints 可见展示 Implementation Plan

> **For agentic workers:** 按任务勾选推进；优先 TDD；完成后填写文末「设计初衷检核」。本线程用户未要求 commit —— **不要提交**，仅保留工作区改动。

**Goal:** 方案 A：在 `AiTrendReviewBadge` 旁可见展示 rationale（一行）与 focusPoints（最多 3 条）；用解释块前缀区分 `need_more_data` 的本地门槛短路 vs AI 第二意见；不依赖 hover。

**状态：** 已完成（代码未 commit）  
**Spec：** [`../specs/2026-08-10-ai-structure-review-rationale-visible-design.md`](../specs/2026-08-10-ai-structure-review-rationale-visible-design.md)

**Architecture:** Workbench / IPC DTO 只读附加 `source: 'gate' | 'model'`（由已落库的 `provider`/`model` 派生：二者皆空 → `gate`，否则 → `model`）。`AiTrendReviewBadge` 内渲染徽章 + 解释块；`TrendDashboard` 仅容纳换行布局。徽章短标签两路径均保留「需补数据」。

**Tech Stack:** React 18、TypeScript、Vitest（`renderToStaticMarkup`）、Electron workbench 映射

## Global Constraints

- 方案 A only；不做 B/C（tooltip-only / 补数据向导）
- 不改五枚举词表、revision、`factsHash`、讨论桥接
- 不改写本地 `trendState`；本地「事实完整」与 AI「需补数据」可并存
- 徽章短标签：两路径均「需补数据」；前缀区分来源
- 无新 IPC / Migration / npm 依赖
- 不 commit（本线程未授权）

## File Map

| 文件 | 职责 |
|---|---|
| `electron/main/services/trendStructureReviewTypes.ts` | Summary 增加 `source`；导出派生 helper |
| `electron/main/services/trendWorkbenchService.ts` | `attachStructureReviews` 写入 `source` |
| `electron/main/ipc/trendHandlers.ts` | `TrendReviewDto` / `toTrendReviewDto` 带 `source` |
| `electron/preload/index.ts` | preload DTO 同步 `source` |
| `src/components/TrendWatcher/trendWorkbenchTypes.ts` | Renderer 类型同步 |
| `src/components/TrendWatcher/AiTrendReviewBadge.tsx` | 可见 rationale / focusPoints + 前缀 |
| `src/components/TrendWatcher/TrendDashboard.tsx` | 状态列 `items-start` 容纳解释块 |
| `src/components/TrendWatcher/README.md` | 行为 / FR 补充 |
| `tests/unit/aiTrendReviewBadge.view.test.tsx` | 徽章可见性 / 前缀 / stale |
| `tests/unit/trendWorkbench.review.test.ts` | workbench 下发 `source` |
| `tests/unit/deriveTrendReviewSource.test.ts` | 派生纯函数 |

### Task 1: DTO `source` 派生

- [x] **Step 1:** `deriveTrendReviewSource`
- [x] **Step 2:** workbench / IPC / preload / renderer 类型写入 `source`
- [x] **Step 3:** 单测 gate vs model

### Task 2: AiTrendReviewBadge 可见解释 + Dashboard 布局

- [x] **Step 1–4:** 可见 rationale/focus、前缀、stale 提示、Dashboard `items-start`；单测绿

### Task 3: README + 验证 + 检核

- [x] README 更新
- [x] focused vitest 11 PASS + typecheck PASS
- [x] 自审对照 spec §7；填检核；**未 commit**

## 设计初衷检核（完成后填写）

| Spec 项 | 结果 | 说明 |
|---|---|---|
| 1 不悬停可见 rationale；focus≤3 | 符合 | `AiTrendReviewBadge` 内 `line-clamp-1` rationale + 最多 3 条 focus；testid 齐全 |
| 2 复用徽章表面行为一致 | 符合 | 逻辑集中在组件；Dashboard 仅布局 |
| 3 本地事实完整与 AI 需补数据并存；模型路径不冒充本地缺数 | 符合 | 不改本地摘要；`gate`→「本地门槛：」、`model`→「AI 第二意见：」；徽章均「需补数据」 |
| 4 stale「需重核」且不伪装有效 | 符合 | 灰态「需重核」+「事实已变化，请重新复核」；保留原解释 |
| 5 无向导/backfill/词表/`trendState` 改写 | 符合 | 未引入 |
| 6 README 更新 | 符合 | 双轨语义 + 可见解释 + `source` 派生 |
| 7 单测覆盖可见性与前缀 | 符合 | 11 tests PASS（badge 4 + workbench 3 + handlers 3 + derive 1） |

**总评：** 符合方案 A 设计初衷；未 commit，待用户 smoke-test 后按需提交。  
**检核人 / 日期：** Agent / 2026-08-10

**验证命令：**

```powershell
pnpm run test:unit -- tests/unit/aiTrendReviewBadge.view.test.tsx tests/unit/trendWorkbench.review.test.ts tests/unit/trendReview.handlers.test.ts tests/unit/deriveTrendReviewSource.test.ts
pnpm run typecheck
```

### 自审备注

- §5.2 短标签锁定推荐默认（两路径「需补数据」）。
- `source` 只读派生，不改 revision 不可变语义。
- 行高风险靠 `line-clamp-1` + `max-w-[14rem]` + 紧凑 `text-[10px]` 缓解。
