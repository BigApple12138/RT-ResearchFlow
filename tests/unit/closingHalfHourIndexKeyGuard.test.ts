import Database from 'better-sqlite3'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// 2026-08-13 三维复审修复：尾盘半小时服务候选污染——
// 指数轮询落库的带点键（000001.SH）不得进入 stock_minute_cache 候选扫描；
// toTsCode 对含 "." 的输入防御性原样透传，避免静默产出 000001.SH.SZ 畸形码。

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
}))

vi.mock('electron', () => ({
  app: { isPackaged: false, getAppPath: () => 'E:\\test-project' },
  ipcMain: { handle: vi.fn() },
  net: {},
  BrowserWindow: class {},
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: () => Buffer.alloc(0),
    decryptString: () => '',
  },
}))
vi.mock('../../electron/main/database/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../electron/main/database/db')>()
  return { ...actual, getDb: mocks.getDb }
})
import { runMigrations } from '../../electron/main/database/db'
import {
  queryLocalCandidateCodes,
  toTsCode,
} from '../../electron/main/services/closingHalfHourService'

function insertMinuteRow(
  db: Database.Database,
  stockCode: string,
  tradeDate: string,
  tsMinute: string,
  fetchedAt: number,
): void {
  db.prepare(
    'INSERT INTO stock_minute_cache (stock_code, trade_date, ts_minute, open, high, low, close, vol, amount, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(stockCode, tradeDate, tsMinute, 10, 10.2, 9.9, 10.1, 1000, 500, fetchedAt)
}

describe('closingHalfHour toTsCode 防御性透传', () => {
  it('含 "." 的输入原样透传（不再拼出畸形后缀）', () => {
    expect(toTsCode('000001.SH')).toBe('000001.SH')
    expect(toTsCode('399001.SZ')).toBe('399001.SZ')
    expect(toTsCode('399006.SZ')).toBe('399006.SZ')
  })

  it('裸 6 位码后缀逻辑不回归', () => {
    expect(toTsCode('600519')).toBe('600519.SH')
    expect(toTsCode('000001')).toBe('000001.SZ')
    expect(toTsCode('830799')).toBe('830799.BJ')
    expect(toTsCode('430047')).toBe('430047.BJ')
    expect(toTsCode('920001')).toBe('920001.BJ')
  })
})

describe('closingHalfHour queryLocalCandidateCodes 带点键排除', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    runMigrations(db)
    mocks.getDb.mockReturnValue(db)
  })

  it('指数带点键不进入候选，裸键个股正常归一为 tsCode', () => {
    const tradeDate = '20260813'
    // 指数轮询落库的带点键（尾盘有分钟数据，fetchedAt 最新，若不排除会排第一）
    insertMinuteRow(db, '000001.SH', tradeDate, '14:31', 3000)
    insertMinuteRow(db, '399006.SZ', tradeDate, '14:35', 2900)
    // 个股裸键候选
    insertMinuteRow(db, '600519', tradeDate, '14:35', 2000)
    insertMinuteRow(db, '002460', tradeDate, '14:40', 1000)

    const candidates = queryLocalCandidateCodes(tradeDate)

    expect(candidates).toEqual(['600519.SH', '002460.SZ'])
    expect(candidates).not.toContain('000001.SH')
    expect(candidates).not.toContain('000001.SH.SZ') // 畸形码不得出现
    expect(candidates.some((code) => code.includes('399006'))).toBe(false)
  })

  it('14:30 之前的裸键分钟不进入候选（既有语义不回归）', () => {
    insertMinuteRow(db, '600519', '20260813', '14:29', 1000)
    expect(queryLocalCandidateCodes('20260813')).toEqual([])
  })
})
