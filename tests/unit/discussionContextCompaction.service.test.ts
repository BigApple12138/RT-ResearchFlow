import Database from 'better-sqlite3'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  createSession,
  getSession,
  getSessionMessages,
  updateSessionMessages,
} from '../../electron/main/database/aiAnalysisSessionRepository'
import { getLatestDiscussionCompaction } from '../../electron/main/database/discussionCompactionRepository'
import { runMigrations } from '../../electron/main/database/db'
import { listArchivedDiscussionMessages } from '../../electron/main/database/discussionMessageArchiveRepository'
import {
  AUTO_COMPACT_MIN_PAIRS,
  HOT_TAIL_MESSAGE_COUNT,
  compactDiscussionContext,
  countCompleteUserAssistantPairs,
  shouldAutoCompact,
} from '../../electron/main/services/discussionContextCompactionService'

describe('讨论上下文压缩服务', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    runMigrations(db)
  })

  function createDiscussion(messageCount: number): number {
    return createSession(db, {
      provider: 'qwen', model: 'test-model', articleUrls: [], promptSent: '硬事实 prompt', response: null,
      scanRunId: null, isError: false,
      messages: Array.from({ length: messageCount }, (_, index) => ({
        role: index % 2 === 0 ? 'user' as const : 'assistant' as const,
        content: `消息-${index + 1}`,
      })),
    })
  }

  it('只统计完整 user/assistant 对，并在 12 对达到自动阈值', () => {
    const messages = Array.from({ length: 23 }, (_, index) => ({
      role: index % 2 === 0 ? 'user' as const : 'assistant' as const,
      content: String(index),
    }))
    expect(countCompleteUserAssistantPairs(messages)).toBe(11)
    expect(shouldAutoCompact(messages)).toBe(false)

    messages.push({ role: 'assistant', content: '补齐' })
    expect(countCompleteUserAssistantPairs(messages)).toBe(12)
    expect(shouldAutoCompact(messages)).toBe(true)
    expect(AUTO_COMPACT_MIN_PAIRS).toBe(12)
  })

  it('自动阈值只统计最新累计摘要之后的未归档消息', () => {
    const messages = Array.from({ length: 24 }, (_, index) => ({
      role: index % 2 === 0 ? 'user' as const : 'assistant' as const,
      content: String(index),
      sequence: index + 1,
    }))

    expect(shouldAutoCompact(messages, 18)).toBe(false)
    expect(shouldAutoCompact(messages, 0)).toBe(true)
  })

  it('压缩成功后写累计摘要、归档旧消息并只保留热尾部', async () => {
    const sessionId = createDiscussion(24)
    const prompts: string[] = []

    const result = await compactDiscussionContext(
      db,
      { sessionId, requestId: 'compact-success-1', mode: 'auto' },
      async (_database, input) => {
        prompts.push(input.prompt ?? '')
        return { provider: 'qwen', model: 'summary-model', text: '累计摘要：保留关键讨论结论' }
      },
    )

    expect(result.ok).toBe(true)
    expect(result.archivedCount).toBe(24 - HOT_TAIL_MESSAGE_COUNT)
    expect(getSessionMessages(db, sessionId).map((message) => message.sequence)).toEqual([19, 20, 21, 22, 23, 24])
    expect(listArchivedDiscussionMessages(db, sessionId).map((row) => row.message_sequence)).toEqual(
      Array.from({ length: 18 }, (_, index) => index + 1),
    )
    expect(getLatestDiscussionCompaction(db, sessionId)).toMatchObject({
      covered_through_sequence: 18,
      summary_text: '累计摘要：保留关键讨论结论',
    })
    expect(prompts[0]).toContain('硬事实 prompt')
    expect(prompts[0]).toContain('消息-1')
    expect(JSON.parse(getSession(db, sessionId)!.messages!)).not.toContainEqual(
      expect.objectContaining({ content: '累计摘要：保留关键讨论结论' }),
    )
  })

  it('新一轮摘要必须带入上一轮累计摘要', async () => {
    const sessionId = createDiscussion(24)
    await compactDiscussionContext(
      db,
      { sessionId, requestId: 'compact-cumulative-1', mode: 'auto' },
      async () => ({ provider: 'qwen', model: 'summary-model', text: '第一轮累计结论' }),
    )
    updateSessionMessages(db, sessionId, [
      ...getSessionMessages(db, sessionId),
      ...Array.from({ length: 24 }, (_, index) => ({
        role: index % 2 === 0 ? 'user' as const : 'assistant' as const,
        content: `新增消息-${index + 1}`,
      })),
    ])
    const prompts: string[] = []
    await compactDiscussionContext(
      db,
      { sessionId, requestId: 'compact-cumulative-2', mode: 'auto' },
      async (_database, input) => {
        prompts.push(input.prompt ?? '')
        return { provider: 'qwen', model: 'summary-model', text: '第二轮累计结论' }
      },
    )

    expect(prompts[0]).toContain('第一轮累计结论')
    expect(prompts[0]).toContain('新增消息-1')
    expect(getLatestDiscussionCompaction(db, sessionId)?.summary_text).toBe('第二轮累计结论')
  })

  it('模型失败时不改变热消息，也不写入归档或摘要', async () => {
    const sessionId = createDiscussion(24)
    const before = getSession(db, sessionId)!.messages

    const result = await compactDiscussionContext(
      db,
      { sessionId, requestId: 'compact-failure-1', mode: 'manual' },
      async () => { throw new Error('模型不可用') },
    )

    expect(result).toMatchObject({ ok: false, code: 'COMPACTION_FAILED' })
    expect(getSession(db, sessionId)!.messages).toBe(before)
    expect(listArchivedDiscussionMessages(db, sessionId)).toEqual([])
    expect(getLatestDiscussionCompaction(db, sessionId)).toBeNull()
  })
})
