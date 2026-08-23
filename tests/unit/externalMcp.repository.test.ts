import Database from 'better-sqlite3'
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
  decryptExternalMcpEnv,
  deleteExternalMcpServer,
  getExternalMcpServer,
  listExternalMcpServers,
  saveExternalMcpServer,
  setExternalMcpServerEnabled,
  updateExternalMcpTestResult,
} from '../../electron/main/database/externalMcpRepository'

describe('external MCP repository (M0)', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    runMigrations(db, DATABASE_MIGRATIONS.filter((migration) => migration.version === 150))
  })

  afterEach(() => db.close())

  it('Migration 150 creates external_mcp_servers', () => {
    const tables = db
      .prepare(`
        SELECT name FROM sqlite_master
        WHERE type = 'table' AND name = 'external_mcp_servers'
      `)
      .all() as Array<{ name: string }>
    expect(tables).toEqual([{ name: 'external_mcp_servers' }])
    expect(db.prepare('SELECT version FROM schema_migrations').all()).toEqual([{ version: 150 }])
  })

  it('saves stdio config with encrypted env and lists hasEnv without plaintext', () => {
    const saved = saveExternalMcpServer(db, {
      name: '  Demo MCP  ',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-everything'],
      env: { API_TOKEN: 'secret-token', OTHER: 'x' },
      cwd: 'E:\\tools',
      now: 1000,
    })

    expect(saved).toMatchObject({
      name: 'Demo MCP',
      enabled: true,
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-everything'],
      cwd: 'E:\\tools',
      hasEnv: true,
      lastTestedAt: null,
      lastErrorCode: null,
      lastTools: null,
      createdAt: 1000,
      updatedAt: 1000,
    })
    expect(JSON.stringify(saved)).not.toContain('secret-token')
    expect(listExternalMcpServers(db)[0]?.hasEnv).toBe(true)

    const row = getExternalMcpServer(db, saved.id)!
    expect(row.env_encrypted).toBeTruthy()
    expect(Buffer.isBuffer(row.env_encrypted)).toBe(true)
    expect(row.env_encrypted!.length).toBeGreaterThan(0)
    // Public list view must not embed plaintext; decrypt path recovers env for main process only.
    expect(listExternalMcpServers(db).map((item) => JSON.stringify(item)).join('')).not.toContain('secret-token')
    expect(decryptExternalMcpEnv(row.env_encrypted)).toEqual({
      API_TOKEN: 'secret-token',
      OTHER: 'x',
    })
  })

  it('updates without env keeps previous secret; null env clears; enable/delete work', () => {
    const created = saveExternalMcpServer(db, {
      name: 'Keep Env',
      command: 'node',
      args: ['server.js'],
      env: { KEY: 'v1' },
      now: 1,
    })

    const updated = saveExternalMcpServer(db, {
      id: created.id,
      name: 'Keep Env 2',
      command: 'node',
      args: ['server.js', '--verbose'],
      now: 2,
    })
    expect(updated.name).toBe('Keep Env 2')
    expect(updated.args).toEqual(['server.js', '--verbose'])
    expect(updated.hasEnv).toBe(true)
    expect(decryptExternalMcpEnv(getExternalMcpServer(db, created.id)!.env_encrypted)).toEqual({
      KEY: 'v1',
    })

    const cleared = saveExternalMcpServer(db, {
      id: created.id,
      name: 'Keep Env 2',
      command: 'node',
      env: null,
      now: 3,
    })
    expect(cleared.hasEnv).toBe(false)

    const disabled = setExternalMcpServerEnabled(db, created.id, false, 4)
    expect(disabled.enabled).toBe(false)
    expect(deleteExternalMcpServer(db, created.id)).toBe(true)
    expect(listExternalMcpServers(db)).toEqual([])
  })

  it('records test success tools cache and failure error code without leaking secrets', () => {
    const created = saveExternalMcpServer(db, {
      name: 'Test Cache',
      command: 'node',
      env: { SECRET: 'no-leak' },
      now: 10,
    })

    const okView = updateExternalMcpTestResult(db, {
      id: created.id,
      ok: true,
      tools: [{ name: 'echo', description: 'Echo tool' }],
      now: 20,
    })
    expect(okView).toMatchObject({
      lastTestedAt: 20,
      lastErrorCode: null,
      lastTools: [{ name: 'echo', description: 'Echo tool' }],
    })
    expect(JSON.stringify(okView)).not.toContain('no-leak')

    const failView = updateExternalMcpTestResult(db, {
      id: created.id,
      ok: false,
      errorCode: 'TIMEOUT',
      now: 30,
    })
    expect(failView.lastErrorCode).toBe('TIMEOUT')
    expect(failView.lastTestedAt).toBe(30)
    expect(failView.lastTools).toEqual([{ name: 'echo', description: 'Echo tool' }])
  })

  it('rejects shell-like multiline command/args', () => {
    expect(() =>
      saveExternalMcpServer(db, {
        name: 'Bad',
        command: 'node\nrm -rf /',
      }),
    ).toThrow(/command/)
    expect(() =>
      saveExternalMcpServer(db, {
        name: 'Bad',
        command: 'node',
        args: ['-e', '1\n2'],
      }),
    ).toThrow(/args/)
  })
})
