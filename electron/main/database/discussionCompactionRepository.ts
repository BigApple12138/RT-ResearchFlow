import type Database from 'better-sqlite3'
import type { DiscussionCompactionRow } from './types'

export interface InsertDiscussionCompactionInput {
  sessionId: number
  requestId: string
  sourceStartSequence: number
  coveredThroughSequence: number
  sourceMessagesHash: string
  summary: string
  summaryHash: string
  provider: string | null
  model: string | null
  now?: number
}

export function getDiscussionCompactionByRequestId(
  db: Database.Database,
  requestId: string,
): DiscussionCompactionRow | null {
  return (db.prepare(`
    SELECT * FROM ai_discussion_context_compactions
    WHERE request_id = ?
  `).get(requestId) as DiscussionCompactionRow | undefined) ?? null
}

export function getLatestDiscussionCompaction(
  db: Database.Database,
  sessionId: number,
): DiscussionCompactionRow | null {
  return (db.prepare(`
    SELECT * FROM ai_discussion_context_compactions
    WHERE session_id = ?
    ORDER BY covered_through_sequence DESC, id DESC
    LIMIT 1
  `).get(sessionId) as DiscussionCompactionRow | undefined) ?? null
}

export function insertDiscussionCompaction(
  db: Database.Database,
  input: InsertDiscussionCompactionInput,
): DiscussionCompactionRow {
  const existing = getDiscussionCompactionByRequestId(db, input.requestId)
  if (existing) return existing

  db.prepare(`
    INSERT INTO ai_discussion_context_compactions (
      session_id, request_id, source_start_sequence, covered_through_sequence,
      source_messages_hash, summary, summary_hash, provider, model, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.sessionId,
    input.requestId,
    input.sourceStartSequence,
    input.coveredThroughSequence,
    input.sourceMessagesHash,
    input.summary,
    input.summaryHash,
    input.provider,
    input.model,
    input.now ?? Date.now(),
  )

  return getDiscussionCompactionByRequestId(db, input.requestId)!
}
