import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { StockKlineChipDrawer } from '../shared/StockMiniChart'
import { useAppStore } from '../../store/appStore'
import {
  OptionMenu,
  TrendPageHeader,
  TrendStateBadge,
  WorkbenchError,
  formatTrendDate,
} from './TrendWorkbenchUi'
import { TrendConfirmDialog } from './TrendConfirmDialog'
import {
  buildWatchlistEntryFromCodes,
  isSyntheticWatchlistName,
  syntheticCandidateForSixDigit,
} from './trendWatchlistAddResolve'
import type { TrendWorkbenchItem, TrendWorkbenchPageProps } from './trendWorkbenchTypes'

interface WatchItem {
  tsCode: string
  stockName: string
  groupTag: string
  addedAt: number
  category: string
  subCategory: string
  notes: string
}

interface SearchResult {
  tsCode: string
  name: string
}

interface ProgressState {
  current: number
  total: number
  detail: string
}

interface CategoryMapRuleRow {
  id: number
  keyword: string
  matchField: 'industry' | 'concept' | 'name'
  category: string
  subCategory: string
  priority: number
  enabled: boolean
}

interface CategoryTreeNodeRow {
  id: number
  category: string
  subCategory: string
  sortOrder: number
  enabled: boolean
}

interface WebPendingSuggestion {
  label: string
  suggestedCategory: string
  suggestedSubCategory: string
}

export function TrendManager({ snapshot, loading, errorMessage, onRefresh }: TrendWorkbenchPageProps) {
  const [watchRows, setWatchRows] = useState<WatchItem[]>([])
  const [listLoading, setListLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [selectedStocks, setSelectedStocks] = useState<Map<string, SearchResult>>(new Map())
  const [showSearchResults, setShowSearchResults] = useState(false)
  const [inputGroup, setInputGroup] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('')
  const [selectedSubCategory, setSelectedSubCategory] = useState('')
  const [listCategory, setListCategory] = useState('')
  const [listSubCategory, setListSubCategory] = useState('')
  const [adding, setAdding] = useState(false)
  const [actionMessage, setActionMessage] = useState<{ tone: 'info' | 'error' | 'success'; text: string } | null>(null)
  const [syncMessage, setSyncMessage] = useState<{ tone: 'error' | 'info'; text: string } | null>(null)
  const [stockBasicEmpty, setStockBasicEmpty] = useState(false)
  const [resolvingCode, setResolvingCode] = useState(false)
  const [editingGroupCode, setEditingGroupCode] = useState<string | null>(null)
  const [editingGroupValue, setEditingGroupValue] = useState('')
  const [removeTarget, setRemoveTarget] = useState<TrendWorkbenchItem | null>(null)
  const [removing, setRemoving] = useState(false)
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [categoryTouched, setCategoryTouched] = useState(false)
  const [categoryHint, setCategoryHint] = useState<string | null>(null)
  const [categorySuggesting, setCategorySuggesting] = useState(false)
  const [categoryTree, setCategoryTree] = useState<Record<string, string[]>>({})
  const [categoryNodes, setCategoryNodes] = useState<CategoryTreeNodeRow[]>([])
  const [maintainOpen, setMaintainOpen] = useState(false)
  const [maintainTab, setMaintainTab] = useState<'rules' | 'tree'>('rules')
  const [mapRules, setMapRules] = useState<CategoryMapRuleRow[]>([])
  const [mapRulesLoading, setMapRulesLoading] = useState(false)
  const [mapRuleDraft, setMapRuleDraft] = useState({
    keyword: '',
    matchField: 'concept' as 'industry' | 'concept' | 'name',
    category: '',
    subCategory: '',
    priority: 80,
  })
  const [mapRuleMessage, setMapRuleMessage] = useState<string | null>(null)
  const [treeDraft, setTreeDraft] = useState({ category: '', subCategory: '' })
  const [treeMessage, setTreeMessage] = useState<string | null>(null)
  const [treeDeleteTarget, setTreeDeleteTarget] = useState<{
    category: string
    subCategory: string
    refs?: { inUseWatchlist: number; inUseRules: number }
  } | null>(null)
  const [treeDeleting, setTreeDeleting] = useState(false)
  const [renameDraft, setRenameDraft] = useState<{
    fromCategory: string
    fromSubCategory: string
    toCategory: string
    toSubCategory: string
  } | null>(null)
  const [webSuggesting, setWebSuggesting] = useState(false)
  const [webPending, setWebPending] = useState<WebPendingSuggestion[]>([])
  const [webConfirmOpen, setWebConfirmOpen] = useState(false)
  const [selectedDetail, setSelectedDetail] = useState<TrendWorkbenchItem | null>(null)
  const [backfillRunning, setBackfillRunning] = useState(false)
  const [backfillProgress, setBackfillProgress] = useState<ProgressState | null>(null)
  const [syncRunning, setSyncRunning] = useState(false)
  const [syncProgress, setSyncProgress] = useState<ProgressState | null>(null)
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchRootRef = useRef<HTMLDivElement>(null)
  const suggestSeqRef = useRef(0)
  const navigateToStock = useAppStore((state) => state.navigateToStock)

  const loadWatchRows = useCallback(async () => {
    setListLoading(true)
    try {
      const response = await window.api.trend.getWatchList()
      if (response.ok && response.data) setWatchRows(response.data as WatchItem[])
    } finally {
      setListLoading(false)
    }
  }, [])

  const loadMapRules = useCallback(async () => {
    setMapRulesLoading(true)
    try {
      const response = await window.api.trend.listCategoryMapRules()
      if (response.ok && response.data) setMapRules(response.data)
    } finally {
      setMapRulesLoading(false)
    }
  }, [])

  const loadCategoryTree = useCallback(async () => {
    const response = await window.api.trend.listCategoryTree()
    if (response.ok && response.data) {
      setCategoryTree(response.data.tree ?? {})
      setCategoryNodes(response.data.nodes ?? [])
    }
  }, [])

  useEffect(() => { void loadWatchRows() }, [loadWatchRows])
  useEffect(() => { void loadCategoryTree() }, [loadCategoryTree])
  useEffect(() => {
    if (maintainOpen && maintainTab === 'rules') void loadMapRules()
  }, [maintainOpen, maintainTab, loadMapRules])
  useEffect(() => {
    if (maintainOpen && maintainTab === 'tree') void loadCategoryTree()
  }, [maintainOpen, maintainTab, loadCategoryTree])

  useEffect(() => {
    const closeSearch = (event: MouseEvent) => {
      if (!searchRootRef.current?.contains(event.target as Node)) setShowSearchResults(false)
    }
    document.addEventListener('mousedown', closeSearch)
    return () => document.removeEventListener('mousedown', closeSearch)
  }, [])

  useEffect(() => {
    const offBackfillProgress = window.api.trend.onBackfillProgress((progress) => {
      setBackfillRunning(true)
      setBackfillProgress({ current: progress.current, total: progress.total, detail: `${stripCode(progress.tsCode)} · ${backfillStatusLabel(progress.status)}` })
    })
    const offBackfillDone = window.api.trend.onBackfillDone((result) => {
      setBackfillRunning(false)
      setBackfillProgress({ current: result.requested, total: result.requested, detail: `补齐 ${result.synced}，复用 ${result.skipped}，失败 ${result.failed}` })
      void loadWatchRows()
      onRefresh()
    })
    const offSyncProgress = window.api.trend.onSyncProgress((progress) => {
      setSyncRunning(true)
      setSyncProgress({ current: progress.current, total: progress.total, detail: formatTrendDate(progress.tradeDate) })
    })
    const offSyncDone = window.api.trend.onSyncDone((result) => {
      setSyncRunning(false)
      setSyncProgress({ current: result.synced + result.skipped + result.failed, total: result.synced + result.skipped + result.failed, detail: `同步 ${result.synced}，跳过 ${result.skipped}，失败 ${result.failed}` })
      onRefresh()
    })
    return () => {
      offBackfillProgress()
      offBackfillDone()
      offSyncProgress()
      offSyncDone()
    }
  }, [loadWatchRows, onRefresh])

  useEffect(() => () => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
  }, [])

  const allItems = useMemo(() => {
    const watchCodes = new Set(watchRows.map((row) => normalizeCode(row.tsCode)))
    return [...(snapshot?.items ?? [])]
      .filter((item) => watchCodes.has(normalizeCode(item.tsCode)))
      .sort((left, right) => {
        const coverageOrder = coveragePriority(left) - coveragePriority(right)
        if (coverageOrder !== 0) return coverageOrder
        return left.stockCode.localeCompare(right.stockCode)
      })
  }, [snapshot?.items, watchRows])

  const items = useMemo(() => {
    if (!listCategory && !listSubCategory) return allItems
    const visibleCodes = new Set(
      watchRows
        .filter((row) => (!listCategory || row.category === listCategory)
          && (!listSubCategory || row.subCategory === listSubCategory))
        .map((row) => normalizeCode(row.tsCode)),
    )
    return allItems.filter((item) => visibleCodes.has(normalizeCode(item.tsCode)))
  }, [allItems, listCategory, listSubCategory, watchRows])

  const missingCodes = useMemo(() => allItems.filter((item) => item.dataCoverage.state !== 'ready').map((item) => item.tsCode), [allItems])
  const categoryOptions = useMemo(() => [
    { value: '', label: '暂不分类' },
    ...Object.keys(categoryTree).map((value) => ({ value, label: value })),
  ], [categoryTree])
  const subCategoryOptions = useMemo(() => [
    { value: '', label: selectedCategory ? '暂不选择赛道' : '请先选择分类' },
    ...(categoryTree[selectedCategory] ?? []).map((value) => ({ value, label: value })),
  ], [categoryTree, selectedCategory])
  const listCategoryOptions = useMemo(() => buildFilterOptions(
    watchRows,
    'category',
    `全部分类 (${allItems.length})`,
  ), [allItems.length, watchRows])
  const listSubCategoryOptions = useMemo(() => buildFilterOptions(
    listCategory ? watchRows.filter((row) => row.category === listCategory) : watchRows,
    'subCategory',
    listCategory ? '全部细分赛道' : '全部赛道',
  ), [listCategory, watchRows])

  const handleSearch = (value: string) => {
    setSearchQuery(value)
    setActionMessage(null)
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    if (!value.trim()) {
      setSearchResults([])
      setStockBasicEmpty(false)
      setShowSearchResults(false)
      return
    }
    searchTimerRef.current = setTimeout(async () => {
      setSearchLoading(true)
      try {
        const trimmed = value.trim()
        const response = await window.api.datasource.searchStock(trimmed)
        if (!response.ok) {
          setActionMessage({ tone: 'error', text: '股票搜索失败' })
          return
        }
        setStockBasicEmpty(response.empty)
        let results: SearchResult[] = response.results.map((row) => ({
          tsCode: row.tsCode,
          name: row.name,
        }))
        // 仅在公开轻量查名也失败时，才用「代码 xxxxxx」占位
        if (results.length === 0) {
          const synthetic = syntheticCandidateForSixDigit(trimmed)
          if (synthetic) results = [synthetic]
        }
        setSearchResults(results)
        setShowSearchResults(true)
      } finally {
        setSearchLoading(false)
      }
    }, 240)
  }

  const applyCategorySuggestion = useCallback(async (stocks: Map<string, SearchResult>, force = false) => {
    if (!force && categoryTouched) return
    const first = stocks.values().next().value as SearchResult | undefined
    if (!first) {
      if (force || !categoryTouched) {
        setSelectedCategory('')
        setSelectedSubCategory('')
        setCategoryHint(null)
      }
      return
    }
    const seq = ++suggestSeqRef.current
    setCategorySuggesting(true)
    setCategoryHint(force ? '正在重新识别分类…' : '正在识别分类…')
    try {
      const response = await window.api.trend.suggestWatchlistCategory(first.tsCode)
      if (seq !== suggestSeqRef.current) return
      if (!force && categoryTouched) return
      const multi = stocks.size > 1 ? '（批量共用首只建议，可改）' : ''
      if (!response.ok || !response.data) {
        setSelectedCategory('')
        setSelectedSubCategory('')
        setCategoryHint(`分类识别失败，可手选赛道${multi}`)
        if (force) setCategoryTouched(false)
        return
      }
      const data = response.data
      if (!data.category) {
        setSelectedCategory('')
        setSelectedSubCategory('')
        setCategoryTouched(false)
        if (data.eastmoneyIndustry) {
          setCategoryHint(`东财行业：${data.eastmoneyIndustry} → 未命中规则，可手选或在下方维护映射${multi}`)
        } else {
          setCategoryHint(`未识别到分类，可手选赛道${multi}`)
        }
        return
      }
      setSelectedCategory(data.category)
      setSelectedSubCategory(data.subCategory ?? '')
      setCategoryTouched(false)
      const sourceLabel = data.source === 'watchlist'
        ? '沿用池内登记'
        : data.source === 'eastmoney-map'
          ? `东财映射${data.matchedKeyword ? `（${data.matchedKeyword}）` : ''}`
          : '建议'
      setCategoryHint(`已自动填写：${data.category} / ${data.subCategory || '未设赛道'} · ${sourceLabel}${multi}`)
    } finally {
      if (seq === suggestSeqRef.current) setCategorySuggesting(false)
    }
  }, [categoryTouched])

  const runWebCategorySuggest = useCallback(async () => {
    const first = selectedStocks.values().next().value as SearchResult | undefined
    if (!first) return
    setWebSuggesting(true)
    setCategoryHint('正在联网补充分类…')
    try {
      const response = await window.api.trend.webSuggestWatchlistCategory({
        tsCode: first.tsCode,
        name: first.name,
      })
      if (!response.ok || !response.data) {
        setCategoryHint(response.message ?? '联网补充失败，可手选或重试')
        setWebPending([])
        return
      }
      const data = response.data
      setWebPending(data.pending ?? [])
      if (data.pair?.category) {
        setSelectedCategory(data.pair.category)
        setSelectedSubCategory(data.pair.subCategory ?? '')
        setCategoryTouched(false)
        setCategoryHint(
          `已自动填写：${data.pair.category} / ${data.pair.subCategory || '未设赛道'} · 联网补充${data.pair.matchedKeyword ? `（${data.pair.matchedKeyword}）` : ''}`,
        )
      } else if ((data.pending ?? []).length > 0) {
        setCategoryHint('联网未直接命中主题树，可从下方待采用建议写入')
      } else {
        setCategoryHint('联网未找到可用分类建议，可手选或维护映射规则')
      }
    } finally {
      setWebSuggesting(false)
      setWebConfirmOpen(false)
    }
  }, [selectedStocks])

  const adoptPendingSuggestion = useCallback(async (item: WebPendingSuggestion) => {
    const response = await window.api.trend.adoptWebCategorySuggestion({
      category: item.suggestedCategory,
      subCategory: item.suggestedSubCategory,
      createMapRule: true,
      keyword: item.label,
    })
    if (!response.ok || !response.data) {
      setCategoryHint(response.message ?? '采用建议失败')
      return
    }
    await loadCategoryTree()
    setSelectedCategory(response.data.category)
    setSelectedSubCategory(response.data.subCategory)
    setCategoryTouched(false)
    setCategoryHint(`已采用到主题树：${response.data.category} / ${response.data.subCategory || '未设赛道'}`)
    setWebPending((current) => current.filter((row) => row.label !== item.label))
  }, [loadCategoryTree])

  const toggleSearchResult = (result: SearchResult) => {
    setSelectedStocks((current) => {
      const next = new Map(current)
      if (next.has(result.tsCode)) {
        next.delete(result.tsCode)
        queueMicrotask(() => { void applyCategorySuggestion(next) })
        return next
      }
      next.set(result.tsCode, result)
      queueMicrotask(() => { void applyCategorySuggestion(next) })
      return next
    })
    if (isSyntheticWatchlistName(result.name)) {
      void resolveNameForSelected(result)
    }
  }

  /** 合成候选仅有代码占位名时，走轻量报价补全真名（不拉日线） */
  const resolveNameForSelected = async (result: SearchResult) => {
    const six = result.tsCode.replace(/\.(SH|SZ|BJ)$/i, '')
    if (!/^\d{6}$/.test(six) || resolvingCode) return
    setResolvingCode(true)
    setActionMessage(null)
    try {
      const resolved = await window.api.datasource.resolveStockName(six)
      if (!resolved.ok) {
        setActionMessage({
          tone: 'info',
          text: `${resolved.message}；已选中代码 ${six}，仍可先加入观察池，名称稍后补齐`,
        })
        return
      }
      const entry = buildWatchlistEntryFromCodes(resolved.stockCode, resolved.stockName)
      if (!entry) return
      setSelectedStocks((current) => {
        if (!current.has(result.tsCode) && !current.has(entry.tsCode)) return current
        const next = new Map(current)
        next.delete(result.tsCode)
        next.set(entry.tsCode, entry)
        queueMicrotask(() => { void applyCategorySuggestion(next) })
        return next
      })
      setSearchResults((rows) =>
        rows.map((row) => (row.tsCode === result.tsCode || row.tsCode === entry.tsCode ? entry : row)),
      )
      setSearchQuery(entry.name)
    } finally {
      setResolvingCode(false)
    }
  }

  const runBackfill = useCallback(async (codes: string[]) => {
    if (codes.length === 0 || backfillRunning) return
    setBackfillRunning(true)
    setBackfillProgress({ current: 0, total: codes.length, detail: '准备请求日线数据' })
    const response = await window.api.trend.backfillStocks(codes)
    if (!response.ok) {
      setBackfillRunning(false)
      setActionMessage({ tone: 'error', text: response.message ?? response.error ?? '日线补齐失败，可稍后重试' })
      return
    }
    const result = response.data
    if (result) {
      setBackfillProgress({ current: result.requested, total: result.requested, detail: `补齐 ${result.synced}，复用 ${result.skipped}，失败 ${result.failed}` })
      setActionMessage({ tone: result.failed > 0 ? 'info' : 'success', text: `日线补齐完成：${result.synced}只更新，${result.skipped}只已具备数据，${result.failed}只未完成` })
    }
    setBackfillRunning(false)
    void loadWatchRows()
    onRefresh()
  }, [backfillRunning, loadWatchRows, onRefresh])

  const handleAdd = async (override?: SearchResult[]) => {
    const stocks = override ?? [...selectedStocks.values()]
    if (stocks.length === 0) {
      setActionMessage({ tone: 'error', text: '请至少选择一只股票，或输入六位代码后回车' })
      return
    }
    setAdding(true)
    try {
      const response = await window.api.trend.addStocks(stocks.map((stock) => ({
        tsCode: stock.tsCode,
        stockName: stock.name.startsWith('代码 ') ? stock.tsCode.replace(/\.(SH|SZ|BJ)$/i, '') : stock.name,
        groupTag: inputGroup.trim() || '自定义',
        category: selectedCategory,
        subCategory: selectedSubCategory,
      })))
      if (!response.ok) {
        setActionMessage({ tone: 'error', text: response.message ?? response.error ?? '添加失败' })
        return
      }
      setActionMessage({
        tone: 'success',
        text: `已将 ${stocks.length} 只股票加入观察池。需要日线时再点「补齐缺口」或行内「补齐」`,
      })
      setSelectedStocks(new Map())
      setSearchQuery('')
      setSearchResults([])
      setShowSearchResults(false)
      setStockBasicEmpty(false)
      await loadWatchRows()
      onRefresh()
    } finally {
      setAdding(false)
    }
  }

  const resolveSixDigitAndAdd = async (raw: string) => {
    const six = raw.trim()
    if (!/^\d{6}$/.test(six) || resolvingCode || adding) return
    setResolvingCode(true)
    setActionMessage(null)
    setShowSearchResults(false)
    try {
      const resolved = await window.api.datasource.resolveStockName(six)
      if (!resolved.ok) {
        setActionMessage({
          tone: 'error',
          text: `${resolved.message}（公开轻量查名；可稍后重试，不必先配置 Tushare）`,
        })
        return
      }
      const entry = buildWatchlistEntryFromCodes(resolved.stockCode, resolved.stockName)
      if (!entry) {
        setActionMessage({ tone: 'error', text: '股票代码无效' })
        return
      }
      let category = selectedCategory
      let subCategory = selectedSubCategory
      if (!categoryTouched) {
        const suggested = await window.api.trend.suggestWatchlistCategory(entry.tsCode)
        if (suggested.ok && suggested.data?.category) {
          category = suggested.data.category
          subCategory = suggested.data.subCategory ?? ''
          setSelectedCategory(category)
          setSelectedSubCategory(subCategory)
          setCategoryTouched(false)
          const sourceLabel = suggested.data.source === 'watchlist'
            ? '沿用池内登记'
            : suggested.data.source === 'eastmoney-map'
              ? `东财映射${suggested.data.matchedKeyword ? `（${suggested.data.matchedKeyword}）` : ''}`
              : '建议'
          setCategoryHint(`已自动填写：${category} / ${subCategory || '未设赛道'} · ${sourceLabel}`)
        } else if (suggested.ok && suggested.data?.eastmoneyIndustry) {
          setCategoryHint(`东财行业：${suggested.data.eastmoneyIndustry} → 未命中规则，可手选`)
        }
      }
      setAdding(true)
      try {
        const response = await window.api.trend.addStocks([{
          tsCode: entry.tsCode,
          stockName: entry.name,
          groupTag: inputGroup.trim() || '自定义',
          category,
          subCategory,
        }])
        if (!response.ok) {
          setActionMessage({ tone: 'error', text: response.message ?? response.error ?? '添加失败' })
          return
        }
        setActionMessage({
          tone: 'success',
          text: `已将 ${entry.name}（${entry.tsCode}）加入观察池。需要日线时再点「补齐缺口」或行内「补齐」`,
        })
        setSelectedStocks(new Map())
        setSearchQuery('')
        setSearchResults([])
        setShowSearchResults(false)
        setStockBasicEmpty(false)
        await loadWatchRows()
        onRefresh()
      } finally {
        setAdding(false)
      }
    } finally {
      setResolvingCode(false)
    }
  }

  const saveGroup = async (tsCode: string) => {
    if (editingGroupCode !== tsCode) return
    const value = editingGroupValue.trim()
    setEditingGroupCode(null)
    const response = await window.api.trend.updateGroupTag(tsCode, value)
    if (!response.ok) setActionMessage({ tone: 'error', text: response.error ?? '分组更新失败' })
    else {
      setActionMessage({ tone: 'success', text: `${stripCode(tsCode)} 的分组已更新` })
      await loadWatchRows()
      onRefresh()
    }
  }

  const confirmRemove = async () => {
    if (!removeTarget || removing) return
    setRemoving(true)
    const response = await window.api.trend.removeStock({ tsCode: removeTarget.tsCode })
    if (!response.ok) {
      setActionMessage({ tone: 'error', text: response.error ?? '移除失败' })
      setRemoving(false)
      return
    }
    setActionMessage({ tone: 'success', text: `${removeTarget.stockName}已移出观察池` })
    setRemoveTarget(null)
    setRemoving(false)
    await loadWatchRows()
    onRefresh()
  }

  const confirmClearAll = async () => {
    if (clearing || watchRows.length === 0) return
    setClearing(true)
    try {
      const response = await window.api.trend.clearWatchlist()
      if (!response.ok) {
        setActionMessage({ tone: 'error', text: response.message ?? response.error ?? '清空失败' })
        return
      }
      setActionMessage({
        tone: 'success',
        text: `已清空观察池：${response.removedStocks ?? 0} 只股票（${response.removedRows ?? 0} 条登记）`,
      })
      setClearConfirmOpen(false)
      await loadWatchRows()
      onRefresh()
    } finally {
      setClearing(false)
    }
  }

  const handleFullSync = async () => {
    if (syncRunning) return
    setSyncRunning(true)
    setSyncMessage(null)
    setSyncProgress({ current: 0, total: 90, detail: '准备同步最近90个交易日' })
    const response = await window.api.trend.syncNow(90)
    if (!response.ok) {
      setSyncRunning(false)
      setSyncMessage({ tone: 'error', text: localizeSyncError(response.error, response.message) })
    }
  }

  return (
    <div data-testid="trend-watchlist" className="flex h-full min-h-0 flex-col overflow-y-auto">
      <TrendPageHeader
        title="观察池"
        subtitle="维护需要长期跟踪的股票、赛道和本地日线覆盖"
        loading={loading || listLoading}
        onRefresh={() => { void loadWatchRows(); onRefresh() }}
        meta={<span className="text-xs tabular-nums text-slate-500 dark:text-slate-400">{allItems.length}只 · {missingCodes.length}只待补数据</span>}
        actions={(
          <>
            <button
              type="button"
              data-testid="trend-watchlist-clear-all"
              disabled={watchRows.length === 0 || clearing || backfillRunning}
              onClick={() => setClearConfirmOpen(true)}
              className="min-h-11 rounded-md border border-rose-200 bg-rose-50 px-3 text-sm font-semibold text-rose-700 transition-colors hover:bg-rose-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 disabled:cursor-not-allowed disabled:opacity-40 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300 dark:hover:bg-rose-950/70"
            >
              清空观察池
            </button>
            {missingCodes.length > 0 && (
              <button type="button" disabled={backfillRunning} onClick={() => void runBackfill(missingCodes)} className="min-h-11 rounded-md bg-cyan-700 px-3 text-sm font-semibold text-white hover:bg-cyan-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 disabled:cursor-wait disabled:opacity-50 dark:bg-cyan-600 dark:hover:bg-cyan-500">{backfillRunning ? '补齐进行中' : `补齐缺口 ${missingCodes.length}`}</button>
            )}
          </>
        )}
      />

      {errorMessage && <WorkbenchError message={errorMessage} onRetry={onRefresh} />}

      <section className="border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-950 sm:px-5" aria-labelledby="trend-add-title">
        <div className="flex flex-wrap items-end gap-2">
          <div ref={searchRootRef} className="relative min-w-[260px] flex-1">
            <label id="trend-add-title" className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">搜索并批量选择股票</label>
            <div className="flex min-h-11 items-center rounded-md border border-slate-300 bg-white px-3 focus-within:border-cyan-500 focus-within:ring-2 focus-within:ring-cyan-500/20 dark:border-slate-700 dark:bg-slate-900">
              <input
                data-testid="trend-watchlist-search"
                value={searchQuery}
                onChange={(event) => handleSearch(event.target.value)}
                onFocus={() => (searchResults.length > 0 || stockBasicEmpty) && setShowSearchResults(true)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    void resolveSixDigitAndAdd(searchQuery)
                  }
                  if (event.key === 'Escape') setShowSearchResults(false)
                }}
                placeholder="输入名称或六位代码（回车加入）"
                className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-slate-100"
              />
              {(searchLoading || resolvingCode) && <span className="shrink-0 text-[11px] text-slate-400">{resolvingCode ? '解析名称中' : '搜索中'}</span>}
              {selectedStocks.size > 0 && <span className="ml-2 shrink-0 rounded bg-cyan-50 px-2 py-1 text-[11px] font-medium text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300">已选 {selectedStocks.size}</span>}
            </div>
            {selectedStocks.size > 0 && (
              <div data-testid="trend-watchlist-selected" className="mt-1.5 flex flex-wrap gap-1.5">
                {[...selectedStocks.values()].map((stock) => (
                  <button
                    key={stock.tsCode}
                    type="button"
                    onClick={() => toggleSearchResult(stock)}
                    className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-cyan-200 bg-cyan-50 px-2 py-1 text-[11px] text-cyan-900 hover:border-rose-300 hover:bg-rose-50 dark:border-cyan-900 dark:bg-cyan-950/40 dark:text-cyan-100"
                    title="点击取消选择"
                  >
                    <span className="truncate font-medium">{isSyntheticWatchlistName(stock.name) ? '名称解析中…' : stock.name}</span>
                    <span className="shrink-0 font-mono text-cyan-700/80 dark:text-cyan-300/80">{stripCode(stock.tsCode)}</span>
                  </button>
                ))}
              </div>
            )}
            {showSearchResults && (
              <div role="listbox" aria-multiselectable="true" aria-label="股票搜索结果" className="absolute left-0 right-0 z-40 mt-1 max-h-64 overflow-y-auto rounded-md border border-slate-200 bg-white py-1 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                {stockBasicEmpty && (
                  <div data-testid="trend-watchlist-stock-basic-empty" className="border-b border-slate-100 px-3 py-2 text-[11px] leading-relaxed text-slate-500 dark:border-slate-800 dark:text-slate-400">
                    尚未同步股票基础数据，名称搜索暂不可用。可直接输入六位代码后回车加入（走公开行情链路，不必先配 Tushare）。
                  </div>
                )}
                {searchResults.length === 0 ? (
                  <div className="px-3 py-4 text-center text-xs text-slate-400">
                    {stockBasicEmpty ? '输入六位代码后按回车加入' : '没有匹配股票'}
                  </div>
                ) : searchResults.map((result) => {
                  const checked = selectedStocks.has(result.tsCode)
                  return (
                    <button
                      key={result.tsCode}
                      type="button"
                      role="option"
                      aria-selected={checked}
                      onClick={() => toggleSearchResult(result)}
                      className="flex min-h-11 w-full items-center gap-3 px-3 text-left hover:bg-cyan-50 focus:outline-none focus-visible:bg-cyan-50 dark:hover:bg-cyan-950/30 dark:focus-visible:bg-cyan-950/30"
                    >
                      <span aria-hidden="true" className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] ${checked ? 'border-cyan-600 bg-cyan-600 text-white' : 'border-slate-300 dark:border-slate-600'}`}>{checked ? '✓' : ''}</span>
                      <span className="w-24 shrink-0 font-mono text-xs text-slate-500">{result.tsCode}</span>
                      <span className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{result.name}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
          <OptionMenu label="分类" value={selectedCategory} options={categoryOptions} onChange={(value) => { setCategoryTouched(true); setSelectedCategory(value); setSelectedSubCategory(''); setCategoryHint('已改手选分类') }} className="w-40" />
          <OptionMenu label="细分赛道" value={selectedSubCategory} options={subCategoryOptions} onChange={(value) => { setCategoryTouched(true); setSelectedSubCategory(value); setCategoryHint('已改手选赛道') }} disabled={!selectedCategory} className="w-48" />
          <label className="w-36"><span className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">自定义分组</span><input value={inputGroup} onChange={(event) => setInputGroup(event.target.value)} placeholder="例如：重点跟踪" className="min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" /></label>
          <button type="button" onClick={() => void handleAdd()} disabled={adding || resolvingCode || selectedStocks.size === 0} className="min-h-11 rounded-md bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 disabled:cursor-not-allowed disabled:opacity-45 dark:bg-cyan-500 dark:text-slate-950 dark:hover:bg-cyan-400">{adding || resolvingCode ? '正在加入' : `加入观察池${selectedStocks.size > 0 ? ` (${selectedStocks.size})` : ''}`}</button>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {categoryHint && (
            <span className="inline-flex items-center rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-[11px] text-cyan-800 dark:border-cyan-900 dark:bg-cyan-950/40 dark:text-cyan-200">
              {categoryHint}
            </span>
          )}
          <button
            type="button"
            data-testid="trend-watchlist-resuggest-category"
            disabled={selectedStocks.size === 0 || categorySuggesting}
            onClick={() => { void applyCategorySuggestion(selectedStocks, true) }}
            className="rounded-md border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:border-cyan-400 hover:text-cyan-700 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300"
          >
            {categorySuggesting ? '识别中…' : '重新识别分类'}
          </button>
          <button
            type="button"
            data-testid="trend-watchlist-web-suggest-category"
            disabled={selectedStocks.size === 0 || webSuggesting}
            onClick={() => setWebConfirmOpen(true)}
            className="rounded-md border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:border-cyan-400 hover:text-cyan-700 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300"
          >
            {webSuggesting ? '联网中…' : '联网补充分类'}
          </button>
        </div>
        {webPending.length > 0 && (
          <div data-testid="trend-watchlist-web-pending" className="mt-2 flex flex-wrap gap-2">
            {webPending.map((item) => (
              <button
                key={`${item.label}-${item.suggestedCategory}-${item.suggestedSubCategory}`}
                type="button"
                onClick={() => { void adoptPendingSuggestion(item) }}
                className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] text-amber-900 hover:border-amber-400 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
              >
                采用：{item.label} → {item.suggestedCategory}/{item.suggestedSubCategory || '未设赛道'}
              </button>
            ))}
          </div>
        )}
        {actionMessage && <div role="status" className={`mt-2 text-xs ${actionMessage.tone === 'error' ? 'text-rose-700 dark:text-rose-300' : actionMessage.tone === 'success' ? 'text-cyan-700 dark:text-cyan-300' : 'text-amber-700 dark:text-amber-300'}`}>{actionMessage.text}</div>}
      </section>

      {(backfillProgress || syncProgress) && (
        <div data-testid="trend-progress-area" className={`grid gap-px border-b border-slate-200 bg-slate-200 dark:border-slate-800 dark:bg-slate-800 ${backfillProgress && syncProgress ? 'sm:grid-cols-2' : 'grid-cols-1'}`}>
          {backfillProgress && <ProgressStrip label="观察池日线补齐" progress={backfillProgress} running={backfillRunning} />}
          {syncProgress && <ProgressStrip label="全市场日线维护" progress={syncProgress} running={syncRunning} />}
        </div>
      )}

      <div className="flex flex-col gap-1 border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs dark:border-slate-800 dark:bg-slate-900/60 sm:px-5">
        <div className="flex items-center gap-3">
          <span className="font-medium text-slate-700 dark:text-slate-200">数据维护</span>
          <span className="text-slate-500 dark:text-slate-400">全市场最近90个交易日（可选；加股不依赖此项）</span>
          <button type="button" disabled={syncRunning} onClick={() => void handleFullSync()} className="ml-auto min-h-10 rounded-md border border-slate-300 bg-white px-3 font-medium text-slate-700 hover:border-cyan-400 hover:text-cyan-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 disabled:cursor-wait disabled:opacity-45 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">{syncRunning ? '同步进行中' : '执行全市场同步'}</button>
        </div>
        {syncMessage && (
          <div data-testid="trend-watchlist-sync-error" role="status" className={syncMessage.tone === 'error' ? 'text-rose-700 dark:text-rose-300' : 'text-slate-500'}>
            {syncMessage.text}
          </div>
        )}
      </div>

      <div data-testid="trend-watchlist-map-rules" className="border-b border-slate-200 bg-white px-4 py-2 text-xs dark:border-slate-800 dark:bg-slate-950 sm:px-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-slate-700 dark:text-slate-200">分类维护</span>
          <span className="text-slate-500 dark:text-slate-400">主题树入库可编辑；映射规则 → 树内节点；联网补充需显式授权</span>
          <button
            type="button"
            data-testid="trend-watchlist-map-rules-toggle"
            onClick={() => setMaintainOpen((open) => !open)}
            className="ml-auto min-h-10 rounded-md border border-slate-300 bg-white px-3 font-medium text-slate-700 hover:border-cyan-400 hover:text-cyan-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            {maintainOpen ? '收起维护' : '打开分类维护'}
          </button>
        </div>
        {maintainOpen && (
          <div className="mt-3 space-y-3">
            <div className="flex gap-2" role="tablist" aria-label="分类维护页签">
              <button
                type="button"
                role="tab"
                aria-selected={maintainTab === 'rules'}
                data-testid="trend-watchlist-maintain-tab-rules"
                onClick={() => setMaintainTab('rules')}
                className={`min-h-9 rounded-md px-3 font-medium ${maintainTab === 'rules' ? 'bg-slate-900 text-white dark:bg-cyan-500 dark:text-slate-950' : 'border border-slate-300 text-slate-600 dark:border-slate-700 dark:text-slate-300'}`}
              >
                映射规则
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={maintainTab === 'tree'}
                data-testid="trend-watchlist-maintain-tab-tree"
                onClick={() => setMaintainTab('tree')}
                className={`min-h-9 rounded-md px-3 font-medium ${maintainTab === 'tree' ? 'bg-slate-900 text-white dark:bg-cyan-500 dark:text-slate-950' : 'border border-slate-300 text-slate-600 dark:border-slate-700 dark:text-slate-300'}`}
              >
                主题树
              </button>
            </div>

            {maintainTab === 'rules' && (
              <div className="space-y-3">
                <form
                  className="flex flex-wrap items-end gap-2"
                  onSubmit={(event) => {
                    event.preventDefault()
                    void (async () => {
                      setMapRuleMessage(null)
                      const response = await window.api.trend.upsertCategoryMapRule({
                        keyword: mapRuleDraft.keyword.trim(),
                        matchField: mapRuleDraft.matchField,
                        category: mapRuleDraft.category,
                        subCategory: mapRuleDraft.subCategory,
                        priority: mapRuleDraft.priority,
                        enabled: true,
                      })
                      if (!response.ok) {
                        setMapRuleMessage(response.message ?? response.error ?? '保存失败')
                        return
                      }
                      setMapRuleDraft({ keyword: '', matchField: 'concept', category: '', subCategory: '', priority: 80 })
                      setMapRuleMessage('已保存规则')
                      await loadMapRules()
                    })()
                  }}
                >
                  <label className="w-36">
                    <span className="mb-1 block text-[11px] text-slate-500">关键词</span>
                    <input
                      data-testid="trend-map-rule-keyword"
                      value={mapRuleDraft.keyword}
                      onChange={(event) => setMapRuleDraft((draft) => ({ ...draft, keyword: event.target.value }))}
                      className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-2 dark:border-slate-700 dark:bg-slate-900"
                      required
                    />
                  </label>
                  <label className="w-28">
                    <span className="mb-1 block text-[11px] text-slate-500">匹配字段</span>
                    <select
                      data-testid="trend-map-rule-field"
                      value={mapRuleDraft.matchField}
                      onChange={(event) => setMapRuleDraft((draft) => ({
                        ...draft,
                        matchField: event.target.value as 'industry' | 'concept' | 'name',
                      }))}
                      className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-2 dark:border-slate-700 dark:bg-slate-900"
                    >
                      <option value="industry">行业</option>
                      <option value="concept">概念</option>
                      <option value="name">名称</option>
                    </select>
                  </label>
                  <label className="w-40">
                    <span className="mb-1 block text-[11px] text-slate-500">分类</span>
                    <select
                      data-testid="trend-map-rule-category"
                      value={mapRuleDraft.category}
                      onChange={(event) => setMapRuleDraft((draft) => ({ ...draft, category: event.target.value, subCategory: '' }))}
                      className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-2 dark:border-slate-700 dark:bg-slate-900"
                      required
                    >
                      <option value="">选择分类</option>
                      {Object.keys(categoryTree).map((value) => (
                        <option key={value} value={value}>{value}</option>
                      ))}
                    </select>
                  </label>
                  <label className="w-48">
                    <span className="mb-1 block text-[11px] text-slate-500">细分赛道</span>
                    <select
                      data-testid="trend-map-rule-subcategory"
                      value={mapRuleDraft.subCategory}
                      onChange={(event) => setMapRuleDraft((draft) => ({ ...draft, subCategory: event.target.value }))}
                      className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-2 dark:border-slate-700 dark:bg-slate-900"
                      disabled={!mapRuleDraft.category}
                      required
                    >
                      <option value="">选择赛道</option>
                      {(categoryTree[mapRuleDraft.category] ?? []).map((value) => (
                        <option key={value} value={value}>{value}</option>
                      ))}
                    </select>
                  </label>
                  <label className="w-24">
                    <span className="mb-1 block text-[11px] text-slate-500">优先级</span>
                    <input
                      type="number"
                      data-testid="trend-map-rule-priority"
                      value={mapRuleDraft.priority}
                      onChange={(event) => setMapRuleDraft((draft) => ({ ...draft, priority: Number(event.target.value) || 0 }))}
                      className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-2 dark:border-slate-700 dark:bg-slate-900"
                    />
                  </label>
                  <button
                    type="submit"
                    data-testid="trend-map-rule-save"
                    className="min-h-10 rounded-md bg-slate-900 px-3 font-medium text-white dark:bg-cyan-500 dark:text-slate-950"
                  >
                    新增规则
                  </button>
                </form>
                {mapRuleMessage && <div role="status" className="text-slate-500">{mapRuleMessage}</div>}
                <div className="max-h-56 overflow-auto rounded-md border border-slate-200 dark:border-slate-800">
                  {mapRulesLoading ? (
                    <div className="px-3 py-4 text-slate-400">加载规则中…</div>
                  ) : mapRules.length === 0 ? (
                    <div className="px-3 py-4 text-slate-400">暂无规则</div>
                  ) : (
                    <table className="w-full min-w-[720px] border-collapse text-left">
                      <thead className="sticky top-0 bg-slate-100 text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                        <tr>
                          <th className="px-3 py-2 font-medium">关键词</th>
                          <th className="px-3 py-2 font-medium">字段</th>
                          <th className="px-3 py-2 font-medium">映射</th>
                          <th className="px-3 py-2 font-medium">优先级</th>
                          <th className="px-3 py-2 font-medium">状态</th>
                          <th className="px-3 py-2 text-right font-medium">操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {mapRules.map((rule) => (
                          <tr key={rule.id} className="border-t border-slate-100 dark:border-slate-900">
                            <td className="px-3 py-2 font-medium text-slate-800 dark:text-slate-100">{rule.keyword}</td>
                            <td className="px-3 py-2 text-slate-500">{matchFieldLabel(rule.matchField)}</td>
                            <td className="px-3 py-2 text-slate-700 dark:text-slate-200">{rule.category} / {rule.subCategory}</td>
                            <td className="px-3 py-2 tabular-nums text-slate-500">{rule.priority}</td>
                            <td className="px-3 py-2">
                              <button
                                type="button"
                                onClick={() => {
                                  void (async () => {
                                    await window.api.trend.upsertCategoryMapRule({
                                      id: rule.id,
                                      keyword: rule.keyword,
                                      matchField: rule.matchField,
                                      category: rule.category,
                                      subCategory: rule.subCategory,
                                      priority: rule.priority,
                                      enabled: !rule.enabled,
                                    })
                                    await loadMapRules()
                                  })()
                                }}
                                className={rule.enabled ? 'text-cyan-700 dark:text-cyan-300' : 'text-slate-400'}
                              >
                                {rule.enabled ? '启用' : '停用'}
                              </button>
                            </td>
                            <td className="px-3 py-2 text-right">
                              <button
                                type="button"
                                data-testid={`trend-map-rule-delete-${rule.id}`}
                                onClick={() => {
                                  void (async () => {
                                    await window.api.trend.deleteCategoryMapRule(rule.id)
                                    await loadMapRules()
                                  })()
                                }}
                                className="text-rose-700 hover:underline dark:text-rose-300"
                              >
                                删除
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}

            {maintainTab === 'tree' && (
              <div className="space-y-3" data-testid="trend-watchlist-category-tree">
                <form
                  className="flex flex-wrap items-end gap-2"
                  onSubmit={(event) => {
                    event.preventDefault()
                    void (async () => {
                      setTreeMessage(null)
                      const response = await window.api.trend.upsertCategoryNode({
                        category: treeDraft.category.trim(),
                        subCategory: treeDraft.subCategory.trim(),
                        enabled: true,
                      })
                      if (!response.ok) {
                        setTreeMessage(response.message ?? response.error ?? '保存失败')
                        return
                      }
                      setTreeDraft({ category: '', subCategory: '' })
                      setTreeMessage('已保存主题树节点')
                      await loadCategoryTree()
                    })()
                  }}
                >
                  <label className="w-40">
                    <span className="mb-1 block text-[11px] text-slate-500">分类</span>
                    <input
                      data-testid="trend-category-tree-category"
                      value={treeDraft.category}
                      onChange={(event) => setTreeDraft((draft) => ({ ...draft, category: event.target.value }))}
                      className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-2 dark:border-slate-700 dark:bg-slate-900"
                      required
                    />
                  </label>
                  <label className="w-48">
                    <span className="mb-1 block text-[11px] text-slate-500">细分赛道（可空）</span>
                    <input
                      data-testid="trend-category-tree-subcategory"
                      value={treeDraft.subCategory}
                      onChange={(event) => setTreeDraft((draft) => ({ ...draft, subCategory: event.target.value }))}
                      className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-2 dark:border-slate-700 dark:bg-slate-900"
                    />
                  </label>
                  <button
                    type="submit"
                    data-testid="trend-category-tree-add"
                    className="min-h-10 rounded-md bg-slate-900 px-3 font-medium text-white dark:bg-cyan-500 dark:text-slate-950"
                  >
                    新增节点
                  </button>
                </form>
                {treeMessage && <div role="status" className="text-slate-500">{treeMessage}</div>}
                {renameDraft && (
                  <form
                    className="flex flex-wrap items-end gap-2 rounded-md border border-slate-200 p-2 dark:border-slate-800"
                    onSubmit={(event) => {
                      event.preventDefault()
                      void (async () => {
                        const response = await window.api.trend.renameCategoryNode({
                          from: {
                            category: renameDraft.fromCategory,
                            subCategory: renameDraft.fromSubCategory,
                          },
                          to: {
                            category: renameDraft.toCategory.trim(),
                            subCategory: renameDraft.toSubCategory.trim(),
                          },
                        })
                        if (!response.ok) {
                          setTreeMessage(response.message ?? response.error ?? '重命名失败')
                          return
                        }
                        setRenameDraft(null)
                        setTreeMessage('已重命名并级联更新观察池/规则')
                        await loadCategoryTree()
                        await loadMapRules()
                        await loadWatchRows()
                      })()
                    }}
                  >
                    <label className="w-40">
                      <span className="mb-1 block text-[11px] text-slate-500">新分类名</span>
                      <input
                        value={renameDraft.toCategory}
                        onChange={(event) => setRenameDraft((draft) => draft ? { ...draft, toCategory: event.target.value } : draft)}
                        className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-2 dark:border-slate-700 dark:bg-slate-900"
                        required
                      />
                    </label>
                    <label className="w-48">
                      <span className="mb-1 block text-[11px] text-slate-500">新赛道名</span>
                      <input
                        value={renameDraft.toSubCategory}
                        onChange={(event) => setRenameDraft((draft) => draft ? { ...draft, toSubCategory: event.target.value } : draft)}
                        className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-2 dark:border-slate-700 dark:bg-slate-900"
                      />
                    </label>
                    <button type="submit" className="min-h-10 rounded-md bg-slate-900 px-3 font-medium text-white dark:bg-cyan-500 dark:text-slate-950">确认重命名</button>
                    <button type="button" onClick={() => setRenameDraft(null)} className="min-h-10 rounded-md border border-slate-300 px-3 dark:border-slate-700">取消</button>
                  </form>
                )}
                <div className="max-h-56 overflow-auto rounded-md border border-slate-200 dark:border-slate-800">
                  {categoryNodes.length === 0 ? (
                    <div className="px-3 py-4 text-slate-400">暂无主题树节点</div>
                  ) : (
                    <table className="w-full min-w-[640px] border-collapse text-left">
                      <thead className="sticky top-0 bg-slate-100 text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                        <tr>
                          <th className="px-3 py-2 font-medium">分类</th>
                          <th className="px-3 py-2 font-medium">赛道</th>
                          <th className="px-3 py-2 text-right font-medium">操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {categoryNodes.map((node) => (
                          <tr key={node.id} className="border-t border-slate-100 dark:border-slate-900">
                            <td className="px-3 py-2 font-medium text-slate-800 dark:text-slate-100">{node.category}</td>
                            <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{node.subCategory || '（仅分类）'}</td>
                            <td className="px-3 py-2 text-right space-x-2">
                              <button
                                type="button"
                                onClick={() => setRenameDraft({
                                  fromCategory: node.category,
                                  fromSubCategory: node.subCategory,
                                  toCategory: node.category,
                                  toSubCategory: node.subCategory,
                                })}
                                className="text-cyan-700 hover:underline dark:text-cyan-300"
                              >
                                重命名
                              </button>
                              <button
                                type="button"
                                data-testid={`trend-category-tree-delete-${node.id}`}
                                onClick={() => {
                                  void (async () => {
                                    const response = await window.api.trend.deleteCategoryNode({
                                      category: node.category,
                                      subCategory: node.subCategory,
                                    })
                                    if (response.ok) {
                                      setTreeMessage('已删除节点')
                                      await loadCategoryTree()
                                      return
                                    }
                                    if (response.error === 'IN_USE') {
                                      setTreeDeleteTarget({
                                        category: node.category,
                                        subCategory: node.subCategory,
                                        refs: response.refs,
                                      })
                                      return
                                    }
                                    setTreeMessage(response.message ?? '删除失败')
                                  })()
                                }}
                                className="text-rose-700 hover:underline dark:text-rose-300"
                              >
                                删除
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {allItems.length > 0 && (
        <div data-testid="trend-watchlist-filters" className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-4 py-2 dark:border-slate-800 dark:bg-slate-950 sm:px-5">
          <div className="mr-auto min-w-36">
            <div className="text-xs font-medium text-slate-700 dark:text-slate-200">观察池列表</div>
            <div className="mt-0.5 text-[11px] tabular-nums text-slate-400">显示 {items.length} / {allItems.length} 只</div>
          </div>
          <OptionMenu label="列表分类" value={listCategory} options={listCategoryOptions} onChange={(value) => { setListCategory(value); setListSubCategory('') }} className="w-44" />
          <OptionMenu label="列表赛道" value={listSubCategory} options={listSubCategoryOptions} onChange={setListSubCategory} className="w-52" />
          {(listCategory || listSubCategory) && <button type="button" onClick={() => { setListCategory(''); setListSubCategory('') }} className="min-h-11 rounded-md px-3 text-xs font-medium text-cyan-700 hover:bg-cyan-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 dark:text-cyan-300 dark:hover:bg-cyan-950/30">清除筛选</button>}
        </div>
      )}

      {allItems.length === 0 && !loading && !listLoading ? (
        <div className="flex min-h-64 flex-1 flex-col items-center justify-center gap-2 px-6 text-center"><div className="text-sm font-medium text-slate-700 dark:text-slate-200">观察池为空</div><div className="text-xs text-slate-500 dark:text-slate-400">搜索股票并加入后，系统会立即检查本地日线是否足够计算趋势</div></div>
      ) : items.length === 0 ? (
        <div className="flex min-h-64 flex-1 flex-col items-center justify-center gap-3 px-6 text-center"><div><div className="text-sm font-medium text-slate-700 dark:text-slate-200">当前分类和赛道下没有股票</div><div className="mt-1 text-xs text-slate-500 dark:text-slate-400">可以切换筛选条件查看其他观察对象</div></div><button type="button" onClick={() => { setListCategory(''); setListSubCategory('') }} className="min-h-11 rounded-md border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:border-cyan-400 hover:text-cyan-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 dark:border-slate-700 dark:text-slate-200">查看全部股票</button></div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full min-w-[940px] border-collapse text-xs">
            <thead className="sticky top-0 z-10 bg-slate-100/95 text-slate-500 backdrop-blur dark:bg-slate-900/95 dark:text-slate-400"><tr className="border-b border-slate-200 dark:border-slate-800"><th className="px-4 py-2 text-left font-medium">股票</th><th className="px-3 py-2 text-left font-medium">分类与赛道</th><th className="px-3 py-2 text-left font-medium">自定义分组</th><th className="px-3 py-2 text-left font-medium">趋势状态</th><th className="px-3 py-2 text-left font-medium">日线覆盖</th><th className="px-3 py-2 text-left font-medium">评分时点</th><th className="px-4 py-2 text-right font-medium">操作</th></tr></thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.tsCode} tabIndex={0} onClick={() => setSelectedDetail(item)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') setSelectedDetail(item) }} className="cursor-pointer border-b border-slate-100 bg-white transition-colors motion-reduce:transition-none hover:bg-cyan-50/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-500 dark:border-slate-900 dark:bg-slate-950 dark:hover:bg-cyan-950/20">
                  <td className="px-4 py-2.5"><div className="font-medium text-slate-900 dark:text-slate-100">{item.stockName}</div><div className="mt-0.5 font-mono text-[11px] text-slate-500">{item.stockCode}</div></td>
                  <td className="px-3 py-2.5"><div className="max-w-56 truncate text-slate-700 dark:text-slate-200">{item.categories.join(' / ') || '未分类'}</div><div className="mt-0.5 max-w-56 truncate text-[11px] text-slate-400">{item.subCategories.join(' / ') || '未设置细分赛道'}</div></td>
                  <td className="px-3 py-2.5" onClick={(event) => event.stopPropagation()}>
                    {editingGroupCode === item.tsCode ? <input autoFocus value={editingGroupValue} onChange={(event) => setEditingGroupValue(event.target.value)} onBlur={() => void saveGroup(item.tsCode)} onKeyDown={(event) => { if (event.key === 'Enter') void saveGroup(item.tsCode); if (event.key === 'Escape') setEditingGroupCode(null) }} className="min-h-10 w-36 rounded-md border border-cyan-500 bg-white px-2 text-xs outline-none ring-2 ring-cyan-500/20 dark:bg-slate-900" /> : <button type="button" onClick={() => { setEditingGroupCode(item.tsCode); setEditingGroupValue(item.groupTags.join(' / ')) }} className="min-h-10 max-w-40 rounded px-2 text-left text-slate-600 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 dark:text-slate-300 dark:hover:bg-slate-800">{item.groupTags.join(' / ') || '设置分组'}</button>}
                  </td>
                  <td className="px-3 py-2.5"><TrendStateBadge state={item.trendState} /></td>
                  <td className="px-3 py-2.5"><div className={item.dataCoverage.state === 'ready' ? 'font-medium text-cyan-700 dark:text-cyan-300' : 'font-medium text-amber-700 dark:text-amber-300'}>{coverageLabel(item)}</div><div className="mt-0.5 text-[11px] text-slate-400">至 {formatTrendDate(item.dataCoverage.latestTradeDate)}</div></td>
                  <td className="px-3 py-2.5"><div className="text-slate-700 dark:text-slate-200">{formatTrendDate(item.scoreDate)}</div><div className="mt-0.5 text-[11px] text-slate-400">{item.scoreSource === 'realtime' ? '盘中评分' : '日终评分'} · V2有效权重 {item.validWeight == null ? '—' : `${Math.round(item.validWeight * 100)}%`}</div></td>
                  <td className="px-4 py-2.5 text-right" onClick={(event) => event.stopPropagation()}><div className="flex justify-end gap-1"><button type="button" disabled={backfillRunning || item.dataCoverage.state === 'ready'} onClick={() => void runBackfill([item.tsCode])} className="min-h-10 rounded px-2 text-cyan-700 hover:bg-cyan-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 disabled:cursor-not-allowed disabled:text-slate-300 dark:text-cyan-300 dark:hover:bg-cyan-950/30 dark:disabled:text-slate-700">补齐</button><button type="button" onClick={() => setRemoveTarget(item)} className="min-h-10 rounded px-2 text-rose-700 hover:bg-rose-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 dark:text-rose-300 dark:hover:bg-rose-950/30">移除</button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {removeTarget && <TrendConfirmDialog title="移出观察池" description="这只股票的全部分类和赛道登记都会从观察池中移除。" subject={`${removeTarget.stockName} · ${removeTarget.stockCode}`} busy={removing} onCancel={() => setRemoveTarget(null)} onConfirm={() => void confirmRemove()} />}
      {clearConfirmOpen && (
        <TrendConfirmDialog
          title="清空观察池"
          description="将删除观察池内全部股票登记（含多赛道条目）。本地日线与评分缓存不会删除；种子目录也不会自动恢复。"
          subject={`当前 ${countDistinctCodes(watchRows)} 只股票 · ${watchRows.length} 条登记`}
          busy={clearing}
          onCancel={() => setClearConfirmOpen(false)}
          onConfirm={() => { void confirmClearAll() }}
        />
      )}
      {webConfirmOpen && (
        <TrendConfirmDialog
          title="联网补充分类"
          description="将发起一次受控联网检索（复用研究侧搜索配置；未配置时可能走内置检索）。结果仅作建议，不会把网页原文行业名直接写入观察池。"
          subject="本次点击视为授权这一次联网"
          busy={webSuggesting}
          onCancel={() => setWebConfirmOpen(false)}
          onConfirm={() => { void runWebCategorySuggest() }}
        />
      )}
      {treeDeleteTarget && (
        <TrendConfirmDialog
          title="清空引用后删除"
          description={`将清空相关观察池分类并删除映射规则，再删除节点，不可自动恢复。引用：观察池 ${treeDeleteTarget.refs?.inUseWatchlist ?? 0} / 规则 ${treeDeleteTarget.refs?.inUseRules ?? 0}。`}
          subject={`${treeDeleteTarget.category} / ${treeDeleteTarget.subCategory || '仅分类'}`}
          busy={treeDeleting}
          onCancel={() => setTreeDeleteTarget(null)}
          onConfirm={() => {
            void (async () => {
              setTreeDeleting(true)
              try {
                const response = await window.api.trend.deleteCategoryNode({
                  category: treeDeleteTarget.category,
                  subCategory: treeDeleteTarget.subCategory,
                  clearReferences: true,
                })
                if (!response.ok) {
                  setTreeMessage(response.message ?? '删除失败')
                  return
                }
                setTreeDeleteTarget(null)
                setTreeMessage('已清空引用并删除节点')
                await loadCategoryTree()
                await loadMapRules()
                await loadWatchRows()
              } finally {
                setTreeDeleting(false)
              }
            })()
          }}
        />
      )}
      {selectedDetail && <StockKlineChipDrawer tsCode={selectedDetail.tsCode} stockName={selectedDetail.stockName} onClose={() => setSelectedDetail(null)} onNavigate={() => { navigateToStock(selectedDetail.stockCode, selectedDetail.stockName); setSelectedDetail(null) }} />}
    </div>
  )
}

function countDistinctCodes(rows: WatchItem[]): number {
  return new Set(rows.map((row) => normalizeCode(row.tsCode))).size
}

function ProgressStrip({ label, progress, running }: { label: string; progress: ProgressState; running: boolean }) {
  const percent = progress.total > 0 ? Math.min(100, Math.round(progress.current / progress.total * 100)) : 0
  return <div data-testid="trend-progress-strip" className="w-full bg-white px-4 py-2 dark:bg-slate-950 sm:px-5"><div className="flex items-center justify-between gap-3 text-[11px]"><span className="font-medium text-slate-700 dark:text-slate-200">{label}</span><span className="truncate text-slate-500 dark:text-slate-400">{progress.detail} · {progress.current}/{progress.total}</span></div><div className="mt-1.5 h-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"><div className={`h-full rounded-full bg-cyan-600 transition-[width] duration-200 motion-reduce:transition-none ${running && progress.current === 0 ? 'animate-pulse motion-reduce:animate-none' : ''}`} style={{ width: `${Math.max(running ? 2 : 0, percent)}%` }} /></div></div>
}

function buildFilterOptions(
  rows: WatchItem[],
  field: 'category' | 'subCategory',
  allLabel: string,
): Array<{ value: string; label: string }> {
  const codesByValue = new Map<string, Set<string>>()
  for (const row of rows) {
    const value = row[field].trim()
    if (!value) continue
    const codes = codesByValue.get(value) ?? new Set<string>()
    codes.add(normalizeCode(row.tsCode))
    codesByValue.set(value, codes)
  }
  return [
    { value: '', label: allLabel },
    ...[...codesByValue.entries()]
      .sort(([left], [right]) => left.localeCompare(right, 'zh-CN'))
      .map(([value, codes]) => ({ value, label: `${value} (${codes.size})` })),
  ]
}

function coveragePriority(item: TrendWorkbenchItem): number {
  return item.dataCoverage.state === 'missing' ? 0 : item.dataCoverage.state === 'partial' ? 1 : 2
}

function coverageLabel(item: TrendWorkbenchItem): string {
  if (item.dataCoverage.state === 'ready') return `${item.dataCoverage.bars}根 · 可评分`
  if (item.dataCoverage.state === 'partial') return `${item.dataCoverage.bars}/${item.dataCoverage.requiredBars}根 · 待补齐`
  return `${item.dataCoverage.bars}/${item.dataCoverage.requiredBars}根 · 无法评分`
}

function backfillStatusLabel(status: 'synced' | 'skipped' | 'failed'): string {
  return status === 'synced' ? '已更新' : status === 'skipped' ? '本地已具备' : '未完成'
}

function localizeSyncError(error: string | undefined, message: string | undefined): string {
  if (error === 'TUSHARE_DISABLED') return '未启用可用的 Tushare 数据源，请先在设置中完成配置'
  if (error === 'ALREADY_RUNNING') return '已有日线同步任务正在运行'
  if (error === 'NO_TRADE_DATES') return '本地交易日历为空，暂时无法同步'
  return message ?? error ?? '全市场日线同步失败'
}

function normalizeCode(value: string): string {
  return value.trim().toUpperCase()
}

function stripCode(value: string): string {
  return value.replace(/\.(SH|SZ|BJ)$/i, '')
}

function matchFieldLabel(field: 'industry' | 'concept' | 'name'): string {
  if (field === 'industry') return '行业'
  if (field === 'name') return '名称'
  return '概念'
}
