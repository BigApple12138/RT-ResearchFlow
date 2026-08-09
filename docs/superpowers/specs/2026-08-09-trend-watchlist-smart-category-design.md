# 观察池加入时智能填写分类/赛道 — 设计

**状态：** 已完成  

**日期：** 2026-08-09  
**归档：** 实现对照见 [`../plans/2026-08-09-trend-watchlist-smart-category.md`](../plans/2026-08-09-trend-watchlist-smart-category.md)  
**方法论：** SDD；superpowers 仅为可选工具  

**依赖：** `TrendManager` 的 `CATEGORY_TREE`、FR-164 种子/目录映射、`trend:addStocks`、股票搜索选中态  

## 1. 问题

加入观察池时必须手选「分类」「细分赛道」。已知票（种子目录、已在池中的登记）其实已有标准分类，重复手填摩擦大。

## 2. 目标

- 选中/确认一只（或一批）待加股票后，**自动填入**分类 + 细分赛道（可改）。  
- **本地规则**，不调模型、不烧 Token。  
- 无法推断时保持「暂不分类」，不瞎填。  
- 用户手动改过分类后，不被下一次自动建议静默覆盖（见 §4）。  

## 3. 非目标

- AI 推断冷门股行业（下期另开）  
- 改 `CATEGORY_TREE` 树本身或新增一级分类体系  
- 批量加入时对每只股写入**不同**赛道的复杂 UI（本期：整批共用一套自动建议；多映射时取优先级最高的一条，并提示「可改」）  
- 一键清空观察池（另见 clear-all spec）  

## 4. 推断来源与优先级

对规范化 `tsCode`，按序取第一条可用建议：

1. **已在观察池**：该股票已有登记的 `(category, sub_category)`（非空），取最近/字典序第一条。  
2. **内置目录**：从 FR-164 种子抽成的静态 `tsCode → { category, subCategory }[]`（与 `CATEGORY_TREE` 键一致）；多条时取数组第一项。  
3. **无命中**：不填。  

展示：输入区旁弱文案「已自动填写：CPO / 光模块」（或「未识别分类，可手选」）。  

**覆盖策略：**  
- `categoryTouched` / `subCategoryTouched`：用户改下拉后置 true，之后选股不再自动覆盖。  
- 「重新识别」小按钮可强制再跑推断并清除 touched。  

## 5. 交互

1. 搜索结果点选加入 `selectedStocks` 时触发 suggest。  
2. 若当前仅 1 只选中 → 按该只推断。  
3. 若多只 → 用**第一只选中**的建议填表（Toast/旁注：批量共用分类，可改后再点加入）。  
4. 下拉仍可手改；自定义分组不自动填。  

## 6. 数据

- 新增模块（建议）：`electron/main/services/trendWatchlistCategoryCatalog.ts` 或 `src/components/TrendWatcher/trendWatchlistCategoryCatalog.ts`（纯数据 + `suggestCategory(tsCode)`），与 UI `CATEGORY_TREE` 键对齐。  
- 目录数据来源：整理 migration 67 种子中的 `(ts_code, category, sub_category)`，**不**在运行时读 migration SQL。  
- 可选 IPC `trend:suggestWatchlistCategory({ tsCodes })` 便于单测主进程；亦允许纯前端 catalog（更简单）。**推荐纯前端/共享 TS 模块**，避免多余 IPC。  

## 7. 验收

1. 选「中际旭创」类目录内股票 → 自动出现正确分类/赛道。  
2. 手改分类后，再选同一只不被盖掉（除非点重新识别）。  
3. 未知股票不填分类。  
4. 0 Token。  
5. 单测：目录命中、多映射取首、unknown、与 CATEGORY_TREE 键一致。  

## 8. README

更新 `TrendWatcher/README.md`。  
