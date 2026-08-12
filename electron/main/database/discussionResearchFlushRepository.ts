import { createHash, randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'

export interface DiscussionResearchFlushRow {
  id: string
  session_id: number
  request_id: string
  source_start_sequence: number
  source_end_sequence: number
  note_text: string
  note_hash: string
  compaction_id: string | null
  created_at: number
}

export interface InsertDiscussionResearchFlushInput {
  sessionId: number
  requestId: string
  sourceStartSequence: number
  sourceEndSequence: number
  noteText: string
  compactionId?: string | null
  now?: number
}

const MAX_NOTE_CHARS = 8_000

export function buildResearchFlushNoteText(input: {
  previousSummary: string | null
  messages: Array<{ role: string; content: string; sequence: number }>
}): string {
  const lines: string[] = [
    '【压缩前研究笔记 flush】',
    '以下要点在对话压缩前落库，供复盘检索；不是投资建议。',
  ]
  if (input.previousSummary?.trim()) {
    lines.push('', '【上一轮累计摘要】', input.previousSummary.trim().slice(0, 3_000))
  }
  const userBits = input.messages
    .filter((m) => m.role === 'user')
    .map((m) => `[${m.sequence}] ${m.content.trim()}`)
    .filter(Boolean)
  if (userBits.length > 0) {
    lines.push('', '【本段用户问题/目标】', ...userBits)
  }
  const assistantBits = input.messages
    .filter((m) => m.role === 'assistant')
    .slice(-3)
    .map((m) => `[${m.sequence}] ${m.content.trim().slice(0, 500)}`)
  if (assistantBits.length > 0) {
    lines.push('', '【本段助手结论摘录】', ...assistantBits)
  }
  return lines.join('\n').slice(0, MAX_NOTE_CHARS)
}

export function insertDiscussionResearchFlush(
  db: Database.Database,
  input: InsertDiscussionResearchFlushInput,
): DiscussionResearchFlushRow {
  const noteText = input.noteText.trim().slice(0, MAX_NOTE_CHARS)
  if (!noteText) throw new Error('FLUSH_NOTE_EMPTY')
  const noteHash = createHash('sha256').update(noteText).digest('hex')
  const existing = db.prepare(`
    SELECT * FROM ai_discussion_research_flushes WHERE request_id = ?
  `).get(input.requestId) as DiscussionResearchFlushRow | undefined
  if (existing) {
    if (
      existing.session_id !== input.sessionId
      || existing.source_start_sequence !== input.sourceStartSequence
      || existing.source_end_sequence !== input.sourceEndSequence
      || existing.note_hash !== noteHash
    ) {
      throw new Error('FLUSH_REQUEST_CONFLICT')
    }
    return existing
  }
  const id = randomUUID()
  const createdAt = input.now ?? Date.now()
  db.prepare(`
    INSERT INTO ai_discussion_research_flushes (
      id, session_id, request_id, source_start_sequence, source_end_sequence,
      note_text, note_hash, compaction_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.sessionId,
    input.requestId,
    input.sourceStartSequence,
    input.sourceEndSequence,
    noteText,
    noteHash,
    input.compactionId ?? null,
    createdAt,
  )
  return db.prepare(`
    SELECT * FROM ai_discussion_research_flushes WHERE id = ?
  `).get(id) as DiscussionResearchFlushRow
}

export function attachFlushCompactionId(
  db: Database.Database,
  flushId: string,
  compactionId: string,
): void {
  db.prepare(`
    UPDATE ai_discussion_research_flushes
    SET compaction_id = ?
    WHERE id = ? AND (compaction_id IS NULL OR compaction_id = ?)
  `).run(compactionId, flushId, compactionId)
}

export function listDiscussionResearchFlushes(
  db: Database.Database,
  sessionId: number,
  limit = 20,
): DiscussionResearchFlushRow[] {
  const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(Math.floor(limit), 1), 100) : 20
  return db.prepare(`
    SELECT * FROM ai_discussion_research_flushes
    WHERE session_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `).all(sessionId, safeLimit) as DiscussionResearchFlushRow[]
}
