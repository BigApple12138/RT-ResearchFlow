# 本地投研 Agent Phase 2a Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans or implement task-by-task. Steps use checkbox syntax.

**Goal:** AI 分析仅聊天页；深挖意图 suggest→确认→`startRun`；砍掉深度/产业导航。

**Architecture:** 导航收敛到 `records`；`detectDeepResearchIntent` + 建议卡片；`ResearchAgentPanel` 支持外部打开；busy 用 `listRuns`。

**Tech Stack:** React、Zustand appStore、现有 researchAgent IPC。

## Global Constraints

- 不自动调度；不启动产业 generation
- 不放宽讨论审计
- 保留 DeepResearchWorkbench / IndustryResearch 源码

---

### Task 1: 导航收敛

- Modify: `src/App.tsx`, `src/store/appStore.ts`
- [ ] 从 `SECONDARY_NAV_TABS` 移除 `ai-analysis`；删除 ai-analysis 二级菜单项
- [ ] `activeTab === 'ai-analysis'` 始终渲染 `AIAnalysis`
- [ ] `navigateToIndustryResearch` / deep|industry returnTarget → records + toast 友好降级

### Task 2: 意图与建议卡片

- Create: `src/components/AIAnalysis/researchAgentIntent.ts` + unit test
- Modify: `AIAnalysis.tsx`, `ResearchAgentPanel.tsx`, README
- [ ] 深挖意图拦截 followUp；展示 suggest 卡片
- [ ] 确认打开 ResearchAgentPanel 对话框；产业灰态提示
- [ ] 全局/会话 busy 处理

### Task 3: 验证与提交

- [ ] unit + typecheck:web
- [ ] 分 step commit（仅本地/fork，不推 upstream）
