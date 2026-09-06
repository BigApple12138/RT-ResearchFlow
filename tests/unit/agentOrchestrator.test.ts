import { describe, expect, it } from 'vitest'
import type { AgentEvent, AgentSessionContext, ToolDefinition } from '../../electron/main/agent/types'
import { createToolRegistry } from '../../electron/main/agent/toolRegistry'
import { createHitlGate } from '../../electron/main/agent/hitlGate'
import {
  createGoalState,
  createPlanState,
  createPlanStep,
} from '../../electron/main/agent/planner'
import { runAgentTurn, trimConversationMessagesForContext } from '../../electron/main/agent/orchestrator'
import { AGENT_TOOL_RESULT_MAX_CHARS } from '../../electron/main/agent/orchestrator'

function collectEvents(events: AgentEvent[]) {
  return {
    types: () => events.map((e) => e.type),
    terminal: () => events.filter((e) => e.type === 'done' || e.type === 'error' || e.type === 'cancelled'),
  }
}

function readTool(name: string, result: unknown, sideEffect: ToolDefinition['sideEffect'] = 'read'): ToolDefinition {
  return {
    name,
    description: name,
    sideEffect,
    parametersSchema: { type: 'object', additionalProperties: true, properties: {} },
    async execute(_ctx: AgentSessionContext, _args: Record<string, unknown>) {
      return result
    },
  }
}

describe('agentOrchestrator', () => {
  it('conversationMessages 进入推理上下文，禁止仅见当前短句', async () => {
    const events: AgentEvent[] = []
    const registry = createToolRegistry()
    let sawHistory = false
    const result = await runAgentTurn({
      sessionId: 1,
      userMessage: '深度分析一下',
      requestId: 'req-memory',
      registry,
      conversationMessages: [
        { role: 'user', content: '【本地持仓事实】002628 成都路桥' },
        { role: 'assistant', content: '已看到成都路桥。' },
        { role: 'user', content: '深度分析一下' },
      ],
      onEvent: (e) => events.push(e),
      reasoningCall: async (input) => {
        const blob = input.messages.map((m) => m.content).join('\n')
        sawHistory = blob.includes('002628') && blob.includes('深度分析一下')
        expect(input.messages.length).toBeGreaterThan(2)
        return JSON.stringify({ type: 'final', text: sawHistory ? '继承上下文完成' : '失忆' })
      },
    })
    expect(sawHistory).toBe(true)
    expect(result.text).toContain('继承上下文')
  })

  it('trimConversationMessagesForContext 超限时保留尾部', () => {
    const long = 'x'.repeat(1000)
    const messages = [
      { role: 'user' as const, content: `旧-${long}` },
      { role: 'assistant' as const, content: `旧答-${long}` },
      { role: 'user' as const, content: '深度分析一下' },
    ]
    const trimmed = trimConversationMessagesForContext(messages, 1500)
    expect(trimmed.some((m) => m.content.includes('深度分析一下'))).toBe(true)
    expect(trimmed.reduce((n, m) => n + m.content.length, 0)).toBeLessThanOrEqual(1500 + 80)
  })

  it('0-step：简单目标直接 final，唯一 done 终态', async () => {
    const events: AgentEvent[] = []
    const registry = createToolRegistry()
    registry.register(readTool('local.portfolio_facts', { holdings: [] }))

    const result = await runAgentTurn({
      sessionId: 1,
      userMessage: '你好',
      requestId: 'req-0',
      registry,
      onEvent: (e) => events.push(e),
      reasoningCall: async () => JSON.stringify({ type: 'final', text: '你好，我是投研助手。' }),
    })

    expect(result.terminal).toBe('done')
    expect(result.text).toContain('投研助手')
    const c = collectEvents(events)
    expect(c.types()[0]).toBe('start')
    expect(c.types()).toContain('message')
    expect(c.terminal()).toHaveLength(1)
    expect(c.terminal()[0].type).toBe('done')
    expect(events.some((e) => e.type === 'tool_call')).toBe(false)
    const messages = events.filter((e) => e.type === 'message')
    expect(messages.some((e) => e.payload?.stream === 'delta')).toBe(true)
    expect(messages.some((e) => e.payload?.stream === 'final')).toBe(true)
    expect(messages.find((e) => e.payload?.stream === 'final')?.payload?.text).toContain('投研助手')
  })

  it('reasoningCall onDelta 在可解析 final 时推送 stream=delta', async () => {
    const events: AgentEvent[] = []
    const registry = createToolRegistry()
    const result = await runAgentTurn({
      sessionId: 1,
      userMessage: '你好',
      requestId: 'req-delta',
      registry,
      onEvent: (e) => events.push(e),
      reasoningCall: async (input) => {
        const finalJson = JSON.stringify({ type: 'final', text: '流式正文' })
        input.onDelta?.(finalJson)
        return finalJson
      },
    })
    expect(result.terminal).toBe('done')
    const deltas = events.filter((e) => e.type === 'message' && e.payload?.stream === 'delta')
    expect(deltas.some((e) => e.payload?.text === '流式正文')).toBe(true)
  })

  it('复杂目标：计划 → 本地事实 → 缺口 Tool → 完成；事件顺序与唯一终态', async () => {
    const events: AgentEvent[] = []
    const registry = createToolRegistry()
    let portfolioCalls = 0
    let marketCalls = 0
    registry.register({
      ...readTool('local.portfolio_facts', { holdings: ['AAA'] }),
      async execute() {
        portfolioCalls += 1
        return { holdings: ['AAA'], summary: '1 只持仓' }
      },
    })
    registry.register({
      ...readTool('local.market_snapshot', { quotes: [{ code: 'AAA', pct: 1.2 }] }),
      async execute() {
        marketCalls += 1
        return { quotes: [{ code: 'AAA', pct: 1.2 }], summary: '行情已取' }
      },
    })

    const plan = createPlanState({
      steps: [
        createPlanStep({
          stepId: 's1',
          title: '读持仓',
          capabilityNeed: ['local.portfolio_facts'],
          expectedArtifacts: ['portfolio'],
          completionCriteria: ['持仓事实可用'],
        }),
        createPlanStep({
          stepId: 's2',
          title: '补行情',
          capabilityNeed: ['local.market_snapshot'],
          dependsOn: ['s1'],
          expectedArtifacts: ['quotes'],
          completionCriteria: ['行情摘要可用'],
        }),
      ],
    })

    const actions = [
      JSON.stringify({ type: 'tool', name: 'local.portfolio_facts', args: {} }),
      JSON.stringify({ type: 'tool', name: 'local.market_snapshot', args: { codes: ['AAA'] } }),
      JSON.stringify({ type: 'final', text: '持仓 AAA 今日上涨，依据本地事实与行情。' }),
    ]
    let i = 0

    const result = await runAgentTurn({
      sessionId: 2,
      userMessage: '看看持仓今天要注意什么',
      requestId: 'req-complex',
      registry,
      initialPlan: plan,
      goal: createGoalState({
        goal: '看看持仓今天要注意什么',
        completionCriteria: ['持仓事实可用', '行情摘要可用'],
      }),
      onEvent: (e) => events.push(e),
      reasoningCall: async () => actions[Math.min(i++, actions.length - 1)],
    })

    expect(result.terminal).toBe('done')
    expect(portfolioCalls).toBe(1)
    expect(marketCalls).toBe(1)
    const types = events.map((e) => e.type)
    expect(types[0]).toBe('start')
    expect(types).toContain('plan')
    expect(types).toContain('tool_call')
    expect(types).toContain('tool_result')
    expect(types).toContain('message')
    expect(events.filter((e) => e.type === 'done' || e.type === 'error' || e.type === 'cancelled')).toHaveLength(1)
    expect(types.indexOf('plan')).toBeLessThan(types.indexOf('tool_call'))
  })

  it('同 name+args 指纹重复 → 熔断 final', async () => {
    const events: AgentEvent[] = []
    const registry = createToolRegistry()
    let calls = 0
    registry.register({
      ...readTool('local.portfolio_facts', { ok: true }),
      async execute() {
        calls += 1
        return { ok: true, remainingGaps: ['仍缺'] }
      },
    })

    const plan = createPlanState({
      steps: [
        createPlanStep({
          stepId: 's1',
          title: '读持仓',
          capabilityNeed: ['local.portfolio_facts'],
          completionCriteria: ['永不满足'],
        }),
      ],
    })

    const result = await runAgentTurn({
      sessionId: 3,
      userMessage: '持仓',
      requestId: 'req-fuse',
      registry,
      initialPlan: plan,
      goal: createGoalState({ goal: '持仓', completionCriteria: ['永不满足'] }),
      maxSteps: 8,
      onEvent: (e) => events.push(e),
      reasoningCall: async () => JSON.stringify({
        type: 'tool',
        name: 'local.portfolio_facts',
        args: { x: 1 },
      }),
    })

    expect(result.terminal).toBe('done')
    expect(calls).toBe(1)
    expect(result.text).toMatch(/熔断|重复|未能完成/i)
    expect(events.filter((e) => e.type === 'done')).toHaveLength(1)
  })

  it('maxSteps 耗尽唯一终态；取消 → cancelled', async () => {
    const registry = createToolRegistry()
    registry.register(readTool('local.portfolio_facts', { ok: true }))
    const plan = createPlanState({
      steps: [
        createPlanStep({
          stepId: 's1',
          title: 't',
          capabilityNeed: ['local.portfolio_facts'],
          completionCriteria: ['永不'],
        }),
      ],
    })

    let n = 0
    const eventsA: AgentEvent[] = []
    const r1 = await runAgentTurn({
      sessionId: 4,
      userMessage: 'x',
      requestId: 'req-max',
      registry,
      initialPlan: plan,
      goal: createGoalState({ goal: 'x', completionCriteria: ['永不'] }),
      maxSteps: 2,
      onEvent: (e) => eventsA.push(e),
      reasoningCall: async () => {
        n += 1
        return JSON.stringify({
          type: 'tool',
          name: 'local.portfolio_facts',
          args: { n },
        })
      },
    })
    expect(r1.terminal).toBe('done')
    expect(eventsA.filter((e) => e.type === 'done' || e.type === 'error' || e.type === 'cancelled')).toHaveLength(1)

    const ac = new AbortController()
    const eventsB: AgentEvent[] = []
    const pending = runAgentTurn({
      sessionId: 5,
      userMessage: 'cancel me',
      requestId: 'req-cancel',
      registry,
      onEvent: (e) => {
        eventsB.push(e)
        if (e.type === 'start') ac.abort()
      },
      signal: ac.signal,
      reasoningCall: async () => {
        await new Promise((r) => setTimeout(r, 30))
        return JSON.stringify({ type: 'final', text: 'late' })
      },
    })
    const r2 = await pending
    expect(r2.terminal).toBe('cancelled')
    expect(eventsB.filter((e) => e.type === 'cancelled')).toHaveLength(1)
    expect(eventsB.filter((e) => e.type === 'done' || e.type === 'error')).toHaveLength(0)
  })

  it('reasoningCall 抛 Abort 且 signal.aborted 时为 cancelled', async () => {
    const registry = createToolRegistry()
    const ac = new AbortController()
    const events: AgentEvent[] = []
    const pending = runAgentTurn({
      sessionId: 51,
      userMessage: 'abort mid call',
      requestId: 'req-abort-mid',
      registry,
      signal: ac.signal,
      onEvent: (e) => events.push(e),
      reasoningCall: async (input) => {
        ac.abort()
        if (input.signal?.aborted) {
          const err = new Error('AbortError')
          err.name = 'AbortError'
          throw err
        }
        return JSON.stringify({ type: 'final', text: 'should not' })
      },
    })
    const result = await pending
    expect(result.terminal).toBe('cancelled')
    expect(events.some((e) => e.type === 'cancelled')).toBe(true)
    expect(events.some((e) => e.type === 'done' || e.type === 'error')).toBe(false)
  })

  it('network 关闭阻断；write 走 HITL；tool_result size cap', async () => {
    const registry = createToolRegistry()
    let networkHits = 0
    registry.register({
      name: 'web.search',
      description: 'search',
      sideEffect: 'network',
      parametersSchema: { type: 'object', properties: {} },
      async execute() {
        networkHits += 1
        return { hits: [] }
      },
    })
    const big = 'Z'.repeat(AGENT_TOOL_RESULT_MAX_CHARS + 500)
    registry.register({
      name: 'local.blob',
      description: 'blob',
      sideEffect: 'read',
      parametersSchema: { type: 'object', properties: {} },
      async execute() {
        return { blob: big }
      },
    })
    registry.register({
      name: 'config.set',
      description: 'write cfg',
      sideEffect: 'write',
      parametersSchema: { type: 'object', properties: {} },
      async execute() {
        return { saved: true }
      },
    })

    const eventsNet: AgentEvent[] = []
    const rNet = await runAgentTurn({
      sessionId: 6,
      userMessage: '搜一下',
      requestId: 'req-net',
      registry,
      getNetworkEnabled: () => false,
      initialPlan: createPlanState({
        steps: [createPlanStep({ stepId: 's1', title: '搜', capabilityNeed: ['web.search'], completionCriteria: ['有结果'] })],
      }),
      goal: createGoalState({ goal: '搜', completionCriteria: ['有结果'] }),
      onEvent: (e) => eventsNet.push(e),
      reasoningCall: async ({ observations }) => {
        if (observations.length === 0) {
          return JSON.stringify({ type: 'tool', name: 'web.search', args: { q: 'x' } })
        }
        return JSON.stringify({ type: 'final', text: '联网未授权，已停止。' })
      },
    })
    expect(networkHits).toBe(0)
    expect(rNet.terminal).toBe('done')
    expect(eventsNet.some((e) => e.type === 'tool_result' && String(e.payload?.summary ?? '').match(/联网|未授权|NETWORK/i))).toBe(true)

    const hitl = createHitlGate()
    const eventsWrite: AgentEvent[] = []
    const writePromise = runAgentTurn({
      sessionId: 7,
      userMessage: '改配置',
      requestId: 'req-write',
      registry,
      hitlGate: hitl,
      initialPlan: createPlanState({
        steps: [createPlanStep({ stepId: 's1', title: '写', capabilityNeed: ['config.set'], completionCriteria: ['已写'] })],
      }),
      goal: createGoalState({ goal: '改配置', completionCriteria: ['已写'] }),
      onEvent: (e) => {
        eventsWrite.push(e)
        if (e.type === 'hitl' && e.payload?.hitlRequestId) {
          hitl.resolveHitl(String(e.payload.hitlRequestId), true)
        }
      },
      reasoningCall: async ({ observations }) => {
        if (observations.length === 0) {
          return JSON.stringify({ type: 'tool', name: 'config.set', args: { k: 'v' } })
        }
        return JSON.stringify({ type: 'final', text: '配置已更新。' })
      },
    })
    const rWrite = await writePromise
    expect(rWrite.terminal).toBe('done')
    expect(eventsWrite.some((e) => e.type === 'hitl')).toBe(true)

    const eventsCap: AgentEvent[] = []
    await runAgentTurn({
      sessionId: 8,
      userMessage: '大结果',
      requestId: 'req-cap',
      registry,
      initialPlan: createPlanState({
        steps: [createPlanStep({ stepId: 's1', title: 'blob', capabilityNeed: ['local.blob'], completionCriteria: ['ok'] })],
      }),
      goal: createGoalState({ goal: '大结果', completionCriteria: ['ok'] }),
      onEvent: (e) => eventsCap.push(e),
      reasoningCall: async ({ observations }) => {
        if (observations.length === 0) {
          return JSON.stringify({ type: 'tool', name: 'local.blob', args: {} })
        }
        return JSON.stringify({ type: 'final', text: '已截断。' })
      },
    })
    const tr = eventsCap.find((e) => e.type === 'tool_result')
    expect(tr).toBeTruthy()
    const injected = String(tr?.payload?.cappedText ?? tr?.payload?.summary ?? '')
    expect(injected.length).toBeLessThanOrEqual(AGENT_TOOL_RESULT_MAX_CHARS + 80)
  })

  it('不同 mock reasoningCall 给出等价动作时，安全边界一致（network 仍阻断）', async () => {
    const registry = createToolRegistry()
    let hits = 0
    registry.register({
      name: 'web.search',
      description: 's',
      sideEffect: 'network',
      parametersSchema: { type: 'object', properties: {} },
      async execute() {
        hits += 1
        return { hits: [1] }
      },
    })

    const runWith = async (reasoningCall: Parameters<typeof runAgentTurn>[0]['reasoningCall']) => {
      const events: AgentEvent[] = []
      const result = await runAgentTurn({
        sessionId: 9,
        userMessage: '搜',
        requestId: `req-${Math.random()}`,
        registry,
        getNetworkEnabled: () => false,
        initialPlan: createPlanState({
          steps: [createPlanStep({ stepId: 's1', title: '搜', capabilityNeed: ['web.search'], completionCriteria: ['x'] })],
        }),
        goal: createGoalState({ goal: '搜', completionCriteria: ['x'] }),
        onEvent: (e) => events.push(e),
        reasoningCall,
      })
      return { result, events }
    }

    const a = await runWith(async ({ observations }) => {
      if (!observations.length) return JSON.stringify({ type: 'tool', name: 'web.search', args: { q: 'a' } })
      return JSON.stringify({ type: 'final', text: 'A 结束' })
    })
    const b = await runWith(async ({ observations }) => {
      if (!observations.length) return JSON.stringify({ type: 'tool', name: 'web.search', args: { q: 'b' } })
      return JSON.stringify({ type: 'final', text: 'B 结束' })
    })

    expect(hits).toBe(0)
    expect(a.result.terminal).toBe('done')
    expect(b.result.terminal).toBe('done')
    expect(a.events.filter((e) => e.type === 'done')).toHaveLength(1)
    expect(b.events.filter((e) => e.type === 'done')).toHaveLength(1)
  })

  it('wait_subagent：tool 返回 runId 等待语义时 status + 终态', async () => {
    const registry = createToolRegistry()
    registry.register({
      name: 'research.deep_start',
      description: 'deep',
      sideEffect: 'read',
      parametersSchema: { type: 'object', properties: {} },
      async execute() {
        return { waitSubagent: true, runId: 'run-99', summary: '已启动' }
      },
    })
    const events: AgentEvent[] = []
    const result = await runAgentTurn({
      sessionId: 10,
      userMessage: '深挖 AAA',
      requestId: 'req-wait',
      registry,
      initialPlan: createPlanState({
        steps: [
          createPlanStep({
            stepId: 's1',
            title: '深挖',
            capabilityNeed: ['research.deep_start'],
            completionCriteria: ['深挖完成'],
          }),
        ],
      }),
      goal: createGoalState({ goal: '深挖 AAA', completionCriteria: ['深挖完成'] }),
      onEvent: (e) => events.push(e),
      reasoningCall: async () => JSON.stringify({ type: 'tool', name: 'research.deep_start', args: { symbol: 'AAA' } }),
    })

    expect(result.terminal).toBe('done')
    expect(events.some((e) => e.type === 'status' && e.payload?.decision === 'wait_subagent')).toBe(true)
    expect(result.waitingSubagent?.runId).toBe('run-99')
    expect(events.filter((e) => e.type === 'done')).toHaveLength(1)
  })
})
