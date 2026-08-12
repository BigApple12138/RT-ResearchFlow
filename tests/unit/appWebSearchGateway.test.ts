import Database from 'better-sqlite3'
import { beforeEach, describe, expect, it } from 'vitest'
import { runMigrations } from '../../electron/main/database/db'
import { saveExternalMcpServer } from '../../electron/main/database/externalMcpRepository'
import {
  adaptMcpSearchResult,
  getAppWebSearchConfigView,
  isAppWebSearchConfigured,
  saveAppWebSearchConfig,
} from '../../electron/main/services/appWebSearchGateway'

describe('adaptMcpSearchResult', () => {
  it('解析 JSON 结果数组', () => {
    const hits = adaptMcpSearchResult(
      {
        content: [{
          type: 'text',
          text: JSON.stringify({
            results: [
              { title: '测试标题', url: 'https://example.com/a', snippet: '摘要A' },
              { Title: '另一条', Url: 'https://example.com/b', Summary: '摘要B' },
            ],
          }),
        }],
      },
      '储能 股票',
      'server-1',
      'web_search',
      6,
    )
    expect(hits).toHaveLength(2)
    expect(hits[0].title).toBe('测试标题')
    expect(hits[0].url).toBe('https://example.com/a')
    expect(hits[0].providerId).toBe('external_mcp')
  })
})

describe('appWebSearchGateway persistence', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    runMigrations(db)
  })

  it('migration 后可保存 external_mcp 通道', () => {
    const server = saveExternalMcpServer(db, {
      name: '豆包搜索',
      command: 'uvx',
      args: ['--from', 'mcp-server-askecho-search-infinity>=0.2.0', 'mcp-server-askecho-search-infinity'],
      enabled: true,
    })
    const view = saveAppWebSearchConfig(db, {
      providerId: 'external_mcp',
      enabled: true,
      mcpServerId: server.id,
      mcpToolName: 'web_search',
    })
    expect(view.providerId).toBe('external_mcp')
    expect(view.mcpServerId).toBe(server.id)
    expect(view.mcpToolName).toBe('web_search')
    expect(view.hasApiKey).toBe(false)
    expect(getAppWebSearchConfigView(db).enabled).toBe(true)
    expect(isAppWebSearchConfigured(db)).toBe(true)
  })

  it('可保存 builtin_web 且不要求 Key', () => {
    const view = saveAppWebSearchConfig(db, {
      providerId: 'builtin_web',
      enabled: true,
    })
    expect(view.providerId).toBe('builtin_web')
    expect(view.mcpServerId).toBeNull()
    expect(isAppWebSearchConfigured(db)).toBe(true)
  })

  it('未启用或 MCP 未绑定时 isAppWebSearchConfigured 为 false', () => {
    expect(isAppWebSearchConfigured(db)).toBe(false)
    saveAppWebSearchConfig(db, { providerId: 'builtin_web', enabled: false })
    expect(isAppWebSearchConfigured(db)).toBe(false)
  })
})
