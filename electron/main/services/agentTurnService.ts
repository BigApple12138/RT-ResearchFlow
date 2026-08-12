/**
 * Agent Turn 服务：复用 discussion session 串行锁；推理走 callWithFallback。
 */

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
import { callWithFallback } from './aiFallbackService'
import { buildDiscussionModelMessages } from './researchDiscussionContextService'
import { withDiscussionSessionLock } from './discussionSessionLock'
import { isDiscussionSessionBusy } from './researchAgentRunManager'
import { getAiAgentNetworkEnabled } from '../database/settingsRepository'
import { getResearchDiscussionContext } from '../database/researchDiscussionRepository'
import { prepareDiscussionTurnContext } from './researchContextEngine'
import {
  emitAgentEvent,
  getAgentHitlGate,
  getAgentToolRegistry,
} from '../agent/agentRuntime'
import {
  runAgentTurn,
  type ReasoningCall,
  type RunAgentTurnResult,
} from '../agent/orchestrator'
import { buildDefaultAgentSystemPrompt } from '../agent/skillPrompt'
import type { AgentEvent } from '../agent/types'
import { registerMcpProjectedTools } from '../agent/tools/mcpProjection'
import { registerSubagentContinuation, notifySubagentTerminal } from '../agent/subagentContinuation'
import {
  subscribeResearchAgentBridge,
  type ResearchAgentBridgeDelta,
  type ResearchAgentBridgeProgress,
} from '../agent/researchAgentBridge'
import { getResearchAgentRun } from '../database/researchAgentRunRepository'

export interface AgentTurnInput {
  requestId: string
  sessionId: number
  message: string
}

export interface AgentTurnResult {
  text?: string
  messages?: NormalizedConversationMessage[]
  terminal?: 'done' | 'error' | 'cancelled'
  waitingSubagent?: { runId: string }
  error?: string
  code?: string
}

export interface AgentTurnOptions {
  onEvent?: (event: AgentEvent) => void
  reasoningCall?: ReasoningCall
  isBusy?: (db: Database.Database, sessionId: number) => boolean
  getNetworkEnabled?: () => boolean
  maxSteps?: number
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

function errorResult(code: string, error: string, messages: NormalizedConversationMessage[] = []): AgentTurnResult {
  return { error, code, messages }
}

function buildDefaultReasoningCall(db: Database.Database): ReasoningCall {
  return async (input) => {
    const registry = getAgentToolRegistry(() => db)
    const fromOrchestrator = input.messages.find((m) => m.role === 'system')?.content
    const system =
      fromOrchestrator?.trim() ||
      buildDefaultAgentSystemPrompt(registry.listForPrompt(), [
        `当前目标：${input.goal.goal}`,
        input.plan.steps.length > 0
          ? `计划 revision=${input.plan.revision}：${input.plan.steps.map((s) => s.title).join(' → ')}`
          : '当前为轻量回合（可为 0-step）。',
      ])

    // conversationMessages 已在 TurnService 单次装配；此处禁止再走 buildDiscussionAIRequest。
    const chatMessages: ConversationMessage[] = [
      { role: 'user', content: system },
      ...input.messages
        .filter((m) => m.role === 'user' || m.role === 'assistant' || m.role === 'tool')
        .map((m) => ({
          role: (m.role === 'tool' ? 'assistant' : m.role) as 'user' | 'assistant',
          content: m.role === 'tool' ? `【tool_result】${m.content}` : m.content,
        })),
    ]

    const result = await callWithFallback(db, {
      messages: chatMessages,
      webSearch: undefined,
    })
    return result.text
  }
}

function mapBridgeProgressToAgentEvent(
  requestId: string,
  sessionId: number,
  event: ResearchAgentBridgeProgress,
): AgentEvent {
  return {
    type: 'status',
    requestId: event.agentRequestId || requestId,
    sessionId: event.sessionId ?? sessionId,
    at: Date.now(),
    payload: {
      source: 'researchAgent.progress',
      runId: event.runId,
      phase: event.phase,
      message: event.message,
      status: event.status,
    },
  }
}

function mapBridgeDeltaToAgentEvent(
  requestId: string,
  sessionId: number,
  event: ResearchAgentBridgeDelta,
): AgentEvent {
  return {
    type: 'tool_result',
    requestId: event.agentRequestId || requestId,
    sessionId: event.sessionId ?? sessionId,
    at: Date.now(),
    payload: {
      source: 'researchAgent.delta',
      name: 'research.deep_start',
      runId: event.runId,
      phase: event.phase,
      deltaType: event.type,
      accumulated: typeof event.accumulated === 'string' ? event.accumulated.slice(0, 2000) : undefined,
      summary:
        event.type === 'done'
          ? '深度研究写作流结束'
          : typeof event.accumulated === 'string'
            ? `深度研究写作中（${event.accumulated.length} 字）`
            : '深度研究增量',
    },
  }
}

async function runAgentTurnWithinLock(
  db: Database.Database,
  input: AgentTurnInput,
  options: AgentTurnOptions,
): Promise<AgentTurnResult> {
  const session = getSession(db, input.sessionId)
  if (!session) return errorResult('NOT_FOUND', 'Session not found')

  const rawMessage = input.message.trim()
  if (!rawMessage) return errorResult('INVALID_PARAM', '消息不能为空')

  const existing = getDiscussionTurnRequest(db, input.requestId)
  if (existing) {
    if (existing.session_id !== input.sessionId || existing.user_message !== rawMessage) {
      return errorResult('REQUEST_ID_CONFLICT', 'requestId 已用于不同的输入', getSessionMessages(db, input.sessionId))
    }
    if (existing.status === 'succeeded') {
      return {
        text: existing.response_text ?? '',
        messages: getSessionMessages(db, input.sessionId),
        terminal: 'done',
      }
    }
    if (existing.status === 'running') {
      return errorResult('REQUEST_IN_PROGRESS', '该请求正在处理中', getSessionMessages(db, input.sessionId))
    }
    return errorResult(
      'REQUEST_FAILED',
      existing.error_message ?? '该请求已失败，请重新发送',
      getSessionMessages(db, input.sessionId),
    )
  }

  const busy = options.isBusy ?? isDiscussionSessionBusy
  if (busy(db, input.sessionId)) {
    return errorResult(
      'SESSION_BUSY',
      '当前会话有深度研究进行中，请等待完成或取消后再发送。',
      getSessionMessages(db, input.sessionId),
    )
  }

  insertDiscussionTurnRequest(db, {
    requestId: input.requestId,
    sessionId: input.sessionId,
    userMessage: rawMessage,
  })

  let messages = getSessionMessages(db, input.sessionId)
  if (messages.length === 0) {
    const context =
      (session.response ?? '') +
      (session.responseRound2 ? `\n\n【第二轮深度分析】\n${session.responseRound2}` : '')
    if (context.trim()) messages = [{ role: 'assistant', content: context, sequence: 1 }]
  }

  const userMessage: ConversationMessage = {
    role: 'user',
    content: injectTimePrefix(rawMessage),
    requestId: input.requestId,
  }
  // soft + hard compact（ResearchContextEngine）；随后只装配一次，禁止双重拼接。
  const prepared = await prepareDiscussionTurnContext(db, {
    sessionId: input.sessionId,
    requestId: input.requestId,
    hotMessages: messages,
    userMessage,
  })
  if (prepared.warning) {
    console.warn(`[ai:agentTurn] ${prepared.warning}`)
  }
  messages = prepared.hotMessages
  const requestMessages: ConversationMessage[] = [...messages, userMessage]
  const conversationMessages = buildDiscussionModelMessages(db, input.sessionId, requestMessages)
    .filter((m): m is ConversationMessage & { role: 'user' | 'assistant' } => (
      m.role === 'user' || m.role === 'assistant'
    ))
    .map((m) => ({ role: m.role, content: m.content }))

  // 有 onEvent（IPC 已订阅/直推）时不再走全局 emit，避免时间线每条事件翻倍。
  const pushEvent = (event: AgentEvent) => {
    if (options.onEvent) options.onEvent(event)
    else emitAgentEvent(event)
  }

  // 桥接保留到 wait_subagent 之后：本轮若启动深挖，progress/delta 继续扇出
  let keepBridge = false
  const unsubscribeBridge = subscribeResearchAgentBridge((kind, event) => {
    if (kind === 'progress') {
      const progress = event as ResearchAgentBridgeProgress
      pushEvent(mapBridgeProgressToAgentEvent(input.requestId, input.sessionId, progress))
      const status = String(progress.status ?? '')
      if (status === 'succeeded' || status === 'failed' || status === 'cancelled') {
        const runId = String(progress.runId ?? '')
        if (runId) {
          void notifySubagentTerminal({
            sessionId: input.sessionId,
            runId,
            stepId: `deep:${runId}`,
            status: status as 'succeeded' | 'failed' | 'cancelled',
          })
        }
      }
      return
    }
    pushEvent(mapBridgeDeltaToAgentEvent(input.requestId, input.sessionId, event as ResearchAgentBridgeDelta))
  })

  try {
    const registry = getAgentToolRegistry(() => db)
    // 每轮刷新：仅 enabled 外部 MCP 投影进 Registry（disabled 不注册）
    try {
      await registerMcpProjectedTools(registry, { getDb: () => db })
    } catch (mcpErr) {
      console.warn(
        '[agent:mcp-projection]',
        mcpErr instanceof Error ? mcpErr.message : String(mcpErr),
      )
    }
    const reasoningCall = options.reasoningCall ?? buildDefaultReasoningCall(db)
    const result: RunAgentTurnResult = await runAgentTurn({
      sessionId: input.sessionId,
      userMessage: rawMessage,
      requestId: input.requestId,
      conversationMessages,
      registry,
      reasoningCall,
      onEvent: pushEvent,
      hitlGate: getAgentHitlGate(),
      getNetworkEnabled: options.getNetworkEnabled ?? (() => getAiAgentNetworkEnabled()),
      maxSteps: options.maxSteps,
    })

    if (result.waitingSubagent?.runId) {
      keepBridge = true
      const runId = result.waitingSubagent.runId
      const stepId = `deep:${runId}`
      registerSubagentContinuation({
        sessionId: input.sessionId,
        runId,
        stepId,
        onTerminal: async (status) => {
          const run = getResearchAgentRun(db, runId)
          const summary =
            status === 'succeeded'
              ? `深度研究已完成（runId=${runId}）。请基于既有报告继续对话或打开研究面板查看全文。`
              : `深度研究已结束：${status}${run?.error_message ? `（${run.error_message}）` : ''}`
          pushEvent({
            type: 'status',
            requestId: input.requestId,
            sessionId: input.sessionId,
            at: Date.now(),
            payload: {
              decision: 'subagent_terminal',
              runId,
              status,
              summary,
            },
          })
        },
      })
    }

    const assistantText =
      result.text?.trim() ||
      (result.waitingSubagent
        ? `已启动深度研究（runId=${result.waitingSubagent.runId}），完成后可在时间线与研究面板查看进度。`
        : result.terminal === 'cancelled'
          ? '本轮已取消。'
          : result.errorMessage || '本轮已结束。')

    if (result.terminal === 'error') {
      failDiscussionTurnRequest(db, input.requestId, result.errorMessage || assistantText)
      pushEvent({
        type: 'error',
        requestId: input.requestId,
        sessionId: input.sessionId,
        at: Date.now(),
        payload: { message: result.errorMessage || assistantText },
      })
      return errorResult('AGENT_ERROR', result.errorMessage || assistantText, getSessionMessages(db, input.sessionId))
    }

    const assistant: ConversationMessage = {
      role: 'assistant',
      content: assistantText,
      requestId: input.requestId,
    }
    const persistedMessages = [...requestMessages, assistant]
    const commit = db.transaction(() => {
      updateSessionMessages(db, input.sessionId, persistedMessages)
      completeDiscussionTurnRequest(db, input.requestId, assistantText)
    })
    commit()

    return {
      text: assistantText,
      messages: getSessionMessages(db, input.sessionId),
      terminal: result.terminal,
      waitingSubagent: result.waitingSubagent,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    failDiscussionTurnRequest(db, input.requestId, message)
    pushEvent({
      type: 'error',
      requestId: input.requestId,
      sessionId: input.sessionId,
      at: Date.now(),
      payload: { message },
    })
    return errorResult('AI_CALL_FAILED', message, getSessionMessages(db, input.sessionId))
  } finally {
    if (!keepBridge) unsubscribeBridge()
  }
}

export async function runAgentTurnForSession(
  db: Database.Database,
  input: AgentTurnInput,
  options: AgentTurnOptions = {},
): Promise<AgentTurnResult> {
  // 确保研究会话存在时才有 deep_start 受信上下文；无 discussion 仍允许本地 Tool + final
  void getResearchDiscussionContext(db, input.sessionId)
  return withDiscussionSessionLock(input.sessionId, () => runAgentTurnWithinLock(db, input, options))
}
