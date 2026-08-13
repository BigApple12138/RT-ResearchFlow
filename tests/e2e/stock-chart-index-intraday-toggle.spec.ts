import { expect, test, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

async function launchApp(userDataDir: string): Promise<ElectronApplication> {
  const { ELECTRON_RUN_AS_NODE: _electronRunAsNode, ...launchEnv } = process.env
  return electron.launch({
    args: [join(__dirname, '../../out/main/index.js'), `--user-data-dir=${userDataDir}`],
    env: { ...launchEnv, NODE_ENV: 'test' },
  })
}

async function closeGuide(window: Page): Promise<void> {
  const guide = window.getByTestId('cold-start-guide')
  if (await guide.isVisible()) await guide.getByLabel('关闭引导').click()
}

// 东财 klt=1 分钟链路 fixture（2026-08-13 指数分时专业版）：
// 指数短路后 getStockMinuteKline 对指数直走 push2his klt=1，这里在主进程拦截 fetch，
// 不依赖公网，仅对 secid=1.000001（上证指数）返回固定几根分钟 bar，并记录请求 URL 供断言。
async function installIndexMinuteFixture(app: ElectronApplication): Promise<void> {
  await app.evaluate(() => {
    const originalFetch = globalThis.fetch
    const fixtureState = globalThis as typeof globalThis & { __indexMinuteRequests?: string[] }
    fixtureState.__indexMinuteRequests = []
    globalThis.fetch = async (input, init) => {
      const requestUrl = typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url
      const url = new URL(requestUrl)
      if (!(url.hostname === 'push2his.eastmoney.com' && url.searchParams.get('klt') === '1')) {
        return originalFetch(input, init)
      }
      fixtureState.__indexMinuteRequests?.push(requestUrl)
      const bj = new Date(Date.now() + 8 * 60 * 60 * 1000)
      const ymd = bj.toISOString().slice(0, 10)
      const bars = [
        [`${ymd} 09:31`, '3200.00', '3205.50', '3208.00', '3198.00', '120000', '1500000000'],
        [`${ymd} 09:32`, '3205.50', '3210.20', '3212.00', '3204.00', '98000', '1280000000'],
        [`${ymd} 09:33`, '3210.20', '3207.80', '3211.00', '3206.00', '76000', '990000000'],
      ]
      return new Response(JSON.stringify({
        rc: 0,
        data: { name: '上证指数', klines: bars.map((bar) => bar.join(',')) },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
  })
}

test('预设指数分时展示样式切换按钮（专业/传统全局偏好）', async () => {
  test.setTimeout(90_000)
  const userDataDir = mkdtempSync(join(tmpdir(), 'trade-watch-index-intraday-'))
  let app: ElectronApplication | null = null
  try {
    app = await launchApp(userDataDir)
    const window = await app.firstWindow()
    await window.waitForLoadState('domcontentloaded')
    await closeGuide(window)
    await installIndexMinuteFixture(app)
    await window.setViewportSize({ width: 1440, height: 900 })
    await window.getByTestId('nav-tab-stock-chart').click()
    await expect(window.getByTestId('stock-chart-root')).toBeVisible({ timeout: 20_000 })

    // 选中预设指数「上证指数」（000001.SH）
    await window.locator('button').filter({ hasText: '000001.SH' }).first().click()

    // 日线 → 分时：指数链路放行后应出现样式切换按钮（此前指数被 !PRESET_CODES 门闸挡住）
    const modeToggle = window.getByTestId('chart-mode-toggle-btn')
    await expect(modeToggle).toBeEnabled({ timeout: 20_000 })
    await modeToggle.click()
    const styleToggle = window.getByTestId('intraday-style-toggle-btn')
    await expect(styleToggle).toBeVisible({ timeout: 20_000 })

    // 指数分钟链路确实走了东财 secid=1.000001（INDEX_SECID 映射），而非裸 000001 → 0.000001
    // （三维复审修复：toPass 包裹消除请求落库/拦截时序 flake 空间）
    await expect(async () => {
      const minuteRequests: string[] = await app!.evaluate(() => {
        const fixtureState = globalThis as typeof globalThis & { __indexMinuteRequests?: string[] }
        return fixtureState.__indexMinuteRequests ?? []
      })
      expect(minuteRequests.length).toBeGreaterThan(0)
      expect(minuteRequests.every((url) => url.includes('secid=1.000001'))).toBe(true)
    }).toPass({ timeout: 5000 })

    // 切换样式：candle ↔ line，偏好写入 localStorage 全局键 intradayStyle
    const before = await styleToggle.innerText()
    await styleToggle.click()
    const after = await styleToggle.innerText()
    expect([before, after]).toEqual(expect.arrayContaining(['专业版', '传统版']))
    expect(before).not.toBe(after)
    expect(await window.evaluate(() => localStorage.getItem('intradayStyle'))).toBeTruthy()

    // 指数不应出现持仓按钮（FR-168 维持：仅非预设指数显示）
    await expect(window.getByTestId('portfolio-toggle-btn')).toHaveCount(0)
  } finally {
    if (app) await app.close().catch(() => {})
    rmSync(userDataDir, { recursive: true, force: true })
    rmSync(`${userDataDir}-dev`, { recursive: true, force: true })
  }
})
