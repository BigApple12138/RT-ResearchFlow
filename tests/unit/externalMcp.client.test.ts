import Database from 'better-sqlite3'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
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
  getExternalMcpServerView,
  saveExternalMcpServer,
} from '../../electron/main/database/externalMcpRepository'
import {
  callExternalMcpTool,
  listExternalMcpTools,
  testExternalMcpServer,
  type ExternalMcpTransportFactory,
} from '../../electron/main/services/externalMcpClientService'

describe('external MCP client service (M0)', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    runMigrations(db, DATABASE_MIGRATIONS.filter((migration) => migration.version === 150))
  })

  afterEach(() => db.close())

  it('lists tools via injectable transport factory and caches success', async () => {
    const server = saveExternalMcpServer(db, {
      name: 'Mock MCP',
      command: 'fake-mcp',
      args: ['--stdio'],
      env: { TOKEN: 'should-not-appear-in-factory-assert-fail-path' },
      now: 1,
    })

    let factoryCalls = 0
    const transportFactory: ExternalMcpTransportFactory = (params) => {
      factoryCalls += 1
      expect(params).toMatchObject({
        command: 'fake-mcp',
        args: ['--stdio'],
        env: { TOKEN: 'should-not-appear-in-factory-assert-fail-path' },
      })
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
      const mcpServer = new Server(
        { name: 'mock-external-mcp', version: '0.0.1' },
        { capabilities: { tools: {} } },
      )
      mcpServer.setRequestHandler(ListToolsRequestSchema, async () => ({
        tools: [
          {
            name: 'lookup',
            description: 'Lookup facts',
            inputSchema: { type: 'object' as const, properties: {} },
          },
        ],
      }))
      void mcpServer.connect(serverTransport)
      return clientTransport
    }

    const result = await testExternalMcpServer(db, server.id, { transportFactory, now: 50 })
    expect(factoryCalls).toBe(1)
    expect(result).toEqual({
      ok: true,
      tools: [{ name: 'lookup', description: 'Lookup facts' }],
    })

    const view = getExternalMcpServerView(db, server.id)!
    expect(view.lastTestedAt).toBe(50)
    expect(view.lastErrorCode).toBeNull()
    expect(view.lastTools).toEqual([{ name: 'lookup', description: 'Lookup facts' }])
  })

  it('writes last_error on timeout without starting a real network MCP', async () => {
    const server = saveExternalMcpServer(db, {
      name: 'Timeout MCP',
      command: 'never-spawned',
      now: 1,
    })

    const transportFactory: ExternalMcpTransportFactory = () => {
      const [clientTransport] = InMemoryTransport.createLinkedPair()
      // Do not connect a server — client.connect hangs until timeout.
      return clientTransport
    }

    const result = await listExternalMcpTools(db, server.id, {
      transportFactory,
      timeoutMs: 30,
      now: 99,
    })
    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('TIMEOUT')
    expect(getExternalMcpServerView(db, server.id)).toMatchObject({
      lastTestedAt: 99,
      lastErrorCode: 'TIMEOUT',
    })
  })

  it('callTool returns content via injectable transport factory', async () => {
    const server = saveExternalMcpServer(db, {
      name: 'Call MCP',
      command: 'fake-mcp',
      args: ['--stdio'],
      now: 1,
    })

    const transportFactory: ExternalMcpTransportFactory = () => {
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
      const mcpServer = new Server(
        { name: 'mock-call-mcp', version: '0.0.1' },
        { capabilities: { tools: {} } },
      )
      mcpServer.setRequestHandler(ListToolsRequestSchema, async () => ({
        tools: [{ name: 'ping', inputSchema: { type: 'object' as const, properties: {} } }],
      }))
      mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => ({
        content: [
          {
            type: 'text' as const,
            text: `pong:${String(request.params.name)}:${JSON.stringify(request.params.arguments ?? {})}`,
          },
        ],
      }))
      void mcpServer.connect(serverTransport)
      return clientTransport
    }

    const result = await callExternalMcpTool(db, server.id, 'ping', { x: 1 }, { transportFactory })
    expect(result.ok).toBe(true)
    expect(JSON.stringify(result.result)).toContain('pong:ping')
  })

  it('returns NOT_FOUND for unknown server id', async () => {
    const result = await testExternalMcpServer(db, '00000000-0000-4000-8000-000000000099')
    expect(result).toEqual({
      ok: false,
      tools: [],
      error: { code: 'NOT_FOUND', message: '外部 MCP 服务器不存在' },
    })
  })
})
