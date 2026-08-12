# Settings 组件



## 模块功能



`Settings` 组件负责应用级偏好设置展示与修改, 包括扫描频率、数据保留、启动补漏、资讯分组、扫描后 AI 分析、**允许 Agent 联网**、行业动量窗口、今日看板系统通知、详情缓存管理、**外部 MCP 客户端**和受控本机研究访问。



## 实现思路



组件从 Zustand `useAppStore()` 读取 `settings` 与 `updateSettings`。大部分设置通过 `settings:update` 通用 IPC 写入 `app_settings`, 返回最新配置后同步更新前端状态。



今日看板系统通知使用 `decision_notify_windows_enabled` 控制 Windows 原生通知开关, 使用 `decision_notify_min_priority` 控制最低通知优先级。通知实际弹出逻辑在主进程 `decisionNotificationService.ts`, 设置页只负责持久化用户偏好。



**允许 Agent 联网**（`ai_agent_network_enabled`，默认 `0`）：开启后 AI 分析 Agent 可按任务自主调用 Registry 中 `sideEffect='network'` 的 Tool（可能产生模型/数据成本，不再逐次确认）；关闭时主进程 `networkGate` 阻断新联网调用。本开关不合并、不覆盖盘前采集等已有独立联网开关；真正的授权校验在主进程 Tool 执行边界，不依赖 UI 禁用或模型自律。



`ExternalMcpSettings`（Agent Hub 第二期）通过 `window.api.externalMcp` 窄方法管理外部 MCP **客户端**配置：增删改、启停、连通测试与 `list_tools`。第一期传输仅 `stdio`（command + argv 数组 + 可选 cwd）；环境变量仅在保存时以明文写入 IPC，主进程用 `encryptApiKey` 整段加密落库；列表视图只回 `hasEnv`，不回显密钥。连通测试由主进程短时拉起子进程、`list_tools` 后关闭；Renderer 不起子进程、不持密钥明文常驻。文案明确区分：本面板是「本应用去连外部 MCP 服务器」；「本机研究访问」是方向相反的 MCP **服务端**旁路。

**M1 投影命名：** 已启用服务器的 tools 在 Agent 回合中注册为 `mcp__<serverId>__<toolName>`（`serverId` 为配置主键 UUID；与 `local.*` / `research.*` 隔离）。`sideEffect` 一律 `network`（外部 MCP 无法证明「只读本地」）。关闭「允许 Agent 联网」时 `networkGate` 拒绝执行。disabled 服务器不注册。



`ResearchAccessSettings` 通过 `window.api.researchAccess` 的六个窄方法管理访问配置和读取最近50条有界审计。创建配置至少选择一个权限，`market.read` 默认选中；创建或轮换后的明文凭据及MCP配置只显示一次，以“我已保存”结束交付。权限清空会停用配置，轮换与撤销使用应用内确认区；renderer不获得事实工具执行入口。



## 主要 props/state/事件流



- props：无。

- store state：`settings`。

- store action：`updateSettings(data)`。

- 本地 state：

  - `saving/saved`：扫描频率保存反馈。

  - `cacheStats/selectedRange/clearing/clearResult`：详情缓存管理状态。

  - `ExternalMcpSettings` 自主管理服务器列表、编辑草稿、连通 tools 摘要与删除确认。

  - `ResearchAccessSettings` 自主管理端点状态、配置创建权限、一次性凭据、操作确认和审计反馈。

- 事件流：用户点击按钮或输入框失焦 -> `updateSettings` / `cache.clear` / `externalMcp.*` / `researchAccess.*` -> 主进程更新 SQLite -> 前端刷新展示。



## 特殊逻辑备忘



- Windows 系统通知只对新增决策信号生效, 同一 `dedup_key` 的信号更新不会重复弹出。

- 最低通知优先级目前限定为 P3+ / P4+ / P5+, 默认 P4+。

- Electron 开发模式下是否展示 Windows 通知受系统通知权限、专注助手和 AppUserModelId 影响；打包后更稳定。

- 外部 MCP stdio 禁止 shell 拼接；args 以字符串数组传给 `spawn`。M1 起 enabled 服务器的 tools 投影进 Agent ToolRegistry（命名见上）；M2 起深度研究可通过 `mcp.invoke` 调用已启用服务器工具，结果可追溯且不过证据门禁 complete。


