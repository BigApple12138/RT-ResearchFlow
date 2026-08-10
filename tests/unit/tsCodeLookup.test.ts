import { describe, expect, it, vi } from 'vitest'
import {
  resolveCanonicalTsCode,
  tsCodeLookupCandidates,
  indexRowsByWatchlistStockCode,
} from '../../electron/main/utils/tsCodeLookup'
import { queryStockOHLCV } from '../../electron/main/database/dailyCloseCacheRepository'
import { queryChips, queryLatestChips } from '../../electron/main/database/cyqChipsCacheRepository'
import { queryFactor, queryFactorHistory } from '../../electron/main/database/stkFactorCacheRepository'

describe('tsCodeLookup', () => {
  it('裸六位解析为带交易所后缀，并保留候选', () => {
    expect(resolveCanonicalTsCode('601016')).toBe('601016.SH')
    expect(resolveCanonicalTsCode('002628')).toBe('002628.SZ')
    expect(tsCodeLookupCandidates('601016')).toEqual(['601016.SH', '601016'])
    expect(tsCodeLookupCandidates('601016.SH')).toEqual(['601016.SH', '601016'])
  })

  it('indexRowsByWatchlistStockCode 可用裸六位命中带后缀 daily 行', () => {
    const map = indexRowsByWatchlistStockCode([
      { tsCode: '002628.SZ', amount: 12345 },
      { tsCode: '600577.SH', amount: 999 },
    ])
    expect(map.get('002628')?.amount).toBe(12345)
    expect(map.get('002628.SZ')?.amount).toBe(12345)
    expect(map.get('600577')?.amount).toBe(999)
    expect(map.get('000609')).toBeUndefined()
  })

  it('queryStockOHLCV 用裸六位也能命中带后缀缓存', () => {
    const all = vi.fn().mockReturnValue([
      {
        ts_code: '601016.SH',
        trade_date: '20260801',
        open: 3.5,
        high: 3.6,
        low: 3.4,
        close: 3.55,
        pct_chg: 1,
        vol: 1,
        turnover_rate: 1,
      },
      {
        ts_code: '601016.SH',
        trade_date: '20260810',
        open: 3.55,
        high: 3.58,
        low: 3.55,
        close: 3.58,
        pct_chg: 0.85,
        vol: 1,
        turnover_rate: 1,
      },
    ])
    const db = { prepare: () => ({ all }) }

    const rows = queryStockOHLCV(db as never, '601016', '20260101')

    expect(all).toHaveBeenCalledWith('601016.SH', '601016', '20260101')
    expect(rows).toHaveLength(2)
    expect(rows[0].tsCode).toBe('601016.SH')
  })

  it('queryChips / queryFactor 用裸六位也能命中带后缀缓存', () => {
    const chipsAll = vi.fn()
      .mockReturnValueOnce([{ price: 3.5, percent: 10 }])
    const chipsGet = vi.fn()
      .mockReturnValueOnce({ trade_date: '20260810' })
    const chipsDb = {
      prepare(sql: string) {
        if (sql.includes('DISTINCT trade_date') || sql.includes('ORDER BY trade_date DESC LIMIT 1')) {
          return { get: chipsGet, all: chipsAll }
        }
        return { all: chipsAll, get: chipsGet }
      },
    }

    expect(queryChips(chipsDb as never, '601016', '20260810')).toEqual([{ price: 3.5, percent: 10 }])
    expect(chipsAll).toHaveBeenCalledWith('601016.SH', '20260810')

    chipsAll.mockReturnValueOnce([{ price: 3.5, percent: 10 }])
    expect(queryLatestChips(chipsDb as never, '601016')?.tradeDate).toBe('20260810')
    expect(chipsGet).toHaveBeenCalledWith('601016.SH')

    const factorRow = {
      ts_code: '601016.SH',
      trade_date: '20260810',
      close: 3.58,
      macd_bfq: null,
      macd_dif_bfq: null,
      macd_dea_bfq: null,
      kdj_k_bfq: null,
      kdj_d_bfq: null,
      kdj_bfq: null,
      rsi_bfq_6: null,
      rsi_bfq_12: null,
      boll_upper_bfq: null,
      boll_mid_bfq: null,
      boll_lower_bfq: null,
      ma_bfq_5: 3.5,
      ma_bfq_10: null,
      ma_bfq_20: null,
      ma_bfq_60: null,
      turnover_rate: null,
      volume_ratio: null,
      updays: null,
      downdays: null,
    }
    const factorGet = vi.fn().mockReturnValueOnce(factorRow)
    const factorAll = vi.fn().mockReturnValueOnce([factorRow])
    const factorDb = {
      prepare() {
        return { get: factorGet, all: factorAll }
      },
    }

    expect(queryFactor(factorDb as never, '601016', '20260810')?.maBfq5).toBe(3.5)
    expect(factorGet).toHaveBeenCalledWith('601016.SH', '20260810')
    expect(queryFactorHistory(factorDb as never, '601016', '20260101')).toHaveLength(1)
    expect(factorAll).toHaveBeenCalledWith('601016.SH', '20260101')
  })
})
