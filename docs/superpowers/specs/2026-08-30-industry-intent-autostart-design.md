# 产业研究意图可启动（E1）设计

**状态：** 已完成  
**日期：** 2026-08-30  
**挂靠：** [`2026-08-30-gap-closure-program-design.md`](./2026-08-30-gap-closure-program-design.md) §4.5 E1  
**Plan：** [`../plans/2026-08-30-industry-intent-autostart.md`](../plans/2026-08-30-industry-intent-autostart.md)

## 1. 问题

Phase 2a 对产业意图仅灰态「即将接入」；深挖已可确认启动。用户说「做个光伏产业研究」无法从聊天启动生成。

## 2. 目标

1. 产业意图建议卡启用「启动产业研究」按钮（显式确认，不静默自动烧 Token）。  
2. 确认后调用既有 `industryResearch:startGeneration`（无 projectId → 新建项目），`researchQuestion` 用用户原句，`scope.industryName` 从句中启发式抽取。  
3. 成功 toast + 可选打开产业研究工作台（`setAIAnalysisSubTab('industryResearch')` 或 App 导航若存在）；失败 toast。  
4. Agent 主路径开启时仍不拦截（与深挖一致）；suggest 仅非 Agent 或手动兜底。  
5. 纯函数单测：产业名抽取 / launch payload。

## 3. 非目标

- 不新增 Agent Tool `industry.start`（可后续）。  
- 不自动无确认启动。  
- 不改产业生成管线本身。

## 4. 验收

1. 「启动光伏产业研究」出现可点确认按钮。  
2. 确认后产生 generation run / 新项目。  
3. 「改为普通追问」仍可用。  
4. README 更新。
