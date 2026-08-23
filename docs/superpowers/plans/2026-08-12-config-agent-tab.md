# 配置中心 Agent 页签 Implementation Plan

> **未批准 / 用户未说执行前禁止改业务代码。** 本文档对应用户 2026-08-12「搞，按照规范推进」。

**状态：** 已完成  
**Spec：** [`../specs/2026-08-12-config-agent-tab-design.md`](../specs/2026-08-12-config-agent-tab-design.md)

## Tasks

### Task 1：ConfigDrawer 增加 Agent 页签

- Modify: `src/components/ConfigDrawer/ConfigDrawer.tsx`（`ConfigDrawerTab` + `CONFIG_TABS`）
- Create: `src/components/Settings/AgentSettings.tsx`（联网开关 + ResearchAccess + 折叠 ExternalMcp）
- Modify: `src/components/Settings/Settings.tsx`（移除三块 Agent 相关）
- Update: `ConfigDrawer/README.md`、`Settings/README.md`

- [x] Step 1：抽出 `AgentSettings`，Settings 变瘦  
- [x] Step 2：ConfigDrawer 类型挂载 + Agent/AI 页自动加宽  
- [x] Step 3：README + 设计初衷勾选  

### Task 2：验证

- [x] 静态：设置页已无 Agent 三块；Agent 页含联网 / 本机研究 / 折叠外部 MCP  
- [ ] 手工（建议）：页签切换、联网开关仍写 `ai_agent_network_enabled`、本机研究访问与外部 MCP 面板可用  

## 设计初衷检核

| Spec 项 | 结果 | 说明 |
|---|---|---|
| Agent 页签存在且归属正确 | 通过 | `ConfigDrawerTab` 含 `agent`；面板 `AgentSettings` |
| 设置页已移出 Agent 三块 | 通过 | Settings 仅保留扫描/通知/缓存/盘前/产业链等 |
| 外部 MCP 默认折叠 | 通过 | 「高级 / 实验」默认收起，`agent-settings-advanced-toggle` |
| README 已更新 | 通过 | ConfigDrawer + Settings |

---

## 修订记录

- 2026-08-12：初稿，用户批准执行；实现完成并勾选检核。
