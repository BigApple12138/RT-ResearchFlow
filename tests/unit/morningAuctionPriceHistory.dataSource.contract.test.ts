import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('morning auction price history dataSource contract', () => {
  it('Tushare 价史补拉写入须显式标记 dataSource=tushare', () => {
    const source = readFileSync(
      resolve('electron/main/services/morningAuctionService.ts'),
      'utf8',
    )
    expect(source).toMatch(
      /upsertDailyClose\(\s*db,\s*rows,\s*\{\s*dataSource:\s*'tushare'/,
    )
  })
})
