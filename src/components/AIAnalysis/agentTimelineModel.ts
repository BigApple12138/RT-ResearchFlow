/**
 * Agent 事件 → UI 时间线条目（纯函数投影，不持凭据/DB）。
 */

export type AgentTimelineEventType =
  | 'start'
  | 'plan'
  | 'status'
  | 'tool_call'
  | 'tool_result'
  | 'message'
  | 'hitl'
  | 'done'
  | 'error'
  | 'cancelled'

export interface AgentTimelineEvent {
  type: AgentTimelineEventType | string
  requestId: string
  sessionId: number
  at: number
  payload?: Record<string, unknown>
}

export type AgentTimelineStepKind = 'plan' | 'status' | 'tool' | 'message' | 'hitl' | 'terminal'

export interface AgentTimelineStep {
  id: string
  kind: AgentTimelineStepKind
  title: string
  detail?: string
  collapsedByDefault: boolean
  tone: 'neutral' | 'info' | 'warning' | 'danger' | 'success'
  /** HITL 确认条 */
  hitl?: {
    hitlRequestId: string
    toolName: string
    summary: string
  }
  /** 联网关闭提示 */
  networkHint?: string
  rawType: string
  at: number
}

export interface AgentTimelineModel {
  requestId: string
  steps: AgentTimelineStep[]
  pendingHitl: AgentTimelineStep | null
  streamingMessage: string
  terminal: 'done' | 'error' | 'cancelled' | null
  networkDisabledHint: string | null
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function summarizePlan(payload?: Record<string, unknown>): { title: string; detail?: string } {
  const revision = payload?.revision
  const steps = Array.isArray(payload?.steps) ? payload!.steps : []
  const titles = steps
    .map((s) => (s && typeof s === 'object' ? asString((s as Record<string, unknown>).title) : ''))
    .filter(Boolean)
  return {
    title: `计划${typeof revision === 'number' ? ` r${revision}` : ''}${titles.length ? ` · ${titles.length} 步` : ''}`,
    detail: titles.length ? titles.join(' → ') : undefined,
  }
}

function summarizeToolCall(payload?: Record<string, unknown>): { title: string; detail?: string } {
  const name = asString(payload?.name, 'tool')
  let argsText = ''
  try {
    if (payload?.args != null) argsText = JSON.stringify(payload.args).slice(0, 160)
  } catch {
    argsText = ''
  }
  return {
    title: `调用 ${name}`,
    detail: argsText || undefined,
  }
}

function summarizeToolResult(payload?: Record<string, unknown>): { title: string; detail?: string; networkHint?: string } {
  const name = asString(payload?.name, 'tool')
  const summary = asString(payload?.summary || payload?.message)
  const ok = payload?.ok !== false
  const networkHint =
    /联网未授权|允许 Agent 联网|NETWORK_DISABLED/i.test(summary)
      ? '联网未开启：请到设置中打开「允许 Agent 联网」后再试。'
      : undefined
  return {
    title: ok ? `${name} 结果` : `${name} 失败`,
    detail: summary || undefined,
    networkHint,
  }
}

/**
 * 将单条 agentEvent 投影为时间线 step；未知类型忽略。
 */
export function projectAgentEventToStep(event: AgentTimelineEvent, index: number): AgentTimelineStep | null {
  const id = `${event.requestId}:${event.type}:${index}:${event.at}`
  const payload = event.payload

  switch (event.type) {
    case 'start':
      return {
        id,
        kind: 'status',
        title: 'Agent 回合开始',
        collapsedByDefault: true,
        tone: 'info',
        rawType: event.type,
        at: event.at,
      }
    case 'plan': {
      const s = summarizePlan(payload)
      return {
        id,
        kind: 'plan',
        title: s.title,
        detail: s.detail,
        collapsedByDefault: false,
        tone: 'info',
        rawType: event.type,
        at: event.at,
      }
    }
    case 'status': {
      const decision = asString(payload?.decision || payload?.message || payload?.summary, '状态更新')
      return {
        id,
        kind: 'status',
        title: decision,
        detail: asString(payload?.reason || payload?.message) || undefined,
        collapsedByDefault: true,
        tone: 'neutral',
        rawType: event.type,
        at: event.at,
      }
    }
    case 'tool_call': {
      const s = summarizeToolCall(payload)
      return {
        id,
        kind: 'tool',
        title: s.title,
        detail: s.detail,
        collapsedByDefault: true,
        tone: 'info',
        rawType: event.type,
        at: event.at,
      }
    }
    case 'tool_result': {
      const s = summarizeToolResult(payload)
      return {
        id,
        kind: 'tool',
        title: s.title,
        detail: s.detail,
        collapsedByDefault: true,
        tone: /失败|未授权/.test(s.title + (s.detail ?? '')) ? 'warning' : 'neutral',
        networkHint: s.networkHint,
        rawType: event.type,
        at: event.at,
      }
    }
    case 'message':
      return {
        id,
        kind: 'message',
        title: '助手回复',
        detail: asString(payload?.text || payload?.accumulated),
        collapsedByDefault: false,
        tone: 'neutral',
        rawType: event.type,
        at: event.at,
      }
    case 'hitl': {
      const hitlRequestId = asString(payload?.hitlRequestId || payload?.hitlId)
      const toolName = asString(payload?.toolName, 'write')
      const summary = asString(payload?.summary, `确认执行写操作：${toolName}`)
      return {
        id,
        kind: 'hitl',
        title: '需要确认',
        detail: summary,
        collapsedByDefault: false,
        tone: 'warning',
        hitl: hitlRequestId
          ? { hitlRequestId, toolName, summary }
          : undefined,
        rawType: event.type,
        at: event.at,
      }
    }
    case 'done':
      return {
        id,
        kind: 'terminal',
        title: '本轮完成',
        detail: asString(payload?.text) || undefined,
        collapsedByDefault: true,
        tone: 'success',
        rawType: event.type,
        at: event.at,
      }
    case 'error':
      return {
        id,
        kind: 'terminal',
        title: '本轮失败',
        detail: asString(payload?.message || payload?.text) || undefined,
        collapsedByDefault: false,
        tone: 'danger',
        rawType: event.type,
        at: event.at,
      }
    case 'cancelled':
      return {
        id,
        kind: 'terminal',
        title: '本轮已取消',
        collapsedByDefault: true,
        tone: 'warning',
        rawType: event.type,
        at: event.at,
      }
    default:
      return null
  }
}

/** 折叠事件流为 UI 模型（按 requestId 过滤可选）。 */
export function buildAgentTimelineModel(
  events: AgentTimelineEvent[],
  options: { requestId?: string } = {},
): AgentTimelineModel {
  const filtered = options.requestId
    ? events.filter((e) => e.requestId === options.requestId)
    : events
  const requestId = options.requestId || filtered[0]?.requestId || ''
  const steps: AgentTimelineStep[] = []
  let streamingMessage = ''
  let terminal: AgentTimelineModel['terminal'] = null
  let networkDisabledHint: string | null = null
  let pendingHitl: AgentTimelineStep | null = null

  filtered.forEach((event, index) => {
    const step = projectAgentEventToStep(event, index)
    if (!step) return
    steps.push(step)
    if (step.kind === 'message' && step.detail) streamingMessage = step.detail
    if (step.networkHint) networkDisabledHint = step.networkHint
    if (step.kind === 'hitl' && step.hitl) pendingHitl = step
    if (event.type === 'done') {
      terminal = 'done'
      pendingHitl = null
    }
    if (event.type === 'error') {
      terminal = 'error'
      pendingHitl = null
    }
    if (event.type === 'cancelled') {
      terminal = 'cancelled'
      pendingHitl = null
    }
  })

  return {
    requestId,
    steps,
    pendingHitl,
    streamingMessage,
    terminal,
    networkDisabledHint,
  }
}
