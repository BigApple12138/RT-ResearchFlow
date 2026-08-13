import { describe, expect, it } from 'vitest'
import {
  buildTrendReviewFactsFromItem,
  deriveImpliedScore,
  hashTrendReviewFacts,
  parseAiTrendReviewBundle,
  parseAiTrendScoreAssessment,
  type TrendReviewFacts,
  type TrendWorkbenchItem,
} from '../../electron/main/services/trendStructureReviewTypes'

function buildItem(overrides: Partial<TrendWorkbenchItem> = {}): TrendWorkbenchItem {
  return {
    tsCode: '600000.SH',
    stockCode: '600000',
    stockName: '浦发银行',
    categories: [],
    subCategories: [],
    groupTags: [],
    notes: [],
    isPortfolio: true,
    costPrice: 8.5,
    profitPct: 12.3,
    positionAdvice: 'HOLD',
    positionAdviceReason: '本地规则',
    chip: null,
    totalScore: 78,
    maScore: 80,
    maAbove60: true,
    alphaScore: 75,
    drawdown: 4.2,
    turnoverRatio: 66,
    macdAboveZero: true,
    bollAboveMid: true,
    price: 9.5,
    change: 1.2,
    dataSource: 'eod',
    dataTime: '20260808',
    scoreSource: 'eod',
    scoreDate: '20260808',
    quoteSource: 'eod',
    quoteTime: '20260808',
    scoreVersion: 'v2',
    validWeight: 1,
    scoreDelta5d: 3,
    scoreDelta20d: 8,
    trendState: 'strong',
    scoreHistory: [
      { tradeDate: '20260801', totalScore: 75 },
      { tradeDate: '20260808', totalScore: 78 },
    ],
    dataCoverage: { bars: 90, requiredBars: 60, latestTradeDate: '20260808', state: 'ready' },
    dimensions: {
      maArrangement: 80, maAbove60: 100, relativeStrength: 75, drawdownQuality: 78,
      turnoverQuality: 66, macd: 100, boll: 100,
    },
    facts: {
      stockReturn20d: 8, benchmarkReturn20d: 3, excessReturn20d: 5,
      maxDrawdown20d: 4.2, turnoverRatio: 1.1,
    },
    benchmarkHealth: {
      tsCode: '000300.SH', state: 'current', latestTradeDate: '20260808', expectedTradeDate: '20260808',
      bars: 90, requiredBars: 21, calendarSource: 'trade-calendar', refreshOutcome: 'not-needed',
      attempted: false, rowsWritten: 0, errorCode: null, message: '当前',
    },
    ...overrides,
  } as unknown as TrendWorkbenchItem
}

function minimalFacts(overrides: Partial<TrendReviewFacts> = {}): TrendReviewFacts {
  return {
    tsCode: '600000.SH',
    stockName: '浦发银行',
    scoreDate: '20260808',
    scoreSource: 'eod',
    scoreVersion: 'v2',
    trendState: 'strong',
    totalScore: 78,
    scoreDelta5d: 3,
    scoreDelta20d: 8,
    maAbove60: true,
    validWeight: 1,
    dataCoverage: { bars: 90, requiredBars: 60, latestTradeDate: '20260808', state: 'ready' },
    dimensions: {
      maArrangement: 80, maAbove60: 100, relativeStrength: 75, drawdownQuality: 78,
      turnoverQuality: 66, macd: 100, boll: 100,
    },
    maScore: 80,
    alphaScore: 75,
    drawdown: 4.2,
    turnoverRatio: 66,
    macdAboveZero: true,
    bollAboveMid: true,
    facts: {
      stockReturn20d: 8, benchmarkReturn20d: 3, excessReturn20d: 5,
      maxDrawdown20d: 4.2, turnoverRatio: 1.1,
    },
    scoreHistory: [
      { tradeDate: '20260801', totalScore: 75 },
      { tradeDate: '20260808', totalScore: 78 },
    ],
    benchmarkHealth: { state: 'current', message: '当前' },
    ...overrides,
  }
}

describe('AI 趋势分偏差解析', () => {
  it('deriveImpliedScore 将 localScore + delta 钳制到 [0, 100]', () => {
    expect(deriveImpliedScore(78, -5)).toBe(73)
    expect(deriveImpliedScore(59, -5)).toBe(54)
    expect(deriveImpliedScore(95, 10)).toBe(100)
    expect(deriveImpliedScore(5, -10)).toBe(0)
  })

  it('parseAiTrendScoreAssessment 合法分数返回 scored 并派生 impliedScore', () => {
    const result = parseAiTrendScoreAssessment({ scoreDelta: -5, scoreRationale: '量价背离证据偏弱' }, 59)
    expect(result).toEqual({
      status: 'scored',
      localScore: 59,
      scoreDelta: -5,
      scoreRationale: '量价背离证据偏弱',
      impliedScore: 54,
    })
  })

  it('delta 越界返回 invalid', () => {
    expect(parseAiTrendScoreAssessment({ scoreDelta: 16, scoreRationale: '偏高' }, 78).status).toBe('invalid')
    expect(parseAiTrendScoreAssessment({ scoreDelta: -16, scoreRationale: '偏低' }, 78).status).toBe('invalid')
    expect(parseAiTrendScoreAssessment({ scoreDelta: 15.5, scoreRationale: '非整数' }, 78).status).toBe('invalid')
  })

  it('理由缺失或超长返回 invalid', () => {
    expect(parseAiTrendScoreAssessment({ scoreDelta: 5, scoreRationale: '' }, 78).status).toBe('invalid')
    expect(parseAiTrendScoreAssessment({ scoreDelta: 5, scoreRationale: 'x'.repeat(121) }, 78).status).toBe('invalid')
    expect(parseAiTrendScoreAssessment({ scoreDelta: 5 }, 78).status).toBe('invalid')
  })

  it('localScore 为空返回 skipped', () => {
    expect(parseAiTrendScoreAssessment({ scoreDelta: -5, scoreRationale: '理由' }, null).status).toBe('skipped')
  })

  it('scoreAssessment 为空返回 skipped', () => {
    expect(parseAiTrendScoreAssessment(null, 78).status).toBe('skipped')
  })
})

describe('AI 趋势复核 bundle 解析', () => {
  it('bundle 结构同时解析结构与偏差', () => {
    const text = JSON.stringify({
      structure: { verdict: 'agree', rationale: '结构完整。', focusPoints: ['关注量价'] },
      scoreAssessment: { scoreDelta: -5, scoreRationale: '量价偏弱' },
    })
    const bundle = parseAiTrendReviewBundle(text, 78)
    expect(bundle.structure).toEqual({ verdict: 'agree', rationale: '结构完整。', focusPoints: ['关注量价'] })
    expect(bundle.scoreAssessment).toEqual({
      status: 'scored',
      localScore: 78,
      scoreDelta: -5,
      scoreRationale: '量价偏弱',
      impliedScore: 73,
    })
  })

  it('旧扁平 JSON 只有 verdict/rationale/focusPoints 时结构成功、偏差 skipped', () => {
    const text = JSON.stringify({ verdict: 'agree', rationale: '结构完整。', focusPoints: [] })
    const bundle = parseAiTrendReviewBundle(text, 78)
    expect(bundle.structure).toEqual({ verdict: 'agree', rationale: '结构完整。', focusPoints: [] })
    expect(bundle.scoreAssessment.status).toBe('skipped')
  })

  it('delta=16 时偏差 invalid 但结构仍合法', () => {
    const text = JSON.stringify({
      structure: { verdict: 'agree', rationale: '结构完整。', focusPoints: [] },
      scoreAssessment: { scoreDelta: 16, scoreRationale: '越界' },
    })
    const bundle = parseAiTrendReviewBundle(text, 78)
    expect(bundle.structure.verdict).toBe('agree')
    expect(bundle.scoreAssessment.status).toBe('invalid')
  })
})

describe('复核事实包扩包与 hash', () => {
  it('buildTrendReviewFactsFromItem 包含 spec §5 全部字段且不携带敏感字段', () => {
    const facts = buildTrendReviewFactsFromItem(buildItem())
    expect(facts.tsCode).toBe('600000.SH')
    expect(facts.scoreSource).toBe('eod')
    expect(facts.scoreVersion).toBe('v2')
    expect(facts.dimensions).toEqual({
      maArrangement: 80, maAbove60: 100, relativeStrength: 75, drawdownQuality: 78,
      turnoverQuality: 66, macd: 100, boll: 100,
    })
    expect(facts.maScore).toBe(80)
    expect(facts.alphaScore).toBe(75)
    expect(facts.drawdown).toBe(4.2)
    expect(facts.turnoverRatio).toBe(66)
    expect(facts.macdAboveZero).toBe(true)
    expect(facts.bollAboveMid).toBe(true)
    expect(facts.scoreHistory).toEqual([
      { tradeDate: '20260801', totalScore: 75 },
      { tradeDate: '20260808', totalScore: 78 },
    ])
    expect(facts.benchmarkHealth).toEqual({ state: 'current', message: '当前' })

    const serialized = JSON.stringify(facts)
    expect(serialized).not.toContain('costPrice')
    expect(serialized).not.toContain('profitPct')
    expect(serialized).not.toContain('positionAdvice')
    expect(serialized).not.toContain('本地规则')
    expect(serialized).not.toContain('8.5')
  })

  it('扩包后 hash 与瘦包不同，dimensions/scoreHistory 变化会改变 hash', () => {
    const full = minimalFacts()
    const slim = minimalFacts({
      scoreSource: undefined as unknown as 'eod',
      scoreVersion: undefined as unknown as 'v2',
      dimensions: undefined as unknown as TrendReviewFacts['dimensions'],
      maScore: undefined as unknown as number,
      alphaScore: undefined as unknown as number,
      drawdown: undefined as unknown as number,
      turnoverRatio: undefined as unknown as number,
      macdAboveZero: undefined as unknown as boolean,
      bollAboveMid: undefined as unknown as boolean,
      scoreHistory: undefined as unknown as Array<{ tradeDate: string; totalScore: number }>,
      benchmarkHealth: undefined as unknown as TrendReviewFacts['benchmarkHealth'],
    } as unknown as Partial<TrendReviewFacts>)
    expect(hashTrendReviewFacts(full)).not.toBe(hashTrendReviewFacts(slim))
  })

  it('scoreHistory 顺序参与 hash，乱序产生不同 hash', () => {
    const ordered = minimalFacts()
    const reversed = minimalFacts({
      scoreHistory: [...ordered.scoreHistory].reverse(),
    })
    expect(hashTrendReviewFacts(ordered)).not.toBe(hashTrendReviewFacts(reversed))
  })
})
