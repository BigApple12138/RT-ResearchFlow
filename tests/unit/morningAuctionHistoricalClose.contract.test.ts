import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('早盘竞价历史交易日收盘价投影契约', () => {
  const source = readFileSync(
    resolve('electron/main/services/morningAuctionService.ts'),
    'utf8',
  )

  it('历史日使用 mergeTradeDateClose 且禁用 rt_k 实时覆盖', () => {
    expect(source).toContain('function mergeTradeDateClose')
    expect(source).toContain('queryDailyCloseExact')
    expect(source).toContain('applyMorningAuctionCloseProjection')
    expect(source).toContain('isCurrentMorningAuctionTradeDate(tradeDate, getBeijingYmd())')
    expect(source).toContain('replaceExisting: !currentTradeDate')
    expect(source).toContain('if (currentTradeDate) mergeCurrentPrices')
    expect(source).not.toContain('mergeTodayClose')
  })

  it('Tushare 价史补拉仍标注 dataSource=tushare', () => {
    expect(source).toMatch(
      /upsertDailyClose\(\s*db,\s*rows,\s*\{\s*dataSource:\s*'tushare'/,
    )
  })
})
