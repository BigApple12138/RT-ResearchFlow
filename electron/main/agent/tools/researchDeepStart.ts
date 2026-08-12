/**
 * research.deep_start — 包装既有 researchAgent startRun，作异步 SubAgent。
 * sideEffect: network（须过「允许 Agent 联网」闸门）；禁止再弹预检窗。
 */

import type { AgentSessionContext, ToolDefinition } from '../types'
import {
  notifyResearchAgentBridge,
  type ResearchAgentBridgeDelta,
  type ResearchAgentBridgeProgress,
} from '../researchAgentBridge'

export const RESEARCH_DEEP_START_TOOL_NAME = 'research.deep_start'

/** 与 RESEARCH_AGENT_STANDARD_BUDGET.id 对齐；避免 Tool 层硬依赖预算对象。 */
export const RESEARCH_DEEP_START_BUDGET_VERSION = 'single-agent-unrestricted-v3'

export type ResearchDeepStartSubject =
  | { kind: 'stock'; tsCode: string; label?: string | null }
  | { kind: 'industry_project'; id: string; label?: string | null }

export interface ResearchDeepStartContextPackage {
  schemaVersion: 1
  sessionId: number
  title: string
  userGoal: string
  asOf: string
  recentMessages: Array<{ role: 'user' | 'assistant'; content: string }>
  candidateSubjects: ResearchDeepStartSubject[]
  /** 明确声明：由 Agent 上下文包启动，不经预检窗 */
  skipPreflightUi: true
  /**
   * 对照 OpenClaw subagent `isolated` / `fork`。
   * isolated（默认）：装配快照，不共享父会话可变 messages 引用。
   * fork：显式要求时注入更长热对话快照（仍为拷贝）。
   */
  contextMode: 'isolated' | 'fork'
}

export interface ResearchDeepStartArgs {
  question?: string
  includePortfolio?: boolean
  subjects?: ResearchDeepStartSubject[]
  /** 默认 isolated；仅显式 fork 时携带更长热尾快照 */
  contextMode?: 'isolated' | 'fork'
  [key: string]: unknown
}

export interface ResearchDeepStartResult {
  status: 'waiting' | 'failed'
  runId?: string
  waitSubagent?: { runId: string }
  summary: string
  contextPackage?: ResearchDeepStartContextPackage
  remainingGaps?: string[]
  replayed?: boolean
  errorCode?: string
}

export interface ResearchDeepStartMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface BuildResearchDeepStartContextInput {
  session: AgentSessionContext
  messages: ResearchDeepStartMessage[]
  title?: string | null
  /** 会话关联产业项目（若有则优先作为主体） */
  projectSubject?: Extract<ResearchDeepStartSubject, { kind: 'industry_project' }> | null
  /** 额外语料（如 args.question）参与标的提取 */
  extraTexts?: string[]
  maxMessages?: number
  maxMessageChars?: number
  contextMode?: 'isolated' | 'fork'
}

export interface ResearchDeepStartDeps {
  startRun: (input: {
    requestId: string
    sessionId: number
    question: string
    subjects: ResearchDeepStartSubject[]
    includePortfolio: boolean
    confirmedBudgetVersion: string
    parentRunId?: string | null
    contextPackage: ResearchDeepStartContextPackage
  }) => Promise<{ runId: string; replayed?: boolean }>
  loadMessages: (sessionId: number) => ResearchDeepStartMessage[]
  loadTitle?: (sessionId: number) => string | null
  loadProjectSubject?: (
    sessionId: number,
  ) => Extract<ResearchDeepStartSubject, { kind: 'industry_project' }> | null
  /**
   * progress/delta 桥接 hook（Task 6 接到 ai:agentEvent）。
   * 默认写入 researchAgentBridge 总线。
   */
  onProgress?: (event: ResearchAgentBridgeProgress) => void
  onDelta?: (event: ResearchAgentBridgeDelta) => void
  newRequestId?: () => string
}

const TS_CODE_IN_TEXT = /(?<!\d)(\d{6})(?:\.(SH|SZ|BJ))?/gi

/** 从文本提取 A 股 tsCode（与 renderer researchAgentIntent 语义对齐，主进程自包含）。 */
export function extractTsCodesFromText(text: string, limit = 5): Array<{ kind: 'stock'; tsCode: string; label: null }> {
  const subjects: Array<{ kind: 'stock'; tsCode: string; label: null }> = []
  const seen = new Set<string>()
  for (const match of text.matchAll(TS_CODE_IN_TEXT)) {
    const code = match[1]!
    const explicit = match[2]?.toUpperCase()
    const market =
      explicit || (/^(4|8|92)/.test(code) ? 'BJ' : /^(5|6|9)/.test(code) ? 'SH' : 'SZ')
    if (explicit && explicit !== market) continue
    const tsCode = `${code}.${market}`
    if (seen.has(tsCode)) continue
    seen.add(tsCode)
    subjects.push({ kind: 'stock', tsCode, label: null })
    if (subjects.length >= limit) break
  }
  return subjects
}

function clampQuestion(raw: string): string {
  const trimmed = raw.trim()
  if (trimmed.length >= 10) return trimmed.slice(0, 4000)
  const expanded = `对相关标的做深度研究：${trimmed || '综合研判'}。结合本地行情、基本面与受信证据，给出可验证结论与缺口。`
  return expanded.slice(0, 4000)
}

/**
 * 从 SessionContext + 会话消息构建深挖上下文包（禁止弹预检窗）。
 * recentMessages 恒为新对象快照，不保留调用方数组元素引用。
 */
export function buildResearchDeepStartContext(
  input: BuildResearchDeepStartContextInput,
): ResearchDeepStartContextPackage {
  const contextMode = input.contextMode === 'fork' ? 'fork' : 'isolated'
  const maxMessages = input.maxMessages ?? (contextMode === 'fork' ? 40 : 12)
  const maxChars = input.maxMessageChars ?? (contextMode === 'isolated' ? 800 : 1200)
  const recentMessages = input.messages
    .slice(-maxMessages)
    .map((m) => ({
      role: m.role,
      content: String(m.content).slice(0, maxChars),
    }))

  const corpus = [
    input.session.userGoal,
    ...(input.extraTexts ?? []),
    ...recentMessages.map((m) => m.content),
  ].join('\n')

  const fromText = extractTsCodesFromText(corpus)
  const candidateSubjects: ResearchDeepStartSubject[] = input.projectSubject
    ? [input.projectSubject]
    : fromText

  const title =
    (input.title?.trim() || '').slice(0, 120) ||
    input.session.userGoal.slice(0, 40) ||
    `会话 #${input.session.sessionId}`

  return {
    schemaVersion: 1,
    sessionId: input.session.sessionId,
    title,
    userGoal: input.session.userGoal,
    asOf: input.session.asOf,
    recentMessages,
    candidateSubjects,
    skipPreflightUi: true,
    contextMode,
  }
}

export function createResearchDeepStartTool(
  deps: ResearchDeepStartDeps,
): ToolDefinition<ResearchDeepStartArgs> {
  return {
    name: RESEARCH_DEEP_START_TOOL_NAME,
    description:
      '启动会话内深度研究 SubAgent（包装 researchAgent startRun）。从当前会话上下文自动构建研究包，不弹预检窗；需开启「允许 Agent 联网」。返回 waitSubagent/runId 供编排器等待。',
    sideEffect: 'network',
    parametersSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        question: {
          type: 'string',
          description: '研究问题；省略则用本轮用户目标',
        },
        includePortfolio: {
          type: 'boolean',
          description: '是否纳入持仓上下文，默认 false',
        },
        subjects: {
          type: 'array',
          description: '可选显式主体；省略则从会话消息提取',
          items: { type: 'object' },
        },
        contextMode: {
          type: 'string',
          description: 'isolated（默认）= 装配快照；fork = 更长热对话快照',
          enum: ['isolated', 'fork'],
        },
      },
    },
    async execute(ctx: AgentSessionContext, args: ResearchDeepStartArgs): Promise<ResearchDeepStartResult> {
      const contextMode = args?.contextMode === 'fork' ? 'fork' : 'isolated'
      const messages = deps.loadMessages(ctx.sessionId)
      const title = deps.loadTitle?.(ctx.sessionId) ?? null
      const projectSubject = deps.loadProjectSubject?.(ctx.sessionId) ?? null
      const questionSeed = (args?.question?.trim() || ctx.userGoal).trim()

      const contextPackage = buildResearchDeepStartContext({
        session: ctx,
        messages,
        title,
        projectSubject,
        extraTexts: [questionSeed],
        contextMode,
      })

      const subjectsFromArgs = Array.isArray(args?.subjects) ? args.subjects : []
      const subjects =
        subjectsFromArgs.length > 0
          ? subjectsFromArgs.slice(0, 5)
          : contextPackage.candidateSubjects.slice(0, 5)

      if (subjects.length === 0) {
        return {
          status: 'failed',
          summary: '无法启动深度研究：会话中未识别到可研究的 A 股代码或产业项目。',
          contextPackage,
          remainingGaps: ['缺少研究主体（股票代码或产业项目）'],
          errorCode: 'NO_SUBJECT',
        }
      }

      const question = clampQuestion(questionSeed)
      const requestId = deps.newRequestId?.() ?? defaultUuid()

      try {
        const started = await deps.startRun({
          requestId,
          sessionId: ctx.sessionId,
          question,
          subjects,
          includePortfolio: args?.includePortfolio === true,
          confirmedBudgetVersion: RESEARCH_DEEP_START_BUDGET_VERSION,
          parentRunId: null,
          contextPackage,
        })

        const runId = started.runId
        // 注册桥接：后续 progress/delta 可由 Task 6 投影为 ai:agentEvent
        const onProgress =
          deps.onProgress ??
          ((event: ResearchAgentBridgeProgress) => notifyResearchAgentBridge('progress', event))
        const onDelta =
          deps.onDelta ??
          ((event: ResearchAgentBridgeDelta) => notifyResearchAgentBridge('delta', event))
        // 启动瞬间发一条 status 桥接，便于时间线立刻可见
        onProgress({
          runId,
          sessionId: ctx.sessionId,
          agentRequestId: ctx.requestId,
          phase: 'planning',
          message: started.replayed ? '深度研究已幂等复用既有运行' : '深度研究已启动',
          status: 'queued',
        })
        void onDelta

        return {
          status: 'waiting',
          runId,
          waitSubagent: { runId },
          summary: started.replayed
            ? `深度研究运行已存在（幂等）：${runId}`
            : `深度研究已启动，等待 SubAgent 完成：${runId}`,
          contextPackage,
          remainingGaps: ['等待深度研究报告'],
          replayed: started.replayed === true,
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return {
          status: 'failed',
          summary: `深度研究启动失败：${message}`,
          contextPackage,
          remainingGaps: ['深度研究未能启动'],
          errorCode: 'START_FAILED',
        }
      }
    },
  }
}

function defaultUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}
