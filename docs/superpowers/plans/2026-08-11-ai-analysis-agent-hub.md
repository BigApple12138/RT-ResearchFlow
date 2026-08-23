# AI 分析 Agent 助手框子 Implementation Plan

> **For agentic workers:** 按任务勾选推进；推荐 `executing-plans` / `subagent-driven-development`。完成后填写文末「设计初衷检核」。**未批准 spec / 用户未说执行前，禁止改 `src/`、`electron/` 业务代码。**

**状态：** 第一期 Tasks 1–9 + 第二期 M0–M2 代码已落地（2026-08-12；相关单测绿；待手工验收 §8 / 联网门禁后填检核表）  
**Spec：** [`../specs/2026-08-11-ai-analysis-agent-hub-design.md`](../specs/2026-08-11-ai-analysis-agent-hub-design.md)  
**参考架构：** SharkMind 2.0（ToolRegistry / SessionContext / SubAgentTool / HITL 写闸门）

---

## 产品目标（必须始终对齐；实现偏离时先修订 spec）

### 北星：本地投研 Agent × 多源数据

日常 **AI 分析就是一个交互页**；背后是够灵活的自主投研 Agent。  
**数据来源多方面**：本地持仓/行情/基本面/研究会话/证据账本是底座；公开接口、受控搜索、用户配置的**外部 MCP** 等经主进程 Tool 进入——不是另起外挂聊天机器人，也不把「本机研究访问」（MCP 服务端）当成联网配置口。

> 本地投研 Agent × 多源数据（本地事实 + 受控联网/MCP）× 可追溯证据。

OpenClaw 仅作编排形态参考；**二开以本节与 spec §1 为准**。

1. **一个交互面** — 用户不学菜单迷宫；深浅由 Agent 判断。  
2. **目标驱动 Planner–Executor** — 固化目标与完成条件，复杂任务生成可修订计划；逐步取数、补证据、检查缺口、失败改道，满足完成条件后才结束。  
3. **框子先于能力** — Orchestrator + ToolRegistry + SessionContext + 事件时间线 + 联网/写闸门；缺 Tool/Skill/**外部 MCP** 后插，入口不变。  
4. **本地优先、可审计、非投顾** — 窄 IPC、证据可追溯；不荐股、不自动交易、不削弱风险提示。

### 已锁定决策

| 项 | 选择 |
|---|---|
| 形态 | 本地投研 Agent（单交互面 + 自主判断） |
| 数据 | 多源：本地优先；外源经受控 Tool；外部 MCP 第二期起（A 配置 → B 聊天 → C 深度研究） |
| 自主程度 | 目标驱动 Planner–Executor（Goal → Plan → Act → Observe → Evaluate/Replan → Finalize） |
| HITL | 本地只读免确认；联网开关开启后取网/深挖免逐次确认；写持仓、改配置、删数据必须确认 |
| 联网授权 | `允许 Agent 联网` 默认关闭；开启后 Agent 可自主调用 network Tool（含 MCP 投影）；关闭时主进程阻断新联网调用 |
| 架构 | 方案 1：现有会话上叠主进程编排层 |
| 本机研究访问 | 旁路 MCP **服务端**（非本应用 Agent 多源主路径）；与外部 MCP **客户端**并行、不混用 |

### 成功时用户应感到

- 「平时就是跟投研助手对话；它自己决定要不要看持仓、行情、要不要深挖或外源核对。」  
- 「不是让我填表、点面板、等另一个窗口。」  
- 「本地数据它会用；外面 MCP / 搜索是我配的多源之一。」

### 非目标（第一期 Tasks 1–9 不做）

- 不 vendoring OpenClaw Gateway / Agent runtime / 多消息通道栈；只借鉴边界与生命周期，默认由本仓自主实现  
- 不建设模型选择、Provider 路由或模型评测；推理调用作为可注入依赖，第一阶段只验收框子智能闭环  
- 不实现通用动态多 Agent/swarm；保留 agent/task/capability/context/event/audit 契约，后续按评测门槛演进  
- **不实现外部 MCP 客户端**（见下文「第二期 Tasks」）；第一期只保证 Registry/闸门可挂载  
- 不改造「本机研究访问」为外网搜索入口  
- 产业研究自动生成、持仓批量预测整迁为 Tool（仅预留注册位）  
- 完整多 Skill 热更新后台；预算上限 UI（仅 maxSteps / size cap）  
- 推倒 `ai_analysis_sessions` 或废除 researchAgent runner  
- 默认以 npm 依赖整包 `openclaw` 作运行时（过重）；若后续只引 plugin-sdk 子集另开修订  
- 不强制第一期做内置增强搜索配置入口（可与 MCP A 同期或其后小修订）  

---

**Goal（一句话）：** 在 AI 分析交互页内落地本地投研 Agent 框子；多源数据经 Tool 接入，外部 MCP 按第二期挂上。  

**Architecture：** Renderer 仍为一个交互面；主进程 Planner–Executor 管理 Goal/Plan/Step/Observation/Completion；CapabilityRouter 从 Tool/Skill/SubAgent（及后续 MCP 投影）中选择能力；深挖终态触发幂等 continuation；`ai:agentEvent` 统一 plan/status/tool/message 与唯一终态；写 HITL + 联网持久开关。  

**Tech Stack：** Electron 主进程、既有 AI Provider/Fallback、researchAgent runner、React 时间线 UI、Vitest；OpenClaw 仅作设计参考，不作运行时依赖；第二期 MCP 客户端用主进程 SDK/stdio，不进 Renderer

## Global Constraints

- 禁止荐股 / 自动交易 / 仓位控制文案与能力  
- Agent 联网默认关闭；仅用户开启持久开关后允许 network Tool 自主调用，主进程每次执行前强制校验  
- Renderer 不持凭据、DB、任意网络  
- 流式/工具回合中禁止多次整表覆盖 `messages` JSON；结束一次权威落库或按既有串行队列写  
- 深度研究全局单 `running` 租约等既有约束保留  
- CI 禁止真实付费模型/公网瞬时依赖；Tool 单测可 mock  
- 默认不复制 OpenClaw 代码；若实现阶段单独批准改编极小独立函数，须保留 MIT 版权声明，并在 `THIRD_PARTY_NOTICES` 记录固定 commit、来源路径与版本  
- 改行为同步更新 `src/components/AIAnalysis/README.md`  
- Commit message 中文（仅用户要求提交时）  

---

## File map

| 文件 | 职责 |
|---|---|
| `electron/main/agent/types.ts` | SessionContext、AgentEvent、ToolDefinition 类型 |
| `electron/main/agent/toolRegistry.ts` | 按名注册/解析；版本常量 |
| `electron/main/agent/sessionContext.ts` | 构建/更新 SessionContext |
| `electron/main/agent/planner.ts` | 建立目标、完成条件与可修订 PlanState |
| `electron/main/agent/capabilityRouter.ts` | 按步骤需要从 Tool / Skill / SubAgent 能力清单中选择候选 |
| `electron/main/agent/completionEvaluator.ts` | 根据步骤判据与证据缺口决定继续、重规划、等待、完成或阻塞 |
| `electron/main/agent/orchestrator.ts` | 驱动 Goal → Plan → Act → Observe → Evaluate/Replan → Finalize；maxSteps/revisions |
| `electron/main/database/agentExecutionRepository.ts` | turn/plan/step/observation 状态跃迁、幂等与恢复查询 |
| `electron/main/database/db.ts` | Agent 执行账本 Migration + 联网开关 Migration |
| `electron/main/agent/agentActionProtocol.ts` | 独立 `agent-turn.v1` 解析（不混用 researchAgent tool_batch） |
| `electron/main/agent/hitlGate.ts` | write 类 Tool 暂停/确认/拒绝 |
| `electron/main/agent/networkGate.ts` | 每次 network Tool 执行前读取持久开关并确定性允许/拒绝 |
| `electron/main/agent/skills/README.md` + 可选默认 SKILL | 剧本约定（第一期可极薄） |
| `electron/main/agent/tools/localPortfolioFacts.ts` | 种子 Tool |
| `electron/main/agent/tools/localMarketSnapshot.ts` | 种子 Tool |
| `electron/main/agent/tools/localFundamentalsRead.ts` | 种子 Tool |
| `electron/main/agent/tools/researchDeepStart.ts` | 包装 researchAgent start；会话上下文包 |
| `electron/main/agent/registerBuiltinTools.ts` | 启动时注册种子 Tool |
| `electron/main/database/db.ts` | Migration：新增默认关闭的 Agent 联网开关 |
| `electron/main/database/types.ts` | `AppSettingsRow.ai_agent_network_enabled` |
| `electron/main/ipc/aiHandlers.ts` | `ai:agentTurn`（或升级 followUp）、`ai:agentConfirm`、`ai:agentEvent` push |
| `electron/preload/index.ts` | 暴露 agent 事件与 confirm |
| `src/components/AIAnalysis/AIAnalysis.tsx` | 时间线渲染；HITL 确认条 |
| `src/components/AIAnalysis/agentTimelineModel.ts` | 事件 → UI steps 投影（纯函数） |
| `src/components/AIAnalysis/README.md` | FR：Agent 工作台 |
| `src/components/Settings/Settings.tsx` | 「允许 Agent 联网」开关与授权说明 |
| `src/components/Settings/README.md` | Agent 联网授权行为与边界 |
| `tests/unit/agentToolRegistry.test.ts` | 注册表 |
| `tests/unit/agentPlannerExecutor.test.ts` | 目标/计划/改道/缺口/完成条件/恢复 |
| `tests/unit/agentOrchestrator.test.ts` | 循环/熔断/唯一终态/0-step |
| `tests/unit/agentHitlGate.test.ts` | 写闸门 |
| `tests/unit/agentNetworkGate.test.ts` | 默认关闭、开启放行、再次关闭阻断 |
| `tests/unit/agentTimelineModel.test.ts` | UI 投影 |
| `tests/unit/researchDeepStartContext.test.ts` | 深挖上下文包 |

---

## Tasks

### Task 0：OpenClaw 上游测绘（借鉴边界）

**Upstream:** https://github.com/openclaw/openclaw（MIT）  
**Docs:** https://docs.openclaw.ai/concepts/agent  
**已核验 commit:** `46bdbe585f96663d6ecff932ad6790d6cd26e3a3`（2026-08-11）  

**Files（产出进本仓库 docs，不改业务逻辑）：**
- Create/Update: `docs/superpowers/plans/2026-08-11-ai-analysis-agent-hub.md` 本节勾选结果，或短附录 `docs/superpowers/specs/2026-08-11-openclaw-borrow-map.md`

- [x] **Step 1:** 已从本地官方仓库核验 Agent runtime、Tool 执行、event stream、context engine、SubAgent 与 Skill snapshot 入口  
- [x] **Step 2:** 已锁定五项借鉴：0..N Tool loop、Tool 最终执行边界、事件强终态、SubAgent continuation、Skill 快照  
- [x] **Step 3:** 已明确默认不复制代码；若以后改编极小独立函数，NOTICE 固定记录上述 commit、源路径与 MIT  
- [x] **Step 4:** 已明确不搬 Gateway/通道、通用 exec/sandbox、远程节点、多 runtime harness、完整插件/Skill 安装体系  

| 分类 | 上游参考 | 本仓决策 |
|---|---|---|
| 借鉴契约 | `packages/agent-core` loop、`src/agents/admitted-run-context.ts` | 自主实现轻量 turn 状态与 authority 生命周期，不引入 workspace 包 |
| 借鉴契约 | `src/agents/agent-tools.execution-validation.ts`、Tool adapter/policy | 在最终 handler 边界强制 schema、权限、timeout/abort、脱敏与结果上限 |
| 借鉴契约 | `packages/llm-core/src/utils/event-stream.ts` | 每轮强制唯一 done/error/cancelled 终态；意外结束显式失败 |
| 借鉴契约 | `src/agents/subagents/`、`src/context-engine/types.ts` | 复用 researchAgent runner，实现 waiting → terminal → continuation；不搬通用 registry |
| 借鉴契约 | Skill session snapshot | 记录 Skill hash/版本与本轮 Tool 集；第一期不做安装器、watcher、热更新后台 |
| 明确不搬 | Gateway、channels、exec/sandbox、nodes、harness/plugin SDK | 保持 Electron 窄 IPC、本地 SQLite 与现有 Provider 边界 |

---

### Task 1：类型 + ToolRegistry + 单测

**Files:**
- Create: `electron/main/agent/types.ts`
- Create: `electron/main/agent/toolRegistry.ts`
- Create: `tests/unit/agentToolRegistry.test.ts`

**Produces:**
- `ToolDefinition`: `{ name, description, sideEffect: 'read'|'network'|'write', parametersSchema, execute(ctx, args) }`
- `createToolRegistry()` / `register` / `get` / `listForPrompt()`
- `AGENT_TOOL_REGISTRY_VERSION` 字符串常量

- [x] **Step 1:** 写失败单测：注册两个 Tool、按名获取、未知名抛错、list 含 description  
- [x] **Step 2:** 实现 registry 使单测通过  
- [x] **Step 3:** `pnpm exec vitest run tests/unit/agentToolRegistry.test.ts`

---

### Task 2：SessionContext + 联网/HITL 闸门 + 单测

**Files:**
- Create: `electron/main/agent/sessionContext.ts`
- Create: `electron/main/agent/networkGate.ts`
- Create: `electron/main/agent/hitlGate.ts`
- Create: `tests/unit/agentNetworkGate.test.ts`
- Create: `tests/unit/agentHitlGate.test.ts`

**Produces:**
- `buildSessionContext({ sessionId, userGoal, ... })`
- `assertNetworkAllowed(def)`：`network` 每次执行前从主进程设置仓库读取开关；关闭时返回稳定错误且不得调用 Tool handler，开启时直接允许  
- `assertToolAllowed(def)`：`write` 必须 pending confirm；`read` 直接允许  
- `requestHitl` / `resolveHitl(requestId, approved)` Promise 或队列 API

- [x] **Step 1:** 单测：network 默认关闭且 handler 零调用；开启后放行；运行中再次关闭后下一次调用被阻断  
- [x] **Step 2:** 单测：read 直接过；write 未确认拒绝；确认后允许一次  
- [x] **Step 3:** 实现联网与写闸门  
- [x] **Step 4:** 跑单测通过  

---

### Task 3：目标驱动 Planner–Executor + 单测

**Files:**
- Create: `electron/main/agent/orchestrator.ts`（本仓自主实现；借鉴 0..N Tool、强终态与取消语义）
- Create: `electron/main/agent/planner.ts`
- Create: `electron/main/agent/capabilityRouter.ts`
- Create: `electron/main/agent/completionEvaluator.ts`
- Create: `electron/main/agent/agentActionProtocol.ts`（独立解析；若上游有等价协议可对照，勿与本仓 researchAgent tool_batch 混用）
- Conditional: 仅实际复制 OpenClaw 极小独立函数时创建/更新 `THIRD_PARTY_NOTICES.md`；纯契约借鉴不制造虚假 vendoring 声明
- Create: `tests/unit/agentOrchestrator.test.ts`
- Create: `tests/unit/agentPlannerExecutor.test.ts`
- Create: `tests/unit/agentActionProtocol.test.ts`

**Consumes:** ToolRegistry、Skill snapshot、SessionContext、networkGate、HITL、可注入 `reasoningCall`（不负责选择模型/Provider）  
**Produces:**
- `GoalState`：目标、约束、非目标、完成条件、状态
- `PlanState` / `PlanStep`：revision、依赖、capabilityNeed、预期产物、完成判据、attempt、状态
- `Observation`：事实摘要、证据引用、失败类别、剩余缺口
- `runAgentTurn({ db, sessionId, userMessage, requestId, onEvent, reasoningCall, registry, maxSteps, maxRevisions })`
- **独立 Agent 动作协议**（`agent-turn.v1`）：`{ type:'tool', name, args }` | `{ type:'final', text }`  
  - 可复用 JSON 边界/截断工具函数风格，但 **禁止** 复用 `researchAgentProtocol` 的 `tool_batch` / 白名单 / protocolVersion  
  - 原因：主路径走文本 Provider（当前无原生 function-call）；深度研究协议专用于 runner  
- `maxSteps` 默认上限（如 8）；同 name+args 指纹重复 → 熔断并 final  
- 简单目标允许 0-step final；复杂目标必须先产出 PlanState，再按完成判据推进  
- Tool 失败分类为可改道/可重试/阻塞；可改道时修订 plan，禁止同 action 无意义循环  
- 每步后 CompletionEvaluator 返回 `continue | replan | wait_subagent | complete | blocked`  
- tool_result 注入模型前做 size cap，防爆上下文  
- 对外只发 plan/status 摘要，不发隐藏推理；每轮必须唯一 `done|error|cancelled` 终态  

- [x] **Step 1:** mock：目标 → 两步计划 → 本地事实 → 证据缺口 → Tool → 完成条件满足；断言状态与事件顺序  
- [x] **Step 2:** 单测：0-step 轻答、失败改道、plan revision、熔断、maxSteps/maxRevisions、blocked 说明  
- [x] **Step 3:** 单测：不同 mock reasoningCall 给出等价动作时，框子状态机与安全边界一致  
- [x] **Step 4:** 实现 protocol + Planner–Executor  
- [x] **Step 5:** 单测全绿   

---

### Task 3.5：Agent 执行账本 + 恢复

**Files:**
- Modify: `electron/main/database/db.ts`
- Create: `electron/main/database/agentExecutionRepository.ts`
- Create: `tests/unit/agentExecutionRepository.test.ts`
- Create: `tests/unit/agentRecovery.test.ts`

**Produces:**
- 向前 Migration：独立保存 agent turn / plan revision / step / observation；`ai_analysis_sessions.messages` 继续只保存用户/助手消息
- 稳定 `requestId/turnId/stepId`；预留 `agentId/role/taskId/parentTaskId/capabilityProfile`，第一阶段只使用主 Agent + research SubAgent
- 事务式状态跃迁与唯一终态；副作用提交前保存 intent，完成后保存 outcome
- 启动恢复：`running` 转为可判定恢复态；`waiting_subagent` 绑定既有 run；terminal 不重放

- [ ] **Step 1:** Migration 单测：旧库升级、幂等初始化、外键/唯一约束、失败回滚  
- [ ] **Step 2:** Repository 单测：合法状态跃迁、非法回退拒绝、requestId 幂等、唯一终态  
- [ ] **Step 3:** 恢复单测：Tool 前中断、Tool 后未 final、waiting SubAgent、重复终态通知  
- [ ] **Step 4:** 实现账本与恢复入口并通过测试  

---

### Task 4：种子 Tool（本地只读）+ 注册

**Files:**
- Create: `electron/main/agent/tools/localPortfolioFacts.ts`
- Create: `electron/main/agent/tools/localMarketSnapshot.ts`
- Create: `electron/main/agent/tools/localFundamentalsRead.ts`
- Create: `electron/main/agent/registerBuiltinTools.ts`
- Test: 可复用/扩展 `tests/unit/portfolioBrief*` 或新建 `tests/unit/agentLocalTools.test.ts`

**Notes:**
- 持仓事实 **默认不含 costPrice**（对齐 Phase1）  
- 行情/基本面只读已有服务/缓存，不在本任务做大刷新策略  
- `registerBuiltinTools(registry)` 在主进程初始化调用  

- [x] **Step 1:** 单测 portfolio facts 无成本价  
- [x] **Step 2:** 实现三 Tool + register  
- [x] **Step 3:** 单测通过  

---

### Task 4.5：持久联网开关 + 设置 UI

**Files:**
- Modify: `electron/main/database/db.ts`
- Modify: `electron/main/database/types.ts`
- Modify: `src/components/Settings/Settings.tsx`
- Modify: `src/components/Settings/README.md`
- Test: 新增/扩展 settings Migration 与 UI model 测试

**Produces:**
- `app_settings.ai_agent_network_enabled`：`INTEGER NOT NULL DEFAULT 0`，只接受 `0/1`
- 设置文案「允许 Agent 联网」；辅助说明：开启后 Agent 可按任务自主联网并可能产生模型/数据成本，不再逐次询问
- 此开关只控制 Agent Registry 中 `sideEffect='network'` 的 Tool；不合并或覆盖盘前采集等已有独立联网开关

- [x] **Step 1:** 写 Migration/设置单测：旧库升级默认关闭、重复初始化幂等、非法值拒绝  
- [x] **Step 2:** 实现 Migration、类型与设置 UI  
- [x] **Step 3:** 验证关闭 → 开启 → 再关闭均即时影响后续 Tool 调用  

---

### Task 5：`research.deep_start` SubAgent Tool + 上下文包

**Files:**
- Create: `electron/main/agent/tools/researchDeepStart.ts`
- Create: `tests/unit/researchDeepStartContext.test.ts`
- Modify: 必要时薄封装 `researchAgentRunManager` start API（不改租约语义）

**Produces:**
- 入参：从 SessionContext + 会话 messages 构建 **上下文包**（标题、用户目标、近期对话、候选标的），禁止再弹预检窗  
- 调用现有 startRun；返回 `runId`  
- `sideEffect: 'network'`（不逐次 HITL，但必须通过默认关闭的持久联网开关）  
- 将 `researchAgent:progress` / `delta` **桥接**为 `ai:agentEvent`（tool_result 增量或子时间线条）  
- PlanStep 持久化为 `waiting_subagent`；run 终态后按 `sessionId + runId + stepId` 幂等触发 continuation，读取权威报告并重新进入 CompletionEvaluator  

- [x] **Step 1:** 单测上下文包含对话要点与标的提取  
- [x] **Step 2:** 单测成功/失败/取消终态、重复完成通知、重启恢复均不会重复启动或重复 continuation  
- [x] **Step 3:** 实现 Tool + 桥接 + continuation  
- [x] **Step 4:** 单测通过  

---

### Task 6：IPC + preload（agentTurn / agentEvent / agentConfirm）

**Files:**
- Modify: `electron/main/ipc/aiHandlers.ts`
- Modify: `electron/preload/index.ts`
- Optional: 新 `electron/main/ipc/agentHandlers.ts` 若 aiHandlers 过大则拆分  

**Produces:**
- `ai:agentTurn`：`{ sessionId | null, message, requestId }` → 确保会话 → `runAgentTurn`  
- push `ai:agentEvent`（主路径事件；深挖 progress/delta **桥接**进此通道）  
- `ai:agentConfirm`：`{ requestId, hitlId, approved }`  
- **必须复用**既有 discussion session 串行锁（与 `runDiscussionFollowUpWithinLock` 同类），禁止另起并发写 `messages`  
- **Deep busy 策略（写死）：**  
  - 本会话存在 `queued|running|paused` 深度研究时：**拒绝用户新的 agentTurn**（明确忙碌文案）  
  - **放行**由本会话 Agent 已启动之 run 的 progress/delta → `ai:agentEvent` 桥接（避免 Agent 自锁）  
  - 全局单 `running` 租约语义不变  

- [x] **Step 1:** 契约单测：事件名、requestId 幂等、busy 拒绝 vs 桥接放行  
- [x] **Step 2:** 实现 IPC + preload + 串行锁接入  
- [x] **Step 3:** 验证 preload 类型与 window.api 暴露  

---

### Task 7：Renderer 时间线 + HITL 条 + 接入发送路径

**Files:**
- Create: `src/components/AIAnalysis/agentTimelineModel.ts`
- Create: `tests/unit/agentTimelineModel.test.ts`
- Modify: `src/components/AIAnalysis/AIAnalysis.tsx`
- Modify: `src/components/AIAnalysis/README.md`

**UI:**
- 发送走 `agentTurn`（OpenClaw 式单交互面主路径；紧急回退 followUp 仅 README 注明，默认关闭）  
- 展示可折叠 plan/status、tool 步骤、流式 message（统一消费 `ai:agentEvent`；不展示隐藏推理）  
- HITL：确认 / 拒绝条；联网关闭时展示「去设置开启」提示（非逐次确认）  
- 结束后 `getSession` 权威刷新  
- **深挖入口收敛：** Agent 自主 `research.deep_start` 为主；既有 suggest→启动路径降为手动兜底或移除（本任务二选一并在 README 写死，禁止双主路径长期并存）  

- [x] **Step 1:** timeline model 单测  
- [x] **Step 2:** UI 接入 + 深挖入口收敛  
- [x] **Step 3:** 更新 README FR（目标驱动 Planner–Executor、平台地基能力、自主取数、深挖 continuation、写闸门、联网开关）  
- [x] **Step 4:** 相关 vitest 通过  

---

### Task 8：默认 Skill 薄剧本 + 系统提示组装

**Files:**
- Create: `electron/main/agent/skills/research-assistant/SKILL.md`（短：何时读持仓、何时深挖、禁止荐股）  
- Modify: `orchestrator.ts` 组装 system prompt = Skill + `registry.listForPrompt()`  

- [x] **Step 1:** 写入 SKILL.md（中文，明确非投顾）  
- [x] **Step 2:** 单测 prompt 含 tool 名与禁止项  
- [x] **Step 3:** 接入 orchestrator  

---

### Task 9：验证、spec/plan 状态、设计初衷检核

- [x] **Step 1:** `npm run test:unit --` 相关 agent* / researchDeepStartContext / agentTimelineModel（13 files / 69 tests 通过）  
- [ ] **Step 2:** 必要 typecheck / lint 触及文件（残留既有 UI 类型问题与本任务无关，未宣称全仓 verify 绿）  
- [ ] **Step 3:** 手工验收对照 spec §8（目标/计划可见；自主取数；失败改道；深挖 continuation；完成条件检核；写操作确认）  
- [ ] **Step 3a:** 联网门禁验收：默认关闭无网络请求；开启后 Agent 自主深挖且不逐次确认；再次关闭后新调用被阻断  
- [x] **Step 4:** 将 spec/plan `状态` 更新为第一期已落地；检核表保留待手工填  
- [ ] **Step 5:** 仅在用户要求时中文 commit  

**已知未完全闭环（诚实记录，不改正文掩盖）：**
- 深挖终态后「读权威报告再跑一轮 Planner continuation」仍偏薄（有幂等闸门与 status 事件，完整总结续跑待加深）
- Agent 执行账本与 orchestrator 运行时挂接未完全串联
- Task 6 未单独建 IPC 契约单测文件
- 第二期外部 MCP（M0–M2）代码已落地；§8 第 11–13 条手工待用户

---

## 第二期 Tasks（外部 MCP 客户端；spec §4.4）

> **执行门槛：** 第一期 Tasks 1–9 完成或用户书面指定「先做 MCP」后再勾选。未批准前仍禁止改业务代码。  
> **对齐：** 聊天 + 深度研究两边都要用；分期 A → B → C。  
> **状态：** 2026-08-12 用户批准开二期；自 M0 起执行。

### Task M0：外部 MCP 配置模型 + Migration + 设置 UI（子期 A）

**Files（预期）：**
- `electron/main/database/db.ts`（向前 Migration：外部 MCP 服务器配置表；密钥加密存储）
- `electron/main/services/externalMcp*`（连接、list_tools、健康检查；主进程 only）
- `electron/main/ipc/*` + `electron/preload/index.ts`（窄 IPC：list/save/test/delete）
- `src/components/Settings/`（或 AI 配置区）外部 MCP 面板
- `tests/unit/externalMcp*.test.ts`

**Produces：** 增删改/启停/连通测试/`list_tools`；Renderer 无明文常驻密钥回显；失败可诊断。

- [x] **Step 1:** Migration + repository 单测  
- [x] **Step 2:** 主进程连接与 list_tools（mock 传输）单测  
- [x] **Step 3:** 设置 UI + README（区分「本机研究访问」服务端 vs 本面板客户端）  
- [ ] **Step 4:** 手工：配置假/真服务器，能列出 tools  

### Task M1：MCP Tool 投影进 ToolRegistry + 挂聊天（子期 B）

**Files（预期）：**
- `electron/main/agent/tools/mcp*` 或 `registerMcpProjectedTools`
- 扩展 `networkGate` / HITL：MCP 工具按映射 sideEffect 过闸
- `AIAnalysis` 时间线已能展示通用 tool 事件（复用第一期）
- 单测：开关关闭拒绝；白名单外拒绝；结果截断

- [x] **Step 1:** 投影命名、schema、sideEffect 映射单测  
- [x] **Step 2:** Orchestrator 可调用；审计含 serverId/toolName  
- [ ] **Step 3:** 对照 spec §8 第 11–12 条手工验收  

### Task M2：深度研究挂 MCP（子期 C）

**Files（预期）：**
- researchAgent 工具面或桥接：仅授权 MCP 工具可被 runner/主 Agent 补证路径调用
- 账本投影与证据视图可追溯
- 单测：主体/asOf 约束；门禁不因 MCP 原文绕过

**实现要点（方案 A）：** 受控工具 `mcp.invoke`（serverId + toolName + arguments + subjectRef + asOf）；enabled + 联网开关 + 主体绑定；结果 `partial` / secondary 外源样本落账；门禁不因 MCP 原文 complete。

- [x] **Step 1:** 契约单测（投影进证据、失败降级）  
- [x] **Step 2:** 实现桥接  
- [ ] **Step 3:** 对照 spec §8 第 13 条验收  

---

## 提交节奏（用户要求提交时）

1. `feat(agent):` ToolRegistry + Orchestrator 框子  
2. `feat(agent):` 种子 Tool + deep_start  
3. `feat(agent):` IPC 与 AI 分析时间线  
4. `feat(agent):` 外部 MCP 客户端（第二期，可再拆 commit）  
5. `docs:` README / spec 状态与检核  

---

## 设计初衷检核（完成后填写）

| Spec 项 | 结果 | 说明 |
|---|---|---|
| 北星：本地投研 Agent / 多源数据 / 单交互面 | 部分 | 框子与主路径已接；多源外置 MCP 仍属第二期 |
| 目标驱动 Planner–Executor；复杂任务有计划/完成条件/缺口/修订 | 单测通过 | 待手工验收 |
| 模型/Provider 与框子解耦；确定性 mock 可验收状态机 | 通过 | |
| HITL 仅写操作；联网走持久开关 | 通过 | Settings 开关 + gate 单测 |
| 联网默认关闭；开启后自主联网；关闭阻断 | 单测通过 | 待手工 3a |
| 深挖作异步 SubAgent；waiting → terminal → 幂等 continuation | 部分 | 启动/桥接/幂等闸门有；完整报告续总结待加深 |
| 独立 agent-turn 协议（不混用 researchAgent tool_batch） | 通过 | |
| 复用 session 串行锁 | 通过 | agentTurnService |
| ToolRegistry 可扩展；多源（含后续 MCP）可挂 | 通过 | 第一期预留 |
| 时间线统一 agentEvent | 通过 | UI 已消费 |
| 无荐股/窄 IPC/可测 | 通过 | Skill 禁止项 |
| README 已更新 | 通过 | AIAnalysis / Settings |
| （第二期）外部 MCP A/B/C | A+B+C 代码落地 | M0–M2 单测绿；§8 第 11–13 条手工待用户 |

**总评：** 第一期框子与第二期外部 MCP（M0–M2）代码与单测已落地；请用户重启应用后做 §8 / 联网门禁手工验收，再补全检核结论。  
**检核人 / 日期：** （待填）

---

## 修订记录

- 2026-08-11：初稿；按用户要求文首写入产品目标/北星；方案 1 + ReAct A + HITL「几乎不问」。  
- 2026-08-11：锁定联网持久开关：默认关闭；用户开启后 Agent 自主决定联网，不逐次确认；关闭时主进程阻断新联网调用。  
- 2026-08-11：北星改为「OpenClaw 融入本平台」；自适应深度；修正独立动作协议、session 锁、深挖 busy 不自锁、入口收敛与 tool 失败回注。  
- 2026-08-11：完成 OpenClaw commit `46bdbe585f96663d6ecff932ad6790d6cd26e3a3` 源码测绘后，收敛为「借鉴契约，不抄栈」；默认自主实现，不引入其运行时依赖，仅极小独立函数允许另行评估 MIT 改编。  
- 2026-08-11：用户确认先解决框子智能化：第一阶段升级为目标驱动 Planner–Executor，模型/Provider 建设排除；保留任务/能力/上下文/事件/审计契约，后续按评测门槛演进到通用多 Agent。  
- 2026-08-11：按用户要求把二开北星与外部 MCP（A/B/C）**补充进本文与同日 design**；第一期 Tasks 不变；新增「第二期 Tasks」M0–M2。  
- 2026-08-12：用户批准执行第一期；本机研究访问改为旁路表述。  
- 2026-08-12：第二期 M0–M2 代码落地；M2 采用方案 A（`mcp.invoke`）；待手工验收。  

