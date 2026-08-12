import { describe, expect, it } from 'vitest'
import type { AgentSessionContext, ToolDefinition } from '../../electron/main/agent/types'
import {
  AGENT_TOOL_REGISTRY_VERSION,
  createToolRegistry,
} from '../../electron/main/agent/toolRegistry'

function stubTool(name: string, description: string): ToolDefinition {
  return {
    name,
    description,
    sideEffect: 'read',
    parametersSchema: { type: 'object', additionalProperties: false, properties: {} },
    async execute(_ctx: AgentSessionContext, _args: Record<string, unknown>) {
      return { ok: true, summary: name }
    },
  }
}

describe('agentToolRegistry', () => {
  it('注册两个 Tool、按名获取、listForPrompt 含 description', () => {
    const registry = createToolRegistry()
    registry.register(stubTool('local.portfolio_facts', '读取持仓事实'))
    registry.register(stubTool('local.market_snapshot', '读取行情快照'))

    expect(registry.get('local.portfolio_facts').description).toBe('读取持仓事实')
    expect(registry.get('local.market_snapshot').name).toBe('local.market_snapshot')

    const listed = registry.listForPrompt()
    expect(listed).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'local.portfolio_facts', description: '读取持仓事实', sideEffect: 'read' }),
      expect.objectContaining({ name: 'local.market_snapshot', description: '读取行情快照', sideEffect: 'read' }),
    ]))
    expect(AGENT_TOOL_REGISTRY_VERSION.length).toBeGreaterThan(0)
  })

  it('未知名抛错', () => {
    const registry = createToolRegistry()
    expect(() => registry.get('missing.tool')).toThrow(/unknown tool|未知工具/i)
  })

  it('重复注册同名抛错', () => {
    const registry = createToolRegistry()
    registry.register(stubTool('local.portfolio_facts', 'a'))
    expect(() => registry.register(stubTool('local.portfolio_facts', 'b'))).toThrow(/already registered|已注册/i)
  })
})
