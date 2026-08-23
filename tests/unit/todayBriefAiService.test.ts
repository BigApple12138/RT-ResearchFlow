import { describe, expect, it } from 'vitest'
import { buildTodayBriefAiPrompt, assertTodayBriefAiFacts } from '../../electron/main/services/todayBriefAiService'

describe('FR-262 today brief AI prompt', () => {
  it('grounds prompt in local brief facts including sector evidence', () => {
    const facts = assertTodayBriefAiFacts({
      headline: '持仓平稳：先扫市场',
      bullets: ['板块热度：线下药店（板块涨跌 +6.56%）'],
      marketThemeLine: '线下药店（板块涨跌 +6.56%） · 白银',
      portfolioClues: [],
      sectorClues: [{
        kind: 'sector',
        title: '线下药店 次日竞价待确认',
        summary: '板块涨跌 +6.56%',
        evidence: '板块涨跌 +6.56% · 置信度 92% · 重复触发 27 次',
        meta: 'P4 · 板块资金',
        tsCode: null,
        stockName: null,
        conceptName: '线下药店',
        priority: 4,
        confidence: 92,
        occurrenceCount: 27,
      }],
      strategyClues: [{
        kind: 'strategy',
        title: 'MLCC 次日竞价待确认',
        summary: '板块涨跌 +5%',
        evidence: '板块涨跌 +5% · 置信度 90%',
        meta: 'P4 · 短线策略',
        tsCode: null,
        stockName: null,
        conceptName: 'MLCC',
        priority: 4,
        confidence: 90,
        occurrenceCount: 1,
      }],
      peripheralClues: [],
      noiseCount: 2,
      disclaimer: '不构成投资建议',
    })
    const prompt = buildTodayBriefAiPrompt(facts)
    expect(prompt).toContain('板块涨跌 +6.56%')
    expect(prompt).toContain('重复触发 27 次')
    expect(prompt).toContain('MLCC 次日竞价待确认')
    expect(prompt).toContain('禁止给出具体买卖点')
    expect(prompt).toContain('禁止声称「本地未提供具体内容」')
  })
})
