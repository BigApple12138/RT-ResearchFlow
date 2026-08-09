import { WATCHLIST_CATEGORY_CATALOG } from './trendWatchlistCategoryCatalog.generated'
import {
  isValidWatchlistCategoryPair,
  normalizeWatchlistTsCode,
  type WatchlistCategorySuggestion,
} from './trendWatchlistCategoryTree'

export type WatchlistCategorySuggestSource = 'watchlist' | 'catalog' | null

export interface WatchlistCategorySuggestResult extends WatchlistCategorySuggestion {
  source: Exclude<WatchlistCategorySuggestSource, null>
}

export function suggestWatchlistCategory(
  tsCode: string,
  existingRows: Array<{ tsCode: string; category: string; subCategory: string }> = [],
): WatchlistCategorySuggestResult | null {
  const code = normalizeWatchlistTsCode(tsCode)
  const fromWatch = existingRows
    .filter((row) => normalizeWatchlistTsCode(row.tsCode) === code && row.category)
    .sort((a, b) => `${a.category}/${a.subCategory}`.localeCompare(`${b.category}/${b.subCategory}`, 'zh-CN'))
  for (const row of fromWatch) {
    if (isValidWatchlistCategoryPair(row.category, row.subCategory)) {
      return { category: row.category, subCategory: row.subCategory, source: 'watchlist' }
    }
  }
  const catalog = WATCHLIST_CATEGORY_CATALOG[code] ?? []
  for (const entry of catalog) {
    if (isValidWatchlistCategoryPair(entry.category, entry.subCategory)) {
      return { ...entry, source: 'catalog' }
    }
  }
  return null
}
