import { describe, expect, it } from 'vitest'
import {
  buildAgentTimelineModel,
  deriveAgentStatusScroll,
  projectAgentEventToStep,
  type AgentTimelineEvent,
} from '../../src/components/AIAnalysis/agentTimelineModel'

function ev(
  partial: Partial<AgentTimelineEvent> & Pick<AgentTimelineEvent, 'type'>,
): AgentTimelineEvent {
  return {
    requestId: 'req-1',
    sessionId: 1,
    at: 1000,
    ...partial,
  }
}

describe('agentTimelineModel', () => {
  it('投影 plan/status/tool/message 与 HITL 确认条', () => {
    const events: AgentTimelineEvent[] = [
      ev({ type: 'start', at: 1 }),
      ev({
        type: 'plan',
        at: 2,
        payload: {
          revision: 1,
          steps: [
            { stepId: 's1', title: '读持仓' },
            { stepId: 's2', title: '看行情' },
          ],
        },
      }),
      ev({ type: 'tool_call', at: 3, payload: { name: 'local.portfolio_facts', args: { limit: 5 } } }),
      ev({ type: 'tool_result', at: 4, payload: { name: 'local.portfolio_facts', ok: true, summary: '2 只持仓' } }),
      ev({
        type: 'hitl',
        at: 5,
        payload: {
          toolName: 'config.write',
          hitlRequestId: 'hitl-1',
          summary: '确认改配置',
        },
      }),
      ev({ type: 'message', at: 6, payload: { text: '根据持仓……' } }),
      ev({ type: 'done', at: 7 }),
    ]

    const model = buildAgentTimelineModel(events)
    expect(model.requestId).toBe('req-1')
    expect(model.steps.map((s) => s.kind)).toEqual([
      'status',
      'plan',
      'tool',
      'tool',
      'hitl',
      'message',
      'terminal',
    ])
    expect(model.steps.find((s) => s.kind === 'plan')?.detail).toContain('读持仓')
    expect(model.streamingMessage).toContain('根据持仓')
    expect(model.terminal).toBe('done')
    // done 后清掉 pending HITL
    expect(model.pendingHitl).toBeNull()
  })

  it('message stream=delta 只更新 streamingMessage 不占过程步骤', () => {
    const model = buildAgentTimelineModel([
      ev({ type: 'status', payload: { decision: 'continue' } }),
      ev({ type: 'message', payload: { text: '草稿一段', stream: 'delta' } }),
      ev({ type: 'message', payload: { text: '草稿全文', stream: 'delta' } }),
      ev({ type: 'message', payload: { text: '草稿全文', stream: 'final' } }),
    ])
    expect(model.streamingMessage).toBe('草稿全文')
    expect(model.steps.filter((s) => s.kind === 'message')).toHaveLength(1)
    expect(model.steps.find((s) => s.kind === 'message')?.detail).toBe('草稿全文')
  })

  it('HITL 未结束时 pendingHitl 可用', () => {
    const model = buildAgentTimelineModel([
      ev({
        type: 'hitl',
        payload: { hitlRequestId: 'h1', toolName: 'x.write', summary: '确认删除' },
      }),
    ])
    expect(model.pendingHitl?.hitl?.hitlRequestId).toBe('h1')
    expect(model.pendingHitl?.tone).toBe('warning')
  })

  it('联网关闭时给出去设置提示', () => {
    const step = projectAgentEventToStep(
      ev({
        type: 'tool_result',
        payload: {
          name: 'research.deep_start',
          ok: false,
          summary: '联网未授权：工具「research.deep_start」需要开启「允许 Agent 联网」后才能执行',
        },
      }),
      0,
    )
    expect(step?.networkHint).toMatch(/配置中心|允许 Agent 联网/)
    const model = buildAgentTimelineModel([
      ev({
        type: 'tool_result',
        payload: {
          name: 'research.deep_start',
          ok: false,
          summary: 'NETWORK_DISABLED',
        },
      }),
    ])
    expect(model.networkDisabledHint).toMatch(/允许 Agent 联网/)
  })

  it('不展示未知事件；按 requestId 过滤', () => {
    const model = buildAgentTimelineModel(
      [
        ev({ type: 'message', requestId: 'a', payload: { text: 'A' } }),
        ev({ type: 'hidden_thought' as AgentTimelineEvent['type'], requestId: 'a' }),
        ev({ type: 'message', requestId: 'b', payload: { text: 'B' } }),
      ],
      { requestId: 'a' },
    )
    expect(model.steps).toHaveLength(1)
    expect(model.streamingMessage).toBe('A')
  })

  it('deriveAgentStatusScroll 只露短状态行', () => {
    const model = buildAgentTimelineModel([
      ev({ type: 'status', at: 1, payload: { decision: '正在校验上下文' } }),
      ev({ type: 'tool_call', at: 2, payload: { name: 'company.fundamentals_refresh', args: {} } }),
      ev({ type: 'status', at: 3, payload: { decision: '规划下一步…' } }),
    ])
    const scroll = deriveAgentStatusScroll(model)
    expect(scroll.running).toBe(true)
    expect(scroll.primary).toContain('规划下一步')
    expect(scroll.secondary.length).toBeGreaterThan(0)
    expect(scroll.secondary.length).toBeLessThanOrEqual(2)
  })
})
