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
  cancelDiscussionTurnRequest,
  getDiscussionTurnRequest,
  insertDiscussionTurnRequest,
} from '../database/discussionTurnRequestRepository'
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
import { type CompactionAICaller } from './discussionContextCompactionService'
import { prepareDiscussionTurnContext, afterDiscussionTurnCompact } from './researchContextEngine'
import { withDiscussionSessionLock } from './discussionSessionLock'
import { isDiscussionSessionBusy } from './researchAgentRunManager'
import { getResearchDiscussionContext } from '../database/researchDiscussionRepository'

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
  signal?: AbortSignal
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
  | { type: 'stop'; requestId: string; sessionId: number }

export interface DiscussionFollowUpOptions {
  callAI?: DiscussionFollowUpAICaller
  compactAI?: CompactionAICaller
  isBusy?: (db: Database.Database, sessionId: number) => boolean
  onSuccess?: (db: Database.Database, sessionId: number) => void | Promise<void>
  onDelta?: (event: DiscussionFollowUpDeltaEvent) => void
  signal?: AbortSignal
}

export interface DiscussionFollowUpResult {
  text?: string
  messages?: NormalizedConversationMessage[]
  error?: string
  code?: string
  warning?: string
  cancelled?: boolean
  ok?: boolean
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
    signal: input.signal,
  })
}

function normalizeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isAbortError(error: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true
  if (!(error instanceof Error)) return false
  if (error.name === 'AbortError') return true
  return /abort|user[_ ]?cancel|已停止/i.test(error.message)
}

function errorResult(code: string, error: string, messages: NormalizedConversationMessage[] = []): DiscussionFollowUpResult {
  return { error, code, messages, ok: false }
}

const STOPPED_SUFFIX = '\n\n（已停止）'

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
    if (existing.status === 'cancelled') {
      return {
        ok: true,
        cancelled: true,
        text: existing.response_text ?? undefined,
        messages: getSessionMessages(db, input.sessionId),
        code: 'CANCELLED',
      }
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
  const prepared = await prepareDiscussionTurnContext(db, {
    sessionId: input.sessionId,
    requestId: input.requestId,
    hotMessages: messages,
    userMessage,
    compactAI: options.compactAI,
  })
  const warning = prepared.warning
  if (warning) console.warn(`[ai:followUp] ${warning}`)
  messages = prepared.hotMessages
  const requestMessages: ConversationMessage[] = [...messages, userMessage]
  let lastAccumulated = ''

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
      signal: options.signal,
      onDelta: streaming
        ? (accumulated) => {
            lastAccumulated = accumulated
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
              lastAccumulated = ''
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
    try {
      const after = await afterDiscussionTurnCompact(db, {
        sessionId: input.sessionId,
        requestId: input.requestId,
        compactAI: options.compactAI,
      })
      if (after.warning) {
        console.warn(`[ai:followUp] afterTurn compact: ${after.warning}`)
      }
    } catch (error) {
      console.warn(
        '[ai:followUp] afterTurn compact failed:',
        error instanceof Error ? error.message : String(error),
      )
    }
    return {
      ok: true,
      text: persistedText,
      messages: getSessionMessages(db, input.sessionId),
      ...(warning ? { warning } : {}),
    }
  } catch (error) {
    if (isAbortError(error, options.signal)) {
      const partial = lastAccumulated.trim()
      if (partial) {
        const stoppedText = partial.endsWith('（已停止）') ? partial : `${partial}${STOPPED_SUFFIX}`
        const assistant: ConversationMessage = {
          role: 'assistant',
          content: stoppedText,
          requestId: input.requestId,
        }
        const persistedMessages = [...requestMessages, assistant]
        const commit = db.transaction(() => {
          updateSessionMessages(db, input.sessionId, persistedMessages)
          cancelDiscussionTurnRequest(db, input.requestId, stoppedText)
        })
        commit()
        options.onDelta?.({
          type: 'stop',
          requestId: input.requestId,
          sessionId: input.sessionId,
        })
        return {
          ok: true,
          cancelled: true,
          text: stoppedText,
          messages: getSessionMessages(db, input.sessionId),
          ...(warning ? { warning } : {}),
        }
      }
      cancelDiscussionTurnRequest(db, input.requestId, null)
      options.onDelta?.({
        type: 'stop',
        requestId: input.requestId,
        sessionId: input.sessionId,
      })
      return errorResult('CANCELLED', '已停止生成', getSessionMessages(db, input.sessionId))
    }
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
