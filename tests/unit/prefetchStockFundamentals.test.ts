import { afterEach, describe, expect, it, vi } from 'vitest'
import { prefetchStockFundamentalsIfMissing } from '../../src/components/StockChart/prefetchStockFundamentals'

describe('FR-261 prefetchStockFundamentalsIfMissing', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('refreshes only when local status is missing', async () => {
    const get = vi.fn().mockResolvedValue({
      ok: true,
      snapshot: { status: 'missing' },
    })
    const refresh = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('window', {
      api: { stockFundamentals: { get, refresh } },
    })

    await prefetchStockFundamentalsIfMissing('600519')
    expect(get).toHaveBeenCalledWith('600519')
    expect(refresh).toHaveBeenCalledWith('600519')
  })

  it('skips refresh when local facts already exist', async () => {
    const get = vi.fn().mockResolvedValue({
      ok: true,
      snapshot: { status: 'complete' },
    })
    const refresh = vi.fn()
    vi.stubGlobal('window', {
      api: { stockFundamentals: { get, refresh } },
    })

    await prefetchStockFundamentalsIfMissing('600519')
    expect(refresh).not.toHaveBeenCalled()
  })

  it('ignores invalid codes and preset-like non-six-digit input', async () => {
    const get = vi.fn()
    const refresh = vi.fn()
    vi.stubGlobal('window', {
      api: { stockFundamentals: { get, refresh } },
    })

    await prefetchStockFundamentalsIfMissing('sh000001')
    await prefetchStockFundamentalsIfMissing('')
    expect(get).not.toHaveBeenCalled()
    expect(refresh).not.toHaveBeenCalled()
  })
})
