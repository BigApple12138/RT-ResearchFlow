import { describe, expect, it } from 'vitest'
import type { ToolDefinition } from '../../electron/main/agent/types'
import {
  AgentHitlGateError,
  createHitlGate,
} from '../../electron/main/agent/hitlGate'

function tool(name: string, sideEffect: ToolDefinition['sideEffect']): ToolDefinition {
  return {
    name,
    description: name,
    sideEffect,
    parametersSchema: { type: 'object', additionalProperties: false, properties: {} },
    async execute() {
      return { ok: true }
    },
  }
}

describe('agentHitlGate', () => {
  it('read 直接过', () => {
    const gate = createHitlGate()
    expect(() => gate.assertToolAllowed(tool('local.portfolio_facts', 'read'))).not.toThrow()
  })

  it('network 不要求 HITL 确认', () => {
    const gate = createHitlGate()
    expect(() => gate.assertToolAllowed(tool('web.search', 'network'))).not.toThrow()
  })

  it('write 未确认拒绝', () => {
    const gate = createHitlGate()
    expect(() => gate.assertToolAllowed(tool('config.set', 'write'))).toThrow(AgentHitlGateError)
    expect(() => gate.assertToolAllowed(tool('config.set', 'write'))).toThrow(/确认|HITL|write/i)
  })

  it('确认后允许一次，再次调用需重新确认', async () => {
    const gate = createHitlGate()
    const write = tool('config.set', 'write')

    const pending = gate.requestHitl({
      toolName: write.name,
      summary: '修改配置',
      requestId: 'hitl-1',
    })

    gate.resolveHitl('hitl-1', true)
    const result = await pending
    expect(result).toEqual({ requestId: 'hitl-1', approved: true })

    expect(() => gate.assertToolAllowed(write)).not.toThrow()
    expect(() => gate.assertToolAllowed(write)).toThrow(AgentHitlGateError)
  })

  it('拒绝确认后仍不可执行 write', async () => {
    const gate = createHitlGate()
    const write = tool('config.set', 'write')

    const pending = gate.requestHitl({
      toolName: write.name,
      requestId: 'hitl-deny',
    })
    gate.resolveHitl('hitl-deny', false)
    await expect(pending).resolves.toEqual({ requestId: 'hitl-deny', approved: false })

    expect(() => gate.assertToolAllowed(write)).toThrow(AgentHitlGateError)
  })

  it('未知 requestId 的 resolveHitl 抛错', () => {
    const gate = createHitlGate()
    expect(() => gate.resolveHitl('missing', true)).toThrow(/未知|unknown|HITL/i)
  })
})
