# AI 分析 Agent 助手框子（方案 1）设计

**状态：** 第一期 + 第二期 M0–M2 代码已落地（2026-08-12；相关单测绿；待手工验收 §8 第 11–13 条 / 联网门禁）  
**日期：** 2026-08-11  
**Plan：** [`../plans/2026-08-11-ai-analysis-agent-hub.md`](../plans/2026-08-11-ai-analysis-agent-hub.md)  
**参考：** SharkMind 2.0（`AgentOrchestrator` / `ToolRegistry` / `SessionContext` / Skill + SubAgentTool）；本仓库 Phase1/2a 本地投研 Agent、流式输出、深度研究自动启动

## 1. 产品目标（北星）

**本应用就是本地投研 Agent**：日常仍是**一个交互页**（AI 分析）；人交代目标，Agent 自主编排取数、核对、深挖与收敛。  
**数据来源是多方面的**：本地库是底座；公开接口、受控搜索、用户配置的**外部 MCP** 等，一律经主进程 Tool 边界进入，可审计、可追溯——不是模型记忆补齐，也不是再造一个外挂聊天机器人。

OpenClaw / 上游初衷仅作编排形态参考；**二开产品以本节北星为准**（见 §10 修订）。

### 一句话

> 本地投研 Agent × 多源数据（本地事实 + 受控联网/MCP）× 可追溯证据账本。

### 用户侧体感

- **平时**：就是一个对话/交互页，不学菜单迷宫。
- **它够灵活**：简单问题直接答；要事实就自己读持仓/行情/基本面；要核对或补缺就走多源 Tool；要证据就启动深度研究；写改删才问人。
- **人补的是能力**：缺 Tool / Skill / 外部 MCP 服务器可以后续接入；入口形态不变。

### 多源数据模型（Agent 用的事实地基）

| 来源类型 | 用途 | 本期关系 |
|---|---|---|
| 持仓与组合事实 | 本地只读 Tool（默认不含成本价） | 第一期种子 |
| 行情 / 基本面缓存 | 本地快照 Tool；刷新策略后挂 | 第一期种子 |
| 研究会话与证据账本 | 可追溯依据；对比与审计 | 第一期复用 |
| 深度研究 runner | 作为 SubAgent Tool，进度回同一对话 | 第一期种子 |
| 既有 skills / 方法论 | 剧本化 Skill（第一期薄，接口先立） | 第一期接口 |
| 应用内受控联网（如既有 `web.search` / 公开接口） | 门禁要求时补网证、核对公开资料 | 经联网开关；配置入口可后续理顺 |
| **外部 MCP（客户端）** | 用户自配服务器：联网、数据补充等任意白名单工具 | **第二期起**（§4.4）；ToolRegistry 第一期预留挂载点 |
| 本机研究访问（MCP **服务端**） | 把本地事实只读暴露给 Cursor 等**外部** Agent | **旁路/非主路径**（代码有入口，非本应用 Agent 的多源能力）；与「外部 MCP 客户端」方向相反，不互相替代 |

### 已确认产品决策

| 项 | 决策 |
|---|---|
| 形态 | **本地投研 Agent**：单交互面 + 自主判断深度；非「指令式流水线页」 |
| 数据 | **多源**：本地优先；外源（公开接口 / 搜索 / 外部 MCP）经主进程受控 Tool 进入 |
| 自主模式 | **目标驱动 Planner–Executor** — 简单目标可生成零步计划直接回答；复杂目标先形成可修订计划，再逐步取数、补证据、检查缺口与收敛 |
| HITL | 本地只读免确认；联网受持久开关约束（见下）；**写持仓 / 改配置 / 删数据**必须确认 |
| 联网授权 | **持久开关** — `允许 Agent 联网` 默认关闭；开启后 Agent 自主决定是否联网 Tool（含映射为 network 的 MCP 工具），不逐次确认；关闭时阻断新联网调用 |
| 架构 | **方案 1** — 现有 AI 分析会话上叠主进程编排层；平台能力与外部 MCP 投影一律包装为 Tool |
| 外部 MCP | **要做**（聊天 + 深度研究两边都要用）；**分期**：先配置/连通，再挂聊天，再挂深度研究（§4.4）。不塞进第一期框子实现任务 |

## 2. 问题与动机

当前工作台仍偏「指令式」：用户要点建议卡、填/确认表单、等旁路面板跑完。深度研究、行情刷新、持仓简报等能力散落，主对话不会主动编排。平台数据已够用，缺的是 **OpenClaw 式自主编排壳**，把已有地基接进同一个交互页。

## 3. 非目标（本设计与第一期实现）

- 不 vendoring OpenClaw Gateway、Agent runtime、Tool/Skill 或多通道栈，也不把 OpenClaw 作为运行时依赖；只借鉴其边界与生命周期设计（见 §4.1）。若实现阶段确认某个工具函数完全独立且复制优于自写，须单独记录来源并保留 MIT 版权与 NOTICE。
- 不一次迁完所有业务模块（产业研究自动生成、持仓批量预测批跑等可后挂 Tool）。
- 第一阶段不建设模型选择、Provider 路由、模型能力评测或“换模型提智”；推理调用只作为可注入依赖，验收只评价框子是否正确规划、执行、恢复与收敛。
- 第一阶段不实现通用动态多 Agent 调度、并行竞速、Agent 间自由通信或仲裁；只保留演进所需的任务、能力、上下文、事件和审计契约。
- **第一期不实现外部 MCP 客户端**（配置 UI、进程托管、tool 投影、挂聊天/深度研究）——列入本设计 §4.4 第二期起；第一期只保证 ToolRegistry / 联网闸门契约可挂载。
- 不把「本机研究访问」（MCP 服务端）改造成外网搜索配置口；二者方向相反，并行保留。
- 不强制用内置 Tavily「增强搜索」作为唯一联网方案；多源下它是可选回退之一，配置入口可与 MCP 分期理顺，不阻塞第一期框子。
- 不新增荐股、收益承诺、自动交易、仓位控制。
- 不削弱风险提示；Renderer 仍不持凭据 / DB / 任意网络（含 MCP 凭据与 stdio）。
- 不把「仅聊天闲聊」强制变成重型深度研究 run（0 tool 短循环允许直接回答）。
- 不删除现有 researchAgent runner / 证据账本；改为可被主 Agent 调用。
- 第一期不做预算上限 UI（仅 maxSteps / tool_result size cap）。

## 4. 架构

```text
Renderer: AIAnalysis = Agent 工作台
  - 气泡时间线：plan / status / tool_call / tool_result / message（流式，不暴露隐藏推理）
  - 写操作确认 UI（仅 HITL 闸门）
        │ 窄 IPC
Main: AgentOrchestrator（Planner–Executor）
  ├─ GoalState（目标、完成条件、约束、状态）
  ├─ PlanState（步骤、依赖、证据缺口、attempt、状态）
  ├─ SessionContext（sessionId、facts fingerprint、auth 不含密钥明文落库）
  ├─ CapabilityRouter（按步骤需要选择 Tool / Skill / SubAgent；不做模型路由）
  ├─ CompletionEvaluator（对照目标/完成条件判断继续、重规划或结束）
  ├─ ToolRegistry（name → handler；版本号可演进）
  ├─ SkillLoader（可选；SKILL.md 剧本；第一期可薄，先留接口）
  └─ Tools（种子 + 后续可加）
        local.portfolio_facts
        local.quote_snapshot / fundamentals_read
        research.deep_start（包装现有 researchAgent startRun，作 SubAgent）
        … industry / refresh / … 后续注册
联网 Tool → 主进程读取持久化开关；关闭则拒绝，开启则允许 Agent 自主调用
写路径 Tool → requiresConfirmation=true → 暂停等用户 → 再执行
```

### 与现状关系

| 现状 | 变化 |
|---|---|
| `ai:followUp` 纯模型回合 | 升级为（或旁路调用）Orchestrator 一轮；可 0..N 次 Tool |
| `ResearchAgentPanel` 旁路 | 深挖由主 Agent 调 `research.deep_start`；进度/delta 汇入同一会话时间线 |
| suggest → 禁弹窗自动 start | **过渡路径**：框子就绪后以 Agent 自主 `research.deep_start` 为主；suggest 卡片降为手动兜底或移除（见 plan Task 7） |
| `ai_analysis_sessions.messages` | 仍为用户/助手消息真相；结束时一次权威写入，避免流式覆盖互踩 |
| Agent 执行账本 | 独立保存 turn / plan revision / step / observation / terminal；消息不承担运行恢复，账本不伪装成聊天消息 |
| 流式 `ai:followUpDelta` / `researchAgent:delta` | 主路径统一为 `ai:agentEvent`（plan/status/tool/message）；深挖 progress/delta **桥接**进同一通道，避免三套并行 |

### 借鉴 SharkMind（契约层，非抄栈）

- 统一 Agent 入口 + SSE/IPC 事件时间线  
- ToolRegistry 按名绑定  
- SessionContext 注入 Tool，而非前端反复填表  
- Skill = 剧本 + 资源 + tool 白名单（第二期可加深）  
- SubAgent 当 Tool；HITL 仅挂在写操作  

### 4.1 OpenClaw 借鉴策略（借鉴契约，不抄栈）

上游：[openclaw/openclaw](https://github.com/openclaw/openclaw)（**MIT**，TypeScript；文档 [Agent runtime](https://docs.openclaw.ai/concepts/agent)）。

**产品对齐：** OpenClaw = 单助手 + 自主 Tool/Skill；本平台 = 同一交互面 + **已积累投研数据作地基**。

**第一期推荐借鉴的五项经验：**

| 借鉴经验 | 本仓库落点 |
|---|---|
| Agent loop：允许 0..N Tool，设 maxSteps 与重复调用熔断 | `electron/main/agent/orchestrator.ts` |
| Tool 最终执行边界：参数校验、权限、超时/取消、结果截断 | ToolRegistry + network/write gate + 统一执行包装器 |
| 事件强终态：每轮必须且只能以 done / error / cancelled 结束 | `ai:agentEvent` 时间线与 turn 状态 |
| SubAgent 闭环：启动、等待终态、回传、主 Agent continuation | `research.deep_start` + 既有 researchAgent runner |
| Skill 快照：记录内容 hash / 版本与本轮可用 Tool | `electron/main/agent/skills/` + Agent turn 审计 |

**明确不搬进来（第一期）：**

- Gateway 多通道（WhatsApp/Telegram/…）、Control UI 整仓、Companion 移动端  
- 以其 `~/.openclaw` 工作区替代本应用 SQLite 会话账本  
- 把 OpenClaw 当子进程黑盒跑完整助手（集成成本与安全边界失控）  

**落地原则：**

1. 默认由 RT-ResearchFlow 结合现有 Electron、SQLite、会话锁、证据账本和 researchAgent runner 自主实现，只对照 OpenClaw 的状态、边界与失败语义。  
2. 不引入 `openclaw`、`@openclaw/agent-core` 或 plugin-sdk 作为运行时依赖；不复制 Gateway、通道、通用 exec/sandbox、远程节点、完整插件/Skill 安装体系。  
3. 只有完全独立、依赖极小且复制明显优于自写的工具函数，才可在实现阶段单独评估改编；一旦复制，文件头和第三方声明必须记录固定上游 commit、路径与 MIT。  
4. Plan Task 0 记录已核验的上游 commit 与 borrow map；后续上游变化不自动改变本仓实现契约。

### 4.2 框子智能化定义（第一阶段）

“智能”由框子的闭环能力定义，不由具体模型或 Provider 定义：

1. **Goal**：把用户输入固化为目标、约束、非目标与可检查的完成条件；信息不足时先形成明确缺口，不凭空假设。
2. **Plan**：复杂目标拆成有序步骤；每步声明 `capabilityNeed`、依赖、预期产物和完成判据。简单目标允许零步计划直接回答。
3. **Act**：CapabilityRouter 从本轮允许的 Tool / Skill / SubAgent 中选择能力；框子执行前统一做 schema、权限、联网、超时与取消校验。
4. **Observe**：把结果转为有界 observation，记录新事实、证据引用、失败类别与仍未解决的缺口。
5. **Evaluate / Replan**：每步后由 CompletionEvaluator 确定 `continue | replan | wait_subagent | complete | blocked`；同一失败不得无意义重试，计划修订须保留 revision。
6. **Finalize**：只有完成条件满足或明确说明未满足原因时才能结束；最终回复列出依据、未决缺口与实际调用能力。

框子状态必须可持久化、可恢复、可审计；应用重启后不得把 `running/waiting_subagent` 静默当作完成，也不得重复提交可能计费的 SubAgent。

### 4.3 向通用多 Agent 演进

- **第一阶段（本设计）**：一个主 Planner–Executor；深度研究是一个有类型的异步 SubAgent，完成后回到主 Agent continuation。
- **第二阶段（后续修订）**：增加多个预注册、能力受限的专业 SubAgent；主 Agent 可按计划串行或受控并行委派。
- **第三阶段（目标方向）**：在真实需求与评测证明必要后，增加动态分工、并行调度、共享任务图、结果仲裁与冲突处理。

第一阶段为后续保留 `agentId/role`、`taskId/parentTaskId`、`capabilityProfile`、隔离上下文、统一终态事件和共享审计账本；但不实现通用 swarm scheduler。进入第三阶段的门槛是：单 Agent 在已知任务集上因上下文、时延或专业能力边界持续失败，并且多 Agent 原型能在确定性评测中显著改善完成率或时延。

### 4.4 外部 MCP 客户端（多源之一；第二期起）

**目标：** 用户配置外部 MCP 服务器，使本应用 Agent（聊天编排 + 深度研究）能调用其 tools，用于联网核对、数据补充等——与「本机研究访问」互补而非替换。

**硬边界（各子期共通）：**

- 主进程托管连接（stdio / 已批准传输）；Renderer 不持 MCP 密钥、不直连、不起子进程。  
- Tool 投影进统一 `ToolRegistry`：schema 校验、超时/取消、结果截断、审计事件与既有 HITL / **允许 Agent 联网** 闸门一致。  
- `sideEffect` 按工具声明映射：默认偏保守；会出网的映射为 `network`；会改本地库/配置的映射为 `write`。  
- 不引入 OpenClaw 式 `npx skills add` 安装器；用户显式添加服务器条目（命令、args、env、启停）。  
- 深度研究侧：MCP 结果必须落入可追溯投影/账本语义，不得用「模型记忆」绕过证据门禁。

**分期（写入本设计；实现任务见 plan「第二期」）：**

| 子期 | 交付 | 验收要点 |
|---|---|---|
| **A 配置 + 连通** | 设置区管理外部 MCP：增删改、启停、测连通、列出 tools | 能保存配置并成功 `list_tools`；失败可诊断；无自动调用 |
| **B 挂 AI 聊天** | Orchestrator 可按白名单调用已启用 MCP tools | 时间线可见 tool_call/result；联网开关关闭时拒绝 network 类；写类 HITL |
| **C 挂深度研究** | 受控工具面可调用 MCP（或映射补证能力） | 调用进研究账本；门禁与 asOf/主体约束仍成立；失败可降级说明 |

**与内置增强搜索：** 不作为第一期必做入口；MCP A/B 可用后，内置搜索可降为可选回退，另开小修订理顺 UI 文案即可。

## 5. 数据与事件

### SessionContext（主进程内存 + 必要持久化指针）

- `sessionId`、`userGoal`（本轮用户原文）、`asOf`、已读取事实摘要指纹  
- Tool 通过 context 读 DB / 调服务；Renderer 不上传任意库内容  

### Agent 执行账本

- `agent_turn`：`requestId`、`sessionId`、目标、完成条件、当前 plan revision、状态、唯一终态、时间。
- `agent_step`：稳定 `stepId`、`agentId/role`、`taskId/parentTaskId`、依赖、capabilityNeed、attempt、状态与 SubAgent runId。
- `agent_observation`：有界结果摘要、证据引用、失败类别、剩余缺口与内容 hash；敏感原文仍留在既有权威账本。
- 每次状态跃迁在事务中校验前态；恢复只继续 `running/waiting_subagent` 的合法下一步，已 terminal 的 turn 不重放副作用。

### Agent 事件（建议 IPC：`ai:agentEvent`）

| event | 含义 |
|---|---|
| `start` | 本轮开始（requestId） |
| `plan` | 对用户可见的步骤/修订摘要；不暴露隐藏推理 |
| `status` | 当前步骤、等待、重规划或恢复状态 |
| `tool_call` | 即将/正在调用（name、args 摘要、无密钥） |
| `tool_result` | 结果摘要（截断；完整证据走既有账本） |
| `message` | 对用户可见正文增量 |
| `hitl` | 需要确认（写操作） |
| `done` / `error` | 结束 |

结束后一次权威 `getSession` 刷新；流式中途不多次整表覆盖 `messages`。

### HITL

- Tool 元数据：`sideEffect: 'read' | 'network' | 'write'`  
- `write` → 推 `hitl`，等 `ai:agentConfirm` 后继续；拒绝则取消该 Tool 并总结  
- `read` 直接允许；`network` / 深度研究启动由主进程读取 `允许 Agent 联网` 持久开关：关闭则拒绝并提示用户去设置开启，开启后不逐次弹确认，允许 Agent 自主判断是否调用。  
- 开关默认关闭；关闭只阻断尚未提交的新联网调用，不伪装成取消已经提交的远端请求；运行中的深度研究仍按既有暂停/取消能力处理。每次联网 Tool 调用必须在 Agent 审计轨迹中记录 Tool、时间、开关快照和结果。  

### 联网开关

- 设置入口放在应用设置的 AI / Agent 区域，文案固定为「允许 Agent 联网」，并说明开启后 Agent 会按任务自主使用网络与产生相应模型/数据成本。
- 值持久化到 `app_settings`，建议字段 `ai_agent_network_enabled INTEGER NOT NULL DEFAULT 0 CHECK (ai_agent_network_enabled IN (0, 1))`；数据库变更必须使用向前 Migration。
- Renderer 只读写这个布尔偏好；真正的授权校验发生在主进程 Tool 执行边界，不能依赖按钮禁用或模型自律。
- 本开关只授权 Agent 框子内注册为 `network` 的 Tool，不自动改变盘前采集等已有独立联网开关，也不绕过各 Tool 的域名、请求头、超时和证据白名单。

## 6. 种子 Tool（第一期）

1. `local.portfolio_facts` — 复用持仓简报事实（无成本价默认）  
2. `local.market_snapshot` — 只读本地/已授权行情快照（复用既有 quote 路径）  
3. `local.fundamentals_read` — 只读已缓存基本面  
4. `research.deep_start` — 包装 `researchAgent:startRun`；入参含会话上下文包（全文对话摘要 + 标的），**禁止**再弹预检窗  

后续（本设计允许注册，第一期可不实现）：`industry.*`、`market.refresh`、`config.*`（write+HITL）、**`mcp.*` 投影 Tool**（§4.4）等。

## 7. Skill（第一期薄、接口先立）

- 目录约定可对齐仓库 `skills/` 或 `electron/main/agent/skills/`  
- 第一期：Orchestrator 系统提示列出已注册 Tool；可选加载 1 个默认「投研助手」SKILL 短剧本  
- 完整 intent-classifier + 多 Skill 热加载 → 后续 plan  

## 8. 验收标准

1. 用户只说目标（如「看看我的持仓今天要注意什么」），主 Agent 能**自动**调用至少一种本地事实 Tool，再给出有依据的回复（无用户逐步点「取数」）。  
2. 复杂目标生成可见计划；每步具备完成判据，Tool 结果会更新事实/缺口；失败可改道或修订计划，而不是机械重复调用。  
3. 用户说「深挖 XX」，主 Agent 能自动调用 `research.deep_start`，进入 `waiting_subagent`；run 终态后幂等 continuation 并对照原目标形成最终总结。  
4. 联网开关默认关闭：Agent 选择联网 Tool 时主进程拒绝且不发出网络请求；用户开启后，同一类目标可由 Agent 自主联网且不逐次确认；再次关闭后新的联网调用立即被阻断。  
5. 尝试写持仓/删数据类 Tool 时出现确认，未确认不执行。  
6. 运行中断后可恢复 plan/step/observation；不会重复提交已启动的深度研究；每个 turn 都有唯一终态。  
7. 同一套确定性 mock 场景在不同推理实现下都通过框子状态机验收，第一阶段不以模型选择作为通过条件。  
8. ToolRegistry 可单测：注册、按名解析、未知 Tool 失败清晰。  
9. 无荐股/自动交易文案；凭据不进 Renderer；CI 无真实付费依赖。  
10. `AIAnalysis/README.md` 与 `Settings/README.md` 更新目标驱动 Agent、联网授权与 FR。  

**第二期起（§4.4，不计入第一期通过条件）：**

11. A：设置中可配置至少一种外部 MCP 传输，连通测试能列出 tools。  
12. B：开启联网开关后，聊天 Agent 能成功调用白名单 MCP tool 并在时间线展示摘要。  
13. C：深度研究运行可调用已授权 MCP 补证，结果进入账本且可在证据视图追溯。  

## 9. 风险与对策

| 风险 | 对策 |
|---|---|
| 与 `followUp` / 深度研究抢写 messages | **复用**既有 session 串行锁（`runDiscussionFollowUpWithinLock` 同类）；禁止另起并发写 |
| Agent 自启深挖后 session busy | **用户新 turn 拒绝**（明确忙碌文案）；**Agent 自己桥接的 progress/delta 放行**，避免自锁 |
| Planner–Executor 死循环 | `maxSteps`、重复 action 指纹熔断、每步完成判据、失败分类、plan revision 上限与唯一终态 |
| 模型乱输出 / Tool 失败 | 错误观察回注循环；可再试或 final 说明失败原因（单测覆盖） |
| 用户误以为开启后仍会逐次询问 | 开关旁明确说明「开启后 Agent 可自主联网」；联网调用进入可折叠审计时间线 |
| Renderer 绕过联网门禁 | 主进程 Tool 执行边界每次读取设置并拒绝；Renderer 状态仅用于展示 |
| 时间线噪音 / 隐藏推理泄露 | 只展示 plan/status/tool/message 摘要；不传输或持久化隐藏推理 |
| 范围膨胀 | 第一期只框子+种子 Tool；产业/批跑/外部 MCP 客户端后挂（§4.4） |
| 混淆本机研究访问与外源 MCP | 文档与设置文案区分「MCP 服务端（对外只读）」与「MCP 客户端（对内补数）」 |
| MCP 工具面过大 / 供应链风险 | 白名单启用、结果截断、network/write 闸门、禁止 Renderer 起进程 |

## 10. 修订说明

- 2026-08-11：初稿；用户确认方案 1 + 全自动 ReAct + HITL「几乎不问」。  
- 2026-08-11：用户确认联网采用持久开关；默认关闭，开启后 Agent 可自主决定联网，不逐次确认。  
- 2026-08-11：北星改为「OpenClaw 融入本平台」：单交互面 + 自主判断深度；平台已积累数据为 Tool/事实地基；并写明会话锁、深挖 busy 不自锁、独立 Agent 动作协议（不与 researchAgent tool_batch 混用）。  
- 2026-08-11：完成 OpenClaw 本地源码测绘后收敛为「借鉴契约，不抄栈」：第一期只吸收 Agent loop、Tool 执行边界、事件强终态、SubAgent 闭环、Skill 快照五项经验；默认自主实现，不引入其运行时依赖。  
- 2026-08-11：用户确认第一阶段采用目标驱动 Planner–Executor，优先解决框子智能化；模型/Provider 建设排除。后续以受控专业 SubAgent 演进到通用多 Agent，但第一阶段不实现 swarm 调度。  
- 2026-08-11：**二开北星修订**——明确产品为「本地投研 Agent + 多源数据」；补充 §4.4 外部 MCP 客户端（聊天+深度研究，分期 A/B/C）；厘清与本机研究访问（MCP 服务端）的关系；第一期仍只做框子+种子 Tool，MCP 实现列入第二期。  
- 2026-08-12：用户批准并要求执行；本机研究访问标为旁路/非主路径；进入第一期实现。
- 2026-08-12：第二期 M0–M2 代码落地（配置/聊天投影/深度研究 `mcp.invoke`）；待对照 §8 第 11–13 条手工验收。
- 2026-08-12：深度研究用户可见面改为聊天时间线投影（one-page / `DeepResearchTurnView`）；权威审计仍在 researchAgent 账本，不与「账本不伪装成胡编消息」冲突——用户看到的是投影。


