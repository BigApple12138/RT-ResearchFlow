/** Agent 框子共享类型（第一期）。 */

export type ToolSideEffect = 'read' | 'network' | 'write'

export interface AgentSessionContext {
  sessionId: number
  userGoal: string
  asOf: string
  requestId: string
  factsFingerprint?: string | null
}

export interface ToolDefinition<TArgs extends Record<string, unknown> = Record<string, unknown>> {
  name: string
  description: string
  sideEffect: ToolSideEffect
  /** JSON Schema 风格描述，供提示与轻量校验；第一期不做完整 ajv。 */
  parametersSchema: Record<string, unknown>
  execute: (ctx: AgentSessionContext, args: TArgs) => Promise<unknown>
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
