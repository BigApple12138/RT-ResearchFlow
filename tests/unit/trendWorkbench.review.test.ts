import Database from 'better-sqlite3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { runMigrations } from '../../electron/main/database/db'
import { upsertDailyClose } from '../../electron/main/database/dailyCloseCacheRepository'
import { upsertTrendStructureReview } from '../../electron/main/database/trendStructureReviewRepository'
import { batchAddTrendWatchStocks } from '../../electron/main/database/trendWatchlistRepository'
import { computeTrendScoresOnDemand } from '../../electron/main/services/trendWatchlistService'
import { getTrendWorkbench } from '../../electron/main/services/trendWorkbenchService'
import { buildTrendReviewFacts, hashTrendReviewFacts } from '../../electron/main/services/trendStructureReviewService'

const sharedQuote = vi.hoisted(() => ({ cache: new Map(), cachedAt: Date.now() }))

vi.mock('../../electron/main/services/sharedRtKCache', () => ({
  getRtKCache: () => sharedQuote.cache,
  getRtKCachedAt: () => sharedQuote.cachedAt,
}))

describe('Trend Workbench AI 复核附加字段', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    runMigrations(db)
    db.exec('DELETE FROM trend_watchlist; DELETE FROM trend_scores; DELETE FROM daily_close_cache; DELETE FROM portfolio_stocks;')
    batchAddTrendWatchStocks(db, [{ tsCode: '600001.SH', stockName: '测试股份', category: '测试', subCategory: '趋势' }])
    seedBars(db, '000300.SH', 90, 100, 0.1)
    seedBars(db, '600001.SH', 90, 20, 0.2)
    computeTrendScoresOnDemand(db)
  })

  it('没有复核时返回 null，有匹配 factsHash 时附加摘要且不出现 scoreTradeDate', () => {
    const first = getTrendWorkbench(db)
    expect(first.items[0].structureReview).toBeNull()

    const item = first.items[0]
    const facts = buildTrendReviewFacts(db, item.tsCode, () => first)
    upsertTrendStructureReview(db, {
      tsCode: item.tsCode,
      scoreDate: item.scoreDate,
      factsHash: hashTrendReviewFacts(facts),
      requestId: '00000000-0000-4000-8000-000000000201',
      localTrendState: item.trendState,
      localTotalScore: item.totalScore,
      verdict: 'agree',
      rationale: '结构仍完整。',
      focusPoints: ['观察量价背离'],
      provider: 'qwen',
      model: 'test-model',
      audit: { status: 'passed' },
      now: 1_000,
    })

    const next = getTrendWorkbench(db).items[0]
    expect(next.structureReview).toMatchObject({
      verdict: 'agree',
      scoreDate: item.scoreDate,
      factsHash: hashTrendReviewFacts(facts),
      stale: false,
      source: 'model',
    })
    expect(next).not.toHaveProperty('scoreTradeDate')
  })

  it('确定性门槛复核下发 source=gate，模型复核下发 source=model', () => {
    const first = getTrendWorkbench(db)
    const item = first.items[0]
    const facts = buildTrendReviewFacts(db, item.tsCode, () => first)
    const factsHash = hashTrendReviewFacts(facts)

    upsertTrendStructureReview(db, {
      tsCode: item.tsCode,
      scoreDate: item.scoreDate,
      factsHash,
      requestId: '00000000-0000-4000-8000-000000000203',
      localTrendState: item.trendState,
      localTotalScore: item.totalScore,
      verdict: 'need_more_data',
      rationale: '有效评分权重不足70%，暂不形成趋势结构判断。',
      focusPoints: ['补齐本地行情与评分事实后再复核'],
      provider: null,
      model: null,
      audit: { status: 'passed' },
      now: 1_000,
    })
    expect(getTrendWorkbench(db).items[0].structureReview?.source).toBe('gate')

    // 同 factsHash 会重放既有 revision；换 hash 才能写入带 provider/model 的新 revision
    upsertTrendStructureReview(db, {
      tsCode: item.tsCode,
      scoreDate: item.scoreDate,
      factsHash: 'c'.repeat(64),
      requestId: '00000000-0000-4000-8000-000000000204',
      localTrendState: item.trendState,
      localTotalScore: item.totalScore,
      verdict: 'need_more_data',
      rationale: '证据不足以对抗本地结构标签。',
      focusPoints: [],
      provider: 'qwen',
      model: 'test-model',
      audit: { status: 'passed' },
      now: 2_000,
    })
    const modelReview = getTrendWorkbench(db).items[0].structureReview
    expect(modelReview?.source).toBe('model')
    expect(modelReview?.stale).toBe(true)
  })

  it('当前事实 hash 不同则只标记 stale，不改变本地趋势状态', () => {
    const first = getTrendWorkbench(db)
    const item = first.items[0]
    upsertTrendStructureReview(db, {
      tsCode: item.tsCode,
      scoreDate: item.scoreDate,
      factsHash: 'b'.repeat(64),
      requestId: '00000000-0000-4000-8000-000000000202',
      localTrendState: item.trendState,
      localTotalScore: item.totalScore,
      verdict: 'possible_false_hold',
      rationale: '复核结果。',
      focusPoints: [],
      provider: 'qwen',
      model: 'test-model',
      audit: { status: 'passed' },
      now: 1_000,
    })

    const next = getTrendWorkbench(db).items[0]
    expect(next.structureReview?.stale).toBe(true)
    expect(next.trendState).toBe(item.trendState)
  })
})

function seedBars(db: Database.Database, tsCode: string, count: number, start: number, step: number): void {
  const dates = Array.from({ length: count }, (_, index) => ymdOffset(index - count + 1))
  upsertDailyClose(db, dates.map((tradeDate, index) => {
    const close = start + step * index
    return {
      tsCode, tradeDate, open: close - 0.1, high: close + 0.3, low: close - 0.3, close,
      pctChg: index === 0 ? 0 : step / (close - step) * 100,
      vol: 1_000_000 + index * 1_000, turnoverRate: 1 + index % 4 * 0.05,
    }
  }))
}

function ymdOffset(days: number): string {
  const date = new Date(Date.UTC(2026, 7, 9 + days))
  return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}${String(date.getUTCDate()).padStart(2, '0')}`
}
