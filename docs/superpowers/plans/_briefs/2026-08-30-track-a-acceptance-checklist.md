# Track A 手工验收清单（Gap Closure Wave 1）

> 挂靠 [`../specs/2026-08-30-gap-closure-program-design.md`](../specs/2026-08-30-gap-closure-program-design.md) §4.1  
> 闭环原则见 [`../specs/2026-08-30-track-a-acceptance-closure-design.md`](../specs/2026-08-30-track-a-acceptance-closure-design.md)

**状态：** 已完成（2026-08-30；自动化证据优先，活体外部 MCP 为环境可选）  
**日期：** 2026-08-30

## 使用方式

1. 行为可测项以本文件「自动化跑分」为权威。  
2. 若本机已配置外部 MCP / AI Key，可按 A1–A5 表做补充点验（不阻塞结案）。  

---

## A1 Agent Hub §8.11–13 / 联网门禁

| # | 步骤 | 期望 | 结果 |
|---|---|---|---|
| A1.1 | 外部 MCP 连通测试 | 能列出 tools（需本机 MCP） | ⚪ 环境可选 |
| A1.2–A1.6 | 联网开关门禁 / 写操作确认 | 拒绝与确认路径正确 | ✅ 单测门禁 |

## A2 One-page 深度研究时间线

| # | 步骤 | 期望 | 结果 |
|---|---|---|---|
| A2.1–A2.3 | 深挖投影在聊天时间线 | 进度/终态/忙碌拒绝 | ✅ view/E2E 族 + 实现已合入 |

## A3 「深度分析一下」继承持仓

| # | 步骤 | 期望 | 结果 |
|---|---|---|---|
| A3.1 | 继承会话持仓上下文 | 非空上下文 | ✅ session-memory plan 检核 + 单测 |

## A4 联网搜索 MCP 通道

| # | 步骤 | 期望 | 结果 |
|---|---|---|---|
| A4.1–A4.2 | 网关配置与降级 | 未启用时弱检索说明 | ✅ `appWebSearchGateway` 单测 |

## A5 趋势 AI 偏差分（aiScoreDelta）

| # | 步骤 | 期望 | 结果 |
|---|---|---|---|
| A5.1 | 偏差分徽章/文案 | 可理解、无荐股 | ✅ `aiTrendReviewBadge.view` + service 单测 |

---

## 自动化跑分记录

| 命令 / 范围 | 时间 | 结果 |
|---|---|---|
| Track A 相关单测（gateway / agent* / badge 等） | 2026-08-30 | ✅ 含 30+ passed 再跑 |
| `aiTrendReviewBadge.view` + gap 相关单测再跑 | 2026-08-30 | ✅ 34 passed（含 E1/E2/F） |
| 活体外部 MCP / 烧 Token 点验 | | ⚪ 环境可选，不阻塞 |

## 回填目标文件

- [x] `specs/2026-08-11-ai-analysis-agent-hub-design.md` / plan 检核  
- [x] `specs/2026-08-12-ai-analysis-onepage-deep-research-design.md`  
- [x] `specs/2026-08-12-agent-turn-session-memory-design.md`  
- [x] `specs/2026-08-12-app-web-search-gateway-design.md`  
- [x] `specs/2026-08-13-trend-ai-score-delta-in-review-design.md`  
- [x] 总控 plan Wave 1  
