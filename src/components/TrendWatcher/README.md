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
- `trend:getWorkbench` 还会附加按 `scoreDate + factsHash` 校验的 `structureReview`；AI 徽章只表示第二意见，不覆盖本地 `trendState`，事实变化时显示「需重核」。

评分 V2 使用归一化七维权重。个股和沪深300都使用20交易日收益；最大回撤遵守先峰值后谷值；缺失维度保持 `null`，有效权重不足70%时综合分保持 `null`。实时价格不会把日终评分错误标记为实时评分。

## 恢复与交互

观察池添加股票后调用 `trend:backfillStocks` 检查并补齐候选日线。任务在主进程执行，切换页面不取消；未配置Tushare或上游失败时保留观察股，并在页面提供可重试结果。全市场同步只保留为紧凑的数据维护入口，单个进度条占满整行。观察池列表另提供独立的分类/细分赛道筛选，不与新增股票表单中的分类字段混用；两个选项菜单限制为18rem并在内部滚动，长列表不得带动页面滚动。

趋势雷达、趋势事件和观察池股票行复用 `StockKlineChipDrawer`；持仓详情继续复用 `ForecastPanel`。删除观察股使用项目内 `TrendConfirmDialog`，不调用浏览器原生 `confirm/alert`。

趋势雷达的 AI 结构复核必须由用户显式点击。行内「AI复核结构」调用主进程 `trend:reviewStructure`，成功后刷新 workbench；复核失败只显示 Toast，不改变本地趋势状态。勾选按 `tsCode` 保存，最多20只，批量入口调用串行的 `trend:reviewStructureBatch` 并展示逐条成功/失败结果。趋势雷达向 `StockKlineChipDrawer` 传入可选的复核 action；未传入时，其他调用方不显示该按钮。

复核成功且未过期时，行内和 K 线抽屉提供「带着复核去讨论」。Renderer 只调用 `trend:openStructureReviewDiscussion` 提交复核身份；主进程重新校验 `scoreDate/factsHash`，恢复或创建带 `trend_review` 快照的研究讨论，并固定返回趋势雷达。返回状态保存 `dashboard` 子页签、`tsCode` 与 `trend-radar` identity，确保不会落回持仓总览。首条问题只预填，不自动触发 followUp；事实变化后必须先重新复核。趋势雷达抽屉仅保存选中 `tsCode`，每次渲染从最新 workbench snapshot 派生 item，因此过期复核不会继续显示讨论动作。

AI 复核只允许 `agree`、`possible_false_break`、`possible_false_hold`、`evidence_weak`、`need_more_data` 五个第二意见词。每次成功复核写入不可变 revision，列表只展示按代码/评分日的最新 projection；140 迁移保留旧词表原文到 legacy 表，不把旧结论伪装成新词表。AI 复核不修改本地 `trendState`，评分日或白名单事实 `factsHash` 变化时必须显示「需重核」。

## 边界

- 不接入券商，不计算仓位市值，不产生交易指令。
- 打开页面不自动调用AI或消耗Token。
- 无Migration和新增npm依赖；复用既有趋势、行情、持仓、筹码和信号事实。
- A股涨跌仍使用红涨绿跌，但所有状态同时提供文字、正负号或标签。
