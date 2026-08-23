import Database from 'better-sqlite3'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  handle: vi.fn(),
  fetchStockMinute: vi.fn(),
  fetchEastmoneyMinuteOHLCV: vi.fn(),
  getDataSourceConfig: vi.fn(),
  decryptApiKey: vi.fn(),
}))

vi.mock('electron', () => ({
  app: { isPackaged: false, getAppPath: () => 'E:\\test-project' },
  ipcMain: { handle: mocks.handle },
  net: {},
  BrowserWindow: class {},
}))
vi.mock('../../electron/main/database/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../electron/main/database/db')>()
  return { ...actual, getDb: mocks.getDb }
})
vi.mock('../../electron/main/services/tushareService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../electron/main/services/tushareService')>()
  return {
    ...actual,
    fetchStockMinute: mocks.fetchStockMinute,
    fetchEastmoneyMinuteOHLCV: mocks.fetchEastmoneyMinuteOHLCV,
  }
})
vi.mock('../../electron/main/database/dataSourceRepository', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../electron/main/database/dataSourceRepository')>()
  return { ...actual, getDataSourceConfig: mocks.getDataSourceConfig }
})
vi.mock('../../electron/main/utils/apiKeyEncryption', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../electron/main/utils/apiKeyEncryption')>()
  return { ...actual, decryptApiKey: mocks.decryptApiKey }
})
import { runMigrations } from '../../electron/main/database/db'
import { registerAIHandlers } from '../../electron/main/ipc/aiHandlers'

type Handler = (event: unknown, payload?: Record<string, unknown>) => unknown

function handler(channel: string): Handler {
  const registration = mocks.handle.mock.calls.find(([name]) => name === channel)
  if (!registration) throw new Error(`未注册 IPC：${channel}`)
  return registration[1] as Handler
}

function emBar(tsMinute: string, close: number) {
  return {
    tradeDate: '',
    tsMinute,
    open: close - 0.5,
    high: close + 0.5,
    low: close - 1,
    close,
    vol: 10000,
    amount: 5000,
  }
}

describe('datasource:getStockMinuteKline 指数短路', () => {
  let db: Database.Database

  beforeAll(() => {
    // 固定北京时间 2026-08-13 10:00（UTC 02:00），todayStr = 20260813
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-13T02:00:00Z'))
    registerAIHandlers(() => null)
  })

  afterAll(() => {
    vi.useRealTimers()
  })

  beforeEach(() => {
    db = new Database(':memory:')
    runMigrations(db)
    mocks.getDb.mockReturnValue(db)
    mocks.fetchStockMinute.mockReset()
    mocks.fetchEastmoneyMinuteOHLCV.mockReset()
    mocks.getDataSourceConfig.mockReset()
    mocks.decryptApiKey.mockReset()
  })

  it('指数缓存未命中：跳过 Tushare，直走东财并以带后缀键落库', async () => {
    mocks.fetchEastmoneyMinuteOHLCV.mockResolvedValue([emBar('09:31', 3210.5), emBar('09:32', 3212.1)])

    const result = await handler('datasource:getStockMinuteKline')({}, { tsCode: '000001.SH', tradeDate: '20260812' })

    expect(mocks.fetchStockMinute).not.toHaveBeenCalled()
    expect(mocks.fetchEastmoneyMinuteOHLCV).toHaveBeenCalledWith('000001.SH', '20260812')
    expect(result).toMatchObject({ ok: true })
    const data = (result as { data: Array<{ stockCode: string; tsMinute: string; close: number }> }).data
    expect(data).toHaveLength(2)
    expect(data.every((r) => r.stockCode === '000001.SH')).toBe(true)
    // 落库行必须以带后缀键存储（避免与平安银行 000001 撞键）
    const dbRows = db.prepare("SELECT stock_code FROM stock_minute_cache").all() as Array<{ stock_code: string }>
    expect(dbRows.map((r) => r.stock_code)).toEqual(['000001.SH', '000001.SH'])
  })

  it('指数历史日缓存命中：直接返回缓存行，不调东财也不调 Tushare', async () => {
    db.prepare(
      'INSERT INTO stock_minute_cache (stock_code, trade_date, ts_minute, open, high, low, close, vol, amount, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run('000001.SH', '20260812', '09:31', 3210, 3211, 3209, 3210.5, 1000, 500, 1)

    const result = await handler('datasource:getStockMinuteKline')({}, { tsCode: '000001.SH', tradeDate: '20260812' })

    expect(mocks.fetchStockMinute).not.toHaveBeenCalled()
    expect(mocks.fetchEastmoneyMinuteOHLCV).not.toHaveBeenCalled()
    const data = (result as { data: Array<{ stockCode: string; close: number }> }).data
    expect(data).toHaveLength(1)
    expect(data[0].close).toBe(3210.5)
  })

  it('指数当日缓存已存在：仍重拉东财以盘中刷新（新 bar 幂等合并）；东财为空时返回既有缓存', async () => {
    db.prepare(
      'INSERT INTO stock_minute_cache (stock_code, trade_date, ts_minute, open, high, low, close, vol, amount, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run('000001.SH', '20260813', '09:31', 3210, 3211, 3209, 3210.5, 1000, 500, 1)

    mocks.fetchEastmoneyMinuteOHLCV.mockResolvedValue([emBar('09:31', 3210.8), emBar('09:32', 3212.1)])
    const refreshed = await handler('datasource:getStockMinuteKline')({}, { tsCode: '000001.SH' })
    const refreshedData = (refreshed as { data: Array<{ tsMinute: string; close: number }> }).data
    expect(mocks.fetchStockMinute).not.toHaveBeenCalled()
    expect(refreshedData.map((r) => r.tsMinute)).toEqual(['09:31', '09:32'])
    expect(refreshedData[0].close).toBe(3210.8)

    // 东财瞬时为空 → 返回既有缓存，不丢数据
    mocks.fetchEastmoneyMinuteOHLCV.mockResolvedValue([])
    const stale = await handler('datasource:getStockMinuteKline')({}, { tsCode: '000001.SH' })
    expect((stale as { data: unknown[] }).data).toHaveLength(2)
  })

  it('指数东财返回空或抛错：返回 ok:true data:[]，不写库不抛异常，并 console.warn 留痕', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      mocks.fetchEastmoneyMinuteOHLCV.mockResolvedValue([])
      const empty = await handler('datasource:getStockMinuteKline')({}, { tsCode: '399006.SZ', tradeDate: '20260812' })
      expect(empty).toEqual({ ok: true, data: [] })
      // 三维复审修复：空结果留痕（fetchEastmoneyMinuteOHLCV 内部恒返回 []，catch 捕不到）
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('index Eastmoney klt=1 empty'))

      mocks.fetchEastmoneyMinuteOHLCV.mockRejectedValue(new Error('eastmoney down'))
      const failed = await handler('datasource:getStockMinuteKline')({}, { tsCode: '399006.SZ', tradeDate: '20260812' })
      expect(failed).toEqual({ ok: true, data: [] })
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('index Eastmoney klt=1 failed'))

      const count = (db.prepare('SELECT COUNT(*) AS c FROM stock_minute_cache').get() as { c: number }).c
      expect(count).toBe(0)
    } finally {
      warnSpy.mockRestore()
    }
  })

  it('指数键与平安银行裸键互不串读', async () => {
    const insert = db.prepare(
      'INSERT INTO stock_minute_cache (stock_code, trade_date, ts_minute, open, high, low, close, vol, amount, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )
    insert.run('000001.SH', '20260812', '09:31', 3210, 3211, 3209, 3210.5, 1000, 500, 1)
    insert.run('000001', '20260812', '09:31', 11.4, 11.6, 11.3, 11.5, 200, 80, 1)

    const indexResult = await handler('datasource:getStockMinuteKline')({}, { tsCode: '000001.SH', tradeDate: '20260812' })
    const bankResult = await handler('datasource:getStockMinuteKline')({}, { tsCode: '000001.SZ', tradeDate: '20260812' })

    const indexData = (indexResult as { data: Array<{ close: number; stockCode: string }> }).data
    const bankData = (bankResult as { data: Array<{ close: number; stockCode: string }> }).data
    expect(indexData).toHaveLength(1)
    expect(indexData[0].close).toBe(3210.5)
    expect(bankData).toHaveLength(1)
    expect(bankData[0].close).toBe(11.5)
    expect(bankData[0].stockCode).toBe('000001')
  })

  it('个股回归：600519.SH 当日裸键缓存 + Tushare rt_min 行为不变', async () => {
    mocks.getDataSourceConfig.mockReturnValue({ tushareEnabled: true, tushareTokenEncrypted: 'enc' })
    mocks.decryptApiKey.mockReturnValue('test-token')
    mocks.fetchStockMinute.mockResolvedValue([
      {
        stockCode: '600519', tradeDate: '20260813', tsMinute: '09:31',
        open: 1500, high: 1502, low: 1499, close: 1501, vol: 300, amount: 450, fetchedAt: 1,
      },
    ])

    const result = await handler('datasource:getStockMinuteKline')({}, { tsCode: '600519.SH' })

    expect(mocks.fetchStockMinute).toHaveBeenCalledWith('test-token', '600519.SH')
    expect(mocks.fetchEastmoneyMinuteOHLCV).not.toHaveBeenCalled()
    const data = (result as { data: Array<{ stockCode: string }> }).data
    expect(data).toHaveLength(1)
    expect(data[0].stockCode).toBe('600519')
    // 个股落库仍为裸 6 位键
    const dbRows = db.prepare('SELECT stock_code FROM stock_minute_cache').all() as Array<{ stock_code: string }>
    expect(dbRows.map((r) => r.stock_code)).toEqual(['600519'])
  })
})
