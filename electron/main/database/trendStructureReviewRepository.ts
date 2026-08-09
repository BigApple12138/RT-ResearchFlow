import type Database from 'better-sqlite3'
import type { TrendStructureReviewRow } from './types'

export type TrendStructureReviewVerdict = TrendStructureReviewRow['ai_verdict']

export interface UpsertTrendStructureReviewInput {
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

export interface TrendStructureReview {
  tsCode: string
  scoreDate: string
  factsHash: string
  requestId: string
  localTrendState: TrendStructureReviewRow['local_trend_state']
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

function mapReview(row: TrendStructureReviewRow | undefined): TrendStructureReview | null {
  if (!row) return null
  return {
    tsCode: row.ts_code,
    scoreDate: row.score_trade_date,
    factsHash: row.facts_hash,
    requestId: row.request_id,
    localTrendState: row.local_trend_state,
    localTotalScore: row.local_total_score,
    verdict: row.ai_verdict,
    rationale: row.rationale,
    focusPoints: JSON.parse(row.focus_points_json) as string[],
    provider: row.provider,
    model: row.model,
    audit: JSON.parse(row.audit_json) as unknown,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
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
  return mapReview(row)
}

export function getTrendStructureReviewByRequestId(
  db: Database.Database,
  requestId: string,
): TrendStructureReview | null {
  const row = db.prepare(`
    SELECT * FROM trend_structure_reviews
    WHERE request_id = ?
  `).get(requestId) as TrendStructureReviewRow | undefined
  return mapReview(row)
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
  return rows.map((row) => mapReview(row)!).filter(Boolean)
}

export function upsertTrendStructureReview(
  db: Database.Database,
  input: UpsertTrendStructureReviewInput,
): TrendStructureReview {
  const replay = getTrendStructureReviewByRequestId(db, input.requestId)
  if (replay) return replay

  const now = input.now ?? Date.now()
  db.prepare(`
    INSERT INTO trend_structure_reviews (
      ts_code, score_trade_date, facts_hash, request_id, local_trend_state,
      local_total_score, ai_verdict, rationale, focus_points_json, provider,
      model, audit_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(ts_code, score_trade_date) DO UPDATE SET
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
      updated_at = excluded.updated_at
  `).run(
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
    now,
  )

  return getTrendStructureReviewByCodeDate(db, input.tsCode, input.scoreDate)!
}
