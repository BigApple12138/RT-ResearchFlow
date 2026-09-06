import { describe, expect, it, vi } from 'vitest'
import type Database from 'better-sqlite3'
import { runDiscussionFollowUp } from '../../electron/main/services/discussionFollowUpService'

describe('runDiscussionFollowUp 停止生成', () => {
  async function setupMocks(updateMessages: ReturnType<typeof vi.fn>) {
    vi.spyOn(await import('../../electron/main/database/aiAnalysisSessionRepository'), 'getSession').mockReturnValue({
      id: 1,
      response: null,
      responseRound2: null,
    } as never)
    vi.spyOn(await import('../../electron/main/database/aiAnalysisSessionRepository'), 'getSessionMessages').mockReturnValue([])
    vi.spyOn(await import('../../electron/main/database/aiAnalysisSessionRepository'), 'updateSessionMessages').mockImplementation((...args) => {
      updateMessages(...args)
    })
    vi.spyOn(await import('../../electron/main/database/discussionTurnRequestRepository'), 'getDiscussionTurnRequest').mockReturnValue(null)
    vi.spyOn(await import('../../electron/main/database/discussionTurnRequestRepository'), 'insertDiscussionTurnRequest').mockImplementation(() => undefined as never)
    vi.spyOn(await import('../../electron/main/database/discussionTurnRequestRepository'), 'completeDiscussionTurnRequest').mockImplementation(() => undefined as never)
    vi.spyOn(await import('../../electron/main/database/discussionTurnRequestRepository'), 'failDiscussionTurnRequest').mockImplementation(() => undefined as never)
    vi.spyOn(await import('../../electron/main/database/discussionTurnRequestRepository'), 'cancelDiscussionTurnRequest').mockImplementation(() => undefined as never)
    vi.spyOn(await import('../../electron/main/database/researchDiscussionRepository'), 'getResearchDiscussionContext').mockReturnValue(null)
    vi.spyOn(await import('../../electron/main/database/aiConfigRepository'), 'getAIConfig').mockReturnValue({ autoCompactDiscussion: 0 } as never)
    vi.spyOn(await import('../../electron/main/services/discussionSessionLock'), 'withDiscussionSessionLock').mockImplementation(async (_id, fn) => fn())
    vi.spyOn(await import('../../electron/main/services/researchAgentRunManager'), 'isDiscussionSessionBusy').mockReturnValue(false)
    vi.spyOn(await import('../../electron/main/services/researchDiscussionContextService'), 'buildDiscussionAIRequest').mockReturnValue({
      messages: [{ role: 'user', content: 'hi' }],
    } as never)
  }

  it('AbortError 且有 partial：落库标注（已停止）并发 stop', async () => {
    const updateMessages = vi.fn()
    const cancelSpy = vi.fn()
    await setupMocks(updateMessages)
    const { cancelDiscussionTurnRequest } = await import('../../electron/main/database/discussionTurnRequestRepository')
    vi.mocked(cancelDiscussionTurnRequest).mockImplementation((...args) => {
      cancelSpy(...args)
      return undefined as never
    })

    const events: string[] = []
    const db = { transaction: (fn: () => void) => () => fn() } as unknown as Database.Database
    const result = await runDiscussionFollowUp(db, {
      requestId: '11111111-1111-4111-8111-111111111111',
      sessionId: 1,
      message: '请简要研判',
    }, {
      callAI: async (_db, input) => {
        input.onDelta?.('半段正文')
        const err = new Error('The operation was aborted')
        err.name = 'AbortError'
        throw err
      },
      onDelta: (event) => { events.push(event.type) },
    })

    expect(result.cancelled).toBe(true)
    expect(result.text).toContain('（已停止）')
    expect(events).toContain('stop')
    expect(updateMessages).toHaveBeenCalledTimes(1)
    expect(cancelSpy).toHaveBeenCalled()
  })

  it('AbortError 且无 partial：不落助手消息，返回 CANCELLED', async () => {
    const updateMessages = vi.fn()
    await setupMocks(updateMessages)
    const db = { transaction: (fn: () => void) => () => fn() } as unknown as Database.Database
    const result = await runDiscussionFollowUp(db, {
      requestId: '22222222-2222-4222-8222-222222222222',
      sessionId: 1,
      message: '请简要研判',
    }, {
      callAI: async () => {
        const err = new Error('AbortError')
        err.name = 'AbortError'
        throw err
      },
    })

    expect(result.code).toBe('CANCELLED')
    expect(result.cancelled).toBeUndefined()
    expect(updateMessages).not.toHaveBeenCalled()
  })
})
