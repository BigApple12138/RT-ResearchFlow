import type Database from 'better-sqlite3'
import {
  getAllTrendWatchStocks,
} from '../database/trendWatchlistRepository'
import {
  listWatchlistCategoryMapRules,
} from '../database/watchlistCategoryMapRepository'
import {
  mapWatchlistCategory,
  type WatchlistCategoryTags,
} from './watchlistCategoryMap'
import { normalizeWatchlistTsCode } from '../../../src/components/TrendWatcher/trendWatchlistCategoryTree'
import { isValidWatchlistCategoryPairInDb } from '../database/watchlistCategoryTreeRepository'

const EASTMONEY_QUOTE_API = 'https://push2.eastmoney.com/api/qt/stock/get'
const COMPANY_SURVEY_URL = 'https://emweb.securities.eastmoney.com/PC_HSF10/CompanySurvey/PageAjax'
const CORE_CONCEPTION_URL = 'https://emweb.securities.eastmoney.com/PC_HSF10/CoreConception/PageAjax'
const SUGGEST_TIMEOUT_MS = 4_000

export type WatchlistCategorySuggestSource = 'watchlist' | 'eastmoney-map'

export interface WatchlistCategorySuggestResult {
  category: string | null
  subCategory: string | null
  source: WatchlistCategorySuggestSource | null
  eastmoneyIndustry: string | null
  eastmoneyConcepts: string[]
  matchedKeyword: string | null
  stockName: string | null
}

function normalizeAshareCode(value: string): { stockCode: string; tsCode: string; secid: string; emCode: string } | null {
  const clean = value.trim().toUpperCase()
  const stockCode = clean.replace(/\.(SH|SZ|BJ)$/i, '')
  if (!/^\d{6}$/.test(stockCode)) return null
  const isShanghai = /^(600|601|603|605|688|900)/.test(stockCode)
  const isBeijing = /^(430|830|87|88|89|92)/.test(stockCode)
  const market = isShanghai ? 'SH' : isBeijing ? 'BJ' : 'SZ'
  const marketPrefix = isShanghai ? '1' : '0'
  return {
    stockCode,
    tsCode: `${stockCode}.${market}`,
    secid: `${marketPrefix}.${stockCode}`,
    emCode: `${market}${stockCode}`,
  }
}

async function fetchJson(url: string, signal: AbortSignal): Promise<unknown | null> {
  try {
    const response = await fetch(url, {
      signal,
      headers: { Accept: 'application/json' },
    })
    if (!response.ok) return null
    return await response.json()
  } catch {
    return null
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function textOrEmpty(value: unknown, max = 200): string {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, max)
}

/**
 * 优先报价 f127/f58；不足时用 F10 概况行业 + 核心题材补充。整体受 signal 超时约束。
 */
export async function fetchEastmoneyWatchlistTags(
  tsCode: string,
  options: { signal?: AbortSignal } = {},
): Promise<WatchlistCategoryTags> {
  const normalized = normalizeAshareCode(tsCode)
  if (!normalized) return { industry: '', concepts: [], name: '' }

  const quoteUrl = new URL(EASTMONEY_QUOTE_API)
  quoteUrl.searchParams.set('fltt', '2')
  quoteUrl.searchParams.set('invt', '2')
  quoteUrl.searchParams.set('secid', normalized.secid)
  quoteUrl.searchParams.set('fields', 'f57,f58,f127')
  quoteUrl.searchParams.set('_', String(Date.now()))

  const signal = options.signal ?? AbortSignal.timeout(SUGGEST_TIMEOUT_MS)
  const quoteJson = await fetchJson(quoteUrl.toString(), signal)
  const quoteData = asRecord(asRecord(quoteJson)?.data)
  let industry = textOrEmpty(quoteData?.f127)
  let name = textOrEmpty(quoteData?.f58, 80)
  let concepts: string[] = []

  if (!signal.aborted) {
    const tasks: Array<Promise<void>> = []
    if (!industry) {
      tasks.push((async () => {
        const url = new URL(COMPANY_SURVEY_URL)
        url.searchParams.set('code', normalized.emCode)
        const json = await fetchJson(url.toString(), signal)
        const root = asRecord(json)
        const rows = Array.isArray(root?.jbzl) ? root.jbzl : []
        const row = asRecord(rows[0])
        const fromF10 = textOrEmpty(row?.EM2016)
        if (fromF10) industry = fromF10
        if (!name) name = textOrEmpty(row?.SECURITY_NAME_ABBR, 80)
      })())
    }
    tasks.push((async () => {
      const url = new URL(CORE_CONCEPTION_URL)
      url.searchParams.set('code', normalized.emCode)
      const json = await fetchJson(url.toString(), signal)
      const root = asRecord(json)
      const blocks = Array.isArray(root?.hxtc) ? root.hxtc : []
      const names: string[] = []
      for (const block of blocks) {
        const record = asRecord(block)
        const label = textOrEmpty(record?.BOARD_NAME ?? record?.KEYWORD ?? record?.MAIN_POINT, 80)
        if (label) names.push(label)
        const detail = textOrEmpty(record?.BOARD_RANK ?? record?.CONTENT, 200)
        if (detail) names.push(detail)
      }
      const boards = Array.isArray(root?.ssbk) ? root.ssbk : []
      for (const board of boards) {
        const record = asRecord(board)
        const label = textOrEmpty(record?.BOARD_NAME ?? record?.NEW_BOARD_NAME, 80)
        if (label) names.push(label)
      }
      concepts = [...new Set(names.map((item) => item.trim()).filter(Boolean))].slice(0, 40)
    })())
    await Promise.allSettled(tasks)
  }

  return { industry, concepts, name }
}

function suggestFromWatchlist(
  db: Database.Database,
  tsCode: string,
): WatchlistCategorySuggestResult | null {
  const code = normalizeWatchlistTsCode(tsCode)
  const rows = getAllTrendWatchStocks(db)
    .filter((row) => normalizeWatchlistTsCode(row.tsCode) === code && row.category)
    .sort((a, b) => `${a.category}/${a.subCategory}`.localeCompare(`${b.category}/${b.subCategory}`, 'zh-CN'))
  for (const row of rows) {
    if (!isValidWatchlistCategoryPairInDb(db, row.category, row.subCategory)) continue
    return {
      category: row.category,
      subCategory: row.subCategory,
      source: 'watchlist',
      eastmoneyIndustry: null,
      eastmoneyConcepts: [],
      matchedKeyword: null,
      stockName: row.stockName || null,
    }
  }
  return null
}

export async function suggestWatchlistCategoryFromDb(
  db: Database.Database,
  tsCode: string,
  options: { fetchTags?: typeof fetchEastmoneyWatchlistTags } = {},
): Promise<WatchlistCategorySuggestResult> {
  const normalized = normalizeAshareCode(tsCode)
  const empty: WatchlistCategorySuggestResult = {
    category: null,
    subCategory: null,
    source: null,
    eastmoneyIndustry: null,
    eastmoneyConcepts: [],
    matchedKeyword: null,
    stockName: null,
  }
  if (!normalized) return empty

  const fromWatch = suggestFromWatchlist(db, normalized.tsCode)
  if (fromWatch) return fromWatch

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), SUGGEST_TIMEOUT_MS)
  let tags: WatchlistCategoryTags = { industry: '', concepts: [], name: '' }
  try {
    const fetchTags = options.fetchTags ?? fetchEastmoneyWatchlistTags
    tags = await fetchTags(normalized.tsCode, { signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }

  const rules = listWatchlistCategoryMapRules(db, { enabledOnly: true })
  const hit = mapWatchlistCategory(tags, rules, (category, subCategory) =>
    isValidWatchlistCategoryPairInDb(db, category, subCategory),
  )
  if (!hit) {
    return {
      ...empty,
      eastmoneyIndustry: tags.industry || null,
      eastmoneyConcepts: tags.concepts,
      stockName: tags.name || null,
    }
  }
  return {
    category: hit.category,
    subCategory: hit.subCategory,
    source: 'eastmoney-map',
    eastmoneyIndustry: tags.industry || null,
    eastmoneyConcepts: tags.concepts,
    matchedKeyword: hit.matchedKeyword,
    stockName: tags.name || null,
  }
}
