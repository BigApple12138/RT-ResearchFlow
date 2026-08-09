import Database from 'better-sqlite3'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  busy: vi.fn(() => false),
  compact: vi.fn(),
  getDb: vi.fn(),
  handle: vi.fn(),
}))

vi.mock('electron', () => ({
  app: { isPackaged: false, getAppPath: () => 'E:\\test-project' },
  ipcMain: { handle: mocks.handle },
  net: {},
  BrowserWindow: class {},
}))
vi.mock('../../electron/main/database/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../electron/main/database/db')>()
  return { ...actual, getDb: mocks.getDb }
})
vi.mock('../../electron/main/services/researchAgentRunManager', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../electron/main/services/researchAgentRunManager')>()
  return { ...actual, isDiscussionSessionBusy: mocks.busy }
})
vi.mock('../../electron/main/services/discussionContextCompactionService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../electron/main/services/discussionContextCompactionService')>()
  return { ...actual, compactDiscussionContextWithinLock: mocks.compact }
})
import { createSession } from '../../electron/main/database/aiAnalysisSessionRepository'
import { runMigrations } from '../../electron/main/database/db'
import { getAIConfig } from '../../electron/main/database/aiConfigRepository'
import { registerAIHandlers } from '../../electron/main/ipc/aiHandlers'

type Handler = (event: unknown, payload?: Record<string, unknown>) => unknown

function handler(channel: string): Handler {
  const registration = mocks.handle.mock.calls.find(([name]) => name === channel)
  if (!registration) throw new Error(`未注册 IPC：${channel}`)
  return registration[1] as Handler
}

describe('AI 讨论 IPC handlers', () => {
  let db: Database.Database

  beforeAll(() => {
    registerAIHandlers(() => null)
  })

  beforeEach(() => {
    db = new Database(':memory:')
    runMigrations(db)
    mocks.getDb.mockReturnValue(db)
    mocks.busy.mockReturnValue(false)
    mocks.compact.mockReset()
  })

  it('手动压缩通过主进程锁并返回 camelCase compaction DTO', async () => {
    const sessionId = createSession(db, {
      provider: 'qwen', model: 'test-model', articleUrls: [], promptSent: '事实', response: null,
      scanRunId: null, isError: false, messages: [],
    })
    mocks.compact.mockResolvedValue({
      ok: true,
      compaction: {
        id: 'compaction-1', session_id: sessionId, request_id: '00000000-0000-4000-8000-000000000301',
        source_start_sequence: 1, covered_through_sequence: 18,
        source_messages_hash: 'a'.repeat(64), summary_text: '累计摘要', summary_hash: 'b'.repeat(64),
        provider: 'qwen', model: 'test-model', created_at: 123,
      },
      archivedCount: 18,
      messages: [],
    })

    const result = await handler('ai:compactDiscussionContext')({}, {
      requestId: '00000000-0000-4000-8000-000000000301', sessionId, mode: 'manual',
    })

    expect(result).toMatchObject({
      ok: true,
      archivedCount: 18,
      compaction: { sessionId, coveredThroughSequence: 18, summary: '累计摘要' },
    })
    expect(mocks.compact).toHaveBeenCalledWith(db, {
      sessionId, requestId: '00000000-0000-4000-8000-000000000301', mode: 'manual',
    })
  })

  it('深度研究 busy 时主进程拒绝 compact 和 follow-up', async () => {
    const sessionId = createSession(db, {
      provider: 'qwen', model: 'test-model', articleUrls: [], promptSent: '事实', response: null,
      scanRunId: null, isError: false, messages: [],
    })
    mocks.busy.mockReturnValue(true)

    const compact = await handler('ai:compactDiscussionContext')({}, {
      requestId: '00000000-0000-4000-8000-000000000302', sessionId, mode: 'manual',
    })
    const followUp = await handler('ai:followUp')({}, {
      requestId: '00000000-0000-4000-8000-000000000303', sessionId, message: '继续',
    })

    expect(compact).toMatchObject({ ok: false, code: 'SESSION_BUSY' })
    expect(followUp).toMatchObject({ code: 'SESSION_BUSY' })
    expect(mocks.compact).not.toHaveBeenCalled()
  })

  it('AI 配置可以保存并读取自动压缩开关', async () => {
    const save = await handler('ai:saveConfig')({}, { autoCompactDiscussion: false })
    const config = await handler('ai:getConfig')({})

    expect(save).toEqual({ ok: true })
    expect(getAIConfig(db).autoCompactDiscussion).toBe(0)
    expect(config).toMatchObject({ autoCompactDiscussion: false })
  })
})
