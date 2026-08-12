# AI 交互流式输出（聊天 + 深度研究）— 设计

**状态：** 已实现  

**日期：** 2026-08-11  
**方法论：** SDD  
**用户选型：** **方案 A**（统一 `onDelta` 管道；聊天 token 流；深度研究 = 阶段进度 + 写作步 token 流）  
**关联模块：** `AIAnalysis`、`ResearchAgentPanel` / `researchAgentRunner`、`aiProvider`、`aiFallbackService`、`discussionFollowUpService`  
**非范围：** 持仓预测、今日看板「AI 提炼」、文章两轮分析、产业研究批生成等非交互聊天入口  

## 1. 问题

AI 分析聊天与深度研究写作均采用「整段 await → 一次回写」。用户在等待期间只看到「思考中...」或粗粒度步骤，体感像页面卡住，不符合常见 AI 产品交互标准。

## 2. 目标

1. **研究讨论 / AI 分析聊天**（`ai:followUp` 及 create-and-send）：助手回复 **token（delta）流式展示**。  
2. **深度研究**：保留并强化 **阶段进度**；在 **写作类模型调用**（至少 `synthesis`；若 `planning` 有长文输出也可流）期间推送 **delta**，UI 可见增长中的草稿。  
3. **统一管道**：Provider / Fallback 层提供可选 `onDelta`；批跑入口（持仓预测等）**不传** `onDelta`，行为不变。  
4. **落库与审计不变**：流式过程只更新 UI；**结束时一次性**写入 messages / report，保留 `requestId` 幂等、研究审计、会话锁。  
5. 文案与产品边界不变：不荐股、不自动交易、不削弱风险提示。

## 3. 非目标（v1）

- 不为持仓批量预测、`runPortfolioBrief` 芯片、今日提炼 AI、文章 `ai:analyze` Round1/2 做 token 流。  
- 不在流式过程中多次覆盖写 DB `messages` JSON（避免并发丢消息与半成品污染账本）。  
- 不强制所有 Provider 同步具备同等流式能力；不支持流式时 **诚实降级** 为整段返回（UI 仍可显示阶段/思考态，不得假装打字机）。  
- 不在本迭代实现「停止生成」按钮（可预留 AbortSignal 挂钩，UI 可后续加）。  
- 不改变深度研究全局单 `running` 租约与追问互斥规则。

## 4. 架构

```text
Renderer (草稿气泡 / 报告草稿)
    ↑  push: ai:followUpDelta | researchAgent:delta (+ 既有 progress)
Main  discussionFollowUp / researchAgentRunner
    ↑  onDelta(accumulated | chunk)
aiFallbackService.callWithFallback(..., { onDelta? })
    ↑
aiProvider.stream* / create  (按供应商)
```

原则：

| 层 | 职责 |
|---|---|
| Provider | 能流则 `stream: true`（或 SDK stream），累加全文并回调 `onDelta`；不能流则一次返回且不伪造 delta |
| Fallback | 透传 `onDelta`；切备用模型时清空/重置 UI 侧 draft 语义由事件 `reset` 表达 |
| Follow-up / Runner | 调用时传入 `onDelta` → `webContents.send`；成功后再审计与持久化 |
| Renderer | 用 `requestId` / `runId` 绑定草稿；invoke 完成后用权威 `getSession` / run detail 替换草稿 |

## 5. 聊天流式（AI 分析）

### 5.1 IPC

- 保持 `ai:followUp` **invoke 语义**：最终仍返回完整 turn（成功/失败）。  
- 新增 push：`ai:followUpDelta`  
  - payload 建议：`{ requestId, sessionId, sequence?: number, type: 'start' | 'delta' | 'reset' | 'error', text?: string, accumulated?: string }`  
  - `delta`：增量或累计二选一，**v1 约定传 `accumulated`（全量累计）**，降低乱序拼接风险。  
- Preload：`window.api.ai.onFollowUpDelta(cb)` + unsubscribe。

### 5.2 UI（`AIAnalysis.tsx`）

- 发送后：乐观用户气泡 + **流式助手草稿气泡**（`data-testid` 如 `ai-followup-streaming`）。  
- 流式中：禁用发送；展示光标/「生成中」；Markdown 可对累计文本做轻量渲染（避免每个 token 重跑 Mermaid：流式期跳过 Mermaid，结束再完整渲染）。  
- invoke resolve：用 `getSession` 结果替换草稿；清除 draft 状态。  
- invoke reject / `error`：移除草稿，保留用户输入可重试（既有失败保留草稿输入规则继续有效）。  
- 切换会话：忽略非当前 `sessionId`/`requestId` 的 delta。

### 5.3 持久化

- 仅在 follow-up 成功路径末尾 `updateSessionMessages` 一次。  
- 自动上下文整理仍在模型回复前整段执行（可先 push `start` + 文案「整理上下文…」无 token）；整理本身 v1 不流式。

### 5.4 网页搜索路径

- 绑定产业项目等强制 ChatGPT web search 的 turn：若 Responses API 流式成本高或轨迹不完整，**允许该 turn 降级为非流式**，但必须在 UI 标明「本轮含网页搜索，整段返回」。  
- 普通无 web search 的 OpenAI 兼容 / DeepSeek chat completions **必须**优先流式。

## 6. 深度研究流式

### 6.1 阶段进度（已有，强化）

- 继续使用 `researchAgent:progress`（phase / message）。  
- UI：`ResearchAgentPanel` 明确展示当前阶段与最近状态，避免长时间无反馈。

### 6.2 写作 delta

- 新增 push：`researchAgent:delta`  
  - payload：`{ runId, phase, type: 'start' | 'delta' | 'reset' | 'done', accumulated?: string }`  
- Runner 在会调用模型生成长文的步骤（**至少 `synthesis`**；`planning` 若输出规划长文则同样接 `onDelta`）传入 `onDelta`。  
- **工具调用 / 检索步**：不 token 流，只 progress。  
- 最终 `report_markdown` 仍在 audit 通过后一次写入；流式草稿仅 UI。审计改写/阻断时，UI 用最终权威报告替换草稿并说明若被阻断。

### 6.3 与聊天互斥

- 深度研究 `queued/running/paused` 时仍拒绝追问（既有规则）。  
- 流式不影响租约与恢复逻辑。

## 7. Provider 改造要点

- `callAIProvider` 增加可选 `onDelta?: (accumulated: string) => void`（或并行 `streamAIProvider` 由 fallback 选用）。  
- OpenAI 兼容 / DeepSeek：`stream: true`，读 SSE chunks，累加 `content`。  
- Claude：Messages stream API。  
- 带 `AbortSignal` 的既有超时/取消钩子尽量复用。  
- Fallback 切换 provider 时发 `reset`，新 provider 从空累计重新 `delta`。

## 8. 验收

| # | 期望 |
|---|---|
| A | 普通聊天追问：数秒内出现增长中的助手正文，而非仅「思考中...」直到结束 |
| B | 结束后会话消息与 DB 一致；刷新/重进无半截草稿残留 |
| C | 同一 `requestId` 重放不双写 turn（幂等保持） |
| D | 深度研究运行时阶段文案持续更新；synthesis（及约定写作步）可见报告草稿增长 |
| E | 持仓预测等批跑路径无行为回归（不传 onDelta） |
| F | Provider 不支持流式或 web-search 降级时不假装打字机，有明确提示 |
| G | 无荐股/自动交易文案变化 |

## 9. 测试策略

- 单测：mock provider 按序回调 `onDelta`，断言 fallback 透传与累计文本。  
- 单测：follow-up 在 delta 期间不写 messages；结束写一次。  
- 组件/契约：preload 暴露 `onFollowUpDelta`；UI 在 delta 下渲染 streaming 气泡。  
- Runner：synthesis 路径触发 delta push（可用 fake webContents）。  
- 禁止依赖真实付费流式调用做 CI。

## 10. 文档

- 更新 `src/components/AIAnalysis/README.md`（FR：流式草稿、delta 事件、落库一次、web-search 降级）。  
- Research Agent 相关 README / FR 若有独立说明则同步阶段 + delta。

## 11. 风险与缓解

| 风险 | 缓解 |
|---|---|
| 高频 delta 导致 Markdown 卡顿 | 累计文本 + rAF/节流；流式期禁用 Mermaid |
| Fallback 切换导致乱序 | `reset` + 仅接受当前 attempt |
| 半成品入库 | 禁止中途写 DB |
| Web search 轨迹与流式不兼容 | 该 turn 降级并提示 |
