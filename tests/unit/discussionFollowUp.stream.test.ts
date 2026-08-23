import { describe, expect, it, vi } from 'vitest'
import type Database from 'better-sqlite3'
import { runDiscussionFollowUp } from '../../electron/main/services/discussionFollowUpService'

describe('runDiscussionFollowUp streaming hooks', () => {
  it('emits start/delta and persists only after completion', async () => {
    const events: Array<{ type: string; accumulated?: string }> = []
    const updateMessages = vi.fn()
    const db = {
      transaction: (fn: () => void) => () => fn(),
    } as unknown as Database.Database

    // Lightweight integration via options.callAI mock — skip full DB by stubbing through callAI only path
    // This test focuses on onDelta wiring when callAI succeeds.
    const { getSession, getSessionMessages, updateSessionMessages } = await import('../../electron/main/database/aiAnalysisSessionRepository')
    const { insertDiscussionTurnRequest, completeDiscussionTurnRequest, getDiscussionTurnRequest, failDiscussionTurnRequest } = await import('../../electron/main/database/discussionTurnRequestRepository')
    const { getResearchDiscussionContext } = await import('../../electron/main/database/researchDiscussionRepository')
    const { getAIConfig } = await import('../../electron/main/database/aiConfigRepository')
    const { withDiscussionSessionLock } = await import('../../electron/main/services/discussionSessionLock')
    const { isDiscussionSessionBusy } = await import('../../electron/main/services/researchAgentRunManager')

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
    vi.spyOn(await import('../../electron/main/database/discussionTurnRequestRepository'), 'insertDiscussionTurnRequest').mockImplementation(() => undefined)
    vi.spyOn(await import('../../electron/main/database/discussionTurnRequestRepository'), 'completeDiscussionTurnRequest').mockImplementation(() => undefined)
    vi.spyOn(await import('../../electron/main/database/discussionTurnRequestRepository'), 'failDiscussionTurnRequest').mockImplementation(() => undefined)
    vi.spyOn(await import('../../electron/main/database/researchDiscussionRepository'), 'getResearchDiscussionContext').mockReturnValue(null)
    vi.spyOn(await import('../../electron/main/database/aiConfigRepository'), 'getAIConfig').mockReturnValue({ autoCompactDiscussion: 0 } as never)
    vi.spyOn(await import('../../electron/main/services/discussionSessionLock'), 'withDiscussionSessionLock').mockImplementation(async (_id, fn) => fn())
    vi.spyOn(await import('../../electron/main/services/researchAgentRunManager'), 'isDiscussionSessionBusy').mockReturnValue(false)
    vi.spyOn(await import('../../electron/main/services/researchDiscussionContextService'), 'buildDiscussionAIRequest').mockReturnValue({
      messages: [{ role: 'user', content: 'hi' }],
    } as never)

    void getSession
    void getSessionMessages
    void updateSessionMessages
    void insertDiscussionTurnRequest
    void completeDiscussionTurnRequest
    void getDiscussionTurnRequest
    void failDiscussionTurnRequest
    void getResearchDiscussionContext
    void getAIConfig
    void withDiscussionSessionLock
    void isDiscussionSessionBusy

    const result = await runDiscussionFollowUp(db, {
      requestId: '11111111-1111-4111-8111-111111111111',
      sessionId: 1,
      message: '请简要研判',
    }, {
      callAI: async (_db, input) => {
        input.onDelta?.('一段')
        input.onDelta?.('一段草稿')
        return {
          provider: 'chatgpt',
          model: 'gpt-4o-mini',
          text: '一段草稿',
        }
      },
      onDelta: (event) => {
        events.push({ type: event.type, accumulated: 'accumulated' in event ? event.accumulated : undefined })
      },
    })

    expect(result.error).toBeUndefined()
    expect(events.map((e) => e.type)).toEqual(['start', 'delta', 'delta'])
    expect(updateMessages).toHaveBeenCalledTimes(1)
  })
})
