import type Database from 'better-sqlite3'
import type { DiscussionMessageArchiveRow } from './types'

export interface DiscussionMessageForArchive {
  sequence: number
  [key: string]: unknown
}

export interface ArchiveDiscussionMessagesInput {
  sessionId: number
  compactionId: string
  messages: DiscussionMessageForArchive[]
  archivedAt?: number
}

export function archiveDiscussionMessages(
  db: Database.Database,
  input: ArchiveDiscussionMessagesInput,
): number {
  const archivedAt = input.archivedAt ?? Date.now()
  const insert = db.prepare(`
    INSERT OR IGNORE INTO ai_discussion_message_archives (
      session_id, message_sequence, message_json, compaction_id, archived_at
    ) VALUES (?, ?, ?, ?, ?)
  `)
  const archive = db.transaction(() => {
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
  })
  return archive()
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
