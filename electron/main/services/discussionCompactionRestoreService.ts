/**
 * 讨论压缩检查点 restore（P2）。
 * 仅允许恢复「最新」compaction，把该次归档消息拼回热区并删除该检查点行。
 */
import type Database from 'better-sqlite3'
import {
  getSessionMessages,
  updateSessionMessages,
  type NormalizedConversationMessage,
} from '../database/aiAnalysisSessionRepository'
import {
  getLatestDiscussionCompaction,
  listDiscussionCompactionCheckpoints,
} from '../database/discussionCompactionRepository'
import type { DiscussionCompactionRow } from '../database/types'
import { listArchivedDiscussionMessages } from '../database/discussionMessageArchiveRepository'

export type RestoreDiscussionCompactionResult =
  | {
      ok: true
      messages: NormalizedConversationMessage[]
      restoredCompactionId: string
      restoredCount: number
      replayed?: boolean
    }
  | {
      ok: false
      code: 'NOT_FOUND' | 'NOT_LATEST' | 'SESSION_MISMATCH' | 'REQUEST_CONFLICT' | 'CORRUPT_ARCHIVE'
      message: string
      messages: NormalizedConversationMessage[]
    }

function parseArchiveRow(row: { message_json: string; message_sequence: number; session_id: number }): NormalizedConversationMessage | null {
  try {
    const value = JSON.parse(row.message_json) as Record<string, unknown>
    if (
      (value.role !== 'user' && value.role !== 'assistant')
      || typeof value.content !== 'string'
    ) {
      return null
    }
    return {
      ...(value as unknown as NormalizedConversationMessage),
      sequence: row.message_sequence,
    }
  } catch {
    return null
  }
}

export function restoreLatestDiscussionCompactionWithinLock(
  db: Database.Database,
  input: {
    sessionId: number
    requestId: string
    compactionId?: string
  },
): RestoreDiscussionCompactionResult {
  const hot = getSessionMessages(db, input.sessionId)
  const latest = getLatestDiscussionCompaction(db, input.sessionId)
  if (!latest) {
    return { ok: false, code: 'NOT_FOUND', message: '没有可恢复的压缩检查点', messages: hot }
  }
  const targetId = input.compactionId ?? latest.id
  if (targetId !== latest.id) {
    return {
      ok: false,
      code: 'NOT_LATEST',
      message: '仅支持恢复最新压缩检查点，请先恢复更新的检查点或放弃更早恢复',
      messages: hot,
    }
  }
  if (latest.session_id !== input.sessionId) {
    return { ok: false, code: 'SESSION_MISMATCH', message: '检查点不属于当前会话', messages: hot }
  }

  const archived = listArchivedDiscussionMessages(db, input.sessionId)
    .filter((row) => row.compaction_id === latest.id)
  if (archived.length === 0) {
    return {
      ok: false,
      code: 'CORRUPT_ARCHIVE',
      message: '检查点没有可恢复的归档消息',
      messages: hot,
    }
  }
  const restoredParts: NormalizedConversationMessage[] = []
  for (const row of archived) {
    const parsed = parseArchiveRow(row)
    if (!parsed) {
      return {
        ok: false,
        code: 'CORRUPT_ARCHIVE',
        message: `归档消息损坏（sequence=${row.message_sequence}）`,
        messages: hot,
      }
    }
    restoredParts.push(parsed)
  }

  const merged = new Map<number, NormalizedConversationMessage>()
  for (const message of restoredParts) merged.set(message.sequence, message)
  for (const message of hot) merged.set(message.sequence, message)
  const nextHot = [...merged.values()].sort((a, b) => a.sequence - b.sequence)

  try {
    db.transaction(() => {
      updateSessionMessages(db, input.sessionId, nextHot)
      db.prepare(`
        DELETE FROM ai_discussion_message_archives
        WHERE session_id = ? AND compaction_id = ?
      `).run(input.sessionId, latest.id)
      db.prepare(`
        DELETE FROM ai_discussion_context_compactions
        WHERE id = ? AND session_id = ?
      `).run(latest.id, input.sessionId)
    })()
  } catch (error) {
    return {
      ok: false,
      code: 'REQUEST_CONFLICT',
      message: error instanceof Error ? error.message : '恢复检查点失败',
      messages: getSessionMessages(db, input.sessionId),
    }
  }

  return {
    ok: true,
    messages: getSessionMessages(db, input.sessionId),
    restoredCompactionId: latest.id,
    restoredCount: restoredParts.length,
  }
}

export function listCompactionCheckpointsForSession(
  db: Database.Database,
  sessionId: number,
  limit = 20,
): DiscussionCompactionRow[] {
  return listDiscussionCompactionCheckpoints(db, sessionId, limit)
}
