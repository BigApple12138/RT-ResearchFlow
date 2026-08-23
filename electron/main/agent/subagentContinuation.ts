/**
 * SubAgent（深度研究）终态 → 主 Agent continuation 幂等闸门。
 * key = sessionId + runId + stepId；同一终态只触发一次 continuation。
 */

export type SubagentTerminalStatus = 'succeeded' | 'failed' | 'cancelled'

export type SubagentContinuationKey = {
  sessionId: number
  runId: string
  stepId: string
}

export type SubagentContinuationRecord = SubagentContinuationKey & {
  status: SubagentTerminalStatus
  at: number
}

export type SubagentContinuationNotifyResult =
  | { accepted: true; first: true }
  | { accepted: false; reason: 'duplicate' | 'unknown_pending' }

type Pending = SubagentContinuationKey & {
  onTerminal: (status: SubagentTerminalStatus) => void | Promise<void>
}

const pending = new Map<string, Pending>()
const completed = new Map<string, SubagentContinuationRecord>()

function keyOf(input: SubagentContinuationKey): string {
  return `${input.sessionId}::${input.runId}::${input.stepId}`
}

export function registerSubagentContinuation(
  input: SubagentContinuationKey & {
    onTerminal: (status: SubagentTerminalStatus) => void | Promise<void>
  },
): void {
  const key = keyOf(input)
  if (completed.has(key)) {
    // 已终态：不重复注册，也不重放
    return
  }
  pending.set(key, {
    sessionId: input.sessionId,
    runId: input.runId,
    stepId: input.stepId,
    onTerminal: input.onTerminal,
  })
}

export async function notifySubagentTerminal(
  input: SubagentContinuationKey & { status: SubagentTerminalStatus; at?: number },
): Promise<SubagentContinuationNotifyResult> {
  const key = keyOf(input)
  if (completed.has(key)) {
    return { accepted: false, reason: 'duplicate' }
  }
  const entry = pending.get(key)
  if (!entry) {
    return { accepted: false, reason: 'unknown_pending' }
  }
  pending.delete(key)
  completed.set(key, {
    sessionId: input.sessionId,
    runId: input.runId,
    stepId: input.stepId,
    status: input.status,
    at: input.at ?? Date.now(),
  })
  await entry.onTerminal(input.status)
  return { accepted: true, first: true }
}

/** 查询是否已处理过该终态（防重复启动/continuation）。 */
export function hasSubagentContinuationCompleted(input: SubagentContinuationKey): boolean {
  return completed.has(keyOf(input))
}

export function isSubagentContinuationPending(input: SubagentContinuationKey): boolean {
  return pending.has(keyOf(input))
}

/** 单测用。 */
export function resetSubagentContinuationForTests(): void {
  pending.clear()
  completed.clear()
}
