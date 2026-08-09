import type Database from 'better-sqlite3'
import type { DiscussionTurnRequestRow } from './types'

export interface InsertDiscussionTurnRequestInput {
  requestId: string
  sessionId: number
  userMessage: string
  now?: number
}

export function getDiscussionTurnRequest(
  db: Database.Database,
  requestId: string,
): DiscussionTurnRequestRow | null {
  return (db.prepare(`
    SELECT * FROM ai_discussion_turn_requests
    WHERE request_id = ?
  `).get(requestId) as DiscussionTurnRequestRow | undefined) ?? null
}

export function insertDiscussionTurnRequest(
  db: Database.Database,
  input: InsertDiscussionTurnRequestInput,
): DiscussionTurnRequestRow {
  const existing = getDiscussionTurnRequest(db, input.requestId)
  if (existing) return existing
  const now = input.now ?? Date.now()
  db.prepare(`
    INSERT INTO ai_discussion_turn_requests (
      request_id, session_id, status, user_message, response_text,
      error_message, created_at, updated_at, completed_at
    ) VALUES (?, ?, 'pending', ?, NULL, NULL, ?, ?, NULL)
  `).run(input.requestId, input.sessionId, input.userMessage, now, now)
  return getDiscussionTurnRequest(db, input.requestId)!
}

export function completeDiscussionTurnRequest(
  db: Database.Database,
  requestId: string,
  responseText: string,
  completedAt = Date.now(),
): DiscussionTurnRequestRow {
  const existing = getDiscussionTurnRequest(db, requestId)
  if (!existing) throw new Error(`讨论 turn request 不存在：${requestId}`)
  if (existing.status === 'completed') return existing
  db.prepare(`
    UPDATE ai_discussion_turn_requests
    SET status = 'completed', response_text = ?, error_message = NULL,
        updated_at = ?, completed_at = ?
    WHERE request_id = ?
  `).run(responseText, completedAt, completedAt, requestId)
  return getDiscussionTurnRequest(db, requestId)!
}

export function failDiscussionTurnRequest(
  db: Database.Database,
  requestId: string,
  errorMessage: string,
  failedAt = Date.now(),
): DiscussionTurnRequestRow {
  const existing = getDiscussionTurnRequest(db, requestId)
  if (!existing) throw new Error(`讨论 turn request 不存在：${requestId}`)
  if (existing.status === 'completed') return existing
  db.prepare(`
    UPDATE ai_discussion_turn_requests
    SET status = 'failed', error_message = ?, updated_at = ?, completed_at = NULL
    WHERE request_id = ?
  `).run(errorMessage, failedAt, requestId)
  return getDiscussionTurnRequest(db, requestId)!
}
