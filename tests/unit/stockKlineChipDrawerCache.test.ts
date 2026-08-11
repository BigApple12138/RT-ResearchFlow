import { describe, expect, it, beforeEach } from 'vitest'
import {
  buildDrawerCacheFingerprint,
  clearDrawerCache,
  getDrawerCache,
  hasFreshDrawerCache,
  isDrawerCacheFresh,
  putDrawerCache,
  DRAWER_CACHE_TTL_MS,
} from '../../src/components/shared/stockKlineChipDrawerCache'

describe('stockKlineChipDrawerCache', () => {
  beforeEach(() => {
    clearDrawerCache()
  })

  it('指纹随日K最新日 / 因子日 / 筹码条数变化', () => {
    const a = buildDrawerCacheFingerprint({
      ohlcvRows: [{ tradeDate: '20260810' }, { tradeDate: '20260811' }],
      chips: [{ price: 1, percent: 1 }],
      factor: { tradeDate: '20260810' },
    })
    const b = buildDrawerCacheFingerprint({
      ohlcvRows: [{ tradeDate: '20260810' }, { tradeDate: '20260811' }],
      chips: [{ price: 1, percent: 1 }],
      factor: { tradeDate: '20260811' },
    })
    expect(a).not.toBe(b)
  })

  it('写入后可命中；TTL 内 fresh，超时不 fresh', () => {
    putDrawerCache({
      tsCode: '601016.SH',
      ohlcvRows: [{ tradeDate: '20260811', close: 3.6 } as never],
      chips: [],
      factor: null,
      cachedAt: 1_000,
    })
    expect(getDrawerCache('601016.sh')?.tsCode).toBe('601016.SH')
    expect(isDrawerCacheFresh(getDrawerCache('601016.SH')!, 1_000 + 60_000)).toBe(true)
    expect(hasFreshDrawerCache('601016.SH', 1_000 + DRAWER_CACHE_TTL_MS + 1)).toBe(false)
  })
})
