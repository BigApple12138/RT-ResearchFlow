import { createHash } from 'crypto'
import type Database from 'better-sqlite3'
import {
  getTrendStructureReviewByCodeDate,
  getTrendStructureReviewByRequestId,
  upsertTrendStructureReview,
  type TrendStructureReview,
} from '../database/trendStructureReviewRepository'
import { auditResearchText, type ResearchTextAudit } from './researchEvidenceAuditService'
import { callWithFallback, type AIFallbackResult } from './aiFallbackService'
import { getTrendWorkbench, type TrendWorkbenchItem, type TrendWorkbenchSnapshot } from './trendWorkbenchService'
import {
  parseAiTrendReviewPayload,
  type AiTrendReviewPayload,
  type TrendReviewFacts,
} from './trendStructureReviewTypes'

export { parseAiTrendReviewPayload }

const MIN_VALID_WEIGHT = 0.7

export interface ReviewStructureInput {
  requestId: string
  tsCode: string
}

export interface TrendStructureReviewDependencies {
  getWorkbench?: (db: Database.Database) => TrendWorkbenchSnapshot
  callAI?: (db: Database.Database, params: { prompt: string }) => Promise<AIFallbackResult>
  auditText?: (input: Parameters<typeof auditResearchText>[0]) => ResearchTextAudit
  now?: () => number
}

export interface TrendStructureReviewResult {
  review: TrendStructureReview
  facts: TrendReviewFacts
  factsHash: string
  stale: boolean
}

export function buildTrendReviewFacts(
  db: Database.Database,
  tsCode: string,
  loadWorkbench: (db: Database.Database) => TrendWorkbenchSnapshot = getTrendWorkbench,
  now = Date.now(),
): TrendReviewFacts {
  const normalizedCode = normalizeTsCode(tsCode)
  const item = loadWorkbench(db).items.find((candidate) => normalizeTsCode(candidate.tsCode) === normalizedCode)
  if (!item) throw new Error('TREND_CODE_NOT_IN_WORKBENCH')
  return pickTrendReviewFacts(item, now)
}

export function hashTrendReviewFacts(facts: TrendReviewFacts): string {
  return createHash('sha256').update(stableStringify(facts)).digest('hex')
}

export function isTrendStructureReviewStale(
  review: Pick<TrendStructureReview, 'scoreDate' | 'factsHash'> | { scoreDate: string; factsHash: string },
  currentFacts: TrendReviewFacts,
): boolean {
  return review.scoreDate !== currentFacts.scoreDate || review.factsHash !== hashTrendReviewFacts(currentFacts)
}

export async function reviewStructure(
  db: Database.Database,
  input: ReviewStructureInput,
  dependencies: TrendStructureReviewDependencies = {},
): Promise<TrendStructureReviewResult> {
  const now = dependencies.now?.() ?? Date.now()
  const facts = buildTrendReviewFacts(db, input.tsCode, dependencies.getWorkbench ?? getTrendWorkbench, now)
  const factsHash = hashTrendReviewFacts(facts)
  const normalizedCode = normalizeTsCode(input.tsCode)

  const requestReplay = getTrendStructureReviewByRequestId(db, input.requestId)
  if (requestReplay) {
    if (requestReplay.tsCode !== normalizedCode) throw new Error('TREND_REVIEW_REQUEST_CONFLICT')
    return toResult(requestReplay, facts)
  }

  const existing = getTrendStructureReviewByCodeDate(db, normalizedCode, facts.scoreDate)
  if (existing?.factsHash === factsHash) return toResult(existing, facts)

  const insufficient = facts.totalScore == null
    || facts.validWeight == null
    || facts.validWeight < MIN_VALID_WEIGHT
    || facts.dataCoverage.state !== 'ready'

  let payload: AiTrendReviewPayload
  let provider: string | null = null
  let model: string | null = null
  if (insufficient) {
    payload = buildNeedMoreDataPayload(facts)
  } else {
    const callAI = dependencies.callAI ?? callWithFallback
    const aiResult = await callAI(db, { prompt: buildTrendReviewPrompt(facts) })
    payload = parseAiTrendReviewPayload(aiResult.text)
    provider = aiResult.provider
    model = aiResult.model
  }

  const rendered = renderTrendReview(payload, facts)
  const audit = (dependencies.auditText ?? auditResearchText)({
    text: rendered,
    documentKind: 'discussion',
    asOf: facts.scoreDate,
    allowedFactTexts: [stableStringify(facts)],
    now,
  })
  if (audit.status === 'blocked') throw new Error('AUDIT_BLOCKED')

  const review = upsertTrendStructureReview(db, {
    tsCode: normalizedCode,
    scoreDate: facts.scoreDate,
    factsHash,
    requestId: input.requestId,
    verdict: payload.verdict,
    rationale: payload.rationale,
    focusPoints: payload.focusPoints,
    provider,
    model,
    audit,
    now,
  })
  return toResult(review, facts)
}

export function buildTrendReviewPrompt(facts: TrendReviewFacts): string {
  return [
    '你是本地投研应用中的趋势结构复核助手。',
    '只能基于下列白名单事实判断趋势结构，不得补造事实。',
    '只返回 JSON：{"verdict":"trend_intact|trend_improving|trend_deteriorating|trend_broken|need_more_data","rationale":"...","focusPoints":["..."]}。',
    '不得给出买入、卖出、目标价、止盈、止损、仓位或收益承诺。',
    `白名单事实：${stableStringify(facts)}`,
  ].join('\n')
}

function pickTrendReviewFacts(item: TrendWorkbenchItem, now: number): TrendReviewFacts {
  return {
    schemaVersion: 1,
    tsCode: normalizeTsCode(item.tsCode),
    stockName: item.stockName,
    categories: [...item.categories],
    subCategories: [...item.subCategories],
    scoreDate: item.scoreDate || item.dataCoverage.latestTradeDate || formatYmd(now),
    scoreSource: item.scoreSource,
    scoreVersion: item.scoreVersion,
    totalScore: item.totalScore,
    validWeight: item.validWeight,
    trendState: item.trendState,
    scoreDelta5d: item.scoreDelta5d,
    scoreDelta20d: item.scoreDelta20d,
    dimensions: item.dimensions == null ? null : {
      maArrangement: item.dimensions.maArrangement,
      maAbove60: item.dimensions.maAbove60,
      relativeStrength: item.dimensions.relativeStrength,
      drawdownQuality: item.dimensions.drawdownQuality,
      turnoverQuality: item.dimensions.turnoverQuality,
      macd: item.dimensions.macd,
      boll: item.dimensions.boll,
    },
    scoreFacts: item.facts == null ? null : {
      stockReturn20d: item.facts.stockReturn20d,
      benchmarkReturn20d: item.facts.benchmarkReturn20d,
      excessReturn20d: item.facts.excessReturn20d,
      maxDrawdown20d: item.facts.maxDrawdown20d,
      turnoverRatio: item.facts.turnoverRatio,
    },
    dataCoverage: {
      bars: item.dataCoverage.bars,
      requiredBars: item.dataCoverage.requiredBars,
      latestTradeDate: item.dataCoverage.latestTradeDate,
      state: item.dataCoverage.state,
    },
    benchmark: {
      state: item.benchmarkHealth.state,
      latestTradeDate: item.benchmarkHealth.latestTradeDate,
      expectedTradeDate: item.benchmarkHealth.expectedTradeDate,
      bars: item.benchmarkHealth.bars,
      requiredBars: item.benchmarkHealth.requiredBars,
    },
    market: {
      price: item.price,
      change: item.change,
      quoteSource: item.quoteSource,
      quoteTime: item.quoteTime,
    },
  }
}

function buildNeedMoreDataPayload(facts: TrendReviewFacts): AiTrendReviewPayload {
  const reasons: string[] = []
  if (facts.totalScore == null) reasons.push('当前没有可用综合评分')
  if (facts.validWeight == null || facts.validWeight < MIN_VALID_WEIGHT) reasons.push('有效评分权重不足70%')
  if (facts.dataCoverage.state !== 'ready') reasons.push(`本地日线覆盖为${facts.dataCoverage.state}`)
  return {
    verdict: 'need_more_data',
    rationale: `${reasons.join('；')}，暂不形成趋势结构判断。`,
    focusPoints: ['补齐本地行情与评分事实后再复核'],
  }
}

function renderTrendReview(payload: AiTrendReviewPayload, facts: TrendReviewFacts): string {
  return [
    `趋势结构复核：${payload.verdict}`,
    `证券：${facts.stockName}（${facts.tsCode}）`,
    `事实日：${facts.scoreDate}`,
    `理由：${payload.rationale}`,
    `关注点：${payload.focusPoints.join('；') || '无'}`,
  ].join('\n')
}

function toResult(review: TrendStructureReview, facts: TrendReviewFacts): TrendStructureReviewResult {
  return {
    review,
    facts,
    factsHash: review.factsHash,
    stale: isTrendStructureReviewStale(review, facts),
  }
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`
}

function normalizeTsCode(tsCode: string): string {
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
