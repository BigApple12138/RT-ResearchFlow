import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DATABASE_MIGRATIONS, runMigrations } from '../../electron/main/database/db'
import {
  getAiAgentNetworkEnabled,
  setAiAgentNetworkEnabled,
} from '../../electron/main/database/settingsRepository'
import { assertNetworkAllowed, AgentNetworkGateError } from '../../electron/main/agent/networkGate'
import type { ToolDefinition } from '../../electron/main/agent/types'

function networkTool(): Pick<ToolDefinition, 'name' | 'sideEffect'> {
  return { name: 'web.search', sideEffect: 'network' }
}

describe('ai_agent_network_enabled settings', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    runMigrations(db, DATABASE_MIGRATIONS)
  })

  afterEach(() => db.close())

  it('Migration 149 默认关闭且 CHECK 拒绝非法值', () => {
    const columns = db.prepare('PRAGMA table_info(app_settings)').all() as Array<{ name: string }>
    expect(columns.map((c) => c.name)).toContain('ai_agent_network_enabled')

    const row = db.prepare('SELECT ai_agent_network_enabled FROM app_settings WHERE id = 1')
      .get() as { ai_agent_network_enabled: number }
    expect(row.ai_agent_network_enabled).toBe(0)
    expect(getAiAgentNetworkEnabled(db)).toBe(false)

    expect(() => {
      db.prepare('UPDATE app_settings SET ai_agent_network_enabled = 2 WHERE id = 1').run()
    }).toThrow()
  })

  it('专用读写只接受严格布尔值，并可即时切换', () => {
    expect(setAiAgentNetworkEnabled(true, db)).toBe(true)
    expect(getAiAgentNetworkEnabled(db)).toBe(true)
    expect(setAiAgentNetworkEnabled(false, db)).toBe(false)
    expect(getAiAgentNetworkEnabled(db)).toBe(false)
    expect(() => setAiAgentNetworkEnabled(1, db)).toThrow('AI_AGENT_NETWORK_ENABLED_INVALID')
    expect(() => setAiAgentNetworkEnabled('yes', db)).toThrow('AI_AGENT_NETWORK_ENABLED_INVALID')
  })

  it('关闭→开启→再关闭即时影响 networkGate（注入读取）', () => {
    let enabled = getAiAgentNetworkEnabled(db)
    const opts = { getNetworkEnabled: () => enabled }

    expect(() => assertNetworkAllowed(networkTool(), opts)).toThrow(AgentNetworkGateError)

    setAiAgentNetworkEnabled(true, db)
    enabled = getAiAgentNetworkEnabled(db)
    expect(() => assertNetworkAllowed(networkTool(), opts)).not.toThrow()

    setAiAgentNetworkEnabled(false, db)
    enabled = getAiAgentNetworkEnabled(db)
    expect(() => assertNetworkAllowed(networkTool(), opts)).toThrow(AgentNetworkGateError)
  })

  it('重复应用 Migration 幂等（已含 149 时不再失败）', () => {
    runMigrations(db, DATABASE_MIGRATIONS)
    expect(getAiAgentNetworkEnabled(db)).toBe(false)
    const versions = (db.prepare('SELECT version FROM schema_migrations WHERE version = 149').all() as Array<{ version: number }>)
    expect(versions).toHaveLength(1)
  })
})
