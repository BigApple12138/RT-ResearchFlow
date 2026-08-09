import { getDb } from './db'
import type Database from 'better-sqlite3'
import type {
  Briefing,
  BriefingRow,
  BriefingListOptions,
  BriefingListResult,
  BriefingSourceStat,
  ImpactRating,
  PublicationTimeStatus,
} from './types'
import {
  escapeLikePattern,
  loadPortfolioRelevanceTerms,
  matchBriefingRelevance,
  type PortfolioRelevanceTerm,
} from '../services/portfolioBriefingRelevance'

function rowToBriefing(row: BriefingRow): Briefing {
  return {
    ...row,
    publicationTimeStatus: row.publicationTimeStatus ?? 'exact',
    isRead: row.isRead === 1,
    isCatchUp: row.isCatchUp === 1
  }
}

export function insertBriefing(
  data: Omit<BriefingRow, 'id'>
): { inserted: boolean; id: number | null } {
  const db = getDb()
  try {
    const result = db
      .prepare(
        `INSERT INTO briefings
          (sourceId, sourceName, originalUrl, title, summary, fullContent,
           publishedAt, publishedDateBJ, publicationTimeStatus, collectedAt, impactRating,
           impactRatingScore, deduplicationHash, titleSimhash,
           isRead, readAt, scanRunId, isCatchUp)
         VALUES
          (@sourceId, @sourceName, @originalUrl, @title, @summary, @fullContent,
           @publishedAt, @publishedDateBJ, @publicationTimeStatus, @collectedAt, @impactRating,
           @impactRatingScore, @deduplicationHash, @titleSimhash,
           0, NULL, @scanRunId, @isCatchUp)`
      )
      .run(data)
    return { inserted: true, id: result.lastInsertRowid as number }
  } catch (err: unknown) {
    // UNIQUE constraint on deduplicationHash → duplicate
    if (err instanceof Error && err.message.includes('UNIQUE')) {
      return { inserted: false, id: null }
    }
    throw err
  }
}

export function getBriefingById(id: number): Briefing | null {
  const row = getDb().prepare('SELECT * FROM briefings WHERE id = ?').get(id) as
    | BriefingRow
    | undefined
  return row ? rowToBriefing(row) : null
}

export function markAsRead(id: number): boolean {
  const result = getDb()
    .prepare('UPDATE briefings SET isRead = 1, readAt = ? WHERE id = ? AND isRead = 0')
    .run(Date.now(), id)
  return result.changes > 0
}

export function markAllAsRead(
  options: BriefingListOptions = {},
  database?: Database.Database,
): { count: number; dates: string[] } {
  const db = database ?? getDb()
  const now = Date.now()
  const built = buildBriefingConditions(options, db, true)
  if (built.noSearchResults) return { count: 0, dates: [] }
  const { conditions, params } = built
  conditions.push('b.isRead = 0')
  const where = `WHERE ${conditions.join(' AND ')}`
  const dates = (db.prepare(
    `SELECT DISTINCT b.publishedDateBJ AS date FROM briefings b ${where}`
  ).all(params) as Array<{ date: string }>).map((row) => row.date)
  const result = db.prepare(
    `UPDATE briefings SET isRead = 1, readAt = ?
     WHERE id IN (SELECT b.id FROM briefings b ${where})`
  ).run(now, ...params) as { changes: number }
  return { count: result.changes, dates }
}

export function listBriefings(
  options: BriefingListOptions = {},
  database?: Database.Database
): BriefingListResult {
  const db = database ?? getDb()
  const { sourceId, limit = 50, offset = 0 } = options
  const built = buildBriefingConditions(options, db, false)
  const emptyMeta = {
    relevanceUnreadCount: 0,
    allUnreadCount: 0,
    relevanceModeApplied: built.relevanceModeApplied,
    portfolioTermCount: built.portfolioTerms.length,
  }
  if (built.noSearchResults) {
    return { items: [], total: 0, unreadCount: 0, sourceStats: [], ...emptyMeta }
  }
  const baseConditions = built.conditions
  const baseParams = built.params

  const itemConditions = [...baseConditions]
  const itemParams = [...baseParams]
  if (sourceId != null) {
    itemConditions.push('b.sourceId = ?')
    itemParams.push(sourceId)
  }

  const itemWhere = itemConditions.length > 0 ? `WHERE ${itemConditions.join(' AND ')}` : ''
  const sourceStatsWhere = baseConditions.length > 0 ? `WHERE ${baseConditions.join(' AND ')}` : ''

  const total = (
    db
      .prepare(`SELECT COUNT(*) as cnt FROM briefings b ${itemWhere}`)
      .get(itemParams) as { cnt: number }
  ).cnt

  const unreadCount = (
    db
      .prepare(
        `SELECT COUNT(*) as cnt FROM briefings b ${itemWhere} ${itemWhere ? 'AND' : 'WHERE'} b.isRead = 0`
      )
      .get(itemParams) as { cnt: number }
  ).cnt

  const allUnreadBuilt = buildBriefingConditions({ ...options, relevance: 'all' }, db, false)
  let allUnreadCount = unreadCount
  if (!allUnreadBuilt.noSearchResults) {
    const allItemConditions = [...allUnreadBuilt.conditions]
    const allItemParams = [...allUnreadBuilt.params]
    if (sourceId != null) {
      allItemConditions.push('b.sourceId = ?')
      allItemParams.push(sourceId)
    }
    const allItemWhere =
      allItemConditions.length > 0 ? `WHERE ${allItemConditions.join(' AND ')}` : ''
    allUnreadCount = (
      db
        .prepare(
          `SELECT COUNT(*) as cnt FROM briefings b ${allItemWhere} ${allItemWhere ? 'AND' : 'WHERE'} b.isRead = 0`
        )
        .get(allItemParams) as { cnt: number }
    ).cnt
  }

  const orderBy = buildRelevanceOrderBy(built.portfolioTerms, built.relevanceModeApplied)

  const rows = db
    .prepare(
      `SELECT b.* FROM briefings b ${itemWhere}
       ORDER BY ${orderBy.sql}
       LIMIT ? OFFSET ?`
    )
    .all([...itemParams, ...orderBy.params, limit, offset]) as BriefingRow[]

  const sourceStats = db
    .prepare(
      `SELECT b.sourceId as sourceId,
              b.sourceName as sourceName,
              COUNT(*) as total,
              SUM(CASE WHEN b.isRead = 0 THEN 1 ELSE 0 END) as unread,
              SUM(CASE WHEN b.impactRating != 'GENERAL' THEN 1 ELSE 0 END) as highImpact
         FROM briefings b ${sourceStatsWhere}
        GROUP BY b.sourceId, b.sourceName
        ORDER BY highImpact DESC, unread DESC, total DESC, sourceName ASC`
    )
    .all(baseParams) as BriefingSourceStat[]

  const items = rows.map((row) => {
    const briefing = rowToBriefing(row)
    if (built.relevanceModeApplied !== 'portfolio' || built.portfolioTerms.length === 0) {
      return briefing
    }
    const matched = matchBriefingRelevance(
      { title: briefing.title, summary: briefing.summary },
      built.portfolioTerms,
    )
    if (!matched) return briefing
    return {
      ...briefing,
      relevanceHits: matched.hits,
      relevanceKind: matched.kind,
    }
  })

  return {
    items,
    total,
    unreadCount,
    relevanceUnreadCount: unreadCount,
    allUnreadCount,
    relevanceModeApplied: built.relevanceModeApplied,
    portfolioTermCount: built.portfolioTerms.length,
    sourceStats,
  }
}

type BuiltBriefingConditions = {
  conditions: string[]
  params: Array<string | number>
  noSearchResults: boolean
  relevanceModeApplied: BriefingListResult['relevanceModeApplied']
  portfolioTerms: PortfolioRelevanceTerm[]
}

function buildBriefingConditions(
  options: BriefingListOptions,
  db: Database.Database,
  includeSource: boolean,
): BuiltBriefingConditions {
  const {
    date,
    impactRating,
    sourceId,
    isRead,
    search,
    publicationTimeScope = 'all',
    relevance = 'all',
  } = options
  const conditions: string[] = []
  const params: Array<string | number> = []
  let relevanceModeApplied: BriefingListResult['relevanceModeApplied'] = 'all'
  let portfolioTerms: PortfolioRelevanceTerm[] = []

  if (date) {
    if (date.length < 10) {
      conditions.push('b.publishedDateBJ LIKE ?')
      params.push(`${date}%`)
    } else {
      conditions.push('b.publishedDateBJ = ?')
      params.push(date)
    }
  }
  if (impactRating) {
    conditions.push('b.impactRating = ?')
    params.push(impactRating)
  }
  if (isRead != null) {
    conditions.push('b.isRead = ?')
    params.push(isRead ? 1 : 0)
  }
  if (publicationTimeScope === 'confirmed') {
    conditions.push("b.publicationTimeStatus != 'collected_fallback'")
  } else if (publicationTimeScope === 'uncertain') {
    conditions.push("b.publicationTimeStatus = 'collected_fallback'")
  }
  if (includeSource && sourceId != null) {
    conditions.push('b.sourceId = ?')
    params.push(sourceId)
  }
  if (search?.trim()) {
    const ftsRows = db.prepare(
      'SELECT rowid FROM briefings_fts WHERE briefings_fts MATCH ? ORDER BY rank LIMIT 500'
    ).all(`${search.trim()}*`) as Array<{ rowid: number }>
    const ids = ftsRows.map((row) => row.rowid)
    if (ids.length === 0) {
      return {
        conditions,
        params,
        noSearchResults: true,
        relevanceModeApplied: relevance === 'portfolio' ? 'portfolio_fallback_empty' : 'all',
        portfolioTerms: [],
      }
    }
    conditions.push(`b.id IN (${ids.join(',')})`)
  }

  if (relevance === 'portfolio') {
    portfolioTerms = loadPortfolioRelevanceTerms(db)
    if (portfolioTerms.length === 0) {
      relevanceModeApplied = 'portfolio_fallback_empty'
    } else {
      relevanceModeApplied = 'portfolio'
      const clause = portfolioTerms
        .map(() => `(b.title LIKE ? ESCAPE '\\' OR b.summary LIKE ? ESCAPE '\\')`)
        .join(' OR ')
      conditions.push(`(${clause})`)
      for (const term of portfolioTerms) {
        const pattern = `%${escapeLikePattern(term.term)}%`
        params.push(pattern, pattern)
      }
    }
  }

  return { conditions, params, noSearchResults: false, relevanceModeApplied, portfolioTerms }
}

function buildRelevanceOrderBy(
  terms: PortfolioRelevanceTerm[],
  mode: BriefingListResult['relevanceModeApplied'],
): { sql: string; params: string[] } {
  if (mode !== 'portfolio') return { sql: 'b.publishedAt DESC', params: [] }
  const direct = terms.filter((t) => t.kind === 'direct')
  if (direct.length === 0) return { sql: 'b.publishedAt DESC', params: [] }
  const parts = direct.map(
    () => `(b.title LIKE ? ESCAPE '\\' OR b.summary LIKE ? ESCAPE '\\')`,
  )
  const params: string[] = []
  for (const term of direct) {
    const pattern = `%${escapeLikePattern(term.term)}%`
    params.push(pattern, pattern)
  }
  return {
    sql: `CASE WHEN (${parts.join(' OR ')}) THEN 0 ELSE 1 END ASC, b.publishedAt DESC`,
    params,
  }
}

export function hashExists(hash: string): boolean {
  const row = getDb()
    .prepare('SELECT 1 FROM briefings WHERE deduplicationHash = ?')
    .get(hash)
  return row != null
}

export function findBriefingByUrlOrTitle(
  sourceId: number,
  canonicalUrl: string,
  normalizedTitle: string,
  publishedDateBJ?: string,
): Briefing | null {
  const row = getDb().prepare(
    `SELECT * FROM briefings
     WHERE originalUrl = ?
        OR (sourceId = ? AND trim(title) = ? ${publishedDateBJ ? 'AND publishedDateBJ = ?' : ''})
     ORDER BY CASE WHEN originalUrl = ? THEN 0 ELSE 1 END, id ASC
     LIMIT 1`
  ).get(
    canonicalUrl,
    sourceId,
    normalizedTitle,
    ...(publishedDateBJ ? [publishedDateBJ] : []),
    canonicalUrl,
  ) as BriefingRow | undefined
  return row ? rowToBriefing(row) : null
}

export function updateBriefingPublication(
  id: number,
  publishedAt: number,
  publishedDateBJ: string,
  status: Exclude<PublicationTimeStatus, 'collected_fallback'>,
): { previousDate: string | null; changed: boolean } {
  const db = getDb()
  const existing = db.prepare(
    'SELECT publishedDateBJ FROM briefings WHERE id = ? AND publicationTimeStatus = ?'
  ).get(id, 'collected_fallback') as { publishedDateBJ: string } | undefined
  if (!existing) return { previousDate: null, changed: false }
  const result = db.prepare(
    `UPDATE briefings
     SET publishedAt = ?, publishedDateBJ = ?, publicationTimeStatus = ?
     WHERE id = ? AND publicationTimeStatus = 'collected_fallback'`
  ).run(publishedAt, publishedDateBJ, status, id) as { changes: number }
  return { previousDate: existing.publishedDateBJ, changed: result.changes > 0 }
}

export function findSimilarSimhash(
  simhash: string,
  publishedAt: number = Date.now(),
  maxHammingDistance: number = 3,
): Briefing | null {
  // Retrieve recent simhashes and compute Hamming distance in JS
  // (SQLite has no bitwise XOR on hex strings natively)
  const rows = getDb()
    .prepare(
      `SELECT * FROM briefings
       WHERE publishedAt BETWEEN ? AND ?
       ORDER BY ABS(publishedAt - ?) ASC
       LIMIT 2000`
    )
    .all(
      publishedAt - 24 * 60 * 60 * 1000,
      publishedAt + 24 * 60 * 60 * 1000,
      publishedAt,
    ) as BriefingRow[]

  const targetBig = BigInt('0x' + simhash)
  for (const row of rows) {
    const rowBig = BigInt('0x' + row.titleSimhash)
    const xor = targetBig ^ rowBig
    const distance = popcount64(xor)
    if (distance <= maxHammingDistance) {
      return rowToBriefing(row)
    }
  }
  return null
}

function popcount64(n: bigint): number {
  let count = 0
  let v = n
  while (v > 0n) {
    v &= v - 1n
    count++
  }
  return count
}

export function deleteOldBriefings(retentionDays: number): number {
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000
  const db = getDb()
  // 先解除 ai_analysis_sessions 对旧 briefing 的外键引用，保留会话历史
  db.prepare(
    'UPDATE ai_analysis_sessions SET briefingId = NULL WHERE briefingId IN (SELECT id FROM briefings WHERE publishedAt < ?)'
  ).run(cutoff)
  const result = db
    .prepare('DELETE FROM briefings WHERE publishedAt < ?')
    .run(cutoff) as { changes: number }
  return result.changes
}

export function getLatestBriefingDate(): number | null {
  const row = getDb()
    .prepare('SELECT MAX(publishedAt) as latest FROM briefings')
    .get() as { latest: number | null }
  return row.latest
}

export function countByRating(): Record<ImpactRating, number> {
  const rows = getDb()
    .prepare(
      `SELECT impactRating, COUNT(*) as cnt FROM briefings WHERE isRead = 0 GROUP BY impactRating`
    )
    .all() as { impactRating: ImpactRating; cnt: number }[]
  const result: Record<ImpactRating, number> = { CRITICAL: 0, IMPORTANT: 0, GENERAL: 0 }
  for (const row of rows) {
    result[row.impactRating] = row.cnt
  }
  return result
}
