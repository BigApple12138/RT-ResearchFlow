import type Database from 'better-sqlite3'
import { randomUUID } from 'crypto'
import { decryptApiKey, encryptApiKey } from '../utils/apiKeyEncryption'

export type ExternalMcpTransport = 'stdio'

export interface ExternalMcpToolSummary {
  name: string
  description?: string
}

/** Renderer-safe view: never includes env plaintext. */
export interface ExternalMcpServerView {
  id: string
  name: string
  enabled: boolean
  transport: ExternalMcpTransport
  command: string
  args: string[]
  cwd: string | null
  hasEnv: boolean
  lastTestedAt: number | null
  lastErrorCode: string | null
  lastTools: ExternalMcpToolSummary[] | null
  createdAt: number
  updatedAt: number
}

export interface ExternalMcpServerRow {
  id: string
  name: string
  enabled: number
  transport: ExternalMcpTransport
  command: string
  args_json: string
  env_encrypted: Buffer | null
  cwd: string | null
  last_tested_at: number | null
  last_error_code: string | null
  last_tools_json: string | null
  created_at: number
  updated_at: number
}

export interface ExternalMcpSaveInput {
  id?: string
  name: string
  enabled?: boolean
  command: string
  args?: string[]
  cwd?: string | null
  /**
   * Plain env only at write time.
   * - undefined: keep existing encrypted env on update
   * - null or {}: clear env
   * - object: encrypt and replace
   */
  env?: Record<string, string> | null
  now?: number
}

export class ExternalMcpRepositoryError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'ExternalMcpRepositoryError'
  }
}

const NAME_MAX = 120
const COMMAND_MAX = 1024
const CWD_MAX = 1024
const ARGS_JSON_MAX = 8192
const TOOLS_JSON_MAX = 65536

export function listExternalMcpServers(db: Database.Database): ExternalMcpServerView[] {
  const rows = db
    .prepare(
      `SELECT * FROM external_mcp_servers
       ORDER BY updated_at DESC, created_at DESC`,
    )
    .all() as ExternalMcpServerRow[]
  return rows.map(toView)
}

export function getExternalMcpServer(
  db: Database.Database,
  id: string,
): ExternalMcpServerRow | null {
  const row = db
    .prepare('SELECT * FROM external_mcp_servers WHERE id = ?')
    .get(id) as ExternalMcpServerRow | undefined
  return row ?? null
}

export function getExternalMcpServerView(
  db: Database.Database,
  id: string,
): ExternalMcpServerView | null {
  const row = getExternalMcpServer(db, id)
  return row ? toView(row) : null
}

export function saveExternalMcpServer(
  db: Database.Database,
  input: ExternalMcpSaveInput,
): ExternalMcpServerView {
  const now = input.now ?? Date.now()
  const name = normalizeName(input.name)
  const command = normalizeCommand(input.command)
  const args = normalizeArgs(input.args ?? [])
  const argsJson = JSON.stringify(args)
  if (argsJson.length > ARGS_JSON_MAX) {
    throw new ExternalMcpRepositoryError('INVALID_ARGS', 'args 过长')
  }
  const cwd = normalizeCwd(input.cwd)

  if (input.id) {
    const existing = getExternalMcpServer(db, input.id)
    if (!existing) {
      throw new ExternalMcpRepositoryError('NOT_FOUND', '外部 MCP 服务器不存在')
    }
    const envEncrypted = resolveEnvEncrypted(existing.env_encrypted, input.env)
    const enabled = input.enabled === undefined ? existing.enabled : input.enabled ? 1 : 0
    db.prepare(
      `UPDATE external_mcp_servers SET
         name = ?, enabled = ?, command = ?, args_json = ?, env_encrypted = ?, cwd = ?, updated_at = ?
       WHERE id = ?`,
    ).run(name, enabled, command, argsJson, envEncrypted, cwd, now, input.id)
    return getExternalMcpServerView(db, input.id)!
  }

  const id = randomUUID()
  const envEncrypted = resolveEnvEncrypted(null, input.env === undefined ? null : input.env)
  const enabled = input.enabled === false ? 0 : 1
  db.prepare(
    `INSERT INTO external_mcp_servers (
       id, name, enabled, transport, command, args_json, env_encrypted, cwd,
       last_tested_at, last_error_code, last_tools_json, created_at, updated_at
     ) VALUES (?, ?, ?, 'stdio', ?, ?, ?, ?, NULL, NULL, NULL, ?, ?)`,
  ).run(id, name, enabled, command, argsJson, envEncrypted, cwd, now, now)
  return getExternalMcpServerView(db, id)!
}

export function deleteExternalMcpServer(db: Database.Database, id: string): boolean {
  const result = db.prepare('DELETE FROM external_mcp_servers WHERE id = ?').run(id)
  return result.changes > 0
}

export function setExternalMcpServerEnabled(
  db: Database.Database,
  id: string,
  enabled: boolean,
  now = Date.now(),
): ExternalMcpServerView {
  const existing = getExternalMcpServer(db, id)
  if (!existing) {
    throw new ExternalMcpRepositoryError('NOT_FOUND', '外部 MCP 服务器不存在')
  }
  db.prepare(
    'UPDATE external_mcp_servers SET enabled = ?, updated_at = ? WHERE id = ?',
  ).run(enabled ? 1 : 0, now, id)
  return getExternalMcpServerView(db, id)!
}

export function updateExternalMcpTestResult(
  db: Database.Database,
  input: {
    id: string
    ok: boolean
    tools?: ExternalMcpToolSummary[]
    errorCode?: string | null
    now?: number
  },
): ExternalMcpServerView {
  const existing = getExternalMcpServer(db, input.id)
  if (!existing) {
    throw new ExternalMcpRepositoryError('NOT_FOUND', '外部 MCP 服务器不存在')
  }
  const now = input.now ?? Date.now()
  const toolsJson = input.ok
    ? JSON.stringify(summarizeTools(input.tools ?? []))
    : existing.last_tools_json
  if (toolsJson != null && toolsJson.length > TOOLS_JSON_MAX) {
    throw new ExternalMcpRepositoryError('INVALID_TOOLS', 'tools 缓存过长')
  }
  const errorCode = input.ok ? null : truncateErrorCode(input.errorCode ?? 'CONNECT_FAILED')
  db.prepare(
    `UPDATE external_mcp_servers SET
       last_tested_at = ?, last_error_code = ?, last_tools_json = ?, updated_at = ?
     WHERE id = ?`,
  ).run(now, errorCode, toolsJson, now, input.id)
  return getExternalMcpServerView(db, input.id)!
}

/** Decrypt env for main-process stdio spawn only. Never send to Renderer. */
export function decryptExternalMcpEnv(envEncrypted: Buffer | null): Record<string, string> {
  if (!envEncrypted || envEncrypted.length === 0) return {}
  const plaintext = decryptApiKey(envEncrypted)
  if (plaintext == null) {
    throw new ExternalMcpRepositoryError('DECRYPT_FAILED', '无法解密环境变量')
  }
  return parseEnvObject(plaintext)
}

export function parseArgsJson(raw: string): string[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new ExternalMcpRepositoryError('INVALID_ARGS', 'args_json 不是合法 JSON')
  }
  return normalizeArgs(parsed)
}

function toView(row: ExternalMcpServerRow): ExternalMcpServerView {
  return {
    id: row.id,
    name: row.name,
    enabled: row.enabled === 1,
    transport: row.transport,
    command: row.command,
    args: parseArgsJson(row.args_json),
    cwd: row.cwd,
    hasEnv: Boolean(row.env_encrypted && row.env_encrypted.length > 0),
    lastTestedAt: row.last_tested_at,
    lastErrorCode: row.last_error_code,
    lastTools: parseToolsJson(row.last_tools_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function resolveEnvEncrypted(
  existing: Buffer | null,
  env: Record<string, string> | null | undefined,
): Buffer | null {
  if (env === undefined) return existing
  if (env == null || Object.keys(env).length === 0) return null
  const normalized = normalizeEnv(env)
  const encrypted = encryptApiKey(JSON.stringify(normalized))
  if (!encrypted) {
    throw new ExternalMcpRepositoryError('ENCRYPTION_UNAVAILABLE', '系统加密不可用，无法保存环境变量')
  }
  return encrypted
}

function normalizeName(name: string): string {
  const trimmed = name.trim()
  if (!trimmed || trimmed.length > NAME_MAX) {
    throw new ExternalMcpRepositoryError('INVALID_NAME', '名称无效')
  }
  return trimmed
}

function normalizeCommand(command: string): string {
  const trimmed = command.trim()
  if (!trimmed || trimmed.length > COMMAND_MAX) {
    throw new ExternalMcpRepositoryError('INVALID_COMMAND', 'command 无效')
  }
  if (/[\r\n]/.test(trimmed)) {
    throw new ExternalMcpRepositoryError('INVALID_COMMAND', 'command 不能包含换行')
  }
  return trimmed
}

function normalizeArgs(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new ExternalMcpRepositoryError('INVALID_ARGS', 'args 必须是字符串数组')
  }
  return value.map((item, index) => {
    if (typeof item !== 'string') {
      throw new ExternalMcpRepositoryError('INVALID_ARGS', `args[${index}] 必须是字符串`)
    }
    if (/[\r\n]/.test(item)) {
      throw new ExternalMcpRepositoryError('INVALID_ARGS', `args[${index}] 不能包含换行`)
    }
    return item
  })
}

function normalizeCwd(cwd: string | null | undefined): string | null {
  if (cwd == null || cwd.trim() === '') return null
  const trimmed = cwd.trim()
  if (trimmed.length > CWD_MAX) {
    throw new ExternalMcpRepositoryError('INVALID_CWD', 'cwd 过长')
  }
  if (/[\r\n]/.test(trimmed)) {
    throw new ExternalMcpRepositoryError('INVALID_CWD', 'cwd 不能包含换行')
  }
  return trimmed
}

function normalizeEnv(env: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(env)) {
    if (typeof key !== 'string' || !key.trim()) {
      throw new ExternalMcpRepositoryError('INVALID_ENV', '环境变量名无效')
    }
    if (typeof value !== 'string') {
      throw new ExternalMcpRepositoryError('INVALID_ENV', `环境变量 ${key} 的值必须是字符串`)
    }
    out[key] = value
  }
  return out
}

function parseEnvObject(plaintext: string): Record<string, string> {
  let parsed: unknown
  try {
    parsed = JSON.parse(plaintext)
  } catch {
    throw new ExternalMcpRepositoryError('INVALID_ENV', '环境变量密文不是合法 JSON')
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ExternalMcpRepositoryError('INVALID_ENV', '环境变量必须是对象')
  }
  return normalizeEnv(parsed as Record<string, string>)
}

function summarizeTools(tools: ExternalMcpToolSummary[]): ExternalMcpToolSummary[] {
  return tools.slice(0, 500).map((tool) => ({
    name: String(tool.name).slice(0, 200),
    ...(tool.description
      ? { description: String(tool.description).slice(0, 500) }
      : {}),
  }))
}

function parseToolsJson(raw: string | null): ExternalMcpToolSummary[] | null {
  if (raw == null) return null
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return null
    return parsed
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
      .map((item) => ({
        name: String(item.name ?? ''),
        ...(typeof item.description === 'string' ? { description: item.description } : {}),
      }))
      .filter((item) => item.name.length > 0)
  } catch {
    return null
  }
}

function truncateErrorCode(code: string): string {
  return code.slice(0, 64)
}
