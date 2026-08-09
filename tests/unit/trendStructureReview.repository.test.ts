import Database from 'better-sqlite3'
import { randomUUID } from 'crypto'
import { beforeEach, describe, expect, it } from 'vitest'
import { runMigrations } from '../../electron/main/database/db'
import {
  getTrendStructureReviewByCodeDate,
  listTrendStructureReviewsByCodes,
  upsertTrendStructureReview,
} from '../../electron/main/database/trendStructureReviewRepository'

describe('趋势结构复核 Repository', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    runMigrations(db)
  })

  it('按代码和评分日幂等保存，并按代码批量读取', () => {
    const firstInput = {
      tsCode: '600000.SH',
      scoreDate: '20260808',
      factsHash: 'a'.repeat(64),
      requestId: randomUUID(),
      localTrendState: 'strong' as const,
      localTotalScore: 78,
      verdict: 'trend_intact' as const,
      rationale: '趋势结构仍保持完整。',
      focusPoints: ['关注量价是否背离'],
      provider: 'qwen',
      model: 'test-model',
      audit: { status: 'passed', checks: [] },
      now: 1_000,
    }
    const first = upsertTrendStructureReview(db, firstInput)
    const replay = upsertTrendStructureReview(db, {
      ...firstInput,
      rationale: '不应覆盖已完成请求。',
      now: 2_000,
    })
    upsertTrendStructureReview(db, {
      ...firstInput,
      tsCode: '600001.SH',
      requestId: randomUUID(),
      factsHash: 'b'.repeat(64),
      verdict: 'need_more_data',
      rationale: '数据不足。',
      focusPoints: [],
      now: 3_000,
    })

    expect(replay).toEqual(first)
    expect(getTrendStructureReviewByCodeDate(db, '600000.SH', '20260808')).toEqual(first)
    const listed = listTrendStructureReviewsByCodes(db, ['600001.SH', '600000.SH', '000999.SZ'])
    expect(listed.map((item) => item.tsCode)).toEqual(['600000.SH', '600001.SH'])
    expect(db.prepare('SELECT COUNT(*) AS count FROM trend_structure_reviews').get()).toEqual({ count: 2 })
  })

  it('相同代码和评分日的新事实会更新结果但保留首次创建时间', () => {
    const base = {
      tsCode: '600000.SH',
      scoreDate: '20260808',
      factsHash: 'a'.repeat(64),
      requestId: randomUUID(),
      localTrendState: 'strong' as const,
      localTotalScore: 78,
      verdict: 'trend_intact' as const,
      rationale: '旧结果。',
      focusPoints: [],
      provider: null,
      model: null,
      audit: { status: 'passed' },
      now: 1_000,
    }
    const first = upsertTrendStructureReview(db, base)
    const updated = upsertTrendStructureReview(db, {
      ...base,
      requestId: randomUUID(),
      factsHash: 'c'.repeat(64),
      verdict: 'trend_deteriorating',
      rationale: '新结果。',
      now: 2_000,
    })

    expect(updated).toMatchObject({
      tsCode: '600000.SH',
      scoreDate: '20260808',
      factsHash: 'c'.repeat(64),
      verdict: 'trend_deteriorating',
      rationale: '新结果。',
      createdAt: first.createdAt,
      updatedAt: 2_000,
    })
  })
})
