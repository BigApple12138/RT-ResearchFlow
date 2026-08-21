# 合入 upstream 零 Key 公共日线设计

**状态：** 已完成（2026-08-21；对照 plan 设计初衷检核通过）  
**日期：** 2026-08-21  
**来源：** [caoritian002-wq/RT-ResearchFlow](https://github.com/caoritian002-wq/RT-ResearchFlow) `dev` @ `ed3229e`  
**Plan：** [`../plans/2026-08-21-port-public-zero-key-daily.md`](../plans/2026-08-21-port-public-zero-key-daily.md)  
**先例：** [`2026-08-12-port-market-resonance-heatmap-design.md`](./2026-08-12-port-market-resonance-heatmap-design.md)

## 1. 问题

本仓冷启动与一键初始化仍硬依赖 Tushare：无 Token 时证券池/全市场历史日线失败，引导与今日看板空态整段卡住。upstream beta.4 已提供公共证券池 + 多源历史日线 + 限流治理 + 可续跑补采，使零 Key 用户可建立本地日线底座。

本仓 Migration 已用到 **155**；上游 FR-273 使用 **137**（与本仓讨论压缩 137 冲突），不能原样号码合入。

## 2. 目标

1. 无 Tushare 或权限不足时，可用公共源完成 `stock_basic_cache` + `daily_close_cache` 初始化（近约 2 年口径与现有初始化任务对齐）。  
2. Tushare 可用时仍优先原路径；公共源为受控降级，不冒充实时交易行情。  
3. 请求：全局单并发、间隔、批次暂停、失败熔断、冷却后续跑；产品文案「通常约 2 小时」量级。  
4. 来源可追溯（provenance / data_source）；本地已完整则跳过联网。  
5. Onboarding / App：无 Token 可 quick-start，不整段卡死。  
6. 硬边界：本地优先、不荐股、不自动交易、Renderer 不持凭据、窄 IPC。

## 3. 非目标

- 不 merge `upstream/dev` 整支；禁止整 commit cherry-pick `ed3229e`。  
- 不合入 `d562051` 板块资金历史 / 竞价价史协调器。  
- 不整包合入 `IndustryHeatmap` 大改（云图 UX 另开 port）。  
- 本迭代不升 `package.json` 到 beta.4、不做安装包发版工程。  
- 不重写 Agent / Context Engine / Cursor 会话面。

## 4. 方案

**采用：模块拆 port + Migration 重编号为 156**（延续共振合入时 136→151 的 remap 做法）。

| Phase | 内容 |
|---|---|
| A | Schema 156 + repositories |
| B | Governor + scripts/lib transformers |
| C | 公共证券池 + scheduler stockBasic 无 Token 分支 |
| D | 公共历史日线/快照 + diagnostics/historical 软降级 |
| E | Onboarding/App 任务语义 + README FR |
| F | 单测/E2E、检核、PR |

## 5. 验收

1. 全新库、无 Tushare：一键初始化可跑通证券池 + 历史日线（可中断后续跑）。  
2. 有 Tushare：行为与现网一致，不强制公共源。  
3. Migration 156 空库/旧库幂等；无 version 冲突。  
4. 诊断可见公共同步状态/失败可重试；不泄露凭据。  
5. 相关单测绿；Onboarding/Diagnostics README 与 plan 检核已更新。

## 6. 风险

| 风险 | 缓解 |
|---|---|
| 全市场补采耗时长 | 可续跑 + UI 诚实预估 |
| 公共源限流/字段漂移 | governor + 熔断 + provenance |
| `daily_close_cache` 列冲突 | schema 审阅后合并 |
| 合入面大 | Phase 提交，单层可回滚 |

## 7. 修订记录

- 2026-08-21：对齐 upstream `ed3229e` / beta.4；用户批准完整实现并验收。
