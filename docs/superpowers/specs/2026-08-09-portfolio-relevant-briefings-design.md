# 资讯「与我相关」本地过滤 — 设计

**状态：** 已完成  

**日期：** 2026-08-09  
**归档：** 设计初衷；实现对照见 [`../plans/2026-08-09-portfolio-relevant-briefings.md`](../plans/2026-08-09-portfolio-relevant-briefings.md)  
**方法论：** Spec-Driven Development（SDD）；superpowers skills 仅为可选工具  

**依赖：** `portfolio_stocks`、资讯 `briefings` 列表/FTS、现有 FilterBar / `BriefingListOptions`、可选 `industryChainData` / `trend_watchlist` 作赛道扩展  

## 1. 问题

扫描后未读常达数百条。详情里的「一键 AI 分析」入口过深，用户不可能逐条点开。需要在**列表层**先按持仓做本地分流。

## 2. 目标

| 能力 | 说明 |
|---|---|
| 默认视图 | 进入资讯页默认 **与我相关** |
| 本地过滤 | 用持仓代码/简称（及约定扩展词）匹配标题·摘要；**不烧 Token** |
| 可回退 | 一键切回「全部」；影响分级/搜索/来源筛选仍可用 |
| 计数诚实 | 「与我相关」下未读/条数显示该视图口径，避免顶栏仍刷 430 制造假焦虑 |
| 空持仓 | 无持仓时回退「全部」，并提示去走势图「+ 持仓」 |

## 3. 非目标

- 批量 / 自动「相对持仓 AI 今日总结」（下期）  
- 自动把不相关资讯标已读或删除  
- 改写单条详情的「一键 AI 分析 / 产业链分析」  
- 荐股、必买、仓位建议  
- 新建跨会话 Agent 记忆  

## 4. 产品原则

- **本地优先 / 显式 AI**：过滤零 Token；单条 AI 仍显式点击。  
- **先分流、再深读**：洪峰入口是过滤，不是详情按钮。  
- **可解释**：命中时卡片上可显示弱提示（如「命中：节能风电」），不假装「AI 已读完」。  
- **窄 IPC**：匹配在主进程完成；Renderer 只传 `relevance: 'portfolio' | 'all'`。  

## 5. 匹配规则（主进程）

### 5.1 持仓词表

来自 `listPortfolioStocks`：

- `stockName`（全称）  
- 6 位代码（`tsCode` 去后缀）  
- 完整 `tsCode`（如 `601016.SH`）  

词条去重；名称长度 &lt; 2 的忽略，避免误伤。

### 5.2 命中条件（满足任一）

在 `title` 或 `summary` 中（大小写不敏感）：

1. 包含任一首发持仓词条；或  
2. **赛道扩展（本期纳入，可关）**：持仓若出现在内置 `INDUSTRY_CHAINS` 某节点 `stocks` 中，则同节点其他代表股的 `name` / 6 位代码也作为扩展词（不把整条产业链所有节点展开，避免噪声爆炸）。  

不匹配 `fullContent`（过重且易误报）。  

### 5.3 结果标记

列表项可附带只读字段（DTO，非新表）：

- `relevanceHits: string[]`（命中词，最多 3 个）  
- `relevanceKind: 'direct' | 'chain_peer'`（可选，便于 UI 文案）  

### 5.4 排序

在现有「未读优先 + 时间」规则之上：**direct 命中优先于 chain_peer**，再按原排序。  

## 6. 交互

1. 进资讯：`relevanceScope` 默认 `portfolio`。  
2. FilterBar 增加分段：**与我相关 | 全部**（与影响分级并列或上一行）。  
3. 无持仓 + `portfolio`：自动视为 `all`，顶栏/条内提示「尚未添加持仓，当前显示全部资讯」。  
4. 有持仓但 0 命中：空态文案「暂无与持仓直接相关的资讯，可切换到全部」。  
5. 顶栏「未读资讯」在 `portfolio` 模式下显示 **相关未读**；旁注或 Tooltip 可看「全部未读」。  
6. 「今日重点」侧栏：在 `portfolio` 模式下同样只展示相关子集（或隐藏无关重大，避免左右口径打架）。  

## 7. 数据与 IPC

- 扩展 `BriefingListOptions`：`relevance?: 'all' | 'portfolio'`（默认对 UI 为 portfolio；IPC 缺省建议 `all` 以保持旧调用兼容，**Renderer 显式传 portfolio**）。  
- `BriefingListResult`：增加 `relevanceUnreadCount?`、`portfolioTermCount?`、`relevanceModeApplied: 'all' | 'portfolio' | 'portfolio_fallback_empty'`。  
- **无需新表 / Migration**（纯查询投影）。若后续要持久化用户偏好「默认全部」，再用 settings 键（非本期必须）。  

## 8. 风险与坑

| 坑 | 对策 |
|---|---|
| 简称过短误匹配 | 名称长度门槛；优先长短语 |
| 产业链扩展过宽 | 仅同节点 peers，不做跨节点 |
| FTS 多词 OR 复杂 | 可用 SQL `LIKE` 批量 OR（持仓通常 &lt; 20）或 FTS 查询拼装；单测锁行为 |
| 顶栏未读仍显示全局 | 汇总条与 `unreadCount` 绑定 `relevanceModeApplied` |
| 已缓存 ≠ 持仓 | 文案写死：过滤只认「+ 持仓」 |

## 9. 验收

1. 有持仓时进资讯默认「与我相关」，列表条数明显少于全部。  
2. 标题含持仓名/代码的资讯出现；无关资讯不出现。  
3. 切「全部」恢复原列表与全局未读口径。  
4. 无持仓时不卡死在空列表，有明确提示。  
5. 0 Token；单条 AI 按钮行为不变。  
6. 单测覆盖词表构建、命中、空持仓回退、peers 扩展边界。  

## 10. 组件 README

- `src/components/FilterBar/README.md`（若无则创建或写在 BriefingFeed README）  
- `src/components/BriefingFeed/README.md` / `BriefingCard` 若展示命中标签  
- 必要时 `App.tsx` 资讯汇总条说明  

## 11. 分期

- **本期：** 本地过滤 + 默认与我相关 + 计数口径。  
- **下期（另开 SDD）：** 显式「相对持仓总结今日资讯」AI 摘要。  
