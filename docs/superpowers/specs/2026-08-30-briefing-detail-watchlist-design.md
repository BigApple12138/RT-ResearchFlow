# 资讯详情「+观察池」设计（B1）

**状态：** 已批准执行（承接已批准候选桥接 P0 资讯入口遗留；2026-08-30 实现中）  
**日期：** 2026-08-30  
**挂靠：** [`2026-08-30-gap-closure-program-design.md`](./2026-08-30-gap-closure-program-design.md) §4.2 B1  
**前序：** [`2026-08-12-watchlist-candidate-bridge-design.md`](./2026-08-12-watchlist-candidate-bridge-design.md)（P0 资讯入口刻意留作后续）  
**Plan：** 批准后写 [`../plans/2026-08-30-briefing-detail-watchlist.md`](../plans/2026-08-30-briefing-detail-watchlist.md)

## 1. 问题

候选桥接已在走势图缓存行、AI 候选侧栏、趋势雷达「建议入池」落地；**资讯详情页仍无股票映射区与「+观察池」**。用户在读资讯时无法就地入池，需绕到 AI 分析或走势图。

`Briefing` 表本身无 `stockCodes` 字段；股票线索来自标题/摘要/正文中的代码，或同 `briefingId` 的 AI 会话（`promptSent` 的 `STOCK_CODES` / 结构化候选）。

## 2. 目标

1. 在 `BriefingDetail` 增加「相关股票」映射区：列出可识别的 A 股代码（及可得名称）。  
2. 每行提供 `+观察池` / 已在池灰态，行为对齐 `AIAnalysis` 候选行（`trend:addStocks` + `listTrackedTsCodes`）。  
3. 可选：映射区顶部「全部加入观察池」（仅未在池项，带数量，确认后一次 IPC）。  
4. **不自动入池**；无荐股文案。  
5. 更新 `BriefingDetail/README.md` 与必要时 `TrendWatcher/README.md` FR 一句。

## 3. 非目标

- 不新建 briefing↔stock 表；不做资讯解析管道改造。  
- 不把「建议入池」逻辑搬进详情页。  
- 不改 AI `analyze` 流程；不强制先 AI 分析才能见映射区。  
- 不做批量跨多条资讯入池。

## 4. 股票来源（优先级合并去重）

| 优先级 | 来源 | 规则 |
|---|---|---|
| 1 | 同 `briefingId` 最新成功 AI 会话 | 解析 `promptSent` 的 `STOCK_CODES`；若有 `structuredResult.candidateStocks` 则合并 code/name |
| 2 | 标题 + 摘要 + 已加载正文纯文本 | 匹配六位 A 股数字代码；用现有 `normalizeAshareTsCode`；名称可经本地 `stock_basic` / 缓存查询，缺失则显示代码 |

合并键：`tsCode`。单条资讯最多展示 **12** 只（超出折叠「还有 N 只」），避免脏正文刷屏。

无任何代码时：映射区不渲染（不占空态噪音）。

## 5. IPC / API

- **复用**：`window.api.trend.addStocks`、`window.api.trend.listTrackedTsCodes`（或与 AIAnalysis 相同的 workbench/tracked 查询）。  
- **可选只读**：若已有「按 briefingId 取 session」API 则复用；否则 Renderer 用现有 `ai.listSessions` / `getSession` 过滤 `briefingId`，避免新 IPC。优先不新增主进程接口。  
- 名称补全：若 preload 已有批量查基础信息则用；否则先显示代码，入池时 `stockName` 可回退为 tsCode（与 AI 候选一致）。

## 6. UI

- 位置：详情操作区（AI 分析 / 产业链）下方、正文上方或紧贴摘要后。  
- `data-testid="briefing-detail-related-stocks"`  
- 行按钮：`data-testid={briefing-add-to-watchlist-${code}}`  
- 已在池：`已在池` 灰态徽章（对齐 AI 候选）。  
- 加入中：禁用 +「加入中…」；toast 成功/失败。

## 7. 测试

| 类型 | 内容 |
|---|---|
| 单元 | 纯函数：从 title/summary/html 抽代码；合并 session STOCK_CODES；去重与 12 上限 |
| 组件契约（可选） | 有代码时渲染按钮；已在池无按钮；点击触发 addStocks mock |
| E2E | 非必须本波次；若夹具成本低可加一条 BriefingDetail 入池 |

禁止真实联网 / 付费 AI。

## 8. 验收

1. 含六位代码的资讯详情出现映射区与 `+观察池`。  
2. 点击后观察池可见该股；已在池/持仓灰态不可重复加。  
3. 无代码资讯不出现空映射区。  
4. 与 AI 候选入池同源 IPC，智能分类行为一致。  
5. README 已更新。

## 9. 风险

| 风险 | 缓解 |
|---|---|
| 正文误匹配数字 | 仅六位 + normalize；上限 12；优先 session 代码 |
| 详情 HTML 未加载完代码偏少 | 正文到达后重算映射列表 |
| 与持仓相关命中词混淆 | 不用 `relevanceHits` 当股票代码 |

## 10. 修订记录

- 2026-08-30：起草，补齐候选桥接 P0 资讯入口。
