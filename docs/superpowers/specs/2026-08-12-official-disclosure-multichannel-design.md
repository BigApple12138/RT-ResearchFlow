# 官方披露 / 财务多方取数与配置探测设计

**状态：** 已实现（2026-08-12）  
**日期：** 2026-08-12  
**Plan：** [`../plans/2026-08-12-official-disclosure-multichannel.md`](../plans/2026-08-12-official-disclosure-multichannel.md)

## 1. 问题

1. 深度研究 `official.disclosure_search` 把十来个 `site:` 域拼进**一次**联网查询；外部 MCP（如豆包）常返回 `isError`，工具整单失败。
2. `callExternalMcpTool` 遇 `isError` 只报「MCP tool 返回 isError」，**不透出** MCP `content` 正文，账本无法诊断。
3. 用户已配置 **Tushare**（数据源）与 **本应用联网搜索**，但官方披露搜索只走网页网关；`company.fundamentals_refresh` 只走东财公开接口，未按配置多方取数。

## 2. 目标

- **探测优先**：工具执行前本地探测「网页搜索 / Tushare / 股票主体」是否可用；结果写入 envelope（`probes` / `sources`），可审计。
- **多方取数（方案 C）**：
  - `official.disclosure_search`：短 `site:` 网页检索（可降级）+（有 Tushare + 股票）结构化预告/快报等；任一侧成功则工具不整单失败。
  - `company.fundamentals_refresh`：有 Tushare 优先结构化财务；失败或未配置再降级东财。
- **错误可读**：MCP `isError` 时 message 含 content 摘要。
- **诚实边界**：Tushare 表行是结构化事实，**不是**可抓正文的披露 URL；证据门禁「披露正文」仍依赖网页候选 + `official.disclosure_document`（不变）。

## 3. 非目标

- 不新建配置页、Migration、IPC 通道。
- 不伪造 `tushare://…` 等假 URL 骗过正文抓取。
- 不把 Tushare 原文标成 primary 正式披露正文以绕过证据门禁。
- 不改产业研究财务同步产品流程（可复用 `tushareService` 已有 `fetchFinancial*`）。
- 不保证任意 MCP 提供商对所有 query 成功；空候选仍可为 soft `missing`。

## 4. 探测模型

在主进程工具入口（本地读库，不打外网）解析：

| 键 | 条件 | 含义 |
|---|---|---|
| `webSearch` | 本应用联网搜索已启用且可解析通道（复用 `isAppWebSearchConfigured` 或等价） | 可跑网页披露搜索 |
| `tushare` | `data_source_config.tushareEnabled===1` 且 Token 可解密 | 可拉 Tushare 财务/预告类接口 |
| `stockSubject` | 运行主体含股票，或入参 `stockCode` 落在已确认股票主体 | 可绑定 `ts_code` |

探测结果状态建议：`configured` | `unavailable` | `skipped`（缺股票主体等）| 执行后 `ready` | `failed` | `missing`。

写入工具 payload，例如：

```ts
probes: {
  webSearch: { status: 'configured' | 'unavailable' }
  tushare: { status: 'configured' | 'unavailable' }
  stockSubject: { status: 'configured' | 'skipped'; tsCode?: string }
}
sources: Array<{ id: string; status: 'ready' | 'missing' | 'failed' | 'skipped'; detail?: string }>
```

## 5. `official.disclosure_search` 行为

### 5.1 网页通道（`webSearch` 可用）

1. **短官方 query**：`{用户 query} (site:cninfo.com.cn OR site:sse.com.cn OR site:szse.cn OR site:bse.cn)`，可再 OR 已确认主体公司官网域。
2. **不再**把 `gov.cn` / 工信部 / 统计局等长列表塞进同一条 OR（官方域白名单仍用于**结果过滤/分类**）。
3. 调用 `runAppWebSearch`；失败（含 MCP `isError`）→ **降级**用原 query（无 site:）再搜一次，结果仍按官方/`secondary` 规则过滤。
4. 降级成功时加 warning：「官方域定向检索失败，已降级为通用检索并过滤官方来源。」

### 5.2 Tushare 通道（`tushare` + `stockSubject`）

1. 解析 `ts_code`（六位+交易所后缀）。
2. 并行（或顺序）拉取至少：`forecast`、`express`；可选 `disclosure_date`（行数少、有助于披露日历）。
3. 按 run `as_of` 截断公告日/报告期；条数上限与现工具 `maxResults` 同量级（建议合计 ≤8～16 行入 payload）。
4. 写入 payload 独立字段（如 `structuredDisclosures`），**不**进入 URL `candidates` 列表。
5. Warning：「Tushare 结构化预告/快报不替代公司、交易所或监管正式披露正文。」

### 5.3 合并判定

| 情况 | 工具 status |
|---|---|
| 有 URL 候选 **或** 有结构化行 | `ready` |
| 通道均跳过/空结果，无失败 | `missing`（soft） |
| **已启用且尝试过的通道全部失败**（无任何可用数据） | 抛 `ResearchAgentNetworkToolError`，message 聚合各通道原因（含 MCP 摘要） |

仅网页失败但 Tushare 有行 → **不得**整单失败。  
仅 Tushare 失败但网页有候选 → **不得**整单失败。

### 5.4 无网页配置时

若 `webSearch` unavailable 且 Tushare 可用且有股票 → 允许只走 Tushare，工具可为 `ready`（仅结构化）。  
若两者皆不可用 → 明确错误（未配置联网搜索 / 未启用 Tushare / 缺股票主体），中文指向配置中心 → Agent / 数据源。

## 6. `company.fundamentals_refresh` 行为

1. 探测 `tushare` + 股票主体（现工具已要求股票）。
2. **Tushare 优先**：复用已有 `fetchFinancialIndicatorRows` / `fetchIncomeFinancialRows`（或最小子集），映射为与现东财 payload 接近的 `reports` 结构（字段可缺则 null）；`sources` 标 `tushare.fina_indicator` 等。
3. **降级东财**：Tushare unavailable，或 Tushare 调用失败 → 保留现有东财 `RPT_F10_FINANCE_MAINFINADATA` 路径；Tushare 失败时加 warning 后降级。
4. 两边皆无有效报告 → `missing` 或明确失败码（与现行为对齐）。

## 7. MCP 错误可读

修改 `callExternalMcpTool`：

- 当 `result.isError === true`：从 `content[].text`（及等价 text 字段）拼接/截取摘要（建议 ≤300 字符），`error.message` 形如 `MCP tool 返回 isError：{摘要}`。
- 无可用正文时保留 `MCP tool 返回 isError`。
- 网关 / 披露搜索原样转发该 message，不再吞掉。

## 8. 文案与 README

- 更新 `src/components/AIAnalysis/README.md`：说明官方披露搜索为多通道（短 site 网页 + 可选 Tushare 结构化），财务刷新可优先 Tushare。
- 工具 `description` 字符串同步一句，避免模型以为结构化行可当 `candidateId` 抓正文。

## 9. 测试与验收

| 场景 | 期望 |
|---|---|
| 官方 short query 拼装 | 含 cninfo/sse/szse/bse；**不含**超长 gov OR 串 |
| MCP isError + text | `error.message` 含该 text 摘要 |
| 网页失败 + Tushare forecast 有行 | `official.disclosure_search` → `ready`，有 `structuredDisclosures`，probes/sources 可审计 |
| 仅网页成功 | `ready`，candidates > 0 |
| 两通道配置且都失败 | 抛错，message 含 MCP 摘要与/或 Tushare 失败原因 |
| fundamentals + Token mock | 走 Tushare 映射，不强制东财 |
| fundamentals 无 Token | 仍走东财 |

单测为主；不依赖真实豆包/Tushare 公网。

## 10. 修订记录

- 2026-08-12：对话确认方案 C（披露多通道 + 财务 Tushare 优先）+ 配置探测；书面归档。
- 2026-08-12：用户 go 后实现；设计初衷检核见 plan。
