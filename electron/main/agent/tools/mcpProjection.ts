/**
 * 外部 MCP tools → Agent ToolRegistry 投影（Agent Hub 第二期 Task M1 / Spec §4.4 子期 B）。
 *
 * ## 投影命名（稳定，避免与本地 Tool 冲突）
 *
 * 格式：`mcp__<serverId>__<toolName>`
 * - `serverId`：`external_mcp_servers.id`（UUID，可含连字符，不含 `__`）
 * - `toolName`：远端 MCP `tools/list` 返回的 `name`（按字面保留；若含 `__`，解析时取
 *   `mcp__` 前缀后**第一个** `__` 分隔 serverId 与其余部分作为 toolName）
 *
 * 备选可读形式 `mcp.<serverIdShort>.<toolName>` 未采用：短 id 可能碰撞，且与 UUID 主键不对齐。
 * 本地种子 Tool 使用 `local.*` / `research.*`，与本前缀空间隔离。
 *
 * ## sideEffect
 *
 * 默认一律 `network`（外部 MCP 视为可能出网）。即便远端注解 `readOnlyHint`，也无法证明
 * 「只读本地且不出网」，故不映射为 `read`。须过 `networkGate`（「允许 Agent 联网」）。
 */

import type Database from 'better-sqlite3'
import type { ToolRegistry } from '../toolRegistry'
import type { AgentSessionContext, ToolDefinition, ToolSideEffect } from '../types'
import {
  listExternalMcpServers,
  type ExternalMcpToolSummary,
} from '../../database/externalMcpRepository'
import {
  callExternalMcpTool,
  listExternalMcpTools,
  type ExternalMcpClientOptions,
  type ExternalMcpTransportFactory,
} from '../../services/externalMcpClientService'

export const MCP_PROJECTED_TOOL_PREFIX = 'mcp__'

/** 与 orchestrator AGENT_TOOL_RESULT_MAX_CHARS 对齐；投影层先截断再交给编排。 */
export const MCP_TOOL_RESULT_MAX_CHARS = 4000

/** list_tools 缓存新鲜度；过期则尝试刷新，失败时可回退陈旧缓存。 */
export const MCP_TOOLS_CACHE_TTL_MS = 5 * 60 * 1000

function capMcpResult(value: unknown, maxChars: number): { text: string; truncated: boolean; raw: unknown } {
  let text: string
  try {
    text = typeof value === 'string' ? value : JSON.stringify(value)
  } catch {
    text = String(value)
  }
  if (text.length <= maxChars) {
    return { text, truncated: false, raw: value }
  }
  return {
    text: `${text.slice(0, maxChars)}…[truncated ${text.length - maxChars} chars]`,
    truncated: true,
    raw: value,
  }
}

export function isMcpProjectedToolName(name: string): boolean {
  return name.startsWith(MCP_PROJECTED_TOOL_PREFIX)
}

export function buildMcpProjectedToolName(serverId: string, toolName: string): string {
  const sid = serverId.trim()
  const tname = toolName.trim()
  if (!sid || !tname) {
    throw new Error('serverId / toolName 不能为空')
  }
  if (sid.includes('__')) {
    throw new Error('serverId 不得包含 __')
  }
  return `${MCP_PROJECTED_TOOL_PREFIX}${sid}__${tname}`
}

export function parseMcpProjectedToolName(
  projectedName: string,
): { serverId: string; toolName: string } | null {
  if (!isMcpProjectedToolName(projectedName)) return null
  const rest = projectedName.slice(MCP_PROJECTED_TOOL_PREFIX.length)
  const sep = rest.indexOf('__')
  if (sep <= 0) return null
  const serverId = rest.slice(0, sep)
  const toolName = rest.slice(sep + 2)
  if (!serverId || !toolName) return null
  return { serverId, toolName }
}

/**
 * 外部 MCP 投影 sideEffect：保守默认 network。
 * 仅当未来有可证明「只读本地且不出网」的白名单时才允许 read；当前一律 network。
 */
export function mapMcpToolSideEffect(
  _tool: Pick<ExternalMcpToolSummary, 'name' | 'description'> & {
    annotations?: { readOnlyHint?: boolean }
  },
): ToolSideEffect {
  void _tool
  return 'network'
}

export interface McpProjectedCallDeps {
  callTool: (
    serverId: string,
    toolName: string,
    args: Record<string, unknown>,
  ) => Promise<{
    ok: boolean
    result?: unknown
    error?: { code: string; message: string }
  }>
  resultMaxChars?: number
}

export function createMcpProjectedTool(input: {
  serverId: string
  tool: ExternalMcpToolSummary
  deps: McpProjectedCallDeps
}): ToolDefinition {
  const { serverId, tool, deps } = input
  const mcpToolName = tool.name
  const projectedName = buildMcpProjectedToolName(serverId, mcpToolName)
  const sideEffect = mapMcpToolSideEffect(tool)
  const description =
    tool.description?.trim() ||
    `外部 MCP 工具 ${mcpToolName}（server=${serverId}）；需开启「允许 Agent 联网」。`

  return {
    name: projectedName,
    description,
    sideEffect,
    parametersSchema: {
      type: 'object',
      additionalProperties: true,
      properties: {},
      description: '透传给远端 MCP tools/call 的 arguments 对象',
    },
    audit: {
      source: 'external_mcp',
      serverId,
      toolName: mcpToolName,
    },
    async execute(_ctx: AgentSessionContext, args: Record<string, unknown>): Promise<unknown> {
      const called = await deps.callTool(serverId, mcpToolName, args ?? {})
      if (!called.ok) {
        const message = called.error?.message ?? 'MCP tool 调用失败'
        const code = called.error?.code ?? 'CALL_FAILED'
        throw Object.assign(new Error(message), { code, serverId, toolName: mcpToolName })
      }
      const maxChars = deps.resultMaxChars ?? MCP_TOOL_RESULT_MAX_CHARS
      const capped = capMcpResult(called.result, maxChars)
      return {
        serverId,
        toolName: mcpToolName,
        truncated: capped.truncated,
        result: capped.truncated ? capped.text : capped.raw,
      }
    },
  }
}

export interface RegisterMcpProjectedToolsOptions {
  getDb: () => Database.Database
  transportFactory?: ExternalMcpTransportFactory
  timeoutMs?: number
  now?: number
  toolsCacheTtlMs?: number
  resultMaxChars?: number
  /** 可注入 list/call，便于单测。 */
  listToolsForServer?: (
    serverId: string,
    options: ExternalMcpClientOptions,
  ) => Promise<{ ok: boolean; tools: ExternalMcpToolSummary[]; error?: { code: string; message: string } }>
  callTool?: McpProjectedCallDeps['callTool']
}

export interface RegisterMcpProjectedToolsResult {
  registered: string[]
  cleared: number
  servers: Array<{
    serverId: string
    enabled: boolean
    toolCount: number
    fromCache: boolean
    skippedReason?: string
  }>
}

function clearProjectedMcpTools(registry: ToolRegistry): number {
  return registry.unregisterWhere((name) => isMcpProjectedToolName(name))
}

async function resolveToolsForEnabledServer(
  db: Database.Database,
  server: { id: string; lastTools: ExternalMcpToolSummary[] | null; lastTestedAt: number | null },
  options: RegisterMcpProjectedToolsOptions,
  now: number,
  ttlMs: number,
): Promise<{ tools: ExternalMcpToolSummary[]; fromCache: boolean; skippedReason?: string }> {
  const cacheFresh =
    server.lastTools != null &&
    server.lastTools.length > 0 &&
    server.lastTestedAt != null &&
    now - server.lastTestedAt <= ttlMs

  if (cacheFresh) {
    return { tools: server.lastTools!, fromCache: true }
  }

  const listFn =
    options.listToolsForServer ??
    ((serverId: string, clientOpts: ExternalMcpClientOptions) =>
      listExternalMcpTools(db, serverId, clientOpts))

  const listed = await listFn(server.id, {
    transportFactory: options.transportFactory,
    timeoutMs: options.timeoutMs,
    now,
  })

  if (listed.ok && listed.tools.length > 0) {
    return { tools: listed.tools, fromCache: false }
  }

  // 刷新失败：回退陈旧缓存（若有）
  if (server.lastTools && server.lastTools.length > 0) {
    return {
      tools: server.lastTools,
      fromCache: true,
      skippedReason: listed.error
        ? `refresh_failed:${listed.error.code};used_stale_cache`
        : 'refresh_empty;used_stale_cache',
    }
  }

  return {
    tools: [],
    fromCache: false,
    skippedReason: listed.error?.code ?? 'NO_TOOLS',
  }
}

/**
 * 清除既有 `mcp__*` 投影后，将 **enabled** 外部 MCP 服务器的 tools 注册进 Registry。
 * disabled 服务器不注册。每轮 agentTurn 开始时可调用以刷新白名单。
 */
export async function registerMcpProjectedTools(
  registry: ToolRegistry,
  options: RegisterMcpProjectedToolsOptions,
): Promise<RegisterMcpProjectedToolsResult> {
  const cleared = clearProjectedMcpTools(registry)
  const db = options.getDb()
  const now = options.now ?? Date.now()
  const ttlMs = options.toolsCacheTtlMs ?? MCP_TOOLS_CACHE_TTL_MS
  const registered: string[] = []
  const servers: RegisterMcpProjectedToolsResult['servers'] = []

  const callTool: McpProjectedCallDeps['callTool'] =
    options.callTool ??
    (async (serverId, toolName, args) => {
      const result = await callExternalMcpTool(db, serverId, toolName, args, {
        transportFactory: options.transportFactory,
        timeoutMs: options.timeoutMs,
        now,
      })
      return {
        ok: result.ok,
        result: result.result,
        error: result.error,
      }
    })

  const all = listExternalMcpServers(db)
  for (const server of all) {
    if (!server.enabled) {
      servers.push({
        serverId: server.id,
        enabled: false,
        toolCount: 0,
        fromCache: false,
        skippedReason: 'DISABLED',
      })
      continue
    }

    const resolved = await resolveToolsForEnabledServer(
      db,
      {
        id: server.id,
        lastTools: server.lastTools,
        lastTestedAt: server.lastTestedAt,
      },
      options,
      now,
      ttlMs,
    )

    if (resolved.tools.length === 0) {
      servers.push({
        serverId: server.id,
        enabled: true,
        toolCount: 0,
        fromCache: resolved.fromCache,
        skippedReason: resolved.skippedReason ?? 'NO_TOOLS',
      })
      continue
    }

    let count = 0
    for (const tool of resolved.tools) {
      if (!tool.name?.trim()) continue
      const def = createMcpProjectedTool({
        serverId: server.id,
        tool,
        deps: { callTool, resultMaxChars: options.resultMaxChars },
      })
      try {
        registry.register(def)
        registered.push(def.name)
        count += 1
      } catch {
        // 同名冲突跳过（理论上 clear 后不应发生）
      }
    }

    servers.push({
      serverId: server.id,
      enabled: true,
      toolCount: count,
      fromCache: resolved.fromCache,
      ...(resolved.skippedReason ? { skippedReason: resolved.skippedReason } : {}),
    })
  }

  return { registered, cleared, servers }
}
