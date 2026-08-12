import { describe, expect, it, vi } from 'vitest'
import { withDiscussionSessionLock } from '../../electron/main/services/discussionSessionLock'

describe('discussionSessionLock + deep_start 死锁防护', () => {
  it('持锁期间再 await 同一 session 的 withDiscussionSessionLock 会挂起（复现根因）', async () => {
    const sessionId = 91001
    let innerStarted = false
    const hung = withDiscussionSessionLock(sessionId, async () => {
      const nested = withDiscussionSessionLock(sessionId, () => {
        innerStarted = true
        return 'nested-ok'
      })
      const raced = await Promise.race([
        nested.then((v) => ({ kind: 'done' as const, v })),
        new Promise<{ kind: 'timeout' }>((resolve) => {
          setTimeout(() => resolve({ kind: 'timeout' }), 80)
        }),
      ])
      expect(raced.kind).toBe('timeout')
      expect(innerStarted).toBe(false)
      return 'outer-ok'
    })
    await expect(hung).resolves.toBe('outer-ok')
  })

  it('持锁期间同步调用 unlocked 启动路径可立即返回（修复契约）', async () => {
    const sessionId = 91002
    const startAssumingLockHeld = vi.fn((input: { sessionId: number }) => ({
      run: { id: `run-${input.sessionId}` },
      replayed: false,
    }))

    const result = await withDiscussionSessionLock(sessionId, async () => {
      // 模拟 deep_start runner：不再进入 withDiscussionSessionLock
      const started = startAssumingLockHeld({ sessionId })
      return started.run.id
    })

    expect(result).toBe('run-91002')
    expect(startAssumingLockHeld).toHaveBeenCalledTimes(1)
  })
})
