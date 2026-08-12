import { describe, expect, it } from 'vitest'
import type { AgentSessionContext, ToolDefinition } from '../../electron/main/agent/types'
import { assertNetworkAllowed, AgentNetworkGateError } from '../../electron/main/agent/networkGate'
import { emptySessionContext } from '../../electron/main/agent/toolRegistry'

function networkTool(execute: ToolDefinition['execute']): ToolDefinition {
  return {
    name: 'web.search',
    description: '联网搜索',
    sideEffect: 'network',
    parametersSchema: { type: 'object', additionalProperties: false, properties: {} },
    execute,
  }
}

function readTool(): ToolDefinition {
  return {
    name: 'local.portfolio_facts',
    description: '本地持仓',
    sideEffect: 'read',
    parametersSchema: { type: 'object', additionalProperties: false, properties: {} },
    async execute() {
      return { ok: true }
    },
  }
}

describe('agentNetworkGate', () => {
  const ctx: AgentSessionContext = emptySessionContext({
    sessionId: 1,
    userGoal: '核对公开资料',
    requestId: 'req-net-1',
  })

  it('network 默认关闭且 handler 零调用', async () => {
    let calls = 0
    const def = networkTool(async () => {
      calls += 1
      return { hits: [] }
    })

    expect(() => assertNetworkAllowed(def, { getNetworkEnabled: () => false })).toThrow(AgentNetworkGateError)
    expect(() => assertNetworkAllowed(def, { getNetworkEnabled: () => false })).toThrow(/联网|network/i)

    // 闸门拒绝后不得调用 handler
    expect(calls).toBe(0)
    await expect(async () => {
      assertNetworkAllowed(def, { getNetworkEnabled: () => false })
      await def.execute(ctx, {})
    }).rejects.toThrow(AgentNetworkGateError)
    expect(calls).toBe(0)
  })

  it('开启后放行，可调用 handler', async () => {
    let calls = 0
    const def = networkTool(async () => {
      calls += 1
      return { hits: ['ok'] }
    })

    expect(() => assertNetworkAllowed(def, { getNetworkEnabled: () => true })).not.toThrow()
    await def.execute(ctx, {})
    expect(calls).toBe(1)
  })

  it('运行中再次关闭后下一次调用被阻断', async () => {
    let enabled = true
    let calls = 0
    const def = networkTool(async () => {
      calls += 1
      return { hits: [] }
    })

    assertNetworkAllowed(def, { getNetworkEnabled: () => enabled })
    await def.execute(ctx, {})
    expect(calls).toBe(1)

    enabled = false
    expect(() => assertNetworkAllowed(def, { getNetworkEnabled: () => enabled })).toThrow(AgentNetworkGateError)
    expect(calls).toBe(1)
  })

  it('read 工具不受联网闸门约束', () => {
    expect(() => assertNetworkAllowed(readTool(), { getNetworkEnabled: () => false })).not.toThrow()
  })

  it('未注入开关时默认视为关闭', () => {
    const def = networkTool(async () => ({ hits: [] }))
    expect(() => assertNetworkAllowed(def)).toThrow(AgentNetworkGateError)
  })
})
