import { useEffect, useMemo, useState } from 'react'
import { StockKlineChipDrawer } from '../shared/StockMiniChart'
import { useAppStore } from '../../store/appStore'
import { useResearchDiscussionNavigation } from '../ResearchDiscussion/useResearchDiscussionNavigation'
import { AiTrendReviewBadge } from './AiTrendReviewBadge'
import {
  ScoreSparkline,
  TrendBenchmarkMeta,
  TrendPageHeader,
  TrendStateBadge,
  WorkbenchError,
  formatSigned,
  formatTrendDate,
  valueTone,
} from './TrendWorkbenchUi'
import { buildLocalTrendSummary, type LocalTrendSummaryStatus } from './localTrendSummary'
import type { TrendState, TrendWorkbenchItem, TrendWorkbenchPageProps } from './trendWorkbenchTypes'

type RadarFilter = 'all' | 'portfolio' | 'strengthening' | 'weakening' | 'insufficient'

const FILTERS: Array<{ key: RadarFilter; label: string }> = [
  { key: 'all', label: '全部观察' },
  { key: 'portfolio', label: '我的持仓' },
  { key: 'strengthening', label: '正在转强' },
  { key: 'weakening', label: '走弱与破位' },
  { key: 'insufficient', label: '数据待补' },
]

const STATE_ORDER: Record<TrendState, number> = {
  broken: 0,
  weakening: 1,
  strengthening: 2,
  strong: 3,
  stable: 4,
  insufficient: 5,
}

type ReviewToast = { tone: 'success' | 'error' | 'info'; message: string }
type BatchReviewResult = { tsCode: string; ok: boolean; error?: string }
type BatchReviewState = {
  status: 'running' | 'done'
  batchRequestId: string
  requested: number
  completed: number
  succeeded: number
  failed: number
  results: BatchReviewResult[]
}

export function resolveTrendDrawerItem(
  selectedTsCode: string | null,
  items: TrendWorkbenchItem[],
): TrendWorkbenchItem | null {
  return selectedTsCode == null ? null : items.find((item) => item.tsCode === selectedTsCode) ?? null
}

export function TrendDashboard({ snapshot, loading, errorMessage, onRefresh }: TrendWorkbenchPageProps) {
  const [filter, setFilter] = useState<RadarFilter>('all')
  const [query, setQuery] = useState('')
  const [selectedTsCode, setSelectedTsCode] = useState<string | null>(null)
  const [selectedCodes, setSelectedCodes] = useState<Set<string>>(() => new Set())
  const [reviewingCodes, setReviewingCodes] = useState<Set<string>>(() => new Set())
  const [batchReview, setBatchReview] = useState<BatchReviewState | null>(null)
  const [batchConfirmCodes, setBatchConfirmCodes] = useState<string[] | null>(null)
  const [toast, setToast] = useState<ReviewToast | null>(null)
  const navigateToStock = useAppStore((state) => state.navigateToStock)
  const { startFromTrendReview, starting: startingDiscussion } = useResearchDiscussionNavigation()

  useEffect(() => {
    if (!snapshot) return
    const availableCodes = new Set(snapshot.items.map((item) => item.tsCode))
    setSelectedCodes((current) => {
      const next = new Set([...current].filter((code) => availableCodes.has(code)))
      return next.size === current.size ? current : next
    })
  }, [snapshot])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 5_000)
    return () => window.clearTimeout(timer)
  }, [toast])

  useEffect(() => window.api.trend.onReviewProgress((progress) => {
    setBatchReview((current) => {
      if (!current || current.status !== 'running' || current.batchRequestId !== progress.batchRequestId) return current
      if (progress.status === 'running') return current
      const result: BatchReviewResult = {
        tsCode: progress.tsCode,
        ok: progress.status === 'succeeded',
        error: progress.error,
      }
      return {
        ...current,
        completed: Math.min(current.requested, current.completed + 1),
        succeeded: current.succeeded + (result.ok ? 1 : 0),
        failed: current.failed + (result.ok ? 0 : 1),
        results: [...current.results, result],
      }
    })
  }), [])

  const showToast = (tone: ReviewToast['tone'], message: string) => setToast({ tone, message })

  const items = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    return [...(snapshot?.items ?? [])]
      .filter((item) => {
        if (filter === 'portfolio' && !item.isPortfolio) return false
        if (filter === 'strengthening' && item.trendState !== 'strengthening') return false
        if (filter === 'weakening' && !['weakening', 'broken'].includes(item.trendState)) return false
        if (filter === 'insufficient' && item.dataCoverage.state === 'ready') return false
        if (!keyword) return true
        return item.stockName.toLowerCase().includes(keyword)
          || item.stockCode.includes(keyword)
          || item.categories.some((value) => value.toLowerCase().includes(keyword))
      })
      .sort((left, right) => {
        const state = STATE_ORDER[left.trendState] - STATE_ORDER[right.trendState]
        if (state !== 0) return state
        const delta = (right.scoreDelta5d ?? -999) - (left.scoreDelta5d ?? -999)
        if (delta !== 0) return delta
        return (right.totalScore ?? -1) - (left.totalScore ?? -1)
      })
  }, [filter, query, snapshot?.items])
  const selected = useMemo(
    () => resolveTrendDrawerItem(selectedTsCode, snapshot?.items ?? []),
    [selectedTsCode, snapshot?.items],
  )

  const counts = useMemo(() => {
    const all = snapshot?.items ?? []
    return {
      strengthening: all.filter((item) => item.trendState === 'strengthening').length,
      weakening: all.filter((item) => ['weakening', 'broken'].includes(item.trendState)).length,
      strong: all.filter((item) => item.trendState === 'strong').length,
      missing: all.filter((item) => item.dataCoverage.state !== 'ready').length,
    }
  }, [snapshot?.items])

  const visibleCodes = items.map((item) => item.tsCode)
  const selectedVisibleCount = visibleCodes.filter((code) => selectedCodes.has(code)).length
  const allVisibleSelected = visibleCodes.length > 0 && selectedVisibleCount === visibleCodes.length
  const batchRunning = batchReview?.status === 'running'

  const toggleSelectedCode = (tsCode: string, checked: boolean) => {
    if (checked && !selectedCodes.has(tsCode) && selectedCodes.size >= 20) {
      showToast('info', '批量复核最多选择20只股票。')
      return
    }
    setSelectedCodes((current) => {
      const next = new Set(current)
      if (checked) next.add(tsCode)
      else next.delete(tsCode)
      return next
    })
  }

  const toggleAllVisible = () => {
    if (allVisibleSelected) {
      setSelectedCodes((current) => {
        const next = new Set(current)
        visibleCodes.forEach((code) => next.delete(code))
        return next
      })
      return
    }
    const missingCount = visibleCodes.filter((code) => !selectedCodes.has(code)).length
    if (selectedCodes.size + missingCount > 20) {
      showToast('info', '批量复核最多选择20只股票，请先缩小筛选范围或分批选择。')
      return
    }
    setSelectedCodes((current) => new Set([...current, ...visibleCodes]))
  }

  const reviewOne = async (item: TrendWorkbenchItem) => {
    if (reviewingCodes.has(item.tsCode) || batchRunning) return
    setReviewingCodes((current) => new Set([...current, item.tsCode]))
    try {
      const response = await window.api.trend.reviewStructure({ requestId: crypto.randomUUID(), tsCode: item.tsCode })
      if (!response.ok || !response.data) {
        showToast('error', `${item.stockName} 复核失败：${response.message ?? response.error ?? '未知错误'}`)
        return
      }
      showToast('success', `${item.stockName} AI复核已保存，正在刷新工作台。`)
      onRefresh()
    } catch {
      showToast('error', `${item.stockName} 复核失败，请稍后重试。`)
    } finally {
      setReviewingCodes((current) => {
        const next = new Set(current)
        next.delete(item.tsCode)
        return next
      })
    }
  }

  const requestBatchReview = () => {
    const tsCodes = [...selectedCodes]
    if (tsCodes.length < 1 || tsCodes.length > 20 || batchRunning) {
      if (tsCodes.length < 1) showToast('info', '请先选择至少一只股票。')
      if (tsCodes.length > 20) showToast('info', '批量复核最多选择20只股票。')
      return
    }
    setBatchConfirmCodes(tsCodes)
  }

  const runBatchReview = async (tsCodes: string[]) => {
    const batchRequestId = crypto.randomUUID()
    setBatchReview({ batchRequestId, status: 'running', requested: tsCodes.length, completed: 0, succeeded: 0, failed: 0, results: [] })
    try {
      const response = await window.api.trend.reviewStructureBatch({ requestId: batchRequestId, tsCodes })
      if (!response.ok || !response.data) {
        setBatchReview(null)
        showToast('error', `批量复核失败：${response.message ?? response.error ?? '未知错误'}`)
        return
      }
      const succeeded = response.data.filter((item) => item.ok).length
      const failed = response.data.length - succeeded
      setBatchReview({
        batchRequestId,
        status: 'done',
        requested: tsCodes.length,
        completed: response.data.length,
        succeeded,
        failed,
        results: response.data.map((item) => ({ tsCode: item.tsCode, ok: item.ok, error: item.error })),
      })
      showToast(failed === 0 ? 'success' : 'info', `批量复核完成：成功${succeeded}只，失败${failed}只。`)
      if (succeeded > 0) onRefresh()
    } catch {
      setBatchReview(null)
      showToast('error', '批量复核失败，请稍后重试。')
    }
  }

  const discussReview = async (item: TrendWorkbenchItem) => {
    const review = item.structureReview
    if (!review) {
      showToast('info', '请先完成一次 AI 结构复核，再带着复核去讨论。')
      return
    }
    if (review.stale) {
      showToast('info', '当前复核已过期，请先重新复核。')
      return
    }
    const started = await startFromTrendReview({
      tsCode: item.tsCode,
      scoreDate: review.scoreDate,
      factsHash: review.factsHash,
      returnTarget: {
        tab: 'trend-watcher',
        subTab: 'dashboard',
        entityId: item.tsCode,
        stateKey: 'trend-radar',
      },
    })
    if (!started) showToast('error', `${item.stockName} 复核讨论打开失败，请先刷新后重试。`)
  }

  return (
    <div data-testid="trend-radar" className="flex h-full min-h-0 flex-col overflow-y-auto">
      <TrendPageHeader
        title="趋势雷达"
        subtitle="关注评分变化、相对强度和结构破坏，而不是只看某一天的静态分数"
        loading={loading}
        onRefresh={onRefresh}
        actions={(
          <div className="flex flex-wrap items-center justify-end gap-2">
            {selectedCodes.size > 0 && <span className="text-xs tabular-nums text-slate-500 dark:text-slate-400">已选 {selectedCodes.size} / 20</span>}
            <button
              type="button"
              data-testid="trend-ai-review-batch"
              onClick={requestBatchReview}
              disabled={batchRunning || selectedCodes.size === 0}
              className="min-h-11 rounded-md border border-violet-300 bg-violet-50 px-3 text-sm font-medium text-violet-800 transition-colors hover:border-violet-400 hover:bg-violet-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-violet-800 dark:bg-violet-950/45 dark:text-violet-200 dark:hover:bg-violet-900/55"
            >
              {batchRunning ? `批量复核中… ${batchReview?.completed ?? 0}/${batchReview?.requested ?? selectedCodes.size}` : '批量复核'}
            </button>
            {selectedCodes.size > 0 && (
              <button
                type="button"
                onClick={() => setSelectedCodes(new Set())}
                className="min-h-11 rounded-md px-2 text-xs text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
              >
                清除选择
              </button>
            )}
          </div>
        )}
        meta={snapshot && (
          <span className="flex flex-wrap items-center gap-2 text-xs tabular-nums text-slate-500 dark:text-slate-400">
            <span>行情至 {formatTrendDate(snapshot.dataHealth.latestTradeDate)} · {snapshot.dataHealth.total}只</span>
            {snapshot.dataHealth.benchmark && <TrendBenchmarkMeta health={snapshot.dataHealth.benchmark} />}
          </span>
        )}
      />

      {toast && (
        <div
          data-testid="trend-ai-review-toast"
          role={toast.tone === 'error' ? 'alert' : 'status'}
          aria-live="polite"
          className={`fixed bottom-5 right-5 z-[10000] max-w-sm rounded-md border px-4 py-3 text-sm shadow-lg ${
            toast.tone === 'success'
              ? 'border-cyan-200 bg-cyan-50 text-cyan-800 dark:border-cyan-800 dark:bg-cyan-950/80 dark:text-cyan-200'
              : toast.tone === 'error'
                ? 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/80 dark:text-rose-200'
                : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/80 dark:text-amber-200'
          }`}
        >
          {toast.message}
        </div>
      )}

      {errorMessage && <WorkbenchError message={errorMessage} onRetry={onRefresh} />}

      <div className="grid grid-cols-2 border-b border-slate-200 bg-white sm:grid-cols-4 dark:border-slate-800 dark:bg-slate-950">
        <RadarSummary label="正在转强" value={counts.strengthening} tone="positive" />
        <RadarSummary label="走弱或破位" value={counts.weakening} tone={counts.weakening > 0 ? 'risk' : 'neutral'} />
        <RadarSummary label="保持强势" value={counts.strong} tone="neutral" />
        <RadarSummary label="数据待补" value={counts.missing} tone={counts.missing > 0 ? 'warning' : 'neutral'} />
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-4 py-2 dark:border-slate-800 dark:bg-slate-950 sm:px-5">
        <div className="flex max-w-full gap-1 overflow-x-auto" role="tablist" aria-label="趋势雷达筛选">
          {FILTERS.map((item) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={filter === item.key}
              onClick={() => setFilter(item.key)}
              className={`min-h-11 shrink-0 rounded-md px-3 text-sm transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 ${
                filter === item.key
                  ? 'bg-slate-900 text-white dark:bg-cyan-500 dark:text-slate-950'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >{item.label}</button>
          ))}
        </div>
        <label className="ml-auto flex min-h-11 min-w-[220px] items-center rounded-md border border-slate-300 bg-white px-3 focus-within:border-cyan-500 focus-within:ring-2 focus-within:ring-cyan-500/20 dark:border-slate-700 dark:bg-slate-900">
          <span className="sr-only">搜索股票、代码或分类</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索股票、代码或分类"
            className="w-full bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400 dark:text-slate-100"
          />
        </label>
      </div>

      {batchReview && (
        <div
          data-testid="trend-ai-review-batch-progress"
          className="flex flex-wrap items-center gap-3 border-b border-violet-100 bg-violet-50/80 px-4 py-2 text-xs text-violet-800 dark:border-violet-950 dark:bg-violet-950/30 dark:text-violet-200 sm:px-5"
        >
          <span className="font-medium">
            {batchReview.status === 'running'
              ? `正在串行复核 ${batchReview.requested} 只…`
              : `批量复核完成：${batchReview.succeeded} 成功，${batchReview.failed} 失败`}
          </span>
          {batchReview.status === 'running' && <span>{batchReview.completed} / {batchReview.requested}</span>}
          {batchReview.status === 'done' && batchReview.failed > 0 && (
            <span className="text-rose-700 dark:text-rose-300">
              {batchReview.results.filter((item) => !item.ok).map((item) => `${item.tsCode}${item.error ? `（${item.error}）` : ''}`).join('、')}
            </span>
          )}
        </div>
      )}

      {batchConfirmCodes && !batchRunning && (
        <div
          data-testid="trend-ai-review-batch-confirm"
          role="dialog"
          aria-label="确认批量复核"
          className="flex flex-wrap items-center gap-3 border-b border-violet-200 bg-violet-100 px-4 py-2 text-xs text-violet-900 dark:border-violet-900 dark:bg-violet-950/50 dark:text-violet-100 sm:px-5"
        >
          <span>确认串行复核 {batchConfirmCodes.length} 只股票？单条失败会继续后续任务。</span>
          <button
            type="button"
            onClick={() => {
              const codes = batchConfirmCodes
              setBatchConfirmCodes(null)
              void runBatchReview(codes)
            }}
            className="min-h-9 rounded-md bg-violet-700 px-3 font-semibold text-white transition-colors hover:bg-violet-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 dark:bg-violet-500 dark:text-violet-950 dark:hover:bg-violet-400"
          >
            确认复核
          </button>
          <button
            type="button"
            onClick={() => setBatchConfirmCodes(null)}
            className="min-h-9 rounded-md px-2 text-violet-700 transition-colors hover:bg-violet-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 dark:text-violet-200 dark:hover:bg-violet-900"
          >
            取消
          </button>
        </div>
      )}

      {!snapshot && loading ? (
        <RadarSkeleton />
      ) : items.length === 0 ? (
        <div className="flex min-h-64 flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
          <div className="text-sm font-medium text-slate-700 dark:text-slate-200">当前筛选下没有股票</div>
          <div className="text-xs text-slate-500 dark:text-slate-400">调整筛选，或前往“观察池”添加需要持续跟踪的股票</div>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full min-w-[1420px] border-collapse text-xs">
            <thead className="sticky top-0 z-10 bg-slate-100/95 text-slate-500 backdrop-blur dark:bg-slate-900/95 dark:text-slate-400">
              <tr className="border-b border-slate-200 dark:border-slate-800">
                <th className="w-12 px-3 py-2 text-center font-medium">
                  <input
                    type="checkbox"
                    aria-label="选择当前筛选股票"
                    checked={allVisibleSelected}
                    onChange={toggleAllVisible}
                    className="h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500 dark:border-slate-600"
                  />
                </th>
                <th className="px-4 py-2 text-left font-medium">股票与分类</th>
                <th className="px-2 py-2 text-left font-medium">状态</th>
                <th className="px-3 py-2 text-left font-medium">本地结论</th>
                <th className="px-2 py-2 text-right font-medium">当前分</th>
                <th className="px-2 py-2 text-right font-medium">5日变化</th>
                <th className="px-2 py-2 text-right font-medium">20日变化</th>
                <th className="px-2 py-2 text-right font-medium">20日超额</th>
                <th className="px-2 py-2 text-right font-medium">最大回撤</th>
                <th className="px-3 py-2 text-left font-medium">评分轨迹</th>
                <th className="px-4 py-2 text-left font-medium">数据状态</th>
                <th className="px-3 py-2 text-left font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr
                  key={item.tsCode}
                  tabIndex={0}
                  onClick={() => setSelectedTsCode(item.tsCode)}
                  onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') setSelectedTsCode(item.tsCode) }}
                  className="cursor-pointer border-b border-slate-100 bg-white transition-colors motion-reduce:transition-none hover:bg-cyan-50/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-500 dark:border-slate-900 dark:bg-slate-950 dark:hover:bg-cyan-950/20"
                >
                  <td className="px-3 py-2.5 text-center" onClick={(event) => event.stopPropagation()}>
                    <input
                      type="checkbox"
                      aria-label={`选择${item.stockName}`}
                      checked={selectedCodes.has(item.tsCode)}
                      onChange={(event) => toggleSelectedCode(item.tsCode, event.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500 dark:border-slate-600"
                    />
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-900 dark:text-slate-100">{item.stockName}</span>
                      {item.isPortfolio && <span className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">持仓</span>}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                      <span className="font-mono">{item.stockCode}</span>
                      <span className="max-w-48 truncate">{item.subCategories.join(' / ') || item.categories.join(' / ') || '未分类'}</span>
                    </div>
                  </td>
                  <td className="px-2 py-2.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <TrendStateBadge state={item.trendState} />
                      {item.structureReview && <AiTrendReviewBadge review={item.structureReview} stockCode={item.stockCode} />}
                    </div>
                  </td>
                  <td className="max-w-[260px] px-3 py-2.5"><LocalSummaryCell item={item} /></td>
                  <td className="px-2 py-2.5 text-right text-base font-semibold tabular-nums text-slate-900 dark:text-slate-100">{item.totalScore ?? '—'}</td>
                  <td className={`px-2 py-2.5 text-right tabular-nums ${valueTone(item.scoreDelta5d)}`}>{formatSigned(item.scoreDelta5d)}</td>
                  <td className={`px-2 py-2.5 text-right tabular-nums ${valueTone(item.scoreDelta20d)}`}>{formatSigned(item.scoreDelta20d)}</td>
                  <td className={`px-2 py-2.5 text-right tabular-nums ${valueTone(item.benchmarkHealth?.state === 'current' ? item.facts?.excessReturn20d : null)}`}>{formatSigned(item.benchmarkHealth?.state === 'current' ? item.facts?.excessReturn20d : null, '%')}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums text-slate-600 dark:text-slate-300">{item.facts?.maxDrawdown20d == null ? '—' : `${item.facts.maxDrawdown20d.toFixed(1)}%`}</td>
                  <td className="px-3 py-1.5"><ScoreSparkline points={item.scoreHistory} label={`${item.stockName}最近评分轨迹`} /></td>
                  <td className="px-4 py-2.5">
                    <div className={item.dataCoverage.state === 'ready' ? 'text-slate-700 dark:text-slate-200' : 'text-amber-700 dark:text-amber-300'}>
                      {item.dataCoverage.state === 'ready' ? `${item.dataCoverage.bars}根日线` : `${item.dataCoverage.bars}/${item.dataCoverage.requiredBars}根`}
                    </div>
                    <div className="mt-0.5 text-[11px] text-slate-400">
                      评分 {formatTrendDate(item.scoreDate)} · 行情{item.quoteSource === 'realtime' ? ` ${item.quoteTime}` : ` ${formatTrendDate(item.quoteTime)}`}
                    </div>
                  </td>
                  <td className="px-3 py-2.5" onClick={(event) => event.stopPropagation()}>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        data-testid={`trend-ai-review-${item.stockCode}`}
                        onClick={() => { void reviewOne(item) }}
                        disabled={reviewingCodes.has(item.tsCode) || batchRunning || startingDiscussion}
                        className="min-h-9 whitespace-nowrap rounded-md border border-violet-200 bg-violet-50 px-2.5 text-[11px] font-semibold text-violet-800 transition-colors hover:border-violet-300 hover:bg-violet-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 disabled:cursor-wait disabled:opacity-50 dark:border-violet-800 dark:bg-violet-950/45 dark:text-violet-200 dark:hover:bg-violet-900/55"
                      >
                        {reviewingCodes.has(item.tsCode) ? '复核中…' : item.structureReview?.stale ? '重新复核' : 'AI复核结构'}
                      </button>
                      <button
                        type="button"
                        data-testid={`trend-ai-review-discussion-${item.stockCode}`}
                        onClick={() => { void discussReview(item) }}
                        disabled={!item.structureReview || item.structureReview.stale || batchRunning || startingDiscussion}
                        className="min-h-9 whitespace-nowrap rounded-md border border-indigo-200 bg-indigo-50 px-2.5 text-[11px] font-semibold text-indigo-800 transition-colors hover:border-indigo-300 hover:bg-indigo-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-indigo-800 dark:bg-indigo-950/45 dark:text-indigo-200 dark:hover:bg-indigo-900/55"
                      >
                        {startingDiscussion ? '打开讨论中…' : '带着复核去讨论'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <StockKlineChipDrawer
          tsCode={selected.tsCode}
          stockName={selected.stockName}
          onClose={() => setSelectedTsCode(null)}
          onNavigate={() => {
            navigateToStock(selected.stockCode, selected.stockName)
            setSelectedTsCode(null)
          }}
          onReview={() => { void reviewOne(selected) }}
          onDiscuss={selected.structureReview && !selected.structureReview.stale
            ? () => { void discussReview(selected) }
            : undefined}
        />
      )}
    </div>
  )
}

function LocalSummaryCell({ item }: { item: TrendWorkbenchItem }) {
  const summary = buildLocalTrendSummary(item)
  return (
    <div data-testid={`local-trend-radar-${item.stockCode}`} data-headline={summary.headline} data-summary-status={summary.status}>
      <div className="leading-4 text-slate-700 dark:text-slate-200">{summary.headline}</div>
      <div className={`mt-1 text-[10px] ${summaryStatusTone(summary.status)}`}>本地规则 · {summaryStatusLabel(summary.status)}{summary.validWeightPct == null ? '' : ` · 权重${summary.validWeightPct}%`}</div>
    </div>
  )
}

function summaryStatusLabel(status: LocalTrendSummaryStatus): string {
  if (status === 'ready') return '事实完整'
  if (status === 'degraded') return '部分维度'
  return '证据不足'
}

function summaryStatusTone(status: LocalTrendSummaryStatus): string {
  if (status === 'ready') return 'text-cyan-700 dark:text-cyan-300'
  if (status === 'degraded') return 'text-amber-700 dark:text-amber-300'
  return 'text-rose-700 dark:text-rose-300'
}

function RadarSummary({ label, value, tone }: { label: string; value: number; tone: 'positive' | 'risk' | 'warning' | 'neutral' }) {
  const valueClass = tone === 'positive'
    ? 'text-rose-600 dark:text-rose-300'
    : tone === 'risk'
      ? 'text-emerald-600 dark:text-emerald-300'
      : tone === 'warning'
        ? 'text-amber-600 dark:text-amber-300'
        : 'text-slate-900 dark:text-slate-100'
  return (
    <div className="border-r border-slate-200 px-4 py-3 last:border-r-0 dark:border-slate-800 sm:px-5">
      <div className="text-[11px] text-slate-500 dark:text-slate-400">{label}</div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${valueClass}`}>{value}</div>
    </div>
  )
}

function RadarSkeleton() {
  return (
    <div className="space-y-2 p-5" aria-label="趋势雷达加载中">
      {Array.from({ length: 8 }, (_, index) => <div key={index} className="h-12 animate-pulse rounded bg-slate-200 motion-reduce:animate-none dark:bg-slate-800" />)}
    </div>
  )
}
