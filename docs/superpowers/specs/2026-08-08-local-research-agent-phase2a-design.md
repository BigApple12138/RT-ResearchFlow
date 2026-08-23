# 本地投研 Agent — Phase 2a 设计

**状态：** 已批准方向（单聊天页 + 深挖 suggest→确认）  
**依赖：** Phase 1（常驻聊天、持仓芯片）

## 目标

AI 分析对用户只呈现**一个聊天页**。深度研究以主聊天背后的 subagent 形式启动（建议卡片 → 用户确认 → 现有 `startRun`）。产业研究导航入口移除；本批不自动启动产业生成。

## 信息架构

- 移除侧栏「AI 分析」下「研判记录 / 深度研究 / 产业研究」二级菜单；点击「AI 分析」直接进入聊天。
- 侧栏不再出现深度/产业子菜单；默认挂载聊天。
- 遗留工作台仍可通过 `aiAnalysisWorkbench` / `setAIAnalysisSubTab('deepResearch'|'industryResearch')` / 后台任务条程序化打开（供 E2E 与返回目标），不对普通用户露出菜单。

## 深挖调度（2a）

1. **意图识别（前端启发式）**：用户发送文本匹配如 `深挖|深度研究|深入研究|全面调研|启动深度研究`。
2. **拦截普通 followUp**：匹配时不走易触发交易审计的闲聊追问；确保讨论会话存在后展示建议卡片。
3. **建议卡片**：展示问题摘要；主按钮「启动深度研究」；次按钮「改为普通追问」（再走 followUp）；产业意图仅灰态提示「产业研究下一期」。
4. **确认启动**：打开现有 `ResearchAgentPanel` 预检对话框（`preflight` → 用户确认预算与主体 → `startRun`）。
5. **忙碌**：启动前 `listRuns(null)` 若存在 `queued|running`，提示全局忙碌，不静默失败。
6. **会话 busy**：本会话存在 `queued|running|paused` 深度研究时，禁用追问输入并提示（避免与 Agent 抢写 `messages`）。

## 非目标

- `autoDispatchSubagents`
- 产业 `startGeneration` handoff
- 放宽讨论审计规则
- 删除深度/产业服务代码

## 验收

1. 侧栏 AI 分析无二级菜单，只有聊天。  
2. 「深挖节能风电」出现建议卡片，确认后可启动深度研究。  
3. 深度研究运行中追问被禁用或明确忙碌。  
4. 原产业/深度子页入口不可达。

## 组件 README

更新 `AIAnalysis/README.md`；导航变更可在 App 相关说明或本 spec 引用。
