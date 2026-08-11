/**
 * 日K筹码抽屉会话缓存（进程内）。
 * Spec: docs/superpowers/specs/2026-08-11-kline-chip-drawer-cache-design.md
 */

import type { ChipPoint } from '../../utils/drawChipsCanvas'
import type { FactorData } from './FactorSummary'
import type { StockStructureRow } from './stockStructureInsightModel'

export type DrawerOhlcvRow = StockStructureRow

export interface StockKlineChipDrawerCacheEntry {
  tsCode: string
  ohlcvRows: DrawerOhlcvRow[]
  chips: ChipPoint[] | null
  factor: FactorData | null
  fingerprint: string
  cachedAt: number
}

/** 有缓存且未超 TTL 时可跳过网络；超时后仍先展示缓存再校验变化。 */
export const DRAWER_CACHE_TTL_MS = 5 * 60 * 1000

const cacheByCode = new Map<string, StockKlineChipDrawerCacheEntry>()

export function buildDrawerCacheFingerprint(input: {
  ohlcvRows: Array<{ tradeDate: string }>
  chips: ChipPoint[] | null | undefined
  factor: { tradeDate?: string } | null | undefined
}): string {
  const latestK = input.ohlcvRows.length > 0
    ? input.ohlcvRows[input.ohlcvRows.length - 1]!.tradeDate
    : ''
  const factorDate = input.factor?.tradeDate ?? ''
  const chipsLen = input.chips?.length ?? 0
  return `${latestK}|${factorDate}|${chipsLen}`
}

export function getDrawerCache(tsCode: string): StockKlineChipDrawerCacheEntry | null {
  return cacheByCode.get(normalizeCode(tsCode)) ?? null
}

export function isDrawerCacheFresh(
  entry: StockKlineChipDrawerCacheEntry,
  now = Date.now(),
  ttlMs = DRAWER_CACHE_TTL_MS,
): boolean {
  return now - entry.cachedAt <= ttlMs
}

export function hasFreshDrawerCache(tsCode: string, now = Date.now()): boolean {
  const entry = getDrawerCache(tsCode)
  return entry != null && isDrawerCacheFresh(entry, now)
}

export function putDrawerCache(entry: Omit<StockKlineChipDrawerCacheEntry, 'fingerprint' | 'cachedAt'> & {
  fingerprint?: string
  cachedAt?: number
}): StockKlineChipDrawerCacheEntry {
  const fingerprint = entry.fingerprint ?? buildDrawerCacheFingerprint(entry)
  const next: StockKlineChipDrawerCacheEntry = {
    tsCode: normalizeCode(entry.tsCode),
    ohlcvRows: entry.ohlcvRows,
    chips: entry.chips,
    factor: entry.factor,
    fingerprint,
    cachedAt: entry.cachedAt ?? Date.now(),
  }
  cacheByCode.set(next.tsCode, next)
  return next
}

export function clearDrawerCache(tsCode?: string): void {
  if (tsCode) cacheByCode.delete(normalizeCode(tsCode))
  else cacheByCode.clear()
}

function normalizeCode(tsCode: string): string {
  return tsCode.trim().toUpperCase()
}
