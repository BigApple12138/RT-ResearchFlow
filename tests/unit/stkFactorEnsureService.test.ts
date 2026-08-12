import Database from 'better-sqlite3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { runMigrations } from '../../electron/main/database/db'
import { upsertDailyClose } from '../../electron/main/database/dailyCloseCacheRepository'
import { upsertFactor, queryLatestFactor } from '../../electron/main/database/stkFactorCacheRepository'
import {
  isStkFactorCacheStale,
  loadStockFactorWithStaleRefresh,
  resolveFactorExpectedTradeDate,
} from '../../electron/main/services/stkFactorEnsureService'
import type { StkFactorRow } from '../../electron/main/services/tushareService'

vi.mock('../../electron/main/database/dataSourceRepository', () => ({
  getDataSourceConfig: () => ({
    tushareEnabled: true,
    tushareTokenEncrypted: 'enc',
  }),
}))

vi.mock('../../electron/main/utils/apiKeyEncryption', () => ({
  decryptApiKey: () => 'token',
}))

function factorRow(overrides: Partial<StkFactorRow> = {}): StkFactorRow {
  return {
    tsCode: '601016.SH',
    tradeDate: '20260807',
    close: 3.5,
    macdBfq: 0.1,
    macdDifBfq: 0.2,
    macdDeaBfq: 0.1,
    kdjKBfq: 50,
    kdjDBfq: 50,
    kdjBfq: 50,
    rsiBfq6: 44,
    rsiBfq12: 50,
    bollUpperBfq: 4,
    bollMidBfq: 3.5,
    bollLowerBfq: 3,
    maBfq5: 3.5,
    maBfq10: 3.4,
    maBfq20: 3.3,
    maBfq60: 3.2,
    turnoverRate: 2,
    volumeRatio: 1,
    updays: 1,
    downdays: 0,
    ...overrides,
  }
}

describe('stkFactorEnsureService', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    runMigrations(db)
  })

  it('缓存日落后期望日判定为 stale', () => {
    expect(isStkFactorCacheStale('20260807', '20260811')).toBe(true)
    expect(isStkFactorCacheStale('20260811', '20260811')).toBe(false)
    expect(isStkFactorCacheStale(null, '20260811')).toBe(true)
  })

  it('期望日取个股日线与市场参考的较新者', () => {
    upsertDailyClose(db, [{
      tsCode: '601016.SH', tradeDate: '20260811',
      open: 3, high: 4, low: 3, close: 3.6, pctChg: 1, vol: 1, turnoverRate: 1,
    }])
    expect(resolveFactorExpectedTradeDate(db, '601016.SH', '20260810')).toBe('20260811')
    expect(resolveFactorExpectedTradeDate(db, '601016.SH', '20260812')).toBe('20260812')
  })

  it('缓存落后时补拉并写入更新', async () => {
    upsertFactor(db, factorRow({ tradeDate: '20260807' }))
    const fetchFactor = vi.fn(async (_t: string, _c: string, date?: string) =>
      factorRow({ tradeDate: date ?? '20260811', macdBfq: 0.99 }),
    )
    const result = await loadStockFactorWithStaleRefresh(db, '601016.SH', undefined, {
      marketLatestTradeDate: '20260811',
      fetchFactor,
    })
    expect(result).toMatchObject({ ok: true, refreshed: true, data: { tradeDate: '20260811', macdBfq: 0.99 } })
    expect(fetchFactor).toHaveBeenCalled()
    expect(queryLatestFactor(db, '601016.SH')?.tradeDate).toBe('20260811')
  })

  it('缓存已追上期望日则不请求上游', async () => {
    upsertFactor(db, factorRow({ tradeDate: '20260811' }))
    const fetchFactor = vi.fn()
    const result = await loadStockFactorWithStaleRefresh(db, '601016.SH', undefined, {
      marketLatestTradeDate: '20260811',
      fetchFactor,
    })
    expect(result).toMatchObject({ ok: true, refreshed: false, data: { tradeDate: '20260811' } })
    expect(fetchFactor).not.toHaveBeenCalled()
  })

  it('补拉失败时回退旧缓存', async () => {
    upsertFactor(db, factorRow({ tradeDate: '20260807' }))
    const fetchFactor = vi.fn(async () => null)
    const result = await loadStockFactorWithStaleRefresh(db, '601016.SH', undefined, {
      marketLatestTradeDate: '20260811',
      fetchFactor,
    })
    expect(result).toMatchObject({ ok: true, refreshed: false, data: { tradeDate: '20260807' } })
  })
})
