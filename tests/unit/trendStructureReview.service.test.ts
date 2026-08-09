import Database from 'better-sqlite3'
import { randomUUID } from 'crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { runMigrations } from '../../electron/main/database/db'
import type { TrendWorkbenchSnapshot } from '../../electron/main/services/trendWorkbenchService'
import type { ResearchTextAudit } from '../../electron/main/services/researchEvidenceAuditService'
import {
  buildTrendReviewFacts,
  hashTrendReviewFacts,
  isTrendStructureReviewStale,
  parseAiTrendReviewPayload,
  reviewStructure,
} from '../../electron/main/services/trendStructureReviewService'

function createAudit(status: ResearchTextAudit['status'] = 'passed'): ResearchTextAudit {
  return {
    schemaVersion: 1,
    documentKind: 'discussion',
    status,
    generatedAt: 1_000,
    asOf: '20260808',
    originalTextSha256: 'a'.repeat(64),
    checkedCharacters: 20,
    evidenceSummary: { subjectCount: 1, supporting: 1, challenging: 0, unknowns: 0 },
    checks: [],
  }
}

function createSnapshot(overrides: Record<string, unknown> = {}): TrendWorkbenchSnapshot {
  const item = {
    tsCode: '600000.SH', stockCode: '600000', stockName: '浦发银行',
    categories: ['金融'], subCategories: ['银行'], groupTags: [], notes: [], isPortfolio: true,
    costPrice: 8.5, profitPct: 12.3, positionAdvice: 'HOLD', positionAdviceReason: '本地规则',
    chip: null, totalScore: 78, maScore: 80, maAbove60: true, alphaScore: 75,
    drawdown: 4.2, turnoverRatio: 66, macdAboveZero: true, bollAboveMid: true,
    price: 9.5, change: 1.2, dataSource: 'eod', dataTime: '20260808', scoreSource: 'eod',
    scoreDate: '20260808', quoteSource: 'eod', quoteTime: '20260808', scoreVersion: 'v2', validWeight: 1,
    scoreDelta5d: 3, scoreDelta20d: 8, trendState: 'strong', scoreHistory: [],
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
  }
  return {
    generatedAt: 1_000,
    items: [item] as unknown as TrendWorkbenchSnapshot['items'],
    events: [],
    dataHealth: { total: 1, ready: 1, partial: 0, missing: 0, latestTradeDate: '20260808', benchmark: item.benchmarkHealth },
  }
}

describe('趋势结构复核服务', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    runMigrations(db)
  })

  it('只接受固定五态和有界的结构化字段', () => {
    expect(parseAiTrendReviewPayload(JSON.stringify({
      verdict: 'trend_intact', rationale: '结构仍完整', focusPoints: ['观察量价背离'],
    }))).toEqual({
      verdict: 'trend_intact', rationale: '结构仍完整', focusPoints: ['观察量价背离'],
    })
    expect(() => parseAiTrendReviewPayload('{bad json')).toThrow()
    expect(() => parseAiTrendReviewPayload(JSON.stringify({
      verdict: 'buy', rationale: '结构仍完整', focusPoints: [],
    }))).toThrow()
    expect(() => parseAiTrendReviewPayload(JSON.stringify({
      verdict: 'trend_intact', rationale: 'x'.repeat(2_001), focusPoints: [],
    }))).toThrow()
    expect(() => parseAiTrendReviewPayload(JSON.stringify({
      verdict: 'trend_intact', rationale: '结构仍完整', focusPoints: ['x'.repeat(241)],
    }))).toThrow()
  })

  it('事实构造只输出白名单，不携带持仓成本、浮盈亏、处置建议或原始 workbench 对象', () => {
    const facts = buildTrendReviewFacts(db, '600000.SH', () => createSnapshot())
    const serialized = JSON.stringify(facts)

    expect(facts).toMatchObject({
      tsCode: '600000.SH', stockName: '浦发银行', scoreDate: '20260808', totalScore: 78,
      validWeight: 1, trendState: 'strong',
    })
    expect(facts).not.toHaveProperty('costPrice')
    expect(facts).not.toHaveProperty('profitPct')
    expect(facts).not.toHaveProperty('positionAdvice')
    expect(serialized).not.toContain('本地规则')
    expect(serialized).not.toContain('8.5')
  })

  it('ready 事实调用模型、审计并按 factsHash 幂等保存', async () => {
    const callAI = vi.fn(async () => ({
      provider: 'qwen' as const,
      model: 'test-model',
      text: JSON.stringify({ verdict: 'trend_intact', rationale: '结构仍完整。', focusPoints: ['关注量价背离'] }),
    }))
    const auditText = vi.fn(() => createAudit())
    const requestId = randomUUID()
    const dependencies = {
      getWorkbench: () => createSnapshot(),
      callAI,
      auditText,
      now: () => 1_000,
    }
    const first = await reviewStructure(db, { requestId, tsCode: '600000.SH' }, dependencies)
    const replay = await reviewStructure(db, { requestId, tsCode: '600000.SH' }, dependencies)

    expect(first.review.verdict).toBe('trend_intact')
    expect(first.factsHash).toMatch(/^[a-f0-9]{64}$/)
    expect(first.review.provider).toBe('qwen')
    expect(first.review.model).toBe('test-model')
    expect(first.review.audit).toEqual(createAudit())
    expect(replay).toEqual(first)
    expect(callAI).toHaveBeenCalledTimes(1)
    expect(auditText).toHaveBeenCalledTimes(1)
  })

  it('评分不足时直接落 need_more_data，不调用模型', async () => {
    const callAI = vi.fn()
    const result = await reviewStructure(db, {
      requestId: randomUUID(), tsCode: '600000.SH',
    }, {
      getWorkbench: () => createSnapshot({ totalScore: null, validWeight: 0.5, dataCoverage: {
        bars: 20, requiredBars: 60, latestTradeDate: '20260808', state: 'partial',
      }}),
      callAI,
      auditText: () => createAudit(),
      now: () => 1_000,
    })

    expect(result.review.verdict).toBe('need_more_data')
    expect(result.review.provider).toBeNull()
    expect(callAI).not.toHaveBeenCalled()
  })

  it('审计 blocked 时不写入复核结果', async () => {
    const callAI = vi.fn(async () => ({
      provider: 'qwen' as const,
      model: 'test-model',
      text: JSON.stringify({ verdict: 'trend_intact', rationale: '建议买入并设置目标价。', focusPoints: [] }),
    }))
    await expect(reviewStructure(db, {
      requestId: randomUUID(), tsCode: '600000.SH',
    }, {
      getWorkbench: () => createSnapshot(),
      callAI,
      auditText: () => createAudit('blocked'),
      now: () => 1_000,
    })).rejects.toThrow('AUDIT_BLOCKED')
    expect(db.prepare('SELECT COUNT(*) AS count FROM trend_structure_reviews').get()).toEqual({ count: 0 })
  })

  it('评分日或 factsHash 改变时标记 stale', () => {
    const facts = buildTrendReviewFacts(db, '600000.SH', () => createSnapshot())
    expect(isTrendStructureReviewStale({ scoreDate: facts.scoreDate, factsHash: hashTrendReviewFacts(facts) }, facts)).toBe(false)
    expect(isTrendStructureReviewStale({ scoreDate: '20260807', factsHash: hashTrendReviewFacts(facts) }, facts)).toBe(true)
    expect(isTrendStructureReviewStale({ scoreDate: facts.scoreDate, factsHash: 'c'.repeat(64) }, facts)).toBe(true)
  })
})
