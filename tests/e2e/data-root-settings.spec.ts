import { expect, test, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

async function launchApp(userDataDir: string, extraEnv: Record<string, string> = {}): Promise<ElectronApplication> {
  const { ELECTRON_RUN_AS_NODE: _electronRunAsNode, RT_DATA_ROOT: _rtDataRoot, ...launchEnv } = process.env
  return electron.launch({
    args: [join(__dirname, '../../out/main/index.js'), `--user-data-dir=${userDataDir}`],
    env: { ...launchEnv, NODE_ENV: 'test', ...extraEnv },
  })
}

/** 跳过迁移进度小窗（data: URL），等待真正的主窗口就绪。 */
async function waitForMainWindow(app: ElectronApplication): Promise<Page> {
  await expect
    .poll(
      async () => {
        const windows = app.windows()
        return windows.some((window) => !window.url().startsWith('data:'))
      },
      { timeout: 60_000 },
    )
    .toBe(true)
  const window = app.windows().find((candidate) => !candidate.url().startsWith('data:'))!
  await window.waitForLoadState('domcontentloaded')
  return window
}

async function openDataRootSettings(window: Page): Promise<void> {
  const guide = window.getByTestId('cold-start-guide')
  if (await guide.isVisible()) await guide.getByLabel('关闭引导').click()
  await window.getByTestId('open-config-drawer-btn').click()
  await window.getByTestId('config-tab-settings').click()
  await window.getByTestId('settings-data-root-section').scrollIntoViewIfNeeded()
}

test('设置页展示数据目录，切换自定义目录重启后数据完整，恢复默认回到原目录', async () => {
  test.setTimeout(180_000)
  const userDataDir = mkdtempSync(join(tmpdir(), 'trade-watch-data-root-'))
  const defaultRoot = `${userDataDir}-dev`
  const customRoot = join(userDataDir, 'custom-root')

  let app = await launchApp(userDataDir)
  try {
    // 第一次启动：默认 dev 目录，展示区块与「默认」来源。
    let window = await waitForMainWindow(app)
    await openDataRootSettings(window)
    const section = window.getByTestId('settings-data-root-section')
    await expect(section).toBeVisible()
    await expect(window.getByTestId('settings-data-root-path')).toHaveText(defaultRoot)
    await expect(window.getByTestId('settings-data-root-source')).toHaveText('默认')
    await expect(window.getByTestId('settings-data-root-change')).toBeVisible()
    await expect(window.getByTestId('settings-data-root-restore')).toHaveCount(0)

    // 通过窄 IPC 设置自定义目录（绕过原生目录选择对话框），引导文件应已落盘。
    const setStatus = await window.evaluate((target) => window.api.dataRoot.setCustomRoot(target), customRoot)
    expect(setStatus).toEqual({ ok: true, data: { requiresRestart: true } })
    const bootstrapFile = JSON.parse(readFileSync(join(userDataDir, 'data-root.json'), 'utf8')) as { version: number; target: string }
    expect(bootstrapFile).toMatchObject({ version: 1, target: customRoot })
    await app.close()

    // 第二次启动：迁移进程展示进度小窗完成复制后自动退出
    // （生产环境会 relaunch；测试模式 NODE_ENV=test 只退出，避免 E2E 失控）。
    app = await launchApp(userDataDir)
    await app.waitForEvent('close', { timeout: 120_000 })
    expect(existsSync(join(customRoot, 'trade-watch.db'))).toBe(true)
    expect(existsSync(join(customRoot, 'session'))).toBe(true)
    expect(existsSync(join(defaultRoot, 'trade-watch.db'))).toBe(true)

    // 第三次启动：在新目录上运行，设置页反映自定义来源。
    app = await launchApp(userDataDir)
    window = await waitForMainWindow(app)
    await openDataRootSettings(window)
    await expect(window.getByTestId('settings-data-root-path')).toHaveText(customRoot)
    await expect(window.getByTestId('settings-data-root-source')).toHaveText('自定义')
    await expect(window.getByTestId('settings-data-root-restore')).toBeVisible()

    // 恢复默认并重启：回到原 dev 目录。
    const clearStatus = await window.evaluate(() => window.api.dataRoot.clearOverride())
    expect(clearStatus).toEqual({ ok: true, data: { requiresRestart: true } })
    await app.close()

    app = await launchApp(userDataDir)
    window = await waitForMainWindow(app)
    await openDataRootSettings(window)
    await expect(window.getByTestId('settings-data-root-path')).toHaveText(defaultRoot)
    await expect(window.getByTestId('settings-data-root-source')).toHaveText('默认')
  } finally {
    await app.close().catch(() => {})
    rmSync(userDataDir, { recursive: true, force: true })
    rmSync(defaultRoot, { recursive: true, force: true })
  }
})

test('环境变量指定数据目录时设置页只读提示且拒绝恢复默认', async () => {
  test.setTimeout(90_000)
  const userDataDir = mkdtempSync(join(tmpdir(), 'trade-watch-data-root-env-'))
  const envRoot = join(userDataDir, 'env-root')

  const app = await launchApp(userDataDir, { RT_DATA_ROOT: envRoot })
  try {
    const window = await waitForMainWindow(app)
    await openDataRootSettings(window)
    await expect(window.getByTestId('settings-data-root-path')).toHaveText(envRoot)
    await expect(window.getByTestId('settings-data-root-source')).toHaveText('环境变量')
    await expect(window.getByTestId('settings-data-root-section')).toContainText('RT_DATA_ROOT')
    await expect(window.getByTestId('settings-data-root-change')).toHaveCount(0)
    await expect(window.getByTestId('settings-data-root-restore')).toHaveCount(0)

    const clearStatus = await window.evaluate(() => window.api.dataRoot.clearOverride())
    expect(clearStatus).toMatchObject({ ok: false, error: 'DATA_ROOT_ENV_LOCKED' })
  } finally {
    await app.close().catch(() => {})
    rmSync(userDataDir, { recursive: true, force: true })
  }
})
