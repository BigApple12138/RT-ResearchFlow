import Database from 'better-sqlite3'
import { beforeEach, describe, expect, it } from 'vitest'
import { runMigrations } from '../../electron/main/database/db'
import {
  batchAddTrendWatchStocks,
  clearTrendWatchlist,
  countTrendWatchStocks,
  getAllTrendWatchStocks,
} from '../../electron/main/database/trendWatchlistRepository'

describe('clearTrendWatchlist', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    runMigrations(db)
    // 清空种子，便于断言本测试插入的数据
    clearTrendWatchlist(db)
  })

  it('清空全部观察池登记并返回数量', () => {
    batchAddTrendWatchStocks(db, [
      { tsCode: '300308.SZ', stockName: '中际旭创', category: 'CPO', subCategory: '光模块' },
      { tsCode: '300308.SZ', stockName: '中际旭创', category: 'CPO', subCategory: '光器件' },
      { tsCode: '000977.SZ', stockName: '浪潮信息', category: 'AI算力', subCategory: 'AI服务器' },
    ])
    expect(countTrendWatchStocks(db)).toBe(2)
    expect(getAllTrendWatchStocks(db)).toHaveLength(3)

    const result = clearTrendWatchlist(db)
    expect(result.removedStocks).toBe(2)
    expect(result.removedRows).toBe(3)
    expect(countTrendWatchStocks(db)).toBe(0)
    expect(getAllTrendWatchStocks(db)).toHaveLength(0)
  })

  it('空池清空返回 0', () => {
    expect(clearTrendWatchlist(db)).toEqual({ removedRows: 0, removedStocks: 0 })
  })
})
