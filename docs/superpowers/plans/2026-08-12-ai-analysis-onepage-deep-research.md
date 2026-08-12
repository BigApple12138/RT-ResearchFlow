# AI 分析 One-Page 深度研究 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **每个 Task 结束后做 code review（冗余 / 双路径 / 死面板）后再进入下一 Task。**

**Goal:** 讨论会话里深度研究并入聊天时间线（过程折叠 + 结论 + 来源折叠），撤掉底部常驻账本半屏窗。

**Architecture:** 保留 `ResearchAgentPanel` 的启动/预检/取消/进度订阅为**无 UI 控制器**；抽出 `DeepResearchTurnView` 渲染单次 run；在 `AIAnalysis` 消息滚动区按 `listRuns` 顺序插入回合块。主进程 runner / 账本 IPC 不变；不把整份报告写入 `messages`。

**Tech Stack:** React 18、既有 `window.api.researchAgent`、`ReactMarkdown`、`ResearchAuditTrace`、`AssistantWebSearchTrace` 折叠模式、Vitest 源码契约测、Playwright E2E。

**状态：** 已完成实现（待手工验收）

**Spec：** [`../specs/2026-08-12-ai-analysis-onepage-deep-research-design.md`](../specs/2026-08-12-ai-analysis-onepage-deep-research-design.md)


## Global Constraints

- 不删 researchAgent runner / 证据账本；不恢复默认预检表单；不复活 `DeepResearchWorkbench` 导航。
- 禁止双套深度研究 UI（底部面板 + 时间线并存可见）。
- 大报告不整段写入 `messages`；busy 时追问仍禁用。
- Commit message 中文；仅在用户明确要求时 commit。
- 每个 Task：实现 → 相关单测绿 → **缺陷优先 code review** → 再开下 Task。

## File map

| 文件 | 职责 |
|---|---|
| `src/components/AIAnalysis/deepResearchTurnModel.ts` | 纯函数：run/progress/delta → 回合投影（标题、过程行、是否默认展开） |
| `src/components/AIAnalysis/DeepResearchTurnView.tsx` | 单次 run UI：thinking / 结论 / 来源折叠；复用 status meta、audit |
| `src/components/AIAnalysis/ResearchAgentPanel.tsx` | 改为控制器：保留 openSignal/start/cancel/list/progress；**删除** `research-agent-panel` 常驻双栏；通过 render props / callback 把 runs+live 交给父级 |
| `src/components/AIAnalysis/AIAnalysis.tsx` | 时间线内渲染 `DeepResearchTurnView` 列表；仍挂载控制器 |
| `src/components/AIAnalysis/README.md` | FR / 布局与 spec 对齐 |
| `tests/unit/deepResearchTurnModel.test.ts` | 投影单测 |
| `tests/unit/researchAgent.view.test.tsx` | 契约改为 one-page（无 `max-h-[40vh]` 账本；有 turn testid） |
| `tests/e2e/research-agent-recovery.spec.ts` | `research-agent-panel` → `deep-research-turn` / 兼容别名 |
| `docs/superpowers/specs/2026-08-11-ai-analysis-agent-hub-design.md` | 文末追加修订：用户可见投影 ≠ 权威账本伪装 |

---

### Task 1: 回合投影模型（纯函数 + 单测）

**Files:**
- Create: `src/components/AIAnalysis/deepResearchTurnModel.ts`
- Create: `tests/unit/deepResearchTurnModel.test.ts`

**Interfaces:**
- Produces:
  - `export type DeepResearchTurnProjection = { runId: string; title: string; statusLabel: string; phaseLabel: string; thinkingOpenDefault: boolean; conclusionPreview: string | null; isTerminal: boolean }`
  - `export function projectDeepResearchTurn(input: { run: Pick<ResearchAgentRunSummaryView, 'id' | 'status' | 'phase' | 'question' | 'runKind' | 'resultSemantics'>; liveProgressMessage?: string | null; streamDraft?: string | null }): DeepResearchTurnProjection`

- [ ] **Step 1: 写失败单测**

```ts
import { describe, expect, it } from 'vitest'
import { projectDeepResearchTurn } from '../../src/components/AIAnalysis/deepResearchTurnModel'

const baseRun = {
  id: 'run-1',
  status: 'running' as const,
  phase: 'tooling' as const,
  question: '对 600000.SH 做深度研究：基本面',
  runKind: 'single_agent' as const,
  resultSemantics: {
    executionLabel: '运行中',
    conclusionCoverage: 'pending' as const,
    conclusionLabel: '结论待形成',
  },
}

describe('projectDeepResearchTurn', () => {
  it('running 时默认展开过程，标题含深度研究', () => {
    const p = projectDeepResearchTurn({ run: baseRun, liveProgressMessage: '正在取本地事实' })
    expect(p.thinkingOpenDefault).toBe(true)
    expect(p.isTerminal).toBe(false)
    expect(p.title).toMatch(/深度研究/)
    expect(p.phaseLabel.length).toBeGreaterThan(0)
  })

  it('succeeded 时默认收起过程，isTerminal', () => {
    const p = projectDeepResearchTurn({
      run: { ...baseRun, status: 'succeeded', resultSemantics: { ...baseRun.resultSemantics, executionLabel: '已完成', conclusionCoverage: 'limited', conclusionLabel: '结论覆盖受限' } },
    })
    expect(p.thinkingOpenDefault).toBe(false)
    expect(p.isTerminal).toBe(true)
  })
})
```

> 若 `resultSemantics` 字段与真实类型不完全一致，以 `ResearchAgentRunSummaryView` 为准微调 fixture，保持断言语义不变。

- [ ] **Step 2: 跑测确认失败**

```powershell
Set-Location "E:\代码库\git\RT-ResearchFlow"
$env:ELECTRON_RUN_AS_NODE=1
.\node_modules\.bin\electron.cmd .\node_modules\vitest\vitest.mjs run tests/unit/deepResearchTurnModel.test.ts --reporter=dot
```

Expected: FAIL（模块不存在）

- [ ] **Step 3: 最小实现 `deepResearchTurnModel.ts`**

复用 `ResearchAgentPanel` 已导出的 `researchRunStatusMeta`（或把 PHASE_LABEL / status meta **下沉到本文件**，Panel 改为从本文件 import——**禁止两份 PHASE_LABEL 拷贝**）。

```ts
export function projectDeepResearchTurn(input: { ... }): DeepResearchTurnProjection {
  const terminal = ['succeeded', 'failed', 'cancelled', 'needs_attention'].includes(input.run.status)
  // paused 视为非终态（可继续），thinking 默认展开
  return {
    runId: input.run.id,
    title: `深度研究 · ${input.run.question.slice(0, 48)}`,
    statusLabel: researchRunStatusMeta(input.run).label,
    phaseLabel: /* phase label by runKind */,
    thinkingOpenDefault: !terminal || input.run.status === 'paused' || input.run.status === 'queued' || input.run.status === 'running',
    conclusionPreview: null, // 结论正文由 getRun.reportMarkdown 在 View 层加载
    isTerminal: terminal && input.run.status !== 'needs_attention' ? true : terminal,
  }
}
```

修正：`needs_attention` / `paused` 按产品：过程默认展开；`isTerminal` = succeeded|failed|cancelled。

- [ ] **Step 4: 跑测通过**

同 Step 2，Expected: PASS

- [ ] **Step 5: Code review 门禁**

检查：无重复 PHASE_LABEL；无把报告全文塞进 projection。

- [ ] **Step 6: Commit（仅当用户要求）**

---

### Task 2: `DeepResearchTurnView`（ChatGPT 式一块消息）

**Files:**
- Create: `src/components/AIAnalysis/DeepResearchTurnView.tsx`
- Modify: 从 `ResearchAgentPanel.tsx` **移动** `ResearchAgentRunDetail` 内报告/证据展示中可复用的片段，或 View 内调用 `getRun` 后复用现有子组件（若 `ResearchAgentRunDetail` 已是独立函数组件，改为 export 并由 TurnView 使用——**不要复制一份 Detail**）

**Interfaces:**
- Consumes: `projectDeepResearchTurn`；`window.api.researchAgent.getRun`
- Produces: `<DeepResearchTurnView run={summary} liveProgress={...} streamDraft={...} onCancel|onResume|onStartReview />`
- testid: `deep-research-turn`、`deep-research-turn-{runId}`、`deep-research-thinking`、`deep-research-conclusion`、`deep-research-sources`

- [ ] **Step 1: 实现 TurnView 骨架**

结构（对齐 `AssistantWebSearchTrace` 的 `<details>` 习惯）：

```tsx
<article data-testid={`deep-research-turn-${run.id}`} className="... assistant-bubble-like ...">
  <header>{projection.title} · {projection.statusLabel}</header>
  <details data-testid="deep-research-thinking" open={projection.thinkingOpenDefault}>
    <summary>过程</summary>
    {/* liveProgress / phase / streamDraft / 失败原因摘要 */}
  </details>
  <div data-testid="deep-research-conclusion">
    {/* terminal: ReactMarkdown(reportMarkdown)；running: 占位「研究进行中…」 */}
  </div>
  <details data-testid="deep-research-sources">
    <summary>来源与证据</summary>
    {/* ResearchAuditTrace compact；证据列表只读；取消/继续按钮放这里或 header，不另开窗 */}
  </details>
</article>
```

- [ ] **Step 2: 接 `getRun` 加载报告与 audit**（仅选中/可见 run；running 时用 progress 刷新 summary）

- [ ] **Step 3: 源码契约测补充**（可放在 `researchAgent.view.test.tsx` 或新文件）

```ts
expect(source('src/components/AIAnalysis/DeepResearchTurnView.tsx')).toContain('deep-research-thinking')
expect(source('src/components/AIAnalysis/DeepResearchTurnView.tsx')).toContain('deep-research-conclusion')
expect(source('src/components/AIAnalysis/DeepResearchTurnView.tsx')).not.toContain('max-h-[40vh]')
```

- [ ] **Step 4: Code review**

禁止：再实现一套与 `ResearchAgentRunDetail` 平行的证据 Tab 双栏；优先 import 已有 detail 渲染或抽公共 `ResearchAgentEvidenceSections`。

---

### Task 3: 拆除常驻面板 + 时间线挂载

**Files:**
- Modify: `src/components/AIAnalysis/ResearchAgentPanel.tsx`
- Modify: `src/components/AIAnalysis/AIAnalysis.tsx`

**Interfaces:**
- `ResearchAgentPanel` 新增可选：
  - `onRunsChange?: (runs: ResearchAgentRunSummaryView[]) => void`
  - `onLiveChange?: (live: { progress, streamDraft, selectedRunId, detail, busy, error, actions }) => void`
  - 或改用 render prop：`renderTurns?: (ctx) => ReactNode`  
  **推荐：** Panel 继续内部持有状态，通过 `renderTurns` 把 JSX 插到父级时间线，避免 AIAnalysis 再抄一套 loadRuns（反冗余）。

推荐 API：

```tsx
// ResearchAgentPanel
renderInTimeline?: (ctx: {
  runs: ResearchAgentRunSummaryView[]
  liveProgress: ...
  streamDraft: ...
  detailById: ... // or getDetail(runId)
  actions: { cancel, resume, startReview, selectRun }
}) => React.ReactNode
```

AIAnalysis：

```tsx
<ResearchAgentPanel
  ...
  renderInTimeline={(ctx) => (
    <div className="space-y-3" data-testid="deep-research-timeline">
      {[...ctx.runs].reverse().map((run) => (
        <DeepResearchTurnView key={run.id} run={run} ... />
      ))}
    </div>
  )}
/>
```

将 `renderInTimeline` 的结果**移入消息滚动容器底部**（composer 上方、原 Panel 占位处改为 portal/slot）。

实现要点：

1. 删除 `showLedger && <section data-testid="research-agent-panel" className="max-h-[40vh]...">` 整块双栏。
2. 保留 `research-agent-open` sr-only、预检 modal、`AppConfirmDialog`。
3. 错误 `role="alert"` 改到 TurnView 或 timeline 顶部一条，**不要**为了错误再拉回半屏面板。
4. `data-testid="research-agent-panel"`：若 E2E 短期需要，可在 timeline 根上设 **别名** `data-testid="deep-research-timeline"`，并同步改 E2E；不要保留不可见假 panel 骗测试。

- [ ] **Step 1: 改 Panel 去掉常驻 ledger**
- [ ] **Step 2: AIAnalysis 把 turns 放进中央滚动区**
- [ ] **Step 3: 更新 `tests/unit/researchAgent.view.test.tsx`**

删除/改写对 `max-h-[40vh]`、`lg:grid-cols-[240px` 的断言；改为：

```ts
expect(analysis).toContain('DeepResearchTurnView') // 或 deep-research-timeline
expect(panel).not.toContain('max-h-[40vh]')
expect(panel).toContain('research-agent-open') // 预检钩子仍在
```

对仍存在于 **TurnView / 抽出的 detail** 中的 report-tab 等 testid，断言改到实际所在文件。

- [ ] **Step 4: 跑单元测**

```powershell
$env:ELECTRON_RUN_AS_NODE=1
.\node_modules\.bin\electron.cmd .\node_modules\vitest\vitest.mjs run tests/unit/deepResearchTurnModel.test.ts tests/unit/researchAgent.view.test.tsx --reporter=dot
```

- [ ] **Step 5: Code review（关键）**

清单：
- [ ] 可见 UI 是否只剩时间线 turns（无底部第二窗）
- [ ] 是否仍存在 `display:none` 的旧 panel
- [ ] loadRuns / onProgress 是否仍只有 Panel 一处

---

### Task 4: E2E testid 迁移

**Files:**
- Modify: `tests/e2e/research-agent-recovery.spec.ts`

- [ ] **Step 1:** 将 `getByTestId('research-agent-panel')` 替换为 `deep-research-timeline` 或 `deep-research-turn`（按断言语义：整区 vs 单条）。
- [ ] **Step 2:** 保留取消/继续等按钮可访问性；若按钮迁到 TurnView，更新定位。
- [ ] **Step 3:** 本地能跑 E2E 则跑相关用例；否则至少保证 testid 字符串与组件一致（单元源码契约覆盖）。

---

### Task 5: README + 关联 spec 修订 + 设计初衷检核准备

**Files:**
- Modify: `src/components/AIAnalysis/README.md`
- Modify: `docs/superpowers/specs/2026-08-11-ai-analysis-agent-hub-design.md`（仅文末「修订」追加，不改历史正文）
- Modify: 本 plan 文首状态 → 执行中/已完成；填「设计初衷检核」

README 应写明：
- 讨论会话 = one-page 时间线；深度研究 = 过程/结论/来源折叠块；
- 无底部常驻 `ResearchAgentPanel` 账本；
- busy 仍禁用追问。

Agent Hub 修订示例：

```markdown
- 2026-08-12：深度研究用户可见面改为聊天时间线投影（one-page）；权威审计仍在 researchAgent 账本，不与「账本不伪装成胡编消息」冲突。
```

- [ ] **Step 1: 改文档**
- [ ] **Step 2: 手工验收对照 spec §8 A–I**
- [ ] **Step 3: 填写下方检核表**

---

## 设计初衷检核

| Spec 项 | 结果 | 说明 |
|---|---|---|
| A 无常驻底部账本 | 符合 | 已删 `research-agent-panel` / `max-h-[40vh]` |
| B 时间线过程+结论 | 符合 | `deep-research-timeline` + `DeepResearchTurnView` |
| C 来源可折叠 | 符合 | `deep-research-sources` + Detail 证据 Tab |
| D 启动路径不回退预检 | 符合 | 未改 auto-start |
| E busy / 单租约 | 符合 | 未改 busy 闸门 |
| F 降级/失败可见 | 符合 | 过程区 + Detail 原有提示 |
| G 无荐股交易 | 符合 | 未引入 |
| H README | 符合 | AIAnalysis README 已更新 |
| I 无双套 UI / review | 符合 | 单时间线；标签下沉 deepResearchTurnModel |

---

## Spec coverage（self-review）

| Spec | Task |
|---|---|
| §3/§5 撤常驻面板、单时间线 | Task 3 |
| §6 过程/结论/来源 | Task 1–2 |
| §6.4 多 runs 列表 | Task 3（reverse map） |
| §7.1 反冗余 / review | 每 Task Step review |
| §8 E2E | Task 4 |
| §8 H 文档 | Task 5 |
| §9 不写爆 messages | Task 2（getRun 按需） |

## 修订记录

- 2026-08-12：初稿；用户批准 spec 后按 writing-plans 落盘。
