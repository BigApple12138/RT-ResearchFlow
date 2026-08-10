import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}

describe('FR-168 portfolio batch forecast progress contracts', () => {
  it('preload exposes forecastNow and onForecastProgress', () => {
    const preload = source('electron/preload/index.ts')
    const start = preload.indexOf('// ── FR-168: 持仓批量 AI 预测')
    const contract = preload.slice(start, preload.indexOf('// ── FR-171:', start))

    expect(start).toBeGreaterThan(0)
    expect(contract).toContain('forecastNow:')
    expect(contract).toContain('onForecastProgress:')
    expect(contract).toContain("portfolio:forecastProgress")
  })

  it('main job pushes progress including empty-pending terminal event', () => {
    const service = source('electron/main/services/portfolioForecastService.ts')

    expect(service).toContain("win.webContents.send('portfolio:forecastProgress'")
    expect(service).toContain("error: 'ALREADY_DONE_TODAY'")
    expect(service).toContain('current: i + 1')
  })

  it('batch forecast reuses shared AI credential resolution (not legacy provider-only)', () => {
    const handlers = source('electron/main/ipc/aiHandlers.ts')
    const service = source('electron/main/services/aiFallbackService.ts')

    expect(service).toContain('export function resolveForecastProviderIds')
    expect(handlers).toContain('resolveForecastProviderIds(db)')
    expect(handlers).not.toMatch(
      /performPredictTrendToday[\s\S]{0,800}multiModelProviders\.length > 0 \? multiModelProviders : aiConfig\.provider/,
    )
  })
})
