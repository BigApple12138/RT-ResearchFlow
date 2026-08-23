import { describe, expect, it } from 'vitest'
import {
  buildWatchlistCategoryTree,
  isValidWatchlistCategoryPairFromTree,
} from '../../electron/main/services/watchlistCategoryTree'

describe('watchlistCategoryTree pure helpers', () => {
  const tree = buildWatchlistCategoryTree([
    { category: 'CPO', subCategory: '光模块', sortOrder: 0, enabled: true },
    { category: 'CPO', subCategory: '光器件', sortOrder: 1, enabled: true },
    { category: 'PCB', subCategory: '通信/服务器PCB', sortOrder: 0, enabled: false },
  ], { enabledOnly: true })

  it('buildWatchlistCategoryTree 仅含启用节点', () => {
    expect(Object.keys(tree)).toEqual(['CPO'])
    expect(tree.CPO).toEqual(['光模块', '光器件'])
  })

  it('存在 category 子行时允许空赛道', () => {
    expect(isValidWatchlistCategoryPairFromTree(tree, 'CPO', '')).toBe(true)
    expect(isValidWatchlistCategoryPairFromTree(tree, 'CPO', '光模块')).toBe(true)
    expect(isValidWatchlistCategoryPairFromTree(tree, 'CPO', '不存在')).toBe(false)
    expect(isValidWatchlistCategoryPairFromTree(tree, 'PCB', '')).toBe(false)
    expect(isValidWatchlistCategoryPairFromTree(tree, '', '')).toBe(true)
  })
})
