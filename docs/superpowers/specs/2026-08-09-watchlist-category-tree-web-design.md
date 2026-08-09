# 观察池分类：主题树入库 + 联网补充（二期）— 设计



**状态：** 已实现（2026-08-10）— 一期复盘后执行；Q1–Q6 决策未改



**日期：** 2026-08-09  

**归档：** 实现对照见 [`../plans/2026-08-09-watchlist-category-tree-web.md`](../plans/2026-08-09-watchlist-category-tree-web.md)  

**方法论：** SDD；superpowers 仅为可选工具  



**前置依赖（硬前提）：** 一期 [`2026-08-09-watchlist-category-em-map-design.md`](./2026-08-09-watchlist-category-em-map-design.md) 已合并/落地（可维护 `watchlist_category_map_rules`、东财 suggest、catalog 建议路径移除；主题树一期仍为代码常量 `WATCHLIST_CATEGORY_TREE`）。一期未完成前禁止执行本切片业务代码。



**过程门禁（与 plan 一致）：** 实现二期前须**先**对照一期 design/plan 复盘一期实现（代码 + 行为），**再**按漂移修订本 design 与二期 plan；Q1–Q6 决策已锁定（见 §12），复盘发现漂移时再请用户确认是否调整。细节与勾选任务见 plan 文首「过程门禁」与 Task 0.5。未完成复盘/修订/批准执行前禁止改业务代码。



**与一期关系：** 一期锁定「树只读 + 无联网补充」；本二期补齐主题树 SQLite 可编辑，以及显式授权的「联网补充分类」。推断顺序（池内 → 东财映射 → 空）与手改/重新识别语义沿用一期，不改写。



## 1. 问题



一期解决了映射规则可维护与东财自动建议，但主题树仍绑在代码常量上：用户无法在应用内增删分类/赛道，冷门题材只能改映射到既有叶子，或等发版改树。映射失败时也缺少受控的联网兜底——若做成静默全市场爬取，则违反本地优先与授权联网原则。



## 2. 目标（二期）



1. **主题树入库并可编辑**：`watchlist_category_nodes`（或等价结构）存分类 → 细分赛道；观察池「分类维护」提供增/改/删 category 与 subCategory；下拉与 `isValidWatchlistCategoryPair` 以库内树为运行时真相。  

2. **显式授权「联网补充分类」**：仅在用户点击后发起联网；禁止静默/后台全市场爬分类；结果必须落入主题树节点，或作为**待采用建议**（pending adopt），不得把东财/网页原文行业名直接写入观察池分类字段。  

3. **删除节点策略明确**（见 §6）：默认禁止删除仍被引用的节点；提供显式确认的「清空引用后删除」逃生口。  

4. 映射规则 CRUD（一期）校验目标 pair 时，改为对照**库内树**；改树后规则与下拉立即一致。  

5. 迁移时把当前 `WATCHLIST_CATEGORY_TREE`（及一期若已只读灌库的树）作为默认种子；代码常量降级为「迁移种子 / 测试夹具」，不再作为生产下拉唯一来源。



## 3. 非目标（二期仍不包含）



- 东财行业名 / 网页原文作为 raw category 直接进下拉或写入 `trend_watchlist`。  

- 加股时自动拉日线。  

- 改写或删除历史 Migration 67 SQL；新库是否停灌 72 条种子股（另开需求）。  

- 静默全市场爬分类、定时批量联网补全、未授权的后台联网。  

- AI / Token 推断分类。  

- 重做一期东财 suggest 主路径（仅在其之上挂联网按钮与树真相切换）。  

- 独立的东财/公开页解析白名单传输层（联网补充复用研究侧已有受控搜索，见 §12 Q5）。  

- 待采用建议跨重启持久化（会话内即可，见 §12 Q3）。



## 4. UX



### 4.1 分类维护（主题树）



- 入口：观察池内既有「分类维护」区域扩展——一期为「映射规则」；二期增加「主题树」页签/区块。  

- 能力：  

  - 新增一级分类、在分类下新增细分赛道。  

  - 重命名分类或赛道：二期包含 `renameCategoryNode`，事务级联更新观察池行与 map rules（见 §12 Q2）。  

  - 删除分类或赛道（受 §6 方案 C 约束）。  

- 空分类（无子赛道）允许存在；观察池行仍可只选分类、赛道为空（与现有「暂不分类 / 仅分类」语义对齐）。  

- 保存经窄 IPC 写库；无需改 Migration / 跑 extract 脚本。



### 4.2 加股表单：联网补充分类



- 触发条件（建议）：一期路径已跑完且（无命中 **或** 用户主动想补充）时，展示按钮「联网补充分类」（`data-testid` 待实现时固定，如 `trend-watchlist-web-suggest-category`）。  

- 点击后：短文案说明将联网请求公开检索/页面；用户确认即视为本次授权（单次动作，不写全局「永远允许爬」开关，除非产品另批）。  

- 进行中：按钮 loading；失败可重试，不阻塞手选下拉。  

- 结果呈现（**两者都支持**，见 §12 Q1）：  

  1. **可直接采用的树内 pair**（检索结果经映射规则或已知树节点对齐）→ 填入下拉，旁注 `source=web-suggest`。  

  2. **待采用建议**：展示候选标签 +「采用到主题树」——用户确认后先 upsert 树节点（及可选一条 map rule），再填入当前表单；候选仅会话内保留，不落库。  

- 手改 / `categoryTouched` /「重新识别」语义不变；联网结果填入后视为一次自动建议，用户再改仍置 touched。



### 4.3 非交互



- 不加股流程外的静默联网。  

- 不在启动、切页、定时器中批量补充分类。



## 5. 数据模型



### 5.1 `watchlist_category_nodes`（新表，向前 Migration，接一期 Migration 之后）



| 列 | 说明 |

|---|---|

| `id` | INTEGER PK |

| `category` | 非空；一级分类显示名 |

| `sub_category` | 可空字符串：空表示「仅分类占位 / 分类节点本身」；非空为赛道 |

| `sort_order` | 整数，同层排序 |

| `enabled` | 0/1；禁用后不下拉展示，但历史行仍可显示原值 |

| `created_at` / `updated_at` | ms |



**约束建议：**



- `UNIQUE(category, sub_category)`。  

- 运行时合法 pair：`enabled=1` 且存在对应行；「仅有分类、赛道为空」当且仅当存在 `(category, '')` 或存在任意该 category 下子行（实现计划中二选一并写死——**推荐**：有任意该 `category` 的 enabled 行即允许 `sub_category=''`）。  

- 种子：迁移写入与当前 `WATCHLIST_CATEGORY_TREE` 等价的全部 pair（每个 sub 一行；每个 category 可另插 `(category,'')` 若需要「仅分类」显式节点——**推荐不强制插空行**，用「存在子行 ⇒ 允许空赛道」规则）。



### 5.2 与一期 `watchlist_category_map_rules` 的关系



- 规则的 `category` / `sub_category` 必须通过库内树校验（替换一期「对照代码 TREE」）。  

- 删/禁树节点时：指向该 pair 的规则——普通删除禁止直至规则已改指或删除；在「清空引用后删除」流程中**删除**（非禁用）命中规则（见 §6、§12 Q4）。



### 5.3 待采用建议（会话内，不持久化）



- 联网结果仅会话内展示，采用时写树（+ 可选规则），**不落新表**（§12 Q3 已确认）。  

- 跨重启不保留候选；用户取消或会话结束即丢弃。



### 5.4 代码常量命运



- `WATCHLIST_CATEGORY_TREE`：保留为 Migration 种子源与单测夹具；Renderer 生产路径改为 `trend:listCategoryTree`。  

- `isValidWatchlistCategoryPair`：主进程以 DB 为准；共享纯函数可接受「树快照」参数，避免 Renderer 直连 DB。



## 6. 删除节点策略（方案 C — 已确认）



### 选项对照



| 方案 | 行为 | 优点 | 缺点 |

|---|---|---|---|

| A. 禁止删除 | 任意 `trend_watchlist` 或 map_rules 引用该 category/sub 则 delete IPC 失败 | 不丢研究标注；实现简单 | 死节点堆积；用户需先手改行 |

| B. 静默级联清空 | 删除时把引用行 `category/sub_category` 置空，并删/禁规则 | 一键干净 | 静默破坏账本语义；难撤销 |

| C. **默认禁止 + 显式「清空引用后删除」**（**已确认**） | 普通删除：若引用计数 > 0 → 拒绝并返回 `{ inUseWatchlist, inUseRules }`；用户在 UI 勾选确认后调用 `deleteCategoryNode({ …, clearReferences: true })`，事务内：引用行清空为未分类、相关规则**删除**、再删节点 | 默认安全；逃生口明确需确认 | IPC/UI 稍复杂 |



### 已确认结论



采用 **方案 C**：



1. 普通删除：引用中则失败，UI 展示「N 条观察池 / M 条规则仍在使用」。  

2. 破坏性删除（「清空引用后删除」）：二次确认文案明确「将清空这些股票的分类并删除节点，不可自动恢复」；`clearReferences: true` 仅在该确认后传递。事务内顺序：  

   - 相关 `trend_watchlist` 行分类字段清空为未分类；  

   - **删除**（非 `enabled=0`）指向该 pair / 整 category 的相关 map rules；  

   - 再删除树节点。  

3. 无引用时可直接删除。  

4. **不**做静默级联；**不**在未确认时改写观察池行。



重命名：二期做 `renameCategoryNode` 事务（「先增新名 → 迁移引用 → 删旧名」或单 IPC 事务更新 tree + watchlist + rules），避免半新半旧（§12 Q2 已确认）。



## 7. 联网补充（行为与边界）



### 7.1 授权模型



- 每次点击「联网补充分类」= 用户显式授权**这一次**请求。  

- Renderer 只发 IPC（如 `trend:webSuggestWatchlistCategory`），不持有任意 URL/凭据；主进程**复用研究侧已有受控搜索**（§12 Q5），超时（建议 ≤ 8s）降级为空结果 + 可读错误。  

- 不引入「启动时预爬」或「加股时默认联网」。  

- 不另建独立东财/公开页解析白名单传输层。



### 7.2 结果落地规则（硬约束）



联网原始标签（行业名、概念、页面标题等）**不得**直接写入 `trend_watchlist.category`。必须：



1. 映射到已有树节点；或  

2. 经用户「采用」写入树后再填表；或  

3. 仅展示为待采用建议，用户取消则丢弃。



### 7.3 与东财 suggest 的分工



| 路径 | 触发 | 数据 |

|---|---|---|

| 一期 `suggestWatchlistCategory` | 选股 / 重新识别 | 池内 + 东财公开标签 + map rules（可继续用报价轻量字段，~4s） |

| 二期 `webSuggestWatchlistCategory` | 显式按钮 | 授权联网 → 复用研究搜索 → 候选 → 树内 pair **与/或** pending |



重新识别**默认不**自动跑联网补充（避免未授权联网）；用户需再点按钮。



## 8. IPC 草图（窄校验）



均挂 `trend:*`，经 preload → `window.api.trend.*`：



| Channel | 入参（示意） | 行为 |

|---|---|---|

| `trend:listCategoryTree` | — | 返回启用树，供下拉 |

| `trend:upsertCategoryNode` | `{ category, subCategory, sortOrder?, enabled? }` | 增改节点；名称 trim；禁空 category |

| `trend:deleteCategoryNode` | `{ category, subCategory?, clearReferences?: boolean }` | 按 §6 方案 C |

| `trend:renameCategoryNode` | `{ from, to }` | 事务重命名 + 级联 watchlist / rules（Q2 已确认） |

| `trend:webSuggestWatchlistCategory` | `{ tsCode, name? }` | 单次授权联网（复用研究搜索）；返回 `{ status, pair?, pending?, rawTags?, error? }`（pair 与 pending **均可**） |

| `trend:adoptWebCategorySuggestion` | `{ category, subCategory, createMapRule? }` | 写树（+ 可选规则）后可供表单采用 |



一期已有：`suggestWatchlistCategory` / map rules CRUD —— 保留；suggest 内校验改读 DB 树。



## 9. 风险



| 风险 | 缓解 |

|---|---|

| 删节点误清研究分类 | 方案 C + 引用计数文案 + 确认框 |

| 联网解析质量差 / 不稳定 | 超时降级；结果仅建议；单测 mock 网络；不阻塞加股 |

| 树与规则不一致 | upsert/delete 校验；采用建议时同事务写树 |

| 与一期 Migration 顺序冲突 | 二期 Migration 号紧接一期之后；一期未落地则本切片不执行 |

| Renderer 缓存旧树 | 维护保存后刷新 list；加股打开时拉最新树 |

| 名称碰撞 / 大小写 | trim；大小写敏感与现有中文树一致（不做盲目 lower） |



## 10. 验收



1. 分类维护可增改主题树；加股下拉反映库内树，无需发版改代码常量。  

2. 删除被引用节点：普通删除失败并提示计数；确认「清空引用后删除」后行变未分类、相关 map rules 删除且节点消失。  

3. 「联网补充分类」仅按钮触发；无点击则无联网请求（可用主进程日志/测试 spy 断言）；传输复用研究搜索。  

4. 联网结果不会把 raw 行业名写入观察池；可同时呈现树内 pair 与待采用建议；采用路径会先出现在树中；pending 不落库。  

5. 映射规则目标 pair 必须落在库内树；指向已删节点的规则不可新建。  

6. 重命名级联更新 watchlist 与 rules。  

7. 聚焦单测 + typecheck 通过；更新 `TrendWatcher/README.md` FR 行为。



## 11. README



更新 `src/components/TrendWatcher/README.md`：主题树维护、删除策略（方案 C）、联网补充授权与待采用语义（会话内）；并注明智能填写主路径仍为一期东财映射、联网补充复用研究搜索。



## 12. 设计决策（Q1–Q6 — 已确认）



> 用户已批准下列决策并锁定。实现前仍须过一期复盘门禁；若复盘发现与一期落地有漂移，可修订本表并再请用户确认。



1. **Q1 — 联网结果形态：已确认** — **两者都支持**：可映射到已有树的建议 + 待采用后建树的建议。  

2. **Q2 — 重命名：已确认** — 二期包含 rename IPC + 级联更新 `trend_watchlist` 与 map rules（事务）。  

3. **Q3 — 待采用持久化：已确认** — **仅会话内**；不落 DB / 不新建 suggestions 表。  

4. **Q4 — 删除时规则处理：已确认** — `clearReferences: true` 时相关 map rules **删除**（非 `enabled=0`）。  

5. **Q5 — 联网后端：已确认** — **复用研究侧已有受控搜索**；不另建独立白名单传输层。  

6. **Q6 — 删除策略：已确认** — **方案 C**：引用中禁止普通删除；「清空引用后删除」事务内清空观察池分类为未分类 → 删除相关规则 → 再删节点。



---



**批准实现前：** 勿改 `src/` / `electron/` 业务代码。须完成一期落地复盘 → 必要修订落档 → 用户批准执行后，再按对应 plan 实现。


