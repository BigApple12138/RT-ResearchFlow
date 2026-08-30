# 两阶段日线→分钟（F2）Implementation Plan

> 对照 [`../specs/2026-08-30-strategy-two-phase-design.md`](../specs/2026-08-30-strategy-two-phase-design.md)

**状态：** 已完成

## Tasks

- [x] `runTwoPhaseStrategy` 编排
- [x] UI 扫描模式文案
- [x] 内置两阶段模板
- [x] E2E `strategy-lab-daily-dsl.spec.ts`
- [x] README / 检核

## 设计初衷检核

| Spec 项 | 结果 | 说明 |
|---|---|---|
| 日线→分钟编排 | ✅ | strategyLabRunService |
| UI 诚实标注 | ✅ | StrategyLab.tsx |
| 内置模板 | ✅ | BUILTIN_STRATEGIES |
| 无日线命中不硬跑分钟 | ✅ | early return matches=[] |
| E2E 内置模板与文案 | ✅ | strategy-lab-daily-dsl.spec.ts 绿 |