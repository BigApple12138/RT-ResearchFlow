import { randomUUID } from 'crypto'
import type Database from 'better-sqlite3'
import type {
  TrendStructureReviewRevisionRow,
  TrendStructureReviewRow,
} from './types'

export type TrendStructureReviewVerdict = TrendStructureReviewRevisionRow['ai_verdict']

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
}

function parseJson<T>(value: string): T {
  return JSON.parse(value) as T
}

function mapRevision(row: TrendStructureReviewRevisionRow | undefined, updatedAt = row?.created_at): TrendStructureReview | null {
  if (!row) return null
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
  }
}

function mapProjection(row: TrendStructureReviewRow | undefined): TrendStructureReview | null {
  if (!row) return null
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
  }
}

function getRevisionById(db: Database.Database, revisionId: string): TrendStructureReview | null {
  const row = db.prepare(`
    SELECT * FROM trend_structure_review_revisions WHERE id = ?
  `).get(revisionId) as TrendStructureReviewRevisionRow | undefined
  return mapRevision(row)
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
    SELECT * FROM trend_structure_review_revisions
    WHERE request_id = ?
  `).get(requestId) as TrendStructureReviewRevisionRow | undefined
  if (!row) return null
  const projection = getTrendStructureReviewByCodeDate(db, row.ts_code, row.score_trade_date)
  return projection?.revisionId === row.id ? projection : mapRevision(row)
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
  if (requestReplay) return requestReplay

  const sameFacts = getTrendStructureReviewByCodeDateFactsHash(
    db,
    input.tsCode,
    input.scoreDate,
    input.factsHash,
  )
  if (sameFacts) return sameFacts

  const now = input.now ?? Date.now()
  const revisionId = randomUUID()
  const insertRevision = db.prepare(`
    INSERT INTO trend_structure_review_revisions (
      id, ts_code, score_trade_date, facts_hash, request_id, local_trend_state,
      local_total_score, ai_verdict, rationale, focus_points_json, provider,
      model, audit_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const upsertProjection = db.prepare(`
    INSERT INTO trend_structure_reviews (
      ts_code, score_trade_date, revision_id, facts_hash, request_id,
      local_trend_state, local_total_score, ai_verdict, rationale,
      focus_points_json, provider, model, audit_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      updated_at = excluded.updated_at
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
    )
  })
  write()
  return getRevisionById(db, revisionId)!
}

/** @deprecated Use saveTrendStructureReview; retained for existing internal callers during migration. */
export function upsertTrendStructureReview(
  db: Database.Database,
  input: UpsertTrendStructureReviewInput,
): TrendStructureReview {
  return saveTrendStructureReview(db, input)
}
