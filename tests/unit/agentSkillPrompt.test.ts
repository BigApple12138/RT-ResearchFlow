import { describe, expect, it } from 'vitest'
import {
  buildAgentSystemPrompt,
  buildDefaultAgentSystemPrompt,
  loadDefaultAgentSkillBody,
  stripSkillFrontMatter,
} from '../../electron/main/agent/skillPrompt'
import { createToolRegistry } from '../../electron/main/agent/toolRegistry'
import type { AgentSessionContext, ToolDefinition } from '../../electron/main/agent/types'
import { runAgentTurn } from '../../electron/main/agent/orchestrator'

function stubTool(name: string, description: string): ToolDefinition {
  return {
    name,
    description,
    sideEffect: 'read',
    parametersSchema: { type: 'object', additionalProperties: false, properties: {} },
    async execute(_ctx: AgentSessionContext, _args: Record<string, unknown>) {
      return { ok: true }
    },
  }
}

describe('agentSkillPrompt', () => {
  it('prompt 含 tool 名与禁止荐股等关键词', () => {
    const registry = createToolRegistry()
    registry.register(stubTool('local.portfolio_facts', '读取持仓事实'))
    registry.register(stubTool('local.market_snapshot', '读取行情快照'))
    registry.register(stubTool('local.fundamentals_read', '读取基本面'))
    registry.register(stubTool('research.deep_start', '启动深度研究'))

    const prompt = buildDefaultAgentSystemPrompt(registry.listForPrompt())

    expect(prompt).toContain('local.portfolio_facts')
    expect(prompt).toContain('local.market_snapshot')
    expect(prompt).toContain('local.fundamentals_read')
    expect(prompt).toContain('research.deep_start')
    expect(prompt).toMatch(/禁止荐股/)
    expect(prompt).toMatch(/目标价/)
    expect(prompt).toMatch(/仓位/)
    expect(prompt).toMatch(/不构成投资建议|不是.*投顾|非投顾/)
  })

  it('从 SKILL.md 加载正文（去 front-matter）', () => {
    const body = loadDefaultAgentSkillBody()
    expect(body).not.toMatch(/^---/)
    expect(body).toContain('何时读持仓')
    expect(body).toContain('deep_start')
    expect(stripSkillFrontMatter('---\nname: x\n---\n\n正文')).toBe('正文')
  })

  it('buildAgentSystemPrompt 顺序：Skill → 工具 → 禁止项', () => {
    const prompt = buildAgentSystemPrompt({
      skillBody: '【SKILL_MARKER】',
      tools: [{ name: 'local.portfolio_facts', description: '持仓', sideEffect: 'read' }],
    })
    const skillAt = prompt.indexOf('【SKILL_MARKER】')
    const toolsAt = prompt.indexOf('## 可用工具')
    const forbidAt = prompt.indexOf('## 禁止项')
    expect(skillAt).toBeGreaterThanOrEqual(0)
    expect(toolsAt).toBeGreaterThan(skillAt)
    expect(forbidAt).toBeGreaterThan(toolsAt)
  })

  it('orchestrator 将 system prompt 注入 reasoningCall.messages', async () => {
    const registry = createToolRegistry()
    registry.register(stubTool('local.portfolio_facts', '读取持仓事实'))

    let seenSystem = ''
    await runAgentTurn({
      sessionId: 1,
      userMessage: '你好',
      requestId: 'req-skill-prompt',
      registry,
      onEvent: () => {},
      reasoningCall: async ({ messages }) => {
        seenSystem = messages.find((m) => m.role === 'system')?.content ?? ''
        return JSON.stringify({ type: 'final', text: 'ok' })
      },
    })

    expect(seenSystem).toContain('local.portfolio_facts')
    expect(seenSystem).toMatch(/禁止荐股/)
  })
})
