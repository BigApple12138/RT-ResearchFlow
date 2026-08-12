/**
 * 深度研究受控 MCP 桥接（Agent Hub 第二期 Task M2 / Spec §4.4 子期 C）。
 *
 * 方案 A：单一 researchAgent 工具 `mcp.invoke`，入参仅 serverId + toolName + arguments
 * + subjectRef + asOf。禁止任意 URL / 任意 MCP 原文绕过证据门禁——结果落账为
 * sourceClass=secondary 的外源样本，证据门禁仍按既有 document 规则评估。
 */

import { createHash } from 'node:crypto'
import type Database from 'better-sqlite3'
import {
  getExternalMcpServer,
  type ExternalMcpToolSummary,
} from '../database/externalMcpRepository'
import { getAiAgentNetworkEnabled } from '../database/settingsRepository'
import { MCP_TOOL_RESULT_MAX_CHARS } from '../agent/tools/mcpProjection'
import {
  callExternalMcpTool,
  type ExternalMcpCallToolResult,
  type ExternalMcpClientOptions,
  type ExternalMcpTransportFactory,
} from './externalMcpClientService'
import type {
  ResearchFactSource,
  ResearchFactToolStatus,
} from './researchFactToolRegistry'
import type {
  ExecuteResearchAgentNetworkToolInput,
  ResearchAgentNetworkSubject,
  ResearchAgentNetworkToolEnvelope,
  ResearchAgentToolDefinition,
} from './researchAgentNetworkTools'
import { ResearchAgentNetworkToolError } from './researchAgentNetworkTools'

export const RESEARCH_AGENT_MCP_TOOL_ID = 'mcp.invoke' as const

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const RESEARCH_AGENT_MCP_TOOL_DEFINITION = {
  id: RESEARCH_AGENT_MCP_TOOL_ID,
  externalName: 'mcp_invoke',
  description:
    '调用已启用外部 MCP 工具补证。入参仅 serverId、toolName、arguments、subjectRef 与运行 asOf；结果为外源样本，不自动满足证据门禁 complete。需开启「允许 Agent 联网」。',
  scope: 'research.read',
  asOf: 'supported',
  maxItems: 1,
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      serverId: { type: 'string', pattern: UUID_PATTERN.source },
      toolName: { type: 'string', maxLength: 160, pattern: '\\S{1}' },
      arguments: { type: 'object' },
      subjectRef: { type: 'string', maxLength: 160, pattern: '\\S{1}' },
      asOf: { type: ['string', 'null'], pattern: '^\\d{8}$' },
    },
    required: ['serverId', 'toolName', 'subjectRef', 'asOf'] as const,
  },
} as const satisfies ResearchAgentToolDefinition

export interface ResearchAgentMcpInvokeDeps {
  callMcpTool?: (
    db: Database.Database,
    serverId: string,
    toolName: string,
    args: Record<string, unknown>,
    options?: ExternalMcpClientOptions,
  ) => Promise<ExternalMcpCallToolResult>
  getAgentNetworkEnabled?: (db: Database.Database) => boolean
  transportFactory?: ExternalMcpTransportFactory
  resultMaxChars?: number
}

/** 主体绑定：subjectRef 须匹配运行已确认股票 tsCode/六位码/label，或产业项目 id/label。 */
export function mcpSubjectRefAllowed(
  subjectRef: unknown,
  subjects: readonly ResearchAgentNetworkSubject[],
): boolean {
  if (typeof subjectRef !== 'string') return false
  const normalized = subjectRef.trim().toLowerCase()
  if (!normalized) return false
  return subjects.some((subject) => {
    if (subject.kind === 'stock') {
      if (subject.tsCode.toLowerCase() === normalized) return true
      if (subject.tsCode.slice(0, 6) === normalized) return true
      const label = subject.label?.trim().toLowerCase()
      return Boolean(label && label === normalized)
    }
    if (subject.id.toLowerCase() === normalized) return true
    const label = subject.label?.trim().toLowerCase()
    return Boolean(label && label === normalized)
  })
}

export function assessMcpInvokePolicy(
  db: Database.Database,
  toolInput: Record<string, unknown>,
  subjects: readonly ResearchAgentNetworkSubject[],
  deps: ResearchAgentMcpInvokeDeps = {},
): { ok: true } | { ok: false; code: string; message: string } {
  if (!mcpSubjectRefAllowed(toolInput.subjectRef, subjects)) {
    return {
      ok: false,
      code: 'SUBJECT_DENIED',
      message: 'mcp.invoke 的 subjectRef 必须绑定当前运行已确认研究主体',
    }
  }

  const getEnabled = deps.getAgentNetworkEnabled ?? getAiAgentNetworkEnabled
  if (!getEnabled(db)) {
    return {
      ok: false,
      code: 'NETWORK_DISABLED',
      message: '联网未授权：mcp.invoke 需要在配置中心 → Agent 开启「允许 Agent 联网」后才能执行（与「本应用联网搜索」通道无关）',
    }
  }

  const serverId = typeof toolInput.serverId === 'string' ? toolInput.serverId.trim() : ''
  const toolName = typeof toolInput.toolName === 'string' ? toolInput.toolName.trim() : ''
  if (!UUID_PATTERN.test(serverId) || !toolName) {
    return { ok: false, code: 'INVALID_INPUT', message: 'serverId 或 toolName 无效' }
  }

  const server = getExternalMcpServer(db, serverId)
  if (!server) {
    return { ok: false, code: 'MCP_SERVER_NOT_FOUND', message: '外部 MCP 服务器不存在' }
  }
  if (server.enabled !== 1) {
    return {
      ok: false,
      code: 'MCP_SERVER_DISABLED',
      message: '外部 MCP 服务器已停用，禁止调用',
    }
  }

  const cachedTools = parseCachedTools(server.last_tools_json)
  if (cachedTools && cachedTools.length > 0) {
    const allowed = cachedTools.some((tool) => tool.name === toolName)
    if (!allowed) {
      return {
        ok: false,
        code: 'MCP_TOOL_NOT_AUTHORIZED',
        message: '仅允许调用该服务器最近 list_tools 白名单中的工具',
      }
    }
  }

  return { ok: true }
}

export async function executeResearchAgentMcpInvoke(
  input: ExecuteResearchAgentNetworkToolInput,
  deps: ResearchAgentMcpInvokeDeps = {},
): Promise<ResearchAgentNetworkToolEnvelope> {
  const policy = assessMcpInvokePolicy(input.db, input.toolInput, input.subjects, deps)
  if (!policy.ok) {
    throw new ResearchAgentNetworkToolError(policy.code, policy.message)
  }

  const serverId = String(input.toolInput.serverId).trim()
  const toolName = String(input.toolInput.toolName).trim()
  const subjectRef = String(input.toolInput.subjectRef).trim()
  const rawArgs = input.toolInput.arguments
  const args =
    rawArgs != null && typeof rawArgs === 'object' && !Array.isArray(rawArgs)
      ? (rawArgs as Record<string, unknown>)
      : {}

  const server = getExternalMcpServer(input.db, serverId)
  const callFn = deps.callMcpTool ?? callExternalMcpTool
  const called = await callFn(input.db, serverId, toolName, args, {
    transportFactory: deps.transportFactory,
  })

  if (input.signal.aborted) {
    throw new ResearchAgentNetworkToolError('CANCELLED_AFTER_SUBMIT', '取消后到达的 MCP 响应已忽略', true)
  }

  if (!called.ok) {
    throw new ResearchAgentNetworkToolError(
      called.error?.code ?? 'MCP_CALL_FAILED',
      called.error?.message ?? '外部 MCP 工具调用失败',
    )
  }

  const maxChars = deps.resultMaxChars ?? MCP_TOOL_RESULT_MAX_CHARS
  const capped = capMcpResult(called.result, maxChars)
  const resultSha256 = createHash('sha256').update(capped.text).digest('hex')
  const warnings = [
    '外部 MCP 返回为外源样本（sourceClass=secondary），不计为正式披露正文；不得单独使证据门禁 complete。',
    ...(capped.truncated ? [`结果已截断至 ${maxChars} 字符。`] : []),
  ]

  return buildMcpEnvelope(input, 'partial', warnings, {
    mcp: {
      serverId,
      serverName: server?.name ?? null,
      toolName,
      subjectRef,
      sourceClass: 'secondary' as const,
      sourceKind: 'external_mcp' as const,
      truncated: capped.truncated,
      resultPreview: capped.text,
      resultSha256,
    },
  }, {
    available: 1,
    required: null,
    unit: 'mcp_samples',
  }, [
    {
      id: `external_mcp.${serverId}.${toolName}`,
      status: 'ready',
      factDate: input.run.as_of,
    },
  ])
}

function buildMcpEnvelope(
  input: ExecuteResearchAgentNetworkToolInput,
  status: ResearchFactToolStatus,
  warnings: string[],
  data: unknown,
  coverage: { available: number; required: number | null; unit: string },
  sources: ResearchFactSource[],
): ResearchAgentNetworkToolEnvelope {
  return {
    schemaVersion: 1,
    toolId: RESEARCH_AGENT_MCP_TOOL_ID,
    status,
    generatedAt: input.now,
    asOf: input.run.as_of,
    sources,
    coverage,
    warnings: warnings.slice(0, 20).map((warning) => warning.slice(0, 500)),
    data,
  }
}

function capMcpResult(
  value: unknown,
  maxChars: number,
): { text: string; truncated: boolean } {
  let text: string
  try {
    text = typeof value === 'string' ? value : JSON.stringify(value)
  } catch {
    text = String(value)
  }
  if (text.length <= maxChars) return { text, truncated: false }
  return {
    text: `${text.slice(0, maxChars)}…[truncated ${text.length - maxChars} chars]`,
    truncated: true,
  }
}

function parseCachedTools(value: string | null): ExternalMcpToolSummary[] | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(value) as unknown
    if (!Array.isArray(parsed)) return null
    return parsed.flatMap((item): ExternalMcpToolSummary[] => {
      if (!item || typeof item !== 'object') return []
      const name = typeof (item as { name?: unknown }).name === 'string'
        ? (item as { name: string }).name.trim()
        : ''
      if (!name) return []
      const description =
        typeof (item as { description?: unknown }).description === 'string'
          ? (item as { description: string }).description
          : undefined
      return description ? [{ name, description }] : [{ name }]
    })
  } catch {
    return null
  }
}
