/**
 * 投研讨论 / Agent 共用的窄 Context Engine（P0）。
 *
 * 对照 OpenClaw（本地 `E:\代码库\git\openclaw` @ 46bdbe585f96663d6ecff932ad6790d6cd26e3a3）：
 * - `shouldHardCompact` ← `packages/agent-core/src/harness/compaction/compaction.ts` `shouldCompact`
 * - 会话串行由调用方 `withDiscussionSessionLock` 保证（≈ `embedded-agent-runner/lanes.ts` session lane）
 *
 * 不引入 openclaw 运行时；硬事实仍走 promptSent + 既有摘要审计。
 */
import type Database from 'better-sqlite3'
import { getAIConfig } from '../database/aiConfigRepository'
import { getLatestDiscussionCompaction } from '../database/discussionCompactionRepository'
import { getResearchDiscussionContext } from '../database/researchDiscussionRepository'
import type { ConversationMessage, NormalizedConversationMessage } from '../database/aiAnalysisSessionRepository'
import { getSessionMessages } from '../database/aiAnalysisSessionRepository'
import {
  compactDiscussionContextWithinLock,
  shouldAutoCompact,
  type CompactionAICaller,
  type DiscussionCompactionResult,
} from './discussionContextCompactionService'
import { buildDiscussionModelMessages } from './researchDiscussionContextService'

/** 对照 OpenClaw contextWindow；与编排器送模软上限对齐（字符启发式）。 */
export const CONTEXT_WINDOW_CHARS = 48_000

/** 对照 OpenClaw reserveTokens：为摘要/本轮输出预留。 */
export const CONTEXT_RESERVE_CHARS = 8_000

export function estimateMessagesChars(
  messages: Array<{ content?: string | null }>,
): number {
  return messages.reduce((sum, message) => sum + (message.content?.length ?? 0), 0)
}

/**
 * 对齐 OpenClaw `shouldCompact(contextTokens, contextWindow, { reserveTokens })`：
 * `assembled > window - reserve`。
 */
export function shouldHardCompact(
  assembledChars: number,
  windowChars: number = CONTEXT_WINDOW_CHARS,
  reserveChars: number = CONTEXT_RESERVE_CHARS,
): boolean {
  return assembledChars > windowChars - reserveChars
}

export type PrepareDiscussionTurnContextInput = {
  sessionId: number
  requestId: string
  /** 已含时间前缀的用户句（尚未写入热账本）。 */
  userMessage: ConversationMessage
  /** 当前热消息（可含空会话回填后的 assistant）。 */
  hotMessages: ConversationMessage[]
  compactAI?: CompactionAICaller
}

export type PrepareDiscussionTurnContextResult = {
  hotMessages: NormalizedConversationMessage[]
  warning?: string
  softCompacted: boolean
  hardCompacted: boolean
}

async function runCompact(
  db: Database.Database,
  sessionId: number,
  requestId: string,
  mode: 'auto' | 'manual',
  compactAI?: CompactionAICaller,
): Promise<DiscussionCompactionResult> {
  return compactDiscussionContextWithinLock(
    db,
    { sessionId, requestId, mode },
    compactAI,
  )
}

/**
 * 发模前 soft + hard 压缩。调用方必须已持有该 session 的讨论锁。
 * 本函数不负责最终 assemble：调用方随后只调用一次 `buildDiscussionModelMessages` /
 * `buildDiscussionAIRequest`，避免双重拼接 promptSent。
 */
export async function prepareDiscussionTurnContext(
  db: Database.Database,
  input: PrepareDiscussionTurnContextInput,
): Promise<PrepareDiscussionTurnContextResult> {
  let hotMessages: NormalizedConversationMessage[] = input.hotMessages.map((message, index) => ({
    ...message,
    sequence: message.sequence ?? index + 1,
  }))
  let warning: string | undefined
  let softCompacted = false
  let hardCompacted = false

  const discussion = getResearchDiscussionContext(db, input.sessionId)
  const autoCompactEnabled = getAIConfig(db).autoCompactDiscussion !== 0
  const latestCompaction = discussion
    ? getLatestDiscussionCompaction(db, input.sessionId)
    : null

  if (
    discussion
    && autoCompactEnabled
    && shouldAutoCompact(hotMessages, latestCompaction?.covered_through_sequence ?? null)
  ) {
    try {
      const compacted = await runCompact(
        db,
        input.sessionId,
        `${input.requestId}:auto-compact`,
        'auto',
        input.compactAI,
      )
      if (compacted.ok) {
        hotMessages = compacted.messages
        if (compacted.compaction) softCompacted = true
      } else {
        warning = `自动整理上下文失败：${compacted.message}`
        console.warn(`[researchContextEngine] ${warning}`)
      }
    } catch (error) {
      warning = `自动整理上下文失败：${error instanceof Error ? error.message : String(error)}`
      console.warn(`[researchContextEngine] ${warning}`)
    }
  }

  const probeAssemble = (): number => {
    const requestMessages = [...hotMessages, input.userMessage]
    const assembled = buildDiscussionModelMessages(db, input.sessionId, requestMessages)
    return estimateMessagesChars(assembled)
  }

  if (discussion && shouldHardCompact(probeAssemble())) {
    try {
      const compacted = await runCompact(
        db,
        input.sessionId,
        `${input.requestId}:hard-compact`,
        'manual',
        input.compactAI,
      )
      if (compacted.ok) {
        hotMessages = compacted.messages
        if (compacted.compaction) hardCompacted = true
        else if (!warning && compacted.skippedReason) {
          // 无法归档足够消息时由调用方软截断兜底
        }
      } else {
        const hardWarn = `窗将满时整理上下文失败：${compacted.message}`
        warning = warning ? `${warning}；${hardWarn}` : hardWarn
        console.warn(`[researchContextEngine] ${hardWarn}`)
      }
    } catch (error) {
      const hardWarn = `窗将满时整理上下文失败：${error instanceof Error ? error.message : String(error)}`
      warning = warning ? `${warning}；${hardWarn}` : hardWarn
      console.warn(`[researchContextEngine] ${hardWarn}`)
    }
  }

  return { hotMessages, warning, softCompacted, hardCompacted }
}

export type AfterDiscussionTurnCompactInput = {
  sessionId: number
  requestId: string
  compactAI?: CompactionAICaller
}

export type AfterDiscussionTurnCompactResult = {
  warning?: string
  softCompacted: boolean
  hardCompacted: boolean
}

/**
 * 回合成功落账后的 afterTurn：再评估 soft/hard compact（对照 OpenClaw afterTurn）。
 * 调用方须仍持有 session lock；失败只返回 warning，不抛、不回滚已提交回合。
 */
export async function afterDiscussionTurnCompact(
  db: Database.Database,
  input: AfterDiscussionTurnCompactInput,
): Promise<AfterDiscussionTurnCompactResult> {
  const hotMessages = getSessionMessages(db, input.sessionId)
  // 无「下一句用户」；用占位空 user 仅触发 hard 探测装配（content 不计实质）
  const prepared = await prepareDiscussionTurnContext(db, {
    sessionId: input.sessionId,
    requestId: `${input.requestId}:after-turn`,
    hotMessages,
    userMessage: { role: 'user', content: '' },
    compactAI: input.compactAI,
  })
  return {
    warning: prepared.warning,
    softCompacted: prepared.softCompacted,
    hardCompacted: prepared.hardCompacted,
  }
}
