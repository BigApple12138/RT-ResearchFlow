# 观察池主题树入库 + 联网补充分类（二期）Implementation Plan



> **For agentic workers:** Do **not** implement Phase-2 product code until the **Phase-1 复盘门禁** below is satisfied, this plan/design is revised if needed, the linked spec is approved for execution, **and** the user explicitly says to execute. Use checkbox tracking.



**Goal:** 主题树进 SQLite 并在观察池 UI 可增删改；加股表单提供显式授权的「联网补充分类」，结果落入树内节点或待采用建议。



**Architecture:** 新 Migration 灌/升 `watchlist_category_nodes` → 树仓库 + 校验改读 DB → IPC CRUD/rename/delete(§6 方案 C) → TrendManager 维护 UI；另增单次授权 `webSuggest`（复用研究搜索，mock 可测）→ 采用路径写树后再填表。



**Tech Stack:** TypeScript、better-sqlite3、Electron IPC、Vitest、复用研究侧受控搜索（spec Q5 已确认）。



**状态：** 已完成（实现 + 聚焦单测/typecheck + 设计初衷检核）；待 commit/push



**Spec：** [`../specs/2026-08-09-watchlist-category-tree-web-design.md`](../specs/2026-08-09-watchlist-category-tree-web-design.md)



**前置依赖：** [`2026-08-09-watchlist-category-em-map`](./2026-08-09-watchlist-category-em-map.md)（一期）及其 design [`../specs/2026-08-09-watchlist-category-em-map-design.md`](../specs/2026-08-09-watchlist-category-em-map-design.md)。



---



## 过程门禁：一期复盘 → 再定二期 → 才实现（硬门禁）



**必须按顺序，不得跳过：**



1. **先**对照一期设计/计划复盘一期**实现结果**（代码 + 行为 vs  

   [`../specs/2026-08-09-watchlist-category-em-map-design.md`](../specs/2026-08-09-watchlist-category-em-map-design.md) +  

   [`./2026-08-09-watchlist-category-em-map.md`](./2026-08-09-watchlist-category-em-map.md)）。  

2. **再**回看本二期 plan / design：若一期落地与当初假设有漂移（IPC 形状、表结构、UI 放置、suggest UX 等），**先修订**本 plan（及必要时 design），不得带着过时假设直接写代码。  

3. **仅在**复盘完成 + 必要修订落档 + 用户批准执行（含已确认决策在复盘后仍适用）+ 用户明确说「执行二期」之后，才开始本 plan 的业务实现任务（Migration / 服务 / IPC / UI）。



**已确认决策（design §12）：** Q1–Q6 用户已锁定（见下方「已确认决策摘要」）。复盘发现漂移时优先更新假设与任务勾选，再请用户确认是否调整决策；**不得**因决策已确认而跳过 Task 0.5。



一期未完成、或复盘/修订/批准执行未齐时：**只允许维护本 SDD 文档**，禁止改 `src/` / `electron/` 等产品代码。



### 已确认决策摘要



| # | 决策 | 结论 |

|---|---|---|

| Q1 | 联网结果形态 | **两者都支持**：树内 pair 建议 + 待采用建议 |

| Q2 | 重命名 | **是**：rename IPC + 级联 watchlist / rules |

| Q3 | 待采用持久化 | **仅会话内**，不落 DB |

| Q4 | clear-delete 时规则 | **删除**相关 map rules（非禁用） |

| Q5 | 联网后端 | **复用研究搜索**（非独立白名单传输） |

| Q6 | 删除策略 | **方案 C**：引用中禁删；「清空引用后删除」→ 清空观察池分类 → 删规则 → 删节点 |



---



## Global Constraints



- 一期已落地：`watchlist_category_map_rules`、东财 `suggestWatchlistCategory`、catalog 建议路径已移除  

- 不做：东财行业名 raw 入库、加股自动日线、改写 Migration 67、静默全市场爬分类、AI 推断、独立联网白名单传输、pending 落库  

- 删除节点：方案 C — 默认禁止引用中删除；仅 `clearReferences: true` + UI 二次确认可清空后删；清空时**删除**相关 map rules  

- 联网仅按钮触发；复用研究搜索；Renderer 不持凭据/任意 URL  

- 保留既有 `electron/main/index.ts` EPIPE/EIO 防护；不借机大重构  

- 建议值与手改/`categoryTouched`/重新识别语义沿用一期  



## File map（预期；实现时以一期落地后的实际路径为准）



| 文件 | 职责 |

|---|---|

| `docs/superpowers/specs/2026-08-09-watchlist-category-tree-web-design.md` | 二期设计归档 |

| `docs/superpowers/plans/2026-08-09-watchlist-category-tree-web.md` | 本计划 |

| `electron/main/database/db.ts` | Migration **145**：`watchlist_category_nodes` + 种子自 `WATCHLIST_CATEGORY_TREE` |

| `electron/main/database/watchlistCategoryTreeRepository.ts` | 树 list/upsert/delete/rename + 引用计数 |

| `electron/main/services/watchlistCategoryTree.ts` | `isValidPair(tree, cat, sub)` 纯函数；树快照构建 |

| `electron/main/services/watchlistCategoryWebSuggestService.ts` | 单次授权联网建议（复用研究搜索；可注入 fetch） |

| `electron/main/services/watchlistCategorySuggestService.ts` | 一期 suggest：校验改读 DB 树 |

| `electron/main/services/watchlistCategoryMap.ts` / map repository | 规则目标 pair 校验改读 DB 树；delete 清引用时**删除**规则 |

| `electron/main/ipc/trendHandlers.ts` | 新/改 IPC |

| `electron/preload/index.ts` | `window.api.trend.*` |

| `src/components/TrendWatcher/TrendManager.tsx` | 树维护 UI、下拉改 IPC、联网按钮与待采用（会话内） |

| `src/components/TrendWatcher/trendWatchlistCategoryTree.ts` | 常量降级为种子/测试夹具；导出类型保留 |

| `src/components/TrendWatcher/README.md` | FR 行为 |

| `tests/unit/watchlistCategoryTree.repository.test.ts` | 种子、CRUD、删除策略 |

| `tests/unit/watchlistCategoryTree.test.ts` | 合法 pair 纯函数 |

| `tests/unit/watchlistCategoryWebSuggest.test.ts` | mock 网络；无授权路径不调用；raw 不直写 |



---



### Task 0: 批准门禁（文档已完成；实现前复核）



- [x] 写入本 plan 与对应 design（二期范围）  

- [x] 用户确认 design 决策 Q1–Q6 与 §6 方案 C（见「已确认决策摘要」）  

- [x] **一期复盘后**若有修订：已修订本 plan（Migration 145、UI 挂点、Q5 函数）；决策 Q1–Q6 仍适用  

- [x] 确认一期 plan 已完成（Migration 144 + suggest + map rules UI；未单独 commit，将与二期一并提交）  

- [x] 用户明确要求「按计划推进、二期做完并 review、再 commit push」→ 视为批准执行二期  

- [ ] Commit/push：用户已要求实现完成后提交并推送



### Task 0.5: 对照一期实现复盘并修订二期 plan/design（实现前必做）



**先于任何 Migration / 服务 / IPC / UI 实现任务。** 对应上文「过程门禁」。**不得因 Q1–Q6 已确认而跳过本任务。**



- [x] 阅读一期 design + plan，并对照已落地代码/行为做复盘（至少覆盖：IPC 形状、map rules 表/仓库、suggest 服务与 UX、`WATCHLIST_CATEGORY_TREE` 使用点、分类维护 UI 放置、相关 README/FR、研究侧受控搜索入口以便 Q5 对接）  

- [x] 记录与二期假设的一致点 / 漂移点（可写在本 task 下方备注或 plan「偏差记录」草稿）  

- [x] 若有漂移：修订本 plan（File map、Tasks、约束）及必要时修订二期 design；**不得改写一期 design 正文掩盖偏差**  

- [x] 复盘后重新核对已确认决策 Q1–Q6（及 §6 删除策略）是否仍适用；需变更则更新 design 并请用户确认  

- [x] 用户确认「复盘结论 + 修订后的二期 plan/design」后再进入 Task 1+（用户指示按计划推进至完成）



**复盘备注（填写）：**

- 一期已落地：Migration **144**、`watchlist_category_map_rules`、IPC `suggestWatchlistCategory` / map rules CRUD、`TrendManager` 折叠区 `trend-watchlist-map-rules`、catalog 建议路径已移除。  
- 校验仍绑 `isValidWatchlistCategoryPair` ↔ 代码 `WATCHLIST_CATEGORY_TREE`（主进程 map/suggest/repo）。  
- UI 挂点：非独立「分类维护页签」，而是「分类映射规则」折叠条带；二期主题树在同区扩展（tabs）。  
- Q5 复用目标写死：`resolveConfiguredResearchAgentSearch` → `runWebSearch`；可选降级 `searchWithBuiltinWebTool`。  
- 下一 Migration：**145**。Q1–Q6 决策仍适用，无需改决策。  
- 残留：`trendWatchlistCategoryCatalog.generated.ts` 无生产引用，二期可删或隔离。



### Task 1: Migration + 树仓库 + 校验纯函数



**Files:** `db.ts`、`watchlistCategoryTreeRepository.ts`、`watchlistCategoryTree.ts`、对应单测



- [x] Migration **145**：建 `watchlist_category_nodes`；种子写入与 `WATCHLIST_CATEGORY_TREE` 等价的全部 `(category, sub_category)`  

- [x] Repository：`listTree` / `upsertNode` / `countReferences` / `deleteNode({ clearReferences })` / `renameNode`；事务保证  

- [x] 普通删除：`inUseWatchlist + inUseRules > 0` 且未 `clearReferences` → 抛/返回可映射错误  

- [x] `clearReferences: true`：清空相关 `trend_watchlist` 分类字段为未分类；**删除**指向该 pair（或整 category）的 map rules；再删节点（Q4 已确认：删除非禁用）  

- [x] 纯函数 `isValidWatchlistCategoryPairFromTree(tree, category, subCategory)` + 单测  

- [x] 仓库单测：种子数量、无引用可删、有引用禁删、确认后清空可删  



**Commit rhythm（用户要求提交时）：** `feat(db): watchlist category tree nodes migration`



### Task 2: 一期 suggest / map rules 改读 DB 树



**Files:** suggest service、map repository/校验、IPC list tree、preload



- [x] `trend:listCategoryTree`  

- [x] 一期 `suggestWatchlistCategory` 与 map rules upsert：合法 pair 以 DB 树为准  

- [x] Renderer 加股下拉改为 `listCategoryTree`（可本地 state 缓存，维护后刷新）  

- [x] 单测：规则指向不存在节点 → upsert 失败（沿用一期仓库测 + DB 树）  



**Commit rhythm：** `feat(trend): validate watchlist categories against DB tree`



### Task 3: 主题树维护 UI + rename（Q2 已确认）



**Files:** `TrendManager.tsx`、README 草稿段落、IPC upsert/delete/rename



- [x] 分类维护区增加「主题树」：增/改/删 category 与 subCategory  

- [x] 删除：展示引用计数；确认框「清空引用后删除」后传 `clearReferences: true`  

- [x] rename：`renameCategoryNode` 事务更新 tree + watchlist + rules（Q2 已确认）  

- [x] `data-testid`：树列表、添加、删除确认（实现时写死并同步 E2E 若有）  

- [x] 手动/单测：增节点后下拉可见；删未引用节点成功  



**Commit rhythm：** `feat(trend): editable watchlist category tree UI`



### Task 4: 联网补充分类（显式授权；Q1/Q3/Q5 已确认）



**Files:** `watchlistCategoryWebSuggestService.ts`、IPC、`TrendManager.tsx`、单测



- [x] IPC `trend:webSuggestWatchlistCategory`：仅处理调用；超时；返回 **pair 与 pending 均可**（Q1）；传输**复用研究搜索**（Q5）  

- [x] IPC `trend:adoptWebCategorySuggestion`：写树（+ 可选 map rule）；pending **仅会话内**，不落库（Q3）  

- [x] UI：按钮「联网补充分类」；确认文案；loading；旁注 `web-suggest`；同时展示可映射结果与待采用  

- [x] 重新识别**不**自动调用 web suggest  

- [x] 单测：fetch/研究搜索 mock 断言；raw 行业名不会变成 watchlist 写入参数；无按钮路径服务未被调用  



**Commit rhythm：** `feat(trend): authorized web suggest for watchlist category`



### Task 5: README + 验证 + 检核



- [x] 更新 `src/components/TrendWatcher/README.md`（树维护、删除策略方案 C、联网授权/研究搜索、会话内待采用、与一期东财路径关系）  

- [x] 运行聚焦单测 + `pnpm` typecheck（或仓库惯用 verify 子集）  

- [x] 填写下方「设计初衷检核」、将本 plan 与 design **状态**改为已完成  

- [x] 记录相对 spec 的任何偏差（不得改写 design 正文掩盖）  



**Commit rhythm：** `docs(trend): watchlist category tree web FR + SDD checklist`



---



## 设计初衷检核（完成后填写）



| Spec 项 | 结果 | 说明 |

|---|---|---|

| 主题树入库 + UI 增删改 | 通过 | Migration 145 + TrendManager「主题树」页签 |

| 下拉/校验以 DB 树为真相 | 通过 | `listCategoryTree`；map/suggest upsert 走 `isValidWatchlistCategoryPairInDb` |

| 删除：方案 C（禁引用中删 + 清空后删规则再删节点） | 通过 | 仓库单测覆盖 IN_USE / clearReferences |

| 重命名级联 watchlist / rules | 通过 | `renameWatchlistCategoryNode` 事务；单测覆盖 watchlist |

| 联网补充仅显式授权，复用研究搜索，无静默爬 | 通过 | 确认框 + `runWebSearch`/`searchWithBuiltinWebTool`；重新识别不触发 |

| 结果可同时为树内 pair + 待采用；pending 会话内；raw 不直写 | 通过 | webSuggest mock 测；adopt 才写树 |

| 非目标仍守住（raw EM 名、自动日线、Migration 67、静默爬、独立白名单传输） | 通过 | 未引入 |

| 一期依赖满足；README + 单测 | 通过 | 19 相关单测绿；typecheck 绿 |



**总评：** 二期按复盘修订后的 plan 落地，与 Q1–Q6 一致。  

**检核人 / 日期：** Agent / 2026-08-10  

**偏差记录：** 维护入口为折叠「分类维护」+ tabs（映射规则/主题树），非独立路由页；与复盘挂点一致。pending 未命中树时建议落到「自定义题材 / label」供采用写树。未删 `trendWatchlistCategoryCatalog.generated.ts`（无生产引用）。  


