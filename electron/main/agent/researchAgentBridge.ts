/**
 * 深度研究 progress/delta → Agent 事件总线（Task 5 hook；Task 6 接到 ai:agentEvent）。
 */

export type ResearchAgentBridgeProgress = {
  runId: string
  sessionId?: number
  agentRequestId?: string
  phase?: string
  message?: string
  status?: string
  [key: string]: unknown
}

export type ResearchAgentBridgeDelta = {
  runId: string
  sessionId?: number
  agentRequestId?: string
  phase?: string
  type?: string
  accumulated?: string
  [key: string]: unknown
}

export type ResearchAgentBridgeKind = 'progress' | 'delta'

export type ResearchAgentBridgeListener = (
  kind: ResearchAgentBridgeKind,
  event: ResearchAgentBridgeProgress | ResearchAgentBridgeDelta,
) => void

const listeners = new Set<ResearchAgentBridgeListener>()

export function subscribeResearchAgentBridge(listener: ResearchAgentBridgeListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function notifyResearchAgentBridge(
  kind: ResearchAgentBridgeKind,
  event: ResearchAgentBridgeProgress | ResearchAgentBridgeDelta,
): void {
  for (const listener of listeners) {
    try {
      listener(kind, event)
    } catch (error) {
      console.warn(
        '[agent:researchBridge]',
        error instanceof Error ? error.message : String(error),
      )
    }
  }
}

/** 单测用：清空订阅。 */
export function resetResearchAgentBridgeForTests(): void {
  listeners.clear()
}
