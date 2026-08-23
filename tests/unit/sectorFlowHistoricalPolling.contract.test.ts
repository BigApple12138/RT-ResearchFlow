import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('板块资金历史模式停轮询契约', () => {
  const source = readFileSync(
    resolve('src/components/MarketOverview/SectorFlow.tsx'),
    'utf8',
  )

  it('历史回看时不注册 60s 轮询定时器', () => {
    expect(source).toContain('const isHistoricalView = Boolean(')
    expect(source).toMatch(/if \(isHistoricalView\) return[\s\S]*setInterval/)
    expect(source).toContain('60_000')
  })
})
