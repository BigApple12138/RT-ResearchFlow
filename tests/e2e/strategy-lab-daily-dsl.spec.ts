import { expect, test, _electron as electron, type ElectronApplication } from '@playwright/test'
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

async function enterStrategyLab(app: ElectronApplication) {
  const window = await app.firstWindow()
  await window.waitForLoadState('domcontentloaded')
  await window.setViewportSize({ width: 1440, height: 900 })
  const guide = window.getByTestId('cold-start-guide')
  if (await guide.isVisible().catch(() => false)) {
    await guide.getByLabel('关闭引导').click()
  }
  await expect(window.getByTestId('nav-tab-short-term-strategy')).toBeVisible({ timeout: 60_000 })
  await window.getByTestId('nav-tab-short-term-strategy').click()
  await window.getByTestId('secondary-nav-short-term-strategy-strategyLab').click()
  await expect(window.getByText('策略实验室', { exact: true }).first()).toBeVisible({ timeout: 30_000 })
  return window
}

test('策略实验室展示日线 DSL 与两阶段内置模板且文案诚实', async () => {
  test.setTimeout(150_000)
  const userDataDir = mkdtempSync(join(tmpdir(), 'trade-watch-strategy-daily-dsl-'))
  let app: ElectronApplication | null = null
  try {
    // 与其它策略实验室 E2E 一致：先启一次落库目录，再启正式会话
    app = await launchApp(userDataDir)
    await app.firstWindow()
    await app.close()

    app = await launchApp(userDataDir)
    const window = await enterStrategyLab(app)

    await expect(window.getByText('日线 DSL 示例').first()).toBeVisible({ timeout: 30_000 })
    await expect(window.getByText('两阶段：日线预筛→分钟确认').first()).toBeVisible()

    await window.getByText('两阶段：日线预筛→分钟确认').first().click()
    await expect(window.getByText(/两阶段（日线→分钟）|两阶段（待配置/)).toBeVisible({ timeout: 15_000 })

    const configOverlay = window.getByTestId('strategy-config-drawer-overlay')
    if (await configOverlay.isVisible().catch(() => false)) {
      await window.keyboard.press('Escape')
      await expect(configOverlay).toBeHidden({ timeout: 10_000 })
    }

    await window.getByText('日线 DSL 示例').first().click()
    await expect(window.getByText('完整扫描').first()).toBeVisible({ timeout: 15_000 })
  } finally {
    await app?.close()
    rmSync(userDataDir, { recursive: true, force: true })
  }
})
