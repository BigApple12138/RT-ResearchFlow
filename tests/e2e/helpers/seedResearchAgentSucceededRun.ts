import { runElectronScript } from './screenshotDemoSeed'

const SUCCEEDED_RUN_ID = '00000000-0000-4000-8000-000000000301'

/** 为深度研究工作台写入一条 succeeded 演示 run（与 research-agent-recovery 结构一致）。 */
export function seedResearchAgentSucceededRun(dbPath: string, sessionId: number): void {
  runElectronScript(String.raw`
    const Database = require('better-sqlite3')
    const { createHash } = require('crypto')
    const db = new Database(process.env.TRADE_WATCH_SEED_DB)
    const now = Date.now()
    const sessionId = Number(process.env.DEMO_SESSION_ID)
    const hash = (value) => createHash('sha256').update(String(value), 'utf8').digest('hex')
    const json = (value) => JSON.stringify(value)
    const budget = json({
      id: 'single-agent-standard-v1', maxModelCalls: 6, maxToolCalls: 8,
      maxToolDecisionRounds: 4, maxToolsPerDecision: 2, maxModelInputBytes: 98304,
      maxIntermediateOutputTokens: 2048, maxFinalOutputTokens: 8192,
      maxToolResultBytes: 262144, maxToolProjectionBytes: 24576,
      maxRunToolResultBytes: 2097152, maxReportCharacters: 60000,
      maxModelCallDurationMs: 120000, maxToolCallDurationMs: 10000,
      maxNetworkToolCallDurationMs: 30000, maxDurationMs: 1200000,
    })
    const contextSnapshot = json({ schemaVersion: 1, source: { kind: 'discussion', sessionId }, messages: [] })
    const subjects = json([{ kind: 'stock', tsCode: '600522.SH', label: '中天科技' }])
    const plan = json({ protocolVersion: 'single-agent.v1', action: 'plan', questions: ['趋势与基本面是否背离？'], candidateTools: ['stock.price_history'], stopConditions: ['取得本地价格事实后停止'], rationale: 'README 截图演示' })
    const report = '# 深度研究报告\n\n## 结论摘要\n本地价格与趋势事实支持继续跟踪，财报口径仍需核验。[E-DEMO000001]\n\n## 支持证据\n日线与趋势评分已固化。[E-DEMO000001]\n\n## 反证与风险\n板块资金昨日分歧。\n\n## 未知项\n公告正文未纳入本次范围。\n\n## 资料截点\n2026-08-12。'
    const evidence = { schemaVersion: 1, generatedAt: now - 2000, asOf: '20260812', subjects: [{ subjectKind: 'stock', subjectId: '600522', label: '中天科技', supporting: [{ referenceId: 'E-DEMO000001', code: 'PRICE_READY', toolId: 'stock.price_history', label: '本地日线可用', detail: '最近20个交易日本地日线已固化', factDate: '20260812', sourceIds: ['local.daily_close_cache'] }], challenging: [], unknowns: [] }], warnings: [], markdown: '证据对照' }
    const evidenceHash = hash(json({ schemaVersion: evidence.schemaVersion, asOf: evidence.asOf, subjects: evidence.subjects, warnings: evidence.warnings }))
    const audit = json({ schemaVersion: 1, documentKind: 'discussion', status: 'passed', generatedAt: now - 1000, asOf: '20260812', originalTextSha256: hash(report.trim()), checkedCharacters: report.length, evidenceSummary: { subjectCount: 1, supporting: 1, challenging: 0, unknowns: 0 }, checks: [{ code: 'UNKNOWN_DISCLOSED', status: 'passed', message: '未知项已披露', excerpts: [] }] })
    db.prepare(
      'INSERT OR REPLACE INTO research_agent_runs (id, request_id, request_fingerprint, discussion_session_id, question, context_snapshot_json, context_snapshot_sha256, subjects_json, include_portfolio, as_of, status, phase, outcome, provider, model, model_config_fingerprint, prompt_rule_version, tool_registry_version, budget_json, plan_json, plan_sha256, evidence_snapshot_sha256, report_markdown, report_sha256, audit_json, model_call_count, tool_call_count, tool_result_bytes, input_tokens, output_tokens, total_tokens, usage_status, estimated_cost, cost_currency, cost_status, cancel_requested, lease_owner, lease_expires_at, revision, error_code, error_message, retryable, created_at, started_at, completed_at, updated_at) VALUES (@id, @requestId, @requestFingerprint, @sessionId, @question, @contextSnapshot, @contextHash, @subjects, 0, @asOf, @status, @phase, @outcome, @provider, @model, @modelFingerprint, @promptVersion, @toolVersion, @budget, @plan, @planHash, @evidenceHash, @report, @reportHash, @audit, @modelCalls, @toolCalls, @toolBytes, @inputTokens, @outputTokens, @totalTokens, @usageStatus, @estimatedCost, @costCurrency, @costStatus, @cancelRequested, @leaseOwner, @leaseExpiresAt, @revision, @errorCode, @errorMessage, @retryable, @createdAt, @startedAt, @completedAt, @updatedAt)'
    ).run({
      id: process.env.SUCCEEDED_RUN_ID,
      requestId: '00000000-0000-4000-8000-000000000401',
      requestFingerprint: hash('readme-screenshot-run'),
      sessionId,
      question: '中天科技趋势与基本面是否背离？',
      contextSnapshot,
      contextHash: hash(contextSnapshot),
      subjects,
      asOf: '20260812',
      status: 'succeeded',
      phase: 'persist',
      outcome: 'partial',
      provider: 'deepseek',
      model: 'deepseek-chat',
      modelFingerprint: hash('fixed-model'),
      promptVersion: 'single-agent.v1-controlled-network.v1',
      toolVersion: 'research-agent-tools.v2',
      budget,
      plan,
      planHash: hash(plan),
      evidenceHash,
      report,
      reportHash: hash(report),
      audit,
      modelCalls: 2,
      toolCalls: 1,
      toolBytes: 256,
      inputTokens: 320,
      outputTokens: 180,
      totalTokens: 500,
      usageStatus: 'complete',
      estimatedCost: 0.0012,
      costCurrency: 'CNY',
      costStatus: 'complete',
      cancelRequested: 0,
      leaseOwner: null,
      leaseExpiresAt: null,
      revision: 4,
      errorCode: null,
      errorMessage: null,
      retryable: 0,
      createdAt: now - 10000,
      startedAt: now - 9000,
      completedAt: now - 1000,
      updatedAt: now - 1000,
    })
    db.close()
  `, { TRADE_WATCH_SEED_DB: dbPath, DEMO_SESSION_ID: String(sessionId), SUCCEEDED_RUN_ID })
}

export { SUCCEEDED_RUN_ID }
