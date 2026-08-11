import type { DecisionSignalItem } from './SignalCard'
import type { DecisionPortfolioRiskReviewData } from './decisionReviewStatsModel'
import {
  buildPortfolioCommandSummary,
  type PortfolioHoldingRow,
} from './portfolioCommandModel'
import { isPortfolioSignal, isRiskSignal } from './decisionSections'
import type { StockJudgmentTag } from './stockJudgmentModel'
import { JUDGMENT_TAG_OPTIONS } from './stockJudgmentModel'
import type { DecisionJudgmentSummaryItem } from './JudgmentHistoryPanel'

/** 周报告固定为近 7 个自然日 (含今日), 规格二选一写死 */
export const WEEKLY_REVIEW_RANGE_DAYS = 7

export type ReviewReportKind = 'daily' | 'weekly'

export interface ParsedJudgmentNote {
  tag: StockJudgmentTag | null
  tagLabel: string | null
  note: string
  raw: string
}

export interface ReviewReportProcessedItem {
  tsCode: string | null
  stockName: string
  tag: StockJudgmentTag | null
  tagLabel: string
  note: string
  title: string
  signalId: number
  resolvedAt: number | null
}

export interface ReviewReportOpenRiskItem {
  tsCode: string | null
  stockName: string
  title: string
  priority: number
  status: string
  signalId: number
}

export interface ReviewReportEvidenceGapItem {
  tsCode: string
  stockName: string
  reason: string
}

export interface ReviewReportFollowUpItem {
  tsCode: string | null
  stockName: string
  tagLabel: string
  note: string
  title: string
  signalId: number
}

export interface ReviewReportJudgmentFollowUpTask {
  judgmentId: string
  tsCode: string
  stockName: string | null
  tag: StockJudgmentTag
  note: string
  reviewDueAt: number
}

export interface ReviewReportSummaryBar {
  holdingCount: number
  portfolioSignalCount: number
  processedCount: number
  openRiskCount: number
  evidenceGapCount: number
  followUpCount: number
  /** 可选：关注中条数（旧快照可无） */
  watchingCount?: number
}

/** FR-250: 报告内嵌 AI 研判段落（可选；旧快照无此字段视为未生成） */
export type ReviewAiNarrativeStatus = 'pending' | 'ready' | 'error' | 'skipped'

export interface ReviewAiNarrative {
  status: ReviewAiNarrativeStatus
  text: string | null
  generatedAt?: number
  provider?: string
  model?: string
  errorCode?: string
  errorMessage?: string
}

export const REVIEW_AI_NARRATIVE_MAX_CHARS = 2500

/** 日结：概念热度 Top-N */
export const REVIEW_CONCEPT_HEAT_TOP = 8

export interface ReviewMarketDistributionBin {
  label: string
  count: number
  isPositive: boolean | null
}

export interface ReviewMarketEnvironment {
  available: boolean
  unavailableReason: string | null
  generatedAt: number | null
  isHistorical: boolean
  tradeDate: string | null
  upCount: number
  flatCount: number
  downCount: number
  distribution: ReviewMarketDistributionBin[]
  indexLines: string[]
  oneLiner: string | null
}

export interface ReviewCapitalHighlightItem {
  name: string
  avgChange: number | null
  limitUpCount: number | null
  limitDownCount: number | null
  mainNetInflow: number | null
  mainNetInflowRate: number | null
  kind: 'concept_heat' | 'sector_flow'
}

export interface ReviewCapitalHighlights {
  available: boolean
  unavailableReason: string | null
  items: ReviewCapitalHighlightItem[]
}

export interface ReviewHoldingMoveItem {
  tsCode: string
  stockName: string
  price: number | null
  changePct: number | null
  profitPct: number | null
  costPrice: number | null
  trendScore: number | null
  maAbove60: boolean | null
  todaySignalCount: number
  positionAdvice: string | null
  positionAdviceReason: string | null
  quoteUnavailable: boolean
}

export interface ReviewHoldingMoves {
  available: boolean
  unavailableReason: string | null
  items: ReviewHoldingMoveItem[]
}

export interface ReviewWatchedSignalItem {
  signalId: number
  title: string
  sourceModule: string
  priority: number
  tsCode: string | null
  stockName: string | null
  conceptName: string | null
}

export interface ReviewReport {
  kind: ReviewReportKind
  rangeDays: number
  generatedAt: number
  title: string
  headline: string
  summary: ReviewReportSummaryBar
  /** 日报日结节；周报/旧快照可缺省 */
  marketEnvironment?: ReviewMarketEnvironment | null
  capitalHighlights?: ReviewCapitalHighlights | null
  holdingMoves?: ReviewHoldingMoves | null
  watchedSignals?: ReviewWatchedSignalItem[] | null
  processed: ReviewReportProcessedItem[]
  openRisks: ReviewReportOpenRiskItem[]
  evidenceGaps: ReviewReportEvidenceGapItem[]
  followUps: ReviewReportFollowUpItem[]
  disclaimer: string
  emptyDay: boolean
  aiNarrative?: ReviewAiNarrative | null
}

/** 生成日报时可选注入的外部日结输入（IPC 精简后） */
export interface ReviewDayContextInput {
  marketOverview?: {
    distribution?: Array<{ label: string; count: number; isPositive: boolean | null }>
    conceptHeat?: Array<{
      conName: string
      avgChange: number
      limitUpCount: number
      limitDownCount: number
      memberCount?: number
    }>
    generatedAt?: number
    isHistorical?: boolean
    tradeDate?: string
    resonance?: {
      tradeDate?: string
      dataMode?: string
      sourceLabel?: string
      benchmarks?: Array<{ name: string; change: number }>
      sectors?: Array<{
        name: string
        change: number
        mainNetInflow?: number | null
        mainNetInflowRate?: number | null
      }>
    } | null
  } | null
  marketOverviewError?: string | null
  dashboardItems?: Array<{
    tsCode: string
    stockName: string
    costPrice: number | null
    price: number | null
    change: number | null
    profitPct: number | null
    positionAdvice?: string | null
    positionAdviceReason?: string | null
    trend?: {
      totalScore: number | null
      maAbove60: boolean | null
      dataSource?: string | null
    }
    todaySignals?: { count: number }
    sectorFlow?: {
      conceptName: string
      mainNetInflow: number | null
      mainNetInflowRate: number | null
    } | null
  }> | null
  dashboardError?: string | null
}

/** @deprecated 使用 ReviewReport; 保留别名兼容 P1 调用 */
export type DailyReviewReport = ReviewReport

const JUDGMENT_TAG_SET = new Set<StockJudgmentTag>(
  JUDGMENT_TAG_OPTIONS.map((item) => item.value),
)

const TAG_LABEL_MAP = Object.fromEntries(
  JUDGMENT_TAG_OPTIONS.map((item) => [item.value, item.label]),
) as Record<StockJudgmentTag, string>

function normalizeCode(code: string): string {
  return code.includes('.') ? code.split('.')[0]! : code
}

function stockLabel(signal: Pick<DecisionSignalItem, 'stockName' | 'tsCode'>): string {
  if (signal.stockName) return signal.stockName
  if (signal.tsCode) return normalizeCode(signal.tsCode)
  return '未命名'
}

/**
 * 从 resolutionNote 解析 [judgment:tag] 前缀。
 * 解析失败时 tag 为 null, 正文保留原文本。
 */
export function parseJudgmentNote(raw: string | null | undefined): ParsedJudgmentNote {
  const text = (raw ?? '').trim()
  if (!text) {
    return { tag: null, tagLabel: null, note: '', raw: '' }
  }
  const match = text.match(/^\[judgment:([a-z_]+)\]\s*(.*)$/i)
  if (!match) {
    return { tag: null, tagLabel: null, note: text, raw: text }
  }
  const candidate = match[1]!.toLowerCase() as StockJudgmentTag
  if (!JUDGMENT_TAG_SET.has(candidate)) {
    return { tag: null, tagLabel: null, note: text, raw: text }
  }
  return {
    tag: candidate,
    tagLabel: TAG_LABEL_MAP[candidate],
    note: (match[2] ?? '').trim(),
    raw: text,
  }
}

function isOpenRiskSignal(signal: DecisionSignalItem): boolean {
  if (signal.status === 'DISMISSED' || signal.status === 'EXPIRED') return false
  if (signal.resolvedAt && signal.status !== 'WATCHING') return false
  if (!isRiskSignal(signal)) return false
  return isPortfolioSignal(signal) || !!signal.tsCode
}

function isProcessedSignal(signal: DecisionSignalItem): boolean {
  if (signal.resolvedAt || signal.resolution) return true
  if (signal.status === 'DISMISSED') return true
  return false
}

function isFollowUpSignal(signal: DecisionSignalItem): boolean {
  if (!isProcessedSignal(signal)) return false
  const parsed = parseJudgmentNote(signal.resolutionNote)
  if (parsed.tag === 'insufficient' || parsed.tag === 'watch') return true
  if (signal.resolution === 'RESOLVED_DATA_ISSUE') return true
  if (signal.status === 'WATCHING' && parsed.tag === 'risk_off') return true
  return false
}

function filterPortfolioSignals(
  signals: DecisionSignalItem[],
  holdings: PortfolioHoldingRow[] | null,
): DecisionSignalItem[] {
  return signals.filter((signal) => {
    if (isPortfolioSignal(signal)) return true
    if (!holdings || !signal.tsCode) return false
    const code = normalizeCode(signal.tsCode)
    return holdings.some((row) => normalizeCode(row.tsCode) === code)
  })
}

function buildEvidenceGaps(
  holdings: PortfolioHoldingRow[] | null,
  portfolioRiskData: DecisionPortfolioRiskReviewData | null,
  signals: DecisionSignalItem[],
): ReviewReportEvidenceGapItem[] {
  const map = new Map<string, ReviewReportEvidenceGapItem>()

  if (holdings) {
    for (const row of holdings) {
      if (row.costPrice != null) continue
      const code = normalizeCode(row.tsCode)
      map.set(code, {
        tsCode: row.tsCode,
        stockName: row.stockName || code,
        reason: '缺少持仓成本价',
      })
    }
  } else if (portfolioRiskData) {
    for (const item of portfolioRiskData.items) {
      if (item.costPrice != null) continue
      const code = normalizeCode(item.tsCode)
      map.set(code, {
        tsCode: item.tsCode,
        stockName: item.stockName || code,
        reason: '缺少持仓成本价',
      })
    }
  }

  for (const signal of signals.filter(isPortfolioSignal)) {
    if (!signal.tsCode) continue
    const code = normalizeCode(signal.tsCode)
    if (map.has(code)) continue
    try {
      const reason = signal.reasonJson ? JSON.parse(signal.reasonJson) as Record<string, unknown> : null
      const sourceRef = signal.sourceRefJson ? JSON.parse(signal.sourceRefJson) as Record<string, unknown> : null
      const hasCost = typeof reason?.costPrice === 'number' || typeof sourceRef?.costPrice === 'number'
      if (!hasCost) {
        map.set(code, {
          tsCode: signal.tsCode,
          stockName: stockLabel(signal),
          reason: '持仓信号缺少成本上下文',
        })
      }
    } catch {
      // 解析失败不伪造缺口
    }
  }

  return Array.from(map.values()).slice(0, 20)
}

function buildProcessedItems(
  portfolioSignals: DecisionSignalItem[],
  judgments: DecisionJudgmentSummaryItem[] = [],
): ReviewReportProcessedItem[] {
  const signalById = new Map(portfolioSignals.map((signal) => [signal.id, signal]))
  const latestJudgmentByCode = new Map<string, DecisionJudgmentSummaryItem>()
  for (const judgment of [...judgments].sort((a, b) => b.createdAt - a.createdAt || b.versionNumber - a.versionNumber)) {
    const code = normalizeCode(judgment.tsCode)
    if (!latestJudgmentByCode.has(code)) latestJudgmentByCode.set(code, judgment)
  }
  const processedPool = portfolioSignals.filter(isProcessedSignal)
  const processedByCode = new Map<string, ReviewReportProcessedItem>()
  for (const judgment of latestJudgmentByCode.values()) {
    const source = judgment.sourceSignalId == null ? null : signalById.get(judgment.sourceSignalId) ?? null
    processedByCode.set(`code:${normalizeCode(judgment.tsCode)}`, {
      tsCode: judgment.tsCode,
      stockName: judgment.stockName || normalizeCode(judgment.tsCode),
      tag: judgment.tag,
      tagLabel: TAG_LABEL_MAP[judgment.tag],
      note: judgment.note || '无备注',
      title: source?.title || '独立判断记录',
      signalId: judgment.sourceSignalId ?? -1,
      resolvedAt: judgment.createdAt,
    })
  }
  for (const signal of processedPool) {
    const key = signal.tsCode ? `code:${normalizeCode(signal.tsCode)}` : `id:${signal.id}`
    if (signal.tsCode && latestJudgmentByCode.has(normalizeCode(signal.tsCode))) continue
    const parsed = parseJudgmentNote(signal.resolutionNote)
    const item: ReviewReportProcessedItem = {
      tsCode: signal.tsCode,
      stockName: stockLabel(signal),
      tag: parsed.tag,
      tagLabel: parsed.tagLabel ?? (signal.status === 'DISMISSED' ? '已忽略' : (signal.resolution ? '已结案' : '已处理')),
      note: parsed.note || (signal.resolutionNote ?? '').trim() || '无备注',
      title: signal.title,
      signalId: signal.id,
      resolvedAt: signal.resolvedAt ?? signal.dismissedAt ?? null,
    }
    const prev = processedByCode.get(key)
    if (!prev) {
      processedByCode.set(key, item)
      continue
    }
    const prevScore = (prev.resolvedAt ?? 0) + (prev.tag ? 1e15 : 0)
    const nextScore = (item.resolvedAt ?? 0) + (item.tag ? 1e15 : 0)
    if (nextScore >= prevScore) processedByCode.set(key, item)
  }
  return Array.from(processedByCode.values())
    .sort((a, b) => (b.resolvedAt ?? 0) - (a.resolvedAt ?? 0) || b.signalId - a.signalId)
    .slice(0, 30)
}

function buildOpenRiskItems(portfolioSignals: DecisionSignalItem[]): ReviewReportOpenRiskItem[] {
  return portfolioSignals
    .filter(isOpenRiskSignal)
    .sort((a, b) => b.priority - a.priority || b.signalTime - a.signalTime)
    .slice(0, 20)
    .map((signal): ReviewReportOpenRiskItem => ({
      tsCode: signal.tsCode,
      stockName: stockLabel(signal),
      title: signal.title,
      priority: signal.priority,
      status: signal.status,
      signalId: signal.id,
    }))
}

function buildFollowUpItems(
  portfolioSignals: DecisionSignalItem[],
  judgments: DecisionJudgmentSummaryItem[] = [],
  judgmentFollowUps: ReviewReportJudgmentFollowUpTask[] = [],
): ReviewReportFollowUpItem[] {
  const latestByCode = new Map<string, DecisionJudgmentSummaryItem>()
  for (const judgment of [...judgments].sort((a, b) => b.createdAt - a.createdAt || b.versionNumber - a.versionNumber)) {
    const code = normalizeCode(judgment.tsCode)
    if (!latestByCode.has(code)) latestByCode.set(code, judgment)
  }
  const fromLedger = judgmentFollowUps
    .map((task): ReviewReportFollowUpItem => ({
      tsCode: task.tsCode,
      stockName: task.stockName || normalizeCode(task.tsCode),
      tagLabel: TAG_LABEL_MAP[task.tag],
      note: task.note || '无备注',
      title: '到期判断待回访',
      signalId: latestByCode.get(normalizeCode(task.tsCode))?.sourceSignalId ?? -1,
    }))
  const legacy = portfolioSignals
    .filter((signal) => !signal.tsCode || !latestByCode.has(normalizeCode(signal.tsCode)))
    .filter(isFollowUpSignal)
    .map((signal): ReviewReportFollowUpItem => {
      const parsed = parseJudgmentNote(signal.resolutionNote)
      return {
        tsCode: signal.tsCode,
        stockName: stockLabel(signal),
        tagLabel: parsed.tagLabel ?? (signal.resolution === 'RESOLVED_DATA_ISSUE' ? '信息不足' : '继续观察'),
        note: parsed.note || (signal.resolutionNote ?? '').trim() || signal.summary,
        title: signal.title,
        signalId: signal.id,
      }
    })
  return [...fromLedger, ...legacy].slice(0, 20)
}

function formatSignedPct(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return '—'
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(digits)}%`
}

function formatPrice(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return value.toFixed(2)
}

function formatInflowYi(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—'
  const yi = value / 1e8
  const sign = yi > 0 ? '+' : ''
  return `${sign}${yi.toFixed(2)}亿`
}

export function buildWatchedSignalItems(signals: DecisionSignalItem[]): ReviewWatchedSignalItem[] {
  return signals
    .filter((signal) => signal.status === 'WATCHING')
    .slice()
    .sort((a, b) => (b.priority - a.priority) || (b.signalTime - a.signalTime))
    .slice(0, 30)
    .map((signal) => ({
      signalId: signal.id,
      title: signal.title,
      sourceModule: signal.sourceModule,
      priority: signal.priority,
      tsCode: signal.tsCode,
      stockName: signal.stockName,
      conceptName: signal.conceptName,
    }))
}

export function buildMarketEnvironmentFromOverview(
  overview: ReviewDayContextInput['marketOverview'],
  error: string | null | undefined,
): ReviewMarketEnvironment {
  if (error) {
    return {
      available: false,
      unavailableReason: error,
      generatedAt: null,
      isHistorical: false,
      tradeDate: null,
      upCount: 0,
      flatCount: 0,
      downCount: 0,
      distribution: [],
      indexLines: [],
      oneLiner: null,
    }
  }
  if (!overview) {
    return {
      available: false,
      unavailableReason: '本地暂无市场概览',
      generatedAt: null,
      isHistorical: false,
      tradeDate: null,
      upCount: 0,
      flatCount: 0,
      downCount: 0,
      distribution: [],
      indexLines: [],
      oneLiner: null,
    }
  }

  const distribution = (overview.distribution ?? []).map((bin) => ({
    label: bin.label,
    count: bin.count,
    isPositive: bin.isPositive,
  }))
  let upCount = 0
  let flatCount = 0
  let downCount = 0
  for (const bin of distribution) {
    if (bin.isPositive === true) upCount += bin.count
    else if (bin.isPositive === false) downCount += bin.count
    else flatCount += bin.count
  }

  const indexLines = (overview.resonance?.benchmarks ?? [])
    .slice(0, 4)
    .map((item) => `${item.name} ${formatSignedPct(item.change)}`)

  const hasBreadth = distribution.some((bin) => bin.count > 0)
  const oneLiner = hasBreadth
    ? `涨跌家数 涨${upCount}/平${flatCount}/跌${downCount}${indexLines[0] ? ` · ${indexLines[0]}` : ''}${overview.isHistorical ? ' · 历史回退数据' : ''}`
    : (indexLines[0] ? `指数 ${indexLines.join(' · ')}` : null)

  return {
    available: hasBreadth || indexLines.length > 0,
    unavailableReason: hasBreadth || indexLines.length > 0 ? null : '本地暂无涨跌分布或指数摘要',
    generatedAt: overview.generatedAt ?? null,
    isHistorical: Boolean(overview.isHistorical),
    tradeDate: overview.tradeDate ?? overview.resonance?.tradeDate ?? null,
    upCount,
    flatCount,
    downCount,
    distribution,
    indexLines,
    oneLiner,
  }
}

export function buildCapitalHighlightsFromOverview(
  overview: ReviewDayContextInput['marketOverview'],
  dashboardItems: ReviewDayContextInput['dashboardItems'],
  error: string | null | undefined,
): ReviewCapitalHighlights {
  if (error && !overview) {
    return { available: false, unavailableReason: error, items: [] }
  }
  const items: ReviewCapitalHighlightItem[] = []
  for (const heat of (overview?.conceptHeat ?? []).slice(0, REVIEW_CONCEPT_HEAT_TOP)) {
    items.push({
      name: heat.conName,
      avgChange: heat.avgChange,
      limitUpCount: heat.limitUpCount,
      limitDownCount: heat.limitDownCount,
      mainNetInflow: null,
      mainNetInflowRate: null,
      kind: 'concept_heat',
    })
  }
  const seen = new Set(items.map((item) => item.name))
  for (const row of dashboardItems ?? []) {
    const flow = row.sectorFlow
    if (!flow?.conceptName || seen.has(flow.conceptName)) continue
    seen.add(flow.conceptName)
    items.push({
      name: flow.conceptName,
      avgChange: null,
      limitUpCount: null,
      limitDownCount: null,
      mainNetInflow: flow.mainNetInflow,
      mainNetInflowRate: flow.mainNetInflowRate,
      kind: 'sector_flow',
    })
    if (items.length >= REVIEW_CONCEPT_HEAT_TOP + 4) break
  }
  // resonance sectors with inflow
  for (const sector of overview?.resonance?.sectors ?? []) {
    if (seen.has(sector.name)) continue
    if (sector.mainNetInflow == null && sector.mainNetInflowRate == null) continue
    seen.add(sector.name)
    items.push({
      name: sector.name,
      avgChange: sector.change,
      limitUpCount: null,
      limitDownCount: null,
      mainNetInflow: sector.mainNetInflow ?? null,
      mainNetInflowRate: sector.mainNetInflowRate ?? null,
      kind: 'sector_flow',
    })
    if (items.length >= REVIEW_CONCEPT_HEAT_TOP + 6) break
  }

  if (items.length === 0) {
    return {
      available: false,
      unavailableReason: error || '本地暂无概念热度或板块资金摘要',
      items: [],
    }
  }
  return { available: true, unavailableReason: null, items }
}

export function buildHoldingMovesFromContext(
  holdings: PortfolioHoldingRow[] | null,
  dashboardItems: ReviewDayContextInput['dashboardItems'],
  dashboardError: string | null | undefined,
): ReviewHoldingMoves {
  if (!holdings || holdings.length === 0) {
    return { available: true, unavailableReason: null, items: [] }
  }
  const byCode = new Map<string, NonNullable<ReviewDayContextInput['dashboardItems']>[number]>()
  for (const item of dashboardItems ?? []) {
    byCode.set(normalizeCode(item.tsCode), item)
  }

  const items: ReviewHoldingMoveItem[] = holdings.map((row) => {
    const dash = byCode.get(normalizeCode(row.tsCode))
    if (!dash) {
      return {
        tsCode: row.tsCode,
        stockName: row.stockName || normalizeCode(row.tsCode),
        price: null,
        changePct: null,
        profitPct: null,
        costPrice: row.costPrice,
        trendScore: null,
        maAbove60: null,
        todaySignalCount: 0,
        positionAdvice: null,
        positionAdviceReason: null,
        quoteUnavailable: true,
      }
    }
    return {
      tsCode: dash.tsCode,
      stockName: dash.stockName || row.stockName || normalizeCode(row.tsCode),
      price: dash.price,
      changePct: dash.change,
      profitPct: dash.profitPct,
      costPrice: dash.costPrice ?? row.costPrice,
      trendScore: dash.trend?.totalScore ?? null,
      maAbove60: dash.trend?.maAbove60 ?? null,
      todaySignalCount: dash.todaySignals?.count ?? 0,
      positionAdvice: dash.positionAdvice ?? null,
      positionAdviceReason: dash.positionAdviceReason ?? null,
      quoteUnavailable: dash.price == null && dash.change == null,
    }
  })

  return {
    available: true,
    unavailableReason: dashboardError && (!dashboardItems || dashboardItems.length === 0)
      ? dashboardError
      : null,
    items,
  }
}

function buildHeadline(input: {
  kind: ReviewReportKind
  rangeDays: number
  holdingCount: number
  pendingCount: number
  emptyDay: boolean
  processedCount: number
  openRiskCount: number
  evidenceGapCount: number
  marketOneLiner?: string | null
  watchingCount?: number
}): string {
  const {
    kind, rangeDays, holdingCount, pendingCount, emptyDay,
    processedCount, openRiskCount, evidenceGapCount, marketOneLiner, watchingCount,
  } = input
  const period = kind === 'weekly' ? `近 ${rangeDays} 日` : '今日'

  let base: string
  if (holdingCount === 0) {
    base = kind === 'weekly'
      ? '尚未添加持仓。近一周无组合风险待办; 添加持仓后可生成持仓向周复盘。'
      : '尚未添加持仓。今日无组合风险待办; 添加持仓后可生成持仓向复盘。'
  } else if (emptyDay) {
    base = kind === 'weekly'
      ? `持仓 ${holdingCount} 只, 近 ${rangeDays} 日无持仓相关处理记录, 组合风险整体平稳。`
      : `持仓 ${holdingCount} 只, 今日无新的持仓相关信号, 组合风险平稳。`
  } else if (openRiskCount > 0) {
    base = `${period}已处理 ${processedCount} 只, 仍有 ${openRiskCount} 条未处理持仓风险, 证据缺口 ${evidenceGapCount} 项。`
  } else if (processedCount > 0) {
    base = `${period}已处理 ${processedCount} 只持仓相关线索, 当前无开放持仓风险。`
  } else {
    base = `持仓 ${holdingCount} 只, 组合待办 ${pendingCount} 条, 可继续按股研判后生成更完整复盘。`
  }

  const extras: string[] = []
  if (kind === 'daily' && marketOneLiner) extras.push(marketOneLiner)
  if (kind === 'daily' && (watchingCount ?? 0) > 0) extras.push(`关注中 ${watchingCount} 条`)
  return extras.length > 0 ? `${base} ${extras.join(' · ')}` : base
}

/**
 * 通用复盘报告派生。
 * - periodSignals: 周期内信号 (日=今日, 周=近 N 日历史)
 * - openRiskSignals: 当前仍开放风险, 默认用 periodSignals; 周报可传入今日开放集
 * - dayContext: 仅日报使用的市场/持仓看板日结
 */
export function buildReviewReport(input: {
  kind: ReviewReportKind
  rangeDays?: number
  signals: DecisionSignalItem[]
  holdings: PortfolioHoldingRow[] | null
  portfolioRiskData?: DecisionPortfolioRiskReviewData | null
  openRiskSignals?: DecisionSignalItem[]
  generatedAt?: number
  judgments?: DecisionJudgmentSummaryItem[]
  judgmentFollowUps?: ReviewReportJudgmentFollowUpTask[]
  dayContext?: ReviewDayContextInput | null
}): ReviewReport {
  const kind = input.kind
  const rangeDays = input.rangeDays ?? (kind === 'weekly' ? WEEKLY_REVIEW_RANGE_DAYS : 1)
  const generatedAt = input.generatedAt ?? Date.now()
  const holdings = input.holdings
  const portfolioRiskData = input.portfolioRiskData ?? null
  const command = buildPortfolioCommandSummary(input.signals, holdings, portfolioRiskData)

  const portfolioSignals = filterPortfolioSignals(input.signals, holdings)
  const openSource = input.openRiskSignals ?? input.signals
  const openPortfolioSignals = filterPortfolioSignals(openSource, holdings)

  const processed = buildProcessedItems(portfolioSignals, input.judgments)
  const openRisks = buildOpenRiskItems(openPortfolioSignals)
  const evidenceGaps = buildEvidenceGaps(holdings, portfolioRiskData, openSource)
  const followUps = buildFollowUpItems(portfolioSignals, input.judgments, input.judgmentFollowUps)

  const emptyDay = portfolioSignals.length === 0 && openRisks.length === 0 && processed.length === 0
  const holdingCount = command.holdingCount

  const dayContext = kind === 'daily' ? (input.dayContext ?? null) : null
  const watchedSignals = kind === 'daily' ? buildWatchedSignalItems(input.signals) : null
  const marketEnvironment = kind === 'daily'
    ? buildMarketEnvironmentFromOverview(
      dayContext?.marketOverview,
      dayContext?.marketOverviewError ?? (dayContext == null ? '未拉取市场概览' : null),
    )
    : null
  const capitalHighlights = kind === 'daily'
    ? buildCapitalHighlightsFromOverview(
      dayContext?.marketOverview,
      dayContext?.dashboardItems,
      dayContext?.marketOverviewError ?? (dayContext == null ? '未拉取市场概览' : null),
    )
    : null
  const holdingMoves = kind === 'daily'
    ? buildHoldingMovesFromContext(holdings, dayContext?.dashboardItems, dayContext?.dashboardError)
    : null

  const headline = buildHeadline({
    kind,
    rangeDays,
    holdingCount,
    pendingCount: command.pendingCount,
    emptyDay,
    processedCount: processed.length,
    openRiskCount: openRisks.length,
    evidenceGapCount: evidenceGaps.length,
    marketOneLiner: marketEnvironment?.oneLiner,
    watchingCount: watchedSignals?.length ?? 0,
  })

  return {
    kind,
    rangeDays,
    generatedAt,
    title: kind === 'weekly' ? '本周复盘报告' : '今日复盘报告',
    headline,
    summary: {
      holdingCount,
      portfolioSignalCount: portfolioSignals.length,
      processedCount: processed.length,
      openRiskCount: openRisks.length,
      evidenceGapCount: evidenceGaps.length,
      followUpCount: followUps.length,
      ...(kind === 'daily' ? { watchingCount: watchedSignals?.length ?? 0 } : {}),
    },
    ...(kind === 'daily'
      ? {
          marketEnvironment,
          capitalHighlights,
          holdingMoves,
          watchedSignals: watchedSignals ?? [],
        }
      : {}),
    processed,
    openRisks,
    evidenceGaps,
    followUps,
    disclaimer: '本报告仅作个人投研辅助复盘, 不构成买卖、仓位或目标价建议。',
    emptyDay,
  }
}

/**
 * 从前端已有 signals/holdings/风险复盘即时派生日复盘报告。
 * 无信号日也返回完整短报告, 不抛错。
 */
export function buildDailyReviewReport(input: {
  signals: DecisionSignalItem[]
  holdings: PortfolioHoldingRow[] | null
  portfolioRiskData?: DecisionPortfolioRiskReviewData | null
  generatedAt?: number
  judgments?: DecisionJudgmentSummaryItem[]
  judgmentFollowUps?: ReviewReportJudgmentFollowUpTask[]
  dayContext?: ReviewDayContextInput | null
}): ReviewReport {
  return buildReviewReport({
    kind: 'daily',
    rangeDays: 1,
    signals: input.signals,
    holdings: input.holdings,
    portfolioRiskData: input.portfolioRiskData,
    generatedAt: input.generatedAt,
    judgments: input.judgments,
    judgmentFollowUps: input.judgmentFollowUps,
    dayContext: input.dayContext,
  })
}

/**
 * 周复盘: 近 WEEKLY_REVIEW_RANGE_DAYS 自然日持仓相关历史信号。
 * openRiskSignals 建议传今日开放信号, 避免历史已结案项冒充当前风险。
 */
export function buildWeeklyReviewReport(input: {
  historySignals: DecisionSignalItem[]
  holdings: PortfolioHoldingRow[] | null
  portfolioRiskData?: DecisionPortfolioRiskReviewData | null
  openRiskSignals?: DecisionSignalItem[]
  rangeDays?: number
  generatedAt?: number
  judgments?: DecisionJudgmentSummaryItem[]
  judgmentFollowUps?: ReviewReportJudgmentFollowUpTask[]
}): ReviewReport {
  const rangeDays = input.rangeDays ?? WEEKLY_REVIEW_RANGE_DAYS
  return buildReviewReport({
    kind: 'weekly',
    rangeDays,
    signals: input.historySignals,
    holdings: input.holdings,
    portfolioRiskData: input.portfolioRiskData,
    openRiskSignals: input.openRiskSignals,
    generatedAt: input.generatedAt,
    judgments: input.judgments,
    judgmentFollowUps: input.judgmentFollowUps,
  })
}

/** 将复盘报告转为可复制的纯文本 */
export function formatDailyReviewReportText(report: ReviewReport): string {
  return formatReviewReportText(report)
}

export function formatReviewReportText(report: ReviewReport): string {
  const lines: string[] = []
  lines.push(report.title)
  if (report.kind === 'weekly') {
    lines.push(`范围: 近 ${report.rangeDays} 个自然日 (含今日)`)
  }
  lines.push(report.headline)
  lines.push('')
  const watchingPart = report.summary.watchingCount != null
    ? ` · 关注中 ${report.summary.watchingCount}`
    : ''
  lines.push(
    `摘要: 持仓 ${report.summary.holdingCount} · 持仓相关信号 ${report.summary.portfolioSignalCount} · 已处理 ${report.summary.processedCount} · 未处理风险 ${report.summary.openRiskCount} · 证据缺口 ${report.summary.evidenceGapCount} · 待验证 ${report.summary.followUpCount}${watchingPart}`,
  )
  lines.push('')

  if (report.kind === 'daily') {
    lines.push('## 市场环境')
    const market = report.marketEnvironment
    if (!market || !market.available) {
      lines.push(`- ${market?.unavailableReason || '本地暂无市场环境摘要'}`)
    } else {
      lines.push(`- 涨跌家数 涨${market.upCount}/平${market.flatCount}/跌${market.downCount}`)
      for (const line of market.indexLines) lines.push(`- ${line}`)
      if (market.isHistorical) lines.push('- 数据为历史回退')
    }
    lines.push('')

    lines.push('## 资金要点')
    const capital = report.capitalHighlights
    if (!capital || !capital.available || capital.items.length === 0) {
      lines.push(`- ${capital?.unavailableReason || '本地暂无资金/热度摘要'}`)
    } else {
      for (const item of capital.items) {
        const bits = [item.name]
        if (item.avgChange != null) bits.push(`均涨跌 ${formatSignedPct(item.avgChange)}`)
        if (item.limitUpCount != null) bits.push(`涨停 ${item.limitUpCount}`)
        if (item.mainNetInflow != null) bits.push(`主力净流入 ${formatInflowYi(item.mainNetInflow)}`)
        if (item.mainNetInflowRate != null) bits.push(`净流入率 ${formatSignedPct(item.mainNetInflowRate)}`)
        lines.push(`- ${bits.join(' · ')}`)
      }
    }
    lines.push('')

    lines.push('## 持仓走势')
    const moves = report.holdingMoves
    if (!moves) {
      lines.push('- 本地暂无持仓走势')
    } else if (moves.items.length === 0) {
      lines.push('- 暂无持仓')
    } else {
      if (moves.unavailableReason) lines.push(`- 提示: ${moves.unavailableReason}`)
      for (const item of moves.items) {
        const bits = [
          item.stockName,
          `现价 ${formatPrice(item.price)}`,
          `涨跌 ${formatSignedPct(item.changePct)}`,
          item.profitPct != null ? `浮盈 ${formatSignedPct(item.profitPct)}` : '浮盈 —',
          item.trendScore != null ? `趋势分 ${item.trendScore}` : '趋势分 —',
          item.maAbove60 == null ? 'MA60 —' : (item.maAbove60 ? '站上MA60' : '未站上MA60'),
          `今日信号 ${item.todaySignalCount}`,
        ]
        if (item.positionAdvice) bits.push(`规则辅助 ${item.positionAdvice}`)
        if (item.quoteUnavailable) bits.push('行情未加载')
        lines.push(`- ${bits.join(' · ')}`)
      }
    }
    lines.push('')

    lines.push('## 今日关注')
    const watched = report.watchedSignals ?? []
    if (watched.length === 0) {
      lines.push('- 暂无关注中信号')
    } else {
      for (const item of watched) {
        const who = item.stockName || item.conceptName || item.tsCode || '未映射'
        lines.push(`- ${who} · P${item.priority} · ${item.sourceModule} · ${item.title}`)
      }
    }
    lines.push('')
  }

  lines.push('## 已处理')
  if (report.processed.length === 0) {
    lines.push('- 暂无已结案/已忽略的持仓相关处理记录')
  } else {
    for (const item of report.processed) {
      lines.push(`- ${item.stockName} · ${item.tagLabel} · ${item.title}${item.note ? ` · ${item.note}` : ''}`)
    }
  }
  lines.push('')
  lines.push('## 未处理风险')
  if (report.openRisks.length === 0) {
    lines.push('- 当前无开放持仓风险')
  } else {
    for (const item of report.openRisks) {
      lines.push(`- ${item.stockName} · P${item.priority} · ${item.title} · ${item.status}`)
    }
  }
  lines.push('')
  lines.push('## 证据缺口')
  if (report.evidenceGaps.length === 0) {
    lines.push('- 暂无成本等证据缺口')
  } else {
    for (const item of report.evidenceGaps) {
      lines.push(`- ${item.stockName} · ${item.reason}`)
    }
  }
  lines.push('')
  lines.push('## 待验证清单')
  if (report.followUps.length === 0) {
    lines.push('- 暂无信息不足/继续观察类回访点')
  } else {
    for (const item of report.followUps) {
      lines.push(`- ${item.stockName} · ${item.tagLabel} · ${item.title}${item.note ? ` · ${item.note}` : ''}`)
    }
  }
  lines.push('')
  lines.push('## AI 研判')
  const ai = report.aiNarrative
  if (!ai || ai.status === 'skipped') {
    lines.push('- AI 研判未生成')
  } else if (ai.status === 'pending') {
    lines.push('- AI 研判生成中…')
  } else if (ai.status === 'error') {
    lines.push(`- AI 研判未生成：${ai.errorMessage || ai.errorCode || '调用失败'}`)
  } else if (ai.text?.trim()) {
    lines.push(ai.text.trim())
  } else {
    lines.push('- AI 研判未生成')
  }
  lines.push('')
  lines.push(report.disclaimer)
  return lines.join('\n')
}
