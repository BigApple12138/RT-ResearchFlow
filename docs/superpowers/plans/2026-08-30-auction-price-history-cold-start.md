# 竞价价史冷启动性能 Implementation Plan

> 对照 [`../specs/2026-08-30-auction-price-history-cold-start-design.md`](../specs/2026-08-30-auction-price-history-cold-start-design.md)

**状态：** 已完成

## Tasks

- [x] `mergePriceHistory`：get 路径本地首包 + 后台远端；refresh 仍 await 完整
- [x] MorningAuction：价史未齐时 5s 再 get（对齐题材）
- [x] 契约单测 + coordinator 回归
- [x] README / design 检核

## 设计初衷检核

| Spec 项 | 结果 | 说明 |
|---|---|---|
| 首包不阻塞远端 | ✅ | `createPriceHistoryLoadDependencies(true)` + void background |
| 后台补齐可刷新 | ✅ | in-place `cachedSnapshot` + UI 5s get |
| refresh 可完整 await | ✅ | `retryUnresolved` → awaitRemote |
| 无假涨跌 | ✅ | 仍走既有 calculate/entry state |
| 单测 | ✅ | cold-start contract + coordinator 14 |
