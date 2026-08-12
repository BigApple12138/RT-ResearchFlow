# 讨论压缩检查点可见账本与恢复（Restore UI）设计

**状态：** 已完成（2026-08-12）  
**Plan：** [`../plans/2026-08-12-compaction-checkpoint-restore-ui.md`](../plans/2026-08-12-compaction-checkpoint-restore-ui.md)  
**日期：** 2026-08-12  
**方案：** B（列表可见 + 仅恢复最新一层）  
**关联：**  
- [`2026-08-12-agent-context-engine-design.md`](./2026-08-12-agent-context-engine-design.md)（P2 IPC 已落地；本文补齐后置 UI）  
- [`2026-08-11-ai-analysis-agent-hub-design.md`](./2026-08-11-ai-analysis-agent-hub-design.md)（北星：本地投研 Agent × 多源数据 × 可追溯证据账本）  
- 模块 README：`src/components/AIAnalysis/README.md`  
- 外部参考（产品叙事，非实现依赖）：[Agent Plan CookBook ·「个人投资助手」](https://bytedance.larkoffice.com/wiki/CmTHwndaGi6Uask3bvRcyDYInhf)（火山方舟；Data MCP + 联网 + 可持续投研工作台）

## 1. 问题

Context Engine P2 已提供：

- 压缩前研究笔记 flush（本地表）  
- `ai:listDiscussionCompactionCheckpoints` / `ai:restoreDiscussionCompaction`（仅最新一层）

讨论页仍只有「整理聊天上下文」与一句「历史原文仍可追溯」，**用户看不到检查点链，也无法主动 peel 最新一层**。对「个人投资 Agent」终局而言：工作记忆压缩若不可见、不可回退一层，就偏离「可回看、可核验、可持续跟踪」的工作台叙事。

## 2. 产品对齐（CookBook + 本仓北星）

CookBook 案例强调：不是一次性静态页，而是把**关注标的、研究偏好、历史简报、风险摘要、引用来源**沉淀为可持续投研工作台；数据走结构化 MCP，资讯走联网 Harness，结果可回看核验。

映射到本仓（已有扎实本地数据底座）：

| CookBook 能力叙事 | 本仓已有 / 本设计补齐 |
|---|---|
| 可持续投研工作台 | AI 分析 = Agent 主交互面（Hub） |
| 结构化金融数据底座 | 本地 SQLite + 行情/财报/披露 Tool（不抄方舟 Data MCP） |
| 联网补充公开域 | 已有联网搜索网关 + 持久授权开关 |
| 历史简报 / 回看核验 | 讨论归档 + 压缩检查点；**本设计让检查点可见并可恢复最新层** |
| 风险摘要可追踪 | 不在本设计扩 scope；继续走复盘/风险提示既有链路 |
| 多 Agent 平台兼容 | 借鉴契约（OpenClaw Context Engine），不引入方舟/OpenClaw 运行时 |

**本设计只做「工作记忆账本可见 + 栈式恢复一层」**，不借机重做 Data MCP、不迁云、不荐股。

## 3. 目标

- 在讨论 / Agent 聊天区展示当前会话的**压缩检查点列表**（可见账本）。  
- 提供「恢复最近整理」：仅 peel **最新**检查点（与现 IPC 栈语义一致）。  
- 忙碌态、失败码、刷新消息与现有「整理聊天上下文」同一套 session lane 体验。  
- 更新 `AIAnalysis/README.md` FR，标明检查点 UI 与 restore 约束。

## 4. 非目标

- 不支持按任意历史 `compactionId` 跳点恢复（拒绝 C；避免打乱累计摘要/归档链）。  
- 不新增 Migration；不改 restore 服务语义（`NOT_LATEST` 保持）。  
- 不做检查点全文摘要展开编辑器、不做 flush 笔记独立浏览页（可后续）。  
- 不暴露 OpenClaw / 方舟品牌于 UI。  
- 不增加荐股、收益承诺、自动交易。

## 5. 方案决策

| 方案 | 结论 |
|---|---|
| A 仅一键恢复 | 否：账本不可见，与「可追溯」文案矛盾 |
| **B 列表 + 恢复最新** | **采用**：看得见链，动作仍栈式 |
| C 任意检查点恢复 | 否：与累计摘要/归档栈冲突，需另开设计 |

## 6. UI / 交互

**落点：** `AIAnalysis` 讨论 tab（`activeTab === 'chat'`）中，现有「讨论记录」卡片：整理按钮旁与其下。

**展示规则：**

1. 有 discussion 且存在检查点时，在状态文案下展示「上下文检查点」列表（默认最多 5 条；与 IPC `limit` 对齐，可固定 5）。  
2. 每条展示：覆盖序号区间（`sourceStartSequence`–`coveredThroughSequence`）、相对时间或本地时间、可选 `tokensBefore→tokensAfter`（有则显示）。摘要全文默认折叠为一行 truncate，不强制展开。  
3. **最新一条**视觉标记为「可恢复」；更早条目只读，旁注「请先恢复更新的检查点」。  
4. 主操作按钮：「恢复最近整理」（`data-testid="ai-restore-discussion-compaction"`）。无检查点时不渲染按钮与列表。  
5. 点击后二次确认（`window.confirm` 或现有确认模式即可）：说明会把该次归档消息拼回热区并删除该检查点记录；进行中追问/整理/Agent busy 时禁用。  
6. 成功：toast + 用返回的 `messages` 或重新 `getSession`/`loadDetail` 刷新热消息与检查点列表。  
7. 失败：按 `code` 映射中文（`NOT_FOUND` / `NOT_LATEST` / `CORRUPT_ARCHIVE` / busy 类），不静默。

**文案原则：** 用「整理 / 检查点 / 恢复最近一层」，不用「压缩 / checkpoint / OpenClaw」。

## 7. 数据与 IPC

- 只读：`window.api.ai.listDiscussionCompactionCheckpoints({ sessionId, limit: 5 })`  
- 写入：`window.api.ai.restoreDiscussionCompaction({ requestId: uuid, sessionId })`（不传更早 id；若误传非最新由主进程 `NOT_LATEST`）  
- `requestId` 必须 UUID；与 followUp/compact 一样防重放。  
- Renderer 不直连 DB；不上传任意库内容。

## 8. 验收标准

1. 有 ≥1 检查点时，讨论区可见列表；最新可恢复，更早只读提示。  
2. 恢复成功后热消息含该层归档原文，该检查点从列表消失；可再次对「新的最新」恢复（若仍有）。  
3. 追问 / 整理 / Agent busy 时按钮禁用。  
4. 无检查点时不出现空壳列表与恢复按钮。  
5. 不扩展任意 id 恢复；单测或现有 restore 单测仍覆盖 `NOT_LATEST`。  
6. 更新 `AIAnalysis/README.md`；相关 typecheck / 单测通过。

## 9. 风险

| 风险 | 缓解 |
|---|---|
| 用户误以为可跳回任意历史点 | 更早条目明确只读文案 |
| 恢复后窗口再度超预算立刻 hard compact | 与现网一致；toast 可提示「已恢复；若上下文仍过大，下次发送前可能再次整理」 |
| 列表与 detail 缓存不同步 | 恢复/整理后统一走既有 detail 刷新路径 |

## 10. 后续（不在本文实现）

从 CookBook / Agent 终局记一笔 backlog，另开 SDD，勿塞进本 PR：

- 检查点旁链到研究笔记 flush 只读预览  
- Agent 对「自选/持仓/披露」的工具化调度再对齐（数据底座已有，缺的是编排可见性）  
- 个股研究偏好与历史简报的一等公民沉淀（若超出当前会话账本）

## 11. 修订记录

- 2026-08-12：用户确认方案 B；对齐 Agent Hub 北星与 CookBook「可持续投研工作台 / 回看核验」叙事；Scope 限定检查点可见 + 恢复最新一层。
