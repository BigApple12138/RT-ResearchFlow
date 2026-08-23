import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  APP_DATA_MARKER_FILE,
  DATA_ROOT_OVERRIDE_FILE,
  SESSION_PROFILE_MIGRATION_MARKER_FILE,
  ApplicationDataPathError,
  applyDeferredDataRootMigration,
  classifyDataRootTarget,
  clearDataRootOverride,
  configureApplicationDataPaths,
  getApplicationDataPathResult,
  hasPendingDataRootMigration,
  prepareApplicationDataRoot,
  prepareCustomDataRoot,
  prepareSessionDataRoot,
  readDataRootOverride,
  resolveDataRootOverride,
  validateCustomDataRootTarget,
  writeDataRootOverride,
} from '../../electron/main/services/applicationDataPathService'

const cleanupDirectories: string[] = []

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'trade-watch-data-path-'))
  cleanupDirectories.push(directory)
  return directory
}

afterEach(() => {
  for (const directory of cleanupDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

function appHost(input: { packaged: boolean; userData: string; exe: string }) {
  const paths = new Map<string, string>([
    ['userData', input.userData],
    ['exe', input.exe],
  ])
  let logsPath: string | null = null
  return {
    isPackaged: input.packaged,
    getPath: (name: 'exe' | 'userData') => paths.get(name)!,
    setPath: (name: 'userData' | 'sessionData', path: string) => { paths.set(name, path) },
    setAppLogsPath: (path?: string) => { logsPath = path ?? null },
    paths,
    get logsPath() { return logsPath },
  }
}

describe('应用数据路径服务', () => {
  it('让打包后的 Windows 应用使用安装目录 data 子目录', () => {
    const root = temporaryDirectory()
    const installDirectory = join(root, 'installed')
    mkdirSync(installDirectory)
    const host = appHost({ packaged: true, userData: join(root, 'legacy'), exe: join(installDirectory, 'trade-watch.exe') })

    const result = configureApplicationDataPaths(host, 'win32')

    expect(result.mode).toBe('installed-windows')
    expect(result.dataRoot).toBe(join(installDirectory, 'data'))
    expect(host.paths.get('userData')).toBe(result.dataRoot)
    expect(host.paths.get('sessionData')).toBe(join(result.dataRoot, 'session'))
    expect(host.logsPath).toBe(join(result.dataRoot, 'logs'))
    expect(readFileSync(join(result.dataRoot, APP_DATA_MARKER_FILE), 'utf8')).toContain('"version": 1')
  })

  it('首次启动复制旧数据库、配置和备份后原子发布新目录', () => {
    const root = temporaryDirectory()
    const legacy = join(root, 'legacy')
    const target = join(root, 'installed', 'data')
    mkdirSync(join(legacy, 'backups'), { recursive: true })
    writeFileSync(join(legacy, 'trade-watch.db'), 'database-v1')
    writeFileSync(join(legacy, 'config.json'), '{"lastHeartbeat":1}')
    writeFileSync(join(legacy, 'backups', 'backup.db'), 'backup-v1')

    const result = prepareApplicationDataRoot({ legacyUserDataPath: legacy, dataRoot: target, now: () => 100, pid: 7 })

    expect(result).toEqual({ migrated: true, reusedExisting: false })
    expect(readFileSync(join(target, 'trade-watch.db'), 'utf8')).toBe('database-v1')
    expect(readFileSync(join(target, 'backups', 'backup.db'), 'utf8')).toBe('backup-v1')
    expect(readFileSync(join(legacy, 'trade-watch.db'), 'utf8')).toBe('database-v1')
    expect(readFileSync(join(target, APP_DATA_MARKER_FILE), 'utf8')).toContain(legacy.replace(/\\/g, '\\\\'))
  })

  it('目标已有应用数据时以目标为准且不覆盖', () => {
    const root = temporaryDirectory()
    const legacy = join(root, 'legacy')
    const target = join(root, 'installed', 'data')
    mkdirSync(legacy, { recursive: true })
    mkdirSync(target, { recursive: true })
    writeFileSync(join(legacy, 'trade-watch.db'), 'old')
    writeFileSync(join(target, 'trade-watch.db'), 'current')

    const result = prepareApplicationDataRoot({ legacyUserDataPath: legacy, dataRoot: target })

    expect(result).toEqual({ migrated: false, reusedExisting: true })
    expect(readFileSync(join(target, 'trade-watch.db'), 'utf8')).toBe('current')
  })

  it('目标含未知文件时阻断且不删除任一侧内容', () => {
    const root = temporaryDirectory()
    const legacy = join(root, 'legacy')
    const target = join(root, 'installed', 'data')
    mkdirSync(legacy, { recursive: true })
    mkdirSync(target, { recursive: true })
    writeFileSync(join(legacy, 'trade-watch.db'), 'old')
    writeFileSync(join(target, 'unrelated.txt'), 'keep')

    expect(() => prepareApplicationDataRoot({ legacyUserDataPath: legacy, dataRoot: target }))
      .toThrowError(expect.objectContaining<ApplicationDataPathError>({ code: 'DATA_DIRECTORY_CONFLICT' }))
    expect(readFileSync(join(legacy, 'trade-watch.db'), 'utf8')).toBe('old')
    expect(readFileSync(join(target, 'unrelated.txt'), 'utf8')).toBe('keep')
  })

  it('复制失败时回滚 staging 并保留旧目录', () => {
    const root = temporaryDirectory()
    const legacy = join(root, 'legacy')
    const target = join(root, 'installed', 'data')
    mkdirSync(legacy, { recursive: true })
    writeFileSync(join(legacy, 'trade-watch.db'), 'old')

    expect(() => prepareApplicationDataRoot({
      legacyUserDataPath: legacy,
      dataRoot: target,
      now: () => 200,
      pid: 9,
      copyDirectory: (_source, destination) => {
        mkdirSync(destination, { recursive: true })
        writeFileSync(join(destination, 'partial'), 'partial')
        throw new Error('COPY_FAILED')
      },
    })).toThrowError(expect.objectContaining<ApplicationDataPathError>({ code: 'DATA_MIGRATION_FAILED' }))
    expect(readFileSync(join(legacy, 'trade-watch.db'), 'utf8')).toBe('old')
    expect(() => readFileSync(`${target}.migrating-9-200`)).toThrow()
  })

  it('开发环境继续使用隔离的 dev 数据目录', () => {
    const root = temporaryDirectory()
    const userData = join(root, 'user-data')
    const host = appHost({ packaged: false, userData, exe: join(root, 'electron.exe') })

    const result = configureApplicationDataPaths(host, 'win32')

    expect(result.mode).toBe('development')
    expect(result.dataRoot).toBe(`${userData}-dev`)
    expect(host.paths.get('userData')).toBe(`${userData}-dev`)
  })

  it('首次启用 session 子目录时迁移旧 Local Storage 中的看板筛选', () => {
    const root = temporaryDirectory()
    const source = join(root, 'Local Storage', 'leveldb')
    const destination = join(root, 'session', 'Local Storage', 'leveldb')
    mkdirSync(source, { recursive: true })
    mkdirSync(destination, { recursive: true })
    writeFileSync(join(source, '000003.log'), '\0decisionCenterFilters\0{"minPriority":4}')
    writeFileSync(join(destination, '000003.log'), 'empty-new-profile')

    const result = prepareSessionDataRoot(root, { now: () => 300, pid: 11 })

    expect(result.migratedLegacyLocalStorage).toBe(true)
    expect(readFileSync(join(destination, '000003.log'), 'utf8')).toContain('"minPriority":4')
    expect(readFileSync(join(source, '000003.log'), 'utf8')).toContain('"minPriority":4')
    expect(readFileSync(join(root, 'session', SESSION_PROFILE_MIGRATION_MARKER_FILE), 'utf8'))
      .toContain('"migratedLegacyLocalStorage": true')
  })

  it('session 已有看板筛选时保留较新的目标值', () => {
    const root = temporaryDirectory()
    const source = join(root, 'Local Storage', 'leveldb')
    const destination = join(root, 'session', 'Local Storage', 'leveldb')
    mkdirSync(source, { recursive: true })
    mkdirSync(destination, { recursive: true })
    writeFileSync(join(source, '000003.log'), '\0decisionCenterFilters\0{"minPriority":2}')
    writeFileSync(join(destination, '000003.log'), '\0decisionCenterFilters\0{"minPriority":4}')

    const result = prepareSessionDataRoot(root)

    expect(result.migratedLegacyLocalStorage).toBe(false)
    expect(readFileSync(join(destination, '000003.log'), 'utf8')).toContain('"minPriority":4')
  })

  it('v1 session 迁移后补迁 Chromium Local State 以恢复已保存凭据', () => {
    const root = temporaryDirectory()
    const session = join(root, 'session')
    mkdirSync(session, { recursive: true })
    writeFileSync(join(root, 'Local State'), '{"os_crypt":{"encrypted_key":"legacy-key"}}')
    writeFileSync(join(session, 'Local State'), '{"os_crypt":{"encrypted_key":"new-empty-profile-key"}}')
    writeFileSync(
      join(session, '.trade-watch-session-profile-v1.json'),
      '{"version":1,"createdAt":100,"migratedLegacyLocalStorage":true}',
    )

    const result = prepareSessionDataRoot(root, { now: () => 400, pid: 12 })

    expect(result.migratedLegacyLocalState).toBe(true)
    expect(readFileSync(join(session, 'Local State'), 'utf8')).toContain('legacy-key')
    const marker = readFileSync(join(session, SESSION_PROFILE_MIGRATION_MARKER_FILE), 'utf8')
    expect(marker).toContain('"version": 2')
    expect(marker).toContain('"upgradedFromV1": true')
  })

  it('v2 session 标记防止后续启动覆盖当前 Local State', () => {
    const root = temporaryDirectory()
    const session = join(root, 'session')
    mkdirSync(session, { recursive: true })
    writeFileSync(join(root, 'Local State'), 'legacy-key-v1')

    const first = prepareSessionDataRoot(root, { now: () => 500, pid: 13 })
    expect(first.migratedLegacyLocalState).toBe(true)
    writeFileSync(join(session, 'Local State'), 'active-session-key')

    const second = prepareSessionDataRoot(root, { now: () => 600, pid: 13 })

    expect(second.migratedLegacyLocalState).toBe(false)
    expect(readFileSync(join(session, 'Local State'), 'utf8')).toBe('active-session-key')
  })

  it('打包后的非 Windows 平台保持系统默认 userData', () => {
    const root = temporaryDirectory()
    const userData = join(root, 'user-data')
    const host = appHost({ packaged: true, userData, exe: join(root, 'App.app', 'MacOS', 'trade-watch') })

    const result = configureApplicationDataPaths(host, 'darwin')

    expect(result.mode).toBe('platform-default')
    expect(host.paths.get('userData')).toBe(userData)
    expect(host.logsPath).toBeNull()
  })
})

describe('自定义数据目录', () => {
  it('引导文件缺失时 readDataRootOverride 返回 null', () => {
    const bootstrap = temporaryDirectory()
    expect(readDataRootOverride(bootstrap)).toBeNull()
  })

  it('引导文件损坏时退回 null 而不抛异常', () => {
    const bootstrap = temporaryDirectory()
    writeFileSync(join(bootstrap, DATA_ROOT_OVERRIDE_FILE), '{not-json')
    expect(readDataRootOverride(bootstrap)).toBeNull()
  })

  it('引导文件缺少有效 target 时退回 null', () => {
    const bootstrap = temporaryDirectory()
    writeFileSync(join(bootstrap, DATA_ROOT_OVERRIDE_FILE), JSON.stringify({ version: 1, target: 42 }))
    expect(readDataRootOverride(bootstrap)).toBeNull()
    writeFileSync(join(bootstrap, DATA_ROOT_OVERRIDE_FILE), JSON.stringify({ version: 1, target: '   ' }))
    expect(readDataRootOverride(bootstrap)).toBeNull()
  })

  it('writeDataRootOverride 原子写入后可被读回', () => {
    const bootstrap = temporaryDirectory()
    writeDataRootOverride(bootstrap, 'D:\\rt-data')
    expect(readDataRootOverride(bootstrap)).toEqual({ target: 'D:\\rt-data', previousRoot: null })
    writeDataRootOverride(bootstrap, 'D:\\rt-data', 'E:\\old-root')
    expect(readDataRootOverride(bootstrap)).toEqual({ target: 'D:\\rt-data', previousRoot: 'E:\\old-root' })
    const raw = readFileSync(join(bootstrap, DATA_ROOT_OVERRIDE_FILE), 'utf8')
    expect(raw).toContain('"version": 1')
    expect(raw).toContain('"updatedAt"')
    expect(existsSync(`${join(bootstrap, DATA_ROOT_OVERRIDE_FILE)}.tmp-${process.pid}`)).toBe(false)
  })

  it('引导文件的 previousRoot 非绝对路径时视为 null', () => {
    const bootstrap = temporaryDirectory()
    writeFileSync(join(bootstrap, DATA_ROOT_OVERRIDE_FILE), JSON.stringify({ version: 1, target: 'D:\\rt-data', previousRoot: 'relative/path' }))
    expect(readDataRootOverride(bootstrap)).toEqual({ target: 'D:\\rt-data', previousRoot: null })
  })

  it('clearDataRootOverride 删除引导文件且缺失时静默成功', () => {
    const bootstrap = temporaryDirectory()
    clearDataRootOverride(bootstrap)
    writeDataRootOverride(bootstrap, 'D:\\rt-data')
    clearDataRootOverride(bootstrap)
    expect(existsSync(join(bootstrap, DATA_ROOT_OVERRIDE_FILE))).toBe(false)
  })

  it('resolveDataRootOverride 优先使用环境变量（去除首尾空白）', () => {
    const bootstrap = temporaryDirectory()
    writeDataRootOverride(bootstrap, 'D:\\file-target')
    expect(resolveDataRootOverride(bootstrap, '  E:\\env-target  '))
      .toEqual({ target: 'E:\\env-target', source: 'env', previousRoot: null })
  })

  it('resolveDataRootOverride 环境变量空白时退回引导文件', () => {
    const bootstrap = temporaryDirectory()
    writeDataRootOverride(bootstrap, 'D:\\file-target', 'D:\\previous')
    expect(resolveDataRootOverride(bootstrap, '   '))
      .toEqual({ target: 'D:\\file-target', source: 'file', previousRoot: 'D:\\previous' })
    expect(resolveDataRootOverride(bootstrap, undefined)).toEqual({ target: 'D:\\file-target', source: 'file', previousRoot: 'D:\\previous' })
  })

  it('validateCustomDataRootTarget 拒绝非字符串与非绝对路径', () => {
    expect(() => validateCustomDataRootTarget(undefined))
      .toThrowError(expect.objectContaining<ApplicationDataPathError>({ code: 'DATA_ROOT_INVALID_PATH' }))
    expect(() => validateCustomDataRootTarget('relative/path'))
      .toThrowError(expect.objectContaining<ApplicationDataPathError>({ code: 'DATA_ROOT_INVALID_PATH' }))
    expect(() => validateCustomDataRootTarget('   '))
      .toThrowError(expect.objectContaining<ApplicationDataPathError>({ code: 'DATA_ROOT_INVALID_PATH' }))
  })

  it('validateCustomDataRootTarget 接受可写绝对路径并 resolve', () => {
    const root = temporaryDirectory()
    const target = join(root, 'new-root')
    expect(validateCustomDataRootTarget(target)).toBe(target)
    expect(existsSync(target)).toBe(true)
  })

  it('classifyDataRootTarget 区分已有数据 / 空目录 / 冲突', () => {
    const root = temporaryDirectory()
    const withData = join(root, 'with-data')
    const empty = join(root, 'empty')
    const conflict = join(root, 'conflict')
    mkdirSync(withData, { recursive: true })
    mkdirSync(empty, { recursive: true })
    mkdirSync(conflict, { recursive: true })
    writeFileSync(join(withData, 'trade-watch.db'), 'db')
    writeFileSync(join(conflict, 'unrelated.txt'), 'keep')

    expect(classifyDataRootTarget(withData)).toBe('app-data')
    expect(classifyDataRootTarget(empty)).toBe('empty')
    expect(classifyDataRootTarget(conflict)).toBe('conflict')
    expect(classifyDataRootTarget(join(root, 'missing'))).toBe('empty')
  })

  it('prepareCustomDataRoot 空目标时复制现有数据且原目录不变', () => {
    const root = temporaryDirectory()
    const current = join(root, 'current')
    const target = join(root, 'target')
    mkdirSync(current, { recursive: true })
    writeFileSync(join(current, 'trade-watch.db'), 'database-v2')

    const result = prepareCustomDataRoot({ currentRoot: current, targetRoot: target, now: () => 700, pid: 21 })

    expect(result).toEqual({ migrated: true, reusedExisting: false })
    expect(readFileSync(join(target, 'trade-watch.db'), 'utf8')).toBe('database-v2')
    expect(readFileSync(join(current, 'trade-watch.db'), 'utf8')).toBe('database-v2')
  })

  it('prepareCustomDataRoot 目标已有应用数据时直接复用', () => {
    const root = temporaryDirectory()
    const current = join(root, 'current')
    const target = join(root, 'target')
    mkdirSync(current, { recursive: true })
    mkdirSync(target, { recursive: true })
    writeFileSync(join(current, 'trade-watch.db'), 'old-env')
    writeFileSync(join(target, 'trade-watch.db'), 'other-env')

    const result = prepareCustomDataRoot({ currentRoot: current, targetRoot: target })

    expect(result).toEqual({ migrated: false, reusedExisting: true })
    expect(readFileSync(join(target, 'trade-watch.db'), 'utf8')).toBe('other-env')
  })

  it('prepareCustomDataRoot 目标含未知文件时报冲突且双方不动', () => {
    const root = temporaryDirectory()
    const current = join(root, 'current')
    const target = join(root, 'target')
    mkdirSync(current, { recursive: true })
    mkdirSync(target, { recursive: true })
    writeFileSync(join(current, 'trade-watch.db'), 'old')
    writeFileSync(join(target, 'unrelated.txt'), 'keep')

    expect(() => prepareCustomDataRoot({ currentRoot: current, targetRoot: target }))
      .toThrowError(expect.objectContaining<ApplicationDataPathError>({ code: 'DATA_DIRECTORY_CONFLICT' }))
    expect(readFileSync(join(target, 'unrelated.txt'), 'utf8')).toBe('keep')
    expect(readFileSync(join(current, 'trade-watch.db'), 'utf8')).toBe('old')
  })

  it('开发模式引导文件指向空目标时登记延迟迁移且不追加 -dev 后缀', () => {
    const root = temporaryDirectory()
    const userData = join(root, 'user-data')
    mkdirSync(userData, { recursive: true })
    const devRoot = `${userData}-dev`
    mkdirSync(devRoot, { recursive: true })
    writeFileSync(join(devRoot, 'trade-watch.db'), 'dev-data')
    const target = join(root, 'custom-root')
    writeDataRootOverride(userData, target)
    const host = appHost({ packaged: false, userData, exe: join(root, 'electron.exe') })

    const result = configureApplicationDataPaths(host, 'win32', undefined)

    expect(result.mode).toBe('development')
    // 待迁移进程仍留在原根，本进程不提前占用目标目录。
    expect(result.dataRoot).toBe(devRoot)
    expect(result.override).toEqual({ target, source: 'file', previousRoot: null })
    expect(result.pendingMigration).toBe(true)
    expect(hasPendingDataRootMigration()).toBe(true)
    expect(getApplicationDataPathResult()).toEqual(result)
    // userData 指向临时 profile，而不是目标目录（否则 Chromium 会污染目标导致复制冲突）。
    expect(host.paths.get('userData')).not.toBe(target)
    expect(host.paths.get('userData')).not.toBe(devRoot)

    const migration = applyDeferredDataRootMigration()
    expect(migration).toEqual({ migrated: true, reusedExisting: false })
    expect(hasPendingDataRootMigration()).toBe(false)
    expect(readFileSync(join(target, 'trade-watch.db'), 'utf8')).toBe('dev-data')
    expect(existsSync(join(target, 'session'))).toBe(true)
    expect(existsSync(join(target, 'logs'))).toBe(true)
    expect(readFileSync(join(target, APP_DATA_MARKER_FILE), 'utf8')).toContain(devRoot.replace(/\\/g, '\\\\'))
  })

  it('引导文件记录 previousRoot 时空目标优先从上一个数据根复制', () => {
    const root = temporaryDirectory()
    const userData = join(root, 'user-data')
    mkdirSync(userData, { recursive: true })
    const devRoot = `${userData}-dev`
    mkdirSync(devRoot, { recursive: true })
    writeFileSync(join(devRoot, 'trade-watch.db'), 'stale-default-data')
    const previousRoot = join(root, 'custom-a')
    mkdirSync(previousRoot, { recursive: true })
    writeFileSync(join(previousRoot, 'trade-watch.db'), 'current-data')
    const target = join(root, 'custom-b')
    writeDataRootOverride(userData, target, previousRoot)
    const host = appHost({ packaged: false, userData, exe: join(root, 'electron.exe') })

    const result = configureApplicationDataPaths(host, 'win32', undefined)

    expect(result.pendingMigration).toBe(true)
    expect(result.override).toEqual({ target, source: 'file', previousRoot })
    applyDeferredDataRootMigration()
    expect(readFileSync(join(target, 'trade-watch.db'), 'utf8')).toBe('current-data')
  })

  it('环境变量优先于引导文件且无迁移需求时立即生效', () => {
    const root = temporaryDirectory()
    const userData = join(root, 'user-data')
    mkdirSync(userData, { recursive: true })
    writeDataRootOverride(userData, join(root, 'file-target'))
    const envTarget = join(root, 'env-target')
    const host = appHost({ packaged: false, userData, exe: join(root, 'electron.exe') })

    const result = configureApplicationDataPaths(host, 'win32', envTarget)

    expect(result.override).toEqual({ target: envTarget, source: 'env', previousRoot: null })
    expect(result.dataRoot).toBe(envTarget)
    expect(result.pendingMigration).toBe(false)
    expect(hasPendingDataRootMigration()).toBe(false)
    expect(host.paths.get('userData')).toBe(envTarget)
    expect(existsSync(join(root, 'file-target'))).toBe(false)
  })

  it('引导文件损坏时退回默认 dev 目录启动', () => {
    const root = temporaryDirectory()
    const userData = join(root, 'user-data')
    mkdirSync(userData, { recursive: true })
    writeFileSync(join(userData, DATA_ROOT_OVERRIDE_FILE), 'not-json')
    const host = appHost({ packaged: false, userData, exe: join(root, 'electron.exe') })

    const result = configureApplicationDataPaths(host, 'win32', undefined)

    expect(result.dataRoot).toBe(`${userData}-dev`)
    expect(result.override).toBeNull()
    expect(result.pendingMigration).toBe(false)
  })

  it('安装版无 override 时行为与现状一致', () => {
    const root = temporaryDirectory()
    const installDirectory = join(root, 'installed')
    mkdirSync(installDirectory)
    const host = appHost({ packaged: true, userData: join(root, 'legacy'), exe: join(installDirectory, 'trade-watch.exe') })

    const result = configureApplicationDataPaths(host, 'win32', undefined)

    expect(result.dataRoot).toBe(join(installDirectory, 'data'))
    expect(result.override).toBeNull()
    expect(result.pendingMigration).toBe(false)
  })
})
