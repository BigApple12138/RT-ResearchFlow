import { randomUUID } from 'crypto'
import type Database from 'better-sqlite3'
import type {
  TrendStructureReviewRequestRow,
  TrendStructureReviewRevisionRow,
  TrendStructureReviewRow,
} from './types'

export type TrendStructureReviewVerdict = TrendStructureReviewRevisionRow['ai_verdict']

export type AiScoreAssessmentStatus = 'scored' | 'skipped' | 'invalid'

export interface SaveTrendStructureReviewInput {
  tsCode: string
  scoreDate: string
  factsHash: string
  requestId: string
  localTrendState: TrendStructureReview['localTrendState']
  localTotalScore: number | null
  verdict: TrendStructureReviewVerdict
  rationale: string
  focusPoints: string[]
  provider: string | null
  model: string | null
  audit: unknown
  now?: number
  /** When true, skip same-facts bind and INSERT a new revision (force model refresh path). */
  forceNewRevision?: boolean
  aiScoreStatus?: AiScoreAssessmentStatus
  aiScoreDelta?: number | null
  aiScoreRationale?: string | null
}

export type UpsertTrendStructureReviewInput = SaveTrendStructureReviewInput

export interface TrendStructureReview {
  revisionId: string
  tsCode: string
  scoreDate: string
  factsHash: string
  requestId: string
  localTrendState: TrendStructureReviewRevisionRow['local_trend_state']
  localTotalScore: number | null
  verdict: TrendStructureReviewVerdict
  rationale: string
  focusPoints: string[]
  provider: string | null
  model: string | null
  audit: unknown
  createdAt: number
  updatedAt: number
  aiScoreStatus: AiScoreAssessmentStatus
  aiScoreDelta: number | null
  aiScoreRationale: string | null
}

function parseJson<T>(value: string): T {
  return JSON.parse(value) as T
}

function normalizeAiScoreStatus(status: string | undefined): AiScoreAssessmentStatus {
  if (status === 'scored' || status === 'invalid') return status
  return 'skipped'
}

function normalizeAiScoreDelta(status: AiScoreAssessmentStatus, delta: number | null | undefined): number | null {
  if (status !== 'scored') return null
  return delta ?? null
}

function normalizeAiScoreRationale(status: AiScoreAssessmentStatus, rationale: string | null | undefined): string | null {
  if (status !== 'scored') return null
  return rationale ?? null
}

function mapRevision(row: TrendStructureReviewRevisionRow | undefined, updatedAt = row?.created_at): TrendStructureReview | null {
  if (!row) return null
  const status = normalizeAiScoreStatus(row.ai_score_status)
  return {
    revisionId: row.id,
    tsCode: row.ts_code,
    scoreDate: row.score_trade_date,
    factsHash: row.facts_hash,
    requestId: row.request_id,
    localTrendState: row.local_trend_state,
    localTotalScore: row.local_total_score,
    verdict: row.ai_verdict,
    rationale: row.rationale,
    focusPoints: parseJson<string[]>(row.focus_points_json),
    provider: row.provider,
    model: row.model,
    audit: parseJson<unknown>(row.audit_json),
    createdAt: row.created_at,
    updatedAt: updatedAt ?? row.created_at,
    aiScoreStatus: status,
    aiScoreDelta: normalizeAiScoreDelta(status, row.ai_score_delta),
    aiScoreRationale: normalizeAiScoreRationale(status, row.ai_score_rationale),
  }
}

function mapProjection(row: TrendStructureReviewRow | undefined): TrendStructureReview | null {
  if (!row) return null
  const status = normalizeAiScoreStatus(row.ai_score_status)
  return {
    revisionId: row.revision_id,
    tsCode: row.ts_code,
    scoreDate: row.score_trade_date,
    factsHash: row.facts_hash,
    requestId: row.request_id,
    localTrendState: row.local_trend_state,
    localTotalScore: row.local_total_score,
    verdict: row.ai_verdict,
    rationale: row.rationale,
    focusPoints: parseJson<string[]>(row.focus_points_json),
    provider: row.provider,
    model: row.model,
    audit: parseJson<unknown>(row.audit_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    aiScoreStatus: status,
    aiScoreDelta: normalizeAiScoreDelta(status, row.ai_score_delta),
    aiScoreRationale: normalizeAiScoreRationale(status, row.ai_score_rationale),
  }
}

function getRevisionById(db: Database.Database, revisionId: string): TrendStructureReview | null {
  const row = db.prepare(`
    SELECT * FROM trend_structure_review_revisions WHERE id = ?
  `).get(revisionId) as TrendStructureReviewRevisionRow | undefined
  return mapRevision(row)
}

export function hasMatchingTrendStructureReviewRequestIdentity(
  review: Pick<TrendStructureReview, 'tsCode' | 'scoreDate' | 'factsHash'>,
  input: Pick<SaveTrendStructureReviewInput, 'tsCode' | 'scoreDate' | 'factsHash'>,
): boolean {
  return review.tsCode === input.tsCode
    && review.scoreDate === input.scoreDate
    && review.factsHash === input.factsHash
}

export function assertTrendStructureReviewRequestIdentity(
  review: Pick<TrendStructureReview, 'tsCode' | 'scoreDate' | 'factsHash'>,
  input: Pick<SaveTrendStructureReviewInput, 'tsCode' | 'scoreDate' | 'factsHash'>,
): void {
  if (!hasMatchingTrendStructureReviewRequestIdentity(review, input)) {
    throw new Error('TREND_REVIEW_REQUEST_CONFLICT')
  }
}

export function getTrendStructureReviewByCodeDate(
  db: Database.Database,
  tsCode: string,
  scoreDate: string,
): TrendStructureReview | null {
  const row = db.prepare(`
    SELECT * FROM trend_structure_reviews
    WHERE ts_code = ? AND score_trade_date = ?
  `).get(tsCode, scoreDate) as TrendStructureReviewRow | undefined
  return mapProjection(row)
}

export function getTrendStructureReviewByRequestId(
  db: Database.Database,
  requestId: string,
): TrendStructureReview | null {
  const row = db.prepare(`
    SELECT revision.*
    FROM trend_structure_review_requests request
    JOIN trend_structure_review_revisions revision ON revision.id = request.revision_id
    WHERE request.request_id = ?
  `).get(requestId) as TrendStructureReviewRevisionRow | undefined
  if (!row) return null
  const projection = getTrendStructureReviewByCodeDate(db, row.ts_code, row.score_trade_date)
  return projection?.revisionId === row.id ? projection : mapRevision(row)
}

function getTrendStructureReviewRequest(
  db: Database.Database,
  requestId: string,
): TrendStructureReviewRequestRow | null {
  return (db.prepare(`
    SELECT * FROM trend_structure_review_requests WHERE request_id = ?
  `).get(requestId) as TrendStructureReviewRequestRow | undefined) ?? null
}

export function bindTrendStructureReviewRequest(
  db: Database.Database,
  review: Pick<TrendStructureReview, 'revisionId' | 'tsCode' | 'scoreDate' | 'factsHash'>,
  requestId: string,
  now = Date.now(),
): TrendStructureReview {
  const input = {
    tsCode: review.tsCode,
    scoreDate: review.scoreDate,
    factsHash: review.factsHash,
  }
  const existing = getTrendStructureReviewRequest(db, requestId)
  if (existing) {
    assertTrendStructureReviewRequestIdentity({
      tsCode: existing.ts_code,
      scoreDate: existing.score_trade_date,
      factsHash: existing.facts_hash,
    }, input)
    if (existing.revision_id !== review.revisionId) throw new Error('TREND_REVIEW_REQUEST_CONFLICT')
    return getTrendStructureReviewByRequestId(db, requestId)!
  }

  try {
    db.prepare(`
      INSERT INTO trend_structure_review_requests (
        request_id, ts_code, score_trade_date, facts_hash, revision_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      requestId,
      review.tsCode,
      review.scoreDate,
      review.factsHash,
      review.revisionId,
      now,
    )
  } catch (error) {
    const replay = getTrendStructureReviewRequest(db, requestId)
    if (!replay) throw error
    assertTrendStructureReviewRequestIdentity({
      tsCode: replay.ts_code,
      scoreDate: replay.score_trade_date,
      factsHash: replay.facts_hash,
    }, input)
    if (replay.revision_id !== review.revisionId) throw new Error('TREND_REVIEW_REQUEST_CONFLICT')
  }
  return getTrendStructureReviewByRequestId(db, requestId)!
}

export function getTrendStructureReviewByCodeDateFactsHash(
  db: Database.Database,
  tsCode: string,
  scoreDate: string,
  factsHash: string,
): TrendStructureReview | null {
  const row = db.prepare(`
    SELECT * FROM trend_structure_review_revisions
    WHERE ts_code = ? AND score_trade_date = ? AND facts_hash = ?
    ORDER BY created_at DESC, id DESC
    LIMIT 1
  `).get(tsCode, scoreDate, factsHash) as TrendStructureReviewRevisionRow | undefined
  if (!row) return null
  const projection = getTrendStructureReviewByCodeDate(db, tsCode, scoreDate)
  return projection?.revisionId === row.id ? projection : mapRevision(row)
}

export function listTrendStructureReviewRevisionsByCodeDate(
  db: Database.Database,
  tsCode: string,
  scoreDate: string,
): TrendStructureReview[] {
  const rows = db.prepare(`
    SELECT * FROM trend_structure_review_revisions
    WHERE ts_code = ? AND score_trade_date = ?
    ORDER BY created_at ASC, id ASC
  `).all(tsCode, scoreDate) as TrendStructureReviewRevisionRow[]
  return rows.map((row) => mapRevision(row)!).filter(Boolean)
}

export function listTrendStructureReviewsByCodes(
  db: Database.Database,
  tsCodes: string[],
): TrendStructureReview[] {
  const codes = [...new Set(tsCodes.map((code) => code.trim()).filter(Boolean))]
  if (codes.length === 0) return []
  const placeholders = codes.map(() => '?').join(', ')
  const rows = db.prepare(`
    SELECT * FROM trend_structure_reviews
    WHERE ts_code IN (${placeholders})
    ORDER BY ts_code ASC, score_trade_date DESC, updated_at DESC
  `).all(...codes) as TrendStructureReviewRow[]
  return rows.map((row) => mapProjection(row)!).filter(Boolean)
}

export function saveTrendStructureReview(
  db: Database.Database,
  input: SaveTrendStructureReviewInput,
): TrendStructureReview {
  const requestReplay = getTrendStructureReviewByRequestId(db, input.requestId)
  if (requestReplay) {
    assertTrendStructureReviewRequestIdentity(requestReplay, input)
    return requestReplay
  }

  if (!input.forceNewRevision) {
    const sameFacts = getTrendStructureReviewByCodeDateFactsHash(
      db,
      input.tsCode,
      input.scoreDate,
      input.factsHash,
    )
    if (sameFacts) {
      return bindTrendStructureReviewRequest(db, sameFacts, input.requestId, input.now ?? Date.now())
    }
  }

  const now = input.now ?? Date.now()
  const revisionId = randomUUID()
  const aiScoreStatus = normalizeAiScoreStatus(input.aiScoreStatus)
  const aiScoreDelta = normalizeAiScoreDelta(aiScoreStatus, input.aiScoreDelta)
  const aiScoreRationale = normalizeAiScoreRationale(aiScoreStatus, input.aiScoreRationale)
  const insertRevision = db.prepare(`
    INSERT INTO trend_structure_review_revisions (
      id, ts_code, score_trade_date, facts_hash, request_id, local_trend_state,
      local_total_score, ai_verdict, rationale, focus_points_json, provider,
      model, audit_json, created_at, ai_score_status, ai_score_delta, ai_score_rationale
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const insertRequest = db.prepare(`
    INSERT INTO trend_structure_review_requests (
      request_id, ts_code, score_trade_date, facts_hash, revision_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?)
  `)
  const upsertProjection = db.prepare(`
    INSERT INTO trend_structure_reviews (
      ts_code, score_trade_date, revision_id, facts_hash, request_id,
      local_trend_state, local_total_score, ai_verdict, rationale,
      focus_points_json, provider, model, audit_json, created_at, updated_at,
      ai_score_status, ai_score_delta, ai_score_rationale
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(ts_code, score_trade_date) DO UPDATE SET
      revision_id = excluded.revision_id,
      facts_hash = excluded.facts_hash,
      request_id = excluded.request_id,
      local_trend_state = excluded.local_trend_state,
      local_total_score = excluded.local_total_score,
      ai_verdict = excluded.ai_verdict,
      rationale = excluded.rationale,
      focus_points_json = excluded.focus_points_json,
      provider = excluded.provider,
      model = excluded.model,
      audit_json = excluded.audit_json,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at,
      ai_score_status = excluded.ai_score_status,
      ai_score_delta = excluded.ai_score_delta,
      ai_score_rationale = excluded.ai_score_rationale
  `)
  const write = db.transaction(() => {
    insertRevision.run(
      revisionId,
      input.tsCode,
      input.scoreDate,
      input.factsHash,
      input.requestId,
      input.localTrendState,
      input.localTotalScore,
      input.verdict,
      input.rationale,
      JSON.stringify(input.focusPoints),
      input.provider,
      input.model,
      JSON.stringify(input.audit),
      now,
      aiScoreStatus,
      aiScoreDelta,
      aiScoreRationale,
    )
    insertRequest.run(
      input.requestId,
      input.tsCode,
      input.scoreDate,
      input.factsHash,
      revisionId,
      now,
    )
    upsertProjection.run(
      input.tsCode,
      input.scoreDate,
      revisionId,
      input.factsHash,
      input.requestId,
      input.localTrendState,
      input.localTotalScore,
      input.verdict,
      input.rationale,
      JSON.stringify(input.focusPoints),
      input.provider,
      input.model,
      JSON.stringify(input.audit),
      now,
      now,
      aiScoreStatus,
      aiScoreDelta,
      aiScoreRationale,
    )
  })
  try {
    write()
  } catch (error) {
    const replay = getTrendStructureReviewByRequestId(db, input.requestId)
    if (!replay) throw error
    assertTrendStructureReviewRequestIdentity(replay, input)
    return replay
  }
  return getRevisionById(db, revisionId)!
}

/** @deprecated Use saveTrendStructureReview; retained for existing internal callers during migration. */
export function upsertTrendStructureReview(
  db: Database.Database,
  input: UpsertTrendStructureReviewInput,
): TrendStructureReview {
  return saveTrendStructureReview(db, input)
}
