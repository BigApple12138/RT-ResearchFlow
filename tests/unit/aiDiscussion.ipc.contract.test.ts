import { describe, expect, it } from 'vitest'
import type { DiscussionCompactionRow } from '../../electron/main/database/types'
import {
  isUuid,
  toDiscussionCompactionDto,
} from '../../electron/main/ipc/aiHandlers'
import {
  validateDiscussionCompactionInput,
  validateDiscussionFollowUpInput,
} from '../../electron/main/ipc/discussionIpcContract'

describe('AI 讨论 IPC 契约', () => {
  it('只接受 RFC 4122 UUID requestId', () => {
    expect(isUuid('00000000-0000-4000-8000-000000000001')).toBe(true)
    expect(isUuid('00000000-0000-0000-0000-000000000001')).toBe(false)
    expect(isUuid('not-a-uuid')).toBe(false)
  })

  it('将压缩数据库行映射为 renderer 使用的 camelCase DTO', () => {
    const row: DiscussionCompactionRow = {
      id: 'compaction-1',
      session_id: 7,
      request_id: 'request-1',
      source_start_sequence: 1,
      covered_through_sequence: 18,
      source_messages_hash: 'a'.repeat(64),
      summary_text: '累计摘要',
      summary_hash: 'b'.repeat(64),
      provider: 'qwen',
      model: 'qwen-plus',
      created_at: 123,
      tokens_before: 9000,
      tokens_after: 1200,
    }

    expect(toDiscussionCompactionDto(row)).toEqual({
      id: 'compaction-1',
      sessionId: 7,
      requestId: 'request-1',
      sourceStartSequence: 1,
      coveredThroughSequence: 18,
      sourceMessagesHash: 'a'.repeat(64),
      summary: '累计摘要',
      summaryHash: 'b'.repeat(64),
      provider: 'qwen',
      model: 'qwen-plus',
      createdAt: 123,
      tokensBefore: 9000,
      tokensAfter: 1200,
    })
  })

  it('拒绝非法压缩参数并只接受 camelCase 主进程输入', () => {
    expect(validateDiscussionCompactionInput({
      requestId: 'not-a-uuid', sessionId: 7, mode: 'manual',
    })).toMatchObject({ ok: false, code: 'INVALID_PARAM' })
    expect(validateDiscussionCompactionInput({
      requestId: '00000000-0000-4000-8000-000000000001', sessionId: '7', mode: 'manual',
    })).toMatchObject({ ok: false, code: 'INVALID_PARAM' })
    expect(validateDiscussionCompactionInput({
      requestId: '00000000-0000-4000-8000-000000000001', sessionId: 7, mode: 'legacy',
    })).toMatchObject({ ok: false, code: 'INVALID_PARAM' })
    expect(validateDiscussionCompactionInput({
      requestId: '00000000-0000-4000-8000-000000000001', sessionId: 7, mode: 'manual',
    })).toEqual({
      ok: true,
      data: { requestId: '00000000-0000-4000-8000-000000000001', sessionId: 7, mode: 'manual' },
    })
  })

  it('拒绝非法 follow-up 参数并规范化消息空白', () => {
    expect(validateDiscussionFollowUpInput({
      requestId: 'not-a-uuid', sessionId: 7, message: '继续',
    })).toMatchObject({ ok: false, code: 'INVALID_PARAM' })
    expect(validateDiscussionFollowUpInput({
      requestId: '00000000-0000-4000-8000-000000000001', sessionId: 0, message: '继续',
    })).toMatchObject({ ok: false, code: 'INVALID_PARAM' })
    expect(validateDiscussionFollowUpInput({
      requestId: '00000000-0000-4000-8000-000000000001', sessionId: 7, message: '   ',
    })).toMatchObject({ ok: false, code: 'INVALID_PARAM' })
    expect(validateDiscussionFollowUpInput({
      requestId: '00000000-0000-4000-8000-000000000001', sessionId: 7, message: '  继续  ',
    })).toEqual({
      ok: true,
      data: { requestId: '00000000-0000-4000-8000-000000000001', sessionId: 7, message: '继续' },
    })
  })
})
