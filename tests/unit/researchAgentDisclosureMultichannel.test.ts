import { createHash } from 'node:crypto'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DATABASE_MIGRATIONS, runMigrations } from '../../electron/main/database/db'
import {
  advanceResearchAgentRunPhase,
  claimResearchAgentRunLease,
  createResearchAgentStep,
  startResearchAgentRun,
  transitionResearchAgentStepStatus,
} from '../../electron/main/database/researchAgentRunRepository'
import { RESEARCH_AGENT_TOOL_REGISTRY_VERSION } from '../../electron/main/services/researchAgentNetworkTools'
import {
  RESEARCH_AGENT_NETWORK_POLICY_VERSION,
  type ResearchAgentNetworkMimeKind,
  type ResearchAgentNetworkRequest,
  type ResearchAgentNetworkResponse,
} from '../../electron/main/services/researchAgentNetworkPolicy'
import { RESEARCH_AGENT_PROMPT_RULE_VERSION } from '../../electron/main/services/researchAgentProtocol'
import { executeResearchAgentTool } from '../../electron/main/services/researchAgentToolService'

const NOW = Date.parse('2026-07-30T08:00:00.000Z')
const OWNER = 'boot-00000000-0000-4000-8000-000000009901'
let sequence = 0

function uuid(): string {
  sequence += 1
  return `00000000-0000-4000-8000-${String(9000 + sequence).padStart(12, '0')}`
}

function networkResponse(
  request: ResearchAgentNetworkRequest,
  mimeKind: ResearchAgentNetworkMimeKind,
  value: string | Record<string, unknown>,
  statusCode = 200,
): ResearchAgentNetworkResponse {
  const body = Buffer.from(typeof value === 'string' ? value : JSON.stringify(value), 'utf8')
  const bodySha256 = createHash('sha256').update(body).digest('hex')
  return {
    body,
    envelope: {
      version: RESEARCH_AGENT_NETWORK_POLICY_VERSION,
      request: {
        method: request.method ?? 'GET',
        url: request.url,
        headerNames: Object.keys(request.headers ?? {}).map((name) => name.toLowerCase()).sort(),
        bodyBytes: 0,
        bodySha256: null,
      },
      response: {
        finalUrl: request.url,
        statusCode,
        contentType: 'application/json',
        mimeKind,
        contentEncoding: 'identity',
        fetchedAt: NOW + 500,
        compressedBytes: body.length,
        decodedBytes: body.length,
        bodySha256,
      },
      hops: [{
        url: request.url,
        resolvedAddresses: ['93.184.216.34'],
        statusCode,
        redirectTo: null,
      }],
      envelopeSha256: 'f'.repeat(64),
    },
  }
}

function startToolingRun(db: Database.Database) {
  const started = startResearchAgentRun(db, {
    requestId: uuid(),
    id: uuid(),
    question: '研究贵州茅台业绩预告',
    contextSnapshot: { schemaVersion: 1 },
    subjects: [{ kind: 'stock', tsCode: '600519.SH', label: '贵州茅台' }],
    includePortfolio: false,
    asOf: '20260730',
    provider: 'deepseek',
    model: 'deepseek-chat',
    modelConfigFingerprint: 'a'.repeat(64),
    promptRuleVersion: RESEARCH_AGENT_PROMPT_RULE_VERSION,
    toolRegistryVersion: RESEARCH_AGENT_TOOL_REGISTRY_VERSION,
    now: NOW,
  })
  claimResearchAgentRunLease(db, {
    runId: started.run.id,
    leaseOwner: OWNER,
    now: NOW + 1,
    ttlMs: 120_000,
  })
  const planning = createResearchAgentStep(db, {
    runId: started.run.id,
    leaseOwner: OWNER,
    ordinal: 1,
    kind: 'planning',
    stepInput: { action: 'plan' },
    id: uuid(),
    now: NOW + 2,
  })
  transitionResearchAgentStepStatus(db, {
    stepId: planning.id,
    leaseOwner: OWNER,
    toStatus: 'running',
    now: NOW + 3,
  })
  transitionResearchAgentStepStatus(db, {
    stepId: planning.id,
    leaseOwner: OWNER,
    toStatus: 'succeeded',
    artifact: { action: 'plan' },
    now: NOW + 4,
  })
  advanceResearchAgentRunPhase(db, {
    runId: started.run.id,
    leaseOwner: OWNER,
    toPhase: 'tooling',
    now: NOW + 5,
  })
  const tooling = createResearchAgentStep(db, {
    runId: started.run.id,
    leaseOwner: OWNER,
    ordinal: 2,
    kind: 'tooling',
    stepInput: { action: 'tool_batch', decisionRound: 1 },
    id: uuid(),
    now: NOW + 6,
  })
  transitionResearchAgentStepStatus(db, {
    stepId: tooling.id,
    leaseOwner: OWNER,
    toStatus: 'running',
    now: NOW + 7,
  })
  return { runId: started.run.id, stepId: tooling.id }
}

describe('official.disclosure_search multichannel', () => {
  let db: Database.Database

  beforeEach(() => {
    sequence = 0
    db = new Database(':memory:')
    db.pragma('foreign_keys = ON')
    runMigrations(db, DATABASE_MIGRATIONS.filter((migration) => [121, 122, 123].includes(migration.version)))
    db.exec('CREATE TABLE stock_fundamental_profiles (ts_code TEXT PRIMARY KEY, website TEXT)')
  })

  afterEach(() => db.close())

  it('网页失败时若 Tushare 有结构化行仍 ready', async () => {
    const { runId, stepId } = startToolingRun(db)
    const requestNetwork = vi.fn(async (request: ResearchAgentNetworkRequest) => {
      if (request.url.includes('api.tavily.com')) {
        return networkResponse(request, 'json', { results: [] }, 500)
      }
      return networkResponse(request, 'json', {})
    })
    const result = await executeResearchAgentTool(db, {
      runId,
      stepId,
      leaseOwner: OWNER,
      toolId: 'official.disclosure_search',
      toolInput: { query: '贵州茅台 600519 业绩预告' },
      callId: uuid(),
      now: NOW + 10,
    }, {
      networkToolDependencies: {
        resolveSearchCredentials: () => ({ providerId: 'tavily' as const, apiKey: 'secret', baseUrl: null }),
        requestNetwork,
        resolveTushareToken: () => 'token',
        fetchTushareDisclosureRows: async () => [{
          dataset: 'forecast' as const,
          tsCode: '600519.SH',
          annDate: '20260701',
          endDate: '20260630',
          summary: '预增 end=20260630',
          values: { type: '预增', p_change_min: 10, p_change_max: 20 },
        }],
      },
    })
    expect(result.call.status).toBe('succeeded')
    expect(result.envelope?.status).toBe('ready')
    const data = result.envelope?.data as {
      structuredDisclosures: unknown[]
      candidates: unknown[]
      probes: { tushare: { status: string } }
    }
    expect(data.structuredDisclosures).toHaveLength(1)
    expect(data.candidates).toHaveLength(0)
    expect(data.probes.tushare.status).toBe('configured')
  })

  it('两通道均失败时抛错并聚合原因', async () => {
    const { runId, stepId } = startToolingRun(db)
    const requestNetwork = vi.fn(async (request: ResearchAgentNetworkRequest) => {
      if (request.url.includes('api.tavily.com')) {
        return networkResponse(request, 'json', { results: [] }, 500)
      }
      return networkResponse(request, 'json', {})
    })
    const result = await executeResearchAgentTool(db, {
      runId,
      stepId,
      leaseOwner: OWNER,
      toolId: 'official.disclosure_search',
      toolInput: { query: '贵州茅台 600519 业绩预告' },
      callId: uuid(),
      now: NOW + 10,
    }, {
      networkToolDependencies: {
        resolveSearchCredentials: () => ({ providerId: 'tavily' as const, apiKey: 'secret', baseUrl: null }),
        requestNetwork,
        resolveTushareToken: () => 'token',
        fetchTushareDisclosureRows: async () => {
          throw new Error('Tushare quota exceeded')
        },
      },
    })
    expect(result.call.status).toBe('failed')
    expect(result.call.error_message ?? '').toMatch(/网页检索|Tushare/)
    expect(result.call.error_message ?? '').toContain('Tushare quota exceeded')
  })
})

describe('company.fundamentals_refresh multichannel', () => {
  let db: Database.Database

  beforeEach(() => {
    sequence = 0
    db = new Database(':memory:')
    db.pragma('foreign_keys = ON')
    runMigrations(db, DATABASE_MIGRATIONS.filter((migration) => [121, 122, 123].includes(migration.version)))
    db.exec('CREATE TABLE stock_fundamental_profiles (ts_code TEXT PRIMARY KEY, website TEXT)')
  })

  afterEach(() => db.close())

  it('有 Tushare 时优先结构化财务且不调用东财', async () => {
    const { runId, stepId } = startToolingRun(db)
    const requestNetwork = vi.fn(async (request: ResearchAgentNetworkRequest) => networkResponse(request, 'json', {}))
    const result = await executeResearchAgentTool(db, {
      runId,
      stepId,
      leaseOwner: OWNER,
      toolId: 'company.fundamentals_refresh',
      toolInput: { stockCode: '600519.SH' },
      callId: uuid(),
      now: NOW + 10,
    }, {
      networkToolDependencies: {
        requestNetwork,
        resolveTushareToken: () => 'token',
        fetchTushareFundamentalsReports: async () => [{
          reportDate: '20260630',
          reportType: '二季报',
          noticeDate: '20260720',
          currency: 'CNY',
          totalRevenue: 1,
          parentNetProfit: 2,
          deductedNetProfit: 3,
          revenueYoy: null,
          parentNetProfitYoy: null,
          deductedNetProfitYoy: null,
          weightedRoe: 20,
          grossMargin: 90,
          netMargin: 50,
          debtRatio: 10,
          operatingCashFlow: null,
          basicEps: null,
          bookValuePerShare: null,
          source: 'tushare',
        }],
      },
    })
    expect(result.call.status).toBe('succeeded')
    expect(result.envelope?.status).toBe('ready')
    expect(requestNetwork).not.toHaveBeenCalled()
    const data = result.envelope?.data as { providerId: string; reports: unknown[] }
    expect(data.providerId).toBe('tushare')
    expect(data.reports).toHaveLength(1)
  })
})
