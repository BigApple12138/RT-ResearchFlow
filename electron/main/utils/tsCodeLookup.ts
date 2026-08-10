import { normalizeTrendTsCode } from '../services/trendStructureReviewTypes'

/**
 * 日线/筹码/因子缓存查询用候选码：优先完整 tsCode（600000.SH），兼容历史裸六位。
 */
export function tsCodeLookupCandidates(tsCode: string): string[] {
  const clean = tsCode.trim().toUpperCase()
  if (!clean) return []
  const bare = clean.replace(/\.(SH|SZ|BJ)$/i, '')
  const normalized = /^\d{6}$/.test(bare) ? normalizeTrendTsCode(bare) : clean
  return [...new Set([normalized, clean, bare].filter(Boolean))]
}

/** 上游拉数统一用带交易所后缀的 tsCode。 */
export function resolveCanonicalTsCode(tsCode: string): string {
  const candidates = tsCodeLookupCandidates(tsCode)
  return candidates[0] ?? tsCode.trim().toUpperCase()
}

/**
 * 将日线行按自选股 stockCode 可查：同时索引完整 tsCode 与裸六位。
 * （stock_info / stock_price_cache 常存裸六位，daily 接口返回 002628.SZ）
 */
export function indexRowsByWatchlistStockCode<T extends { tsCode: string }>(
  rows: T[],
): Map<string, T> {
  const map = new Map<string, T>()
  for (const row of rows) {
    const tsCode = row.tsCode.trim().toUpperCase()
    if (!tsCode) continue
    map.set(tsCode, row)
    const bare = tsCode.replace(/\.(SH|SZ|BJ)$/i, '')
    if (bare && bare !== tsCode) map.set(bare, row)
  }
  return map
}
