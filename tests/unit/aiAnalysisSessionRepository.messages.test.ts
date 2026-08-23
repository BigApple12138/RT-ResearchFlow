import Database from 'better-sqlite3'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  createSession,
  getSession,
  getSessionMessages,
  updateSessionMessages,
} from '../../electron/main/database/aiAnalysisSessionRepository'
import { runMigrations } from '../../electron/main/database/db'

describe('AI 分析会话消息账本校验', () => {
  let db: Database.Database
  let sessionId: number

  beforeEach(() => {
    db = new Database(':memory:')
    runMigrations(db)
    sessionId = createSession(db, {
      provider: 'qwen', model: 'test-model', articleUrls: [], promptSent: '硬事实', response: null,
      scanRunId: null, isError: false,
    })
  })

  it.each([
    ['坏 JSON', '{bad-json'],
    ['非数组', JSON.stringify({ role: 'user', content: '不是数组' })],
    ['坏 role', JSON.stringify([{ role: 'system', content: '越权角色' }])],
    ['坏 content', JSON.stringify([{ role: 'user', content: 42 }])],
    ['坏 sequence', JSON.stringify([{ role: 'user', content: '负序号', sequence: 0 }])],
  ])('读取 %s 时保留原始账本且返回安全空结果', (_label, raw) => {
    db.prepare('UPDATE ai_analysis_sessions SET messages = ? WHERE id = ?').run(raw, sessionId)

    expect(getSessionMessages(db, sessionId)).toEqual([])
    expect(getSession(db, sessionId)?.messages).toBe(raw)
  })

  it('合法 legacy 数组可在主进程读取时补齐 sequence', () => {
    db.prepare('UPDATE ai_analysis_sessions SET messages = ?, next_message_sequence = 0 WHERE id = ?').run(
      JSON.stringify([{ role: 'user', content: '旧消息' }, { role: 'assistant', content: '旧回答' }]),
      sessionId,
    )

    expect(getSessionMessages(db, sessionId).map((message) => message.sequence)).toEqual([1, 2])
    expect(JSON.parse(getSession(db, sessionId)?.messages ?? '[]')).toMatchObject([{ sequence: 1 }, { sequence: 2 }])
  })

  it('写入发现既有 raw 非法时拒绝覆盖', () => {
    db.prepare('UPDATE ai_analysis_sessions SET messages = ? WHERE id = ?').run('{bad-json', sessionId)

    expect(() => updateSessionMessages(db, sessionId, [{ role: 'user', content: '不得覆盖' }]))
      .toThrow('INVALID_STORED_MESSAGES')
    expect(getSession(db, sessionId)?.messages).toBe('{bad-json')
  })
})
