# 加股自动补齐公开基本面 Implementation Plan



> **For agentic workers:** 按任务勾选推进；完成后填写文末「设计初衷检核」。



**Goal:** 加股成功且本地 missing 时自动 refresh 公开基本面；抽屉打开 missing 时兜底自动拉。  



**状态：** 已完成  

**Spec：** [`../specs/2026-08-11-auto-prefetch-fundamentals-design.md`](../specs/2026-08-11-auto-prefetch-fundamentals-design.md)  



## Tasks



- [x] Task 1：`prefetchStockFundamentalsIfMissing` 工具函数  

- [x] Task 2：StockChart 加股成功路径接入  

- [x] Task 3：Drawer missing 自动 refresh  

- [x] Task 4：README + 检核  



## 设计初衷检核（完成后填写）



| Spec 项 | 结果 | 说明 |

|---|---|---|

| A 加股后有料 | 通过 | `doFetchStock` / pending `fetchStock` 成功后 `prefetchStockFundamentalsIfMissing`；E2E 加股后请求计数升至 1 |

| B 已有不狂刷 | 通过 | helper 与抽屉均仅在 `missing` 时 refresh；复开抽屉 / 重启后有料不二次联网 |

| C 失败可手点 | 通过 | 抽屉保留「获取/刷新」按钮与 `handleRefresh` |



**总评：** 与加股联网同意图补齐公开基本面，不阻塞图表，失败可手点。  

**检核人 / 日期：** Auto / 2026-08-11  

