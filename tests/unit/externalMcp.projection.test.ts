import Database from 'better-sqlite3'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (plaintext: string) => Buffer.from(`enc:${plaintext}`, 'utf8'),
    decryptString: (encrypted: Buffer) => {
      const raw = encrypted.toString('utf8')
      if (!raw.startsWith('enc:')) throw new Error('bad cipher')
      return raw.slice(4)
    },
  },
}))

import { DATABASE_MIGRATIONS, runMigrations } from '../../electron/main/database/db'
import {
  saveExternalMcpServer,
  setExternalMcpServerEnabled,
  updateExternalMcpTestResult,
} from '../../electron/main/database/externalMcpRepository'
import { createToolRegistry, emptySessionContext } from '../../electron/main/agent/toolRegistry'
import { assertNetworkAllowed, AgentNetworkGateError } from '../../electron/main/agent/networkGate'
import { runAgentTurn } from '../../electron/main/agent/orchestrator'
import {
  createGoalState,
  createPlanState,
  createPlanStep,
} from '../../electron/main/agent/planner'
import type { AgentEvent } from '../../electron/main/agent/types'
import {
  buildMcpProjectedToolName,
  mapMcpToolSideEffect,
  MCP_TOOL_RESULT_MAX_CHARS,
  parseMcpProjectedToolName,
  registerMcpProjectedTools,
} from '../../electron/main/agent/tools/mcpProjection'
import {
  callExternalMcpTool,
  type ExternalMcpTransportFactory,
} from '../../electron/main/services/externalMcpClientService'

function createMockMcpTransport(handlers: {
  tools?: Array<{ name: string; description?: string }>
  call?: (name: string, args: Record<string, unknown>) => { content: Array<{ type: 'text'; text: string }>; isError?: boolean }
}): ExternalMcpTransportFactory {
  return () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    const mcpServer = new Server(
      { name: 'mock-external-mcp', version: '0.0.1' },
      { capabilities: { tools: {} } },
    )
    mcpServer.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: (handlers.tools ?? []).map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: { type: 'object' as const, properties: {} },
      })),
    }))
    mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
      const name = String(request.params.name)
      const args = (request.params.arguments ?? {}) as Record<string, unknown>
      if (handlers.call) return handlers.call(name, args)
      return { content: [{ type: 'text' as const, text: `ok:${name}` }] }
    })
    void mcpServer.connect(serverTransport)
    return clientTransport
  }
}

describe('external MCP projection (M1)', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    runMigrations(db, DATABASE_MIGRATIONS.filter((migration) => migration.version === 150))
  })

  afterEach(() => db.close())

  it('投影命名：mcp__<serverId>__<toolName> 可稳定往返解析', () => {
    const serverId = '550e8400-e29b-41d4-a716-446655440000'
    const name = buildMcpProjectedToolName(serverId, 'lookup.facts')
    expect(name).toBe(`mcp__${serverId}__lookup.facts`)
    expect(parseMcpProjectedToolName(name)).toEqual({
      serverId,
      toolName: 'lookup.facts',
    })
    expect(parseMcpProjectedToolName('local.portfolio_facts')).toBeNull()
  })

  it('sideEffect 默认 network（即使 readOnlyHint 也不降为 read）', () => {
    expect(mapMcpToolSideEffect({ name: 'search', description: 'web' })).toBe('network')
    expect(
      mapMcpToolSideEffect({
        name: 'local_read',
        description: 'read file',
        annotations: { readOnlyHint: true },
      }),
    ).toBe('network')
  })

  it('仅 enabled 服务器投影；disabled 不注册', async () => {
    const enabled = saveExternalMcpServer(db, {
      name: 'On',
      command: 'fake-on',
      now: 1,
    })
    const disabled = saveExternalMcpServer(db, {
      name: 'Off',
      command: 'fake-off',
      enabled: false,
      now: 2,
    })
    updateExternalMcpTestResult(db, {
      id: enabled.id,
      ok: true,
      tools: [{ name: 'alpha', description: 'A' }],
      now: 10,
    })
    updateExternalMcpTestResult(db, {
      id: disabled.id,
      ok: true,
      tools: [{ name: 'beta', description: 'B' }],
      now: 10,
    })

    const registry = createToolRegistry()
    const result = await registerMcpProjectedTools(registry, {
      getDb: () => db,
      now: 10,
      toolsCacheTtlMs: 60_000,
      callTool: async () => ({ ok: true, result: { x: 1 } }),
    })

    expect(result.registered).toEqual([buildMcpProjectedToolName(enabled.id, 'alpha')])
    expect(registry.list().map((t) => t.name)).toEqual([
      buildMcpProjectedToolName(enabled.id, 'alpha'),
    ])
    expect(result.servers.find((s) => s.serverId === disabled.id)?.skippedReason).toBe('DISABLED')
  })

  it('networkGate 关闭时拒绝投影 tool，且不调用远端', async () => {
    const server = saveExternalMcpServer(db, { name: 'Net', command: 'fake', now: 1 })
    updateExternalMcpTestResult(db, {
      id: server.id,
      ok: true,
      tools: [{ name: 'lookup' }],
      now: 1,
    })

    let callHits = 0
    const registry = createToolRegistry()
    await registerMcpProjectedTools(registry, {
      getDb: () => db,
      now: 1,
      toolsCacheTtlMs: 60_000,
      callTool: async () => {
        callHits += 1
        return { ok: true, result: { hit: true } }
      },
    })

    const projected = registry.get(buildMcpProjectedToolName(server.id, 'lookup'))
    expect(projected.sideEffect).toBe('network')
    expect(() => assertNetworkAllowed(projected, { getNetworkEnabled: () => false })).toThrow(
      AgentNetworkGateError,
    )
    expect(callHits).toBe(0)

    const events: AgentEvent[] = []
    await runAgentTurn({
      sessionId: 1,
      userMessage: '用 MCP',
      requestId: 'req-mcp-net',
      registry,
      getNetworkEnabled: () => false,
      initialPlan: createPlanState({
        steps: [
          createPlanStep({
            stepId: 's1',
            title: 'mcp',
            capabilityNeed: [projected.name],
            completionCriteria: ['ok'],
          }),
        ],
      }),
      goal: createGoalState({ goal: 'mcp', completionCriteria: ['ok'] }),
      onEvent: (e) => events.push(e),
      reasoningCall: async ({ observations }) => {
        if (observations.length === 0) {
          return JSON.stringify({ type: 'tool', name: projected.name, args: { q: 'x' } })
        }
        return JSON.stringify({ type: 'final', text: '联网未授权。' })
      },
    })

    expect(callHits).toBe(0)
    const denied = events.find((e) => e.type === 'tool_result')
    expect(String(denied?.payload?.summary ?? '')).toMatch(/联网|未授权/)
  })

  it('Orchestrator 可调用投影 tool；审计含 serverId/toolName；结果截断', async () => {
    const server = saveExternalMcpServer(db, { name: 'Big', command: 'fake', now: 1 })
    updateExternalMcpTestResult(db, {
      id: server.id,
      ok: true,
      tools: [{ name: 'blob', description: 'big' }],
      now: 1,
    })

    const big = 'Z'.repeat(MCP_TOOL_RESULT_MAX_CHARS + 200)
    let callHits = 0
    const registry = createToolRegistry()
    await registerMcpProjectedTools(registry, {
      getDb: () => db,
      now: 1,
      toolsCacheTtlMs: 60_000,
      resultMaxChars: MCP_TOOL_RESULT_MAX_CHARS,
      callTool: async (serverId, toolName, args) => {
        callHits += 1
        expect(serverId).toBe(server.id)
        expect(toolName).toBe('blob')
        expect(args).toEqual({ n: 1 })
        return { ok: true, result: { blob: big } }
      },
    })

    const projectedName = buildMcpProjectedToolName(server.id, 'blob')
    const events: AgentEvent[] = []
    const result = await runAgentTurn({
      sessionId: 2,
      userMessage: '取大结果',
      requestId: 'req-mcp-audit',
      registry,
      getNetworkEnabled: () => true,
      initialPlan: createPlanState({
        steps: [
          createPlanStep({
            stepId: 's1',
            title: 'mcp',
            capabilityNeed: [projectedName],
            completionCriteria: ['ok'],
          }),
        ],
      }),
      goal: createGoalState({ goal: '大', completionCriteria: ['ok'] }),
      onEvent: (e) => events.push(e),
      reasoningCall: async ({ observations }) => {
        if (observations.length === 0) {
          return JSON.stringify({ type: 'tool', name: projectedName, args: { n: 1 } })
        }
        return JSON.stringify({ type: 'final', text: '已截断。' })
      },
    })

    expect(result.terminal).toBe('done')
    expect(callHits).toBe(1)

    const callEv = events.find((e) => e.type === 'tool_call')
    expect(callEv?.payload).toMatchObject({
      name: projectedName,
      source: 'external_mcp',
      serverId: server.id,
      toolName: 'blob',
    })

    const resultEv = events.find((e) => e.type === 'tool_result' && e.payload?.ok === true)
    expect(resultEv?.payload).toMatchObject({
      name: projectedName,
      source: 'external_mcp',
      serverId: server.id,
      toolName: 'blob',
      truncated: true,
    })
    expect(String(resultEv?.payload?.cappedText ?? '').length).toBeLessThanOrEqual(
      MCP_TOOL_RESULT_MAX_CHARS + 120,
    )
  })

  it('启停切换后再次 register 会清掉旧投影', async () => {
    const server = saveExternalMcpServer(db, { name: 'Toggle', command: 'fake', now: 1 })
    updateExternalMcpTestResult(db, {
      id: server.id,
      ok: true,
      tools: [{ name: 't1' }],
      now: 1,
    })
    const registry = createToolRegistry()
    await registerMcpProjectedTools(registry, {
      getDb: () => db,
      now: 1,
      toolsCacheTtlMs: 60_000,
      callTool: async () => ({ ok: true, result: {} }),
    })
    expect(registry.list()).toHaveLength(1)

    setExternalMcpServerEnabled(db, server.id, false, 2)
    await registerMcpProjectedTools(registry, {
      getDb: () => db,
      now: 2,
      toolsCacheTtlMs: 60_000,
      callTool: async () => ({ ok: true, result: {} }),
    })
    expect(registry.list()).toHaveLength(0)
  })

  it('callExternalMcpTool 经 mock transport 返回内容', async () => {
    const server = saveExternalMcpServer(db, {
      name: 'Call',
      command: 'fake-mcp',
      args: ['--stdio'],
      now: 1,
    })
    const transportFactory = createMockMcpTransport({
      tools: [{ name: 'echo' }],
      call: (name, args) => ({
        content: [{ type: 'text', text: `echo:${name}:${JSON.stringify(args)}` }],
      }),
    })

    const result = await callExternalMcpTool(
      db,
      server.id,
      'echo',
      { hello: 'world' },
      { transportFactory },
    )
    expect(result.ok).toBe(true)
    expect(JSON.stringify(result.result)).toContain('echo:echo')
  })

  it('投影 execute 在网络已授权时可直接调用', async () => {
    const server = saveExternalMcpServer(db, { name: 'Exec', command: 'fake', now: 1 })
    updateExternalMcpTestResult(db, {
      id: server.id,
      ok: true,
      tools: [{ name: 'ping' }],
      now: 1,
    })
    const registry = createToolRegistry()
    await registerMcpProjectedTools(registry, {
      getDb: () => db,
      now: 1,
      toolsCacheTtlMs: 60_000,
      callTool: async () => ({ ok: true, result: { pong: true } }),
    })
    const def = registry.get(buildMcpProjectedToolName(server.id, 'ping'))
    assertNetworkAllowed(def, { getNetworkEnabled: () => true })
    const out = await def.execute(emptySessionContext({ sessionId: 1, userGoal: 'x', requestId: 'r' }), {})
    expect(out).toMatchObject({ serverId: server.id, toolName: 'ping', truncated: false })
  })
})
