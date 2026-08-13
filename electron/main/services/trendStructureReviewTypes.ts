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
  aiScoreStatus: AiScoreAssessmentStatus
  aiScoreDelta: number | null
  aiScoreRationale: string | null
  impliedScore: number | null
  localScore: number | null
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
  scoreDate: string
  scoreSource: 'realtime' | 'eod'
  scoreVersion: 'v2' | 'legacy'
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
  dimensions: {
    maArrangement: number | null
    maAbove60: number | null
    relativeStrength: number | null
    drawdownQuality: number | null
    turnoverQuality: number | null
    macd: number | null
    boll: number | null
  }
  maScore: number | null
  alphaScore: number | null
  drawdown: number | null
  turnoverRatio: number | null
  macdAboveZero: boolean | null
  bollAboveMid: boolean | null
  facts: {
    stockReturn20d: number | null
    benchmarkReturn20d: number | null
    excessReturn20d: number | null
    maxDrawdown20d: number | null
    turnoverRatio: number | null
  } | null
  scoreHistory: Array<{ tradeDate: string; totalScore: number }>
  benchmarkHealth: {
    state: string
    message: string
  }
}

export const MAX_TREND_REVIEW_RATIONALE_LENGTH = 120
export const MAX_TREND_REVIEW_FOCUS_POINTS = 3
export const MAX_TREND_REVIEW_FOCUS_POINT_LENGTH = 80

export function buildTrendReviewFactsFromItem(item: TrendWorkbenchItem, now = Date.now()): TrendReviewFacts {
  const scoreDate = item.scoreDate || item.dataCoverage.latestTradeDate || formatYmd(now)
  return {
    tsCode: normalizeTrendTsCode(item.tsCode),
    stockName: item.stockName,
    scoreDate,
    scoreSource: item.scoreSource ?? 'eod',
    scoreVersion: item.scoreVersion ?? 'legacy',
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
    dimensions: item.dimensions == null
      ? { maArrangement: null, maAbove60: null, relativeStrength: null, drawdownQuality: null, turnoverQuality: null, macd: null, boll: null }
      : {
          maArrangement: item.dimensions.maArrangement,
          maAbove60: item.dimensions.maAbove60,
          relativeStrength: item.dimensions.relativeStrength,
          drawdownQuality: item.dimensions.drawdownQuality,
          turnoverQuality: item.dimensions.turnoverQuality,
          macd: item.dimensions.macd,
          boll: item.dimensions.boll,
        },
    maScore: item.maScore ?? null,
    alphaScore: item.alphaScore ?? null,
    drawdown: item.drawdown ?? null,
    turnoverRatio: item.turnoverRatio ?? null,
    macdAboveZero: item.macdAboveZero ?? null,
    bollAboveMid: item.bollAboveMid ?? null,
    facts: item.facts == null ? null : {
      stockReturn20d: item.facts.stockReturn20d,
      benchmarkReturn20d: item.facts.benchmarkReturn20d,
      excessReturn20d: item.facts.excessReturn20d,
      maxDrawdown20d: item.facts.maxDrawdown20d,
      turnoverRatio: item.facts.turnoverRatio,
    },
    scoreHistory: item.scoreHistory?.map((point) => ({ tradeDate: point.tradeDate, totalScore: point.totalScore })) ?? [],
    benchmarkHealth: {
      state: item.benchmarkHealth.state,
      message: item.benchmarkHealth.message,
    },
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
  return parseAiTrendReviewBundle(raw).structure
}

export const AI_SCORE_DELTA_MIN = -15
export const AI_SCORE_DELTA_MAX = 15

export type AiScoreAssessmentStatus = 'scored' | 'skipped' | 'invalid'

export interface AiScoreAssessmentScored {
  status: 'scored'
  localScore: number
  scoreDelta: number
  scoreRationale: string
  impliedScore: number
}

export interface AiScoreAssessmentSkipped {
  status: 'skipped' | 'invalid'
  localScore: number | null
  scoreDelta: number | null
  scoreRationale: string | null
  impliedScore: null
}

export type AiScoreAssessment = AiScoreAssessmentScored | AiScoreAssessmentSkipped

export interface AiTrendReviewBundle {
  structure: AiTrendReviewPayload
  scoreAssessment: AiScoreAssessment
}

export function deriveImpliedScore(localScore: number, scoreDelta: number): number {
  return clamp(localScore + scoreDelta, 0, 100)
}

export function parseAiTrendScoreAssessment(score: unknown, localScore: number | null): AiScoreAssessment {
  if (score == null || !isRecord(score)) {
    return { status: 'skipped', localScore, scoreDelta: null, scoreRationale: null, impliedScore: null }
  }
  if (localScore == null) {
    return { status: 'skipped', localScore: null, scoreDelta: null, scoreRationale: null, impliedScore: null }
  }
  const rawDelta = score.scoreDelta
  if (typeof rawDelta !== 'number' || !Number.isInteger(rawDelta) || rawDelta < AI_SCORE_DELTA_MIN || rawDelta > AI_SCORE_DELTA_MAX) {
    return { status: 'invalid', localScore, scoreDelta: null, scoreRationale: null, impliedScore: null }
  }
  const scoreDelta = rawDelta
  if (typeof score.scoreRationale !== 'string' || score.scoreRationale.trim() === '') {
    return { status: 'invalid', localScore, scoreDelta: null, scoreRationale: null, impliedScore: null }
  }
  const scoreRationale = score.scoreRationale.trim()
  if (scoreRationale.length > MAX_TREND_REVIEW_RATIONALE_LENGTH) {
    return { status: 'invalid', localScore, scoreDelta: null, scoreRationale: null, impliedScore: null }
  }
  return {
    status: 'scored',
    localScore,
    scoreDelta,
    scoreRationale,
    impliedScore: deriveImpliedScore(localScore, scoreDelta),
  }
}

export function parseAiTrendReviewBundle(raw: string, localScore: number | null = null): AiTrendReviewBundle {
  let value: unknown
  try {
    value = JSON.parse(stripJsonCodeFence(raw))
  } catch {
    throw new Error('AI_TREND_REVIEW_INVALID_JSON')
  }
  if (!isRecord(value)) throw new Error('AI_TREND_REVIEW_INVALID_PAYLOAD')

  let structureValue: Record<string, unknown> = value
  let scoreValue: unknown = null
  if ('structure' in value && isRecord(value.structure)) {
    structureValue = value.structure
    scoreValue = value.scoreAssessment ?? null
  }

  const structure = parseStructureFields(structureValue)
  const scoreAssessment = parseAiTrendScoreAssessment(scoreValue, localScore)
  return { structure, scoreAssessment }
}

function parseStructureFields(value: Record<string, unknown>): AiTrendReviewPayload {
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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

