import Database from 'better-sqlite3'
import { beforeEach, describe, expect, it } from 'vitest'
import { runMigrations } from '../../electron/main/database/db'
import {
  listTrackedTsCodes,
  listWatchlistCandidates,
  normalizeAshareTsCode,
} from '../../electron/main/services/watchlistCandidateBridgeService'

describe('watchlistCandidateBridgeService', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    runMigrations(db)
  })

  it('normalizeAshareTsCode 补全交易所后缀', () => {
    expect(normalizeAshareTsCode('600938')).toBe('600938.SH')
    expect(normalizeAshareTsCode('000002')).toBe('000002.SZ')
  })

  it('listTrackedTsCodes 含观察池与持仓', () => {
    db.prepare(`
      INSERT INTO trend_watchlist (ts_code, stock_name, group_tag, added_at, category, sub_category, notes)
      VALUES ('600438.SH', '通威股份', '', 1, '', '', '')
    `).run()
    db.prepare(`
      INSERT INTO portfolio_stocks (ts_code, stock_name, added_at)
      VALUES ('000002.SZ', '万科A', 1)
    `).run()
    const codes = listTrackedTsCodes(db)
    expect(codes).toContain('600438.SH')
    expect(codes).toContain('000002.SZ')
  })

  it('listWatchlistCandidates 排除已在池，按 hitCount 排序', () => {
    db.prepare(`
      INSERT INTO trend_watchlist (ts_code, stock_name, group_tag, added_at, category, sub_category, notes)
      VALUES ('600438.SH', '通威股份', '', 1, '', '', '')
    `).run()
    const insert = db.prepare(`
      INSERT INTO stock_price_cache
        (stockCode, tradeDate, open, high, low, close, volume, amount, fetchedAt)
      VALUES (?, ?, 10, 11, 9, 10.5, 1000, 10000, 1)
    `)
    insert.run('600438', '20260810')
    insert.run('600938', '20260810')
    insert.run('600938', '20260811')
    insert.run('000926', '20260811')
    db.prepare('INSERT INTO stock_info (stockCode, stockName, fetchedAt) VALUES (?, ?, ?)').run('600938', '中国海油', 1)

    const candidates = listWatchlistCandidates(db, { limit: 10, lookbackDays: 30 })
    expect(candidates.every((c) => c.tsCode !== '600438.SH')).toBe(true)
    expect(candidates[0]?.tsCode).toBe('600938.SH')
    expect(candidates[0]?.hitCount).toBe(2)
    expect(candidates[0]?.stockName).toBe('中国海油')
  })
})
