/** Agent 框子共享类型（第一期）。 */

export type ToolSideEffect = 'read' | 'network' | 'write'

export interface AgentSessionContext {
  sessionId: number
  userGoal: string
  asOf: string
  requestId: string
  factsFingerprint?: string | null
}

/** 审计元数据（可选）；外部 MCP 投影会带上 serverId / 远端 toolName。 */
export interface ToolAuditMeta {
  source: 'external_mcp' | 'builtin' | string
  serverId?: string
  toolName?: string
}

export interface ToolDefinition<TArgs extends Record<string, unknown> = Record<string, unknown>> {
  name: string
  description: string
  sideEffect: ToolSideEffect
  /** JSON Schema 风格描述，供提示与轻量校验；第一期不做完整 ajv。 */
  parametersSchema: Record<string, unknown>
  execute: (ctx: AgentSessionContext, args: TArgs) => Promise<unknown>
  /** 时间线 / 审计事件附加字段（如 MCP serverId）。 */
  audit?: ToolAuditMeta
}

export interface ToolPromptEntry {
  name: string
  description: string
  sideEffect: ToolSideEffect
}

export type AgentEventType =
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

export interface AgentEvent {
  type: AgentEventType
  requestId: string
  sessionId: number
  at: number
  payload?: Record<string, unknown>
}
