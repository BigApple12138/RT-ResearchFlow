/**
 * 观察池分类建议的轻量本地辅助（仅池内优先）。
 * 东财映射建议走主进程 `trend:suggestWatchlistCategory`，不再使用种子 catalog。
 */

import {
  isValidWatchlistCategoryPair,
  normalizeWatchlistTsCode,
  type WatchlistCategorySuggestion,
} from './trendWatchlistCategoryTree'

export type WatchlistCategorySuggestSource = 'watchlist'

export interface WatchlistCategorySuggestResult extends WatchlistCategorySuggestion {
  source: WatchlistCategorySuggestSource
}

/** 仅从观察池既有登记推断；无命中返回 null（东财路径见 IPC）。 */
export function suggestWatchlistCategoryFromPool(
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
  return null
}
