import { expect, test, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { execFileSync } from 'child_process'
import { createServer } from 'node:http'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const SUMMARY = 'E2E 累计摘要：保留本地研究目标、已确认事实、未决问题、证据缺口和下一步验证动作。'

async function launchApp(userDataDir: string): Promise<ElectronApplication> {
  const { ELECTRON_RUN_AS_NODE: _electronRunAsNode, ...launchEnv } = process.env
  return electron.launch({
    args: [join(__dirname, '../../out/main/index.js'), `--user-data-dir=${userDataDir}`],
    env: { ...launchEnv, NODE_ENV: 'test' },
  })
}

function seedCompactionFixture(dbPath: string): { successSessionId: number; busySessionId: number } {
  const electronExecutable = require('electron') as string
  const output = execFileSync(electronExecutable, ['-e', String.raw`
    const Database = require('better-sqlite3')
    const db = new Database(process.env.TRADE_WATCH_SEED_DB)
    const now = Date.now()
    const messagesFor = (prefix) => Array.from({ length: 24 }, (_, index) => ({
      role: index % 2 === 0 ? 'user' : 'assistant',
      content: prefix + '-' + String(index + 101),
      sequence: index + 101,
    }))
    const insertSession = db.prepare(
      'INSERT INTO ai_analysis_sessions (createdAt, provider, model, articleUrls, promptSent, response, scanRunId, briefingId, isError, messages, next_message_sequence) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, 0, ?, ?)'
    )
    const insertContext = db.prepare(
      'INSERT INTO ai_research_discussion_contexts (session_id, start_request_id, status, origin_type, origin_id, origin_title, origin_occurred_at, origin_available, origin_content_hash, context_snapshot_json, context_keys_json, included_context_keys_json, return_target_json, project_id, base_snapshot_id, base_selection_reason, degraded_reason, created_at, updated_at) VALUES (?, ?, ?, ?, NULL, ?, ?, 1, ?, ?, ?, ?, ?, NULL, NULL, ?, NULL, ?, ?)'
    )
    function insertDiscussion(prefix, requestId, createdAt) {
      const title = 'E2E 上下文压缩讨论 · ' + prefix
      const sessionId = Number(insertSession.run(
        createdAt,
        'qwen',
        'e2e-compaction-model',
        '[]',
        '本地 E2E 硬事实：只验证讨论上下文整理，不构成投资建议。',
        null,
        JSON.stringify(messagesFor(prefix)),
        125,
      ).lastInsertRowid)
      const contextItems = [{
        key: 'manual-question',
        type: 'question',
        label: '研究问题',
        excerpt: '只验证本地讨论上下文整理，不生成投资结论。',
        removable: false,
      }]
      const snapshot = JSON.stringify({
        schemaVersion: 1,
        contextKind: 'source',
        title,
        occurredAt: createdAt,
        sourceUrl: null,
        items: contextItems,
      })
      insertContext.run(
        sessionId,
        requestId,
        'active',
        'manual',
        title,
        createdAt,
        'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        snapshot,
        JSON.stringify(contextItems),
        JSON.stringify(['manual-question']),
        JSON.stringify({ tab: 'ai-analysis', subTab: 'records' }),
        'unassigned',
        createdAt,
        createdAt,
      )
      return sessionId
    }

    const successSessionId = insertDiscussion('success', '00000000-0000-4000-8000-000000000001', now - 1000)
    const busySessionId = insertDiscussion('busy', '00000000-0000-4000-8000-000000000002', now)
    const budget = {
      id: 'single-agent-unrestricted-v3',
      maxModelCalls: null,
      maxToolCalls: null,
      maxToolDecisionRounds: null,
      maxToolsPerDecision: 2,
      maxModelInputBytes: 96 * 1024,
      maxIntermediateOutputTokens: null,
      maxFinalOutputTokens: null,
      maxToolResultBytes: 256 * 1024,
      maxToolProjectionBytes: 24 * 1024,
      maxRunToolResultBytes: 16 * 1024 * 1024,
      maxReportCharacters: null,
      maxModelCallDurationMs: null,
      maxToolCallDurationMs: 10 * 1000,
      maxNetworkToolCallDurationMs: 120 * 1000,
      maxDurationMs: null,
    }
    db.prepare(
      'INSERT INTO research_agent_runs (id, request_id, request_fingerprint, discussion_session_id, question, context_snapshot_json, context_snapshot_sha256, subjects_json, include_portfolio, as_of, status, phase, provider, model, model_config_fingerprint, prompt_rule_version, tool_registry_version, budget_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, \'queued\', \'planning\', ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      '00000000-0000-4000-8000-000000000101',
      '00000000-0000-4000-8000-000000000102',
      'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      busySessionId,
      '确定性 E2E 研究运行用于验证会话 busy 行为。',
      '{}',
      'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      JSON.stringify([{
        kind: 'industry_project',
        id: '00000000-0000-4000-8000-000000000003',
        label: '本地 E2E 研究主体',
      }]),
      '20260809',
      'qwen',
      'e2e-compaction-model',
      'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      'e2e-prompt',
      'e2e-tools',
      JSON.stringify(budget),
      now,
      now,
    )
    db.close()
    process.stdout.write(JSON.stringify({ successSessionId, busySessionId }))
  `], {
    cwd: join(__dirname, '../..'),
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', TRADE_WATCH_SEED_DB: dbPath },
    stdio: 'pipe',
  }).toString()
  return JSON.parse(output.trim()) as { successSessionId: number; busySessionId: number }
}

async function closeGuide(window: Page): Promise<void> {
  const guide = window.getByTestId('cold-start-guide')
  if (await guide.isVisible()) await guide.getByLabel('关闭引导').click()
}

async function configureLocalAI(window: Page, baseUrl: string): Promise<void> {
  const result = await window.evaluate(async (url) => window.api.ai.saveConfig({
    provider: 'qwen',
    model: 'e2e-compaction-model',
    providerPriority: ['qwen'],
    providerConfig: {
      provider: 'qwen',
      model: 'e2e-compaction-model',
      apiKey: 'local-e2e-only-key',
      baseUrl: url,
      maxTokens: 128,
    },
  }), baseUrl)
  expect(result).toMatchObject({ ok: true })
}

async function startCompactionMock(): Promise<{
  baseUrl: string
  setMode: (mode: 'success' | 'failure') => void
  close: () => Promise<void>
}> {
  let mode: 'success' | 'failure' = 'success'
  const server = createServer((request, response) => {
    if (request.method !== 'POST' || request.url !== '/v1/chat/completions') {
      response.statusCode = 404
      response.end()
      return
    }
    request.resume()
    request.once('end', () => {
      response.setHeader('content-type', 'application/json')
      response.end(JSON.stringify({
        id: 'e2e-compaction-response',
        object: 'chat.completion',
        created: 0,
        model: 'e2e-compaction-model',
        choices: mode === 'failure'
          ? [{ index: 0, message: { role: 'assistant', content: null }, logprobs: null, finish_reason: 'stop' }]
          : [{ index: 0, message: { role: 'assistant', content: SUMMARY }, logprobs: null, finish_reason: 'stop' }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }))
    })
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('本地 E2E mock 未取得端口')
  return {
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
    setMode: (nextMode) => { mode = nextMode },
    close: async () => {
      if (!server.listening) return
      await new Promise<void>((resolve) => {
        server.close(() => resolve())
        server.closeAllConnections()
      })
    },
  }
}

test('手动整理聊天上下文保留 sequence 热尾部、显示摘要元数据，并在 busy/失败时阻断', async () => {
  test.setTimeout(150_000)
  const userDataDir = mkdtempSync(join(tmpdir(), 'trade-watch-ai-discussion-compaction-'))
  const mock = await startCompactionMock()
  let app: ElectronApplication | null = null
  try {
    app = await launchApp(userDataDir)
    let window = await app.firstWindow()
    await window.waitForLoadState('domcontentloaded')
    await expect(window.getByTestId('nav-tab-feed')).toBeVisible({ timeout: 30_000 })
    await app.close()
    app = null

    const ids = seedCompactionFixture(join(`${userDataDir}-dev`, 'trade-watch.db'))
    app = await launchApp(userDataDir)
    window = await app.firstWindow()
    await window.waitForLoadState('domcontentloaded')
    await closeGuide(window)
    await window.setViewportSize({ width: 1440, height: 900 })
    await configureLocalAI(window, mock.baseUrl)
    await window.getByTestId('nav-tab-ai-analysis').click()
    await window.evaluate(() => (window).__RT_TEST__?.setAIAnalysisSubTab('records'))
    await expect(window.getByTestId('ai-analysis-page')).toBeVisible({ timeout: 30_000 })

    await window.getByTestId(`ai-session-${ids.busySessionId}`).click()
    const busyCompact = window.getByTestId('ai-compact-discussion-context')
    await expect(busyCompact).toBeDisabled({ timeout: 30_000 })
    await expect(window.getByPlaceholder('深度研究进行中…')).toBeDisabled()

    await window.getByTestId(`ai-session-${ids.successSessionId}`).click()
    const compact = window.getByTestId('ai-compact-discussion-context')
    await expect(compact).toBeEnabled({ timeout: 30_000 })
    await expect(window.getByText('success-101', { exact: true })).toBeVisible()
    await expect(window.getByText('success-124', { exact: true })).toBeVisible()

    mock.setMode('failure')
    await compact.click()
    await expect(window.getByTestId('app-global-toast')).toContainText('AI_RESPONSE_EMPTY', { timeout: 30_000 })
    await expect(window.getByText('success-101', { exact: true })).toBeVisible()
    const afterFailure = await window.evaluate(async (sessionId) => {
      const detail = await window.api.ai.getSession(sessionId)
      return {
        sequences: detail?.messages?.map((message) => message.sequence),
        compaction: detail?.discussion?.contextCompaction ?? null,
      }
    }, ids.successSessionId)
    expect(afterFailure).toEqual({
      sequences: [101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 122, 123, 124],
      compaction: null,
    })

    mock.setMode('success')
    await compact.click()
    await expect(window.getByTestId('app-global-toast')).toContainText('已整理 18 条聊天消息，保留最近对话。', { timeout: 30_000 })
    await expect(window.getByText('聊天上下文已整理至消息序号 118，历史原文仍可追溯。', { exact: true })).toBeVisible()
    await expect(window.getByText('success-101', { exact: true })).toHaveCount(0)
    await expect(window.getByText('success-118', { exact: true })).toHaveCount(0)
    await expect(window.getByText('success-119', { exact: true })).toBeVisible()
    await expect(window.getByText('success-124', { exact: true })).toBeVisible()

    const afterSuccess = await window.evaluate(async (sessionId) => {
      const detail = await window.api.ai.getSession(sessionId)
      return {
        sequences: detail?.messages?.map((message) => message.sequence),
        compaction: detail?.discussion?.contextCompaction ?? null,
      }
    }, ids.successSessionId)
    expect(afterSuccess.sequences).toEqual([119, 120, 121, 122, 123, 124])
    expect(afterSuccess.compaction).toMatchObject({
      sourceStartSequence: 101,
      coveredThroughSequence: 118,
      summary: SUMMARY,
      provider: 'qwen',
      model: 'e2e-compaction-model',
    })
  } finally {
    await app?.close().catch(() => undefined)
    await mock.close().catch(() => undefined)
    rmSync(userDataDir, { recursive: true, force: true })
    rmSync(`${userDataDir}-dev`, { recursive: true, force: true })
  }
})
