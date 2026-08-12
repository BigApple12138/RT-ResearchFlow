import { describe, expect, it } from 'vitest'
import { projectDeepResearchTurn } from '../../src/components/AIAnalysis/deepResearchTurnModel'

const baseRun = {
  id: 'run-1',
  status: 'running' as const,
  phase: 'tooling' as const,
  question: '对 600000.SH 做深度研究：基本面',
  runKind: 'single_agent' as const,
  resultSemantics: {
    execution: 'running' as const,
    executionLabel: '运行中',
    conclusionCoverage: 'pending' as const,
    conclusionLabel: '结论待形成',
  },
}

describe('projectDeepResearchTurn', () => {
  it('running 时过程默认折叠，标题含深度研究', () => {
    const projection = projectDeepResearchTurn({
      run: baseRun,
      liveProgressMessage: '正在取本地事实',
    })
    expect(projection.thinkingOpenDefault).toBe(false)
    expect(projection.isTerminal).toBe(false)
    expect(projection.title).toMatch(/深度研究/)
    expect(projection.phaseLabel.length).toBeGreaterThan(0)
    expect(projection.statusLabel).toBe('运行中')
    expect(projection.conclusionPreview).toBeNull()
  })

  it('succeeded 时过程仍默认折叠，isTerminal', () => {
    const projection = projectDeepResearchTurn({
      run: {
        ...baseRun,
        status: 'succeeded',
        resultSemantics: {
          execution: 'completed',
          executionLabel: '已完成',
          conclusionCoverage: 'limited',
          conclusionLabel: '结论覆盖受限',
        },
      },
    })
    expect(projection.thinkingOpenDefault).toBe(false)
    expect(projection.isTerminal).toBe(true)
    expect(projection.statusLabel).toBe('已完成')
  })

  it('needs_attention 时过程默认折叠且非终态', () => {
    const projection = projectDeepResearchTurn({
      run: {
        ...baseRun,
        status: 'needs_attention',
        resultSemantics: {
          execution: 'needs_attention',
          executionLabel: '需处理',
          conclusionCoverage: 'blocked',
          conclusionLabel: '结论形成受阻',
        },
      },
    })
    expect(projection.thinkingOpenDefault).toBe(false)
    expect(projection.isTerminal).toBe(false)
  })
})
