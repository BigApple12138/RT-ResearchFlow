import { afterEach, describe, expect, it, vi } from 'vitest'
import { emptySessionContext } from '../../electron/main/agent/toolRegistry'
import {
  buildResearchDeepStartContext,
  createResearchDeepStartTool,
  extractTsCodesFromText,
  RESEARCH_DEEP_START_BUDGET_VERSION,
  RESEARCH_DEEP_START_TOOL_NAME,
  type ResearchDeepStartResult,
} from '../../electron/main/agent/tools/researchDeepStart'
import {
  hasSubagentContinuationCompleted,
  notifySubagentTerminal,
  registerSubagentContinuation,
  resetSubagentContinuationForTests,
} from '../../electron/main/agent/subagentContinuation'
import {
  resetResearchAgentBridgeForTests,
  subscribeResearchAgentBridge,
} from '../../electron/main/agent/researchAgentBridge'

describe('researchDeepStartContext', () => {
  afterEach(() => {
    resetSubagentContinuationForTests()
    resetResearchAgentBridgeForTests()
  })

  it('默认 isolated：recentMessages 为拷贝且不共享输入引用', () => {
    const session = emptySessionContext({
      sessionId: 3,
      userGoal: '深挖 000001.SZ',
      requestId: 'req-iso',
      asOf: '20260812',
    })
    const source = { role: 'user' as const, content: '深挖 000001.SZ 基本面' }
    const pkg = buildResearchDeepStartContext({
      session,
      messages: [source],
    })
    expect(pkg.contextMode).toBe('isolated')
    expect(pkg.recentMessages[0]).not.toBe(source)
    expect(pkg.recentMessages[0].content).toBe(source.content)
  })

  it('isolated 优先保留硬事实/摘要并限制热尾长度', () => {
    const session = emptySessionContext({
      sessionId: 5,
      userGoal: '深度分析一下',
      requestId: 'req-iso-facts',
    })
    const messages = [
      { role: 'user' as const, content: '【本地持仓事实】tsCode 002628 成都路桥' },
      { role: 'assistant' as const, content: '【累计讨论摘要】已看过持仓。' },
      { role: 'user' as const, content: '闲聊1' },
      { role: 'assistant' as const, content: '闲聊答1' },
      { role: 'user' as const, content: '闲聊2' },
      { role: 'assistant' as const, content: '闲聊答2' },
      { role: 'user' as const, content: '闲聊3' },
      { role: 'assistant' as const, content: '闲聊答3' },
      { role: 'user' as const, content: '深度分析一下' },
    ]
    const pkg = buildResearchDeepStartContext({ session, messages, contextMode: 'isolated' })
    expect(pkg.contextMode).toBe('isolated')
    expect(pkg.recentMessages.length).toBeLessThanOrEqual(6)
    expect(pkg.recentMessages.some((m) => m.content.includes('002628'))).toBe(true)
    expect(pkg.candidateSubjects.some((s) => s.kind === 'stock' && s.tsCode === '002628.SZ')).toBe(true)
  })

  it('显式 fork 时 contextMode=fork', () => {
    const session = emptySessionContext({
      sessionId: 4,
      userGoal: '继续',
      requestId: 'req-fork',
    })
    const pkg = buildResearchDeepStartContext({
      session,
      messages: [{ role: 'user', content: '深挖 600519.SH' }],
      contextMode: 'fork',
    })
    expect(pkg.contextMode).toBe('fork')
  })

  it('上下文包含对话要点与标的提取', () => {
    const session = emptySessionContext({
      sessionId: 42,
      userGoal: '深挖节能风电(601016)近期基本面变化',
      requestId: 'req-ctx-1',
      asOf: '20260812',
    })
    const pkg = buildResearchDeepStartContext({
      session,
      title: '节能风电讨论',
      messages: [
        { role: 'user', content: '先看看持仓' },
        { role: 'assistant', content: '当前持仓含节能风电(601016.SH)等。' },
        { role: 'user', content: '深挖节能风电近期业绩与风险' },
      ],
    })

    expect(pkg.schemaVersion).toBe(1)
    expect(pkg.skipPreflightUi).toBe(true)
    expect(pkg.contextMode).toBe('isolated')
    expect(pkg.sessionId).toBe(42)
    expect(pkg.title).toBe('节能风电讨论')
    expect(pkg.userGoal).toContain('节能风电')
    expect(pkg.asOf).toBe('20260812')
    expect(pkg.recentMessages).toHaveLength(3)
    expect(pkg.recentMessages[2].content).toMatch(/深挖/)
    expect(pkg.candidateSubjects.some((s) => s.kind === 'stock' && s.tsCode === '601016.SH')).toBe(true)
  })

  it('用户仅说深度分析时仍能从历史消息抽出股票主体', () => {
    const session = emptySessionContext({
      sessionId: 9,
      userGoal: '深度分析一下',
      requestId: 'req-inherit',
      asOf: '20260812',
    })
    const pkg = buildResearchDeepStartContext({
      session,
      title: '持仓讨论',
      messages: [
        { role: 'user', content: '【本地持仓事实】tsCode 002628 成都路桥；601016 节能风电' },
        { role: 'assistant', content: '已完成简要研判。' },
        { role: 'user', content: '深度分析一下' },
      ],
      extraTexts: ['深度分析一下'],
    })
    expect(pkg.candidateSubjects.some((s) => s.kind === 'stock' && s.tsCode === '002628.SZ')).toBe(true)
    expect(pkg.candidateSubjects.some((s) => s.kind === 'stock' && s.tsCode === '601016.SH')).toBe(true)
  })

  it('extractTsCodesFromText 支持显式后缀与推断市场', () => {
    const subjects = extractTsCodesFromText('看下 600519.SH 和 000001，以及 920001')
    expect(subjects.map((s) => s.tsCode)).toEqual(['600519.SH', '000001.SZ', '920001.BJ'])
  })

  it('产业项目主体优先于文本股票', () => {
    const session = emptySessionContext({
      sessionId: 7,
      userGoal: '继续深挖本产业项目，顺带提到 600519',
      requestId: 'req-proj',
    })
    const pkg = buildResearchDeepStartContext({
      session,
      messages: [{ role: 'user', content: '深挖 600519' }],
      projectSubject: { kind: 'industry_project', id: 'proj-1', label: '风电产业链' },
    })
    expect(pkg.candidateSubjects).toEqual([
      { kind: 'industry_project', id: 'proj-1', label: '风电产业链' },
    ])
  })

  it('Tool 成功启动返回 waitSubagent/runId，且 sideEffect=network', async () => {
    const startRun = vi.fn(async () => ({ runId: 'run-abc', replayed: false }))
    const tool = createResearchDeepStartTool({
      startRun,
      loadMessages: () => [
        { role: 'user', content: '深挖 600519.SH 的估值与证据缺口' },
      ],
      loadTitle: () => '茅台讨论',
      newRequestId: () => '11111111-1111-4111-8111-111111111111',
    })

    expect(tool.name).toBe(RESEARCH_DEEP_START_TOOL_NAME)
    expect(tool.sideEffect).toBe('network')

    const ctx = emptySessionContext({
      sessionId: 9,
      userGoal: '深挖贵州茅台(600519.SH)',
      requestId: 'agent-req-1',
    })
    const result = (await tool.execute(ctx, {})) as ResearchDeepStartResult
    expect(result.status).toBe('waiting')
    expect(result.runId).toBe('run-abc')
    expect(result.waitSubagent).toEqual({ runId: 'run-abc' })
    expect(result.contextPackage?.skipPreflightUi).toBe(true)
    expect(startRun).toHaveBeenCalledTimes(1)
    expect(startRun.mock.calls[0]![0]).toMatchObject({
      sessionId: 9,
      confirmedBudgetVersion: RESEARCH_DEEP_START_BUDGET_VERSION,
      subjects: [{ kind: 'stock', tsCode: '600519.SH', label: null }],
    })
  })

  it('无标的时失败且不调用 startRun', async () => {
    const startRun = vi.fn()
    const tool = createResearchDeepStartTool({
      startRun,
      loadMessages: () => [{ role: 'user', content: '随便聊聊天气' }],
    })
    const result = (await tool.execute(
      emptySessionContext({ sessionId: 1, userGoal: '你好', requestId: 'r1' }),
      {},
    )) as ResearchDeepStartResult
    expect(result.status).toBe('failed')
    expect(result.errorCode).toBe('NO_SUBJECT')
    expect(startRun).not.toHaveBeenCalled()
  })

  it('成功/失败/取消终态与重复完成通知均不重复 continuation', async () => {
    const calls: string[] = []
    registerSubagentContinuation({
      sessionId: 1,
      runId: 'run-1',
      stepId: 'step-1',
      onTerminal: (status) => {
        calls.push(status)
      },
    })

    const first = await notifySubagentTerminal({
      sessionId: 1,
      runId: 'run-1',
      stepId: 'step-1',
      status: 'succeeded',
    })
    expect(first).toEqual({ accepted: true, first: true })
    expect(calls).toEqual(['succeeded'])
    expect(hasSubagentContinuationCompleted({ sessionId: 1, runId: 'run-1', stepId: 'step-1' })).toBe(true)

    const dup = await notifySubagentTerminal({
      sessionId: 1,
      runId: 'run-1',
      stepId: 'step-1',
      status: 'succeeded',
    })
    expect(dup).toEqual({ accepted: false, reason: 'duplicate' })
    expect(calls).toEqual(['succeeded'])

    // 失败路径：未注册 pending → unknown
    const unknown = await notifySubagentTerminal({
      sessionId: 1,
      runId: 'run-x',
      stepId: 'step-x',
      status: 'failed',
    })
    expect(unknown).toEqual({ accepted: false, reason: 'unknown_pending' })

    // 取消：首次接受
    registerSubagentContinuation({
      sessionId: 2,
      runId: 'run-2',
      stepId: 'step-2',
      onTerminal: (status) => {
        calls.push(`c:${status}`)
      },
    })
    const cancelled = await notifySubagentTerminal({
      sessionId: 2,
      runId: 'run-2',
      stepId: 'step-2',
      status: 'cancelled',
    })
    expect(cancelled.accepted).toBe(true)
    expect(calls).toContain('c:cancelled')
  })

  it('已完成后再次 register 不会重放 continuation（重启恢复安全）', async () => {
    const calls: string[] = []
    registerSubagentContinuation({
      sessionId: 3,
      runId: 'run-3',
      stepId: 'step-3',
      onTerminal: () => {
        calls.push('first')
      },
    })
    await notifySubagentTerminal({
      sessionId: 3,
      runId: 'run-3',
      stepId: 'step-3',
      status: 'failed',
    })
    registerSubagentContinuation({
      sessionId: 3,
      runId: 'run-3',
      stepId: 'step-3',
      onTerminal: () => {
        calls.push('replay')
      },
    })
    const again = await notifySubagentTerminal({
      sessionId: 3,
      runId: 'run-3',
      stepId: 'step-3',
      status: 'failed',
    })
    expect(again.reason).toBe('duplicate')
    expect(calls).toEqual(['first'])
  })

  it('桥接 hook 可订阅 progress', () => {
    const seen: string[] = []
    subscribeResearchAgentBridge((kind, event) => {
      seen.push(`${kind}:${String(event.runId)}`)
    })
    const tool = createResearchDeepStartTool({
      startRun: async () => ({ runId: 'run-bridge' }),
      loadMessages: () => [{ role: 'user', content: '深挖 000001.SZ' }],
    })
    return tool
      .execute(emptySessionContext({ sessionId: 4, userGoal: '深挖平安银行 000001.SZ', requestId: 'rb' }), {})
      .then((result) => {
        expect((result as ResearchDeepStartResult).runId).toBe('run-bridge')
        expect(seen.some((s) => s.startsWith('progress:run-bridge'))).toBe(true)
      })
  })
})
