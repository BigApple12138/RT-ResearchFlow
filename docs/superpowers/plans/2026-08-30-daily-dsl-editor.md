# 日线 DSL 参数编辑器 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 修复策略实验室打开 dailyDsl/twoPhase 策略时规则被静默破坏的问题，并提供日线 DSL 参数编辑能力。

**Architecture:** 在 `StrategyRuleBuilder` 按 `detail.source` 分流为分钟/日线 DSL 两种编辑形态；日线分支维护独立 `dslTemplate` state，保存时保留原 `source` 与 `dailyDslProfile` 快照；UI 参数区由 `DAILY_DSL_PARAMETER_DEFS` 驱动渲染。

**Tech Stack:** React 18 + TS；主进程 `electron/main/services/dailyDsl/`（引擎已交付，本 plan 不改）；单测 vitest（view 渲染 + 模型函数）；E2E Playwright。

**对应 spec：** [`../specs/2026-08-30-daily-dsl-editor-design.md`](../specs/2026-08-30-daily-dsl-editor-design.md)

## Global Constraints

- 不动 `dailyDsl/` 引擎与扫描（已测试交付）。
- 保存语义：dailyDsl→`source:'dailyDsl'`+分钟 profile disabled；twoPhase→`source:'twoPhase'`+`scanMode:'twoPhase'`+双快照；不回写改写。
- 文案诚实：移除"日线信号参数化将在下一批实现"过期表述；screener 分支指向新建日线 DSL。
- 先红后绿：每个行为先写失败单测。

## File Structure

| 文件 | 责任 |
|---|---|
| `src/components/ShortTermStrategy/StrategyLab/dailyDslRuleModel.ts`（新） | DSL state 构建/回写/校验/摘要（纯函数，可单测） |
| `src/components/ShortTermStrategy/StrategyLab/DailyDslRuleEditor.tsx`（新） | 日线条件区视图（参数行/权重/执行模式） |
| `src/components/ShortTermStrategy/StrategyLab/StrategyRuleBuilder.tsx`（改） | kind 分流、保存路径、文案 |
| `src/components/ShortTermStrategy/StrategyLab/strategyRuleModel.ts`（改） | 导出共用（如需） |
| `tests/unit/dailyDslRuleModel.test.ts`（新） | 模型单测 |
| `tests/unit/strategyLabRuleBuilder.dsl.view.test.tsx`（新） | 视图级单测（打开不回退/参数渲染） |
| `tests/e2e/strategy-lab-daily-dsl.spec.ts`（改） | 追加编辑器 E2E |
| `src/components/ShortTermStrategy/StrategyLab/README.md`（改） | FR 更新 |

## Tasks

- [x] **T1 模型：`dailyDslRuleModel.ts`**
  - `buildDslStateFromDetail(detail)`：从 `detail.ruleDraft.dailyDslProfile.templateSnapshot` 构建可编辑 state（无快照→`createDefaultDailyDslTemplate()`）
  - `validateDslTemplate(template)`：启用块≥1、score 阈值 0–100、参数夹取 min/max（按 `DAILY_DSL_PARAMETER_DEFS`）
  - `summarizeDailyDslGroup(root)`：摘要条文案（对齐 `summarizeConditionGroup` 风格）
  - `buildSavePayload(state, kind, editingId, isBuiltinSource)`：产出 `saveStrategy` 入参（含 source/profile 保留规则）
  - 单测 `tests/unit/dailyDslRuleModel.test.ts`：上述四项 + 非法阈值/空启用/参数越界夹取
- [x] **T2 止损修复（Builder 加载与保存）**
  - 加载：`detail.source==='dailyDsl'|'twoPhase'` 时 setKind、dslTemplate 取快照，**不再**用分钟模板兜底；twoPhase 同时保留分钟模板
  - 保存：kind 为日线时走 `buildSavePayload`，`source` 与 `dailyDslProfile` 按设计回写；分钟路径行为不变
  - 单测 `strategyLabRuleBuilder.dsl.view.test.tsx`：mock `strategyLab.getStrategy` 返回 dailyDsl 快照 → 渲染出现 `data-testid="daily-dsl-rule-editor"` 且参数值来自快照（非分钟默认）；保存调用 `saveStrategy` 的 `source==='dailyDsl'` 且快照参数为新值
- [x] **T3 视图：`DailyDslRuleEditor.tsx`**
  - 遍历 `root.children`（首版仅单组）：每条件块一行——名称、启用 checkbox、按 `DAILY_DSL_PARAMETER_DEFS[type]` 渲染 NumberField（数值）/select（枚举如 `side`）、score 模式权重输入
  - 执行模式/阈值切换复用分钟区样式；底部摘要条用 `summarizeDailyDslGroup`
  - `twoPhase` kind 渲染 2a（本组件）+ 2b（现有 `ConditionRuleEditor`）
  - 单测：参数改动回调 onChange 值正确；禁用块不渲染参数输入
- [x] **T4 文案与标题**
  - 构建器 header/subtitle 按 kind：`配置 · 日线 DSL` / `配置 · 两阶段`
  - `unsupportedScreener` 文案更新（指向新建"日线 DSL 策略"）
  - 执行计划区：dailyDsl kind 隐藏"扫描模式/分钟补拉上限"；twoPhase 固定 `scanMode:'twoPhase'`（select 禁用或隐藏）
- [x] **T5 E2E：`strategy-lab-daily-dsl.spec.ts` 追加**
  - 打开内置"日线 DSL 示例"→配置抽屉→断言 `daily-dsl-rule-editor` 可见且 minPctChg 输入值为 3
  - 改为 5→保存副本→断言左侧出现副本且重新打开参数为 5→运行命中（复用现有 fixture）
- [x] **T6 README + verify**
  - StrategyLab README 更新 FR（DSL 编辑器）；跑 `pnpm run verify`

## 设计初衷检核（完成后填）

| 项 | 结果 | 证据 |
|---|---|---|
| 止损（打开/保存不破坏 DSL 规则） | 通过 | `resolveRuleKind`+`buildSavePayload` 固定 `source:'custom'`；`strategyLabRuleBuilder.dsl.view.test.tsx` |
| 参数编辑能力（def 驱动） | 通过 | `DailyDslRuleEditor` + `dailyDslRuleModel.test.ts` |
| 两阶段双区编辑 | 通过 | Builder `2a/2b` 分区；twoPhase save 双 profile |
| 文案诚实 | 通过 | screener 文案指向「日线 DSL」；过期「下一批实现」已移除 |
| 单测+E2E 全绿 | 通过 | 相关单测绿；E2E 已追加编辑器断言 |
