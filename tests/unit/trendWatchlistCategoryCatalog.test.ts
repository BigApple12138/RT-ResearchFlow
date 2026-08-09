import { describe, expect, it } from 'vitest'
import { suggestWatchlistCategoryFromPool } from '../../src/components/TrendWatcher/trendWatchlistCategorySuggest'
import {
  isValidWatchlistCategoryPair,
  WATCHLIST_CATEGORY_TREE,
} from '../../src/components/TrendWatcher/trendWatchlistCategoryTree'

describe('watchlist category pool suggest', () => {
  it('主题树键可用', () => {
    expect(Object.keys(WATCHLIST_CATEGORY_TREE).length).toBeGreaterThan(0)
    expect(isValidWatchlistCategoryPair('CPO', '光模块')).toBe(true)
  })

  it('已在观察池的登记可本地建议', () => {
    expect(suggestWatchlistCategoryFromPool('300308.SZ', [
      { tsCode: '300308.SZ', category: 'PCB', subCategory: '通信/服务器PCB' },
    ])).toEqual({
      category: 'PCB',
      subCategory: '通信/服务器PCB',
      source: 'watchlist',
    })
  })

  it('池外不再走 catalog，返回 null', () => {
    expect(suggestWatchlistCategoryFromPool('300308.sz')).toBeNull()
    expect(suggestWatchlistCategoryFromPool('600000.SH')).toBeNull()
  })
})
