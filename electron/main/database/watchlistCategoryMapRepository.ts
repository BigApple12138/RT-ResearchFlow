import type Database from 'better-sqlite3'
import type {
  WatchlistCategoryMapRule,
  WatchlistCategoryMatchField,
} from '../services/watchlistCategoryMap'
import { isValidWatchlistCategoryPairInDb } from './watchlistCategoryTreeRepository'

export interface WatchlistCategoryMapRuleRow extends WatchlistCategoryMapRule {
  id: number
  createdAt: number
  updatedAt: number
}

const MATCH_FIELDS = new Set<WatchlistCategoryMatchField>(['industry', 'concept', 'name'])

function mapRow(row: {
  id: number
  keyword: string
  match_field: string
  category: string
  sub_category: string
  priority: number
  enabled: number
  created_at: number
  updated_at: number
}): WatchlistCategoryMapRuleRow {
  return {
    id: row.id,
    keyword: row.keyword,
    matchField: row.match_field as WatchlistCategoryMatchField,
    category: row.category,
    subCategory: row.sub_category,
    priority: row.priority,
    enabled: row.enabled === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function listWatchlistCategoryMapRules(
  db: Database.Database,
  options: { enabledOnly?: boolean } = {},
): WatchlistCategoryMapRuleRow[] {
  const sql = options.enabledOnly
    ? `
      SELECT id, keyword, match_field, category, sub_category, priority, enabled, created_at, updated_at
      FROM watchlist_category_map_rules
      WHERE enabled = 1
      ORDER BY priority DESC, id ASC
    `
    : `
      SELECT id, keyword, match_field, category, sub_category, priority, enabled, created_at, updated_at
      FROM watchlist_category_map_rules
      ORDER BY priority DESC, id ASC
    `
  const rows = db.prepare(sql).all() as Array<{
    id: number
    keyword: string
    match_field: string
    category: string
    sub_category: string
    priority: number
    enabled: number
    created_at: number
    updated_at: number
  }>
  return rows.map(mapRow)
}

export type UpsertWatchlistCategoryMapRuleInput = {
  id?: number
  keyword: string
  matchField: WatchlistCategoryMatchField
  category: string
  subCategory: string
  priority?: number
  enabled?: boolean
}

export type UpsertWatchlistCategoryMapRuleResult =
  | { ok: true; rule: WatchlistCategoryMapRuleRow }
  | { ok: false; code: 'INVALID_PARAM' | 'NOT_FOUND'; message: string }

export function upsertWatchlistCategoryMapRule(
  db: Database.Database,
  input: UpsertWatchlistCategoryMapRuleInput,
): UpsertWatchlistCategoryMapRuleResult {
  const keyword = typeof input.keyword === 'string' ? input.keyword.trim() : ''
  const category = typeof input.category === 'string' ? input.category.trim() : ''
  const subCategory = typeof input.subCategory === 'string' ? input.subCategory.trim() : ''
  const matchField = input.matchField
  const priority = Number.isFinite(input.priority) ? Math.trunc(input.priority as number) : 0
  const enabled = input.enabled === false ? 0 : 1

  if (!keyword || keyword.length > 80) {
    return { ok: false, code: 'INVALID_PARAM', message: 'keyword 必填且不超过 80 字' }
  }
  if (!MATCH_FIELDS.has(matchField)) {
    return { ok: false, code: 'INVALID_PARAM', message: 'matchField 必须是 industry/concept/name' }
  }
  if (!category || !isValidWatchlistCategoryPairInDb(db, category, subCategory)) {
    return { ok: false, code: 'INVALID_PARAM', message: 'category/subCategory 必须落在主题树内' }
  }
  if (!Number.isFinite(priority) || Math.abs(priority) > 1_000_000) {
    return { ok: false, code: 'INVALID_PARAM', message: 'priority 非法' }
  }

  const now = Date.now()
  if (input.id != null) {
    const id = Math.trunc(input.id)
    if (!Number.isFinite(id) || id <= 0) {
      return { ok: false, code: 'INVALID_PARAM', message: 'id 非法' }
    }
    const existing = db.prepare('SELECT id FROM watchlist_category_map_rules WHERE id = ?').get(id) as
      | { id: number }
      | undefined
    if (!existing) return { ok: false, code: 'NOT_FOUND', message: '规则不存在' }
    db.prepare(`
      UPDATE watchlist_category_map_rules
      SET keyword = ?, match_field = ?, category = ?, sub_category = ?, priority = ?, enabled = ?, updated_at = ?
      WHERE id = ?
    `).run(keyword, matchField, category, subCategory, priority, enabled, now, id)
    const row = listWatchlistCategoryMapRules(db).find((item) => item.id === id)
    if (!row) return { ok: false, code: 'NOT_FOUND', message: '规则不存在' }
    return { ok: true, rule: row }
  }

  const result = db.prepare(`
    INSERT INTO watchlist_category_map_rules
      (keyword, match_field, category, sub_category, priority, enabled, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(keyword, matchField, category, subCategory, priority, enabled, now, now)
  const id = Number(result.lastInsertRowid)
  const row = listWatchlistCategoryMapRules(db).find((item) => item.id === id)
  if (!row) return { ok: false, code: 'NOT_FOUND', message: '写入后读取失败' }
  return { ok: true, rule: row }
}

export type DeleteWatchlistCategoryMapRuleResult =
  | { ok: true }
  | { ok: false; code: 'INVALID_PARAM' | 'NOT_FOUND'; message: string }

export function deleteWatchlistCategoryMapRule(
  db: Database.Database,
  id: number,
): DeleteWatchlistCategoryMapRuleResult {
  const ruleId = Math.trunc(id)
  if (!Number.isFinite(ruleId) || ruleId <= 0) {
    return { ok: false, code: 'INVALID_PARAM', message: 'id 非法' }
  }
  const result = db.prepare('DELETE FROM watchlist_category_map_rules WHERE id = ?').run(ruleId)
  if (result.changes === 0) return { ok: false, code: 'NOT_FOUND', message: '规则不存在' }
  return { ok: true }
}
