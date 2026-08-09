import type { TrendState } from './trendScoreModel'

export const AI_TREND_VERDICTS = [
  'trend_intact',
  'trend_improving',
  'trend_deteriorating',
  'trend_broken',
  'need_more_data',
] as const

export type AiTrendVerdict = typeof AI_TREND_VERDICTS[number]

export interface AiTrendReviewPayload {
  verdict: AiTrendVerdict
  rationale: string
  focusPoints: string[]
}

export interface TrendReviewFacts {
  schemaVersion: 1
  tsCode: string
  stockName: string
  categories: string[]
  subCategories: string[]
  scoreDate: string
  scoreSource: 'realtime' | 'eod'
  scoreVersion: 'v2' | 'legacy'
  totalScore: number | null
  validWeight: number | null
  trendState: TrendState
  scoreDelta5d: number | null
  scoreDelta20d: number | null
  dimensions: {
    maArrangement: number | null
    maAbove60: number | null
    relativeStrength: number | null
    drawdownQuality: number | null
    turnoverQuality: number | null
    macd: number | null
    boll: number | null
  } | null
  scoreFacts: {
    stockReturn20d: number | null
    benchmarkReturn20d: number | null
    excessReturn20d: number | null
    maxDrawdown20d: number | null
    turnoverRatio: number | null
  } | null
  dataCoverage: {
    bars: number
    requiredBars: number
    latestTradeDate: string | null
    state: 'ready' | 'partial' | 'missing'
  }
  benchmark: {
    state: 'current' | 'stale' | 'missing' | 'insufficient' | 'calendar-unknown'
    latestTradeDate: string | null
    expectedTradeDate: string | null
    bars: number
    requiredBars: number
  }
  market: {
    price: number | null
    change: number | null
    quoteSource: 'realtime' | 'eod'
    quoteTime: string
  }
}

export const MAX_TREND_REVIEW_RATIONALE_LENGTH = 2_000
export const MAX_TREND_REVIEW_FOCUS_POINTS = 8
export const MAX_TREND_REVIEW_FOCUS_POINT_LENGTH = 240

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
