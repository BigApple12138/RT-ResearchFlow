# 今日复盘 AI 研判取消输出硬拦截 — 设计

**状态：** 已完成  
**日期：** 2026-08-11  
**关联：** `docs/superpowers/specs/2026-08-10-review-report-auto-ai-narrative-design.md`（FR-250）

## 1. 问题

一键复盘本地报告已可用，但自动「AI 研判」经 `sanitizeReviewAiNarrativeText` 的关键词硬拦截（买入/卖出/加仓/减仓等）常被 `OUTPUT_REJECTED`，抽屉红字「模型输出含不当交易指令语气，已拒收」，体感整单复盘不可用。

用户决策：**不要硬拦截**；复盘 AI 段视为辅助建议，应能展示。

## 2. 目标 / 非目标

**目标**

- 去掉复盘 AI 研判路径上对模型正文的交易指令关键词拒收。
- 空正文仍拒收（无内容可展示）。
- Prompt 软约束与报告免责声明保留。
- 「仅重试 AI」可正常拿到可展示正文（在模型调用成功前提下）。

**非目标**

- 不改为荐股产品；不引入自动交易。
- 不改研究讨论 / 证据审计等其它模块的 `auditResearchText` 硬门。
- 不要求对历史已失败快照做批量回填。

## 3. 行为锁定

| 项 | 锁定 |
|---|---|
| 硬拦截 `FORBIDDEN_PATTERN` / `OUTPUT_REJECTED`（交易语气） | **删除** |
| 空串 / 仅空白 | 仍 `OUTPUT_REJECTED`（「模型未返回可用研判正文」） |
| 长度截断 `REVIEW_AI_NARRATIVE_MAX_CHARS` | 保留 |
| `REVIEW_AI_SYSTEM_CONSTRAINTS` 软提示 | **保留**（仍引导风险语气、禁止指令式话术） |
| 本地事实段落与保存 | 不变；AI 软失败语义不变（仅本拒收原因消失） |

## 4. 触点

- `electron/main/services/reviewAiNarrativeService.ts`
- `tests/unit/reviewAiNarrative.service.test.ts`
- `src/components/DecisionCenter/README.md`（FR-250：注明不做输出硬拒收）

## 5. 验收

1. 含「加仓/减仓/买入」等词的模型正文，消毒后 `ok: true` 并可写入 `aiNarrative`。
2. 空输出仍失败且文案可读。
3. 一键复盘：本地报告 + AI 区在调用成功时展示正文，不再因交易词红字拒收。
