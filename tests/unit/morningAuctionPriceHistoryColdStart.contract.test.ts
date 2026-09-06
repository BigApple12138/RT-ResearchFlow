import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('早盘竞价价史冷启动（本地首包）契约', () => {
  const service = readFileSync(
    resolve('electron/main/services/morningAuctionService.ts'),
    'utf8',
  )
  const ui = readFileSync(
    resolve('src/components/ShortTermStrategy/MorningAuction.tsx'),
    'utf8',
  )

  it('get 路径本地首包并后台远端，refresh 仍 await ensure', () => {
    expect(service).toContain('createPriceHistoryLoadDependencies(true)')
    expect(service).toContain('void mergePriceHistoryRemoteBackground')
    expect(service).toContain('const awaitRemote = options.awaitRemote === true || options.retryUnresolved === true')
    expect(service).toContain('await mergePriceHistory(cachedSnapshot, tradeDate, { retryUnresolved: true })')
  })

  it('前端对未齐价史与题材一样 5s 后再 get', () => {
    expect(ui).toContain('hasIncompletePriceHistory')
    expect(ui).toContain('coverage.readyCount < coverage.requestedCount')
    expect(ui).toContain('setTimeout(() => void loadSnapshot(false, snapshot.tradeDate), 5000)')
  })
})
