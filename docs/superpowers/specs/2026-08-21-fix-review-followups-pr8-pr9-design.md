# 补审 findings 修复设计

**状态：** 已批准执行（2026-08-21；用户 `/goal` 单独开修复并确保完成）  
**日期：** 2026-08-21  
**来源：** PR [#8](https://github.com/BigApple12138/RT-ResearchFlow/pull/8) / [#9](https://github.com/BigApple12138/RT-ResearchFlow/pull/9) 补审  
**Plan：** [`../plans/2026-08-21-fix-review-followups-pr8-pr9.md`](../plans/2026-08-21-fix-review-followups-pr8-pr9.md)

## 1. 问题

补审列出的可行动项（按优先级）：

| 级别 | 项 |
|---|---|
| High | 竞价价史远端补拉逐票串行 + snapshot 同步 await，冷启动易挂起 IPC |
| High | `failed` 写入 coordinator 后普通 `ensure` 不再重试 |
| Medium | 竞价 Tushare 补拉 `upsertDailyClose` 未标 `dataSource:'tushare'` |
| Medium | `local.length >= 6` 即跳过远端，脏本地可能不修复 |
| Medium | 公共身份合并强制 `list_status='L'`、覆盖 name、provenance 一律 sina |
| Low | Migration 156 / SectorFlow 历史停轮询缺断言 — **本迭代不做**（用户目标聚焦补审可修行为） |

## 2. 目标

1. 价史加载：仅对「本地未 ready」的代码远端补拉；同批并行（有界并发），缩短 snapshot 路径阻塞。  
2. `failed` 在下一次 `ensure` 自动清缓存并重试；`ready` 与已 `remoteAttempted` 的非 failed 终态不重复拉。  
3. Tushare 补拉写入带 `dataSource: 'tushare'`。  
4. 跳过远端的条件改为本地计算结果已 `ready`，而非仅行数 ≥ 6。  
5. 公共合并：已退市（`D`/`P`）不强制改回 `L`；已有 `tushare` provenance 时不覆盖 `name`。  
6. 单测覆盖上述行为；PR Review 后合入 develop。

## 3. 非目标

- 不改 Migration 156 SQL（Low）。  
- 不重写 `fetchDailyForCandidates` 内部 Tushare 限流策略（仅调用侧批处理/并发）。  
- 不做板块资金历史 E2E 新断言（Low）。

## 4. 验收

1. 单测：失败态二次 ensure 会重试；本地未 ready 才远端；并行补拉调用次数/形态符合预期。  
2. 身份合并：退市不翻 L；tushare provenance 保留原名。  
3. `upsertDailyClose` 竞价路径带 tushare（单测或服务层断言）。  
4. PR 经可核查 Review 后合入 develop。

## 5. 修订记录

- 2026-08-21：按补审开写；用户要求单独修复并确保完成。
