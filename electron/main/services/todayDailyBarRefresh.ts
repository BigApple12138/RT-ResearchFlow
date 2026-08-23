/**
 * 日 K「今日」合成 bar 刷新策略与聚合（盘中可覆盖）。
 * Spec: docs/superpowers/specs/2026-08-11-daily-today-bar-auto-refresh-design.md
 */

import type { StockMinuteCacheRow, StockPriceCacheRow } from '../database/types'

export interface IntradayPriceVolumePoint {
  time: string
  price: number
  volume: number
}

/** 北京连续竞价附近时段：允许覆盖刷新今日合成日 K */
export function isBjDailyBarSession(nowMs: number = Date.now()): boolean {
  const bj = new Date(nowMs + 8 * 60 * 60 * 1000)
  const t = bj.getUTCHours() * 100 + bj.getUTCMinutes()
  return (t >= 915 && t <= 1135) || (t >= 1255 && t <= 1505)
}

export function isLikelyOfficialDailyBar(amount: number | null | undefined): boolean {
  return amount != null && Number.isFinite(amount)
}

/**
 * 是否应重算并 REPLACE 今日日 K。
 * - 盘中：始终刷新
 * - 非盘中：仅当缺失时补；force 且非正式日线时可再合成；不覆盖有 amount 的正式日线
 */
export function shouldRefreshTodayDailyBar(input: {
  hasExisting: boolean
  existingAmount: number | null | undefined
  inSession: boolean
  force?: boolean
}): boolean {
  const force = input.force === true
  if (input.inSession) return true
  if (!input.hasExisting) return true
  if (force && !isLikelyOfficialDailyBar(input.existingAmount)) return true
  return false
}

export function buildDailyRowFromIntradayItems(
  stockCode: string,
  tradeDate: string,
  items: IntradayPriceVolumePoint[],
  fetchedAt: number = Date.now(),
): StockPriceCacheRow | null {
  const valid = items
    .filter((i) => Number.isFinite(i.price))
    .sort((a, b) => a.time.localeCompare(b.time))
  if (valid.length === 0) return null

  const open = valid[0].price
  const close = valid[valid.length - 1].price
  const high = Math.max(...valid.map((i) => i.price))
  const low = Math.min(...valid.map((i) => i.price))
  const volume = valid.reduce((sum, i) => sum + (Number.isFinite(i.volume) ? i.volume : 0), 0)

  return {
    stockCode,
    tradeDate,
    open,
    high,
    low,
    close,
    volume,
    amount: null,
    fetchedAt,
  }
}

export function buildDailyRowFromMinuteRows(
  stockCode: string,
  tradeDate: string,
  rows: StockMinuteCacheRow[],
  fetchedAt: number = Date.now(),
): StockPriceCacheRow | null {
  const valid = rows
    .filter((r) => r.close != null && Number.isFinite(r.close))
    .slice()
    .sort((a, b) => a.tsMinute.localeCompare(b.tsMinute))
  if (valid.length === 0) return null

  const first = valid[0]
  const last = valid[valid.length - 1]
  const open = first.open != null && Number.isFinite(first.open) ? first.open : first.close!
  let high = open
  let low = open
  let volume = 0
  let amountSum = 0
  let amountCount = 0
  for (const r of valid) {
    const c = r.close!
    const h = r.high != null && Number.isFinite(r.high) ? r.high : c
    const l = r.low != null && Number.isFinite(r.low) ? r.low : c
    high = Math.max(high, h, c)
    low = Math.min(low, l, c)
    if (r.vol != null && Number.isFinite(r.vol)) volume += r.vol
    if (r.amount != null && Number.isFinite(r.amount)) {
      amountSum += r.amount
      amountCount += 1
    }
  }

  return {
    stockCode,
    tradeDate,
    open,
    high,
    low,
    close: last.close!,
    volume,
    amount: amountCount > 0 ? amountSum : null,
    fetchedAt,
  }
}
