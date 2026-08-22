# 上游抛光合入 Implementation Plan

> 对照 [`../specs/2026-08-22-port-upstream-polish-design.md`](../specs/2026-08-22-port-upstream-polish-design.md)

**状态：** 已合入 develop（PR #13 → `d68c17e`）  
**分支：** `port/upstream-polish`（已删）

## Tasks

### PR-A 竞价历史收盘价
- [x] `mergeTradeDateClose` + 历史日禁用 rt_k
- [x] 单测 + PR Review 合入

### PR-B 云图 UI
- [x] `HeatmapToolbarSelect` + hover 修复 + 动量文案（port upstream IndustryHeatmap）
- [x] 契约单测/E2E + PR Review 合入

### PR-C beta.4 + Low
- [x] release notes + version bump
- [x] SectorFlow 历史停轮询契约单测
- [x] 诊断公共任务状态（已有 DB job 展示，无需恢复 is*Running）
- [x] PR Review 合入

## 设计初衷检核（完成后填）

| Spec 项 | 结果 | 说明 |
|---|---|---|
| PR-A 竞价投影 | ✅ | mergeTradeDateClose + 历史日跳过 rt_k；契约单测 |
| PR-B 云图 UI | ✅ | upstream IndustryHeatmap + industryHeatmapInteraction 契约 3 绿 |
| PR-C 发版/Low | ✅ | beta.4 release + sectorFlow 停轮询契约；PR #13 合入 `d68c17e` |
