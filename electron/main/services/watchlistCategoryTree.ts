/**
 * 观察池主题树：纯函数校验与快照构建（无 I/O）
 */

export type WatchlistCategoryTree = Record<string, string[]>

export interface WatchlistCategoryTreeNode {
  category: string
  subCategory: string
  sortOrder: number
  enabled: boolean
}

/**
 * Design §5.1：有任意该 category 的 enabled 行 ⇒ 允许 subCategory === ''；
 * 非空赛道须命中具体子行。
 */
export function isValidWatchlistCategoryPairFromTree(
  tree: WatchlistCategoryTree,
  category: string,
  subCategory: string,
): boolean {
  const cat = category.trim()
  const sub = subCategory.trim()
  if (!cat) return sub === ''
  const subs = tree[cat]
  if (!subs) return false
  return sub === '' || subs.includes(sub)
}

export function buildWatchlistCategoryTree(
  nodes: readonly WatchlistCategoryTreeNode[],
  options: { enabledOnly?: boolean } = {},
): WatchlistCategoryTree {
  const enabledOnly = options.enabledOnly !== false
  const tree: WatchlistCategoryTree = {}
  for (const node of nodes) {
    if (enabledOnly && !node.enabled) continue
    const category = node.category.trim()
    if (!category) continue
    if (!tree[category]) tree[category] = []
    const sub = node.subCategory.trim()
    if (sub && !tree[category].includes(sub)) tree[category].push(sub)
  }
  return tree
}
