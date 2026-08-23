import type { AgentSessionContext } from './types'

export type BuildSessionContextInput = {
  sessionId: number
  userGoal: string
  requestId?: string
  asOf?: string
  factsFingerprint?: string | null
}

function defaultAsOf(now = new Date()): string {
  return now.toISOString().slice(0, 10).replace(/-/g, '')
}

function defaultRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

/**
 * 构建本轮 Agent SessionContext（主进程内存契约）。
 * auth / 密钥不得经此对象落库或回传 Renderer。
 */
export function buildSessionContext(input: BuildSessionContextInput): AgentSessionContext {
  const sessionId = input.sessionId
  if (!Number.isFinite(sessionId) || sessionId <= 0) {
    throw new Error('sessionId 必须为正整数')
  }
  const userGoal = input.userGoal?.trim()
  if (!userGoal) {
    throw new Error('userGoal 不能为空')
  }

  return {
    sessionId,
    userGoal,
    requestId: input.requestId?.trim() || defaultRequestId(),
    asOf: input.asOf?.trim() || defaultAsOf(),
    factsFingerprint: input.factsFingerprint ?? null,
  }
}
