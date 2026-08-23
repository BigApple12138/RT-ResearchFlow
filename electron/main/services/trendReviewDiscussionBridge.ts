import type Database from 'better-sqlite3'
import {
  getTrendStructureReviewByCodeDate,
  type TrendStructureReview,
} from '../database/trendStructureReviewRepository'
import {
  ResearchDiscussionError,
  startResearchDiscussionFromResolvedOrigin,
  type ResearchDiscussionReturnTarget,
  type StartResearchDiscussionFromResolvedOriginInput,
} from './researchDiscussionContextService'
import {
  buildTrendReviewFacts,
  hashTrendReviewFacts,
} from './trendStructureReviewService'
import { deriveImpliedScore, normalizeTrendTsCode } from './trendStructureReviewTypes'
import type { TrendWorkbenchSnapshot } from './trendWorkbenchService'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const TS_CODE_PATTERN = /^\d{6}(?:\.(?:SH|SZ|BJ))?$/i
const SCORE_DATE_PATTERN = /^\d{8}$/
const FACTS_HASH_PATTERN = /^[a-f0-9]{64}$/i

export interface StartTrendReviewDiscussionInput {
  requestId: string
  tsCode: string
  scoreDate: string
  factsHash: string
  initialQuestion?: string
  returnTarget: ResearchDiscussionReturnTarget
}

export interface TrendReviewDiscussionBridgeDependencies {
  getWorkbench?: (db: Database.Database) => TrendWorkbenchSnapshot
  getReview?: (db: Database.Database, tsCode: string, scoreDate: string) => TrendStructureReview | null
  startDiscussion?: typeof startResearchDiscussionFromResolvedOrigin
}

export function trendReviewDiscussionKey(tsCode: string, scoreDate: string, factsHash: string): string {
  return `trend-review:${normalizeTrendTsCode(tsCode)}:${scoreDate}:${factsHash.toLowerCase()}`
}

export function trendReviewReturnTarget(tsCode: string): ResearchDiscussionReturnTarget {
  return {
    tab: 'trend-watcher',
    subTab: 'dashboard',
    entityId: normalizeTrendTsCode(tsCode),
    stateKey: 'trend-radar',
  }
}

export function startTrendReviewDiscussion(
  db: Database.Database,
  input: StartTrendReviewDiscussionInput,
  dependencies: TrendReviewDiscussionBridgeDependencies = {},
) {
  validateInput(input)
  const normalizedTsCode = normalizeTrendTsCode(input.tsCode)
  const loadWorkbench = dependencies.getWorkbench
  const facts = buildTrendReviewFacts(db, normalizedTsCode, loadWorkbench)
  const currentFactsHash = hashTrendReviewFacts(facts)
  if (facts.scoreDate !== input.scoreDate || currentFactsHash !== input.factsHash.toLowerCase()) {
    throw new ResearchDiscussionError('STALE_REVIEW', '趋势复核所依据的本地事实已变化，请重新复核')
  }

  const review = (dependencies.getReview ?? getTrendStructureReviewByCodeDate)(db, normalizedTsCode, input.scoreDate)
  if (!review || review.tsCode !== normalizedTsCode || review.scoreDate !== input.scoreDate || review.factsHash !== currentFactsHash) {
    throw new ResearchDiscussionError('STALE_REVIEW', '趋势复核记录已过期，请重新复核')
  }

  const reviewKey = trendReviewDiscussionKey(normalizedTsCode, input.scoreDate, currentFactsHash)
  const initialQuestion = input.initialQuestion?.trim().slice(0, 4_000)
    || `复核 ${facts.stockName} 趋势结构`
  const resolvedOrigin = {
    title: `${facts.stockName} · 趋势结构复核`,
    occurredAt: review.createdAt,
    url: null,
    items: [{
      key: 'trend-review-facts',
      type: 'trend_review',
      label: '趋势结构复核',
      excerpt: `事实日：${facts.scoreDate}；AI结论：${review.verdict}；理由：${review.rationale}`,
      removable: false,
    }],
    stockCodes: [],
    contextKind: 'trend_review' as const,
    trendReview: {
      facts,
      verdict: review.verdict,
      rationale: review.rationale,
      focusPoints: [...review.focusPoints],
      factsHash: currentFactsHash,
      scoreAssessment: {
        status: review.aiScoreStatus,
        scoreDelta: review.aiScoreDelta,
        scoreRationale: review.aiScoreRationale,
        impliedScore: review.aiScoreStatus === 'scored'
          && review.localTotalScore != null
          && review.aiScoreDelta != null
          ? deriveImpliedScore(review.localTotalScore, review.aiScoreDelta)
          : null,
      },
    },
  }
  const startDiscussion = dependencies.startDiscussion ?? startResearchDiscussionFromResolvedOrigin
  const startInput: StartResearchDiscussionFromResolvedOriginInput = {
    requestId: input.requestId,
    origin: { type: 'manual', id: reviewKey },
    initialQuestion,
    mode: 'continue_or_create',
    // Renderer may send a returnTarget for the IPC contract, but a review discussion
    // always returns to the trend radar row that supplied the trusted identity.
    returnTarget: trendReviewReturnTarget(normalizedTsCode),
    resolvedOrigin,
  }
  return startDiscussion(db, startInput)
}

function validateInput(input: StartTrendReviewDiscussionInput): void {
  if (!UUID_PATTERN.test(input.requestId)
    || typeof input.tsCode !== 'string'
    || !TS_CODE_PATTERN.test(input.tsCode.trim())
    || typeof input.scoreDate !== 'string'
    || !SCORE_DATE_PATTERN.test(input.scoreDate)
    || typeof input.factsHash !== 'string'
    || !FACTS_HASH_PATTERN.test(input.factsHash)) {
    throw new ResearchDiscussionError('INVALID_PARAM', '趋势复核讨论身份无效')
  }
}
