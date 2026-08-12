# AI 分析 One-Page：深度研究并入聊天时间线

**状态：** 已完成实现（待手工验收）  
**日期：** 2026-08-12  
**方法论：** SDD  
**Plan：** [`../plans/2026-08-12-ai-analysis-onepage-deep-research.md`](../plans/2026-08-12-ai-analysis-onepage-deep-research.md)  
**关联：**
- [`2026-08-11-ai-analysis-agent-hub-design.md`](./2026-08-11-ai-analysis-agent-hub-design.md)（北星：单交互页；`ResearchAgentPanel` 已标为旁路）
- [`2026-08-11-deep-research-auto-start-design.md`](./2026-08-11-deep-research-auto-start-design.md)（建议卡 → 自动 `startRun`；本设计替换「展示运行账本面板」的 UI 结论）
- 模块 README：`src/components/AIAnalysis/README.md`

## 1. 问题

AI 分析左侧「分析记录」可用，但右侧**不是 one-page**：

- 讨论主区是聊天；
- 深度研究跑起来后，中央区底部常驻 `ResearchAgentPanel`（约 `max-h-[40vh]` 账本：运行列表 + 报告/证据 Tab），体感像**又开了一扇关不掉的窗**；
- 结论与过程不在同一条助手回复里，和 ChatGPT / Codex「一个页面看完思考过程 + 回答」的主流心智冲突。

根因不是缺能力，而是 **深度研究被做成第二套 UI 表面**，而不是「同一次聊天里更长的思考过程」。

## 2. 产品心智（已确认）

> **深度研究不是另一种产品形态。**  
> 它只是同一条聊天里「思考过程更多、工具更多」；对用户来说，返回的仍然是一条助手回复（结论正文）。过程可折叠查看，证据可折叠查看——和 ChatGPT 的 thinking / sources 同构。

与既有北星一致：本地投研 Agent × 单交互页 × 可追溯证据账本（账本仍在主进程持久化，**不伪装成胡编**；只改呈现，不删审计）。

## 3. 目标

1. **讨论会话右侧主区 = 单一聊天时间线 + composer**；深度研究进行中/完成后不再出现常驻半屏账本面板。
2. 一次深度研究在时间线上呈现为 **一条（或一轮）助手消息结构**：
   - **过程**（可折叠，**默认折叠**；用户按需展开）：阶段进度、工具摘要、门禁/降级提示（对标 ChatGPT thinking）；
   - **结论正文**（主内容）：报告/综合结论 Markdown；
   - **来源 / 证据**：由内嵌详情「证据」Tab 承担（不另开常驻窗）。
3. 历史 runs 以时间线内历史消息/块形式存在，不再用常驻「运行列表 | 账本」双栏。
4. 启动路径保持既有：建议卡确认 / Agent `research.deep_start`；**不**恢复预检表单为默认路径。
5. 会话 busy、全局单 running 租约、证据门禁、不荐股/不自动交易等硬边界不变。

## 4. 非目标

- 不删除主进程 `researchAgent` runner、证据账本表或审计 hash 语义。
- 不把完整证据原文无截断塞进 `messages` JSON（防膨胀与并发覆盖风险）；UI 投影可引用 runId / 证据 id，按需 IPC 拉取。
- 不改造普通文章会话的右侧「研判侧栏」（非 discussion 路径）；本设计聚焦 **研究讨论 / 深度研究** one-page。
- 不恢复 Phase 2a 已移除的深度/产业二级导航；不复活 `DeepResearchWorkbench` 为默认入口。
- 不做模型 Provider 路由、多模型竞速、或新的独立「深度研究页」。
- 不新增荐股、收益承诺、自动交易。

## 5. 信息架构

```text
AI 分析
├─ 左：分析记录（不变）
└─ 右：单一工作区
   ├─ 顶栏：讨论上下文（不变）
   ├─ 中：消息时间线（唯一主表面）
   │     · 普通 user / assistant 气泡
   │     · Agent Hub 时间线（plan / tool / HITL）
   │     · 深度研究回合 = 过程折叠 + 结论 + 来源折叠
   └─ 底：composer（深挖 busy 时仍禁用追问，文案说明「研究进行中」）
```

**退场：**

| 现状 | 本设计 |
|---|---|
| `ResearchAgentPanel` 底部常驻账本 | **默认不渲染占位**；逻辑迁入时间线投影组件 |
| 预检全屏 modal | 仍仅兜底（无主体等）；非常驻 |
| `DeepResearchWorkbench` 整页 | 保持非导航可达 / 遗留，不作为本需求主路径 |

## 6. 消息 / 事件形态

### 6.1 运行中

- 主进程继续推送 `researchAgent:progress` / `researchAgent:delta`，并**桥接** `ai:agentEvent`（与 Agent Hub 设计一致）。
- Renderer 在时间线渲染 **进行中块**（`data-testid` 建议：`deep-research-turn` / `deep-research-thinking`）：
  - 标题行：如「深度研究进行中 · {简短问题或标的}」；
  - 过程区：阶段文案 + 可选写作草稿（现有 stream draft 迁入此处）；
  - **不**再挂载底部 `research-agent-panel` 双栏。

### 6.2 终态（完成 / 失败 / 取消 / 降级）

- 同一块转为终态助手结构：
  - 过程折叠保留（可回看）；
  - 结论区写入报告 Markdown 或失败/降级说明（用户可见主文）；
  - 来源折叠：证据摘要列表；点条目可打开只读详情（抽屉或消息内展开），**关闭后回到同一聊天**，不残留第二窗。
- 权威数据仍以 DB run + 证据账本为准；若需写入 `messages`，仅存**有界投影**（runId、状态、结论摘要指针、证据 id 列表），大正文按需 `getRun` / 既有 IPC 读取。避免与 Agent 回合并发整表覆盖冲突：深挖 busy 期间本就不允许用户追问写 `messages`。

### 6.3 与 Agent Hub 时间线关系

- Agent 自主 `research.deep_start`：主时间线先出现 tool_call/result 摘要，随后（或合并为）上述深度研究回合块；**禁止**再弹出底部账本。
- 手动建议卡启动：同样只进入时间线块。
- HITL / 联网闸门提示仍用既有 `agent-hitl-bar` / `agent-network-hint`，不塞进深度研究过程折叠冒充「模型思考」。

### 6.4 多 runs

- 同一会话多次深挖 = 时间线上多条历史回合块（按时间顺序）。
- 不再提供常驻左侧「3 次运行」列表；若需跳转某次结论，滚动时间线或消息内锚点即可（第一期可不做复杂目录）。

## 7. 组件边界（实现指引）

| 单元 | 职责 |
|---|---|
| `DeepResearchTurnView`（新，名可微调） | 单次 run 的过程/结论/来源 UI；订阅 progress 或读 run 快照 |
| `agentTimelineModel` / 会话消息合并层 | 把 run 状态投影进可见时间线顺序 |
| `ResearchAgentPanel` | **拆除常驻布局**；预检 modal / 确认框可保留为薄封装，或内联到 `AIAnalysis` |
| 主进程 researchAgent\* | 行为契约不变；必要时增加「面向时间线的摘要 DTO」IPC（窄、只读） |

不在本设计强制一次重写 runner；优先 **UI 投影切换**。

### 7.1 实现质量门禁（强制）

- **Code review：** 每个实现任务合入前做缺陷优先审阅（重复逻辑、死代码、双路径 UI、testid/文案分叉）。
- **反冗余：** 过程/工具展示优先复用 `agentTimelineModel` 与既有折叠块模式（如 `AssistantWebSearchTrace` / researchTrace）；禁止再维护一套与时间线并行的「深度研究专用聊天渲染」。
- **退场干净：** `ResearchAgentPanel` 常驻布局删除后，不得残留半套双栏样式或仅改 `display:none` 的死面板。

## 8. 验收标准

| # | 期望 |
|---|---|
| A | 讨论会话在深度研究 running/completed 时，主区**无**常驻底部账本双栏（无 `research-agent-panel` 占屏，或仅保留 sr-only/测试钩子且不可见） |
| B | running 时用户在**同一时间线**看到过程进度；完成后同一位置看到结论正文 |
| C | 来源/证据可在消息内折叠查看；关闭详情后仍留在同一聊天页 |
| D | 建议卡 / `research.deep_start` 启动路径不回退到默认预检表单 |
| E | 深挖 busy 时追问仍禁用；全局单 running 租约仍生效 |
| F | 证据门禁、降级报告、失败原因仍可被用户看见（在结论或过程区），不静默吞掉 |
| G | 无荐股 / 自动交易文案；不削弱风险提示 |
| H | 更新 `AIAnalysis/README.md` 布局与 FR 描述，与本 spec 一致 |
| I | 无并行双套深度研究 UI；审阅确认无多余面板/重复投影逻辑 |

## 9. 风险与缓解

| 风险 | 缓解 |
|---|---|
| `messages` JSON 过大或并发覆盖 | 大报告不整段写入 messages；busy 锁保持；投影只存指针 |
| 用户找不到「以前那次 run」 | 时间线保留历史块；必要时第二期加轻量「本会话研究」锚点，不作常驻窗 |
| E2E 依赖 `research-agent-panel` | 迁移 testid 到 `deep-research-turn*`；更新 Playwright |
| 与「账本不伪装成聊天消息」旧表述冲突 | 修订语义：**用户可见的是投影**；权威审计仍在账本。在 Agent Hub spec 追加修订说明，不改写其历史目标正文 |

## 10. 修订

- 2026-08-12：用户确认心智——深度研究 = 更长的思考过程，返回形态与普通助手回复相同；按 ChatGPT one-page 设计；批准进入规格归档。
- 2026-08-12：用户确认 spec；补充 §7.1 code review / 反冗余门禁；Plan 已写。
- 2026-08-12：遗留清理——去掉空壳 `deep-research-sources`；证据发现性由内嵌 `ResearchAgentRunDetail`「证据」Tab 承担（见 `2026-08-12-legacy-cleanup-scan-items-design.md`）。
- 2026-08-12：用户反馈「深度分析后刷屏」——过程与 Agent 工作台**默认折叠**；进度文案不直出 JSON。
- 2026-08-12：对齐 Cursor Agent「状态滚动」——主表面只显示 1～3 行活状态；明细点「查看明细/过程」；运行中深度研究不再铺开账本卡片。
