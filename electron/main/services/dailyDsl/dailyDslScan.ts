import type Database from 'better-sqlite3'
import { queryDailyClose } from '../../database/dailyCloseCacheRepository'
import { listPortfolioStocks } from '../../database/portfolioRepository'
import type { DailyRow } from '../tushareService'
import { evaluateDailyDslTemplate } from './dailyDslEvaluator'
import type { DailyDslBar, DailyDslEvaluationResult, DailyDslTemplate } from './types'

export interface DailyDslScanMatch {
  tsCode: string
  stockName: string | null
  tradeDate: string
  score: number
  evaluation: DailyDslEvaluationResult
}

export interface DailyDslScanResult {
  totalStocks: number
  matchedCount: number
  dateEnd: string
  matches: DailyDslScanMatch[]
}

function toBars(rows: DailyRow[]): DailyDslBar[] {
  return rows.map((row) => ({
    tradeDate: row.tradeDate,
    open: row.open,
    high: row.high,
    low: row.low,
    close: row.close,
    pctChg: row.pctChg,
    vol: row.vol,
    turnoverRate: row.turnoverRate,
  }))
}

function resolveStockPool(
  db: Database.Database,
  sources: string[],
  manualTsCodes: string[],
): Array<{ tsCode: string; stockName: string | null }> {
  const map = new Map<string, string | null>()
  if (sources.includes('portfolio')) {
    for (const row of listPortfolioStocks(db)) {
      map.set(row.tsCode, row.stockName ?? null)
    }
  }
  if (sources.includes('manual') || manualTsCodes.length > 0) {
    for (const code of manualTsCodes) {
      const tsCode = code.trim().toUpperCase()
      if (!tsCode) continue
      if (!map.has(tsCode)) map.set(tsCode, null)
    }
  }
  if (sources.includes('allMarket')) {
    // 无本地全市场名单时：取近期有日线缓存的代码（上限由调用方截断）
    const rows = db.prepare(`
      SELECT DISTINCT ts_code AS tsCode FROM daily_close_cache
      ORDER BY ts_code ASC LIMIT 800
    `).all() as Array<{ tsCode: string }>
    for (const row of rows) {
      if (!map.has(row.tsCode)) map.set(row.tsCode, null)
    }
  }
  return [...map.entries()].map(([tsCode, stockName]) => ({ tsCode, stockName }))
}

function offsetStartDate(endYmd: string, lookbackDays: number): string {
  // endYmd is YYYYMMDD; approximate calendar backfill *2 for weekends
  const y = Number(endYmd.slice(0, 4))
  const m = Number(endYmd.slice(4, 6)) - 1
  const d = Number(endYmd.slice(6, 8))
  const date = new Date(Date.UTC(y, m, d))
  date.setUTCDate(date.getUTCDate() - Math.max(lookbackDays * 2, lookbackDays + 10))
  const yy = date.getUTCFullYear()
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(date.getUTCDate()).padStart(2, '0')
  return `${yy}${mm}${dd}`
}

export function runDailyDslScan(
  db: Database.Database,
  input: {
    template: DailyDslTemplate
    stockPoolSources?: string[]
    manualTsCodes?: string[]
    lookbackDays?: number
    dateEnd?: string | null
    limit?: number
    signal?: AbortSignal
  },
): DailyDslScanResult {
  const dateEnd = input.dateEnd
    ?? (db.prepare('SELECT MAX(trade_date) AS d FROM daily_close_cache').get() as { d: string | null } | undefined)?.d
    ?? new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10).replace(/-/g, '')
  const lookbackDays = input.lookbackDays ?? 60
  const startDate = offsetStartDate(dateEnd, lookbackDays)
  let pool = resolveStockPool(db, input.stockPoolSources ?? ['portfolio', 'manual'], input.manualTsCodes ?? [])
  if (input.limit != null && input.limit > 0) pool = pool.slice(0, input.limit)

  const series = queryDailyClose(db, pool.map((item) => item.tsCode), startDate)
  const matches: DailyDslScanMatch[] = []
  for (const item of pool) {
    if (input.signal?.aborted) break
    const rows = series.get(item.tsCode) ?? []
    const evaluation = evaluateDailyDslTemplate(input.template, toBars(rows), dateEnd)
    if (!evaluation.passed) continue
    matches.push({
      tsCode: item.tsCode,
      stockName: item.stockName,
      tradeDate: dateEnd,
      score: evaluation.totalScore,
      evaluation,
    })
  }
  matches.sort((a, b) => b.score - a.score)
  return {
    totalStocks: pool.length,
    matchedCount: matches.length,
    dateEnd,
    matches,
  }
}
