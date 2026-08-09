import type Database from 'better-sqlite3'
import {
  listWatchlistCategoryMapRules,
} from '../database/watchlistCategoryMapRepository'
import {
  isValidWatchlistCategoryPairInDb,
  listWatchlistCategoryTree,
  upsertWatchlistCategoryNode,
} from '../database/watchlistCategoryTreeRepository'
import { upsertWatchlistCategoryMapRule } from '../database/watchlistCategoryMapRepository'
import {
  mapWatchlistCategory,
  type WatchlistCategoryTags,
} from './watchlistCategoryMap'
import { resolveConfiguredResearchAgentSearch } from './researchAgentNetworkTools'
import { runWebSearch, searchWithBuiltinWebTool } from './researchToolRuntime/searchProviders'
import type { ResearchSearchHit } from './researchToolRuntime/types'

const WEB_SUGGEST_TIMEOUT_MS = 8_000

export type WatchlistCategoryWebPending = {
  label: string
  suggestedCategory: string
  suggestedSubCategory: string
}

export type WatchlistCategoryWebSuggestResult = {
  status: 'ok' | 'error'
  pair: { category: string; subCategory: string; matchedKeyword: string | null } | null
  pending: WatchlistCategoryWebPending[]
  rawTags: string[]
  error: string | null
}

export type WebSuggestSearchFn = (query: string) => Promise<ResearchSearchHit[]>

function extractCandidateTags(hits: ResearchSearchHit[]): string[] {
  const tags: string[] = []
  for (const hit of hits) {
    for (const chunk of [hit.title, hit.snippet].filter(Boolean) as string[]) {
      const parts = chunk
        .split(/[\s,，、|｜/／;；:：·\-—()（）\[\]【】]+/)
        .map((part) => part.trim())
        .filter((part) => part.length >= 2 && part.length <= 40)
      tags.push(...parts)
    }
  }
  return [...new Set(tags)].slice(0, 40)
}

function findTreePairFromText(
  tree: Record<string, string[]>,
  haystack: string,
): { category: string; subCategory: string; matchedKeyword: string } | null {
  const lower = haystack.toLowerCase()
  for (const [category, subs] of Object.entries(tree)) {
    for (const sub of subs) {
      if (sub && lower.includes(sub.toLowerCase())) {
        return { category, subCategory: sub, matchedKeyword: sub }
      }
    }
    if (category && lower.includes(category.toLowerCase())) {
      return { category, subCategory: '', matchedKeyword: category }
    }
  }
  return null
}

async function defaultSearch(db: Database.Database, query: string): Promise<ResearchSearchHit[]> {
  const credentials = resolveConfiguredResearchAgentSearch(db)
  if (credentials) {
    return runWebSearch({
      providerId: credentials.providerId,
      apiKey: credentials.apiKey,
      baseUrl: credentials.baseUrl,
      query,
      maxResults: 6,
      depth: 'basic',
    })
  }
  return searchWithBuiltinWebTool(query, 6)
}

/**
 * 显式授权联网补充分类：复用研究搜索；结果可为树内 pair + 会话内 pending。
 * raw 标签不会自动写入观察池。
 */
export async function webSuggestWatchlistCategory(
  db: Database.Database,
  input: { tsCode: string; name?: string },
  options: { search?: WebSuggestSearchFn } = {},
): Promise<WatchlistCategoryWebSuggestResult> {
  const tsCode = typeof input.tsCode === 'string' ? input.tsCode.trim() : ''
  const name = typeof input.name === 'string' ? input.name.trim() : ''
  if (!tsCode) {
    return { status: 'error', pair: null, pending: [], rawTags: [], error: 'tsCode required' }
  }

  const tree = listWatchlistCategoryTree(db, { enabledOnly: true })
  const query = [name, tsCode, 'A股', '行业', '概念', '产业链', '细分赛道'].filter(Boolean).join(' ')
  const search = options.search ?? ((q: string) => defaultSearch(db, q))

  let hits: ResearchSearchHit[] = []
  try {
    hits = await Promise.race([
      search(query),
      new Promise<ResearchSearchHit[]>((_, reject) => {
        setTimeout(() => reject(new Error('WEB_SUGGEST_TIMEOUT')), WEB_SUGGEST_TIMEOUT_MS)
      }),
    ])
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { status: 'error', pair: null, pending: [], rawTags: [], error: message }
  }

  const rawTags = extractCandidateTags(hits)
  const haystack = hits.map((hit) => `${hit.title}\n${hit.snippet ?? ''}`).join('\n')
  const tags: WatchlistCategoryTags = {
    industry: rawTags[0] ?? '',
    concepts: rawTags,
    name: name || tsCode,
  }
  const rules = listWatchlistCategoryMapRules(db, { enabledOnly: true })
  const mapHit = mapWatchlistCategory(tags, rules, (category, subCategory) =>
    isValidWatchlistCategoryPairInDb(db, category, subCategory),
  )
  const treeHit = findTreePairFromText(tree, haystack)

  let pair: WatchlistCategoryWebSuggestResult['pair'] = null
  if (mapHit) {
    pair = {
      category: mapHit.category,
      subCategory: mapHit.subCategory,
      matchedKeyword: mapHit.matchedKeyword,
    }
  } else if (treeHit) {
    pair = treeHit
  }

  const pending: WatchlistCategoryWebPending[] = []
  for (const label of rawTags.slice(0, 12)) {
    if (pair && (label === pair.category || label === pair.subCategory || label === pair.matchedKeyword)) {
      continue
    }
    if (isValidWatchlistCategoryPairInDb(db, label, '')) {
      pending.push({ label, suggestedCategory: label, suggestedSubCategory: '' })
      continue
    }
    let matched = false
    for (const [category, subs] of Object.entries(tree)) {
      if (subs.includes(label)) {
        pending.push({ label, suggestedCategory: category, suggestedSubCategory: label })
        matched = true
        break
      }
    }
    if (!matched && label.length >= 2) {
      // 待采用：建议新建为「自定义题材 / label」——采用时写树
      pending.push({
        label,
        suggestedCategory: '自定义题材',
        suggestedSubCategory: label,
      })
    }
  }

  return {
    status: 'ok',
    pair,
    pending: pending.slice(0, 8),
    rawTags,
    error: null,
  }
}

export type AdoptWebCategoryResult =
  | { ok: true; category: string; subCategory: string }
  | { ok: false; code: 'INVALID_PARAM'; message: string }

/**
 * 采用待采用建议：先 upsert 树节点，可选写一条 map rule；不落 pending 表。
 */
export function adoptWebCategorySuggestion(
  db: Database.Database,
  input: {
    category: string
    subCategory?: string
    createMapRule?: boolean
    keyword?: string
  },
): AdoptWebCategoryResult {
  const category = typeof input.category === 'string' ? input.category.trim() : ''
  const subCategory = typeof input.subCategory === 'string' ? input.subCategory.trim() : ''
  if (!category) {
    return { ok: false, code: 'INVALID_PARAM', message: 'category 必填' }
  }

  const node = upsertWatchlistCategoryNode(db, { category, subCategory, enabled: true })
  if (!node.ok) return { ok: false, code: 'INVALID_PARAM', message: node.message }

  if (input.createMapRule) {
    const keyword = (input.keyword ?? subCategory ?? category).trim()
    if (keyword) {
      upsertWatchlistCategoryMapRule(db, {
        keyword,
        matchField: 'concept',
        category,
        subCategory,
        priority: 70,
        enabled: true,
      })
    }
  }

  return { ok: true, category, subCategory }
}
