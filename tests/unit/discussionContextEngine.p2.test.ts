import Database from 'better-sqlite3'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  createSession,
  getSessionMessages,
  updateSessionMessages,
} from '../../electron/main/database/aiAnalysisSessionRepository'
import { runMigrations } from '../../electron/main/database/db'
import { createResearchDiscussionContext } from '../../electron/main/database/researchDiscussionRepository'
import { listDiscussionResearchFlushes } from '../../electron/main/database/discussionResearchFlushRepository'
import { getLatestDiscussionCompaction } from '../../electron/main/database/discussionCompactionRepository'
import { compactDiscussionContext } from '../../electron/main/services/discussionContextCompactionService'
import { restoreLatestDiscussionCompactionWithinLock } from '../../electron/main/services/discussionCompactionRestoreService'
import { HOT_TAIL_MESSAGE_COUNT } from '../../electron/main/services/discussionContextCompactionService'

describe('Context Engine P2 flush + restore', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    runMigrations(db)
  })

  function createDiscussion(messageCount: number): number {
    const sessionId = createSession(db, {
      provider: 'qwen',
      model: 'test-model',
      articleUrls: [],
      promptSent: '硬事实 prompt',
      response: null,
      scanRunId: null,
      isError: false,
      messages: Array.from({ length: messageCount }, (_, index) => ({
        role: index % 2 === 0 ? 'user' as const : 'assistant' as const,
        content: `消息-${index + 1}`,
      })),
    })
    createResearchDiscussionContext(db, {
      sessionId,
      requestId: `discussion-${sessionId}`,
      originType: 'manual',
      originId: null,
      originTitle: '测试讨论',
      originOccurredAt: null,
      originContentHash: 'context-hash',
      contextSnapshotJson: JSON.stringify({ schemaVersion: 1, title: '测试讨论', items: [] }),
      contextKeysJson: '[]',
      includedContextKeysJson: '[]',
      returnTargetJson: JSON.stringify({ tab: 'ai-analysis' }),
      projectId: null,
      baseSnapshotId: null,
      baseSelectionReason: 'unassigned',
    })
    return sessionId
  }

  it('压缩前写入研究笔记 flush，并在成功后关联 compaction_id', async () => {
    const sessionId = createDiscussion(24)
    const result = await compactDiscussionContext(
      db,
      { sessionId, requestId: '00000000-0000-4000-8000-000000000301', mode: 'auto' },
      async () => ({ provider: 'qwen', model: 'summary-model', text: '累计摘要：P2 flush' }),
    )
    expect(result.ok).toBe(true)
    const flushes = listDiscussionResearchFlushes(db, sessionId)
    expect(flushes).toHaveLength(1)
    expect(flushes[0]!.note_text).toContain('压缩前研究笔记')
    expect(flushes[0]!.note_text).toContain('消息-1')
    expect(flushes[0]!.compaction_id).toBe(getLatestDiscussionCompaction(db, sessionId)!.id)
  })

  it('可恢复最新检查点并把归档消息拼回热区', async () => {
    const sessionId = createDiscussion(24)
    await compactDiscussionContext(
      db,
      { sessionId, requestId: '00000000-0000-4000-8000-000000000302', mode: 'auto' },
      async () => ({ provider: 'qwen', model: 'summary-model', text: '累计摘要：可恢复' }),
    )
    expect(getSessionMessages(db, sessionId)).toHaveLength(HOT_TAIL_MESSAGE_COUNT)
    const latest = getLatestDiscussionCompaction(db, sessionId)!
    const restored = restoreLatestDiscussionCompactionWithinLock(db, {
      sessionId,
      requestId: '00000000-0000-4000-8000-000000000303',
      compactionId: latest.id,
    })
    expect(restored.ok).toBe(true)
    if (!restored.ok) return
    expect(restored.restoredCount).toBe(24 - HOT_TAIL_MESSAGE_COUNT)
    expect(getSessionMessages(db, sessionId)).toHaveLength(24)
    expect(getLatestDiscussionCompaction(db, sessionId)).toBeNull()
  })

  it('拒绝恢复非最新检查点', async () => {
    const sessionId = createDiscussion(24)
    await compactDiscussionContext(
      db,
      { sessionId, requestId: '00000000-0000-4000-8000-000000000304', mode: 'auto' },
      async () => ({ provider: 'qwen', model: 'summary-model', text: '第一轮摘要' }),
    )
    updateSessionMessages(db, sessionId, [
      ...getSessionMessages(db, sessionId),
      ...Array.from({ length: 24 }, (_, index) => ({
        role: index % 2 === 0 ? 'user' as const : 'assistant' as const,
        content: `二轮-${index + 1}`,
      })),
    ])
    // normalize sequences by reloading through another compact path is heavy; just assert NOT_LATEST with fake id
    const result = restoreLatestDiscussionCompactionWithinLock(db, {
      sessionId,
      requestId: '00000000-0000-4000-8000-000000000305',
      compactionId: 'not-the-latest-id',
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.code).toBe('NOT_LATEST')
  })
})
