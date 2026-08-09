import Database from 'better-sqlite3'
import { beforeEach, describe, expect, it } from 'vitest'
import { createSession } from '../../electron/main/database/aiAnalysisSessionRepository'
import { runMigrations } from '../../electron/main/database/db'
import { insertDiscussionCompaction } from '../../electron/main/database/discussionCompactionRepository'
import {
  archiveDiscussionMessages,
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
})
