import type { AgentSessionContext, ToolDefinition, ToolPromptEntry } from './types'

export type { AgentSessionContext, ToolDefinition, ToolPromptEntry } from './types'
export { type ToolSideEffect } from './types'

/** 注册表契约版本；演进时递增，供审计与提示快照。 */
export const AGENT_TOOL_REGISTRY_VERSION = 'agent-tools.v1'

export class AgentToolRegistryError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'AgentToolRegistryError'
    this.code = code
  }
}

export interface ToolRegistry {
  register(definition: ToolDefinition): void
  /** 按名移除；不存在时返回 false。 */
  unregister(name: string): boolean
  /** 按谓词批量移除，返回移除数量。 */
  unregisterWhere(predicate: (name: string, def: ToolDefinition) => boolean): number
  get(name: string): ToolDefinition
  listForPrompt(): ToolPromptEntry[]
  list(): ToolDefinition[]
}

export function createToolRegistry(): ToolRegistry {
  const byName = new Map<string, ToolDefinition>()

  return {
    register(definition: ToolDefinition): void {
      const name = definition.name?.trim()
      if (!name) {
        throw new AgentToolRegistryError('INVALID_TOOL', 'Tool name 不能为空')
      }
      if (byName.has(name)) {
        throw new AgentToolRegistryError('DUPLICATE_TOOL', `Tool 已注册：${name}`)
      }
      if (!definition.description?.trim()) {
        throw new AgentToolRegistryError('INVALID_TOOL', `Tool 缺少 description：${name}`)
      }
      if (definition.sideEffect !== 'read' && definition.sideEffect !== 'network' && definition.sideEffect !== 'write') {
        throw new AgentToolRegistryError('INVALID_TOOL', `Tool sideEffect 非法：${name}`)
      }
      if (typeof definition.execute !== 'function') {
        throw new AgentToolRegistryError('INVALID_TOOL', `Tool 缺少 execute：${name}`)
      }
      byName.set(name, definition)
    },

    unregister(name: string): boolean {
      return byName.delete(name)
    },

    unregisterWhere(predicate: (name: string, def: ToolDefinition) => boolean): number {
      let removed = 0
      for (const [name, def] of [...byName.entries()]) {
        if (predicate(name, def)) {
          byName.delete(name)
          removed += 1
        }
      }
      return removed
    },

    get(name: string): ToolDefinition {
      const found = byName.get(name)
      if (!found) {
        throw new AgentToolRegistryError('UNKNOWN_TOOL', `未知工具：${name}`)
      }
      return found
    },

    listForPrompt(): ToolPromptEntry[] {
      return [...byName.values()]
        .map((tool) => ({
          name: tool.name,
          description: tool.description,
          sideEffect: tool.sideEffect,
        }))
        .sort((a, b) => a.name.localeCompare(b.name))
    },

    list(): ToolDefinition[] {
      return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name))
    },
  }
}

/** 供单测与调用方构造最小 SessionContext。 */
export function emptySessionContext(partial: Partial<AgentSessionContext> & Pick<AgentSessionContext, 'sessionId' | 'userGoal' | 'requestId'>): AgentSessionContext {
  return {
    asOf: partial.asOf ?? new Date().toISOString().slice(0, 10).replace(/-/g, ''),
    factsFingerprint: partial.factsFingerprint ?? null,
    ...partial,
  }
}
