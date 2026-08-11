import React, { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { useAppStore } from '../../store/appStore'
import type { StockNavigationContext } from '../../store/appStore'
import { SignalCard, type DecisionSignalItem } from './SignalCard'
import { SignalFilters } from './SignalFilters'
import IndustryAnalysisDrawer from '../IndustryChain/IndustryAnalysisDrawer'
import { buildDecisionHomeModel, type DecisionSection } from './decisionSections'
import { SignalLifecycleDrawer } from './SignalLifecycleDrawer'
import type { InitializationAction, InitializationModel } from '../Onboarding/initializationModel'
import { buildDecisionEmptyStateModel } from './decisionEmptyStateModel'
import type { InitializationFlowState } from '../Onboarding/initializationTaskModel'
import { buildDecisionActionQueue } from './decisionActionQueue'
import { buildDecisionProgressModel } from './decisionProgressModel'
import { ActionQueuePanel, progressPct } from './ActionQueuePanel'
import { HistoryReviewPanel } from './HistoryReviewPanel'
import type { DecisionHistorySignalsData, DecisionPortfolioRiskReviewData, DecisionReviewStatsData, DecisionSignalDateContextData } from './decisionReviewStatsModel'
import { isPortfolioSignal, isRiskSignal } from './decisionSections'
import {
  buildPortfolioActionQueue,
  buildPortfolioCommandSummary,
  buildPortfolioProgressModel,
  type PortfolioHoldingRow,
} from './portfolioCommandModel'
import { StockJudgmentPanel } from './StockJudgmentPanel'
import type { DecisionActionItem } from './decisionActionQueue'
import { applyStockJudgment, type StockJudgmentTag } from './stockJudgmentModel'
import {
  buildDailyReviewReport,
  buildWeeklyReviewReport,
  WEEKLY_REVIEW_RANGE_DAYS,
  type ReviewAiNarrative,
  type ReviewDayContextInput,
  type ReviewReport,
} from './reviewReportModel'
import { ReviewReportPanel } from './ReviewReportPanel'
import { ReviewReportHistoryPanel, type SavedReviewReportSummaryItem } from './ReviewReportHistoryPanel'
import { OutcomeMemoryPanel } from './OutcomeMemoryPanel'
import type { DecisionOutcomeMemoryData } from './decisionOutcomeMemoryModel'
import { JudgmentHistoryPanel, type DecisionJudgmentSummaryItem } from './JudgmentHistoryPanel'
import { JudgmentFollowUpPanel, type DecisionJudgmentFollowUpTaskItem } from './JudgmentFollowUpPanel'
import { useResearchDiscussionNavigation } from '../ResearchDiscussion/useResearchDiscussionNavigation'
import { PremarketScenarioDrawer } from './PremarketScenarioDrawer'
import { buildTodayBriefModel, toTodayBriefAiFacts } from './todayBriefModel'
import { TodayBriefPanel, type TodayBriefAiState } from './TodayBriefPanel'

type ReviewReportSaveState = 'idle' | 'saving' | 'saved' | 'error'

interface SavedReviewReportMeta {
  id: string
  versionNumber: number
  versionCount: number
  savedAt: number
}

interface PendingReviewReportSave {
  requestId: string
  periodStart: string
  periodEnd: string
  report: ReviewReport
}

function formatChinaDate(ms: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(ms))
}

function formatCompactDate(value: string): string {
  const compact = value.replace(/-/g, '')
  if (!/^\d{8}$/.test(compact)) return value
  return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`
}

function reviewReportPeriod(report: ReviewReport): { periodStart: string; periodEnd: string } {
  const periodEnd = formatChinaDate(report.generatedAt)
  if (report.kind === 'daily') return { periodStart: periodEnd, periodEnd }
  const start = new Date(`${periodEnd}T00:00:00+08:00`)
  start.setUTCDate(start.getUTCDate() - (report.rangeDays - 1))
  return { periodStart: formatChinaDate(start.getTime()), periodEnd }
}

function createRequestId(): string {
  return crypto.randomUUID()
}

type DecisionStatus = 'NEW' | 'READ' | 'WATCHING' | 'DISMISSED' | 'EXPIRED'
type DecisionType = 'ALERT' | 'OPPORTUNITY' | 'RISK' | 'INFO'
type DecisionSource = 'news' | 'ai' | 'short_term' | 'trend' | 'market' | 'sector_flow' | 'manual'
type WorkspaceTab = 'brief' | 'priority' | DecisionSection['key'] | 'history'
type ReviewHintsTab = 'noise' | 'repeated' | 'pending'
type ReviewSideTab = 'portfolio' | 'review' | 'outcome'

function decisionReturnScrollSelector(stateKey?: string): string {
  if (stateKey === 'review-report') return '[data-testid="review-report-scroll"]'
  if (stateKey === 'judgment-history') return '[data-testid="judgment-history-scroll"]'
  if (stateKey === 'stock-judgment') return '[data-testid="stock-judgment-scroll"]'
  if (stateKey === 'signal-detail') return '[data-testid="signal-lifecycle-scroll"]'
  return '[data-testid="decision-workspace-scroll"]'
}

interface DecisionCenterProps {
  initialization?: InitializationModel | null
  initializationFlow?: InitializationFlowState
  onOpenGuide?: () => void
  onStartInitialization?: () => void
  onOpenConfig?: (tab: 'settings' | 'datasource' | 'ai-config' | 'diagnostics') => void
}

export function DecisionCenter({ initialization = null, initializationFlow, onOpenGuide, onStartInitialization, onOpenConfig }: DecisionCenterProps) {
  const summary = useAppStore((s) => s.decisionSignalSummary)
  const loadSummary = useAppStore((s) => s.loadDecisionSignalSummary)
  const navigateToStock = useAppStore((s) => s.navigateToStock)
  const decisionCenterRefresh = useAppStore((s) => s.decisionCenterRefresh)
  const decisionCenterFilters = useAppStore((s) => s.decisionCenterFilters)
  const setDecisionCenterFilters = useAppStore((s) => s.setDecisionCenterFilters)
  const startFirstPortfolioJourney = useAppStore((s) => s.startFirstPortfolioJourney)
  const discussionReturnTarget = useAppStore((s) => s.pendingResearchDiscussionReturnTarget)
  const clearDiscussionReturnTarget = useAppStore((s) => s.clearResearchDiscussionReturnTarget)
  const premarketScenarioOpenRequest = useAppStore((s) => s.premarketScenarioOpenRequest)
  const { start: startDiscussion, starting: startingDiscussion, error: discussionError, clearError: clearDiscussionError } = useResearchDiscussionNavigation()
  const [signals, setSignals] = useState<DecisionSignalItem[]>([])
  const [briefContextSignals, setBriefContextSignals] = useState<DecisionSignalItem[]>([])
  const [signalDateContext, setSignalDateContext] = useState<DecisionSignalDateContextData | null>(null)
  const [loading, setLoading] = useState(false)
  const [signalsReady, setSignalsReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { status, type, source, portfolioOnly, minPriority, viewMode } = decisionCenterFilters
  const isPortfolioView = viewMode === 'portfolio'
  // FR-171: 产业链传导分析模态框
  const [showSupplyChain, setShowSupplyChain] = useState(false)
  const [supplyChainText, setSupplyChainText] = useState('')
  const [lifecycleSignal, setLifecycleSignal] = useState<DecisionSignalItem | null>(null)
  const [judgmentSignal, setJudgmentSignal] = useState<DecisionSignalItem | null>(null)
  const [judgmentActionItem, setJudgmentActionItem] = useState<DecisionActionItem | null>(null)
  const [judgmentSaving, setJudgmentSaving] = useState(false)
  const [judgmentError, setJudgmentError] = useState<string | null>(null)
  const [reviewReport, setReviewReport] = useState<ReviewReport | null>(null)
  const [reviewReportOpen, setReviewReportOpen] = useState(false)
  const [reviewReportLoading, setReviewReportLoading] = useState(false)
  const [reviewReportError, setReviewReportError] = useState<string | null>(null)
  const [reviewReportSaveState, setReviewReportSaveState] = useState<ReviewReportSaveState>('idle')
  const [reviewReportSaveError, setReviewReportSaveError] = useState<string | null>(null)
  const [savedReviewReportMeta, setSavedReviewReportMeta] = useState<SavedReviewReportMeta | null>(null)
  const [pendingReviewReportSave, setPendingReviewReportSave] = useState<PendingReviewReportSave | null>(null)
  const [reviewReportHistoryOpen, setReviewReportHistoryOpen] = useState(false)
  const [judgmentHistoryOpen, setJudgmentHistoryOpen] = useState(false)
  const [initialJudgmentId, setInitialJudgmentId] = useState<string | null>(null)
  const [judgmentFollowUps, setJudgmentFollowUps] = useState<DecisionJudgmentFollowUpTaskItem[]>([])
  const [judgmentFollowUpsLoading, setJudgmentFollowUpsLoading] = useState(false)
  const [judgmentFollowUpsError, setJudgmentFollowUpsError] = useState<string | null>(null)
  const [reviewReportHistoryRefresh, setReviewReportHistoryRefresh] = useState(0)
  const reviewAiSeqRef = useRef(0)
  const savedReviewReportIdRef = useRef<string | null>(null)
  const pendingAiPatchRef = useRef<ReviewAiNarrative | null>(null)
  const reviewReportRef = useRef<ReviewReport | null>(null)
  reviewReportRef.current = reviewReport
  const [reviewAiBusy, setReviewAiBusy] = useState(false)
  const [reviewStats, setReviewStats] = useState<DecisionReviewStatsData | null>(null)
  const [reviewRangeDays] = useState(30)
  const [reviewLoading, setReviewLoading] = useState(false)
  const [reviewError, setReviewError] = useState<string | null>(null)
  const [historyData, setHistoryData] = useState<DecisionHistorySignalsData | null>(null)
  const [historyRangeDays, setHistoryRangeDays] = useState(30)
  const [historyTradeDate, setHistoryTradeDate] = useState('')
  const [historyPortfolioOnly, setHistoryPortfolioOnly] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [portfolioRiskData, setPortfolioRiskData] = useState<DecisionPortfolioRiskReviewData | null>(null)
  const [portfolioRiskRangeDays, setPortfolioRiskRangeDays] = useState(30)
  const [portfolioRiskLoading, setPortfolioRiskLoading] = useState(false)
  const [portfolioRiskError, setPortfolioRiskError] = useState<string | null>(null)
  const [holdings, setHoldings] = useState<PortfolioHoldingRow[] | null>(null)
  // FR-234: 事后对照
  const [outcomeMemory, setOutcomeMemory] = useState<DecisionOutcomeMemoryData | null>(null)
  const [outcomeLoading, setOutcomeLoading] = useState(false)
  const [outcomeError, setOutcomeError] = useState<string | null>(null)
  // FR-262: 默认进入「今日提炼」；组合/市场视图均如此
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>('brief')
  const [briefAiState, setBriefAiState] = useState<TodayBriefAiState>({
    status: 'idle',
    text: null,
    errorMessage: null,
  })
  const [briefAiBusy, setBriefAiBusy] = useState(false)
  const briefAiSeqRef = useRef(0)
  const [reviewHintsOpen, setReviewHintsOpen] = useState(false)
  const [reviewHintsTab, setReviewHintsTab] = useState<ReviewHintsTab>('noise')
  const [premarketScenarioOpen, setPremarketScenarioOpen] = useState(false)

  useEffect(() => {
    if (premarketScenarioOpenRequest > 0) setPremarketScenarioOpen(true)
  }, [premarketScenarioOpenRequest])
  const workspaceScrollRef = useRef<HTMLDivElement>(null)
  const pendingReturnScrollRef = useRef<{ stateKey?: string; scrollTop: number } | null>(null)

  const filters = useMemo(() => {
    const result: {
      statuses?: DecisionStatus[]
      types?: DecisionType[]
      sourceModules?: DecisionSource[]
      minPriority: number
      limit: number
      portfolioOnly?: boolean
    } = { minPriority, limit: 200 }
    if (status === 'active') result.statuses = ['NEW', 'READ', 'WATCHING']
    else if (status !== 'all') result.statuses = [status as DecisionStatus]
    if (type !== 'all') result.types = [type as DecisionType]
    if (source !== 'all') result.sourceModules = [source as DecisionSource]
    // 组合模式始终只拉持仓相关信号, 不依赖类型下拉弱入口
    if (isPortfolioView || portfolioOnly) result.portfolioOnly = true
    return result
  }, [status, type, source, portfolioOnly, minPriority, isPortfolioView])

  const homeModel = useMemo(() => buildDecisionHomeModel(signals), [signals])
  const todayBrief = useMemo(() => {
    const byId = new Map<number, DecisionSignalItem>()
    for (const item of [...signals, ...briefContextSignals]) byId.set(item.id, item)
    return buildTodayBriefModel([...byId.values()])
  }, [briefContextSignals, signals])

  useEffect(() => {
    briefAiSeqRef.current += 1
    setBriefAiBusy(false)
    setBriefAiState({ status: 'idle', text: null, errorMessage: null })
  }, [todayBrief.generatedAt, todayBrief.headline, todayBrief.noiseCount, todayBrief.portfolioClues.length, todayBrief.strategyClues.length])

  const runTodayBriefAi = useCallback(async () => {
    const seq = ++briefAiSeqRef.current
    setBriefAiBusy(true)
    setBriefAiState({ status: 'pending', text: null, errorMessage: null })
    try {
      const res = await window.api.decision.generateTodayBriefAi({ brief: toTodayBriefAiFacts(todayBrief) })
      if (seq !== briefAiSeqRef.current) return
      if (res.data?.status === 'ready' && res.data.text) {
        setBriefAiState({
          status: 'ready',
          text: res.data.text,
          errorMessage: null,
          provider: res.data.provider,
          model: res.data.model,
        })
      } else {
        const message = res.data?.errorMessage
          ?? (typeof res.error === 'string' ? res.error : res.error?.message)
          ?? res.message
          ?? 'AI 提炼失败'
        setBriefAiState({
          status: 'error',
          text: null,
          errorMessage: message,
          provider: res.data?.provider,
          model: res.data?.model,
        })
      }
    } catch (err) {
      if (seq !== briefAiSeqRef.current) return
      setBriefAiState({
        status: 'error',
        text: null,
        errorMessage: err instanceof Error ? err.message : String(err),
      })
    } finally {
      if (seq === briefAiSeqRef.current) setBriefAiBusy(false)
    }
  }, [todayBrief])

  const openPendingSignals = useCallback(() => {
    setDecisionCenterFilters({
      status: 'NEW',
      type: 'all',
      source: 'all',
      portfolioOnly: isPortfolioView ? true : false,
      minPriority: 1,
      viewMode: isPortfolioView ? 'portfolio' : 'market',
    })
    setWorkspaceTab('priority')
    window.requestAnimationFrame(() => {
      workspaceScrollRef.current?.scrollTo({ top: 0 })
    })
  }, [isPortfolioView, setDecisionCenterFilters])
  const portfolioCommand = useMemo(
    () => buildPortfolioCommandSummary(signals, holdings, portfolioRiskData),
    [holdings, portfolioRiskData, signals],
  )
  const actionQueue = useMemo(
    () => (isPortfolioView ? buildPortfolioActionQueue(signals, holdings) : buildDecisionActionQueue(signals)),
    [holdings, isPortfolioView, signals],
  )
  const progressModel = useMemo(
    () => (isPortfolioView ? buildPortfolioProgressModel(signals, holdings) : buildDecisionProgressModel(signals)),
    [holdings, isPortfolioView, signals],
  )
  const holdingsLoaded = holdings != null
  const hasNoHoldings = holdingsLoaded && holdings.length === 0
  const hasDueJudgmentFollowUps = judgmentFollowUps.length > 0
  const commandMetrics = useMemo(() => {
    if (isPortfolioView) {
      return portfolioCommand.metrics.map((item) => ({
        label: item.label,
        value: item.value,
        hint: item.hint,
        tone: item.tone,
        tag: item.tag,
        actionLabel: `查看${item.label}`,
        testId: `decision-metric-portfolio-${item.label}`,
      }))
    }
    return buildDecisionCommandMetrics(signals, summary, reviewStats, portfolioRiskData)
  }, [isPortfolioView, portfolioCommand.metrics, portfolioRiskData, reviewStats, signals, summary])
  const emptyState = useMemo(() => buildDecisionEmptyStateModel(initialization, initializationFlow), [initialization, initializationFlow])
  const hasGlobalSignals = (summary?.totalToday ?? 0) > 0
  const showBriefWorkbench = (
    signals.length > 0
    || briefContextSignals.length > 0
    || (historyData?.items.length ?? 0) > 0
    || (isPortfolioView && actionQueue.length > 0)
    || (isPortfolioView && hasDueJudgmentFollowUps)
    || hasGlobalSignals
  ) && !(isPortfolioView && hasNoHoldings && !hasDueJudgmentFollowUps)

  // 组合视图无持仓信号时，避免停在空的分区 Tab；保留用户主动打开的「历史回看」
  useEffect(() => {
    if (!loading && showBriefWorkbench && signals.length === 0 && hasGlobalSignals) {
      setWorkspaceTab((current) => (current === 'brief' || current === 'history' ? current : 'brief'))
    }
  }, [hasGlobalSignals, loading, showBriefWorkbench, signals.length])

  const openCommandMetric = useCallback((label: string) => {
    if (label === '复盘积压') {
      setReviewHintsTab('pending')
      setReviewHintsOpen(true)
      return
    }
    if (label === '高优先级') {
      setDecisionCenterFilters({
        status: 'NEW',
        type: 'all',
        source: 'all',
        portfolioOnly: false,
        minPriority: 4,
        viewMode: 'market',
      })
      setWorkspaceTab('priority')
      return
    }
    if (label === '持仓风险') {
      setDecisionCenterFilters({
        status: 'active',
        type: 'RISK',
        source: 'all',
        portfolioOnly: true,
        minPriority: 1,
        viewMode: 'portfolio',
      })
      setWorkspaceTab('risk')
      return
    }
    if (label === '短线机会') {
      setDecisionCenterFilters({
        status: 'active',
        type: 'OPPORTUNITY',
        source: 'short_term',
        portfolioOnly: false,
        minPriority: 1,
        viewMode: 'market',
      })
      setWorkspaceTab('strategy')
      return
    }
    if (label === '持仓数') {
      setWorkspaceTab('portfolio')
      return
    }
    if (label === '证据缺口') {
      setDecisionCenterFilters({
        status: 'active',
        type: 'all',
        source: 'all',
        portfolioOnly: true,
        minPriority: 1,
        viewMode: 'portfolio',
      })
      setWorkspaceTab('risk')
      return
    }
    if (label === '组合未处理') {
      setDecisionCenterFilters({
        status: 'NEW',
        type: 'all',
        source: 'all',
        portfolioOnly: true,
        minPriority: 1,
        viewMode: 'portfolio',
      })
      setWorkspaceTab('priority')
    }
  }, [setDecisionCenterFilters])

  const openJudgment = useCallback((signal: DecisionSignalItem, actionItem?: DecisionActionItem | null) => {
    if (!signal.tsCode) {
      setLifecycleSignal(signal)
      return
    }
    setJudgmentError(null)
    setJudgmentActionItem(actionItem ?? null)
    setJudgmentSignal(signal)
  }, [])

  const loadSignals = useCallback(async (): Promise<DecisionSignalItem[]> => {
    setLoading(true)
    setError(null)
    try {
      const res = await window.api.decision.getTodaySignals(filters)
      if (!res.ok) throw new Error(res.message || res.error || '加载今日信号失败')
      const next = [...(res.data ?? []), ...(res.carryover ?? [])] as DecisionSignalItem[]
      setSignals(next)
      if (res.context) {
        setSignalDateContext(res.context)
        setHistoryTradeDate((current) => current || formatCompactDate(res.context!.displayDate))
      }
      // FR-262: 组合视图仍为提炼补一块非持仓市场/策略/资讯上下文（不进入左侧处置队列）
      if (isPortfolioView) {
        try {
          const ctx = await window.api.decision.getTodaySignals({
            statuses: ['NEW', 'READ', 'WATCHING'],
            minPriority: 3,
            limit: 80,
            portfolioOnly: false,
          })
          if (ctx.ok) {
            const rows = [...(ctx.data ?? []), ...(ctx.carryover ?? [])] as DecisionSignalItem[]
            setBriefContextSignals(
              rows.filter((row) =>
                row.sourceModule === 'sector_flow'
                || row.sourceModule === 'market'
                || row.sourceModule === 'short_term'
                || row.sourceModule === 'news'
                || row.sourceModule === 'ai',
              ),
            )
          } else {
            setBriefContextSignals([])
          }
        } catch {
          setBriefContextSignals([])
        }
      } else {
        setBriefContextSignals([])
      }
      await loadSummary()
      return next
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      return []
    } finally {
      setLoading(false)
      setSignalsReady(true)
    }
  }, [filters, isPortfolioView, loadSummary])

  const loadReviewStats = useCallback(async () => {
    setReviewLoading(true)
    setReviewError(null)
    try {
      const res = await window.api.decision.getReviewStats({ rangeDays: reviewRangeDays, limit: 30 })
      if (!res.ok) throw new Error(res.message || res.error || '加载复盘统计失败')
      setReviewStats((res.data ?? null) as DecisionReviewStatsData | null)
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : String(err))
    } finally {
      setReviewLoading(false)
    }
  }, [reviewRangeDays])

  const loadHistorySignals = useCallback(async () => {
    setHistoryLoading(true)
    setHistoryError(null)
    try {
      const res = await window.api.decision.getHistorySignals({
        rangeDays: historyRangeDays,
        portfolioOnly: historyPortfolioOnly,
        tradeDate: historyTradeDate || undefined,
        limit: 100,
      })
      if (!res.ok) throw new Error(res.message || res.error || '加载历史信号失败')
      setHistoryData((res.data ?? null) as DecisionHistorySignalsData | null)
    } catch (err) {
      setHistoryError(err instanceof Error ? err.message : String(err))
    } finally {
      setHistoryLoading(false)
    }
  }, [historyPortfolioOnly, historyRangeDays, historyTradeDate])

  const loadPortfolioRiskReview = useCallback(async () => {
    setPortfolioRiskLoading(true)
    setPortfolioRiskError(null)
    try {
      const res = await window.api.decision.getPortfolioRiskReview({ rangeDays: portfolioRiskRangeDays, limit: 8 })
      if (!res.ok) throw new Error(res.message || res.error || '加载持仓风险复盘失败')
      setPortfolioRiskData((res.data ?? null) as DecisionPortfolioRiskReviewData | null)
    } catch (err) {
      setPortfolioRiskError(err instanceof Error ? err.message : String(err))
    } finally {
      setPortfolioRiskLoading(false)
    }
  }, [portfolioRiskRangeDays])

  const loadHoldings = useCallback(async (): Promise<PortfolioHoldingRow[] | null> => {
    try {
      const res = await window.api.portfolio.list()
      if (!res.ok || !res.data) {
        setHoldings([])
        return []
      }
      const next = res.data.map((row) => ({
        tsCode: row.tsCode,
        stockName: row.stockName,
        addedAt: row.addedAt,
        costPrice: row.costPrice ?? null,
      }))
      setHoldings(next)
      return next
    } catch {
      // 持仓列表失败时回退到风险复盘 totalPortfolio, 不阻断看板
      setHoldings(null)
      return null
    }
  }, [])

  const loadOutcomeMemory = useCallback(async () => {
    setOutcomeLoading(true)
    setOutcomeError(null)
    try {
      // preload 热更新不会自动进主进程桥; 旧进程缺方法时给出可操作提示
      const apiFn = window.api?.decision?.getOutcomeMemory
      if (typeof apiFn !== 'function') {
        throw new Error('事后对照接口未加载, 请完全退出并重新运行 npm run dev 后重试')
      }
      const res = await apiFn({
        rangeDays: 30,
        horizonDays: 5,
        portfolioOnly: true,
        limit: 50,
      })
      if (!res.ok) throw new Error(res.message || res.error || '加载事后对照失败')
      setOutcomeMemory((res.data ?? null) as DecisionOutcomeMemoryData | null)
    } catch (err) {
      setOutcomeError(err instanceof Error ? err.message : String(err))
    } finally {
      setOutcomeLoading(false)
    }
  }, [])

  const loadJudgmentFollowUps = useCallback(async () => {
    setJudgmentFollowUpsLoading(true)
    setJudgmentFollowUpsError(null)
    try {
      const response = await window.api.decision.listDueJudgmentFollowUps({ limit: 30 })
      if (!response.ok || !response.data) throw new Error(response.message || response.error || '加载待回访失败')
      setJudgmentFollowUps(response.data.items as DecisionJudgmentFollowUpTaskItem[])
    } catch (caught) {
      setJudgmentFollowUpsError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setJudgmentFollowUpsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadSignals()
  }, [loadSignals])

  useEffect(() => {
    void loadReviewStats()
  }, [loadReviewStats])

  useEffect(() => {
    void loadHistorySignals()
  }, [loadHistorySignals])

  useEffect(() => {
    if (!loading && signalsReady && signals.length === 0 && (historyData?.items.length ?? 0) > 0) {
      setWorkspaceTab('history')
    }
  }, [historyData?.items.length, loading, signals.length, signalsReady])

  useEffect(() => {
    void loadPortfolioRiskReview()
  }, [loadPortfolioRiskReview])

  useEffect(() => {
    void loadHoldings()
  }, [loadHoldings])

  useEffect(() => {
    void loadOutcomeMemory()
  }, [loadOutcomeMemory])

  useEffect(() => {
    void loadJudgmentFollowUps()
  }, [loadJudgmentFollowUps])

  useEffect(() => {
    const off = window.api.decision.onSignalCreated(() => {
      void loadSignals()
    })
    return () => { off() }
  }, [loadSignals])

  useEffect(() => {
    if (!decisionCenterRefresh) return
    void loadSignals()
    void loadReviewStats()
    void loadHistorySignals()
    void loadPortfolioRiskReview()
    void loadHoldings()
    void loadOutcomeMemory()
    void loadJudgmentFollowUps()
  }, [decisionCenterRefresh?.version, loadHistorySignals, loadHoldings, loadJudgmentFollowUps, loadOutcomeMemory, loadPortfolioRiskReview, loadReviewStats, loadSignals])

  useEffect(() => {
    if (!discussionReturnTarget || discussionReturnTarget.tab !== 'decision-center') return
    pendingReturnScrollRef.current = typeof discussionReturnTarget.scrollTop === 'number'
      ? { stateKey: discussionReturnTarget.stateKey, scrollTop: Math.max(0, discussionReturnTarget.scrollTop) }
      : null
    const entityId = discussionReturnTarget.entityId ?? null
    if (discussionReturnTarget.stateKey === 'review-report' && entityId) {
      clearDiscussionReturnTarget()
      void window.api.decision.getReviewReport(entityId).then((response) => {
        if (!response.ok || !response.data) {
          setError(response.message || response.error || '返回后打开复盘报告失败')
          return
        }
        setReviewReport(response.data.snapshot as ReviewReport)
        setPendingReviewReportSave(null)
        setReviewReportSaveError(null)
        setReviewReportSaveState('saved')
        savedReviewReportIdRef.current = response.data.id
        setSavedReviewReportMeta({
          id: response.data.id,
          versionNumber: response.data.versionNumber,
          versionCount: response.data.versionCount,
          savedAt: response.data.savedAt,
        })
        setReviewReportError(null)
        setReviewReportLoading(false)
        setReviewReportOpen(true)
      })
      return
    }
    if (discussionReturnTarget.stateKey === 'judgment-history' && entityId) {
      setInitialJudgmentId(entityId)
      setJudgmentHistoryOpen(true)
      clearDiscussionReturnTarget()
      return
    }
    if ((discussionReturnTarget.stateKey === 'signal-detail' || discussionReturnTarget.stateKey === 'stock-judgment') && entityId) {
      if (!signalsReady) return
      const signal = signals.find((item) => String(item.id) === entityId)
      if (signal) {
        if (discussionReturnTarget.stateKey === 'stock-judgment') openJudgment(signal)
        else setLifecycleSignal(signal)
      } else {
        setError('来源信号已不可用，已返回并保留当前筛选状态')
      }
      clearDiscussionReturnTarget()
      return
    }
    clearDiscussionReturnTarget()
  }, [clearDiscussionReturnTarget, discussionReturnTarget, openJudgment, signals, signalsReady])

  useEffect(() => {
    const pending = pendingReturnScrollRef.current
    if (!pending) return
    let frame = 0
    let attempts = 0
    const restore = () => {
      const element = document.querySelector<HTMLElement>(decisionReturnScrollSelector(pending.stateKey))
      if (element) {
        element.scrollTop = pending.scrollTop
        pendingReturnScrollRef.current = null
        return
      }
      attempts += 1
      if (attempts < 5) frame = requestAnimationFrame(restore)
    }
    frame = requestAnimationFrame(restore)
    return () => cancelAnimationFrame(frame)
  }, [discussionReturnTarget, judgmentHistoryOpen, judgmentSignal, lifecycleSignal, reviewReportOpen, signalsReady, workspaceTab])

  const discussSignal = useCallback(async (signal: DecisionSignalItem, stateKey: 'signal-detail' | 'stock-judgment' = 'signal-detail') => {
    clearDiscussionError()
    await startDiscussion({
      origin: { type: 'decision_signal', id: String(signal.id) },
      initialQuestion: `请基于这条信号，分析它对当前持仓判断和产业研究可能产生的影响：${signal.title}`,
      mode: 'continue_or_create',
      returnTarget: { tab: 'decision-center', entityId: String(signal.id), stateKey },
    })
  }, [clearDiscussionError, startDiscussion])

  const discussReport = useCallback(async (reportId: string, kind: ReviewReport['kind']) => {
    clearDiscussionError()
    await startDiscussion({
      origin: { type: kind === 'daily' ? 'daily_review' : 'weekly_review', id: reportId },
      initialQuestion: kind === 'daily'
        ? '请结合这份今日复盘，找出最值得继续验证的产业线索、风险和假设。'
        : '请结合这份周度复盘，分析哪些重复信号值得沉淀到产业研究。',
      mode: 'continue_or_create',
      returnTarget: { tab: 'decision-center', entityId: reportId, stateKey: 'review-report' },
    })
  }, [clearDiscussionError, startDiscussion])

  const discussJudgment = useCallback(async (judgment: DecisionJudgmentSummaryItem) => {
    clearDiscussionError()
    await startDiscussion({
      origin: { type: 'judgment', id: judgment.id },
      initialQuestion: `请复核这条判断的依据、反证条件和后续产业研究价值：${judgment.stockName || judgment.tsCode}`,
      mode: 'continue_or_create',
      returnTarget: { tab: 'decision-center', entityId: judgment.id, stateKey: 'judgment-history' },
    })
  }, [clearDiscussionError, startDiscussion])

  const updateSignal = useCallback(async (id: number, action: 'read' | 'watch' | 'dismiss') => {
    const apiCall = action === 'read'
      ? window.api.decision.markRead
      : action === 'watch'
        ? window.api.decision.watch
        : window.api.decision.dismiss
    const res = await apiCall(id)
    if (!res.ok) {
      setError(res.message || res.error || '更新信号状态失败')
      return
    }
    await loadSignals()
    await loadReviewStats()
    await loadHistorySignals()
    await loadPortfolioRiskReview()
    await loadHoldings()
  }, [loadHistorySignals, loadHoldings, loadPortfolioRiskReview, loadReviewStats, loadSignals])

  const refreshAfterSignalMutation = useCallback(async () => {
    await loadSignals()
    await loadReviewStats()
    await loadHistorySignals()
    await loadPortfolioRiskReview()
    await loadHoldings()
  }, [loadHistorySignals, loadHoldings, loadPortfolioRiskReview, loadReviewStats, loadSignals])

  const quickResolveSignals = useCallback(async (ids: number[]) => {
    const unique = [...new Set(ids.filter((id) => Number.isFinite(id)))]
    if (unique.length === 0) return { ok: true as const, failed: 0 }
    let failed = 0
    for (const id of unique) {
      const res = await window.api.decision.resolve(id, 'RESOLVED_VALID')
      if (!res.ok) failed += 1
    }
    await refreshAfterSignalMutation()
    return { ok: failed === 0, failed }
  }, [refreshAfterSignalMutation])

  const quickDismissSignals = useCallback(async (ids: number[]) => {
    const unique = [...new Set(ids.filter((id) => Number.isFinite(id)))]
    if (unique.length === 0) return { ok: true as const, failed: 0 }
    let failed = 0
    for (const id of unique) {
      const res = await window.api.decision.dismiss(id, '噪音/快捷忽略')
      if (!res.ok) failed += 1
    }
    await refreshAfterSignalMutation()
    return { ok: failed === 0, failed }
  }, [refreshAfterSignalMutation])

  const handleNavigateStock = useCallback((signal: DecisionSignalItem) => {
    if (!signal.tsCode) return
    const normalized = signal.tsCode.includes('.') ? signal.tsCode.split('.')[0] : signal.tsCode
    const context: StockNavigationContext = {
      source: 'decision-signal',
      code: normalized,
      name: signal.stockName,
      signalId: signal.id,
      sourceModule: signal.sourceModule,
      strategyKey: signal.strategyKey,
      signalType: signal.signalType,
      direction: signal.direction,
      priority: signal.priority,
      score: signal.score,
      confidence: signal.confidence,
      title: signal.title,
      summary: signal.summary,
      status: signal.status,
      signalTime: signal.signalTime,
      occurrenceCount: signal.occurrenceCount,
      reasonJson: signal.reasonJson,
      sourceRefJson: signal.sourceRefJson
    }
    navigateToStock(normalized, signal.stockName ?? undefined, context)
  }, [navigateToStock])

  const persistReviewReport = useCallback(async (pending: PendingReviewReportSave) => {
    setReviewReportSaveState('saving')
    setReviewReportSaveError(null)
    try {
      const res = await window.api.decision.saveReviewReport(pending)
      if (!res.ok || !res.data) throw new Error(res.message || res.error || '保存复盘报告失败')
      savedReviewReportIdRef.current = res.data.id
      setSavedReviewReportMeta({
        id: res.data.id,
        versionNumber: res.data.versionNumber,
        versionCount: res.data.versionCount,
        savedAt: res.data.savedAt,
      })
      setReviewReportHistoryRefresh((value) => value + 1)
      setReviewReportSaveState('saved')
      const pendingAi = pendingAiPatchRef.current
      if (pendingAi && reviewReportRef.current) {
        pendingAiPatchRef.current = null
        const patched = { ...reviewReportRef.current, aiNarrative: pendingAi }
        reviewReportRef.current = patched
        setReviewReport(patched)
        const updateRes = await window.api.decision.updateReviewReportSnapshot({
          id: res.data.id,
          report: patched,
        })
        if (updateRes.ok && updateRes.data) {
          setSavedReviewReportMeta({
            id: updateRes.data.id,
            versionNumber: updateRes.data.versionNumber,
            versionCount: updateRes.data.versionCount,
            savedAt: updateRes.data.savedAt,
          })
          setReviewReportHistoryRefresh((value) => value + 1)
        }
      }
    } catch (err) {
      setReviewReportSaveState('error')
      setReviewReportSaveError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  const patchSavedReviewReport = useCallback(async (report: ReviewReport) => {
    const id = savedReviewReportIdRef.current
    if (!id) {
      pendingAiPatchRef.current = report.aiNarrative ?? null
      setPendingReviewReportSave((prev) => (prev ? { ...prev, report } : prev))
      return
    }
    try {
      const res = await window.api.decision.updateReviewReportSnapshot({ id, report })
      if (!res.ok || !res.data) throw new Error(res.message || res.error || '补写 AI 研判失败')
      setSavedReviewReportMeta({
        id: res.data.id,
        versionNumber: res.data.versionNumber,
        versionCount: res.data.versionCount,
        savedAt: res.data.savedAt,
      })
      setReviewReportHistoryRefresh((value) => value + 1)
      setPendingReviewReportSave((prev) => (prev ? { ...prev, report } : prev))
    } catch (err) {
      // 软失败：本地 UI 已含 AI 段落；保存条提示但不回滚本地事实
      setReviewReportSaveState('error')
      setReviewReportSaveError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  const cancelReviewAiInFlight = useCallback(() => {
    reviewAiSeqRef.current += 1
    pendingAiPatchRef.current = null
    setReviewAiBusy(false)
  }, [])

  const runReviewAiNarrative = useCallback(async (baseReport: ReviewReport) => {
    const seq = ++reviewAiSeqRef.current
    const pendingNarrative: ReviewAiNarrative = { status: 'pending', text: null }
    const withPending = { ...baseReport, aiNarrative: pendingNarrative }
    reviewReportRef.current = withPending
    setReviewReport(withPending)
    setReviewAiBusy(true)
    try {
      const res = await window.api.decision.generateReviewAiNarrative({ report: baseReport })
      if (seq !== reviewAiSeqRef.current) return
      const narrative: ReviewAiNarrative = res.data ?? {
        status: 'error',
        text: null,
        errorCode: typeof res.error === 'object' && res.error && 'code' in res.error
          ? String((res.error as { code: string }).code)
          : 'AI_CALL_FAILED',
        errorMessage: typeof res.error === 'object' && res.error && 'message' in res.error
          ? String((res.error as { message: string }).message)
          : (res.message || 'AI 研判失败'),
      }
      const merged = { ...(reviewReportRef.current ?? baseReport), aiNarrative: narrative }
      reviewReportRef.current = merged
      setReviewReport(merged)
      await patchSavedReviewReport(merged)
    } catch (err) {
      if (seq !== reviewAiSeqRef.current) return
      const message = err instanceof Error ? err.message : String(err)
      const narrative: ReviewAiNarrative = {
        status: 'error',
        text: null,
        errorCode: 'AI_CALL_FAILED',
        errorMessage: message,
      }
      const merged = { ...(reviewReportRef.current ?? baseReport), aiNarrative: narrative }
      reviewReportRef.current = merged
      setReviewReport(merged)
      await patchSavedReviewReport(merged)
    } finally {
      if (seq === reviewAiSeqRef.current) setReviewAiBusy(false)
    }
  }, [patchSavedReviewReport])

  const queueReviewReportSave = useCallback((report: ReviewReport) => {
    pendingAiPatchRef.current = null
    savedReviewReportIdRef.current = null
    const pending = {
      requestId: createRequestId(),
      ...reviewReportPeriod(report),
      report,
    }
    setPendingReviewReportSave(pending)
    setSavedReviewReportMeta(null)
    void persistReviewReport(pending)
  }, [persistReviewReport])

  /** FR-233/FR-236/FR-250: 前端即时生成今日复盘（含日结：市场/资金/持仓/关注）、异步保存，并自动触发 AI 研判 */
  const handleGenerateDailyReview = useCallback(async () => {
    cancelReviewAiInFlight()
    setReviewReportOpen(true)
    setReviewReportLoading(true)
    setReviewReportError(null)
    try {
      const [judgmentResponse, overviewRes, dashboardRes] = await Promise.all([
        window.api.decision.listJudgments({ from: Date.now() - 24 * 60 * 60 * 1000, latestPerGroup: false, limit: 100 }),
        window.api.market.getMarketOverview().catch((err: unknown) => ({
          ok: false as const,
          error: err instanceof Error ? err.message : String(err),
        })),
        window.api.portfolio.getDashboard({ limit: 100, offset: 0 }).catch((err: unknown) => ({
          ok: false as const,
          message: err instanceof Error ? err.message : String(err),
        })),
      ])
      if (!judgmentResponse.ok) throw new Error(judgmentResponse.message || judgmentResponse.error || '加载今日判断失败')

      let marketOverview: ReviewDayContextInput['marketOverview'] = null
      let marketOverviewError: string | null = null
      if (!overviewRes || !('ok' in overviewRes) || overviewRes.ok !== true) {
        marketOverviewError = ('error' in (overviewRes ?? {}) && typeof (overviewRes as { error?: string }).error === 'string')
          ? (overviewRes as { error: string }).error
          : ('message' in (overviewRes ?? {}) && typeof (overviewRes as { message?: string }).message === 'string')
            ? (overviewRes as { message: string }).message
            : '市场概览不可用'
      } else {
        marketOverview = overviewRes.snapshot as ReviewDayContextInput['marketOverview']
      }

      let dashboardItems: ReviewDayContextInput['dashboardItems'] = null
      let dashboardError: string | null = null
      if (!dashboardRes.ok) {
        dashboardError = ('message' in dashboardRes && dashboardRes.message)
          || ('code' in dashboardRes && typeof dashboardRes.code === 'string' ? dashboardRes.code : null)
          || '持仓看板不可用'
      } else {
        dashboardItems = (dashboardRes.data ?? []) as NonNullable<ReviewDayContextInput['dashboardItems']>
      }

      const dayContext: ReviewDayContextInput = {
        marketOverview,
        marketOverviewError,
        dashboardItems,
        dashboardError,
      }

      const report = buildDailyReviewReport({
        signals,
        holdings,
        portfolioRiskData,
        judgments: (judgmentResponse.data?.items ?? []) as DecisionJudgmentSummaryItem[],
        judgmentFollowUps,
        dayContext,
      })
      reviewReportRef.current = report
      setReviewReport(report)
      queueReviewReportSave(report)
      void runReviewAiNarrative(report)
    } catch (caught) {
      setReviewReport(null)
      setReviewReportError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setReviewReportLoading(false)
    }
  }, [cancelReviewAiInFlight, holdings, judgmentFollowUps, portfolioRiskData, queueReviewReportSave, runReviewAiNarrative, signals])

  /** FR-233 P2 / FR-250: 近 7 自然日持仓相关历史 + 今日开放风险 + 自动 AI 研判 */
  const handleGenerateWeeklyReview = useCallback(async () => {
    cancelReviewAiInFlight()
    setReviewReportOpen(true)
    setReviewReportLoading(true)
    setReviewReportError(null)
    try {
      const [res, judgmentResponse] = await Promise.all([
        window.api.decision.getHistorySignals({ rangeDays: WEEKLY_REVIEW_RANGE_DAYS, portfolioOnly: true, limit: 100 }),
        window.api.decision.listJudgments({ from: Date.now() - WEEKLY_REVIEW_RANGE_DAYS * 24 * 60 * 60 * 1000, latestPerGroup: false, limit: 100 }),
      ])
      if (!res.ok || !judgmentResponse.ok) throw new Error(res.message || judgmentResponse.message || res.error || judgmentResponse.error || '加载近一周复盘事实失败')
      const historyItems = (res.data?.items ?? []) as DecisionSignalItem[]
      const report = buildWeeklyReviewReport({
        historySignals: historyItems,
        holdings,
        portfolioRiskData,
        openRiskSignals: signals,
        rangeDays: WEEKLY_REVIEW_RANGE_DAYS,
        judgments: (judgmentResponse.data?.items ?? []) as DecisionJudgmentSummaryItem[],
        judgmentFollowUps,
      })
      reviewReportRef.current = report
      setReviewReport(report)
      queueReviewReportSave(report)
      void runReviewAiNarrative(report)
    } catch (err) {
      setReviewReport(null)
      setReviewReportError(err instanceof Error ? err.message : String(err))
    } finally {
      setReviewReportLoading(false)
    }
  }, [cancelReviewAiInFlight, holdings, judgmentFollowUps, portfolioRiskData, queueReviewReportSave, runReviewAiNarrative, signals])

  const handleRetryReviewAi = useCallback(() => {
    const report = reviewReportRef.current
    if (!report || reviewAiBusy || reviewReportLoading) return
    const base = { ...report }
    delete base.aiNarrative
    void runReviewAiNarrative(base)
  }, [reviewAiBusy, reviewReportLoading, runReviewAiNarrative])

  const relatedSignalsForJudgment = useMemo(() => {
    if (!judgmentSignal?.tsCode) return []
    const code = judgmentSignal.tsCode.includes('.') ? judgmentSignal.tsCode.split('.')[0]! : judgmentSignal.tsCode
    return signals.filter((item) => {
      if (!item.tsCode) return item.id === judgmentSignal.id
      const itemCode = item.tsCode.includes('.') ? item.tsCode.split('.')[0]! : item.tsCode
      return itemCode === code
    })
  }, [judgmentSignal, signals])

  const handleSubmitJudgment = useCallback(async (payload: {
    signal: DecisionSignalItem
    tag: StockJudgmentTag
    note: string
    tsCode: string
    stockName: string
    relatedSignalIds: number[]
    evidenceSnapshot: Parameters<typeof applyStockJudgment>[0]['evidenceSnapshot']
  }) => {
    setJudgmentSaving(true)
    setJudgmentError(null)
    try {
      const { signal, tag, note, tsCode, stockName, relatedSignalIds, evidenceSnapshot } = payload
      const applied = await applyStockJudgment({
        requestId: createRequestId(),
        tsCode,
        stockName,
        tag,
        note,
        sourceSignalId: signal.id,
        relatedSignalIds,
        evidenceSnapshot,
      })
      if (!applied.ok) throw new Error(applied.message || applied.error || '保存结论失败')

      // 先刷新事实, 再用返回列表选下一条, 避免闭包旧 signals
      const [nextSignals, nextHoldings] = await Promise.all([
        loadSignals(),
        loadHoldings(),
      ])
      await Promise.all([
        loadReviewStats(),
        loadHistorySignals(),
        loadPortfolioRiskReview(),
      ])

      const nextQueue = isPortfolioView
        ? buildPortfolioActionQueue(
          nextSignals.filter((item) => item.id !== signal.id),
          nextHoldings,
        )
        : []
      const next = nextQueue[0]
      if (next?.signal.tsCode) {
        setJudgmentActionItem(next)
        setJudgmentSignal(next.signal)
      } else {
        setJudgmentSignal(null)
        setJudgmentActionItem(null)
      }
    } catch (err) {
      setJudgmentError(err instanceof Error ? err.message : String(err))
    } finally {
      setJudgmentSaving(false)
    }
  }, [isPortfolioView, loadHistorySignals, loadHoldings, loadPortfolioRiskReview, loadReviewStats, loadSignals])

  const renderSignal = useCallback((signal: DecisionSignalItem) => (
    <SignalCard
      key={signal.id}
      signal={signal}
      onRead={(id) => void updateSignal(id, 'read')}
      onWatch={(id) => void updateSignal(id, 'watch')}
      onDismiss={(id) => void updateSignal(id, 'dismiss')}
      onNavigateStock={handleNavigateStock}
      onChainAnalysis={text => { setSupplyChainText(text); setShowSupplyChain(true) }}
      onLifecycle={(item) => {
        if (isPortfolioView && item.tsCode) openJudgment(item)
        else setLifecycleSignal(item)
      }}
      onDiscuss={(item) => { void discussSignal(item) }}
      lifecycleLabel={isPortfolioView && signal.tsCode ? '研判' : '事件明细'}
    />
  ), [discussSignal, handleNavigateStock, isPortfolioView, openJudgment, updateSignal])

  const sectionByKey = useMemo(() => new Map(homeModel.sections.map(section => [section.key, section])), [homeModel.sections])
  const workspaceTabs = useMemo(() => {
    const sectionTabs = homeModel.sections.map(section => ({ key: section.key as WorkspaceTab, label: section.title, count: section.signals.length }))
    return [
      { key: 'brief' as WorkspaceTab, label: '提炼', count: todayBrief.portfolioClues.length + todayBrief.sectorClues.length + todayBrief.strategyClues.length + todayBrief.peripheralClues.length },
      { key: 'priority' as WorkspaceTab, label: '信号明细', count: homeModel.prioritySignals.length },
      ...sectionTabs,
      { key: 'history' as WorkspaceTab, label: '历史回看', count: historyData?.items?.length ?? 0 }
    ]
  }, [historyData?.items?.length, homeModel.prioritySignals.length, homeModel.sections, todayBrief.peripheralClues.length, todayBrief.portfolioClues.length, todayBrief.sectorClues.length, todayBrief.strategyClues.length])

  function handleInitializationAction(action: InitializationAction) {
    if (action.type === 'guide') {
      onOpenGuide?.()
      return
    }
    if (action.type === 'config') {
      if (action.tab === 'datasource' || action.tab === 'ai-config' || action.tab === 'diagnostics') onOpenConfig?.(action.tab)
      return
    }
    if (action.type === 'nav' && action.tab === 'decision-center') {
      void loadSignals()
      return
    }
    if (action.type === 'run' && action.runAction) {
      void window.api.diagnostics.runCheck(action.runAction).then(() => loadSignals())
    }
  }

  function handleStartInitialization() {
    if (onStartInitialization) {
      onStartInitialization()
      return
    }
    onOpenGuide?.()
  }

  return (
    <div data-testid="decision-center-root" className="grid h-full min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] gap-4 overflow-hidden bg-[linear-gradient(120deg,rgba(22,138,159,0.08),transparent_34%),linear-gradient(0deg,rgba(216,72,62,0.04),transparent_50%),#edf2f5] px-[22px] pb-[22px] pt-[18px] text-slate-900 dark:bg-[linear-gradient(120deg,rgba(20,184,166,0.08),transparent_34%),linear-gradient(0deg,rgba(239,68,68,0.05),transparent_52%),#020617] dark:text-slate-100">
      <section className="grid shrink-0 gap-[14px] xl:grid-cols-[1.15fr_1.45fr_360px]">
        <div className="relative flex min-w-0 flex-col justify-between overflow-hidden rounded-[10px] border border-slate-200/90 bg-white/90 px-4 py-3.5 shadow-sm shadow-slate-200/60 dark:border-slate-800 dark:bg-slate-900/90 dark:shadow-none">
          <div className="pointer-events-none absolute -right-10 -top-16 h-40 w-40 rounded-full bg-red-400/10 blur-sm dark:bg-red-500/10" />
          <div className="relative pr-24">
            <button
              type="button"
              data-testid="decision-open-premarket-scenario"
              onClick={() => setPremarketScenarioOpen(true)}
              className="absolute right-0 top-0 inline-flex h-8 items-center rounded-full border border-cyan-200 bg-white/90 px-3 text-xs font-medium text-cyan-800 transition-colors hover:border-cyan-300 hover:bg-cyan-50 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-1 dark:border-cyan-900/70 dark:bg-slate-950 dark:text-cyan-200 dark:hover:bg-cyan-950/45 dark:focus:ring-offset-slate-950"
            >
              盘前推演
            </button>
            <div className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-cyan-700 dark:text-cyan-300">
              {isPortfolioView ? 'Portfolio Command' : 'Decision Command'}
            </div>
            <h1 className="mt-1 text-[25px] font-semibold leading-tight tracking-tight text-slate-950 dark:text-slate-50">今日看板</h1>
            {signalDateContext && (!signalDateContext.isTradingDay || signalDateContext.isFallback) && (
              <div data-testid="decision-signal-date-context" className="mt-1.5 inline-flex max-w-full items-center gap-1.5 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-800 dark:border-amber-900/70 dark:bg-amber-950/35 dark:text-amber-200">
                <span>{signalDateContext.isTradingDay ? '今日暂无新信号' : '今日休市'}</span>
                <span aria-hidden="true">·</span>
                <span className="truncate">当前展示最近交易日 {formatCompactDate(signalDateContext.displayDate)}</span>
              </div>
            )}
            <p className="mt-1.5 max-w-xl text-[13px] leading-5 text-slate-500 dark:text-slate-400">
              {isPortfolioView
                ? `组合 ${portfolioCommand.holdingCount} 只 · 浮盈 ${portfolioCommand.profitSummaryText} · 先处理我的票再扫市场。`
                : '先处理持仓风险和高优先级信号, 再进入单股走势图、按股研判和产业链验证。'}
            </p>
          </div>
          <div data-testid="decision-command-footer" className="relative mt-2 flex flex-wrap items-center gap-2">
            {isPortfolioView ? (
              <>
                <MissionPill label="持仓" value={portfolioCommand.holdingCount} />
                <MissionPill
                  label="组合待办"
                  value={portfolioCommand.pendingCount}
                  tone="hot"
                  testId="decision-mission-portfolio-pending"
                  onClick={openPendingSignals}
                />
                <MissionPill label="证据缺口" value={portfolioCommand.evidenceGapCount} />
              </>
            ) : (
              <>
                <MissionPill
                  label="待处理"
                  value={progressModel.pending}
                  tone="hot"
                  testId="decision-mission-pending"
                  onClick={openPendingSignals}
                />
                <MissionPill label="关注中" value={progressModel.watching} />
                <MissionPill label="持仓相关" value={homeModel.counts.portfolio} />
              </>
            )}
            <button
              type="button"
              onClick={() => {
                void loadSignals()
                void loadHoldings()
              }}
              disabled={loading}
              className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              {loading ? '刷新中' : '刷新'}
            </button>
            <button
              type="button"
              data-testid="decision-generate-daily-review"
              onClick={() => { void handleGenerateDailyReview() }}
              disabled={reviewReportLoading || reviewAiBusy}
              className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1.5 text-xs font-medium text-cyan-800 transition-colors hover:bg-cyan-100 disabled:opacity-50 dark:border-cyan-900/60 dark:bg-cyan-950/40 dark:text-cyan-200 dark:hover:bg-cyan-950/60"
            >
              {reviewReportLoading ? '复盘生成中' : reviewAiBusy ? 'AI 研判中' : '一键复盘'}
            </button>
            {isPortfolioView && (
              <>
                <button
                  type="button"
                  data-testid="decision-generate-weekly-review"
                  onClick={() => { void handleGenerateWeeklyReview() }}
                  disabled={reviewReportLoading || reviewAiBusy}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  {reviewReportLoading ? '周报复盘生成中' : reviewAiBusy ? 'AI 研判中' : '生成本周复盘'}
                </button>
                <button
                  type="button"
                  data-testid="decision-review-report-history"
                  onClick={() => setReviewReportHistoryOpen(true)}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  历史复盘
                </button>
                <button type="button" data-testid="decision-judgment-history" onClick={() => setJudgmentHistoryOpen(true)} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-800">判断记录</button>
              </>
            )}
          </div>
        </div>

        <div className="rounded-[10px] border border-slate-200/90 bg-white/90 p-3 shadow-sm shadow-slate-200/60 dark:border-slate-800 dark:bg-slate-900/90 dark:shadow-none">
          <div data-testid="decision-home-metrics" className="grid h-full grid-cols-2 gap-2.5 lg:grid-cols-4">
            {commandMetrics.map(metric => (
              <CommandMetric
                key={metric.label}
                {...metric}
                onClick={() => openCommandMetric(metric.label)}
              />
            ))}
          </div>
        </div>

        <div data-testid="decision-filter-panel" className="flex min-w-0 flex-col gap-2 rounded-[10px] border border-slate-200/90 bg-white/90 px-3 py-2.5 shadow-sm shadow-slate-200/60 dark:border-slate-800 dark:bg-slate-900/90 dark:shadow-none">
          <div className="flex items-center justify-between gap-3 text-sm font-semibold text-slate-900 dark:text-slate-100">
            <span>精筛条件</span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-normal text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400">
              {isPortfolioView ? '组合' : '全部'} · {signals.length} 条
            </span>
          </div>
          <SignalFilters
            status={status}
            type={type}
            source={source}
            portfolioOnly={portfolioOnly}
            minPriority={minPriority}
            viewMode={viewMode}
            onStatusChange={(value) => setDecisionCenterFilters({ status: value })}
            onTypeChange={(value) => setDecisionCenterFilters({ type: value })}
            onSourceChange={(value) => setDecisionCenterFilters({ source: value })}
            onPortfolioOnlyChange={(value) => setDecisionCenterFilters({ portfolioOnly: value })}
            onMinPriorityChange={(value) => setDecisionCenterFilters({ minPriority: value })}
            onViewModeChange={(value) => setDecisionCenterFilters({ viewMode: value })}
          />
        </div>
      </section>

      <div className="flex min-h-0 flex-col overflow-hidden">
        {(error || discussionError) && (
          <div className="shrink-0 border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 rounded-md px-3 py-2 text-sm">
            {error || discussionError}
          </div>
        )}

        {!loading && !error && isPortfolioView && hasNoHoldings && !hasDueJudgmentFollowUps && (
          <PortfolioNoHoldingEmptyState
            onShowMarket={() => setDecisionCenterFilters({ status: 'active', type: 'all', source: 'all', portfolioOnly: false, minPriority: 1, viewMode: 'market' })}
            onGoStockChart={startFirstPortfolioJourney}
          />
        )}

        {!loading && signals.length === 0 && !error && hasGlobalSignals && !showBriefWorkbench && !(isPortfolioView && hasNoHoldings && !hasDueJudgmentFollowUps) && !hasDueJudgmentFollowUps && (
          <DecisionFilteredEmptyState
            status={status}
            type={type}
            source={source}
            portfolioOnly={portfolioOnly}
            minPriority={minPriority}
            totalToday={summary?.totalToday ?? 0}
            highPriorityUnreadCount={summary?.highPriorityUnreadCount ?? 0}
            onShowAll={() => setDecisionCenterFilters({ status: 'active', type: 'all', source: 'all', portfolioOnly: false, minPriority: 1, viewMode: 'market' })}
            onShowUnreadHighPriority={() => setDecisionCenterFilters({ status: 'NEW', type: 'all', source: 'all', portfolioOnly: false, minPriority: 4, viewMode: 'market' })}
            onShowPortfolio={() => setDecisionCenterFilters({ status: 'active', type: 'all', source: 'all', portfolioOnly: true, minPriority: 1, viewMode: 'portfolio' })}
            isPortfolioView={isPortfolioView}
          />
        )}

        {!loading && signals.length === 0 && !error && !hasGlobalSignals && (historyData?.items.length ?? 0) === 0 && !(isPortfolioView && hasNoHoldings && !hasDueJudgmentFollowUps) && !hasDueJudgmentFollowUps && (
          <DecisionInitializationEmptyState model={emptyState} onAction={handleInitializationAction} onStartInitialization={handleStartInitialization} running={initializationFlow?.running ?? false} />
        )}

        {showBriefWorkbench && (
          <div className="grid min-h-0 flex-1 grid-cols-[minmax(280px,330px)_minmax(0,1fr)_minmax(300px,364px)] gap-4 overflow-hidden">
            <div className="flex min-h-0 flex-col gap-3 overflow-hidden">
              {isPortfolioView && <JudgmentFollowUpPanel items={judgmentFollowUps} loading={judgmentFollowUpsLoading} error={judgmentFollowUpsError} onCompleted={() => { void loadJudgmentFollowUps(); void loadReviewStats(); void loadOutcomeMemory() }} />}
              <ActionQueuePanel
                items={actionQueue}
                progress={progressModel}
                title={`待办导航 (${actionQueue.length}${progressModel.pending > actionQueue.length ? `/${progressModel.pending}` : ''})`}
                subtitle={
                  isPortfolioView
                    ? '按股票聚合 · 点进中间提炼或明细'
                    : progressModel.pending > actionQueue.length
                      ? `优先 ${actionQueue.length} 条 · 其余 ${progressModel.pending - actionQueue.length} 条在「信号明细」`
                      : '导航用 · 主阅读在「提炼」；点右侧「待处理」看全部'
                }
                emptyText={isPortfolioView
                  ? (portfolioCommand.holdingCount === 0
                    ? '尚未添加持仓。'
                    : '组合待办已清空, 可切换「全部信号」观察市场。')
                  : undefined}
                judgmentMode={isPortfolioView}
                onRead={(id) => void updateSignal(id, 'read')}
                onWatch={(id) => void updateSignal(id, 'watch')}
                onDismiss={(id) => void updateSignal(id, 'dismiss')}
                onLifecycle={(item) => {
                  if (isPortfolioView && item.signal.tsCode) openJudgment(item.signal, item)
                  else setLifecycleSignal(item.signal)
                }}
                onNavigateStock={handleNavigateStock}
                onChainAnalysis={text => { setSupplyChainText(text); setShowSupplyChain(true) }}
              />
            </div>
            <WorkspacePanel
              tabs={workspaceTabs}
              activeTab={workspaceTab}
              onTabChange={setWorkspaceTab}
              scrollRef={workspaceScrollRef}
            >
                {workspaceTab === 'brief' && (
                  <TodayBriefPanel
                    model={todayBrief}
                    aiState={briefAiState}
                    aiBusy={briefAiBusy}
                    onRunAi={() => { void runTodayBriefAi() }}
                    onOpenDetailTab={() => setWorkspaceTab('priority')}
                    onOpenSignal={(signalId) => {
                      const hit = signals.find((item) => item.id === signalId)
                        ?? briefContextSignals.find((item) => item.id === signalId)
                      if (!hit) return
                      if (isPortfolioView && hit.tsCode && isPortfolioSignal(hit)) openJudgment(hit)
                      else setLifecycleSignal(hit)
                    }}
                    onNavigateStock={(tsCode, stockName) => {
                      const normalized = tsCode.includes('.') ? tsCode.split('.')[0]! : tsCode
                      navigateToStock(normalized, stockName ?? undefined)
                    }}
                  />
                )}
                {workspaceTab === 'priority' && <PriorityPanel signals={homeModel.prioritySignals} renderSignal={renderSignal} />}
                {workspaceTab !== 'brief' && workspaceTab !== 'priority' && workspaceTab !== 'history' && sectionByKey.has(workspaceTab) && (
                  <DecisionSectionPanel section={sectionByKey.get(workspaceTab)!} renderSignal={renderSignal} compact={false} />
                )}
                {workspaceTab === 'history' && (
                  <HistoryReviewPanel
                    data={historyData}
                    loading={historyLoading}
                    error={historyError}
                    rangeDays={historyRangeDays}
                    onRangeChange={setHistoryRangeDays}
                    tradeDate={historyTradeDate}
                    onTradeDateChange={setHistoryTradeDate}
                    portfolioOnly={historyPortfolioOnly}
                    onPortfolioOnlyChange={setHistoryPortfolioOnly}
                    onReload={() => void loadHistorySignals()}
                    onLifecycle={setLifecycleSignal}
                    onNavigateStock={handleNavigateStock}
                  />
                )}
            </WorkspacePanel>
            <aside className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-3 overflow-hidden">
              <DecisionProgressPanel progress={progressModel} onOpenPending={openPendingSignals} />
              <ReviewAndPortfolioPanel
                reviewData={reviewStats}
                reviewLoading={reviewLoading}
                reviewError={reviewError}
                reviewRangeDays={reviewRangeDays}
                onReloadReview={() => void loadReviewStats()}
                onOpenReviewAll={() => {
                  setReviewHintsTab('noise')
                  setReviewHintsOpen(true)
                }}
                portfolioData={portfolioRiskData}
                portfolioLoading={portfolioRiskLoading}
                portfolioError={portfolioRiskError}
                portfolioRangeDays={portfolioRiskRangeDays}
                onReloadPortfolio={() => void loadPortfolioRiskReview()}
                onPortfolioRangeChange={setPortfolioRiskRangeDays}
                onOpenReviewHistory={() => setReviewReportHistoryOpen(true)}
                outcomeData={outcomeMemory}
                outcomeLoading={outcomeLoading}
                outcomeError={outcomeError}
                onReloadOutcome={() => void loadOutcomeMemory()}
                onNavigateOutcomeStock={(tsCode, stockName) => {
                  const normalized = tsCode.includes('.') ? tsCode.split('.')[0]! : tsCode
                  navigateToStock(normalized, stockName ?? undefined)
                }}
              />
            </aside>
          </div>
        )}
      </div>

      <PremarketScenarioDrawer
        open={premarketScenarioOpen}
        onClose={() => setPremarketScenarioOpen(false)}
        onOpenCaptureSettings={() => {
          setPremarketScenarioOpen(false)
          onOpenConfig?.('settings')
          window.requestAnimationFrame(() => {
            window.requestAnimationFrame(() => {
              const heading = document.getElementById('premarket-capture-title')
              heading?.scrollIntoView({ block: 'start' })
              heading?.focus({ preventScroll: true })
            })
          })
        }}
      />
      <IndustryAnalysisDrawer
        open={showSupplyChain}
        text={supplyChainText}
        onClose={() => setShowSupplyChain(false)}
      />
      <StockJudgmentPanel
        open={judgmentSignal != null}
        signal={judgmentSignal}
        actionItem={judgmentActionItem}
        relatedSignals={relatedSignalsForJudgment}
        holdings={holdings}
        saving={judgmentSaving}
        error={judgmentError}
        onClose={() => {
          setJudgmentSignal(null)
          setJudgmentActionItem(null)
          setJudgmentError(null)
        }}
        onOpenEventDetail={(signal) => {
          setLifecycleSignal(signal)
        }}
        onNavigateStock={handleNavigateStock}
        onDiscussSignal={(signal) => { void discussSignal(signal, 'stock-judgment') }}
        onSubmitJudgment={(payload) => { void handleSubmitJudgment(payload) }}
      />
      <JudgmentHistoryPanel
        open={judgmentHistoryOpen}
        initialJudgmentId={initialJudgmentId}
        onDiscuss={(judgment) => { void discussJudgment(judgment) }}
        onClose={() => {
          setJudgmentHistoryOpen(false)
          setInitialJudgmentId(null)
        }}
      />
      <SignalLifecycleDrawer
        open={lifecycleSignal != null}
        signal={lifecycleSignal}
        onClose={() => setLifecycleSignal(null)}
        onUpdated={() => {
          setLifecycleSignal(null)
          void loadSignals()
          void loadReviewStats()
          void loadHistorySignals()
          void loadPortfolioRiskReview()
          void loadHoldings()
        }}
        onDiscuss={(signal) => { void discussSignal(signal) }}
      />
      <ReviewHintsDrawer
        open={reviewHintsOpen}
        data={reviewStats}
        loading={reviewLoading}
        error={reviewError}
        rangeDays={reviewRangeDays}
        activeTab={reviewHintsTab}
        onTabChange={setReviewHintsTab}
        onClose={() => setReviewHintsOpen(false)}
        onReload={() => void loadReviewStats()}
        onLifecycle={(item) => {
          setReviewHintsOpen(false)
          if (isPortfolioView && item.tsCode) openJudgment(item)
          else setLifecycleSignal(item)
        }}
        onNavigateStock={(item) => {
          if (item.tsCode) {
            setReviewHintsOpen(false)
            handleNavigateStock(item)
          }
        }}
        onQuickResolve={quickResolveSignals}
        onQuickDismiss={quickDismissSignals}
        lifecycleLabel={isPortfolioView ? '研判' : '事件明细'}
      />
      <ReviewReportPanel
        open={reviewReportOpen}
        report={reviewReport}
        loading={reviewReportLoading}
        error={reviewReportError}
        saveState={reviewReportSaveState}
        saveError={reviewReportSaveError}
        savedMeta={savedReviewReportMeta}
        onDiscuss={() => {
          if (savedReviewReportMeta && reviewReport) void discussReport(savedReviewReportMeta.id, reviewReport.kind)
        }}
        discussLoading={startingDiscussion}
        discussDisabledReason={reviewReport && !savedReviewReportMeta ? '报告保存成功后才能作为受信来源发起讨论' : null}
        onRetrySave={pendingReviewReportSave
          ? () => { void persistReviewReport(pendingReviewReportSave) }
          : undefined}
        onRetryAi={handleRetryReviewAi}
        aiBusy={reviewAiBusy}
        onClose={() => {
          cancelReviewAiInFlight()
          setReviewReportOpen(false)
          setReviewReportError(null)
          setReviewReportLoading(false)
        }}
        onNavigateStock={(tsCode, stockName) => {
          const normalized = tsCode.includes('.') ? tsCode.split('.')[0]! : tsCode
          navigateToStock(normalized, stockName ?? undefined)
        }}
      />
      <ReviewReportHistoryPanel
        open={reviewReportHistoryOpen}
        refreshToken={reviewReportHistoryRefresh}
        onClose={() => setReviewReportHistoryOpen(false)}
        onGenerateDaily={() => {
          setReviewReportHistoryOpen(false)
          handleGenerateDailyReview()
        }}
        onDiscuss={(summary) => { void discussReport(summary.id, summary.kind) }}
        onOpenReport={(report, summary: SavedReviewReportSummaryItem) => {
          cancelReviewAiInFlight()
          setReviewReport(report)
          setPendingReviewReportSave(null)
          setReviewReportSaveError(null)
          setReviewReportSaveState('saved')
          savedReviewReportIdRef.current = summary.id
          setSavedReviewReportMeta({
            id: summary.id,
            versionNumber: summary.versionNumber,
            versionCount: summary.versionCount,
            savedAt: summary.savedAt,
          })
          setReviewReportError(null)
          setReviewReportLoading(false)
          setReviewReportOpen(true)
        }}
      />
    </div>
  )
}


function PortfolioNoHoldingEmptyState({
  onShowMarket,
  onGoStockChart,
}: {
  onShowMarket: () => void
  onGoStockChart: () => void
}) {
  return (
    <div data-testid="decision-portfolio-no-holding-empty" className="rounded-md border border-dashed border-cyan-200 bg-white px-6 py-10 text-center text-slate-600 shadow-sm dark:border-cyan-900/50 dark:bg-slate-900 dark:text-slate-300">
      <div className="text-base font-semibold text-slate-900 dark:text-slate-100">组合指挥台需要先添加持仓</div>
      <div className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">
        默认「组合」视图只处理你的票。请先在股票走势图加入持仓, 再回到这里查看组合风险与待办。
      </div>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <button data-testid="decision-start-portfolio-journey" type="button" onClick={onGoStockChart} className="rounded-md bg-cyan-700 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-cyan-800 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:ring-offset-2 dark:focus:ring-offset-slate-900">
          去添加持仓
        </button>
        <button type="button" onClick={onShowMarket} className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-800">
          先看全部信号
        </button>
      </div>
    </div>
  )
}

function DecisionFilteredEmptyState({
  status,
  type,
  source,
  portfolioOnly,
  minPriority,
  totalToday,
  highPriorityUnreadCount,
  onShowAll,
  onShowUnreadHighPriority,
  onShowPortfolio,
  isPortfolioView
}: {
  status: string
  type: string
  source: string
  portfolioOnly: boolean
  minPriority: number
  totalToday: number
  highPriorityUnreadCount: number
  onShowAll: () => void
  onShowUnreadHighPriority: () => void
  onShowPortfolio: () => void
  isPortfolioView: boolean
}) {
  const statusLabel = {
    active: '未忽略',
    NEW: '未读',
    WATCHING: '关注中',
    READ: '已读',
    all: '全部状态',
    DISMISSED: '已忽略',
    EXPIRED: '已过期'
  }[status] ?? status
  const typeLabel = {
    all: '全部类型',
    OPPORTUNITY: '机会',
    ALERT: '预警',
    RISK: '风险',
    INFO: '信息'
  }[type] ?? type
  const sourceLabel = {
    all: '全部来源',
    trend: '长线趋势',
    short_term: '短线策略',
    sector_flow: '板块资金',
    news: '资讯',
    ai: 'AI',
    market: '市场',
    manual: '手动'
  }[source] ?? source
  const filterParts = [
    isPortfolioView ? '组合视图' : '全部信号',
    statusLabel,
    typeLabel,
    sourceLabel,
    (isPortfolioView || portfolioOnly) ? '我的持仓' : '全部股票',
    `P${minPriority}+`,
  ]

  return (
    <div data-testid="decision-filtered-empty-state" className="rounded-md border border-dashed border-slate-200 bg-white px-6 py-10 text-center text-slate-600 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
      <div className="text-base font-semibold text-slate-900 dark:text-slate-100">
        {isPortfolioView ? '当前组合视图下暂无持仓相关信号' : '当前筛选条件下暂无信号'}
      </div>
      <div className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">
        今日共有 {totalToday} 条信号, 其中 {highPriorityUnreadCount} 条高优先级未读。当前筛选为 {filterParts.join(' / ')}, 所以列表为空。
      </div>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <button type="button" onClick={onShowAll} className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 dark:focus:ring-offset-slate-900">
          查看全部信号
        </button>
        {isPortfolioView ? (
          <button type="button" onClick={onShowPortfolio} className="rounded-md border border-cyan-200 bg-cyan-50 px-3 py-1.5 text-xs font-medium text-cyan-800 transition-colors hover:bg-cyan-100 focus:outline-none focus:ring-2 focus:ring-cyan-300 focus:ring-offset-2 dark:border-cyan-900/60 dark:bg-cyan-950/30 dark:text-cyan-200 dark:hover:bg-cyan-950/50 dark:focus:ring-offset-slate-900">
            回到组合视图
          </button>
        ) : (
          <button type="button" onClick={onShowPortfolio} className="rounded-md border border-cyan-200 bg-cyan-50 px-3 py-1.5 text-xs font-medium text-cyan-800 transition-colors hover:bg-cyan-100 focus:outline-none focus:ring-2 focus:ring-cyan-300 focus:ring-offset-2 dark:border-cyan-900/60 dark:bg-cyan-950/30 dark:text-cyan-200 dark:hover:bg-cyan-950/50 dark:focus:ring-offset-slate-900">
            切换到组合
          </button>
        )}
        <button type="button" onClick={onShowUnreadHighPriority} className="rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 transition-colors hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-300 focus:ring-offset-2 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-950/50 dark:focus:ring-offset-slate-900">
          查看高优先级未读
        </button>
      </div>
    </div>
  )
}

function DecisionInitializationEmptyState({ model, onAction, onStartInitialization, running }: { model: ReturnType<typeof buildDecisionEmptyStateModel>; onAction: (action: InitializationAction) => void; onStartInitialization: () => void; running: boolean }) {
  const toneClass = {
    amber: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200',
    blue: 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-200',
    red: 'border-red-200 bg-red-50 text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200',
    slate: 'border-gray-200 bg-white text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300'
  }[model.tone]

  return (
    <div data-testid="decision-empty-state" className={`rounded-md border p-8 text-center ${toneClass}`}>
      <div className="text-base font-semibold">{model.title}</div>
      <div data-testid="decision-initialization-empty-state" className="mx-auto mt-2 max-w-2xl text-sm opacity-85">{model.description}</div>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <button type="button" data-testid="decision-empty-start-initialization" onClick={onStartInitialization} disabled={running} className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
          {running ? '初始化中…' : '一键初始化'}
        </button>
        <button type="button" onClick={() => onAction(model.primaryAction)} className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700">
          {model.primaryAction.label}
        </button>
        {model.secondaryAction && (
          <button type="button" onClick={() => onAction(model.secondaryAction!)} className="rounded border border-current px-3 py-1.5 text-xs hover:bg-white/30 dark:hover:bg-black/20">
            {model.secondaryAction.label}
          </button>
        )}
      </div>
    </div>
  )
}

function MissionPill({
  label,
  value,
  tone = 'normal',
  onClick,
  testId,
}: {
  label: string
  value: number
  tone?: 'normal' | 'hot'
  onClick?: () => void
  testId?: string
}) {
  const className = tone === 'hot'
    ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300'
    : 'border-slate-200 bg-white/90 text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300'
  if (onClick) {
    return (
      <button
        type="button"
        data-testid={testId}
        onClick={onClick}
        className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors hover:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 ${className}`}
      >
        {label} <b className="ml-1 tabular-nums">{value}</b>
      </button>
    )
  }
  return (
    <span className={`rounded-full border px-3 py-1.5 text-xs font-medium ${className}`}>
      {label} <b className="ml-1 tabular-nums">{value}</b>
    </span>
  )
}

type CommandMetricTone = 'red' | 'green' | 'blue' | 'amber'

interface CommandMetricItem {
  label: string
  value: number
  hint: string
  tone: CommandMetricTone
  tag?: string
  testId?: string
  onClick?: () => void
  actionLabel?: string
}

function buildDecisionCommandMetrics(
  signals: DecisionSignalItem[],
  summary: ReturnType<typeof useAppStore.getState>['decisionSignalSummary'],
  reviewStats: DecisionReviewStatsData | null,
  portfolioRiskData: DecisionPortfolioRiskReviewData | null
): CommandMetricItem[] {
  const highPriorityUnread = summary?.highPriorityUnreadCount ?? signals.filter(signal => signal.status === 'NEW' && signal.priority >= 4).length
  const portfolioRisk = signals.filter(signal => isPortfolioSignal(signal) && isRiskSignal(signal)).length
  const shortTermOpportunity = signals.filter(signal => signal.sourceModule === 'short_term' && (signal.signalType === 'OPPORTUNITY' || signal.direction === 'BULLISH')).length
  const reviewBacklog = reviewStats?.summary.unresolved
    ?? portfolioRiskData?.unresolvedRiskSignals
    ?? signals.filter(signal => signal.status === 'NEW' || signal.status === 'WATCHING').length
  return [
    { label: '高优先级', value: highPriorityUnread, hint: 'P4+ 未读优先处理', tone: 'red', tag: 'P4+', testId: 'decision-metric-high-priority', actionLabel: '查看高优先级未读' },
    { label: '持仓风险', value: portfolioRisk, hint: `未收口 ${portfolioRiskData?.unresolvedRiskSignals ?? 0} 条`, tone: 'green', tag: '需先看', testId: 'decision-metric-portfolio-risk', actionLabel: '查看持仓风险' },
    { label: '短线机会', value: shortTermOpportunity, hint: '竞价/策略信号线索', tone: 'blue', tag: '策略', testId: 'decision-metric-short-term', actionLabel: '查看短线机会' },
    { label: '复盘积压', value: reviewBacklog, hint: `近 ${reviewStats ? '30' : '当前'} 日待收口`, tone: 'amber', tag: '30日', testId: 'decision-metric-review-backlog', actionLabel: '打开待复盘列表' },
  ]
}

export function CommandMetric({ label, value, hint, tone, tag, testId, onClick, actionLabel }: CommandMetricItem) {
  const valueClass = {
    red: 'text-red-600 dark:text-red-300',
    green: 'text-emerald-700 dark:text-emerald-300',
    blue: 'text-blue-700 dark:text-blue-300',
    amber: 'text-amber-700 dark:text-amber-300',
  }[tone]
  const tagClass = {
    red: 'text-red-500',
    green: 'text-emerald-600',
    blue: 'text-blue-600',
    amber: 'text-amber-600',
  }[tone]
  const tagText = tag ?? (tone === 'red' ? 'P4+' : tone === 'green' ? '需先看' : tone === 'blue' ? '策略' : '30日')
  const shellClass = 'flex h-full min-w-0 flex-col items-center justify-center rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-center text-slate-600 dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-300'
  const labelRow = (
    <div className="flex min-w-0 items-center justify-center gap-2 text-xs"><span>{label}</span><span className={tagClass}>{tagText}</span></div>
  )
  const valueRow = <div className={`mt-1 text-2xl font-extrabold tabular-nums ${valueClass}`}>{value}</div>
  const hintRow = <div className="mt-1 w-full truncate text-center text-[11px] text-slate-500 dark:text-slate-400">{hint}</div>
  const clickLabel = actionLabel || `查看${label}`
  if (onClick) {
    return (
      <button
        type="button"
        data-testid={testId ?? 'decision-command-metric'}
        aria-label={clickLabel}
        title={clickLabel}
        onClick={onClick}
        className={`${shellClass} cursor-pointer transition-colors hover:border-slate-300 hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500 dark:hover:border-slate-600 dark:hover:bg-slate-900`}
      >
        {labelRow}
        {valueRow}
        {hintRow}
      </button>
    )
  }
  return (
    <div data-testid={testId ?? 'decision-command-metric'} className={shellClass}>
      {labelRow}
      {valueRow}
      {hintRow}
    </div>
  )
}

function DecisionProgressPanel({
  progress,
  onOpenPending,
}: {
  progress: ReturnType<typeof buildDecisionProgressModel>
  onOpenPending?: () => void
}) {
  const pct = progressPct(progress)
  const cards = [
    ['待处理', progress.pending, onOpenPending] as const,
    ['已关注', progress.watching, undefined] as const,
    ['已读', progress.read, undefined] as const,
  ]

  return (
    <section data-testid="decision-progress-summary" className="shrink-0 rounded-[10px] border border-gray-200/90 bg-white/92 p-3 shadow-sm shadow-gray-100/50 dark:border-gray-700 dark:bg-gray-900 dark:shadow-none">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="min-w-0 truncate text-sm font-extrabold text-gray-900 dark:text-gray-100">{progress.title}</h2>
        <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300">{pct}%</span>
      </div>
      <p className="mb-2 text-[11px] leading-4 text-gray-500 dark:text-gray-400">{progress.description}</p>
      <div className="h-1.5 rounded-full bg-gray-100 dark:bg-gray-800">
        <div className="h-1.5 rounded-full bg-gradient-to-r from-cyan-600 to-emerald-500" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1.5">
        {cards.map(([label, value, onClick]) => (
          onClick ? (
            <button
              key={label}
              type="button"
              data-testid={`decision-progress-card-${label}`}
              onClick={onClick}
              title="打开信号明细中的待处理"
              className="rounded-lg border border-cyan-200 bg-cyan-50/70 px-2 py-1.5 text-center transition-colors hover:bg-cyan-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 dark:border-cyan-900/50 dark:bg-cyan-950/30 dark:hover:bg-cyan-950/50"
            >
              <div className="text-lg font-extrabold tabular-nums leading-none text-gray-900 dark:text-gray-100">{value}</div>
              <div className="mt-1 text-[11px] leading-3 text-cyan-800 dark:text-cyan-200">{label}</div>
            </button>
          ) : (
            <div key={label} className="rounded-lg border border-gray-100 bg-white px-2 py-1.5 text-center dark:border-gray-800 dark:bg-gray-950/40">
              <div className="text-lg font-extrabold tabular-nums leading-none text-gray-900 dark:text-gray-100">{value}</div>
              <div className="mt-1 text-[11px] leading-3 text-gray-500 dark:text-gray-400">{label}</div>
            </div>
          )
        ))}
      </div>
    </section>
  )
}

function ReviewHintsPanel({ data, loading, error, rangeDays, onReload, onOpenAll }: { data: DecisionReviewStatsData | null; loading: boolean; error: string | null; rangeDays: number; onReload: () => void; onOpenAll: () => void }) {
  const hints = useMemo(() => {
    const items: Array<{ title: string; summary: string }> = []
    for (const suggestion of data?.noiseSuggestions?.slice(0, 2) ?? []) {
      items.push({ title: suggestion.title, summary: suggestion.summary })
    }
    if ((data?.repeatedSignals?.length ?? 0) > 0) {
      items.push({ title: `重复触发待复核 ${data!.repeatedSignals.length} 条`, summary: '优先检查策略阈值、成交额过滤和同股重复出现原因。' })
    }
    if ((data?.pendingReview?.length ?? 0) > 0) {
      items.push({ title: `待复盘信号 ${data!.pendingReview.length} 条`, summary: '优先补充持仓相关和高优先级信号的处置结果。' })
    }
    return items.slice(0, 3)
  }, [data])

  return (
    <section data-testid="decision-review-stats" className="flex min-h-0 flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-3 pb-2">
        <div className="min-w-0">
          <h3 className="text-sm font-extrabold text-gray-900 dark:text-gray-100">复盘提示</h3>
          <p className="text-xs text-gray-400 dark:text-gray-500">近{rangeDays}日</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button type="button" onClick={onOpenAll} className="text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-300 dark:hover:text-blue-200">查看全部</button>
          <button type="button" onClick={onReload} disabled={loading} className="text-xs text-gray-400 hover:text-gray-700 disabled:opacity-50 dark:text-gray-500 dark:hover:text-gray-200">刷新</button>
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
        {error && <div className="rounded border border-red-200 bg-red-50 px-2 py-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">{error}</div>}
        {!error && hints.length === 0 && <div className="rounded border border-dashed border-gray-200 px-3 py-6 text-center text-xs text-gray-400 dark:border-gray-700 dark:text-gray-500">暂无明显复盘提示</div>}
        {!error && hints.slice(0, 2).map(item => (
          <article key={item.title} className="rounded-lg border border-gray-100 bg-white px-3 py-2 dark:border-gray-800 dark:bg-gray-950/30">
            <h3 className="text-xs font-semibold leading-5 text-gray-900 dark:text-gray-100">{item.title}</h3>
            <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">{item.summary}</p>
          </article>
        ))}
      </div>
    </section>
  )
}

function ReviewAndPortfolioPanel({
  reviewData,
  reviewLoading,
  reviewError,
  reviewRangeDays,
  onReloadReview,
  onOpenReviewAll,
  portfolioData,
  portfolioLoading,
  portfolioError,
  portfolioRangeDays,
  onReloadPortfolio,
  onPortfolioRangeChange,
  onOpenReviewHistory,
  outcomeData,
  outcomeLoading,
  outcomeError,
  onReloadOutcome,
  onNavigateOutcomeStock,
}: {
  reviewData: DecisionReviewStatsData | null
  reviewLoading: boolean
  reviewError: string | null
  reviewRangeDays: number
  onReloadReview: () => void
  onOpenReviewAll: () => void
  portfolioData: DecisionPortfolioRiskReviewData | null
  portfolioLoading: boolean
  portfolioError: string | null
  portfolioRangeDays: number
  onReloadPortfolio: () => void
  onPortfolioRangeChange: (rangeDays: number) => void
  onOpenReviewHistory: () => void
  outcomeData: DecisionOutcomeMemoryData | null
  outcomeLoading: boolean
  outcomeError: string | null
  onReloadOutcome: () => void
  onNavigateOutcomeStock?: (tsCode: string, stockName?: string | null) => void
}) {
  const [activeTab, setActiveTab] = useState<ReviewSideTab>('portfolio')
  const reviewCount = (reviewData?.noiseSuggestions?.length ?? 0) + (reviewData?.repeatedSignals?.length ?? 0) + (reviewData?.pendingReview?.length ?? 0)
  const portfolioCount = (portfolioData?.missingCostPrice ?? 0) + (portfolioData?.unresolvedRiskSignals ?? 0)
  const outcomeCount = outcomeData?.sampleSize ?? 0

  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-[10px] border border-gray-200/90 bg-white/92 shadow-sm shadow-gray-100/50 dark:border-gray-700 dark:bg-gray-900 dark:shadow-none">
      <div className="border-b border-gray-100 px-3 py-3 dark:border-gray-800">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-extrabold text-gray-900 dark:text-gray-100">复盘与持仓风险</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">优先收口真实持仓, 再看全局信号噪声与事后对照。</p>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-1.5 rounded-lg bg-gray-100 p-1 dark:bg-gray-950/60">
          <button
            type="button"
            onClick={() => setActiveTab('portfolio')}
            className={`rounded-md px-1.5 py-1.5 text-[11px] font-semibold transition-colors ${activeTab === 'portfolio' ? 'bg-white text-gray-950 shadow-sm dark:bg-gray-800 dark:text-gray-100' : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'}`}
          >
            持仓风险 <span className="ml-0.5 tabular-nums opacity-70">{portfolioCount}</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('review')}
            className={`rounded-md px-1.5 py-1.5 text-[11px] font-semibold transition-colors ${activeTab === 'review' ? 'bg-white text-gray-950 shadow-sm dark:bg-gray-800 dark:text-gray-100' : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'}`}
          >
            复盘提示 <span className="ml-0.5 tabular-nums opacity-70">{reviewCount}</span>
          </button>
          <button
            type="button"
            data-testid="decision-outcome-tab"
            onClick={() => setActiveTab('outcome')}
            className={`rounded-md px-1.5 py-1.5 text-[11px] font-semibold transition-colors ${activeTab === 'outcome' ? 'bg-white text-gray-950 shadow-sm dark:bg-gray-800 dark:text-gray-100' : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'}`}
          >
            事后对照 <span className="ml-0.5 tabular-nums opacity-70">{outcomeCount}</span>
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {activeTab === 'portfolio' ? (
          <PortfolioRiskMiniPanel
            data={portfolioData}
            loading={portfolioLoading}
            error={portfolioError}
            rangeDays={portfolioRangeDays}
            onReload={onReloadPortfolio}
            onRangeChange={onPortfolioRangeChange}
            onOpenReviewHistory={onOpenReviewHistory}
          />
        ) : activeTab === 'review' ? (
          <ReviewHintsPanel
            data={reviewData}
            loading={reviewLoading}
            error={reviewError}
            rangeDays={reviewRangeDays}
            onReload={onReloadReview}
            onOpenAll={onOpenReviewAll}
          />
        ) : (
          <OutcomeMemoryPanel
            data={outcomeData}
            loading={outcomeLoading}
            error={outcomeError}
            onReload={onReloadOutcome}
            onNavigateStock={onNavigateOutcomeStock}
          />
        )}
      </div>
    </section>
  )
}

function ReviewHintsDrawer({
  open,
  data,
  loading,
  error,
  rangeDays,
  activeTab,
  onTabChange,
  onClose,
  onReload,
  onLifecycle,
  onNavigateStock,
  onQuickResolve,
  onQuickDismiss,
  lifecycleLabel = '事件明细',
}: {
  open: boolean
  data: DecisionReviewStatsData | null
  loading: boolean
  error: string | null
  rangeDays: number
  activeTab: ReviewHintsTab
  onTabChange: (tab: ReviewHintsTab) => void
  onClose: () => void
  onReload: () => void
  onLifecycle: (signal: DecisionSignalItem) => void
  onNavigateStock: (signal: DecisionSignalItem) => void
  onQuickResolve: (ids: number[]) => Promise<{ ok: boolean; failed: number }>
  onQuickDismiss: (ids: number[]) => Promise<{ ok: boolean; failed: number }>
  lifecycleLabel?: string
}) {
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set())
  const [actionBusy, setActionBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const noise = data?.noiseSuggestions ?? []
  const repeated = data?.repeatedSignals ?? []
  const pending = data?.pendingReview ?? []
  const unresolvedTotal = data?.summary.unresolved ?? pending.length
  const actionable = activeTab === 'pending' ? pending : activeTab === 'repeated' ? repeated : []
  const selectableIds = actionable.map((item) => item.id)

  useEffect(() => {
    if (!open) {
      setSelectedIds(new Set())
      setActionError(null)
      setActionBusy(false)
    }
  }, [open])

  useEffect(() => {
    setSelectedIds(new Set())
    setActionError(null)
  }, [activeTab])

  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev
      const allow = new Set(selectableIds)
      const next = new Set<number>()
      for (const id of prev) {
        if (allow.has(id)) next.add(id)
      }
      return next.size === prev.size ? prev : next
    })
  }, [selectableIds.join(',')])

  const tabs = [
    { key: 'noise' as const, label: '降噪建议', count: noise.length },
    { key: 'repeated' as const, label: '重复触发', count: repeated.length },
    { key: 'pending' as const, label: '待复盘', count: unresolvedTotal },
  ]

  const toggleId = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    setSelectedIds((prev) => {
      if (prev.size === selectableIds.length) return new Set()
      return new Set(selectableIds)
    })
  }

  const runBatch = async (kind: 'resolve' | 'dismiss', ids: number[]) => {
    if (ids.length === 0 || actionBusy) return
    setActionBusy(true)
    setActionError(null)
    try {
      const result = kind === 'resolve' ? await onQuickResolve(ids) : await onQuickDismiss(ids)
      if (result.failed > 0) {
        setActionError(`有 ${result.failed}/${ids.length} 条处理失败，已刷新列表`)
      }
      setSelectedIds(new Set())
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setActionBusy(false)
    }
  }

  if (!open) return null

  const selectedCount = selectedIds.size
  const showBatchBar = activeTab === 'pending' || activeTab === 'repeated'

  return (
    <div className="fixed inset-0 z-[10000]" role="dialog" aria-modal="true" aria-label="复盘提示详情" data-testid="review-hints-drawer">
      <button type="button" aria-label="关闭复盘提示详情" onClick={onClose} className="absolute inset-0 bg-slate-950/45 backdrop-blur-[2px]" />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-[520px] flex-col overflow-hidden border-l border-slate-200 bg-white shadow-2xl shadow-slate-950/25 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <div>
            <h2 className="text-base font-extrabold text-slate-950 dark:text-slate-100">复盘提示详情</h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              近 {rangeDays} 日未收口 {unresolvedTotal} 条；可勾选批量收口，或单条「有效收口 / 噪音忽略」。
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onReload} disabled={loading || actionBusy} className="rounded-md border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">{loading ? '刷新中' : '刷新'}</button>
            <button type="button" onClick={onClose} className="rounded-md border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">关闭</button>
          </div>
        </div>
        <div className="border-b border-slate-100 px-4 py-3 dark:border-slate-800">
          <div className="grid grid-cols-3 gap-1.5 rounded-lg bg-slate-100 p-1 dark:bg-slate-950/70">
            {tabs.map(tab => (
              <button
                key={tab.key}
                type="button"
                data-testid={`review-hints-tab-${tab.key}`}
                onClick={() => onTabChange(tab.key)}
                className={`rounded-md px-2 py-1.5 text-xs font-semibold transition-colors ${activeTab === tab.key ? 'bg-white text-slate-950 shadow-sm dark:bg-slate-800 dark:text-slate-100' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'}`}
              >
                {tab.label} <span className="ml-1 tabular-nums opacity-70">{tab.count}</span>
              </button>
            ))}
          </div>
        </div>
        {showBatchBar && (
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-2.5 dark:border-slate-800">
            <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
              <input
                type="checkbox"
                data-testid="review-hints-select-all"
                checked={selectableIds.length > 0 && selectedCount === selectableIds.length}
                disabled={selectableIds.length === 0 || actionBusy}
                onChange={toggleAll}
              />
              全选本页
            </label>
            <span className="text-xs text-slate-400">已选 {selectedCount}</span>
            <button
              type="button"
              data-testid="review-hints-batch-resolve"
              disabled={selectedCount === 0 || actionBusy}
              onClick={() => { void runBatch('resolve', [...selectedIds]) }}
              className="rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-800 disabled:opacity-40 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200"
            >
              {actionBusy ? '处理中…' : '批量有效收口'}
            </button>
            <button
              type="button"
              data-testid="review-hints-batch-dismiss"
              disabled={selectedCount === 0 || actionBusy}
              onClick={() => { void runBatch('dismiss', [...selectedIds]) }}
              className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-800 disabled:opacity-40 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200"
            >
              批量噪音忽略
            </button>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">{error}</div>}
          {actionError && <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">{actionError}</div>}
          {!error && activeTab === 'noise' && (
            noise.length === 0
              ? <div className="rounded-lg border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">当前分类暂无内容。</div>
              : (
                <ReviewHintList
                  items={noise.slice(0, 12).map(item => ({
                    id: item.id,
                    title: item.title,
                    summary: item.summary,
                    meta: item.metric,
                  }))}
                />
              )
          )}
          {!error && activeTab === 'repeated' && (
            repeated.length === 0
              ? <div className="rounded-lg border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">当前分类暂无内容。</div>
              : (
                <ReviewHintList
                  items={repeated.slice(0, 30).map(item => ({
                    id: String(item.id),
                    title: item.title,
                    summary: item.summary ?? '',
                    meta: `${item.occurrenceCount} 次触发 · P${item.priority}`,
                    signal: item,
                  }))}
                  selectedIds={selectedIds}
                  onToggleSelect={toggleId}
                  lifecycleLabel={lifecycleLabel}
                  onLifecycle={onLifecycle}
                  onNavigateStock={onNavigateStock}
                  actionBusy={actionBusy}
                  onQuickResolve={(id) => { void runBatch('resolve', [id]) }}
                  onQuickDismiss={(id) => { void runBatch('dismiss', [id]) }}
                />
              )
          )}
          {!error && activeTab === 'pending' && (
            pending.length === 0
              ? <div className="rounded-lg border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">当前没有待复盘信号。</div>
              : (
                <ReviewHintList
                  items={pending.slice(0, 30).map(item => ({
                    id: String(item.id),
                    title: item.title,
                    summary: item.summary ?? '',
                    meta: `P${item.priority} · ${statusText(item.status)}`,
                    signal: item,
                  }))}
                  selectedIds={selectedIds}
                  onToggleSelect={toggleId}
                  lifecycleLabel={lifecycleLabel}
                  onLifecycle={onLifecycle}
                  onNavigateStock={onNavigateStock}
                  actionBusy={actionBusy}
                  onQuickResolve={(id) => { void runBatch('resolve', [id]) }}
                  onQuickDismiss={(id) => { void runBatch('dismiss', [id]) }}
                />
              )
          )}
        </div>
      </aside>
    </div>
  )
}

function ReviewHintList({
  items,
  selectedIds,
  onToggleSelect,
  lifecycleLabel,
  onLifecycle,
  onNavigateStock,
  actionBusy,
  onQuickResolve,
  onQuickDismiss,
}: {
  items: Array<{ id: string; title: string; summary: string; meta: string; signal?: DecisionSignalItem }>
  selectedIds?: Set<number>
  onToggleSelect?: (id: number) => void
  lifecycleLabel?: string
  onLifecycle?: (signal: DecisionSignalItem) => void
  onNavigateStock?: (signal: DecisionSignalItem) => void
  actionBusy?: boolean
  onQuickResolve?: (id: number) => void
  onQuickDismiss?: (id: number) => void
}) {
  return (
    <div className="space-y-2.5" data-testid="review-hints-list">
      {items.map(item => {
        const signalId = item.signal?.id
        const checked = signalId != null && selectedIds?.has(signalId)
        return (
          <article key={`${item.id}-${item.meta}`} className="rounded-xl border border-slate-100 bg-slate-50/70 px-3.5 py-3 dark:border-slate-800 dark:bg-slate-950/40">
            <div className="flex items-start gap-2.5">
              {item.signal && onToggleSelect && signalId != null && (
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={Boolean(checked)}
                  disabled={actionBusy}
                  onChange={() => onToggleSelect(signalId)}
                  aria-label={`选择 ${item.title}`}
                />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="min-w-0 text-sm font-bold leading-5 text-slate-900 dark:text-slate-100">{item.title}</h3>
                  <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-slate-500 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-400 dark:ring-slate-700">{item.meta}</span>
                </div>
                {item.summary ? <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-slate-500 dark:text-slate-400">{item.summary}</p> : null}
                {item.signal && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {onQuickResolve && signalId != null && (
                      <button
                        type="button"
                        disabled={actionBusy}
                        className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-40 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200"
                        onClick={() => onQuickResolve(signalId)}
                      >
                        有效收口
                      </button>
                    )}
                    {onQuickDismiss && signalId != null && (
                      <button
                        type="button"
                        disabled={actionBusy}
                        className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-40 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200"
                        onClick={() => onQuickDismiss(signalId)}
                      >
                        噪音忽略
                      </button>
                    )}
                    {onLifecycle && (
                      <button
                        type="button"
                        disabled={actionBusy}
                        className="rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-40 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-300"
                        onClick={() => onLifecycle(item.signal!)}
                      >
                        {lifecycleLabel || '事件明细'}
                      </button>
                    )}
                    {item.signal.tsCode && onNavigateStock && (
                      <button
                        type="button"
                        disabled={actionBusy}
                        className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                        onClick={() => onNavigateStock(item.signal!)}
                      >
                        走势图
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </article>
        )
      })}
    </div>
  )
}

function statusText(status: string): string {
  return {
    NEW: '未读',
    READ: '已读',
    WATCHING: '关注中',
    DISMISSED: '已忽略',
    EXPIRED: '已过期'
  }[status] ?? status
}

export function PortfolioRiskMiniPanel({
  data,
  loading,
  error,
  rangeDays,
  onReload,
  onRangeChange,
  onOpenReviewHistory,
}: {
  data: DecisionPortfolioRiskReviewData | null
  loading: boolean
  error: string | null
  rangeDays: number
  onReload: () => void
  onRangeChange: (rangeDays: number) => void
  onOpenReviewHistory?: () => void
}) {
  const suggestLookReview = (data?.missingCostPrice ?? 0) <= 0
  const suggestValue = suggestLookReview ? '看复盘' : '补成本价'
  const rows: Array<{ label: string; value: string; tone: 'red' | 'green' | 'normal'; clickable?: boolean }> = [
    { label: '成本价缺口', value: `${data?.missingCostPrice ?? 0} 只`, tone: 'red' },
    { label: '未收口风险信号', value: `${data?.unresolvedRiskSignals ?? 0} 条`, tone: 'red' },
    { label: '重复触发', value: `${data?.items.reduce((sum, item) => sum + item.repeatedSignals, 0) ?? 0} 条`, tone: 'green' },
    { label: '建议入口', value: suggestValue, tone: 'normal', clickable: suggestLookReview },
  ]

  return (
    <section data-testid="decision-portfolio-risk-review" className="flex min-h-0 flex-col overflow-hidden">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-extrabold text-gray-900 dark:text-gray-100">持仓风险复盘</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">近 {rangeDays} 日</p>
        </div>
        <button type="button" onClick={onReload} disabled={loading} className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-500 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">刷新</button>
      </div>
      <div className="mb-2 flex gap-1.5">
        {[7, 30, 90].map(option => (
          <button key={option} type="button" onClick={() => onRangeChange(option)} className={`rounded border px-2 py-1 text-[11px] ${rangeDays === option ? 'border-gray-900 bg-gray-900 text-white dark:border-gray-100 dark:bg-gray-100 dark:text-gray-950' : 'border-gray-200 text-gray-500 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800'}`}>{option}日</button>
        ))}
      </div>
      {error ? (
        <div className="rounded border border-red-200 bg-red-50 px-2 py-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">{error}</div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          {rows.map((row) => (
            <div key={row.label} className="flex items-center justify-between border-b border-gray-100 py-2 text-xs last:border-b-0 dark:border-gray-800">
              <span className="text-gray-500 dark:text-gray-400">{row.label}</span>
              {row.clickable && onOpenReviewHistory ? (
                <button
                  type="button"
                  data-testid="decision-suggest-open-review"
                  onClick={onOpenReviewHistory}
                  className="font-bold text-cyan-700 underline underline-offset-2 hover:text-cyan-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500 dark:text-cyan-300 dark:hover:text-cyan-200"
                >
                  {row.value}
                </button>
              ) : (
                <b className={row.tone === 'red' ? 'text-red-600 dark:text-red-400' : row.tone === 'green' ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-900 dark:text-gray-100'}>{row.value}</b>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function WorkspacePanel({ tabs, activeTab, onTabChange, scrollRef, children }: { tabs: Array<{ key: WorkspaceTab; label: string; count: number }>; activeTab: WorkspaceTab; onTabChange: (tab: WorkspaceTab) => void; scrollRef?: RefObject<HTMLDivElement>; children: React.ReactNode }) {
  return (
    <section data-testid="decision-workspace" className="flex min-h-0 flex-col overflow-hidden rounded-[10px] border border-gray-200/90 bg-white/92 shadow-sm shadow-gray-100/50 dark:border-gray-700 dark:bg-gray-900 dark:shadow-none">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-gray-100 px-3 pt-3 dark:border-gray-800">
        {tabs.map(tab => (
          <button
            key={tab.key}
            type="button"
            onClick={() => onTabChange(tab.key)}
            className={`rounded-t-lg border border-transparent border-b-0 px-3 py-2 text-xs transition-colors ${activeTab === tab.key ? 'translate-y-px border-gray-200 bg-white font-extrabold text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200'}`}
          >
            {tab.label} <span className="ml-1 text-[11px] opacity-70">{tab.count}</span>
          </button>
        ))}
      </div>
      <div ref={scrollRef} data-testid="decision-workspace-scroll" className="min-h-0 min-w-0 flex-1 overflow-y-auto p-3">{children}</div>
    </section>
  )
}

function PriorityPanel({ signals, renderSignal }: { signals: DecisionSignalItem[]; renderSignal: (signal: DecisionSignalItem) => JSX.Element }) {
  return (
    <section data-testid="decision-priority-panel" className="min-w-0">
      {signals.length > 0 ? (
        <div className="space-y-2">{signals.map(renderSignal)}</div>
      ) : (
        <div className="rounded border border-dashed border-gray-200 dark:border-gray-700 px-3 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
          当前筛选条件下暂无重点信号
        </div>
      )}
    </section>
  )
}

function DecisionSectionPanel({ section, renderSignal, compact = true }: { section: DecisionSection; renderSignal: (signal: DecisionSignalItem) => JSX.Element; compact?: boolean }) {
  return (
    <section data-testid={`decision-section-${section.key}`} className="min-w-0">
      {section.signals.length > 0 ? (
        <div className="space-y-2">
          {(compact ? section.signals.slice(0, 4) : section.signals).map(renderSignal)}
        </div>
      ) : (
        <div className="rounded border border-dashed border-gray-200 dark:border-gray-700 px-3 py-5 text-center text-sm text-gray-500 dark:text-gray-400">
          {section.emptyText}
        </div>
      )}
    </section>
  )
}
