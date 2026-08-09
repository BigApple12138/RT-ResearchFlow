import Database from 'better-sqlite3'
import { beforeEach, describe, expect, it } from 'vitest'
import { createSession } from '../../electron/main/database/aiAnalysisSessionRepository'
import { runMigrations } from '../../electron/main/database/db'
import { insertDiscussionCompaction } from '../../electron/main/database/discussionCompactionRepository'
import {
  archiveDiscussionMessages,
  loadFullDiscussionMessages,
  listArchivedDiscussionMessages,
} from '../../electron/main/database/discussionMessageArchiveRepository'

describe('研究讨论消息归档 Repository', () => {
  let db: Database.Database
  let sessionId: number

  beforeEach(() => {
    db = new Database(':memory:')
    runMigrations(db)
    sessionId = createSession(db, {
      provider: 'qwen', model: 'test-model', articleUrls: [], promptSent: '', response: null,
      scanRunId: null, isError: false,
    })
  })

  it('按稳定 sequence 保存并按 sequence 顺序恢复归档消息', () => {
    const compaction = insertDiscussionCompaction(db, {
      sessionId,
      requestId: 'compaction-1',
      sourceStartSequence: 0,
      coveredThroughSequence: 2,
      sourceMessagesHash: 'a'.repeat(64),
      summary: '摘要',
      summaryHash: 'b'.repeat(64),
      provider: 'qwen',
      model: 'test-model',
      now: 1_000,
    })

    archiveDiscussionMessages(db, {
      sessionId,
      compactionId: compaction.id,
      archivedAt: 2_000,
      messages: [
        { sequence: 2, role: 'assistant', content: '第三条' },
        { sequence: 0, role: 'user', content: '第一条' },
        { sequence: 1, role: 'assistant', content: '第二条' },
      ],
    })

    expect(listArchivedDiscussionMessages(db, sessionId).map((row) => [
      row.message_sequence,
      JSON.parse(row.message_json).content,
    ])).toEqual([
      [0, '第一条'],
      [1, '第二条'],
      [2, '第三条'],
    ])
  })

  it('按 sequence 合并归档消息与热尾部，并支持 throughSequence 截止读取', () => {
    const compaction = insertDiscussionCompaction(db, {
      sessionId,
      requestId: 'compaction-2',
      sourceStartSequence: 1,
      coveredThroughSequence: 2,
      sourceMessagesHash: 'c'.repeat(64),
      summary: '摘要',
      summaryHash: 'd'.repeat(64),
      provider: 'qwen',
      model: 'test-model',
    })
    archiveDiscussionMessages(db, {
      sessionId,
      compactionId: compaction.id,
      messages: [
        { sequence: 1, role: 'user', content: '旧问题' },
        { sequence: 2, role: 'assistant', content: '旧回答' },
      ],
    })

    const hot = [
      { sequence: 3, role: 'user', content: '新问题' },
      { sequence: 4, role: 'assistant', content: '新回答' },
    ]
    expect(loadFullDiscussionMessages(db, sessionId, hot).map((message) => message.sequence)).toEqual([1, 2, 3, 4])
    expect(loadFullDiscussionMessages(db, sessionId, hot, 3).map((message) => message.content)).toEqual([
      '旧问题', '旧回答', '新问题',
    ])
  })

  it('恢复时跳过缺少 role 或 content 的非法归档 JSON', () => {
    const compaction = insertDiscussionCompaction(db, {
      sessionId,
      requestId: 'compaction-invalid-json',
      sourceStartSequence: 1,
      coveredThroughSequence: 2,
      sourceMessagesHash: 'e'.repeat(64),
      summary: '摘要',
      summaryHash: 'f'.repeat(64),
      provider: 'qwen',
      model: 'test-model',
    })
    db.prepare(`
      INSERT INTO ai_discussion_message_archives
        (session_id, message_sequence, message_json, compaction_id, archived_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(sessionId, 1, JSON.stringify({ content: '缺少 role' }), compaction.id, Date.now())
    db.prepare(`
      INSERT INTO ai_discussion_message_archives
        (session_id, message_sequence, message_json, compaction_id, archived_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(sessionId, 2, JSON.stringify({ role: 'user' }), compaction.id, Date.now())

    expect(loadFullDiscussionMessages(db, sessionId, [])).toEqual([])
  })
})
