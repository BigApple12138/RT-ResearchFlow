import { expect, test, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { execFileSync } from 'child_process'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

async function launchApp(userDataDir: string): Promise<ElectronApplication> {
  const { ELECTRON_RUN_AS_NODE: _electronRunAsNode, ...launchEnv } = process.env
  return electron.launch({
    args: [join(__dirname, '../../out/main/index.js'), `--user-data-dir=${userDataDir}`],
    env: { ...launchEnv, NODE_ENV: 'test' },
  })
}

const FIXTURE_TRADE_DATE = '20260812'
const FIXTURE_PREVIOUS_TRADE_DATE = '20260811'
const FIXTURE_CLOSE_DATES = ['20260804', '20260805', '20260806', '20260807', '20260810', '20260811']

function seedMorningAuctionPriceHistory(dbPath: string): void {
  const electronExecutable = require('electron') as string
  const seedScript = String.raw`
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
    const limitInsert = db.prepare(
      'INSERT OR REPLACE INTO limit_list_daily (trade_date, ts_code, name, close, pct_chg, amount, float_mv, total_mv, turnover_ratio, fd_amount, first_time, last_time, open_times, up_stat, limit_times, "limit", fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )
    const auctionInsert = db.prepare(
      'INSERT OR REPLACE INTO stk_auction_cache (ts_code, trade_date, price, vol, amount, pre_close, turnover_rate, volume_ratio, float_share, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )
    const closeInsert = db.prepare(
      'INSERT OR REPLACE INTO daily_close_cache (ts_code, trade_date, close, pct_chg, open, high, low, vol, turnover_rate) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )
    const stockInsert = db.prepare(
      'INSERT OR REPLACE INTO stock_info (stockCode, stockName, fetchedAt) VALUES (?, ?, ?)',
    )
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
  `
  execFileSync(electronExecutable, ['-e', seedScript], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      TRADE_WATCH_SEED_DB: dbPath,
      TRADE_WATCH_TRADE_DATE: FIXTURE_TRADE_DATE,
      TRADE_WATCH_PREVIOUS_TRADE_DATE: FIXTURE_PREVIOUS_TRADE_DATE,
      TRADE_WATCH_CLOSE_DATES: JSON.stringify(FIXTURE_CLOSE_DATES),
    },
    stdio: 'pipe',
  })
}

function seedLateAuctionCandidate(dbPath: string): void {
  const electronExecutable = require('electron') as string
  const seedScript = String.raw`
    const Database = require('better-sqlite3')
    const db = new Database(process.env.TRADE_WATCH_SEED_DB)
    db.prepare(
      'INSERT OR REPLACE INTO stk_auction_cache (ts_code, trade_date, price, vol, amount, pre_close, turnover_rate, volume_ratio, float_share, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run('600102.SH', '20260812', 15.6, 1800000, 36000000, 15, 0.82, 1.6, 800000000, Date.now())
    db.close()
  `
  execFileSync(electronExecutable, ['-e', seedScript], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      TRADE_WATCH_SEED_DB: dbPath,
    },
    stdio: 'pipe',
  })
}

async function openMorningAuction(window: Page): Promise<void> {
  const guide = window.getByTestId('cold-start-guide')
  if (await guide.isVisible()) await guide.getByLabel('关闭引导').click()
  await window.getByTestId('nav-tab-short-term-strategy').click()
  await window.getByTestId('secondary-nav-short-term-strategy-morningAuction').click()
  const dateInput = window.locator('input[type="date"]').first()
  await dateInput.fill('2026-08-12')
  await expect(window.getByTestId('morning-auction-price-history-coverage')).toBeVisible({ timeout: 30_000 })
}

async function expectRisingPriceHistoryValue(window: Page): Promise<void> {
  const risingRow = window.locator('tbody tr').filter({ hasText: '历史样本甲' }).first()
  await expect(risingRow).toBeVisible()
  await expect(risingRow.locator('td').nth(6)).toHaveText('+25.00%')
  await expect(risingRow.locator('td').nth(7)).toHaveText('+50.00%')
}

async function expectFallingPriceHistoryValue(window: Page): Promise<void> {
  await expect(window.getByTestId('morning-auction-price-history-coverage')).toHaveText('历史涨跌 3日 2/2 · 5日 2/2')
  const fallingRow = window.locator('tbody tr').filter({ hasText: '历史样本乙' }).first()
  await expect(fallingRow).toBeVisible()
  await expect(fallingRow.locator('td').nth(6)).toHaveText('-16.67%')
  await expect(fallingRow.locator('td').nth(7)).toHaveText('-25.00%')

  const candidateArea = window.getByTestId('morning-auction-candidate-area')
  await expect(candidateArea).not.toContainText('待补齐')
  await expect(candidateArea).not.toContainText('样本不足')
  await expect(candidateArea).not.toContainText('暂无数据')
  await expect(candidateArea).not.toContainText('读取失败')
  await expect(candidateArea).not.toContainText('补采失败')
}

test('早盘竞价使用本地六日收盘完整展示三日和五日涨跌', async () => {
  test.setTimeout(120_000)
  const userDataDir = mkdtempSync(join(tmpdir(), 'trade-watch-auction-price-history-'))
  const dbPath = join(`${userDataDir}-dev`, 'trade-watch.db')
  let app = await launchApp(userDataDir)

  try {
    let window = await app.firstWindow()
    await expect(window.getByTestId('nav-tab-feed')).toBeVisible({ timeout: 15_000 })
    await app.close()

    seedMorningAuctionPriceHistory(dbPath)
    app = await launchApp(userDataDir)
    window = await app.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.getSize() ?? []))
      .toEqual([1680, 960])
    await openMorningAuction(window)
    await expect(window.getByTestId('morning-auction-price-history-coverage')).toHaveText('历史涨跌 3日 1/1 · 5日 1/1')
    await expect(window.locator('tbody tr').filter({ hasText: '历史样本乙' })).toHaveCount(0)

    await app.close()
    seedLateAuctionCandidate(dbPath)
    app = await launchApp(userDataDir)
    window = await app.firstWindow()
    await window.waitForLoadState('domcontentloaded')
    await openMorningAuction(window)
    await window.getByRole('button', { name: '立即刷新' }).click()
    await expect(window.getByTestId('morning-auction-price-history-coverage')).toHaveText('历史涨跌 3日 2/2 · 5日 2/2')
    await expectRisingPriceHistoryValue(window)
    await window.getByRole('button', { name: /^全市场异动/ }).click()
    await expect(window.getByRole('heading', { name: '全市场异动', exact: true })).toBeVisible()
    await expectFallingPriceHistoryValue(window)
    await window.screenshot({ path: 'test-results/morning-auction-price-history-1680x960.png' })

    await window.getByLabel('最大化窗口').click()
    await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isMaximized() ?? false))
      .toBe(true)
    await expectFallingPriceHistoryValue(window)
    const geometry = await window.getByTestId('morning-auction-candidate-area').evaluate((node) => ({
      documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      candidateOverflow: node.scrollWidth - node.clientWidth,
      coverageHeight: document.querySelector('[data-testid="morning-auction-price-history-coverage"]')
        ?.getBoundingClientRect().height ?? 0,
    }))
    expect(geometry.documentOverflow).toBeLessThanOrEqual(1)
    expect(geometry.candidateOverflow).toBeLessThanOrEqual(1)
    expect(geometry.coverageHeight).toBeGreaterThan(0)
    await window.screenshot({ path: 'test-results/morning-auction-price-history-maximized.png' })
  } finally {
    await app.close().catch(() => undefined)
    rmSync(userDataDir, { recursive: true, force: true })
    rmSync(`${userDataDir}-dev`, { recursive: true, force: true })
  }
})
