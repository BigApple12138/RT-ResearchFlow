import Database from 'better-sqlite3'
import { beforeEach, describe, expect, it } from 'vitest'
import { runMigrations } from '../../electron/main/database/db'
import {
  countWatchlistCategoryNodeReferences,
  deleteWatchlistCategoryNode,
  listWatchlistCategoryNodes,
  listWatchlistCategoryTree,
  renameWatchlistCategoryNode,
  upsertWatchlistCategoryNode,
} from '../../electron/main/database/watchlistCategoryTreeRepository'
import {
  listWatchlistCategoryMapRules,
  upsertWatchlistCategoryMapRule,
} from '../../electron/main/database/watchlistCategoryMapRepository'
import { batchAddTrendWatchStocks, clearTrendWatchlist, getAllTrendWatchStocks } from '../../electron/main/database/trendWatchlistRepository'

describe('watchlist_category_nodes repository', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    runMigrations(db)
    clearTrendWatchlist(db)
  })

  it('Migration 145 灌入与种子树等价节点', () => {
    const nodes = listWatchlistCategoryNodes(db)
    expect(nodes.length).toBe(41)
    const tree = listWatchlistCategoryTree(db)
    expect(tree.CPO).toContain('光模块')
    expect(tree.PCB).toContain('覆铜板（CCL）')
  })

  it('无引用可直接删除；有引用禁删；清空后可删', () => {
    const created = upsertWatchlistCategoryNode(db, {
      category: '测试分类',
      subCategory: '测试赛道',
    })
    expect(created.ok).toBe(true)
    expect(deleteWatchlistCategoryNode(db, {
      category: '测试分类',
      subCategory: '测试赛道',
    })).toEqual({ ok: true })

    upsertWatchlistCategoryNode(db, { category: '测试分类', subCategory: '测试赛道' })
    batchAddTrendWatchStocks(db, [{
      tsCode: '600577.SH',
      stockName: '精达股份',
      category: '测试分类',
      subCategory: '测试赛道',
    }])
    upsertWatchlistCategoryMapRule(db, {
      keyword: '精达',
      matchField: 'name',
      category: '测试分类',
      subCategory: '测试赛道',
      priority: 10,
    })
    const blocked = deleteWatchlistCategoryNode(db, {
      category: '测试分类',
      subCategory: '测试赛道',
    })
    expect(blocked.ok).toBe(false)
    if (!blocked.ok) {
      expect(blocked.code).toBe('IN_USE')
      expect(blocked.refs?.inUseWatchlist).toBeGreaterThan(0)
      expect(blocked.refs?.inUseRules).toBeGreaterThan(0)
    }

    const cleared = deleteWatchlistCategoryNode(db, {
      category: '测试分类',
      subCategory: '测试赛道',
      clearReferences: true,
    })
    expect(cleared).toEqual({ ok: true })
    expect(getAllTrendWatchStocks(db)[0]?.category).toBe('')
    expect(listWatchlistCategoryMapRules(db).some((rule) => rule.category === '测试分类')).toBe(false)
    expect(countWatchlistCategoryNodeReferences(db, '测试分类', '测试赛道')).toEqual({
      inUseWatchlist: 0,
      inUseRules: 0,
    })
  })

  it('rename 级联 watchlist 与 rules', () => {
    batchAddTrendWatchStocks(db, [{
      tsCode: '300308.SZ',
      stockName: '中际旭创',
      category: 'CPO',
      subCategory: '光模块',
    }])
    const renamed = renameWatchlistCategoryNode(db, {
      from: { category: 'CPO', subCategory: '光模块' },
      to: { category: 'CPO', subCategory: '高速光模块' },
    })
    expect(renamed).toEqual({ ok: true })
    expect(getAllTrendWatchStocks(db)[0]?.subCategory).toBe('高速光模块')
    expect(listWatchlistCategoryTree(db).CPO).toContain('高速光模块')
    expect(listWatchlistCategoryTree(db).CPO).not.toContain('光模块')
  })
})
