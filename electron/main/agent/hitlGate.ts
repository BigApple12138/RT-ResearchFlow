import type { ToolDefinition } from './types'

export class AgentHitlGateError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'AgentHitlGateError'
    this.code = code
  }
}

export interface HitlRequestInput {
  toolName: string
  summary?: string
  /** 可选；未提供时由闸门生成 */
  requestId?: string
}

export interface HitlResolveResult {
  requestId: string
  approved: boolean
}

export interface HitlGate {
  /** read / network 直接允许；write 需消耗一次已批准的 one-shot 授权 */
  assertToolAllowed(def: Pick<ToolDefinition, 'name' | 'sideEffect'>): void
  /** 发起写操作确认；resolveHitl 后 Promise 结算 */
  requestHitl(input: HitlRequestInput): Promise<HitlResolveResult>
  resolveHitl(requestId: string, approved: boolean): void
  /**
   * 拒绝所有 requestId 以 `prefix` 开头的挂起 HITL（用于 Agent turn 停止，避免死等）。
   * 返回被拒绝的条数。
   */
  rejectPendingByPrefix(prefix: string): number
}

type PendingHitl = {
  toolName: string
  summary?: string
  settle: (result: HitlResolveResult) => void
}

function newHitlRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `hitl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

/**
 * 写操作 HITL 闸门：未确认拒绝；确认后允许该工具执行一次。
 */
export function createHitlGate(): HitlGate {
  const pending = new Map<string, PendingHitl>()
  /** toolName → 剩余可执行次数（确认一次 +1，assert 消耗一次） */
  const oneShotApprovals = new Map<string, number>()

  return {
    assertToolAllowed(def: Pick<ToolDefinition, 'name' | 'sideEffect'>): void {
      if (def.sideEffect === 'read' || def.sideEffect === 'network') {
        return
      }
      if (def.sideEffect !== 'write') {
        throw new AgentHitlGateError('INVALID_SIDE_EFFECT', `未知 sideEffect：${String(def.sideEffect)}`)
      }

      const remaining = oneShotApprovals.get(def.name) ?? 0
      if (remaining <= 0) {
        throw new AgentHitlGateError(
          'HITL_REQUIRED',
          `写操作需人工确认：工具「${def.name}」尚未确认或授权已用尽`,
        )
      }
      oneShotApprovals.set(def.name, remaining - 1)
    },

    requestHitl(input: HitlRequestInput): Promise<HitlResolveResult> {
      const toolName = input.toolName?.trim()
      if (!toolName) {
        return Promise.reject(new AgentHitlGateError('INVALID_HITL', 'toolName 不能为空'))
      }
      const requestId = input.requestId?.trim() || newHitlRequestId()
      if (pending.has(requestId)) {
        return Promise.reject(new AgentHitlGateError('DUPLICATE_HITL', `HITL 请求已存在：${requestId}`))
      }

      return new Promise<HitlResolveResult>((resolve) => {
        pending.set(requestId, {
          toolName,
          summary: input.summary,
          settle: resolve,
        })
      })
    },

    resolveHitl(requestId: string, approved: boolean): void {
      const id = requestId?.trim()
      const entry = id ? pending.get(id) : undefined
      if (!entry || !id) {
        throw new AgentHitlGateError('UNKNOWN_HITL', `未知 HITL 请求：${requestId}`)
      }
      pending.delete(id)
      if (approved) {
        oneShotApprovals.set(entry.toolName, (oneShotApprovals.get(entry.toolName) ?? 0) + 1)
      }
      entry.settle({ requestId: id, approved })
    },

    rejectPendingByPrefix(prefix: string): number {
      const p = prefix?.trim()
      if (!p) return 0
      let count = 0
      for (const [id, entry] of [...pending.entries()]) {
        if (!id.startsWith(p)) continue
        pending.delete(id)
        entry.settle({ requestId: id, approved: false })
        count += 1
      }
      return count
    },
  }
}

/** 模块级默认闸门（主进程单例场景）；单测请用 createHitlGate()。 */
const defaultGate = createHitlGate()

export function assertToolAllowed(def: Pick<ToolDefinition, 'name' | 'sideEffect'>): void {
  defaultGate.assertToolAllowed(def)
}

export function requestHitl(input: HitlRequestInput): Promise<HitlResolveResult> {
  return defaultGate.requestHitl(input)
}

export function resolveHitl(requestId: string, approved: boolean): void {
  defaultGate.resolveHitl(requestId, approved)
}
