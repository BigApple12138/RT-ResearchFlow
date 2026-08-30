# 产业研究意图可启动（E1）Implementation Plan

> 对照 [`../specs/2026-08-30-industry-intent-autostart-design.md`](../specs/2026-08-30-industry-intent-autostart-design.md)

**状态：** 已完成

## Tasks

- [x] `extractIndustryNameFromIntent` / `buildIndustryResearchLaunchPayload` 纯函数
- [x] 建议卡「启动产业研究」→ `industryResearch:startGeneration` + 打开工作台
- [x] 单测：产业名抽取与 payload
- [x] README 更新（去掉灰态「即将接入」）

## 设计初衷检核

| Spec 项 | 结果 | 说明 |
|---|---|---|
| 可点确认按钮 | ✅ | `research-agent-suggest-industry-confirm` |
| 确认后 startGeneration | ✅ | 无 projectId 新建；scope 含 industryName |
| 显式确认不静默烧 Token | ✅ | 仅按钮点击触发 |
| 「改为普通追问」仍可用 | ✅ | suggest-chat 分支保留 |
| 单测 | ✅ | researchAgentIntent 产业抽取/payload |
| README | ✅ | Phase 2a 段落已改 |
