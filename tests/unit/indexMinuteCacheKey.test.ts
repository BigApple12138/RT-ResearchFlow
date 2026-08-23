import Database from 'better-sqlite3'
import { beforeEach, describe, expect, it } from 'vitest'
import { runMigrations } from '../../electron/main/database/db'
import {
  getStockMinuteByDate,
  upsertStockMinute,
} from '../../electron/main/database/stockMinuteCacheRepository'
import type { StockMinuteCacheRow } from '../../electron/main/database/types'

// 指数分钟缓存键策略：指数以带后缀 tsCode（000001.SH）作 stock_minute_cache 键，
// 与平安银行裸键 000001 并存同一表、互不串读（设计稿 §4，Migration 031 建表）。

function makeRow(stockCode: string, tradeDate: string, tsMinute: string, close: number): StockMinuteCacheRow {
  return {
    stockCode,
    tradeDate,
    tsMinute,
    open: close - 0.01,
    high: close + 0.01,
    low: close - 0.02,
    close,
    vol: 1000,
    amount: 500,
    fetchedAt: 1,
  }
}

describe('stock_minute_cache 指数带后缀键隔离', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    runMigrations(db)
  })

  it('指数以带后缀键写入并可原样读回', () => {
    const rows = [
      makeRow('000001.SH', '20260813', '09:31', 3210.5),
      makeRow('000001.SH', '20260813', '09:32', 3212.1),
    ]
    upsertStockMinute(db, rows)

    const got = getStockMinuteByDate(db, '000001.SH', '20260813')
    expect(got).toHaveLength(2)
    expect(got.map((r) => r.stockCode)).toEqual(['000001.SH', '000001.SH'])
    expect(got.map((r) => r.tsMinute)).toEqual(['09:31', '09:32'])
    expect(got.map((r) => r.close)).toEqual([3210.5, 3212.1])
  })

  it('指数键 000001.SH 与平安银行裸键 000001 同表同日并存、互不覆盖互不串读', () => {
    upsertStockMinute(db, [
      makeRow('000001.SH', '20260813', '09:31', 3210.5),
      makeRow('000001.SH', '20260813', '09:32', 3212.1),
    ])
    upsertStockMinute(db, [
      makeRow('000001', '20260813', '09:31', 11.5),
      makeRow('000001', '20260813', '09:32', 11.6),
      makeRow('000001', '20260813', '09:33', 11.7),
    ])

    const indexRows = getStockMinuteByDate(db, '000001.SH', '20260813')
    const bankRows = getStockMinuteByDate(db, '000001', '20260813')

    expect(indexRows).toHaveLength(2)
    expect(bankRows).toHaveLength(3)
    expect(indexRows.map((r) => r.close)).toEqual([3210.5, 3212.1])
    expect(bankRows.map((r) => r.close)).toEqual([11.5, 11.6, 11.7])
  })

  it('重复 upsert 同一 (指数键, 交易日, ts_minute) 幂等（行数不增、值覆盖）', () => {
    upsertStockMinute(db, [makeRow('000001.SH', '20260813', '09:31', 3210.5)])
    upsertStockMinute(db, [makeRow('000001.SH', '20260813', '09:31', 3211.9)])

    const got = getStockMinuteByDate(db, '000001.SH', '20260813')
    expect(got).toHaveLength(1)
    expect(got[0].close).toBe(3211.9)
  })
})
