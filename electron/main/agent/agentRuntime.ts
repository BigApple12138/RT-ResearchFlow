/**
 * Agent 主进程运行时单例：ToolRegistry / HITL / 事件扇出。
 */

import type Database from 'better-sqlite3'
import { getDb } from '../database/db'
import { getSession, getSessionMessages } from '../database/aiAnalysisSessionRepository'
import { getResearchDiscussionContext } from '../database/researchDiscussionRepository'
import { createHitlGate, type HitlGate } from './hitlGate'
import { createToolRegistry, type ToolRegistry } from './toolRegistry'
import { registerBuiltinTools } from './registerBuiltinTools'
import {
  createResearchDeepStartTool,
  type ResearchDeepStartSubject,
} from './tools/researchDeepStart'
import type { AgentEvent } from './types'

let registry: ToolRegistry | null = null
let hitlGate: HitlGate | null = null
let startRunImpl:
  | ((input: {
      requestId: string
      sessionId: number
      question: string
      subjects: ResearchDeepStartSubject[]
      includePortfolio: boolean
      confirmedBudgetVersion: string
      parentRunId?: string | null
    }) => Promise<{ runId: string; replayed?: boolean }>)
  | null = null

const agentEventListeners = new Set<(event: AgentEvent) => void>()

export function subscribeAgentEvents(listener: (event: AgentEvent) => void): () => void {
  agentEventListeners.add(listener)
  return () => {
    agentEventListeners.delete(listener)
  }
}

export function emitAgentEvent(event: AgentEvent): void {
  for (const listener of agentEventListeners) {
    try {
      listener(event)
    } catch (error) {
      console.warn('[agent:event]', error instanceof Error ? error.message : String(error))
    }
  }
}

export function getAgentHitlGate(): HitlGate {
  if (!hitlGate) hitlGate = createHitlGate()
  return hitlGate
}

export function setResearchDeepStartRunner(
  runner: typeof startRunImpl,
): void {
  startRunImpl = runner
}

function defaultDeepStartRunner(input: {
  requestId: string
  sessionId: number
  question: string
  subjects: ResearchDeepStartSubject[]
  includePortfolio: boolean
  confirmedBudgetVersion: string
  parentRunId?: string | null
}): Promise<{ runId: string; replayed?: boolean }> {
  if (!startRunImpl) {
    return Promise.reject(new Error('research.deep_start 尚未绑定 ResearchAgentRunManager'))
  }
  return startRunImpl(input)
}

/**
 * 获取（并惰性初始化）全局 Agent ToolRegistry。
 */
export function getAgentToolRegistry(dbProvider: () => Database.Database = getDb): ToolRegistry {
  if (registry) return registry
  registry = createToolRegistry()
  registerBuiltinTools(registry, { getDb: dbProvider })
  registry.register(
    createResearchDeepStartTool({
      startRun: async (input) => defaultDeepStartRunner(input),
      loadMessages: (sessionId) => {
        const db = dbProvider()
        const hot = getSessionMessages(db, sessionId)
          .filter((m): m is typeof m & { role: 'user' | 'assistant' } => (
            m.role === 'user' || m.role === 'assistant'
          ))
          .map((m) => ({ role: m.role, content: m.content }))
        const session = getSession(db, sessionId)
        const prompt = session?.promptSent?.trim()
        if (!prompt) return hot
        // 硬事实进 deep_start 抽标的，避免仅「深度分析一下」时丢持仓代码。
        return [{ role: 'user' as const, content: prompt }, ...hot]
      },
      loadTitle: (sessionId) => {
        const db = dbProvider()
        const discussion = getResearchDiscussionContext(db, sessionId)
        if (discussion?.origin_title?.trim()) return discussion.origin_title.trim()
        const session = getSession(db, sessionId)
        const prompt = session?.promptSent?.trim()
        return prompt ? prompt.slice(0, 80) : null
      },
      loadProjectSubject: (sessionId) => {
        const db = dbProvider()
        const discussion = getResearchDiscussionContext(db, sessionId)
        if (!discussion?.project_id) return null
        return {
          kind: 'industry_project',
          id: discussion.project_id,
          label: discussion.origin_title ?? null,
        }
      },
    }),
  )
  return registry
}

/** 单测用：重置单例。 */
export function resetAgentRuntimeForTests(): void {
  registry = null
  hitlGate = null
  startRunImpl = null
  agentEventListeners.clear()
}
