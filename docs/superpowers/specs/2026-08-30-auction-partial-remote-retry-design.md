# 竞价价史 partial（远端失败）自动重试设计（B2）

**状态：** 已批准执行（总控 §4.2 B2；与 failed 自动重试对称）  
**日期：** 2026-08-30  
**挂靠：** [`2026-08-30-gap-closure-program-design.md`](./2026-08-30-gap-closure-program-design.md)  
**Plan：** [`../plans/2026-08-30-auction-partial-remote-retry.md`](../plans/2026-08-30-auction-partial-remote-retry.md)

## 1. 问题

`MorningAuctionPriceHistoryCoordinator.ensure` 已对 `state === 'failed'` 每次清缓存自动重试；  
但 `remoteFailed` 导致的 **`partial` + `REMOTE_BACKFILL_FAILED`**（本地已有部分涨跌、远端补拉失败）会留在缓存，普通 `ensure` 不再请求，直到显式 `retryUnresolved`。

## 2. 目标

- 普通 `ensure` 对 `partial && reason === 'REMOTE_BACKFILL_FAILED'` 与 `failed` 同等：删除缓存条目并重新加载。  
- **不**自动重试 `partial && SAMPLE_INSUFFICIENT`（样本不足，非远端失败）。  
- 单测覆盖：远端失败 partial 第二次 ensure 会再调 loader。

## 3. 非目标

- 不改冷启动大批量性能（属 C1）。  
- 不改 UI。  
- 不加无限退避策略（与现有 failed 行为一致：每次 ensure 可再试）。

## 4. 实现

在 `ensure` 清 `failed` 的循环中，同时清除满足 `shouldAutoRetryEntry(entry)` 的条目：

```ts
function shouldAutoRetryEntry(entry: MorningAuctionPriceHistoryEntry | undefined): boolean {
  if (!entry) return false
  if (entry.state === 'failed') return true
  return entry.state === 'partial' && entry.reason === 'REMOTE_BACKFILL_FAILED'
}
```

## 5. 验收

- 单测：首轮 partial+REMOTE_BACKFILL_FAILED，次轮 ensure 再次进入 loader 并可变为 ready。  
- SAMPLE_INSUFFICIENT partial 次轮 ensure **不**自动重载（除非 retryUnresolved）。
