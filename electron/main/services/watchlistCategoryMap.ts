/**
 * 观察池分类：东财标签 → 主题树映射（纯函数，无 I/O）
 */

import type { WatchlistCategorySuggestion } from '../../../src/components/TrendWatcher/trendWatchlistCategoryTree'
import { isValidWatchlistCategoryPair } from '../../../src/components/TrendWatcher/trendWatchlistCategoryTree'

export type WatchlistCategoryMatchField = 'industry' | 'concept' | 'name'

export interface WatchlistCategoryMapRule {
  id?: number
  keyword: string
  matchField: WatchlistCategoryMatchField
  category: string
  subCategory: string
  priority: number
  enabled: boolean
}

export interface WatchlistCategoryTags {
  industry: string
  concepts: string[]
  name: string
}

export interface WatchlistCategoryMapHit extends WatchlistCategorySuggestion {
  matchedKeyword: string
  matchField: WatchlistCategoryMatchField
}

function normalizeHaystack(value: string): string {
  return value.trim().toLowerCase()
}

function fieldHaystacks(tags: WatchlistCategoryTags, field: WatchlistCategoryMatchField): string[] {
  if (field === 'industry') {
    const industry = normalizeHaystack(tags.industry)
    return industry ? [industry] : []
  }
  if (field === 'name') {
    const name = normalizeHaystack(tags.name)
    return name ? [name] : []
  }
  return tags.concepts.map(normalizeHaystack).filter(Boolean)
}

export type WatchlistCategoryPairValidator = (category: string, subCategory: string) => boolean

/**
 * 在启用规则中按 priority 降序、id 升序匹配；仅返回主题树内合法 pair。
 * `isValidPair` 默认绑种子 TREE；二期主进程应传入 DB 树校验。
 */
export function mapWatchlistCategory(
  tags: WatchlistCategoryTags,
  rules: readonly WatchlistCategoryMapRule[],
  isValidPair: WatchlistCategoryPairValidator = isValidWatchlistCategoryPair,
): WatchlistCategoryMapHit | null {
  const ordered = [...rules]
    .filter((rule) => rule.enabled && rule.keyword.trim())
    .sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority
      return (a.id ?? 0) - (b.id ?? 0)
    })

  for (const rule of ordered) {
    const needle = normalizeHaystack(rule.keyword)
    if (!needle) continue
    const haystacks = fieldHaystacks(tags, rule.matchField)
    if (!haystacks.some((hay) => hay.includes(needle))) continue
    if (!isValidPair(rule.category, rule.subCategory)) continue
    return {
      category: rule.category,
      subCategory: rule.subCategory,
      matchedKeyword: rule.keyword.trim(),
      matchField: rule.matchField,
    }
  }
  return null
}
