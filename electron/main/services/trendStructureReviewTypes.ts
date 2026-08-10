import { createHash } from 'crypto'
import type { TrendWorkbenchItem } from './trendWorkbenchService'
import type { TrendState } from './trendScoreModel'

export const AI_TREND_VERDICTS = [
  'agree',
  'possible_false_break',
  'possible_false_hold',
  'evidence_weak',
  'need_more_data',
] as const

export type AiTrendVerdict = typeof AI_TREND_VERDICTS[number]

/** 确定性门槛短路（未调模型）vs 模型第二意见；由落库 provider/model 派生，不改 revision 语义。 */
export type TrendReviewSource = 'gate' | 'model'

export interface TrendStructureReviewSummary {
  verdict: AiTrendVerdict
  rationale: string
  focusPoints: string[]
  stale: boolean
  scoreDate: string
  factsHash: string
  createdAt: number
  source: TrendReviewSource
}

export function deriveTrendReviewSource(
  provider: string | null | undefined,
  model: string | null | undefined,
): TrendReviewSource {
  return provider == null && model == null ? 'gate' : 'model'
}

export interface AiTrendReviewPayload {
  verdict: AiTrendVerdict
  rationale: string
  focusPoints: string[]
}

export interface TrendReviewFacts {
  tsCode: string
  stockName: string
  trendState: TrendState
  totalScore: number | null
  scoreDelta5d: number | null
  scoreDelta20d: number | null
  maAbove60: boolean | null
  validWeight: number | null
  dataCoverage: {
    bars: number
    requiredBars: number
    latestTradeDate: string | null
    state: 'ready' | 'partial' | 'missing'
  }
  facts: {
    stockReturn20d: number | null
    benchmarkReturn20d: number | null
    excessReturn20d: number | null
    maxDrawdown20d: number | null
    turnoverRatio: number | null
  } | null
  scoreDate: string
}

export const MAX_TREND_REVIEW_RATIONALE_LENGTH = 120
export const MAX_TREND_REVIEW_FOCUS_POINTS = 3
export const MAX_TREND_REVIEW_FOCUS_POINT_LENGTH = 80

export function buildTrendReviewFactsFromItem(item: TrendWorkbenchItem, now = Date.now()): TrendReviewFacts {
  return {
    tsCode: normalizeTrendTsCode(item.tsCode),
    stockName: item.stockName,
    trendState: item.trendState,
    totalScore: item.totalScore,
    scoreDelta5d: item.scoreDelta5d,
    scoreDelta20d: item.scoreDelta20d,
    maAbove60: item.maAbove60,
    validWeight: item.validWeight,
    dataCoverage: {
      bars: item.dataCoverage.bars,
      requiredBars: item.dataCoverage.requiredBars,
      latestTradeDate: item.dataCoverage.latestTradeDate,
      state: item.dataCoverage.state,
    },
    facts: item.facts == null ? null : {
      stockReturn20d: item.facts.stockReturn20d,
      benchmarkReturn20d: item.facts.benchmarkReturn20d,
      excessReturn20d: item.facts.excessReturn20d,
      maxDrawdown20d: item.facts.maxDrawdown20d,
      turnoverRatio: item.facts.turnoverRatio,
    },
    scoreDate: item.scoreDate || item.dataCoverage.latestTradeDate || formatYmd(now),
  }
}

export function hashTrendReviewFacts(facts: TrendReviewFacts): string {
  return createHash('sha256').update(stableStringify(facts)).digest('hex')
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`
}

export function normalizeTrendTsCode(tsCode: string): string {
  const clean = tsCode.trim().toUpperCase()
  if (/^\d{6}\.(SH|SZ|BJ)$/.test(clean)) return clean
  const code = clean.replace(/\.(SH|SZ|BJ)$/i, '')
  if (/^(600|601|603|605|688|900|110|113|118|127|128|129|131|132)/.test(code)) return `${code}.SH`
  if (/^(430|830|87|88|89|92)/.test(code)) return `${code}.BJ`
  return `${code}.SZ`
}

function formatYmd(timestamp: number): string {
  const date = new Date(timestamp)
  return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}${String(date.getUTCDate()).padStart(2, '0')}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stripJsonCodeFence(raw: string): string {
  const trimmed = raw.trim()
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  return match?.[1]?.trim() ?? trimmed
}

export function parseAiTrendReviewPayload(raw: string): AiTrendReviewPayload {
  let value: unknown
  try {
    value = JSON.parse(stripJsonCodeFence(raw))
  } catch {
    throw new Error('AI_TREND_REVIEW_INVALID_JSON')
  }
  if (!isRecord(value)) throw new Error('AI_TREND_REVIEW_INVALID_PAYLOAD')
  if (!AI_TREND_VERDICTS.includes(value.verdict as AiTrendVerdict)) {
    throw new Error('AI_TREND_REVIEW_INVALID_VERDICT')
  }
  if (typeof value.rationale !== 'string' || value.rationale.trim() === '') {
    throw new Error('AI_TREND_REVIEW_INVALID_RATIONALE')
  }
  const rationale = value.rationale.trim()
  if (rationale.length > MAX_TREND_REVIEW_RATIONALE_LENGTH) {
    throw new Error('AI_TREND_REVIEW_RATIONALE_TOO_LONG')
  }
  if (!Array.isArray(value.focusPoints) || value.focusPoints.length > MAX_TREND_REVIEW_FOCUS_POINTS) {
    throw new Error('AI_TREND_REVIEW_INVALID_FOCUS_POINTS')
  }
  const focusPoints = value.focusPoints.map((point) => {
    if (typeof point !== 'string' || point.trim() === '') throw new Error('AI_TREND_REVIEW_INVALID_FOCUS_POINT')
    const normalized = point.trim()
    if (normalized.length > MAX_TREND_REVIEW_FOCUS_POINT_LENGTH) throw new Error('AI_TREND_REVIEW_FOCUS_POINT_TOO_LONG')
    return normalized
  })
  return {
    verdict: value.verdict as AiTrendVerdict,
    rationale,
    focusPoints,
  }
}
