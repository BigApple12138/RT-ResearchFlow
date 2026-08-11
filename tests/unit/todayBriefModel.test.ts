import { describe, expect, it } from 'vitest'
import type { DecisionSignalItem } from '../../src/components/DecisionCenter/SignalCard'
import { buildTodayBriefModel, toTodayBriefAiFacts } from '../../src/components/DecisionCenter/todayBriefModel'
import { buildTodayBriefAiPrompt, assertTodayBriefAiFacts } from '../../electron/main/services/todayBriefAiService'

function signal(partial: Partial<DecisionSignalItem> & Pick<DecisionSignalItem, 'id' | 'title' | 'sourceModule'>): DecisionSignalItem {
  return {
    strategyKey: 'test',
    tsCode: null,
    stockName: null,
    conceptCode: null,
    conceptName: null,
    signalType: 'INFO',
    direction: 'NEUTRAL',
    priority: 3,
    score: null,
    confidence: null,
    summary: '摘要',
    reasonJson: null,
    sourceRefJson: null,
    status: 'NEW',
    signalTime: 1_700_000_000_000,
    ...partial,
  }
}

describe('FR-262 buildTodayBriefModel', () => {
  it('puts portfolio clues first and carries sector evidence into AI facts', () => {
    const model = buildTodayBriefModel([
      signal({
        id: 1,
        title: '持仓风险',
        sourceModule: 'trend',
        signalType: 'RISK',
        direction: 'BEARISH',
        priority: 5,
        tsCode: '600519',
        stockName: '贵州茅台',
        reasonJson: JSON.stringify({ isPortfolio: true }),
      }),
      signal({
        id: 2,
        title: '线下药店 次日竞价待确认',
        sourceModule: 'sector_flow',
        conceptName: '线下药店',
        priority: 4,
        confidence: 92,
        occurrenceCount: 27,
        summary: '板块涨跌 +6.56%',
      }),
      signal({
        id: 3,
        title: '短线线索',
        sourceModule: 'short_term',
        priority: 4,
        tsCode: '000001',
      }),
      signal({
        id: 4,
        title: '资讯噪音',
        sourceModule: 'news',
        priority: 2,
      }),
      signal({
        id: 5,
        title: '另一条噪音',
        sourceModule: 'news',
        priority: 2,
      }),
    ], { now: 100 })

    expect(model.headline).toContain('持仓')
    expect(model.portfolioClues).toHaveLength(1)
    expect(model.sectorClues).toHaveLength(1)
    expect(model.sectorClues[0]?.evidence).toContain('板块涨跌 +6.56%')
    expect(model.sectorClues[0]?.evidence).toContain('置信度 92%')
    expect(model.sectorClues[0]?.evidence).toContain('重复触发 27 次')
    expect(model.marketThemeLine).toContain('线下药店')
    expect(model.strategyClues).toHaveLength(1)

    const facts = toTodayBriefAiFacts(model)
    const prompt = buildTodayBriefAiPrompt(assertTodayBriefAiFacts(facts))
    expect(prompt).toContain('板块涨跌 +6.56%')
    expect(prompt).toContain('置信度 92%')
    expect(prompt).toContain('板块资金/市场信号')
    expect(prompt).toContain('禁止声称「本地未提供具体内容」')
  })

  it('stays honest when only market facts exist', () => {
    const model = buildTodayBriefModel([
      signal({
        id: 10,
        title: '银板块资金',
        sourceModule: 'sector_flow',
        conceptName: '银',
        priority: 4,
        summary: '板块涨跌 +3.26%',
      }),
    ])
    expect(model.portfolioClues).toHaveLength(0)
    expect(model.sectorClues[0]?.evidence).toContain('+3.26%')
    expect(model.marketThemeLine).toContain('银')
    expect(model.headline).toContain('市场')
  })

  it('ignores dismissed and expired signals', () => {
    const model = buildTodayBriefModel([
      signal({ id: 1, title: '已忽略', sourceModule: 'news', status: 'DISMISSED' }),
      signal({ id: 2, title: '已过期', sourceModule: 'short_term', status: 'EXPIRED' }),
    ])
    expect(model.empty).toBe(true)
    expect(model.noiseCount).toBe(0)
  })
})
