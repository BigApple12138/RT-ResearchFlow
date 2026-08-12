# 合入市场共振历史与行业云图动量 Implementation Plan

> **For agentic workers:** 在隔离 worktree/分支执行；勿搅乱主工作区未提交改动。

**Goal:** 将对方 `cb86247` + `3a872ab` 合入本仓，Migration 改号，独立分支管理。

**Architecture:** worktree @ `develop` tip → cherry-pick 两提交 → 解决冲突并将 Migration 136 映射为 152。

**状态：** 已合入分支 `port/market-resonance-heatmap-cao`（待 merge 进 develop）  
**Spec：** [`../specs/2026-08-12-port-market-resonance-heatmap-design.md`](../specs/2026-08-12-port-market-resonance-heatmap-design.md)

## 分支与提交

- Worktree：`E:/代码库/git/RT-ResearchFlow-port-market`
- Branch：`port/market-resonance-heatmap-cao`（基于本仓 `develop` @ `07d2736`）
- Remote 参考：`cao` → `https://github.com/caoritian002-wq/RT-ResearchFlow.git`（`cao/dev`）
- Commits：
  1. `3f1123a` feat: 完善市场共振历史回看与行业下钻（含 Migration **152**）
  2. `faba3ed` feat: 完善行业云图按需刷新与盘后动量恢复

## Tasks

### Task 1：隔离分支 + fetch — [x]
### Task 2：cherry-pick + Migration 改号 — [x]
### Task 3：验证 — [x]（见下；全量 ABI 建议在 merge 后主树 `npm run test:unit`）

部分单测在 worktree 无完整 `node_modules` 时已用父仓 Electron+NODE_PATH 抽样通过：`heatmapMomentum` / `heatmapFailure` / `marketHeatmapMomentumRecovery` / `marketResonanceIndustry*` / `marketResonanceHistorical`。

## 设计初衷检核

| Spec 项 | 结果 | 说明 |
|---|---|---|
| 两提交能力合入 | 通过 | 两 feat commit 在分支上 |
| Migration 改号不冲突 | 通过 | 对方 136 → 本仓 **152**（避开 136–150；并为主工作区未提交的网关 151 留空） |
| 主工作区脏改动未破坏 | 通过 | 独立 worktree |
| 独立分支可审阅 | 通过 | `port/market-resonance-heatmap-cao` |

## 合并注意

- 主工作区未提交的「联网搜索网关」若也新增 Migration，请继续用 **151**（或与 152 错开后统一）。
- 合入 `develop`：`git checkout develop && git merge port/market-resonance-heatmap-cao`（或 PR）。
- 冲突热点：`db.ts`、`appStore.ts` 导入、`preload`/`App.tsx`（cherry-pick 时已处理）。

## 修订记录

- 2026-08-12：用户要求直接搬入并做好代码管理；worktree cherry-pick 完成。
