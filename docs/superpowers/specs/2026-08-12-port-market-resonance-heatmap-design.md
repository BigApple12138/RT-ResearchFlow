# 合入对方市场共振历史与行业云图动量设计

**状态：** 已实现于分支 `port/market-resonance-heatmap-cao`（2026-08-12）  
**日期：** 2026-08-12  
**来源：** [caoritian002-wq/RT-ResearchFlow](https://github.com/caoritian002-wq/RT-ResearchFlow) 分支 `dev`  
**Plan：** [`../plans/2026-08-12-port-market-resonance-heatmap.md`](../plans/2026-08-12-port-market-resonance-heatmap.md)

## 1. 问题

对方仓库相对本仓 `develop` 超前的产品能力：

1. `cb86247` — 市场共振按交易日快照、历史回看、行业下钻  
2. `3a872ab` — 行业云图轻量快照、按需成分、盘后/午休动量恢复  

本仓 `develop` 已有 Agent/MCP 等线，且 Migration 已用到 **151**；对方在旧树上新增 **Migration 136**，不能原样号码合入。

## 2. 目标

- 将上述两提交的能力合入本仓，独立分支管理，不污染当前未提交的 Agent/披露工作区。  
- Migration **改号为下一可用版本（相对 `origin/develop` 为 148）**，向前、幂等。  
- 保留对方意图与测试；冲突处优先保留本仓既有行为；PR 分支不夹带未推送的 Agent 线提交。

## 3. 非目标

- 不重写对方产品设计；不做无关大重构。  
- 不把对方更早的监控源/资讯提醒等批量合入（本次仅这两提交）。  
- 不强制立刻 merge 进 `develop` 默认工作区未提交改动。

## 4. 代码管理策略

1. 主工作区保留当前脏改动不动。  
2. `git worktree`（或等价隔离）基于本仓 `develop` tip（含已提交的 Agent 三连）开分支：`port/market-resonance-heatmap-cao`。  
3. 添加 remote `cao` → `https://github.com/caoritian002-wq/RT-ResearchFlow.git`，fetch `dev`。  
4. 按序 cherry-pick：`cb86247` → `3a872ab`；冲突手工解决；对方 Migration 136 → **本仓 152**（若再冲突递增）。  
5. 跑市场/云图相关单测；通过后在该分支提交（若 cherry-pick 已形成 commit 则保留中文说明补充）。  
6. 主工作区继续原 Agent/披露未提交工作；合入 `develop` 由用户决定（merge/PR）。

## 5. 验收

- 分支上存在共振快照仓库 + 动量恢复服务等对方文件。  
- `db.ts` 无重复 version 136 语义冲突；新 migration ≥152。  
- 相关 `tests/unit/marketResonance*` / `heatmap*` / `marketHeatmap*` 在 Electron ABI 下通过。
