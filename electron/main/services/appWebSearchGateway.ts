/**
 * 本应用联网搜索网关。
 *
 * 闸门矩阵（勿与「允许 Agent 联网」混用）：
 * - runAppWebSearch / 观察池补充分类 / 产业研究回退检索 / 深度研究 web.search：只看 research_web_search_config
 * - AI 分析 Agent Hub 的 network Tool（含 mcp__ 投影、research.deep_start）：看 ai_agent_network_enabled
 * - 深度研究 mcp.invoke（任意外部 MCP）：看 ai_agent_network_enabled（与搜索通道无关）
 */
import type Database from 'better-sqlite3'
import { decryptApiKey, encryptApiKey } from '../utils/apiKeyEncryption'
import {
  getResearchWebSearchConfig,
  saveResearchWebSearchConfig,
} from '../database/industryResearchGenerationRepository'
import type { ResearchWebSearchProviderId } from '../database/types'
import { getExternalMcpServer } from '../database/externalMcpRepository'
import {
  callExternalMcpTool,
  EXTERNAL_MCP_DEFAULT_TIMEOUT_MS,
} from './externalMcpClientService'
import { runWebSearch, searchWithBuiltinWebTool, validateWebSearchProvider } from './researchToolRuntime/searchProviders'
import type { ResearchSearchHit } from './researchToolRuntime/types'

export const APP_WEB_SEARCH_DEFAULT_TIMEOUT_MS = 8_000
export const APP_WEB_SEARCH_MCP_TIMEOUT_MS = EXTERNAL_MCP_DEFAULT_TIMEOUT_MS

export class AppWebSearchError extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.name = 'AppWebSearchError'
    this.code = code
  }
}

export interface AppWebSearchConfigView {
  providerId: ResearchWebSearchProviderId
  enabled: boolean
  hasApiKey: boolean
  baseUrl: string | null
  mcpServerId: string | null
  mcpToolName: string | null
  lastValidatedAt: number | null
  lastErrorCode: string | null
}

const API_PROVIDERS = new Set<ResearchWebSearchProviderId>([
  'tavily',
  'bing',
  'custom_openai_compatible_search',
])

export function getAppWebSearchConfigView(db: Database.Database): AppWebSearchConfigView {
  const row = getResearchWebSearchConfig(db)
  if (!row) {
    return {
      providerId: 'tavily',
      enabled: false,
      hasApiKey: false,
      baseUrl: null,
      mcpServerId: null,
      mcpToolName: null,
      lastValidatedAt: null,
      lastErrorCode: null,
    }
  }
  return {
    providerId: row.provider_id,
    enabled: row.enabled === 1,
    hasApiKey: Boolean(row.api_key_encrypted && row.api_key_encrypted.length > 0),
    baseUrl: row.base_url,
    mcpServerId: row.mcp_server_id ?? null,
    mcpToolName: row.mcp_tool_name ?? null,
    lastValidatedAt: row.last_validated_at,
    lastErrorCode: row.last_error_code,
  }
}

/**
 * 本应用联网搜索是否已启用且通道可解析。
 * 与「允许 Agent 联网」无关（观察池补充分类 / 深度研究回退 / runAppWebSearch 只看本函数）。
 */
export function isAppWebSearchConfigured(db: Database.Database): boolean {
  const row = getResearchWebSearchConfig(db)
  if (!row || row.enabled !== 1) return false
  if (row.provider_id === 'builtin_web') return true
  if (row.provider_id === 'external_mcp') {
    const serverId = row.mcp_server_id?.trim()
    const toolName = row.mcp_tool_name?.trim()
    if (!serverId || !toolName) return false
    const server = getExternalMcpServer(db, serverId)
    return Boolean(server && server.enabled === 1)
  }
  return Boolean(row.api_key_encrypted && row.api_key_encrypted.length > 0)
}

export function saveAppWebSearchConfig(
  db: Database.Database,
  input: {
    providerId: ResearchWebSearchProviderId
    enabled: boolean
    apiKey?: string | null
    baseUrl?: string | null
    mcpServerId?: string | null
    mcpToolName?: string | null
  },
): AppWebSearchConfigView {
  assertSaveInput(db, input)

  let apiKeyEncrypted: Buffer | null | undefined
  let clearApiKey = false
  if (input.providerId === 'builtin_web' || input.providerId === 'external_mcp') {
    clearApiKey = true
  } else if (input.apiKey === null) {
    clearApiKey = true
  } else if (typeof input.apiKey === 'string' && input.apiKey.trim()) {
    apiKeyEncrypted = encryptApiKey(input.apiKey.trim())
    if (!apiKeyEncrypted) {
      throw new AppWebSearchError('WEB_SEARCH_PROVIDER_FAILED', '当前环境无法安全保存搜索密钥')
    }
  }

  const baseUrl = input.providerId === 'custom_openai_compatible_search'
    ? (input.baseUrl ?? null)
    : null
  const mcpServerId = input.providerId === 'external_mcp' ? (input.mcpServerId ?? null) : null
  const mcpToolName = input.providerId === 'external_mcp' ? (input.mcpToolName ?? null) : null

  saveResearchWebSearchConfig(db, {
    providerId: input.providerId,
    enabled: input.enabled,
    apiKeyEncrypted,
    clearApiKey,
    baseUrl,
    mcpServerId,
    mcpToolName,
  })
  return getAppWebSearchConfigView(db)
}

export async function validateAppWebSearch(db: Database.Database): Promise<{ ok: true; validatedAt: number }> {
  const config = getResearchWebSearchConfig(db)
  if (!config || config.enabled !== 1) {
    throw new AppWebSearchError(
      'WEB_SEARCH_NOT_CONFIGURED',
      '尚未启用本应用联网搜索，请到配置中心 → Agent → 本应用联网搜索',
    )
  }
  try {
    await runAppWebSearch(db, {
      query: 'A股 产业 研究',
      maxResults: 1,
      timeoutMs: config.provider_id === 'external_mcp'
        ? APP_WEB_SEARCH_MCP_TIMEOUT_MS
        : APP_WEB_SEARCH_DEFAULT_TIMEOUT_MS,
    })
    const validatedAt = Date.now()
    saveResearchWebSearchConfig(db, {
      providerId: config.provider_id,
      enabled: true,
      baseUrl: config.base_url,
      mcpServerId: config.mcp_server_id,
      mcpToolName: config.mcp_tool_name,
      lastValidatedAt: validatedAt,
      lastErrorCode: null,
    })
    return { ok: true, validatedAt }
  } catch (error) {
    const code = error instanceof AppWebSearchError ? error.code : 'WEB_SEARCH_PROVIDER_FAILED'
    saveResearchWebSearchConfig(db, {
      providerId: config.provider_id,
      enabled: config.enabled === 1,
      baseUrl: config.base_url,
      mcpServerId: config.mcp_server_id,
      mcpToolName: config.mcp_tool_name,
      lastErrorCode: code.slice(0, 64),
    })
    if (error instanceof AppWebSearchError) throw error
    throw new AppWebSearchError('WEB_SEARCH_PROVIDER_FAILED', '搜索服务校验失败')
  }
}

export async function runAppWebSearch(
  db: Database.Database,
  input: { query: string; maxResults?: number; timeoutMs?: number },
): Promise<ResearchSearchHit[]> {
  const query = input.query.trim()
  if (query.length < 2) {
    throw new AppWebSearchError('INVALID_QUERY', '搜索词过短')
  }
  const config = getResearchWebSearchConfig(db)
  if (!config || config.enabled !== 1) {
    throw new AppWebSearchError(
      'WEB_SEARCH_NOT_CONFIGURED',
      '尚未启用本应用联网搜索（配置中心 → Agent → 本应用联网搜索）',
    )
  }

  const maxResults = Math.min(Math.max(input.maxResults ?? 6, 1), 20)
  const providerId = config.provider_id

  if (providerId === 'builtin_web') {
    return withTimeout(
      searchWithBuiltinWebTool(query, maxResults),
      input.timeoutMs ?? APP_WEB_SEARCH_DEFAULT_TIMEOUT_MS,
    )
  }

  if (providerId === 'external_mcp') {
    return runExternalMcpSearch(db, config.mcp_server_id, config.mcp_tool_name, query, maxResults, input.timeoutMs)
  }

  if (!API_PROVIDERS.has(providerId)) {
    throw new AppWebSearchError('WEB_SEARCH_PROVIDER_FAILED', `未知搜索通道：${providerId}`)
  }
  if (!config.api_key_encrypted) {
    throw new AppWebSearchError('WEB_SEARCH_NOT_CONFIGURED', '当前通道需要 API Key')
  }
  const apiKey = decryptApiKey(config.api_key_encrypted)
  if (!apiKey) {
    throw new AppWebSearchError('WEB_SEARCH_NOT_CONFIGURED', '搜索密钥不可用')
  }

  return withTimeout(
    runWebSearch({
      providerId: providerId as 'tavily' | 'bing' | 'custom_openai_compatible_search',
      apiKey,
      baseUrl: config.base_url,
      query,
      maxResults,
      depth: 'basic',
    }),
    input.timeoutMs ?? APP_WEB_SEARCH_DEFAULT_TIMEOUT_MS,
  )
}

/** @internal exported for unit tests */
export function adaptMcpSearchResult(
  result: unknown,
  query: string,
  serverId: string,
  toolName: string,
  maxResults: number,
): ResearchSearchHit[] {
  const texts = extractMcpTextChunks(result)
  const hits: ResearchSearchHit[] = []

  for (const text of texts) {
    const parsed = tryParseJson(text)
    if (parsed) {
      hits.push(...mapJsonSearchHits(parsed, query, maxResults))
    }
  }

  if (hits.length > 0) return hits.slice(0, maxResults)

  const joined = texts.join('\n').trim()
  if (!joined) return []
  return [{
    title: joined.slice(0, 120) || `${toolName} 结果`,
    url: `mcp://${serverId}/${encodeURIComponent(toolName)}`,
    snippet: joined.slice(0, 800),
    publishedAt: null,
    providerId: 'external_mcp',
    query,
    sourceKind: 'web_search',
    isDetailPage: false,
  }]
}

function assertSaveInput(
  db: Database.Database,
  input: {
    providerId: ResearchWebSearchProviderId
    enabled: boolean
    apiKey?: string | null
    baseUrl?: string | null
    mcpServerId?: string | null
    mcpToolName?: string | null
  },
): void {
  if (input.providerId === 'external_mcp') {
    const serverId = input.mcpServerId?.trim()
    const toolName = input.mcpToolName?.trim()
    if (!serverId || !toolName) {
      throw new AppWebSearchError('INVALID_INPUT', '外部 MCP 通道须指定服务器与工具名')
    }
    const row = getExternalMcpServer(db, serverId)
    if (!row || row.enabled !== 1) {
      throw new AppWebSearchError('INVALID_INPUT', '所选外部 MCP 服务器不存在或未启用')
    }
    return
  }
  if (input.providerId === 'custom_openai_compatible_search' && !(input.baseUrl?.trim())) {
    const existing = getResearchWebSearchConfig(db)
    if (!existing?.base_url) {
      throw new AppWebSearchError('INVALID_INPUT', '自定义搜索须填写 Base URL')
    }
  }
  if (API_PROVIDERS.has(input.providerId)) {
    const existing = getResearchWebSearchConfig(db)
    const hasKey = Boolean(existing?.api_key_encrypted?.length)
    const providing = typeof input.apiKey === 'string' && input.apiKey.trim().length > 0
    if (!hasKey && !providing && input.enabled) {
      throw new AppWebSearchError('INVALID_INPUT', '启用 API 搜索通道前须配置 API Key')
    }
  }
}

async function runExternalMcpSearch(
  db: Database.Database,
  serverId: string | null,
  toolName: string | null,
  query: string,
  maxResults: number,
  timeoutMs?: number,
): Promise<ResearchSearchHit[]> {
  if (!serverId?.trim() || !toolName?.trim()) {
    throw new AppWebSearchError('WEB_SEARCH_NOT_CONFIGURED', '外部 MCP 通道未绑定服务器/工具')
  }
  const row = getExternalMcpServer(db, serverId)
  if (!row || row.enabled !== 1) {
    throw new AppWebSearchError('WEB_SEARCH_PROVIDER_FAILED', '外部 MCP 服务器未启用')
  }

  // AskEcho / 豆包搜索使用 Query；其它常见 MCP 用 query
  const toolArgs = toolName.toLowerCase().includes('search')
    ? { Query: query, Count: maxResults, SearchType: 'web' }
    : { query }

  const called = await callExternalMcpTool(
    db,
    serverId,
    toolName,
    toolArgs,
    { timeoutMs: timeoutMs ?? APP_WEB_SEARCH_MCP_TIMEOUT_MS },
  )
  if (!called.ok) {
    throw new AppWebSearchError(
      called.error?.code ?? 'WEB_SEARCH_PROVIDER_FAILED',
      called.error?.message ?? '外部 MCP 搜索失败',
    )
  }
  return adaptMcpSearchResult(called.result, query, serverId, toolName, maxResults)
}

function extractMcpTextChunks(result: unknown): string[] {
  if (!result || typeof result !== 'object') return []
  const content = (result as { content?: unknown }).content
  if (!Array.isArray(content)) {
    if (typeof (result as { text?: unknown }).text === 'string') {
      return [(result as { text: string }).text]
    }
    return [JSON.stringify(result)]
  }
  const texts: string[] = []
  for (const item of content) {
    if (!item || typeof item !== 'object') continue
    const text = (item as { text?: unknown }).text
    if (typeof text === 'string' && text.trim()) texts.push(text)
  }
  return texts
}

function tryParseJson(text: string): unknown {
  const trimmed = text.trim()
  if (!(trimmed.startsWith('{') || trimmed.startsWith('['))) return null
  try {
    return JSON.parse(trimmed)
  } catch {
    return null
  }
}

function mapJsonSearchHits(parsed: unknown, query: string, maxResults: number): ResearchSearchHit[] {
  const rows = findResultArrays(parsed)
  const hits: ResearchSearchHit[] = []
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue
    const record = row as Record<string, unknown>
    const title = stringField(record, ['title', 'Title', 'name', 'Name']) || '搜索结果'
    const url = stringField(record, ['url', 'Url', 'URL', 'link', 'Link', 'site', 'Site'])
      || `mcp://search/${encodeURIComponent(title.slice(0, 40))}`
    const snippet = stringField(record, ['snippet', 'Snippet', 'summary', 'Summary', 'content', 'Content', 'abstract', 'Abstract'])
    hits.push({
      title: title.slice(0, 300),
      url,
      snippet: snippet ? snippet.slice(0, 800) : null,
      publishedAt: stringField(record, ['publishedAt', 'published_at', 'date', 'Date']),
      providerId: 'external_mcp',
      query,
      sourceKind: 'web_search',
      isDetailPage: false,
    })
    if (hits.length >= maxResults) break
  }
  return hits
}

function findResultArrays(parsed: unknown): unknown[] {
  if (Array.isArray(parsed)) return parsed
  if (!parsed || typeof parsed !== 'object') return []
  const obj = parsed as Record<string, unknown>
  for (const key of ['results', 'Results', 'data', 'Data', 'items', 'Items', 'webPages', 'WebPages', 'value']) {
    const value = obj[key]
    if (Array.isArray(value)) return value
    if (value && typeof value === 'object' && Array.isArray((value as { value?: unknown }).value)) {
      return (value as { value: unknown[] }).value
    }
  }
  return []
}

function stringField(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(new AppWebSearchError('TIMEOUT', '联网搜索超时'))
        }, timeoutMs)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/** 兼容旧 industryResearch validate 路径（API provider 专用） */
export async function validateApiWebSearchProviderOnly(db: Database.Database): Promise<{ ok: true; validatedAt: number }> {
  const config = getResearchWebSearchConfig(db)
  if (!config || config.enabled !== 1 || !config.api_key_encrypted || !API_PROVIDERS.has(config.provider_id)) {
    return validateAppWebSearch(db)
  }
  const apiKey = decryptApiKey(config.api_key_encrypted)
  if (!apiKey) throw new AppWebSearchError('WEB_SEARCH_NOT_CONFIGURED', '搜索密钥不可用')
  try {
    await validateWebSearchProvider({
      providerId: config.provider_id as 'tavily' | 'bing' | 'custom_openai_compatible_search',
      apiKey,
      baseUrl: config.base_url,
    })
    const validatedAt = Date.now()
    saveResearchWebSearchConfig(db, {
      providerId: config.provider_id,
      enabled: true,
      baseUrl: config.base_url,
      lastValidatedAt: validatedAt,
      lastErrorCode: null,
    })
    return { ok: true, validatedAt }
  } catch {
    saveResearchWebSearchConfig(db, {
      providerId: config.provider_id,
      enabled: true,
      baseUrl: config.base_url,
      lastErrorCode: 'WEB_SEARCH_PROVIDER_FAILED',
    })
    throw new AppWebSearchError('WEB_SEARCH_PROVIDER_FAILED', '搜索服务校验失败')
  }
}
