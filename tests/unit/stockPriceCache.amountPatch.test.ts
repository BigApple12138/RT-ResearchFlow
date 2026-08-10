import Database from 'better-sqlite3'
import { beforeEach, describe, expect, it } from 'vitest'
import { runMigrations } from '../../electron/main/database/db'
import {
  insertPricesIfMissing,
  patchMissingAmounts,
} from '../../electron/main/database/stockPriceCacheRepository'

describe('stock_price_cache amount 补写', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    runMigrations(db)
  })

  it('INSERT OR IGNORE 留下的 amount NULL 可由 patchMissingAmounts 补真实额', () => {
    insertPricesIfMissing(db, [
      {
        stockCode: '002628',
        tradeDate: '20260810',
        open: 4.92,
        high: 5.15,
        low: 4.9,
        close: 4.97,
        volume: 256417,
        amount: null,
        fetchedAt: 1,
      },
    ])

    // 模拟日线同步：再次 IGNORE 不会覆盖空额
    insertPricesIfMissing(db, [
      {
        stockCode: '002628',
        tradeDate: '20260810',
        open: 4.92,
        high: 5.15,
        low: 4.9,
        close: 4.97,
        volume: 256417,
        amount: 113651.6,
        fetchedAt: 2,
      },
    ])
    const before = db
      .prepare('SELECT amount FROM stock_price_cache WHERE stockCode = ? AND tradeDate = ?')
      .get('002628', '20260810') as { amount: number | null }
    expect(before.amount).toBeNull()

    const patched = patchMissingAmounts(db, [
      { stockCode: '002628', tradeDate: '20260810', amount: 113651.6, fetchedAt: 3 },
    ])
    expect(patched).toBe(1)

    const after = db
      .prepare('SELECT amount, fetchedAt FROM stock_price_cache WHERE stockCode = ? AND tradeDate = ?')
      .get('002628', '20260810') as { amount: number; fetchedAt: number }
    expect(after.amount).toBe(113651.6)
    expect(after.fetchedAt).toBe(3)
  })

  it('已有 amount 时 patchMissingAmounts 不覆盖', () => {
    insertPricesIfMissing(db, [
      {
        stockCode: '002628',
        tradeDate: '20260807',
        open: 4.9,
        high: 5,
        low: 4.8,
        close: 4.92,
        volume: 234876,
        amount: 100,
        fetchedAt: 1,
      },
    ])
    const patched = patchMissingAmounts(db, [
      { stockCode: '002628', tradeDate: '20260807', amount: 999, fetchedAt: 9 },
    ])
    expect(patched).toBe(0)
    const row = db
      .prepare('SELECT amount FROM stock_price_cache WHERE stockCode = ? AND tradeDate = ?')
      .get('002628', '20260807') as { amount: number }
    expect(row.amount).toBe(100)
  })
})
