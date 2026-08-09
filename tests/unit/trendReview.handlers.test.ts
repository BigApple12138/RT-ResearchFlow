import Database from 'better-sqlite3'
import { randomUUID } from 'crypto'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  BrowserWindow: { getAllWindows: () => [] },
}))

import { runTrendReviewStructureBatch, type TrendReviewProgress } from '../../electron/main/ipc/trendHandlers'

describe('趋势结构复核 IPC 批量校验', () => {
  it('限制 1–20 只、校验 workbench 归属，并串行执行且返回逐条 DTO', async () => {
    const activeCodes: string[] = []
    let maxActive = 0
    const requestIds: string[] = []
    const review = vi.fn(async (_db: Database.Database, input: { requestId: string; tsCode: string }) => {
      activeCodes.push(input.tsCode)
      requestIds.push(input.requestId)
      maxActive = Math.max(maxActive, activeCodes.length)
      await Promise.resolve()
      activeCodes.pop()
      return {
        review: {
          tsCode: input.tsCode, scoreDate: '20260808', factsHash: 'a'.repeat(64), requestId: input.requestId,
          revisionId: 'revision-1',
          localTrendState: 'strong' as const, localTotalScore: 80, verdict: 'agree' as const,
          rationale: '结构仍完整。', focusPoints: ['观察'], provider: 'qwen', model: 'test-model',
          audit: { status: 'passed' }, createdAt: 1_000, updatedAt: 1_000,
        },
        facts: {} as never,
        factsHash: 'a'.repeat(64),
        stale: false,
      }
    })
    const result = await runTrendReviewStructureBatch(new Database(':memory:'), {
      requestId: randomUUID(), tsCodes: ['600001.SH', '600002.SH'],
    }, {
      getWorkbench: () => ({ items: [{ tsCode: '600001.SH' }] } as never),
      reviewStructure: review,
    })

    expect(result.map((item) => item.tsCode)).toEqual(['600001.SH', '600002.SH'])
    expect(result[0]).toMatchObject({ ok: true, review: { verdict: 'agree', stale: false } })
    expect(result[1]).toMatchObject({ ok: false, error: 'NOT_IN_WORKBENCH' })
    expect(maxActive).toBe(1)
    expect(requestIds[0]).toMatch(/:600001\.SH$/)
    expect(review).toHaveBeenCalledTimes(1)
  })

  it('每条任务按 running 后 succeeded/failed 发送进度，且仍保持串行', async () => {
    const events: TrendReviewProgress[] = []
    const review = vi.fn(async (_db: Database.Database, input: { requestId: string; tsCode: string }) => ({
      review: {
        revisionId: `revision-${input.tsCode}`,
        tsCode: input.tsCode, scoreDate: '20260808', factsHash: 'a'.repeat(64), requestId: input.requestId,
        localTrendState: 'strong' as const, localTotalScore: 80, verdict: 'agree' as const,
        rationale: '结构仍完整。', focusPoints: ['观察'], provider: 'qwen', model: 'test-model',
        audit: { status: 'passed' }, createdAt: 1_000, updatedAt: 1_000,
      },
      facts: {} as never, factsHash: 'a'.repeat(64), stale: false,
    }))
    const result = await runTrendReviewStructureBatch(new Database(':memory:'), {
      requestId: randomUUID(), tsCodes: ['600001.SH', '600002.SH'],
    }, {
      getWorkbench: () => ({ items: [{ tsCode: '600001.SH' }] } as never),
      reviewStructure: review,
      onProgress: (event) => events.push(event),
    })

    expect(result).toHaveLength(2)
    expect(events.map(({ tsCode, status }) => `${tsCode}:${status}`)).toEqual([
      '600001.SH:running', '600001.SH:succeeded',
      '600002.SH:running', '600002.SH:failed',
    ])
    expect(events.every((event) => event.total === 2)).toBe(true)
    expect(events.find((event) => event.status === 'succeeded')?.review?.verdict).toBe('agree')
  })

  it('拒绝非法 requestId、空批次和超过 20 只', async () => {
    const db = new Database(':memory:')
    await expect(runTrendReviewStructureBatch(db, { requestId: 'bad', tsCodes: ['600001.SH'] })).rejects.toThrow('INVALID_PARAM')
    await expect(runTrendReviewStructureBatch(db, { requestId: randomUUID(), tsCodes: [] })).rejects.toThrow('INVALID_PARAM')
    await expect(runTrendReviewStructureBatch(db, { requestId: randomUUID(), tsCodes: Array.from({ length: 21 }, () => '600001.SH') })).rejects.toThrow('INVALID_PARAM')
  })
})
