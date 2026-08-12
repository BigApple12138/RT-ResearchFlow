import type Database from 'better-sqlite3'
import { getDataSourceConfig } from '../database/dataSourceRepository'
import {
  queryFactor,
  queryLatestFactor,
  upsertFactor,
} from '../database/stkFactorCacheRepository'
import { decryptApiKey } from '../utils/apiKeyEncryption'
import { tsCodeLookupCandidates } from '../utils/tsCodeLookup'
import { fetchStkFactorPro, type StkFactorRow } from './tushareService'

export function isStkFactorCacheStale(
  cachedTradeDate: string | null | undefined,
  expectedTradeDate: string,
): boolean {
  if (!cachedTradeDate) return true
  return cachedTradeDate < expectedTradeDate
}

function getStockLatestDailyTradeDate(db: Database.Database, tsCode: string): string | null {
  const candidates = tsCodeLookupCandidates(tsCode)
  if (candidates.length === 0) return null
  const placeholders = candidates.map(() => '?').join(',')
  const row = db
    .prepare(
      `SELECT MAX(trade_date) AS d FROM daily_close_cache WHERE ts_code IN (${placeholders})`,
    )
    .get(...candidates) as { d: string | null } | undefined
  return row?.d ?? null
}

/** 期望因子交易日：个股本地日线最新与市场参考日取较新者（仍为日频，非盘中秒级）。 */
export function resolveFactorExpectedTradeDate(
  db: Database.Database,
  tsCode: string,
  marketLatestTradeDate: string,
): string {
  const stockDaily = getStockLatestDailyTradeDate(db, tsCode)
  if (stockDaily && stockDaily > marketLatestTradeDate) return stockDaily
  return marketLatestTradeDate
}

export type StkFactorLoadResult =
  | { ok: true; data: StkFactorRow; refreshed: boolean }
  | { ok: false; code: 'TUSHARE_DISABLED' | 'UPSTREAM_ERROR' | 'TUSHARE_QUOTA_INSUFFICIENT'; data?: StkFactorRow }

export interface LoadStockFactorDeps {
  fetchFactor?: (
    token: string,
    tsCode: string,
    tradeDate?: string,
  ) => Promise<StkFactorRow | null>
  marketLatestTradeDate: string
}

/**
 * 默认加载（未指定 tradeDate）：缓存落后期望交易日则 Tushare 补拉；失败回退旧缓存。
 * 指定 tradeDate：精确命中缓存则返回；否则拉取该日。
 */
export async function loadStockFactorWithStaleRefresh(
  db: Database.Database,
  tsCode: string,
  tradeDate: string | undefined,
  deps: LoadStockFactorDeps,
): Promise<StkFactorLoadResult> {
  const fetchFactor = deps.fetchFactor ?? fetchStkFactorPro
  const isDefaultLoad = !tradeDate

  if (!isDefaultLoad && tradeDate) {
    const exact = queryFactor(db, tsCode, tradeDate)
    if (exact) return { ok: true, data: exact, refreshed: false }
  }

  const latest = queryLatestFactor(db, tsCode)
  const expected = resolveFactorExpectedTradeDate(db, tsCode, deps.marketLatestTradeDate)

  if (isDefaultLoad && latest && !isStkFactorCacheStale(latest.tradeDate, expected)) {
    return { ok: true, data: latest, refreshed: false }
  }

  const ds = getDataSourceConfig(db)
  if (!ds.tushareEnabled || !ds.tushareTokenEncrypted) {
    if (latest) return { ok: true, data: latest, refreshed: false }
    return { ok: false, code: 'TUSHARE_DISABLED' }
  }
  const token = decryptApiKey(ds.tushareTokenEncrypted)
  if (!token) {
    if (latest) return { ok: true, data: latest, refreshed: false }
    return { ok: false, code: 'TUSHARE_DISABLED' }
  }

  const apiDate = isDefaultLoad ? expected : tradeDate!
  try {
    let row = await fetchFactor(token, tsCode, apiDate)
    if (!row && isDefaultLoad) row = await fetchFactor(token, tsCode)
    if (row) {
      upsertFactor(db, row)
      return { ok: true, data: row, refreshed: true }
    }
    if (latest) return { ok: true, data: latest, refreshed: false }
    return { ok: false, code: 'UPSTREAM_ERROR', data: latest ?? undefined }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (latest) return { ok: true, data: latest, refreshed: false }
    if (msg.includes('TUSHARE_QUOTA_INSUFFICIENT')) {
      return { ok: false, code: 'TUSHARE_QUOTA_INSUFFICIENT' }
    }
    return { ok: false, code: 'UPSTREAM_ERROR' }
  }
}
