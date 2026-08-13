# 自定义数据目录 — 实现计划

**状态：** 已完成  
**日期：** 2026-08-13  
**Spec：** [`../specs/2026-08-13-custom-data-directory-design.md`](../specs/2026-08-13-custom-data-directory-design.md)

## 任务分解

### T1 主进程：引导配置与 override 解析（`electron/main/services/applicationDataPathService.ts`）

- [x] 新增常量 `DATA_ROOT_OVERRIDE_FILE = 'data-root.json'`
- [x] 新增 `readDataRootOverride(bootstrapDir)` / `writeDataRootOverride(bootstrapDir, target)` / `clearDataRootOverride(bootstrapDir)`（原子写、损坏容错）
- [x] 新增 `resolveDataRootOverride(bootstrapDir, env)` 返回 `{ target, source: 'env' | 'file' } | null`（优先级 env > file）
- [x] 新增 `prepareCustomDataRoot({ currentRoot, targetRoot })`：复用复制 + SHA 校验 + 暂存区回滚；目标有数据复用 / 空目录复制 / 未知文件冲突
- [x] `configureApplicationDataPaths()` 增加 override 接入；导出状态供 IPC 查询；新增 `applyDeferredDataRootMigration()` 供阶段 B 调用
- [x] 单测扩展 `tests/unit/applicationDataPath.service.test.ts`

### T2 启动流程两段化（`electron/main/index.ts`）

- [x] 模块顶层：解析 override；无需复制时立即生效（与现状等价）
- [x] 需要复制时：`app.whenReady()` 后先显示「正在迁移数据」无框小窗，复制完成后自动重启使新根生效（见 spec 修订二：原「继续 bootstrap」方案因 Chromium 污染目标目录不可行）；失败走 `showFatalErrorWindow`

### T3 窄 IPC（新增 `electron/main/ipc/dataRootHandlers.ts`）

- [x] `dataRoot:getStatus` / `dataRoot:selectDirectory` / `dataRoot:setCustomRoot` / `dataRoot:clearOverride`
- [x] 校验 `event.sender`；错误码按 spec 4.7
- [x] `index.ts` bootstrap 注册；`electron/preload/index.ts` 暴露 `window.api.dataRoot.*` 类型

### T4 渲染层（`src/components/Settings/`）

- [x] 新增 `DataRootSettings.tsx`「数据存储」区块：当前路径 + 来源标签、更改目录（原生选择 + 二次确认 + 重启提示）、恢复默认、env 只读提示、错误文案
- [x] `Settings.tsx` 挂载区块
- [x] 更新 `src/components/Settings/README.md`（FR 追加）
- [x] `data-testid`：`settings-data-root-path` / `settings-data-root-change` / `settings-data-root-restore`

### T5 验证

- [x] 单测：优先级、引导文件读写、复制成功 / 回滚 / 冲突、损坏容错（30/30 通过）
- [x] E2E：设置页区块展示与状态（`tests/e2e/data-root-settings.spec.ts` 两用例通过）
- [x] `pnpm run verify`（typecheck + lint + unit + build）——分项跑通；全量存在 7 个 HEAD 存量失败（见检核表下方说明），与本功能无关
- [x] 本文件末尾填「设计初衷检核」

## 提交节奏

1. `feat(settings): 支持自定义数据目录（引导配置 + 智能迁移 + 设置入口）`
2. 测试与文档随同一提交或紧随其后

## 设计初衷检核

（2026-08-13 完成，对照 spec 第 5 节验收项 A–I；实现期发现并按 spec 修订二调整了阶段 A/B 行为）

| # | 验收项 | 结果 | 说明 |
|---|---|---|---|
| A | 默认路径与现状一致 | ✅ | 单测「开发环境继续使用隔离的 dev 数据目录」「让打包后的 Windows 应用使用安装目录 data 子目录」「安装版无 override 时行为与现状一致」「打包后的非 Windows 平台保持系统默认 userData」 |
| B | 改目录重启后数据完整迁移 | ✅ | E2E 用例 1：setCustomRoot 写引导文件 → 迁移进程完成复制后退出 → 目标目录含 db/session/marker、旧目录原样 → 下次启动进入新环境（按 spec 修订二验证） |
| C | 目标已有数据直接复用 | ✅ | 单测「prepareCustomDataRoot 目标已有应用数据时直接复用」「classifyDataRootTarget 区分已有数据/空目录/冲突」；E2E 第三次启动即命中 app-data 分支无复制；连续切换场景的复制源正确性由 spec 修订三（`previousRoot`）+ 单测「引导文件记录 previousRoot 时空目标优先从上一个数据根复制」保障 |
| D | 冲突目录拒绝且不破坏 | ✅ | 单测「prepareCustomDataRoot 目标含未知文件时报冲突且双方不动」「目标含未知文件时阻断且不删除任一侧内容」 |
| E | env 优先且 UI 只读 | ✅ | 单测「环境变量优先于引导文件且无迁移需求时立即生效」；E2E 用例 2：RT_DATA_ROOT 下来源显示「环境变量」、无更改/恢复按钮、clearOverride 返回 DATA_ROOT_ENV_LOCKED |
| F | 引导文件损坏退回默认 | ✅ | 单测「引导文件损坏时退回默认 dev 目录启动」「引导文件缺少有效 target 时退回 null」 |
| G | 恢复默认生效 | ✅ | E2E 用例 1 末段：clearOverride 后重启回到原 dev 目录，来源显示「默认」 |
| H | 迁移进度小窗与失败保护 | ✅ | 迁移进程先开无框进度小窗再复制（E2E 中 waitForMainWindow 跳过其 data: URL）；失败单测「复制失败时回滚 staging 并保留旧目录」，bootstrap 失败路径弹致命错误窗且 return |
| I | 单测 / E2E 覆盖 | ✅ | 单测 30/30；E2E 2/2；另新增仓库级 `playwright.config.ts` 使 `pnpm test:e2e` 可用 |

### 验证结果与存量问题说明

- 本功能相关：typecheck:node ✅、ESLint（全部改动文件）✅、build ✅、单测 30/30 ✅、E2E 2/2 ✅。完成审计追加 spec 修订三（引导文件 `previousRoot` 保障连续切换的复制源正确）。
- HEAD 存量失败（git status 证实相关文件本轮未改动，与数据目录功能无关）：
  - typecheck:web 3 处：`ResearchAgentPanel.tsx:189`、`DecisionCenter.tsx:954`、`AgentSettings.tsx:17`；
  - 单测 7 处：`noNativeDialogs`（`AIAnalysis.tsx:935` 存量 `window.confirm` 违反契约）、`singleStockRefreshTurnover`（测试内存 DB 缺 HEAD 代码写入的 `stock_minute_cache` 表）、`aiDiscussionFollowUp.concurrency`（5 例超时）。
