# 日线 DSL 参数编辑器（策略实验室）

**状态：** 已完成
**日期：** 2026-08-30
**承接：** [`2026-08-30-daily-dsl-design.md`](./2026-08-30-daily-dsl-design.md)（F1 引擎已交付）；[`2026-08-30-strategy-two-phase-design.md`](./2026-08-30-strategy-two-phase-design.md)（F2 组合）
**对应缺口：** 代码分析 P1——F1 交付后编辑器侧未跟进：内置日线策略可跑，但用户无法改参数；且 `StrategyRuleBuilder` 打开 `dailyDsl`/`twoPhase` 策略时把规则当分钟模板回退，保存时 `source` 被改写为 `conditionBlocks`，DSL 快照丢失（数据破坏性缺陷，本设计优先修复）。

## 1. 问题

1. **编辑器缺位：** `StrategyRuleBuilder` 只支持分钟条件编排。打开 `source: 'dailyDsl' | 'twoPhase'` 的策略时，加载逻辑找不到 `conditionBlocksProfile.templateSnapshot` 就用 `createDefaultMinuteTemplate()` 兜底，用户看到的"策略信息/筛选范围/分钟条件"全是默认分钟模板——与该策略真实规则（`dailyDslProfile.templateSnapshot`）完全脱节。
2. **保存破坏规则：** 保存硬编码 `source: 'conditionBlocks'`，且 `ruleDraft` 不回写 `dailyDslProfile`。一个 `dailyDsl` 策略被打开再保存后，DSL 快照被丢弃、类型被改写，运行时退化为分钟策略——**静默破坏用户规则**。
3. **文案过期：** `unsupportedScreener` 分支的"个性选股仍是固定日线白盒……日线信号参数化和真正两阶段组合将在下一批实现"与 F1/F2 已交付的现状矛盾。
4. **参数不可调：** `DAILY_DSL_PARAMETER_DEFS`（回看天数/累计涨跌幅/均线周期/量比/换手率等）只有主进程求值器消费，UI 无入口。

## 2. 目标

1. **止损：** `dailyDsl`/`twoPhase` 策略在构建器中打开时，**不允许**再以分钟模板回退，也不允许把 `source`/`dailyDslProfile` 改写破坏；打开即保留原规则类型。
2. **编辑能力：** 提供日线 DSL 参数编辑区（复用现有 `NumberField`/`TextField` 模式），可编辑：每个条件块的数值参数（按 `DAILY_DSL_PARAMETER_DEFS`）、启用/禁用条件、条件权重、执行模式（严格/评分）、评分阈值。
3. **两阶段：** `twoPhase` 策略可同时编辑日线参数与分钟条件（分钟沿用现有 `ConditionRuleEditor`）。
4. **文案诚实：** 移除/改写过期提示；日线与两阶段策略可正常配置、保存、运行。
5. **测试：** 单测覆盖"打开不回退、保存不改写 source/profile、参数回写快照"；E2E 覆盖"打开内置日线模板改参数→保存副本→运行命中"。

## 3. 非目标

- 不新增 DSL 条件类型（引擎四类已够首版）。
- 不做拖拽/图形化 DSL 编排器（延期 backlog）。
- 不改求值引擎与扫描语义（引擎与扫描已在 F1/F2 交付并测试）。
- 不改 `screener`（白盒日线）策略形态——它仍显示固定说明，但文案更新为现状（指向新建"日线 DSL"模板）。

## 4. 方案

### 4.1 数据流

构建器新增 `kind` 判定：打开策略时按 `detail.source`（`conditionBlocks` → 分钟；`dailyDsl`/`twoPhase` → 日线 DSL 编辑）分流。日线分支维护独立 state（`dslTemplate: DailyDslTemplate`），不与分钟 `template` state 混用。保存时：

- `dailyDsl` 策略 → `source: 'dailyDsl'`、`scanMode: 'complete'`（运行时按 source 分派，不依赖 scanMode）、`ruleDraft.dailyDslProfile.templateSnapshot = dslTemplate`，分钟 profile 置 disabled。
- `twoPhase` 策略 → `source: 'twoPhase'`、`scanMode: 'twoPhase'`，日线快照与分钟快照都回写，双 profile enabled。
- 内置模板保存为副本语义不变（`useAsNew`），但不再改写 source。

### 4.2 UI

在构建器内按 kind 渲染：

- 共用：策略信息、筛选范围（1）、执行计划（3，两阶段固定 scanMode，日线策略隐藏"扫描模式/分钟补拉上限"）。
- 日线条件区（2）：遍历 `dslTemplate.root`（首版引擎模板为单组 AND），每个条件块渲染一行：条件名 + 启用 checkbox + 启用参数的 NumberField（按 `DAILY_DSL_PARAMETER_DEFS[type]`，`side` 这类枚举参数用 select）+ 权重输入（score 模式）；执行模式/阈值切换沿用分钟区交互样式；底部沿用"当前规则"摘要条（写一个 `summarizeDailyDslGroup`）。
- `twoPhase`：先渲染"2a. 日线预筛"区（同上），再渲染"2b. 分钟确认"区（现有 `ConditionRuleEditor`）。
- `unsupportedScreener` 文案改为：个性选股为固定日线白盒，如需可组合日线条件请新建"日线 DSL"策略。

### 4.3 校验与持久化

- 校验沿用现有 `validationErrors` 模式：名称、股票池、日期格式复用；新增：启用条件至少一个（`root` 内 enabled 块数 ≥ 1）、score 模式阈值 0–100、参数值夹取到 def 的 min/max。
- 主进程 `validateStrategyLabRuleDraft` 已校验 `dailyDslProfile`；本设计不放宽。
- 权重只影响评分模式排序，不写死必填；非 enabled 块不渲染参数输入。

## 5. 验收标准

1. 打开内置"日线 DSL 示例"或"两阶段"策略：构建器显示日线条件区（参数来自该策略快照，非分钟模板兜底）；标题按 kind 显示"配置 · 日线 DSL"。
2. 修改任一参数（如 `minPctChg` 3→5）→ 保存副本 → 重新打开：参数保留；`strategy_lab_strategies.source` 仍为 `dailyDsl`（不回退）；`ruleDraftJson.dailyDslProfile.templateSnapshot` 参数为新值。
3. 运行保存后的策略：`summary.engine === 'dailyDsl'`（或 `twoPhase`），行为与快照参数一致。
4. 过期文案不再出现；screener 分支文案指向"新建日线 DSL 策略"。
5. 单测：加载回退修复、保存不改写、参数回写快照、权重/阈值校验；E2E：打开→改参数→保存副本→运行命中。
6. `verify` 全绿；README（StrategyLab）与 FR 更新。
