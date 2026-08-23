# 本地投研 Agent — Phase 1 设计

**状态：** 已写入仓库（实现以本文件与对应 plan 为准）  
**范围：** Phase 1 仅常驻聊天 + 持仓快捷分析；不含自动调度 subagent

## 背景与目标

用户面对模块迷宫时上手成本高。北星是「一个主聊天入口 + 深度研究 / 产业研究两个 subagent」。Phase 1 先把 **AI 分析 → 研判记录** 打成可立刻对话的 Agent 入口，并提供持仓相关快捷芯片。

## 非目标（Phase 1）

- 不新增侧栏菜单
- 不自动启动深度研究 / 产业研究（可文案提示手动入口）
- 不实现 `autoDispatchSubagents`
- 不重写两套研究流水线
- 聊天不持久化 API Key

## 用户可见行为

1. 进入「研判记录」即可输入发送，无「发起研究讨论」空态门槛。
2. 默认落在 **新对话** composer；**不**在 `selectedId === null` 时自动选中 `aiSessions[0]`。
3. 快捷芯片：
   - **分析我的持仓**：空持仓时本地说明（区分「已缓存个股 ≠ 持仓」）；有持仓则生成事实包并调用已配置 AI，结果写入新/当前讨论会话。
   - **我有哪些持仓**：列出代码与名称（**不含成本价**），可本地完成，不必调模型。
   - **检查 AI 配置**：汇总是否已配置 Key / 当前厂商与模型；未配置时提示去配置中心。
4. 深度研究 / 产业研究子页与侧栏入口保留。
5. 回复可轻提示：若需深挖可到深度研究工作台（Phase 1 可用文案/链接级，不自动开跑）。

## 架构

```text
UI (AIAnalysis)
  ├─ 新对话 composer + chips
  ├─ create-and-send: startResearchDiscussion(mode=new) → followUp
  └─ chips → portfolio.list / ai.getConfig / ai:runPortfolioBrief

Main
  portfolioBriefService
    ├─ buildPortfolioBriefFacts (无成本价)
    └─ runPortfolioBrief (facts + callWithFallback → 写入 session messages)
```

复用既有：

- `ai:startResearchDiscussion` + `ai:followUp` + 气泡 UI
- `portfolio:list` / `portfolio:getDashboard`（简报事实可取价格等公开字段，**剥离 costPrice**）
- `ai:getConfig`

新增：

- `electron/main/services/portfolioBriefService.ts`
- IPC `ai:runPortfolioBrief` + preload 暴露
- 单测：事实包不含成本、空持仓文案、配置预检

## 数据与隐私

- 简报默认 **不向模型发送 costPrice / 浮盈计算所需成本**。
- 持仓列表芯片同样不展示成本价（用户可在走势图持仓管理查看成本）。

## 错误与空态

| 情况 | 行为 |
|---|---|
| 无持仓 | 明确文案：尚未添加持仓；已缓存个股不是持仓；指引去「+ 持仓」 |
| AI 未配置 | 「分析我的持仓」预检失败并提示配置；列持仓/检查配置仍可用 |
| 发送失败 | 恢复输入框内容；toast 错误 |

## 坑位（Phase 1 必须处理）

| 坑 | 对策 |
|---|---|
| 自动选中旧会话 | 去掉 `selectedId === null → aiSessions[0]`；默认新对话 |
| 只建会话不发送 | 首条走 create-and-send |
| 已缓存 ≠ 持仓 | 空态文案写死 |
| 成本价进模型 | 简报事实包剥离 |

## Phase 2 预告（本 Phase 不做）

路由 `brief` / `deep_research` / `industry_research` / `clarify`；`autoDispatchSubagents`；handoff 包；全局单 running 租约检测；messages 写锁；产业范围确认；绑定产业时的 native web search Provider 检查。

## 验收

1. 进 AI 分析即可聊，无弹窗门槛；有历史会话时默认仍是新对话。
2. 三枚芯片行为符合上文。
3. 深度/产业入口仍在，不自动调度。

## 组件 README

实现后更新 [`src/components/AIAnalysis/README.md`](../../../src/components/AIAnalysis/README.md)，记入本 Phase 行为（可标 FR 草案号或「本地投研 Agent Phase 1」）。
