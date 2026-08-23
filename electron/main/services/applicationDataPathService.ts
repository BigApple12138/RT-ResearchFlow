import { createHash } from 'crypto'
import {
  cpSync,
  copyFileSync,
  closeSync,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  renameSync,
  rmdirSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'fs'
import { dirname, isAbsolute, join, relative, resolve } from 'path'
import { tmpdir } from 'os'
import type { App } from 'electron'

export const APP_DATA_DIRECTORY_NAME = 'data'
export const APP_DATA_MARKER_FILE = '.trade-watch-data-root.json'
export const SESSION_PROFILE_MIGRATION_MARKER_FILE = '.trade-watch-session-profile-v2.json'
export const DATA_ROOT_OVERRIDE_FILE = 'data-root.json'

const LEGACY_SESSION_PROFILE_MIGRATION_MARKER_FILE = '.trade-watch-session-profile-v1.json'

const DECISION_CENTER_FILTERS_STORAGE_KEY = 'decisionCenterFilters'

const KNOWN_ROOT_ENTRIES = new Set([
  APP_DATA_MARKER_FILE,
  'backups',
  'config.json',
  'trade-watch.db',
  'trade-watch.db-shm',
  'trade-watch.db-wal',
  'trade-watch.db.bak',
])

const TRANSIENT_NAMES = new Set(['LOCK', 'SingletonCookie', 'SingletonLock', 'SingletonSocket'])

export type ApplicationDataMode = 'development' | 'installed-windows' | 'platform-default'

export type DataRootOverrideSource = 'env' | 'file'

export interface DataRootOverride {
  target: string
  source: DataRootOverrideSource
  /** 写入引导文件时正在使用的数据根；空目标迁移时优先从这里复制（支持连续切换）。 */
  previousRoot: string | null
}

export interface ApplicationDataPathResult {
  mode: ApplicationDataMode
  dataRoot: string
  legacyUserDataPath: string
  migrated: boolean
  reusedExisting: boolean
  override: DataRootOverride | null
  pendingMigration: boolean
}

interface PathAppHost {
  isPackaged: boolean
  getPath(name: 'exe' | 'userData'): string
  setPath(name: 'userData' | 'sessionData', path: string): void
  setAppLogsPath(path?: string): void
}

export interface PrepareApplicationDataRootOptions {
  legacyUserDataPath: string
  dataRoot: string
  copyDirectory?: (source: string, destination: string) => void
  now?: () => number
  pid?: number
}

export interface PrepareCustomDataRootOptions {
  currentRoot: string
  targetRoot: string
  copyDirectory?: (source: string, destination: string) => void
  now?: () => number
  pid?: number
}

export class ApplicationDataPathError extends Error {
  constructor(
    public readonly code:
      | 'DATA_DIRECTORY_NOT_WRITABLE'
      | 'DATA_DIRECTORY_CONFLICT'
      | 'DATA_MIGRATION_FAILED'
      | 'DATA_ROOT_INVALID_PATH',
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options)
    this.name = 'ApplicationDataPathError'
  }
}

function isTransientName(name: string): boolean {
  return TRANSIENT_NAMES.has(name) || name.startsWith('Singleton')
}

function listMeaningfulEntries(directory: string): string[] {
  if (!existsSync(directory)) return []
  return readdirSync(directory).filter((name) => !isTransientName(name))
}

function hasApplicationData(directory: string): boolean {
  return listMeaningfulEntries(directory).some((name) =>
    KNOWN_ROOT_ENTRIES.has(name) || name.startsWith('trade-watch.db'),
  )
}

function ensureWritableDirectory(directory: string): void {
  try {
    mkdirSync(directory, { recursive: true })
    const probe = join(directory, `.trade-watch-write-${process.pid}-${Date.now()}`)
    writeFileSync(probe, 'ok', { encoding: 'utf8', flag: 'wx' })
    unlinkSync(probe)
  } catch (error) {
    throw new ApplicationDataPathError(
      'DATA_DIRECTORY_NOT_WRITABLE',
      `本地数据目录不可写：${directory}`,
      { cause: error },
    )
  }
}

function markerPayload(migratedFrom: string | null, createdAt: number): string {
  return `${JSON.stringify({ version: 1, createdAt, migratedFrom }, null, 2)}\n`
}

function writeMarker(directory: string, migratedFrom: string | null, createdAt: number): void {
  const marker = join(directory, APP_DATA_MARKER_FILE)
  if (existsSync(marker)) return
  writeFileSync(marker, markerPayload(migratedFrom, createdAt), { encoding: 'utf8', flag: 'wx' })
}

function shouldCopyPath(sourceRoot: string, sourcePath: string): boolean {
  const relativePath = relative(sourceRoot, sourcePath)
  if (!relativePath) return true
  return relativePath.split(/[\\/]/).every((part) => !isTransientName(part))
}

function defaultCopyDirectory(source: string, destination: string): void {
  cpSync(source, destination, {
    recursive: true,
    force: false,
    errorOnExist: true,
    filter: (sourcePath) => shouldCopyPath(source, sourcePath),
  })
}

function fileContainsStorageKey(path: string, storageKey: string): boolean {
  const needle = Buffer.from(storageKey, 'utf8')
  const chunk = Buffer.allocUnsafe(64 * 1024)
  let tail = Buffer.alloc(0)
  let fd: number | null = null
  try {
    fd = openSync(path, 'r')
    let bytesRead = 0
    do {
      bytesRead = readSync(fd, chunk, 0, chunk.length, null)
      if (bytesRead === 0) break
      const current = tail.length > 0
        ? Buffer.concat([tail, chunk.subarray(0, bytesRead)])
        : chunk.subarray(0, bytesRead)
      if (current.includes(needle)) return true
      const tailLength = Math.min(needle.length - 1, current.length)
      tail = Buffer.from(current.subarray(current.length - tailLength))
    } while (bytesRead > 0)
    return false
  } catch {
    return false
  } finally {
    if (fd != null) closeSync(fd)
  }
}

function directoryContainsStorageKey(directory: string, storageKey: string): boolean {
  if (!existsSync(directory)) return false
  try {
    for (const name of readdirSync(directory)) {
      if (isTransientName(name)) continue
      const path = join(directory, name)
      const stat = lstatSync(path)
      if (stat.isDirectory()) {
        if (directoryContainsStorageKey(path, storageKey)) return true
      } else if (stat.isFile() && fileContainsStorageKey(path, storageKey)) {
        return true
      }
    }
  } catch {
    return false
  }
  return false
}

/**
 * FR-241 originally moved sessionData into data/session without relocating the
 * existing Chromium Local Storage directory. Migrate it once before Electron
 * opens the profile, while preserving a destination that already owns app state.
 */
export function prepareSessionDataRoot(
  dataRoot: string,
  options: { now?: () => number; pid?: number } = {},
): { sessionData: string; migratedLegacyLocalStorage: boolean; migratedLegacyLocalState: boolean } {
  const resolvedDataRoot = resolve(dataRoot)
  const sessionData = join(resolvedDataRoot, 'session')
  const marker = join(sessionData, SESSION_PROFILE_MIGRATION_MARKER_FILE)
  const now = options.now ?? Date.now
  mkdirSync(sessionData, { recursive: true })

  if (existsSync(marker)) {
    return { sessionData, migratedLegacyLocalStorage: false, migratedLegacyLocalState: false }
  }

  const source = join(resolvedDataRoot, 'Local Storage')
  const destination = join(sessionData, 'Local Storage')
  const sourceOwnsAppState = directoryContainsStorageKey(source, DECISION_CENTER_FILTERS_STORAGE_KEY)
  const destinationOwnsAppState = directoryContainsStorageKey(destination, DECISION_CENTER_FILTERS_STORAGE_KEY)
  let migratedLegacyLocalStorage = false
  let migratedLegacyLocalState = false

  if (sourceOwnsAppState && !destinationOwnsAppState) {
    const pid = options.pid ?? process.pid
    const suffix = `${pid}-${now()}`
    const staging = join(sessionData, `.local-storage-migrating-${suffix}`)
    const backup = join(sessionData, `.local-storage-before-migration-${suffix}`)
    try {
      if (existsSync(staging) || existsSync(backup)) {
        throw new Error('SESSION_PROFILE_STAGING_CONFLICT')
      }
      defaultCopyDirectory(source, staging)
      if (!directoryContainsStorageKey(staging, DECISION_CENTER_FILTERS_STORAGE_KEY)) {
        throw new Error('SESSION_PROFILE_COPY_VERIFICATION_FAILED')
      }
      if (existsSync(destination)) renameSync(destination, backup)
      renameSync(staging, destination)
      if (existsSync(backup)) rmSync(backup, { recursive: true, force: true })
      migratedLegacyLocalStorage = true
    } catch (error) {
      removeStagingDirectory(staging)
      if (!existsSync(destination) && existsSync(backup)) renameSync(backup, destination)
      throw new ApplicationDataPathError(
        'DATA_MIGRATION_FAILED',
        `持久筛选偏好迁移失败，原数据保持不变：${source}`,
        { cause: error },
      )
    }
  }

  // safeStorage resolves its encryption key from sessionData/Local State. The
  // v1 profile migration moved sessionData but left this key behind, making all
  // previously saved provider credentials unreadable after the next restart.
  const legacyLocalState = join(resolvedDataRoot, 'Local State')
  const sessionLocalState = join(sessionData, 'Local State')
  if (existsSync(legacyLocalState)
    && (!existsSync(sessionLocalState) || fileDigest(legacyLocalState) !== fileDigest(sessionLocalState))) {
    const pid = options.pid ?? process.pid
    const suffix = `${pid}-${now()}`
    const staging = join(sessionData, `.local-state-migrating-${suffix}`)
    const backup = join(sessionData, `.local-state-before-migration-${suffix}`)
    try {
      if (existsSync(staging) || existsSync(backup)) throw new Error('SESSION_LOCAL_STATE_STAGING_CONFLICT')
      copyFileSync(legacyLocalState, staging)
      if (fileDigest(legacyLocalState) !== fileDigest(staging)) {
        throw new Error('SESSION_LOCAL_STATE_COPY_VERIFICATION_FAILED')
      }
      if (existsSync(sessionLocalState)) renameSync(sessionLocalState, backup)
      renameSync(staging, sessionLocalState)
      if (existsSync(backup)) unlinkSync(backup)
      migratedLegacyLocalState = true
    } catch (error) {
      if (existsSync(staging)) unlinkSync(staging)
      if (!existsSync(sessionLocalState) && existsSync(backup)) renameSync(backup, sessionLocalState)
      throw new ApplicationDataPathError(
        'DATA_MIGRATION_FAILED',
        `AI 与搜索凭据迁移失败，原数据保持不变：${legacyLocalState}`,
        { cause: error },
      )
    }
  }

  writeFileSync(
    marker,
    `${JSON.stringify({
      version: 2,
      createdAt: now(),
      migratedLegacyLocalStorage,
      migratedLegacyLocalState,
      upgradedFromV1: existsSync(join(sessionData, LEGACY_SESSION_PROFILE_MIGRATION_MARKER_FILE)),
    }, null, 2)}\n`,
    { encoding: 'utf8', flag: 'wx' },
  )
  return { sessionData, migratedLegacyLocalStorage, migratedLegacyLocalState }
}

interface FileSnapshot {
  size: number
  digest: string | null
}

function requiresDigest(relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/g, '/').toLowerCase()
  return normalized === 'config.json' || normalized.endsWith('.db') || normalized.endsWith('.db.bak')
}

function fileDigest(path: string): string {
  const hash = createHash('sha256')
  const buffer = Buffer.allocUnsafe(1024 * 1024)
  const fd = openSync(path, 'r')
  try {
    let bytesRead = 0
    do {
      bytesRead = readSync(fd, buffer, 0, buffer.length, null)
      if (bytesRead > 0) hash.update(buffer.subarray(0, bytesRead))
    } while (bytesRead > 0)
  } finally {
    closeSync(fd)
  }
  return hash.digest('hex')
}

function collectFileSnapshot(root: string): Map<string, FileSnapshot> {
  const snapshot = new Map<string, FileSnapshot>()
  const visit = (directory: string): void => {
    for (const name of readdirSync(directory)) {
      if (isTransientName(name)) continue
      const path = join(directory, name)
      const stat = lstatSync(path)
      if (stat.isDirectory()) {
        visit(path)
      } else if (stat.isFile()) {
        const relativePath = relative(root, path)
        snapshot.set(relativePath, {
          size: stat.size,
          digest: requiresDigest(relativePath) ? fileDigest(path) : null,
        })
      }
    }
  }
  visit(root)
  return snapshot
}

function verifyCopy(source: string, destination: string): void {
  const sourceFiles = collectFileSnapshot(source)
  const destinationFiles = collectFileSnapshot(destination)
  for (const [relativePath, expected] of sourceFiles) {
    const actual = destinationFiles.get(relativePath)
    if (!actual || actual.size !== expected.size || actual.digest !== expected.digest) {
      throw new Error(`COPY_VERIFICATION_FAILED:${relativePath}`)
    }
  }
}

function removeStagingDirectory(path: string): void {
  try {
    if (existsSync(path)) rmSync(path, { recursive: true, force: true })
  } catch {
    // A failed cleanup must not hide the migration failure. The staging path remains outside dataRoot.
  }
}

export function prepareApplicationDataRoot(options: PrepareApplicationDataRootOptions): {
  migrated: boolean
  reusedExisting: boolean
} {
  const legacyUserDataPath = resolve(options.legacyUserDataPath)
  const dataRoot = resolve(options.dataRoot)
  const now = options.now ?? Date.now
  const pid = options.pid ?? process.pid

  if (legacyUserDataPath === dataRoot) {
    ensureWritableDirectory(dataRoot)
    writeMarker(dataRoot, null, now())
    return { migrated: false, reusedExisting: true }
  }

  if (hasApplicationData(dataRoot)) {
    ensureWritableDirectory(dataRoot)
    writeMarker(dataRoot, null, now())
    return { migrated: false, reusedExisting: true }
  }

  const targetEntries = listMeaningfulEntries(dataRoot)
  if (targetEntries.length > 0) {
    throw new ApplicationDataPathError(
      'DATA_DIRECTORY_CONFLICT',
      `目标数据目录包含未知文件，已停止以避免覆盖：${dataRoot}`,
    )
  }

  ensureWritableDirectory(dirname(dataRoot))
  const hasLegacyData = hasApplicationData(legacyUserDataPath)
  if (!hasLegacyData) {
    ensureWritableDirectory(dataRoot)
    writeMarker(dataRoot, null, now())
    return { migrated: false, reusedExisting: false }
  }

  const staging = `${dataRoot}.migrating-${pid}-${now()}`
  if (existsSync(staging)) {
    throw new ApplicationDataPathError(
      'DATA_DIRECTORY_CONFLICT',
      `检测到未处理的数据迁移目录：${staging}`,
    )
  }

  try {
    if (existsSync(dataRoot)) rmdirSync(dataRoot)
    const copyDirectory = options.copyDirectory ?? defaultCopyDirectory
    copyDirectory(legacyUserDataPath, staging)
    verifyCopy(legacyUserDataPath, staging)
    writeMarker(staging, legacyUserDataPath, now())
    renameSync(staging, dataRoot)
    ensureWritableDirectory(dataRoot)
    return { migrated: true, reusedExisting: false }
  } catch (error) {
    removeStagingDirectory(staging)
    throw new ApplicationDataPathError(
      'DATA_MIGRATION_FAILED',
      `旧数据迁移失败，原目录保持不变：${legacyUserDataPath}`,
      { cause: error },
    )
  }
}

/**
 * 引导配置文件（data-root.json）先于任何数据库存在，保存在固定的平台默认
 * userData 目录，解决「数据目录在哪必须先于数据库可知」的鸡生蛋问题。
 * 文件缺失或损坏时退回默认目录，不阻塞启动。
 */
export function readDataRootOverride(
  bootstrapDirectory: string,
): { target: string; previousRoot: string | null } | null {
  let raw: string
  try {
    raw = readFileSync(join(bootstrapDirectory, DATA_ROOT_OVERRIDE_FILE), 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    console.warn('[AppData] 数据目录引导文件读取失败，退回默认目录:', error)
    return null
  }
  try {
    const parsed = JSON.parse(raw) as { target?: unknown; previousRoot?: unknown }
    if (typeof parsed.target === 'string' && parsed.target.trim().length > 0) {
      const previousRoot = typeof parsed.previousRoot === 'string'
        && parsed.previousRoot.trim().length > 0
        && isAbsolute(parsed.previousRoot.trim())
        ? parsed.previousRoot.trim()
        : null
      return { target: parsed.target.trim(), previousRoot }
    }
    console.warn('[AppData] 数据目录引导文件缺少有效 target，退回默认目录。')
    return null
  } catch (error) {
    console.warn('[AppData] 数据目录引导文件不是有效 JSON，退回默认目录:', error)
    return null
  }
}

export function writeDataRootOverride(
  bootstrapDirectory: string,
  target: string,
  previousRoot: string | null = null,
): void {
  mkdirSync(bootstrapDirectory, { recursive: true })
  const file = join(bootstrapDirectory, DATA_ROOT_OVERRIDE_FILE)
  const payload = { version: 1, target, previousRoot, updatedAt: Date.now() }
  const temporary = `${file}.tmp-${process.pid}`
  writeFileSync(temporary, `${JSON.stringify(payload, null, 2)}\n`, { encoding: 'utf8' })
  renameSync(temporary, file)
}

export function clearDataRootOverride(bootstrapDirectory: string): void {
  try {
    unlinkSync(join(bootstrapDirectory, DATA_ROOT_OVERRIDE_FILE))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
}

export function resolveDataRootOverride(
  bootstrapDirectory: string,
  envValue: string | undefined,
): DataRootOverride | null {
  const envTarget = envValue?.trim()
  if (envTarget) return { target: envTarget, source: 'env', previousRoot: null }
  const fileOverride = readDataRootOverride(bootstrapDirectory)
  if (fileOverride) return { target: fileOverride.target, source: 'file', previousRoot: fileOverride.previousRoot }
  return null
}

export function validateCustomDataRootTarget(target: unknown): string {
  if (typeof target !== 'string') {
    throw new ApplicationDataPathError('DATA_ROOT_INVALID_PATH', '数据目录路径无效')
  }
  const trimmed = target.trim()
  if (!trimmed || !isAbsolute(trimmed)) {
    throw new ApplicationDataPathError(
      'DATA_ROOT_INVALID_PATH',
      `数据目录必须是绝对路径：${trimmed || '(空)'}`,
    )
  }
  const resolved = resolve(trimmed)
  ensureWritableDirectory(resolved)
  return resolved
}

export function classifyDataRootTarget(targetRoot: string): 'app-data' | 'empty' | 'conflict' {
  if (hasApplicationData(targetRoot)) return 'app-data'
  return listMeaningfulEntries(targetRoot).length > 0 ? 'conflict' : 'empty'
}

export function prepareCustomDataRoot(options: PrepareCustomDataRootOptions): {
  migrated: boolean
  reusedExisting: boolean
} {
  return prepareApplicationDataRoot({
    legacyUserDataPath: options.currentRoot,
    dataRoot: options.targetRoot,
    copyDirectory: options.copyDirectory,
    now: options.now,
    pid: options.pid,
  })
}

/**
 * 待迁移进程专用的临时 Chromium profile。
 * 阶段 A 不能把 userData 指向目标目录：Chromium 会在 ready 前就在 userData 里
 * 初始化 profile 文件（Cache、Local Storage 等），把原本为空的目标目录污染成
 * 「未知文件冲突」，导致阶段 B 复制必然失败。迁移小窗因此使用 OS 临时目录里
 * 的一次性 profile，复制源与目标目录都保持干净。
 */
function migrationScratchProfile(): string {
  const scratch = join(tmpdir(), `trade-watch-data-root-migration-${process.pid}-${Date.now()}`)
  ensureWritableDirectory(scratch)
  return scratch
}

function planDataRootOverride(
  defaultRoot: string,
  override: DataRootOverride | null,
  fallbackSource: string | null,
): { dataRoot: string; migrationSource: string | null } {
  if (!override) return { dataRoot: defaultRoot, migrationSource: null }
  const targetRoot = resolve(override.target)
  if (targetRoot === resolve(defaultRoot)) return { dataRoot: targetRoot, migrationSource: null }
  const classification = classifyDataRootTarget(targetRoot)
  if (classification === 'app-data') return { dataRoot: targetRoot, migrationSource: null }
  if (classification === 'conflict') {
    throw new ApplicationDataPathError(
      'DATA_DIRECTORY_CONFLICT',
      `目标数据目录包含未知文件，已停止以避免覆盖：${targetRoot}`,
    )
  }
  const migrationSource = [
    // 引导文件记录的上一数据根优先：连续切换自定义目录时，新目标应从真正在用的根复制。
    override.previousRoot,
    defaultRoot,
    fallbackSource,
  ].find((candidate) => candidate !== null
    && resolve(candidate) !== targetRoot
    && hasApplicationData(candidate)) ?? null
  return { dataRoot: targetRoot, migrationSource }
}

let configuredDataPathResult: ApplicationDataPathResult | null = null
let pendingDataRootMigration: PrepareCustomDataRootOptions | null = null

export function getApplicationDataPathResult(): ApplicationDataPathResult | null {
  return configuredDataPathResult
}

export function hasPendingDataRootMigration(): boolean {
  return pendingDataRootMigration !== null
}

/**
 * 阶段 B：在 app.whenReady() 之后执行延迟的数据根复制迁移（带进度小窗）。
 * 调用方在本进程退出前完成复制即可：Chromium profile 已初始化在临时 profile，
 * 无法在进程内切换 userData，复制成功后须重启应用使新根生效。
 */
export function applyDeferredDataRootMigration(): { migrated: boolean; reusedExisting: boolean } {
  const migration = pendingDataRootMigration
  if (!migration) return { migrated: false, reusedExisting: true }
  const prepared = prepareCustomDataRoot(migration)
  pendingDataRootMigration = null
  prepareSessionDataRoot(migration.targetRoot)
  mkdirSync(join(migration.targetRoot, 'logs'), { recursive: true })
  return prepared
}

export function configureApplicationDataPaths(
  app: Pick<App, 'isPackaged' | 'getPath' | 'setPath' | 'setAppLogsPath'> | PathAppHost,
  platform: NodeJS.Platform = process.platform,
  envDataRoot: string | undefined = process.env['RT_DATA_ROOT'],
): ApplicationDataPathResult {
  const legacyUserDataPath = app.getPath('userData')
  const override = resolveDataRootOverride(legacyUserDataPath, envDataRoot)
  pendingDataRootMigration = null

  if (!app.isPackaged) {
    // dev 模式下 override 按原样使用（不追加 -dev 后缀）：用户显式指定即视为知情。
    const defaultRoot = legacyUserDataPath.endsWith('-dev') ? legacyUserDataPath : `${legacyUserDataPath}-dev`
    const plan = planDataRootOverride(defaultRoot, override, null)
    if (plan.migrationSource) {
      pendingDataRootMigration = { currentRoot: plan.migrationSource, targetRoot: plan.dataRoot }
      app.setPath('userData', migrationScratchProfile())
      configuredDataPathResult = {
        mode: 'development',
        dataRoot: plan.migrationSource,
        legacyUserDataPath,
        migrated: false,
        reusedExisting: false,
        override,
        pendingMigration: true,
      }
      return configuredDataPathResult
    }
    ensureWritableDirectory(plan.dataRoot)
    const { sessionData } = prepareSessionDataRoot(plan.dataRoot)
    const logs = join(plan.dataRoot, 'logs')
    mkdirSync(logs, { recursive: true })
    app.setPath('userData', plan.dataRoot)
    app.setPath('sessionData', sessionData)
    app.setAppLogsPath(logs)
    configuredDataPathResult = {
      mode: 'development',
      dataRoot: plan.dataRoot,
      legacyUserDataPath,
      migrated: false,
      reusedExisting: true,
      override,
      pendingMigration: false,
    }
    return configuredDataPathResult
  }

  if (platform !== 'win32') {
    if (!override) {
      configuredDataPathResult = {
        mode: 'platform-default',
        dataRoot: legacyUserDataPath,
        legacyUserDataPath,
        migrated: false,
        reusedExisting: true,
        override: null,
        pendingMigration: false,
      }
      return configuredDataPathResult
    }
    const plan = planDataRootOverride(legacyUserDataPath, override, null)
    if (plan.migrationSource) {
      pendingDataRootMigration = { currentRoot: plan.migrationSource, targetRoot: plan.dataRoot }
      app.setPath('userData', migrationScratchProfile())
      configuredDataPathResult = {
        mode: 'platform-default',
        dataRoot: plan.migrationSource,
        legacyUserDataPath,
        migrated: false,
        reusedExisting: false,
        override,
        pendingMigration: true,
      }
      return configuredDataPathResult
    }
    ensureWritableDirectory(plan.dataRoot)
    const { sessionData } = prepareSessionDataRoot(plan.dataRoot)
    const logs = join(plan.dataRoot, 'logs')
    mkdirSync(logs, { recursive: true })
    app.setPath('userData', plan.dataRoot)
    app.setPath('sessionData', sessionData)
    app.setAppLogsPath(logs)
    configuredDataPathResult = {
      mode: 'platform-default',
      dataRoot: plan.dataRoot,
      legacyUserDataPath,
      migrated: false,
      reusedExisting: true,
      override,
      pendingMigration: false,
    }
    return configuredDataPathResult
  }

  const installDirectory = dirname(app.getPath('exe'))
  const defaultRoot = join(installDirectory, APP_DATA_DIRECTORY_NAME)
  const plan = planDataRootOverride(defaultRoot, override, legacyUserDataPath)
  if (override && plan.migrationSource) {
    pendingDataRootMigration = { currentRoot: plan.migrationSource, targetRoot: plan.dataRoot }
    app.setPath('userData', migrationScratchProfile())
    configuredDataPathResult = {
      mode: 'installed-windows',
      dataRoot: plan.migrationSource,
      legacyUserDataPath,
      migrated: false,
      reusedExisting: false,
      override,
      pendingMigration: true,
    }
    return configuredDataPathResult
  }
  const prepared = prepareApplicationDataRoot({ legacyUserDataPath, dataRoot: plan.dataRoot })
  const { sessionData } = prepareSessionDataRoot(plan.dataRoot)
  const logs = join(plan.dataRoot, 'logs')
  mkdirSync(logs, { recursive: true })
  app.setPath('userData', plan.dataRoot)
  app.setPath('sessionData', sessionData)
  app.setAppLogsPath(logs)
  configuredDataPathResult = {
    mode: 'installed-windows',
    dataRoot: plan.dataRoot,
    legacyUserDataPath,
    ...prepared,
    override,
    pendingMigration: false,
  }
  return configuredDataPathResult
}

export function applicationDataPathErrorMessage(error: unknown): string {
  if (error instanceof ApplicationDataPathError) return error.message
  return `本地数据目录初始化失败：${error instanceof Error ? error.message : String(error)}`
}
