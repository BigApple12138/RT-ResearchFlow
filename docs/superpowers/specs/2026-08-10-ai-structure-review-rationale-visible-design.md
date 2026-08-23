# AI 结构复核 rationale / focusPoints 可见展示 — 设计

**状态：** 已完成（实现未 commit）  

**日期：** 2026-08-10  
**方法论：** SDD  
**用户选型：** UX **方案 A**（在徽章旁可见展示，不只依赖原生 `title` tooltip）  
**批准：** 用户回复「批准」（2026-08-10）；§5.2 锁定推荐默认——徽章短标签两路径均保留「需补数据」，仅靠解释块前缀区分  
**上游能力：** [`2026-08-09-trend-ai-review-and-context-compaction-design.md`](./2026-08-09-trend-ai-review-and-context-compaction-design.md) 与 [`2026-08-09-trend-ai-review-and-context-compaction-revision-design.md`](./2026-08-09-trend-ai-review-and-context-compaction-revision-design.md)  
**关联 plan：** [`../plans/2026-08-10-ai-structure-review-rationale-visible.md`](../plans/2026-08-10-ai-structure-review-rationale-visible.md)

## 1. 问题

趋势雷达 AI 结构复核已落库并返回 `structureReview.rationale`（≤120 字）与 `focusPoints`（0–3 条）。当前 `AiTrendReviewBadge` 只把 `rationale` 塞进原生 `title` tooltip；`focusPoints` 在列表/行面完全不可见。用户看到「AI · 需补数据」时，很难立刻理解**为什么**，也容易把该徽章误读成「本地日线/评分事实缺失」，而实际上：

- 本地摘要可显示「事实完整」（`LocalTrendSummary` / `dataCoverage.ready` 等确定性规则）；
- 同条同时可有 AI `need_more_data`（模型第二意见，或本地门槛未过的确定性短路）。

二者可以共存；当前 UI 没有把「AI 第二意见」与「本地数据状态」拆开说清。

## 2. 目标

- **方案 A**：凡展示 `AiTrendReviewBadge` 的表面（当前主入口：趋势雷达列表/行；日后凡复用该组件的工作台表面自动继承），在徽章**近旁**可见展示：
  - **一行** `rationale`（有则显示；空则不占行）；
  - **最多 3 条** `focusPoints`（有则显示；空数组不占位）。
- 不依赖 hover 才能读到核心解释；原生 `title` 可作为补充，不再是唯一通道。
- 用**低成本文案**区分：`need_more_data` 来自**本地门槛确定性短路** vs **模型第二意见**；避免在模型路径下暗示「本地缓存缺失」。
- 实现落地时同步更新 `src/components/TrendWatcher/README.md` 行为说明（见 §7 验收）。

## 3. 非目标

- **不做方案 C**：不建「补数据向导」、不串联自动 backfill、不因徽章点击触发拉数/补齐流程。
- 不改 AI 五枚举词表、不改 revision / `factsHash` / 讨论桥接契约。
- 不改写本地 `trendState`；不把 AI 文案合并进「本地规则 · 事实完整」状态。
- 不新增荐股、目标价、仓位、自动交易语气；不扩大白名单事实包。
- 不在本批为 K 线抽屉单独做第二套解释 UI（抽屉若未挂 `AiTrendReviewBadge`，本批不强制新增；若日后挂上，随组件行为自动带上）。
- ~~本文件批准前：不写 plan、不改业务代码。~~（已批准，见文首状态）

## 4. 产品真相（必须写进 UI 语义）

| 轨道 | 含义 | 典型文案位置 |
|---|---|---|
| 本地规则 | 可复现的评分/覆盖/权重尺子 | 「本地规则 · 事实完整 / 部分维度 / 证据不足」、日线根数列 |
| AI 复核 | 第二意见，不覆盖本地状态 | 「AI · …」徽章 + 本设计的 rationale / focusPoints |

**硬约束：**

1. 本地显示「事实完整」**不得**因同条存在 `need_more_data` 而被改成「缺数据」或被隐藏。
2. 仅当复核来自**确定性门槛短路**（当前实现：综合分为空、有效权重 &lt; 70%、或 `dataCoverage.state !== 'ready'`，**不调模型**）时，UI 才可把解释语气对准「本地行情/评分事实尚不足以下结论」。
3. 当模型返回 `need_more_data` 时，解释语气必须是 **AI 第二意见**（例如证据/上下文不足以对抗本地结构标签），**禁止**文案声称「本地日线缺失」或「请先补齐本地数据」——除非同条本地轨道本身已是非 ready / 证据不足（那是本地徽章/摘要自己的话，不是 AI 块替本地说话）。

## 5. 方案（仅 A）

### 5.1 展示结构

在现有徽章旁（建议：徽章下方或同行换行的次级文本块，窄列可换行，避免撑破表格可读性）渲染：

```text
[TrendStateBadge] [AI · <label>]
  rationale（单行截断 / line-clamp-1，全文仍可 title 或可访问名称补齐）
  · focusPoint1
  · focusPoint2   （最多 3；无则省略整块）
  · focusPoint3
```

- **组件边界**：优先在 `AiTrendReviewBadge`（或紧邻的同文件小组件）内完成，使所有调用方行为一致；`TrendDashboard` 列表行是首要验收面。
- **stale（需重核）**：徽章灰态「需重核」保留；解释块可显示原 rationale/focusPoints，并加一句短提示「事实已变化，请重新复核」（可与现有 title 文案对齐）。不得假装仍是当前有效第二意见。
- **无 review**：不占位（现状不变）。
- **无 focusPoints**：只显示 rationale；**无 rationale**：只显示 focusPoints（若皆空，仅保留徽章）。

### 5.2 `need_more_data` 文案（廉价区分）

不新增用户可见开关；尽量复用已有落库字段做区分：

| 来源 | 判定（实现阶段定具体字段，设计意图如下） | 徽章短标签 | 解释块前缀 / 语气 |
|---|---|---|---|
| 确定性短路 | 未调模型即落 `need_more_data`（今日 `provider`/`model` 为空且 rationale 来自门槛拼装） | 保持「需补数据」 | 前缀可选「本地门槛」；rationale 可继续说明评分/权重/覆盖不足 |
| 模型第二意见 | 调过模型后 verdict=`need_more_data` | 保持「需补数据」**或**廉价改为「证据不足（AI）」——**二选一，批准后在 plan 锁定一个**；不得改枚举值 | 前缀固定「AI 第二意见」；禁止「本地数据缺失」类断言 |

推荐默认（待批准确认）：**徽章短标签两路径都保留「需补数据」**，只靠解释块前缀区分——改动面最小，避免词表/测试大面积漂移。

若 workbench DTO 当前未下发 `provider`/`model`，实现时可二选一（plan 定）：

- 向 `structureReview` **只读附加** `provider`/`model`（或 `source: 'gate' | 'model'`），不改 revision 语义；或  
- 纯 UI 启发式（弱）：不推荐作为唯一真相。

确定性路径的既有 focusPoints（如「补齐本地行情与评分事实后再复核」）可保留；模型路径若返回类似「补本地」措辞，展示仍按原文截断显示，但**产品侧前缀与 README**须强调：那是模型意见，不等于本地覆盖状态。

### 5.3 交互与无障碍

- 列表行点击选中股票的行为不变；解释块不单独抢点击（或 `stopPropagation` 仅当未来加链接——本批不加链接）。
- `data-testid`：保留 `trend-ai-review-badge-${stockCode}`；新增 rationale / focusPoints 可测节点（如 `trend-ai-review-rationale-*`、`trend-ai-review-focus-*`），便于单测/E2E。
- 对比度与暗色主题跟随现有徽章色阶；减少动态效果，不新增动画动画。

### 5.4 明确不做（对照曾讨论过的其它 UX）

- **B**（仅强化 tooltip / 浮层）：不做。
- **C**（补数据向导）：不做。
- 不因可见 rationale 自动打开讨论或自动重跑复核。

## 6. 范围与文件预期（批准后 plan 细化）

| 区域 | 预期 |
|---|---|
| `AiTrendReviewBadge.tsx`（及必要时极薄样式辅助） | 可见 rationale + focusPoints |
| `TrendDashboard.tsx` | 布局容纳换行；不复制第二套文案逻辑 |
| `trendWorkbenchTypes` / workbench 映射 | 仅当需要 `source`/`provider` 区分时只读扩展 |
| `TrendWatcher/README.md` | **实现时**更新行为/FR 说明（见 §7）；本设计阶段只把要求写在验收项，**此刻不改 README** |
| 单测 | 徽章渲染：有/无 focusPoints、stale、确定性 vs 模型前缀（若落地区分） |

不引入新 IPC、Migration、npm 依赖。

## 7. 验收标准

1. 趋势雷达列表行在存在未删除的 `structureReview` 时，**不悬停**即可看到一行 rationale；若有 focusPoints，最多可见 3 条。  
2. 任意复用 `AiTrendReviewBadge` 的表面行为与列表一致。  
3. 本地「事实完整」与 AI「需补数据」可同屏并存，且 AI 块不冒充本地缺数（模型路径有「AI 第二意见」语义；确定性路径才可谈本地门槛）。  
4. stale 时仍有「需重核」语义，且不把过期意见伪装成当前有效。  
5. 无补数据向导、无自动 backfill、无词表变更、无 `trendState` 改写。  
6. **实现阶段**更新 `src/components/TrendWatcher/README.md`：写明徽章旁可见 rationale/focusPoints；写明双轨语义（本地事实完整 ≠ 否定 AI `need_more_data`）；写明 `need_more_data` 两种来源的展示差异。可标为既有 AI 复核 FR 的补充条款（若模块尚未编号 FR，用清晰行为条目即可）。  
7. 相关单元测试（及若有 E2E `data-testid`）覆盖上述可见性；实现完成后按仓库惯例跑相关 verify 子集。

## 8. 风险与缓解

| 风险 | 缓解 |
|---|---|
| 表格行高膨胀 | rationale 单行截断；focusPoints 用紧凑 `text-[10px]/11px` 列表；窄列允许换行 |
| 用户仍把「需补数据」当成缺日线 | 前缀 + README；本地覆盖列/「事实完整」保持独立 |
| DTO 缺来源字段 | 只读附加 `source`/`provider`，不改 revision 不可变语义 |

## 9. 批准门禁

- **当前状态：已完成**（用户「批准」后实现；代码未 commit）。  
- §5.2 短标签：锁定推荐默认（两路径均「需补数据」，解释块前缀区分）。  
- Plan：[`../plans/2026-08-10-ai-structure-review-rationale-visible.md`](../plans/2026-08-10-ai-structure-review-rationale-visible.md)。
