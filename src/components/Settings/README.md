# Settings 组件



## 模块功能



`Settings` 组件负责应用级偏好设置展示与修改, 包括扫描频率、数据保留、启动补漏、资讯分组、扫描后 AI 分析、行业动量窗口、今日看板系统通知、详情缓存管理、盘前采集、数据存储（自定义数据目录）与产业链等。**允许 Agent 联网**、**本机研究访问**、**外部 MCP 客户端**已迁至配置中心 **Agent** 页签（`AgentSettings.tsx`）。



## 实现思路



组件从 Zustand `useAppStore()` 读取 `settings` 与 `updateSettings`。大部分设置通过 `settings:update` 通用 IPC 写入 `app_settings`, 返回最新配置后同步更新前端状态。



今日看板系统通知使用 `decision_notify_windows_enabled` 控制 Windows 原生通知开关, 使用 `decision_notify_min_priority` 控制最低通知优先级。通知实际弹出逻辑在主进程 `decisionNotificationService.ts`, 设置页只负责持久化用户偏好。



### Agent 页签（`AgentSettings.tsx`）

信息架构（自上而下）：

1. **本应用联网搜索**（`AppWebSearchSettings` / `research_web_search_config`）：显式选 Tavily / Bing / 自定义 / 外部 MCP / 内置弱检索。观察池「联网补充分类」、深度研究回退 / `web.search` 优先用；与「允许 Agent 联网」**解耦**。
2. **Agent 回合联网**：仅闸门控制聊天里 Agent 是否可自主调联网 Tool（含 MCP 投影、`research.deep_start`），以及深度研究 `mcp.invoke`；不关闭上方搜索通道。
3. **本机研究访问** → **高级/实验 · 外部 MCP 客户端**（密钥维护，可被联网搜索选用）。

闸门速查：观察池补充分类 / 产业研究回退 / 深度研究 `web.search` → 只看搜索配置；Agent Hub network Tool / 深度研究 `mcp.invoke` → 只看「允许 Agent 联网」。

详见 `docs/superpowers/specs/2026-08-12-app-web-search-gateway-design.md`。

`ResearchAccessSettings` / `ExternalMcpSettings` 行为同前（窄 IPC、凭据不回显、stdio）。



### 数据存储（`DataRootSettings.tsx`，FR-265）

展示当前数据目录与来源（默认 / 自定义 / 环境变量），支持更改目录与恢复默认，重启生效。设计见 `docs/superpowers/specs/2026-08-13-custom-data-directory-design.md`：

1. **引导配置**：数据目录位置存于固定位置的 `data-root.json`（平台默认 userData），先于数据库存在；优先级 `RT_DATA_ROOT` 环境变量 > 引导文件 > 模式默认。
2. **智能切换**：目标已有应用数据直接复用；空目录带 SHA 校验复制迁移（复制源优先取引导文件记录的上一数据根，支持连续切换）；含未知文件拒绝（`DATA_DIRECTORY_CONFLICT`）。
3. **两段化启动**：无需复制时模块顶层直接生效；需复制时 `app.whenReady()` 后先显示迁移进度小窗再同步复制，复制成功后自动重启使新根生效（迁移进程的 userData 指向临时 profile，避免 Chromium 污染目标目录），失败弹致命错误窗且原数据不动。
4. **窄 IPC**：`dataRoot:getStatus` / `dataRoot:selectDirectory` / `dataRoot:setCustomRoot` / `dataRoot:clearOverride`，渲染层不接触任何文件系统操作。env 来源时设置页只读提示且拒绝恢复默认（`DATA_ROOT_ENV_LOCKED`）。



## 主要 props/state/事件流



- props：无。

- store state：`settings`。

- store action：`updateSettings(data)`。

- 本地 state：

  - `saving/saved`：扫描频率保存反馈。

  - `cacheStats/selectedRange/clearing/clearResult`：详情缓存管理状态。

  - `ExternalMcpSettings` 自主管理服务器列表、编辑草稿、连通 tools 摘要与删除确认。

  - `ResearchAccessSettings` 自主管理端点状态、配置创建权限、一次性凭据、操作确认和审计反馈。

  - `DataRootSettings` 自主管理数据目录状态、待确认目标、写入中/重启提示与错误文案。

- 事件流：用户点击按钮或输入框失焦 -> `updateSettings` / `cache.clear` / `externalMcp.*` / `researchAccess.*` / `dataRoot.*` -> 主进程更新 SQLite 或引导配置 -> 前端刷新展示。



## 特殊逻辑备忘



- Windows 系统通知只对新增决策信号生效, 同一 `dedup_key` 的信号更新不会重复弹出。

- 最低通知优先级目前限定为 P3+ / P4+ / P5+, 默认 P4+。

- Electron 开发模式下是否展示 Windows 通知受系统通知权限、专注助手和 AppUserModelId 影响；打包后更稳定。

- 外部 MCP stdio 禁止 shell 拼接；args 以字符串数组传给 `spawn`。M1 起 enabled 服务器的 tools 投影进 Agent ToolRegistry（命名见上）；M2 起深度研究可通过 `mcp.invoke` 调用已启用服务器工具，结果可追溯且不过证据门禁 complete。

- 数据目录更改仅写引导文件，重启时执行；迁移复制排除瞬态文件（`Singleton*`、`LOCK`），凭据（`session/Local State`）随数据根整体复制。引导文件损坏时启动退回默认目录并 warn，不崩溃。


