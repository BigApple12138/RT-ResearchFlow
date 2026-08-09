import type { Database } from 'better-sqlite3'
import type { AIAnalysisSessionRow, AIProvider } from './types'
import type { ResearchTextAudit } from '../services/researchEvidenceAuditService'

export interface ConversationMessage {
  role: 'user' | 'assistant'
  content: string
  /** Main-process-owned session sequence. Legacy inputs may omit it until normalized. */
  sequence?: number
  requestId?: string
  researchAgentRunId?: string
  webSearchTrace?: import('../services/aiProvider').AIWebSearchTrace
  researchAudit?: ResearchTextAudit
}

export type NormalizedConversationMessage = ConversationMessage & { sequence: number }

export interface CreateSessionParams {
  provider: AIProvider
  model: string
  articleUrls: string[] // will be JSON-stringified
  promptSent: string
  response: string | null
  scanRunId: number | null
  briefingId?: number | null // single-article analysis; mutually exclusive with scanRunId
  isError: boolean
  messages?: ConversationMessage[] | null
  createdAt?: number
}

interface NormalizedMessages {
  messages: NormalizedConversationMessage[]
  nextSequence: number
}

function parseStoredMessages(raw: string | null): ConversationMessage[] {
  if (!raw) return []
  try {
    const value: unknown = JSON.parse(raw)
    if (!Array.isArray(value)) return []
    return value.filter((item): item is ConversationMessage => (
      typeof item === 'object' && item !== null
      && (item as { role?: unknown }).role !== undefined
      && (item as { content?: unknown }).content !== undefined
    ))
  } catch {
    return []
  }
}

export function normalizeConversationMessages(
  messages: ConversationMessage[],
  cursor = 1,
): NormalizedMessages {
  const used = new Set<number>()
  let nextSequence = Math.max(1, Number.isInteger(cursor) ? cursor : 1)
  let previousSequence = 0
  const normalized = messages.map((message) => {
    const candidate = message.sequence
    const canKeep = typeof candidate === 'number'
      && Number.isInteger(candidate)
      && candidate > previousSequence
      && !used.has(candidate)
    const sequence = canKeep
      ? candidate
      : (() => {
          nextSequence = Math.max(nextSequence, previousSequence + 1)
          while (used.has(nextSequence)) nextSequence += 1
          return nextSequence
        })()
    used.add(sequence)
    previousSequence = sequence
    nextSequence = Math.max(nextSequence, sequence + 1)
    return { ...message, sequence }
  })
  return { messages: normalized, nextSequence }
}

export function createSession(db: Database, params: CreateSessionParams): number {
  const normalized = params.messages == null
    ? null
    : normalizeConversationMessages(params.messages, 1)
  const result = db
    .prepare(
      `INSERT INTO ai_analysis_sessions
        (createdAt, provider, model, articleUrls, promptSent, response, scanRunId, briefingId, isError, messages, next_message_sequence)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      params.createdAt ?? Date.now(),
      params.provider,
      params.model,
      JSON.stringify(params.articleUrls),
      params.promptSent,
      params.response,
      params.scanRunId ?? null,
      params.briefingId ?? null,
      params.isError ? 1 : 0,
      normalized == null ? null : JSON.stringify(normalized.messages),
      normalized?.nextSequence ?? 0,
    )
  return result.lastInsertRowid as number
}

export function listSessions(db: Database): AIAnalysisSessionRow[] {
  return db
    .prepare(
      'SELECT * FROM ai_analysis_sessions ORDER BY createdAt DESC'
    )
    .all() as AIAnalysisSessionRow[]
}

export function getSession(db: Database, id: number): AIAnalysisSessionRow | null {
  return (
    (db
      .prepare('SELECT * FROM ai_analysis_sessions WHERE id = ?')
      .get(id) as AIAnalysisSessionRow) || null
  )
}

export function updateSessionRound2(db: Database, id: number, responseRound2: string): void {
  db.prepare('UPDATE ai_analysis_sessions SET responseRound2 = ? WHERE id = ?').run(responseRound2, id)
}

export function updateSessionResponse(db: Database, id: number, response: string): void {
  db.prepare('UPDATE ai_analysis_sessions SET response = ? WHERE id = ?').run(response, id)
}

export function updateSessionMessages(db: Database, id: number, messages: ConversationMessage[]): void {
  const row = db.prepare('SELECT next_message_sequence FROM ai_analysis_sessions WHERE id = ?').get(id) as { next_message_sequence?: number } | undefined
  const normalized = normalizeConversationMessages(messages, row?.next_message_sequence ?? 1)
  db.prepare('UPDATE ai_analysis_sessions SET messages = ?, next_message_sequence = ? WHERE id = ?')
    .run(JSON.stringify(normalized.messages), normalized.nextSequence, id)
}

export function getSessionMessages(db: Database, id: number): NormalizedConversationMessage[] {
  const row = getSession(db, id)
  if (!row) return []
  const parsed = parseStoredMessages(row.messages)
  const normalized = normalizeConversationMessages(parsed, row.next_message_sequence ?? 1)
  const raw = row.messages == null ? null : JSON.stringify(normalized.messages)
  if (raw !== row.messages || normalized.nextSequence !== row.next_message_sequence) {
    updateSessionMessages(db, id, parsed)
  }
  return normalized.messages
}

export function deleteSession(db: Database, id: number): void {
  db.prepare('DELETE FROM ai_analysis_sessions WHERE id = ?').run(id)
}

export function deleteAllSessions(db: Database, includeResearchDiscussions = false): number {
  const result = includeResearchDiscussions
    ? db.prepare('DELETE FROM ai_analysis_sessions').run()
    : db.prepare(`
        DELETE FROM ai_analysis_sessions
        WHERE NOT EXISTS (
          SELECT 1 FROM ai_research_discussion_contexts c WHERE c.session_id = ai_analysis_sessions.id
        )
      `).run()
  return result.changes
}

export function deleteSessionsOlderThan(
  db: Database,
  olderThanMs: number,
  dryRun: boolean
): { count: number; deleted: number } {
  const cutoff = Date.now() - olderThanMs
  const countRow = db
    .prepare(`
      SELECT COUNT(*) as cnt FROM ai_analysis_sessions s
      WHERE s.createdAt < ?
        AND NOT EXISTS (SELECT 1 FROM ai_research_discussion_contexts c WHERE c.session_id = s.id)
    `)
    .get(cutoff) as { cnt: number }
  const count = countRow.cnt
  if (dryRun) return { count, deleted: 0 }
  const result = db
    .prepare(`
      DELETE FROM ai_analysis_sessions
      WHERE createdAt < ?
        AND NOT EXISTS (
          SELECT 1 FROM ai_research_discussion_contexts c WHERE c.session_id = ai_analysis_sessions.id
        )
    `)
    .run(cutoff)
  return { count, deleted: result.changes }
}
