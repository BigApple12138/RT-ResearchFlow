/**
 * 候选股 → 观察池桥接：列出已跟踪代码、缓存中未入池建议。
 */
import type Database from 'better-sqlite3'
import { listPortfolioStocks } from '../database/portfolioRepository'
import { getAllTrendWatchStocks } from '../database/trendWatchlistRepository'

export type WatchlistCandidate = {
  tsCode: string
  stockName: string
  hitCount: number
  lastSeenAt: string
  hasEnoughKline: boolean
}

/** 与 trendWatchlistService 对齐的 A 股代码规范化。 */
export function normalizeAshareTsCode(tsCode: string): string {
  const clean = tsCode.trim().toUpperCase()
  if (/^\d{6}\.(SH|SZ|BJ)$/.test(clean)) return clean
  const code = clean.replace(/\.(SH|SZ|BJ)$/i, '')
  if (!/^\d{6}$/.test(code)) return clean
  if (/^(600|601|603|605|688|900|110|113|118|127|128|129|131|132)/.test(code)) return `${code}.SH`
  if (/^(430|830|870|871|872|873|874|875|876|877|878|879|880|881|882|883|884|885|886|887|888|889|890|891|892|893|894|895|896|897|898|899)/.test(code)) {
    return `${code}.BJ`
  }
  return `${code}.SZ`
}

export function listTrackedTsCodes(db: Database.Database): string[] {
  const codes = new Set<string>()
  for (const row of getAllTrendWatchStocks(db)) {
    codes.add(normalizeAshareTsCode(row.tsCode))
  }
  for (const row of listPortfolioStocks(db)) {
    codes.add(normalizeAshareTsCode(row.tsCode))
  }
  return [...codes]
}

function beijingTradeDateDaysAgo(days: number): string {
  const now = new Date()
  const utc = now.getTime() + now.getTimezoneOffset() * 60_000
  const beijing = new Date(utc + 8 * 60 * 60_000)
  beijing.setDate(beijing.getDate() - days)
  const y = beijing.getFullYear()
  const m = String(beijing.getMonth() + 1).padStart(2, '0')
  const d = String(beijing.getDate()).padStart(2, '0')
  return `${y}${m}${d}`
}

export function listWatchlistCandidates(
  db: Database.Database,
  options: { limit?: number; lookbackDays?: number } = {},
): WatchlistCandidate[] {
  const limit = Math.min(Math.max(Math.floor(options.limit ?? 20), 1), 100)
  const lookbackDays = Math.min(Math.max(Math.floor(options.lookbackDays ?? 7), 1), 90)
  const since = beijingTradeDateDaysAgo(lookbackDays)
  const tracked = new Set(listTrackedTsCodes(db))

  const rows = db.prepare(`
    SELECT stockCode AS stockCode,
           COUNT(*) AS hitCount,
           MAX(tradeDate) AS lastSeenAt
    FROM stock_price_cache
    WHERE tradeDate >= ?
    GROUP BY stockCode
    ORDER BY hitCount DESC, lastSeenAt DESC
  `).all(since) as Array<{ stockCode: string; hitCount: number; lastSeenAt: string }>

  const nameStmt = db.prepare(`SELECT stockName FROM stock_info WHERE stockCode = ?`)
  const barCountStmt = db.prepare(`SELECT COUNT(*) AS n FROM stock_price_cache WHERE stockCode = ?`)

  const out: WatchlistCandidate[] = []
  for (const row of rows) {
    const tsCode = normalizeAshareTsCode(row.stockCode)
    if (tracked.has(tsCode)) continue
    const nameRow = nameStmt.get(row.stockCode) as { stockName?: string } | undefined
    const bareName = nameStmt.get(tsCode.replace(/\.(SH|SZ|BJ)$/i, '')) as { stockName?: string } | undefined
    const barRow = barCountStmt.get(row.stockCode) as { n: number }
    out.push({
      tsCode,
      stockName: nameRow?.stockName || bareName?.stockName || tsCode,
      hitCount: Number(row.hitCount) || 0,
      lastSeenAt: String(row.lastSeenAt ?? ''),
      hasEnoughKline: Number(barRow?.n ?? 0) >= 20,
    })
    if (out.length >= limit) break
  }
  return out
}
