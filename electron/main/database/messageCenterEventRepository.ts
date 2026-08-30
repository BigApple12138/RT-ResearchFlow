import type Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'

export type MessageCenterTone = 'info' | 'success' | 'warning' | 'danger'
export type MessageCenterActionKind = 'feed' | 'decision-center' | 'onboarding'

export interface MessageCenterEventRow {
  id: string
  fingerprint: string
  title: string
  description: string
  source: string
  tone: MessageCenterTone
  actionKind: MessageCenterActionKind | null
  createdAt: number
  dismissedAt: number | null
}

export interface AppendMessageCenterEventInput {
  fingerprint: string
  title: string
  description: string
  source: string
  tone: MessageCenterTone
  actionKind?: MessageCenterActionKind | null
  createdAt?: number
}

function mapRow(row: {
  id: string
  fingerprint: string
  title: string
  description: string
  source: string
  tone: string
  action_kind: string | null
  created_at: number
  dismissed_at: number | null
}): MessageCenterEventRow {
  return {
    id: row.id,
    fingerprint: row.fingerprint,
    title: row.title,
    description: row.description,
    source: row.source,
    tone: row.tone as MessageCenterTone,
    actionKind: (row.action_kind as MessageCenterActionKind | null) ?? null,
    createdAt: row.created_at,
    dismissedAt: row.dismissed_at,
  }
}

export function appendMessageCenterEvent(
  db: Database.Database,
  input: AppendMessageCenterEventInput,
): MessageCenterEventRow {
  const fingerprint = input.fingerprint.trim()
  if (!fingerprint) throw new Error('fingerprint required')
  const existing = db.prepare(`
    SELECT id, fingerprint, title, description, source, tone, action_kind, created_at, dismissed_at
    FROM message_center_events WHERE fingerprint = ?
  `).get(fingerprint) as Parameters<typeof mapRow>[0] | undefined
  if (existing) return mapRow(existing)

  const row = {
    id: randomUUID(),
    fingerprint,
    title: input.title.trim() || '通知',
    description: input.description.trim() || '',
    source: input.source.trim() || '系统',
    tone: input.tone,
    action_kind: input.actionKind ?? null,
    created_at: input.createdAt && input.createdAt > 0 ? input.createdAt : Date.now(),
    dismissed_at: null as number | null,
  }
  db.prepare(`
    INSERT INTO message_center_events
      (id, fingerprint, title, description, source, tone, action_kind, created_at, dismissed_at)
    VALUES (@id, @fingerprint, @title, @description, @source, @tone, @action_kind, @created_at, @dismissed_at)
  `).run(row)
  return mapRow(row)
}

export function listMessageCenterEvents(
  db: Database.Database,
  options: { limit?: number; includeDismissed?: boolean } = {},
): MessageCenterEventRow[] {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200)
  const rows = options.includeDismissed
    ? db.prepare(`
        SELECT id, fingerprint, title, description, source, tone, action_kind, created_at, dismissed_at
        FROM message_center_events
        ORDER BY created_at DESC
        LIMIT ?
      `).all(limit)
    : db.prepare(`
        SELECT id, fingerprint, title, description, source, tone, action_kind, created_at, dismissed_at
        FROM message_center_events
        WHERE dismissed_at IS NULL
        ORDER BY created_at DESC
        LIMIT ?
      `).all(limit)
  return (rows as Parameters<typeof mapRow>[0][]).map(mapRow)
}

export function dismissMessageCenterEvent(db: Database.Database, id: string): boolean {
  const result = db.prepare(`
    UPDATE message_center_events
    SET dismissed_at = ?
    WHERE id = ? AND dismissed_at IS NULL
  `).run(Date.now(), id)
  return result.changes > 0
}
