# 官方披露 / 财务多方取数 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按配置探测多方取数：短 site 网页披露搜索 + 可选 Tushare 结构化；财务刷新优先 Tushare；MCP isError 透出可读摘要。

**Architecture:** 本地探测 `webSearch`/`tushare`/`stockSubject`；`official.disclosure_search` 编排短查询 + 降级 + Tushare forecast/express；`company.fundamentals_refresh` Tushare 优先、东财降级；`callExternalMcpTool` 抽取 isError 正文。

**Tech Stack:** Electron 主进程 TypeScript、better-sqlite3、现有 `runAppWebSearch` / `tushareService.fetchFinancial*`、Vitest。

**状态：** 已实现（2026-08-12 用户 go；单测 Electron ABI 绿）  
**Spec：** [`../specs/2026-08-12-official-disclosure-multichannel-design.md`](../specs/2026-08-12-official-disclosure-multichannel-design.md)

## Global Constraints

- 不新建 Migration / IPC / 配置页。
- 不伪造可抓正文的假 URL；Tushare 行不得冒充 primary 披露正文。
- 单测不依赖真实豆包/Tushare 公网；可注入 fetch / mock transport。
- Commit message 中文；仅用户要求时 commit。
- 改行为同步更新 `src/components/AIAnalysis/README.md`。

## File map

| 路径 | 职责 |
|---|---|
| `electron/main/services/externalMcpClientService.ts` | isError 时透出 content 摘要 |
| `electron/main/services/researchAgentNetworkTools.ts` | 探测、短 query、披露多通道、财务 Tushare 优先 |
| `electron/main/services/tushareService.ts` | 复用已有 fetch（原则上不改 API，除非需小导出） |
| `tests/unit/externalMcp.client.test.ts` | MCP isError 文案 |
| `tests/unit/researchAgentOfficialSearchQuery.test.ts` | 短 site query |
| `tests/unit/researchAgentDisclosureMultichannel.test.ts` | 合并 / fundamentals |
| `src/components/AIAnalysis/README.md` | FR 行为说明 |

---

### Task 1: MCP isError 可读摘要 — [x]
### Task 2: 官方短 query 拼装 + 单测 — [x]
### Task 3: 探测模型 + 披露多通道编排 — [x]
### Task 4: fundamentals Tushare 优先 + 东财降级 — [x]
### Task 5: README + 设计初衷检核 — [x]

---

## 设计初衷检核

| Spec 项 | 结果 | 说明 |
|---|---|---|
| 短 site 查询，无超长 gov OR | 通过 | `buildOfficialDisclosureWebQuery` + 单测 |
| MCP isError 透出摘要 | 通过 | `formatMcpToolIsErrorMessage` + client 单测 |
| 披露：网页 + Tushare 探测合并 | 通过 | `probes`/`structuredDisclosures` |
| 一侧成功不整单失败 | 通过 | 网页失败 + Tushare 有行 → ready |
| 结构化 ≠ 正文候选 | 通过 | 独立字段；工具 description 已说明 |
| fundamentals Tushare 优先 / 东财降级 | 通过 | 单测不调东财 |
| 无新 Migration/IPC | 通过 | 未新增 |
| README 已更新 | 通过 | AIAnalysis README |

---

## 修订记录

- 2026-08-12：方案 C + 探测书面 plan 归档；用户 go 后实现并完成检核。
