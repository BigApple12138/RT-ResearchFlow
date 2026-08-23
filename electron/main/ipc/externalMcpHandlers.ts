import { ipcMain } from 'electron'
import { getDb } from '../database/db'
import {
  deleteExternalMcpServer,
  ExternalMcpRepositoryError,
  listExternalMcpServers,
  saveExternalMcpServer,
  setExternalMcpServerEnabled,
  type ExternalMcpSaveInput,
  type ExternalMcpServerView,
  type ExternalMcpToolSummary,
} from '../database/externalMcpRepository'
import {
  testExternalMcpServer,
  type ExternalMcpTestResult,
} from '../services/externalMcpClientService'

export type ExternalMcpApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; message: string }

export type ExternalMcpSaveRequest = ExternalMcpSaveInput

export interface ExternalMcpIdRequest {
  id: string
}

export interface ExternalMcpSetEnabledRequest {
  id: string
  enabled: boolean
}

export type ExternalMcpTestResponse = ExternalMcpTestResult

export function registerExternalMcpHandlers(): void {
  ipcMain.handle('externalMcp:listServers', () =>
    safeResult(() => listExternalMcpServers(getDb())),
  )

  ipcMain.handle('externalMcp:saveServer', (_event, payload: unknown) =>
    safeResult(() => saveExternalMcpServer(getDb(), parseSaveRequest(payload))),
  )

  ipcMain.handle('externalMcp:deleteServer', (_event, payload: unknown) =>
    safeResult(() => {
      const { id } = parseIdRequest(payload)
      const deleted = deleteExternalMcpServer(getDb(), id)
      if (!deleted) {
        throw new ExternalMcpRepositoryError('NOT_FOUND', '外部 MCP 服务器不存在')
      }
      return { id }
    }),
  )

  ipcMain.handle('externalMcp:setEnabled', (_event, payload: unknown) =>
    safeResult(() => {
      const input = parseSetEnabledRequest(payload)
      return setExternalMcpServerEnabled(getDb(), input.id, input.enabled)
    }),
  )

  ipcMain.handle('externalMcp:testServer', async (_event, payload: unknown) =>
    safeResultAsync(async () => {
      const { id } = parseIdRequest(payload)
      return testExternalMcpServer(getDb(), id)
    }),
  )
}

function parseSaveRequest(payload: unknown): ExternalMcpSaveRequest {
  if (!isRecord(payload)) {
    throw new ExternalMcpRepositoryError('INVALID_INPUT', '请求无效')
  }
  const name = requireString(payload.name, 'name')
  const command = requireString(payload.command, 'command')
  const request: ExternalMcpSaveRequest = { name, command }

  if (payload.id !== undefined) {
    request.id = requireString(payload.id, 'id')
  }
  if (payload.enabled !== undefined) {
    if (typeof payload.enabled !== 'boolean') {
      throw new ExternalMcpRepositoryError('INVALID_INPUT', 'enabled 必须是布尔值')
    }
    request.enabled = payload.enabled
  }
  if (payload.args !== undefined) {
    if (!Array.isArray(payload.args) || payload.args.some((item) => typeof item !== 'string')) {
      throw new ExternalMcpRepositoryError('INVALID_INPUT', 'args 必须是字符串数组')
    }
    request.args = payload.args as string[]
  }
  if (payload.cwd !== undefined) {
    if (payload.cwd !== null && typeof payload.cwd !== 'string') {
      throw new ExternalMcpRepositoryError('INVALID_INPUT', 'cwd 无效')
    }
    request.cwd = payload.cwd as string | null
  }
  if (payload.env !== undefined) {
    if (payload.env === null) {
      request.env = null
    } else if (!isRecord(payload.env)) {
      throw new ExternalMcpRepositoryError('INVALID_INPUT', 'env 必须是对象或 null')
    } else {
      const env: Record<string, string> = {}
      for (const [key, value] of Object.entries(payload.env)) {
        if (typeof value !== 'string') {
          throw new ExternalMcpRepositoryError('INVALID_INPUT', `env.${key} 必须是字符串`)
        }
        env[key] = value
      }
      request.env = env
    }
  }
  return request
}

function parseIdRequest(payload: unknown): ExternalMcpIdRequest {
  if (!isRecord(payload) || typeof payload.id !== 'string' || !payload.id.trim()) {
    throw new ExternalMcpRepositoryError('INVALID_INPUT', 'id 无效')
  }
  return { id: payload.id.trim() }
}

function parseSetEnabledRequest(payload: unknown): ExternalMcpSetEnabledRequest {
  const { id } = parseIdRequest(payload)
  if (!isRecord(payload) || typeof payload.enabled !== 'boolean') {
    throw new ExternalMcpRepositoryError('INVALID_INPUT', 'enabled 必须是布尔值')
  }
  return { id, enabled: payload.enabled }
}

function safeResult<T>(fn: () => T): ExternalMcpApiResult<T> {
  try {
    return { ok: true, data: fn() }
  } catch (error) {
    return toErrorResult(error)
  }
}

async function safeResultAsync<T>(fn: () => Promise<T>): Promise<ExternalMcpApiResult<T>> {
  try {
    return { ok: true, data: await fn() }
  } catch (error) {
    return toErrorResult(error)
  }
}

function toErrorResult(error: unknown): ExternalMcpApiResult<never> {
  if (error instanceof ExternalMcpRepositoryError) {
    return { ok: false, error: error.code, message: error.message }
  }
  const message = error instanceof Error ? error.message : String(error)
  return { ok: false, error: 'INTERNAL_ERROR', message }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ExternalMcpRepositoryError('INVALID_INPUT', `${field} 无效`)
  }
  return value.trim()
}

export type { ExternalMcpServerView, ExternalMcpToolSummary }
