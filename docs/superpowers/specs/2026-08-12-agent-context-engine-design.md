# 投研 Agent Context Engine（借鉴 OpenClaw）设计

**状态：** P0+P1+P2 已完成（2026-08-12；restore UI 见 [`2026-08-12-compaction-checkpoint-restore-ui-design.md`](./2026-08-12-compaction-checkpoint-restore-ui-design.md)）  
**Plan：** [`../plans/2026-08-12-agent-context-engine.md`](../plans/2026-08-12-agent-context-engine.md)  
**日期：** 2026-08-12  
**关联：**  
- [`2026-08-11-ai-analysis-agent-hub-design.md`](./2026-08-11-ai-analysis-agent-hub-design.md)（Agent 主路径；§4.1「借鉴契约，不抄栈」）  
- [`2026-08-12-agent-turn-session-memory-design.md`](./2026-08-12-agent-turn-session-memory-design.md)（Agent 继承会话；已实现）  
- [`2026-08-09-trend-ai-review-and-context-compaction-revision-design.md`](./2026-08-09-trend-ai-review-and-context-compaction-revision-design.md)（讨论压缩硬契约）  
- 模块 README：`src/components/AIAnalysis/README.md`

## 0. OpenClaw 参考源（必读）

本设计以本地已拉源码为对照真相，实现阶段应打开下列路径对照语义；**默认自主实现，不引入 `openclaw` 运行时依赖**。若改编极小独立纯函数，须保留 MIT 声明并记入 `THIRD_PARTY_NOTICES.md`（与 Agent Hub 计划一致）。

| 项 | 值 |
|---|---|
| 本地源码根 | `E:\代码库\git\openclaw` |
| 远程 | https://github.com/openclaw/openclaw（MIT） |
| 已核验 commit | `46bdbe585f96663d6ecff932ad6790d6cd26e3a3`（与 Agent Hub 测绘同版；`package.json` version `2026.8.1`） |
| 概念文档 | `E:\代码库\git\openclaw\docs\concepts\context-engine.md`；线上 https://docs.openclaw.ai |

### 0.1 实现时直接对照的源文件

| 主题 | OpenClaw 路径 | 本仓应对齐的语义 |
|---|---|---|
| ContextEngine 生命周期 | `src/context-engine/types.ts`（`ingest` / `assemble` / `compact` / `afterTurn` / `commitTurn` / `prepareSubagentSpawn`） | 本仓窄接口；单默认实现，不做插件注册表 |
| Legacy 行为说明 | `src/context-engine/legacy.ts`、`docs/concepts/context-engine.md` | 理解「引擎可透传、压缩可委托」；本仓不抄 Legacy 空壳 |
| Token 压缩触发 | `packages/agent-core/src/harness/compaction/compaction.ts`（`shouldCompact`、`DEFAULT_COMPACTION_SETTINGS`、`findCutPoint`、`estimateTokens`） | **硬闸**：窗将满则 compact；切点在 turn 边界 |
| 摘要结构提示 | 同文件 `SUMMARIZATION_PROMPT`；桥接 `src/agents/compaction.ts`（identifier 保留） | 可改编提示词结构；硬事实仍走本仓 `promptSent` + 审计 |
| 会话车道 | `src/agents/embedded-agent-runner/lanes.ts`（`resolveSessionLane` → `session:<key>`） | 文档化并固化：与现有 `withDiscussionSessionLock` 等价 |
| 子代理隔离 | `src/agents/subagents/spawn/subagent-spawn-context.ts`（`isolated` 默认 / `fork`） | `research.deep_start` 等子编排默认 isolated |
| 压缩前记忆 flush（可选后期） | `src/auto-reply/reply/memory-flush.ts` | 映射为「研究笔记 flush」，不写 `~/.openclaw` |
| 压缩检查点（可选后期） | `src/config/sessions/types.ts`（`SessionCompactionCheckpoint`）；`src/gateway/session-compaction-checkpoints.ts` | 本仓 SQLite 字段/表即可，不搬 Gateway RPC |

### 0.2 明确不对照 / 不搬入的源码

- Gateway WebSocket 方法面（`src/gateway/server-methods/sessions-compact.ts` 等）  
- 插件 ContextEngine 注册表与 quarantine（`src/context-engine/registry.ts`、`quarantine-health.ts`）  
- SQLite transcript DAG 全套（`src/agents/sessions/session-manager-*.ts`）作为本仓唯一账本  
- 全局 CommandLane 容量组 / 多通道 `sessionKey` 路由  
- 完整 Memory 搜索插件与 workspace `memory/*.md` 沙箱执行模型  

## 1. 问题

产品终局是**投研 Agent 助手**（单交互面自主编排），不是「偶发 Agent 的讨论框」。

已落地能力：

- 讨论侧：12 对自动 compact、热尾 6 条、`promptSent` + 累计摘要装配、归档可恢复。  
- Agent 侧：回合前复用同一装配/自动 compact，不再对短句失忆。

缺口相对 OpenClaw / Agent 终局：

1. **压缩主触发仍是消息对数**；长 tool 结果 / 大 `promptSent` 可在未满 12 对时撑爆窗。  
2. **无显式 ContextEngine 生命周期**；assemble / compact / 落账散落在 TurnService、followUp、orchestrator，易再漂移。  
3. **子编排（深度研究等）缺少 isolated/fork 产品语义**；共享可变 `messages` JSON 覆盖仍有互踩风险（见 `AGENTS.md`）。  
4. **无压缩检查点 / 压缩前研究笔记 flush**；长 Agent 会话的「可继续 + 可追溯」弱于 OpenClaw。

## 2. 目标

- 北星：**投研 Agent 助手的工作记忆**按 OpenClaw Context Engine 契约演进；讨论压缩降为同一引擎下的一种策略，不再是与 Agent 平行的第二套记忆哲学。  
- **双触发压缩**：保留 12 对 soft（UX/可测）；增加 token（或字符估算）**hard** 闸，对齐 `shouldCompact`。  
- **统一生命周期**：同一 session 上 `assemble →（必要时）compact → model run → commit/afterTurn`；`agentTurn` / `followUp` / 手动整理共用。  
- **子任务默认 isolated**：深度研究等不默认 fork 父会话可变账本；需要父上下文时注入「装配后摘要/硬事实」，而非共享整段 `messages`。  
- 保留投研不变量：`promptSent` 硬事实、摘要审计、archive、sequence、本地优先、不荐股/不自动交易。  
- 源码可追溯：设计与 plan 写明 OpenClaw 本地路径与对照文件；实现注释可链到上游相对路径 + commit。

## 3. 非目标

- 不 vendoring OpenClaw Gateway / agent-core 运行时；不以 npm 依赖 `openclaw`。  
- 不以 `~/.openclaw` 或上游 SQLite transcript 替代本应用会话账本。  
- 不在本设计引入跨用户云同步或向量长期记忆库（flush 若做，落本地研究笔记/表）。  
- 不削弱风险提示；不增加荐股、收益承诺、自动交易。  
- 不重写已归档的 2026-08-09 讨论压缩修订正文；本文件是**面向 Agent 终局的演进设计**，冲突处以「双触发 + 统一引擎」修订说明为准。  
- 本设计批准后的**第一期实现**可不含：检查点 restore UI、memory flush、插件化多引擎；这些属 P2，须在 plan 分期勾选。

## 4. 方案对比与决策

| 方案 | 做法 | 利弊 |
|---|---|---|
| A. 维持对数压缩为唯一哲学 | 只打磨 12 对 / 热尾 | 讨论够用；**不适合**多工具 Agent 终局 |
| B. 整段迁 OpenClaw transcript + 插件引擎 | 抄栈或依赖上游 | 与本地投研账本/Electron 边界冲突；过重 |
| **C（采用）** | 本仓实现窄 `ResearchContextEngine`；语义对照 OpenClaw；账本仍 SQLite 讨论表 + Agent 时间线 | Agent 向对齐；保留审计与硬事实 |

**决策：方案 C。**

## 5. 架构

```text
                    ┌─────────────────────────────────────┐
                    │ ResearchContextEngine（本仓）          │
                    │ assemble / compact / afterTurn        │
                    │ （对照 OpenClaw ContextEngine）        │
                    └──────────────┬──────────────────────┘
                                   │
         ┌─────────────────────────┼─────────────────────────┐
         ▼                         ▼                         ▼
  硬事实层                    工作记忆层                  投研账本层
  promptSent                  累计摘要 + 热尾            archives / revisions
  （永不被摘要改写）            + 本轮 tool 内存           / timeline（可追溯）
         │                         │                         │
         └──────────── assemble ───┴──► Provider / Agent loop ┘
```

### 5.1 窄接口（对照 `types.ts`，不抄插件）

本仓主进程模块（名称可在 plan 敲定，建议 `electron/main/services/researchContextEngine.ts`）对外至少提供：

| 方法 | 语义（对照 OpenClaw） | 本仓落点 |
|---|---|---|
| `assemble` | 在预算内返回有序发模消息 | 现 `buildDiscussionModelMessages` + token/字符预算裁剪 |
| `compact` | 降窗；可 force | 现 `compactDiscussionContextWithinLock` + **hard 闸入口** |
| `afterTurn` / `commitTurn` | 幂等落 user+final；可选后台再评估是否需 compact | `agentTurnService` / followUp 写消息；`requestId` 幂等 |
| （P1）`prepareSubagentSpawn` | isolated \| fork | deep_start / 子编排启动前 |

不做：`registerContextEngine` 插件槽、host-compat 检疫、多 engine 热切换。

### 5.2 双触发压缩

| 触发 | 规则 | 来源 |
|---|---|---|
| Soft（保留） | 未归档完整 user/assistant 对 ≥ **12**；热尾 **6** | 现行修订契约 |
| Hard（新增） | 装配后估算上下文 > `contextWindow - reserve`（或本仓字符上限等价） | 对照 `shouldCompact`；常量在实现中锁定并单测 |

优先级：发模前若 soft 或 hard 任一命中 → 先 `compact`（失败策略与现网一致：警告并继续，不以空历史伪装）。手动「整理本次讨论」= `force` compact。

切点（对照 `findCutPoint`）：

- 只在完整 turn / pair 边界切；不拆开进行中的 tool 对（本轮内存消息）。  
- 热段：soft 用条数 6；hard 压完后仍超预算则再截更早热消息，并注明已截断。  
- 摘要：合并「上一轮累计摘要 + 本次归档段」；**禁止**改写 `promptSent` 中数值/日期/趋势枚举（现有 `validateCompactionSummary` / audit 保留）。摘要提示词结构可参考 OpenClaw `SUMMARIZATION_PROMPT`（Goal / Constraints / Progress / Decisions / Next Steps / Critical Context），但须加「投研：不生成交易指令/目标价」约束。

### 5.3 会话车道

对照 `lanes.ts`：`session:<sessionId>` 上 **agentTurn / followUp / compact / deep 相关写回** 互斥串行。  
实现：继续 `withDiscussionSessionLock`（或显式改名为 lane），**产品与 README 写明等价 OpenClaw session lane**，避免再引入第二把锁。

### 5.4 子编排隔离（P1）

对照 `subagent-spawn-context.ts`：

| 模式 | 本仓语义 |
|---|---|
| `isolated`（默认） | 子任务（如 deep_start）自有运行上下文；只注入装配摘要 + 硬事实要点 + 显式标的；不共享可变热 `messages` 引用 |
| `fork`（显式） | 仅当产品需要「带着完整热对话深挖」时启用；复制快照，子任务结束写回走独立协议，禁止与父会话并发写同一 JSON 覆盖 |

### 5.5 分期

| 期 | 内容 |
|---|---|
| **P0** | 抽出 `ResearchContextEngine` 薄封装（assemble/compact 唯一入口）；实现 hard 闸（字符/估算 token）；README + 单测；OpenClaw 路径写入本 spec（本文） |
| **P1** | deep_start / 子编排 `isolated` 默认；turn `commit` 幂等与 afterTurn 再评估 compact；压缩结果补检查点字段（tokensBefore/After、covered sequence、summaryHash——已有字段则对齐命名） |
| **P2** | 压缩前研究笔记 flush；检查点 list/restore（UI 可后置）；若需第二策略再议窄插件，默认仍单引擎 |

## 6. 数据与兼容

- **不**新建第二套 messages 表替代讨论热 JSON；继续 `ai_discussion_context_compactions` / archives / session.messages。  
- Hard 闸可能增加配置项（如 `agentContextReserveChars` 或基于模型窗的派生值）；默认开启，可与 `autoCompactDiscussion` 联动（soft 关时 hard 仍建议保留——plan 敲定默认值）。  
- Migration：仅当检查点/flush 需要新列或新表时新增向前 Migration；P0 尽量零 Migration。

## 7. UI / 文案

- P0 可不改气泡形态；可选 status：「已整理上下文（窗将满）」与现「讨论整理」区分。  
- 禁止因 hard compact 失败而清空可见历史。  
- 不在 UI 暴露 OpenClaw 品牌；对内文档写清借鉴来源即可。

## 8. 验收标准

1. 规格与 plan 写明本地 OpenClaw 根路径与 commit；实现注释/plan 任务能链到 §0.1 表内文件。  
2. 未满 12 对但装配上下文超过 hard 阈值时，发模前触发 compact（单测用短阈值夹具）。  
3. `agentTurn` 与 `followUp` 只经同一 `assemble`/`compact` 入口，无双重拼接 `promptSent`。  
4. 压缩后硬事实仍以 `promptSent` 为准；摘要审计仍拒绝改写枚举/无痕日期。  
5. 同一 session 并发 turn/compact 仍串行（锁/lane）。  
6. P1：deep_start 默认不共享父热 messages 可变引用；上下文来自 assemble 快照。  
7. 更新 `AIAnalysis/README.md` FR：Context Engine、双触发、子任务 isolated。  
8. 不引入 `openclaw` 包依赖；Public Boundary / verify 相关项通过。

## 9. 风险

| 风险 | 缓解 |
|---|---|
| 估 token 不准导致过频/过稀压缩 | 先用保守字符启发式（可对照 `estimateTokens` / `CHARS_PER_TOKEN_ESTIMATE`）；单测锁阈值；可后续接入 provider usage |
| 与 08-09「仅 12 对」文案冲突 | 本文为演进设计；README 改为「soft 12 对 + hard 预算」 |
| 借参考变成抄栈 | §0.2 + Agent Hub「不抄栈」；code review 拒 Gateway/registry |
| hard compact 增加 AI 调用成本 | 与 soft 共用整理器；已压过且未新增超预算内容则跳过 |

## 10. 修订记录

- 2026-08-12：用户确认产品终局为投研 Agent 助手；应对齐 OpenClaw Context Engine；本地源码 `E:\代码库\git\openclaw` 写入规格；可参考处直接对照源文件；采用方案 C（窄引擎 + 双触发 + 保留投研账本）。
- 2026-08-12：P0 落地后继续执行 P1（isolated deep_start、afterTurn compact、压缩检查点 tokens 字段）。
- 2026-08-12：PR #3 审阅修复后合入；推进 P2（压缩前 research flush + 检查点 list/restore IPC，无 UI）。
- 2026-08-12：P2 后置 UI 另开 [`2026-08-12-compaction-checkpoint-restore-ui-design.md`](./2026-08-12-compaction-checkpoint-restore-ui-design.md)（方案 B：列表可见 + 仅恢复最新层）。
