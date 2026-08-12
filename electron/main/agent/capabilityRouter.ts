import type { ToolRegistry } from './toolRegistry'
import type { ToolDefinition } from './types'

function matchesNeed(toolName: string, need: string): boolean {
  const n = need.trim()
  if (!n) return false
  if (n.endsWith('.*')) {
    const prefix = n.slice(0, -1) // keep trailing empty → "local."
    return toolName.startsWith(prefix)
  }
  if (n.endsWith('*') && n.includes('.')) {
    const prefix = n.slice(0, -1)
    return toolName.startsWith(prefix)
  }
  return toolName === n
}

/**
 * 按步骤 capabilityNeed 从 registry 选择候选 Tool。
 * 支持精确名与 `local.*` 前缀通配；不做模型路由。
 */
export function selectCapabilityCandidates(
  registry: ToolRegistry,
  capabilityNeed: string | string[],
): ToolDefinition[] {
  const needs = (Array.isArray(capabilityNeed) ? capabilityNeed : [capabilityNeed])
    .map((n) => n.trim())
    .filter(Boolean)
  if (needs.length === 0) {
    return []
  }

  return registry.list().filter((tool) => needs.some((need) => matchesNeed(tool.name, need)))
}
