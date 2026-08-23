import { describe, expect, it } from 'vitest'
import {
  AGENT_TURN_PROTOCOL_VERSION,
  AgentActionProtocolError,
  parseAgentAction,
} from '../../electron/main/agent/agentActionProtocol'

describe('agentActionProtocol (agent-turn.v1)', () => {
  it('解析 tool 动作', () => {
    const action = parseAgentAction(JSON.stringify({
      type: 'tool',
      name: 'local.portfolio_facts',
      args: { includeCost: false },
    }))
    expect(action).toEqual({
      type: 'tool',
      name: 'local.portfolio_facts',
      args: { includeCost: false },
    })
  })

  it('解析 final 动作（含 markdown fence）', () => {
    const action = parseAgentAction(`\`\`\`json
{"type":"final","text":"持仓暂无异常，仅供参考。"}
\`\`\``)
    expect(action).toEqual({
      type: 'final',
      text: '持仓暂无异常，仅供参考。',
    })
  })

  it('protocolVersion 常量独立于 researchAgent', () => {
    expect(AGENT_TURN_PROTOCOL_VERSION).toBe('agent-turn.v1')
  })

  it('拒绝 researchAgent tool_batch / 非法动作', () => {
    expect(() => parseAgentAction(JSON.stringify({
      protocolVersion: 'single-agent.v1',
      action: 'tool_batch',
      calls: [{ toolId: 'x', input: {} }],
    }))).toThrow(AgentActionProtocolError)

    expect(() => parseAgentAction(JSON.stringify({ type: 'tool_batch', name: 'x' }))).toThrow(/type|动作/i)
    expect(() => parseAgentAction(JSON.stringify({ type: 'tool', name: '', args: {} }))).toThrow()
    expect(() => parseAgentAction(JSON.stringify({ type: 'final', text: '' }))).toThrow()
    expect(() => parseAgentAction('not-json')).toThrow(AgentActionProtocolError)
  })

  it('tool 缺 args 时归一为空对象', () => {
    const action = parseAgentAction(JSON.stringify({ type: 'tool', name: 'local.market_snapshot' }))
    expect(action).toEqual({ type: 'tool', name: 'local.market_snapshot', args: {} })
  })
})
