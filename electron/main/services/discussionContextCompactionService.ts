import { createHash } from 'node:crypto'
import type Database from 'better-sqlite3'
import {
  getSession,
  getSessionMessages,
  updateSessionMessages,
  type ConversationMessage,
  type NormalizedConversationMessage,
} from '../database/aiAnalysisSessionRepository'
import {
  getDiscussionCompactionByRequestId,
  getLatestDiscussionCompaction,
  insertDiscussionCompaction,
} from '../database/discussionCompactionRepository'
import {
  archiveDiscussionMessagesInTransaction,
  type DiscussionMessageForArchive,
} from '../database/discussionMessageArchiveRepository'
import type { DiscussionCompactionRow } from '../database/types'
import { callWithFallback, type AIFallbackResult } from './aiFallbackService'
import { withDiscussionSessionLock } from './discussionSessionLock'

export const AUTO_COMPACT_MIN_PAIRS = 12
export const HOT_TAIL_MESSAGE_COUNT = 6
export const COMPACTION_MAX_OUTPUT_TOKENS = 2_048
const MAX_SUMMARY_CHARS = 12_000

export type DiscussionCompactionMode = 'auto' | 'manual'

export interface CompactDiscussionContextInput {
  sessionId: number
  requestId: string
  mode: DiscussionCompactionMode
}

export interface CompactionAIInput {
  prompt: string
  maxTokens?: number
}

export type CompactionAICaller = (
  db: Database.Database,
  input: CompactionAIInput,
) => Promise<AIFallbackResult>

export type DiscussionCompactionResult =
  | {
      ok: true
      compaction: DiscussionCompactionRow | null
      messages: NormalizedConversationMessage[]
      archivedCount: number
      skippedReason?: 'threshold' | 'not_enough_messages' | 'already_compacted'
      replayed?: boolean
    }
  | {
      ok: false
      code: 'NOT_FOUND' | 'REQUEST_CONFLICT' | 'COMPACTION_FAILED'
      message: string
      messages: NormalizedConversationMessage[]
    }

function defaultCallAI(db: Database.Database, input: CompactionAIInput): Promise<AIFallbackResult> {
  return callWithFallback(db, { prompt: input.prompt, maxTokens: input.maxTokens })
}

export function countCompleteUserAssistantPairs(messages: Array<Pick<ConversationMessage, 'role'>>): number {
  let waitingForAssistant = false
  let pairs = 0
  for (const message of messages) {
    if (message.role === 'user') {
      waitingForAssistant = true
    } else if (waitingForAssistant) {
      pairs += 1
      waitingForAssistant = false
    }
  }
  return pairs
}

export function shouldAutoCompact(
  messages: Array<Pick<ConversationMessage, 'role' | 'sequence'>>,
  coveredThroughSequence: number | null = null,
): boolean {
  const unarchived = coveredThroughSequence == null
    ? messages
    : messages.filter((message) => message.sequence == null || message.sequence > coveredThroughSequence)
  return countCompleteUserAssistantPairs(unarchived) >= AUTO_COMPACT_MIN_PAIRS
}

function hashMessages(messages: DiscussionMessageForArchive[]): string {
  return createHash('sha256').update(JSON.stringify(messages)).digest('hex')
}

function findArchiveEndIndex(messages: NormalizedConversationMessage[]): number {
  const maxIndex = messages.length - HOT_TAIL_MESSAGE_COUNT - 1
  if (maxIndex < 0) return -1
  let waitingForAssistant = false
  let lastCompletePairIndex = -1
  for (let index = 0; index <= maxIndex; index += 1) {
    const message = messages[index]
    if (message.role === 'user') {
      waitingForAssistant = true
    } else if (waitingForAssistant) {
      lastCompletePairIndex = index
      waitingForAssistant = false
    }
  }
  return lastCompletePairIndex
}

function buildCompactionPrompt(
  promptSent: string,
  previousSummary: string | null,
  messages: DiscussionMessageForArchive[],
): string {
  const previous = previousSummary
    ? `【上一轮累计摘要】\n${previousSummary}`
    : '【上一轮累计摘要】\n无'
  const transcript = messages.map((message) => (
    `[${message.sequence}] ${message.role === 'user' ? '用户' : '助手'}：${message.content}`
  )).join('\n\n')
  return [
    '你是本地投研讨论的上下文整理器。只整理对话层，不生成新的投资结论。',
    '硬事实层由系统单独保留；不得改写、删除或推导 promptSent 中的事实、数值、日期、趋势枚举或风险边界。',
    '请把上一轮累计摘要与本次新增对话合并为一份可继续讨论的累计摘要，保留用户目标、已确认事实、分歧、未决问题、证据缺口和下一步验证动作。',
    '输出纯文本摘要，不要输出 JSON、交易指令、目标价或仓位建议。',
    `【硬事实 promptSent】\n${promptSent || '无'}`,
    previous,
    `【本次新增对话】\n${transcript}`,
  ].join('\n\n')
}

function failure(
  code: 'NOT_FOUND' | 'REQUEST_CONFLICT' | 'COMPACTION_FAILED',
  message: string,
  messages: NormalizedConversationMessage[] = [],
): DiscussionCompactionResult {
  return { ok: false, code, message, messages }
}

export async function compactDiscussionContext(
  db: Database.Database,
  input: CompactDiscussionContextInput,
  callAI: CompactionAICaller = defaultCallAI,
): Promise<DiscussionCompactionResult> {
  return withDiscussionSessionLock(input.sessionId, () => (
    compactDiscussionContextWithinLock(db, input, callAI)
  ))
}

/** Call only while the caller already owns the session lock. */
export async function compactDiscussionContextWithinLock(
  db: Database.Database,
  input: CompactDiscussionContextInput,
  callAI: CompactionAICaller = defaultCallAI,
): Promise<DiscussionCompactionResult> {
  const session = getSession(db, input.sessionId)
  if (!session) return failure('NOT_FOUND', 'Session not found')

  const existing = getDiscussionCompactionByRequestId(db, input.requestId)
  if (existing) {
    if (existing.session_id !== input.sessionId) {
      return failure('REQUEST_CONFLICT', 'requestId 已用于其他讨论会话', getSessionMessages(db, input.sessionId))
    }
    return {
      ok: true,
      compaction: existing,
      messages: getSessionMessages(db, input.sessionId),
      archivedCount: 0,
      skippedReason: 'already_compacted',
      replayed: true,
    }
  }

  const latest = getLatestDiscussionCompaction(db, input.sessionId)
  const hotMessages = getSessionMessages(db, input.sessionId)
  const unarchived = latest
    ? hotMessages.filter((message) => message.sequence > latest.covered_through_sequence)
    : hotMessages
  const pairCount = countCompleteUserAssistantPairs(unarchived)
  if (input.mode === 'auto' && pairCount < AUTO_COMPACT_MIN_PAIRS) {
    return { ok: true, compaction: null, messages: hotMessages, archivedCount: 0, skippedReason: 'threshold' }
  }

  const archiveEndIndex = findArchiveEndIndex(unarchived)
  if (archiveEndIndex < 0) {
    return { ok: true, compaction: null, messages: hotMessages, archivedCount: 0, skippedReason: 'not_enough_messages' }
  }
  const selectedMessages = unarchived.slice(0, archiveEndIndex + 1)
  const selectedForArchive = selectedMessages as DiscussionMessageForArchive[]
  const sourceStartSequence = selectedMessages[0].sequence
  const coveredThroughSequence = selectedMessages[selectedMessages.length - 1].sequence
  const prompt = buildCompactionPrompt(session.promptSent, latest?.summary_text ?? null, selectedForArchive)

  let aiResult: AIFallbackResult
  try {
    aiResult = await callAI(db, { prompt, maxTokens: COMPACTION_MAX_OUTPUT_TOKENS })
  } catch (error) {
    return failure('COMPACTION_FAILED', error instanceof Error ? error.message : '讨论上下文整理失败', hotMessages)
  }
  const summary = aiResult.text.trim().slice(0, MAX_SUMMARY_CHARS)
  if (!summary) return failure('COMPACTION_FAILED', 'AI 未返回有效的累计摘要', hotMessages)

  const sourceMessagesHash = hashMessages(selectedForArchive)
  const summaryHash = createHash('sha256').update(summary).digest('hex')
  const commit = db.transaction(() => {
    const compaction = insertDiscussionCompaction(db, {
      sessionId: input.sessionId,
      requestId: input.requestId,
      sourceStartSequence,
      coveredThroughSequence,
      sourceMessagesHash,
      summary,
      summaryHash,
      provider: aiResult.provider,
      model: aiResult.model,
    })
    const archivedCount = archiveDiscussionMessagesInTransaction(db, {
      sessionId: input.sessionId,
      compactionId: compaction.id,
      messages: selectedForArchive,
    })
    const remaining = hotMessages.filter((message) => message.sequence > coveredThroughSequence)
    updateSessionMessages(db, input.sessionId, remaining)
    return { compaction, archivedCount }
  })
  const committed = commit()
  return {
    ok: true,
    compaction: committed.compaction,
    messages: getSessionMessages(db, input.sessionId),
    archivedCount: committed.archivedCount,
  }
}
