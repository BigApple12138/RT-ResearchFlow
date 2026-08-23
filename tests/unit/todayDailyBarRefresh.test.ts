import { describe, expect, it } from 'vitest'
import {
  buildDailyRowFromIntradayItems,
  buildDailyRowFromMinuteRows,
  isBjDailyBarSession,
  isLikelyOfficialDailyBar,
  shouldRefreshTodayDailyBar,
} from '../../electron/main/services/todayDailyBarRefresh'

describe('shouldRefreshTodayDailyBar', () => {
  it('盘中始终刷新', () => {
    expect(
      shouldRefreshTodayDailyBar({
        hasExisting: true,
        existingAmount: 100,
        inSession: true,
      }),
    ).toBe(true)
  })

  it('非盘中已有则跳过', () => {
    expect(
      shouldRefreshTodayDailyBar({
        hasExisting: true,
        existingAmount: null,
        inSession: false,
      }),
    ).toBe(false)
  })

  it('非盘中缺失则补', () => {
    expect(
      shouldRefreshTodayDailyBar({
        hasExisting: false,
        existingAmount: null,
        inSession: false,
      }),
    ).toBe(true)
  })

  it('非盘中 force 不覆盖正式日线', () => {
    expect(
      shouldRefreshTodayDailyBar({
        hasExisting: true,
        existingAmount: 12.5,
        inSession: false,
        force: true,
      }),
    ).toBe(false)
  })

  it('非盘中 force 可覆盖无 amount 的合成日线', () => {
    expect(
      shouldRefreshTodayDailyBar({
        hasExisting: true,
        existingAmount: null,
        inSession: false,
        force: true,
      }),
    ).toBe(true)
  })
})

describe('aggregators', () => {
  it('分时聚合开高低收与量', () => {
    const row = buildDailyRowFromIntradayItems('601016', '20260811', [
      { time: '09:35', price: 3.5, volume: 100 },
      { time: '10:00', price: 3.6, volume: 200 },
      { time: '10:30', price: 3.55, volume: 50 },
    ])
    expect(row).toMatchObject({
      open: 3.5,
      high: 3.6,
      low: 3.5,
      close: 3.55,
      volume: 350,
      amount: null,
    })
  })

  it('分钟聚合含成交额', () => {
    const row = buildDailyRowFromMinuteRows('601016', '20260811', [
      {
        stockCode: '601016',
        tradeDate: '20260811',
        tsMinute: '09:31',
        open: 3.5,
        high: 3.52,
        low: 3.49,
        close: 3.51,
        vol: 10,
        amount: 3.5,
        fetchedAt: 1,
      },
      {
        stockCode: '601016',
        tradeDate: '20260811',
        tsMinute: '10:00',
        open: 3.51,
        high: 3.6,
        low: 3.5,
        close: 3.56,
        vol: 20,
        amount: 7,
        fetchedAt: 1,
      },
    ])
    expect(row).toMatchObject({
      open: 3.5,
      high: 3.6,
      low: 3.49,
      close: 3.56,
      volume: 30,
      amount: 10.5,
    })
  })
})

describe('session helpers', () => {
  it('isLikelyOfficialDailyBar', () => {
    expect(isLikelyOfficialDailyBar(1)).toBe(true)
    expect(isLikelyOfficialDailyBar(null)).toBe(false)
  })

  it('isBjDailyBarSession morning', () => {
    // 2026-08-11 10:00 UTC+8 = 02:00 UTC
    const ms = Date.UTC(2026, 7, 11, 2, 0, 0)
    expect(isBjDailyBarSession(ms)).toBe(true)
  })

  it('isBjDailyBarSession night off', () => {
    const ms = Date.UTC(2026, 7, 11, 12, 0, 0) // 20:00 BJ
    expect(isBjDailyBarSession(ms)).toBe(false)
  })
})
