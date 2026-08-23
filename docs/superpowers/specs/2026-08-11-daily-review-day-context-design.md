# 今日复盘扩成持仓日结 — 设计

**状态：** 已完成  
**日期：** 2026-08-11  
**方法论：** SDD  
**关联：** FR-233 / FR-236 / FR-250；`docs/superpowers/specs/2026-08-10-review-report-auto-ai-narrative-design.md`  
**用户确认：** 方案 A（利用已有数据扩「一键复盘」）；实现路径 1（生成时并行取既有 IPC 拼进同一日报）；周报本批不扩新节

## 1. 问题

当前「一键复盘」只聚合**持仓相关决策信号**的已处理 / 开放风险 / 证据缺口 / 待验证。有持仓但无持仓相关待办时，报告几乎是空表 +「持仓平稳」，用户体感无效。

产品已有：`market.getMarketOverview`（涨跌分布、概念热度、指数共振）、`portfolio.getDashboard`（现价/涨跌/浮盈/趋势分/板块资金等）、信号 `WATCHING`（关注中），但**未写入复盘快照**，也未进入 AI 研判 prompt。

用户期望复盘 = **日结**：市场环境、资金要点、持仓走势等，而不只是待办结案。

## 2. 目标

1. 扩**今日**复盘本地事实：新增「市场环境 / 资金要点 / 持仓走势 / 今日关注」四节，全部来自已有本地/已授权 IPC，缺数标明「本地暂无」，不编造。  
2. 保留既有信号处理四节与版本化保存 /「和 AI 讨论」/「仅重试 AI」。  
3. AI 研判 prompt **纳入**上述新节摘要；软失败语义不变。  
4. 无持仓相关信号时，`headline` 仍可写平稳，但报告**不得**因 `emptyDay` 而省略新四节（有持仓或有市场快照时仍应展示日结）。  
5. 更新 `DecisionCenter/README.md`（新 FR 或扩展 FR-233）。

## 3. 非目标（本批）

- 不并入热力图整页、盘前推演证据包、定时自动复盘。  
- **不**给周报加完整市场日结四节（周报结构保持现有；仅日报落地）。  
- 不新建「日结包」主进程聚合 IPC（路径 2 留后续）。  
- 不把「今日提炼」整页 UI 塞进复盘抽屉。  
- 不荐股、不下单、不收益承诺；处置建议字段若进入快照须标注为规则辅助、非交易指令。

## 4. 推荐方案（锁定）

**路径 1：** `handleGenerateDailyReview` 在本地构建前并行：

| 源 | 用途 |
|---|---|
| `window.api.market.getMarketOverview()` | 市场环境 + 资金/热度要点（含 `resonance` 若有） |
| `window.api.portfolio.getDashboard({ limit, offset })` | 持仓走势（覆盖当前持仓；limit 足以覆盖用户持仓规模，plan 定具体分页策略） |
| 当前内存 `signals` 中 `status === 'WATCHING'` | 今日关注清单（不限是否持仓相关） |
| 既有 `signals` / `holdings` / `portfolioRisk` / judgments | 原信号处理节 |

派生函数扩展 `buildDailyReviewReport`（或同文件纯函数），把精简后的日结字段写入 `ReviewReport`；`saveReviewReport` 快照 JSON 向前兼容（旧快照无新字段 = 打开时不展示对应节）。

```text
一键复盘
  → 并行取 overview + dashboard（失败不阻断；对应节 empty/unavailable）
  → buildDailyReviewReport(… + dayContext)
  → 展示 + 保存本地快照
  → 自动 AI 研判（prompt 含新节）
```

## 5. 报告结构（日报）

展示顺序锁定：

1. **结论摘要** `headline` + `summary`（summary 可增：`watchingCount`；可选一行市场一句，plan 定）  
2. **市场环境** — 涨跌家数分布摘要、指数共振要点（有则）、数据时点 / 是否历史回退  
3. **资金要点** — 概念热度 Top-N（如 5～8）、持仓关联板块资金若 dashboard 已带可附一行  
4. **持仓走势** — 逐票：名称、代码、现价、涨跌%、浮盈%（有成本）、趋势总分/关键布尔（如站上 60 日）、今日相关信号数；缺字段显示「—」或「本地暂无」  
5. **今日关注** — `WATCHING` 列表（标题、来源、优先级、代码/题材）；无则「暂无关注中信号」  
6. **已处理 / 未处理风险 / 证据缺口 / 待验证** — 行为与现 FR-233 一致  
7. **AI 研判** — FR-250；prompt 增加 2～5 节摘录  
8. **免责声明**

`emptyDay`：仍表示「无持仓相关信号处理记录」，**不再**等价于「整份报告无内容」。

## 6. 数据与失败

| 情形 | 行为 |
|---|---|
| overview 失败/空 | 市场/资金节显示不可用原因；其余节照常 |
| dashboard 失败 | 持仓走势节用 holdings 仅列代码名 +「行情未加载」；不阻断保存 |
| 无持仓 | 持仓走势节「暂无持仓」；市场/关注仍可有 |
| 字段部分缺失 | 行内降级，不整节消失 |
| 历史打开 | 只读快照；不按当前行情重算日结节 |

快照只存**生成时刻摘要**（小数位、Top-N 截断），避免把完整 timeline 390 点塞进 DB。

## 7. AI 约束

- Prompt 仍强调：基于本地事实、风险与不确定语气、非投资建议。  
- **不做**交易词输出硬拒收（见 `2026-08-11-review-ai-no-output-reject-design.md`）。  
- 可引用日结数字与关注标题；禁止编造未出现在事实中的指数点位或资金额。

## 8. 验收标准

1. 有持仓、无持仓相关待办时：复盘仍出现持仓走势（有价/涨跌或明确暂无）及市场/资金节（有数据时），不再仅空表。  
2. 「关注中」信号出现在「今日关注」。  
3. 复制文本含新节标题与要点。  
4. 保存后历史打开可见生成时日结；再生成产生新 version。  
5. overview/dashboard 单路失败不导致整单复盘失败。  
6. AI 成功时研判能提及持仓或市场事实（有输入时）；失败仍软失败。  
7. 周报入口与结构本批不因本需求破坏。  
8. README / 单测覆盖新节派生与 `emptyDay` 语义。

## 9. 开放问题（已锁定）

| # | 问题 | 锁定 |
|---|---|---|
| 1 | 实现路径 | 生成时并行既有 IPC（路径 1） |
| 2 | 周报 | 本批不扩四节 |
| 3 | 关注范围 | 全部 `WATCHING`，不限持仓 |
| 4 | 处置建议进报告 | 可带 `positionAdvice` + reason，文案标明规则辅助 |

## 10. 主要触点（实现时）

- `src/components/DecisionCenter/reviewReportModel.ts` / `ReviewReportPanel.tsx` / `DecisionCenter.tsx`  
- `electron/main/services/reviewAiNarrativeService.ts`（prompt）  
- `tests/unit/reviewReportModel.test.ts` 等  
- `src/components/DecisionCenter/README.md`
