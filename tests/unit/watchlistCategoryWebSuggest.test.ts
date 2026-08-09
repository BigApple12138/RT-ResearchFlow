import Database from 'better-sqlite3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { runMigrations } from '../../electron/main/database/db'
import { clearTrendWatchlist } from '../../electron/main/database/trendWatchlistRepository'
import {
  adoptWebCategorySuggestion,
  webSuggestWatchlistCategory,
} from '../../electron/main/services/watchlistCategoryWebSuggestService'
import { listWatchlistCategoryTree } from '../../electron/main/database/watchlistCategoryTreeRepository'
import { listWatchlistCategoryMapRules } from '../../electron/main/database/watchlistCategoryMapRepository'

describe('watchlistCategoryWebSuggestService', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    runMigrations(db)
    clearTrendWatchlist(db)
  })

  it('mock 搜索命中规则时返回树内 pair；不把 raw 当写入参数', async () => {
    const search = vi.fn(async () => ([
      {
        title: '某光模块公司深度：CPO 与光通信',
        url: 'https://example.com/a',
        snippet: '主营光模块与光器件',
        publishedAt: null,
        providerId: 'tavily' as const,
        query: 'test',
        sourceKind: 'web_search' as const,
        isDetailPage: false,
      },
    ]))

    const result = await webSuggestWatchlistCategory(
      db,
      { tsCode: '300308.SZ', name: '中际旭创' },
      { search },
    )
    expect(search).toHaveBeenCalledTimes(1)
    expect(result.status).toBe('ok')
    expect(result.pair?.category).toBe('CPO')
    expect(result.pair?.subCategory).toBe('光模块')
    expect(result.rawTags.length).toBeGreaterThan(0)
    // adopt 才写树；web suggest 本身不写 watchlist
    expect(listWatchlistCategoryTree(db).自定义题材).toBeUndefined()
  })

  it('无按钮路径：服务未被调用（由 UI 保证）；adopt 写树并可写规则', () => {
    const beforeRules = listWatchlistCategoryMapRules(db).length
    const adopted = adoptWebCategorySuggestion(db, {
      category: '自定义题材',
      subCategory: '精密铜线',
      createMapRule: true,
      keyword: '精密铜线',
    })
    expect(adopted).toEqual({
      ok: true,
      category: '自定义题材',
      subCategory: '精密铜线',
    })
    expect(listWatchlistCategoryTree(db)['自定义题材']).toContain('精密铜线')
    expect(listWatchlistCategoryMapRules(db).length).toBeGreaterThan(beforeRules)
  })
})
