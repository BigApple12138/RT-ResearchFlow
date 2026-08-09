import type Database from 'better-sqlite3'
import type { ConversationMessage } from './aiAnalysisSessionRepository'
import type { DiscussionMessageArchiveRow } from './types'

export type DiscussionMessageForArchive = ConversationMessage & {
  sequence: number
}

export interface ArchiveDiscussionMessagesInput {
  sessionId: number
  compactionId: string
  messages: DiscussionMessageForArchive[]
  archivedAt?: number
}

export class DiscussionArchiveIntegrityError extends Error {
  readonly code = 'ARCHIVE_INTEGRITY_ERROR' as const

  constructor(
    public readonly sessionId: number,
    public readonly messageSequence: number,
  ) {
    super('ARCHIVE_INTEGRITY_ERROR')
    this.name = 'DiscussionArchiveIntegrityError'
  }
}

export function archiveDiscussionMessages(
  db: Database.Database,
  input: ArchiveDiscussionMessagesInput,
): number {
  return db.transaction(() => archiveDiscussionMessagesInTransaction(db, input))()
}

/**
 * Writes archive rows without opening a transaction. Callers that need to
 * atomically insert a compaction and replace the hot tail use this helper
 * inside their own transaction.
 */
export function archiveDiscussionMessagesInTransaction(
  db: Database.Database,
  input: ArchiveDiscussionMessagesInput,
): number {
  if (!input.messages.every((message) => Number.isInteger(message.sequence) && message.sequence > 0)) {
    throw new Error('ARCHIVE_SEQUENCE_MUST_BE_POSITIVE')
  }
  const archivedAt = input.archivedAt ?? Date.now()
  const insert = db.prepare(`
    INSERT OR IGNORE INTO ai_discussion_message_archives (
      session_id, message_sequence, message_json, compaction_id, archived_at
    ) VALUES (?, ?, ?, ?, ?)
  `)
  let changes = 0
  for (const message of input.messages) {
    changes += insert.run(
      input.sessionId,
      message.sequence,
      JSON.stringify(message),
      input.compactionId,
      archivedAt,
    ).changes
  }
  return changes
}

export function listArchivedDiscussionMessages(
  db: Database.Database,
  sessionId: number,
  throughSequence?: number,
): DiscussionMessageArchiveRow[] {
  const rows = throughSequence == null
    ? db.prepare(`
        SELECT * FROM ai_discussion_message_archives
        WHERE session_id = ?
        ORDER BY message_sequence ASC
      `).all(sessionId)
    : db.prepare(`
        SELECT * FROM ai_discussion_message_archives
        WHERE session_id = ? AND message_sequence <= ?
        ORDER BY message_sequence ASC
      `).all(sessionId, throughSequence)
  return rows as DiscussionMessageArchiveRow[]
}

function parseArchivedMessage(
  row: DiscussionMessageArchiveRow,
): DiscussionMessageForArchive {
  let value: unknown
  try {
    value = JSON.parse(row.message_json)
  } catch {
    throw new DiscussionArchiveIntegrityError(row.session_id, row.message_sequence)
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new DiscussionArchiveIntegrityError(row.session_id, row.message_sequence)
  }
  const message = value as Record<string, unknown>
  if (
    (message.role !== 'user' && message.role !== 'assistant')
    || typeof message.content !== 'string'
    || message.sequence !== row.message_sequence
  ) {
    throw new DiscussionArchiveIntegrityError(row.session_id, row.message_sequence)
  }
  return {
    ...(message as unknown as ConversationMessage),
    sequence: row.message_sequence,
  }
}

/**
 * Rebuilds the complete discussion from immutable archived messages and the
 * current hot tail. Hot messages win for a duplicate sequence so a caller can
 * safely pass a just-written session snapshot while an archive is being read.
 */
export function loadFullDiscussionMessages(
  db: Database.Database,
  sessionId: number,
  hotMessages: DiscussionMessageForArchive[],
  throughSequence?: number,
): DiscussionMessageForArchive[] {
  const messages = new Map<number, DiscussionMessageForArchive>()
  for (const row of listArchivedDiscussionMessages(db, sessionId, throughSequence)) {
    const message = parseArchivedMessage(row)
    messages.set(row.message_sequence, message)
  }
  for (const message of hotMessages) {
    if (!Number.isInteger(message.sequence)) continue
    if (throughSequence != null && message.sequence > throughSequence) continue
    messages.set(message.sequence, { ...message })
  }
  return [...messages.values()].sort((left, right) => left.sequence - right.sequence)
}
