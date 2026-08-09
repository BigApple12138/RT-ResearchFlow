# 资讯「与我相关」本地过滤 Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans or subagent-driven-development task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 资讯页默认按持仓本地过滤「与我相关」，降低未读洪峰；可切回全部；不烧 Token。

**Architecture:** 主进程根据 `portfolio_stocks` 构建匹配词表（含可选同产业链节点 peers），在 `briefings.list` 查询中应用 relevance 条件并返回 scoped unread；Renderer 默认 `relevance: 'portfolio'`，FilterBar 切换，汇总条绑定相关未读。

**Tech Stack:** better-sqlite3 briefingRepository、portfolioRepository、React FilterBar / appStore、Vitest。

**状态：** 已完成  

**Spec（设计初衷）：** [`../specs/2026-08-09-portfolio-relevant-briefings-design.md`](../specs/2026-08-09-portfolio-relevant-briefings-design.md)  
**归档：** 完成后填写文末「设计初衷检核」。SDD 约定见 [`../README.md`](../README.md)。

## Global Constraints

- 本地过滤 only；不默认调模型  
- 不自动批量已读/删除  
- 已缓存个股 ≠ 持仓；词表只来自 `portfolio_stocks`（+ 约定 peers）  
- 不荐股；不改详情「一键 AI 分析」语义  
- 无 Migration（除非执行中发现必须落偏好表——本期不做）  
- 改行为同步 README  

## File map

| 文件 | 职责 |
|---|---|
| `electron/main/services/portfolioBriefingRelevance.ts` | 词表构建、命中判定、peers 扩展（纯函数优先） |
| `electron/main/database/briefingRepository.ts` | `relevance` 查询条件、scoped unread、可选 hits 投影 |
| `electron/main/database/types.ts` | `BriefingListOptions` / `BriefingListResult` / 可选 hits 字段 |
| `electron/main/ipc/briefingHandlers.ts` | 透传 options |
| `electron/preload/index.ts` | 类型同步 |
| `src/store/appStore.ts` | `relevanceScope` 默认 `portfolio`；loadBriefings 传参；双未读计数 |
| `src/components/FilterBar/FilterBar.tsx` | 「与我相关 \| 全部」 |
| `src/App.tsx` | 资讯顶栏未读口径 |
| `src/components/BriefingCard/BriefingCard.tsx` | 可选命中弱标签 |
| `src/components/DateArchive` / 今日重点相关 | portfolio 模式下口径一致 |
| `tests/unit/portfolioBriefingRelevance.test.ts` | 词表与命中 |
| `tests/unit/briefingRelevance.list.test.ts` | 列表过滤与回退 |
| BriefingFeed / FilterBar README | FR 行为 |

---

### Task 1: 词表与命中纯函数（TDD）

**Files:**
- Create: `electron/main/services/portfolioBriefingRelevance.ts`
- Create: `tests/unit/portfolioBriefingRelevance.test.ts`
- Read-only reuse: `src/utils/industryChainData.ts` **或** 在 main 侧抽共享匹配用最小 peers 表（若 electron 不宜直接 import `src/`，则把 peers 解析放到可被 main 引用的路径，例如 `electron/main/services/industryChainPeers.ts` 从同一数据源生成——实现时选**一条**不破坏现有打包的路径）

**Produces:**
```ts
type RelevanceKind = 'direct' | 'chain_peer'
function buildPortfolioRelevanceTerms(holdings: Array<{ tsCode: string; stockName: string }>): Array<{ term: string; kind: RelevanceKind }>
function matchBriefingRelevance(input: { title: string; summary: string }, terms: Array<{ term: string; kind: RelevanceKind }>): { hits: string[]; kind: RelevanceKind } | null
```

- [x] 实现词表：name（len≥2）、6 位代码、tsCode；去重  
- [x] peers：仅同 `INDUSTRY_CHAINS` 节点内其他代表股；持仓不在任何节点则无 peers  
- [x] `matchBriefingRelevance`：title/summary 包含词条；direct 优先于 chain_peer  
- [x] 单测：命中名称/代码、过短名称忽略、peers 命中、无关不命中  
- [ ] Commit：`feat(briefings): portfolio relevance term matching`（待用户要求时提交）

---

### Task 2: listBriefings 接入 relevance

**Files:**
- Modify: `electron/main/database/types.ts`
- Modify: `electron/main/database/briefingRepository.ts`
- Modify: `electron/main/ipc/briefingHandlers.ts`
- Modify: `electron/preload/index.ts`
- Create: `tests/unit/briefingRelevance.list.test.ts`（沿用仓库现有 db test 夹具风格）

**Options / Result 形状：**
```ts
// BriefingListOptions
relevance?: 'all' | 'portfolio' // IPC 缺省 'all'

// BriefingListResult 增量
relevanceModeApplied: 'all' | 'portfolio' | 'portfolio_fallback_empty'
portfolioTermCount: number
relevanceUnreadCount: number // 当前过滤口径下的未读
// items[] 可选
relevanceHits?: string[]
relevanceKind?: 'direct' | 'chain_peer'
```

- [x] `relevance=======portfolio'` 且持仓为空 → `relevanceModeApplied=portfolio_fallback_empty`，行为等同 all（不额外 WHERE）  
- [x] 有词表时：SQL 用参数化 `LIKE '%'||?||'%'` OR 组合限制在 title/summary（注意转义 `%`/`_`）；禁止拼裸字符串词表  
- [x] `unreadCount` / `relevanceUnreadCount`：在**同一过滤条件**下统计；`total` 同步为过滤后总数  
- [x] 对返回 items 填充 hits（可用 match 函数，避免二次歧义）  
- [x] direct 优先排序：SQL `CASE` 或内存稳态排序（分页一致——优先在 SQL 层表达）  
- [x] 单测：有持仓过滤、空持仓回退、与 impactRating 组合  
- [ ] Commit：`feat(briefings): list filter by portfolio relevance`（待用户要求时提交）

---

### Task 3: Store + FilterBar 默认「与我相关」

**Files:**
- Modify: `src/store/appStore.ts`
- Modify: `src/components/FilterBar/FilterBar.tsx`
- Modify: `src/components/FilterBar/README.md`（无则创建简短 README）

- [x] 状态：`relevanceScope: 'portfolio' | 'all'`，初始 `'portfolio'`  
- [x] `loadBriefings` / `loadMoreBriefings` / `setFilter` 触发列表时传入 `relevance: relevanceScope`  
- [x] FilterBar：`data-testid="briefing-relevance-portfolio"` / `briefing-relevance-all`  
- [x] 展示 `portfolio_fallback_empty` 与 0 命中空态文案（可用 store 中的 `relevanceModeApplied` + total）  
- [ ] Commit：`feat(feed): default portfolio-relevant briefing filter`（待用户要求时提交）

---

### Task 4: 顶栏未读口径 + 卡片命中 + 今日重点一致

**Files:**
- Modify: `src/App.tsx`（资讯汇总「未读资讯」）  
- Modify: `src/components/BriefingCard/BriefingCard.tsx`（弱标签「命中：xxx」）  
- Modify: 今日重点数据源组件（检索 `今日重点` / high impact rail）  
- Modify: `src/components/BriefingFeed/README.md`（或等价模块 README）

- [x] 顶栏未读：`relevanceScope==='portfolio'` 且非 fallback 时显示 `relevanceUnreadCount`（或过滤后 unread）；提供「全部未读 N」次级信息（小字/title）  
- [x] 卡片展示最多 2 个 hits  
- [x] 今日重点列表与中间 feed 使用同一 relevance 参数  
- [ ] Commit：`feat(feed): scoped unread and relevance hit labels`（待用户要求时提交）

---

### Task 5: 验证与设计初衷检核

- [x] `pnpm run test:unit --` 相关单测（须 Electron ABI）  
- [x] `pnpm run typecheck`  
- [ ] 手工：有持仓默认相关条数 ≪ 全部；切全部恢复；无持仓提示  
- [x] 填写下方检核表；更新 spec/plan 文首状态为「已完成」或「已完成（有偏差）」  
- [ ] Commit：`docs: portfolio-relevant briefings design audit`（待用户要求时提交）

---

## 执行说明

1. 用户批准本 plan + spec 后，再改 `src/` / `electron/`。  
2. 推送仅 fork `origin`，禁止 upstream。  
3. AI 持仓摘要另开 SDD，不在本 plan 范围。  

---

## 设计初衷检核（完成后填写，归档用）

| Spec 项 | 结果（符合 / 偏差 / 未做） | 说明 |
|---|---|---|
| 默认「与我相关」 | 符合 | store `relevanceScope` 初始 `portfolio` |
| 本地过滤、0 Token | 符合 | SQL LIKE + 本地词表，无模型调用 |
| 可切回全部；分级/搜索仍可用 | 符合 | FilterBar 分段 + 既有 rating/search 叠加 |
| 相关未读口径诚实 | 符合 | `unreadCount`=相关；`allUnreadCount` 次级展示 |
| 无持仓回退全部 + 提示 | 符合 | `portfolio_fallback_empty` + FilterBar/空态文案 |
| 0 命中空态可切全部 | 符合 | BriefingFeed CTA `briefing-feed-empty-show-all` |
| 命中可解释（弱标签） | 符合 | 卡片最多 2 个 hits；direct/peer 文案 |
| 单条 AI 入口行为未改 | 符合 | 未动 BriefingDetail AI 入口 |
| 同节点 peers 扩展不过宽 | 符合 | 仅同 INDUSTRY_CHAINS 节点其他代表股 |
| 单测 + README | 符合 | relevance 单测 + FilterBar/BriefingFeed README |

**总评：** 实现与设计一致，无已知偏差。  
**检核人 / 日期：** Agent / 2026-08-09  

