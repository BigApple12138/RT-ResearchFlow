import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  loadMinuteKlineOnce,
  mapMinuteOhlcvToIntradayItems,
  nextIntradayStyle,
  resolveIntradayInitialData,
  startIndexIntradayPolling,
  toTsCodeForMinute,
  toTsCodeWithSuffix,
} from '../../src/components/StockChart/StockChart'

// 2026-08-13 指数分时专业版：前端透传 / 读库放行 / 轮询 / 三级降级单测（全 mock window.api，不打公网）

type MinuteKlineRow = {
  tsMinute: string
  open: number | null
  high: number | null
  low: number | null
  close: number | null
  vol: number | null
}

function klineRow(tsMinute: string, close: number): MinuteKlineRow {
  return { tsMinute, open: close - 0.1, high: close + 0.1, low: close - 0.2, close, vol: 1000 }
}

interface FakeWindowApi {
  datasource: {
    getStockMinuteKline: ReturnType<typeof vi.fn>
    getIntradayData: ReturnType<typeof vi.fn>
    subscribeStockMinute: ReturnType<typeof vi.fn>
  }
}

let api: FakeWindowApi
let storage: Record<string, string>

beforeEach(() => {
  api = {
    datasource: {
      getStockMinuteKline: vi.fn().mockResolvedValue({ ok: true, data: [] }),
      getIntradayData: vi.fn().mockResolvedValue({ items: [] }),
      subscribeStockMinute: vi.fn().mockResolvedValue({ ok: true }),
    },
  }
  storage = {}
  ;(globalThis as Record<string, unknown>).window = { api }
  ;(globalThis as Record<string, unknown>).localStorage = {
    setItem: (key: string, value: string) => {
      storage[key] = value
    },
    getItem: (key: string) => storage[key] ?? null,
  }
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('toTsCodeForMinute 后缀透传', () => {
  it('已含 "." 的指数代码原样透传', () => {
    expect(toTsCodeForMinute('000001.SH')).toBe('000001.SH')
    expect(toTsCodeForMinute('399001.SZ')).toBe('399001.SZ')
    expect(toTsCodeForMinute('399006.SZ')).toBe('399006.SZ')
  })

  it('6 位裸码后缀逻辑不回归', () => {
    expect(toTsCodeForMinute('600519')).toBe('600519.SH')
    expect(toTsCodeForMinute('000001')).toBe('000001.SZ')
    expect(toTsCodeForMinute('830799')).toBe('830799.BJ')
    expect(toTsCodeForMinute('430047')).toBe('430047.BJ')
    expect(toTsCodeForMinute('900912')).toBe('900912.SH')
  })

  it('toTsCodeWithSuffix 对含点代码返回空串的语义不回归（chips/factor 链路）', () => {
    expect(toTsCodeWithSuffix('000001.SH')).toBe('')
    expect(toTsCodeWithSuffix('600519')).toBe('600519.SH')
    expect(toTsCodeWithSuffix('000001')).toBe('000001.SZ')
  })
})

describe('mapMinuteOhlcvToIntradayItems 折线映射', () => {
  it('close 作 price，过滤午休与非正式交易时段', () => {
    const items = mapMinuteOhlcvToIntradayItems([
      { tsMinute: '09:25', close: 3200, vol: 10 }, // 集合竞价过滤
      { tsMinute: '09:31', close: 3210.5, vol: 100 },
      { tsMinute: '11:35', close: 3215, vol: 200 }, // 午休过滤
      { tsMinute: '13:05', close: 3220, vol: 300 },
      { tsMinute: '15:05', close: 3230, vol: 400 }, // 盘后过滤
    ])
    expect(items).toEqual([
      { time: '09:31', price: 3210.5, volume: 100 },
      { time: '13:05', price: 3220, volume: 300 },
    ])
  })
})

describe('startIndexIntradayPolling 指数 60s 轮询', () => {
  it('每轮询周期只发 1 次 getStockMinuteKline（同一响应派生 items/ohlcv），停止后不再调用', async () => {
    vi.useFakeTimers()
    api.datasource.getStockMinuteKline.mockResolvedValue({ ok: true, data: [klineRow('09:31', 3210.5)] })
    const apply = vi.fn()

    const stop = startIndexIntradayPolling('000001.SH', { apply })
    expect(api.datasource.getStockMinuteKline).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(60_000)
    // 三维复审修复后：单次拉取派生 items/ohlcv（原为双路各调一次共 2 次）
    expect(api.datasource.getStockMinuteKline).toHaveBeenCalledTimes(1)
    expect(api.datasource.getStockMinuteKline).toHaveBeenCalledWith('000001.SH', undefined)
    expect(api.datasource.subscribeStockMinute).not.toHaveBeenCalled() // 指数只轮询不订阅
    expect(apply).toHaveBeenCalledWith({
      items: [{ time: '09:31', price: 3210.5, volume: 1000 }],
      ohlcv: [{ tsMinute: '09:31', open: 3210.4, high: 3210.6, low: 3210.3, close: 3210.5, vol: 1000 }],
    })

    stop()
    await vi.advanceTimersByTimeAsync(180_000)
    expect(api.datasource.getStockMinuteKline).toHaveBeenCalledTimes(1) // 定时器已清除
    vi.useRealTimers()
  })
})

describe('loadMinuteKlineOnce 单次拉取与 in-flight 去重（三维复审修复）', () => {
  it('并发调用同一代码只发 1 次 getStockMinuteKline，结果一致', async () => {
    api.datasource.getStockMinuteKline.mockResolvedValue({ ok: true, data: [klineRow('09:31', 3210.5)] })

    const [a, b] = await Promise.all([
      loadMinuteKlineOnce('000001.SH'),
      loadMinuteKlineOnce('000001.SH'),
    ])

    expect(api.datasource.getStockMinuteKline).toHaveBeenCalledTimes(1)
    expect(a).toEqual(b)
    expect(a.items).toEqual([{ time: '09:31', price: 3210.5, volume: 1000 }])
    expect(a.ohlcv).toHaveLength(1)
  })

  it('in-flight 结束后再次调用会重新拉取（不缓存陈旧结果）', async () => {
    api.datasource.getStockMinuteKline.mockResolvedValue({ ok: true, data: [] })

    await loadMinuteKlineOnce('399006.SZ')
    await loadMinuteKlineOnce('399006.SZ')

    expect(api.datasource.getStockMinuteKline).toHaveBeenCalledTimes(2)
  })

  it('resolveIntradayInitialData 首拉也只发 1 次 getStockMinuteKline', async () => {
    api.datasource.getStockMinuteKline.mockResolvedValue({ ok: true, data: [klineRow('09:31', 3210.5)] })

    await resolveIntradayInitialData('000001.SH', { fetchFiveMinute: vi.fn() })

    expect(api.datasource.getStockMinuteKline).toHaveBeenCalledTimes(1)
  })
})

describe('nextIntradayStyle 全局偏好切换', () => {
  it('蜡烛 ⇄ 折线互切并写入全局单键 localStorage.intradayStyle', () => {
    expect(nextIntradayStyle('candle')).toBe('line')
    expect(storage.intradayStyle).toBe('line')
    expect(nextIntradayStyle('line')).toBe('candle')
    expect(storage.intradayStyle).toBe('candle')
  })
})

describe('resolveIntradayInitialData 三级降级', () => {
  it('① 分钟链路有数据 → 直接返回，不回退 5 分钟折线', async () => {
    api.datasource.getStockMinuteKline.mockResolvedValue({ ok: true, data: [klineRow('09:31', 3210.5)] })
    const fetchFiveMinute = vi.fn()

    const { items, ohlcv } = await resolveIntradayInitialData('000001.SH', { fetchFiveMinute })

    expect(fetchFiveMinute).not.toHaveBeenCalled()
    expect(api.datasource.getIntradayData).not.toHaveBeenCalled()
    expect(items).toEqual([{ time: '09:31', price: 3210.5, volume: 1000 }])
    expect(ohlcv).toHaveLength(1)
  })

  it('② 分钟链路空 → 回退东财 5 分钟折线', async () => {
    api.datasource.getStockMinuteKline.mockResolvedValue({ ok: true, data: [] })
    const fetchFiveMinute = vi.fn().mockResolvedValue([{ time: '09:35', price: 3210, volume: 50 }])

    const { items, ohlcv } = await resolveIntradayInitialData('000001.SH', { fetchFiveMinute })

    expect(fetchFiveMinute).toHaveBeenCalledWith('000001.SH')
    expect(items).toEqual([{ time: '09:35', price: 3210, volume: 50 }])
    expect(ohlcv).toEqual([])
  })

  it('② 默认降级路径走 window.api.datasource.getIntradayData 并过滤午休', async () => {
    api.datasource.getStockMinuteKline.mockResolvedValue({ ok: true, data: [] })
    api.datasource.getIntradayData.mockResolvedValue({
      items: [
        { time: '09:35', price: 3210, volume: 50 },
        { time: '11:40', price: 3212, volume: 60 }, // 午休过滤
      ],
    })

    const { items } = await resolveIntradayInitialData('000001.SH')

    expect(api.datasource.getIntradayData).toHaveBeenCalledWith('000001.SH')
    expect(items).toEqual([{ time: '09:35', price: 3210, volume: 50 }])
  })

  it('③ 两级皆失败 → 返回空（组件落空态文案，不转圈）', async () => {
    api.datasource.getStockMinuteKline.mockResolvedValue({ ok: true, data: [] })
    const fetchFiveMinute = vi.fn().mockRejectedValue(new Error('eastmoney down'))

    const { items, ohlcv } = await resolveIntradayInitialData('000001.SH', { fetchFiveMinute })

    expect(items).toEqual([])
    expect(ohlcv).toEqual([])
  })
})

describe('指数分时链路组件守卫（源码契约）', () => {
  it('指数进入分时不订阅、走轮询；样式按钮对指数显示', async () => {
    const { readFileSync } = await import('node:fs')
    const source = readFileSync('src/components/StockChart/StockChart.tsx', 'utf8')

    // 分时 effect 指数分支：轮询而非订阅
    expect(source).toContain('startIndexIntradayPolling(selected')
    expect(source).toContain('预设指数：60s 轮询')
    // handleToggleChartMode 指数同样读库放行（读库不再包在 !PRESET_CODES 守卫内）
    const toggleStart = source.indexOf('async function handleToggleChartMode()')
    const toggleBody = source.slice(toggleStart, source.indexOf('async function handlePredictTrendToday'))
    expect(toggleBody).toContain('resolveIntradayInitialData(selected)')
    expect(toggleBody.indexOf('subscribeStockMinute')).toBeLessThan(toggleBody.indexOf('resolveIntradayInitialData'))
    // 样式切换按钮对指数显示：条件仅保留 chartMode === "intraday"
    const btnIdx = source.indexOf('data-testid="intraday-style-toggle-btn"')
    expect(btnIdx).toBeGreaterThan(-1)
    const btnCondition = source.slice(Math.max(0, btnIdx - 200), btnIdx)
    expect(btnCondition).not.toContain('!PRESET_CODES.includes(selected)')
  })

  it('个股代码路径不启动轮询（互斥契约）：轮询调用位于 PRESET_CODES 守卫分支内，个股分支仅含订阅', async () => {
    const { readFileSync } = await import('node:fs')
    const source = readFileSync('src/components/StockChart/StockChart.tsx', 'utf8')

    // 分时刷新生命周期 effect 全量正文（指数分支 + 个股分支）
    const effectStart = source.indexOf('FR-123: 分时模式刷新生命周期')
    const effectEnd = source.indexOf('// 日 K：盘中自动刷新', effectStart)
    expect(effectStart).toBeGreaterThan(-1)
    expect(effectEnd).toBeGreaterThan(effectStart)
    const effectBody = source.slice(effectStart, effectEnd)

    // 轮询启动点必须位于 `if (PRESET_CODES.includes(selected))` 指数守卫分支之后
    const guardIdx = effectBody.indexOf('if (PRESET_CODES.includes(selected))')
    const pollingIdx = effectBody.indexOf('startIndexIntradayPolling(selected')
    expect(guardIdx).toBeGreaterThan(-1)
    expect(pollingIdx).toBeGreaterThan(guardIdx)
    // 全 effect 内轮询启动仅 1 处（不存在守卫外的第二启动点）
    expect(effectBody.indexOf('startIndexIntradayPolling(selected', pollingIdx + 1)).toBe(-1)

    // 指数守卫分支内不得出现订阅 API（指数不订阅 rt_min）
    const stockBranchStart = effectBody.indexOf('const api = window.api.datasource')
    expect(stockBranchStart).toBeGreaterThan(pollingIdx)
    const indexBranch = effectBody.slice(guardIdx, stockBranchStart)
    expect(indexBranch).not.toContain('subscribeStockMinute')

    // 个股分支（守卫外）：仅含订阅链路，不启动轮询
    const stockBranch = effectBody.slice(stockBranchStart)
    expect(stockBranch).toContain('subscribeStockMinute')
    expect(stockBranch).not.toContain('startIndexIntradayPolling')
  })
})
