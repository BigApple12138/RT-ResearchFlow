import { describe, expect, it } from 'vitest'
import { resolveDisplayQuote } from '../../electron/main/services/trendWatchlistService'

describe('resolveDisplayQuote', () => {
  it('优先 rt_k，并标记 realtime', () => {
    expect(
      resolveDisplayQuote({
        hasRealtimeEntry: true,
        rtPrice: 10.2,
        rtChange: -0.5,
        scorePrice: 9.9,
        scoreChange: 1,
        eodPrice: 9.8,
        eodChange: 0.2,
      })
    ).toEqual({ price: 10.2, change: -0.5, quoteSource: 'realtime' })
  })

  it('无 rt_k 时用评分缓存价，标记 eod', () => {
    expect(
      resolveDisplayQuote({
        hasRealtimeEntry: false,
        rtPrice: null,
        rtChange: null,
        scorePrice: 11,
        scoreChange: 1.5,
        eodPrice: 10,
        eodChange: 0.1,
      })
    ).toEqual({ price: 11, change: 1.5, quoteSource: 'eod' })
  })

  it('无 rt_k 且无评分缓存价时回退本地 eod', () => {
    expect(
      resolveDisplayQuote({
        hasRealtimeEntry: false,
        rtPrice: null,
        rtChange: null,
        scorePrice: null,
        scoreChange: null,
        eodPrice: 8.5,
        eodChange: -1.2,
      })
    ).toEqual({ price: 8.5, change: -1.2, quoteSource: 'eod' })
  })

  it('全部缺失时保持空态', () => {
    expect(
      resolveDisplayQuote({
        hasRealtimeEntry: false,
        rtPrice: null,
        rtChange: null,
        scorePrice: null,
        scoreChange: null,
        eodPrice: null,
        eodChange: null,
      })
    ).toEqual({ price: null, change: null, quoteSource: 'eod' })
  })
})
