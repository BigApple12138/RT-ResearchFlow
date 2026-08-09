# 趋势 AI 复核 + 讨论上下文压缩——契约与落地修订设计

**状态：** 已批准并完成（实现与验收以修订版 plan 为准）  
**日期：** 2026-08-09  
**上游设计：** [`2026-08-09-trend-ai-review-and-context-compaction-design.md`](./2026-08-09-trend-ai-review-and-context-compaction-design.md)  
**修订原因：** 上游设计已经有一轮实现，但发现词表、事实包、复核历史和讨论压缩仍存在契约偏差。本文件只记录必须落地的修订，不改写上游设计正文。

## 1. 最终目标

完成一条可审计的本地优先能力链：

```text
本地趋势评分
  -> 主进程白名单事实包
  -> AI 第二意见（不改 trendState）
  -> 不可变复核 revision + latest projection
  -> 可校验地带复核事实进入讨论
  -> sequence 消息
  -> 累计摘要 + 归档原文 + 热尾部
  -> 主进程锁与 requestId 幂等
```

本轮实现覆盖 Phase 0/A/B/C；不引入荐股、收益承诺、自动交易、跨会话长期记忆或自动调度深度研究。

## 2. 修订后的硬契约

### 2.1 趋势复核

- `AiTrendVerdict` 只允许 `agree`、`possible_false_break`、`possible_false_hold`、`evidence_weak`、`need_more_data`。
- `rationale` 最多 120 个字符；`focusPoints` 最多 3 条，每条最多 80 个字符。
- `TrendReviewFacts` 只包含稳定评分事实：`tsCode`、`stockName`、`trendState`、`totalScore`、`scoreDelta5d`、`scoreDelta20d`、`maAbove60`、`validWeight`、`dataCoverage`、`facts`、`scoreDate`。不包含成本价、收益率、仓位建议、实时价格、涨跌幅、`quoteTime`、原始 workbench item 或 Renderer 文本。
- `factsHash` 对规范化白名单事实做稳定 SHA-256；当前 `scoreDate` 或 hash 变化即 stale。
- `trend_structure_review_revisions` 保存每次成功复核，按 revision ID / request ID / code-date-factsHash 保证不可变；`trend_structure_reviews` 只保存最新投影，不能覆盖 revision 审计记录。
- 旧词表数据迁移到 legacy 表保留原文；不得把旧结论伪装成新词表结论。
- AI 只能并排提供第二意见，不改写本地 `trendState`。
- 批量复核主进程串行，并通过 `trend:reviewProgress` 逐条发送运行、成功、失败事件；批量返回仍包含逐条结果。
- “带着复核去讨论”只提交身份（代码、评分日、hash），主进程重新读取事实和复核；return target 固定回到 `{ tab: 'trend-watcher', subTab: 'dashboard', entityId, stateKey: 'trend-radar' }`。

### 2.2 讨论消息与压缩

- `ConversationMessage.sequence` 是主进程生成的 session 内单调正整数；`requestId` 可选但由主进程写入 user/assistant turn，Renderer 不计算 sequence。
- 压缩阈值固定为未归档的 12 个完整 user/assistant 对；自动压缩默认开启，可在 AI 配置关闭。
- 热消息保留最近 6 条；被压缩的旧消息原文进入 `ai_discussion_message_archives`，累计摘要进入 `ai_discussion_context_compactions`，摘要不写入 `messages`。
- 成功压缩在同一 SQLite 事务完成：创建本次 compaction 记录、归档旧 sequence、写入累计摘要、将 session 热 JSON 替换为尾部。失败不改变热消息。
- 模型上下文固定为 `promptSent 硬事实 + 最新累计摘要 + 热消息 + 当前问题`；摘要不能替代硬事实，也不能改写日期、数值或趋势枚举。
- FR-239 “整理本次讨论”使用 `throughMessageSequence`，从归档表与热消息按 sequence 合并恢复；旧 `summarized_through_message_index` 只作为历史兼容游标，不再由压缩更新。
- 同一 session 的 follow-up、自动/手动 compact、持仓简报、深度研究报告写回由主进程 Promise lock 串行；深度研究 `queued|running|paused` 时主进程拒绝追问和压缩。
- `ai:followUp` 和 `ai:compactDiscussionContext` 均要求 UUID requestId；成功的 follow-up request 重放直接返回已有 turn，不重复写消息。压缩失败只提示并继续原 follow-up。

## 3. 数据迁移

- 140：创建 `trend_structure_review_revisions`；重建最新投影为新词表；旧 projection 改名为 `trend_structure_reviews_legacy` 并保留原始记录。
- 141：为讨论上下文和产业研究变更批次增加 sequence 游标/范围列；保留旧 index 列供历史读兼容。
- 现有 136–139 在空库和旧库上继续向前、幂等执行；不得删除研究账本或运行数据库之外的历史事实。

## 4. 验收证据

必须有单测证明：新词表/边界校验、稳定事实 hash、旧 projection 保留、revision 不覆盖、批量 progress 串行、sequence 规范化、累计摘要、归档恢复、模型上下文不带全量旧文、busy/lock、requestId 重放、压缩失败继续追问、FR-239 sequence 回归。最后运行 typecheck、lint、unit、build、`verify`、Public Boundary，并更新三份组件 README 与 plan 检核表。
