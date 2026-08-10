# TrendWatcher 模块

## 当前职责

`TrendWatcher` 是长线趋势研判工作台。左侧 Flyout 是唯一二级导航，兼容键保持不变：

- `portfolio`：持仓总览，按风险和趋势恶化顺序复核真实持仓。
- `dashboard`：趋势雷达，比较当前分、5日/20日变化、相对强度和数据覆盖。
- `alerts`：趋势事件，追溯触发价、阈值、事后涨跌和持续/恢复状态。
- `manage`：观察池，批量登记股票、维护分类/赛道/分组并恢复日线缺口。

子页面首次访问后保持挂载，切换页面不会丢失筛选、选中股票或未完成的主进程数据任务。页面内部不再渲染第二套顶部导航。

## 数据与评分

主页面统一调用 `trend:getWorkbench`。主进程将 `trend_watchlist` 与 `portfolio_stocks` 聚合后按股票代码去重，并返回：

- 趋势评分 V2、评分日期/来源、行情时间/来源和有效权重。
- 最近90日评分轨迹及5日、20日变化。
- 本地日线根数、最新日期和 `ready/partial/missing` 覆盖状态。
- 既有 `trend_alerts` 及其 `active/recovered/unknown` 当前状态。
- 本地已有的持仓成本、筹码摘要和处置规则结果。
- `trend:getWorkbench` 还会附加按 `scoreDate + factsHash` 校验的 `structureReview`（含只读 `source: gate|model`）；AI 徽章只表示第二意见，不覆盖本地 `trendState`，事实变化时显示「需重核」。
- 徽章旁**可见**展示一行 `rationale` 与最多 3 条 `focusPoints`（不依赖 hover）；`need_more_data` 时解释块前缀区分：确定性门槛短路为「本地门槛：」，模型路径为「AI 第二意见：」。徽章短标签两路径均仍为「需补数据」。本地「事实完整」与 AI「需补数据」可同屏并存，AI 块不冒充本地缺数。

评分 V2 使用归一化七维权重。个股和沪深300都使用20交易日收益；最大回撤遵守先峰值后谷值；缺失维度保持 `null`，有效权重不足70%时综合分保持 `null`。实时价格不会把日终评分错误标记为实时评分。

## 恢复与交互

观察池加入股票只做登记与名称解析，不自动拉日线。用户点击页头「补齐缺口」或行内「补齐」时才调用 `trend:backfillStocks`；任务在主进程执行，切换页面不取消；未配置Tushare时走公开行情，失败可重试。全市场同步只保留为紧凑的数据维护入口，单个进度条占满整行。观察池列表另提供独立的分类/细分赛道筛选，不与新增股票表单中的分类字段混用；两个选项菜单限制为18rem并在内部滚动，长列表不得带动页面滚动。

观察池支持「清空观察池」：`data-testid="trend-watchlist-clear-all"`，空池禁用；确认后调用 `trend:clearWatchlist`，只删除 `trend_watchlist` 行，不删本地日线/评分/alerts/`stock_basic_cache`，也不自动重播种子目录。批量加入时按「同代码池内已有分类 → 东财公开行业/概念 + 可维护映射规则 → 空」智能填写分类/细分赛道（`trend:suggestWatchlistCategory`）；旁注标明来源（池内 / 东财映射）；未命中规则时若拿到东财行业则展示「东财行业：xxx → 未命中规则」。用户手改后不再覆盖，可用「重新识别分类」强制重算（无 AI、不烧 Token；东财拉取约 4s 超时降级，不阻塞加股）。分类维护区（`data-testid="trend-watchlist-map-rules"`）含「映射规则」与「主题树」页签：规则 CRUD `watchlist_category_map_rules`；主题树读写 `watchlist_category_nodes`（`trend:listCategoryTree` / upsert / rename / delete），下拉与校验以库内树为准，`WATCHLIST_CATEGORY_TREE` 仅作 Migration 种子/测试夹具。删除节点采用方案 C：引用中禁删，确认「清空引用后删除」后清空观察池分类、删除相关规则再删节点；重命名级联 watchlist 与 rules。加股表单提供显式「联网补充分类」（`trend-watchlist-web-suggest-category`）：单次确认授权，复用研究侧搜索；可返回树内 pair 与会话内待采用建议（不落库）；采用经 `trend:adoptWebCategorySuggestion` 先写树再填表；重新识别不自动联网。种子 catalog 不再参与智能填写。

加股与股票走势图同链路：名称搜索走 `datasource:searchStock`（本地字典；六位无命中时用东财轻量报价只取名称）；回车/点选后 `trend:addStocks` 登记，日线留给补齐按钮。字典为空时提示可直接输六位代码；「执行全市场同步」缺 Tushare 的错误只显示在数据维护区，不占用加股表单。

趋势雷达、趋势事件和观察池股票行复用 `StockKlineChipDrawer`；持仓详情继续复用 `ForecastPanel`。删除观察股与清空整池均使用项目内 `TrendConfirmDialog`，不调用浏览器原生 `confirm/alert`。

持仓总览「批量预测」调用 `portfolio:forecastNow`（主进程 fire-and-forget）；渲染进程必须订阅 `portfolio.onForecastProgress` 展示进度条与失败原因（含 `AI_NOT_CONFIGURED`）。任务启动成功本身不代表预测成功；今日已全部预测过时主进程仍会推送 `total=0` 事件以便结束 loading。

趋势雷达的 AI 结构复核必须由用户显式点击。行内「AI复核结构」调用主进程 `trend:reviewStructure`，成功后刷新 workbench；复核失败只显示 Toast，不改变本地趋势状态。勾选按 `tsCode` 保存，最多20只，批量入口调用串行的 `trend:reviewStructureBatch` 并展示逐条成功/失败结果。趋势雷达向 `StockKlineChipDrawer` 传入可选的复核 action；未传入时，其他调用方不显示该按钮。

当本地已有**可复用**模型复核（`structureReview` 存在、未 stale、`source==='model'`）时，单条与批量都会先弹出「再次请求大模型？」确认：`是` → IPC `forceModelRefresh: true`（过门闸后强制再调 LLM 并落新 revision）；`否` → `forceModelRefresh: false`（同 hash 复用/bind）；`取消` → 不发起 IPC。批量整批只弹一次（文案含可复用只数 N）；选中集无可复用时不弹窗、直接跑批。仅 gate / stale / 无记录不弹该确认；确定性门闸不足仍不调 LLM，且 `forceModelRefresh` 不能推翻门闸。同一 `requestId`（及批量派生 item key）幂等重放优先，不二次弹窗、不二次调模型。

复核成功且未过期时，行内和 K 线抽屉提供「带着复核去讨论」。Renderer 只调用 `trend:openStructureReviewDiscussion` 提交复核身份；主进程重新校验 `scoreDate/factsHash`，恢复或创建带 `trend_review` 快照的研究讨论，并固定返回趋势雷达。返回状态保存 `dashboard` 子页签、`tsCode` 与 `trend-radar` identity，确保不会落回持仓总览。首条问题只预填，不自动触发 followUp；事实变化后必须先重新复核。趋势雷达抽屉仅保存选中 `tsCode`，每次渲染从最新 workbench snapshot 派生 item，因此过期复核不会继续显示讨论动作。

AI 复核只允许 `agree`、`possible_false_break`、`possible_false_hold`、`evidence_weak`、`need_more_data` 五个第二意见词。每次成功复核写入不可变 revision，列表只展示按代码/评分日的最新 projection；相同事实的成功重放默认不新增 revision，但每个 requestId 都会不可变绑定到代码、评分日、`factsHash` 和原 revision，后续身份冲突必须拒绝。用户显式 `forceModelRefresh` 且过门闸时允许同 hash 新模型 revision（Migration 147 去掉 code-date-hash UNIQUE）。140 迁移保留旧词表原文到 legacy 表，不把旧结论伪装成新词表。AI 复核不修改本地 `trendState`，评分日或白名单事实 `factsHash` 变化时必须显示「需重核」。Workbench DTO 的 `structureReview.source` 由落库 `provider`/`model` 派生（皆空=`gate`，否则=`model`），供 UI 区分 `need_more_data` 来源与可复用预检；不改 revision 不可变语义。

## 边界

- 不接入券商，不计算仓位市值，不产生交易指令。
- 打开页面不自动调用AI或消耗Token。
- 结构复核 force 刷新依赖 Migration 147（去掉同事实 UNIQUE）；无新增 npm 依赖；复用既有趋势、行情、持仓、筹码和信号事实。
- A股涨跌仍使用红涨绿跌，但所有状态同时提供文字、正负号或标签。
