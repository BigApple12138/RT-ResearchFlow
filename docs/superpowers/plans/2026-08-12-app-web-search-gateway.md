# 本应用联网搜索网关 Implementation Plan

> **For agentic workers:** 按任务顺序实现。对应用户 2026-08-12「可以，做详细点，开搞吧」。

**Goal:** 单一「本应用联网搜索」配置（含外部 MCP），Agent 页可发现；观察池联网补充与检索消费方走同一网关。

**Architecture:** Migration 152 扩展 `research_web_search_config`（避开市场共振快照 151）；`appWebSearchGateway.ts` 统一 run/validate/get/save；UI 共用面板挂到 Agent；观察池/深度研究回退/Agent web.search 走网关。

**状态：** 已完成实现 + 调用点审计（待用户手工验收 MCP 通道）

**Spec：** [`../specs/2026-08-12-app-web-search-gateway-design.md`](../specs/2026-08-12-app-web-search-gateway-design.md)

## Tasks

### Task 1：Migration + types + repository — [x]
### Task 2：Gateway + MCP adapter — [x]
### Task 3：观察池 + 研究搜索消费方 — [x]
### Task 4：UI — [x]
### Task 5：单测 — [x]（Electron ABI 下 `appWebSearchGateway.test.ts` 通过）
### Task 6：调用点闸门审计 — [x]
- `isAppWebSearchConfigured` 统一预检（含 external_mcp / builtin_web）
- 深度研究 `web.search` 生产路径走 `runAppWebSearch`（修复网关分支未绑定 providerId 的缺陷）
- `mcp.invoke` / Agent Hub network Tool 仍只看 `ai_agent_network_enabled`
- 观察池不看 Agent 联网开关

## 设计初衷检核

| Spec 项 | 结果 | 说明 |
|---|---|---|
| Agent 页可配置五类通道 | 通过 | `AppWebSearchSettings` 挂 Agent |
| external_mcp 可绑定；观察池走网关 | 通过 | `defaultSearch`→`runAppWebSearch`；MCP 超时 15s |
| 单一配置表、无 Key 复制 | 通过 | 仅 `mcp_server_id`/`mcp_tool_name` |
| 不恢复产业研究导航 | 通过 | 未改 NAV_TABS |
| README 已更新 | 通过 | Settings / TrendWatcher / IndustryResearch / AIAnalysis |
| 调用点闸门分离 | 通过 | 见 design §7.1 |

---

## 修订记录

- 2026-08-12：初稿并完成实现。
- 2026-08-12：调用点全面审计；修复深度研究 `web.search` 网关返回路径；文案统一配置中心 → Agent。
