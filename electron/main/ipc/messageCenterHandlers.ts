import { ipcMain } from 'electron'
import { getDb } from '../database/db'
import {
  appendMessageCenterEvent,
  dismissMessageCenterEvent,
  listMessageCenterEvents,
  type AppendMessageCenterEventInput,
  type MessageCenterActionKind,
  type MessageCenterTone,
} from '../database/messageCenterEventRepository'

const TONES = new Set<MessageCenterTone>(['info', 'success', 'warning', 'danger'])
const ACTIONS = new Set<MessageCenterActionKind>(['feed', 'decision-center', 'onboarding'])

export function registerMessageCenterHandlers(): void {
  ipcMain.handle('messageCenter:list', (_e, payload?: { limit?: number; includeDismissed?: boolean }) => {
    try {
      const items = listMessageCenterEvents(getDb(), {
        limit: typeof payload?.limit === 'number' ? payload.limit : 50,
        includeDismissed: payload?.includeDismissed === true,
      })
      return { ok: true as const, items }
    } catch (error) {
      return {
        ok: false as const,
        error: 'LIST_FAILED',
        message: error instanceof Error ? error.message : String(error),
      }
    }
  })

  ipcMain.handle('messageCenter:append', (_e, payload?: Partial<AppendMessageCenterEventInput>) => {
    try {
      const tone = payload?.tone
      if (!tone || !TONES.has(tone)) {
        return { ok: false as const, error: 'INVALID_TONE', message: 'tone 无效' }
      }
      const actionKind = payload?.actionKind
      if (actionKind != null && !ACTIONS.has(actionKind)) {
        return { ok: false as const, error: 'INVALID_ACTION', message: 'actionKind 无效' }
      }
      if (typeof payload?.fingerprint !== 'string' || !payload.fingerprint.trim()) {
        return { ok: false as const, error: 'INVALID_FINGERPRINT', message: 'fingerprint 必填' }
      }
      const item = appendMessageCenterEvent(getDb(), {
        fingerprint: payload.fingerprint,
        title: typeof payload.title === 'string' ? payload.title : '通知',
        description: typeof payload.description === 'string' ? payload.description : '',
        source: typeof payload.source === 'string' ? payload.source : '系统',
        tone,
        actionKind: actionKind ?? null,
        createdAt: typeof payload.createdAt === 'number' ? payload.createdAt : undefined,
      })
      return { ok: true as const, item }
    } catch (error) {
      return {
        ok: false as const,
        error: 'APPEND_FAILED',
        message: error instanceof Error ? error.message : String(error),
      }
    }
  })

  ipcMain.handle('messageCenter:dismiss', (_e, payload?: { id?: string }) => {
    try {
      if (typeof payload?.id !== 'string' || !payload.id.trim()) {
        return { ok: false as const, error: 'INVALID_ID', message: 'id 必填' }
      }
      const dismissed = dismissMessageCenterEvent(getDb(), payload.id.trim())
      return { ok: true as const, dismissed }
    } catch (error) {
      return {
        ok: false as const,
        error: 'DISMISS_FAILED',
        message: error instanceof Error ? error.message : String(error),
      }
    }
  })
}
