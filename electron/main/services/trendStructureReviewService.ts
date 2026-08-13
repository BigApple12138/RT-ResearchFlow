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
import {
  buildEodTrendReviewFactsForItem,
  getTrendWorkbench,
  type TrendWorkbenchSnapshot,
} from './trendWorkbenchService'
import {
  hashTrendReviewFacts,
  normalizeTrendTsCode,
  parseAiTrendReviewBundle,
  stableStringify,
  type AiScoreAssessment,
  type AiTrendReviewPayload,
  type TrendReviewFacts,
} from './trendStructureReviewTypes'

export { hashTrendReviewFacts, parseAiTrendReviewPayload } from './trendStructureReviewTypes'

const MIN_VALID_WEIGHT = 0.7

export interface ReviewStructureInput {
  requestId: string
  tsCode: string
  /** When true, skip same-hash early bind and force a new model revision (if gate passes). */
  forceModelRefresh?: boolean
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
  return buildEodTrendReviewFactsForItem(db, item, now)
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
  if (!input.forceModelRefresh && existing?.factsHash === factsHash) {
    return toResult(bindTrendStructureReviewRequest(db, existing, input.requestId, now), facts)
  }

  const insufficient = facts.totalScore == null
    || facts.validWeight == null
    || facts.validWeight < MIN_VALID_WEIGHT
    || facts.dataCoverage.state !== 'ready'

  let structurePayload: AiTrendReviewPayload
  let scoreAssessment: AiScoreAssessment
  let provider: string | null = null
  let model: string | null = null
  if (insufficient) {
    structurePayload = buildNeedMoreDataPayload(facts)
    scoreAssessment = { status: 'skipped', localScore: facts.totalScore, scoreDelta: null, scoreRationale: null, impliedScore: null }
  } else {
    const callAI = dependencies.callAI ?? callWithFallback
    const aiResult = await callAI(db, { prompt: buildTrendReviewPrompt(facts) })
    const bundle = parseAiTrendReviewBundle(aiResult.text, facts.totalScore)
    structurePayload = bundle.structure
    scoreAssessment = bundle.scoreAssessment
    provider = aiResult.provider
    model = aiResult.model
  }

  if (structurePayload.verdict === 'need_more_data') {
    scoreAssessment = { status: 'skipped', localScore: facts.totalScore, scoreDelta: null, scoreRationale: null, impliedScore: null }
  }

  const rendered = renderTrendReview(structurePayload, scoreAssessment, facts)
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
    verdict: structurePayload.verdict,
    rationale: structurePayload.rationale,
    focusPoints: structurePayload.focusPoints,
    provider,
    model,
    audit,
    aiScoreStatus: scoreAssessment.status,
    aiScoreDelta: scoreAssessment.status === 'scored' ? scoreAssessment.scoreDelta : null,
    aiScoreRationale: scoreAssessment.status === 'scored' ? scoreAssessment.scoreRationale : null,
    now,
    forceNewRevision: Boolean(input.forceModelRefresh) && !insufficient,
  })
  return toResult(review, facts)
}

export function buildTrendReviewPrompt(facts: TrendReviewFacts): string {
  return [
    '你是本地投研应用中的趋势结构复核助手。',
    '只能基于下列白名单事实判断趋势结构并评估本地综合分的相对偏差，不得补造事实。',
    '必须只返回一个 JSON bundle，不要 markdown 代码块以外的解释：',
    '{"structure":{"verdict":"agree|possible_false_break|possible_false_hold|evidence_weak|need_more_data","rationale":"...","focusPoints":["..."]},"scoreAssessment":{"scoreDelta":<整数>,"scoreRationale":"..."}}。',
    'structure.rationale 不超过120字；focusPoints 最多3条且每条不超过80字。',
    `scoreAssessment.scoreDelta 是相对于本地综合分 ${facts.totalScore} 的整数偏差，必须在 [-15, +15] 闭区间内；不要输出绝对分。`,
    'scoreAssessment.scoreRationale 不超过120字。',
    '整体不得给出买入、卖出、目标价、止盈、止损、仓位、成本、收益承诺或交易指令。',
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

function renderTrendReview(payload: AiTrendReviewPayload, scoreAssessment: AiScoreAssessment, facts: TrendReviewFacts): string {
  const scoreSummary = scoreAssessment.status === 'scored'
    ? `AI 趋势分偏差：${scoreAssessment.scoreDelta}（本地 ${scoreAssessment.localScore} → AI ${scoreAssessment.impliedScore}）；理由：${scoreAssessment.scoreRationale}`
    : `AI 趋势分偏差：${scoreAssessment.status}`
  return [
    `趋势结构复核：${payload.verdict}`,
    `证券：${facts.stockName}（${facts.tsCode}）`,
    `事实日：${facts.scoreDate}`,
    `理由：${payload.rationale}`,
    `关注点：${payload.focusPoints.join('；') || '无'}`,
    scoreSummary,
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
