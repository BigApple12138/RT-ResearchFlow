import { randomUUID } from 'crypto'
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
  provider: string
  model: string
  /** 字符启发式；对齐 OpenClaw tokensBefore */
  tokensBefore?: number | null
  /** 字符启发式；对齐 OpenClaw tokensAfter */
  tokensAfter?: number | null
  now?: number
}

export class DiscussionCompactionRequestConflictError extends Error {
  code = 'REQUEST_CONFLICT' as const

  constructor() {
    super('REQUEST_CONFLICT')
    this.name = 'DiscussionCompactionRequestConflictError'
  }
}

function hasSameCompactionIdentity(
  existing: DiscussionCompactionRow,
  input: InsertDiscussionCompactionInput,
): boolean {
  const tokensBefore = input.tokensBefore ?? null
  const tokensAfter = input.tokensAfter ?? null
  return existing.session_id === input.sessionId
    && existing.source_start_sequence === input.sourceStartSequence
    && existing.covered_through_sequence === input.coveredThroughSequence
    && existing.source_messages_hash === input.sourceMessagesHash
    && existing.summary_hash === input.summaryHash
    && existing.summary_text === input.summary
    && existing.provider === input.provider
    && existing.model === input.model
    && (existing.tokens_before ?? null) === tokensBefore
    && (existing.tokens_after ?? null) === tokensAfter
}

function assertPositiveSequences(input: InsertDiscussionCompactionInput): void {
  if (!Number.isInteger(input.sourceStartSequence) || input.sourceStartSequence <= 0
    || !Number.isInteger(input.coveredThroughSequence) || input.coveredThroughSequence < input.sourceStartSequence) {
    throw new Error('COMPACTION_SEQUENCE_MUST_BE_POSITIVE')
  }
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

/** 压缩检查点列表（P2 list；restore UI 另开）。按覆盖序号降序。 */
export function listDiscussionCompactionCheckpoints(
  db: Database.Database,
  sessionId: number,
  limit = 20,
): DiscussionCompactionRow[] {
  const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(Math.floor(limit), 1), 100) : 20
  return db.prepare(`
    SELECT * FROM ai_discussion_context_compactions
    WHERE session_id = ?
    ORDER BY covered_through_sequence DESC, id DESC
    LIMIT ?
  `).all(sessionId, safeLimit) as DiscussionCompactionRow[]
}

export function insertDiscussionCompaction(
  db: Database.Database,
  input: InsertDiscussionCompactionInput,
): DiscussionCompactionRow {
  assertPositiveSequences(input)
  const existing = getDiscussionCompactionByRequestId(db, input.requestId)
  if (existing) {
    if (!hasSameCompactionIdentity(existing, input)) throw new DiscussionCompactionRequestConflictError()
    return existing
  }

  try {
    db.prepare(`
      INSERT INTO ai_discussion_context_compactions (
        id, session_id, request_id, source_start_sequence, covered_through_sequence,
        source_messages_hash, summary_text, summary_hash, provider, model, created_at,
        tokens_before, tokens_after
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      randomUUID(),
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
      input.tokensBefore ?? null,
      input.tokensAfter ?? null,
    )
  } catch (error) {
    const replay = getDiscussionCompactionByRequestId(db, input.requestId)
    if (!replay) throw error
    if (!hasSameCompactionIdentity(replay, input)) throw new DiscussionCompactionRequestConflictError()
    return replay
  }

  return getDiscussionCompactionByRequestId(db, input.requestId)!
}
