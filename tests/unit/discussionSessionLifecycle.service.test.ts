import Database from 'better-sqlite3'
import { beforeEach, describe, expect, it } from 'vitest'
import { createSession, getSession } from '../../electron/main/database/aiAnalysisSessionRepository'
import { runMigrations } from '../../electron/main/database/db'
import { createResearchDiscussionContext } from '../../electron/main/database/researchDiscussionRepository'
import { runDiscussionFollowUp } from '../../electron/main/services/discussionFollowUpService'
import {
  deleteAllSessionsWithSessionLocks,
  deleteSessionsOlderThanWithSessionLocks,
} from '../../electron/main/services/discussionSessionLifecycleService'

describe('讨论会话生命周期锁', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    runMigrations(db)
  })

  function createDiscussion(): number {
    const sessionId = createSession(db, {
      provider: 'qwen', model: 'test-model', articleUrls: [], promptSent: '事实', response: null,
      scanRunId: null, isError: false, messages: [],
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

  it('批量删除研究讨论会等待同一 session 的 follow-up 完成', async () => {
    const sessionId = createDiscussion()
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const followUp = runDiscussionFollowUp(db, {
      requestId: '00000000-0000-4000-8000-000000000201', sessionId, message: '先完成这一轮',
    }, {
      callAI: async () => {
        await gate
        return { provider: 'qwen' as const, model: 'test-model', text: '完成' }
      },
    })
    await Promise.resolve()

    const deletion = deleteAllSessionsWithSessionLocks(db, true)
    await Promise.resolve()
    expect(getSession(db, sessionId)).not.toBeNull()

    release()
    await followUp
    await expect(deletion).resolves.toMatchObject({ deleted: 0, deletedResearchDiscussions: 1 })
    expect(getSession(db, sessionId)).toBeNull()
  })

  it('自动清理旧普通会话会等待同一 session 的 follow-up 完成', async () => {
    const sessionId = createSession(db, {
      provider: 'qwen', model: 'test-model', articleUrls: [], promptSent: '事实', response: null,
      scanRunId: null, isError: false, messages: [], createdAt: Date.now() - 10 * 24 * 60 * 60 * 1000,
    })
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const followUp = runDiscussionFollowUp(db, {
      requestId: '00000000-0000-4000-8000-000000000202', sessionId, message: '先完成这一轮',
    }, {
      callAI: async () => {
        await gate
        return { provider: 'qwen' as const, model: 'test-model', text: '完成' }
      },
    })
    await Promise.resolve()

    const cleanup = deleteSessionsOlderThanWithSessionLocks(db, 7 * 24 * 60 * 60 * 1000, false)
    await Promise.resolve()
    expect(getSession(db, sessionId)).not.toBeNull()

    release()
    await followUp
    await expect(cleanup).resolves.toMatchObject({ count: 1, deleted: 1 })
    expect(getSession(db, sessionId)).toBeNull()
  })
})
