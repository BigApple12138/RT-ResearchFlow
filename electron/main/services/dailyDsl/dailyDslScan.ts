import type Database from 'better-sqlite3'
import { queryDailyClose } from '../../database/dailyCloseCacheRepository'
import { listPortfolioStocks } from '../../database/portfolioRepository'
import type { DailyRow } from '../tushareService'
import { evaluateDailyDslTemplate } from './dailyDslEvaluator'
import type { DailyDslBar, DailyDslEvaluationResult, DailyDslGroup, DailyDslTemplate } from './types'
import { isDailyDslBlock } from './types'

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

function maxMaPeriod(template: DailyDslTemplate): number {
  let max = 0
  const walk = (group: DailyDslGroup): void => {
    for (const child of group.children) {
      if (isDailyDslBlock(child)) {
        if (child.type === 'daily_ma_cross') {
          const period = Number(child.params.maPeriod)
          if (Number.isFinite(period)) max = Math.max(max, period)
        }
      } else {
        walk(child)
      }
    }
  }
  walk(template.root)
  return max
}

function resolveStockName(db: Database.Database, tsCode: string, fallback: string | null): string | null {
  if (fallback) return fallback
  const row = db.prepare(`
    SELECT name FROM stock_basic_cache WHERE ts_code = ? LIMIT 1
  `).get(tsCode) as { name: string | null } | undefined
  if (row?.name) return row.name
  const info = db.prepare(`
    SELECT stockName FROM stock_info WHERE stockCode = ? LIMIT 1
  `).get(tsCode.includes('.') ? tsCode.split('.')[0] : tsCode) as { stockName: string | null } | undefined
  return info?.stockName ?? null
}

function resolveStockPool(
  db: Database.Database,
  sources: string[],
  manualTsCodes: string[],
  options: { excludeST?: boolean; excludeBJ?: boolean; allMarketLimit?: number } = {},
): Array<{ tsCode: string; stockName: string | null }> {
  const map = new Map<string, string | null>()
  const add = (tsCodeRaw: string, stockName: string | null) => {
    const tsCode = tsCodeRaw.trim().toUpperCase()
    if (!tsCode) return
    if (!map.has(tsCode)) map.set(tsCode, stockName)
  }

  if (sources.includes('portfolio')) {
    for (const row of listPortfolioStocks(db)) add(row.tsCode, row.stockName ?? null)
  }
  if (sources.includes('trendWatchlist')) {
    try {
      const rows = db.prepare('SELECT ts_code, stock_name FROM trend_watchlist').all() as Array<{ ts_code: string; stock_name: string | null }>
      for (const row of rows) add(row.ts_code, row.stock_name)
    } catch { /* 表不存在时忽略 */ }
  }
  if (sources.includes('chipMonitor')) {
    try {
      const rows = db.prepare('SELECT ts_code, stock_name FROM chip_monitor_stocks').all() as Array<{ ts_code: string; stock_name: string | null }>
      for (const row of rows) add(row.ts_code, row.stock_name)
    } catch { /* 表不存在时忽略 */ }
  }
  if (sources.includes('manual') || manualTsCodes.length > 0) {
    for (const code of manualTsCodes) add(code, null)
  }
  if (sources.includes('allMarket')) {
    const limit = Math.max(1, options.allMarketLimit ?? 800)
    const rows = db.prepare(`
      SELECT DISTINCT ts_code AS tsCode FROM daily_close_cache
      ORDER BY ts_code ASC LIMIT ?
    `).all(limit) as Array<{ tsCode: string }>
    for (const row of rows) add(row.tsCode, null)
  }

  let pool = [...map.entries()].map(([tsCode, stockName]) => ({
    tsCode,
    stockName: resolveStockName(db, tsCode, stockName),
  }))
  if (options.excludeST) {
    pool = pool.filter((item) => !(item.stockName ?? '').toUpperCase().includes('ST'))
  }
  if (options.excludeBJ) {
    pool = pool.filter((item) => !item.tsCode.endsWith('.BJ') && !/^(4|8)\d{5}/.test(item.tsCode.split('.')[0] ?? ''))
  }
  return pool
}

function offsetStartDate(endYmd: string, lookbackDays: number): string {
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
    excludeST?: boolean
    excludeBJ?: boolean
    lookbackDays?: number
    dateEnd?: string | null
    /** 仅约束 allMarket 候选上限；不影响已选持仓/趋势池/筹码/手动代码 */
    allMarketLimit?: number
    signal?: AbortSignal
  },
): DailyDslScanResult {
  const dateEnd = input.dateEnd
    ?? (db.prepare('SELECT MAX(trade_date) AS d FROM daily_close_cache').get() as { d: string | null } | undefined)?.d
    ?? new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10).replace(/-/g, '')
  const lookbackDays = Math.max(input.lookbackDays ?? 60, maxMaPeriod(input.template), 60)
  const startDate = offsetStartDate(dateEnd, lookbackDays)
  const pool = resolveStockPool(
    db,
    input.stockPoolSources ?? ['portfolio', 'manual'],
    input.manualTsCodes ?? [],
    {
      excludeST: input.excludeST === true,
      excludeBJ: input.excludeBJ === true,
      allMarketLimit: input.allMarketLimit,
    },
  )

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
