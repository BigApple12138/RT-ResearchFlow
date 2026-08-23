# Agent 回合继承会话历史（ChatGPT 式上下文）设计

**状态：** 已完成实现（2026-08-12；单测绿；待手工验收「深度分析一下」继承持仓）  
**Plan：** [`../plans/2026-08-12-agent-turn-session-memory.md`](../plans/2026-08-12-agent-turn-session-memory.md)  
**日期：** 2026-08-12  
**关联：**  
- [`2026-08-11-ai-analysis-agent-hub-design.md`](./2026-08-11-ai-analysis-agent-hub-design.md)（Agent 主路径）  
- [`2026-08-09-trend-ai-review-and-context-compaction-design.md`](./2026-08-09-trend-ai-review-and-context-compaction-design.md) 与 [修订版](./2026-08-09-trend-ai-review-and-context-compaction-revision-design.md)（讨论压缩契约）  
- 模块 README：`src/components/AIAnalysis/README.md`

## 1. 问题

用户在同一 AI 分析会话里已带入持仓事实并完成简要研判，再发送「深度分析一下」时：

1. `ai:agentTurn` 编排器只把**当前短句**当作 `userMessage` / Goal，**不带入会话历史**。  
2. 推理侧虽经 `buildDiscussionAIRequest` 可能拼上 `promptSent`，但编排循环内的「当前目标」仍是短句；模型常直接 `final`，不调 `local.portfolio_facts` / `research.deep_start`，表现为「失忆 / 要我重新指定标的」。  
3. 讨论侧已有 ChatGPT 式压缩（`promptSent` + 累计摘要 + 热尾部），**Agent 主路径未复用同一套「发模型前装配 + 自动压缩」**，长会话会再次撞限或丢上下文。

已确认产品选择（2026-08-12）：会话账本只存 **user + assistant 最终回复**；plan/tool 只走时间线投影，不把 tool 原文永久写入 `messages`。

## 2. 目标

- Agent 回合与普通追问一样：**不丢会话记忆**；「深度分析一下」能看见本会话已出现的持仓/标的/结论要点。  
- 模型上下文按 ChatGPT 方向管理：`硬事实(promptSent)` + `累计压缩摘要` + `热尾对话` + `当前用户句`；有**自动压缩**与**上下文上限**，不能无限堆全文。  
- 复用既有讨论压缩账本与阈值，**不造第二套记忆表**。  
- `research.deep_start` 启动上下文从**同一套已装配历史**抽标的与对话要点（沿用 `buildResearchDeepStartContext` 契约，改接线）。

## 3. 非目标

- 不把中间 tool_call / tool_result 写成 chat `messages`。  
- 不新增跨会话长期记忆 / 向量库。  
- 不改 Provider 路由或模型选型。  
- 不削弱风险提示；不荐股 / 自动交易。  
- 不替换讨论侧已落地的 compact 表结构；仅让 Agent 路径**同契约消费**。  
- 不在本设计强制「一说深度分析就必须 deep_start」；但须保证模型**看得见历史标的**，且 Skill 引导在缺主体时先 `local.portfolio_facts` 再决定 deep_start。

## 4. 方案对比与决策

| 方案 | 做法 | 利弊 |
|---|---|---|
| **A（采用）** | Agent turn 发模型前：与 `ai:followUp` 相同——必要时自动 compact；编排初始 messages = 压缩装配后的历史 + 当前句；Goal 仍可用当前句，但 system/extra 注入「本会话已有上下文摘要」 | 与讨论记忆统一，改动面清晰 |
| B | 编排器自维护独立 rolling window | 双轨易漂移，压缩规则分裂 |
| C | 仅把上一轮 assistant 拼进当前 user | 仍易失忆，不满足长聊 |

**决策：方案 A。**

## 5. 架构

```text
Renderer: ai:agentTurn({ sessionId, message, requestId })
        │
Main: agentTurnService
  1. session lock（与 followUp/compact/deep 共享）
  2. 若 autoCompactDiscussion 且达阈值 → 先 compact（失败则 toast 语义继续，不卡死）
  3. 读取热消息 + 最新 compaction + promptSent
  4. buildAgentModelMessages(...) ≡ 讨论装配契约
        → promptSent（硬事实）
        → 累计摘要（若有）
        → 热尾 user/assistant（不含 tool 伪消息）
        → 当前用户句（含北京时间前缀）
  5. runAgentTurn({
       userMessage: 当前句,
       priorModelMessages: 装配结果（供 reasoningCall / deep_start 上下文）,
     })
  6. 持久化：仅追加 user + assistant(final)；时间线事件照旧
```

### 5.1 与现有压缩契约对齐（不得另起炉灶）

沿用修订设计硬契约：

- 自动压缩阈值：**未归档 12 个完整 user/assistant 对**；可关 `autoCompactDiscussion`。  
- 热尾保留：**最近 6 条**原文；旧文进 `ai_discussion_message_archives`。  
- 模型上下文：**`promptSent` + 最新累计摘要 + 热消息 + 当前问题**；摘要不得改写硬事实数值/枚举。  
- busy：深度研究 `queued|running|paused` 时拒绝新 agentTurn 与 compact（已有）。  
- requestId 幂等：成功 turn 重放不重复写消息。

Agent 路径在 turn **开始前**调用与 followUp 相同的 auto-compact 判定；失败策略与 followUp 一致（记录警告、继续本轮，不以空历史伪装成功）。

### 5.2 编排器改动

- `runAgentTurn` 增加 `priorModelMessages`（或等价：由 TurnService 注入完整 `initialMessages`）。  
- 初始 `messages` 不得再是仅 `[system, 当前短句]`；应为：  
  - `system`（Skill + tools + 禁止项）  
  - 其后为装配好的历史上下文（可多条 user/assistant；若装配层把 promptSent/摘要合成一条 user，保持与 `buildDiscussionModelMessages` 一致）  
  - 最后一条为**本轮用户句**。  
- GoalState.goal 仍可用当前用户句（短目标），但 **extraSections** 须写明：「须结合上方会话上下文；勿假设空持仓；用户说『深度分析』时优先继承已出现标的」。  
- 多步 tool 循环中新增的 tool 往返只存在**本轮内存 messages**；结束后不回写为 chat messages。

### 5.3 reasoningCall

- `buildDefaultReasoningCall` 使用编排器传入的完整 `input.messages`（已含历史），再走 Provider。  
- **禁止**再次把「只有当前短句」送进模型却声称已继承会话。  
- 若仍调用 `buildDiscussionAIRequest` / `buildDiscussionModelMessages`，须避免**双重拼接** promptSent/摘要：装配只发生一次（推荐在 TurnService 完成，reasoningCall 透传）。

### 5.4 deep_start

- `buildResearchDeepStartContext` 的 `messages` 取自**本轮装配后的对话要点**（至少含热尾 + 当前句；可含摘要文本作为一条 assistant/user 旁注，但不伪造用户未说的话）。  
- 从历史抽取 `tsCode` / 主体；用户仅说「深度分析一下」且历史上有 002628 等时，candidateSubjects 非空。  
- 无主体时：Skill 要求先 `local.portfolio_facts`；仍无则 final 说明缺口——**不得**谎称「本地空上下文」若 promptSent/历史已有持仓 JSON。

### 5.5 上下文限制（防爆）

在既有 12 对 / 热尾 6 条之上，Agent 回合增加**发送前软上限**（实现常量化，单测锁定）：

- 装配后送模字符/估算 token 超上限时：优先依赖已有 compaction；若仍超，截断更早热消息（保留最近 N 条与 promptSent/摘要），并在 system extra 注明「更早内容已压缩/截断」。  
- 单条消息硬截断上限与现有讨论/tool_result cap 对齐风格，避免单气泡拖垮请求。  
- 不引入第二套用户可配「Agent 专用压缩阈值」——与讨论共用 AI 配置开关。

## 6. UI / 文案

- 不改变气泡存储形态；时间线仍展示 plan/tool。  
- 可选：Agent 开跑时 status 一行「已带入本会话上下文（摘要+热尾）」——非必须，验收不依赖。  
- 禁止再出现「明明气泡里有持仓 JSON，Agent 却说本地无持仓记录」的产品体验（除非本地工具真的读空且历史也无）。

## 7. 验收标准

1. 同会话：先发带三只持仓的研判 → 再发「深度分析一下」→ Agent 推理上下文含持仓代码或摘要要点；不得只见短句。  
2. 达 12 对后 agentTurn 前触发与 followUp 相同的 auto-compact；热 JSON 不无限涨。  
3. 压缩后 agentTurn 仍能引用摘要中的标的/结论要点。  
4. tool 中间结果不出现在 `getSession` 的 messages 里；仅 final assistant 落库。  
5. `research.deep_start` 的 context 能从历史抽出至少一只已出现股票（单测）。  
6. 单测：装配不双重拼接；orchestrator 初始 messages 长度 > 2；截断/上限行为；与 followUp compact 共用阈值常量。  
7. 更新 `AIAnalysis/README.md` FR：Agent 与讨论共用压缩装配，禁止失忆。

## 8. 风险

| 风险 | 缓解 |
|---|---|
| 双重拼接 promptSent | 明确单一装配点 |
| Goal 仍是短句导致模型忽略历史 | extraSections + 历史消息同框；单测断言历史在 messages 中 |
| 长 tool 环撑爆本轮内存 | 现有 tool_result size cap；本轮 messages 可截断旧 tool 往返 |
| compact 失败 | 与 followUp 一致：继续 turn，不空写历史 |

## 9. 修订记录

- 2026-08-12：用户确认记忆形态 **A**（会话只存 user+final；tool 不进 messages）；要求 ChatGPT 向继承 + 压缩 + 限长，不能失忆。
