import type Database from 'better-sqlite3'
import {
  buildWatchlistCategoryTree,
  isValidWatchlistCategoryPairFromTree,
  type WatchlistCategoryTree,
  type WatchlistCategoryTreeNode,
} from '../services/watchlistCategoryTree'

export interface WatchlistCategoryTreeNodeRow extends WatchlistCategoryTreeNode {
  id: number
  createdAt: number
  updatedAt: number
}

export type CategoryNodeRefs = {
  inUseWatchlist: number
  inUseRules: number
}

function mapNode(row: {
  id: number
  category: string
  sub_category: string
  sort_order: number
  enabled: number
  created_at: number
  updated_at: number
}): WatchlistCategoryTreeNodeRow {
  return {
    id: row.id,
    category: row.category,
    subCategory: row.sub_category,
    sortOrder: row.sort_order,
    enabled: row.enabled === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function listWatchlistCategoryNodes(
  db: Database.Database,
  options: { enabledOnly?: boolean } = {},
): WatchlistCategoryTreeNodeRow[] {
  const sql = options.enabledOnly
    ? `
      SELECT id, category, sub_category, sort_order, enabled, created_at, updated_at
      FROM watchlist_category_nodes
      WHERE enabled = 1
      ORDER BY category ASC, sort_order ASC, id ASC
    `
    : `
      SELECT id, category, sub_category, sort_order, enabled, created_at, updated_at
      FROM watchlist_category_nodes
      ORDER BY category ASC, sort_order ASC, id ASC
    `
  const rows = db.prepare(sql).all() as Array<{
    id: number
    category: string
    sub_category: string
    sort_order: number
    enabled: number
    created_at: number
    updated_at: number
  }>
  return rows.map(mapNode)
}

export function listWatchlistCategoryTree(
  db: Database.Database,
  options: { enabledOnly?: boolean } = {},
): WatchlistCategoryTree {
  return buildWatchlistCategoryTree(listWatchlistCategoryNodes(db, options), options)
}

export function isValidWatchlistCategoryPairInDb(
  db: Database.Database,
  category: string,
  subCategory: string,
): boolean {
  return isValidWatchlistCategoryPairFromTree(
    listWatchlistCategoryTree(db, { enabledOnly: true }),
    category,
    subCategory,
  )
}

export type UpsertCategoryNodeInput = {
  category: string
  subCategory?: string
  sortOrder?: number
  enabled?: boolean
}

export type UpsertCategoryNodeResult =
  | { ok: true; node: WatchlistCategoryTreeNodeRow }
  | { ok: false; code: 'INVALID_PARAM'; message: string }

export function upsertWatchlistCategoryNode(
  db: Database.Database,
  input: UpsertCategoryNodeInput,
): UpsertCategoryNodeResult {
  const category = typeof input.category === 'string' ? input.category.trim() : ''
  const subCategory = typeof input.subCategory === 'string' ? input.subCategory.trim() : ''
  if (!category || category.length > 80) {
    return { ok: false, code: 'INVALID_PARAM', message: 'category 必填且不超过 80 字' }
  }
  if (subCategory.length > 80) {
    return { ok: false, code: 'INVALID_PARAM', message: 'subCategory 不超过 80 字' }
  }
  const sortOrder = Number.isFinite(input.sortOrder) ? Math.trunc(input.sortOrder as number) : 0
  const enabled = input.enabled === false ? 0 : 1
  const now = Date.now()

  const existing = db
    .prepare('SELECT id FROM watchlist_category_nodes WHERE category = ? AND sub_category = ?')
    .get(category, subCategory) as { id: number } | undefined

  if (existing) {
    db.prepare(`
      UPDATE watchlist_category_nodes
      SET sort_order = ?, enabled = ?, updated_at = ?
      WHERE id = ?
    `).run(sortOrder, enabled, now, existing.id)
    const row = db
      .prepare(`
        SELECT id, category, sub_category, sort_order, enabled, created_at, updated_at
        FROM watchlist_category_nodes WHERE id = ?
      `)
      .get(existing.id) as Parameters<typeof mapNode>[0]
    return { ok: true, node: mapNode(row) }
  }

  const result = db.prepare(`
    INSERT INTO watchlist_category_nodes
      (category, sub_category, sort_order, enabled, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(category, subCategory, sortOrder, enabled, now, now)

  const row = db
    .prepare(`
      SELECT id, category, sub_category, sort_order, enabled, created_at, updated_at
      FROM watchlist_category_nodes WHERE id = ?
    `)
    .get(Number(result.lastInsertRowid)) as Parameters<typeof mapNode>[0]
  return { ok: true, node: mapNode(row) }
}

export function countWatchlistCategoryNodeReferences(
  db: Database.Database,
  category: string,
  subCategory?: string | null,
): CategoryNodeRefs {
  const cat = category.trim()
  const sub = subCategory == null ? null : String(subCategory).trim()

  if (sub == null || sub === '') {
    const watch = db
      .prepare('SELECT COUNT(*) AS cnt FROM trend_watchlist WHERE category = ?')
      .get(cat) as { cnt: number }
    const rules = db
      .prepare('SELECT COUNT(*) AS cnt FROM watchlist_category_map_rules WHERE category = ?')
      .get(cat) as { cnt: number }
    return { inUseWatchlist: Number(watch.cnt) || 0, inUseRules: Number(rules.cnt) || 0 }
  }

  const watch = db
    .prepare('SELECT COUNT(*) AS cnt FROM trend_watchlist WHERE category = ? AND sub_category = ?')
    .get(cat, sub) as { cnt: number }
  const rules = db
    .prepare('SELECT COUNT(*) AS cnt FROM watchlist_category_map_rules WHERE category = ? AND sub_category = ?')
    .get(cat, sub) as { cnt: number }
  return { inUseWatchlist: Number(watch.cnt) || 0, inUseRules: Number(rules.cnt) || 0 }
}

export type DeleteCategoryNodeResult =
  | { ok: true }
  | {
      ok: false
      code: 'INVALID_PARAM' | 'NOT_FOUND' | 'IN_USE'
      message: string
      refs?: CategoryNodeRefs
    }

/**
 * 方案 C：有引用且未 clearReferences → IN_USE；
 * clearReferences：清空观察池分类、删除相关规则、再删节点。
 * subCategory 省略/空：删除该 category 下全部节点。
 */
export function deleteWatchlistCategoryNode(
  db: Database.Database,
  input: { category: string; subCategory?: string; clearReferences?: boolean },
): DeleteCategoryNodeResult {
  const category = typeof input.category === 'string' ? input.category.trim() : ''
  if (!category) {
    return { ok: false, code: 'INVALID_PARAM', message: 'category 必填' }
  }
  const subRaw = input.subCategory
  const wholeCategory = subRaw === undefined || subRaw === null
  const subCategory = wholeCategory ? null : String(subRaw).trim()

  const nodes = wholeCategory
    ? (db.prepare('SELECT id FROM watchlist_category_nodes WHERE category = ?').all(category) as { id: number }[])
    : (db
        .prepare('SELECT id FROM watchlist_category_nodes WHERE category = ? AND sub_category = ?')
        .all(category, subCategory as string) as { id: number }[])

  if (nodes.length === 0) {
    return { ok: false, code: 'NOT_FOUND', message: '节点不存在' }
  }

  const refs = countWatchlistCategoryNodeReferences(db, category, wholeCategory ? null : subCategory)
  if ((refs.inUseWatchlist > 0 || refs.inUseRules > 0) && !input.clearReferences) {
    return {
      ok: false,
      code: 'IN_USE',
      message: `仍有 ${refs.inUseWatchlist} 条观察池 / ${refs.inUseRules} 条规则引用，确认后可清空引用再删`,
      refs,
    }
  }

  const run = db.transaction(() => {
    if (input.clearReferences) {
      if (wholeCategory) {
        db.prepare('UPDATE trend_watchlist SET category = ?, sub_category = ? WHERE category = ?')
          .run('', '', category)
        db.prepare('DELETE FROM watchlist_category_map_rules WHERE category = ?').run(category)
      } else {
        db.prepare(
          'UPDATE trend_watchlist SET category = ?, sub_category = ? WHERE category = ? AND sub_category = ?',
        ).run('', '', category, subCategory)
        db.prepare(
          'DELETE FROM watchlist_category_map_rules WHERE category = ? AND sub_category = ?',
        ).run(category, subCategory)
      }
    }
    if (wholeCategory) {
      db.prepare('DELETE FROM watchlist_category_nodes WHERE category = ?').run(category)
    } else {
      db.prepare('DELETE FROM watchlist_category_nodes WHERE category = ? AND sub_category = ?')
        .run(category, subCategory)
    }
  })
  run()
  return { ok: true }
}

export type RenameCategoryNodeInput = {
  from: { category: string; subCategory?: string }
  to: { category: string; subCategory?: string }
}

export type RenameCategoryNodeResult =
  | { ok: true }
  | { ok: false; code: 'INVALID_PARAM' | 'NOT_FOUND' | 'CONFLICT'; message: string }

/**
 * 重命名：事务级联 tree + trend_watchlist + map_rules。
 * - 仅改 category：from.subCategory/to.subCategory 均省略
 * - 仅改赛道：同 category，from/to 均带 subCategory
 */
export function renameWatchlistCategoryNode(
  db: Database.Database,
  input: RenameCategoryNodeInput,
): RenameCategoryNodeResult {
  const fromCat = typeof input.from?.category === 'string' ? input.from.category.trim() : ''
  const toCat = typeof input.to?.category === 'string' ? input.to.category.trim() : ''
  if (!fromCat || !toCat) {
    return { ok: false, code: 'INVALID_PARAM', message: 'from/to.category 必填' }
  }
  if (toCat.length > 80) {
    return { ok: false, code: 'INVALID_PARAM', message: 'to.category 不超过 80 字' }
  }

  const fromSubDefined = input.from.subCategory !== undefined
  const toSubDefined = input.to.subCategory !== undefined
  if (fromSubDefined !== toSubDefined) {
    return { ok: false, code: 'INVALID_PARAM', message: 'from/to.subCategory 须同时省略或同时提供' }
  }

  const now = Date.now()

  if (!fromSubDefined) {
    if (fromCat === toCat) return { ok: true }
    const count = db
      .prepare('SELECT COUNT(*) AS cnt FROM watchlist_category_nodes WHERE category = ?')
      .get(fromCat) as { cnt: number }
    if (!count.cnt) return { ok: false, code: 'NOT_FOUND', message: '源分类不存在' }
    const conflict = db
      .prepare('SELECT COUNT(*) AS cnt FROM watchlist_category_nodes WHERE category = ?')
      .get(toCat) as { cnt: number }
    if (conflict.cnt) return { ok: false, code: 'CONFLICT', message: '目标分类已存在' }

    const run = db.transaction(() => {
      db.prepare('UPDATE watchlist_category_nodes SET category = ?, updated_at = ? WHERE category = ?')
        .run(toCat, now, fromCat)
      db.prepare('UPDATE trend_watchlist SET category = ? WHERE category = ?').run(toCat, fromCat)
      db.prepare('UPDATE watchlist_category_map_rules SET category = ?, updated_at = ? WHERE category = ?')
        .run(toCat, now, fromCat)
    })
    run()
    return { ok: true }
  }

  const fromSub = String(input.from.subCategory ?? '').trim()
  const toSub = String(input.to.subCategory ?? '').trim()
  if (toSub.length > 80) {
    return { ok: false, code: 'INVALID_PARAM', message: 'to.subCategory 不超过 80 字' }
  }
  if (fromCat === toCat && fromSub === toSub) return { ok: true }

  const source = db
    .prepare('SELECT id FROM watchlist_category_nodes WHERE category = ? AND sub_category = ?')
    .get(fromCat, fromSub) as { id: number } | undefined
  if (!source) return { ok: false, code: 'NOT_FOUND', message: '源节点不存在' }

  const conflict = db
    .prepare('SELECT id FROM watchlist_category_nodes WHERE category = ? AND sub_category = ?')
    .get(toCat, toSub) as { id: number } | undefined
  if (conflict) return { ok: false, code: 'CONFLICT', message: '目标节点已存在' }

  const run = db.transaction(() => {
    db.prepare(`
      UPDATE watchlist_category_nodes
      SET category = ?, sub_category = ?, updated_at = ?
      WHERE id = ?
    `).run(toCat, toSub, now, source.id)
    db.prepare(`
      UPDATE trend_watchlist
      SET category = ?, sub_category = ?
      WHERE category = ? AND sub_category = ?
    `).run(toCat, toSub, fromCat, fromSub)
    db.prepare(`
      UPDATE watchlist_category_map_rules
      SET category = ?, sub_category = ?, updated_at = ?
      WHERE category = ? AND sub_category = ?
    `).run(toCat, toSub, now, fromCat, fromSub)
  })
  run()
  return { ok: true }
}
