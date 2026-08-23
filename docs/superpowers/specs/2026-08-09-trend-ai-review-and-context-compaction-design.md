# 趋势 AI 复核 + 讨论上下文压缩 — 设计

**状态：** 已批准；实现由 2026-08-09 契约修订设计与计划收敛（方向：方案 1 + 触发 3 + 落库进讨论 C + 上下文压缩 B）  
**日期：** 2026-08-09  
**归档：** 本文件为设计初衷；实现对照见 [`../plans/2026-08-09-trend-ai-review-and-context-compaction.md`](../plans/2026-08-09-trend-ai-review-and-context-compaction.md)。完成后不得删改本节目标/非目标以掩盖偏差。  
**依赖：** 现有趋势评分 V2（`classifyTrendState`）、研究讨论 FR-239、AI 分析会话 FR-226、研究文本审计

## 1. 问题

1. 趋势雷达「结构稳定 / 结构破坏」等由本地硬规则判定，边界态缺少可解释的第二意见。  
2. 研究讨论仅有开场 `promptSent` 快照 + 无限堆叠的 `messages`，**没有**会话级上下文管理与自动压缩，长聊贵、吵、易撞 JSON 整段覆盖写风险。  
3. 从雷达进入讨论时，趋势事实与复核意见默认进不了上下文。

## 2. 目标

做成一条能力链：

| 能力 | 说明 |
|---|---|
| AI 结构复核 | 本地 `trendState` 保留为真相源；并排展示 AI 复核标签（枚举词表） |
| 触发 | 单只默认；勾选批量进阶；均需显式点击 |
| 落库 + 去讨论 | 按 `tsCode + scoreDate` 持久化（数据库列为 `score_trade_date`）；可带事实包进入研究讨论 |
| 上下文压缩 | 硬事实层结构化保留；对话层整理为累计摘要 + 最近原文，历史原文移出会话热 JSON |

## 3. 非目标

- AI **改写**或覆盖本地 `trendState`  
- 打开雷达/进入页面自动调模型  
- 荐股、目标价、仓位、自动交易语气  
- 全局「Agent 长期记忆」跨会话向量库  
- 产业研究自动 handoff、深度研究自动调度（沿用 Phase 2a 确认制）  
- 替换趋势评分七维权重本身（本批只消费现有分数与状态）

## 4. 产品原则

- **本地优先 / 显式 AI**：未点击不烧 Token。  
- **双轨标签**：本地规则 = 可复现尺子；AI = 复核意见，冲突时两者并排，不静默合并。  
- **硬事实不可压丢**：评分日、`trendState`、MA60、有效权重、AI 枚举结论等进入结构化事实包，压缩只动闲聊/长推理。  
- **可审计**：复核与压缩均写本地账本；讨论审计继续拦截交易指令语言。  
- **窄 IPC**：Renderer 只收展示 DTO；模型调用与词表校验在主进程。  

### 4.1 固定数据契约

- 应用层趋势工作台字段统一使用 `scoreDate`；`trend_structure_reviews.score_trade_date` 只在 Repository 层做 snake_case 映射。`scoreTradeDate` 不作为 Renderer/Service DTO 字段。
- 复核事实包只能由主进程按白名单字段构造：`tsCode`、`stockName`、`trendState`、`totalScore`、`scoreDelta5d`、`scoreDelta20d`、`maAbove60`、`validWeight`、`dataCoverage`、`facts`、`scoreDate`。不得透传 `costPrice`、`profitPct`、`positionAdvice`、原始 workbench item 或任意 Renderer 文本。
- `factsHash` 是对规范化事实包按稳定键排序后的 SHA-256。复核记录的 `scoreDate` 或 `factsHash` 与当前工作台不一致时均视为过期。
- “带着复核去讨论”使用主进程专用 `trend:openStructureReviewDiscussion` 桥接 IPC。Renderer 只提交 `tsCode`、`scoreDate`、`factsHash`、问题草稿和 `returnTarget`；主进程重新读取复核与当前事实，拒绝过期或不匹配的身份。
- 为避免改造 FR-239 的 SQLite `origin_type` CHECK，桥接讨论持久化为 `origin_type = 'manual'`、稳定的 `origin_id = reviewKey`，并在 `context_snapshot_json.contextKind` 标记为 `trend_review`。`reviewKey = trend-review:${normalizedTsCode}:${scoreDate}:${factsHash}`，不同事实版本不会恢复到同一会话。
- 桥接服务调用现有讨论创建核心时，使用仅主进程可见的 `trendReviewFacts` 内部参数走 `resolveOrigin`；普通 `manual` 讨论仍必须提供用户问题，Renderer 不能伪造 `context_snapshot_json`。
- 复核记录不写单值 `session_id`：同一份复核可以进入多个讨论；讨论快照保存 `reviewKey`、事实包和复核来源即可。

## 5. AI 复核词表（主进程强制校验）

| 枚举值 | 展示 | 含义 |
|---|---|---|
| `agree` | 同意本地 | 与本地状态一致 |
| `possible_false_break` | 可能假破 | 本地 broken，疑似假破 |
| `possible_false_hold` | 可能假站上 | 本地强/稳定，站上不牢 |
| `evidence_weak` | 证据偏弱 | 结论可成立但证据一般 |
| `need_more_data` | 需补数据 | 覆盖/权重不足，拒绝对抗本地标签 |

附加字段：`rationale`（≤120 字）、`focusPoints`（0–3 条短句）。复核记录同时保存 `factsHash`、请求 ID、Provider/Model 与审计结果，便于解释“当时基于什么事实生成”。  
模型输出经 JSON schema / 正则校验；非法则整单失败并 Toast，不写半残标签。  
过期：当最新工作台 `scoreDate`、事实哈希或行情日与复核记录不一致 → UI 灰态「需重核」。

## 6. 趋势雷达交互

### 6.1 列表

- 保留现有 `TrendStateBadge`。  
- 若存在未过期复核 → 并排 `AiTrendReviewBadge`。  
- 过期 → 灰态徽章 +「需重核」。  
- 无记录 → 不占位。

### 6.2 单只（默认）

入口：行内或详情抽屉「AI 复核结构」。  
流程：打包本地事实 → `trend:reviewStructure` → 校验 → upsert → 刷新工作台附加字段。  
进行中禁用按钮；失败不改本地状态。

### 6.3 批量（进阶）

勾选（上限 20）→「批量复核」→ 确认条数提示 → **串行**执行（避免与深度研究/多会话争资源）→ 进度 → 逐条落库。  
超限提示分批。任一条失败记入结果摘要，不中断整批；本批固定为“遇错继续”，不增加第二个批处理策略配置。

### 6.4 去讨论

「带着复核去讨论」：

1. Renderer 调用 `trend:openStructureReviewDiscussion`，只传复核身份，不上传事实正文。  
2. 主进程校验当前 `scoreDate`/`factsHash`，从本地复核表和评分事实重建 `contextKind = 'trend_review'` 快照。  
3. `promptSent` 注入：**本地趋势事实 + AI 复核 + 关键数值 + 事实截点**；不含成本价、收益率或仓位字段。  
4. `returnTarget` 固定回到 `{ tab: 'trend-watcher', subTab: 'dashboard', entityId: tsCode, stateKey: 'trend-radar' }`。  
5. 导航打开 AI 分析会话；首条用户问题可预填，**不**自动代发需确认的长分析（与现有「整理本次讨论」习惯一致：显式发送）。

## 7. 讨论上下文模型（压缩）

### 7.1 三层

```
发给模型的有效上下文 =
  [硬事实包 / promptSent 结构化段]
+ [最新的累计对话摘要]
+ [最近未归档的原文]
```

| 层 | 内容 | 压缩策略 |
|---|---|---|
| 硬事实 | 来源快照、趋势复核、持仓简报事实、评分日、枚举结论 | **不删除**；事实日变更时标记 stale 并提示刷新 |
| 累计摘要 | 已归档对话的累计摘要；每次新摘要必须覆盖上一次累计摘要 | 新摘要覆盖旧摘要与新增原文，不能只保留“最近一次增量摘要” |
| 热对话 | 最近未归档的 user/assistant 原文 | 超过阈值后归档旧段，热 JSON 只保留尾部 |

`ConversationMessage` 增加稳定的 `sequence`（单调递增）和可选的 `requestId`；压缩范围、研究变更范围和 UI 展示均按 sequence，不使用会因归档而漂移的数组下标。压缩摘要不插入 `messages`，由压缩表保存并在 `getSession` 中以独立元数据返回。

### 7.2 触发

- **自动（可关）**：`ai_config.autoCompactDiscussion` 默认开启；当未归档原文达到 **12 个 user+assistant 对** 且会话非 busy（无深度研究 running）时，在**下一次 followUp 前**先跑压缩。阈值固定为可注入常量，不能在实现中同时混用字符阈值而不更新验收。  
- **手动**：讨论页「整理上下文」按钮（与「整理本次讨论」变更包区分文案：**整理聊天上下文**）。  
- 压缩本身复用当前会话 Provider/Model，并使用独立的压缩 token 上限；失败则跳过压缩并继续原 followUp（Toast 说明），避免卡死发送。  

### 7.3 账本形态

- `messages` 增加 `sequence`、可选 `requestId`，只保存未归档的热消息。历史原文进入 `ai_discussion_message_archives`，保留原始消息 JSON 及 sequence，供审计和“整理本次讨论”使用。
- 新表 `ai_discussion_context_compactions` 保存累计摘要（不是只覆盖本次增量）、摘要覆盖的 sequence 范围、源消息哈希、摘要哈希、requestId、Provider/Model。
- `buildDiscussionModelMessages` 改为：`promptSent` + 最新累计 compaction summary + `messages` 中的热尾部；摘要不作为 user/assistant 消息写回，避免破坏现有 Provider 的 role 投影和消息索引。
- 现有 `ai_research_discussion_contexts.summarized_through_message_index` 只继续表示 FR-239「整理本次讨论」的研究变更游标，不得由上下文压缩更新。`prepareDiscussionChanges` 改用 `throughMessageSequence`，从归档表 + 热消息恢复完整原文后再按现有游标选段。

### 7.4 并发

- 会话存在深度研究 `queued|running|paused` → 禁止自动/手动压缩与追问（已有 busy）。  
- 压缩与 followUp 串行；主进程按 `sessionId` 加锁，锁覆盖读取会话、模型调用、归档/写热消息的完整生命周期，不接受 Renderer busy 状态作为安全判断。  
- `ai:followUp` 增加 `requestId`，主进程为同一 `sessionId` 的重复 request 返回已有 turn 结果，不重复追加 user/assistant 消息；锁和幂等记录均在主进程实现。

## 8. 数据与 IPC（概要）

### 8.1 新表（Migration ≥ 136）

`trend_structure_reviews`：

- `ts_code` TEXT NOT NULL  
- `score_trade_date` TEXT NOT NULL  
- `local_trend_state` TEXT NOT NULL  
- `local_total_score` REAL  
- `ai_verdict` TEXT NOT NULL  
- `rationale` TEXT NOT NULL  
- `focus_points_json` TEXT NOT NULL  
- `facts_hash` TEXT NOT NULL  
- `request_id` TEXT NOT NULL  
- `audit_json` TEXT NOT NULL  
- `model` / `provider`（数据不足短路径允许 NULL）  
- `created_at` INTEGER NOT NULL  
- `updated_at` INTEGER NOT NULL  
- PRIMARY KEY (`ts_code`, `score_trade_date`)

`ai_discussion_context_compactions`：

- `id` TEXT PRIMARY KEY、`session_id` INTEGER NOT NULL、`created_at` INTEGER NOT NULL
- `source_start_sequence` INTEGER NOT NULL、`covered_through_sequence` INTEGER NOT NULL
- `summary_text` TEXT NOT NULL、`source_messages_hash` TEXT NOT NULL、`summary_hash` TEXT NOT NULL
- `request_id` TEXT NOT NULL UNIQUE、`provider` TEXT NOT NULL、`model` TEXT NOT NULL

`ai_discussion_message_archives`：

- `session_id` INTEGER NOT NULL、`message_sequence` INTEGER NOT NULL、`message_json` TEXT NOT NULL
- `compaction_id` TEXT NOT NULL、`archived_at` INTEGER NOT NULL
- PRIMARY KEY (`session_id`, `message_sequence`)

`ai_discussion_turn_requests`：

- `request_id` TEXT PRIMARY KEY、`session_id` INTEGER NOT NULL、`status` TEXT NOT NULL CHECK (`status` IN ('running', 'succeeded', 'failed'))
- `user_message` TEXT NOT NULL、`response_text` TEXT、`created_at` INTEGER NOT NULL、`completed_at` INTEGER NULL

`ai_config.autoCompactDiscussion`：INTEGER NOT NULL DEFAULT 1；通过前向 Migration 写入旧库。

### 8.2 IPC

- `trend:reviewStructure` `{ requestId, tsCode }`  
- `trend:reviewStructureBatch` `{ requestId, tsCodes: string[] }`（主进程串行；主进程为每个 code 派生稳定 item request key）  
- `trend:openStructureReviewDiscussion` `{ requestId, tsCode, scoreDate, factsHash, initialQuestion?, returnTarget }`  
- `ai:compactDiscussionContext` `{ requestId, sessionId, mode: 'auto'|'manual' }`  
- `ai:followUp` `{ requestId, sessionId, message }`  
- `industryResearch:prepareDiscussionChanges` 将 `throughMessageIndex` 改为 `throughMessageSequence`，并从归档 + 热消息读取完整原文。  
- AI 配置增加 `autoCompactDiscussion` boolean，默认 true；阈值固定为 12 个 user+assistant 对。

## 9. 风险与坑

| 坑 | 对策 |
|---|---|
| AI 输出交易指令 | 复用 `auditResearchText`；失败不落库 |
| 批量烧 Token | 上限 20 + 确认文案；串行 |
| 压缩丢硬事实 | 硬事实只在 promptSent/事实包；摘要提示词禁止改写枚举与数值 |
| messages 整段覆盖竞态 | session 级互斥锁 |
| 压缩与 FR-239 整理游标混淆 | compaction 使用 message sequence；`summarized_through_message_index` 只用于研究变更 |
| 最新摘要覆盖历史上下文 | 摘要必须携带上一条累计摘要并写入 source/summary hash |
| 热 JSON 继续无限增大 | 压缩成功后原文进入 `ai_discussion_message_archives`，会话只留热尾部 |
| 假「软件待更新」误解 | 文案用「AI 复核 / 需重核」，避免「待更新」 |
| 与 Phase 2a 深挖 suggest | 压缩后意图识别仍基于最新用户原文 |

## 10. 验收

1. 雷达单只复核后出现并排 AI 徽章；本地徽章不变。  
2. 评分日或 factsHash 变化后徽章灰态「需重核」。  
3. 批量勾选 ≤20 可完成；>20 被拒。  
4. 「带着复核去讨论」后 `promptSent`/首屏可见趋势事实与 AI 枚举。  
5. 长会话触达 12 对后自动或手动压缩；热 JSON 只保留尾部；再追问时模型侧使用累计摘要而不带全量旧原文。  
6. 压缩/复核失败有明确 Toast；主进程在深度研究 busy 时拒绝；重复 requestId 不重复写消息。  
7. 压缩后「整理本次讨论」仍能从归档 + 热消息读取完整原文，且不推进错误的 FR-239 研究变更游标。  
8. 单测覆盖：词表校验、过期判定、事实哈希、累计摘要、sequence、归档恢复、requestId 重放、`buildDiscussionModelMessages`、classify 不被 AI 路径修改。

## 11. 组件 README

改行为后必须更新：

- `src/components/TrendWatcher/README.md`  
- `src/components/AIAnalysis/README.md`  
- `src/components/ResearchDiscussion/README.md`

## 12. 分期（实现顺序，仍属同一批准范围）

实现计划按任务切开交付，但**同属本设计一次批准**，不拆第二个产品决策：

1. Migration + 复核服务 + 雷达 UI  
2. 去讨论事实注入（先完成 Phase A 集成验收）  
3. 压缩账本、消息归档与 `buildDiscussionModelMessages`  
4. 自动/手动触发、主进程锁、幂等与设置  
5. 测试、README、E2E 与验收
