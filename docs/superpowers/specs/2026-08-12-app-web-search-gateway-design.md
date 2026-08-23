# 本应用联网搜索网关设计

**状态：** 已批准执行（2026-08-12 用户确认方案 A + 方案 1，要求详细并开搞）  
**日期：** 2026-08-12  
**Plan：** [`../plans/2026-08-12-app-web-search-gateway.md`](../plans/2026-08-12-app-web-search-gateway.md)

## 1. 问题

1. 「研究端增强搜索」（Tavily/Bing/自定义）配置 UI 埋在产业研究工作台内，而 Phase 2a 后侧栏已无产业研究入口，用户找不到。
2. 观察池「联网补充分类」声称「复用研究端搜索配置」；未配置时走 DuckDuckGo，国内易 `WEB_SUGGEST_TIMEOUT`。
3. 用户已在 Agent → 外部 MCP 配好豆包搜索，但观察池/研究搜索**不会**用它。

## 2. 目标

- **单一真相源**：`research_web_search_config` 扩展为「本应用联网搜索」主通道配置。
- **显式选择（方案 A）**：用户在 Agent 页下拉选主通道；不自动乱跳。
- **可发现**：配置中心 → Agent →「联网搜索」为主入口。
- **观察池联网补充**走同一网关；可选 `external_mcp`（豆包 `web_search`）。
- 深度研究回退 / Agent `web.search` 等既有消费方继续读同一配置（行为对齐，不静默换通道）。

## 3. 非目标

- 不恢复侧栏「产业研究」一级/二级入口（另开议题）。
- 不新建第二套搜索配置表。
- 不把 MCP 环境变量/Key 复制进 `research_web_search_config`。
- 不把网页原文行业名直接写入观察池（二期硬约束不变）。
- 不静默全市场爬分类；联网补充仍须显式按钮授权。
- 本期不强行把 ChatGPT 原生 `web_search` 与本网关合并（原生路径仍属产业研究生成专用）。

## 4. 方案（已选）

扩展现有单行表 + Agent 页主面板 + 主进程统一 `runAppWebSearch`。

### 4.1 Provider 枚举

| `provider_id` | 含义 | 凭据 |
|---|---|---|
| `tavily` | 现有 | `api_key_encrypted` |
| `bing` | 现有 | `api_key_encrypted` |
| `custom_openai_compatible_search` | 现有 | Key + `base_url` |
| `external_mcp` | **新增** | `mcp_server_id` + `mcp_tool_name`；密钥在 `external_mcp_servers` |
| `builtin_web` | **新增（显式）** | 无；DuckDuckGo HTML 弱检索 |

`enabled=0`：消费方视为「未启用增强/指定搜索」；观察池应返回可读错误（可提示去 Agent 页配置），**不再**在用户已显式选了某通道却未启用时偷偷换通道。  
例外：若从未配置过（无行 / 历史默认），观察池可继续对「未配置」降级到 `builtin_web` 一次并在错误文案说明——实现上以 `enabled===1` 且通道可解析为准。

### 4.2 Migration 152

重建 `research_web_search_config`（SQLite 无法改 CHECK）：

- 放宽 `provider_id` CHECK，纳入 `external_mcp`、`builtin_web`
- 新增可空列：`mcp_server_id TEXT`、`mcp_tool_name TEXT`（长度上限分别 ≤64 / ≤128）
- 拷贝旧数据；新列填 NULL
- 幂等、向前升级

应用层校验：`external_mcp` 时两列必填且服务器存在且 enabled；`builtin_web`/`external_mcp` 保存时不要求 api key；API 类 provider 仍要求 key（或已有密文）。

### 4.3 主进程网关

新建（建议路径）`electron/main/services/appWebSearchGateway.ts`：

```ts
runAppWebSearch(db, { query, maxResults?, timeoutMs? }): Promise<ResearchSearchHit[]>
validateAppWebSearch(db): Promise<{ validatedAt: number }>
getAppWebSearchConfigView(db): AppWebSearchConfigView  // 扩展现有 view
saveAppWebSearchConfig(...): AppWebSearchConfigView
```

行为：

1. 读配置；`enabled≠1` → 抛 `WEB_SEARCH_NOT_CONFIGURED`（带中文说明）。
2. `tavily|bing|custom_*` → 现有 `runWebSearch`。
3. `builtin_web` → `searchWithBuiltinWebTool`。
4. `external_mcp` → 校验服务器启用 → `callExternalMcpTool` → **适配器**转 `ResearchSearchHit[]`。
5. 超时：API/builtin 默认 8s（观察池）；MCP 默认 15s（与外部 MCP 一致）。调用方可覆盖。

**MCP 适配器（最小可用）**：

- 入参：优先 `{ Query: query }`（豆包 AskEcho）；若 tool schema 无 `Query` 则尝试 `{ query }`（实现可用启发式：toolName 含 search 或固定对 askecho 用 Query）。
- 出参：解析 MCP `content[]` 中 text；若 JSON 含结果数组，映射 `title/url/snippet`；否则把文本切片为单条 hit（`url` 可用占位 `mcp://<serverId>/<tool>`，`providerId` 记为配置侧逻辑 id——类型上可扩展 `ResearchSearchProviderId` 或 hits 用现有字段 + snippet 承载）。
- `ResearchSearchHit.providerId`：扩展类型联合加入 `external_mcp` | `builtin_web`（与表一致）。

失败码：`WEB_SEARCH_NOT_CONFIGURED` / `WEB_SEARCH_PROVIDER_FAILED` / `TIMEOUT` / `MCP_*` 映射为可读 `error` 字符串给观察池。

### 4.4 消费方接线

| 消费方 | 改动 |
|---|---|
| `watchlistCategoryWebSuggestService.defaultSearch` | 改调 `runAppWebSearch`；超时 MCP 15s / 其它 8s；错误带回通道名 |
| `resolveConfiguredResearchAgentSearch` / 深度研究 runtime | 读配置时识别新 provider：`external_mcp`/`builtin_web` 有凭据语义差异——`resolveConfigured*` 对 MCP 返回特殊 credentials 或改为直接调网关（优先：**研究 Agent 网络工具与 runtime 检索改走 `runAppWebSearch`**，避免双路径） |
| 产业研究 `validateConfiguredWebSearch` | 委托 `validateAppWebSearch` |

本期至少保证：**观察池**与 **validate/save/get 配置** 走网关；深度研究 runtime 若改动面过大，可先让 `resolveConfiguredResearchAgentSearch` 在 `external_mcp`/`builtin_web` 时返回 null 并依赖既有 builtin 回退——但验收要求写清。  
**硬要求：** 观察池必须走网关；配置 UI 必须能测通 MCP。深度研究/Agent web.search：**应**走同一网关（同一任务内完成，避免半吊子）。

### 4.5 UI

**Agent 页（主）** — `AgentSettings` 新增区块「联网搜索」：

- 复用并扩展 `ResearchWebSearchConfigPanel`（或抽到 `src/components/Settings/AppWebSearchSettings.tsx` 再两边引用）
- Provider 下拉含五类；选 `external_mcp` 时：
  - 服务器下拉（`externalMcp.listServers` 已启用项）
  - 工具下拉（优先 `lastTools`；可「刷新 tools」调 test/list）
  - 无 Key 输入框
- 选 `builtin_web`：无 Key
- 「保存」「保存并测试」
- 文案：本配置供观察池「联网补充分类」、深度研究回退检索、Agent 联网搜索工具共用；外部 MCP 密钥仍在下方高级区维护。

**产业研究内嵌面板**：同一组件；标题改为「本应用联网搜索」；可加一句「亦可在 配置中心 → Agent 中配置」。

**观察池确认框**：补充「当前搜索通道见配置中心 → Agent → 联网搜索」；超时错误展示通道 id。

### 4.6 IPC

保持现有 `industryResearch:get/save/validateWebSearchConfig` 扩展 payload（向后兼容），**或**新增 `settings:`/`agent:` 窄通道并由两边共用服务层。推荐：**服务层统一，IPC 仍走 industryResearch 通道 + Agent UI 调同一 API**，少开新通道；payload 增加 `mcpServerId`/`mcpToolName`。

## 5. 验收

1. Agent 页可见「联网搜索」，可选五类通道；选外部 MCP + 豆包 `web_search` 可保存并测试通过。
2. 观察池「联网补充分类」在通道为 `external_mcp` 时调用 MCP（主进程日志/单测 spy），不再误用 DDG。
3. 通道为 `tavily` 等时行为与旧版一致（单测 mock）。
4. `builtin_web` 显式可选；未启用配置时错误可读。
5. Migration 152 在空库与旧库升级通过。
6. Settings/Agent/IndustryResearch/TrendWatcher README 与本 spec 对齐。
7. 不恢复产业研究侧栏入口。

## 6. 风险

| 风险 | 缓解 |
|---|---|
| MCP 冷启动 >15s | 文档提示先连通测试预热；超时文案引导 |
| AskEcho 参数名 `Query` | 适配器固定优先 Query |
| CHECK 重建表 | 标准 new-table copy；单测 migration |
| 双 UI 分叉 | 单一 React 组件两处引用 |

## 7. 修订

- 2026-08-12：初稿；用户批准方案 A + 表扩展方案并要求详细执行。
- 2026-08-12：UI 信息架构修正——「本应用联网搜索」置于 Agent 页主位；「允许 Agent 联网」降为第 2 节回合闸门，避免用户以为关 Agent 联网则无需配搜索（观察池补充分类仍依赖搜索通道）。
- 2026-08-12：调用点审计——新增 `isAppWebSearchConfigured`；深度研究预检不再误要求 API Key；文案统一指向配置中心 → Agent。闸门矩阵见下。

### 7.1 调用点闸门矩阵

| 路径 | 配置 / 闸门 |
|---|---|
| 观察池「联网补充分类」 | 仅 `research_web_search_config`（`runAppWebSearch`）；**不看** Agent 联网 |
| 产业研究生成回退检索 | 同上 |
| 深度研究 `web.search` / `official.disclosure_search` | 同上（经网关） |
| 深度研究 `mcp.invoke`（任意外部 MCP） | **仅** `ai_agent_network_enabled` |
| AI 分析 Agent Hub：`mcp__*` 投影、`research.deep_start` 等 network Tool | **仅** `ai_agent_network_enabled`（`networkGate`） |
