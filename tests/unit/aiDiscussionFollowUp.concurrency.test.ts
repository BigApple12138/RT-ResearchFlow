import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSession, getSession, getSessionMessages } from '../../electron/main/database/aiAnalysisSessionRepository'
import { getDiscussionTurnRequest } from '../../electron/main/database/discussionTurnRequestRepository'
import { runMigrations } from '../../electron/main/database/db'
import { createResearchDiscussionContext } from '../../electron/main/database/researchDiscussionRepository'
import { runDiscussionFollowUp } from '../../electron/main/services/discussionFollowUpService'
import { resetDiscussionSessionLocksForTests } from '../../electron/main/services/discussionSessionLock'
import { deleteResearchDiscussionWithSessionLock } from '../../electron/main/services/researchDiscussionContextService'

describe('讨论 follow-up 并发与幂等', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    runMigrations(db)
  })

  afterEach(() => {
    resetDiscussionSessionLocksForTests()
  })

  function createDiscussion(messageCount = 0): number {
    const sessionId = createSession(db, {
      provider: 'qwen', model: 'test-model', articleUrls: [], promptSent: '硬事实', response: null,
      scanRunId: null, isError: false,
      messages: Array.from({ length: messageCount }, (_, index) => ({
        role: index % 2 === 0 ? 'user' as const : 'assistant' as const,
        content: `历史-${index + 1}`,
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

  it('成功 requestId 重放直接返回已有 turn，不重复追加消息', async () => {
    const sessionId = createDiscussion()
    let calls = 0
    const callAI = async () => {
      calls += 1
      return { provider: 'qwen' as const, model: 'test-model', text: '回答一次' }
    }

    const first = await runDiscussionFollowUp(db, {
      requestId: '00000000-0000-4000-8000-000000000101', sessionId, message: '继续验证',
    }, { callAI })
    const replay = await runDiscussionFollowUp(db, {
      requestId: '00000000-0000-4000-8000-000000000101', sessionId, message: '继续验证',
    }, { callAI })

    expect(first).toMatchObject({ text: '回答一次' })
    expect(replay).toMatchObject({ text: '回答一次' })
    expect(calls).toBe(1)
    expect(getSessionMessages(db, sessionId)).toHaveLength(2)
    expect(getDiscussionTurnRequest(db, '00000000-0000-4000-8000-000000000101')).toMatchObject({ status: 'succeeded' })
  })

  it('同一 requestId 并发提交只调用一次模型并追加一轮', async () => {
    const sessionId = createDiscussion()
    let calls = 0
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const callAI = async () => {
      calls += 1
      await gate
      return { provider: 'qwen' as const, model: 'test-model', text: '并发回答' }
    }

    const first = runDiscussionFollowUp(db, {
      requestId: '00000000-0000-4000-8000-000000000102', sessionId, message: '并发问题',
    }, { callAI })
    const second = runDiscussionFollowUp(db, {
      requestId: '00000000-0000-4000-8000-000000000102', sessionId, message: '并发问题',
    }, { callAI })
    try {
      await vi.waitFor(() => expect(calls).toBe(1))
      release()
      await Promise.all([first, second])
    } catch (error) {
      release()
      throw error
    }
    expect(getSessionMessages(db, sessionId)).toHaveLength(2)
  })

  it('深度研究 busy 时拒绝追问且不创建 turn request', async () => {
    const sessionId = createDiscussion()
    const result = await runDiscussionFollowUp(db, {
      requestId: '00000000-0000-4000-8000-000000000103', sessionId, message: '不应发送',
    }, {
      isBusy: () => true,
      callAI: async () => ({ provider: 'qwen' as const, model: 'test-model', text: '不应调用' }),
    })

    expect(result).toMatchObject({ code: 'SESSION_BUSY' })
    expect(getDiscussionTurnRequest(db, '00000000-0000-4000-8000-000000000103')).toBeNull()
  })

  it('自动压缩失败时仍继续原 follow-up', async () => {
    const sessionId = createDiscussion(24)
    const calls: string[] = []
    const result = await runDiscussionFollowUp(db, {
      requestId: '00000000-0000-4000-8000-000000000104', sessionId, message: '继续讨论',
    }, {
      compactAI: async () => { throw new Error('压缩不可用') },
      callAI: async (_database, input) => {
        calls.push(input.messages.at(-1)?.content ?? '')
        return { provider: 'qwen' as const, model: 'test-model', text: '继续回答' }
      },
    })

    expect(result).toMatchObject({ text: '继续回答' })
    expect(calls[0]).toContain('继续讨论')
    expect(getSessionMessages(db, sessionId)).toHaveLength(26)
  })

  it('自动压缩事务异常后继续原 hot context，receipt 不会停留 running', async () => {
    const sessionId = createDiscussion(24)
    db.exec(`
      CREATE TRIGGER fail_auto_compaction
      BEFORE INSERT ON ai_discussion_context_compactions
      BEGIN SELECT RAISE(ABORT, 'TEST_COMPACTION_TRANSACTION_CONFLICT'); END;
    `)
    let calls = 0

    const result = await runDiscussionFollowUp(db, {
      requestId: '00000000-0000-4000-8000-000000000106', sessionId, message: '事务失败后继续',
    }, {
      compactAI: async () => ({ provider: 'qwen' as const, model: 'test-model', text: '安全摘要' }),
      callAI: async () => {
        calls += 1
        return { provider: 'qwen' as const, model: 'test-model', text: '使用原上下文继续回答' }
      },
    })

    expect(result).toMatchObject({ text: '使用原上下文继续回答', warning: expect.stringContaining('自动整理上下文失败') })
    expect(calls).toBe(1)
    expect(getDiscussionTurnRequest(db, '00000000-0000-4000-8000-000000000106')).toMatchObject({ status: 'succeeded' })
  })

  it('删除研究讨论与进行中的 follow-up 通过同一 session lock 串行化', async () => {
    const sessionId = createDiscussion()
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const followUp = runDiscussionFollowUp(db, {
      requestId: '00000000-0000-4000-8000-000000000105', sessionId, message: '先完成这一轮',
    }, {
      callAI: async () => {
        await gate
        return { provider: 'qwen' as const, model: 'test-model', text: '完成' }
      },
    })
    const deletion = deleteResearchDiscussionWithSessionLock(db, sessionId)
    await vi.waitFor(() => {
      expect(getSession(db, sessionId)).not.toBeNull()
    })
    try {
      release()
      await followUp
      await deletion
    } catch (error) {
      release()
      throw error
    }
    expect(getSessionMessages(db, sessionId)).toEqual([])
  })
})
