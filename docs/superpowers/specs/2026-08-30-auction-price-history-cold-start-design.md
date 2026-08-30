# 竞价价史冷启动性能（C1）设计

**状态：** 已完成（2026-08-30 实现：本地首包 + 后台远端）  
**日期：** 2026-08-30  
**挂靠：** [`2026-08-30-gap-closure-program-design.md`](./2026-08-30-gap-closure-program-design.md) §4.3 C1  
**背景：** `2026-08-21-fix-review-followups` 已完成「未 ready 才远端 + 并发 4 + failed 重试」；beta.5 已知限制仍写「大批量候选冷启动可能较长阻塞」。

## 1. 问题

`getOrCreateMorningAuctionSnapshot` **同步 await** `mergePriceHistory` → `ensure` → 全部候选的远端补拉。本地全命中很快；冷启动 / 弱缓存时候选数百只 × Tushare 串行感（即便并发 4）仍会拖住 snapshot IPC。题材列 `mergeConceptData` 已是 `void` 不阻塞，价史路径尚未对齐。

## 2. 目标

1. Snapshot **首包**不因远端价史补拉长时间挂起：先本地计算结果回传（含 coverage / 可解释 state）。  
2. 远端补拉在后台继续；完成后写回 `cachedSnapshot` 并 **push** 既有或新增的窄事件，Renderer 刷新价史列与 coverage（不整页重载）。  
3. 显式 refresh / `retryUnresolved` 仍可 await 完整结果（用户主动等待可接受）。  
4. 单测：本地路径不调 remote；后台补拉完成后 coverage 上升；不引入假涨跌。

## 3. 非目标

- 不改 Tushare `daily` 按票限流内核。  
- 不提高无上限并发（可评估 4→8，非本设计主路径）。  
- 不解决 macOS/签名。

## 4. 方案（推荐）

对齐 `mergeConceptData`：

```ts
// getOrCreateMorningAuctionSnapshot
await mergePriceHistoryLocalFirst(cachedSnapshot, tradeDate) // 仅本地 / 已缓存 coordinator 条目
void mergePriceHistoryRemoteBackground(cachedSnapshot, tradeDate) // ensure 缺项 + push
```

- `mergePriceHistoryLocalFirst`：对已在 coordinator 的条目直接 apply；缺失项用 `loadMorningAuctionPriceHistoryEntries(..., { fetchRemote: undefined })` 或 ensure 前先 seed 本地。  
- Background：完整 `ensure`（含 remote）；成功后 `webContents.send('morningAuction:priceHistoryUpdated', { tradeDate, coverage })`（名称以实现时 preload 为准）。  
- Renderer：`MorningAuction` 订阅事件，合并 coverage / 行内 priceHistory。

## 5. 验收

1. 冷启动模拟（全 miss 远端慢）：snapshot IPC 在本地阶段返回，UI 先有候选与「补拉中」类 coverage。  
2. 后台完成后 coverage / 3·5 日列更新。  
3. 无假涨跌；既有 price-history E2E 在夹具本地就绪时仍绿。  
4. README / 已知限制可改为「远端补拉不阻塞首屏」或降级表述。

## 6. 修订记录

- 2026-08-30：起草。
