import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import {
  getDefaultEnvironment,
  StdioClientTransport,
} from '@modelcontextprotocol/sdk/client/stdio.js'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import type Database from 'better-sqlite3'
import {
  decryptExternalMcpEnv,
  ExternalMcpRepositoryError,
  getExternalMcpServer,
  parseArgsJson,
  updateExternalMcpTestResult,
  type ExternalMcpToolSummary,
} from '../database/externalMcpRepository'

export const EXTERNAL_MCP_DEFAULT_TIMEOUT_MS = 15_000

export interface ExternalMcpStdioParams {
  command: string
  args: string[]
  env: Record<string, string>
  cwd?: string
}

export type ExternalMcpTransportFactory = (params: ExternalMcpStdioParams) => Transport

export interface ExternalMcpTestResult {
  ok: boolean
  tools: ExternalMcpToolSummary[]
  error?: { code: string; message: string }
}

export interface ExternalMcpClientOptions {
  transportFactory?: ExternalMcpTransportFactory
  timeoutMs?: number
  now?: number
}

const defaultTransportFactory: ExternalMcpTransportFactory = (params) =>
  new StdioClientTransport({
    command: params.command,
    args: params.args,
    env: { ...getDefaultEnvironment(), ...params.env },
    cwd: params.cwd,
    stderr: 'pipe',
  })

export async function testExternalMcpServer(
  db: Database.Database,
  serverId: string,
  options: ExternalMcpClientOptions = {},
): Promise<ExternalMcpTestResult> {
  return listExternalMcpTools(db, serverId, options)
}

export async function listExternalMcpTools(
  db: Database.Database,
  serverId: string,
  options: ExternalMcpClientOptions = {},
): Promise<ExternalMcpTestResult> {
  const row = getExternalMcpServer(db, serverId)
  if (!row) {
    return {
      ok: false,
      tools: [],
      error: { code: 'NOT_FOUND', message: '外部 MCP 服务器不存在' },
    }
  }

  const timeoutMs = options.timeoutMs ?? EXTERNAL_MCP_DEFAULT_TIMEOUT_MS
  const now = options.now ?? Date.now()

  try {
    const listed = await withExternalMcpClient(db, serverId, options, async (client) =>
      withTimeout(client.listTools(), timeoutMs, 'TIMEOUT'),
    )
    const tools = (listed.tools ?? []).map((tool) => ({
      name: tool.name,
      ...(tool.description ? { description: tool.description } : {}),
    }))
    updateExternalMcpTestResult(db, {
      id: serverId,
      ok: true,
      tools,
      now,
    })
    return { ok: true, tools }
  } catch (error) {
    const mapped = mapError(error, 'CONNECT_FAILED')
    if (mapped.code === 'NOT_FOUND') {
      return { ok: false, tools: [], error: mapped }
    }
    updateExternalMcpTestResult(db, {
      id: serverId,
      ok: false,
      errorCode: mapped.code,
      now,
    })
    return { ok: false, tools: [], error: mapped }
  }
}

export interface ExternalMcpCallToolResult {
  ok: boolean
  /** MCP CallToolResult 原文（已截断前）；失败时为错误信息对象 */
  result?: unknown
  error?: { code: string; message: string }
  serverId: string
  toolName: string
}

const MCP_IS_ERROR_MESSAGE_MAX = 300

/** 从 MCP callTool 结果抽取 isError 可读摘要（单测可直接调用）。 */
export function formatMcpToolIsErrorMessage(result: unknown, maxLen = MCP_IS_ERROR_MESSAGE_MAX): string {
  const chunks: string[] = []
  if (result && typeof result === 'object') {
    const content = (result as { content?: unknown }).content
    if (Array.isArray(content)) {
      for (const item of content) {
        if (!item || typeof item !== 'object') continue
        const text = (item as { text?: unknown }).text
        if (typeof text === 'string' && text.trim()) chunks.push(text.trim())
      }
    }
    const topText = (result as { text?: unknown }).text
    if (typeof topText === 'string' && topText.trim()) chunks.push(topText.trim())
  }
  const joined = chunks.join(' ').replace(/\s+/g, ' ').trim()
  if (!joined) return 'MCP tool 返回 isError'
  const clipped = joined.length > maxLen ? `${joined.slice(0, maxLen)}…` : joined
  return `MCP tool 返回 isError：${clipped}`
}

/**
 * 主进程调用已配置服务器上的单个 MCP tool（短连：connect → callTool → close）。
 * Renderer 禁止直连；禁用服务器仍可在本函数层被上层白名单挡住。
 */
export async function callExternalMcpTool(
  db: Database.Database,
  serverId: string,
  toolName: string,
  toolArgs: Record<string, unknown> = {},
  options: ExternalMcpClientOptions = {},
): Promise<ExternalMcpCallToolResult> {
  const name = toolName.trim()
  if (!name) {
    return {
      ok: false,
      serverId,
      toolName,
      error: { code: 'INVALID_TOOL', message: 'toolName 不能为空' },
    }
  }

  const timeoutMs = options.timeoutMs ?? EXTERNAL_MCP_DEFAULT_TIMEOUT_MS

  try {
    const result = await withExternalMcpClient(db, serverId, options, async (client) =>
      withTimeout(
        client.callTool({ name, arguments: toolArgs }),
        timeoutMs,
        'TIMEOUT',
      ),
    )
    const isError = Boolean(result && typeof result === 'object' && 'isError' in result && (result as { isError?: boolean }).isError)
    return {
      ok: !isError,
      result,
      serverId,
      toolName: name,
      ...(isError
        ? { error: { code: 'TOOL_ERROR', message: formatMcpToolIsErrorMessage(result) } }
        : {}),
    }
  } catch (error) {
    const mapped = mapError(error, 'CALL_FAILED')
    return { ok: false, serverId, toolName: name, error: mapped }
  }
}

async function withExternalMcpClient<T>(
  db: Database.Database,
  serverId: string,
  options: ExternalMcpClientOptions,
  run: (client: Client) => Promise<T>,
): Promise<T> {
  const row = getExternalMcpServer(db, serverId)
  if (!row) {
    throw Object.assign(new Error('外部 MCP 服务器不存在'), { code: 'NOT_FOUND' })
  }

  const timeoutMs = options.timeoutMs ?? EXTERNAL_MCP_DEFAULT_TIMEOUT_MS
  const factory = options.transportFactory ?? defaultTransportFactory

  let env: Record<string, string>
  try {
    env = decryptExternalMcpEnv(row.env_encrypted)
  } catch (error) {
    throw Object.assign(
      error instanceof Error ? error : new Error(String(error)),
      { code: mapError(error, 'DECRYPT_FAILED').code },
    )
  }

  const args = parseArgsJson(row.args_json)
  const transport = factory({
    command: row.command,
    args,
    env,
    cwd: row.cwd ?? undefined,
  })

  const client = new Client(
    { name: 'rt-research-flow-external-mcp', version: '1.0.0' },
    { capabilities: {} },
  )

  try {
    await withTimeout(client.connect(transport), timeoutMs, 'TIMEOUT')
    return await run(client)
  } finally {
    try {
      await client.close()
    } catch {
      // ignore close errors after connect/call failure
    }
  }
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  code: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(Object.assign(new Error('连接超时'), { code }))
        }, timeoutMs)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

function mapError(
  error: unknown,
  fallbackCode: string,
): { code: string; message: string } {
  if (error instanceof ExternalMcpRepositoryError) {
    return { code: error.code, message: error.message }
  }
  if (error && typeof error === 'object' && 'code' in error) {
    const code = String((error as { code?: unknown }).code ?? fallbackCode)
    const message = error instanceof Error ? error.message : String(error)
    return { code: code || fallbackCode, message }
  }
  if (error instanceof Error) {
    return { code: fallbackCode, message: error.message }
  }
  return { code: fallbackCode, message: String(error) }
}
