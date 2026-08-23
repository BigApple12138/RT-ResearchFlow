# 遗留清理：文档 / E2E / 空壳来源 / 任务条文案

**状态：** 已完成  
**日期：** 2026-08-12  
**Plan：** [`../plans/2026-08-12-legacy-cleanup-scan-items.md`](../plans/2026-08-12-legacy-cleanup-scan-items.md)  
**依据：**
- [`2026-08-12-config-agent-tab-design.md`](./2026-08-12-config-agent-tab-design.md)
- [`2026-08-08-local-research-agent-phase2a-design.md`](./2026-08-08-local-research-agent-phase2a-design.md)
- [`2026-08-12-ai-analysis-onepage-deep-research-design.md`](./2026-08-12-ai-analysis-onepage-deep-research-design.md)

## 1. 问题

全库扫描发现：主路径已按决策收敛，但仍有 **文档漂移、E2E 仍点旧「设置」页、one-page 空壳「来源」、后台任务条文案与实际目标不符**。这些不是「有意遗留工作台」，而是未收尾的债。

## 2. 目标（仅此四项）

1. `tests/e2e/research-access.spec.ts`：本机研究访问入口改为配置中心 **Agent** 页。
2. `IndustryResearch/README.md`：去掉「二级导航」过时表述，改为程序化/后台/测试钩子挂载。
3. `App.tsx` 产业研究后台任务条：aria/文案与实际打开目标一致（产业工作台，不是「聊天」）。
4. `DeepResearchTurnView`：删除仅提示「去上方证据页签」的空壳 `deep-research-sources`；证据仍由内嵌 `ResearchAgentRunDetail` 的「证据」Tab 承担（testid `research-agent-evidence-tab` 保留）。在结论区保留可发现的「证据」引导可省略——以不双份空折叠为准。

## 3. 非目标

- **不删除** `DeepResearchWorkbench` / `IndustryResearch` 整页源码（Phase 2a 有意遗留）。
- 不恢复侧栏深度/产业导航。
- 不重做 one-page 气泡交错（polish 另开）。
- 不改 IPC / DB / 主进程 runner。

## 4. 验收

| # | 期望 |
|---|---|
| A | research-access E2E 源码含 `config-tab-agent`，不再依赖 `config-tab-settings` 找本机研究 |
| B | IndustryResearch README 无「二级导航」作为当前入口描述 |
| C | 后台任务条文案不再声称打开「聊天」却进产业工作台 |
| D | `DeepResearchTurnView` 无空壳 `deep-research-sources`；view 契约测同步 |
| E | 不删 Workbench / IndustryResearch 模块文件 |

## 5. 修订

- 2026-08-12：用户确认按扫描清单 1–4 规范清理。
