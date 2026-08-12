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
  saveExternalMcpServer,
  setExternalMcpServerEnabled,
  updateExternalMcpTestResult,
} from '../../electron/main/database/externalMcpRepository'
import {
  advanceResearchAgentRunPhase,
  claimResearchAgentRunLease,
  createResearchAgentStep,
  getResearchAgentRunLedger,
  startResearchAgentRun,
  transitionResearchAgentStepStatus,
} from '../../electron/main/database/researchAgentRunRepository'
import { setAiAgentNetworkEnabled } from '../../electron/main/database/settingsRepository'
import { assessResearchAgentEvidence } from '../../electron/main/services/researchAgentEvidenceGate'
import { RESEARCH_AGENT_TOOL_REGISTRY_VERSION } from '../../electron/main/services/researchAgentNetworkTools'
import { RESEARCH_AGENT_PROMPT_RULE_VERSION } from '../../electron/main/services/researchAgentProtocol'
import {
  ResearchAgentRunManager,
} from '../../electron/main/services/researchAgentRunManager'
import { executeResearchAgentTool } from '../../electron/main/services/researchAgentToolService'

const NOW = Date.parse('2026-08-12T08:00:00.000Z')
const OWNER = 'boot-00000000-0000-4000-8000-00000000m2'
let sequence = 0

function uuid(): string {
  sequence += 1
  return `00000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`
}

describe('external MCP research bridge (M2 / mcp.invoke)', () => {
  let db: Database.Database

  beforeEach(() => {
    sequence = 0
    db = new Database(':memory:')
    db.pragma('foreign_keys = ON')
    runMigrations(db, DATABASE_MIGRATIONS)
    setAiAgentNetworkEnabled(true, db)
  })

  afterEach(() => db.close())

  function startToolingRun() {
    const started = startResearchAgentRun(db, {
      requestId: uuid(),
      id: uuid(),
      question: '贵州茅台近期是否有重大事项？请结合外源样本核对。',
      contextSnapshot: { schemaVersion: 1, trustedSubjects: [] },
      subjects: [{ kind: 'stock', tsCode: '600519.SH', label: '贵州茅台' }],
      includePortfolio: false,
      asOf: '20260812',
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
    const step = createResearchAgentStep(db, {
      runId: started.run.id,
      leaseOwner: OWNER,
      ordinal: 2,
      kind: 'tooling',
      stepInput: { action: 'tool_batch', decisionRound: 1 },
      id: uuid(),
      now: NOW + 6,
    })
    transitionResearchAgentStepStatus(db, {
      stepId: step.id,
      leaseOwner: OWNER,
      toStatus: 'running',
      now: NOW + 7,
    })
    return { run: started.run, step }
  }

  function seedEnabledServer(tools: Array<{ name: string; description?: string }> = [{ name: 'lookup' }]) {
    const server = saveExternalMcpServer(db, {
      name: 'Research MCP',
      command: 'fake-mcp',
      now: NOW,
    })
    updateExternalMcpTestResult(db, {
      id: server.id,
      ok: true,
      tools,
      now: NOW,
    })
    return server
  }

  it('主体拒绝：subjectRef 未绑定运行主体 → SUBJECT_DENIED 落账 blocked', async () => {
    const server = seedEnabledServer()
    const { run, step } = startToolingRun()
    const result = await executeResearchAgentTool(db, {
      runId: run.id,
      stepId: step.id,
      leaseOwner: OWNER,
      toolId: 'mcp.invoke',
      toolInput: {
        serverId: server.id,
        toolName: 'lookup',
        subjectRef: '000001.SZ',
        asOf: '20260812',
        arguments: { q: 'x' },
      },
      now: NOW + 100,
    })
    expect(result.call.status).toBe('blocked')
    expect(result.call.error_code).toBe('SUBJECT_DENIED')
    expect(result.envelope?.status).toBe('blocked')
  })

  it('disabled server 拒绝：MCP_SERVER_DISABLED', async () => {
    const server = seedEnabledServer()
    setExternalMcpServerEnabled(db, server.id, false, NOW + 1)
    const { run, step } = startToolingRun()
    const result = await executeResearchAgentTool(db, {
      runId: run.id,
      stepId: step.id,
      leaseOwner: OWNER,
      toolId: 'mcp.invoke',
      toolInput: {
        serverId: server.id,
        toolName: 'lookup',
        subjectRef: '600519.SH',
        asOf: '20260812',
      },
      now: NOW + 100,
    })
    expect(result.call.status).toBe('blocked')
    expect(result.call.error_code).toBe('MCP_SERVER_DISABLED')
  })

  it('联网开关关闭拒绝：NETWORK_DISABLED', async () => {
    const server = seedEnabledServer()
    setAiAgentNetworkEnabled(false, db)
    const { run, step } = startToolingRun()
    const result = await executeResearchAgentTool(db, {
      runId: run.id,
      stepId: step.id,
      leaseOwner: OWNER,
      toolId: 'mcp.invoke',
      toolInput: {
        serverId: server.id,
        toolName: 'lookup',
        subjectRef: '贵州茅台',
        asOf: '20260812',
      },
      now: NOW + 100,
    })
    expect(result.call.status).toBe('blocked')
    expect(result.call.error_code).toBe('NETWORK_DISABLED')
  })

  it('成功落账：envelope/model_projection 含 secondary 外源样本，证据视图可追溯', async () => {
    const server = seedEnabledServer([{ name: 'lookup', description: 'facts' }])
    const { run, step } = startToolingRun()
    const result = await executeResearchAgentTool(
      db,
      {
        runId: run.id,
        stepId: step.id,
        leaseOwner: OWNER,
        toolId: 'mcp.invoke',
        toolInput: {
          serverId: server.id,
          toolName: 'lookup',
          subjectRef: '600519',
          asOf: '20260812',
          arguments: { code: '600519.SH' },
        },
        now: NOW + 100,
      },
      {
        networkToolDependencies: {
          mcp: {
            callMcpTool: async () => ({
              ok: true,
              serverId: server.id,
              toolName: 'lookup',
              result: {
                content: [{ type: 'text', text: 'MCP 外源正文样本：贵州茅台公告摘要（不得单独 complete）' }],
              },
            }),
            getAgentNetworkEnabled: () => true,
          },
        },
      },
    )

    expect(result.call.status).toBe('succeeded')
    expect(result.envelope?.toolId).toBe('mcp.invoke')
    expect(result.envelope?.status).toBe('partial')
    expect(result.envelope?.asOf).toBe('20260812')
    expect(result.envelope?.warnings.some((w) => /外源样本|不得单独使证据门禁 complete/.test(w))).toBe(true)
    const data = result.envelope?.data as { mcp?: Record<string, unknown> }
    expect(data.mcp).toMatchObject({
      serverId: server.id,
      toolName: 'lookup',
      sourceClass: 'secondary',
      sourceKind: 'external_mcp',
      subjectRef: '600519',
    })
    expect(data).not.toHaveProperty('document')
    expect(result.call.model_projection_sha256).toBeTruthy()

    const ledger = getResearchAgentRunLedger(db, run.id)
    expect(ledger?.toolCalls).toHaveLength(1)

    const manager = new ResearchAgentRunManager(db, {
      now: () => NOW + 200,
      run: async () => {
        throw new Error('should not run')
      },
    })
    const detail = manager.get(run.id)
    expect(detail.toolCalls[0]).toMatchObject({
      toolId: 'mcp.invoke',
      scope: 'network',
      kind: 'mcp',
      status: 'succeeded',
      mcp: {
        serverId: server.id,
        toolName: 'lookup',
        sourceClass: 'secondary',
        sourceKind: 'external_mcp',
      },
    })
    expect(detail.toolCalls[0].mcp?.resultPreview).toContain('贵州茅台')
  })

  it('门禁不因 MCP 原文自动 complete', async () => {
    const server = seedEnabledServer()
    const { run, step } = startToolingRun()
    const result = await executeResearchAgentTool(
      db,
      {
        runId: run.id,
        stepId: step.id,
        leaseOwner: OWNER,
        toolId: 'mcp.invoke',
        toolInput: {
          serverId: server.id,
          toolName: 'lookup',
          subjectRef: '600519.SH',
          asOf: '20260812',
          arguments: {},
        },
        now: NOW + 100,
      },
      {
        networkToolDependencies: {
          mcp: {
            callMcpTool: async () => ({
              ok: true,
              serverId: server.id,
              toolName: 'lookup',
              result: {
                // 即便正文很长，也不得伪装为 evidence document 形状
                content: [{
                  type: 'text',
                  text: `${'公告正文'.repeat(40)} 证券代码：600519 贵州茅台 今日重大事项说明。`,
                }],
              },
            }),
            getAgentNetworkEnabled: () => true,
          },
        },
      },
    )
    expect(result.call.status).toBe('succeeded')

    const gate = assessResearchAgentEvidence({
      question: run.question,
      asOf: run.as_of,
      subjects: [{ kind: 'stock', tsCode: '600519.SH', label: '贵州茅台' }],
      observations: [{
        callId: result.call.id,
        toolId: 'mcp.invoke',
        callStatus: result.call.status,
        envelope: result.envelope,
      }],
    })
    expect(gate.maximumOutcome).toBe('blocked')
    expect(gate.decision).toBe('network_required')
    expect(gate.checks.some((check) => check.status === 'failed')).toBe(true)
  })
})
