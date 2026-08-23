/**
 * 产出：001、盘前、资讯/AI、讨论增量、Agent Hub（3）、产业研究 1–7、深度研究、
 * 股票抽屉、趋势、云图 3 张、早盘竞价、策略评估 1–4、质量中心。
 *
 * 用法（开发构建）：
 *   pnpm run build
 *   pnpm run screenshots:product
 *
 * 用法（已打包应用，与 Release 一致）：
 *   $env:TRADE_WATCH_PACKAGED_EXECUTABLE="release/win-unpacked/RT-ResearchFlow.exe"
 *   pnpm run screenshots:product
 */
import { expect, test, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { seedAiAnalysisSessions } from './helpers/seedAiAnalysisSessions'
import { seedBacktestFixture } from './helpers/seedBacktestFixture'
import { seedGraphFixture } from './helpers/seedGraphFixture'
import {
  bjYmd,
  nextWeekday,
  previousDay,
  seedPremarketScenarioFixture,
} from './helpers/seedPremarketScenarioFixture'
import { FIXTURE_TRADE_DATE, seedMorningAuctionPriceHistory } from './helpers/seedMorningAuctionPriceHistory'
import { seedScreenshotDemoDatabase } from './helpers/screenshotDemoSeed'
import { injectAgentHubHitl, injectAgentHubTimeline } from './helpers/injectAgentHubEvents'
import { seedDiscussionCompactionCheckpoint } from './helpers/seedDiscussionCompactionCheckpoint'
import { seedResearchAgentSucceededRun } from './helpers/seedResearchAgentSucceededRun'

const screenshotDir = process.env.README_SCREENSHOT_DIR
const packagedExecutable = process.env.TRADE_WATCH_PACKAGED_EXECUTABLE

async function launchApp(userDataDir: string): Promise<ElectronApplication> {
  const { ELECTRON_RUN_AS_NODE: _electronRunAsNode, ...launchEnv } = process.env
  if (packagedExecutable) {
    const executablePath = resolve(packagedExecutable)
    expect(existsSync(executablePath), `Packaged executable missing: ${executablePath}`).toBe(true)
    return electron.launch({
      executablePath,
      args: [`--user-data-dir=${userDataDir}`],
      env: { ...launchEnv, NODE_ENV: 'test' },
    })
  }
  return electron.launch({
    args: [join(__dirname, '../../out/main/index.js'), `--user-data-dir=${userDataDir}`],
    env: { ...launchEnv, NODE_ENV: 'test' },
  })
}

async function closeGuide(page: Page): Promise<void> {
  const guide = page.getByTestId('cold-start-guide')
  if (await guide.isVisible().catch(() => false)) {
    await guide.getByLabel('关闭引导').click()
    await expect(guide).toBeHidden({ timeout: 5_000 })
  }
}

async function snap(page: Page, filename: string): Promise<void> {
  if (!screenshotDir) return
  mkdirSync(screenshotDir, { recursive: true })
  await page.screenshot({ path: join(screenshotDir, filename), animations: 'disabled' })
}

async function seedSectorFlowHistory(app: ElectronApplication): Promise<void> {
  await app.evaluate(async ({ app: electronApp }, fixture) => {
    const mainModule = process.mainModule
    if (!mainModule) throw new Error('E2E_MAIN_MODULE_UNAVAILABLE')
    const { join: pathJoin } = mainModule.require('node:path') as typeof import('node:path')
    const { createRequire } = mainModule.require('node:module') as typeof import('node:module')
    const appRequire = createRequire(pathJoin(electronApp.getAppPath(), 'package.json'))
    const Database = appRequire('better-sqlite3') as typeof import('better-sqlite3')
    const db = new Database(pathJoin(electronApp.getPath('userData'), 'trade-watch.db'))
    const insert = db.prepare(`
      INSERT OR REPLACE INTO sector_flow_observations (
        trade_date, provider, scope, board_code, board_name, metric_kind,
        total_amount, main_net_inflow, main_net_inflow_rate, weighted_change,
        member_count, up_count, down_count, flat_count,
        source_updated_at, captured_at
      ) VALUES (
        @tradeDate, 'eastmoney', @scope, @boardCode, @boardName, 'verified_flow',
        10000000000, @mainNetInflow, @mainNetInflowRate, @weightedChange,
        100, @upCount, @downCount, 10,
        @capturedAt, @capturedAt
      )
    `)
    db.transaction(() => {
      fixture.dates.forEach((date, dateIndex) => {
        fixture.boards.forEach((board, boardIndex) => {
          const positive = boardIndex < 2
          const mainNetInflow = (positive ? 1 : -1) * (300_000_000 + dateIndex * 10_000_000 + boardIndex)
          insert.run({
            tradeDate: date.tradeDate,
            scope: board.scope,
            boardCode: board.boardCode,
            boardName: `${date.label}${board.name}`,
            mainNetInflow,
            mainNetInflowRate: mainNetInflow / 10_000_000_000 * 100,
            weightedChange: positive ? 2.5 : -2.1,
            upCount: positive ? 70 : 20,
            downCount: positive ? 20 : 70,
            capturedAt: date.capturedAt,
          })
        })
      })
    })()
    db.close()
  }, {
    dates: [
      { tradeDate: '20260807', label: '八月七日', capturedAt: Date.parse('2026-08-07T15:05:00+08:00') },
      { tradeDate: '20260810', label: '八月十日', capturedAt: Date.parse('2026-08-10T15:05:00+08:00') },
      { tradeDate: '20260811', label: '八月十一日', capturedAt: Date.parse('2026-08-11T15:05:00+08:00') },
    ],
    boards: [
      { scope: 'concept', boardCode: 'BK9101', name: '算力概念' },
      { scope: 'industry', boardCode: 'BK9102', name: '电子行业' },
      { scope: 'concept', boardCode: 'BK9103', name: '风险概念' },
      { scope: 'industry', boardCode: 'BK9104', name: '风险行业' },
    ],
  })
}

async function openIndustryResearch(page: Page): Promise<void> {
  await page.getByTestId('nav-tab-ai-analysis').click()
  await page.evaluate(() => (window as unknown as { __RT_TEST__?: { setAIAnalysisSubTab: (tab: string) => void } }).__RT_TEST__?.setAIAnalysisSubTab('industryResearch'))
  await expect(page.getByTestId('industry-research-page')).toBeVisible({ timeout: 30_000 })
}

async function openDeepResearch(page: Page): Promise<void> {
  await page.getByTestId('nav-tab-ai-analysis').click()
  await page.evaluate(() => (window as unknown as { __RT_TEST__?: { setAIAnalysisSubTab: (tab: string) => void } }).__RT_TEST__?.setAIAnalysisSubTab('deepResearch'))
  await expect(page.getByTestId('deep-research-workbench')).toBeVisible({ timeout: 30_000 })
}

async function setupHeatmapMomentum(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await window.api.settings.setMarketHeatmapProvider('sina')
    localStorage.setItem('heatmapMomentumLatest_sina', JSON.stringify({
      version: 2,
      momentum: { 电子: 0.31, 煤炭: -0.18, 通信: 0.22 },
      capturedAt: Date.parse('2026-08-11T07:00:00.000Z'),
      tradeDate: '2026-08-11',
      windowMinutes: 3,
      origin: 'historical-recovery',
      sourceProvider: 'eastmoney',
      scope: 'shenwan-l1',
      boundary: 'market-close',
      coverage: { l1: { available: 31, total: 31 }, l2: { available: 0, total: 0 } },
    }))
  })
}

test.describe('产品截图全量刷新', () => {
  test.skip(!screenshotDir, 'Set README_SCREENSHOT_DIR (e.g. docs/screenshots)')

  let userDataDir = ''
  let app: ElectronApplication | null = null
  let aiSessionIds: { emptySessionId: number; riskSessionId: number } | null = null
  let demoSessionId = 0

  test.beforeAll(async () => {
    test.setTimeout(600_000)
    userDataDir = mkdtempSync(join(tmpdir(), 'product-screenshots-'))
    const dbPath = join(`${userDataDir}-dev`, 'trade-watch.db')

    app = await launchApp(userDataDir)
    await app.firstWindow()
    await app.close()

    const demo = seedScreenshotDemoDatabase(dbPath)
    demoSessionId = demo.aiSessionId
    seedResearchAgentSucceededRun(dbPath, demo.aiSessionId)
    seedDiscussionCompactionCheckpoint(dbPath, demo.aiSessionId)
    seedGraphFixture(dbPath)
    seedBacktestFixture(dbPath)
    seedMorningAuctionPriceHistory(dbPath)
    aiSessionIds = seedAiAnalysisSessions(dbPath)

    const today = bjYmd()
    const scenarioDate = previousDay(today)
    seedPremarketScenarioFixture(dbPath, today, scenarioDate, previousDay(scenarioDate), nextWeekday(today))

    app = await launchApp(userDataDir)
    await seedSectorFlowHistory(app)
    const page = await app.firstWindow()
    await page.setViewportSize({ width: 1680, height: 960 })
    await closeGuide(page)
  })

  test.afterAll(async () => {
    if (app) await app.close()
    if (userDataDir) {
      rmSync(userDataDir, { recursive: true, force: true })
      rmSync(`${userDataDir}-dev`, { recursive: true, force: true })
    }
  })

  test('capture all README product screenshots', async () => {
    test.setTimeout(600_000)
    const page = await app!.firstWindow()
    await page.setViewportSize({ width: 1680, height: 960 })

    // 今日看板
    await page.getByTestId('nav-tab-decision-center').click()
    await expect(page.getByTestId('decision-center-page')).toBeVisible({ timeout: 30_000 })
    await snap(page, '001.png')

    // 盘前推演
    await app!.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.webContents.send('premarket:openScenario')
    })
    const drawer = page.getByTestId('premarket-scenario-drawer')
    await expect(drawer).toBeVisible({ timeout: 15_000 })
    await snap(page, 'premarket-scenario.png')
    await drawer.getByTestId('premarket-view-outcome').click()
    await expect(page.getByTestId('premarket-outcome-content')).toBeVisible()
    await snap(page, 'premarket-scenario-2.png')
    await page.keyboard.press('Escape')
    await expect(drawer).toBeHidden()

    // 资讯情报台
    await page.getByTestId('nav-tab-feed').click()
    await expect(page.getByTestId('feed-summary-panel')).toBeVisible({ timeout: 15_000 })
    await snap(page, 'news-ai-analysis.png')

    // AI 研判：讨论 / 增量 / 深度研究
    await page.getByTestId('nav-tab-ai-analysis').click()
    await page.evaluate(() => (window as unknown as { __RT_TEST__?: { setAIAnalysisSubTab: (tab: string) => void } }).__RT_TEST__?.setAIAnalysisSubTab('records'))
    await expect(page.getByTestId('ai-analysis-page')).toBeVisible({ timeout: 15_000 })
    await page.getByTestId(`ai-session-${demoSessionId}`).click()
    await expect(page.getByText('请结合本地趋势与板块资金')).toBeVisible({ timeout: 15_000 })
    await expect.poll(async () => page.getByTestId('deep-research-timeline').isVisible(), { timeout: 30_000 }).toBe(true)
    await snap(page, 'research-discussion-increment.png')
    const incrementOpen = page.getByTestId('ai-research-increment-open')
    if (await incrementOpen.isVisible().catch(() => false)) {
      await incrementOpen.click()
      await expect(page.getByText('研究侧栏')).toBeVisible({ timeout: 10_000 })
      await snap(page, 'research-discussion-increment-1.png')
      const collapse = page.getByTestId('ai-drawer-toggle-right-collapse').or(page.getByTestId('ai-research-increment-collapse'))
      if (await collapse.first().isVisible().catch(() => false)) {
        await collapse.first().click()
      }
    }
    await snap(page, 'research-discussion-increment-2.png')

    // Agent Hub 时间线、HITL 与上下文检查点
    await page.getByTestId(`ai-session-${demoSessionId}`).click()
    await expect(page.getByText('请结合本地趋势与板块资金')).toBeVisible({ timeout: 15_000 })
    await injectAgentHubTimeline(app!, demoSessionId)
    await expect(page.getByTestId('agent-timeline')).toBeVisible({ timeout: 10_000 })
    await snap(page, 'agent-hub.png')
    await injectAgentHubHitl(app!, demoSessionId)
    await expect(page.getByTestId('agent-hitl-bar')).toBeVisible({ timeout: 10_000 })
    await snap(page, 'agent-hub-2.png')
    const checkpoints = page.getByTestId('ai-compaction-checkpoints')
    await expect(checkpoints).toBeVisible({ timeout: 15_000 })
    await checkpoints.scrollIntoViewIfNeeded()
    await snap(page, 'agent-context-checkpoints.png')

    await page.getByTestId(`ai-session-${aiSessionIds!.emptySessionId}`).click()
    await expect(page.getByTestId('ai-candidate-recovery-state')).toBeVisible()
    await snap(page, 'news-ai-analysis-loading.png')

    await page.getByTestId(`ai-session-${aiSessionIds!.riskSessionId}`).click()
    await expect(page.getByTestId('ai-candidate-600000')).toBeVisible({ timeout: 15_000 })
    await snap(page, 'news-ai-analysis-result.png')
    await page.getByRole('button', { name: '行情复核', exact: true }).click()
    await expect(page.getByTestId('ai-round2-report-body')).toBeVisible({ timeout: 15_000 })
    await snap(page, 'news-ai-analysis-result-2.png')
    await page.getByRole('button', { name: '本次研判', exact: true }).click()
    await expect(page.getByTestId('ai-candidate-list')).toBeVisible()
    await snap(page, 'news-ai-analysis-result-3.png')

    await openDeepResearch(page)
    await snap(page, 'deep-research-review.png')
    const succeededRun = page.getByText('中天科技趋势与基本面是否背离？').first()
    if (await succeededRun.isVisible().catch(() => false)) {
      await succeededRun.click()
      await expect(page.getByTestId('research-agent-report')).toBeVisible({ timeout: 15_000 })
      await snap(page, 'deep-research-review-2.png')
    }

    // 产业研究
    await openIndustryResearch(page)
    await expect(page.getByRole('heading', { name: '光通信产业传导图验收' })).toBeVisible()
    await snap(page, 'industry-research.png')
    const views: Array<[string, string]> = [
      ['report', 'industry-research-2.png'],
      ['decision', 'industry-research-3.png'],
      ['changes', 'industry-research-4.png'],
      ['overview', 'industry-research-5.png'],
      ['graph', 'industry-research-6.png'],
      ['evidence', 'industry-research-7.png'],
    ]
    for (const [view, file] of views) {
      await page.getByTestId(`industry-research-view-${view}`).click()
      await page.waitForTimeout(view === 'graph' ? 800 : 300)
      if (view === 'graph') {
        await expect(page.getByTestId('industry-research-graph-canvas')).toBeVisible({ timeout: 15_000 })
      }
      await snap(page, file)
    }

    // 股票抽屉
    await page.getByTestId('nav-tab-short-term-strategy').click()
    await page.getByTestId('secondary-nav-short-term-strategy-morningAuction').click()
    await expect(page.getByTestId('morning-auction-market-themes')).toBeVisible({ timeout: 30_000 })
    const openDrawer = page.getByTestId('limit-board-open-stock-drawer').or(page.getByTestId('morning-auction-open-stock-drawer')).first()
    if (await openDrawer.isVisible().catch(() => false)) {
      await openDrawer.click()
      await expect(page.getByTestId('stock-kline-chip-drawer')).toBeVisible({ timeout: 15_000 })
      await snap(page, 'stock-chip-drawer.png')
      const profileTab = page.getByTestId('stock-chip-profile')
      if (await profileTab.isVisible().catch(() => false)) {
        await profileTab.click()
        await page.waitForTimeout(400)
        await snap(page, 'stock-chip-drawer-2.png')
      }
      await page.keyboard.press('Escape')
    } else {
      await page.getByTestId('nav-tab-stock-chart').click()
      await expect(page.getByTestId('stock-chart-page')).toBeVisible({ timeout: 15_000 })
      await snap(page, 'stock-chip-drawer.png')
      await snap(page, 'stock-chip-drawer-2.png')
    }

    // 长线趋势
    await page.getByTestId('nav-tab-trend-watcher').click()
    await page.getByTestId('secondary-nav-trend-watcher-dashboard').click()
    await expect(page.getByTestId('trend-workbench')).toBeVisible({ timeout: 30_000 })
    await snap(page, 'long-term-trend.png')

    // 大盘云图
    await setupHeatmapMomentum(page)
    await page.getByTestId('nav-tab-industry-heatmap').click()
    await page.getByTestId('secondary-nav-industry-heatmap-industry').click()
    await expect(page.getByText('今日涨跌幅', { exact: true })).toBeVisible({ timeout: 30_000 })
    await snap(page, 'market-cloud-map.png')
    await page.getByTestId('secondary-nav-industry-heatmap-heatmap').click()
    await page.waitForTimeout(500)
    await snap(page, 'market-cloud-map-2.png')
    await page.getByTestId('secondary-nav-industry-heatmap-sectorFlow').click()
    await expect(page.getByTestId('sector-flow-workbench')).toBeVisible({ timeout: 90_000 })
    await snap(page, 'market-cloud-map-3.png')

    // 早盘竞价
    await page.getByTestId('nav-tab-short-term-strategy').click()
    await page.getByTestId('secondary-nav-short-term-strategy-morningAuction').click()
    await expect(page.getByTestId('morning-auction-market-themes')).toBeVisible({ timeout: 30_000 })
    await snap(page, 'morning-auction-workbench.png')
    const historyRow = page.getByText('历史样本甲').first()
    if (await historyRow.isVisible().catch(() => false)) {
      await historyRow.click()
      await page.waitForTimeout(500)
    }
    await snap(page, 'morning-auction-workbench-1.png')

    // 策略评估
    await closeGuide(page)
    await page.getByTestId('secondary-nav-short-term-strategy-strategyBacktest').click()
    await expect(page.getByRole('heading', { name: '策略效果评估', exact: true })).toBeVisible({ timeout: 30_000 })
    await snap(page, 'strategy-evaluation.png')
    if (screenshotDir) {
      const chart = page.locator('.strategy-effectiveness-chart').first()
      if (await chart.isVisible().catch(() => false)) {
        await chart.screenshot({ path: join(screenshotDir, 'strategy-evaluation-2.png') })
      }
    }
    await page.getByTestId('strategy-effectiveness-selector').click()
    await expect(page.getByRole('dialog', { name: '选择要比较的策略' })).toBeVisible()
    await snap(page, 'strategy-evaluation-1.png')
    await page.keyboard.press('Escape')
    await page.getByTestId('strategy-effectiveness-scroll').evaluate((el) => { el.scrollTop = el.scrollHeight })
    await page.waitForTimeout(300)
    await snap(page, 'strategy-evaluation-3.png')
    await page.getByTestId('strategy-effectiveness-scroll').evaluate((el) => { el.scrollTop = 0 })
    await page.getByRole('button', { name: '第5日', exact: true }).click()
    await page.waitForTimeout(300)
    await snap(page, 'strategy-evaluation-4.png')

    // 质量中心
    await closeGuide(page)
    await page.getByTestId('open-config-drawer-btn').click()
    await page.getByTestId('config-tab-diagnostics').click()
    await expect(page.getByTestId('diagnostics-panel')).toBeVisible({ timeout: 15_000 })
    await snap(page, 'quality-center.png')
  })
})
