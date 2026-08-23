# StockChart 组件

## 模块功能

`StockChart` 是个股走势图主界面, 负责股票搜索与切换, 日 K / 分时视图, 指数叠加, AI 预测线, SMC 结构叠加, 筹码分布面板、筹码结构摘要、技术因子摘要和单股研判摘要。
FR-200 起, 该组件也承载单股研判处置闭环: 用户从今日看板进入走势图后, 可直接标记来源信号已读、关注、忽略, 打开生命周期抽屉做处置复盘, 或补充持仓成本价后再回到今日看板。
FR-204 起, 组件在单股研判摘要下方展示当前股票近 7/30/90 天历史信号, 帮助用户判断当前线索是否重复触发或长期未收口。
组件还负责持仓池入口展示, 已加入持仓的普通股票会在左侧个股列表中置顶, 便于日常盯盘。
已缓存个股行提供「+观察池」一键加入 `trend_watchlist`（`data-testid=stockchart-add-to-watchlist-*`）；已在观察池/持仓显示「✓池」。已缓存 ≠ 观察池，不会自动同步。
股票搜索支持两条路径: 输入 6 位代码按 Enter 时实时调用 Tushare 拉取单股行情; 输入公司名或模糊关键字时查询本地 `stock_basic_cache` 候选列表。

## 实现思路

组件以 `window.api.datasource` 读取本地行情缓存, 日 K 使用 `lightweight-charts` 渲染蜡烛图和**成交量(手)**柱（成交额仅作 hover 辅信息）。分时图优先使用本地分钟 OHLCV 缓存：个股有 Tushare 分钟权限时经官方 `rt_min` 拉取并落库；无权限或失败时回退东财 `push2his` 1 分钟 OHLCV。三个预置指数自 2026-08-13 起同样接入分钟 OHLCV 链路（指数分时专业版）：后端 `datasource:getStockMinuteKline` 对指数短路（跳过 Tushare `rt_min`，直走东财 `klt=1` 落库），指数与个股默认都渲染 lightweight-charts 蜡烛+VWAP 专业版。传统折线可再回退东财 5 分钟分时。进入分时会等待首轮拉取后再判定空态。日 K 的「今日」若尚无正式日线，由分时/分钟合成；**盘中自动约每 60s（及分钟更新事件）覆盖刷新今日合成 bar**，无需点「更新数据」；收盘后不覆盖带成交额的正式日线。标题区在名称/代码旁展示现价与当日涨跌幅（日 K 用最新日 K；分时用最新分时价相对昨收；红涨绿跌）。MA5/10/20/30/60与BOLL(20,2)直接基于完整日K本地滚动计算，不受技术因子缓存保留期影响；BOLL本地公式与Tushare因子口径一致。BOLL中轨与MA20复用同一条紫色曲线，避免完全重合的灰色线遮盖MA20；MA30 使用独立青色虚线。底部「技术因子」面板经 `shortTerm:getStockFactor` 读 `stk_factor_cache`（Tushare 日频）；**缓存交易日落后于期望日（个股日线最新与市场参考取较新）且已开 Tushare 时自动补拉**，失败则回退旧缓存并仍显示其日期；因子为收盘口径，盘中不必等于「今日」K 线日期。日 K 十字准线通过 `subscribeCrosshairMove` 同步更新鼠标旁的不透明浮动行情卡。
筹码结构摘要通过只读 `chipStructure:getSummaries` 获取。普通最新视图以最后一根日 K 为参考日并显式使用 `latest_complete`, 优先展示最近的 `cyq_perf + cyq_chips + daily_close` 同日完整快照及其真实事实日; 较旧快照标记“历史参考”。点击日 K 蜡烛后固定到该交易日并精确查询, 点击摘要日期可恢复最新视图, 历史查询不跨日回退。缺失、部分或历史快照可由用户点击“补齐最新/补齐该日”, 固定当前单股、结构范围和强制刷新; 页面加载与切换仍只读本地。现有价格级筹码 Canvas 继续使用独立数据路径, 不由结构摘要替代。
左侧列表排序保留预置指数固定顶部, 普通股票区根据 `portfolio:list` 返回的持仓集合分组, 持仓股按 `addedAt` 倒序置顶, 非持仓股保持原有手动排序。
今日看板跳转会通过 Zustand `pendingStockContext` 携带信号快照, `stockDecisionContextModel` 将信号来源、持仓状态、成本价、浮盈亏、预测记录、筹码和技术因子状态整理为顶部研判摘要。普通搜索或左侧列表切换不会复用旧信号上下文。
普通单股生命周期处置继续复用 `decision:markRead/watch/dismiss/resolve/getTimeline`。FR-237 起, 「按股研判」改用单次 `decision:saveJudgment`, 将原始备注和当前证据快照写入独立判断账本, 并由主进程原子更新来源信号兼容投影。持仓成本价编辑复用 `portfolio:updateCostPrice`, 保存后刷新本地持仓集合并请求今日看板回流刷新。
单股历史信号区通过只读 `decision:getHistorySignals({ tsCode })` 查询, 由 `StockSignalHistoryPanel.tsx` 展示。历史信号打开生命周期时使用独立信号状态, 不覆盖顶部当前研判来源上下文。
单股研判摘要默认采用紧凑条布局, 证据清单和详细缺口需用户展开查看。单股历史信号区默认收起, 只保留范围和数量摘要, 避免复盘信息挤压主走势图。
FR-235 起, 从组合空态进入走势图时会显示紧凑的首次持仓任务横幅。持仓加入成功后可补充成本价或直接返回组合; 普通导航进入走势图时不展示该横幅。
FR-261 起, 加股成功（搜索 Enter / 点选候选 / 待跳转 `fetchStock`）后若本地公开基本面为 `missing`，后台 fire-and-forget `stockFundamentals.refresh`；打开基本面抽屉仍为 `missing` 时自动再拉一次并显示「正在获取…」。已有 `partial`/`complete` 不自动刷；失败可手点「获取/刷新」。预置指数不拉基本面。

## 主要 props/state/事件流

- 无外部 props, 通过 Zustand `useAppStore` 读取股票跳转请求, 主题, 预测结果等全局状态。
- `prices`: 当前股票已加载日线窗口, 由 `datasource:getStockPricePage` 分页返回, 包含 `stock_price_cache` 字段以及从 `daily_close_cache` 合并的 `pctChg` 和 `turnoverRate`; 旧全量接口只供其他既有消费者使用。
- `historyRangeSelection/visibleHistoryBars`: 日K当前分段选择与真实可见根数。滚轮形成非30/60/90档位时选择状态为自定义, 标题仍按图表逻辑范围显示真实日数。
- `chartMode`: 控制日线与分时视图切换。
- `legendData`: 日 K 鼠标悬停时展示日期, 开高低收, 涨跌幅, 振幅, 换手率、成交量(手)与可选成交额。
- `legendPosition`: 日 K 浮动行情卡位置, 根据十字准线鼠标坐标计算, 靠近右侧或底部时自动翻转到可视区域内。
- `chipsOpen/factorOpen`: 控制右侧筹码面板与底部技术因子栏展开状态。
- `selectedChipTradeDate`: 记录用户点击日 K 固定的股票代码和精确交易日; 股票不匹配时自动使用当前股票最后一根日 K。
- `chipStructureSummary/chipStructureLoading/chipStructureError`: 当前事实日的本地筹码结构摘要及读取状态; `chipStructureRefreshTask/chipStructureRefreshFeedback` 记录当前单股显式补齐任务和反馈。
- `portfolioSet/portfolioAddedAt`: 缓存持仓股票代码与加入时间, 用于星标展示、当前股票持仓按钮状态和左侧列表置顶排序。
- `portfolioCostMap`: 缓存持仓成本价, 用于单股研判摘要和成本价编辑器。
- `portfolioSaving/portfolioMessage/portfolioError`: 持仓加入或移除的提交锁、成功反馈和失败反馈。只有 IPC 返回 `ok: true` 后才更新本地持仓状态。
- `firstPortfolioJourney`: Zustand 中的会话级首次持仓任务; 加入成功后推进到补成本/返回组合步骤, 返回后由 store 固定组合视图并清理上下文。
- `pendingStockContext`: 今日看板跳转传入的短期研判上下文, 仅当上下文 code 与当前选中股票一致时展示。
- `stockDecisionModel`: 单股研判摘要派生模型, 由信号上下文、行情、持仓、预测、筹码和技术因子共同决定。主按钮「发起 AI 预测」会真正调用当日预测（勾选模型）后再打开预测面板；已有记录时文案为「查看预测记录」，仅打开面板。
- AI 预测（今日/明日）证据包：预测前刷新当日分钟；prompt 含分时量价（分钟 `v`/`a`，东财 5 分钟回退含 `volume`）与盘中量能摘要；Tushare 开启时 ensure 日频技术因子（MACD 等）并标明非秒级；默认提示与 grounding 硬约束禁止假装东财/同花顺实时终端、禁止编造未提供字段。
- `decisionActionSaving/decisionActionMessage/decisionActionError`: 单股页内信号处置的加载、成功和失败反馈。
- `decisionLifecycleOpen`: 控制复用的 `SignalLifecycleDrawer` 是否打开。
- `lifecycleSignalOverride`: 历史信号打开生命周期时使用的临时信号, 用于和当前顶部研判来源隔离。
- `costEditorOpen/costSaving/costError`: 控制成本价编辑弹窗和保存状态。
- `stockHistoryRangeDays/stockHistoryItems/stockHistoryTotal`: 当前股票历史信号区的数据与范围状态。
- 持仓按钮事件流: 点击「+ 持仓」调用 `portfolio:add`, 点击「✓ 持仓」调用 `portfolio:remove`; IPC 成功后才更新按钮状态, 重新调用 `portfolio:list` 刷新排序并请求今日看板刷新。失败时保留原状态并允许重试。
- 搜索事件流: 输入中文名或代码片段时调用 `datasource:searchStock`; 若返回 `empty=true`, 搜索候选浮层提供“立即同步股票基础数据”按钮并调用 `shortTerm.syncDataNow('stockBasic')`; 输入 6 位代码按 Enter 时调用 `datasource:fetchStock` 直接拉取单股行情。`fetchStock` 成功后调用 `prefetchStockFundamentalsIfMissing`（仅 `missing` 时 refresh）。
- 公开基本面抽屉: 打开时先 `stockFundamentals.get`; 若仍 `missing` 则自动 `refresh`；手动「获取/刷新」始终可用。
- 筹码结构事件流: 普通最新视图调用 `chipStructure.getSummaries({ referenceTradeDate, selectionPolicy: 'latest_complete' })`; 日 K `subscribeClick` 将图表日期映射回 `YYYYMMDD` 并精确查询。显式补齐调用 `chipStructure.refresh({ tsCodes, scope: 'structure', force: true })`, 历史模式额外传入 `tradeDate`; 匹配 `taskId` 的完成事件触发摘要重载。点击“打开工作台”切换到短线策略的 `chipMonitor` 子页签。
- FR-191 起, 走势图根容器、图表区域、日线图容器、预测面板按钮、图表模式切换按钮和持仓按钮提供 `data-testid`, 用于真实用户主流程 E2E 验证页面可达性。

## 特殊逻辑备忘

- 指数分时专业版（2026-08-13）：预置指数（`000001.SH` / `399001.SZ` / `399006.SZ`）分钟缓存键强制使用带后缀 tsCode（如 `stock_code='000001.SH'`），与平安银行裸键 `000001` 同表天然隔离；表结构无变化，故无需新增 Migration（`upsertStockMinute` 的 `INSERT OR REPLACE` 对轮询重写幂等）。回滚时旧代码只读写裸键，指数行不影响旧逻辑，会被按日清理自然消化。
- 指数分钟链路后端短路：`datasource:getStockMinuteKline` 命中 `INDEX_SECID` 即判定指数，跳过 Tushare `rt_min`（不支持指数，调用必失败）；当日重拉东财 `klt=1` 供盘中轮询刷新（前端每轮询周期只发 1 次本 IPC，故东财 klt=1 真实速率 1 次/60s，不触发反爬），历史日缓存命中直接返回；东财失败/空时 console.warn 留痕并静默返回既有缓存或空数组。
- 指数盘中刷新是前端 60s 轮询（`startIndexIntradayPolling`），个股是订阅推送（`subscribeStockMinute` + `onStockMinuteUpdated`），两者互斥：指数只轮询不订阅，个股只订阅不轮询；离开分时或切换标的时定时器/订阅统一清理。轮询/首拉均经 `loadMinuteKlineOnce` 单次拉取：每周期只调 1 次 `getStockMinuteKline`，折线 items 与蜡烛 ohlcv 由同一响应派生；同代码 in-flight 请求去重，进入分时的 toggle handler 与 effect 双路并发合并为 1 次 IPC。
- 分时蜡烛数据写入均为无条件覆盖 `setIntradayOHLCV`，退出分时同步清空；渲染三分叉以 `intradayOHLCV.length > 0` 优先，清空/读空即正确回落折线或空态，避免旧标的蜡烛残留。
- 分时三级降级（指数与个股对齐）：① 分钟链路（DB + 东财 `klt=1`）有数据 → 专业蜡烛（或用户偏好折线）；② 分钟链路空 → 东财 5 分钟折线（`getIntradayData`，不持久化）；③ 皆空 → 空态文案「当日暂无分时数据」。首拉 await 后再判空态，不出现一直转圈。
- 分时样式切换按钮（`data-testid=intraday-style-toggle-btn`）对指数同样显示；`intradayStyle` 为 localStorage 全局单键，是用户展示偏好而非数据属性，指数与个股共用、不按标的拆分。
- `toTsCodeForMinute`（仅分钟链路使用）对已含 `.` 的指数代码原样透传；chips/factor 链路的 `toTsCodeWithSuffix` 保持「含点返回空串跳过」不变。
- `stock_price_cache.amount` 单位为千元, 前端展示时通过 `formatAmount` 转为千万/亿。
- 换手率不在 `stock_price_cache`, 由后端 `datasource:getStockPrices` 按 `tradeDate` 和 6 位代码从 `daily_close_cache.turnover_rate` 合并返回。
- 日 K 涨跌幅优先使用 `daily_close_cache.pct_chg`; 若缺失, 前端按前一交易日收盘价兜底估算。
- 指数或缓存缺失场景下换手率可为空, UI 显示为 `--`。
- 预置指数不展示也不查询筹码结构摘要。摘要读取严格 DB-first, 只有用户点击“补齐最新/补齐该日”才通过既有同步通道访问已配置的 Tushare。
- 日 K hover 只更新行情卡, 不改变筹码事实日; 只有点击蜡烛才固定日期, 避免浏览行情时频繁切换摘要。
- 拖拽排序只改变 `regularStocks` 的基础顺序; 持仓置顶是渲染时派生排序。拖拽持仓股或拖到持仓股位置时不会改写基础排序, 避免和置顶规则冲突。
- 全新用户的 `stock_basic_cache` 为空时, 公司名搜索不会有候选项; 组件会在空缓存状态提供就地同步入口, 避免用户必须跳转到短线策略页初始化基础数据。
- 分时预测下拉和左侧清理操作使用彩色 hover 背景时, 文案颜色保持同色系深色或暗色主题高亮色, 避免浅色状态块上出现低对比度灰字。
- `data-testid` 只用于测试定位, 不参与业务逻辑。若后续重构预测按钮、持仓入口或图表容器, 需同步维护 `tests/e2e/user-journey.spec.ts`。
- 单股研判摘要不直接给出买卖结论, 只解释进入当前股票的线索、证据状态和待补充缺口。若未来接入更多后端证据, 优先在 `stockDecisionContextModel.ts` 汇总, 避免把业务判断散落在 JSX 中。
- 单股页普通生命周期动作只更新来源信号; 「按股研判」创建不可变判断版本并原子投影来源信号。两类动作或成本价更新后都通过 `requestDecisionCenterRefresh` 通知今日看板刷新, 保持行动队列与摘要一致。
- 单股历史信号区是只读历史视图。历史项可打开生命周期继续复盘, 但不会把该历史项写入 `pendingStockContext`, 避免当前研判摘要跳到旧信号。
- 走势图是该页主工作区。新增复盘信息默认必须保持紧凑或折叠, 不能以固定大卡片长期占用图表高度。
- 首次持仓任务仅由组合空态主 CTA 启动, 不持久化。加入持仓 IPC 失败时不得推进任务; 用户退出任务只清理任务上下文, 不改变已写入的持仓事实。
- 公开基本面自动补齐与加股联网同意图，不扫全市场、不定时狂刷已有事实；服务层 `refresh` 单飞去重。

## 日K渐进历史

- 完整走势图通过 `datasource:getStockPricePage` 首次读取最近149根日K, 默认只展示最后30根; 其中90根覆盖最大预设视窗，前置59根保证90日窗口左边界已有MA60值。
- 标题使用“当前N日 · 已加载M日”区分画布范围和内存范围。30日、60日和90日分段只调整同一图表实例的逻辑视窗; “全部”按既有分页循环读取到本地历史结束, 不触发行情同步。
- `timeScale` 接近已加载数据左边界时按120根一批读取更早本地记录。分页请求按股票单飞, 交易日去重合并, 前插完成后平移逻辑范围以保持用户正在查看的K线位置。
- 每只股票和三个预置指数分别缓存已加载区间。切回已查看股票不重复读取; 股票扩展历史时, 已启用的指数叠加按相同批次并行补齐。
- 指数百分比叠加以最近30日首个交易日作为稳定基准, 加载更早历史不会让已有曲线整体跳变。
- 日K chart实例只在日线/分时、主题或绝对价/百分比模式变化时重建; 切股、补页、MA和BOLL通过既有series更新。MA/BOLL重算只消费已加载本地日K，浏览历史不触发联网。
