import { describe, expect, it } from 'vitest'
import { WATCHLIST_CATEGORY_CATALOG } from '../../src/components/TrendWatcher/trendWatchlistCategoryCatalog.generated'
import { suggestWatchlistCategory } from '../../src/components/TrendWatcher/trendWatchlistCategorySuggest'
import {
  isValidWatchlistCategoryPair,
  WATCHLIST_CATEGORY_TREE,
} from '../../src/components/TrendWatcher/trendWatchlistCategoryTree'

describe('watchlist category catalog', () => {
  it('目录条目都落在 CATEGORY_TREE 内', () => {
    for (const [code, entries] of Object.entries(WATCHLIST_CATEGORY_CATALOG)) {
      expect(code).toMatch(/^\d{6}\.(SH|SZ|BJ)$/)
      for (const entry of entries) {
        expect(isValidWatchlistCategoryPair(entry.category, entry.subCategory)).toBe(true)
        expect(WATCHLIST_CATEGORY_TREE[entry.category]).toContain(entry.subCategory)
      }
    }
  })

  it('中际旭创命中 CPO/光模块', () => {
    expect(suggestWatchlistCategory('300308.sz')).toEqual({
      category: 'CPO',
      subCategory: '光模块',
      source: 'catalog',
    })
  })

  it('未知代码不瞎填', () => {
    expect(suggestWatchlistCategory('600000.SH')).toBeNull()
  })

  it('已在观察池的登记优先于目录', () => {
    expect(suggestWatchlistCategory('300308.SZ', [
      { tsCode: '300308.SZ', category: 'PCB', subCategory: '通信/服务器PCB' },
    ])).toEqual({
      category: 'PCB',
      subCategory: '通信/服务器PCB',
      source: 'watchlist',
    })
  })
})
