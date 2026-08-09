import { describe, expect, it } from 'vitest'
import {
  buildWatchlistEntryFromCodes,
  isSyntheticWatchlistName,
  sixDigitToTsCode,
  syntheticCandidateForSixDigit,
} from '../../src/components/TrendWatcher/trendWatchlistAddResolve'

describe('trendWatchlistAddResolve', () => {
  it('maps six-digit codes to exchange suffixes', () => {
    expect(sixDigitToTsCode('600577')).toBe('600577.SH')
    expect(sixDigitToTsCode('000001')).toBe('000001.SZ')
    expect(sixDigitToTsCode('300750')).toBe('300750.SZ')
    expect(sixDigitToTsCode('688981')).toBe('688981.SH')
    expect(sixDigitToTsCode('830799')).toBe('830799.BJ')
    expect(sixDigitToTsCode('abc')).toBeNull()
  })

  it('builds watchlist entry from fetch-style codes', () => {
    expect(buildWatchlistEntryFromCodes('600577', '精达股份')).toEqual({
      tsCode: '600577.SH',
      name: '精达股份',
    })
  })

  it('synthesizes candidate when dictionary is empty', () => {
    expect(syntheticCandidateForSixDigit('600577')).toEqual({
      tsCode: '600577.SH',
      name: '代码 600577',
    })
    expect(syntheticCandidateForSixDigit('茅台')).toBeNull()
    expect(isSyntheticWatchlistName('代码 600577')).toBe(true)
    expect(isSyntheticWatchlistName('精达股份')).toBe(false)
  })
})
