import { runElectronScript } from './screenshotDemoSeed'

export const FIXTURE_TRADE_DATE = '20260812'
export const FIXTURE_PREVIOUS_TRADE_DATE = '20260811'
export const FIXTURE_CLOSE_DATES = ['20260804', '20260805', '20260806', '20260807', '20260810', '20260811']

export function seedMorningAuctionPriceHistory(dbPath: string): void {
  runElectronScript(String.raw`
    const Database = require('better-sqlite3')
    const db = new Database(process.env.TRADE_WATCH_SEED_DB)
    const tradeDate = process.env.TRADE_WATCH_TRADE_DATE
    const previousTradeDate = process.env.TRADE_WATCH_PREVIOUS_TRADE_DATE
    const closeDates = JSON.parse(process.env.TRADE_WATCH_CLOSE_DATES || '[]')
    const now = Date.now()
    const stocks = [
      { tsCode: '600101.SH', name: '历史样本甲', preClose: 15, auctionPrice: 15.75, closes: [10, 11, 12, 13, 14, 15] },
      { tsCode: '600102.SH', name: '历史样本乙', preClose: 15, auctionPrice: 15.6, closes: [20, 19, 18, 17, 16, 15] },
    ]
    const limitInsert = db.prepare('INSERT OR REPLACE INTO limit_list_daily (trade_date, ts_code, name, close, pct_chg, amount, float_mv, total_mv, turnover_ratio, fd_amount, first_time, last_time, open_times, up_stat, limit_times, "limit", fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    const auctionInsert = db.prepare('INSERT OR REPLACE INTO stk_auction_cache (ts_code, trade_date, price, vol, amount, pre_close, turnover_rate, volume_ratio, float_share, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    const closeInsert = db.prepare('INSERT OR REPLACE INTO daily_close_cache (ts_code, trade_date, close, pct_chg, open, high, low, vol, turnover_rate) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    const stockInsert = db.prepare('INSERT OR REPLACE INTO stock_info (stockCode, stockName, fetchedAt) VALUES (?, ?, ?)')
    db.transaction(() => {
      closeDates.forEach((d, index) => {
        db.prepare('INSERT OR REPLACE INTO trade_cal (cal_date, is_open, pretrade_date) VALUES (?, 1, ?)').run(d, index > 0 ? closeDates[index - 1] : null)
      })
      db.prepare('INSERT OR REPLACE INTO trade_cal (cal_date, is_open, pretrade_date) VALUES (?, 1, ?)').run(tradeDate, previousTradeDate)
      stocks.forEach((stock, stockIndex) => {
        stockInsert.run(stock.tsCode.slice(0, 6), stock.name, now)
        if (stockIndex === 0) {
          limitInsert.run(previousTradeDate, stock.tsCode, stock.name, stock.preClose, 9.98, 880000000, 12000000000, 18000000000, 4.8, 90000000, '093100', '142800', 0, '1/1', 1, 'U', now)
          auctionInsert.run(stock.tsCode, tradeDate, stock.auctionPrice, 1800000, 36000000, stock.preClose, 0.82, 1.6, 800000000, now)
        }
        closeDates.forEach((d, index) => {
          const close = stock.closes[index]
          closeInsert.run(stock.tsCode, d, close, 0, close, close, close, 800000, 1.2)
        })
      })
    })()
    db.close()
  `, {
    TRADE_WATCH_SEED_DB: dbPath,
    TRADE_WATCH_TRADE_DATE: FIXTURE_TRADE_DATE,
    TRADE_WATCH_PREVIOUS_TRADE_DATE: FIXTURE_PREVIOUS_TRADE_DATE,
    TRADE_WATCH_CLOSE_DATES: JSON.stringify(FIXTURE_CLOSE_DATES),
  })
}
