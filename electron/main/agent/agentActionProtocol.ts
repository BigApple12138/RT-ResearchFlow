/** 独立 Agent 动作协议（agent-turn.v1）。禁止与 researchAgent tool_batch 混用。 */

export const AGENT_TURN_PROTOCOL_VERSION = 'agent-turn.v1'

export class AgentActionProtocolError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'AgentActionProtocolError'
    this.code = code
  }
}

export type AgentToolAction = {
  type: 'tool'
  name: string
  args: Record<string, unknown>
}

export type AgentFinalAction = {
  type: 'final'
  text: string
}

export type AgentAction = AgentToolAction | AgentFinalAction

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

function parseJsonObject(text: string): Record<string, unknown> {
  const trimmed = text.trim()
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  const candidate = fenced ? fenced[1].trim() : trimmed
  let value: unknown
  try {
    value = JSON.parse(candidate)
  } catch {
    throw new AgentActionProtocolError('ACTION_SCHEMA_INVALID', '模型动作不是有效 JSON')
  }
  if (!isRecord(value)) {
    throw new AgentActionProtocolError('ACTION_SCHEMA_INVALID', '模型动作必须是 JSON 对象')
  }
  return value
}

/**
 * 解析 agent-turn.v1 动作。
 * 合法：`{ type:'tool', name, args? }` | `{ type:'final', text }`
 * 明确拒绝 researchAgent 的 `tool_batch` / `action` 形态。
 */
export function parseAgentAction(text: string): AgentAction {
  const value = parseJsonObject(text)

  if (value.action === 'tool_batch' || value.type === 'tool_batch') {
    throw new AgentActionProtocolError(
      'ACTION_SCHEMA_INVALID',
      '禁止使用 researchAgent tool_batch；请使用 agent-turn.v1 的 type:tool|final',
    )
  }

  if (value.protocolVersion != null && value.protocolVersion !== AGENT_TURN_PROTOCOL_VERSION) {
    // 允许省略 protocolVersion；若给出则必须为本协议
    if (typeof value.protocolVersion === 'string' && value.protocolVersion.includes('single-agent')) {
      throw new AgentActionProtocolError(
        'ACTION_SCHEMA_INVALID',
        '禁止混用 researchAgent protocolVersion',
      )
    }
  }

  const type = value.type
  if (type === 'tool') {
    const name = typeof value.name === 'string' ? value.name.trim() : ''
    if (!name) {
      throw new AgentActionProtocolError('ACTION_SCHEMA_INVALID', 'tool 动作 name 不能为空')
    }
    let args: Record<string, unknown> = {}
    if (value.args !== undefined) {
      if (!isRecord(value.args)) {
        throw new AgentActionProtocolError('ACTION_SCHEMA_INVALID', 'tool 动作 args 必须是对象')
      }
      args = value.args
    }
    return { type: 'tool', name, args }
  }

  if (type === 'final') {
    const textOut = typeof value.text === 'string' ? value.text.trim() : ''
    if (!textOut) {
      throw new AgentActionProtocolError('ACTION_SCHEMA_INVALID', 'final 动作 text 不能为空')
    }
    return { type: 'final', text: textOut }
  }

  throw new AgentActionProtocolError(
    'ACTION_SCHEMA_INVALID',
    `动作 type 无效（需要 tool|final）：${String(type)}`,
  )
}
