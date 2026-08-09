import Database from 'better-sqlite3'
import { beforeEach, describe, expect, it } from 'vitest'
import { getSession } from '../../electron/main/database/aiAnalysisSessionRepository'
import { getResearchDiscussionContext } from '../../electron/main/database/researchDiscussionRepository'
import { runMigrations } from '../../electron/main/database/db'
import {
  upsertTrendStructureReview,
} from '../../electron/main/database/trendStructureReviewRepository'
import {
  buildTrendReviewFacts,
  hashTrendReviewFacts,
} from '../../electron/main/services/trendStructureReviewService'
import type { TrendWorkbenchSnapshot } from '../../electron/main/services/trendWorkbenchService'
import {
  startTrendReviewDiscussion,
  trendReviewDiscussionKey,
} from '../../electron/main/services/trendReviewDiscussionBridge'

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
    structureReview: null,
    ...overrides,
  }
  return {
    generatedAt: 1_000,
    items: [item] as unknown as TrendWorkbenchSnapshot['items'],
    events: [],
    dataHealth: { total: 1, ready: 1, partial: 0, missing: 0, latestTradeDate: '20260808', benchmark: item.benchmarkHealth },
  }
}

function seedReview(db: Database.Database, snapshot: TrendWorkbenchSnapshot, requestId: string) {
  const facts = buildTrendReviewFacts(db, '600000.SH', () => snapshot)
  const factsHash = hashTrendReviewFacts(facts)
  upsertTrendStructureReview(db, {
    tsCode: facts.tsCode,
    scoreDate: facts.scoreDate,
    factsHash,
    requestId,
    localTrendState: facts.trendState,
    localTotalScore: facts.totalScore,
    verdict: 'agree',
    rationale: '结构仍完整。',
    focusPoints: ['观察量价背离'],
    provider: 'qwen',
    model: 'test-model',
    audit: { status: 'passed' },
    now: 1_000,
  })
  return { facts, factsHash }
}

interface StoredTrendReviewSnapshot {
  schemaVersion: number
  contextKind: string
  trendReview: {
    facts: Record<string, unknown>
    factsHash: string
    verdict: string
    rationale: string
    focusPoints: string[]
  }
}

describe('趋势复核讨论桥接', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    runMigrations(db)
  })

  it('主进程重建白名单事实，固定 reviewKey/返回目标，且首条问题只预填', () => {
    const snapshot = createSnapshot()
    const { facts, factsHash } = seedReview(db, snapshot, '00000000-0000-4000-8000-000000000701')
    const requestId = '00000000-0000-4000-8000-000000000702'
    const started = startTrendReviewDiscussion(db, {
      requestId,
      tsCode: '600000',
      scoreDate: facts.scoreDate,
      factsHash,
      initialQuestion: '请先核对趋势结构中的关键反证。',
      returnTarget: { tab: 'attacker-controlled' },
    }, { getWorkbench: () => snapshot })

    const context = getResearchDiscussionContext(db, started.session.id)!
    const session = getSession(db, started.session.id)!
    const storedSnapshot = JSON.parse(context.context_snapshot_json) as StoredTrendReviewSnapshot

    expect(started.resumed).toBe(false)
    expect(context.origin_type).toBe('manual')
    expect(context.origin_id).toBe(trendReviewDiscussionKey('600000.SH', facts.scoreDate, factsHash))
    expect(started.discussion.returnTarget).toEqual({
      tab: 'trend-watcher', subTab: 'dashboard', entityId: '600000.SH', stateKey: 'trend-radar',
    })
    expect(started.initialQuestion).toBe('请先核对趋势结构中的关键反证。')
    expect(storedSnapshot).toMatchObject({
      schemaVersion: 4,
      contextKind: 'trend_review',
      trendReview: {
        factsHash,
        verdict: 'agree',
        rationale: '结构仍完整。',
        focusPoints: ['观察量价背离'],
      },
    })
    expect(storedSnapshot.trendReview.facts).not.toHaveProperty('costPrice')
    expect(storedSnapshot.trendReview.facts).not.toHaveProperty('profitPct')
    expect(storedSnapshot.trendReview.facts).not.toHaveProperty('positionAdvice')
    expect(context.origin_content_hash).toMatch(/^[a-f0-9]{64}$/)
    expect(session.messages).toBe('[]')
    expect(session.promptSent).toContain('agree')
    expect(session.promptSent).toContain(factsHash)
    expect(session.promptSent).not.toContain('costPrice')
    expect(session.promptSent).not.toContain('positionAdvice')
  })

  it('拒绝非法或过期身份，并且不同 factsHash 不恢复旧复核讨论', () => {
    const firstSnapshot = createSnapshot()
    const first = seedReview(db, firstSnapshot, '00000000-0000-4000-8000-000000000703')
    const firstStarted = startTrendReviewDiscussion(db, {
      requestId: '00000000-0000-4000-8000-000000000704',
      tsCode: '600000.SH', scoreDate: first.facts.scoreDate, factsHash: first.factsHash,
      returnTarget: { tab: 'trend-watcher' },
    }, { getWorkbench: () => firstSnapshot })

    expect(() => startTrendReviewDiscussion(db, {
      requestId: '00000000-0000-4000-8000-000000000705',
      tsCode: '600000.SH', scoreDate: first.facts.scoreDate, factsHash: 'f'.repeat(64),
      returnTarget: { tab: 'trend-watcher' },
    }, { getWorkbench: () => firstSnapshot })).toThrowError(expect.objectContaining({ code: 'STALE_REVIEW' }))
    expect(() => startTrendReviewDiscussion(db, {
      requestId: 'not-a-uuid',
      tsCode: '600000.SH', scoreDate: first.facts.scoreDate, factsHash: first.factsHash,
      returnTarget: { tab: 'trend-watcher' },
    }, { getWorkbench: () => firstSnapshot })).toThrowError(expect.objectContaining({ code: 'INVALID_PARAM' }))

    const changedSnapshot = createSnapshot({ scoreDelta5d: 4 })
    const changed = seedReview(db, changedSnapshot, '00000000-0000-4000-8000-000000000706')
    const secondStarted = startTrendReviewDiscussion(db, {
      requestId: '00000000-0000-4000-8000-000000000707',
      tsCode: '600000.SH', scoreDate: changed.facts.scoreDate, factsHash: changed.factsHash,
      returnTarget: { tab: 'trend-watcher' },
    }, { getWorkbench: () => changedSnapshot })

    expect(changed.factsHash).not.toBe(first.factsHash)
    expect(secondStarted.session.id).not.toBe(firstStarted.session.id)
  })
})
