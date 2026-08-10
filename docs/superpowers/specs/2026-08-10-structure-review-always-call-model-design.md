# 结构复核：可复用本地结论时确认是否重走大模型 — 设计

**状态：** 已批准（2026-08-10；用户确认方案 A：可复用时确认 force/reuse；批量+单条；G1；Migration 去 UNIQUE）  

**关联 plan：** [`../plans/2026-08-10-structure-review-force-or-reuse-confirm.md`](../plans/2026-08-10-structure-review-force-or-reuse-confirm.md)

**日期：** 2026-08-10  
**文件名说明：** 文件名保留历史前缀 `structure-review-always-call-model`；**正文意图已修订**——不再「每次强制调模型」，改为「有可复用本地结论时先确认」。  
**方法论：** SDD  
**上游能力：** [`2026-08-09-trend-ai-review-and-context-compaction-design.md`](./2026-08-09-trend-ai-review-and-context-compaction-design.md) 与 [`2026-08-09-trend-ai-review-and-context-compaction-revision-design.md`](./2026-08-09-trend-ai-review-and-context-compaction-revision-design.md)  
**关联展示：** [`2026-08-10-ai-structure-review-rationale-visible-design.md`](./2026-08-10-ai-structure-review-rationale-visible-design.md)（本设计主要改「何时调模型 / 何时新建 revision / 确认交互」；不改五枚举词表与 rationale 展示契约）  
## 修订说明（相对初稿）

| 版本 | 意图 |
|---|---|
| 初稿 | 用户显式复核且过确定性门槛时，**一律**重调 LLM，禁止同 `scoreDate`+`factsHash` 短路复用。 |
| **本修订（已批准）** | 更灵活：若本地/缓存已有**可复用**复核（同 `scoreDate`+`factsHash` / 可 bind 的既有 revision），先弹**确认对话框**——**是** → 强制再请求大模型并落**新 revision**；**否** → 保持现有同 hash 复用/bind 行为。无可用复用结论时不弹窗，直接走门闸/模型路径。 |

## 1. 问题

用户需要在「省配额复用本地结论」与「同事实再要第二意见」之间自行选择，而不是系统一律短路或一律强制调模型。

当前 `reviewStructure`（单只与批量最终都走同一服务）在 `scoreDate` + `factsHash` 未变时会**短路复用**既有 revision，**不调用** LLM，也**不询问**用户：

1. **Service 层**：同 code+scoreDate 且 `existing.factsHash === factsHash` → `bindTrendStructureReviewRequest` 返回。  
2. **Repository 层**：`sameFacts` 命中则 bind、不 INSERT 新 revision。  
3. **Schema**：`(ts_code, score_trade_date, facts_hash)` **UNIQUE**，物理上禁止同事实哈希多条模型 revision。

因此：想再看模型采样时无法强制重跑；若改成「永远强制」，又会在误触/批量时重复烧配额。需要**显式确认**折中。

## 2. 目标

- **批量复核**（必做）：选中集中**只要有一只**存在可复用本地复核，在真正发起 batch IPC **之前**弹出**一次**确认对话框（整批统一决策，见 §4.3）。  
- **单条「AI复核结构 / 重新复核」**（**强烈推荐同交互**，批准清单默认纳入）：该只存在可复用结论时同样弹确认；无则直跑。  
- 用户选 **是** → 对该次决策覆盖范围内、本会进入模型路径的股票：**即使 hash 未变也必须调 LLM**；成功则 **新 revision** + 更新 projection（需 Migration 去掉 UNIQUE）。  
- 用户选 **否** → 可复用者走**当前**同 hash bind/复用；无可复用者仍按既有门闸/模型逻辑。  
- **保留** 同一 `requestId`（及批量母 `requestId` / 派生 item key）的幂等重放：命中则返回已绑定结果，**不再二次调模型、也不再弹确认**。  
- **保留** 确定性门槛：本地事实不足 → **不调 LLM**；且**不弹**「是否再请求大模型」确认（无意义）。  
- `factsHash` 仍只表示白名单事实指纹；幂等键仅 `requestId`。同事实多模型 revision 以 revision id / request 绑定为准。  
- 实现后更新 `src/components/TrendWatcher/README.md`。

## 3. 非目标

- 不改 AI 五枚举词表、rationale/focusPoints 长度、白名单事实包字段、讨论桥接身份（仍用 `tsCode`+`scoreDate`+`factsHash`）。  
- 不改写本地 `trendState`；不新增荐股 / 目标价 / 仓位 / 自动交易。  
- 不因本需求自动调度复核、不后台轮询调模型。  
- 不取消批量上限（仍 20）与串行执行；不新增并行批跑。  
- 不改变「带着复核去讨论」的校验语义。  
- **不做**「记住本次选择」的会话级/跨批默认（批量每次有可复用时都问；单条每次有可复用时都问）。若日后要「本会话默认强制重跑」，另开 spec。  
- 本文件已批准；实现以关联 plan 为准。不因本需求自动 commit。

## 4. 推荐方案

### 4.1 「可复用本地复核」判定

对某只股票，在**发起复核前**（Renderer 用当前 workbench 快照，或主进程预检——plan 锁定一层即可，须与 service 语义一致）满足：

- 已有绑定到该 code 的结构复核 projection / 可见 `structureReview`；且  
- **未 stale**（当前工作台 `scoreDate` 与 `factsHash` 与记录一致）；且  
- 该结论来自**模型路径**（`source === 'model'`，或等价：有非空 `provider`/`model`）——即「真有可复用的第二意见」，而不是仅 gate 的 `need_more_data`。

**不计入「可复用」因而也不触发「是否再请求大模型」的情形：**

| 情形 | 行为 |
|---|---|
| 无复核记录 | 不弹窗；直接跑门闸 →（过则）模型 |
| `stale === true`（事实日/哈希已变） | 不弹窗；必须按新事实重算（过门闸则调模型） |
| 仅有 gate 结论（如 `need_more_data`） | 不弹窗；再跑时仍先过确定性门闸；过则调模型，不过则本地 gate（可 G1 bind） |
| 确定性门槛本就会失败（coverage / `validWeight` &lt; 0.7 / 无综合分） | **不弹窗、不调 LLM**；本地 `need_more_data` |
| 同一 `requestId` 幂等重放 | **不弹窗**；返回已绑定结果 |

> 门闸不足时弹「是否再请求大模型」会误导（选是也调不成或不应调），故禁止。

### 4.2 确认对话框 UX（文案建议）

#### 批量（必做）— **整批一次**

当选中集（截断至上限 20 只后）中 **N ≥ 1** 只有可复用模型复核时，在调用 `trend:reviewStructureBatch` **之前**弹出 Modal：

- **标题：** `再次请求大模型？`  
- **正文：** `已选股票中有 N 只具备与当前事实一致的本地 AI 复核结论。是否再次请求大模型生成新结论？`  
  - 可选第二行说明：`选择「是」将对这 N 只强制重跑模型（产生费用）；其余股票仍按常规门闸与模型逻辑处理。选择「否」则对可复用结论直接沿用本地结果。`  
- **主按钮（是）：** `是，再次请求`  
- **次按钮（否）：** `否，使用本地结论`  
- **取消/关闭：** 视为**取消整批操作**（不发起 IPC；与「否」区分——「否」仍会跑批，只是可复用走缓存）

**N 的计算：** 仅统计选中且「可复用」的只数；不含 stale / 无记录 / 仅 gate。

**决策作用域（锁定）：**

| 用户选择 | 对「可复用」的 N 只 | 对其余选中股票 |
|---|---|---|
| **是** | 强制模型路径（`forceModelRefresh` / 等价标志），hash 未变也调 LLM → 新 revision | 无复用则照常：门闸 → 模型或本地 gate；**不**因本对话框被强制跳过模型 |
| **否** | 同 hash bind/复用（现行为） | 同上：无可复用仍走门闸/模型 |
| **取消对话框** | 整批不开始 | — |

**不做：** 每只股票各弹一次；不做「本批记住、下一批沿用」。

#### 单条（推荐纳入范围）

行内 / 抽屉「AI复核结构」「重新复核」在该只**可复用**时弹同一语义对话框（文案略收窄）：

- **标题：** `再次请求大模型？`  
- **正文：** `本地已有与当前事实一致的 AI 复核结论。是否再次请求大模型？`  
- **是 / 否 / 取消** 语义同批量：是→强制新模型 revision；否→bind 复用；取消→不发起单条 IPC。

`stale` 时按钮文案已是「重新复核」——按 §4.1 **不弹**确认，直接按新事实跑（过门闸则调模型）。

### 4.3 批量边缘情形

| 边缘 | 预期 |
|---|---|
| 选中 0 只有可复用 | **不弹窗**，直接 batch |
| 选中全部可复用 | 弹一次；是→全部强制模型；否→全部 bind |
| 混合：部分可复用、部分无记录、部分 stale、部分将 gate 失败 | 弹一次，N=可复用数；是只强制那 N 只；其余各走自己的门闸/模型/gate；gate 失败仍不调 LLM |
| 批量上限截断后 N 按截断后集合算 | 与现「最多 20 只」一致 |
| 批内串行；某只失败 | 不影响对话框已做的全局 force/reuse 标志对其余只的含义；逐条成功/失败 Toast/汇总保持 |
| 用户「是」后主进程仍发现某只实际不可模型（门闸失败） | 该只仍走 gate，不调 LLM（对话框不能推翻门闸） |
| 深度研究 busy / 现有锁 | 保持现有拒绝/Toast；若已弹窗选是再失败，不自动改走「否」 |
| 连续点两次批量（两个不同 batch `requestId`） | 每次有可复用都再问；无会话记忆 |
| 同一 batch `requestId` 重试 | 幂等：不弹第二次确认、不二次模型 |

### 4.4 IPC / 服务层契约（设计意图；plan 细化字段名）

- Renderer 在用户确认后发起既有 `trend:reviewStructure` / `trend:reviewStructureBatch`。  
- 需能把「本请求对可复用项强制刷新模型」传给主进程，例如：  
  - 批量：`forceModelRefresh?: boolean`（true=用户选是；false/缺省=用户选否或未弹窗时的默认「可复用则 bind」）；或  
  - 更窄：`forceModelRefreshTsCodes?: string[]`（仅列出用户选是时要强制的 code）。  
- **推荐：** 批量用整批布尔 `forceModelRefresh`（与「一次对话框管全部可复用」一致）；单条用同名布尔。未弹窗场景不传或 `false`，主进程对可复用仍 bind（现行为）。  
- **`forceModelRefresh === true` 时：** 跳过「同 hash → bind 返回」的 service 短路；模型成功写入必须 INSERT 新 revision（绕过 repository `sameFacts` bind）。  
- **`forceModelRefresh !== true` 时：** 保持现有同 hash 复用。  
- **requestId 幂等优先于 force：** 已绑定的 request 重放直接返回，忽略 force 标志的再次模型调用。

### 4.5 确定性门闸（KEEP）

- `totalScore == null` 或 `validWeight < 0.7` 或 `dataCoverage.state !== 'ready'` → 本地 `need_more_data`，**不调 LLM**。  
- 门闸路径**不**因 `forceModelRefresh` 去调模型。  
- Gate 落库默认可 **G1**：同 hash 等价 gate 结论可 bind；用户痛点在模型重跑，不在 gate 审计膨胀。G2（每次 gate 也 INSERT）可选，须 plan 明示。

### 4.6 Schema：同事实多模型 revision

用户选「是」时必须允许同 `(ts_code, score_trade_date, facts_hash)` 多条模型 revision：

1. **Migration（向前）：** `DROP` UNIQUE `idx_trend_structure_review_revisions_code_date_hash`；改为非唯一索引。  
2. 模型成功写入：`forceModelRefresh` 路径禁止 `sameFacts` bind。  
3. `getTrendStructureReviewByCodeDateFactsHash`：多行时取最新；**不得**再当全局幂等键。  
4. **stale / projection / 讨论桥：** 与初稿相同——stale 只跟当前事实指纹比；projection 指最新 revision；讨论键仍按事实身份，不强制 revisionId 进桥。

### 4.7 行为矩阵（修订后）

| 场景 | 目标行为 |
|---|---|
| 可复用 + 用户「是」+ 新 requestId + 过门闸 | **调 LLM**；新 revision；即使 hash 未变 |
| 可复用 + 用户「否」+ 新 requestId | bind/复用旧 revision；**不调** LLM |
| 无可复用（无记录 / stale / 仅 gate）+ 过门闸 | 不弹窗；调 LLM；新 revision（hash 变或首次） |
| 门闸不足 | 不弹窗；不调 LLM；本地 gate（可 G1） |
| 同一 requestId 重放 | 不弹窗；不调 LLM；返回已有绑定 |
| 批量混合集 + 「是」 | 可复用子集强制模型；其余照常 |
| 批量混合集 + 「否」 | 可复用子集 bind；其余照常 |

### 4.8 成本含义（产品知情）

- 「是」：可复用的每只 ≈ 1 次模型费用（事实未变也花）。  
- 「否」：可复用 0 费用；无可复用且过门闸仍可能产生费用。  
- 弹窗本身是防误触与费用知情的主手段；**不做**额外冷却计时器。

## 5. 方案对比

| 方案 | 做法 | 取舍 |
|---|---|---|
| **A（推荐，本修订）** | 可复用时确认；是→强制新模型 revision；否→bind；KEEP gate；requestId 幂等；Migration 去 UNIQUE | 灵活、费用可控、对齐用户修订意图 |
| **B（初稿）** | 过门闸一律强制模型、无确认 | 简单但批量易误烧配额；**本修订弃用为默认** |
| **C** | 仅 UI 骗 hash | 污染事实指纹与讨论键；拒绝 |
| **D** | 取消门闸凡事调模型 | 成本高、与双轨冲突；拒绝 |

## 6. 范围与文件预期（批准后 plan 细化）

| 区域 | 预期 |
|---|---|
| `TrendDashboard.tsx`（及抽屉复核入口若共用） | 批量（+ 推荐单条）可复用预检 → Modal → 带 `forceModelRefresh` 调 IPC |
| preload / IPC 类型 | 单条/批量入参扩展 force 标志 |
| `trendStructureReviewService.ts` | force 时跳过同 hash early return；否则保持；门闸仍优先 |
| `trendStructureReviewRepository.ts` | force/模型强制新 revision；lookup 多行取最新 |
| `db.ts` Migration | 去掉 revisions code-date-hash UNIQUE |
| 单测 | 可复用+force→二次 callAI 且新 revisionId；可复用+非 force→不调模型；门闸不调；requestId 幂等；批量混合标志 |
| `TrendWatcher/README.md` | 写明确认交互与 force/复用语义 |

## 7. 验收标准

1. 批量：选中含 ≥1 只可复用模型复核时，发起前出现**一次**确认框；文案含 N。  
2. 选「是」：上述可复用且过门闸的股票即使 hash 未变也会调模型，并产生新 `revisionId`；projection 更新。  
3. 选「否」：可复用股票不调模型，bind 既有 revision（现行为）。  
4. 选「取消」：不发起 batch IPC。  
5. 选中 0 只可复用：不弹窗，直接跑批。  
6. 门闸不足：不弹「再请求模型」确认，不调 LLM。  
7. 同一 requestId 重放：不弹窗、不二次模型。  
8. Migration 后同 hash 多模型 revision 合法；stale 语义不因「又跑了一次模型」误标。  
9. （若批准纳入单条）单条可复用时确认语义与批量一致。  
10. README + 相关单测已更新；无荐股语气扩展。

## 8. 明确不做

- 不按股票逐个弹确认（批量）。  
- 不做会话/跨批「记住选择」。  
- 不在本批做复核历史时间线 UI。  
- 不把 `factsHash` 改成含 requestId/时间戳。  
- 不默认回到初稿「无确认、一律强制模型」。

## 9. 批准清单（请逐条确认或改口）

请回复「批准」或逐条修正：

1. **采用确认折中（方案 A）**：有可复用本地**模型**复核时先问；**是**→强制重调 LLM 并新 revision；**否**→同 hash 复用；取消→不发起。  
2. **范围**：**批量必做**；**单条「AI复核结构 / 重新复核」推荐一并做**（默认纳入，除非明示只要批量）。  
3. **批量交互**：有可复用时 **整批一次**对话框（文案含 N）；是→可复用子集全部强制模型；否→可复用走缓存；其余股票照常门闸/模型；**不**会话记住。  
4. **可复用定义**：未 stale 且 `source=model`（有 provider/model）；仅 gate / 无记录 / stale **不弹**该确认。  
5. **确定性门闸保留**：不足则不调 LLM、不弹该确认；`forceModelRefresh` 不能推翻门闸。  
6. **requestId 幂等保留**：重放不弹窗、不二次模型。  
7. **Migration**：去掉 code-date-hash UNIQUE，允许同事实多模型 revision（「是」路径所需）。  
8. **Gate 落库**：默认 G1（同 hash gate 可 bind）；若要 G2 请明示。  
9. **stale** 仍只跟当前事实指纹比，不因再次模型成功而变 stale。  
10. **文案**：可采用 §4.2 中文建议，实现时可微调但不改语义。  
11. **状态**：本设计 **已批准**（2026-08-10）。
