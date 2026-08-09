import type Database from 'better-sqlite3'
import {
  assertTrendStructureReviewRequestIdentity,
  bindTrendStructureReviewRequest,
  getTrendStructureReviewByCodeDate,
  getTrendStructureReviewByRequestId,
  saveTrendStructureReview,
  type TrendStructureReview,
} from '../database/trendStructureReviewRepository'
import { auditResearchText, type ResearchTextAudit } from './researchEvidenceAuditService'
import { callWithFallback, type AIFallbackResult } from './aiFallbackService'
import { getTrendWorkbench, type TrendWorkbenchSnapshot } from './trendWorkbenchService'
import {
  buildTrendReviewFactsFromItem,
  hashTrendReviewFacts,
  normalizeTrendTsCode,
  parseAiTrendReviewPayload,
  stableStringify,
  type AiTrendReviewPayload,
  type TrendReviewFacts,
} from './trendStructureReviewTypes'

export { hashTrendReviewFacts, parseAiTrendReviewPayload }

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
  const normalizedCode = normalizeTrendTsCode(tsCode)
  const item = loadWorkbench(db).items.find((candidate) => normalizeTrendTsCode(candidate.tsCode) === normalizedCode)
  if (!item) throw new Error('TREND_CODE_NOT_IN_WORKBENCH')
  return buildTrendReviewFactsFromItem(item, now)
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
  const normalizedCode = normalizeTrendTsCode(input.tsCode)

  const requestReplay = getTrendStructureReviewByRequestId(db, input.requestId)
  if (requestReplay) {
    assertTrendStructureReviewRequestIdentity(requestReplay, {
      tsCode: normalizedCode,
      scoreDate: facts.scoreDate,
      factsHash,
    })
    return toResult(requestReplay, facts)
  }

  const existing = getTrendStructureReviewByCodeDate(db, normalizedCode, facts.scoreDate)
  if (existing?.factsHash === factsHash) {
    return toResult(bindTrendStructureReviewRequest(db, existing, input.requestId, now), facts)
  }

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

  const review = saveTrendStructureReview(db, {
    tsCode: normalizedCode,
    scoreDate: facts.scoreDate,
    factsHash,
    requestId: input.requestId,
    localTrendState: facts.trendState,
    localTotalScore: facts.totalScore,
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
    '只返回 JSON：{"verdict":"agree|possible_false_break|possible_false_hold|evidence_weak|need_more_data","rationale":"...","focusPoints":["..."]}。',
    'rationale 不超过120字；focusPoints最多3条且每条不超过80字。',
    '不得给出买入、卖出、目标价、止盈、止损、仓位或收益承诺。',
    `白名单事实：${stableStringify(facts)}`,
  ].join('\n')
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
