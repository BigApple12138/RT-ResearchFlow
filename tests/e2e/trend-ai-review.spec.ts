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

function seedTrendReviewFixture(dbPath: string): void {
  const electronExecutable = require('electron') as string
  const seedScript = String.raw`
    const Database = require('better-sqlite3')
    const db = new Database(process.env.TRADE_WATCH_SEED_DB)
    const now = Date.now()
    const ymd = (offset) => {
      const date = new Date(Date.now() + offset * 86400000)
      return String(date.getUTCFullYear()) + String(date.getUTCMonth() + 1).padStart(2, '0') + String(date.getUTCDate()).padStart(2, '0')
    }
    db.exec('DELETE FROM trend_watchlist; DELETE FROM trend_scores; DELETE FROM trend_alerts; DELETE FROM daily_close_cache; DELETE FROM portfolio_stocks;')
    const watchInsert = db.prepare('INSERT INTO trend_watchlist (ts_code, stock_name, group_tag, added_at, category, sub_category, notes) VALUES (?, ?, ?, ?, ?, ?, ?)')
    const dailyInsert = db.prepare('INSERT OR REPLACE INTO daily_close_cache (ts_code, trade_date, close, pct_chg, open, high, low, vol, turnover_rate) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    const seedBars = (code, base, step, count) => {
      for (let index = 0; index < count; index += 1) {
        const date = ymd(index - count + 1)
        const close = base + step * index + Math.sin(index / 5) * 0.35
        const previous = index === 0 ? close : base + step * (index - 1) + Math.sin((index - 1) / 5) * 0.35
        dailyInsert.run(code, date, close, (close - previous) / previous * 100, close - 0.12, close + 0.28, close - 0.32, 800000 + index * 2400, 1.2 + (index % 6) * 0.11)
      }
    }
    db.transaction(() => {
      seedBars('000300.SH', 4100, 2.2, 100)
      watchInsert.run('600004.SH', '待补样本', '数据待补', now, '半导体材料', '测试板', '')
      seedBars('600004.SH', 12, 0.04, 32)
    })()
    db.close()
  `
  execFileSync(electronExecutable, ['-e', seedScript], {
    cwd: join(__dirname, '../..'),
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', TRADE_WATCH_SEED_DB: dbPath },
    stdio: 'pipe',
  })
}

async function closeGuide(window: Page): Promise<void> {
  const guide = window.getByTestId('cold-start-guide')
  if (await guide.isVisible()) await guide.getByLabel('关闭引导').click()
}

test('趋势雷达支持单只与批量 AI 结构复核，并保留本地状态', async () => {
  test.setTimeout(150_000)
  const userDataDir = mkdtempSync(join(tmpdir(), 'trade-watch-trend-ai-review-'))
  let app: ElectronApplication | null = null
  try {
    app = await launchApp(userDataDir)
    let window = await app.firstWindow()
    await window.waitForLoadState('domcontentloaded')
    await app.close()
    seedTrendReviewFixture(join(`${userDataDir}-dev`, 'trade-watch.db'))

    app = await launchApp(userDataDir)
    window = await app.firstWindow()
    await window.waitForLoadState('domcontentloaded')
    await closeGuide(window)
    await window.setViewportSize({ width: 1440, height: 900 })
    await window.getByTestId('nav-tab-trend-watcher').click()
    await window.getByTestId('secondary-nav-trend-watcher-dashboard').click()
    await expect(window.getByTestId('trend-radar')).toBeVisible({ timeout: 30_000 })

    const row = window.locator('[data-testid="trend-radar"] tbody tr').filter({ hasText: '待补样本' })
    await expect(row).toBeVisible()
    await expect(row.getByText('数据不足', { exact: true })).toBeVisible()
    await row.getByTestId('trend-ai-review-600004').click()
    await expect(window.getByTestId('trend-ai-review-toast')).toContainText('AI复核已保存', { timeout: 30_000 })
    await expect(row.getByTestId('trend-ai-review-badge-600004')).toContainText('需补数据', { timeout: 30_000 })
    await expect(row.getByText('数据不足', { exact: true })).toBeVisible()

    await row.getByRole('checkbox', { name: '选择待补样本' }).check()
    await expect(window.getByTestId('trend-ai-review-batch')).toBeEnabled()
    await window.getByTestId('trend-ai-review-batch').click()
    await expect(window.getByTestId('trend-ai-review-batch-confirm')).toContainText('确认串行复核 1 只')
    await window.getByTestId('trend-ai-review-batch-confirm').getByRole('button', { name: '确认复核', exact: true }).click()
    await expect(window.getByTestId('trend-ai-review-batch-progress')).toContainText('批量复核完成', { timeout: 30_000 })
    await expect(window.getByTestId('trend-ai-review-batch-progress')).toContainText('1 成功')

    await row.getByTestId('trend-ai-review-discussion-600004').click()
    await expect(window.getByTestId('ai-analysis-page')).toBeVisible({ timeout: 30_000 })
    await expect(window.getByText('待补样本 · 趋势结构复核', { exact: true })).toBeVisible({ timeout: 30_000 })

    await window.setViewportSize({ width: 1024, height: 768 })
    await window.emulateMedia({ reducedMotion: 'reduce' })
    await window.evaluate(() => document.documentElement.classList.add('dark'))
    expect(await window.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1)
  } finally {
    if (app) await app.close().catch(() => {})
    rmSync(userDataDir, { recursive: true, force: true })
    rmSync(`${userDataDir}-dev`, { recursive: true, force: true })
  }
})
