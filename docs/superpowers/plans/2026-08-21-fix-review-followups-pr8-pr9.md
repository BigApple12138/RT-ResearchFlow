# 补审 findings 修复 Implementation Plan

> 对照 [`../specs/2026-08-21-fix-review-followups-pr8-pr9-design.md`](../specs/2026-08-21-fix-review-followups-pr8-pr9-design.md)

**状态：** 已合入 develop（PR #11 → `2935e25`）  
**分支：** `fix/review-followups-pr8-pr9`（已删）

## Tasks

- [x] 价史 loader：ready 才跳过远端；有界并行补拉；失败态 ensure 重试
- [x] morningAuctionService：`upsertDailyClose(..., { dataSource: 'tushare' })`
- [x] mergePublicStockIdentities：退市不翻 L；tushare 名不覆盖
- [x] 单测 + PR Review 合入

## 设计初衷检核（完成后填）

| Spec 项 | 结果 | 说明 |
|---|---|---|
| §2.1–2.2 并行与失败重试 | ✅ | 有界并发=4；failed 下次 ensure 清缓存重试 |
| §2.3–2.4 dataSource / ready 门槛 | ✅ | 契约单测 + 脏样本仍远端 |
| §2.5 身份合并 | ✅ | D/P 不翻 L；tushare 名/provenance 保留 |
| §2.6 单测 + 合入 | ✅ | 相关单测 17 绿；PR #11 Review 后合入 `2935e25` |
