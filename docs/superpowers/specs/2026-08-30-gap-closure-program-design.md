# 产品缺口闭环总控设计（Gap Closure Program）

**状态：** 已完成（2026-08-30；范围选项 1；G1/发布侧书面结案）  
**日期：** 2026-08-30  
**承接：** [`2026-08-22-upstream-port-program-design.md`](./2026-08-22-upstream-port-program-design.md) Wave 3；README / `docs/releases/v0.1.0-beta.5.md`「已知限制」与路线图  
**Plan：** [`../plans/2026-08-30-gap-closure-program.md`](../plans/2026-08-30-gap-closure-program.md)

## 1. 问题

`v0.1.0-beta.5` 主干能力已齐，但存在两类未闭环事项：

1. **真·未实现**：路线图 / 已知限制 / 组件 README 明示的能力缺口。  
2. **已实现待验收**：Agent / 联网 / One-page 等代码已落地，SDD 仍标「待手工验收」，检核未回填。

目标是按本仓库 **SDD 硬门禁**（design → 批准 → plan → 实现 → 测试 → 设计初衷检核 → PR Review）把上述缺口全部闭环，而不是口头清单或跳过归档的堆码。

## 2. 目标

1. 每一项产品行为缺口都有独立（或明确挂靠）的 `specs/` + `plans/` 归档，文首状态可追踪。  
2. 实现项具备可重复测试：单元测试优先；涉及 IPC/UI 主路径补契约单测或 Playwright；禁止依赖付费 AI/公网瞬时态。  
3. 「待手工验收」项给出可执行检核清单，验收通过后回填相关 design/plan 状态与检核表。  
4. 遵守 `AGENTS.md`：本地优先、不交易、Renderer 不持凭据、DB 变更走 Migration、中文 commit、PR 先 Review。

## 3. 非目标（本程序明确不做或另列）

| 项 | 处理 |
|---|---|
| 下单 / 自动交易 / 仓位控制 / 收益承诺 | **产品硬边界，永不纳入** |
| Upstream Wave 2 已拒绝项（假曲线占位等） | **不重开** |
| 安装包商业代码签名、macOS 发布验收 | **发布工程**：默认本程序**排除**；若要做，另开「发布工程」SDD，不阻塞功能波次 |
| 聊天「停止生成」按钮、任意历史检查点恢复、拖拽式策略图形编辑器 | **已延期 backlog**：本程序默认不纳入首批；可在波次末尾可选认领 |
| 整分支 merge upstream | **禁止** |

## 4. 范围清单（全部闭环对象）

### 4.1 Track A — 已实现待验收（先闭环文档与证据）

| ID | 项 | 现有归档 | 闭环定义 |
|---|---|---|---|
| A1 | Agent Hub §8.11–13 MCP | `2026-08-11-ai-analysis-agent-hub-design.md` | 手工检核清单执行；通过则改状态「已完成」并填检核 |
| A2 | One-page 深挖时间线 | `2026-08-12-ai-analysis-onepage-deep-research-*` | 同上 |
| A3 | 「深度分析一下」继承持仓 | `2026-08-12-agent-turn-session-memory-*` | 同上 |
| A4 | 联网搜索 MCP 通道 | `2026-08-12-app-web-search-gateway-*` | 同上 |
| A5 | 趋势 AI 偏差分确认 | `2026-08-13-trend-ai-score-delta-in-review-*` | 用户确认 UI/口径后回填 |

### 4.2 Track B — 小切片功能（独立短 SDD）

| ID | 项 | 规模 | 验收要点 |
|---|---|---|---|
| B1 | 资讯详情行「+观察池」 | 小 | 复用 `trend:addStocks`；BriefingDetail 行按钮；单测/契约 |
| B2 | 竞价价史 `partial` 远端失败自动重试 | 小 | coordinator 行为可测；不误重试成功 partial |

### 4.3 Track C — 工程/体验债

| ID | 项 | 规模 | 验收要点 |
|---|---|---|---|
| C1 | 竞价价史 snapshot IPC 冷启动大批量阻塞 | 中 | 设计明确并发/分批/进度反馈；单测或基准断言；已知限制文案可降级或更新 |

### 4.4 Track D — 数据模型增强

| ID | 项 | 规模 | 验收要点 |
|---|---|---|---|
| D1 | 消息中心跨会话持久化 | 中 | 新 Migration；不篡改历史；MessageCenter README/FR 更新；单测 |

### 4.5 Track E — Agent/研究体验

| ID | 项 | 规模 | 验收要点 |
|---|---|---|---|
| E1 | 产业研究意图自动启动（去灰态） | 中 | 显式确认门禁保留；phase2a 对齐；相关单测 |
| E2 | 「相对持仓总结今日资讯」AI 摘要 | 中 | 用户触发；失败可恢复；不自动烧 Token；单测 mock AI |

### 4.6 Track F — 策略实验室大项

| ID | 项 | 规模 | 验收要点 |
|---|---|---|---|
| F1 | 通用日线 DSL | 大 | 独立 design；语法/求值/证据；不伪装未完成能力 |
| F2 | 日线预筛 → 分钟确认两阶段组合 | 大 | 依赖 F1；策略实验室 UI 诚实标注；单测+至少一条 E2E |

### 4.7 Track G — 云端分钟（产品边界待确认）

| ID | 项 | 规模 | 验收要点 |
|---|---|---|---|
| G1 | `minuteData:saveCloudConfig` 启用 | 中 | **默认（待确认）：** 推荐选项 1——有真实后端方案再实现；无则书面结案保持 `NOT_IMPLEMENTED`。macOS/签名默认排除出本程序。用户若选 2/3 以书面为准修订本表 |

## 5. 推荐执行波次（顺序）

```
Wave 0  本总控 design + 总览 plan（本文件）——须批准
Wave 1  Track A 手工验收与文档回填（可与 Wave 2 并行准备）
Wave 2  Track B（B1 → B2）
Wave 3  Track C（C1）
Wave 4  Track D（D1）
Wave 5  Track E（E1 → E2）
Wave 6  Track F（F1 → F2，最大块，单独 PR 序列）
Wave 7  Track G（边界确认后实现或书面结案不做）
```

每波次：**先该波次 detail design（若总控不够细）→ 用户批准 → plan → 实现 → 测试 → plan 检核 → PR → Review → 合入 develop**。  
禁止「先写代码再补 spec」。大波次（F）允许再拆子 design。

## 6. 规范管理约定

1. **命名**：`specs/2026-08-30-<topic>-design.md` / `plans/2026-08-30-<topic>.md`（后续日用当天日期）。  
2. **挂靠**：各子 design 文首链回本总控；总览 plan 维护波次勾选表。  
3. **测试门禁**：改行为必须有失败用例先红后绿（能写单测的优先）；涉及时间/网络/AI 必须可重复。  
4. **合入**：默认 PR → `develop`；Review 门禁按 `AGENTS.md`。  
5. **状态同步**：完成后同步更新 README「已知限制 / 路线图」与下一版 `docs/releases/`（发版时，不在每个小 PR 强求）。  
6. **过期文档**：发现「待 PR」等陈旧状态一并修正（如 `2026-08-12-port-market-resonance-heatmap`），不算范围膨胀。

## 7. 方案取舍（总控层）

| 方案 | 做法 | 取舍 |
|---|---|---|
| A. 单仓巨型 PR 一次做完 | 不可审、易回归 | **否决** |
| B. 按 Track 多波次独立 SDD（推荐） | 可审、可测、可中断续跑 | **采用** |
| C. 只做小项、大项只写 design 不实现 | 违背「全部实现」目标 | **否决**（但 G1/发布侧允许「书面结案不做」） |

## 8. 总验收（程序级）

当且仅当：

1. §4 清单每行状态为「已完成」或「书面结案不做（用户确认）」；  
2. 各子 plan「设计初衷检核」已填；  
3. 相关单测/约定 E2E 在 CI/`pnpm run verify` 可重复绿；  
4. README 已知限制中已交付项已更新或移入「已解决」叙述；  
5. 总览 plan 波次全勾选。

方可将本总控状态改为「已完成」，并关闭对应 Goal。

## 9. 修订记录

- 2026-08-30：初版起草，基于缺口扫描与 Wave 3 backlog。
