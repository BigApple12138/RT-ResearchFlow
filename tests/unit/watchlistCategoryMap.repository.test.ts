import Database from 'better-sqlite3'
import { beforeEach, describe, expect, it } from 'vitest'
import { runMigrations } from '../../electron/main/database/db'
import {
  deleteWatchlistCategoryMapRule,
  listWatchlistCategoryMapRules,
  upsertWatchlistCategoryMapRule,
} from '../../electron/main/database/watchlistCategoryMapRepository'
import { suggestWatchlistCategoryFromDb } from '../../electron/main/services/watchlistCategorySuggestService'
import { batchAddTrendWatchStocks, clearTrendWatchlist } from '../../electron/main/database/trendWatchlistRepository'

describe('watchlist_category_map_rules', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    runMigrations(db)
    clearTrendWatchlist(db)
  })

  it('Migration 144 灌入默认可测规则', () => {
    const rules = listWatchlistCategoryMapRules(db)
    expect(rules.length).toBeGreaterThanOrEqual(20)
    expect(rules.some((rule) => rule.keyword.includes('光模块'))).toBe(true)
    expect(rules.some((rule) => rule.keyword.includes('铜箔') || rule.keyword.includes('铜缆'))).toBe(true)
    expect(rules.some((rule) => rule.keyword.includes('算力') || rule.keyword.includes('AI服务器'))).toBe(true)
    expect(rules.some((rule) => rule.keyword.includes('锂'))).toBe(true)
  })

  it('upsert / delete 规则', () => {
    const created = upsertWatchlistCategoryMapRule(db, {
      keyword: '测试概念',
      matchField: 'concept',
      category: 'CPO',
      subCategory: '光器件',
      priority: 50,
    })
    expect(created.ok).toBe(true)
    if (!created.ok) return
    const updated = upsertWatchlistCategoryMapRule(db, {
      id: created.rule.id,
      keyword: '测试概念',
      matchField: 'concept',
      category: 'CPO',
      subCategory: '光模块',
      priority: 60,
      enabled: false,
    })
    expect(updated.ok).toBe(true)
    if (!updated.ok) return
    expect(updated.rule.subCategory).toBe('光模块')
    expect(updated.rule.enabled).toBe(false)
    expect(deleteWatchlistCategoryMapRule(db, created.rule.id)).toEqual({ ok: true })
    expect(listWatchlistCategoryMapRules(db).some((rule) => rule.id === created.rule.id)).toBe(false)
  })

  it('拒绝落在主题树外的 pair', () => {
    const result = upsertWatchlistCategoryMapRule(db, {
      keyword: 'x',
      matchField: 'name',
      category: '虚构',
      subCategory: '也不存在',
    })
    expect(result.ok).toBe(false)
  })

  it('suggest：池内优先于东财映射', async () => {
    batchAddTrendWatchStocks(db, [{
      tsCode: '300308.SZ',
      stockName: '中际旭创',
      category: 'PCB',
      subCategory: '通信/服务器PCB',
    }])
    const result = await suggestWatchlistCategoryFromDb(db, '300308.SZ', {
      fetchTags: async () => ({
        industry: '通信设备',
        concepts: ['光模块'],
        name: '中际旭创',
      }),
    })
    expect(result).toMatchObject({
      source: 'watchlist',
      category: 'PCB',
      subCategory: '通信/服务器PCB',
    })
  })

  it('suggest：东财标签 + 规则命中', async () => {
    const result = await suggestWatchlistCategoryFromDb(db, '300308.SZ', {
      fetchTags: async () => ({
        industry: '通信设备',
        concepts: ['光模块概念'],
        name: '中际旭创',
      }),
    })
    expect(result).toMatchObject({
      source: 'eastmoney-map',
      category: 'CPO',
      subCategory: '光模块',
      matchedKeyword: '光模块',
      eastmoneyIndustry: '通信设备',
    })
  })

  it('suggest：未命中时保留东财行业', async () => {
    const result = await suggestWatchlistCategoryFromDb(db, '600000.SH', {
      fetchTags: async () => ({
        industry: '银行',
        concepts: [],
        name: '浦发银行',
      }),
    })
    expect(result).toMatchObject({
      source: null,
      category: null,
      eastmoneyIndustry: '银行',
    })
  })
})
