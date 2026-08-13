import { dialog, ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from 'electron'
import {
  ApplicationDataPathError,
  type ApplicationDataMode,
  type DataRootOverrideSource,
  classifyDataRootTarget,
  clearDataRootOverride,
  getApplicationDataPathResult,
  validateCustomDataRootTarget,
  writeDataRootOverride,
} from '../services/applicationDataPathService'

export interface DataRootStatusView {
  currentRoot: string
  mode: ApplicationDataMode
  overrideTarget: string | null
  overrideSource: DataRootOverrideSource | null
  canRestoreDefault: boolean
}

export type DataRootStatusResponse =
  | { ok: true; data: DataRootStatusView }
  | { ok: false; error: string; message: string }

export type DataRootSelectResponse =
  | { ok: true; data: string | null }
  | { ok: false; error: string; message: string }

export type DataRootActionResponse =
  | { ok: true; data: { requiresRestart: true } }
  | { ok: false; error: string; message: string }

const NOT_READY: { ok: false; error: string; message: string } = {
  ok: false,
  error: 'DATA_ROOT_NOT_READY',
  message: '数据目录尚未初始化完成',
}

const UNAUTHORIZED: { ok: false; error: string; message: string } = {
  ok: false,
  error: 'UNAUTHORIZED',
  message: '未授权的调用来源',
}

function failureFromError(
  error: unknown,
  fallbackMessage: string,
): { error: string; message: string } {
  if (error instanceof ApplicationDataPathError) {
    return { error: error.code, message: error.message }
  }
  return { error: 'DATA_ROOT_ERROR', message: fallbackMessage }
}

export function registerDataRootHandlers(getMainWindow: () => BrowserWindow | null): void {
  const authorized = (event: IpcMainInvokeEvent): boolean => {
    const mainWindow = getMainWindow()
    return mainWindow !== null && event.sender === mainWindow.webContents
  }

  ipcMain.handle('dataRoot:getStatus', (event): DataRootStatusResponse => {
    if (!authorized(event)) return UNAUTHORIZED
    const result = getApplicationDataPathResult()
    if (!result) return NOT_READY
    return {
      ok: true,
      data: {
        currentRoot: result.dataRoot,
        mode: result.mode,
        overrideTarget: result.override?.target ?? null,
        overrideSource: result.override?.source ?? null,
        canRestoreDefault: result.override?.source === 'file',
      },
    }
  })

  ipcMain.handle('dataRoot:selectDirectory', async (event): Promise<DataRootSelectResponse> => {
    if (!authorized(event)) return UNAUTHORIZED
    const mainWindow = getMainWindow()
    if (!mainWindow) return UNAUTHORIZED
    try {
      const selection = await dialog.showOpenDialog(mainWindow, {
        title: '选择新的数据目录',
        properties: ['openDirectory', 'createDirectory'],
      })
      if (selection.canceled || selection.filePaths.length === 0) return { ok: true, data: null }
      return { ok: true, data: selection.filePaths[0] }
    } catch (error) {
      console.error('[dataRoot:selectDirectory] failed:', error)
      return { ok: false, error: 'SELECT_DIRECTORY_FAILED', message: '打开目录选择对话框失败' }
    }
  })

  ipcMain.handle('dataRoot:setCustomRoot', (event, path: unknown): DataRootActionResponse => {
    if (!authorized(event)) return UNAUTHORIZED
    const result = getApplicationDataPathResult()
    if (!result) return NOT_READY
    try {
      const target = validateCustomDataRootTarget(path)
      if (target === result.dataRoot) {
        return {
          ok: false,
          error: 'DATA_ROOT_SAME_AS_CURRENT',
          message: '所选目录与当前数据目录相同，无需更改',
        }
      }
      const classification = classifyDataRootTarget(target)
      if (classification === 'conflict') {
        return {
          ok: false,
          error: 'DATA_DIRECTORY_CONFLICT',
          message: `目标目录包含未知文件，为避免覆盖已停止：${target}`,
        }
      }
      // 记录当前在用的数据根：下次重启若需复制，从真正在用的根而非模式默认根迁移。
      writeDataRootOverride(result.legacyUserDataPath, target, result.dataRoot)
      return { ok: true, data: { requiresRestart: true } }
    } catch (error) {
      console.error('[dataRoot:setCustomRoot] failed:', error)
      const failure = failureFromError(error, '设置数据目录失败')
      return { ok: false, error: failure.error, message: failure.message }
    }
  })

  ipcMain.handle('dataRoot:clearOverride', (event): DataRootActionResponse => {
    if (!authorized(event)) return UNAUTHORIZED
    const result = getApplicationDataPathResult()
    if (!result) return NOT_READY
    if (result.override?.source === 'env') {
      return {
        ok: false,
        error: 'DATA_ROOT_ENV_LOCKED',
        message: '数据目录当前由环境变量 RT_DATA_ROOT 指定，请修改环境变量后重启',
      }
    }
    try {
      clearDataRootOverride(result.legacyUserDataPath)
      return { ok: true, data: { requiresRestart: true } }
    } catch (error) {
      console.error('[dataRoot:clearOverride] failed:', error)
      return { ok: false, error: 'DATA_ROOT_ERROR', message: '恢复默认数据目录失败' }
    }
  })
}
