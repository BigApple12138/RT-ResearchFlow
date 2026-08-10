import Database from 'better-sqlite3'
import { randomUUID } from 'crypto'
import { beforeEach, describe, expect, it } from 'vitest'
import { DATABASE_MIGRATIONS, runMigrations } from '../../electron/main/database/db'
import {
  getTrendStructureReviewByCodeDate,
  getTrendStructureReviewByRequestId,
  listTrendStructureReviewRevisionsByCodeDate,
  listTrendStructureReviewsByCodes,
  saveTrendStructureReview,
} from '../../electron/main/database/trendStructureReviewRepository'

describe('趋势结构复核 Repository', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    runMigrations(db)
  })

  it('按代码、评分日和事实 hash 保存不可变 revision，并按代码批量读取最新 projection', () => {
    const firstInput = {
      tsCode: '600000.SH',
      scoreDate: '20260808',
      factsHash: 'a'.repeat(64),
      requestId: randomUUID(),
      localTrendState: 'strong' as const,
      localTotalScore: 78,
      verdict: 'agree' as const,
      rationale: '趋势结构仍保持完整。',
      focusPoints: ['关注量价是否背离'],
      provider: 'qwen',
      model: 'test-model',
      audit: { status: 'passed', checks: [] },
      now: 1_000,
    }
    const first = saveTrendStructureReview(db, firstInput)
    const replay = saveTrendStructureReview(db, {
      ...firstInput,
      rationale: '不应覆盖已完成请求。',
      now: 2_000,
    })
    saveTrendStructureReview(db, {
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
    expect(db.prepare('SELECT COUNT(*) AS count FROM trend_structure_review_revisions').get()).toEqual({ count: 2 })
  })

  it('相同代码和评分日的新事实新增 revision，旧审计记录不被覆盖', () => {
    const base = {
      tsCode: '600000.SH',
      scoreDate: '20260808',
      factsHash: 'a'.repeat(64),
      requestId: randomUUID(),
      localTrendState: 'strong' as const,
      localTotalScore: 78,
      verdict: 'agree' as const,
      rationale: '旧结果。',
      focusPoints: [],
      provider: null,
      model: null,
      audit: { status: 'passed' },
      now: 1_000,
    }
    const first = saveTrendStructureReview(db, base)
    const updated = saveTrendStructureReview(db, {
      ...base,
      requestId: randomUUID(),
      factsHash: 'c'.repeat(64),
      verdict: 'evidence_weak',
      rationale: '新结果。',
      now: 2_000,
    })

    expect(updated).toMatchObject({
      tsCode: '600000.SH',
      scoreDate: '20260808',
      factsHash: 'c'.repeat(64),
      verdict: 'evidence_weak',
      rationale: '新结果。',
      updatedAt: 2_000,
    })
    expect(updated.revisionId).not.toBe(first.revisionId)
    expect(listTrendStructureReviewRevisionsByCodeDate(db, '600000.SH', '20260808').map((item) => item.factsHash))
      .toEqual(['a'.repeat(64), 'c'.repeat(64)])
    expect(db.prepare('SELECT COUNT(*) AS count FROM trend_structure_reviews').get()).toEqual({ count: 1 })
  })

  it('相同 requestId 只接受 tsCode、scoreDate 和 factsHash 全部相同的重放', () => {
    const base = {
      tsCode: '600000.SH', scoreDate: '20260808', factsHash: 'a'.repeat(64), requestId: randomUUID(),
      localTrendState: 'strong' as const, localTotalScore: 78, verdict: 'agree' as const,
      rationale: '结构完整。', focusPoints: [], provider: null, model: null, audit: { status: 'passed' }, now: 1_000,
    }
    saveTrendStructureReview(db, base)

    expect(() => saveTrendStructureReview(db, { ...base, factsHash: 'b'.repeat(64), now: 2_000 }))
      .toThrow('TREND_REVIEW_REQUEST_CONFLICT')
  })

  it('相同事实的每个成功重放 requestId 都不可变绑定到原 revision', () => {
    const firstRequestId = randomUUID()
    const replayRequestId = randomUUID()
    const base = {
      tsCode: '600000.SH', scoreDate: '20260808', factsHash: 'a'.repeat(64), requestId: firstRequestId,
      localTrendState: 'strong' as const, localTotalScore: 78, verdict: 'agree' as const,
      rationale: '结构完整。', focusPoints: [], provider: null, model: null, audit: { status: 'passed' }, now: 1_000,
    }
    const first = saveTrendStructureReview(db, base)
    const replay = saveTrendStructureReview(db, { ...base, requestId: replayRequestId, now: 2_000 })

    expect(replay.revisionId).toBe(first.revisionId)
    expect(getTrendStructureReviewByRequestId(db, replayRequestId)?.revisionId).toBe(first.revisionId)
    expect(db.prepare(`
      SELECT request_id, ts_code, score_trade_date, facts_hash, revision_id
      FROM trend_structure_review_requests ORDER BY created_at, request_id
    `).all()).toEqual([
      {
        request_id: firstRequestId,
        ts_code: '600000.SH',
        score_trade_date: '20260808',
        facts_hash: 'a'.repeat(64),
        revision_id: first.revisionId,
      },
      {
        request_id: replayRequestId,
        ts_code: '600000.SH',
        score_trade_date: '20260808',
        facts_hash: 'a'.repeat(64),
        revision_id: first.revisionId,
      },
    ])
    expect(() => saveTrendStructureReview(db, {
      ...base,
      requestId: replayRequestId,
      factsHash: 'b'.repeat(64),
      now: 3_000,
    })).toThrow('TREND_REVIEW_REQUEST_CONFLICT')
  })

  it('forward migration preserves existing revisions and backfills their request bindings', () => {
    const upgradeDb = new Database(':memory:')
    try {
      runMigrations(upgradeDb, DATABASE_MIGRATIONS.filter((migration) => migration.version <= 142))
      const revisionId = randomUUID()
      const requestId = randomUUID()
      upgradeDb.prepare(`
        INSERT INTO trend_structure_review_revisions (
          id, ts_code, score_trade_date, facts_hash, request_id, local_trend_state,
          local_total_score, ai_verdict, rationale, focus_points_json, provider,
          model, audit_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        revisionId, '600000.SH', '20260808', 'c'.repeat(64), requestId, 'strong',
        78, 'agree', '迁移前 revision。', '[]', null, null, '{}', 1_000,
      )

      runMigrations(upgradeDb)

      expect(upgradeDb.prepare('SELECT id, request_id FROM trend_structure_review_revisions').all())
        .toEqual([{ id: revisionId, request_id: requestId }])
      expect(upgradeDb.prepare(`
        SELECT request_id, ts_code, score_trade_date, facts_hash, revision_id
        FROM trend_structure_review_requests
      `).get()).toEqual({
        request_id: requestId,
        ts_code: '600000.SH',
        score_trade_date: '20260808',
        facts_hash: 'c'.repeat(64),
        revision_id: revisionId,
      })
      expect(upgradeDb.prepare(`
        SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'trend_structure_reviews_legacy'
      `).get()).toEqual({ name: 'trend_structure_reviews_legacy' })
    } finally {
      upgradeDb.close()
    }
  })

  it('旧词表迁移到 legacy 表且不伪装成新词表结果', () => {
    const legacyDb = new Database(':memory:')
    runMigrations(legacyDb, DATABASE_MIGRATIONS.filter((migration) => migration.version <= 139))
    legacyDb.prepare(`
      INSERT INTO trend_structure_reviews (
        ts_code, score_trade_date, facts_hash, request_id, local_trend_state,
        local_total_score, ai_verdict, rationale, focus_points_json, provider,
        model, audit_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      '600000.SH', '20260808', 'd'.repeat(64), randomUUID(), 'strong', 78,
      'trend_deteriorating', '旧词表结果', '[]', 'qwen', 'old-model', '{}', 1_000, 1_000,
    )

    runMigrations(legacyDb)

    expect(legacyDb.prepare('SELECT COUNT(*) AS count FROM trend_structure_reviews_legacy').get()).toEqual({ count: 1 })
    expect(legacyDb.prepare('SELECT COUNT(*) AS count FROM trend_structure_reviews').get()).toEqual({ count: 0 })
  })

  it('forceNewRevision 允许同 factsHash 多条模型 revision，lookup 取最新', () => {
    const base = {
      tsCode: '600000.SH',
      scoreDate: '20260808',
      factsHash: 'a'.repeat(64),
      localTrendState: 'strong' as const,
      localTotalScore: 78,
      verdict: 'agree' as const,
      rationale: '第一次。',
      focusPoints: [] as string[],
      provider: 'qwen',
      model: 'test-model',
      audit: { status: 'passed' },
    }
    const first = saveTrendStructureReview(db, { ...base, requestId: randomUUID(), now: 1_000 })
    const second = saveTrendStructureReview(db, {
      ...base,
      requestId: randomUUID(),
      rationale: '第二次。',
      forceNewRevision: true,
      now: 2_000,
    })

    expect(second.revisionId).not.toBe(first.revisionId)
    expect(getTrendStructureReviewByCodeDate(db, '600000.SH', '20260808')?.revisionId).toBe(second.revisionId)
    expect(listTrendStructureReviewRevisionsByCodeDate(db, '600000.SH', '20260808')).toHaveLength(2)
    expect(db.prepare(`
      SELECT sql FROM sqlite_master
      WHERE type = 'index' AND name = 'idx_trend_structure_review_revisions_code_date_hash'
    `).get()).toEqual(expect.objectContaining({
      sql: expect.not.stringContaining('UNIQUE'),
    }))
  })

  it('migration 147 去掉 code-date-hash UNIQUE 且保留既有 revision', () => {
    const upgradeDb = new Database(':memory:')
    try {
      runMigrations(upgradeDb, DATABASE_MIGRATIONS.filter((migration) => migration.version <= 146))
      const before = upgradeDb.prepare(`
        SELECT sql FROM sqlite_master
        WHERE type = 'index' AND name = 'idx_trend_structure_review_revisions_code_date_hash'
      `).get() as { sql: string }
      expect(before.sql.toUpperCase()).toContain('UNIQUE')

      const revisionId = randomUUID()
      upgradeDb.prepare(`
        INSERT INTO trend_structure_review_revisions (
          id, ts_code, score_trade_date, facts_hash, request_id, local_trend_state,
          local_total_score, ai_verdict, rationale, focus_points_json, provider,
          model, audit_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        revisionId, '600000.SH', '20260808', 'e'.repeat(64), randomUUID(), 'strong',
        78, 'agree', '迁移前。', '[]', 'qwen', 'm', '{}', 1_000,
      )

      runMigrations(upgradeDb)

      const after = upgradeDb.prepare(`
        SELECT sql FROM sqlite_master
        WHERE type = 'index' AND name = 'idx_trend_structure_review_revisions_code_date_hash'
      `).get() as { sql: string }
      expect(after.sql.toUpperCase()).not.toContain('UNIQUE')
      expect(upgradeDb.prepare('SELECT id FROM trend_structure_review_revisions').get())
        .toEqual({ id: revisionId })
    } finally {
      upgradeDb.close()
    }
  })
})
