# 观察池分类：东财映射规则（一期）— 设计

**状态：** 已完成  

**日期：** 2026-08-09  
**归档：** 实现对照见 [`../plans/2026-08-09-watchlist-category-em-map.md`](../plans/2026-08-09-watchlist-category-em-map.md)  
**方法论：** SDD；superpowers 仅为可选工具  

**取代关系：** 取代 [`2026-08-09-trend-watchlist-smart-category-design.md`](./2026-08-09-trend-watchlist-smart-category-design.md) 中「内置种子 catalog 作为智能填写来源」的路径；主题树键与手改/重新识别交互保留。

**依赖：** `WATCHLIST_CATEGORY_TREE`、`trend_watchlist`、东财公开报价/F10、`TrendManager` 加股表单

## 1. 问题

观察池加股时的智能分类依赖 Migration 67 抽成的静态 `tsCode → 分类` catalog。该目录难维护、与东财行业脱节，冷门股无法识别；用户希望按东财行业/概念关键词映射到既有主题树，并在应用内维护映射规则。

## 2. 目标（一期）

- 去掉 catalog / extract 脚本作为**智能填写**来源。  
- 库内可维护表 `watchlist_category_map_rules`，迁移时灌入一批默认可测规则（至少覆盖铜/PCB/锂电/光模块/算力等）。  
- 加股时按序自动建议：同 `tsCode` 池内已有分类 → 东财标签 + 映射规则 → 空；旁注标明来源。  
- 未命中规则但拿到东财行业时，旁注展示「东财行业：xxx → 未命中规则」。  
- 始终可手改；手改后不自动覆盖；「重新识别」强制重跑。  
- 观察池内提供「映射规则」维护区（列表 / 增改 / 删除），改规则后下次识别立即生效。  
- 主题树一期继续读代码常量 `WATCHLIST_CATEGORY_TREE`（无树编辑 UI）。

## 3. 非目标（一期）

- 主题树进库与 UI 增删分类/赛道（二期）。  
- 联网补充分类 / 搜索引擎兜底（二期）。  
- 东财行业名直接写入下拉（必须经规则落到主题树）。  
- 改写/删除历史 Migration 67 SQL；新库是否停灌 72 条种子股（另开需求）。  
- 加股自动拉日线。  
- AI / Token 推断分类。

## 4. 推断顺序与覆盖策略

对规范化 `tsCode`：

1. **池内**：已有登记且 `(category, sub_category)` 合法 → `source=watchlist`。  
2. **东财映射**：拉取公开行业/概念/名称标签（优先报价轻量字段如 `f127`/`f58`，F10 概况作补充；整体约 4s 超时，失败降级为空标签，不阻塞加股）→ 用启用中的 map rules（按 `priority` 降序）做子串匹配 → 仅返回 `isValidWatchlistCategoryPair` 为真的 pair → `source=eastmoney-map`。  
3. **无命中**：不填分类；若有东财行业则旁注展示行业与未命中。

覆盖：

- `categoryTouched`：用户改下拉后置 true，选股变更不再自动覆盖。  
- 「重新识别」清除 touched 并强制重跑（含东财拉取）。

## 5. 数据模型

`watchlist_category_map_rules`：

| 列 | 说明 |
|---|---|
| `id` | INTEGER PK |
| `keyword` | 非空，子串匹配（大小写不敏感） |
| `match_field` | `industry` / `concept` / `name` |
| `category` / `sub_category` | 必须落在 `WATCHLIST_CATEGORY_TREE` |
| `priority` | 整数，越大越优先 |
| `enabled` | 0/1 |
| `created_at` / `updated_at` | ms |

纯函数：`mapWatchlistCategory(tags, rules)` → `{ category, subCategory, matchedKeyword } | null`。

## 6. IPC（窄校验）

- `trend:suggestWatchlistCategory` `{ tsCode }`  
- `trend:listCategoryMapRules`  
- `trend:upsertCategoryMapRule`  
- `trend:deleteCategoryMapRule` `{ id }`  

Renderer 经 preload / `window.api.trend.*` 调用；不把凭据或任意 URL 暴露给渲染进程。

## 7. UI

- 加股表单：自动填 + 来源旁注 + 重新识别（既有 testid 保留）。  
- 「映射规则维护」：可展开列表，支持增改删；无联网补充按钮（一期）。  
- 下拉仍绑定代码内 `WATCHLIST_CATEGORY_TREE`。

## 8. 验收

1. 不依赖种子 catalog，也能对「东财有行业且规则命中」的股票自动填分类。  
2. 在维护区改规则后，下一次识别立即生效。  
3. 手改不被覆盖；重新识别可重跑东财+规则。  
4. 未命中时若有东财行业，旁注可见。  
5. catalog 建议路径移除后相关单测改绿；typecheck / 聚焦单测通过。  

## 9. README

更新 `src/components/TrendWatcher/README.md` 中智能填写与维护入口说明。
