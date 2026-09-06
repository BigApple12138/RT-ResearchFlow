# 竞价价史 partial 远端失败自动重试 Implementation Plan

> 对照 [`../specs/2026-08-30-auction-partial-remote-retry-design.md`](../specs/2026-08-30-auction-partial-remote-retry-design.md)

**状态：** 已完成

## Tasks

- [x] 扩展 `shouldAutoRetryMorningAuctionPriceHistoryEntry` + 单测
- [x] 更新 ShortTermStrategy README FR-275
- [x] 检核

## 设计初衷检核

| Spec 项 | 结果 | 说明 |
|---|---|---|
| REMOTE_BACKFILL_FAILED partial 自动重试 | ✅ | coordinator + 单测 |
| SAMPLE_INSUFFICIENT 不自动重试 | ✅ | 单测断言仅一批 loader |
