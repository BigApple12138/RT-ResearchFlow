import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { DATABASE_MIGRATIONS, runMigrations } from '../../electron/main/database/db'
import {
  appendMessageCenterEvent,
  dismissMessageCenterEvent,
  listMessageCenterEvents,
} from '../../electron/main/database/messageCenterEventRepository'

describe('messageCenterEventRepository', () => {
  it('migration 158 建表；append 幂等；dismiss 后 list 默认不可见', () => {
    const db = new Database(':memory:')
    runMigrations(db, DATABASE_MIGRATIONS.filter((m) => m.version === 158))

    const first = appendMessageCenterEvent(db, {
      fingerprint: 'scan-last:20260830',
      title: '最近一次资讯扫描完成',
      description: '上次扫描时间 09:30',
      source: '资讯',
      tone: 'success',
      actionKind: 'feed',
      createdAt: 1_700_000_000_000,
    })
    const second = appendMessageCenterEvent(db, {
      fingerprint: 'scan-last:20260830',
      title: '应被忽略',
      description: 'dup',
      source: '资讯',
      tone: 'info',
    })
    expect(second.id).toBe(first.id)
    expect(listMessageCenterEvents(db)).toHaveLength(1)

    expect(dismissMessageCenterEvent(db, first.id)).toBe(true)
    expect(listMessageCenterEvents(db)).toHaveLength(0)
    expect(listMessageCenterEvents(db, { includeDismissed: true })).toHaveLength(1)
  })
})
