# AI 分析 One-Page（Cursor 式会话面）设计

**状态：** 已完成（2026-08-12；抽屉 + Agent 流式已落地，待手工观感确认）  
**日期：** 2026-08-12  
**Plan：** [`../plans/2026-08-12-ai-analysis-cursor-onepage-session.md`](../plans/2026-08-12-ai-analysis-cursor-onepage-session.md)（刹车见候选桥接 plan）  
**关联：**  
- [`2026-08-12-ai-analysis-onepage-deep-research-design.md`](./2026-08-12-ai-analysis-onepage-deep-research-design.md)（深度研究并入时间线；**本文修订「讨论路径整体信息架构」**）  
- [`2026-08-11-ai-analysis-agent-hub-design.md`](./2026-08-11-ai-analysis-agent-hub-design.md)（北星：单交互页 Agent）  
- [`2026-08-11-ai-chat-streaming-design.md`](./2026-08-11-ai-chat-streaming-design.md)（followUp 流式；Agent 路径须对齐）  
- OpenClaw：会话/Context Engine 契约（本地 `E:\代码库\git\openclaw`）；**UI 心智对照 Cursor 会话页**（中心线程 + 可折叠抽屉）  
- 模块 README：`src/components/AIAnalysis/README.md`

## 0. 产品心智（必须先对齐）

> **One-page = 内容不分散：默认全部注意力在「用户 ↔ AI」讨论线程上。**  
> 像 Cursor 跟 AI 对话那一页：过程、工具、结论、流式正文都发生在同一条会话里；左右抽屉用**小按钮**收起/展开，需要时再看，不抢主舞台。

这不是「把深度研究塞进气泡」的局部 UI 修补，而是**讨论路径的交互北星**：

| 成熟产品 | 可借鉴点 | 本仓映射 |
|---|---|---|
| Cursor 会话页 | 中心线程是主表面；历史/Changes 等是抽屉，可一键藏起 | 分析记录 / 研判侧栏 = 抽屉 |
| ChatGPT | 思考过程可折叠，正文流式，不另开半屏窗 | Agent/深挖过程叠进回合 |
| OpenClaw | session lane、回合内 tool→继续→final，记忆可追溯但不拆第二聊天面 | 编排不误 complete；Context Engine 已落地 |

**明确纠正：** 先前把 one-page 窄化成「深挖面板并进时间线」不够；用户反复要求的是 **整页会话面像 Cursor**。

## 1. 问题

当前讨论会话仍分散注意力：

1. **中心**长时间「思考中…」，正文不流式；工具摘要与最终回复脱节。  
2. **编排误完成**：空 `completionCriteria` + 一次成功本地工具（如 `local.portfolio_facts`）→ `evaluateCompletion` 直接 `complete`，用户问「看看中油」却只看到「已读取 3 只持仓」+「本轮完成」。  
3. **信息架构**：左侧记录、中间聊、右侧研判、下方「研究增量」同时常驻，主轴不是「我跟 AI 说话」。  
4. 深度研究已并入时间线，但 **Agent 普通回合**仍不像 Cursor：没有「线程内过程 + 流式正文」。

## 2. 目标

1. **讨论路径主表面 = 会话线程 + composer**（体感对齐 Cursor 中央栏）。  
2. **左侧分析记录、右侧研判侧栏 = 可折叠抽屉**；提供明显小按钮切换；偏好本地记住（如 `localStorage` / Zustand，按用户机，不进库也行）。讨论会话默认：**右侧抽屉收起**（需要结构化摘要再展开）。左侧默认可保持展开（选会话），但须可收。  
3. **「研究增量」不得作为讨论主区常驻大块**；改为：折叠进线程附属，或收入右侧抽屉的一节，默认不抢纵向空间。  
4. **Agent 回合**：  
   - 修误完成刹车（见 §5）；  
   - 正文经 `ai:agentEvent` message **增量流式**进气泡（结束 `getSession` 权威落库）；  
   - 工具/状态像 Cursor 一样出现在**同一回合内**（可折叠明细），禁止长时间空「思考中…」占位。  
5. Skill：用户点名标的（如「看看中油」）优先行情/基本面工具，**禁止**把持仓列表摘要当成最终回答。  
6. 硬边界不变：不荐股、不自动交易、本地优先、Renderer 窄 IPC。

## 3. 非目标

- 不重做整站导航壳；不把今日看板等改成聊天。  
- 不删除研判侧栏能力与结构化 JSON；只改**默认可见性与入口形态**。  
- 不删除研究增量 / FR-239 语义；只改呈现位置。  
- 不引入 OpenClaw / Cursor 运行时依赖；只借鉴交互与会话契约。  
- 不做任意检查点跳点恢复（已有栈式 restore UI）。  
- 不在本设计引入多 Agent 自由通信。

## 4. 方案对比

| 方案 | 做法 | 结论 |
|---|---|---|
| A 讨论路径删掉侧栏/增量 | 最干净但丢结构化入口 | 否：能力还要，只是别常驻抢戏 |
| B 全部改成线程内折叠块 | 接近 ChatGPT，改动大 | 过程/增量可部分采用 |
| **C Cursor 式（推荐）** | **中心线程为主；左右抽屉小按钮收起；过程进回合；修刹车+流式** | **采用** |

## 5. 编排：误完成刹车（根因修复）

**根因：** `completionCriteria.length === 0` 时，任意成功观察且 `remainingGaps=[]` 即 `complete`（见 `completionEvaluator.ts`）。

**决策：**

- 空完成条件时：**不得**仅因「工具成功」自动 complete。  
- 完成仅当：  
  - 模型显式输出 `{type:'final', text}`，或  
  - 存在非空 `completionCriteria` 且 `criteriaSatisfied`，或  
  - 触及 `maxSteps` / 熔断等既有 blocked 路径。  
- 0-step 寒暄：首轮即可 `final`，不强制工具。  
- Skill / 系统提示补充：点名公司/股票时，应用 `local.market_snapshot` / `local.fundamentals_read`（或深挖）回答用户问题；`local.portfolio_facts` 仅当用户问持仓/对照组合时使用；**禁止**用持仓摘要冒充标的研判。

单测：空 criteria + 一次 `portfolio_facts` 成功 → 必须 `continue`，直到 `final`。

## 6. UI 信息架构（Cursor 对齐）

```
┌──────────┬────────────────────────────┬──────────┐
│ 记录抽屉  │     会话线程（主表面）        │ 研判抽屉  │
│ (可收)   │  user / agent过程 / 流式正文  │ (可收)   │
│          │  composer                   │          │
└──────────┴────────────────────────────┴──────────┘
     ▲ 小按钮                              ▲ 小按钮
```

- **讨论会话默认**：右抽屉收起；左抽屉展开（可收）。  
- **非讨论的文章研判会话**：可维持现有三栏默认（本设计不强制改），或同样提供收起能力（实现时优先讨论路径）。  
- 线程内回合结构（对齐 Cursor）：  
  1. 可选过程行（工具/状态，默认可折叠）  
  2. 流式助手正文  
  3. 终态后权威消息替换草稿  

## 7. 流式

- `ai:followUp`：保持现有 `followUpDelta`。  
- `ai:agentTurn`：`reasoningCall` 对最终 `final` 文本（及需要时的叙述段）推送累计 delta → `agentEvent` `message`（或等价 payload）→ UI 草稿气泡；**禁止**整轮结束后才第一次出现正文。  
- 工具轮：状态滚动可保留，但须挂在当前回合下方，不替代正文气泡。

## 8. 验收标准

1. 讨论页默认视觉重心是聊天线程；右抽屉默认收起，小按钮可开/关；刷新后记住偏好。  
2. 「看看中油」类请求：不会在仅读持仓后宣告本轮完成；会继续取数或给出针对标的的说明性 final（仍无荐股）。  
3. Agent 回合可见正文增长（或明确降级提示），不再长时间只有「思考中…」。  
4. 研究增量不占据讨论主区大块常驻（折叠或入抽屉）。  
5. 更新 `AIAnalysis/README.md` FR；相关单测覆盖误完成与抽屉默认态（视图模型即可）。  
6. 不引入 openclaw 包依赖。

## 9. 风险

| 风险 | 缓解 |
|---|---|
| 改完成判定导致回合变长/费 token | maxSteps 保留；Skill 引导少走无关工具 |
| 右抽屉默认收起找不到结构化 | 小按钮常驻、首次可轻提示一次 |
| Agent 流式与 Provider 不兼容 | 诚实降级 + 文案，不假装打字机 |

## 10. 修订记录

- 2026-08-12：用户纠正 one-page = 会话内容不分散、对齐 Cursor 中心线程 + 小按钮藏抽屉；并要求借鉴 OpenClaw/成熟产品会话面；纳入误完成刹车与 Agent 流式。
- 2026-08-12：抽屉 + Agent 流式实现 plan 落盘并执行完成（`2026-08-12-ai-analysis-cursor-onepage-session.md`）。
