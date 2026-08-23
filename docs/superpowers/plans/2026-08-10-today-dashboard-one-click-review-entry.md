# 今日看板「一键复盘」可见入口 Implementation Plan

> **For agentic workers:** 按任务勾选推进；优先 TDD；完成后填写文末「设计初衷检核」。本线程用户未要求 commit —— **不要提交**，仅保留工作区改动。

**Goal:** 在今日看板指挥区常显「一键复盘」（生成/打开今日复盘），并把「看复盘」「复盘积压」接到既有历史复盘抽屉；组合与全部信号视图均可发现。

**状态：** 已完成（代码未 commit）  
**Spec：** [`../specs/2026-08-10-today-dashboard-one-click-review-entry-design.md`](../specs/2026-08-10-today-dashboard-one-click-review-entry-design.md)

**Architecture:** 仅接线 `DecisionCenter` 既有 `handleGenerateDailyReview` / `setReviewReportHistoryOpen`。主 CTA 移出 `isPortfolioView` 守卫并改文案；`CommandMetric` 支持可选 `onClick`（仅「复盘积压」传入）；`PortfolioRiskMiniPanel` 在建议值为「看复盘」时渲染可点控件。无新 IPC/Migration/引擎/左导航。

**Tech Stack:** React、TypeScript、Vitest（source contract + renderToStaticMarkup 视图断言）

## Global Constraints

- 方案 3 only：一键 = 今日复盘生成；看复盘/积压 = 历史复盘抽屉
- 主可见文案「一键复盘」；**主 testid 锁定** `decision-generate-daily-review`（兼容既有 E2E）
- 「看复盘」testid：`decision-suggest-open-review`；「复盘积压」testid：`decision-metric-review-backlog`
- 组合视图下周报 / 历史复盘 / 判断记录仍仅组合可见
- 「补成本价」不得打开历史复盘
- 无新 IPC、Migration、npm 依赖、左侧导航项
- 不 commit（本线程未授权）

## Locked copy / testid

| 入口 | 可见文案 | data-testid | 行为 |
|---|---|---|---|
| 主 CTA | 一键复盘 | `decision-generate-daily-review` | `handleGenerateDailyReview` |
| 建议入口（看复盘） | 看复盘 | `decision-suggest-open-review` | `setReviewReportHistoryOpen(true)` |
| 关键指标 | 复盘积压 | `decision-metric-review-backlog` | 同上 |
| 组合次级 | 历史复盘 | `decision-review-report-history` | 同上（已有） |

## File Map

| 文件 | 职责 |
|---|---|
| `src/components/DecisionCenter/DecisionCenter.tsx` | 一键复盘常显；CommandMetric onClick；看复盘链接；积压可点 |
| `src/components/DecisionCenter/README.md` | FR 行为说明更新 |
| `tests/unit/decisionOneClickReview.contract.test.ts` | 接线契约：可见性、文案、testid、handler 绑定 |
| `tests/unit/decisionOneClickReview.view.test.tsx` | CommandMetric / PortfolioRiskMiniPanel 可点语义静态渲染 |

### Task 1: 失败契约单测（TDD red）

- [x] 写契约测试与视图测试
- [x] 跑测确认失败（缺常显文案 / 导出 / README）

### Task 2: 实现接线（TDD green）

- [x] 指挥区常显「一键复盘」，替换组合内「生成今日复盘」
- [x] CommandMetric 可选 onClick；仅复盘积压可点 → 历史
- [x] PortfolioRiskMiniPanel「看复盘」可点；「补成本价」静态
- [x] export CommandMetric / PortfolioRiskMiniPanel；视图测 PASS

### Task 3: README + 验收

- [x] README 更新入口行为
- [x] focused vitest 7 PASS + typecheck PASS
- [x] 设计初衷检核 + 自审 must-fix；**未 commit**

## 设计初衷检核（完成后填写）

| Spec 项 | 结果 | 说明 |
|---|---|---|
| 1 全部信号视图可见一键复盘 | 符合 | CTA 在 `isPortfolioView &&` 守卫外；契约测断言 |
| 2 一键复盘 = 今日复盘同源 | 符合 | 仍调 `handleGenerateDailyReview`；testid 保留兼容 E2E |
| 3 看复盘可点→历史；补成本价不误开 | 符合 | `decision-suggest-open-review`；缺成本价时无该 testid |
| 4 复盘积压可点→同一历史；其它指标只读 | 符合 | 仅 label===复盘积压 注入 onClick；视图测 button vs div |
| 5 无新引擎/IPC/Migration/左导航 | 符合 | 仅 DecisionCenter UI 接线 |
| 6 README 更新入口行为 | 符合 | FR-233 段写明一键/看复盘/积压 |
| 7 单测覆盖入口 | 符合 | contract 4 + view 3 = 7 PASS |

**总评：** 符合方案 3 设计初衷；未 commit，待用户 smoke-test 后按需提交。  
**检核人 / 日期：** Agent / 2026-08-10

**验证命令：**

```powershell
pnpm run test:unit -- tests/unit/decisionOneClickReview.contract.test.ts tests/unit/decisionOneClickReview.view.test.tsx
pnpm run typecheck
```

### 自审备注（must-fix only）

- 主 testid 锁定 `decision-generate-daily-review`，避免 E2E `user-journey` 断裂。
- 「补成本价」路径不得渲染 `decision-suggest-open-review`。
- 周报/历史/判断仍仅组合视图；市场视图不露出周报。
- 无新 IPC / Migration / 左导航 / 复盘引擎。
