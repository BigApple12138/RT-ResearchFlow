import Database from 'better-sqlite3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createSession,
  getSessionMessages,
  updateSessionMessages,
} from '../../electron/main/database/aiAnalysisSessionRepository'
import { runMigrations } from '../../electron/main/database/db'
import { createResearchDiscussionContext } from '../../electron/main/database/researchDiscussionRepository'
import {
  CONTEXT_RESERVE_CHARS,
  CONTEXT_WINDOW_CHARS,
  estimateMessagesChars,
  prepareDiscussionTurnContext,
  shouldHardCompact,
} from '../../electron/main/services/researchContextEngine'
import * as compaction from '../../electron/main/services/discussionContextCompactionService'

describe('ResearchContextEngine', () => {
  it('shouldHardCompact 对齐 OpenClaw：超过 window-reserve 为真', () => {
    expect(shouldHardCompact(CONTEXT_WINDOW_CHARS - CONTEXT_RESERVE_CHARS)).toBe(false)
    expect(shouldHardCompact(CONTEXT_WINDOW_CHARS - CONTEXT_RESERVE_CHARS + 1)).toBe(true)
  })

  it('estimateMessagesChars 累加 content 长度', () => {
    expect(estimateMessagesChars([{ content: 'ab' }, { content: 'cde' }])).toBe(5)
  })
})

describe('prepareDiscussionTurnContext hard 闸', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    runMigrations(db)
  })

  it('装配字符超 hard 阈值时以 manual 模式触发 compact', async () => {
    const sessionId = createSession(db, {
      provider: 'qwen',
      model: 'test-model',
      articleUrls: [],
      promptSent: '硬事实',
      response: null,
      scanRunId: null,
      isError: false,
      messages: [
        { role: 'user', content: '短问' },
        { role: 'assistant', content: '短答' },
      ],
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
    // 单条极长内容：对数未满 12，但装配会超 hard 闸
    const huge = '东'.repeat(CONTEXT_WINDOW_CHARS)
    updateSessionMessages(db, sessionId, [
      { role: 'user', content: '短问', sequence: 1 },
      { role: 'assistant', content: huge, sequence: 2 },
    ])

    const compactSpy = vi.spyOn(compaction, 'compactDiscussionContextWithinLock').mockResolvedValue({
      ok: true,
      compaction: null,
      messages: getSessionMessages(db, sessionId),
      archivedCount: 0,
      skippedReason: 'not_enough_messages',
    })

    const result = await prepareDiscussionTurnContext(db, {
      sessionId,
      requestId: 'hard-gate-1',
      hotMessages: getSessionMessages(db, sessionId),
      userMessage: { role: 'user', content: '继续', requestId: 'hard-gate-1' },
    })

    expect(compactSpy).toHaveBeenCalled()
    const modes = compactSpy.mock.calls.map((call) => call[1]?.mode)
    expect(modes).toContain('manual')
    expect(result.hardCompacted).toBe(false) // mock 未真正写入 compaction 行
    compactSpy.mockRestore()
  })
})
