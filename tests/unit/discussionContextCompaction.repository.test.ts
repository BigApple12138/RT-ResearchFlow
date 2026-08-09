import Database from 'better-sqlite3'
import { randomUUID } from 'crypto'
import { beforeEach, describe, expect, it } from 'vitest'
import { createSession, getSession, updateSessionMessages } from '../../electron/main/database/aiAnalysisSessionRepository'
import { runMigrations } from '../../electron/main/database/db'
import { getAIConfig, updateAIConfig } from '../../electron/main/database/aiConfigRepository'
import {
  getLatestDiscussionCompaction,
  insertDiscussionCompaction,
} from '../../electron/main/database/discussionCompactionRepository'
import {
  completeDiscussionTurnRequest,
  getDiscussionTurnRequest,
  insertDiscussionTurnRequest,
} from '../../electron/main/database/discussionTurnRequestRepository'

describe('讨论上下文归档相关数据库契约', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    runMigrations(db)
  })

  it('创建趋势复核、累计摘要、消息归档与 turn request 表，并启用自动压缩', () => {
    const tables = db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type = 'table'
        AND name IN (
          'trend_structure_reviews',
          'ai_discussion_context_compactions',
          'ai_discussion_message_archives',
          'ai_discussion_turn_requests'
        )
      ORDER BY name
    `).all() as { name: string }[]

    expect(tables.map((row) => row.name)).toEqual([
      'ai_discussion_context_compactions',
      'ai_discussion_message_archives',
      'ai_discussion_turn_requests',
      'trend_structure_reviews',
    ])
    expect(db.prepare('SELECT autoCompactDiscussion FROM ai_config WHERE id = 1').get()).toEqual({
      autoCompactDiscussion: 1,
    })
  })

  it('迁移可重复执行且复核主键、归档主键和 requestId 约束存在', () => {
    runMigrations(db)

    const reviewPrimaryKey = db.prepare('PRAGMA table_info(trend_structure_reviews)').all() as Array<{ name: string; pk: number }>
    expect(reviewPrimaryKey.filter((column) => column.pk > 0).map((column) => column.name)).toEqual([
      'ts_code',
      'score_trade_date',
    ])

    const archivePrimaryKey = db.prepare('PRAGMA table_info(ai_discussion_message_archives)').all() as Array<{ name: string; pk: number }>
    expect(archivePrimaryKey.filter((column) => column.pk > 0).map((column) => column.name)).toEqual([
      'session_id',
      'message_sequence',
    ])

    expect(db.prepare(`
      SELECT 1 FROM sqlite_master
      WHERE type = 'index' AND name = 'idx_ai_discussion_message_archives_session_sequence'
    `).get()).toEqual({ 1: 1 })
  })

  it('autoCompactDiscussion 可由主进程保存并按旧库默认值读取', () => {
    expect(getAIConfig(db).autoCompactDiscussion).toBe(1)
    updateAIConfig(db, { autoCompactDiscussion: 0 })
    expect(getAIConfig(db).autoCompactDiscussion).toBe(0)
    updateAIConfig(db, { autoCompactDiscussion: 1 })
    expect(getAIConfig(db).autoCompactDiscussion).toBe(1)
  })

  it('压缩记录按 requestId 幂等，并能读取同一会话最新覆盖范围', () => {
    const sessionId = createSession(db, {
      provider: 'qwen', model: 'test-model', articleUrls: [], promptSent: '', response: null,
      scanRunId: null, isError: false,
    })
    const firstInput = {
      sessionId,
      requestId: randomUUID(),
      sourceStartSequence: 0,
      coveredThroughSequence: 3,
      sourceMessagesHash: 'a'.repeat(64),
      summary: '累计摘要一',
      summaryHash: 'b'.repeat(64),
      provider: 'qwen',
      model: 'test-model',
      now: 1_000,
    }
    const first = insertDiscussionCompaction(db, firstInput)
    const replay = insertDiscussionCompaction(db, { ...firstInput, summary: '不应覆盖', now: 2_000 })
    const latest = insertDiscussionCompaction(db, {
      ...firstInput,
      requestId: randomUUID(),
      sourceStartSequence: 4,
      coveredThroughSequence: 7,
      sourceMessagesHash: 'c'.repeat(64),
      summary: '累计摘要二',
      summaryHash: 'd'.repeat(64),
      now: 3_000,
    })

    expect(replay).toEqual(first)
    expect(getLatestDiscussionCompaction(db, sessionId)).toEqual(latest)
  })

  it('turn request 按 requestId 幂等，并保存完成后的响应文本', () => {
    const sessionId = createSession(db, {
      provider: 'qwen', model: 'test-model', articleUrls: [], promptSent: '', response: null,
      scanRunId: null, isError: false,
    })
    const requestId = randomUUID()
    const first = insertDiscussionTurnRequest(db, {
      requestId, sessionId, userMessage: '继续验证', now: 1_000,
    })
    const replay = insertDiscussionTurnRequest(db, {
      requestId, sessionId, userMessage: '不应追加第二条', now: 2_000,
    })
    const completed = completeDiscussionTurnRequest(db, requestId, '已完成', 3_000)

    expect(first.status).toBe('running')
    expect(replay).toEqual(first)
    expect(completed).toMatchObject({
      request_id: requestId,
      status: 'succeeded',
      response_text: '已完成',
      created_at: 1_000,
      completed_at: 3_000,
    })
    expect(getDiscussionTurnRequest(db, requestId)).toEqual(completed)
  })

  it('创建和追加消息时由主进程生成 session 内单调 sequence，并推进游标', () => {
    const sessionId = createSession(db, {
      provider: 'qwen', model: 'test-model', articleUrls: [], promptSent: '', response: null,
      scanRunId: null, isError: false,
      messages: [
        { role: 'user', content: '第一问' },
        { role: 'assistant', content: '第一答' },
      ],
    })

    expect(JSON.parse(getSession(db, sessionId)!.messages!)).toMatchObject([
      { sequence: 1, role: 'user', content: '第一问' },
      { sequence: 2, role: 'assistant', content: '第一答' },
    ])
    expect(db.prepare('SELECT next_message_sequence FROM ai_analysis_sessions WHERE id = ?').get(sessionId))
      .toEqual({ next_message_sequence: 3 })

    updateSessionMessages(db, sessionId, [
      { sequence: 1, role: 'user', content: '第一问' },
      { sequence: 2, role: 'assistant', content: '第一答' },
      { role: 'user', content: '第二问' },
    ])
    expect(JSON.parse(getSession(db, sessionId)!.messages!)).toMatchObject([
      { sequence: 1 }, { sequence: 2 }, { sequence: 3, role: 'user', content: '第二问' },
    ])
    expect(db.prepare('SELECT next_message_sequence FROM ai_analysis_sessions WHERE id = ?').get(sessionId))
      .toEqual({ next_message_sequence: 4 })
  })
})
