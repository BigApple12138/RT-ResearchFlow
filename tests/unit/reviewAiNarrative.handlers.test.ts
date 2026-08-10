import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  assertValidReviewReportSnapshotMock,
  generateReviewAiNarrativeMock,
  getDbMock,
  handleMock,
  removeHandlerMock,
  updateReviewReportSnapshotMock,
} = vi.hoisted(() => ({
  assertValidReviewReportSnapshotMock: vi.fn(),
  generateReviewAiNarrativeMock: vi.fn(),
  getDbMock: vi.fn(),
  handleMock: vi.fn(),
  removeHandlerMock: vi.fn(),
  updateReviewReportSnapshotMock: vi.fn(),
}))

vi.mock('electron', () => ({
  ipcMain: { handle: handleMock, removeHandler: removeHandlerMock },
}))
vi.mock('../../electron/main/database/db', () => ({ getDb: getDbMock }))
vi.mock('../../electron/main/database/decisionReviewReportRepository', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../electron/main/database/decisionReviewReportRepository')>()
  return {
    ...actual,
    assertValidReviewReportSnapshot: assertValidReviewReportSnapshotMock,
    updateReviewReportSnapshot: updateReviewReportSnapshotMock,
  }
})
vi.mock('../../electron/main/services/reviewAiNarrativeService', () => ({
  generateReviewAiNarrative: generateReviewAiNarrativeMock,
}))
vi.mock('../../electron/main/services/decisionSignalService')
vi.mock('../../electron/main/services/decisionSignalBackfillService')
vi.mock('../../electron/main/services/decisionReviewStatsService')
vi.mock('../../electron/main/services/decisionOutcomeMemory')

import { registerDecisionHandlers } from '../../electron/main/ipc/decisionHandlers'

type IpcHandler = (event: unknown, payload?: unknown) => unknown

function handler(channel: string): IpcHandler {
  const registration = handleMock.mock.calls.find(([registeredChannel]) => registeredChannel === channel)
  if (!registration) throw new Error(`未注册 IPC: ${channel}`)
  return registration[1] as IpcHandler
}

beforeEach(() => {
  vi.clearAllMocks()
  getDbMock.mockReturnValue({ name: 'db' })
  registerDecisionHandlers()
})

describe('复盘 AI 研判 IPC', () => {
  it('generateReviewAiNarrative 校验快照后调用服务', async () => {
    const report = { kind: 'daily' }
    assertValidReviewReportSnapshotMock.mockReturnValue(report)
    generateReviewAiNarrativeMock.mockResolvedValue({
      ok: true,
      data: { status: 'ready', text: '需继续验证', generatedAt: 1 },
    })

    await expect(handler('decision:generateReviewAiNarrative')({}, { report })).resolves.toEqual({
      ok: true,
      data: { status: 'ready', text: '需继续验证', generatedAt: 1 },
    })
    expect(assertValidReviewReportSnapshotMock).toHaveBeenCalledWith(report)
    expect(generateReviewAiNarrativeMock).toHaveBeenCalledWith(getDbMock(), { report })
  })

  it('updateReviewReportSnapshot 透传到仓库', () => {
    const summary = { id: 'r1', versionNumber: 1 }
    updateReviewReportSnapshotMock.mockReturnValue(summary)
    const payload = { id: 'r1', report: { kind: 'daily' } }
    expect(handler('decision:updateReviewReportSnapshot')({}, payload)).toEqual({ ok: true, data: summary })
    expect(updateReviewReportSnapshotMock).toHaveBeenCalledWith(getDbMock(), payload)
  })
})
