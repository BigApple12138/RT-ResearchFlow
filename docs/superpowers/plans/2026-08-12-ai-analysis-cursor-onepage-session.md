# AI 分析 Cursor 式会话面（抽屉 + Agent 流式）Implementation Plan

> **For agentic workers:** 按任务勾选执行；对照 [`../specs/2026-08-12-ai-analysis-cursor-onepage-session-design.md`](../specs/2026-08-12-ai-analysis-cursor-onepage-session-design.md)。推荐 inline；Agent 流式可与抽屉 UI 并行但须先约定事件 payload。

**Goal：** 讨论路径主表面变为「会话线程 + composer」；左右栏小按钮可收；研究增量不占主区常驻；Agent 最终正文经 `ai:agentEvent` message 增量流式进气泡（结束 `getSession` 权威落库）。

**Architecture：** Renderer 用 localStorage 偏好驱动左右抽屉；讨论默认右收、左展。主进程 `buildDefaultReasoningCall` 向 `callWithFallback` 传 `onDelta`；编排在 final/叙述路径推送累计 `message`（`stream: 'delta'|'final'`）；UI 复用 followUp 草稿心智，挂在当前 Agent 回合下。误完成刹车与 Skill「点名勿用持仓」**已随候选桥接落地，本 plan 不重做**。

**Tech Stack：** Electron IPC push、既有 `callWithFallback`/`onDelta`、React、Vitest。

**状态：** 已完成（2026-08-12）  
**Spec：** [`../specs/2026-08-12-ai-analysis-cursor-onepage-session-design.md`](../specs/2026-08-12-ai-analysis-cursor-onepage-session-design.md)

## Global Constraints

- 不荐股 / 不自动交易 / 不削弱风险提示。
- 流式过程**不**多次覆盖 `messages` JSON；仅 turn 成功路径末尾写库（既有契约）。
- 不引入 `openclaw` / Cursor 运行时依赖。
- 不删除研判侧栏能力与 FR-239 研究增量语义；只改默认可见性与挂载点。
- 不做「停止生成」按钮（与流式 design 一致）。
- 不改整站导航壳；资讯详情「+观察池」另开切片（候选桥接已留 backlog）。
- Provider 不支持流式时诚实降级，不得假装打字机。
- CI 禁止真实付费流式调用；单测 mock `onDelta`。

## 已完成（本 plan 跳过）

| Spec § | 项 | 证据 |
|---|---|---|
| §5 | 空 `completionCriteria` 不得因工具成功 complete | `completionEvaluator.ts` + `agentPlannerExecutor.test.ts` |
| §5 / §2.5 | Skill：点名标的勿用持仓摘要冒充 | `skillPrompt.ts` / `research-assistant/SKILL.md` |

## File map

| 文件 | 职责 |
|---|---|
| `src/components/AIAnalysis/sessionDrawerPrefs.ts` | 左右抽屉开关读写 + 讨论默认态（纯函数，可测） |
| `tests/unit/sessionDrawerPrefs.test.ts` | 默认态 / 读写 round-trip |
| `src/components/AIAnalysis/AIAnalysis.tsx` | 小按钮、折叠 aside、研究增量挪位、Agent 流式草稿气泡 |
| `src/components/ResearchDiscussion/ResearchDiscussionChangePanel.tsx` | 仅在需要时改壳样式；逻辑尽量不动 |
| `electron/main/agent/types.ts` | （可选）文档化 message payload `stream` 字段；类型仍 `Record` 亦可 |
| `electron/main/agent/orchestrator.ts` | ReasoningCall 透传 onDelta；emit message delta/final |
| `electron/main/services/agentTurnService.ts` | `buildDefaultReasoningCall` 接 `onDelta` → `callWithFallback` |
| `src/components/AIAnalysis/agentTimelineModel.ts` | 识别 streaming message；过程与正文分离 |
| `tests/unit/agentTimelineModel.test.ts` | 流式投影 |
| `tests/unit/agentOrchestrator.test.ts` 或新建 | mock reasoning 推 delta |
| `src/components/AIAnalysis/README.md` | FR：抽屉默认态 + Agent 正文流式 |

## 事件约定（Agent 流式）

复用既有 `ai:agentEvent`，`type: 'message'`：

| `payload` | 含义 |
|---|---|
| `{ text, stream: 'delta' }` | 累计正文草稿（与 followUp `accumulated` 同语义） |
| `{ text, stream: 'final' }` 或无 `stream`（兼容旧） | 本轮权威助手正文（落库前最后一次推送） |

- 工具轮继续用 `status` / `tool_*`；**不得**用空「思考中…」替代已有过程滚动。
- Renderer：同 `requestId` 下用最新 `delta.text` 填草稿气泡；`final` / invoke resolve 后以 `getSession` 替换。
- 切换会话：忽略非当前 `sessionId`/`requestId` 的事件（与 followUp 一致）。

---

### Task 1: 抽屉偏好视图模型 + 单测

**Files:**
- Create: `src/components/AIAnalysis/sessionDrawerPrefs.ts`
- Create: `tests/unit/sessionDrawerPrefs.test.ts`

- [x] **Step 1:** 定义 key，例如：
  - `rt-researchflow.ai-analysis.drawer.left`
  - `rt-researchflow.ai-analysis.drawer.right`
- [x] **Step 2:** API：`load` / `save` / `defaultPrefsForSession`（可注入 storage 便于 Node 单测）
- [x] **Step 3:** 首次无 localStorage 时用 default；有存储则覆盖。非法值回退 default。
- [x] **Step 4:** 单测覆盖 default、round-trip、坏数据回退。
- [x] **Step 5:** `sessionDrawerPrefs.test.ts` 绿

---

### Task 2: AIAnalysis 左右抽屉 UI + 研究增量挪位

**Files:**
- Modify: `src/components/AIAnalysis/AIAnalysis.tsx`
- Modify: `src/components/ResearchDiscussion/ResearchDiscussionChangePanel.tsx`（仅当需要更紧凑壳 / `data-testid`）
- Modify: 相关视图单测（若有 layout 契约测则更新）

- [x] **Step 1–6:** 抽屉 UI、研究增量右移、收起态小按钮、既有主题；typecheck 触及文件无新增 orchestrator 错误
- [x] Task 2–5 steps completed（抽屉 UI、Agent delta/final、timeline、README/检核）

## 手工验收清单（spec §8）

1. 讨论页默认重心在聊天线程；右抽屉默认收起；小按钮可开/关；刷新后记住偏好。  
2. 「看看中油」类：不会仅读持仓后完成本轮（回归已有刹车；本 plan 不改判定）。  
3. Agent 回合可见正文增长或明确降级，不再长时间只有「思考中…」。  
4. 研究增量不占讨论主区大块常驻。  
5. README FR + 抽屉默认态单测 + 流式投影单测。  
6. `package.json` 无新增 openclaw 依赖。

## 设计初衷检核（完成后填写）

| Spec 项 | 结果 | 说明 |
|---|---|---|
| §8.1 主表面 + 右默认收 + 偏好 | 符合 | 讨论默认右收；文章无存储时右开；`<xl` 内联增量 |
| §8.2 误完成刹车（回归） | 已有 | 本 plan 未改 `completionEvaluator`；既有单测仍绿 |
| §8.3 Agent 正文流式/降级 | 符合 | 过程→草稿；首轮乐观 user；无正文时明示整段返回 |
| §8.4 研究增量挪位 | 符合 | 主区不常驻；xl 抽屉 / 窄屏内联可开关 |
| §8.5 README + 单测 | 符合 | README FR；prefs/timeline/orchestrator 单测绿 |
| §8.6 无 openclaw 依赖 | 符合 | 未新增依赖 |

**总评：** Cursor 式抽屉 + Agent 正文流式 v1 已落地；审阅后修窄屏增量可达性、首轮过程滚动、块顺序与文章默认右开。  
**检核人 / 日期：** Auto / 2026-08-12

## 修订记录

- 2026-08-12：按已批准 Cursor 式会话面 design 起草抽屉 + Agent 流式 plan；刹车/Skill 标为已完成跳过。
- 2026-08-12：用户批准执行；完成 Task 1–5 与设计初衷检核。
- 2026-08-12：审阅修复 High（窄屏增量自锁、首轮无过程滚动）及 Medium（顺序/文章默认/降级文案）。
