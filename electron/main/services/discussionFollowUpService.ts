import type Database from 'better-sqlite3'
import {
  getSession,
  getSessionMessages,
  updateSessionMessages,
  type ConversationMessage,
  type NormalizedConversationMessage,
} from '../database/aiAnalysisSessionRepository'
import {
  completeDiscussionTurnRequest,
  failDiscussionTurnRequest,
  getDiscussionTurnRequest,
  insertDiscussionTurnRequest,
} from '../database/discussionTurnRequestRepository'
import { getAIConfig } from '../database/aiConfigRepository'
import { getResearchDiscussionContext } from '../database/researchDiscussionRepository'
import type { AIProvider } from '../database/types'
import { callWithFallback, type AIFallbackResult } from './aiFallbackService'
import {
  buildDiscussionAIRequest,
  getDiscussionResearchAuditContext,
} from './researchDiscussionContextService'
import {
  auditResearchText,
  buildBlockedResearchText,
} from './researchEvidenceAuditService'
import {
  compactDiscussionContextWithinLock,
  shouldAutoCompact,
  type CompactionAICaller,
} from './discussionContextCompactionService'
import { getLatestDiscussionCompaction } from '../database/discussionCompactionRepository'
import { withDiscussionSessionLock } from './discussionSessionLock'
import { isDiscussionSessionBusy } from './researchAgentRunManager'

export interface DiscussionFollowUpInput {
  requestId: string
  sessionId: number
  message: string
}

export interface DiscussionFollowUpAICallInput {
  sessionId: number
  messages: ConversationMessage[]
  onDelta?: (accumulated: string) => void
  onProviderAttempt?: (provider: AIProvider) => void
}

export type DiscussionFollowUpAICaller = (
  db: Database.Database,
  input: DiscussionFollowUpAICallInput,
) => Promise<AIFallbackResult>

export type DiscussionFollowUpDeltaEvent =
  | { type: 'start'; requestId: string; sessionId: number; streaming: boolean; reason?: 'web_search' | 'buffered' }
  | { type: 'delta'; requestId: string; sessionId: number; accumulated: string }
  | { type: 'reset'; requestId: string; sessionId: number; provider?: string }
  | { type: 'error'; requestId: string; sessionId: number; message: string }

export interface DiscussionFollowUpOptions {
  callAI?: DiscussionFollowUpAICaller
  compactAI?: CompactionAICaller
  isBusy?: (db: Database.Database, sessionId: number) => boolean
  onSuccess?: (db: Database.Database, sessionId: number) => void | Promise<void>
  onDelta?: (event: DiscussionFollowUpDeltaEvent) => void
}

export interface DiscussionFollowUpResult {
  text?: string
  messages?: NormalizedConversationMessage[]
  error?: string
  code?: string
  warning?: string
}

function injectTimePrefix(prompt: string): string {
  const bjNow = new Date(Date.now() + 8 * 60 * 60 * 1000)
  const year = bjNow.getUTCFullYear()
  const month = String(bjNow.getUTCMonth() + 1).padStart(2, '0')
  const day = String(bjNow.getUTCDate()).padStart(2, '0')
  const hour = String(bjNow.getUTCHours()).padStart(2, '0')
  const minute = String(bjNow.getUTCMinutes()).padStart(2, '0')
  return `今天是${year}年${month}月${day}日，现在是${hour}:${minute}（北京时间）\n\n${prompt}`
}

function defaultCallAI(
  db: Database.Database,
  input: DiscussionFollowUpAICallInput,
): Promise<AIFallbackResult> {
  const request = buildDiscussionAIRequest(db, input.sessionId, input.messages)
  return callWithFallback(db, {
    ...request,
    onDelta: input.onDelta,
    onProviderAttempt: input.onProviderAttempt,
  })
}

function normalizeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function errorResult(code: string, error: string, messages: NormalizedConversationMessage[] = []): DiscussionFollowUpResult {
  return { error, code, messages }
}

async function runDiscussionFollowUpWithinLock(
  db: Database.Database,
  input: DiscussionFollowUpInput,
  options: DiscussionFollowUpOptions,
): Promise<DiscussionFollowUpResult> {
  const session = getSession(db, input.sessionId)
  if (!session) return errorResult('NOT_FOUND', 'Session not found')

  const rawMessage = input.message.trim()
  if (!rawMessage) return errorResult('INVALID_PARAM', '追问内容不能为空')

  const existing = getDiscussionTurnRequest(db, input.requestId)
  if (existing) {
    if (existing.session_id !== input.sessionId || existing.user_message !== rawMessage) {
      return errorResult('REQUEST_ID_CONFLICT', 'requestId 已用于不同的追问输入', getSessionMessages(db, input.sessionId))
    }
    if (existing.status === 'succeeded') {
      return {
        text: existing.response_text ?? '',
        messages: getSessionMessages(db, input.sessionId),
      }
    }
    if (existing.status === 'running') {
      return errorResult('REQUEST_IN_PROGRESS', '该追问请求正在处理中', getSessionMessages(db, input.sessionId))
    }
    return errorResult('REQUEST_FAILED', existing.error_message ?? '该追问请求已失败，请重新发送', getSessionMessages(db, input.sessionId))
  }

  const busy = options.isBusy ?? isDiscussionSessionBusy
  if (busy(db, input.sessionId)) {
    return errorResult('SESSION_BUSY', '当前会话有深度研究进行中，请等待完成或取消后再追问。', getSessionMessages(db, input.sessionId))
  }

  insertDiscussionTurnRequest(db, {
    requestId: input.requestId,
    sessionId: input.sessionId,
    userMessage: rawMessage,
  })

  let messages = getSessionMessages(db, input.sessionId)
  const discussion = getResearchDiscussionContext(db, input.sessionId)
  let warning: string | undefined
  const autoCompactEnabled = getAIConfig(db).autoCompactDiscussion !== 0
  const latestCompaction = discussion ? getLatestDiscussionCompaction(db, input.sessionId) : null
  if (discussion && autoCompactEnabled && shouldAutoCompact(messages, latestCompaction?.covered_through_sequence ?? null)) {
    try {
      const compacted = await compactDiscussionContextWithinLock(db, {
        sessionId: input.sessionId,
        requestId: `${input.requestId}:auto-compact`,
        mode: 'auto',
      }, options.compactAI)
      if (!compacted.ok) {
        warning = `自动整理上下文失败：${compacted.message}`
        console.warn(`[ai:followUp] ${warning}`)
      } else {
        messages = compacted.messages
      }
    } catch (error) {
      warning = `自动整理上下文失败：${normalizeError(error)}`
      console.warn(`[ai:followUp] ${warning}`)
    }
  }

  if (messages.length === 0) {
    const context = (session.response ?? '')
      + (session.responseRound2 ? `\n\n【第二轮深度分析】\n${session.responseRound2}` : '')
    if (context.trim()) messages = [{ role: 'assistant', content: context, sequence: 1 }]
  }

  const userMessage: ConversationMessage = {
    role: 'user',
    content: injectTimePrefix(rawMessage),
    requestId: input.requestId,
  }
  const requestMessages: ConversationMessage[] = [...messages, userMessage]

  try {
    const callAI = options.callAI ?? defaultCallAI
    const aiRequest = buildDiscussionAIRequest(db, input.sessionId, requestMessages)
    const streaming = !(aiRequest.webSearch?.enabled === true)
    options.onDelta?.({
      type: 'start',
      requestId: input.requestId,
      sessionId: input.sessionId,
      streaming,
      ...(streaming ? {} : { reason: 'web_search' as const }),
    })
    let attempt = 0
    const result = await callAI(db, {
      sessionId: input.sessionId,
      messages: requestMessages,
      onDelta: streaming
        ? (accumulated) => {
            options.onDelta?.({
              type: 'delta',
              requestId: input.requestId,
              sessionId: input.sessionId,
              accumulated,
            })
          }
        : undefined,
      onProviderAttempt: streaming
        ? (provider) => {
            attempt += 1
            if (attempt > 1) {
              options.onDelta?.({
                type: 'reset',
                requestId: input.requestId,
                sessionId: input.sessionId,
                provider,
              })
            }
          }
        : undefined,
    })
    const auditContext = discussion ? getDiscussionResearchAuditContext(db, input.sessionId) : null
    const researchAudit = auditContext
      ? auditResearchText({
          text: result.text,
          documentKind: 'discussion',
          evidenceContrast: auditContext.evidenceContrast,
          asOf: auditContext.asOf,
          excludedUrls: auditContext.excludedUrls,
          webSearchTrace: result.webSearchTrace,
          allowedFactTexts: [
            ...auditContext.allowedFactTexts,
            ...requestMessages.filter((message) => message.role === 'user').map((message) => message.content),
          ],
        })
      : null
    const persistedText = researchAudit?.status === 'blocked'
      ? buildBlockedResearchText(researchAudit)
      : result.text
    const assistant: ConversationMessage = {
      role: 'assistant',
      content: persistedText,
      requestId: input.requestId,
      webSearchTrace: result.webSearchTrace,
      ...(researchAudit ? { researchAudit } : {}),
    }
    const persistedMessages = [...requestMessages, assistant]
    const commit = db.transaction(() => {
      updateSessionMessages(db, input.sessionId, persistedMessages)
      completeDiscussionTurnRequest(db, input.requestId, persistedText)
    })
    commit()
    if (options.onSuccess) await options.onSuccess(db, input.sessionId)
    return {
      text: persistedText,
      messages: getSessionMessages(db, input.sessionId),
      ...(warning ? { warning } : {}),
    }
  } catch (error) {
    const message = normalizeError(error)
    options.onDelta?.({
      type: 'error',
      requestId: input.requestId,
      sessionId: input.sessionId,
      message,
    })
    failDiscussionTurnRequest(db, input.requestId, message)
    return errorResult('AI_CALL_FAILED', message, getSessionMessages(db, input.sessionId))
  }
}

export async function runDiscussionFollowUp(
  db: Database.Database,
  input: DiscussionFollowUpInput,
  options: DiscussionFollowUpOptions = {},
): Promise<DiscussionFollowUpResult> {
  return withDiscussionSessionLock(input.sessionId, () => (
    runDiscussionFollowUpWithinLock(db, input, options)
  ))
}

export type DiscussionFollowUpProvider = AIProvider
